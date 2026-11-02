---
path: '/blog/engineering/queue-types-and-topology'
date: '2026-11-02T09:00:00Z'
title: 'SPSC vs MPSC Queues: Who Owns the Next Slot?'
author: 'Ted Koomen'
description: 'Compare SPSC fan-in and MPSC queues in C++20 with runnable examples, acquire/release ordering, bounded capacity, and measured throughput tradeoffs.'
posttype: 'engineering'
hideRelatedLinks: true
tag: ['cpp', 'concurrency', 'queues', 'performance']
image: '../../images/social-queue-topology.png'
featuredImage: '../../images/social-queue-topology.png'
featured: true
snippet: 'Several producers, one consumer: compare SPSC fan-in with a shared MPSC queue through runnable C++20 code and a capacity-matched benchmark.'
takeaways:
  - 'SPSC describes each queue, not the total number of producers in the application.'
  - 'Shared MPSC capacity should match the sum of the SPSC capacities for this baseline.'
  - 'Reservation, publication, and reuse are separate steps in a queue protocol.'
---

In [Threads, Mutexes, and Atomics: Start With What Can Go Wrong](/blog/engineering/threads-mutexes-and-atomics/), I used shared counters to explain synchronization. A queue asks more of us. A producer needs somewhere to write, a consumer needs to know when that write is complete, and neither may reuse the storage too early.

Two names come up throughout this article. **SPSC means single producer, single consumer**: one thread pushes into a particular queue and one thread pops from it. **MPSC means multiple producers, single consumer**: several threads push into the same queue and one thread pops from it. A producer adds work; a consumer removes it. These names describe who can use each end, not whether the queue uses a mutex or atomics.

Suppose several worker threads finish jobs and send their results to one collector. Each result might be only a job ID and a status, so handing it off can be a meaningful part of the work. I wanted to measure how much the queue arrangement changes the rate at which that collector can receive messages as more producers compete to send them.

There are two useful ways to arrange that communication: give every producer its own SPSC queue, with the consumer polling all of them (**SPSC fan-in**), or let all producers share one MPSC queue. Fan-in avoids competition between producers for the same queue, but the consumer has to look for work in several places. A shared queue gives the consumer one place to look and lets a busy producer use any available slot, but producers must coordinate access to that storage.

The experiment compares those arrangements by counting how many messages the consumer receives and validates per second. Both sides send the same small payloads and have the same total number of message slots, with runs at four and eight producers. The question is whether avoiding producer contention pays for the extra polling in this workload, and how the result changes when the queues use atomics or locks. The small messages keep the test focused on the handoff; it does not measure the time spent doing the jobs themselves.

This article establishes the comparison, walks through both implementations, and shows an initial throughput result. That gives us a basis for interpreting the measurements without assuming either arrangement will be faster for every application.

The [source, tests, raw data, and chart scripts](https://github.com/tedkoomen/resume/tree/master/benchmarks/spsc-vs-mpsc) live together outside the website build.

## What would I use a queue for?

Suppose a server receives a request to generate a thumbnail. Decoding and resizing the image takes CPU time, and I do not want the request-handling thread to spend that time doing the whole job. It can prepare a job containing the image reference, requested dimensions, and an ID, then put that job in a queue for a worker to process.

The queue is a handoff between the thread accepting work and the thread executing it. It also holds a limited backlog when jobs arrive faster than workers can finish them. That buffering can absorb a short burst; it cannot fix a sustained shortage of processing capacity. When a bounded job queue fills, the application must decide whether to wait, reject new work, or use another explicit overload policy.

The same pattern appears in other places: a network reader hands received messages to a parser, workers send log records to a logging thread, or background tasks send completion events to a thread that owns application state. The queued item might be a value, a job ID, or a reference to larger data. If it is a reference, the referenced data must stay alive until its consumer is finished with it. Putting a pointer in a queue does not settle ownership of the object it points to.

The topology follows from who uses each end of the queue. “Producer” and “consumer” describe those roles, not permanent names for threads. A worker consumes jobs from one queue and produces results into another.

## SPSC, MPSC, SPMC, and MPMC: who uses each queue?

The counts apply to each queue, not the whole program. Four producers with four separate queues can still use SPSC. Put those producers on one queue and the implementation must coordinate their pushes: it is now MPSC. The other two combinations, SPMC (single producer, multiple consumers) and MPMC (multiple producers, multiple consumers), add competition at the consumer end.

| Queue relationship | Who pushes? | Who pops? | Example use |
|---|---|---|---|
| SPSC | One producer | One consumer | One dispatcher sends jobs to one dedicated worker. |
| MPSC | Multiple producers | One consumer | Several workers send completed jobs to one result collector. |
| SPMC | One producer | Multiple consumers | One dispatcher submits jobs to a shared queue drained by a worker pool. |
| MPMC | Multiple producers | Multiple consumers | Several request-handling threads submit jobs to a shared worker pool. |

These names do not specify the implementation. An MPSC queue can use a mutex. An SPSC queue can use atomics. Bounded versus unbounded storage is another choice. Our queues are bounded rings: they reuse a fixed array and must handle full and empty states.

## SPSC fan-in vs a shared MPSC queue

Imagine one dispatcher and four thumbnail workers. If the dispatcher puts every job into one shared queue, all four workers need permission to pop from that queue. That is **SPMC**, not SPSC. Each successfully removed job goes to one worker; a work queue does not broadcast a copy to every worker. Workers can finish jobs in a different order from the order in which they were removed, because the jobs may take different amounts of time.

Alternatively, the dispatcher can give each worker a separate SPSC queue. It chooses the destination before enqueueing. That can be useful when a worker owns particular state or when jobs for one key should go to the same worker. It also puts the assignment decision on the dispatcher. A round-robin assignment can leave a fast worker idle while a slower worker has a backlog. A shared queue lets a worker that finishes sooner attempt to take another job, although fairness between workers still depends on the implementation and scheduling.

Now follow the results in the other direction. Suppose one collector records job completion and updates the response state. All four workers can push results into one **MPSC** queue. The collector is the only consumer, so it can own that state without every worker updating it directly.

Or each worker can have its own SPSC result queue, with the collector polling all four. That is **SPSC fan-in**. The whole system still has four result producers; each individual queue has only one. This result-return path is the arrangement measured in the experiment: several producers feed one consumer. The experiment does not benchmark the SPMC job-dispatch path or the image processing itself.

Both result arrangements can carry the same job IDs and completion data. The choice changes where workers contend, where the collector looks for work, and how much of the buffer a single busy worker can use. If responses must follow submission order, the collector also needs a policy for holding early completions until missing earlier jobs finish; queue topology alone does not provide that application-level ordering.

In the illustration below, think of A and B as two workers sending completion messages to the collector. A finishes three jobs in a burst while B has only one result. The four total slots are the same in both arrangements.

<div data-concept-animation="queue-topology">
  <p>Compare two producers with two slots each against one shared four-slot queue. In fan-in, A can fill its own queue while B's slots remain unused. In the shared queue, A can use all four slots. Step through the same arrival order to see where backpressure begins.</p>
</div>

Fan-in removes producer-versus-producer reservation contention. It gives the consumer more queues to inspect and makes capacity less flexible. A producer with a burst cannot borrow its neighbor's empty slots. A shared queue can absorb that burst, but its producers now compete over shared state.

### How the fan-in consumer polls

The [benchmark consumer loop](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/fanin_test.cpp) visits each producer queue in turn and attempts one pop before moving on. Empty queues are skipped. After the last queue, it starts another pass. The shared MPSC version checks only its one queue.

That polling policy is part of the experiment. Draining one queue completely before visiting the next could delay other producers indefinitely if the first stays busy. Taking a bounded batch can reduce the cost of switching queues, but it also changes how long the others wait. This harness uses one message per visit. It gives each queue a polling opportunity on every pass, without promising a wall-clock latency bound.

## Should MPSC have more capacity?

Yes, compared with **one** of the SPSC queues. For the baseline, I matched the total number of message slots:

| Producers | SPSC fan-in | Shared MPSC | Total on each side |
|---:|---|---|---:|
| 4 | Four queues × 8 slots | One queue × 32 slots | 32 |
| 8 | Eight queues × 8 slots | One queue × 64 slots | 64 |

Comparing eight independent eight-slot queues with a single eight-slot shared queue would give the shared arrangement one eighth of the buffering. That could be a legitimate resource constraint to study, but it would answer a different question.

Equal slots do not mean equal bytes. Sequence numbers and padding add overhead. Equal slots also do not mean equal burst tolerance: the animation shows why. The old three-producer experiment used 24 total SPSC slots against 64 shared slots. I preserved that run matrix separately, but it is not the capacity-matched baseline.

## Implementing an SPSC ring buffer in C++20

Here is a complete, deliberately small SPSC example. You can run it below, download it, or compile it locally with `g++ -std=c++20 -O2 -pthread spsc-handoff.cpp -o spsc-handoff`.

<!-- EXAMPLE:spsc-handoff -->

```cpp
#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

class Ring {
    std::array<std::uint64_t, 8> slots{};
    alignas(64) std::atomic<std::uint64_t> head{0};
    alignas(64) std::atomic<std::uint64_t> tail{0};
public:
    bool push(std::uint64_t value) {
        const auto h = head.load(std::memory_order_relaxed);
        if (h - tail.load(std::memory_order_acquire) == slots.size())
            return false;
        slots[h & 7] = value;
        head.store(h + 1, std::memory_order_release);
        return true;
    }
    bool pop(std::uint64_t& value) {
        const auto t = tail.load(std::memory_order_relaxed);
        if (t == head.load(std::memory_order_acquire)) return false;
        value = slots[t & 7];
        tail.store(t + 1, std::memory_order_release);
        return true;
    }
};

int main() {
    Ring queue;
    constexpr std::uint64_t count = 10000;
    std::uint64_t errors = 0, sum = 0;
    std::thread consumer([&] {
        for (std::uint64_t expected = 0; expected < count; ++expected) {
            std::uint64_t value;
            while (!queue.pop(value)) std::this_thread::yield();
            errors += value != expected;
            sum += value;
        }
    });
    std::thread producer([&] {
        for (std::uint64_t value = 0; value < count; ++value)
            while (!queue.push(value)) std::this_thread::yield();
    });
    producer.join();
    consumer.join();
    std::uint64_t extra;
    const bool empty = !queue.pop(extra);
    std::cout << "Messages: " << count << ", errors: " << errors
              << ", sum: " << sum << ", drained: " << std::boolalpha
              << empty << '\n';
    return errors || !empty || sum != count * (count - 1) / 2;
}
```

<div data-cpp-example="spsc-handoff">
<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>
</div>

<!-- END-EXAMPLE:spsc-handoff -->

The producer owns `head`; the consumer owns `tail`. Neither needs a CAS loop to update its own index. Unsigned differences track occupied slots, and masking selects a position in this power-of-two array. The example sends far fewer messages than would wrap the counters.

There are two synchronization paths. The producer writes the payload, then release-stores `head`. A consumer acquire-load that observes that publication can read the payload. After reading, the consumer release-stores `tail`. A producer acquire-load that observes the freed position may reuse its storage. The second path matters just as much as the first: publishing a message correctly is insufficient if the next message overwrites it while it is being read.

Loads of a thread's own index can be relaxed because the other thread never writes that index. The [C++ ordering rules](https://eel.is/c++draft/atomics.order) define the acquire/release relationship; the ordinary payload array is safe because that protocol orders its accesses.

The example yields while waiting so it can run reasonably in a shared execution service. That is a teaching choice, not the busy-wait policy used to produce the charts. Its `64`-byte alignment is an explicit target assumption. Do not add a second producer to this class: two producers could select and write the same slot.

## Implementing an MPSC queue with CAS and sequence numbers

In the SPSC ring, only one producer advances `head`. With two producers, both could load the same position and overwrite the same slot. Making that load atomic does not reserve anything. This implementation uses atomic **compare-and-exchange (CAS)** to let only one producer claim a position, plus a separate way to say its payload is ready.

The [measured MPSC implementation](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/mpsc.h) uses a shared producer position and a sequence number per slot. Here is a small version of that protocol. It has 32 usable slots, matching the total storage of four eight-slot SPSC queues, and four producers sending 10,000 messages each. Compile it with `g++ -std=c++20 -O2 -pthread mpsc-handoff.cpp -o mpsc-handoff`, or run it below.

<!-- EXAMPLE:mpsc-handoff -->

```cpp
#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

class MpscRing {
    static constexpr std::uint64_t capacity = 32;
    struct alignas(64) Slot {
        std::atomic<std::uint64_t> sequence{0};
        std::uint64_t value{0};
    };
    std::array<Slot, capacity> slots{};
    alignas(64) std::atomic<std::uint64_t> head{0};
    alignas(64) std::uint64_t tail{0};
public:
    MpscRing() {
        for (std::uint64_t i = 0; i < capacity; ++i)
            slots[i].sequence.store(i, std::memory_order_relaxed);
    }

    bool push(std::uint64_t value) {
        auto position = head.load(std::memory_order_relaxed);
        for (;;) {
            auto& slot = slots[position & (capacity - 1)];
            const auto sequence = slot.sequence.load(std::memory_order_acquire);
            if (sequence == position) {
                if (head.compare_exchange_weak(position, position + 1,
                                               std::memory_order_relaxed)) {
                    slot.value = value;
                    slot.sequence.store(position + 1, std::memory_order_release);
                    return true;
                }
            } else if (sequence < position) { // Assumes counters do not wrap.
                return false;
            } else {
                position = head.load(std::memory_order_relaxed);
            }
        }
    }

    bool pop(std::uint64_t& value) {
        auto& slot = slots[tail & (capacity - 1)];
        if (slot.sequence.load(std::memory_order_acquire) != tail + 1)
            return false;
        value = slot.value;
        slot.sequence.store(tail + capacity, std::memory_order_release);
        ++tail;
        return true;
    }
};

int main() {
    MpscRing queue;
    constexpr std::uint64_t producer_count = 4, count = 10000;
    constexpr auto total = producer_count * count;
    std::array<std::uint64_t, producer_count> next{};
    std::uint64_t errors = 0, sum = 0;
    std::atomic<bool> start{false};
    std::thread consumer([&] {
        while (!start.load(std::memory_order_acquire)) std::this_thread::yield();
        for (std::uint64_t received = 0; received < total; ++received) {
            std::uint64_t value;
            while (!queue.pop(value)) std::this_thread::yield();
            const auto producer = value / count;
            if (producer >= producer_count) ++errors;
            else errors += value % count != next[producer]++;
            sum += value;
        }
    });
    std::array<std::thread, producer_count> producers;
    for (std::uint64_t id = 0; id < producer_count; ++id) {
        producers[id] = std::thread([&, id] {
            while (!start.load(std::memory_order_acquire)) std::this_thread::yield();
            for (std::uint64_t sequence = 0; sequence < count; ++sequence)
                while (!queue.push(id * count + sequence)) std::this_thread::yield();
        });
    }
    start.store(true, std::memory_order_release);
    for (auto& producer : producers) producer.join();
    consumer.join();
    for (const auto received : next) errors += received != count;
    std::uint64_t extra;
    const bool empty = !queue.pop(extra);
    std::cout << "Producers: " << producer_count << ", messages: " << total
              << ", errors: " << errors << ", sum: " << sum
              << ", drained: " << std::boolalpha << empty << '\n';
    return errors || !empty || sum != total * (total - 1) / 2;
}
```

<div data-cpp-example="mpsc-handoff">
<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>
</div>

<!-- END-EXAMPLE:mpsc-handoff -->

Each slot starts with its array index as its sequence number. For logical position `p`, the sequence moves through three states:

| Sequence | Meaning | Who changes it next? |
|---|---|---|
| `p` | Storage is available for position `p`. | A producer wins CAS on `head`, then writes the payload. |
| `p + 1` | The payload has been published. | The consumer reads the payload. |
| `p + capacity` | The consumer has finished; the slot is available for the next lap. | A future producer can reuse it. |

For example, slot zero starts at sequence `0`. A producer reserves position `0` by changing `head` from `0` to `1`, writes the value, then release-stores sequence `1`. The consumer acquire-loads `1`, reads the value, and release-stores `32`. That same physical slot can now serve logical position `32`. A sequence number distinguishes successive uses of a slot; a single ready flag would not identify which lap it belongs to.

On a failed CAS, `compare_exchange_weak` updates `position` with the observed head, and the loop checks the corresponding slot again. If the slot sequence is behind the requested position, the consumer has not yet made that slot available. If it is ahead, the producer's position is stale and it reloads `head`. This teaching version uses ordinary unsigned comparisons and assumes the 64-bit counters never wrap; wrapping around the array is supported, wrapping the counters is not.

The CAS is relaxed because it only assigns exclusive ownership of a position. The release/acquire operations on `sequence` carry the payload-publication and storage-reuse handoffs. `tail` can be ordinary data here: only the consumer touches it, and producers learn about reusable storage from slot sequences instead. The demo checks the final empty state from the main thread only after joining the consumer.

Reservation does not publish the payload. Suppose producer A reserves position `0` and is paused before writing. Producer B can reserve and publish position `1`, but the consumer cannot skip position `0`. Its `pop` returns false until A publishes. Here, false means the next position is not ready; it does not prove that every slot is empty.

This is why I call this implementation **atomic** or **mutex-free**, rather than promising formal lock-free progress. A stopped producer can obstruct the consumer; eventually the bounded queue fills. Historical filenames still say `lockfree_mpsc`, but the name is not a proof. Moving or assigning the payload must also be compatible with this protocol: an exception after reservation would leave an unfinished slot. The measurements use a trivial 64-bit payload.

The runnable program validates each producer's sequence, its message count, the total sum, and the final drained state. Like the SPSC demo, it yields when a push or pop cannot complete. It omits the measured queue's configurable CAS backoff and statistics. These are examples of the ownership protocols, not the programs that produced the throughput table.

Fan-in preserves order within each producer's stream. It does not create an identical global ordering across streams. The shared implementation makes the consumer follow reservation order, which is also not necessarily wall-clock arrival order at the producer. If an order book requires exchange sequence order, neither topology gets to invent that order from thread scheduling.

This gives us a concrete cost to compare. In SPSC, each producer advances its own queue's head without competing with other producers. In this MPSC implementation, every producer competes to update the same head, and failed CAS attempts add work. Fan-in avoids that competition, but the consumer must poll several queues and each producer has a fixed share of the capacity. Those tradeoffs are why the workload matters when we get to the numbers.

## SPSC vs MPSC throughput: atomics and mutexes

For comparison, the harness wraps bounded queues with a mutex, a spinlock, or a condition-variable wait strategy. Their payload and index fields can be ordinary data when every relevant access follows the locking rule. The lock still relies on atomic synchronization. Calling this “atomic versus non-atomic” would hide the mechanism that makes the protected version correct.

Here is the first result, with four producers and 32 total slots. These are medians of 30 shuffled runs in one VM session, in millions of delivered and validated messages per second:

| Strategy | SPSC fan-in | Shared MPSC |
|---|---:|---:|
| Atomic, immediate MPSC retry | 14.731 | 7.029 |
| Atomic, exponential MPSC backoff | 14.731 | 9.435 |
| Mutex | 1.351 | 1.322 |

SPSC fan-in wins the atomic comparison in this balanced workload. The mutex pair is much closer. That is already a reason to keep **topology** and **synchronization** separate when discussing the result.

The atomic runs send 100,000 messages per producer; the mutex runs send 10,000. Work is matched within each topology comparison, but the table is not a perfectly controlled cross-strategy latency experiment. The [full benchmark report and uncertainty estimates](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/charts/v3/REPORT.md) and [individual measured runs](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/data/v3/fair_runs.csv) make the comparison reproducible.

### What these measurements do not establish

These are throughput results, not per-message latency measurements. Dividing elapsed time by the number of delivered messages does not tell us how long an individual message waited, or the p99 delay during a burst. The consumer also validates messages inside the timed region, so the rate includes that work.

The runs used GCC 13.3 with C++20 and `-O3` in a KVM guest exposing nine vCPUs under an eight-CPU quota. In the four-producer case above, the consumer is pinned to CPU 0 and producers to CPUs 1–4. The CPUs are not isolated from host work; the eight-producer runs also place two producers on one logical CPU. There is no separate steady-state warmup. Hardware performance counters were unavailable, so the throughput difference alone cannot tell us how much time was lost to cache-line transfers.

A useful next experiment would measure message latency under uneven arrival rates: one busy producer, several mostly idle producers, and short bursts. The current balanced workload does not establish which arrangement wins there. As in [Optimizing the Wrong Thing, Faster](/blog/engineering/optimizing-the-wrong-thing-faster/), a faster measured stage only helps the application when that stage matters to its overall performance.

## When would I choose SPSC fan-in or MPSC?

| Requirement | SPSC fan-in | Shared MPSC in this example |
|---|---|---|
| Producers should avoid competing for the same reservation index. | Each producer owns its queue head. | Producers compete on one head. |
| One busy producer should use spare buffer capacity. | It can use only its own queue, even if others are empty. | It can claim any available slot in the shared capacity. |
| The consumer should inspect one queue. | It polls every producer queue, including empty ones. | It checks one next position. |
| An unfinished reservation should not stop unrelated streams. | The consumer can continue polling other queues. | It cannot pass the unfinished position. |
| Messages need a defined order across producers. | Only per-producer order is preserved. | The consumer follows reservation order; application sequence order still needs a separate policy. |

For a fixed group of workers with independent result streams, I would test fan-in first. For uneven bursts where producers need to share spare capacity, I would test a shared queue. Either choice still needs an explicit full-queue policy and a shutdown protocol: stop accepting work, let producers finish their final publications, and drain accepted messages before destroying the queues. The examples know the exact message count; a service needs its own completion signal.

For a job system or feed handler, I would first ask who owns the state, whether independent producer streams are acceptable, and how bursts should consume capacity. Once those answers are clear, padding and retry behavior become useful implementation questions.

## Sources and runnable code

- [C++ acquire/release memory-ordering rules](https://eel.is/c++draft/atomics.order) define the synchronization used to publish payloads and reuse slots.
- [Boost.Lockfree queue examples](https://www.boost.org/latest/doc/html/lockfree/examples.html) provide a separate library implementation to study, including an SPSC queue. Boost is not the implementation measured here.
- [Benchmark build instructions and configuration](https://github.com/tedkoomen/resume/tree/master/benchmarks/spsc-vs-mpsc) describe the harness, capacity settings, validation, and measurement commands.
