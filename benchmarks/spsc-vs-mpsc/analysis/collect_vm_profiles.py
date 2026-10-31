"""Separate profiling runs; their timings never enter native throughput charts."""
import csv,json,os,subprocess,time,re,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;DATA=ROOT/'data/v3';DATA.mkdir(exist_ok=True)
TOOLS=Path(os.environ.get('BENCH_TOOLS',str(ROOT.parent/'local_tools')))
VG=Path(shutil.which('valgrind') or TOOLS/'usr/bin/valgrind')
PERF=Path(shutil.which('perf') or TOOLS/'usr/lib/linux-tools-6.8.0-138/perf')
ENV=os.environ.copy()
if (TOOLS/'usr/libexec/valgrind').exists(): ENV['VALGRIND_LIB']=str(TOOLS/'usr/libexec/valgrind')
if (TOOLS/'usr/lib/x86_64-linux-gnu').exists(): ENV['LD_LIBRARY_PATH']=str(TOOLS/'usr/lib/x86_64-linux-gnu')+':'+ENV.get('LD_LIBRARY_PATH','')
VARIANTS=['lockfree_spsc','lockfree_mpsc_b0','lockfree_mpsc_b1','lockfree_mpsc_b2','mutex_spsc','mutex_mpsc','spin_spsc','spin_mpsc','condvar_spsc','condvar_mpsc']
def sweep():
 fields=['lock','threads','think','ops_per_thread','elapsed_s','ns_per_iter','lock_ns_per_acquire','ok','round']
 with (DATA/'lock_sweep.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
  import random
  rng=random.Random(42)
  for rnd in range(1,6):
   cells=[(l,t,k) for l in ['mutex','spin'] for t in [1,2,4] for k in [0,10,100,1000,10000]];rng.shuffle(cells)
   for l,t,k in cells:
    n=max(1000,1000000//max(1,k))
    r=subprocess.run(['taskset','-c','0-7',str(ROOT/'build/v3/lock_contention'),l,str(t),str(k),str(n)],capture_output=True,text=True,check=True,timeout=60)
    row=dict(zip(fields[:-1],r.stdout.strip().split(',')));assert row['ok']=='1';row['round']=rnd;w.writerow(row);f.flush()
   print('lock sweep round',rnd,flush=True)
def cachegrind():
 out=DATA/'cachegrind';out.mkdir(exist_ok=True);rows=[]
 for v in VARIANTS:
  # Original 3-producer simulation topology. Fixed 1000 messages each avoids
  # comparing cache-simulator results from different amounts of startup work.
  n=1000;p=3;result=out/f'{v}.out';log=out/f'{v}.txt'
  cmd=[str(VG),'--tool=cachegrind','--cache-sim=yes','--branch-sim=yes','--fair-sched=yes',f'--cachegrind-out-file={result}',str(ROOT/'build/v3'/f'fanin_{v}'),str(n),'1','0',str(p)]
  status='failed';output=''
  try:
   r=subprocess.run(cmd,capture_output=True,text=True,env=ENV,timeout=60);output=r.stdout+r.stderr
   if r.returncode==0 and 'PASSED' in r.stdout:status='complete'
  except subprocess.TimeoutExpired as e:
   status='timeout';output=(e.stdout or b'').decode()+(e.stderr or b'').decode()
  log.write_text(output)
  row=dict(variant=v,status=status,messages=n*p,instructions='',data_refs='',d1_misses='',lld_misses='',branches='',branch_misses='')
  if status=='complete':
   text=result.read_text();events=re.search(r'^events: (.*)$',text,re.M)[1].split();values=map(int,re.search(r'^summary: (.*)$',text,re.M)[1].split());d=dict(zip(events,values))
   row.update(instructions=d['Ir'],data_refs=d['Dr']+d['Dw'],d1_misses=d['D1mr']+d['D1mw'],lld_misses=d['DLmr']+d['DLmw'],branches=d['Bc']+d['Bi'],branch_misses=d['Bcm']+d['Bim'])
  rows.append(row);print('cachegrind',v,status,flush=True)
 with (DATA/'cachegrind_summary.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def profiles():
 out=DATA/'flamegraphs';out.mkdir(exist_ok=True)
 for p in [4,8]:
  folder='fair4' if p==4 else 'v3'
  for v in VARIANTS:
   stem=f'{v}_p{p}';n=1000000 if v.startswith('lockfree') else 20000
   cmd=[str(PERF),'record','-e','cpu-clock:u','-F','99','-g','-o',str(out/f'{stem}.data'),'--','taskset','-c','0-7',str(ROOT/'build'/folder/f'fanin_{v}'),str(n),'1','0',str(p)]
   try:
    r=subprocess.run(cmd,capture_output=True,text=True,env=ENV,timeout=45)
    (out/f'{stem}.txt').write_text(r.stdout+r.stderr)
    if r.returncode:print('profile unavailable',stem,flush=True);continue
    r=subprocess.run([str(PERF),'script','-i',str(out/f'{stem}.data')],capture_output=True,text=True,env=ENV,timeout=30)
    (out/f'{stem}.stacks').write_text(r.stdout)
    print('profile',stem,r.returncode,flush=True)
   except Exception as e:(out/f'{stem}.txt').write_text(str(e))
if __name__=='__main__':
 import sys
 {'sweep':sweep,'cachegrind':cachegrind,'profiles':profiles}[sys.argv[1]]()
