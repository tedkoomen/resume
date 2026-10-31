"""Interleaved throughput benchmark for every fan-in variant.

Each round runs every (variant, producer count) cell once, in a freshly
shuffled order, so slow drift on the machine (other tenants, thermal, the
hypervisor) spreads evenly across variants instead of landing on whichever
batch ran during it. Every run is its own process, wrapped in perf stat for
futex / context-switch / migration counts, and must exit 0 with a passing
csv line; failures are recorded and make the script exit non-zero.

Message counts are calibrated per cell so that one run takes ~TARGET_SECONDS.

Each run is bracketed by a machine-speed canary (build/v2/canary: a fixed
compute loop timed on every CPU) and the hypervisor steal-time delta, so runs
made while the host was slowing the guest down can be identified and excluded
at analysis time. A noisy neighbour on the host's sibling hyperthread slows the
guest without showing up as steal, which is why the canary exists.

Usage: .venv/bin/python analysis/run_bench.py [rounds=30] [--quick]
Writes data/v2/runs.csv and data/v2/calibration.csv.
"""

import csv
import random
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BIN = ROOT / "build" / "v2"
OUT = ROOT / "data" / "v2"

TARGET_SECONDS = 1.5
MIN_PROBE_S = 0.3
MIN_MSGS, MAX_MSGS = 200, 2_000_000
PRODUCER_COUNTS = (8, 3)  # 8 oversubscribes the 3 producer CPUs; 3 = one per CPU
TIMEOUT = 600

# key: (binary, cpu argument)
VARIANTS = {
    "lockfree_spsc_unpinned": ("fanin_lockfree_spsc", -1),
    "lockfree_spsc": ("fanin_lockfree_spsc", 0),
    "lockfree_spsc_packed": ("fanin_lockfree_spsc_packed", 0),
    "lockfree_mpsc_b0": ("fanin_lockfree_mpsc_b0", 0),
    "lockfree_mpsc_b1": ("fanin_lockfree_mpsc_b1", 0),
    "lockfree_mpsc_b2": ("fanin_lockfree_mpsc_b2", 0),
    "lockfree_mpsc_b0_packed": ("fanin_lockfree_mpsc_b0_packed", 0),
    "lockfree_mpsc_b1_packed": ("fanin_lockfree_mpsc_b1_packed", 0),
    "lockfree_mpsc_b2_packed": ("fanin_lockfree_mpsc_b2_packed", 0),
    "lockfree_mpsc_b0_stats": ("fanin_lockfree_mpsc_b0_stats", 0),
    "lockfree_mpsc_b1_stats": ("fanin_lockfree_mpsc_b1_stats", 0),
    "lockfree_mpsc_b2_stats": ("fanin_lockfree_mpsc_b2_stats", 0),
    "mutex_spsc": ("fanin_mutex_spsc", 0),
    "mutex_mpsc": ("fanin_mutex_mpsc", 0),
    "spin_spsc": ("fanin_spin_spsc", 0),
    "spin_mpsc": ("fanin_spin_mpsc", 0),
    "condvar_spsc": ("fanin_condvar_spsc", 0),
    "condvar_mpsc": ("fanin_condvar_mpsc", 0),
}

CSV_FIELDS = ["impl", "shared", "producers", "capacity", "payload_words", "backoff",
              "msgs_per_producer", "run", "elapsed_s", "msgs_per_s", "full_spins", "empty_polls",
              "cas_retries", "errors", "pass"]
PERF_EVENTS = ["syscalls:sys_enter_futex", "context-switches", "cpu-migrations"]
PERF_FIELDS = ["futex", "context_switches", "cpu_migrations"]
MACHINE_FIELDS = ["canary_before_ns", "canary_after_ns", "steal_ticks"]


def canary():
    """Slowest per-CPU ns/iteration of the canary loop."""
    out = subprocess.run([str(BIN / "canary")], capture_output=True, text=True, check=True,
                         timeout=60).stdout
    return float(out.split(",")[0])


def steal_ticks():
    with open("/proc/stat") as f:
        return int(f.readline().split()[8])


def run_once(variant, producers, msgs):
    """Run one process; return (harness csv dict + perf counts) or raise."""
    canary_before, steal_before = canary(), steal_ticks()
    binary, cpu = VARIANTS[variant]
    with tempfile.NamedTemporaryFile("r", suffix=".perf") as perf_out:
        cmd = ["perf", "stat", "-x,", "-o", perf_out.name, "-e", ",".join(PERF_EVENTS), "--",
               str(BIN / binary), str(msgs), "1", str(cpu), str(producers)]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
        perf_lines = [l for l in Path(perf_out.name).read_text().splitlines()
                      if l and not l.startswith("#")]
    rows = [l for l in proc.stdout.splitlines() if l.startswith("csv,")]
    if proc.returncode != 0 or len(rows) != 1:
        raise RuntimeError(f"{variant} p={producers}: exit {proc.returncode}, "
                           f"{len(rows)} csv lines\n{proc.stdout}\n{proc.stderr}")
    result = dict(zip(CSV_FIELDS, rows[0].split(",")[1:]))
    if result["pass"] != "1":
        raise RuntimeError(f"{variant} p={producers}: validation failed\n{proc.stdout}\n"
                           f"{proc.stderr}")
    counts = {}
    for line in perf_lines:
        parts = line.split(",")
        for event, field in zip(PERF_EVENTS, PERF_FIELDS):
            if len(parts) > 2 and parts[2] == event:
                counts[field] = parts[0]
    if len(counts) != len(PERF_FIELDS):
        raise RuntimeError(f"{variant} p={producers}: could not parse perf stat output: "
                           f"{perf_lines}")
    machine = {"canary_before_ns": canary_before, "canary_after_ns": canary(),
               "steal_ticks": steal_ticks() - steal_before}
    return {**result, **counts, **machine}


def calibrate(cells):
    """Grow the message count geometrically until a probe lasts >= MIN_PROBE_S,
    then size the run from that probe's rate. Extrapolating from one tiny probe
    is unsafe: oversubscribed spinlock runs look fast while they fit in one
    scheduler time slice and collapse after."""
    msgs = {}
    for variant, producers in cells:
        n = MIN_MSGS
        while True:
            r = run_once(variant, producers, n)
            if float(r["elapsed_s"]) >= MIN_PROBE_S or n >= MAX_MSGS:
                break
            n = min(MAX_MSGS, n * 4)
        rate = float(r["msgs_per_s"])
        target = int(rate * TARGET_SECONDS / producers)
        msgs[(variant, producers)] = max(MIN_MSGS, min(MAX_MSGS, target))
        print(f"  calibrate {variant:26s} p={producers}: {rate:12,.0f} msg/s -> "
              f"{msgs[(variant, producers)]:,} msgs/producer", flush=True)
    return msgs


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    rounds = int(args[0]) if args else 30
    quick = "--quick" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    cells = [(v, p) for v in VARIANTS for p in PRODUCER_COUNTS]
    if quick:
        cells = [c for c in cells if c[0] in ("lockfree_spsc", "condvar_mpsc")]

    print("calibrating...", flush=True)
    msgs = calibrate(cells)
    with open(OUT / "calibration.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["variant", "producers", "msgs_per_producer"])
        for (v, p), n in msgs.items():
            w.writerow([v, p, n])

    rng = random.Random(20261030)
    failures = 0
    with open(OUT / "runs.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["round", "variant", *CSV_FIELDS, *PERF_FIELDS,
                                          *MACHINE_FIELDS], lineterminator="\n")
        w.writeheader()
        for rnd in range(1, rounds + 1):
            order = cells[:]
            rng.shuffle(order)
            for variant, producers in order:
                try:
                    r = run_once(variant, producers, msgs[(variant, producers)])
                except (RuntimeError, subprocess.TimeoutExpired) as e:
                    failures += 1
                    print(f"FAILURE round {rnd}: {e}", file=sys.stderr, flush=True)
                    continue
                w.writerow({"round": rnd, "variant": variant, **r})
            f.flush()
            print(f"round {rnd}/{rounds} done ({failures} failures so far)", flush=True)

    if failures:
        print(f"{failures} runs failed", file=sys.stderr)
        sys.exit(1)
    print("all runs passed")


if __name__ == "__main__":
    main()
