// Deterministic teaching traces. No measurements or production telemetry.
const clampStep = (step, last) => Math.max(0, Math.min(last, Math.floor(step)))
function counterFrame(step, atomic = false) {
  const i = clampStep(step, 6)
  const naive = [
    [0, "Ready", "Ready", "Two requests must add two views."],
    [0, "Read 0", "Ready", "A reads the current value: 0."],
    [0, "Read 0", "Read 0", "B also reads 0 before either write."],
    [0, "Computed 1", "Read 0", "A computes its replacement value locally."],
    [0, "Computed 1", "Computed 1", "B independently computes the same value."],
    [1, "Wrote 1", "Computed 1", "A writes 1 to the database."],
    [1, "Wrote 1", "Wrote 1", "B writes 1 over 1. One increment is lost."],
  ]
  const safe = [
    [0, "Ready", "Ready", "Both requests ask the database to increment."],
    [0, "Owns row lock", "Ready", "A acquires the row lock for its UPDATE."],
    [
      1,
      "Incremented to 1",
      "Ready",
      "A increments the current value inside the database.",
    ],
    [
      1,
      "Owns row lock",
      "Waiting",
      "B waits for A to finish; it does not compute a stale replacement.",
    ],
    [
      1,
      "Committed",
      "Owns row lock",
      "A commits. B can now update the current row version.",
    ],
    [
      2,
      "Committed",
      "Incremented to 2",
      "B increments 1 to 2. Both views are represented.",
    ],
    [
      2,
      "Committed",
      "Committed",
      "B commits. Final value: 2. Correctness still requires coordination.",
    ],
  ]
  const [value, a, b, event] = (atomic ? safe : naive)[i]
  return {
    value,
    a,
    b,
    event,
    complete: i === 6,
    lost: i === 6 && !atomic,
    lock: atomic && i >= 1 && i <= 5 ? (i < 4 ? "A" : "B") : null,
  }
}
function ioFrame(step, eventDriven = true) {
  const t = clampStep(step, 9),
    completion = eventDriven ? [6, 1, 2, 3] : [6, 7, 8, 9]
  const jobs = ["A", "B", "C", "D"].map((name, i) => ({
    name,
    done: t >= completion[i],
    ready: i > 0 || t >= 6,
    completedAt: completion[i],
  }))
  const done = jobs.filter(j => j.done).length
  const worker =
    done === 4
      ? "All four complete"
      : !eventDriven && t < 6
      ? "Blocked reading A"
      : t === 0
      ? "Register A; service ready sockets"
      : eventDriven && t < 4
      ? `Completed ${"ABCD"[t]}; keep serving ready work`
      : t < 6
      ? "epoll_wait: no ready work"
      : `Completed ${eventDriven ? "A" : "ABCD"[t - 6]}`
  return { jobs, done, worker, t }
}
function layoutFrame(step, both = false) {
  const fetched = clampStep(step, 2),
    lines = {}
  for (const layout of ["aos", "soa"]) {
    const cells = Array.from({ length: 32 }, (_, i) => {
      const price = layout === "aos" ? i % 2 === 0 : i < 16
      return {
        label:
          (price ? "P" : "Q") + (layout === "aos" ? Math.floor(i / 2) : i % 16),
        useful: price || both,
        loaded:
          Math.floor(i / 16) <
          Math.min(fetched, layout === "soa" && !both ? 1 : 2),
      }
    })
    lines[layout] = {
      cells,
      bytes: cells.filter(c => c.loaded).length * 4,
      useful: cells.filter(c => c.loaded && c.useful).length * 4,
    }
  }
  return lines
}
function latencyBudget(networkMs = 10) {
  const network = Math.max(10, Math.min(50, Number(networkMs))) * 1000
  return {
    network,
    original: network + 146.8,
    revised: network + 7.5,
    saved: 139.3,
    processingSpeedup: 146.8 / 7.5,
    totalSpeedup: (network + 146.8) / (network + 7.5),
  }
}
function latencyFrame(step, networkMs = 10) {
  const s = clampStep(step, 15),
    budget = latencyBudget(networkMs)
  const phase = s < 5 ? 0 : s < 15 ? 1 : 2
  const processing =
    s <= 5 ? 0 : s === 6 ? 7.5 : Math.min(146.8, 7.5 + ((s - 6) / 8) * 139.3)
  const networkProgress = Math.min(s / 4, 1)
  return {
    ...budget,
    phase,
    processing,
    networkProgress,
    elapsed: budget.network * networkProgress + processing,
  }
}
module.exports = {
  counterFrame,
  ioFrame,
  layoutFrame,
  latencyBudget,
  latencyFrame,
}
