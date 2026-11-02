# SPSC versus MPSC queue experiments

This directory is a standalone C++20 benchmark project. It is outside the site's `src/`, `static/`, Gatsby source paths and npm build scripts. Nothing here is compiled into the website.

The companion article, [SPSC vs MPSC queues in C++20](https://www.tedkoomen.com/blog/engineering/queue-types-and-topology/), explains the ownership protocols, runnable examples, and tradeoffs behind these measurements.

- [New VM results and charts](charts/v3/REPORT.md)
- [New raw data](data/v3/)
- [Archived original report](charts/REPORT.md), [original source](historical/source/) and [original v2 data](data/v2/)

The primary comparison matches **aggregate capacity**: four 8-slot SPSC queues versus one 32-slot MPSC queue, or eight 8-slot SPSC queues versus one 64-slot MPSC queue. The original 3/8-producer matrix is reproduced separately. The consumer is pinned away from all producer threads in pinned runs.

The names `lockfree_*` are retained for compatibility. The shared queue is mutex-free but lacks a formal lock-free progress guarantee if a producer stalls after reserving a slot.

## Build and run

Requirements: Linux x86-64, GCC 13 or a compatible C++20 compiler, make, Python 3, NumPy, Matplotlib, and GNU timeout/taskset. Optional profiling needs perf, Valgrind, and Perl. The saved experiment uses CPU IDs 0–8; adjust the runner mappings for another host. CPU 8 is the controller CPU; the primary worker set is 0–7. Software perf permissions are checked, and unsupported requests fail rather than inventing counts.

```sh
make -j4 fair-build
make test
python3 tests/test_affinity.py
bash tests/mutation_check.sh
python3 analysis/probe_environment.py
python3 analysis/run_vm.py fair 30
python3 analysis/run_vm.py legacy 30
python3 analysis/run_long_confirmation.py
python3 analysis/collect_vm_profiles.py sweep
python3 analysis/collect_vm_profiles.py cachegrind
python3 analysis/collect_vm_profiles.py profiles
python3 analysis/render_flamegraphs.py
python3 analysis/make_vm_charts.py
python3 analysis/render_report.py
```

On this execution environment only, the sanitizer run requires `ASAN_OPTIONS=detect_leaks=0 make test`, because LeakSanitizer cannot inspect threads. ASan memory checking, UBSan and TSan remain enabled. To repeat already-built tests with explicit JSON results: `ASAN_OPTIONS=detect_leaks=0 python3 tests/run_existing_sanitizers.py`.

Run throughput collection sequentially, with no builds, sanitizer runs or profiling in parallel. Native throughput is never taken from Valgrind, strace or sampled-profile runs. All primary observations remain in the analysis. New charts do not mix historical data into current measurements.

`analysis/collect_vm_profiles.py` accepts a local tool installation root through `BENCH_TOOLS`; the checked-in artifacts record what worked in this VM. Machine-specific tool packages and compiled executables are not committed. Read the profiling limitations before interpreting simulated caches or user-only samples.

Historical scripts under `historical/source/` preserve the prior experiment. The old `analysis/run_bench.py` and `analysis/make_charts.py` are retained for provenance; the v3 Makefile uses the new VM runner and renderer.

## Harness options

`./fanin [messages_per_producer=1000000] [runs=3] [consumer_cpu=0] [producers=8]`
prints a summary and a CSV row per run. Use CPU `-1` to disable pinning.

- `QUEUE_IMPL`: 0 selects the atomic queues, 1 a mutex, 2 a spinlock, and 3 a mutex with producers waiting on a condition variable.
- `QUEUE_SHARED`: 0 gives each producer its own queue; 1 shares a queue.
- `QUEUE_CAPACITY`: defaults to 8 per SPSC queue or 64 for shared MPSC. Override it to match aggregate capacity for other producer counts.
- `PAYLOAD_WORDS`: word zero encodes producer ID and sequence; remaining words are derived from it. The consumer checks every word, per-producer ordering, counts, and the final drained state.
- `MPSC_BACKOFF`: 0 retries immediately, 1 issues one PAUSE, and 2 uses exponential PAUSE up to `MPSC_MAX_BACKOFF` (default 16). `MPSC_STATS` enables thread-local contention counts.
- `SPSC_CACHE_LINE` and `MPSC_CACHE_LINE`: default to 64; use 8 for packed-layout experiments.

The harness retries without yielding and takes at most one message from each queue per polling pass. Pinned runs allocate on the consumer's NUMA node and distribute producers over other allowed CPUs on that node. `BENCH_CONTROL_CPU` can move the controller away from workers. A start barrier excludes thread startup; the consumer timestamps receipt of the final message.

`./lock_contention <mutex|spin> <threads> <think_iters> <ops_per_thread>` compares protected counter updates with a private-work baseline. The elapsed-minus-baseline result includes contention and scheduling effects; it is not an isolated lock instruction latency. Count futex calls separately with `perf stat -e syscalls:sys_enter_futex ./lock_contention ...` when permitted.

`./canary [iters=2000000]` runs a dependent multiply chain on each allowed CPU. It reports the slowest and fastest CPUs' best-of-five nanoseconds per iteration to help identify sustained machine slowdowns.
