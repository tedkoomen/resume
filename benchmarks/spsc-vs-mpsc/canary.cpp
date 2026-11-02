// Per-CPU speed canary; reports slowest/fastest best-of-five ns per iteration.
// Run: ./canary [iters=2000000]

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <thread>
#include <vector>

#include "./pinning.h"

constexpr int kReps = 5;

int main(int argc, char** argv)
{
  const uint64_t iters = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 2'000'000;
  const auto cpu_ids = allowed_cpus();
  const unsigned cpus = cpu_ids.size();
  std::vector<double> ns(cpus, 0);
  std::vector<std::thread> pool;
  for (unsigned c = 0; c < cpus; ++c) {
    pool.emplace_back([&, c] {
      if (!pin_self(cpu_ids[c])) {
        std::fprintf(stderr, "failed to pin to cpu %u\n", c);
        std::_Exit(3);
      }
      uint64_t x = c + 1;
      double best = 1e30;
      for (int rep = 0; rep < kReps; ++rep) {
        const auto start = std::chrono::steady_clock::now();
        for (uint64_t i = 0; i < iters; ++i) {
          x = x * 6364136223846793005ULL + 1442695040888963407ULL;
          asm volatile("" : "+r"(x));
        }
        const auto end = std::chrono::steady_clock::now();
        best = std::min(best, std::chrono::duration<double, std::nano>(end - start).count() /
                                  double(iters));
      }
      asm volatile("" : : "r"(x));
      ns[c] = best;
    });
  }
  for (auto& t : pool) {
    t.join();
  }
  const auto [lo, hi] = std::minmax_element(ns.begin(), ns.end());
  std::printf("%.4f,%.4f\n", *hi, *lo);
  return 0;
}
