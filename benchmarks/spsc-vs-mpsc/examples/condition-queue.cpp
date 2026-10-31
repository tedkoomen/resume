#include <array>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <thread>

class Queue {
    std::mutex mutex;
    std::condition_variable notFull;
    std::array<std::uint64_t, 2> slots{};
    std::uint64_t head = 0, tail = 0;
    unsigned waiters = 0;
public:
    void push(std::uint64_t value) {
        std::unique_lock lock(mutex);
        if (head - tail == slots.size()) {
            ++waiters;
            notFull.wait(lock, [&] { return head - tail < slots.size(); });
            --waiters;
        }
        slots[head++ % slots.size()] = value;
    }
    bool pop(std::uint64_t& value) {
        std::unique_lock lock(mutex);
        if (head == tail) return false;
        value = slots[tail++ % slots.size()];
        const bool wake = waiters != 0;
        lock.unlock();
        if (wake) notFull.notify_one();
        return true;
    }
};

int main() {
    Queue queue;
    auto produce = [&] {
        for (std::uint64_t i = 1; i <= 1000; ++i) queue.push(i);
    };
    std::thread a(produce), b(produce);
    std::uint64_t sum = 0;
    for (int received = 0; received < 2000; ++received) {
        std::uint64_t value;
        while (!queue.pop(value)) std::this_thread::yield();
        sum += value;
    }
    a.join();
    b.join();
    std::uint64_t extra;
    const bool drained = !queue.pop(extra);
    std::cout << "Messages: 2000, sum: " << sum
              << ", drained: " << std::boolalpha << drained << '\n';
    return sum != 1001000 || !drained;
}
