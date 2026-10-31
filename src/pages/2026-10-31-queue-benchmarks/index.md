---
path: '/blog/engineering/queue-benchmarks'
date: '2026-10-31T12:00:00Z'
title: 'Benchmarking Queues Without Giving One Side a Head Start'
author: 'Ted Koomen'
description: 'The reproducible SPSC fan-in versus MPSC experiment: matched capacity, validated messages, shuffled trials, uncertainty, and VM profiling limits.'
posttype: 'engineering'
hideRelatedLinks: true
tag: ['cpp', 'benchmarks', 'concurrency', 'linux', 'performance']
image: '../../images/social-queue-benchmarks.png'
featuredImage: '../../images/social-queue-benchmarks.png'
featured: true
snippet: '1,080 capacity-matched runs, longer confirmations, and the limits of what this VM can tell us.'
takeaways:
  - 'A fair topology comparison matches total slots, payloads, and messages within each pair.'
  - 'SPSC fan-in was faster for this balanced atomic workload; semantics still differ.'
  - 'Throughput, latency, hardware counters, and isolation effects require different evidence.'
---

The primary result is straightforward: **SPSC fan-in delivered more messages per second than the shared atomic MPSC queue in this balanced workload**, even after giving MPSC equal total capacity and the best tested backoff policy. The harder part is describing exactly which workload that sentence covers.

This experiment compares queue topology, padding and retry behavior, and waiting strategies under the scheduler. Every chart comes from the committed VM data.

## Define the comparison before collecting numbers

| Control | Primary experiment |
|---|---|
| Workload | Multiple producers continuously send to one consumer |
| Payload | One 64-bit word encoding producer and sequence |
| Capacity at 4 producers | Four 8-slot SPSC queues versus one 32-slot shared queue |
| Capacity at 8 producers | Eight 8-slot SPSC queues versus one 64-slot shared queue |
| Work per producer | 100,000 messages for atomic variants; 10,000 for protected variants |
| Repetitions | 30 shuffled rounds per condition |
| Compiler | GCC 13.3, C++20, `-O3 -g -fno-omit-frame-pointer -Wall -Wextra -Werror -pthread` |
| Timing | Start gate to the final validated message; creation, pinning, and teardown excluded |
| Consumer placement | Guest CPU 0, separate from producer CPU assignments |

There are 18 variants at each of two producer counts: **1,080 primary runs**. The 18 include layout changes, an unpinned SPSC comparison, and instrumented retry-count variants. The latter are diagnostics, not substitutes for uninstrumented throughput rankings.

All topology pairs match payload size and messages per producer within the same synchronization family. Atomic and protected runs have different batch sizes, so their relative numbers also include different run lengths. This is a bounded, bursty saturation test with tiny buffers, not a simulation of exchange feed arrivals.

## A timer is part of the harness

This standalone example shows a smaller version of the measurement structure: construct the queue, start two workers, release a barrier, validate a fixed number of messages, and stop the clock in the consumer. It reports seven runs and their median. The queue is a small SPSC ring with eight usable slots and acquire/release handoffs.

Compile with `g++ -std=c++20 -O2 -pthread measured-handoff.cpp -o measured-handoff`, or run below. **Compiler Explorer output is a demonstration of the harness, not a reproduction of the VM chart.** It has one producer, no affinity controls, yielding waits, and a different compiler environment.

<!-- EXAMPLE:measured-handoff -->

```cpp
#include <algorithm>
#include <barrier>
#include <chrono>
#include <vector>
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
    using Clock = std::chrono::steady_clock;
    constexpr std::uint64_t count = 100000;
    std::vector<double> rates;
    for (int round = 0; round < 7; ++round) {
        Ring queue;
        std::barrier start(3);
        Clock::time_point begin, end;
        std::uint64_t errors = 0;
        std::thread producer([&] {
            start.arrive_and_wait();
            for (std::uint64_t i = 0; i < count; ++i)
                while (!queue.push(i)) std::this_thread::yield();
        });
        std::thread consumer([&] {
            start.arrive_and_wait();
            for (std::uint64_t expected = 0; expected < count; ++expected) {
                std::uint64_t value;
                while (!queue.pop(value)) std::this_thread::yield();
                errors += value != expected;
            }
            end = Clock::now();
        });
        begin = Clock::now();
        start.arrive_and_wait();
        producer.join();
        consumer.join();
        std::uint64_t extra;
        if (errors || queue.pop(extra)) {
            std::cerr << "Validation failed\n";
            return 1;
        }
        const double seconds = std::chrono::duration<double>(end - begin).count();
        rates.push_back(count / seconds);
    }
    std::sort(rates.begin(), rates.end());
    std::cout << "Validated rounds: " << rates.size()
              << "\nMedian messages/s: " << rates[rates.size() / 2] << '\n';
}
```

<div data-cpp-example="measured-handoff">
<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>
</div>

<!-- END-EXAMPLE:measured-handoff -->

There is still start-gate overhead inside the measured interval. Thread creation is outside it. The consumer records the finish before teardown, and its sequence validation remains inside the timed work. The main thread reads its output only after joining it.

This small example has no independent steady-state warmup. Neither does the primary experiment. Some primary batches were short: median elapsed time was roughly 27 ms for four-producer SPSC and 42 ms for the corresponding MPSC backoff condition. That motivated a separate longer-run confirmation.

## Check the messages, not just the counter

The full harness checks producer identity, per-producer sequence, payload contents, expected delivery count, and final drain state. A run that drops or duplicates work cannot quietly earn a higher throughput score. All 1,080 primary runs passed those checks.

Correctness testing also produced 90 passing ThreadSanitizer cases and 90 passing ASan/UBSan cases. A deliberately relaxed SPSC publication mutation triggered a TSan data race, as intended. Three affinity regression checks passed. LeakSanitizer could not inspect threads in this execution environment, so leak detection was disabled there; leak checking is not claimed.

These tests provide evidence, not a proof of correctness for arbitrary payloads, counter lifetimes, shutdown sequences, or architectures. The [code review](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/REVIEW.md) records the assumptions, including the MPSC progress limitation after reservation.

## The throughput results

Median millions of delivered messages per second, from 30 observations per condition:

| Queue strategy | 4 producers / 32 total slots | 8 producers / 64 total slots |
|---|---:|---:|
| Atomic SPSC fan-in | 14.731 | 15.781 |
| Atomic MPSC, immediate retry | 7.029 | 4.318 |
| Atomic MPSC, one pause | 5.955 | 3.588 |
| Atomic MPSC, exponential backoff | 9.435 | 4.765 |
| Mutex SPSC fan-in | 1.351 | 0.625 |
| Mutex MPSC | 1.322 | 0.852 |
| Spinlock SPSC fan-in | 0.868 | 0.238 |
| Spinlock MPSC | 1.318 | 0.845 |
| Producer-condition-variable SPSC fan-in | 0.308 | 0.165 |
| Producer-condition-variable MPSC | 0.070 | 0.080 |

![Comparison of atomic and protected queue throughput for the four- and eight-producer configurations.](/benchmarks/queues/07_lockfree_vs_locks.png)

Historical plot labels use “lockfree” for the atomic family. The MPSC implementation is mutex-free but does not have a formal lock-free progress guarantee. The condition-variable variants park producers when full; their consumer still polls.

For MPSC with exponential backoff divided by SPSC, the four-producer ratio was **0.641×**, with a 95% interval of **0.563–0.692×**. At eight producers it was **0.302×**, interval **0.286–0.336×**. These use a paired-round bootstrap of the ratio of medians, with 10,000 resamples. They quantify within-session variation. They do not capture every source of bias, give cross-machine guarantees, or correct for the exploratory comparison of many variants.

The longer confirmation sent one million messages per producer for four atomic strategies at both producer counts, over ten shuffled rounds: 80 validated runs. SPSC and MPSC backoff medians were **14.527 versus 8.992 M msg/s** at four producers, and **15.665 versus 5.844 M msg/s** at eight. The ordering persisted; the exact ratios changed. That is a useful reason to publish batch sizes alongside headline numbers.

## What makes this comparison fair, and what still differs?

Matching total slots removes one obvious advantage. Matching messages and validation within each pair removes another. Separating consumer and producer CPU assignments avoids having a producer directly timeshare the consumer's assigned vCPU in pinned conditions.

The semantics still differ. Fan-in partitions capacity and preserves each producer's order. The shared queue pools capacity and follows reservation order. Neither is automatically the correct ordering for market data. A skewed producer distribution, larger payload, different consumer polling policy, or explicit batching could change the result. Equal slots are also not equal allocated bytes.

The eight-producer condition shares one of the seven producer CPUs. The four-producer condition does not. Moving from four to eight also doubles total slots. Therefore that comparison is not an isolated test of oversubscription or a clean scaling curve with every other parameter held fixed.

There is no message-latency distribution here. Dividing one second by throughput gives an average delivery spacing, not each message's residence time or p99 latency. A low latency pipeline needs a separate arrival model and latency measurement plan, including what happens when input outruns processing.

## Keep the inconvenient observations

The guest reports an Intel Xeon Platinum 8573C identity, nine vCPUs, and one NUMA node, but its cgroup has an eight-CPU quota. Guest topology does not establish physical host core ownership.

In 149 of the 1,080 primary observation windows, the containing cgroup's throttling counter increased. The window includes canary and controller activity, and the cgroup can contain other tasks. That signal cannot be assigned exclusively to the queue's measured interval. All observations remain in the results; no favorable subset replaces the primary data.

I also reran the original 18-variant matrix with three and eight producers, on the original restricted worker CPU set. Those 1,080 legacy runs are separate. The three-producer legacy capacities are unequal, its calibration target was shortened from 1.5 to 0.2 seconds, and an oversubscribed spinlock calibration timeout required a minimum-size cap for that cell. The old study used another VM and compiler. Differences across those studies cannot be called an improvement caused by CPU pinning.

## What profiling could and could not tell us

| Evidence | Status in this environment |
|---|---|
| Hardware cycles, instructions, cache and branch events | Unsupported; no guest CPU PMU exposed |
| Software task-clock and page faults | Collected using permitted user-only requests |
| Context switches | Collected from process resource usage via `wait4` |
| User-only perf context-switch and migration fields | Returned misleading zeros; not interpreted |
| Futex tracing and fresh sampled flamegraphs | Blocked by tracing/permission limitations |
| Cachegrind | Eight completed simulations; two spinlock cases timed out |
| CPU affinity | Applied and checked |
| Kernel isolation / RCU callback offload / IRQ routing | Not changed; improvement unmeasured |

Cachegrind numbers are simulated and include startup work; they do not measure inter-core cache coherence. A missing hardware event is not zero hardware activity. [Linux perf permissions](https://www.kernel.org/doc/html/latest/admin-guide/perf-security.html) and an exposed PMU are separate requirements. I kept failed probes and raw output with the data so that these distinctions are inspectable.

## Reproduce the study and its charts

The project requires Linux x86-64, a compatible C++20 compiler, make, Python, NumPy, Matplotlib, `taskset`, and `timeout`. Profiling additionally needs the relevant perf/Valgrind tools and permissions. Inspect the [README](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/README.md) and CPU mappings before a full collection: the saved runner assumes IDs 0–8 and the original cgroup interfaces. It writes new files under `data/v3`, so use a fresh checkout if you want to preserve the supplied observations unchanged.

```bash
git clone https://github.com/tedkoomen/resume.git
cd resume/benchmarks/spsc-vs-mpsc
make -j4 fair-build
make test
python3 tests/test_affinity.py
bash tests/mutation_check.sh
python3 analysis/probe_environment.py
# Run collection sequentially, without builds or profilers alongside it.
python3 analysis/run_vm.py fair 30
python3 analysis/run_long_confirmation.py
python3 analysis/make_vm_charts.py
python3 analysis/render_report.py
```

On the original execution environment, `make test` needed `ASAN_OPTIONS=detect_leaks=0` because LeakSanitizer could not inspect threads. Keep leak detection enabled where supported. The runner also checks its software-counter requests; a machine that denies them needs that limitation addressed explicitly, not silently converted into zero counts.

To regenerate the published figures from the **committed** measurements without collecting anything, run only the last two Python commands in a fresh checkout. The [full report](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/charts/v3/REPORT.md), [per-variant summary](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/charts/v3/summary.csv), and [raw primary observations](https://github.com/tedkoomen/resume/blob/master/benchmarks/spsc-vs-mpsc/data/v3/fair_runs.csv) accompany all 15 figures. Profiling and the legacy rerun have separate commands in the README.

The next part of this series needs new evidence: a host with usable PMU counters and control over CPU isolation, callback placement, and eligible interrupts. After that, the same queue code can become a boundary in a market-data pipeline, where sequencing, gap recovery, order-book ownership, and end-to-end latency are measured explicitly. These queue results give us a reproducible starting point. They do not yet measure a trading system.
