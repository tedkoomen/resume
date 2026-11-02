#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <atomic>
#include <utility>
#include <immintrin.h>
#include "./concepts.h"

// Set to 8 for the packed-layout experiment.
#ifndef MPSC_CACHE_LINE
#define MPSC_CACHE_LINE 64
#endif

// Retry policy: 0 = immediate, 1 = PAUSE, 2 = capped exponential PAUSE.
#ifndef MPSC_BACKOFF
#define MPSC_BACKOFF 1
#endif
#ifndef MPSC_MAX_BACKOFF
#define MPSC_MAX_BACKOFF 16
#endif

#ifdef MPSC_STATS
inline thread_local std::uint64_t mpsc_contended_retries = 0;
#endif

// Vyukov-style reservation: seq == pos is free; seq == pos + 1 is ready.
// A producer stalled after reservation can block consumption.
// Capacity >= 2 keeps the ready and next-lap free states distinct.
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
                if (head_.compare_exchange_weak(head, head + 1, std::memory_order_relaxed))
                {
                    break;
                }
                contended(pauses);
            }
            else if (diff < 0)
            {
                return false;
            }
            else
            {
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
