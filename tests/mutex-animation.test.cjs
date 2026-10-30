const test = require("node:test")
const assert = require("node:assert/strict")
const { mutexFrame } = require("../src/utils/mutex-animation-model")

test("a counter write requires ownership and B cannot enter before A unlocks", () => {
  for (let step = 1; step <= 7; step++) {
    const before = mutexFrame(step - 1), after = mutexFrame(step)
    if (before.value !== after.value) {
      assert.ok(after.owner)
      assert.equal(before.owner, after.owner)
      assert.equal(after.value, before.value + 1)
    }
    if (after.b === "Waiting") assert.equal(after.owner, "A")
  }
  assert.equal(mutexFrame(4).owner, null, "unlock is not an immediate ownership handoff")
  assert.equal(mutexFrame(5).owner, "B")
  assert.equal(mutexFrame(7).value, 2)
  assert.equal(mutexFrame(7).owner, null)
})
