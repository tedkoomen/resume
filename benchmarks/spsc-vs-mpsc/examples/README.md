# Runnable article examples

These small C++20 programs are teaching examples. They are not the source of the published throughput data. The full benchmark is one directory above.

On Linux x86-64 with GCC:

```sh
mkdir -p /tmp/queue-examples
for source in *.cpp; do
  binary="/tmp/queue-examples/${source%.cpp}"
  g++ -std=c++20 -O2 -Wall -Wextra -Werror -pthread "$source" -o "$binary"
  timeout 20s "$binary"
done
```

- `spsc-handoff.cpp`: bounded ring with publication and storage-reuse handoffs.
- `layout-backoff.cpp`: actual member offsets and a capped x86 PAUSE/CAS loop.
- `spin-mutex.cpp`: the same protected counter using a spinlock and a mutex.
- `condition-queue.cpp`: producers block when full; consumer polls when empty.
- `measured-handoff.cpp`: a start barrier, consumer finish timestamp, sequence validation, and median across seven runs.

All programs return nonzero when their checks fail. They have no general shutdown or cancellation protocol. The SPSC examples use unsigned 64-bit counters and exercise only short runs. Alignment assumes 64-byte spacing; the PAUSE examples require x86. Do not use Compiler Explorer timing as a local-machine benchmark.

From the repository root, `python3 scripts/sync-queue-examples.py` updates the exact code embedded in the posts. Browser compiler panels allow editing, running, assembly inspection, and downloading each complete program.
