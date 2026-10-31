#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

// Exactly one producer and one consumer. Eight usable slots.
class Ring {
    std::array<std::uint64_t, 8> slots{};
    alignas(64) std::atomic<std::uint64_t> head{0};
    alignas(64) std::atomic<std::uint64_t> tail{0};
public:
    bool push(std::uint64_t value) {
        const auto h = head.load(std::memory_order_relaxed);
        if (h - tail.load(std::memory_order_acquire) == slots.size())
            return false;
        slots[h & 7] = value;
        head.store(h + 1, std::memory_order_release);
        return true;
    }
    bool pop(std::uint64_t& value) {
        const auto t = tail.load(std::memory_order_relaxed);
        if (t == head.load(std::memory_order_acquire)) return false;
        value = slots[t & 7];
        tail.store(t + 1, std::memory_order_release);
        return true;
    }
};

int main() {
    Ring queue;
    constexpr std::uint64_t count = 10000;
    std::uint64_t errors = 0, sum = 0;
    std::thread consumer([&] {
        for (std::uint64_t expected = 0; expected < count; ++expected) {
            std::uint64_t value;
            while (!queue.pop(value)) std::this_thread::yield();
            errors += value != expected;
            sum += value;
        }
    });
    std::thread producer([&] {
        for (std::uint64_t value = 0; value < count; ++value)
            while (!queue.push(value)) std::this_thread::yield();
    });
    producer.join();
    consumer.join();
    std::uint64_t extra;
    const bool empty = !queue.pop(extra);
    std::cout << "Messages: " << count << ", errors: " << errors
              << ", sum: " << sum << ", drained: " << std::boolalpha
              << empty << '\n';
    return errors || !empty || sum != count * (count - 1) / 2;
}
