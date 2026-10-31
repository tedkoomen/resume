#include <algorithm>
#include <barrier>
#include <chrono>
#include <vector>
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
    using Clock = std::chrono::steady_clock;
    constexpr std::uint64_t count = 100000;
    std::vector<double> rates;
    for (int round = 0; round < 7; ++round) {
        Ring queue;
        std::barrier start(3);
        Clock::time_point begin, end;
        std::uint64_t errors = 0;
        std::thread producer([&] {
            start.arrive_and_wait();
            for (std::uint64_t i = 0; i < count; ++i)
                while (!queue.push(i)) std::this_thread::yield();
        });
        std::thread consumer([&] {
            start.arrive_and_wait();
            for (std::uint64_t expected = 0; expected < count; ++expected) {
                std::uint64_t value;
                while (!queue.pop(value)) std::this_thread::yield();
                errors += value != expected;
            }
            end = Clock::now();
        });
        begin = Clock::now();
        start.arrive_and_wait();
        producer.join();
        consumer.join();
        std::uint64_t extra;
        if (errors || queue.pop(extra)) {
            std::cerr << "Validation failed\n";
            return 1;
        }
        const double seconds = std::chrono::duration<double>(end - begin).count();
        rates.push_back(count / seconds);
    }
    std::sort(rates.begin(), rates.end());
    std::cout << "Validated rounds: " << rates.size()
              << "\nMedian messages/s: " << rates[rates.size() / 2] << '\n';
}
