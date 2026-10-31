"""Build charts and a markdown report from the benchmark data in ../data.

Usage: .venv/bin/python analysis/make_charts.py
Writes charts/*.png and charts/REPORT.md.
"""

import csv
import re
import statistics as st
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "charts"
OUT.mkdir(exist_ok=True)

# Reference palette (dataviz skill, light mode).
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
ALIGNED = "#2a78d6"  # categorical slot 1
PACKED = "#eb6834"  # categorical slot 2
LAYOUT_COLOR = {"aligned": ALIGNED, "packed": PACKED}
LAYOUT_LABEL = {"aligned": "Cache-line aligned", "packed": "Packed (natural layout)"}
MSGS_PER_RUN = 8_000_000
VALGRIND_MSGS = 160_000

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
    "axes.titlesize": 12,
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


def col(rows, name):
    return [float(r[name]) for r in rows if r.get(name) not in (None, "")]


def median(rows, name):
    return st.median(col(rows, name))


def compact(v):
    for div, suffix in ((1e9, "G"), (1e6, "M"), (1e3, "K")):
        if abs(v) >= div:
            return f"{v / div:.3g}{suffix}"
    return f"{v:.3g}"


def cachegrind(log):
    """Pull the summary counters out of a cachegrind log."""
    text = Path(log).read_text()

    def grab(label):
        m = re.search(rf"{label}:\s+([\d,]+)", text)
        return int(m.group(1).replace(",", "")) if m else None

    return {
        "I refs": grab("I refs"),
        "D refs": grab("D refs"),
        "D1 misses": grab("D1  misses"),
        "LLd misses": grab("LLd misses"),
        "Branches": grab("Branches"),
        "Mispredicts": grab("Mispredicts"),
    }


# ---------------------------------------------------------------- data model

SPSC = {
    "baseline": load(DATA / "spsc/baseline_unpinned.csv"),
    "packed": load(DATA / "spsc/packed_pinned.csv"),
    "aligned": load(DATA / "spsc/aligned_pinned.csv"),
}
MODES = [
    ("nopause", "No pause\n(pure CAS spin)", DATA / "mpsc_nopause"),
    ("pause", "_mm_pause\nper lost CAS", DATA / "mpsc_pause"),
    ("backoff", "Exponential backoff\n(1..16 pauses)", DATA / "mpsc_backoff"),
]
MPSC = {m: {l: load(d / f"{l}_pinned.csv") for l in ("aligned", "packed")} for m, _, d in MODES}
# Contention counters come from separate -DMPSC_STATS builds. No-pause stats
# were collected in the same-session rerun.
STATS_DIR = {"nopause": DATA / "mpsc_nopause/rerun", "pause": DATA / "mpsc_pause",
             "backoff": DATA / "mpsc_backoff"}
MPSC_STATS = {m: {l: load(STATS_DIR[m] / f"{l}_stats.csv") for l in ("aligned", "packed")}
              for m, _, _ in MODES}
MPSC_RERUN = {l: load(DATA / f"mpsc_nopause/rerun/{l}_pinned.csv") for l in ("aligned", "packed")}

for rows in [*SPSC.values(), *(r for m in MPSC.values() for r in m.values())]:
    assert all(r["pass"] == "1" for r in rows), "a benchmark run failed validation"


def strip(ax, x, values, color, label=None, width=0.28):
    """Every run as a dot (deterministic jitter) plus a median bar and label."""
    n = len(values)
    xs = [x + width * ((i / max(n - 1, 1)) - 0.5) for i in range(n)]
    ax.scatter(xs, values, s=30, color=color, alpha=0.55, linewidths=0, label=label, zorder=3)
    med = st.median(values)
    ax.plot([x - width * 0.75, x + width * 0.75], [med, med], color=INK, lw=2,
            solid_capstyle="round", zorder=4)
    ax.annotate(f"{med:.2f}", (x + width * 0.8, med), xytext=(3, 0), textcoords="offset points",
                va="center", fontsize=9, color=INK, fontweight="bold")


def finish(fig, name, note=None):
    if note:
        fig.text(0.01, -0.04, note, fontsize=8, color=MUTED, ha="left", va="bottom")
    fig.savefig(OUT / name, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)


def layout_legend(ax, loc):
    ax.legend(handles=[Patch(color=LAYOUT_COLOR[l], label=LAYOUT_LABEL[l])
                       for l in ("aligned", "packed")], loc=loc)


def bar_round(ax, x, h, w, color, horizontal=False):
    """Thin bar; matplotlib has no per-corner radius, so keep bars thin and flat."""
    if horizontal:
        return ax.barh(x, h, height=w, color=color, zorder=3)
    return ax.bar(x, h, width=w, color=color, zorder=3)


report = ["# SPSC vs MPSC fan-in: results", "",
          "8 producers -> 1 consumer, 1M msgs per producer (8M per run). Consumer pinned alone "
          "on cpu 0; producers round-robin on cpus 1-3; one NUMA node (4-vCPU KVM guest). "
          "Every run is a separate process. All runs passed ordering/delivery checks.", ""]

# ------------------------------------------------- 1. SPSC: alignment & pinning

fig, ax = plt.subplots(figsize=(8, 4.6))
cats = [("baseline", "Original code\n(packed, unpinned)"), ("packed", "Packed\npinned"),
        ("aligned", "Cache-line aligned\npinned")]
for i, (k, _) in enumerate(cats):
    strip(ax, i, [v / 1e6 for v in col(SPSC[k], "msgs_per_s")], ALIGNED)
ax.set_xticks(range(len(cats)), [c[1] for c in cats])
ax.set_ylabel("Throughput (M msg/s)")
ax.set_ylim(0, None)
ax.grid(axis="x", visible=False)
ax.set_title("SPSC fan-in: pinning doubles throughput; alignment barely moves it")
finish(fig, "01_spsc_alignment_pinning.png",
       "Each dot is one process (30 per variant); bar = median.")

report += ["## 1. SPSC: alignment and pinning", "", "![](01_spsc_alignment_pinning.png)", "",
           "| variant | runs | min | median | mean | max | stdev |", "|---|---|---|---|---|---|---|"]
for k, label in cats:
    v = [x / 1e6 for x in col(SPSC[k], "msgs_per_s")]
    report.append(f"| {label.replace(chr(10), ' ')} | {len(v)} | {min(v):.2f} | {st.median(v):.2f} | "
                  f"{st.mean(v):.2f} | {max(v):.2f} | {st.stdev(v):.2f} |")
report += ["", "Throughput in M msg/s.", ""]

# ------------------------------------- 2. MPSC throughput: pre/post pause/backoff

fig, ax = plt.subplots(figsize=(9, 4.8))
for i, (m, label, _) in enumerate(MODES):
    for j, layout in enumerate(("aligned", "packed")):
        x = i + (j - 0.5) * 0.42
        strip(ax, x, [v / 1e6 for v in col(MPSC[m][layout], "msgs_per_s")],
              LAYOUT_COLOR[layout], LAYOUT_LABEL[layout] if i == 0 else None, width=0.22)
ax.set_xticks(range(len(MODES)), [m[1] for m in MODES])
ax.set_ylabel("Throughput (M msg/s)")
ax.set_ylim(0, None)
ax.grid(axis="x", visible=False)
ax.legend(loc="upper left", markerscale=1.3)
ax.set_title("MPSC throughput before and after _mm_pause / backoff in the CAS loop")
finish(fig, "02_mpsc_backoff_throughput.png",
       "Each dot is one process (30 per variant); bar = median. 'No pause' = data saved before "
       "the change.")

report += ["## 2. MPSC: before and after _mm_pause / backoff", "",
           "![](02_mpsc_backoff_throughput.png)", "",
           "| CAS retry policy | layout | runs | min | median | mean | max | stdev | median vs no pause |",
           "|---|---|---|---|---|---|---|---|---|"]
for m, label, _ in MODES:
    for layout in ("aligned", "packed"):
        v = [x / 1e6 for x in col(MPSC[m][layout], "msgs_per_s")]
        base = st.median(col(MPSC["nopause"][layout], "msgs_per_s")) / 1e6
        report.append(f"| {label.replace(chr(10), ' ')} | {layout} | {len(v)} | {min(v):.2f} | "
                      f"{st.median(v):.2f} | {st.mean(v):.2f} | {max(v):.2f} | {st.stdev(v):.2f} | "
                      f"{st.median(v) / base:.2f}x |")
report += ["", "Throughput in M msg/s. Same-session control rerun of the no-pause build "
           "(to check for machine drift):", "",
           "| layout | original median | rerun median |", "|---|---|---|"]
for layout in ("aligned", "packed"):
    report.append(f"| {layout} | {median(MPSC['nopause'][layout], 'msgs_per_s') / 1e6:.2f} | "
                  f"{median(MPSC_RERUN[layout], 'msgs_per_s') / 1e6:.2f} |")
report.append("")

# --------------------------------------------------- 3. MPSC CAS contention

fig, ax = plt.subplots(figsize=(8, 4.4))
w = 0.2
for j, layout in enumerate(("aligned", "packed")):
    xs = [i + (j - 0.5) * (w + 0.04) for i in range(len(MODES))]
    hs = [median(MPSC_STATS[m][layout], "cas_retries") / MSGS_PER_RUN for m, _, _ in MODES]
    bar_round(ax, xs, hs, w, LAYOUT_COLOR[layout])
    for x, h in zip(xs, hs):
        ax.annotate(f"{h:.2f}", (x, h), xytext=(0, 3), textcoords="offset points", ha="center",
                    fontsize=9, color=INK)
ax.set_xticks(range(len(MODES)), [m[1] for m in MODES])
ax.set_ylabel("Lost CAS races per message")
ax.grid(axis="x", visible=False)
layout_legend(ax, "upper right")
ax.set_title("MPSC contention: how often a producer loses the race for head_")
finish(fig, "03_mpsc_cas_retries.png",
       "Median of 10 runs of the -DMPSC_STATS build (counts failed CAS + slot-already-claimed).")

report += ["## 3. MPSC contention: lost CAS races", "", "![](03_mpsc_cas_retries.png)", "",
           "| CAS retry policy | layout | lost races / msg | stats-build throughput (M msg/s) |",
           "|---|---|---|---|"]
for m, label, _ in MODES:
    for layout in ("aligned", "packed"):
        rows = MPSC_STATS[m][layout]
        report.append(f"| {label.replace(chr(10), ' ')} | {layout} | "
                      f"{median(rows, 'cas_retries') / MSGS_PER_RUN:.3f} | "
                      f"{median(rows, 'msgs_per_s') / 1e6:.2f} |")
report.append("")

# ------------------------------------------------------ 4. Wasted spin work

GROUPS = [("SPSC\n(8 queues)", SPSC)] + [(f"MPSC\n{label}", MPSC[m]) for m, label, _ in MODES]
GROUPS = [(g.replace("\n(pure CAS spin)", "").replace("\nper lost CAS", "")
           .replace("\n(1..16 pauses)", ""), d) for g, d in GROUPS]
fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
for ax, metric, title, ylabel in [
        (axes[0], "full_spins", "Producer: push() found the queue full", "Failed pushes per message"),
        (axes[1], "empty_polls", "Consumer: pop() found the queue empty", "Empty polls per message")]:
    for j, layout in enumerate(("aligned", "packed")):
        xs = [i + (j - 0.5) * (w + 0.04) for i in range(len(GROUPS))]
        hs = [median(d[layout], metric) / MSGS_PER_RUN for _, d in GROUPS]
        bar_round(ax, xs, hs, w, LAYOUT_COLOR[layout])
    ax.set_xticks(range(len(GROUPS)), [g for g, _ in GROUPS], fontsize=9)
    ax.set_ylabel(ylabel)
    ax.grid(axis="x", visible=False)
    ax.set_title(title, fontsize=11)
fig.legend(handles=[Patch(color=LAYOUT_COLOR[l], label=LAYOUT_LABEL[l]) for l in ("aligned", "packed")],
           loc="upper right", ncol=2, bbox_to_anchor=(1.0, 1.0))
fig.suptitle("Wasted spin work per delivered message (pinned runs, median of 30)", x=0.01,
             ha="left", fontsize=12, fontweight="bold", color=INK)
fig.tight_layout()
finish(fig, "04_spin_waste.png", "Separate y-axes per panel: the two counters differ in scale.")

report += ["## 4. Wasted spin work", "", "![](04_spin_waste.png)", "",
           "| variant | layout | full spins / msg | empty polls / msg |", "|---|---|---|---|"]
for g, d in GROUPS:
    for layout in ("aligned", "packed"):
        report.append(f"| {g.replace(chr(10), ' ')} | {layout} | "
                      f"{median(d[layout], 'full_spins') / MSGS_PER_RUN:.1f} | "
                      f"{median(d[layout], 'empty_polls') / MSGS_PER_RUN:.2f} |")
report.append("")

# ------------------------------------------------------ 5. Overview ranking

LOCKS = [("spsc_mutex", "SPSC std::mutex"), ("spsc_spin", "SPSC spinlock"),
         ("mpsc_mutex", "MPSC std::mutex"), ("mpsc_spin", "MPSC spinlock")]
LOCKED = {k: load(DATA / k / "aligned_pinned.csv") for k, _ in LOCKS}
for rows in LOCKED.values():
    assert all(r["pass"] == "1" for r in rows), "a locked benchmark run failed validation"


def rate_label(v):
    return compact(v) + " msg/s"


entries = [("SPSC original (unpinned)", SPSC["baseline"], "packed")]
entries += [(f"SPSC lock-free, {layout}", SPSC[layout], layout) for layout in ("aligned", "packed")]
short = {"nopause": "no pause", "pause": "_mm_pause", "backoff": "exp. backoff"}
entries += [(f"MPSC lock-free {short[m]}, {layout}", MPSC[m][layout], layout)
            for m, _, _ in MODES for layout in ("aligned", "packed")]
entries += [(f"{label}, aligned", LOCKED[k], "aligned") for k, label in LOCKS]
entries.sort(key=lambda e: median(e[1], "msgs_per_s"))
fig, ax = plt.subplots(figsize=(9, 6.5))
ys = range(len(entries))
vals = [median(e[1], "msgs_per_s") for e in entries]
bar_round(ax, list(ys), vals, 0.45, [LAYOUT_COLOR[e[2]] for e in entries], horizontal=True)
for y, v in zip(ys, vals):
    ax.annotate(compact(v), (v, y), xytext=(4, 0), textcoords="offset points", va="center",
                fontsize=9, color=INK)
ax.set_xscale("log")
ax.set_xlim(100, 1e8)
ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: compact(v)))
ax.set_yticks(list(ys), [e[0] for e in entries])
ax.set_xlabel("Median throughput (msg/s, log scale)")
ax.grid(axis="y", visible=False)
layout_legend(ax, "lower right")
ax.set_title("Every variant, ranked by median throughput")
finish(fig, "05_overview_ranking.png",
       "Pinned unless noted. Median of 30 processes each. Log scale: the range spans five orders "
       "of magnitude.")

report += ["## 5. Overview", "", "![](05_overview_ranking.png)", "",
           "| variant | median msg/s |", "|---|---|"]
for e, v in sorted(zip(entries, vals), key=lambda x: -x[1]):
    report.append(f"| {e[0]} | {v:,.0f} |")
report.append("")

# ------------------------------------------------------ 6. Valgrind cachegrind

CG = ([("SPSC lock-free", DATA / "spsc")] + [(f"MPSC {short[m]}", d) for m, _, d in MODES]
      + [(label, DATA / k) for k, label in LOCKS])


def cg_msgs(stdout):
    m = re.search(r"received (\d+)/", Path(stdout).read_text())
    return int(m.group(1))


cg = {}
for name, d in CG:
    for layout in ("aligned", "packed"):
        if (d / f"cg.{layout}.log").exists():
            cg[(name, layout)] = cachegrind(d / f"cg.{layout}.log")
            cg[(name, layout)]["msgs"] = cg_msgs(d / f"cg.{layout}.stdout")
panels = [("I refs", "Instructions per message"),
          ("D refs", "Data reads+writes per message"),
          ("D1 misses", "L1 data misses per message"),
          ("Mispredicts", "Branch mispredicts per message")]
fig, axes = plt.subplots(2, 2, figsize=(13, 7.5))
for ax, (key, title) in zip(axes.flat, panels):
    for j, layout in enumerate(("aligned", "packed")):
        pts = [(i + (j - 0.5) * (w + 0.04), cg[(name, layout)][key] / cg[(name, layout)]["msgs"])
               for i, (name, _) in enumerate(CG) if (name, layout) in cg]
        bar_round(ax, [p[0] for p in pts], [p[1] for p in pts], w, LAYOUT_COLOR[layout])
    ax.set_yscale("log")
    ax.set_xticks(range(len(CG)), [n.replace(" ", "\n", 1) for n, _ in CG], fontsize=8)
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: compact(v)))
    ax.grid(axis="x", visible=False)
    ax.set_title(title, fontsize=11)
layout_legend(axes[0][0], "upper right")
fig.suptitle("Valgrind cachegrind. Threads are serialized, so this shows spin cost, not "
             "cross-core traffic", x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)
fig.tight_layout()
finish(fig, "06_valgrind_cachegrind.png",
       "Log y-axis, separate per panel. Lock variants: aligned layout only, fewer messages "
       "(see table). Cachegrind models one cache hierarchy: no coherence traffic.")

report += ["## 6. Valgrind cachegrind", "", "![](06_valgrind_cachegrind.png)", "",
           "`--cache-sim=yes --branch-sim=yes --fair-sched=yes`. Valgrind runs one thread at a "
           "time and models a single cache, so it cannot see coherence traffic or false sharing; "
           "nearly all instructions are spin loops.", "",
           "| variant | layout | msgs | instr / msg | data refs / msg | D1 misses | LLd misses | "
           "branches / msg | mispredicts |", "|---|---|---|---|---|---|---|---|---|"]
for (name, layout), c in cg.items():
    n = c["msgs"]
    report.append(f"| {name} | {layout} | {n:,} | {c['I refs'] / n:,.0f} | {c['D refs'] / n:,.0f} | "
                  f"{c['D1 misses']:,} | {c['LLd misses']:,} | {c['Branches'] / n:,.0f} | "
                  f"{c['Mispredicts']:,} |")
report.append("")

# ------------------------------------------- 7. Lock-free vs lock-based queues

LF_VS_LOCK = [
    ("SPSC fan-in", [("Lock-free", SPSC["aligned"]), ("std::mutex", LOCKED["spsc_mutex"]),
                     ("Spinlock", LOCKED["spsc_spin"])]),
    ("MPSC", [("Lock-free\n(exp. backoff)", MPSC["backoff"]["aligned"]),
              ("Lock-free\n(no pause)", MPSC["nopause"]["aligned"]),
              ("std::mutex", LOCKED["mpsc_mutex"]), ("Spinlock", LOCKED["mpsc_spin"])]),
]
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), sharey=True)
for ax, (title, items) in zip(axes, LF_VS_LOCK):
    for i, (label, rows) in enumerate(items):
        v = col(rows, "msgs_per_s")
        n = len(v)
        xs = [i + 0.3 * ((k / max(n - 1, 1)) - 0.5) for k in range(n)]
        ax.scatter(xs, v, s=30, color=ALIGNED, alpha=0.55, linewidths=0, zorder=3)
        med = st.median(v)
        ax.plot([i - 0.22, i + 0.22], [med, med], color=INK, lw=2, zorder=4)
        ax.annotate(compact(med), (i + 0.24, med), xytext=(3, 0), textcoords="offset points",
                    va="center", fontsize=9, color=INK, fontweight="bold")
    ax.set_yscale("log")
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: compact(v)))
    ax.set_xticks(range(len(items)), [i[0] for i in items], fontsize=9)
    ax.set_xlim(-0.5, len(items) - 0.3)
    ax.grid(axis="x", visible=False)
    ax.set_title(title, fontsize=11)
axes[0].set_ylabel("Throughput (msg/s, log scale)")
fig.suptitle("Lock-free vs lock-based queues (cache-line aligned, pinned)", x=0.01, ha="left",
             fontsize=12, fontweight="bold", color=INK)
fig.tight_layout()
finish(fig, "07_lockfree_vs_locks.png",
       "Each dot is one process (30 per variant); bar = median. Log scale.")

report += ["## 7. Lock-free vs lock-based queues", "", "![](07_lockfree_vs_locks.png)", "",
           "| harness | queue | runs | min msg/s | median msg/s | max msg/s | vs best lock-free |",
           "|---|---|---|---|---|---|---|"]
for title, items in LF_VS_LOCK:
    base = median(items[0][1], "msgs_per_s")
    for label, rows in items:
        v = col(rows, "msgs_per_s")
        report.append(f"| {title} | {label.replace(chr(10), ' ')} | {len(v)} | {min(v):,.0f} | "
                      f"{st.median(v):,.0f} | {max(v):,.0f} | {base / st.median(v):,.1f}x slower |")
report += ["", "Lock variants ran fewer messages per producer so each run takes seconds "
           "(std::mutex SPSC 50K, spinlock SPSC 500, std::mutex MPSC 200K, spinlock MPSC 1M; "
           "lock-free 1M). Rates are per second."]
report.append("")

# ------------------------------------------ 8. Futex: low vs high contention

sweep = load(DATA / "lock_contention/sweep.csv")
assert all(r["ok"] == "1" for r in sweep), "lock_contention lost an increment"


def sweep_median(lock, threads, think, field):
    vals = [float(r[field]) for r in sweep
            if r["lock"] == lock and int(r["threads"]) == threads and int(r["think"]) == think]
    return st.median(vals)


def futex_per_acquire(lock, threads, think):
    vals = [float(r["futex"]) / (int(r["threads"]) * int(r["ops_per_thread"])) for r in sweep
            if r["lock"] == lock and int(r["threads"]) == threads and int(r["think"]) == think]
    return st.median(vals)


THINKS = sorted({int(r["think"]) for r in sweep})
THREADS = sorted({int(r["threads"]) for r in sweep})
THREAD_COLOR = {1: "#2a78d6", 2: "#eb6834", 4: "#1baf7a"}  # slots 1-3, validated
x_think = [max(t, 1) for t in THINKS]  # log axis: plot think=0 at 1
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8))
ax = axes[0]
for t in THREADS:
    ys_ = [futex_per_acquire("mutex", t, k) for k in THINKS]
    ax.plot(x_think, [max(y, 1e-7) for y in ys_], color=THREAD_COLOR[t], lw=2, marker="o", ms=6,
            mec=SURFACE, mew=2, label=f"{t} thread{'s' if t > 1 else ''}", zorder=3)
    ax.annotate(f"{t} thr", (x_think[-1], max(ys_[-1], 1e-7)), xytext=(6, 0),
                textcoords="offset points", va="center", fontsize=9, color=INK2)
ax.set_xscale("log")
ax.set_yscale("log")
ax.set_ylim(1e-7, 1)
ax.set_xticks(x_think, ["0"] + [compact(k) for k in THINKS[1:]])
ax.xaxis.set_minor_locator(matplotlib.ticker.NullLocator())
ax.set_xlabel("Work outside the lock (LCG iterations, ~1.5 ns each)")
ax.set_ylabel("futex syscalls per lock acquisition")
ax.set_title("std::mutex: futex syscalls per acquisition", fontsize=11)
ax.legend(loc="lower left")
ax.annotate("1 thread: no futex calls at all\n(floor of the log axis)", (x_think[1], 1e-7),
            xytext=(0, 14), textcoords="offset points", fontsize=8, color=MUTED)

ax = axes[1]
for t in THREADS:
    ys_ = [sweep_median("mutex", t, k, "lock_ns_per_acquire") for k in THINKS]
    ax.plot(x_think, [max(y, 1) for y in ys_], color=THREAD_COLOR[t], lw=2, marker="o", ms=6,
            mec=SURFACE, mew=2, label=f"{t} thread{'s' if t > 1 else ''}", zorder=3)
ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xticks(x_think, ["0"] + [compact(k) for k in THINKS[1:]])
ax.xaxis.set_minor_locator(matplotlib.ticker.NullLocator())
ax.set_xlabel("Work outside the lock (LCG iterations, ~1.5 ns each)")
ax.set_ylabel("Added cost per lock+unlock (ns)")
ax.set_title("std::mutex: cost of lock+unlock", fontsize=11)
ax.legend(loc="upper right")
fig.suptitle("std::mutex is cheap when uncontended: the futex fast path never enters the kernel",
             x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)
fig.tight_layout()
finish(fig, "08_mutex_contention_futex.png",
       "Median of 5 runs per point; threads pinned to separate CPUs. Right panel: cost below ~1 ns "
       "is within timing noise of the outside work and is drawn at 1 ns.")

report += ["## 8. std::mutex under low vs high contention (futex)", "",
           "![](08_mutex_contention_futex.png)", "",
           "`lock_contention.cpp`: threads take the lock, bump a shared counter, unlock, then do "
           "private work. The lock's added cost is (time with lock - same loop without lock) / ops. "
           "futex syscalls counted with `perf stat -e syscalls:sys_enter_futex` (whole process, "
           "including ~4 for thread create/join).", "",
           "| lock | threads | work outside lock | futex / acquire | added ns per lock+unlock |",
           "|---|---|---|---|---|"]
for lock in ("mutex", "spin"):
    for t in THREADS:
        for k in THINKS:
            report.append(f"| {lock} | {t} | {k} | {futex_per_acquire(lock, t, k):.6f} | "
                          f"{sweep_median(lock, t, k, 'lock_ns_per_acquire'):.1f} |")
report.append("")

# ------------------------------------------ 9. Mutex vs spinlock at max contention

fig, ax = plt.subplots(figsize=(8, 4.4))
for j, (lock, label, color) in enumerate([("mutex", "std::mutex", ALIGNED),
                                          ("spin", "Spinlock (TTAS + pause)", PACKED)]):
    xs = [i + (j - 0.5) * (w + 0.04) for i in range(len(THREADS))]
    hs = [sweep_median(lock, t, 0, "lock_ns_per_acquire") for t in THREADS]
    bar_round(ax, xs, hs, w, color)
    for x, h in zip(xs, hs):
        ax.annotate(f"{h:.0f}", (x, h), xytext=(0, 3), textcoords="offset points", ha="center",
                    fontsize=9, color=INK)
ax.legend(handles=[Patch(color=ALIGNED, label="std::mutex"),
                   Patch(color=PACKED, label="Spinlock (TTAS + pause)")], loc="upper left")
ax.set_xticks(range(len(THREADS)), [f"{t} thread{'s' if t > 1 else ''}" for t in THREADS])
ax.set_ylabel("ns per lock+unlock")
ax.grid(axis="x", visible=False)
ax.set_title("Lock cost with no work outside the lock (maximum contention)")
finish(fig, "09_mutex_vs_spin_max_contention.png",
       "lock_contention.cpp, think=0, median of 5 runs. One thread per CPU, so no lock-holder "
       "preemption here.")
report += ["## 9. Mutex vs spinlock at maximum contention", "",
           "![](09_mutex_vs_spin_max_contention.png)", ""]

# ------------------------------------------ 10. Queue syscalls per message

qs = load(DATA / "lock_contention/queue_syscalls.csv")
QS_ORDER = [("spsc_lockfree", "SPSC lock-free"), ("spsc_mutex", "SPSC std::mutex"),
            ("spsc_spin", "SPSC spinlock"), ("mpsc_lockfree", "MPSC lock-free"),
            ("mpsc_mutex", "MPSC std::mutex"), ("mpsc_spin", "MPSC spinlock")]


def qs_median(variant, field):
    vals = [float(r[field]) / (8 * int(r["msgs_per_producer"])) for r in qs if r["variant"] == variant]
    return st.median(vals)


fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))
for ax, field, title in [(axes[0], "futex", "futex syscalls per message"),
                         (axes[1], "context_switches", "Context switches per message")]:
    hs = [qs_median(v, field) for v, _ in QS_ORDER]
    bar_round(ax, list(range(len(QS_ORDER))), [max(h, 1e-6) for h in hs], 0.35, ALIGNED)
    for i, h in enumerate(hs):
        ax.annotate(f"{h:.2g}", (i, max(h, 1e-6)), xytext=(0, 3), textcoords="offset points",
                    ha="center", fontsize=9, color=INK)
    ax.set_yscale("log")
    ax.set_ylim(1e-6, None)
    ax.set_xticks(range(len(QS_ORDER)), [l.replace(" ", "\n", 1) for _, l in QS_ORDER], fontsize=9)
    ax.grid(axis="x", visible=False)
    ax.set_title(title, fontsize=11)
fig.suptitle("Kernel involvement per delivered message (perf stat, median of 5 runs)", x=0.01,
             ha="left", fontsize=12, fontweight="bold", color=INK)
fig.tight_layout()
finish(fig, "10_queue_syscalls.png",
       "Log scale; values at the 1e-6 floor are effectively zero. Context switches include "
       "preemption of the oversubscribed producers.")
report += ["## 10. Kernel involvement per message", "", "![](10_queue_syscalls.png)", "",
           "| queue | futex / msg | context switches / msg | cpu migrations / msg |", "|---|---|---|---|"]
for v, label in QS_ORDER:
    report.append(f"| {label} | {qs_median(v, 'futex'):.4f} | {qs_median(v, 'context_switches'):.4f} | "
                  f"{qs_median(v, 'cpu_migrations'):.6f} |")
report.append("")

# ------------------------------------------ 11. Flamegraph summary

FLAMES = [("spsc_lockfree", "SPSC lock-free"), ("spsc_mutex", "SPSC std::mutex"),
          ("spsc_spin", "SPSC spinlock"), ("mpsc_nopause", "MPSC CAS, no pause"),
          ("mpsc_pause", "MPSC CAS + _mm_pause"), ("mpsc_backoff", "MPSC CAS + exp. backoff"),
          ("mpsc_mutex", "MPSC std::mutex"), ("mpsc_spin", "MPSC spinlock"),
          ("mutex_uncontended", "mutex microbench, 1 thread"),
          ("mutex_low_contention", "mutex microbench, 4 thr, low contention"),
          ("mutex_high_contention", "mutex microbench, 4 thr, high contention")]
CATS = [("app", "Application code (queue, spin loops)", "#2a78d6"),
        ("mutex_user", "pthread mutex, user space", "#eb6834"),
        ("futex_kernel", "Kernel: futex syscall", "#1baf7a"),
        ("other_kernel", "Kernel: other (scheduler, IRQ, ...)", "#eda100")]


def categorize(stack):
    frames = stack.split(";")
    if any("futex" in f and f.endswith("_[k]") for f in frames):
        return "futex_kernel"
    if frames[-1].endswith("_[k]"):
        return "other_kernel"
    if any("pthread_mutex" in f or "__lll_" in f for f in frames):
        return "mutex_user"
    return "app"


flame_share = {}
for name, _ in FLAMES:
    folded = DATA / "flamegraphs" / f"{name}.folded"
    totals = {c: 0 for c, _, _ in CATS}
    for line in folded.read_text().splitlines():
        stack, _, count = line.rpartition(" ")
        # Only the benchmark's own threads, not process start-up/teardown.
        if "start_thread" not in stack:
            continue
        totals[categorize(stack)] += int(count)
    total = sum(totals.values()) or 1
    flame_share[name] = {c: v / total for c, v in totals.items()}

fig, ax = plt.subplots(figsize=(10, 5.5))
ys = list(range(len(FLAMES)))[::-1]
left = [0.0] * len(FLAMES)
for c, label, color in CATS:
    widths = [flame_share[n][c] * 100 for n, _ in FLAMES]
    ax.barh(ys, widths, left=left, height=0.5, color=color, edgecolor=SURFACE, linewidth=2,
            label=label, zorder=3)
    left = [l + wd for l, wd in zip(left, widths)]
ax.set_yticks(ys, [l for _, l in FLAMES])
ax.set_xlim(0, 100)
ax.set_xlabel("Share of worker-thread CPU samples (%)")
ax.grid(axis="y", visible=False)
ax.legend(loc="upper center", bbox_to_anchor=(0.45, -0.12), ncol=2)
ax.set_title("Where the CPU time goes (from the flamegraph stacks)")
finish(fig, "11_flamegraph_breakdown.png",
       "perf record -e cpu-clock -F 1999 --call-graph dwarf. Queue code is inlined into the "
       "producer/consumer loops, so it appears as application code.")

report += ["## 11. Flamegraphs", "", "![](11_flamegraph_breakdown.png)", "",
           "Interactive SVGs (open in a browser, click to zoom):", ""]
for name, label in FLAMES:
    report.append(f"- [{label}](flamegraphs/{name}.svg)")
report += ["", "| profile | " + " | ".join(l for _, l, _ in CATS) + " |",
           "|---|" + "---|" * len(CATS)]
for name, label in FLAMES:
    report.append(f"| {label} | " + " | ".join(f"{flame_share[name][c] * 100:.1f}%"
                                              for c, _, _ in CATS) + " |")
report.append("")

(OUT / "REPORT.md").write_text("\n".join(report))
print("wrote", *sorted(p.name for p in OUT.iterdir()))
