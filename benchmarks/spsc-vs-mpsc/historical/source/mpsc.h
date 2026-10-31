#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <atomic>
#include <utility>
#include <immintrin.h>
#include "./concepts.h"

// Every hot atomic gets its own cache line: producers CAS head_, the consumer
// owns tail_, and each slot's sequence number is written by one producer and
// read by the consumer, so adjacent slots must not false-share either. Build
// with -DMPSC_CACHE_LINE=8 to get the natural (packed) layout.
#ifndef MPSC_CACHE_LINE
#define MPSC_CACHE_LINE 64
#endif

// What a producer does after losing a race for head_:
//   0 - retry immediately (pure spin)
//   1 - one _mm_pause() per lost race
//   2 - exponential backoff: 1, 2, 4, ... up to MPSC_MAX_BACKOFF pauses
#ifndef MPSC_BACKOFF
#define MPSC_BACKOFF 1
#endif
#ifndef MPSC_MAX_BACKOFF
#define MPSC_MAX_BACKOFF 16
#endif

// With -DMPSC_STATS, each thread counts how many times it lost a race for
// head_ (failed CAS or slot already claimed). Off by default: it adds a
// thread-local increment to the contended path.
#ifdef MPSC_STATS
inline thread_local std::uint64_t mpsc_contended_retries = 0;
#endif

// Bounded multi-producer / single-consumer queue (Vyukov-style). Producers
// claim a slot by CAS on head_, spinning on the CAS with no pause/backoff.
// Each slot carries a sequence number: seq == pos means the slot is free for
// the producer claiming position pos; seq == pos + 1 means it holds that
// producer's value and is ready for the consumer.
// BufferSize must be at least 2: with one slot, "full with position p"
// (seq == p + 1) and "free for position p + 1" (seq == p + 1) are the same
// value, so a producer would overwrite a value the consumer has not read yet.
template <typename T, std::size_t BufferSize>
  requires IsPositivePowerOfTwo<BufferSize> && (BufferSize >= 2)
class MpscQueue
{
  public:
    MpscQueue()
    {
        for (std::size_t i = 0; i < BufferSize; ++i)
        {
            buffer_[i].seq.store(i, std::memory_order_relaxed);
        }
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }

    bool push(T&& val)
    {
        size_t head = head_.load(std::memory_order_relaxed);
        [[maybe_unused]] unsigned pauses = 1;
        Slot* slot;

        for (;;)
        {
            slot = &buffer_[head & kMask];
            const size_t seq = slot->seq.load(std::memory_order_acquire);
            const auto diff = static_cast<std::intptr_t>(seq) - static_cast<std::intptr_t>(head);

            if (diff == 0)
            {
                // On failure compare_exchange_weak reloads head.
                if (head_.compare_exchange_weak(head, head + 1, std::memory_order_relaxed))
                {
                    break;
                }
                contended(pauses);
            }
            else if (diff < 0)
            {
                // The consumer hasn't freed this slot from the previous lap.
                return false;
            }
            else
            {
                // Another producer already claimed this position.
                contended(pauses);
                head = head_.load(std::memory_order_relaxed);
            }
        }

        slot->value = std::move(val);
        slot->seq.store(head + 1, std::memory_order_release);
        return true;
    }

    bool pop(T& outVal)
    {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        Slot& slot = buffer_[tail & kMask];

        if (slot.seq.load(std::memory_order_acquire) != tail + 1)
        {
            return false;
        }

        outVal = std::move(slot.value);
        slot.seq.store(tail + BufferSize, std::memory_order_release);
        tail_.store(tail + 1, std::memory_order_relaxed);
        return true;
    }

  private:
    static constexpr size_t kMask = BufferSize - 1;

    static void contended([[maybe_unused]] unsigned& pauses)
    {
#ifdef MPSC_STATS
        ++mpsc_contended_retries;
#endif
#if MPSC_BACKOFF == 1
        _mm_pause();
#elif MPSC_BACKOFF == 2
        for (unsigned i = 0; i < pauses; ++i)
        {
            _mm_pause();
        }
        pauses = std::min(pauses * 2, unsigned{MPSC_MAX_BACKOFF});
#endif
    }

    struct alignas(MPSC_CACHE_LINE) Slot
    {
        std::atomic<size_t> seq;
        T value;
    };

    std::array<Slot, BufferSize> buffer_;
    alignas(MPSC_CACHE_LINE) std::atomic<size_t> head_;
    alignas(MPSC_CACHE_LINE) std::atomic<size_t> tail_;
};
