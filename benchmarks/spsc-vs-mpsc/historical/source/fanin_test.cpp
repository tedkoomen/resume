// Fan-in stress harness: P producers -> 1 consumer, through either one queue
// per producer (QUEUE_SHARED=0, the consumer round-robins across them) or one
// queue shared by every producer (QUEUE_SHARED=1).
//
// Queue implementation (QUEUE_IMPL):
//   0 - lock-free: SpscQueue per producer, or MpscQueue when shared (default)
//   1 - std::mutex-guarded ring buffer, try-push/try-pop (busy polling)
//   2 - spinlock-guarded ring buffer, try-push/try-pop (busy polling)
//   3 - std::mutex + condition_variable: producers sleep while full
//
// Contention is maximized by:
//   - small queues (QUEUE_CAPACITY; default 8 per producer, or 64 shared =
//     the same total buffering), so producers hit "full" and the consumer
//     hits "empty" constantly
//   - no backoff or yielding in the harness's own spin loops
//   - the consumer popping at most one item per queue per pass
//
// Each message is PAYLOAD_WORDS 64-bit words: word 0 encodes (producer id,
// sequence number) and every other word is derived from it. The consumer
// checks every word, so a message published before all its words were
// written (a missing release/acquire) shows up as an error even on x86, where
// a lone 8-byte store could never tear. It also checks that each producer's
// messages arrive in order, exactly once, on the right queue, and that every
// queue is empty at the end.
//
// Thread placement: everything stays on the NUMA node that owns `cpu`. The
// consumer gets `cpu` to itself; producers are spread round-robin over the
// node's other CPUs. Run with producers <= (node CPUs - 1) to avoid
// oversubscription, where the scheduler rather than the queue dominates. The
// main thread is pinned to `cpu` before the queues are allocated, so
// first-touch places their memory on that node. Failing to pin is fatal.
// cpu = -1 disables all pinning, for comparison.
//
// Timing: all threads pin themselves and check in at a barrier before the
// clock starts; the consumer stamps the end time as it receives the final
// message, so thread start-up and teardown are excluded.
//
// Build:  see Makefile (make all)
// Run:    ./fanin [msgs_per_producer=1000000] [runs=3] [cpu=0, -1 = unpinned] [producers=8]
// Each run prints a human-readable line and a machine-readable one:
//   csv,impl,shared,producers,capacity,payload_words,backoff,msgs_per_producer,run,
//       elapsed_s,msgs_per_s,full_spins,empty_polls,cas_retries,errors,pass

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <memory>
#include <thread>
#include <vector>

#include "./locked_queue.h"
#include "./mpsc.h"
#include "./pinning.h"
#include "./spsc.h"

#ifndef QUEUE_IMPL
#define QUEUE_IMPL 0
#endif
#ifndef QUEUE_SHARED
#define QUEUE_SHARED 0
#endif
#ifndef QUEUE_CAPACITY
#define QUEUE_CAPACITY (QUEUE_SHARED ? 64 : 8)
#endif
#ifndef PAYLOAD_WORDS
#define PAYLOAD_WORDS 1
#endif

namespace {

constexpr bool kShared = QUEUE_SHARED != 0;
constexpr std::size_t kCapacity = QUEUE_CAPACITY;
constexpr std::size_t kPayloadWords = PAYLOAD_WORDS;
constexpr std::size_t kMaxProducers = 256;
constexpr std::size_t kCacheLine = 64;

static_assert(kPayloadWords >= 1, "PAYLOAD_WORDS must be at least 1");

struct Message
{
  std::array<uint64_t, kPayloadWords> words;
};

#if QUEUE_IMPL == 0
// Preprocessor rather than std::conditional_t: naming both types would
// check MpscQueue's constraints (capacity >= 2) for per-producer builds too.
#if QUEUE_SHARED
using Queue = MpscQueue<Message, kCapacity>;
#else
using Queue = SpscQueue<Message, kCapacity>;
#endif
constexpr const char* kImpl = "lockfree";
#elif QUEUE_IMPL == 1
using Queue = LockedQueue<Message, kCapacity, std::mutex>;
constexpr const char* kImpl = "mutex";
#elif QUEUE_IMPL == 2
using Queue = LockedQueue<Message, kCapacity, SpinLock>;
constexpr const char* kImpl = "spinlock";
#elif QUEUE_IMPL == 3
using Queue = BlockingQueue<Message, kCapacity>;
constexpr const char* kImpl = "condvar";
#else
#error "QUEUE_IMPL must be 0..3"
#endif

constexpr int kBackoff = (QUEUE_IMPL == 0 && kShared) ? MPSC_BACKOFF : -1;

constexpr uint64_t pack(uint32_t producer, uint32_t seq)
{
  return (uint64_t(producer) << 32) | seq;
}

// Word k of a message is a cheap bijective mix of word 0 and k.
constexpr uint64_t derived_word(uint64_t head, std::size_t k)
{
  return (head ^ (0x9e3779b97f4a7c15ULL * (k + 1))) * 0xbf58476d1ce4e5b9ULL;
}

Message make_message(uint32_t producer, uint32_t seq)
{
  Message m;
  m.words[0] = pack(producer, seq);
  for (std::size_t k = 1; k < kPayloadWords; ++k) {
    m.words[k] = derived_word(m.words[0], k);
  }
  return m;
}

bool payload_intact(const Message& m)
{
  for (std::size_t k = 1; k < kPayloadWords; ++k) {
    if (m.words[k] != derived_word(m.words[0], k)) {
      return false;
    }
  }
  return true;
}

double now_seconds()
{
  using clock = std::chrono::steady_clock;
  return std::chrono::duration<double>(clock::now().time_since_epoch()).count();
}

struct alignas(kCacheLine) StartLine
{
  alignas(kCacheLine) std::atomic<uint32_t> ready{0};
  alignas(kCacheLine) std::atomic<bool> go{false};
};

// Per-producer counters, one cache line each; written once at the end.
struct alignas(kCacheLine) ProducerResult
{
  uint64_t full_spins = 0;
  uint64_t cas_retries = 0;
};

struct ConsumerResult
{
  uint64_t received = 0;
  uint64_t empty_polls = 0;
  uint64_t errors = 0;
  double end = 0;
};

// cpu < 0 means "leave this thread unpinned".
void pin_or_die(int cpu, const char* who)
{
  if (cpu >= 0 && !pin_self(cpu)) {
    std::fprintf(stderr, "fatal: failed to pin %s to cpu %d\n", who, cpu);
    std::_Exit(3);
  }
}

void wait_for_start(StartLine& start)
{
  start.ready.fetch_add(1, std::memory_order_acq_rel);
  while (!start.go.load(std::memory_order_acquire)) {}
}

void producer_main(uint32_t id, uint64_t msgs, Queue& queue, StartLine& start,
                   ProducerResult& out, int cpu)
{
  pin_or_die(cpu, "producer");
  wait_for_start(start);

  uint64_t spins = 0;
  for (uint32_t seq = 0; seq < msgs; ++seq) {
    const Message msg = make_message(id, seq);
    // push() only moves from its argument on success, but a fresh copy per
    // attempt keeps that out of the picture.
    while (!queue.push(Message{msg})) {
      ++spins;
    }
  }
  out.full_spins = spins;
#if QUEUE_IMPL == 0 && QUEUE_SHARED && defined(MPSC_STATS)
  out.cas_retries = mpsc_contended_retries;
#endif
}

void consumer_main(uint32_t producers, uint64_t msgs_per_producer, Queue* queues,
                   StartLine& start, ConsumerResult& out, int cpu)
{
  pin_or_die(cpu, "consumer");
  const uint32_t num_queues = kShared ? 1 : producers;
  std::vector<uint32_t> expected(producers, 0);
  const uint64_t total = msgs_per_producer * producers;

  wait_for_start(start);

  uint64_t received = 0;
  uint64_t empty_polls = 0;
  uint64_t errors = 0;
  auto report = [&](const char* what, uint32_t queue, uint32_t producer, uint32_t seq) {
    if (errors < 10) {
      std::fprintf(stderr, "error: %s (queue %u, producer %u, seq %u)\n", what, queue, producer,
                   seq);
    }
    ++errors;
  };

  while (received < total) {
    for (uint32_t q = 0; q < num_queues; ++q) {
      Message msg;
      if (!queues[q].pop(msg)) {
        ++empty_polls;
        continue;
      }
      ++received;

      const uint32_t producer = uint32_t(msg.words[0] >> 32);
      const uint32_t seq = uint32_t(msg.words[0]);
      if (producer >= producers || (!kShared && producer != q)) {
        report("message from wrong producer", q, producer, seq);
        continue;
      }
      if (!payload_intact(msg)) {
        report("torn payload", q, producer, seq);
      }
      if (seq != expected[producer]) {
        report("out of order, lost or duplicated", q, producer, seq);
      }
      expected[producer] = seq + 1;
    }
  }
  out.end = now_seconds();

  // Every queue must be drained once every message has been accounted for.
  for (uint32_t q = 0; q < num_queues; ++q) {
    Message extra;
    if (queues[q].pop(extra)) {
      report("extra message after the last one", q, uint32_t(extra.words[0] >> 32),
             uint32_t(extra.words[0]));
    }
  }

  out.received = received;
  out.empty_polls = empty_polls;
  out.errors = errors;
}

}  // namespace

int main(int argc, char** argv)
{
  const uint64_t msgs = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 1'000'000;
  const int runs = argc > 2 ? std::atoi(argv[2]) : 3;
  const int cpu = argc > 3 ? std::atoi(argv[3]) : 0;
  const long producers_arg = argc > 4 ? std::atol(argv[4]) : 8;

  // seq is a uint32_t inside the message, so each producer can send < 2^32.
  if (msgs == 0 || msgs > UINT32_MAX || runs <= 0 || producers_arg <= 0 ||
      producers_arg > long(kMaxProducers)) {
    std::fprintf(stderr,
                 "usage: %s [msgs_per_producer (1..2^32-1)] [runs >= 1] [cpu] "
                 "[producers 1..%zu]\n",
                 argv[0], kMaxProducers);
    return 2;
  }
  const auto producers = uint32_t(producers_arg);

  const bool pinned = cpu >= 0;
  pin_or_die(cpu, "main thread");
  const std::vector<int> producer_cpu =
      pinned ? producer_cpus(cpu, producers) : std::vector<int>(producers, -1);
  const std::size_t usable_cpus =
      pinned ? node_cpus(cpu).size() : std::size_t(std::thread::hardware_concurrency());
  const bool oversubscribed = producers + 1 > usable_cpus;

  std::printf("fan-in: %u producers -> 1 consumer, %s %s queue%s, capacity %zu, payload %zu words, "
              "backoff %d, %llu msgs/producer, consumer cpu %d, producer cpus [%s]%s, "
              "sizeof(Queue)=%zu\n",
              producers, kImpl, kShared ? "shared" : "per-producer", kShared ? "" : "s",
              kCapacity, kPayloadWords, kBackoff, static_cast<unsigned long long>(msgs), cpu,
              pinned ? cpu_list(producer_cpu).c_str() : "unpinned", oversubscribed ? " (OVERSUBSCRIBED)" : "",
              sizeof(Queue));

  std::vector<double> rates;
  uint64_t total_errors = 0;

  for (int run = 1; run <= runs; ++run) {
    const uint32_t num_queues = kShared ? 1 : producers;
    std::unique_ptr<Queue[]> queues(new Queue[num_queues]);
    StartLine start;
    std::vector<ProducerResult> results(producers);
    ConsumerResult consumer_result{};

    std::thread consumer(consumer_main, producers, msgs, queues.get(), std::ref(start),
                         std::ref(consumer_result), cpu);
    std::vector<std::thread> threads;
    threads.reserve(producers);
    for (uint32_t i = 0; i < producers; ++i) {
      threads.emplace_back(producer_main, i, msgs, std::ref(queues[kShared ? 0 : i]),
                           std::ref(start), std::ref(results[i]), producer_cpu[i]);
    }

    // Every thread is pinned and spinning on `go` before the clock starts.
    while (start.ready.load(std::memory_order_acquire) != producers + 1) {}
    const double begin = now_seconds();
    start.go.store(true, std::memory_order_release);

    for (auto& t : threads) {
      t.join();
    }
    consumer.join();
    const double elapsed = consumer_result.end - begin;

    const uint64_t total = msgs * producers;
    uint64_t total_full_spins = 0;
    uint64_t max_full_spins = 0;
    uint64_t total_cas_retries = 0;
    for (const auto& r : results) {
      total_full_spins += r.full_spins;
      max_full_spins = std::max(max_full_spins, r.full_spins);
      total_cas_retries += r.cas_retries;
    }

    const double rate = static_cast<double>(total) / elapsed;
    rates.push_back(rate);
    total_errors += consumer_result.errors;

    const bool ok = consumer_result.errors == 0 && consumer_result.received == total;
    std::printf(
        "run %d: %.3f s, %.0f msg/s, received %llu/%llu, full-spins %llu (max/producer %llu), "
        "empty-polls %llu, cas-retries %llu, errors %llu %s\n",
        run, elapsed, rate, static_cast<unsigned long long>(consumer_result.received),
        static_cast<unsigned long long>(total), static_cast<unsigned long long>(total_full_spins),
        static_cast<unsigned long long>(max_full_spins),
        static_cast<unsigned long long>(consumer_result.empty_polls),
        static_cast<unsigned long long>(total_cas_retries),
        static_cast<unsigned long long>(consumer_result.errors), ok ? "[PASS]" : "[FAIL]");
    std::printf("csv,%s,%d,%u,%zu,%zu,%d,%llu,%d,%.6f,%.0f,%llu,%llu,%llu,%llu,%d\n", kImpl,
                int(kShared), producers, kCapacity, kPayloadWords, kBackoff,
                static_cast<unsigned long long>(msgs), run, elapsed, rate,
                static_cast<unsigned long long>(total_full_spins),
                static_cast<unsigned long long>(consumer_result.empty_polls),
                static_cast<unsigned long long>(total_cas_retries),
                static_cast<unsigned long long>(consumer_result.errors), int(ok));
  }

  const auto [min_it, max_it] = std::minmax_element(rates.begin(), rates.end());
  double sum = 0;
  for (double r : rates) {
    sum += r;
  }
  std::printf("throughput msg/s: min %.0f, avg %.0f, max %.0f\n", *min_it,
              sum / static_cast<double>(rates.size()), *max_it);

  if (total_errors != 0) {
    std::printf("FAILED: %llu ordering/delivery errors\n",
                static_cast<unsigned long long>(total_errors));
    return 1;
  }
  std::printf("PASSED\n");
  return 0;
}
