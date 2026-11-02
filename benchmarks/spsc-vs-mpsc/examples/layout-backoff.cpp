#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <immintrin.h>
#include <iostream>
#include <thread>

struct Packed {
    std::atomic<std::uint64_t> a{0}, b{0};
};
struct Separate {
    alignas(64) std::atomic<std::uint64_t> a{0};
    alignas(64) std::atomic<std::uint64_t> b{0};
};
std::atomic<std::uint64_t> counter{0};

// All threads still contend on this ONE counter. Padding cannot fix that.
void increment() {
    auto expected = counter.load(std::memory_order_relaxed);
    unsigned pauses = 1;
    while (!counter.compare_exchange_weak(
        expected, expected + 1, std::memory_order_relaxed)) {
        for (unsigned i = 0; i < pauses; ++i) _mm_pause();
        pauses = std::min(2 * pauses, 16u);
    }
}

int main() {
    std::cout << "Packed offsets: " << offsetof(Packed, a) << ", "
              << offsetof(Packed, b) << "; bytes: " << sizeof(Packed) << '\n';
    std::cout << "Separate offsets: " << offsetof(Separate, a) << ", "
              << offsetof(Separate, b) << "; bytes: " << sizeof(Separate) << '\n';
    std::thread a([] { for (int i = 0; i < 10000; ++i) increment(); });
    std::thread b([] { for (int i = 0; i < 10000; ++i) increment(); });
    a.join();
    b.join();
    std::cout << "CAS counter: " << counter.load() << " (expected 20000)\n";
    return counter.load() != 20000;
}
