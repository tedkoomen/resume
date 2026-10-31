// Lock cost vs contention: N threads, each pinned to its own CPU on one NUMA
// node, repeatedly lock, bump a shared counter, unlock, then do `think`
// iterations of private work outside the lock. More think time -> less
// contention. With think large enough the lock is almost always free, which
// is the case futex-based std::mutex is built for: an uncontended lock/unlock
// is a single atomic RMW each in user space, with no syscall. Count futex
// syscalls externally with:
//   perf stat -e syscalls:sys_enter_futex ./lock_contention ...
//
// The per-acquisition lock cost is isolated by first timing the same loop
// with no lock (think work only) and subtracting.
//
// Build:  clang++ -std=c++20 -O3 -pthread lock_contention.cpp -o lock_contention
// Run:    ./lock_contention <mutex|spin> <threads> <think_iters> <ops_per_thread>
// Output: one CSV line:
//   lock,threads,think,ops_per_thread,elapsed_s,ns_per_iter,lock_ns_per_acquire,ok

#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "./locked_queue.h"
#include "./pinning.h"

namespace {

// Private, unoptimizable work: a dependent LCG chain (~3-4 cycles/iter).
inline uint64_t think(uint64_t x, uint64_t iters)
{
  for (uint64_t i = 0; i < iters; ++i) {
    x = x * 6364136223846793005ULL + 1442695040888963407ULL;
    asm volatile("" : "+r"(x));
  }
  return x;
}

double now_seconds()
{
  using clock = std::chrono::steady_clock;
  return std::chrono::duration<double>(clock::now().time_since_epoch()).count();
}

struct alignas(64) Shared
{
  uint64_t counter = 0;
};

template <typename Lock>
double run(int threads, uint64_t think_iters, uint64_t ops, bool use_lock, Lock& lock,
           Shared& shared, const std::vector<int>& cpus)
{
  alignas(64) std::atomic<int> ready{0};
  alignas(64) std::atomic<bool> go{false};
  std::vector<std::thread> pool;
  for (int t = 0; t < threads; ++t) {
    pool.emplace_back([&, t] {
      pin_self(cpus[t % cpus.size()]);
      uint64_t x = t + 1;
      ready.fetch_add(1);
      while (!go.load(std::memory_order_acquire)) {}
      for (uint64_t i = 0; i < ops; ++i) {
        if (use_lock) {
          std::lock_guard<Lock> guard(lock);
          ++shared.counter;
        }
        x = think(x, think_iters);
      }
      asm volatile("" : : "r"(x));
    });
  }
  while (ready.load() != threads) {}
  const double start = now_seconds();
  go.store(true, std::memory_order_release);
  for (auto& th : pool) {
    th.join();
  }
  return now_seconds() - start;
}

template <typename Lock>
int bench(const char* name, int threads, uint64_t think_iters, uint64_t ops)
{
  const std::vector<int> cpus = node_cpus(0);
  Lock lock;
  Shared shared;
  const double base = run(threads, think_iters, ops, false, lock, shared, cpus);
  const double elapsed = run(threads, think_iters, ops, true, lock, shared, cpus);
  const bool ok = shared.counter == uint64_t(threads) * ops;
  // Each thread performs `ops` iterations; the lock's added cost per
  // acquisition is the per-thread time difference divided by ops.
  std::printf("%s,%d,%llu,%llu,%.6f,%.2f,%.2f,%d\n", name, threads,
              static_cast<unsigned long long>(think_iters), static_cast<unsigned long long>(ops),
              elapsed, elapsed / double(ops) * 1e9, (elapsed - base) / double(ops) * 1e9, ok);
  return ok ? 0 : 1;
}

}  // namespace

int main(int argc, char** argv)
{
  if (argc != 5) {
    std::fprintf(stderr, "usage: %s <mutex|spin> <threads> <think_iters> <ops_per_thread>\n",
                 argv[0]);
    return 2;
  }
  const std::string kind = argv[1];
  const int threads = std::atoi(argv[2]);
  const uint64_t think_iters = std::strtoull(argv[3], nullptr, 10);
  const uint64_t ops = std::strtoull(argv[4], nullptr, 10);
  if (threads <= 0 || ops == 0) {
    std::fprintf(stderr, "threads and ops must be positive\n");
    return 2;
  }
  if (kind == "mutex") {
    return bench<std::mutex>("mutex", threads, think_iters, ops);
  }
  if (kind == "spin") {
    return bench<SpinLock>("spin", threads, think_iters, ops);
  }
  std::fprintf(stderr, "unknown lock kind '%s'\n", kind.c_str());
  return 2;
}
