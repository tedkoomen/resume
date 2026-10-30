import React, { useEffect, useRef, useState } from "react"
import {
  counterFrame,
  ioFrame,
  layoutFrame,
  latencyBudget,
} from "../../utils/article-animation-models"
import "./concept-animation.scss"

const definitions = {
  counter: {
    title: "Watch an increment disappear",
    lead: "Two requests. One row. Change who performs the arithmetic.",
    steps: 6,
    duration: 1050,
  },
  io: {
    title: "One slow socket should not stop the others",
    lead: "A has no data until tick 6. B, C and D are ready from the start.",
    steps: 9,
    duration: 850,
  },
  layout: {
    title: "What did that cache line actually buy you?",
    lead:
      "Same 16 price/quantity pairs. Same 4-byte fields. Different placement.",
    steps: 2,
    duration: 1600,
  },
  latency: {
    title: "Fast code inside a slow journey",
    lead: "Replay both paths on the same end-to-end time scale.",
    steps: 40,
    duration: 110,
  },
}
function Choice({ value, setValue, options, label }) {
  return (
    <div className="concept-choice" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => setValue(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
function Metric({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
function Counter({ step, mode }) {
  const f = counterFrame(step, mode === "atomic")
  return (
    <>
      <div className="concept-counter" data-value={f.value}>
        <div className={"concept-node " + (f.lock === "A" ? "is-current" : "")}>
          <span>REQUEST A</span>
          <strong>{f.a}</strong>
          <small>
            {mode === "atomic" ? "views = views + 1" : "read → add → write"}
          </small>
        </div>
        <div
          className={
            "concept-node concept-database " + (f.lost ? "is-warning" : "")
          }
        >
          <span>DATABASE ROW</span>
          <strong key={f.value} className="concept-value">
            {f.value}
          </strong>
          <small>
            {f.lock
              ? `Lock held by ${f.lock}`
              : f.complete
              ? "Final committed value"
              : "views"}
          </small>
        </div>
        <div className={"concept-node " + (f.lock === "B" ? "is-current" : "")}>
          <span>REQUEST B</span>
          <strong>{f.b}</strong>
          <small>
            {mode === "atomic" ? "views = views + 1" : "read → add → write"}
          </small>
        </div>
      </div>
      <p className={"concept-event " + (f.lost ? "is-warning" : "")}>
        {f.event}
      </p>
      <dl className="concept-metrics">
        <Metric label="Expected">2 views</Metric>
        <Metric label="Stored so far">
          {f.value} {f.lost ? "· lost update" : ""}
        </Metric>
      </dl>
    </>
  )
}
function IO({ step, mode }) {
  const f = ioFrame(step, mode === "ready")
  return (
    <>
      <div className="concept-sockets">
        {f.jobs.map(j => (
          <div
            key={j.name}
            className={
              "concept-socket " +
              (j.done ? "is-done" : !j.ready ? "is-warning" : "")
            }
          >
            <b>{j.name}</b>
            <span>{j.done ? "COMPLETE" : j.ready ? "READY" : "NO DATA"}</span>
            <i aria-hidden="true">{j.done ? "✓" : j.ready ? "●" : "◷"}</i>
          </div>
        ))}
      </div>
      <div
        className={
          "concept-worker " +
          (mode === "blocking" && step < 6 ? "is-warning" : "")
        }
      >
        <span>ONE WORKER</span>
        <strong>{f.worker}</strong>
        <div className="concept-work-track" aria-hidden="true">
          <i style={{ width: `${f.done * 25}%` }} />
        </div>
      </div>
      <p className="concept-event">
        {mode === "blocking" && step < 6
          ? "B, C and D have data, but the worker is stuck in A’s blocking read."
          : mode === "ready" && step < 6
          ? "Nonblocking reads let the worker handle ready connections while A waits for data."
          : "A becomes readable at tick 6 in both versions. Readiness changes the scheduling, not the network."}
      </p>
      <dl className="concept-metrics">
        <Metric label="Demo clock">tick {step}</Metric>
        <Metric label="Requests complete">{f.done} / 4</Metric>
      </dl>
    </>
  )
}
function Layout({ step, mode }) {
  const f = layoutFrame(step, mode === "both")
  return (
    <>
      <div className="concept-layouts">
        {["aos", "soa"].map(layout => (
          <div key={layout} className="concept-memory-layout">
            <div className="concept-row-label">
              <b>
                {layout === "aos" ? "Array of structs" : "Struct of arrays"}
              </b>
              <span>
                {f[layout].useful} / {f[layout].bytes} fetched bytes useful
              </span>
            </div>
            {[0, 1].map(line => (
              <div
                key={line}
                className={
                  "concept-cache-line " +
                  (f[layout].cells[line * 16].loaded ? "is-loaded" : "")
                }
              >
                <span className="concept-line-label">
                  64 B / line {line + 1}
                  {layout === "soa" && line === 1 && mode !== "both"
                    ? " · not needed"
                    : ""}
                </span>
                <div className="concept-cells">
                  {f[layout].cells.slice(line * 16, line * 16 + 16).map(c => (
                    <span
                      key={c.label}
                      className={
                        c.loaded ? (c.useful ? "is-useful" : "is-unused") : ""
                      }
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="concept-event">
        {step === 0
          ? "Cold start. P = price, Q = quantity. Press Play or Step to fetch a cache line."
          : mode === "both"
          ? "When both fields are needed, both layouts transfer 128 useful bytes in two lines."
          : step === 1
          ? "One AoS line supplies 8 prices and 8 unused quantities. One SoA line supplies all 16 prices."
          : "Price-only scan complete: AoS fetched 128 bytes; SoA fetched 64. Layout follows the access pattern."}
      </p>
    </>
  )
}
function Latency({ step, networkMs }) {
  const f = latencyBudget(networkMs),
    elapsed = (step / 40) * f.original
  return (
    <>
      <div className="concept-journeys">
        {[
          ["Original", 146.8, f.original],
          ["Revised", 7.5, f.revised],
        ].map(([name, process, total]) => (
          <div className="concept-journey" key={name}>
            <div className="concept-row-label">
              <b>{name}</b>
              <span>{(total / 1000).toFixed(4)} ms total</span>
            </div>
            <div
              className="concept-time-track"
              aria-label={`${name}: ${networkMs} milliseconds network plus ${process} microseconds processing`}
            >
              <span
                className="network"
                style={{ width: `${(f.network / f.original) * 100}%` }}
              />
              <span
                className="processing"
                style={{ width: `${(process / f.original) * 100}%` }}
              />
              <i
                className="concept-packet"
                style={{
                  left: `${(Math.min(elapsed, total) / f.original) * 100}%`,
                }}
              />
            </div>
            <span className="concept-track-caption">
              {elapsed >= total
                ? "COMPLETE"
                : elapsed < f.network
                ? "IN TRANSIT"
                : "PROCESSING"}{" "}
              · same linear scale
            </span>
          </div>
        ))}
      </div>
      <div className="concept-zoom">
        <span>PROCESSING ONLY / MAGNIFIED TO A SEPARATE SCALE</span>
        {[
          ["Original", 146.8],
          ["Revised", 7.5],
        ].map(([name, v]) => (
          <div key={name}>
            <b>{name}</b>
            <div>
              <i style={{ width: `${(v / 146.8) * 100}%` }} />
            </div>
            <em>{v} µs</em>
          </div>
        ))}
      </div>
      <dl className="concept-metrics">
        <Metric label="Processing speedup">
          {f.processingSpeedup.toFixed(1)}×
        </Metric>
        <Metric label="Whole journey speedup">
          {f.totalSpeedup.toFixed(4)}×
        </Metric>
        <Metric label="Time saved">139.3 µs</Metric>
      </dl>
      <p className="concept-event">
        The code is much faster. With {networkMs} ms of assumed network delay,
        the whole journey improves by{" "}
        {((1 - f.revised / f.original) * 100).toFixed(2)}%.
      </p>
    </>
  )
}
const notes = {
  counter: (
    <>
      Illustrative interleaving. The safe trace assumes a successful
      PostgreSQL-style single-row UPDATE under Read Committed, with commits as
      shown. The read/replace trace has no explicit row lock. Transactions,
      failures and retries need their own handling.{" "}
      <a
        href="https://www.postgresql.org/docs/16/transaction-iso.html"
        target="_blank"
        rel="noreferrer"
      >
        Transaction isolation ↗
      </a>
    </>
  ),
  io: (
    <>
      Toy schedule: one worker, four connections, one tick to service each ready
      request. A becomes readable at tick 6. epoll reports readiness; it does
      not complete the read, make CPU work parallel, or eliminate syscalls.
      Nonblocking I/O still handles EAGAIN and partial reads.{" "}
      <a
        href="https://man7.org/linux/man-pages/man7/epoll.7.html"
        target="_blank"
        rel="noreferrer"
      >
        epoll reference ↗
      </a>
    </>
  ),
  layout: (
    <>
      Assumes cold, cache-line-aligned arrays, 64-byte lines, 4-byte fields and
      no struct padding. Counts transferred bytes, not elapsed time or measured
      cache misses; prefetching and overlap are omitted. SoA is not universally
      better.{" "}
      <a
        href="https://www.intel.com/content/www/us/en/developer/articles/technical/memory-layout-transformations.html"
        target="_blank"
        rel="noreferrer"
      >
        Memory layouts ↗
      </a>
    </>
  ),
  latency: (
    <>
      Processing times come from the full-pipeline comparison in this article.
      The slider adds an assumed fixed network delay to both paths; it is not a
      live measurement or a model of jitter. The processing inset uses its own
      explicitly enlarged scale.
    </>
  ),
}
export default function ConceptAnimation({ type }) {
  const d = definitions[type],
    ref = useRef(null)
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [visible, setVisible] = useState(false),
    [reduced, setReduced] = useState(false),
    [tabVisible, setTabVisible] = useState(true)
  const [mode, setMode] = useState(
    type === "counter" ? "naive" : type === "io" ? "blocking" : "prices"
  )
  const [networkMs, setNetworkMs] = useState(10)
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const motion = () => {
      setReduced(media.matches)
      if (media.matches) setPlaying(false)
    }
    const visibility = () => setTabVisible(!document.hidden)
    motion()
    visibility()
    media.addEventListener("change", motion)
    document.addEventListener("visibilitychange", visibility)
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 }
    )
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", motion)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [])
  useEffect(() => {
    if (!playing || reduced || !visible || !tabVisible) return undefined
    if (step >= d.steps) {
      setPlaying(false)
      return undefined
    }
    const timer = setTimeout(
      () => setStep(s => Math.min(d.steps, s + 1)),
      d.duration
    )
    return () => clearTimeout(timer)
  }, [playing, reduced, visible, tabVisible, step, d])
  const reset = () => {
    setStep(0)
    setPlaying(false)
  }
  const choose = value => {
    setMode(value)
    reset()
  }
  const active = playing && visible && tabVisible && !reduced
  return (
    <figure
      ref={ref}
      className={"concept-animation " + (active ? "is-playing" : "")}
      data-concept={type}
      data-step={step}
      data-playing={active}
    >
      <figcaption>
        <span className="concept-eyebrow">INTERACTIVE EXPLANATION</span>
        <strong>{d.title}</strong>
        <span>{d.lead}</span>
      </figcaption>
      {type === "counter" && (
        <Choice
          label="Counter update strategy"
          value={mode}
          setValue={choose}
          options={[
            ["naive", "Read / replace"],
            ["atomic", "Atomic UPDATE"],
          ]}
        />
      )}
      {type === "io" && (
        <Choice
          label="I/O strategy"
          value={mode}
          setValue={choose}
          options={[
            ["blocking", "Blocking read"],
            ["ready", "Readiness / epoll"],
          ]}
        />
      )}
      {type === "layout" && (
        <Choice
          label="Fields to scan"
          value={mode}
          setValue={choose}
          options={[
            ["prices", "Read prices only"],
            ["both", "Read both fields"],
          ]}
        />
      )}
      {type === "latency" && (
        <label className="concept-slider">
          Assumed network delay <strong>{networkMs} ms</strong>
          <input
            aria-label="Assumed network delay in milliseconds"
            type="range"
            min="10"
            max="50"
            step="10"
            value={networkMs}
            onChange={e => {
              setNetworkMs(Number(e.target.value))
              reset()
            }}
          />
        </label>
      )}
      <div className="concept-scene" aria-label={d.title}>
        {type === "counter" && <Counter step={step} mode={mode} />}
        {type === "io" && <IO step={step} mode={mode} />}
        {type === "layout" && <Layout step={step} mode={mode} />}
        {type === "latency" && <Latency step={step} networkMs={networkMs} />}
      </div>
      <div className="concept-controls">
        <button
          type="button"
          disabled={reduced}
          onClick={() => {
            if (step === d.steps) setStep(0)
            setPlaying(p => !p)
          }}
        >
          {playing ? "Pause" : step === d.steps ? "Replay" : "Play explanation"}
        </button>
        <button
          type="button"
          disabled={step === d.steps}
          onClick={() => {
            setPlaying(false)
            setStep(s => Math.min(d.steps, s + 1))
          }}
        >
          Step →
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <span>
          {reduced ? "Reduced motion · use Step" : `${step} / ${d.steps}`}
        </span>
      </div>
      <details className="concept-notes">
        <summary>How this illustration works</summary>
        <p>{notes[type]}</p>
      </details>
    </figure>
  )
}
