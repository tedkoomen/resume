const test = require("node:test")
const assert = require("node:assert/strict")
const {
  counterFrame,
  ioFrame,
  layoutFrame,
  latencyBudget,
} = require("../src/utils/article-animation-models")

test("read/replace loses an increment while the serialized updates preserve both", () => {
  assert.equal(counterFrame(2).b, "Read 0")
  assert.equal(counterFrame(6).value, 1)
  assert.equal(counterFrame(6).lost, true)
  assert.equal(counterFrame(3, true).b, "Waiting")
  assert.equal(counterFrame(3, true).lock, "A")
  assert.equal(counterFrame(4, true).lock, "B")
  assert.equal(counterFrame(6, true).value, 2)
  assert.equal(counterFrame(6, true).lock, null)
})
test("readiness serves other sockets without changing when A receives data", () => {
  assert.equal(ioFrame(3, false).done, 0)
  assert.equal(ioFrame(3, true).done, 3)
  for (let t = 0; t <= 9; t++) {
    assert.equal(
      ioFrame(t, false).jobs[0].ready,
      ioFrame(t, true).jobs[0].ready
    )
    assert.equal(ioFrame(t, false).jobs[0].done, ioFrame(t, true).jobs[0].done)
  }
  assert.equal(ioFrame(9, false).done, 4)
  assert.equal(ioFrame(6, true).done, 4)
})
test("price-only scan halves transferred bytes; scanning both fields removes that advantage", () => {
  const first = layoutFrame(1),
    prices = layoutFrame(2),
    both = layoutFrame(2, true)
  assert.equal(first.aos.useful, 32)
  assert.equal(first.soa.useful, 64)
  assert.equal(prices.aos.bytes, 128)
  assert.equal(prices.soa.bytes, 64)
  assert.equal(prices.aos.useful, prices.soa.useful)
  assert.equal(both.aos.bytes, both.soa.bytes)
  assert.equal(both.aos.useful, 128)
  assert.equal(both.soa.useful, 128)
  assert.equal(layoutFrame(0).aos.bytes, 0)
})
test("fixed network delay dilutes processing speedup without changing time saved", () => {
  const near = latencyBudget(10),
    far = latencyBudget(50)
  assert.equal(near.original, 10146.8)
  assert.equal(near.revised, 10007.5)
  assert.ok(Math.abs(near.original - near.revised - near.saved) < 1e-9)
  assert.ok(Math.abs(far.original - far.revised - near.saved) < 1e-9)
  assert.ok(near.processingSpeedup > 19)
  assert.ok(near.totalSpeedup < 1.014)
  assert.ok(far.totalSpeedup < near.totalSpeedup)
})
