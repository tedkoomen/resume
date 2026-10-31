---
path: '/blog/engineering/spinlocks-and-the-scheduler'
date: '2026-10-31T11:00:00Z'
title: 'A Spinlock Cannot Schedule Its Owner'
author: 'Ted Koomen'
description: 'How lock-holder preemption, CPU affinity, and producer condition-variable waits change the behavior of bounded queues.'
posttype: 'engineering'
hideRelatedLinks: true
tag: ['cpp', 'linux', 'concurrency', 'performance']
image: '../../images/social-spin-scheduler.png'
featuredImage: '../../images/social-spin-scheduler.png'
featured: false
snippet: 'A tiny critical section can still have a long wait if the thread holding its lock is not running.'
takeaways:
  - 'Spinning consumes execution time without guaranteeing that the lock owner runs.'
  - 'Our condition-variable queues park producers on full; their consumer still polls.'
  - 'Affinity, physical core ownership, and kernel isolation are different controls.'
---

A spinlock looks attractive around a tiny queue operation. Check an index, copy a word, advance the index, unlock. Surely that is too little work to justify putting a thread to sleep?

The missing variable is whether the thread holding the lock is running. A short critical section in source code does not impose a short upper bound on elapsed lock ownership. The owner can be preempted, its vCPU can stop running on the host, or the containing cgroup can exhaust its CPU budget.

There are three kinds of waiting to separate here: waiting to acquire a lock, waiting for queue capacity, and waiting to receive CPU time.

## Spin on a read, then try to acquire

The example below uses test-and-test-and-set. After losing an acquisition attempt, a waiter polls the flag with reads before attempting another atomic update. This avoids continuously issuing read-modify-write operations while the lock is visibly held. It still needs an acquire operation to take ownership and a release operation to relinquish it.

The protected counter is ordinary data. Every worker touches it under the same lock, and the final read happens after both joins. The program also runs the same workload under `std::mutex`. Both must produce 20,000; this example checks behavior rather than ranking their speed. Compile locally on x86-64 with `g++ -std=c++20 -O2 -pthread spin-mutex.cpp -o spin-mutex`.

<!-- EXAMPLE:spin-mutex -->

```cpp
#include <atomic>
#include <cstdint>
#include <immintrin.h>
#include <iostream>
#include <mutex>
#include <thread>

class SpinLock {
    std::atomic_flag held = ATOMIC_FLAG_INIT;
public:
    void lock() {
        while (held.test_and_set(std::memory_order_acquire)) {
            // Poll with reads before attempting another write.
            while (held.test(std::memory_order_relaxed)) _mm_pause();
        }
    }
    void unlock() { held.clear(std::memory_order_release); }
};

template<class Lock>
std::uint64_t exercise() {
    Lock lock;
    std::uint64_t count = 0; // Ordinary data, always accessed under the lock.
    auto work = [&] {
        for (int i = 0; i < 10000; ++i) {
            std::lock_guard<Lock> guard(lock);
            ++count;
        }
    };
    std::thread a(work), b(work);
    a.join();
    b.join();
    return count;
}

int main() {
    const auto spin = exercise<SpinLock>();
    const auto mutex = exercise<std::mutex>();
    std::cout << "Spin: " << spin << "\nMutex: " << mutex << '\n';
    return spin != 20000 || mutex != 20000;
}
```

<div data-cpp-example="spin-mutex">
<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>
</div>

<!-- END-EXAMPLE:spin-mutex -->

The benchmark's spinlock uses an atomic Boolean with exchange/load/store; this compact example uses C++20 `atomic_flag` with the same test-and-test-and-set shape. Neither promises fair acquisition. `_mm_pause()` is a processor hint inside the polling loop, not a request for the OS to run the owner.

## When the owner stops running

Imagine A owns the lock, but the scheduler switches to B on the same logical CPU before A releases it. B tries to acquire and spins. B cannot complete until A runs again. Its repeated checks do not perform A's remaining work.

<div data-concept-animation="queue-scheduler">
  <p>One illustrative CPU schedule: A acquires a lock and is preempted. B runs and discovers the lock is held. Compare B spinning until a later switch with B blocking so A can become the selected task. A must still execute its unlock before B can acquire.</p>
</div>

The blocking trace shows one possible schedule, not a guarantee that a blocked waiter immediately hands the CPU to its owner. It also does not claim an exact Linux time slice. Linux's fair scheduling implementation has evolved, including the transition toward [EEVDF](https://docs.kernel.org/scheduler/sched-eevdf.html). The dependency here is more basic: a waiter needs another thread to execute, and keeping the waiter runnable does not ensure that happens sooner.

On dedicated cores, a very short wait can justify spinning. Under oversubscription, the same policy can be costly. Even dedicated guest vCPUs do not establish exclusive ownership of physical host cores.

## Where the condition variable is used

The benchmark has three distinct protected-queue strategies:

| Variant | Protecting queue state | If push finds a full queue | If pop finds an empty queue |
|---|---|---|---|
| `mutex_*` | `std::mutex` | Return false; caller retries | Return false; consumer polls |
| `spin_*` | Spinlock | Return false; caller retries | Return false; consumer polls |
| `condvar_*` | `std::mutex` | Producer waits on `notFull_` | Return false; consumer polls |

The ordinary mutex can itself block a thread while the **lock** is contended. That is different from explicitly waiting for **queue space**. In `mutex_*`, a producer that acquires the mutex and discovers a full queue releases it and tries again. In `condvar_*`, it waits for the queue predicate to change.

The [actual `BlockingQueue` implementation](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/locked_queue.h) uses `notFull_.wait` in `push`. Removing an item permits a `notify_one` in `pop`. The runnable version below preserves that producer-wait/consumer-poll design with two slots and two producers. Build it with `g++ -std=c++20 -O2 -pthread condition-queue.cpp -o condition-queue`.

<!-- EXAMPLE:condition-queue -->

```cpp
#include <array>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <thread>

class Queue {
    std::mutex mutex;
    std::condition_variable notFull;
    std::array<std::uint64_t, 2> slots{};
    std::uint64_t head = 0, tail = 0;
    unsigned waiters = 0;
public:
    void push(std::uint64_t value) {
        std::unique_lock lock(mutex);
        if (head - tail == slots.size()) {
            ++waiters;
            notFull.wait(lock, [&] { return head - tail < slots.size(); });
            --waiters;
        }
        slots[head++ % slots.size()] = value;
    }
    bool pop(std::uint64_t& value) {
        std::unique_lock lock(mutex);
        if (head == tail) return false;
        value = slots[tail++ % slots.size()];
        const bool wake = waiters != 0;
        lock.unlock();
        if (wake) notFull.notify_one();
        return true;
    }
};

int main() {
    Queue queue;
    auto produce = [&] {
        for (std::uint64_t i = 1; i <= 1000; ++i) queue.push(i);
    };
    std::thread a(produce), b(produce);
    std::uint64_t sum = 0;
    for (int received = 0; received < 2000; ++received) {
        std::uint64_t value;
        while (!queue.pop(value)) std::this_thread::yield();
        sum += value;
    }
    a.join();
    b.join();
    std::uint64_t extra;
    const bool drained = !queue.pop(extra);
    std::cout << "Messages: 2000, sum: " << sum
              << ", drained: " << std::boolalpha << drained << '\n';
    return sum != 1001000 || !drained;
}
```

<div data-cpp-example="condition-queue">
<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>
</div>

<!-- END-EXAMPLE:condition-queue -->

The predicate is checked under the mutex. Waiting releases that mutex and blocks; returning from the wait reacquires it. The predicate overload rechecks after wakeup, including spurious wakeups. A notification is permission to try again, not a reservation of a slot. These semantics are specified in the [C++ condition-variable requirements](https://eel.is/c++draft/thread.condition.condvar).

The consumer notifies after each successful removal when producers are waiting. Only notifying on a full-to-not-full transition can strand additional waiters: the consumer could remove multiple items before the first woken producer runs, leaving free slots without enough notifications. The waiter count and queue state are protected by the same mutex.

Why doesn't the consumer sleep on an empty queue? In fan-in it has several queues to inspect. Sleeping on one producer's empty queue could prevent it from draining another producer's full queue. A consumer sleep protocol for the entire fan-in set needs additional coordination; it is not implemented here.

This small example assumes all producers finish normally and the consumer knows the total count. It has no close/cancellation protocol, and its sum check is simpler than the benchmark's per-producer sequence and payload checks. A production queue needs a clear shutdown path so blocked producers can be released if the consumer stops.

## What happened in the VM

These are medians in millions of validated messages per second. Each topology pair has equal aggregate capacity and equal work; each condition has 30 shuffled observations.

| Strategy | 4 producers: fan-in | 4 producers: shared | 8 producers: fan-in | 8 producers: shared |
|---|---:|---:|---:|---:|
| Mutex | 1.351 | 1.322 | 0.625 | 0.852 |
| Spinlock | 0.868 | 1.318 | 0.238 | 0.845 |
| Producer condition variable | 0.308 | 0.070 | 0.165 | 0.080 |

The SPSC spinlock arrangement was particularly poor at eight producers. That is consistent with sensitivity to scheduling and contention, but it does not by itself prove lock-holder preemption caused the entire difference. We did not obtain a scheduler trace. Four versus eight producers also changes the workload and total buffering.

The condition-variable numbers are throughput results for tiny buffers driven continuously toward full. They do not establish that parking producers is a bad policy for an application with long idle periods, expensive work between messages, or a CPU budget. The consumer remains runnable in these variants, so they are not measurements of a fully sleeping pipeline either.

## Keep the consumer away from producers

The primary pinned experiment placed the consumer on guest CPU 0. Four producers used CPUs 1–4. Eight producers were distributed over CPUs 1–7, leaving one producer pair sharing a CPU. The controller moved to CPU 8 and blocked during the run. The guest exposed nine vCPUs but had an eight-CPU quota.

This prevents a producer from directly taking the consumer's assigned guest CPU. It does not remove contention among producers, other runnable tasks, interrupts, or the hypervisor. Nor does it demonstrate that guest CPU 0 occupies a separate physical core from every producer.

Aligned SPSC throughput with this pinning divided by its unpinned counterpart was **1.101×** at four producers and **1.125×** at eight. The paired-round 95% intervals were **1.012–1.337×** and **1.048–1.176×**. These are observed affinity comparisons. They are not measurements of kernel isolation.

No `isolcpus`, tick suppression, RCU callback offload, or IRQ routing changes were applied here: the controls were unavailable. A future dedicated-host experiment can reserve housekeeping CPUs and move eligible background work away, following the [kernel's OS-jitter guidance](https://docs.kernel.org/admin-guide/kernel-per-CPU-kthreads.html). RCU remains enabled; offloading callbacks is the relevant control. Device IRQ routing is also different from disabling every interrupt.

I would choose a waiting strategy together with CPU placement, expected idle time, and the progress requirements of the application. A spinlock is a dependency on another thread running soon.
