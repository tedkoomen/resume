"""Build charts and a markdown report from the benchmark data in ../data.

Usage: .venv/bin/python analysis/make_charts.py
Inputs:  data/v2/runs.csv               (analysis/run_bench.py, interleaved runs)
         data/v2/cachegrind/*.log       (build/collect_v2_profiles.sh)
         data/v2/flamegraphs/*.folded   (build/collect_v2_profiles.sh)
         data/lock_contention/sweep.csv (lock_contention.cpp sweep)
Writes charts/*.png and charts/REPORT.md. (analysis/make_charts_v1.py renders the
pre-critique data.)
"""

import csv
import random
import re
import statistics as st
import textwrap
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.ticker  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
V2 = DATA / "v2"
OUT = ROOT / "charts"
OUT.mkdir(exist_ok=True)

# Reference palette (dataviz skill, light mode). Slots 1-4 validated together.
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
SLOT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
ALIGNED, PACKED = SLOT[0], SLOT[1]
LAYOUT_COLOR = {"aligned": ALIGNED, "packed": PACKED}
LAYOUT_LABEL = {"aligned": "Cache-line aligned", "packed": "Packed (natural layout)"}
PRODUCERS = (8, 3)
P_TITLE = {8: "8 producers (oversubscribed: 8 on 3 CPUs)", 3: "3 producers (one per CPU)"}
P_COLOR = {3: SLOT[0], 8: SLOT[1]}

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["DejaVu Sans"],
    "font.size": 10,
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "axes.edgecolor": AXIS,
    "axes.linewidth": 1,
    "axes.labelcolor": INK2,
    "axes.titlecolor": INK,
    "axes.titlesize": 11,
    "axes.titleweight": "bold",
    "axes.titlelocation": "left",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "axes.axisbelow": True,
    "grid.color": GRID,
    "grid.linewidth": 1,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "xtick.labelcolor": INK2,
    "ytick.labelcolor": INK2,
    "legend.frameon": False,
    "legend.labelcolor": INK2,
    "savefig.dpi": 150,
    "savefig.facecolor": SURFACE,
})


def load(path):
    with open(path) as f:
        return list(csv.DictReader(f))


def compact(v):
    for div, suffix in ((1e9, "G"), (1e6, "M"), (1e3, "K")):
        if abs(v) >= div:
            return f"{v / div:.3g}{suffix}"
    return f"{v:.3g}"


COMPACT = matplotlib.ticker.FuncFormatter(lambda v, _: compact(v))


def finish(fig, name, note=None):
    if note:
        # Wrap to the figure width so a long note never widens the saved image.
        width_chars = int(fig.get_figwidth() * 15)
        fig.text(0.01, -0.03, textwrap.fill(note, width_chars), fontsize=8, color=MUTED,
                 ha="left", va="top")
    fig.savefig(OUT / name, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)


def suptitle(fig, text):
    fig.suptitle(text, x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)


def legend_patches(ax_or_fig, items, **kw):
    ax_or_fig.legend(handles=[Patch(color=c, label=l) for l, c in items], **kw)


# ------------------------------------------------------------------ data model

# A run is "disturbed" if the machine-speed canary (timed on every CPU just
# before and just after it) was more than CANARY_SLACK slower than the
# machine's fast state (10th percentile of all canary readings) on BOTH sides.
# A sustained host slowdown (minutes, as in session 1) slows both readings; a
# single preemption of the canary by an unrelated task slows only one, and is
# not evidence that the benchmark run itself was slowed. The host can slow this
# guest without reporting steal time, so the canary is the only signal.
CANARY_SLACK = 1.15
ALL_RUNS = load(V2 / "runs.csv")
for i, r in enumerate(ALL_RUNS):
    assert r["pass"] == "1", f"failed run in data: {r}"
    r["order"] = i
    r["canary"] = min(float(r["canary_before_ns"]), float(r["canary_after_ns"]))
_canaries = sorted(r["canary"] for r in ALL_RUNS)
CANARY_FAST = _canaries[len(_canaries) // 10]
CANARY_LIMIT = CANARY_FAST * CANARY_SLACK
RUNS = defaultdict(list)
EXCLUDED = defaultdict(int)
for r in ALL_RUNS:
    key = (r["variant"], int(r["producers"]))
    if r["canary"] <= CANARY_LIMIT:
        RUNS[key].append(r)
    else:
        EXCLUDED[key] += 1


def rates(v, p):
    return [float(r["msgs_per_s"]) for r in RUNS[(v, p)]]


def med_rate(v, p):
    return st.median(rates(v, p))


def per_msg(v, p, field):
    """Median over runs of field / messages delivered in that run."""
    return st.median(float(r[field]) / (int(r["msgs_per_producer"]) * p) for r in RUNS[(v, p)])


def bootstrap_ratio(a, b, n=4000, seed=1):
    """95% bootstrap CI for median(a) / median(b)."""
    rng = random.Random(seed)
    ratios = sorted(st.median(rng.choices(a, k=len(a))) / st.median(rng.choices(b, k=len(b)))
                    for _ in range(n))
    return st.median(a) / st.median(b), ratios[int(0.025 * n)], ratios[int(0.975 * n)]


def strip(ax, x, values, color, label=None, width=0.28, fmt=compact):
    """Every run as a dot (deterministic jitter) plus a median bar and label."""
    n = len(values)
    xs = [x + width * ((i / max(n - 1, 1)) - 0.5) for i in range(n)]
    ax.scatter(xs, values, s=26, color=color, alpha=0.55, linewidths=0, label=label, zorder=3)
    med = st.median(values)
    ax.plot([x - width * 0.75, x + width * 0.75], [med, med], color=INK, lw=2,
            solid_capstyle="round", zorder=4)
    ax.annotate(fmt(med), (x + width * 0.8, med), xytext=(3, 0), textcoords="offset points",
                va="center", fontsize=8.5, color=INK, fontweight="bold")


def label(text):
    return text.replace("\n", " ")


rounds = max(int(r["round"]) for r in ALL_RUNS)
n_excluded = sum(EXCLUDED.values())
min_runs = min(len(v) for v in RUNS.values())
report = [
    "# SPSC vs MPSC fan-in: results", "",
    f"P producers -> 1 consumer on a 4-vCPU KVM guest (1 NUMA node, no PMU). Consumer pinned "
    f"alone on cpu 0; producers round-robin on cpus 1-3. Two producer counts: **8** "
    f"(oversubscribed, the original setup) and **3** (one producer per CPU). "
    f"{rounds} interleaved rounds: each round runs every variant once in a shuffled order, each "
    f"run its own process, so drift spreads evenly. Message counts are calibrated so each run "
    f"takes ~1.5 s. All runs passed ordering/delivery/payload validation. Ratios below come with "
    f"bootstrap 95% confidence intervals; a CI that contains 1.00 means no detectable difference.",
    "",
    f"**Disturbed runs excluded:** {n_excluded} of {len(ALL_RUNS)} runs had the machine-speed "
    f"canary more than {(CANARY_SLACK - 1) * 100:.0f}% slower than the machine's fast state "
    f"({CANARY_FAST:.3f} ns/iter) both before and after the run, and are excluded (see section "
    f"13); every cell keeps at least "
    f"{min_runs} runs. Per-dot counts in the charts are therefore below {rounds} for some cells.",
    "",
    "Pre-critique data (sequential batches, old harness) is kept in `data/spsc`, `data/mpsc_*`, "
    "`data/*_mutex`, `data/*_spin`; it is superseded by `data/v2`.", ""]

KEY_COMPARISONS = []  # (title, variant a, variant b) -> table at the end


def compare(title, a, b):
    KEY_COMPARISONS.append((title, a, b))


# --------------------------------------------- 1. SPSC: alignment and pinning

SPSC_CATS = [("lockfree_spsc_unpinned", "Aligned\nunpinned"), ("lockfree_spsc_packed", "Packed\npinned"),
             ("lockfree_spsc", "Aligned\npinned")]
fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))
for ax, p in zip(axes, PRODUCERS):
    for i, (v, _) in enumerate(SPSC_CATS):
        strip(ax, i, rates(v, p), ALIGNED)
    ax.set_xticks(range(len(SPSC_CATS)), [c[1] for c in SPSC_CATS])
    ax.set_ylim(0, None)
    ax.yaxis.set_major_formatter(COMPACT)
    ax.grid(axis="x", visible=False)
    ax.set_title(P_TITLE[p])
axes[0].set_ylabel("Throughput (msg/s)")
suptitle(fig, "SPSC fan-in (lock-free): effect of pinning and cache-line alignment")
fig.tight_layout()
finish(fig, "01_spsc_alignment_pinning.png",
       f"Each dot is one undisturbed process (up to {rounds} per variant); bar = median.")
compare("SPSC: pinned vs unpinned", "lockfree_spsc", "lockfree_spsc_unpinned")
compare("SPSC: aligned vs packed", "lockfree_spsc", "lockfree_spsc_packed")

# -------------------------------------------- 2. MPSC: before/after backoff

MODES = [("b0", "No pause\n(pure CAS spin)"), ("b1", "_mm_pause\nper lost CAS"),
         ("b2", "Exponential\nbackoff (1..16)")]
fig, axes = plt.subplots(1, 2, figsize=(13, 4.8))
for ax, p in zip(axes, PRODUCERS):
    for i, (m, _) in enumerate(MODES):
        for j, layout in enumerate(("aligned", "packed")):
            v = f"lockfree_mpsc_{m}" + ("_packed" if layout == "packed" else "")
            strip(ax, i + (j - 0.5) * 0.42, rates(v, p), LAYOUT_COLOR[layout], width=0.2)
    ax.set_xticks(range(len(MODES)), [m[1] for m in MODES], fontsize=9)
    ax.set_ylim(0, None)
    ax.yaxis.set_major_formatter(COMPACT)
    ax.grid(axis="x", visible=False)
    ax.set_title(P_TITLE[p])
axes[0].set_ylabel("Throughput (msg/s)")
legend_patches(fig, [(LAYOUT_LABEL[l], LAYOUT_COLOR[l]) for l in ("aligned", "packed")],
               loc="upper right", ncol=2)
suptitle(fig, "Lock-free MPSC: CAS loop with no pause vs _mm_pause vs exponential backoff")
fig.tight_layout()
finish(fig, "02_mpsc_backoff_throughput.png",
       f"Each dot is one undisturbed process (up to {rounds} per variant); bar = median.")
for m in ("b1", "b2"):
    compare(f"MPSC aligned: {m} vs no pause", f"lockfree_mpsc_{m}", "lockfree_mpsc_b0")
    compare(f"MPSC packed: {m} vs no pause", f"lockfree_mpsc_{m}_packed", "lockfree_mpsc_b0_packed")
compare("MPSC no pause: aligned vs packed", "lockfree_mpsc_b0", "lockfree_mpsc_b0_packed")

# --------------------------------------------- 3. MPSC: lost CAS races

fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=True)
for ax, p in zip(axes, PRODUCERS):
    hs = [per_msg(f"lockfree_mpsc_{m}_stats", p, "cas_retries") for m, _ in MODES]
    ax.bar(range(len(MODES)), hs, width=0.3, color=ALIGNED, zorder=3)
    for i, h in enumerate(hs):
        ax.annotate(f"{h:.2f}", (i, h), xytext=(0, 3), textcoords="offset points", ha="center",
                    fontsize=9, color=INK)
    ax.set_xticks(range(len(MODES)), [m[1] for m in MODES], fontsize=9)
    ax.grid(axis="x", visible=False)
    ax.set_title(P_TITLE[p])
axes[0].set_ylabel("Lost CAS races per message")
suptitle(fig, "Lock-free MPSC (aligned): how often a producer loses the race for head_")
fig.tight_layout()
finish(fig, "03_mpsc_cas_retries.png",
       "Median over runs of the -DMPSC_STATS builds (failed CAS + slot already claimed).")

# --------------------------------------------- 4. Wasted spin work

MODE_SHORT = {"b0": "no pause", "b1": "_mm_pause", "b2": "exp. backoff"}
GROUPS = [("SPSC", "lockfree_spsc", "lockfree_spsc_packed")] + [
    (f"MPSC\n{MODE_SHORT[m]}", f"lockfree_mpsc_{m}", f"lockfree_mpsc_{m}_packed")
    for m, _ in MODES]
fig, axes = plt.subplots(2, 2, figsize=(12, 7.5))
for row, p in enumerate(PRODUCERS):
    for col_, (field, title) in enumerate([("full_spins", "push() found the queue full"),
                                           ("empty_polls", "pop() found the queue empty")]):
        ax = axes[row][col_]
        for j, layout in enumerate(("aligned", "packed")):
            xs = [i + (j - 0.5) * 0.24 for i in range(len(GROUPS))]
            hs = [per_msg(g[1 + j], p, field) for g in GROUPS]
            ax.bar(xs, hs, width=0.2, color=LAYOUT_COLOR[layout], zorder=3)
        ax.set_xticks(range(len(GROUPS)), [g[0] for g in GROUPS], fontsize=9)
        ax.grid(axis="x", visible=False)
        ax.set_title(f"{title}, {p} producers", fontsize=10)
        ax.set_ylabel("per delivered message")
legend_patches(fig, [(LAYOUT_LABEL[l], LAYOUT_COLOR[l]) for l in ("aligned", "packed")],
               loc="upper right", ncol=2)
suptitle(fig, "Wasted spin work per delivered message (lock-free queues, median over runs)")
fig.tight_layout()
finish(fig, "04_spin_waste.png", "Separate y-axis per panel.")

# --------------------------------------------- 7. Lock-free vs lock-based

IMPLS = [("lockfree", "Lock-free"), ("mutex", "std::mutex\n(try, polling)"),
         ("spin", "Spinlock\n(try, polling)"), ("condvar", "mutex+condvar\n(producers sleep)")]
TOPOS = [("spsc", "One queue per producer"), ("mpsc", "One shared queue")]


def impl_variant(impl, topo):
    if impl == "lockfree":
        return "lockfree_spsc" if topo == "spsc" else "lockfree_mpsc_b2"
    return f"{impl}_{topo}"


fig, axes = plt.subplots(2, 2, figsize=(13, 8.5), sharey=True)
for row, p in enumerate(PRODUCERS):
    for col_, (topo, ttitle) in enumerate(TOPOS):
        ax = axes[row][col_]
        for i, (impl, _) in enumerate(IMPLS):
            strip(ax, i, rates(impl_variant(impl, topo), p), ALIGNED, width=0.3)
        ax.set_yscale("log")
        ax.yaxis.set_major_formatter(COMPACT)
        ax.set_xticks(range(len(IMPLS)), [i[1] for i in IMPLS], fontsize=8.5)
        ax.set_xlim(-0.5, len(IMPLS) - 0.2)
        ax.grid(axis="x", visible=False)
        ax.set_title(f"{ttitle}, {p} producers", fontsize=10)
    axes[row][0].set_ylabel("Throughput (msg/s, log scale)")
suptitle(fig, "Lock-free vs lock-based queues (cache-line aligned, pinned)")
fig.tight_layout()
finish(fig, "07_lockfree_vs_locks.png",
       f"Each dot is one undisturbed process (up to {rounds} per variant); bar = median. "
       "Lock-free shared queue = "
       "MPSC with exponential backoff.")
for topo, _ in TOPOS:
    for impl in ("mutex", "spin", "condvar"):
        compare(f"{topo.upper()} topology: {impl} vs lock-free", impl_variant(impl, topo),
                impl_variant("lockfree", topo))
compare("Shared queue: lock-free MPSC vs SPSC fan-in", "lockfree_mpsc_b2", "lockfree_spsc")

# --------------------------------------------- 5. Overview ranking

OVERVIEW = [v for v in dict.fromkeys(k[0] for k in RUNS) if not v.endswith("_stats")]
NICE = {
    "lockfree_spsc_unpinned": "SPSC lock-free, unpinned", "lockfree_spsc": "SPSC lock-free",
    "lockfree_spsc_packed": "SPSC lock-free, packed",
    "lockfree_mpsc_b0": "MPSC lock-free, no pause", "lockfree_mpsc_b1": "MPSC lock-free, _mm_pause",
    "lockfree_mpsc_b2": "MPSC lock-free, exp. backoff",
    "lockfree_mpsc_b0_packed": "MPSC lock-free, no pause, packed",
    "lockfree_mpsc_b1_packed": "MPSC lock-free, _mm_pause, packed",
    "lockfree_mpsc_b2_packed": "MPSC lock-free, exp. backoff, packed",
    "mutex_spsc": "SPSC std::mutex", "mutex_mpsc": "MPSC std::mutex",
    "spin_spsc": "SPSC spinlock", "spin_mpsc": "MPSC spinlock",
    "condvar_spsc": "SPSC mutex+condvar", "condvar_mpsc": "MPSC mutex+condvar",
}
fig, axes = plt.subplots(1, 2, figsize=(14, 7))
for ax, p in zip(axes, PRODUCERS):
    order = sorted(OVERVIEW, key=lambda v: med_rate(v, p))
    vals = [med_rate(v, p) for v in order]
    colors = [PACKED if v.endswith("_packed") else ALIGNED for v in order]
    ax.barh(range(len(order)), vals, height=0.45, color=colors, zorder=3)
    for y, val in enumerate(vals):
        ax.annotate(compact(val), (val, y), xytext=(4, 0), textcoords="offset points",
                    va="center", fontsize=8.5, color=INK)
    ax.set_xscale("log")
    ax.set_xlim(100, 1e8)
    ax.xaxis.set_major_formatter(COMPACT)
    ax.set_yticks(range(len(order)), [NICE[v] for v in order], fontsize=8.5)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Median throughput (msg/s, log scale)")
    ax.set_title(P_TITLE[p], fontsize=10)
legend_patches(fig, [(LAYOUT_LABEL[l], LAYOUT_COLOR[l]) for l in ("aligned", "packed")],
               loc="upper right", ncol=2)
suptitle(fig, "Every variant, ranked by median throughput")
fig.tight_layout()
finish(fig, "05_overview_ranking.png", "Pinned unless noted. Log scale.")

# --------------------------------------------- 12. Oversubscription effect

fig, ax = plt.subplots(figsize=(10, 7))
order = sorted(OVERVIEW, key=lambda v: med_rate(v, 3))
for y, v in enumerate(order):
    a, b = med_rate(v, 3), med_rate(v, 8)
    ax.plot([a, b], [y, y], color=AXIS, lw=2, zorder=2)
    for val, p in ((a, 3), (b, 8)):
        ax.scatter([val], [y], s=60, color=P_COLOR[p], edgecolors=SURFACE, linewidths=2, zorder=3)
    ax.annotate(f"{b / a:.2g}x", (max(a, b), y), xytext=(8, 0), textcoords="offset points",
                va="center", fontsize=8.5, color=INK2)
ax.set_xscale("log")
ax.set_xlim(100, 1e8)
ax.xaxis.set_major_formatter(COMPACT)
ax.set_yticks(range(len(order)), [NICE[v] for v in order], fontsize=8.5)
ax.grid(axis="y", visible=False)
ax.set_xlabel("Median throughput (msg/s, log scale)")
legend_patches(ax, [("3 producers (one per CPU)", P_COLOR[3]),
                    ("8 producers (oversubscribed)", P_COLOR[8])], loc="upper left")
ax.set_title("Oversubscription: 8 producers on 3 CPUs vs one producer per CPU")
finish(fig, "12_oversubscription.png",
       "Label = 8-producer median / 3-producer median. Same queue code; only the producer count "
       "changes.")

# --------------------------------------------- 10. Kernel involvement per message

SYS_VARIANTS = ["lockfree_spsc", "lockfree_mpsc_b2", "mutex_spsc", "mutex_mpsc", "spin_spsc",
                "spin_mpsc", "condvar_spsc", "condvar_mpsc"]
fig, axes = plt.subplots(1, 2, figsize=(13, 4.8))
for ax, field, title in [(axes[0], "futex", "futex syscalls per message"),
                         (axes[1], "context_switches", "Context switches per message")]:
    for j, p in enumerate((3, 8)):
        xs = [i + (j - 0.5) * 0.3 for i in range(len(SYS_VARIANTS))]
        hs = [max(per_msg(v, p, field), 1e-6) for v in SYS_VARIANTS]
        ax.bar(xs, hs, width=0.26, color=P_COLOR[p], zorder=3)
    ax.set_yscale("log")
    ax.set_ylim(1e-6, None)
    short_impl = {"lockfree": "lock-free", "mutex": "mutex", "spin": "spinlock",
                  "condvar": "condvar"}
    ax.set_xticks(range(len(SYS_VARIANTS)),
                  [f"{'SPSC' if 'spsc' in v else 'MPSC'}\n{short_impl[v.split('_')[0]]}"
                   for v in SYS_VARIANTS], fontsize=8.5)
    ax.grid(axis="x", visible=False)
    ax.set_title(title)
legend_patches(fig, [("3 producers", P_COLOR[3]), ("8 producers", P_COLOR[8])], loc="upper right",
               ncol=2)
suptitle(fig, "Kernel involvement per delivered message (perf stat on every run, median)")
fig.tight_layout()
finish(fig, "10_queue_syscalls.png",
       "Log scale; bars at the 1e-6 floor are effectively zero. Lock-free MPSC = exponential "
       "backoff. Counts include ~10 futex calls for thread create/join per process.")

# --------------------------------------------- 8 & 9. futex: low vs high contention

sweep = load(DATA / "lock_contention/sweep.csv")
assert all(r["ok"] == "1" for r in sweep), "lock_contention lost an increment"


def sweep_vals(lock, threads, think, fn):
    return [fn(r) for r in sweep
            if r["lock"] == lock and int(r["threads"]) == threads and int(r["think"]) == think]


def sweep_ns(lock, threads, think):
    return st.median(sweep_vals(lock, threads, think, lambda r: float(r["lock_ns_per_acquire"])))


def futex_per_acquire(lock, threads, think):
    return st.median(sweep_vals(lock, threads, think,
                                lambda r: float(r["futex"]) / (int(r["threads"]) * int(r["ops_per_thread"]))))


THINKS = sorted({int(r["think"]) for r in sweep})
THREADS = sorted({int(r["threads"]) for r in sweep})
THREAD_COLOR = {1: SLOT[0], 2: SLOT[1], 4: SLOT[2]}
x_think = [max(t, 1) for t in THINKS]  # log axis: plot think=0 at 1
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8))
for ax, fn, ylabel, title in [
        (axes[0], futex_per_acquire, "futex syscalls per lock acquisition",
         "futex syscalls per acquisition"),
        (axes[1], sweep_ns, "Added cost per lock+unlock (ns)", "Cost of lock+unlock")]:
    for t in THREADS:
        ys_ = [fn("mutex", t, k) for k in THINKS]
        floor = 1e-7 if fn is futex_per_acquire else 1
        ax.plot(x_think, [max(y, floor) for y in ys_], color=THREAD_COLOR[t], lw=2, marker="o",
                ms=6, mec=SURFACE, mew=2, label=f"{t} thread{'s' if t > 1 else ''}", zorder=3)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xticks(x_think, ["0"] + [compact(k) for k in THINKS[1:]])
    ax.xaxis.set_minor_locator(matplotlib.ticker.NullLocator())
    ax.set_xlabel("Work outside the lock (LCG iterations, ~1.5 ns each)")
    ax.set_ylabel(ylabel)
    ax.set_title(f"std::mutex: {title}")
axes[0].set_ylim(1e-7, 1)
axes[0].legend(loc="lower left")
axes[0].annotate("1 thread: the lock makes no futex calls; the line is the handful\n"
                 "of calls from thread create/join, spread over all acquisitions",
                 (x_think[1], 1e-7), xytext=(0, 10), textcoords="offset points", fontsize=8,
                 color=MUTED)
suptitle(fig, "std::mutex is cheap when uncontended: the futex fast path never enters the kernel")
fig.tight_layout()
finish(fig, "08_mutex_contention_futex.png",
       "lock_contention.cpp, median of 5 runs per point, one thread per CPU. Right panel: costs "
       "below ~1 ns are within timing noise of the outside work and are drawn at 1 ns.")

fig, ax = plt.subplots(figsize=(8, 4.4))
for j, (lock, color) in enumerate([("mutex", SLOT[0]), ("spin", SLOT[1])]):
    xs = [i + (j - 0.5) * 0.24 for i in range(len(THREADS))]
    hs = [sweep_ns(lock, t, 0) for t in THREADS]
    ax.bar(xs, hs, width=0.2, color=color, zorder=3)
    for x, h in zip(xs, hs):
        ax.annotate(f"{h:.0f}", (x, h), xytext=(0, 3), textcoords="offset points", ha="center",
                    fontsize=9, color=INK)
legend_patches(ax, [("std::mutex", SLOT[0]), ("Spinlock (TTAS + pause)", SLOT[1])], loc="upper left")
ax.set_xticks(range(len(THREADS)), [f"{t} thread{'s' if t > 1 else ''}" for t in THREADS])
ax.set_ylabel("ns per lock+unlock")
ax.grid(axis="x", visible=False)
ax.set_title("Lock cost with no work outside the lock (maximum contention)")
finish(fig, "09_mutex_vs_spin_max_contention.png",
       "lock_contention.cpp, think=0, median of 5 runs, one thread per CPU (no lock-holder "
       "preemption).")

# --------------------------------------------- 6. Valgrind cachegrind (v2)

CG_DIR = V2 / "cachegrind"
CG_VARIANTS = ["lockfree_spsc", "lockfree_mpsc_b0", "lockfree_mpsc_b1", "lockfree_mpsc_b2",
               "mutex_spsc", "mutex_mpsc", "spin_spsc", "spin_mpsc", "condvar_spsc", "condvar_mpsc"]


def cachegrind(name):
    text = (CG_DIR / f"{name}.log").read_text()

    def grab(lbl):
        m = re.search(rf"{lbl}:\s+([\d,]+)", text)
        return int(m.group(1).replace(",", "")) if m else None

    stdout = (CG_DIR / f"{name}.stdout").read_text()
    m = re.search(r"received (\d+)/", stdout)
    if not m or "PASSED" not in stdout or grab("I refs") is None:
        return None  # did not complete (killed by the timeout)
    return {"msgs": int(m.group(1)), "I refs": grab("I refs"), "D refs": grab("D refs"),
            "D1 misses": grab("D1  misses"), "LLd misses": grab("LLd misses"),
            "Branches": grab("Branches"), "Mispredicts": grab("Mispredicts")}


cg = {v: c for v in CG_VARIANTS if (CG_DIR / f"{v}.log").exists() and (c := cachegrind(v))}
cg_incomplete = [v for v in CG_VARIANTS if v not in cg]


def short_label(v):
    impl = {"lockfree": "lock-free", "mutex": "mutex", "spin": "spinlock", "condvar": "condvar"}
    mode = {"b0": "\nno pause", "b1": "\n_mm_pause", "b2": "\nexp. backoff"}
    return (f"{'SPSC' if 'spsc' in v else 'MPSC'}\n{impl[v.split('_')[0]]}"
            + mode.get(v.split("_")[-1], ""))
if cg:
    fig, axes = plt.subplots(2, 2, figsize=(13, 7.5))
    for ax, (key, title) in zip(axes.flat, [("I refs", "Instructions per message"),
                                            ("D refs", "Data reads+writes per message"),
                                            ("D1 misses", "L1 data misses per message"),
                                            ("Mispredicts", "Branch mispredicts per message")]):
        names = list(cg)
        ax.bar(range(len(names)), [cg[n][key] / cg[n]["msgs"] for n in names], width=0.4,
               color=ALIGNED, zorder=3)
        ax.set_yscale("log")
        ax.yaxis.set_major_formatter(COMPACT)
        ax.set_xticks(range(len(names)), [short_label(n) for n in names], fontsize=8)
        ax.grid(axis="x", visible=False)
        ax.set_title(title)
    suptitle(fig, "Valgrind cachegrind (3 producers). Threads are serialized, so this shows "
                  "instruction and spin cost, not cross-core traffic")
    fig.tight_layout()
    incomplete = (f" Not shown: {', '.join(NICE[v] for v in cg_incomplete)} did not complete "
                  "under valgrind in 25 min (one thread runs at a time, so lock waiters spin away "
                  "their slice while the holder is descheduled)." if cg_incomplete else "")
    finish(fig, "06_valgrind_cachegrind.png",
           "Log y-axis, separate per panel. Cachegrind models one cache hierarchy: no coherence "
           "traffic or false sharing is modelled." + incomplete)

# --------------------------------------------- 11. Flamegraph breakdown

FG_DIR = V2 / "flamegraphs"
FLAME_VARIANTS = ["lockfree_spsc", "lockfree_mpsc_b0", "lockfree_mpsc_b1", "lockfree_mpsc_b2",
                  "mutex_spsc", "mutex_mpsc", "spin_spsc", "spin_mpsc", "condvar_spsc",
                  "condvar_mpsc"]
FLAMES = [(n, l) for n, l in [
    *[(f"{v}_p{p}", f"{NICE[v]}, {p} producers") for v in FLAME_VARIANTS for p in (3, 8)],
    ("mutex_uncontended", "mutex microbench, 1 thread"),
    ("mutex_low_contention", "mutex microbench, 4 thr, low contention"),
    ("mutex_high_contention", "mutex microbench, 4 thr, high contention")]
    if (FG_DIR / f"{n}.folded").exists()]
CATS = [("app", "Application code (queue, spin loops)", SLOT[0]),
        ("mutex_user", "pthread mutex / condvar, user space", SLOT[1]),
        ("futex_kernel", "Kernel: futex syscall", SLOT[2]),
        ("other_kernel", "Kernel: other (scheduler, IRQ, ...)", SLOT[3])]


def categorize(stack):
    frames = stack.split(";")
    if any("futex" in f and f.endswith("_[k]") for f in frames):
        return "futex_kernel"
    if frames[-1].endswith("_[k]"):
        return "other_kernel"
    if any(s in f for f in frames for s in ("pthread_mutex", "__lll_", "pthread_cond",
                                            "condition_variable")):
        return "mutex_user"
    return "app"


flame_share = {}
for name, _ in FLAMES:
    totals = dict.fromkeys((c for c, _, _ in CATS), 0)
    for line in (FG_DIR / f"{name}.folded").read_text().splitlines():
        stack, _, count = line.rpartition(" ")
        if "start_thread" in stack:  # benchmark threads only, not process start-up
            totals[categorize(stack)] += int(count)
    total = sum(totals.values()) or 1
    flame_share[name] = {c: v / total for c, v in totals.items()}

if FLAMES:
    fig, ax = plt.subplots(figsize=(11, 0.42 * len(FLAMES) + 2))
    ys = list(range(len(FLAMES)))[::-1]
    left = [0.0] * len(FLAMES)
    for c, lbl, color in CATS:
        widths = [flame_share[n][c] * 100 for n, _ in FLAMES]
        ax.barh(ys, widths, left=left, height=0.55, color=color, edgecolor=SURFACE, linewidth=2,
                label=lbl, zorder=3)
        left = [l + wd for l, wd in zip(left, widths)]
    ax.set_yticks(ys, [l for _, l in FLAMES], fontsize=8.5)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Share of benchmark-thread CPU samples (%)")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="upper center", bbox_to_anchor=(0.4, -0.06), ncol=2)
    ax.set_title("Where the CPU time goes (from the flamegraph stacks)")
    finish(fig, "11_flamegraph_breakdown.png",
           "perf record -e cpu-clock -F 1999 --call-graph dwarf. Queue code is inlined into the "
           "producer/consumer loops, so it shows as application code.")

# --------------------------------------------- 13. Machine speed over the session

REF = ("lockfree_spsc", 8)
ref_runs = [r for r in ALL_RUNS if (r["variant"], int(r["producers"])) == REF]
ref_kept = [float(r["msgs_per_s"]) for r in ref_runs if r["canary"] <= CANARY_LIMIT]
ref_excl = [float(r["msgs_per_s"]) for r in ref_runs if r["canary"] > CANARY_LIMIT]
steal_total = sum(int(r["steal_ticks"]) for r in ALL_RUNS)
SESSION1 = V2 / "runs_session1_no_canary.csv"
session1 = [r for r in load(SESSION1) if (r["variant"], int(r["producers"])) == REF] \
    if SESSION1.exists() else []

fig, axes = plt.subplots(3 if session1 else 2, 1, figsize=(12, 9 if session1 else 6.5))
ax = axes[0]
for clean, color, lbl in ((True, SLOT[0], "Kept"), (False, SLOT[1], "Excluded (slow before and after)")):
    pts = [(r["order"], r["canary"]) for r in ALL_RUNS if (r["canary"] <= CANARY_LIMIT) == clean]
    ax.scatter([p[0] for p in pts], [p[1] for p in pts], s=10, color=color, alpha=0.7,
               linewidths=0, label=lbl, zorder=3)
ax.axhline(CANARY_LIMIT, color=INK2, lw=1, zorder=2)
ax.annotate(f"exclusion threshold ({CANARY_SLACK:.2f}x fast state)", (0, CANARY_LIMIT),
            xytext=(4, 4), textcoords="offset points", fontsize=8, color=INK2)
ax.set_ylabel("Canary, faster of\nbefore/after (ns/iter)")
ax.set_xlabel("Run order (this session)")
ax.legend(loc="upper right", markerscale=2)
ax.set_title("This session: machine-speed canary around every run")
ax = axes[1]
for clean, color in ((True, SLOT[0]), (False, SLOT[1])):
    pts = [(r["order"], float(r["msgs_per_s"])) for r in ref_runs
           if (r["canary"] <= CANARY_LIMIT) == clean]
    ax.scatter([p[0] for p in pts], [p[1] for p in pts], s=22, color=color, alpha=0.8,
               linewidths=0, zorder=3)
ax.set_ylim(0, None)
ax.yaxis.set_major_formatter(COMPACT)
ax.set_ylabel("Throughput (msg/s)")
ax.set_xlabel("Run order (this session)")
ax.set_title(f"This session: reference variant ({NICE[REF[0]]}, {REF[1]} producers)")
if session1:
    ax = axes[2]
    ax.scatter([int(r["round"]) for r in session1], [float(r["msgs_per_s"]) for r in session1],
               s=22, color=SLOT[0], alpha=0.8, linewidths=0, zorder=3)
    ax.set_ylim(0, None)
    ax.yaxis.set_major_formatter(COMPACT)
    ax.set_ylabel("Throughput (msg/s)")
    ax.set_xlabel("Round (session 1, no canary yet)")
    ax.set_title("Session 1 (discarded): same reference variant. Every variant ran ~2.5x slower "
                 "until round 19")
fig.tight_layout()
excl_text = (f"excluded runs' median {compact(st.median(ref_excl))} msg/s" if ref_excl
             else "no reference runs excluded")
finish(fig, "13_machine_speed.png",
       f"This session: {n_excluded} of {len(ALL_RUNS)} runs excluded; reference variant median "
       f"{compact(st.median(ref_kept))} msg/s kept vs {excl_text}; {steal_total} steal ticks in "
       "total. Session 1 is why the canary exists; it is not used in any other chart.")

# ------------------------------------------------------------------ report

def ci_text(a, b, p):
    r, lo, hi = bootstrap_ratio(rates(a, p), rates(b, p))
    verdict = "no detectable difference" if lo <= 1 <= hi else ("faster" if lo > 1 else "slower")
    return f"{r:.3g}x [{lo:.3g}, {hi:.3g}] {verdict}"


report += ["## Key comparisons (median throughput ratio, bootstrap 95% CI)", "",
           "| comparison | 8 producers | 3 producers |", "|---|---|---|"]
for title, a, b in KEY_COMPARISONS:
    report.append(f"| {title} | {ci_text(a, b, 8)} | {ci_text(a, b, 3)} |")
report.append("")

sections = [
    ("1. SPSC: pinning and alignment", "01_spsc_alignment_pinning.png"),
    ("2. MPSC: no pause vs _mm_pause vs exponential backoff", "02_mpsc_backoff_throughput.png"),
    ("3. MPSC: lost CAS races", "03_mpsc_cas_retries.png"),
    ("4. Wasted spin work", "04_spin_waste.png"),
    ("5. Overview", "05_overview_ranking.png"),
    ("6. Valgrind cachegrind", "06_valgrind_cachegrind.png"),
    ("7. Lock-free vs lock-based queues", "07_lockfree_vs_locks.png"),
    ("8. std::mutex under low vs high contention (futex)", "08_mutex_contention_futex.png"),
    ("9. Mutex vs spinlock at maximum contention", "09_mutex_vs_spin_max_contention.png"),
    ("10. Kernel involvement per message", "10_queue_syscalls.png"),
    ("11. Flamegraphs", "11_flamegraph_breakdown.png"),
    ("12. Oversubscription", "12_oversubscription.png"),
    ("13. Machine speed and excluded runs", "13_machine_speed.png"),
]
TABLE_FIELDS = [("full_spins", "full spins/msg"), ("empty_polls", "empty polls/msg"),
                ("cas_retries", "lost CAS/msg"), ("futex", "futex/msg"),
                ("context_switches", "ctx sw/msg")]
for heading, png in sections:
    if not (OUT / png).exists():
        continue
    report += [f"## {heading}", "", f"![]({png})", ""]
    if png.startswith("05"):
        report += ["| variant | producers | runs kept | excluded | msgs/producer | min | median | max | "
                   + " | ".join(t for _, t in TABLE_FIELDS) + " |",
                   "|---|---|---|---|---|---|---|---|" + "---|" * len(TABLE_FIELDS)]
        for v in sorted({k[0] for k in RUNS}):
            for p in PRODUCERS:
                rs = rates(v, p)
                report.append(
                    f"| {v} | {p} | {len(rs)} | {EXCLUDED[(v, p)]} | "
                    f"{RUNS[(v, p)][0]['msgs_per_producer']} | "
                    f"{min(rs):,.0f} | {st.median(rs):,.0f} | {max(rs):,.0f} | "
                    + " | ".join(f"{per_msg(v, p, f):.3g}" for f, _ in TABLE_FIELDS) + " |")
        report.append("")
    if png.startswith("06") and cg:
        report += ["`--cache-sim=yes --branch-sim=yes --fair-sched=yes`, 3 producers. Valgrind runs "
                   "one thread at a time and models one cache, so it cannot see coherence traffic "
                   "or false sharing.", "",
                   "| variant | msgs | instr/msg | data refs/msg | D1 misses | LLd misses | "
                   "branches/msg | mispredicts |", "|---|---|---|---|---|---|---|---|"]
        for v in cg_incomplete:
            report.append(f"| {v} | did not complete under valgrind (25 min timeout) | | | | | | |")
        for n, c in cg.items():
            m = c["msgs"]
            report.append(f"| {n} | {m:,} | {c['I refs'] / m:,.0f} | {c['D refs'] / m:,.0f} | "
                          f"{c['D1 misses']:,} | {c['LLd misses']:,} | {c['Branches'] / m:,.0f} | "
                          f"{c['Mispredicts']:,} |")
        report.append("")
    if png.startswith("08"):
        report += ["`lock_contention.cpp`: threads lock, bump a shared counter, unlock, then do "
                   "private work. Added cost = (time with lock - same loop without) / ops. futex "
                   "counted with `perf stat -e syscalls:sys_enter_futex`.", "",
                   "| lock | threads | work outside lock | futex/acquire | added ns per lock+unlock |",
                   "|---|---|---|---|---|"]
        for lock in ("mutex", "spin"):
            for t in THREADS:
                for k in THINKS:
                    report.append(f"| {lock} | {t} | {k} | {futex_per_acquire(lock, t, k):.6f} | "
                                  f"{sweep_ns(lock, t, k):.1f} |")
        report.append("")
    if png.startswith("11") and FLAMES:
        report += ["Interactive SVGs (open in a browser; click to zoom):", ""]
        report += [f"- [{l}](flamegraphs/{n}.svg)" for n, l in FLAMES]
        report += ["", "| profile | " + " | ".join(l for _, l, _ in CATS) + " |",
                   "|---|" + "---|" * len(CATS)]
        for n, l in FLAMES:
            report.append(f"| {l} | " + " | ".join(f"{flame_share[n][c] * 100:.1f}%"
                                                  for c, _, _ in CATS) + " |")
        report.append("")

(OUT / "REPORT.md").write_text("\n".join(report))
print("wrote", *sorted(p.name for p in OUT.iterdir()))
