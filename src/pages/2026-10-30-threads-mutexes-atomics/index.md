---
path: '/blog/engineering/threads-mutexes-and-atomics'
date: '2026-10-30'
title: 'Threads, Mutexes, and Atomics: Start With What Can Go Wrong'
author: 'Ted Koomen'
description: 'How threads share memory, what a mutex actually does on Linux, and why replacing locks with atomics is not automatically an optimization.'
posttype: 'engineering'
tag: ['cpp', 'concurrency', 'linux', 'performance', 'atomics']
image: '../../images/social-threads-mutexes-atomics.png'
featuredImage: '../../images/social-threads-mutexes-atomics.png'
featured: true
snippet: 'Adding threads is easy, but making them cooperate correctly and proving they made anything faster takes more work.'
takeaways:
  - 'Shared memory makes communication convenient while leaving you responsible for coordinating access.'
  - 'Mutexes protect critical sections; atomics need a protocol around them.'
  - 'Contention and cache traffic do not disappear when you remove a lock.'
---

This series is about inter-thread communication and synchronization: how threads share work, how they get in each other's way, and what we can do about it.

I want to get past “put a mutex here” and “atomics are faster.” We will look at what the code guarantees, what the operating system does, and what is happening on the CPU. Those are related questions, but they are not interchangeable.

This first post starts with processes and threads, then works through mutexes, atomics, memory ordering, and a few ways all of this can go wrong. The next part will put those ideas into actual implementations and measure them. Adding threads does not, by itself, make a program faster.

The examples use C++20. You can run the working examples below and inspect their x86-64 assembly through Compiler Explorer. The deliberately broken examples are compile-only. Printing happens outside the worker hot paths so it does not introduce an extra shared I/O bottleneck. The implementation discussion focuses on Linux, with some x86 and Arm details where they matter.

## First, what is a thread?

A process is a running instance of a program. It has a virtual address space and resources managed by the operating system: open files, memory mappings, and so on.

A thread is a path of execution inside that process. Each thread has its own execution state, including registers, a stack, and thread-local storage. Threads in the same process share the address space, so they can access the same heap objects and global variables.

“Its own stack” does not mean that stack is protected from the other threads. If you pass another thread a pointer to a local variable, it can access that memory. Keeping the object alive and coordinating access are still your responsibility.

That shared address space is both the appeal and the problem. Passing data to another thread can be as simple as handing it a pointer. Making sure the other thread sees valid data, at the right time, is where the work starts.

### Software threads and hardware threads

The word *thread* also gets used for hardware, which makes this more confusing than it needs to be.

An OS thread is something the scheduler can run. A hardware thread is an execution context exposed by the processor, often called a logical CPU. With simultaneous multithreading, or SMT, a physical core exposes multiple logical CPUs that share many of the core's resources. Hyper-Threading is Intel's name for its SMT implementation.

The operating system schedules runnable software threads onto those logical CPUs, subject to affinity and other scheduling constraints. You can have far more software threads than logical CPUs; they just cannot all execute at once.

Two SMT siblings are not two full cores. They share execution resources, and running work on both can help utilization or create contention. Whether it helps your workload is something to measure, especially if you care about latency.

### Linux makes the relationship explicit

Linux represents schedulable threads as tasks. Each has a thread ID, or TID. Threads in the same process belong to a thread group and share its thread-group ID, which is what `getpid()` returns.

The `clone()` and `clone3()` interfaces let the caller specify which resources a new task shares. For example, `CLONE_VM` shares the address space, `CLONE_FILES` shares the file-descriptor table, and `CLONE_THREAD` places the new task in the same thread group. Other flags and setup handle things such as signal handlers, thread-local storage, and thread termination.

So yes, processes and threads are closely related in Linux. But a short `clone(flags, ...)` expression is not a complete thread implementation, and it is not the API I would reach for in ordinary C++. Use `std::thread`, `std::jthread`, or the platform thread library and let it handle the machinery. The [Linux clone documentation](https://man7.org/linux/man-pages/man2/clone.2.html) is useful if you want to look underneath that abstraction.

## Why use threads instead of processes?

Threads are useful when work can overlap. A server might have one thread waiting for input while workers process requests. Independent CPU work can run on separate cores. A background task can keep a user-facing thread responsive.

None of that guarantees a speedup. If every worker immediately queues behind the same mutex, adding workers mostly gives you a longer queue. Thread creation, scheduling, synchronization, cache traffic, and memory bandwidth all cost something. Async I/O is another option when the real problem is waiting on lots of connections rather than doing CPU work.

I would generally consider threads when tasks need to share substantial in-memory state and belong in the same failure domain. An unhandled fatal fault in one thread will normally take down the process. There is no isolation boundary between your parser thread and your order-processing thread just because they have different names.

Separate processes give you stronger isolation. Their address spaces are separate by default, which helps contain accidental memory corruption and lets you restart components independently. They can also run with different permissions.

Communication between processes can involve system calls and copying, but it does not have to copy every payload. Shared-memory IPC lets processes access the same mapped storage. At that point, you have brought back many of the synchronization problems you were trying to separate, along with questions about what happens if a process dies.

Pick the ownership and failure boundaries first. Then decide how the work should execute and communicate.

## A shared counter is already enough to break things

Here is a very small program with a real correctness problem:

```cpp
#include <iostream>
#include <thread>
#include <vector>

int count = 0;

void increment_count() {
    ++count;
}

int main() {
    std::vector<std::thread> threads;
    threads.reserve(10);

    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment_count);
    }
    for (auto& thread : threads) {
        thread.join();
    }

    std::cout << "Final count: " << count << '\n';
}
```

<div data-cpp-example="data-race">
  <p>Compile-only example: this program deliberately has undefined behavior.</p>
</div>

`++count` looks like one operation in the source. That does not make it an atomic operation between threads.

One way to picture the failure is two threads reading the same value, both adding one, and both writing the same result. An increment disappears. That is a useful illustration, but it is not the full C++ rule.

These are conflicting non-atomic accesses with no happens-before relationship between them. That is a **data race**, and a C++ data race is undefined behavior. The language does not promise that the only possible outcome is a slightly wrong count. It does not promise a particular range of results at all.

The program might print `10` every time you try it. That would not make it correct. Joining the workers makes the final read safe relative to their completion; it does not fix the unsynchronized accesses between the workers.

“Race condition” is a broader term for correctness depending on timing. A data race is a specific language-level problem. You can eliminate data races with atomics and still have a broken algorithm.

## Start with a mutex

A mutex gives one thread ownership at a time. Every access that needs protection must follow the same locking rule. The mutex does not inspect your variables or stop another thread from ignoring it.

Here is the corrected program:

```cpp
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

int count = 0;
std::mutex mtx;

void increment_count() {
    std::lock_guard<std::mutex> lock(mtx);
    ++count;
}

int main() {
    std::vector<std::thread> threads;
    threads.reserve(10);

    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment_count);
    }
    for (auto& thread : threads) {
        thread.join();
    }

    std::cout << "Final count: " << count << '\n';
}
```

<div data-cpp-example="mutex-counter">
  <p>Runnable C++20 example. Compile locally with g++ -std=c++20 -O2 -pthread example.cpp -latomic.</p>
</div>

`std::lock_guard` acquires the mutex when it is constructed and releases it when it is destroyed. That includes leaving the scope through normal exception unwinding. I do not want every return path to depend on somebody remembering to call `unlock()`.

Now only one worker can execute the increment at a time. Unlocking the mutex also synchronizes with a subsequent successful lock of that mutex, so the next owner can observe the previous owner's protected writes.

This makes the critical section exclusive relative to other code taking the same mutex. It does not turn the whole function into one CPU instruction. After all ten workers have joined, the count is `10`.

<div data-concept-animation="mutex">
  <p><strong>How two threads take turns with a mutex.</strong> A locks the mutex. B attempts to lock it and waits. A increments the counter from 0 to 1, then unlocks. B can acquire the mutex, increment from 1 to 2, and unlock. Unlocking makes acquisition possible; it does not guarantee an immediate handoff.</p>
</div>

## Mutexes can still get you into trouble

Consider this:

```cpp
#include <iostream>
#include <mutex>

struct Oops {
    void dead() {
        std::lock_guard<std::mutex> lock(mtx);
        lock_again();
    }

    void lock_again() {
        std::lock_guard<std::mutex> lock(mtx);
    }

    std::mutex mtx;
};

int main() {
    Oops o;
    std::cout << "About to re-lock a mutex owned by this thread: undefined behavior."
              << std::endl;
    o.dead();
}
```

<div data-cpp-example="recursive-lock">
  <p>Compile-only example: this program deliberately has undefined behavior.</p>
</div>

The thread already owns `mtx` when `lock_again()` tries to acquire it.

With `std::mutex`, that violates the locking precondition and gives you undefined behavior. A self-deadlock is a common result, but “this must block forever” is not a portable guarantee. An implementation may detect the problem instead. The [C++ mutex requirements](https://eel.is/c++draft/thread.mutex.requirements) spell out that precondition.

A different deadlock involves two threads and two mutexes: A owns the first and waits for the second, while B owns the second and waits for the first. Neither can reach its unlock. Consistent lock ordering helps; when you need to acquire multiple mutexes together, `std::scoped_lock` provides deadlock avoidance for that acquisition. It cannot fix every cycle elsewhere in your program.

### What about a recursive mutex?

`std::recursive_mutex` allows the owning thread to lock it again. Each successful lock needs a matching unlock; another thread cannot acquire it until the owner has released every level.

It solves that specific re-entry problem. It does not solve deadlocks between different mutexes, and it does not make it safe for a nested call to observe an object halfway through an update.

When I see a recursive mutex, my first question is why the ownership boundary requires it. Sometimes there is a reasonable answer. Often I would rather have a public method that takes the lock and a private helper that assumes the caller already holds it.

## What the mutex does on Linux

Is a mutex software or hardware? It is a software abstraction whose implementation usually relies on both CPU atomic operations and operating-system support.

For a typical ordinary mutex on Linux, the uncontended path happens in **user space**. The library attempts to acquire the lock using atomic operations. The kernel does not run first on every lock attempt.

When the mutex is contended, the implementation may spin briefly or go to a blocking path. Common Linux implementations use a **futex**, short for fast user-space mutex, to let the kernel park a waiter and wake it when appropriate. The futex wait checks the expected value as part of blocking, which is important for avoiding a lost wakeup between checking the lock and going to sleep.

The blocked thread does not normally wake up on a timer just to keep checking. An unlock can trigger a wakeup, and the waiter then retries as required by the algorithm. Spurious wakeups and other returns are also possible; being woken is not the same as owning the mutex.

That distinction matters for latency. A woken thread must become runnable and get scheduled, then successfully acquire the lock. Another contender may get there first. `std::mutex` does not promise FIFO acquisition.

The exact behavior depends on the library, mutex type, and platform. But “every lock is a system call” is the wrong starting point. So is “a mutex is cheap because the uncontended case is cheap.” Contention changes the picture. The [Linux futex overview](https://man7.org/linux/man-pages/man7/futex.7.html) and [futex system-call reference](https://man7.org/linux/man-pages/man2/futex.2.html) cover the underlying mechanism.

## An atomic counter

Go back to [the original counter](#a-shared-counter-is-already-enough-to-break-things). We only need to increment one number. We can express that directly:

```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<int> counter{0};

void increment() {
    counter.fetch_add(1, std::memory_order_relaxed);
}

int main() {
    std::vector<std::thread> threads;
    threads.reserve(10);

    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment);
    }
    for (auto& thread : threads) {
        thread.join();
    }

    std::cout << "Final counter value: "
              << counter.load(std::memory_order_relaxed) << '\n';
}
```

<div data-cpp-example="atomic-counter">
  <p>Runnable C++20 example. Compile locally with g++ -std=c++20 -O2 -pthread example.cpp -latomic.</p>
</div>

`fetch_add` is an atomic read-modify-write operation: read the old value, add one, and replace it as one indivisible operation on that atomic object. Another increment cannot slip between its read and write and cause a lost update.

That fixes our counter, but there is considerably more to using atomics correctly.

An atomic variable does not make an entire algorithm atomic. Loading an atomic, computing a replacement, and storing it are still separate operations unless you use an appropriate read-modify-write operation or another protocol. Likewise, making two fields atomic does not guarantee that a reader gets a consistent snapshot of both.

And `std::atomic<T>` is not universally lock-free. Some types and targets require a library implementation that may use locks. If lock-freedom is a requirement, check `is_lock_free()` or `is_always_lock_free` for the actual type and platform.

## What relaxed actually means

`std::memory_order_relaxed` preserves atomicity. Modifications to that atomic object still have a single modification order. What it does not provide is an acquire/release synchronization relationship that publishes other memory accesses.

For this counter, that is enough. Every worker performs one indivisible increment. We are not using the counter to announce that a separate object is ready, and we read the result only after joining all the workers. The final value is `10`.

The important distinction is between updating the number correctly and using that number to communicate something about other data.

Compilers and CPUs can reorder work within the rules they must preserve. The C++ memory model gives us a portable way to specify the required relationships. Those C++ rules do not change when we move from x86 to Arm; the instructions needed to implement them can change.

For ordinary cacheable memory, x86 has a relatively strong memory model, commonly described as TSO. It still allows a store followed by a load of a different location to behave differently from a simple global source-order execution. Arm permits more hardware reordering. Neither architecture makes a C++ data race valid, and code that happens to work on your x86 machine is not proof of correctness.

## Acquire and release do not lock memory

Here is a more useful synchronization example than another counter. One thread prepares a payload; another waits until it is ready:

```cpp
#include <atomic>
#include <cassert>
#include <iostream>
#include <thread>

int payload = 0;
std::atomic<bool> ready{false};

void producer() {
    payload = 42;
    ready.store(true, std::memory_order_release);
}

void consumer() {
    while (!ready.load(std::memory_order_acquire)) {
        // Busy-waiting for this small demonstration.
    }
    assert(payload == 42);
}

int main() {
    std::thread reader(consumer);
    std::thread writer(producer);
    writer.join();
    reader.join();
    std::cout << "Consumer observed payload: " << payload << '\n';
}
```

<div data-cpp-example="publication">
  <p>Runnable C++20 example. Compile locally with g++ -std=c++20 -O2 -pthread example.cpp -latomic.</p>
</div>

The payload is not atomic. That is safe here because the release store and the acquire load establish the relationship we need.

When the acquire load reads the `true` written by the release store, that store **synchronizes with** the load. The write to `payload` before the store therefore happens before the read of `payload` after the load. With no later writes to the payload, the consumer reads `42`.

<figure class="synchronization-figure">
  <picture>
    <source media="(max-width: 640px)" srcset="/diagrams/release-acquire-mobile.svg" width="440" height="760" />
    <img src="/diagrams/release-acquire.svg" width="900" height="640" loading="lazy" alt="Producer writes payload = 42, then stores ready = true with release. Consumer repeats acquire loads until one reads that true, then reads payload = 42. The release store synchronizes with the acquire load that reads it, so the payload write happens before the payload read." />
  </picture>
  <figcaption>The load must observe this publication. Merely using acquire and release somewhere in the program is not enough.</figcaption>
</figure>

There is no memory lock in that example. Acquire and release constrain ordering and establish synchronization when the operations connect correctly. For this simple case, the acquire reads directly from the release store; the language also defines release sequences, which matter in more involved protocols.

If you change both flag operations to relaxed, you lose that synchronization. The flag itself is still atomic, but the non-atomic payload accesses are no longer ordered between the threads. That is a data race, not merely permission to read a stale payload.

This is a **one-shot handoff**. The producer writes once and does not reuse or overwrite the payload while the consumer reads it. Reusing the storage requires another protocol. The spin loop is also a teaching example, not a recommendation to burn a core waiting for arbitrary amounts of time.

You will also see `memory_order_acq_rel`, which combines acquire and release semantics for read-modify-write operations, and `memory_order_seq_cst`, the default for most C++ atomic operations. Sequentially consistent operations participate in an additional single total order. That can make some reasoning easier, but it still does not turn a sequence of operations into a transaction. The [C++ ordering rules](https://eel.is/c++draft/atomics.order) are the contract here.

## What the CPU is doing

Atomic does not necessarily mean “special instruction.” On many targets, a suitably aligned atomic load or store can use an ordinary load or store instruction, with the compiler enforcing the required restrictions and adding barriers where necessary.

Atomic read-modify-write operations need stronger machinery. On x86, a fetch-add can use `LOCK XADD`; if the previous value is unused, the compiler may choose a different instruction such as `LOCK ADD`. Compare-and-swap commonly uses `LOCK CMPXCHG`.

On AArch64, implementations may use exclusive load/store loops such as `LDXR`/`STXR` and their ordering variants, or Large System Extensions instructions such as `LDADD` and `CAS` when the target supports them. `LDREX`/`STREX` are names you will see in AArch32 examples. The compiler, target options, and memory order all affect the output.

For ordinary cacheable memory, the CPU's coherence machinery helps enforce exclusive access to the relevant cache line. That does not mean every atomic operation locks the memory bus or flushes everything to RAM. Nor does a protocol such as MESI or MOESI, by itself, make a C++ expression atomic or publish writes to unrelated locations.

What you do pay for under contention is coordination. If many cores keep modifying one counter, they contend for write ownership of the line containing it. Replacing a mutex with an atomic does not remove that shared hotspot.

## A compare-and-swap loop

Okay, Ted, that is a lot of words. What if the update is more involved than `fetch_add`?

A compare-and-swap operation, or CAS, says: replace the current value with `desired`, but only if it still matches `expected`.

Here is the counter written as a CAS loop. I would use `fetch_add` for the real counter; the loop is here to show the mechanism.

```cpp
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>

std::atomic<std::uint64_t> counter{0};

void increment() {
    auto expected = counter.load(std::memory_order_relaxed);
    for (;;) {
        const auto desired = expected + 1;
        if (counter.compare_exchange_weak(
                expected, desired,
                std::memory_order_relaxed,
                std::memory_order_relaxed)) {
            return;
        }
        // Failure updates expected. Recompute desired from that value.
    }
}

int main() {
    std::vector<std::thread> workers;
    for (int i = 0; i < 4; ++i) {
        workers.emplace_back([] {
            for (int n = 0; n < 1000; ++n) increment();
        });
    }
    for (auto& worker : workers) worker.join();
    std::cout << "CAS counter: " << counter.load() << " (expected 4000)\n";
}
```

<div data-cpp-example="cas-counter">
  <p>Runnable C++20 example. Compile locally with g++ -std=c++20 -O2 -pthread example.cpp -latomic.</p>
</div>

If another thread changes the counter first, the comparison fails and `expected` is updated with the value observed by the failed operation. We recompute and retry. `compare_exchange_weak` can also fail spuriously, even when the values match, which is why it belongs in a retry loop here.

Both memory orders are relaxed because this is still just a counter. A release operation would not buy us anything in this example. In a publication protocol, the success and failure orders must follow that protocol's requirements; a failed CAS is a load and cannot have release or acquire-release ordering.

The unsigned counter wraps modulo its range. If wrapping is unacceptable for your application, that needs handling too.

CAS is a building block for lock-free algorithms, not a certificate that the surrounding code is lock-free. You must consider the atomic implementation and every other operation in the algorithm. Lock-free progress also does not mean each thread finishes within a bounded number of attempts. One thread can keep losing the race and retrying.

## ABA: the value changed and came back

CAS compares the current value without telling you whether it changed in the meantime.

Suppose a thread reads A. Another thread changes the value from A to B and then back to A. The first thread's CAS can succeed because the current value matches, even though something important happened in between.

That matters when the algorithm assumes “same value” means “same state.” A linked stack is a classic example: a node can be removed and reinserted while another thread still holds an old view of its successor. A CAS on the head pointer alone cannot validate that old view.

ABA is not automatically a problem for every CAS loop. The counter above only needs to increment the current number. It does not depend on the number having remained unchanged throughout its history.

One defense is to compare a value and a version together:

```cpp
#include <atomic>
#include <cstdint>
#include <iostream>

struct VersionedState {
    std::uint32_t value;
    std::uint32_t version;
};

std::atomic<VersionedState> state{VersionedState{0, 0}};

void set_value(std::uint32_t value) {
    auto expected = state.load(std::memory_order_relaxed);
    for (;;) {
        const VersionedState desired{
            value, static_cast<std::uint32_t>(expected.version + 1u)
        };
        if (state.compare_exchange_weak(
                expected, desired,
                std::memory_order_relaxed,
                std::memory_order_relaxed)) {
            return;
        }
    }
}

int main() {
    set_value(10);  // A
    auto stale = state.load(std::memory_order_relaxed);
    set_value(20);  // B
    set_value(10);  // A again, but with a different version

    const VersionedState desired{30, stale.version + 1u};
    const bool accepted = state.compare_exchange_strong(
        stale, desired, std::memory_order_relaxed, std::memory_order_relaxed);
    const auto current = state.load(std::memory_order_relaxed);
    std::cout << std::boolalpha
              << "Stale CAS accepted: " << accepted << '\n'
              << "Current value: " << current.value
              << ", version: " << current.version << '\n'
              << "Lock-free on this target: " << state.is_lock_free() << '\n';
}
```

<div data-cpp-example="versioned-state">
  <p>Runnable C++20 example. Compile locally with g++ -std=c++20 -O2 -pthread example.cpp -latomic.</p>
</div>

The demo prints `Stale CAS accepted: false`, followed by value `10` and version `3`. It deliberately uses a strong CAS for this one attempt so a spurious failure cannot explain the result.

Before the version wraps, going from `{A, 7}` to `{B, 8}` to `{A, 9}` will not fool a CAS expecting `{A, 7}`. The comparison covers both fields as one atomic value. Two independent atomic fields would not give us that property.

This example only updates the state shown; it does not publish a separate payload. It also has limits: the version can wrap, and `std::atomic<VersionedState>` is not guaranteed to be lock-free. A tag does not keep a removed node alive. Pointer-based structures still need a correct memory-reclamation strategy, such as an appropriate hazard-pointer or epoch scheme.

That is already considerably more design work than “just replace the mutex.”

## False sharing: different variables, the same cache line

Now suppose each worker has its own counter and never updates another worker's variable. That can address the data race, but the counters' placement in memory can still hurt performance.

Cache coherence generally operates on cache lines, not individual C++ variables. If two cores repeatedly write different variables on the same line, the line can move between their caches even though the variables are logically independent. That is false sharing.

Here is a way to separate independently updated counters on a target where a 64-byte separation is appropriate:

```cpp
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

struct alignas(64) PaddedCounter {
    std::atomic<std::uint64_t> value{0};
};

PaddedCounter counters[2];

void worker_a() {
    counters[0].value.fetch_add(1, std::memory_order_relaxed);
}

void worker_b() {
    counters[1].value.fetch_add(1, std::memory_order_relaxed);
}

int main() {
    std::thread a([] { for (int n = 0; n < 1000; ++n) worker_a(); });
    std::thread b([] { for (int n = 0; n < 1000; ++n) worker_b(); });
    a.join();
    b.join();
    std::cout << "Worker A: " << counters[0].value.load() << '\n'
              << "Worker B: " << counters[1].value.load() << '\n'
              << "Counter alignment: " << alignof(PaddedCounter) << " bytes\n"
              << "Array element stride: " << sizeof(PaddedCounter) << " bytes\n";
}
```

<div data-cpp-example="padded-counters">
  <p>Runnable C++20 example. Compile locally with g++ -std=c++20 -O2 -pthread example.cpp -latomic.</p>
</div>

This prints both counters and the actual alignment and stride. It checks the layout; it is not a benchmark of false sharing.

The alignment also makes the structure's size a multiple of that alignment, keeping adjacent array elements separated accordingly. But `64` is a target assumption, not a universal cache-line size. C++ also provides `std::hardware_destructive_interference_size` in `<new>` as an implementation-defined spacing value where supported. Be careful about using target-dependent layout constants across binary interfaces.

Aligning a structure does not separate fields *inside* it. If two hot fields remain next to each other within one padded object, they can still share a line. Padding also increases memory use and may hurt cache locality elsewhere.

False sharing is not exclusive to atomics. Ordinary per-thread variables can suffer from it too. And if all threads update the same counter, that is true sharing; padding will not make the contention disappear.

## What I would take away from this

If somebody says, “I know how to make this faster: get rid of the mutexes and use atomics,” my next question is what they measured.

A mutex gives you a relatively straightforward ownership boundary. Atomics can be the right tool for a counter, a publication flag, or a carefully designed communication protocol. They also move more of the correctness argument into your algorithm. You need to know who owns the data, what makes it safe to read, and when it can be reused.

Before changing the primitive, I would look at why the state is shared in the first place. Can one thread own it? Can updates be batched? Can workers accumulate local results instead of fighting over one cache line? Those choices can matter more than the instruction used to update the counter.

That is where the next post will go: actual implementations, contention, and measurements. We will write down what must stay true, make the code satisfy it, and then see whether it is faster. Before calling the removal of a mutex an optimization, we need evidence that it actually improved performance.

## References

- [C++ data races and the happens-before relationship](https://eel.is/c++draft/intro.races)
- [C++ mutex requirements](https://eel.is/c++draft/thread.mutex.requirements)
- [C++ atomic ordering](https://eel.is/c++draft/atomics.order) and [atomic operations](https://eel.is/c++draft/atomics.types.operations)
- [Linux clone and clone3](https://man7.org/linux/man-pages/man2/clone.2.html)
- [Linux futex overview](https://man7.org/linux/man-pages/man7/futex.7.html) and [system-call semantics](https://man7.org/linux/man-pages/man2/futex.2.html)
- [Intel Software Developer's Manuals](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
- [Arm atomic operations ABI and AArch64 instruction mappings](https://github.com/ARM-software/abi-aa/blob/main/atomicsabi64/atomicsabi64.rst)
