---
path: '/blog/engineering/why-zig-server-framework'
date: '2026-03-06'
title: "Why I'm Building a Server Framework in Zig"
author: 'Ted Koomen'
dispatch: 17
description: 'F1 telemetry, low-latency trading, and choosing Zig over C++ and Rust'
posttype: 'engineering'
tag: ["zig", "systems-programming", "low-latency", "server"]
image: '../../images/engineering-post.png'
featuredImage: '../../images/engineering-post.png'
featured: true
snippet: "I've spent the last few months building a server framework in Zig. Not because the world needs another server framework, but because I wanted to understand how F1 telemetry and low-latency trading systems actually work. I chose Zig over C++ and Rust for specific reasons — comptime reflection, no CRTP, and freedom to prototype without fighting a borrow checker."
---

# Why I'm Building a Server Framework in Zig (and What I've Learned So Far)

I've spent the last few months building a server framework in Zig. Not because the world needs another server framework, but because I wanted to understand how the systems I admire actually work under the hood.

The systems I'm talking about are the ones that have strict latency requirements: F1 telemetry pipelines that process hundreds of sensors at 300+ Hz, market data platforms that ingest millions of messages per second from exchange feeds, trading systems where a microsecond of added latency is a measurable competitive disadvantage.

I don't work on those systems. But I wanted to understand the architecture that makes them possible. So I built one.

## The Inspiration

If you've ever watched an F1 race with the telemetry overlay, you're watching a real-time streaming system. Each car generates roughly 1,100 data points per second (tire temperatures, brake pressures, throttle position, G-forces) all flowing from sensors through the car's ECU, over radio to the pit wall, and into dashboards and strategy models. The data has to arrive fast, it has to arrive in order, and if a packet is lost, the system needs to know immediately.

Low-latency trading systems have a similar shape but tighter constraints. Exchange market data arrives as raw binary over UDP multicast (ITCH, MDP3, OUCH) at millions of messages per second. Each message type has its own binary layout. Missing a message means missing a trade. The entire pipeline from "bytes on the wire" to "decision made" needs to happen in single-digit microseconds. Now, for market data, much of this parsing is done at the hardware level, so this system would probably not be suitable for ultra low-latency requirements.

Both domains share the same fundamental architecture:

```
Raw binary data → Parse (zero-copy) → Route → Process → Publish
```

No garbage collection. No dynamic dispatch. No allocations in the hot path. Everything that can be decided before the data arrives is decided at compile time.

wanted to build a framework around that architecture. I started my engineering career with Rails and loved how it seemingly just worked™, with the important caveat that this was true as long as you stayed within the Rails pipeline.

That experience made me curious: could we bring some of that same safety and developer ergonomics to low-latency systems? These systems are inherently complex and highly sensitive, but I wanted to explore whether code generation and strong baseline configuration could provide similar guardrails, reducing footguns while still meeting the strict performance and reliability requirements they demand.
## Why Not C++?
But Ted, you've been obsessively learning C++ for the last few years, and you use it professionally, why Zig?

C++ was the obvious choice. It's the standard for low latency systems. But I had a specific problem with it: I wanted convention-based handler dispatch without virtual inheritance.

The pattern I had in mind was simple. You define a handler:

```
handler file → exports MESSAGE_TYPE, Context, handle()
```

The framework scans all handlers at compile time, validates their interfaces, and generates a dispatch table — no base classes, no vtables, no `register(handler)` calls. Just drop a file in the right folder.

In C++, you can get partway there with CRTP (the Curiously Recurring Template Pattern), but CRTP is verbose and error-prone. You end up writing more boilerplate than business logic. And for truly convention-based auto-discovery, where the framework finds and validates handler modules without explicit registration, you need compile-time reflection.

C++26 adds static reflection, which would have been perfect. But C++26 wasn't ratified when I started this project, and I didn't want to wait.

## Why Not Rust?

I didn't have the architecture figured out yet.

Rust is outstanding when you know your data models and ownership patterns upfront. Its borrow checker is a feature, not a bug, it forces you to think clearly about data flow. But that's exactly the problem when you're prototyping.

When I started, I didn't know whether handlers would own their contexts or borrow them. I didn't know if the message bus would use a ring buffer or a channel. I didn't know if events would be stack-allocated or heap-allocated, owned or shared. 

In my experience, Rust punishes exploratory programming (this may be a skill issue, or a personal problem). You fight the borrow checker not because your design is wrong, but because you haven't committed to a design yet. Every time you restructure ownership, which you do constantly during prototyping, you rewrite half the signatures in your call chain.

I needed a language that would let me move fast, restructure freely, and worry about ownership semantics when I understood the problem better. That's Zig.

## Why Zig

Zig gave me the three things I needed:

**1. Comptime reflection without virtual inheritance.**

Zig's `comptime` system lets you inspect types, iterate over struct fields, and generate code at compile time — all with the same syntax as runtime code (C++26 reflection is not like this). The handler dispatch I wanted is six lines:

```zig
inline for (handler_modules) |module| {
    if (message_type == module.MESSAGE_TYPE) {
        return module.handle(context, request, response, allocator);
    }
}
```

No vtables. No CRTP. No code generation step. The compiler unrolls this into a direct switch over concrete function calls. It's the code you'd write by hand if you were optimizing for throughput.

The same pattern powers everything else in the framework: gRPC service routing, binary protocol dispatch for UDP feeds, topic validation in the message bus. One pattern, used everywhere, resolved entirely at compile time.

**2. Explicit memory control without a borrow checker.**

Zig makes allocations visible. Every function that allocates takes an `Allocator` parameter. There's no hidden `malloc` behind a method call, no implicit copy constructor, no move semantics to reason about. When I see `allocator.alloc(u8, 4096)`, I know exactly what's happening and what it costs.

This matters for the hot path. In the request processing loop, there are zero heap allocations. Response buffers come from a pre-allocated pool. Connection state is stack-allocated. The only allocation per request is the one we deliberately choose: copying event data for the message bus when the event needs to outlive the handler's stack frame.

**3. Freedom to prototype.**

Zig doesn't have a borrow checker. It doesn't have RAII. You manage memory manually, and if you get it wrong, you get a use-after-free at runtime instead of a compile error.

That's a real tradeoff. Rust would have caught entire categories of bugs that I had to find with testing. But it also would have slowed me down during the months when I was reshaping the architecture weekly, changing whether events were owned or borrowed, whether the ring buffer was SPSC or MPMC, whether handlers held state or were stateless.

Now that the architecture has stabilized, I sometimes wish I had Rust's guarantees. But I wouldn't have arrived at this architecture as quickly if I'd had to satisfy the borrow checker at every intermediate step.

## What I Built

The framework, I'm calling it Zails (unless I get hit with a TM, then I'll figure it out), has five major subsystems:

**TCP server with epoll workers.** Non-blocking I/O, NUMA-aware thread placement, lock-free connection pools. This was the first thing I built, and the first thing I got wrong, the original blocking I/O design topped out at 12 requests per second before I rewrote it with epoll. (That's a story for the next post.)

**Comptime handler dispatch.** Drop a `.zig` file in `handlers/`, export a `MESSAGE_TYPE` and a `handle()` function, rebuild. The framework discovers it, validates its interface, and wires it into the dispatch table, all at compile time. Adding a handler is one file and zero lines of registration code.

**A lock-free message bus.** Ring buffer event queue, atomic subscriber registry, background worker threads for delivery. Handlers publish events and subscribe to topics without knowing about each other. The publish path is lock-free, under 1 microsecond.

**UDP feed ingestion with comptime binary protocol parsing.** You define a binary protocol as a list of field offsets and types. The compiler generates a zero-copy parser that compiles down to a handful of load instructions. An ITCH AddOrder message (38 bytes, 9 fields) parses in under 100 nanoseconds.

**A ClickHouse ORM.** ActiveRecord-style models with a fluent query builder. Stack-allocated query construction, ClickHouse-optimized SQL generation. This part is the most "Rails-like" — you define a model with field types and get `where`, `orderBy`, `limit` for free.

Why ClickHouse? In systems like these, especially those handling financial transactions, auditing is critical. This also applies to telemetry systems, where you may want to query a very large data set (think storing a car's race telemetry over the course of a season). ClickHouse is a strong fit for this use case. Its performance characteristics and analytical capabilities make it well-suited for storing and querying large volumes of event data with low overhead.

I was also exploring the idea of running the server with an embedded or tightly coupled database responsible for persisting configuration. This would allow certain configurations to be updated at runtime, while also serving as a durable store for system metrics. Together, this approach could provide both operational flexibility and robust observability without compromising performance.
## What I've Learned

Three things stand out after a few months of work:

**Architecture dominates optimization.** The single biggest performance gain wasn't a clever data structure or a cache-line alignment trick. It was switching from blocking I/O to event-driven I/O , a 1,139x throughput improvement. All the micro-optimizations I did afterward combined for maybe 25% on top. Get the architecture right first.

**Comptime is a superpower with limits.** Zig's comptime system is genuinely remarkable for building frameworks. The handler dispatch, the protocol parser, the service registry, they're all clean, readable code that happens to run in the compiler. But comptime has rough edges: error messages when you get types wrong can be cryptic, and there's no way to do comptime I/O (so you can't auto-discover handler files without a build step). It's powerful, but it's not magic.

**The hot path is smaller than you think.** In a server that processes 13,000+ requests per second, the actual request processing — parsing, dispatching, serializing, takes about 2 microseconds. The other 607 microseconds (on loopback) are kernel overhead, TCP stack processing, and context switches. The code you write matters less than the syscalls you make and the architecture you choose.

## What's Next

This is the first post in a series. Here's what's coming:

- **Post 2:** How comptime handler dispatch works, and why `inline for` is the most underrated feature in Zig
- **Post 3:** The debugging story of going from 12 req/s to 13,667 req/s by fixing head-of-line blocking
- **Post 4:** Building a zero-copy binary protocol parser at compile time for market data feeds
- **Post 5:** Lock-free data structures in the message bus, ring buffers, atomic registries, and memory ordering
- **Post 6:** UDP multicast ingestion, from exchange socket to subscriber callback
- **Post 7:** The full architecture, how it all fits together, and what's still missing

The code is open source. It's a pet project, not production software.but the architectural patterns are real. If you're interested in low-latency systems, comptime metaprogramming, or just building things to understand how they work, I hope you'll find something useful here.
