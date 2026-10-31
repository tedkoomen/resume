---
path: '/blog/engineering/queue-types-and-topology'
date: '2026-10-31T09:00:00Z'
title: 'Queues: Who Owns the Next Slot?'
author: 'Ted Koomen'
description: 'SPSC fan-in, a shared MPSC queue, and the ownership and capacity rules behind a fair comparison.'
posttype: 'engineering'
hideRelatedLinks: true
tag: ['cpp', 'concurrency', 'queues', 'performance']
image: '../../images/social-queue-topology.png'
featuredImage: '../../images/social-queue-topology.png'
featured: true
snippet: 'Before choosing between a mutex and atomics, decide which threads need to share a queue.'
takeaways:
  - 'SPSC describes each queue, not the total number of producers in the application.'
  - 'Shared MPSC capacity should match the sum of the SPSC capacities for this baseline.'
  - 'Reservation, publication, and reuse are separate steps in a queue protocol.'
---

A shared counter is a useful starting point for mutexes and atomics. A queue asks more of us. A producer needs somewhere to write, a consumer needs to know when that write is complete, and neither may reuse the storage too early.

My experiment has several producers sending small messages to one consumer. There are two useful ways to arrange that communication: give every producer its own queue, or let all producers share one. Both arrangements deliver work to the same consumer. They put the coordination in different places.

The [source, tests, raw data, and chart scripts](https://github.com/tedkoomen/resume/tree/master/benchmarks/spsc-vs-mpsc) live together outside the website build.

## What would I use a queue for?

Suppose a server receives a request to generate a thumbnail. Decoding and resizing the image takes CPU time, and I do not want the request-handling thread to spend that time doing the whole job. It can prepare a job containing the image reference, requested dimensions, and an ID, then put that job in a queue for a worker to process.

The queue is a handoff between the thread accepting work and the thread executing it. It also holds a limited backlog when jobs arrive faster than workers can finish them. That buffering can absorb a short burst; it cannot fix a sustained shortage of processing capacity. When a bounded job queue fills, the application must decide whether to wait, reject new work, or use another explicit overload policy.

The same pattern appears in other places: a network reader hands received messages to a parser, workers send log records to a logging thread, or background tasks send completion events to a thread that owns application state. The queued item might be a value, a job ID, or a reference to larger data. If it is a reference, the referenced data must stay alive until its consumer is finished with it. Putting a pointer in a queue does not settle ownership of the object it points to.

The topology follows from who uses each end of the queue. “Producer” and “consumer” describe those roles, not permanent names for threads. A worker consumes jobs from one queue and produces results into another.

## SPSC describes a relationship

SPSC means single producer, single consumer. Only one thread may push into a particular SPSC queue, and only one may pop from it. The whole program can still have many producers. In **SPSC fan-in**, each producer owns a separate queue and one consumer polls all of them.

MPSC means multiple producers, single consumer. Producers can push into the same queue, so the implementation needs a way to give each producer a distinct position. The consumer still has exclusive responsibility for removing items.

| Queue relationship | Who pushes? | Who pops? | Example use |
|---|---|---|---|
| SPSC | One producer | One consumer | One dispatcher sends jobs to one dedicated worker. |
| MPSC | Multiple producers | One consumer | Several workers send completed jobs to one result collector. |
| SPMC | One producer | Multiple consumers | One dispatcher submits jobs to a shared queue drained by a worker pool. |
| MPMC | Multiple producers | Multiple consumers | Several request-handling threads submit jobs to a shared worker pool. |

These names do not specify the implementation. An MPSC queue can use a mutex. An SPSC queue can use atomics. Bounded versus unbounded storage is another choice. Our queues are bounded rings: they reuse a fixed array and must handle full and empty states.

## Follow a job through the system

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

## Should MPSC have more capacity?

Yes, compared with **one** of the SPSC queues. For the baseline, I matched the total number of message slots:

| Producers | SPSC fan-in | Shared MPSC | Total on each side |
|---:|---|---|---:|
| 4 | Four queues × 8 slots | One queue × 32 slots | 32 |
| 8 | Eight queues × 8 slots | One queue × 64 slots | 64 |

Comparing eight independent eight-slot queues with a single eight-slot shared queue would give the shared arrangement one eighth of the buffering. That could be a legitimate resource constraint to study, but it would answer a different question.

Equal slots do not mean equal bytes. Sequence numbers and padding add overhead. Equal slots also do not mean equal burst tolerance: the animation shows why. The old three-producer experiment used 24 total SPSC slots against 64 shared slots. I preserved that run matrix separately, but it is not the capacity-matched baseline.

## A ring needs two handoffs

Here is a complete, deliberately small SPSC example. You can run it below, download it, or compile it locally with `g++ -std=c++20 -O2 -pthread spsc-handoff.cpp -o spsc-handoff`.

<!-- EXAMPLE:spsc-handoff -->

```cpp
#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

// Exactly one producer and one consumer. Eight usable slots.
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

## Multiple producers need a reservation protocol

The [measured MPSC implementation](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/mpsc.h) adds a shared producer position and a sequence number for each slot. A producer checks that the position is free, attempts to reserve it with CAS, writes the payload, then publishes the slot's sequence number. The consumer checks that sequence before reading and changes it again when the storage is reusable.

Reservation does not publish the payload. A successful CAS can be followed by preemption before the producer writes its message. The consumer must wait for that reserved position even if a later producer has already finished a later slot.

This is why I call this implementation **atomic** or **mutex-free**, rather than promising formal lock-free progress. A stopped producer can obstruct the consumer; eventually the bounded queue fills. Historical filenames still say `lockfree_mpsc`, but the name is not a proof. Moving or assigning the payload must also be compatible with this protocol: an exception after reservation would leave an unfinished slot. The measurements use a trivial 64-bit payload.

Fan-in preserves order within each producer's stream. It does not create an identical global ordering across streams. The shared implementation makes the consumer follow reservation order, which is also not necessarily wall-clock arrival order at the producer. If an order book requires exchange sequence order, neither topology gets to invent that order from thread scheduling.

## Atomics versus a protected queue

For comparison, the harness wraps bounded queues with a mutex, a spinlock, or a condition-variable wait strategy. Their payload and index fields can be ordinary data when every relevant access follows the locking rule. The lock still relies on atomic synchronization. Calling this “atomic versus non-atomic” would hide the mechanism that makes the protected version correct.

Here is the first result, with four producers and 32 total slots. These are medians of 30 shuffled runs in one VM session, in millions of delivered and validated messages per second:

| Strategy | SPSC fan-in | Shared MPSC |
|---|---:|---:|
| Atomic, immediate MPSC retry | 14.731 | 7.029 |
| Atomic, exponential MPSC backoff | 14.731 | 9.435 |
| Mutex | 1.351 | 1.322 |

SPSC fan-in wins the atomic comparison in this balanced workload. The mutex pair is much closer. That is already a reason to keep **topology** and **synchronization** separate when discussing the result.

The atomic runs send 100,000 messages per producer; the mutex runs send 10,000. Work is matched within each topology comparison, but the table is not a perfectly controlled cross-strategy latency experiment. The committed benchmark report records the full design and uncertainty.

For a job system or feed handler, I would first ask who owns the state, whether independent producer streams are acceptable, and how bursts should consume capacity. Once those answers are clear, padding and retry behavior become useful implementation questions.
