# Host isolation follow-up

No host isolation settings were changed during this run. `/sys`, `/proc/sys`, and `/proc/irq` are read-only in the execution environment; its effective capability set is zero. The guest also lacks a hardware PMU. See `data/v3/environment.json` for direct probes. An isolation improvement is **N/A**, not 0%.

The goal is to **enable** isolation, offload RCU callbacks, and redirect eligible IRQs. Do not disable RCU itself or all hardware interrupts.

A concrete example for a dedicated Linux host with at least ten suitable CPUs:

- Housekeeping CPU 0; consumer CPU 1; eight producers on CPUs 2–9. Keep SMT siblings of those cores out of unrelated workloads.
- Use a cpuset partition for CPU ownership, and explicit thread affinity for worker placement.
- Example boot parameters: `nohz_full=1-9 rcu_nocbs=1-9 irqaffinity=0`. Scheduler-domain isolation may also be configured with `isolcpus=domain,managed_irq,1-9`, although kernel documentation recommends cpusets for scheduler isolation flexibility.
- Keep RCU offload threads, other movable kernel work, userspace services and unbound workqueues on housekeeping CPUs. Coordinate IRQ balancing so it does not undo device IRQ affinity. Verify each device's `effective_affinity_list`, since managed or per-CPU interrupts may not obey a requested mask.
- Full-dynticks benefits depend on runnable-task count and kernel activity. CPU pinning alone does not remove scheduler ticks, RCU work, device interrupts or hypervisor noise.
- Expose a virtual PMU if using a VM, give it sufficient CPU budget, and verify `perf stat -e cycles,instructions,cache-misses` works before a counter run. Guest CPU identity/affinity does not guarantee exclusive host physical cores.

These are example host settings, not an automatically executed script. CPU numbers and device routing must match the target host.

## Measure the difference

1. Capture boot parameters, topology, CPU frequency policy, NUMA placement, quota, IRQ/softirq counts and perf availability.
2. Build once. Keep compiler, binary hash, capacities, payload, message counts and producer/consumer placement identical across the A/B comparison.
3. Collect the baseline with pinning, then the isolated configuration with the same pinning. Keep the controller and collection tools on housekeeping CPUs.
4. Use shuffled repetitions, record throttling and noise, and repeat across boot sessions. Report throughput and, in a separate timestamped harness, latency percentiles.
5. Capture actual IRQ/softirq and migration deltas. Report unsupported controls and events explicitly. Use separate hardware-counter groups if events multiplex; retain enabled/running times and normalization.
6. Compute `100 × (isolated throughput / baseline throughput − 1)` only for matched cases. Present uncertainty. Do not use an old-host/new-host ratio as an isolation improvement.

References: [Linux boot parameters](https://docs.kernel.org/admin-guide/kernel-parameters.html), [OS jitter](https://docs.kernel.org/admin-guide/kernel-per-CPU-kthreads.html), [IRQ affinity](https://docs.kernel.org/core-api/irq/irq-affinity.html).

## Provider options

Google Cloud documents explicit virtual-PMU support for x86 C4 instances, enabled with `--performance-monitoring-unit=standard`. This is a practical VM option for supported hardware counters. The enhanced event set has additional machine-size restrictions; verify the exact events needed before selecting a machine. Guest isolation does not control host scheduling. See [PMU overview](https://docs.cloud.google.com/compute/docs/pmu-overview) and [enabling it](https://docs.cloud.google.com/compute/docs/enable-pmu-in-vms).

For host-level OS-noise experiments, prefer dedicated bare metal. [Hetzner dedicated root servers](https://docs.hetzner.com/robot/dedicated-server/getting-started/root-server-guide/) provide full root access. [AWS C7i](https://aws.amazon.com/ec2/instance-types/c7i/) includes `c7i.metal-24xl` and `c7i.metal-48xl`. Check the actual CPU, NUMA topology and required PMU events on the chosen server. A 16-physical-core single-socket system would leave room for eight producer cores, one consumer and housekeeping. No server was purchased or provisioned as part of this task.
