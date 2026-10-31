#pragma once

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <cerrno>
#include <fstream>
#include <string>
#include <vector>

#include <sched.h>

// Restrict the calling thread to a single CPU. Returns false on failure.
inline bool pin_self(int cpu)
{
  if (cpu < 0 || cpu >= CPU_SETSIZE) { errno = EINVAL; return false; }
  cpu_set_t set;
  CPU_ZERO(&set);
  CPU_SET(cpu, &set);
  return sched_setaffinity(0, sizeof(set), &set) == 0;
}

// Capture before pinning the controller: later threads inherit its narrow mask.
inline const std::vector<int>& allowed_cpus()
{
  static const auto cpus = [] {
    cpu_set_t set;
    if (sched_getaffinity(0, sizeof(set), &set) != 0)
      throw std::runtime_error("sched_getaffinity failed");
    std::vector<int> result;
    for (int c = 0; c < CPU_SETSIZE; ++c)
      if (CPU_ISSET(c, &set)) result.push_back(c);
    return result;
  }();
  return cpus;
}

// CPUs in the NUMA node that owns `cpu`, parsed from sysfs ("0-3,8-11").
// Falls back to just `cpu` if the topology can't be read.
inline std::vector<int> node_cpus(int cpu)
{
  for (int node = 0;; ++node) {
    std::ifstream in("/sys/devices/system/node/node" + std::to_string(node) + "/cpulist");
    if (!in) {
      break;
    }
    std::string list;
    std::getline(in, list);
    std::vector<int> cpus;
    for (char* tok = std::strtok(list.data(), ","); tok; tok = std::strtok(nullptr, ",")) {
      int lo = 0;
      int hi = 0;
      const int n = std::sscanf(tok, "%d-%d", &lo, &hi);
      if (n < 1) {
        continue;
      }
      if (n == 1) {
        hi = lo;
      }
      for (int c = lo; c <= hi; ++c) {
        const auto& allowed = allowed_cpus();
        if (std::find(allowed.begin(), allowed.end(), c) != allowed.end()) cpus.push_back(c);
      }
    }
    if (std::find(cpus.begin(), cpus.end(), cpu) != cpus.end()) {
      return cpus;
    }
  }
  return {cpu};
}

// CPU for each of `producers` producer threads when the consumer owns
// `consumer_cpu`: round-robin over the allowed CPUs in that CPU's NUMA node.
// Fail if no separate producer CPU is available.
inline std::vector<int> producer_cpus(int consumer_cpu, std::size_t producers)
{
  std::vector<int> others;
  for (int c : node_cpus(consumer_cpu)) {
    if (c != consumer_cpu) {
      others.push_back(c);
    }
  }
  if (others.empty()) {
    throw std::runtime_error("no allowed producer CPU separate from consumer");
  }
  std::vector<int> cpus(producers);
  for (std::size_t i = 0; i < producers; ++i) {
    cpus[i] = others[i % others.size()];
  }
  return cpus;
}

inline std::string cpu_list(const std::vector<int>& cpus)
{
  std::string out;
  for (std::size_t i = 0; i < cpus.size(); ++i) {
    out += (i ? "," : "") + std::to_string(cpus[i]);
  }
  return out;
}
