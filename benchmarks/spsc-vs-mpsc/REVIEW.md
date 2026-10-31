# Code and harness review

The implementations are reasonable bounded-queue experiments. Correctness is checked during every throughput run: producer identity, per-producer sequence, payload integrity, delivery count, and draining. The consumer performs validation inside the measured region, so these numbers measure this validated fan-in workload rather than just the queue primitive.

## Fair comparison

| Scenario | Producers | SPSC capacity | Shared MPSC capacity | CPU placement |
|---|---:|---:|---:|---|
| Original topology rerun | 3 | 3 × 8 = 24 | 64 | Consumer 0; producers 1–3 |
| Original topology rerun | 8 | 8 × 8 = 64 | 64 | Consumer 0; producers round-robin 1–3 |
| Equal-capacity primary | 4 | 4 × 8 = 32 | 32 | Consumer 0; producers 1–4 |
| Equal-capacity primary | 8 | 8 × 8 = 64 | 64 | Consumer 0; producers round-robin 1–7 |

A shared queue should be bigger than each individual SPSC queue. Equal **aggregate** capacity is the controlled baseline. With three producers, 24 is not a power of two, which these ring buffers require; four producers allow an exact comparison without changing the indexing algorithm. The historical three-producer case remains as a separately labeled legacy experiment.

In the primary experiment each atomic variant sends 100,000 eight-byte messages per producer, and each lock-based variant sends 10,000. Thus every SPSC/MPSC pair for the same synchronization strategy has identical work. Shorter lock-based runs avoid pathological spinlock waits. Cross-strategy rankings involve different run lengths, so treat small differences cautiously. All variants share the validation path, polling policy, compiler, optimization flags and CPU mask. Instrumented CAS-counter builds are separate from throughput rankings. Thirty rounds shuffle every variant/count cell with a fixed seed.

Equal slots do not mean equal bytes: the aligned MPSC slots include a sequence number and cache-line padding; all queue footprints are recorded. Nor do these topologies provide identical ordering: SPSC fan-in preserves each producer's order, but offers no global FIFO; MPSC consumes in reservation order. Shared capacity can absorb one producer's burst while partitioned SPSC capacity cannot. This suite is a saturated, balanced workload, not a burst-skew or latency benchmark.

## Findings and changes

1. **The original affinity code ignored the allowed CPU mask.** It enumerated the whole NUMA node, and could choose CPUs outside a taskset allocation. It also silently placed producers on the consumer CPU if no other CPU was available. The revised helper snapshots allowed CPUs before narrowing the controller, intersects with NUMA topology, and fails if producer/consumer separation cannot be provided. Invalid CPU IDs are rejected before `CPU_SET`.
2. **The previous 3-producer comparison gave MPSC 64 slots against SPSC's 24.** Kept for historical reproduction; primary comparisons use exactly matched totals.
3. **The original 8-producer case was heavily oversubscribed.** On the old four-vCPU guest it used eight producer threads on three CPUs. The new VM exposes nine vCPUs with a cgroup budget of eight CPUs. Primary worker allocation is CPUs 0–7; with eight producers there is still one shared producer CPU. CPU 8 is used by the short-lived controller, which blocks during the timed work. This is affinity, not exclusive CPU ownership or host physical-core isolation. Guest topology cannot prove host core placement.
4. **Control-thread interference at startup.** The controller first-touches on the consumer's NUMA node, then moves to CPU 8 before releasing the barrier in pinned benchmark runs. No producer is placed on CPU 0. Unpinned controls deliberately omit this placement.
5. **MPSC is mutex-free, but not formally lock-free.** If a producer reserves the next slot and is descheduled before publishing, the consumer cannot skip it; other producers eventually fill the queue and progress stops. The historical `lockfree_*` filenames are retained, with this qualification.
6. **Generic payload restrictions are implicit.** Storage requires default construction and assignment. If a payload assignment throws after a producer reserves an MPSC slot, publication can be permanently blocked. The benchmark's trivial fixed-size message cannot throw. Production use should constrain payload operations or define recovery semantics.
7. **MPSC alignment changes several things.** It pads every slot as well as indices, altering footprint and cache layout. Aligned-vs-packed throughput cannot establish false sharing without coherence counters. The VM has no PMU, so no such causal claim is made.
8. **Queue-full, queue-empty and CAS retries are not interchangeable costs.** MPSC_STATS counts both failed CAS and already-claimed positions. Poll counters are work indicators rather than cycles or latency measurements.
9. **SPSC publication ordering is sound for the single-producer/single-consumer contract.** Release publishes the payload, acquire observes it; release/acquire on the opposite index protects slot reuse. The mutation test changing publication to relaxed triggers TSan.
10. **Software-counter access is restricted.** `perf_event_open` works for user-only software events. Context-switch and migration counts with kernel excluded returned zero even for a sleeping process. Those raw counters are retained but not interpreted. Context-switch charts use `wait4` resource usage; task-clock (requested user-only) and faults are explicitly labeled. These counters cover the whole child process, not only the harness timer.
11. **Historical filtering is not used to hide slow runs.** All primary runs remain in the charts. Canary measurements, host steal ticks and cgroup throttling deltas are recorded. Ratios use bootstrap resampling of matched shuffled rounds. They describe this VM session, not independent-host reproducibility.
12. **The lock microbenchmark uses subtraction.** Its estimate includes scheduling and baseline noise. Negative differences are not negative lock cost. It measures elapsed time per thread iteration, not aggregate lock-service time.

The queue algorithms and memory ordering are otherwise preserved. The revised SPSC header includes its own `cstddef`; MPSC comments describe the actual backoff and progress semantics.

## Correctness evidence

- 90 TSan cases: all implementations/topologies/backoff modes; minimum/default capacity; one-/four-word payloads; 1/3/8 producers.
- 90 ASan+UBSan cases: same matrix. This sandbox requires `ASAN_OPTIONS=detect_leaks=0`; LeakSanitizer cannot inspect the process namespace. Initial failure evidence is retained. Leak checking is not claimed.
- Relaxed-publication mutation: expected TSan data race, exit 66.
- Affinity regression checks: restricted mask `2,4,6` produces on `4,6` with consumer `2`; singleton mask and out-of-range CPU fail.
- Every benchmark process must exit successfully and emit exactly one passing CSV record; failures are preserved and cause a nonzero runner exit.

## Isolation and hardware counters

`data/v3/environment.json` records the evidence: KVM guest, Intel Xeon Platinum 8573C identity, nine vCPUs, one NUMA node, eight-CPU quota, no CPU PMU event source, empty isolated/nohz CPU lists, no effective Linux capabilities, and read-only sysfs / IRQ controls. Hardware event probes for cycles, instructions, cache references/misses and branches/misses returned ENOENT. This is a missing virtual PMU, not a zero hardware count.

No `isolcpus`, `nohz_full`, RCU offload or IRQ-routing setting was changed. **The improvement from kernel isolation is unmeasured.** Affinity changes, compiler differences and different hosts cannot substitute for an isolation A/B test.

For a machine you administer, reserve housekeeping CPUs and use cpusets/affinity to separate benchmark workers. Configure full-dynticks and RCU callback offload, and direct eligible device interrupts away from worker CPUs. RCU remains enabled; only its callbacks are offloaded. Some interrupts cannot be redirected. Verify observed per-CPU IRQ/softirq deltas and effective affinity, then run the same binaries, workload, CPU mapping and interleaving before/after. A full one-producer-per-CPU 8-producer test needs nine worker CPUs plus housekeeping, with a sufficient CPU quota and exposed PMU. These are a follow-up procedure, not changes performed in this session.

References: [kernel boot parameters](https://docs.kernel.org/admin-guide/kernel-parameters.html), [reducing per-CPU kernel-thread jitter](https://docs.kernel.org/admin-guide/kernel-per-CPU-kthreads.html), [IRQ affinity](https://docs.kernel.org/core-api/irq/irq-affinity.html).
