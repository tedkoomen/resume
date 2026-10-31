# Harness and testing critique (2026-10-30)

What was wrong with the first round of benchmarks, and what changed. Data
collected before these fixes is kept in `data/spsc`, `data/mpsc_*`,
`data/*_mutex`, `data/*_spin` and rendered by `analysis/make_charts_v1.py`; the
current results are in `data/v2` and `charts/REPORT.md`.

## Fixed

| # | Problem | Why it mattered | Fix |
|---|---|---|---|
| 1 | 8 busy-spinning producers on 3 CPUs, always | Results measured scheduler time slices and lock-holder preemption as much as the queues (e.g. spinlock SPSC at ~300 msg/s) | Producer count is a runtime argument; every variant runs at 8 (oversubscribed, the original setup) **and** 3 (one producer per CPU). The harness prints `OVERSUBSCRIBED` when it applies |
| 2 | Variants ran as sequential batches | Machine drift landed on whichever batch ran during it: a same-session rerun of the no-pause MPSC build differed by 6%, about half the claimed +11% backoff gain. Some batches overlapped with compiles and installs | `analysis/run_bench.py` interleaves: each round runs every cell once in a fresh shuffled order |
| 3 | Clock started before threads had pinned and reached the start line; end time included thread teardown | Inflated time, mostly for short runs (the lock variants) | Ready barrier: all threads pin, then check in before the clock starts; the consumer stamps the end time when it receives the last message |
| 4 | Payload was one `uint64_t` | An 8-byte store cannot tear on x86, so a missing release/acquire would almost never corrupt a message: validation could not catch publication bugs | `PAYLOAD_WORDS=N`: words 1..N-1 are derived from word 0 and checked by the consumer. Tests use 4 words |
| 5 | Results scraped from human-readable output with awk; exit codes ignored; pin failure only a warning | A crashed run silently became a missing row; an unpinned run looked like a pinned one | The harness prints a `csv,` line per run; the runner checks exit code, row count and the pass flag, and exits non-zero on any failure. Failing to pin is fatal |
| 6 | No statistics on comparisons | "Alignment is within noise" and "backoff +11%" were eyeballed | `make_charts.py` reports every key comparison as a median ratio with a bootstrap 95% CI |
| 7 | Two near-duplicate harnesses (SPSC, MPSC) | Easy for them to drift apart | One harness, `fanin_test.cpp`; `QUEUE_IMPL` and `QUEUE_SHARED` select the queue |
| 8 | No reproducible build or test target; TSan checks were ad hoc, one capacity, one producer count | Hard to reproduce; edge cases untested | `Makefile` (`make`, `make test`, `make bench`, `make charts`). `tests/run_tests.sh`: TSan and ASan+UBSan, every implementation x topology x backoff mode, minimum and default capacity, 1- and 4-word payloads, 1/3/8 producers (180 runs). A mutation check (relaxed publish in `SpscQueue::push`) is caught by TSan |
| 9 | The mutex queue was only tested as a busy-polled try-lock | Not how a mutex queue is written in practice, so it understated mutexes | Added `BlockingQueue` (mutex + condition_variable; producers sleep while full) as `QUEUE_IMPL=3` |
| 10 | Profiled binaries were separate builds from the benchmarked ones | Profiles might not reflect what was measured | All benchmark binaries keep frame pointers and debug info; flamegraphs and cachegrind use the same `build/v2` binaries |
| 11 | Pinning was compared against a different (older) harness and session | Confounded | `cpu=-1` disables pinning; "unpinned" is a variant in the same interleaved runs |
| 12 | `make` silently used g++ although all earlier data was clang++ | Builds not comparable | Makefile defaults to clang++ unless CXX is given explicitly |
| 13 | Nothing detected a slowed-down machine | The first interleaved session ran 2.5x slower for its first 18 of 30 rounds (every variant), then recovered. The hypervisor reported no steal time, so the cause (most likely a noisy neighbour on the host) was invisible from inside the guest | `canary.cpp` times a fixed compute loop on every CPU before and after each run, and the runner records the steal-time delta. `make_charts.py` excludes runs whose canary was >15% slower than the machine's fast state and plots machine speed over the session (chart 13). The disturbed session is kept as `data/v2/runs_session1_no_canary.csv` |
| 14 | Run sizes were extrapolated from one tiny calibration probe | Oversubscribed spinlock runs look fast while they fit in one scheduler time slice; one extrapolated run hit the 600 s timeout | Calibration grows the message count 4x at a time until a probe lasts at least 0.3 s |
| 15 | The profiling script failed silently | Python's csv module writes CRLF; the shell's arithmetic on `"1724478\r"` failed, and no cachegrind or variant flamegraphs were produced, with exit code 0 | CSVs are written with `\n`; the script strips `\r` and fails if any expected output is missing |

## Bugs the new tests found

- **`MpscQueue` with capacity 1 is broken.** With one slot, "full with position
  p" (seq = p + 1) and "free for position p + 1" (seq = p + 1) are the same
  value, so a second producer overwrites a value the consumer has not read: TSan
  reports a race and the consumer hangs waiting for the lost message. Capacity
  is now constrained to >= 2 at compile time.
- **`BlockingQueue` lost-wakeup** (caught in review before it shipped): notifying
  only on the full -> not-full transition can leave a producer asleep with free
  space once the other producers have finished. It now notifies whenever a
  producer is waiting.

## Not fixed (limitations of this environment)

- **No isolated CPUs.** The VM's 4 vCPUs are shared with the OS and the
  hypervisor; `isolcpus`/`nohz_full` would need a reboot. Interleaving spreads
  this noise but cannot remove it.
- **No hardware performance counters** (no PMU in the guest), so there are no
  cache-miss, HITM or `perf c2c` measurements of real cross-core traffic.
  Valgrind serializes threads and cannot model coherence traffic.
- **Throughput only, no latency.** Per-message latency (timestamping each
  message with rdtsc) would be a different benchmark.
- **The lock-contention microbenchmark's lock cost is a difference of two
  timings**, so it is only meaningful when the lock is a noticeable fraction of
  the loop; at low contention the futex count is the meaningful metric.
