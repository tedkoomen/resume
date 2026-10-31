import React from "react"
import { topologyFrame, cacheFrame, schedulerFrame } from "../../utils/queue-animation-models"

export default function QueueAnimation({ type, step, mode }) {
  if (type === "queue-topology") {
    const shared = mode === "b", f = topologyFrame(step, shared)
    return <div className="queue-demo">
      <div className="queue-demo__actors"><span>Producer A · burst of 3</span><span>Producer B · 1 message</span></div>
      {f.queues.map((items, i) => <div className="queue-demo__lane" key={i}>
        <strong>{shared ? "Shared queue" : `Queue ${i === 0 ? "A" : "B"}`}</strong>
        <div className="queue-demo__slots">{Array.from({ length: f.capacity }, (_, j) => <span key={j} className={items[j] ? "is-filled" : ""}>{items[j] || "empty"}</span>)}</div>
      </div>)}
      <p className={"concept-event " + (f.blocked ? "is-warning" : "")}>{f.event}</p>
      <div className="queue-demo__actors"><span>A2: {step < 3 ? "not attempted" : f.blocked ? "waiting for space" : "accepted"}</span><span>Consumer received: {f.consumed.join(", ") || "nothing yet"}</span></div>
      <p className="concept-scale-note">Logical FIFO contents, compacted after removal. Array addresses and ring wraparound are omitted.</p>
    </div>
  }
  if (type === "queue-cache") {
    const separated = mode === "b", f = cacheFrame(step, separated)
    return <div className="queue-demo">
      <div className="queue-demo__actors"><span>A writes head</span><span>B writes tail</span></div>
      <div className="queue-demo__lines">{f.owners.map((owner, i) => <div key={i} className={"queue-demo__line " + (owner === f.writer ? "is-active" : "")}>
        <span>64-byte line {i} · write owner: {owner}</span>
        <div className="queue-demo__slots">{(!separated || i === 0) && <span className="is-filled">head = {f.head}</span>}{(!separated || i === 1) && <span className="is-filled">tail = {f.tail}</span>}<span>other bytes</span></div>
      </div>)}</div>
      <p className="concept-event">{f.event}</p>
      <p>Modeled writer-to-writer transfers: <strong>{f.transfers}</strong></p>
    </div>
  }
  const f = schedulerFrame(step, mode === "b")
  return <div className="queue-demo">
    <div className="queue-demo__actors"><span>One logical CPU: <strong>{f.cpu}</strong></span><span>Lock owner: <strong>{f.owner}</strong></span></div>
    <div className="queue-demo__threads">{[["A", f.a], ["B", f.b]].map(([name, status]) => <div key={name} className={"concept-node " + (f.cpu === name ? "is-current" : "")}><span>THREAD {name}</span><strong>{status}</strong><small>{f.owner === name ? "holds the lock" : "does not own the lock"}</small></div>)}</div>
    <p className="concept-event">{f.event}</p>
    <p className="concept-scale-note">Steps show event order, not equal durations. Blocking does not guarantee immediate owner scheduling or lock handoff.</p>
  </div>
}
