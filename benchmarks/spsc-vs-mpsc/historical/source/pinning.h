#pragma once

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

#include <sched.h>

// Restrict the calling thread to a single CPU. Returns false on failure.
inline bool pin_self(int cpu)
{
  cpu_set_t set;
  CPU_ZERO(&set);
  CPU_SET(cpu, &set);
  return sched_setaffinity(0, sizeof(set), &set) == 0;
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
        cpus.push_back(c);
      }
    }
    if (std::find(cpus.begin(), cpus.end(), cpu) != cpus.end()) {
      return cpus;
    }
  }
  return {cpu};
}

// CPU for each of `producers` producer threads when the consumer owns
// `consumer_cpu`: round-robin over the rest of that CPU's NUMA node, or
// `consumer_cpu` itself if the node has no other CPUs.
inline std::vector<int> producer_cpus(int consumer_cpu, std::size_t producers)
{
  std::vector<int> others;
  for (int c : node_cpus(consumer_cpu)) {
    if (c != consumer_cpu) {
      others.push_back(c);
    }
  }
  if (others.empty()) {
    others.push_back(consumer_cpu);
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
