#include <atomic>
#include <cstdint>
#include <immintrin.h>
#include <iostream>
#include <mutex>
#include <thread>

class SpinLock {
    std::atomic_flag held = ATOMIC_FLAG_INIT;
public:
    void lock() {
        while (held.test_and_set(std::memory_order_acquire)) {
            // Poll with reads before attempting another write.
            while (held.test(std::memory_order_relaxed)) _mm_pause();
        }
    }
    void unlock() { held.clear(std::memory_order_release); }
};

template<class Lock>
std::uint64_t exercise() {
    Lock lock;
    std::uint64_t count = 0; // Ordinary data, always accessed under the lock.
    auto work = [&] {
        for (int i = 0; i < 10000; ++i) {
            std::lock_guard<Lock> guard(lock);
            ++count;
        }
    };
    std::thread a(work), b(work);
    a.join();
    b.join();
    return count;
}

int main() {
    const auto spin = exercise<SpinLock>();
    const auto mutex = exercise<std::mutex>();
    std::cout << "Spin: " << spin << "\nMutex: " << mutex << '\n';
    return spin != 20000 || mutex != 20000;
}
