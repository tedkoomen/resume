#include <array>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

class MpscRing {
    static constexpr std::uint64_t capacity = 32;
    struct alignas(64) Slot {
        std::atomic<std::uint64_t> sequence{0};
        std::uint64_t value{0};
    };
    std::array<Slot, capacity> slots{};
    alignas(64) std::atomic<std::uint64_t> head{0};
    alignas(64) std::uint64_t tail{0};
public:
    MpscRing() {
        for (std::uint64_t i = 0; i < capacity; ++i)
            slots[i].sequence.store(i, std::memory_order_relaxed);
    }

    bool push(std::uint64_t value) {
        auto position = head.load(std::memory_order_relaxed);
        for (;;) {
            auto& slot = slots[position & (capacity - 1)];
            const auto sequence = slot.sequence.load(std::memory_order_acquire);
            if (sequence == position) {
                if (head.compare_exchange_weak(position, position + 1,
                                               std::memory_order_relaxed)) {
                    slot.value = value;
                    slot.sequence.store(position + 1, std::memory_order_release);
                    return true;
                }
            } else if (sequence < position) { // Assumes counters do not wrap.
                return false;
            } else {
                position = head.load(std::memory_order_relaxed);
            }
        }
    }

    bool pop(std::uint64_t& value) {
        auto& slot = slots[tail & (capacity - 1)];
        if (slot.sequence.load(std::memory_order_acquire) != tail + 1)
            return false;
        value = slot.value;
        slot.sequence.store(tail + capacity, std::memory_order_release);
        ++tail;
        return true;
    }
};

int main() {
    MpscRing queue;
    constexpr std::uint64_t producer_count = 4, count = 10000;
    constexpr auto total = producer_count * count;
    std::array<std::uint64_t, producer_count> next{};
    std::uint64_t errors = 0, sum = 0;
    std::atomic<bool> start{false};
    std::thread consumer([&] {
        while (!start.load(std::memory_order_acquire)) std::this_thread::yield();
        for (std::uint64_t received = 0; received < total; ++received) {
            std::uint64_t value;
            while (!queue.pop(value)) std::this_thread::yield();
            const auto producer = value / count;
            if (producer >= producer_count) ++errors;
            else errors += value % count != next[producer]++;
            sum += value;
        }
    });
    std::array<std::thread, producer_count> producers;
    for (std::uint64_t id = 0; id < producer_count; ++id) {
        producers[id] = std::thread([&, id] {
            while (!start.load(std::memory_order_acquire)) std::this_thread::yield();
            for (std::uint64_t sequence = 0; sequence < count; ++sequence)
                while (!queue.push(id * count + sequence)) std::this_thread::yield();
        });
    }
    start.store(true, std::memory_order_release);
    for (auto& producer : producers) producer.join();
    consumer.join();
    for (const auto received : next) errors += received != count;
    std::uint64_t extra;
    const bool empty = !queue.pop(extra);
    std::cout << "Producers: " << producer_count << ", messages: " << total
              << ", errors: " << errors << ", sum: " << sum
              << ", drained: " << std::boolalpha << empty << '\n';
    return errors || !empty || sum != total * (total - 1) / 2;
}
