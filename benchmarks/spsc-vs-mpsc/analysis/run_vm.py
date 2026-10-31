"""Interleaved VM experiment; equal total slots and equal messages in primary comparisons.
Run AFTER builds and correctness tests. Each cell repeats 30 times by default.
"""
import csv,json,os,random,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'analysis'))
from run_bench import VARIANTS,CSV_FIELDS
OUT=ROOT/'data/v3';OUT.mkdir(parents=True,exist_ok=True)
FIELDS=['scenario','round','variant',*CSV_FIELDS,'total_slots','cpu_mask','consumer_cpu','producer_cpus','queue_bytes','task_clock_ns','context_switches','cpu_migrations','page_faults','user_s','system_s','canary_before_ns','canary_after_ns','steal_ticks','nr_throttled','throttled_usec','wall_s','rusage_context_switches','voluntary_context_switches','involuntary_context_switches']
def stat():
 d=dict(l.split() for l in Path('/sys/fs/cgroup/cpu.stat').read_text().splitlines())
 d['steal_ticks']=Path('/proc/stat').read_text().splitlines()[0].split()[8]
 return {k:int(d[k]) for k in ['steal_ticks','nr_throttled','throttled_usec']}
def canary(mask):
 r=subprocess.run(['taskset','-c',mask,str(ROOT/'build/v3/canary'),'200000'],capture_output=True,text=True,check=True)
 return float(r.stdout.split(',')[0])
def once(scenario,v,p,n):
 folder='fair4' if scenario=='fair' and p==4 else 'v3'
 mask='0-3' if scenario=='legacy' else '0-7'
 b=ROOT/'build'/folder/VARIANTS[v][0];cpu=-1 if 'unpinned' in v else 0
 cmd=['taskset','-c',mask,str(b),str(n),'1',str(cpu),str(p)]
 metrics=OUT/'metrics_tmp.json'
 a=stat();before=canary(mask)
 env=os.environ.copy()
 if cpu>=0:env['BENCH_CONTROL_CPU']='8'
 r=subprocess.run([sys.executable,str(ROOT/'analysis/perf_process.py'),str(metrics),*cmd],capture_output=True,text=True,env=env,timeout=140)
 after=canary(mask);z=stat()
 lines=[l for l in r.stdout.splitlines() if l.startswith('csv,')]
 if r.returncode or len(lines)!=1:raise RuntimeError(f'{scenario} {v} p{p}: exit {r.returncode} {r.stdout} {r.stderr}')
 row=dict(zip(CSV_FIELDS,lines[0].split(',')[1:]))
 if row['pass']!='1':raise RuntimeError(r.stdout)
 m=json.loads(metrics.read_text())
 if m.pop('counter_errors'):raise RuntimeError('software counters unavailable')
 m.pop('returncode')
 import re
 header=r.stdout.splitlines()[0]
 queue_bytes=int(re.search(r'sizeof\(Queue\)=(\d+)',header)[1])
 cpus=re.search(r'producer cpus \[(.*?)\]',header)[1]
 return {**row,**m,'total_slots':int(row['capacity'])*(1 if row['shared']=='1' else p),'cpu_mask':mask,'consumer_cpu':cpu,'producer_cpus':cpus,'queue_bytes':queue_bytes*(1 if row['shared']=='1' else p),'canary_before_ns':before,'canary_after_ns':after,**{k:z[k]-a[k] for k in a}}
def main():
 scenario=sys.argv[1] if len(sys.argv)>1 else 'fair';rounds=int(sys.argv[2]) if len(sys.argv)>2 else 30
 cells=[(v,p) for v in VARIANTS for p in ([4,8] if scenario=='fair' else [3,8])]
 # Fixed work in primary fair suite; legacy uses original duration calibration principle.
 sizes={(v,p):(100000 if v.startswith('lockfree') else 10000) for v,p in cells}
 if scenario=='legacy':
  cache_path=OUT/'legacy_calibration_cache.json'
  cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
  for v,p in cells:
   key=f'{v}:p{p}'
   if key in cache:
    sizes[v,p]=cache[key];continue
   if v=='spin_spsc' and p==8:
    sizes[v,p]=200 # Original minimum; avoid calibration extrapolation under lock-holder preemption.
   else:
    n=200
    while True:
     r=once(scenario,v,p,n)
     if float(r['elapsed_s'])>=0.05 or n>=200000:break
     n=min(n*4,200000)
    sizes[v,p]=max(200,min(200000,int(float(r['msgs_per_s'])*0.2/p)))
   cache[key]=sizes[v,p];cache_path.write_text(json.dumps(cache,indent=2))
   print('calibrate',v,p,sizes[v,p],flush=True)
 with (OUT/f'{scenario}_calibration.json').open('w') as f:json.dump({f'{v}:p{p}':n for (v,p),n in sizes.items()},f,indent=2)
 rng=random.Random(20261030);failures=[]
 with (OUT/f'{scenario}_runs.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader()
  for rnd in range(1,rounds+1):
   rng.shuffle(cells)
   for v,p in cells:
    try:
     r=once(scenario,v,p,sizes[v,p]);w.writerow({'scenario':scenario,'round':rnd,'variant':v,**r});f.flush()
    except Exception as e:failures.append(str(e));print('FAIL',e,flush=True)
   print(f'{scenario} round {rnd}/{rounds} complete; {len(failures)} failures',flush=True)
 (OUT/f'{scenario}_failures.json').write_text(json.dumps(failures,indent=2))
 if failures:sys.exit(1)
if __name__=='__main__':main()
