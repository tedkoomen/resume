import React, { useEffect, useRef, useState } from "react"
import {
  counterFrame,
  ioFrame,
  layoutFrame,
  latencyFrame,
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
    lead:
      "Follow the same market update through the network and two versions of your code.",
    steps: 15,
    duration: 1150,
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
  const [record, setRecord] = useState(0)
  return (
    <>
      <label className="concept-slider concept-record-picker">
        Trace record <strong>index {record}</strong>
        <input
          type="range"
          min="0"
          max="15"
          step="1"
          value={record}
          aria-label="Record index to trace in memory"
          onChange={e => setRecord(Number(e.target.value))}
        />
      </label>
      <p className="concept-schema-key">
        P = price · Q = quantity · each field is 4 bytes. Outlined cells belong
        to the selected record.
      </p>
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
            <div className="concept-schema">
              <span className="concept-line-label">
                {layout === "aos"
                  ? "16 Level objects · 8 bytes per object"
                  : "One Book object · two 64-byte arrays"}
              </span>
              <pre className="concept-schema-code">
                <code>
                  {layout === "aos"
                    ? "struct Level {\n  uint32_t price;\n  uint32_t quantity;\n};\nLevel levels[16];"
                    : "struct Book {\n  uint32_t prices[16];\n  uint32_t quantities[16];\n};\nBook book;"}
                </code>
              </pre>
              <div className="concept-field-map">
                <span>
                  {layout === "aos"
                    ? `levels[${record}].price`
                    : `book.prices[${record}]`}{" "}
                  <b>→ P{record}</b>
                </span>
                <span>
                  {layout === "aos"
                    ? `levels[${record}].quantity`
                    : `book.quantities[${record}]`}{" "}
                  <b>→ Q{record}</b>
                </span>
              </div>
              <span className="concept-schema-direction">
                ↓{" "}
                {layout === "aos"
                  ? "Each object keeps its two fields together in memory"
                  : "Each array keeps one field from all 16 records together"}
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
                        (c.loaded
                          ? c.useful
                            ? "is-useful"
                            : "is-unused"
                          : "") +
                        (Number(c.label.slice(1)) === record
                          ? " is-selected-record"
                          : "")
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
function Latency({ step, networkMs, jump }) {
  const f = latencyFrame(step, networkMs)
  const stories = [
    step === 0
      ? "The feed emits an update. Neither implementation can process bytes it has not received. Press Play to follow it."
      : step < 4
      ? `Both versions are waiting on the same ${networkMs} ms network journey. Faster processing cannot shorten this wait.`
      : "The bytes have arrived. Now, and only now, can either version start processing.",
    step === 5
      ? "Zoom in on the server. The network wait is over. Both versions start processing the same data at the same instant."
      : step === 6
      ? "At 7.5 µs, the revised code has a result. The original still needs another 139.3 µs. Watch its remaining work."
      : step < 14
      ? "The revised result is already available while the original keeps processing. This is where the code optimization saves time."
      : "Both results are ready. Processing fell from 146.8 µs to 7.5 µs: 19.6× faster for this part of the journey.",
    `Zoom back out: both paths still paid ${networkMs} ms for the network. Saving 139.3 µs cuts the total wait by only ${(
      (1 - f.revised / f.original) *
      100
    ).toFixed(
      2
    )}%. The code improvement is real; it does not remove the upstream delay.`,
  ]
  return (
    <>
      <div
        className="concept-story-nav"
        role="group"
        aria-label="Journey chapter"
      >
        {[
          ["1 · Network", 0],
          ["2 · Processing", 5],
          ["3 · Whole journey", 15],
        ].map(([label, target], i) => (
          <button
            type="button"
            key={target}
            aria-pressed={f.phase === i}
            onClick={() => jump(target)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="concept-story" data-phase={f.phase}>
        <div className="concept-clock">
          <span>
            {f.phase === 1
              ? "TIME SINCE BYTES ARRIVED"
              : "TIME SINCE UPDATE WAS SENT"}
          </span>
          <strong>
            {f.phase === 1
              ? `${f.processing.toFixed(1)} µs`
              : `${(f.elapsed / 1000).toFixed(4)} ms`}
          </strong>
          <small>
            {f.phase === 1
              ? `Network time already spent: ${networkMs} ms`
              : "Illustrative clock · playback is slowed for explanation"}
          </small>
        </div>
        {f.phase === 0 && (
          <div className="concept-network-scene">
            <div className="concept-route-labels">
              <b>Market feed</b>
              <b>Your server</b>
            </div>
            <div className="concept-transit-track">
              <i
                style={{ left: `${f.networkProgress * 100}%` }}
                aria-hidden="true"
              >
                ◆
              </i>
            </div>
            <div className="concept-route-labels">
              <span>Update sent</span>
              <span>
                {step === 4 ? "Bytes received ✓" : "Waiting for bytes…"}
              </span>
            </div>
            <div className="concept-waiting-pair">
              <span>
                Original code <b>{step === 4 ? "Ready to start" : "Waiting"}</b>
              </span>
              <span>
                Revised code <b>{step === 4 ? "Ready to start" : "Waiting"}</b>
              </span>
            </div>
          </div>
        )}
        {f.phase === 1 && (
          <div className="concept-processing-scene">
            <div className="concept-scale-label">
              PROCESSING ZOOM · both bars use 0–146.8 µs · network excluded
            </div>
            {[
              ["Original", 146.8],
              ["Revised", 7.5],
            ].map(([name, duration]) => (
              <div className="concept-process-row" key={name}>
                <div className="concept-row-label">
                  <b>{name} code</b>
                  <span>
                    {f.processing >= duration
                      ? "RESULT READY ✓"
                      : `PROCESSING · ${(duration - f.processing).toFixed(
                          1
                        )} µs left`}
                  </span>
                </div>
                <div className="concept-processing-track">
                  <div
                    className="concept-process-budget"
                    style={{ width: `${(duration / 146.8) * 100}%` }}
                  >
                    <i
                      style={{
                        width: `${Math.min(f.processing / duration, 1) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="concept-track-caption">
                  {duration} µs of processing required
                </span>
              </div>
            ))}
            <p className="concept-scale-note">
              Playback slows again at the server so you can see microseconds.
              Screen time is not proportional to network time.
            </p>
          </div>
        )}
        {f.phase === 2 && (
          <div className="concept-journeys">
            <div className="concept-scale-label">
              FULL JOURNEY · both bars use the same linear time scale
            </div>
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
                  aria-label={`${networkMs} ms network plus ${process} µs processing`}
                >
                  <span
                    className="network"
                    style={{ width: `${(f.network / f.original) * 100}%` }}
                  />
                  <span
                    className="processing"
                    style={{ width: `${(process / f.original) * 100}%` }}
                  />
                </div>
                <span className="concept-track-caption">
                  {networkMs} ms network + {process} µs processing
                </span>
              </div>
            ))}
            <p className="concept-scale-note">
              Muted = network · gold = processing. The gold segments are tiny
              because the network dominates this example.
            </p>
            <dl className="concept-metrics">
              <Metric label="Processing alone">19.6× faster</Metric>
              <Metric label="Whole journey">
                {((1 - f.revised / f.original) * 100).toFixed(2)}% less time
              </Metric>
              <Metric label="Actual saving">139.3 µs</Metric>
            </dl>
          </div>
        )}
      </div>
      <p className="concept-event concept-narration">
        <strong>
          {
            [
              "01 / Wait for data",
              "02 / Do the work",
              "03 / Compare the total",
            ][f.phase]
          }
        </strong>
        {stories[f.phase]}
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
      live measurement or a model of jitter. The network chapter and processing
      chapter play at different speeds so both are visible. Processing bars
      share a microsecond scale; the final comparison restores one common
      end-to-end scale. The clock, not playback duration, represents elapsed
      time.
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
        {type === "latency" && (
          <Latency
            step={step}
            networkMs={networkMs}
            jump={s => {
              setStep(s)
              setPlaying(false)
            }}
          />
        )}
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
