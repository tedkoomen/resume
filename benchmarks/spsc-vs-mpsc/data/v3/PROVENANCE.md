# Data provenance

- `fair_runs.csv`: 30 shuffled rounds × 18 variants × 4/8 producers; equal aggregate capacity; fixed work within synchronization families.
- `legacy_runs.csv`: original 3/8-producer matrix on worker CPUs 0–3; original capacity definitions; shorter duration calibration.
- `legacy_calibration_first_attempt.txt`: preserved 120-second oversubscribed spinlock calibration timeout. The completed rerun pins the 8-producer SPSC spinlock cell to the original 200-message minimum.
- `long_confirmation.csv`: separate longer atomic-queue runs; not pooled with the primary statistics. An audit found a missing CSV record in the first artifact; that incomplete artifact is preserved as `long_confirmation_first_attempt.csv`, and the entire confirmation matrix was recollected and completeness-checked.
- `environment.json`: read-only machine snapshot and direct hardware/software perf probes before collection.
- `perf_hardware_probe.txt`: additional check with the actual perf executable; unsupported hardware events.
- `binary_manifest.json`: SHA-256 of benchmark executables used for collection.
- `tests/`: sanitizer outputs, machine-readable results, initial LeakSanitizer environment failures and expected mutation diagnostic.
- `lock_sweep.csv`: separate lock-contention microbenchmark; never mixed into queue throughput.
- `cachegrind/`, `cachegrind_summary.csv`: simulated counts with completion status; not hardware data.
- `flamegraphs/`: separate sampled user-space stacks and their logs. Full perf binary capture files are local intermediates, not committed; text stacks/folded samples and SVGs preserve the used evidence.

`pass=1` is required for a measured throughput row. Failures are separately retained, never converted into zero throughput. An empty failure list means the corresponding measured matrix completed successfully.

Counters from `wait4` and perf cover process startup and teardown as well as the timed body. `task_clock_ns`, `page_faults`, `context_switches`, and `cpu_migrations` come from user-only perf requests. In particular, `context_switches` and `cpu_migrations` must not be interpreted as zero kernel activity: the restriction suppressed counts even in the sleep control. Use `rusage_context_switches`, `voluntary_context_switches`, and `involuntary_context_switches` for the reported process switch counts.

`nr_throttled` and `throttled_usec` are deltas for the surrounding cgroup. `steal_ticks` is a guest-wide /proc/stat delta. Neither is specific to a queue thread. Their observation window also includes the canary probes and collection overhead. `canary_before_ns` and `canary_after_ns` describe a brief compute probe on the same worker mask; they do not prove that the benchmark body was undisturbed.

The archived `data/v2` and earlier data are from the supplied archive, not recollected hardware counters. They are not included in the new charts.
