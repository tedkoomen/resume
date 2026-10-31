---
path: '/blog/engineering/cache-lines-and-pause'
date: '2026-10-31T10:00:00Z'
title: 'Cache Lines, Padding, and the Cost of Trying Again'
author: 'Ted Koomen'
description: 'What padding and x86 PAUSE change in a bounded queue, and what the measured backoff and layout comparisons actually support.'
posttype: 'engineering'
tag: ['cpp', 'concurrency', 'cache', 'performance']
image: '../../images/social-cache-pause.png'
featuredImage: '../../images/social-cache-pause.png'
featured: false
snippet: 'Padding changes where shared state lives. Backoff changes how often producers fight over it. Neither is a guaranteed speedup.'
takeaways:
  - 'Padding separates independent writers but cannot remove true sharing.'
  - 'PAUSE is a processor hint, not a scheduler yield or a memory-ordering primitive.'
  - 'Exponential backoff helped this MPSC workload; one pause per retry did not.'
---

Once the queue is correct, a tempting next step is to put `alignas(64)` on everything and add `_mm_pause()` to every loop. Both have a reasonable explanation behind them. That does not tell us whether either change helps this program.

In [the topology post](/blog/engineering/queue-types-and-topology), multiple producers either shared one MPSC queue or used separate SPSC queues feeding one consumer. Now I want to keep those arrangements visible while changing memory layout and retry behavior. A change to where data lives is different from a change to how often threads contend for it.

## A cache line contains more than your variable

Suppose one thread writes `head` and another writes `tail`. They are different atomic objects, so their updates do not conflict at the C++ object level. If both sit in the same cache line, their writes can still require coordination between cores over that line. This is false sharing: the threads need independent objects, but the coherence granularity groups them together.

Giving the two indices separate lines can remove that particular source of interference. It does not remove communication. The consumer still reads the producer's index and the producer still reads the consumer's index. If all producers CAS the same MPSC `head`, they are truly sharing one object; padding around it cannot give them independent ownership of that counter.

<div data-concept-animation="queue-cache">
  <p>Step through A writing head and B writing tail. Packed fields share a modeled 64-byte line, so alternating writers change that line's write owner. Separated fields use two lines. This illustrates independent writers only; the real queue also reads remote indices and transfers payloads.</p>
</div>

The animation is a simplified ownership model, not a trace of this VM. Real coherence states, shared reads, write buffers, and timing are omitted. It shows the reason to investigate false sharing; it does not establish that false sharing dominated our benchmark.

## Check the layout before timing it

Aligning an entire object only aligns its beginning. Two fields inside that object can still be adjacent. In the code below, each hot field in `Separate` has its own alignment requirement. On the selected x86-64 compilers, the fields are 64 bytes apart. The program prints offsets and sizes so the layout is visible.

The same program includes the bounded exponential retry loop we will discuss next. It verifies a counter result, not a performance claim. Download it and build with `g++ -std=c++20 -O2 -pthread layout-backoff.cpp -o layout-backoff` on x86-64.

<!-- EXAMPLE:layout-backoff -->

```cpp
#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <immintrin.h>
#include <iostream>
#include <thread>

struct Packed {
    std::atomic<std::uint64_t> a{0}, b{0};
};
struct Separate {
    alignas(64) std::atomic<std::uint64_t> a{0};
    alignas(64) std::atomic<std::uint64_t> b{0};
};
std::atomic<std::uint64_t> counter{0};

// All threads still contend on this ONE counter. Padding cannot fix that.
void increment() {
    auto expected = counter.load(std::memory_order_relaxed);
    unsigned pauses = 1;
    while (!counter.compare_exchange_weak(
        expected, expected + 1, std::memory_order_relaxed)) {
        for (unsigned i = 0; i < pauses; ++i) _mm_pause();
        pauses = std::min(2 * pauses, 16u);
    }
}

int main() {
    std::cout << "Packed offsets: " << offsetof(Packed, a) << ", "
              << offsetof(Packed, b) << "; bytes: " << sizeof(Packed) << '\n';
    std::cout << "Separate offsets: " << offsetof(Separate, a) << ", "
              << offsetof(Separate, b) << "; bytes: " << sizeof(Separate) << '\n';
    std::thread a([] { for (int i = 0; i < 10000; ++i) increment(); });
    std::thread b([] { for (int i = 0; i < 10000; ++i) increment(); });
    a.join();
    b.join();
    std::cout << "CAS counter: " << counter.load() << " (expected 20000)\n";
    return counter.load() != 20000;
}
```

<div data-cpp-example="layout-backoff">
<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>
</div>

<!-- END-EXAMPLE:layout-backoff -->

Sixty-four bytes is a target choice, not a portable promise about every machine. More spacing also consumes more memory. Our MPSC layout option pads **every slot** as well as the hot indices. Comparing that with the packed version changes footprint and locality alongside potential false sharing. It is not a surgical experiment on one cache line.

## What PAUSE does here

`_mm_pause()` emits the x86 spin-loop hint described by [Intel's instruction documentation](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html). It gives the processor information about a waiting loop. It does not release a lock, park the OS thread, make a payload safe to read, or promise a particular delay across processors.

The queue's memory-ordering operations still provide correctness. The pause affects the retry policy.

The MPSC experiment uses three policies after a failed reservation attempt or an observation that another producer has already claimed the position:

| Policy | Action after contention |
|---|---|
| Immediate retry, `b0` | Try again without an added pause |
| One pause, `b1` | Execute one `_mm_pause()` |
| Exponential backoff, `b2` | Execute 1, 2, 4, 8, then at most 16 pauses on successive contention events |

The backoff budget resets for a new push attempt. Full-queue waiting outside the reservation loop is a separate path. The policy does not intentionally delay every successful enqueue.

The reason to try backoff is that an unsuccessful producer may otherwise keep generating contention while another producer makes progress. Waiting a little can reduce that pressure. Waiting too long can also waste a newly available opportunity. There is no useful universal rule that one pause, or sixteen pauses, is optimal.

## One pause was slower in this experiment

The primary runs used equal aggregate capacity, a separate consumer CPU, and 30 shuffled rounds. These are median millions of messages per second:

| Shared MPSC retry policy | 4 producers, 32 slots | 8 producers, 64 slots |
|---|---:|---:|
| Immediate | 7.029 | 4.318 |
| One pause | 5.955 | 3.588 |
| Exponential, capped at 16 | 9.435 | 4.765 |

![MPSC throughput by immediate retry, one pause, and exponential backoff at four and eight producers.](/benchmarks/queues/02_mpsc_backoff_throughput.png)

Exponential backoff divided by immediate retry was **1.342×**, with a paired-round bootstrap 95% interval of **1.227–1.500×**, at four producers. At eight producers it was **1.104×**, interval **1.036–1.197×**. Those intervals describe this session, not the range of all future machines or workloads.

One pause per retry was slower than immediate retry in both primary configurations. This matters because “add pause” and “use a backoff policy” are often treated as the same optimization. The implementation and the workload both matter. The eight-producer case also shares one producer CPU and changes total capacity; its difference from the four-producer case cannot be attributed only to contention on `head`.

## Padding did not earn a speedup claim

For SPSC, the aligned version divided by the packed version was **0.878×** at four producers, with interval **0.808–1.006×**. At eight it was **0.915×**, interval **0.815–1.019×**. The point estimates favor packed storage, but both intervals include parity. This experiment does not establish an alignment benefit.

![SPSC throughput for aligned, packed, and unpinned variants. Alignment and affinity are distinct comparisons.](/benchmarks/queues/01_spsc_alignment_pinning.png)

I would not turn this into “false sharing is a myth,” either. A plausible mechanism is not a guaranteed bottleneck, and a throughput result does not identify the exact hardware cause. The next investigation would separate index layout from slot layout, vary capacity and payload size, and collect appropriate hardware events on a host that exposes them.

The current VM did not expose hardware performance counters. Cachegrind produced simulated cache statistics for several cases, but it serializes execution and does not model cross-core coherence traffic. Those counts cannot prove that this change reduced cache-line bouncing.

## Reproduce the variants

The [standalone project](https://github.com/tedkoomen/resume/tree/master/benchmarks/spsc-vs-mpsc) contains the layout switches and retry policies. On the original nine-vCPU mapping, these commands run the four-producer shared queue with equal capacity:

```bash
git clone https://github.com/tedkoomen/resume.git
cd resume/benchmarks/spsc-vs-mpsc
make -j4 fair-build
BENCH_CONTROL_CPU=8 taskset -c 0-4,8 build/fair4/fanin_lockfree_mpsc_b0 100000 3 0 4
BENCH_CONTROL_CPU=8 taskset -c 0-4,8 build/fair4/fanin_lockfree_mpsc_b1 100000 3 0 4
BENCH_CONTROL_CPU=8 taskset -c 0-4,8 build/fair4/fanin_lockfree_mpsc_b2 100000 3 0 4
```

These are quick smoke runs, not the shuffled 30-round collection. CPU IDs must exist in your allowed set and match the intended NUMA topology. The [benchmark post](/blog/engineering/queue-benchmarks) explains the runner and longer confirmation. Use the `_stats` binaries for retry counts separately: instrumentation adds work to the very path being studied.

Backoff improved the measured MPSC result, but it still depends on other threads getting CPU time. That becomes much more obvious when the waiting loop protects a lock. [Next: spinlocks and the scheduler.](/blog/engineering/spinlocks-and-the-scheduler)
