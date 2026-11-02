const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const { topologyFrame, cacheFrame, schedulerFrame } = require("../src/utils/queue-animation-models")
const { examples } = require("../src/utils/cpp-examples")

test("queue illustrations conserve accepted messages and equal aggregate capacity", () => {
  for (const shared of [false, true]) {
    for (let step = 0; step <= 7; step++) {
      const f = topologyFrame(step, shared)
      assert.equal(f.queues.length * f.capacity, 4)
      f.queues.forEach(q => assert.ok(q.length <= f.capacity))
      const messages = [...f.queues.flat(), ...f.consumed]
      assert.equal(new Set(messages).size, messages.length)
      const expected = step < 3 ? step : step === 3 ? (shared ? 3 : 2) : f.blocked ? 3 : 4
      assert.equal(messages.length, expected)
    }
  }
  assert.equal(topologyFrame(3, false).blocked, true)
  assert.equal(topologyFrame(3, true).blocked, false)
  assert.deepEqual(topologyFrame(7, false).consumed, ["A0", "B0"])
  assert.deepEqual(topologyFrame(7, true).consumed, ["A0", "A1"])
})
test("cache model separates initial ownership from subsequent writer transfers", () => {
  assert.equal(cacheFrame(1, false).transfers, 0)
  assert.equal(cacheFrame(4, false).transfers, 3)
  assert.equal(cacheFrame(4, true).transfers, 0)
  assert.deepEqual(cacheFrame(4, true).owners, ["A", "B"])
})
test("waiter never acquires while A owns the lock, and wakeup is not ownership", () => {
  for (const blocking of [false, true]) {
    for (let step = 0; step < 7; step++) assert.notEqual(schedulerFrame(step, blocking).owner, "B")
    assert.equal(schedulerFrame(7, blocking).owner, "B")
  }
  assert.equal(schedulerFrame(3, true).b, "blocked")
  assert.equal(schedulerFrame(5, true).owner, "none")
  assert.equal(schedulerFrame(5, true).b, "runnable")
})
test("article programs exactly match their runnable standalone sources", () => {
  const ids = []
  for (const dir of fs.readdirSync("src/pages").filter(d => d.startsWith("2026-10-31-"))) {
    const article = fs.readFileSync(`src/pages/${dir}/index.md`, "utf8")
    for (const [, code, id] of article.matchAll(/```cpp\n([\s\S]*?)```\s*<div data-cpp-example="([^"]+)"/g)) {
      assert.ok(examples[id]?.run)
      assert.equal(code.trim(), fs.readFileSync(`benchmarks/spsc-vs-mpsc/examples/${id}.cpp`, "utf8").trim())
      ids.push(id)
    }
  }
  assert.ok(ids.length > 0)
  assert.equal(new Set(ids).size, ids.length)
})
