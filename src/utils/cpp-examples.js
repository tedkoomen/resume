const COMPILERS = [
  { id: "g142", label: "x86-64 GCC 14.2" },
  { id: "clang1910", label: "x86-64 Clang 19.1" },
]
const examples = {
  "data-race": { run: false, title: "Unsynchronized counter", note: "This program deliberately has a C++ data race. A plausible output or a single increment instruction does not make it correct.", assembly: "Look at increment_count. An ordinary add without a lock prefix does not provide an atomic update between cores. Undefined behavior also permits transformations beyond the interleaving pictured in the article." },
  "mutex-counter": { run: true, title: "Mutex counter", expected: "Final count: 10", assembly: "Look at increment_count. Calls to pthread_mutex_lock and pthread_mutex_unlock surround the increment on this Linux target. The library implements the fast path and possible futex wait; a call here does not mean every lock enters the kernel." },
  "recursive-lock": { run: false, title: "Re-locking std::mutex", note: "This program deliberately re-locks a non-recursive mutex from its owner. That is undefined behavior and commonly hangs, so this panel only compiles it.", assembly: "Two lock attempts on the same mutex do not become valid because the code compiles. The compiler generally cannot diagnose the runtime ownership error." },
  "atomic-counter": { run: true, title: "Relaxed atomic counter", expected: "Final counter value: 10", assembly: "Look at increment. A locked add is a common implementation when the old value is unused; xadd is another possibility. Relaxed removes extra publication requirements, not the atomic read-modify-write requirement or cache contention." },
  publication: { run: true, title: "Release/acquire handoff", expected: "Consumer observed payload: 42", assembly: "Look at producer and consumer. x86-64 can implement these release stores and acquire loads with ordinary mov instructions. The compiler still preserves the C++ ordering constraints. The lack of an explicit fence does not mean acquire/release is doing nothing; other targets may need different instructions." },
  "cas-counter": { run: true, title: "CAS retry loop", expected: "CAS counter: 4000 (expected 4000)", assembly: "Look at increment. A locked cmpxchg performs the comparison and conditional replacement; a conditional branch retries when it fails. A shorter instruction listing says nothing about how many retries contention will cause." },
  "versioned-state": { run: true, title: "Detect a stale version", expected: "Stale CAS accepted: false\nCurrent value: 10, version: 3\nLock-free on this target: true or false (target-dependent)", assembly: "The value and version must be compared as one atomic object. This target may use a 64-bit cmpxchg or a library helper; the output reports whether the atomic type is lock-free. A tag still does not solve node lifetime or version wraparound." },
  "padded-counters": { run: true, title: "Separate cache-line counters", expected: "Worker A: 1000\nWorker B: 1000\nCounter alignment: 64 bytes\nArray element stride: 64 bytes (for these targets)", assembly: "Look at worker_a and worker_b. Their counters are separated by the array element stride. The updates are still atomic. This example shows layout, not a measured speedup; padding only helps when it removes actual false sharing." },
}
const flags = optimization => `-std=c++20 ${optimization === "-O0" ? "-O0" : "-O2"} -pthread -latomic`
function compileRequest(source, optimization, execute) {
  return {
    source, lang: "c++", allowStoreCodeDebug: false,
    options: {
      userArguments: flags(optimization),
      compilerOptions: { executorRequest: false },
      filters: { binary: false, execute, intel: true, demangle: true, directives: true, labels: true, commentOnly: true, libraryCode: false, trim: true },
      executeParameters: { args: [], stdin: "" },
    },
  }
}
const linesText = lines => (Array.isArray(lines) ? lines.map(line => line.text || "").join("\n").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "") : "")
function compilationResult(data, execute) {
  const execution = data.execResult
  const diagnostics = [linesText(data.stderr), linesText(execution?.buildResult?.stderr), linesText(execution?.stderr)].filter(Boolean).join("\n")
  const compiled = data.code === 0 && !data.timedOut
  const ran = Boolean(execution?.didExecute)
  const success = compiled && (!execute || (ran && execution.code === 0 && !execution.timedOut))
  const status = !compiled ? "Compilation failed" : execute && !ran ? "Program could not be built or run" : execution?.timedOut ? "Execution timed out" : execute ? `Program exited with code ${execution.code}` : "Compiled successfully; program not run"
  return { success, status, diagnostics, output: linesText(execution?.stdout), assembly: compiled ? linesText(data.asm) : "" }
}
function compilerExplorerUrl(source, compiler, optimization) {
  const state = { sessions: [{ id: 1, language: "c++", source, compilers: [{ id: compiler, options: flags(optimization) }] }] }
  // ASCII JSON keeps browser btoa and the documented clientstate format compatible.
  const ascii = JSON.stringify(state).replace(/[\u007f-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
  return "https://godbolt.org/clientstate/" + encodeURIComponent(btoa(ascii))
}
function assemblyFindings(assembly) {
  const found = []
  if (/lock\s+(?:add|xadd|inc)\b/i.test(assembly)) found.push("Locked increment/add instructions are present.")
  if (/lock\s+cmpxchg\b/i.test(assembly)) found.push("A locked compare-and-exchange instruction is present.")
  if (/pthread_mutex_lock/.test(assembly)) found.push("The generated code calls the pthread mutex library.")
  if (/\b(?:mfence|sfence|lfence)\b/.test(assembly)) found.push("An explicit x86 memory-fence instruction is present.")
  return found
}
module.exports = { COMPILERS, examples, flags, compileRequest, compilationResult, compilerExplorerUrl, assemblyFindings }
