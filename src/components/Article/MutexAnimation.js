import React from "react"
import { mutexFrame } from "../../utils/mutex-animation-model"

export default function MutexAnimation({ step }) {
  const frame = mutexFrame(step)
  return (
    <>
      <div className="concept-counter mutex-scene">
        {["A", "B"].map(thread => (
          <div key={thread} className={"concept-node mutex-thread mutex-thread--" + thread + (frame.owner === thread ? " is-current" : "") + (thread === "B" && frame.b === "Waiting" ? " is-waiting" : "")}>
            <span>THREAD {thread}</span>
            <strong>{thread === "A" ? frame.a : frame.b}</strong>
            <code>{frame.owner === thread ? "// owns mtx" : thread === "B" && frame.b === "Waiting" ? "// waiting in lock()" : "// outside critical section"}</code>
            <small>{frame.owner === thread ? "May access count" : "Cannot access count here"}</small>
          </div>
        ))}
        <div className="concept-node concept-database mutex-shared">
          <span>PROTECTED COUNTER</span>
          <strong className="concept-value" key={frame.value}>{frame.value}</strong>
          <small>Mutex owner: {frame.owner || "none"}</small>
        </div>
      </div>
      <div className="mutex-ownership" aria-label={"Critical section owner: " + (frame.owner || "none")}>
        <span>Critical section</span>
        <div className={frame.owner ? "has-owner" : ""}>
          {frame.owner ? `Thread ${frame.owner} only` : "Unoccupied"}
        </div>
      </div>
      <p className="concept-event" role="status" aria-live="polite" aria-atomic="true">{frame.event}</p>
      <p className="mutex-schedule-note">One possible schedule. Playback speed does not represent lock latency.</p>
    </>
  )
}
