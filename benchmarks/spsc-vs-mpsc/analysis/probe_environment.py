"""Read-only platform probe; perf_event_open is attempted without privilege changes."""
import ctypes, json, os, platform, pathlib, subprocess
P=pathlib.Path
out=P('data/v3');out.mkdir(parents=True,exist_ok=True)
if platform.machine() != 'x86_64': raise SystemExit('perf syscall probe currently supports x86_64 only')
def read(p):
 try:return P(p).read_text()
 except OSError as e:return str(e)
libc=ctypes.CDLL(None,use_errno=True)
probes=[]
# x86_64 perf_event_open syscall, 128-byte perf_event_attr; exclude kernel/hypervisor.
for name,typ,config in [('cycles',0,0),('instructions',0,1),('cache-references',0,2),('cache-misses',0,3),('branches',0,4),('branch-misses',0,5),('task-clock',1,1),('context-switches',1,3),('cpu-migrations',1,4)]:
 import struct
 buf=ctypes.create_string_buffer(128)
 struct.pack_into('IIQQQQQ',buf,0,typ,128,config,0,0,0,(1<<0)|(1<<5)|(1<<6))
 fd=libc.syscall(298,ctypes.byref(buf),0,-1,-1,0)
 err=ctypes.get_errno()
 probes.append(dict(event=name,fd=fd,error=os.strerror(err) if fd<0 else None))
 if fd>=0:os.close(fd)
doc={'uname':platform.uname()._asdict(),'lscpu':subprocess.check_output(['lscpu'],text=True),'affinity':sorted(os.sched_getaffinity(0)),'event_sources':[p.name for p in P('/sys/bus/event_source/devices').iterdir()],'perf_probes':probes}
for p in ['/proc/cmdline','/proc/self/status','/proc/sys/kernel/perf_event_paranoid','/proc/mounts','/sys/fs/cgroup/cpu.max','/sys/fs/cgroup/cpu.stat','/sys/devices/system/cpu/isolated','/sys/devices/system/cpu/nohz_full','/proc/interrupts','/proc/softirqs']:
 doc[p]=read(p)
(out/'environment.json').write_text(json.dumps(doc,indent=2))
print(json.dumps({'perf_probes':probes,'event_sources':doc['event_sources']},indent=2))
