#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <condition_variable>
#include <mutex>
#include <utility>
#include <immintrin.h>
#include "./concepts.h"

#ifndef LOCKED_CACHE_LINE
#define LOCKED_CACHE_LINE 64
#endif

// Test-and-test-and-set spinlock: spin on a plain load (shared cache line,
// no coherence writes) and only attempt the exchange once the lock looks free.
class SpinLock
{
  public:
    void lock()
    {
        for (;;)
        {
            if (!locked_.exchange(true, std::memory_order_acquire))
            {
                return;
            }
            while (locked_.load(std::memory_order_relaxed))
            {
                _mm_pause();
            }
        }
    }

    void unlock() { locked_.store(false, std::memory_order_release); }

  private:
    std::atomic<bool> locked_{false};
};

// Bounded ring buffer guarded by a single lock. Safe for any number of
// producers and consumers, so the same class serves both the SPSC fan-in
// (one queue per producer) and the MPSC (one shared queue) harnesses.
// Same non-blocking interface as SpscQueue/MpscQueue: push/pop return false
// when full/empty instead of waiting.
template <typename T, std::size_t BufferSize, typename Lock>
  requires IsPositivePowerOfTwo<BufferSize>
class LockedQueue
{
  public:
    bool push(T&& val)
    {
        std::lock_guard<Lock> guard(lock_);
        if (head_ - tail_ == BufferSize)
        {
            return false;
        }
        buffer_[head_ & kMask] = std::move(val);
        ++head_;
        return true;
    }

    bool pop(T& outVal)
    {
        std::lock_guard<Lock> guard(lock_);
        if (head_ == tail_)
        {
            return false;
        }
        outVal = std::move(buffer_[tail_ & kMask]);
        ++tail_;
        return true;
    }

  private:
    static constexpr size_t kMask = BufferSize - 1;

    // The lock and both indices are always touched together under the lock,
    // so they share one cache line; the buffer starts on the next one.
    alignas(LOCKED_CACHE_LINE) Lock lock_;
    size_t head_ = 0;
    size_t tail_ = 0;
    alignas(LOCKED_CACHE_LINE) std::array<T, BufferSize> buffer_;
};

// The way a mutex queue is normally written: producers sleep on a condition
// variable while the queue is full instead of spinning, so push() always
// returns true. pop() stays non-blocking because the fan-in consumer polls
// several queues and must not sleep on one that may never refill.
template <typename T, std::size_t BufferSize>
  requires IsPositivePowerOfTwo<BufferSize>
class BlockingQueue
{
  public:
    bool push(T&& val)
    {
        std::unique_lock<std::mutex> guard(lock_);
        if (head_ - tail_ == BufferSize)
        {
            ++waiters_;
            notFull_.wait(guard, [this] { return head_ - tail_ != BufferSize; });
            --waiters_;
        }
        buffer_[head_ & kMask] = std::move(val);
        ++head_;
        return true;
    }

    bool pop(T& outVal)
    {
        std::unique_lock<std::mutex> guard(lock_);
        if (head_ == tail_)
        {
            return false;
        }
        // Wake a producer whenever one is asleep, not only on the full ->
        // not-full transition: with several producers sleeping, a second pop
        // before the first woken producer refills would otherwise leave the
        // rest asleep with free space and nobody left to wake them.
        const bool wake = waiters_ != 0;
        outVal = std::move(buffer_[tail_ & kMask]);
        ++tail_;
        guard.unlock();
        if (wake)
        {
            notFull_.notify_one();
        }
        return true;
    }

  private:
    static constexpr size_t kMask = BufferSize - 1;

    alignas(LOCKED_CACHE_LINE) std::mutex lock_;
    size_t head_ = 0;
    size_t tail_ = 0;
    size_t waiters_ = 0;
    alignas(LOCKED_CACHE_LINE) std::condition_variable notFull_;
    alignas(LOCKED_CACHE_LINE) std::array<T, BufferSize> buffer_;
};
