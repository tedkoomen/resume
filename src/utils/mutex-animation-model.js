// One legal schedule, not a FIFO guarantee or a model of elapsed time.
const frames = [
  { owner: null, value: 0, a: "Ready", b: "Ready", event: "Both threads need to increment the same counter." },
  { owner: "A", value: 0, a: "Owns mutex", b: "Ready", event: "A locks mtx. Only A may enter the protected increment." },
  { owner: "A", value: 0, a: "Owns mutex", b: "Waiting", event: "B calls lock on the same mutex. It cannot enter while A owns it." },
  { owner: "A", value: 1, a: "Incremented to 1", b: "Waiting", event: "A increments count from 0 to 1 while B waits." },
  { owner: null, value: 1, a: "Finished", b: "May acquire", event: "A leaves the scope and unlocks. B may acquire; a wakeup is not ownership." },
  { owner: "B", value: 1, a: "Finished", b: "Owns mutex", event: "B successfully locks mtx. A's unlock synchronizes with this acquisition." },
  { owner: "B", value: 2, a: "Finished", b: "Incremented to 2", event: "B increments the protected counter from 1 to 2." },
  { owner: null, value: 2, a: "Finished", b: "Finished", event: "B leaves the scope and unlocks. Two increments, final count 2." },
]
function mutexFrame(step) {
  return frames[Math.max(0, Math.min(frames.length - 1, Math.floor(step)))]
}
module.exports = { mutexFrame }
