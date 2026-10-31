// Machine-speed canary: one thread pinned to each online CPU times a fixed
// dependent-multiply chain, so a benchmark run can be flagged when the machine
// was slow (e.g. a noisy neighbour on the host's sibling hyperthread, which the
// guest cannot see as steal time). Each CPU takes the best of kReps timings,
// so a single preemption by an unrelated task does not register as a slow
// machine; a sustained slowdown raises even the best timing.
//
// Build:  see Makefile
// Run:    ./canary [iters=2000000]
// Output: one line "slowest_ns_per_iter,fastest_ns_per_iter"

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
  const unsigned cpus = std::thread::hardware_concurrency();
  std::vector<double> ns(cpus, 0);
  std::vector<std::thread> pool;
  for (unsigned c = 0; c < cpus; ++c) {
    pool.emplace_back([&, c] {
      if (!pin_self(int(c))) {
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
