#pragma once

#include <array>
#include <cstdint>
#include <bit>
#include <atomic>
#include <utility>
#include "./concepts.h"

// Each hot member gets its own cache line so the producer's writes to head_
// and the consumer's writes to tail_ never false-share with each other or with
// the buffer. Build with -DSPSC_CACHE_LINE=8 to get the natural (packed) layout.
#ifndef SPSC_CACHE_LINE
#define SPSC_CACHE_LINE 64
#endif

template <typename T, std::size_t BufferSize>
  requires IsPositivePowerOfTwo<BufferSize>
class SpscQueue
{
  public:
    SpscQueue()
    {
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }

    bool push(T&& val)
    {
        const size_t head = head_.load(std::memory_order_relaxed);
        const size_t tail = tail_.load(std::memory_order_acquire);

        if (head - tail == BufferSize)
        {
            return false;
        }

        buffer_[head & kMask] = std::move(val);
        head_.store(head + 1, std::memory_order_release);
        return true;
    }

    bool pop(T& outVal)
    {
        const size_t tail = tail_.load(std::memory_order_relaxed);
        const size_t head = head_.load(std::memory_order_acquire);

        if (head == tail)
        {
            return false;
        }

        outVal = std::move(buffer_[tail & kMask]);
        tail_.store(tail + 1, std::memory_order_release);
        return true;
    }

  private:
    static constexpr size_t kMask = BufferSize - 1;

    alignas(SPSC_CACHE_LINE) std::array<T, BufferSize> buffer_;
    alignas(SPSC_CACHE_LINE) std::atomic<size_t> head_;
    alignas(SPSC_CACHE_LINE) std::atomic<size_t> tail_;
};
