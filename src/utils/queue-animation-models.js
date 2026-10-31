// Discrete explanatory schedules, not benchmark traces or timing models.
function topologyFrame(step, shared) {
  const s = Math.max(0, Math.min(7, step))
  const separate = [
    [[], []], [["A0"], []], [["A0", "A1"], []], [["A0", "A1"], []],
    [["A0", "A1"], ["B0"]], [["A1"], ["B0"]], [["A1", "A2"], ["B0"]], [["A1", "A2"], []],
  ]
  const pooled = [[], ["A0"], ["A0", "A1"], ["A0", "A1", "A2"], ["A0", "A1", "A2", "B0"], ["A1", "A2", "B0"], ["A1", "A2", "B0"], ["A2", "B0"]]
  const events = [
    "Two producers, one consumer, four total slots. A has a burst; B is initially idle.",
    "A publishes A0.", "A publishes A1.",
    shared ? "A2 uses a third shared slot. A can borrow capacity B has not used." : "A2 cannot enter A's full queue, even though B's two slots are empty.",
    "B publishes B0. A2 is still pending only in the fan-in version.",
    "The consumer removes A0, releasing one slot.",
    shared ? "A2 was already accepted. No retry is needed." : "A retries A2 and succeeds in its newly freed slot.",
    shared ? "The shared consumer removes A1, the next reserved position." : "The fan-in consumer visits B and removes B0. Each producer's order remains intact.",
  ]
  return { queues: shared ? [pooled[s]] : separate[s], capacity: shared ? 4 : 2,
    blocked: !shared && s >= 3 && s <= 5, event: events[s],
    consumed: s < 5 ? [] : s < 7 ? ["A0"] : shared ? ["A0", "A1"] : ["A0", "B0"] }
}
function cacheFrame(step, separated) {
  const s = Math.max(0, Math.min(4, step))
  const writer = s === 0 ? null : s % 2 ? "A" : "B"
  return { writer, head: Math.ceil(s / 2), tail: Math.floor(s / 2),
    owners: separated ? [s > 0 ? "A" : "none", s > 1 ? "B" : "none"] : [writer || "none"],
    transfers: separated ? 0 : Math.max(0, s - 1),
    event: s === 0 ? "No writes yet. Step through alternating writes by A and B."
      : `${writer} writes ${writer === "A" ? "head" : "tail"}. ${separated ? "The independent field has its own line; the other writer keeps its line." : "Both fields occupy the same line; the current writer needs that line's write ownership."}` }
}
function schedulerFrame(step, blocking) {
  const s = Math.max(0, Math.min(7, step))
  const spin = [
    ["A", "A", "running", "runnable", "A has acquired the lock."],
    ["B", "A", "preempted", "running", "The scheduler switches to B before A unlocks."],
    ["B", "A", "runnable", "spinning", "B tries to acquire and finds the lock held."],
    ["B", "A", "runnable", "spinning", "B checks again. A has not executed its unlock."],
    ["B", "A", "runnable", "spinning", "More checks do not perform A's remaining work."],
    ["A", "A", "running", "runnable", "A is selected again and can finish the critical section."],
    ["A", "none", "unlocked", "runnable", "A releases the lock. B may now acquire."],
    ["B", "B", "finished", "acquired", "B runs and successfully acquires the lock."],
  ]
  const park = [spin[0], spin[1], spin[2],
    ["scheduler", "A", "runnable", "blocked", "B takes a blocking wait path and leaves the runnable set."],
    ["A", "A", "running", "blocked", "In this possible schedule, A is selected next."],
    ["A", "none", "unlocked", "runnable", "A unlocks and a wakeup makes B runnable."],
    ["scheduler", "none", "finished", "runnable", "B still needs CPU time and a successful acquisition."], spin[7]]
  const [cpu, owner, a, b, event] = (blocking ? park : spin)[s]
  return { cpu, owner, a, b, event }
}
module.exports = { topologyFrame, cacheFrame, schedulerFrame }
