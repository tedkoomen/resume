import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { COMPILERS, examples, flags, compileRequest, compilationResult, compilerExplorerUrl, assemblyFindings } from "../../utils/cpp-examples"
import "./cpp-examples.scss"

function CppExample({ id, original }) {
  const example = examples[id]
  const [source, setSource] = useState(original)
  const [compiler, setCompiler] = useState(COMPILERS[0].id)
  const [optimization, setOptimization] = useState("-O2")
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [download, setDownload] = useState("")
  const request = useRef(null)
  const revision = useRef(0)
  useEffect(() => () => { revision.current++; request.current?.abort() }, [])
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/plain" }))
    setDownload(url)
    return () => URL.revokeObjectURL(url)
  }, [source])
  const change = setter => value => {
    revision.current++
    request.current?.abort()
    setBusy(false)
    setResult(null)
    setError("")
    setter(value)
  }
  const compile = async execute => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const current = ++revision.current
    const timer = setTimeout(() => controller.abort(), 45000)
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const response = await fetch(`https://godbolt.org/api/compiler/${compiler}/compile`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(compileRequest(source, optimization, execute && example.run)),
      })
      if (!response.ok) throw new Error(`Compiler Explorer returned HTTP ${response.status}.`)
      const data = await response.json()
      if (current === revision.current) setResult(compilationResult(data, execute && example.run))
    } catch (failure) {
      if (current === revision.current) setError(failure.name === "AbortError" ? "The request timed out. Try again or open the example in Compiler Explorer." : "Compiler Explorer is unavailable from this browser. Try again or use the link below.")
    } finally {
      clearTimeout(timer)
      if (current === revision.current) setBusy(false)
    }
  }
  const modified = source !== original
  return (
    <section className="cpp-example" aria-label={example.title + " compiler"}>
      <p className="cpp-example__title">Run the example and inspect its assembly</p>
      <p className="cpp-example__provider">Powered by <a href="https://godbolt.org/" target="_blank" rel="noreferrer">Compiler Explorer</a>. Code is sent there only when you compile, run, or open the example.</p>
      {example.note && <p className="cpp-example__notice">{example.note}</p>}
      <div className="cpp-example__settings">
        <label>Compiler<select aria-label={example.title + " compiler"} value={compiler} disabled={busy} onChange={e => change(setCompiler)(e.target.value)}>{COMPILERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>Optimization<select aria-label={example.title + " optimization"} value={optimization} disabled={busy} onChange={e => change(setOptimization)(e.target.value)}><option value="-O2">-O2 · optimized</option><option value="-O0">-O0 · unoptimized</option></select></label>
      </div>
      <details className="cpp-example__editor">
        <summary>Edit this example{modified ? " · using edited source" : ""}</summary>
        <label className="cpp-example__source-label">Source sent to the compiler<textarea aria-label={example.title + " source"} spellCheck={false} value={source} onChange={e => change(setSource)(e.target.value)} /></label>
        <button type="button" onClick={() => change(setSource)(original)}>Restore article code</button>
      </details>
      <div className="cpp-example__actions">
        {example.run && <button type="button" disabled={busy || !source.trim()} onClick={() => compile(true)}>Run + assembly</button>}
        <button type="button" disabled={busy || !source.trim()} onClick={() => compile(false)}>Compile to assembly</button>
        {download && <a href={download} download={`${id}.cpp`}>Download .cpp</a>}
      </div>
      <p className="cpp-example__status" role="status" aria-live="polite">{busy ? "Compiling on Compiler Explorer…" : error || result?.status || (modified ? "Ready to compile your edited source." : "Ready when you are.")}</p>
      {result && <div className="cpp-example__results">
        {result.output && <div><h3>Program output</h3><pre tabIndex="0" aria-label={example.title + " output"}>{result.output}</pre></div>}
        {result.diagnostics && <details open={!result.success}><summary>Compiler and runtime diagnostics</summary><pre tabIndex="0">{result.diagnostics}</pre></details>}
        {result.assembly && <>
          <div className="cpp-example__summary"><h3>What to look for</h3><p>{modified ? "The source has been edited; the article's explanation may no longer apply. Inspect the generated instructions for your changes." : example.assembly}</p>{assemblyFindings(result.assembly).map(finding => <p key={finding}>{finding}</p>)}<small>Instructions depend on the compiler, target, and flags. This is not a timing measurement.</small></div>
          <details className="cpp-example__assembly" open><summary>Generated assembly · {COMPILERS.find(c => c.id === compiler).label} · {optimization}</summary><pre tabIndex="0" aria-label={example.title + " assembly"}>{result.assembly}</pre></details>
        </>}
      </div>}
      {!modified && example.expected && <details><summary>Expected output</summary><pre tabIndex="0">{example.expected}</pre></details>}
      <p className="cpp-example__external"><a href={compilerExplorerUrl(source, compiler, optimization)} target="_blank" rel="noreferrer">Open this code in Compiler Explorer</a></p>
      <small className="cpp-example__flags">{flags(optimization)}</small>
    </section>
  )
}

export default function CppExamples({ bodyRef, html }) {
  const [mounts, setMounts] = useState([])
  useEffect(() => {
    const items = [...bodyRef.current.querySelectorAll("[data-cpp-example]")].flatMap(slot => {
      const id = slot.dataset.cppExample
      const code = slot.previousElementSibling?.querySelector("pre code")
      if (!examples[id] || !code) return []
      const fallback = [...slot.children]
      const mount = document.createElement("div")
      slot.append(mount)
      return [{ id, original: code.textContent, mount, fallback }]
    })
    setMounts(items)
    return () => items.forEach(({ mount, fallback }) => { mount.remove(); fallback.forEach(el => { el.hidden = false }) })
  }, [bodyRef, html])
  useEffect(() => { mounts.forEach(({ fallback }) => fallback.forEach(el => { el.hidden = true })) }, [mounts])
  return mounts.map(({ id, original, mount }) => createPortal(<CppExample id={id} original={original} />, mount, id))
}
