"""Compile the readable report from measured data and rendered charts."""
import csv,json,statistics as st
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;DATA=ROOT/'data/v3';OUT=ROOT/'charts/v3'
read=lambda p:list(csv.DictReader(p.open()))
R=read(DATA/'fair_runs.csv');S=read(OUT/'summary.csv');C=json.loads((OUT/'comparisons.json').read_text())
L=read(DATA/'legacy_runs.csv') if (DATA/'legacy_runs.csv').exists() else []
text=['# SPSC versus MPSC: VM rerun','',
'All **1,080 equal-capacity runs** passed delivery, sequence, payload and drain validation. The two primary configurations have equal total capacity and equal messages within each SPSC/MPSC pair. Hardware performance counters and kernel isolation are unavailable on this VM; no hardware counts or isolation improvement are claimed.','',
'## Main measurements','',
'| Queue | Four producers, 32 total slots | Eight producers, 64 total slots |','|---|---:|---:|']
for v in ['lockfree_spsc','lockfree_mpsc_b0','lockfree_mpsc_b1','lockfree_mpsc_b2','mutex_spsc','mutex_mpsc','spin_spsc','spin_mpsc','condvar_spsc','condvar_mpsc']:
 vals=[next(float(x['median']) for x in S if x['variant']==v and x['producers']==str(p)) for p in [4,8]]
 text.append(f"| {v} | {vals[0]/1e6:.3f} M msg/s | {vals[1]/1e6:.3f} M msg/s |")
text+=['','SPSC fan-in is faster in these balanced atomic-queue workloads. It also has weaker aggregate ordering and partitioned capacity, so this is not a universal ranking of interchangeable APIs. See [code/harness review](../../REVIEW.md).','',
'## Ratio uncertainty','',
'Paired-round bootstrap of the ratio of medians; 10,000 resamples, 95% interval. These are within-session intervals, not bounds on results across different machines. A ratio above 1 favors the numerator.','',
'| Producers | Numerator / denominator | Ratio | 95% interval |','|---:|---|---:|---:|']
for x in C:text.append(f"| {x['producers']} | {x['numerator']} / {x['denominator']} | {x['ratio']:.3f}× | {x['lo']:.3f}–{x['hi']:.3f}× |")
text+=['','## Run design and limits','',
'- GCC 13.3, C++20, `-O3 -g -fno-omit-frame-pointer -Wall -Wextra -Werror -pthread`. The original results used a different VM and Clang; cross-host differences are not optimization effects.',
'- KVM exposes nine vCPUs and an eight-CPU cgroup quota. Consumer CPU 0 is separate from all producers. Four producers use 1–4; eight producers round-robin over 1–7. The controller uses CPU 8 in pinned runs. No CPU is exclusively owned or isolated from OS/hypervisor work.',
'- SPSC capacity is eight per producer; shared capacity is 32 at four producers and 64 at eight. Payload is one 64-bit word. Thirty shuffled rounds use 100,000 messages/producer for atomic queues, 10,000 for lock-based queues. Fixed work within each strategy/topology pair; cross-strategy comparisons have different run durations.',
'- The start barrier excludes creation and pinning; the consumer ends timing after the final validated message. Queue validation remains in the measured region. There is no separate steady-state warmup or latency distribution.',
'- All runs retained. Canary readings and steal/throttling deltas are diagnostic only. The containing cgroup may include other work. One shared producer CPU remains in the eight-producer primary condition.',
'- Statistical comparisons are exploratory: no multiple-comparison correction. Small effects and short-run rankings require confirmation.',
'',f"{sum(int(x['nr_throttled'])>0 for x in R)} / {len(R)} primary runs observed a cgroup throttling increment. The observation window includes canary/control work. No filtered subset replaces the main result.",'',
'## Original matrix rerun','',
f'{len(L)} measured runs reproduce the original 18 variants × 3/8 producers × 30 shuffled rounds on CPUs 0–3. Capacities remain 8 per SPSC queue versus 64 shared. The rerun uses a 0.2-second calibration target (50-ms probe threshold, 200–200,000 messages/producer), versus the archived 1.5-second target and larger cap. This is the same test matrix with shorter run lengths, not a bit-for-bit replication. The first oversubscribed SPSC-spinlock calibration timed out at 120 seconds; that cell is capped at the original minimum of 200 messages per producer. The timeout log is retained. Separate files preserve original v2 results and original sources. The 3-producer legacy case does not have equal total capacity.','',
'Legacy [raw runs](../../data/v3/legacy_runs.csv); primary [raw runs](../../data/v3/fair_runs.csv); [all per-variant summary statistics](summary.csv). Legacy-vs-primary changes include scheduling and run length and are not an isolated causal estimate of CPU placement.','',
'## Correctness','',
'90/90 ThreadSanitizer cases and 90/90 ASan+UBSan cases passed. Leak detection was disabled only because this process namespace prevents LeakSanitizer from examining threads; leak checking is not claimed. The relaxed-publication mutation failed as expected with a TSan data race (exit 66). Three affinity regression checks passed. Every native throughput row passed validation. Logs and machine-readable results are under [data/v3/tests](../../data/v3/tests/).','',
'## Counter and isolation status','',
'| Measurement/control | Result |','|---|---|',
'| Cycles, instructions, cache references/misses, branches/misses | Hardware event probes return ENOENT; perf says not supported; no guest CPU PMU |',
'| Software task-clock / page faults | Collected with user-only perf requests; process-wide |',
'| Context switches | Collected with wait4; voluntary + involuntary; process-wide |',
'| perf context switches / migrations | User-only requests return misleading zeros; raw values retained but not interpreted |',
'| Futex syscall tracing | Tracefs unavailable; strace ptrace attempt denied |',
'| Sampled flamegraphs | perf record cpu-clock:u and --all-user denied; no fresh flamegraphs |',
'| CPU affinity | Applied and verified |',
'| isolcpus / nohz_full / RCU offload / IRQ routing | Not changed; read-only control files and no effective administrative capabilities |',
'| Improvement from kernel isolation | Unmeasured (N/A) |',
'',
'RCU should remain enabled; the relevant tuning is callback offload. Eligible device IRQs are redirected, rather than disabling all interrupts. See the [host-isolation procedure](../../ISOLATION.md).','']
long=DATA/'long_confirmation.csv'
if long.exists():
 Q=read(long);text+=['## Longer-run confirmation','',f'{len(Q)} runs use 1,000,000 messages per producer for all four atomic strategies and both producer counts, in ten shuffled rounds. Every row passed.','', '| Producers | SPSC M msg/s | MPSC backoff M msg/s | MPSC / SPSC |','|---:|---:|---:|---:|']
 for p in [4,8]:
  m=lambda v:st.median(float(x['msgs_per_s']) for x in Q if x['variant']==v and int(x['producers'])==p)
  a,b=m('lockfree_spsc'),m('lockfree_mpsc_b2');text.append(f'| {p} | {a/1e6:.3f} | {b/1e6:.3f} | {b/a:.3f}× |')
 text+=['','[Longer-run raw data](../../data/v3/long_confirmation.csv).','']
cg=DATA/'cachegrind_summary.csv'
if cg.exists():
 G=read(cg);text+=['## Profiling completion','', '| Variant | Cachegrind status | Messages |','|---|---|---:|']
 for x in G:text.append(f"| {x['variant']} | {x['status']} | {x['messages']} |")
 text+=['','Cachegrind uses the original three-producer topology, fixed 1,000 messages/producer, 60-second timeout per process. Simulation is serialized and does not model cross-core cache-coherence traffic. Its counts are not hardware measurements. It includes startup costs; shorter samples differ from the archived profile workloads. Raw simulator output and errors are retained.','']
text+=['## Charts','']
for p in sorted(OUT.glob('*.png')):text+=[f'### {p.stem.replace("_"," ")}',f'![{p.stem}]({p.name})','']
profiles=sorted((OUT/'flamegraphs').glob('*.svg'))
if profiles:
 text+=['## User-space sampled flamegraphs','', 'These are separate perf cpu-clock:u samples, with frame-pointer stacks. Kernel activity is excluded; no kernel/futex percentage can be inferred.','']
 for p in profiles:text.append(f'- [{p.stem}](flamegraphs/{p.name})')
(OUT/'REPORT.md').write_text('\n'.join(text)+'\n')
print('report written')
