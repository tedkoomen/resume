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

// Test-and-test-and-set: poll with loads between exchange attempts.
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

// Supports multiple producers/consumers. Returns false on full/empty.
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

    alignas(LOCKED_CACHE_LINE) Lock lock_;
    size_t head_ = 0;
    size_t tail_ = 0;
    alignas(LOCKED_CACHE_LINE) std::array<T, BufferSize> buffer_;
};

// Push waits for space; pop polls so fan-in cannot sleep on an idle queue.
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
        // Notify on every pop with waiters, or free slots can leave producers asleep.
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
