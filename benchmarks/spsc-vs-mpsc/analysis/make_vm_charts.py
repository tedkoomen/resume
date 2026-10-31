"""Render VM charts only from v3 results; unavailable metrics are never zero-filled."""
import csv,json,statistics as st,textwrap
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
ROOT=Path(__file__).resolve().parent.parent;DATA=ROOT/'data/v3';OUT=ROOT/'charts/v3';OUT.mkdir(parents=True,exist_ok=True)
P=[4,8];C=['#377f87','#b96542','#72844f'];R=list(csv.DictReader((DATA/'fair_runs.csv').open()))
assert all(x['pass']=='1' and int(x['total_slots'])==int(x['producers'])*8 for x in R)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.axisbelow':True,'axes.grid':True,'grid.alpha':.18,'figure.facecolor':'#fcfbf7','axes.facecolor':'#fcfbf7','savefig.dpi':150})
V=list(dict.fromkeys(x['variant'] for x in R));MAIN=[v for v in V if not v.endswith('stats')];rng=np.random.default_rng(42)
def rows(v,p):return [x for x in R if x['variant']==v and int(x['producers'])==p]
def vals(v,p,field='msgs_per_s',per=False):return np.array([float(x[field])/(int(x['msgs_per_producer'])*p if per else 1) for x in rows(v,p)])
def med(v,p,field='msgs_per_s',per=False):return float(np.median(vals(v,p,field,per)))
def nice(v):return v.replace('lockfree_','').replace('_',' ').replace('b0','no pause').replace('b1','pause').replace('b2','backoff').replace('spsc','SPSC').replace('mpsc','MPSC')
def title(ax,p):ax.set_title(f'{p} producers • {p*8} total slots\nConsumer CPU 0; producers '+('CPUs 1–4' if p==4 else 'CPUs 1–7 (one shared)'))
def save(fig,name,note=''):
 fig.tight_layout(rect=(0,.06,1,.93))
 if note:fig.text(.02,.015,textwrap.fill(note,140),fontsize=8,color='#555555',va='bottom')
 fig.savefig(OUT/name,bbox_inches='tight');plt.close(fig)
def dots(ax,vs,p,field='msgs_per_s',per=False):
 for i,v in enumerate(vs):
  y=vals(v,p,field,per);x=i+np.linspace(-.15,.15,len(y));ax.scatter(x,y,s=10,alpha=.45,color=C[0]);ax.plot([i-.2,i+.2],[np.median(y)]*2,color='#222',lw=2)
 ax.set_xticks(range(len(vs)),[nice(v) for v in vs],rotation=18,ha='right')
 ax.grid(axis='x',visible=False)
def two(name,heading,vs,field='msgs_per_s',per=False,log=False,note=''):
 fig,axs=plt.subplots(1,2,figsize=(13,5))
 for ax,p in zip(axs,P):
  dots(ax,vs,p,field,per);title(ax,p)
  if log:ax.set_yscale('log')
 axs[0].set_ylabel('Messages / second' if field=='msgs_per_s' else field.replace('_',' ')+(' / message' if per else ''))
 fig.suptitle(heading,fontsize=14,fontweight='bold');save(fig,name,note or '30 shuffled rounds. Every dot is one run; black line is median. All runs retained.')
def unavailable(name,heading,reason):
 fig,ax=plt.subplots(figsize=(11,3.5));ax.axis('off');ax.text(.03,.75,heading,fontsize=17,weight='bold',transform=ax.transAxes);ax.text(.03,.47,textwrap.fill(reason,105),fontsize=12,transform=ax.transAxes,va='top');save(fig,name)
two('01_spsc_alignment_pinning.png','SPSC fan-in: pinning and alignment',['lockfree_spsc_unpinned','lockfree_spsc_packed','lockfree_spsc'])
two('02_mpsc_backoff_throughput.png','MPSC: backoff and slot layout',[f'lockfree_mpsc_b{b}{l}' for b in range(3) for l in ['','_packed']])
two('03_mpsc_cas_retries.png','MPSC contention retries (instrumented builds)',[f'lockfree_mpsc_b{b}_stats' for b in range(3)],'cas_retries',True,note='Counts include failed CAS and already-claimed slots. Instrumented builds are excluded from throughput rankings.')
fig,axs=plt.subplots(2,2,figsize=(13,8))
for i,p in enumerate(P):
 for j,f in enumerate(['full_spins','empty_polls']):dots(axs[i,j],['lockfree_spsc','lockfree_mpsc_b0','lockfree_mpsc_b1','lockfree_mpsc_b2'],p,f,True);axs[i,j].set_title(f'{p} producers: {f} / message')
fig.suptitle('Retry work per delivered message',weight='bold');save(fig,'04_spin_waste.png','API retry counts are not CPU cycles; one CAS retry or full/empty poll can have a different cost.')
fig,axs=plt.subplots(1,2,figsize=(15,8))
for ax,p in zip(axs,P):
 vs=sorted(MAIN,key=lambda v:med(v,p));y=[med(v,p) for v in vs];ax.barh([nice(v) for v in vs],y,color=C[0]);ax.set_xscale('log');title(ax,p);ax.set_xlabel('Median messages / second (log scale)')
 for i,n in enumerate(y):ax.annotate(f'{n/1e6:.2f}M',(n,i),xytext=(3,0),textcoords='offset points',fontsize=8,va='center')
 ax.set_xlim(right=max(y)*2)
fig.suptitle('All queue variants on this VM',weight='bold');save(fig,'05_overview_ranking.png','8-producer runs share one producer vCPU. This is not an isolated or dedicated-host measurement.')
vs=['lockfree_spsc','lockfree_mpsc_b2','mutex_spsc','mutex_mpsc','spin_spsc','spin_mpsc','condvar_spsc','condvar_mpsc']
two('07_lockfree_vs_locks.png','Queue topology and synchronization',vs,log=True,note='MPSC uses exponential backoff. Equal work within each SPSC/MPSC pair; atomic queues use 100k messages/producer, lock-based queues 10k.')
fig,axs=plt.subplots(1,2,figsize=(13,5))
for ax,field,lab in [(axs[0],'rusage_context_switches','Context switches / message (wait4)'),(axs[1],'task_clock_ns','Task-clock ns / message (requested user-only)')]:
 for j,p in enumerate(P):ax.bar(np.arange(len(vs))+(j-.5)*.35,[med(v,p,field,True) for v in vs],width=.3,label=str(p)+' producers',color=C[j])
 ax.set_xticks(range(len(vs)),[nice(v) for v in vs],rotation=45,ha='right');ax.set_yscale('log');ax.set_title(lab)
axs[0].legend();fig.suptitle('Measured process counters',weight='bold');save(fig,'10_queue_syscalls.png','Whole-process counts include startup/teardown. Futex counts unavailable: tracefs absent; ptrace denied. User-only perf context/migration zeros are not interpreted.')
fig,ax=plt.subplots(figsize=(11,7))
vs2=sorted(MAIN,key=lambda v:med(v,4))
for i,v in enumerate(vs2):
 a,b=med(v,4),med(v,8);ax.plot([a,b],[i,i],color='#aaa');ax.scatter([a,b],[i,i],c=C[:2],s=30)
ax.set_yticks(range(len(vs2)),[nice(v) for v in vs2]);ax.set_xscale('log');ax.set_xlabel('Median messages / second');fig.suptitle('Producer scaling: four vs eight',weight='bold');save(fig,'12_oversubscription.png','Blue: 4 producers on 4 CPUs; brown: 8 producers on 7 CPUs. Capacity scales 32→64. This combines producer scaling and one oversubscribed CPU, not a pure isolation effect.')
fig,axs=plt.subplots(2,1,figsize=(12,6),sharex=True)
for f,c in [('canary_before_ns',C[0]),('canary_after_ns',C[1])]:axs[0].plot([float(r[f]) for r in R],'.',ms=2,label=f,color=c)
axs[0].set_ylabel('Canary ns / iteration');axs[0].legend();axs[1].plot([float(r['throttled_usec'])/1000 for r in R],color=C[1],lw=.7);axs[1].set_ylabel('Cgroup throttled ms');axs[1].set_xlabel('Run order');fig.suptitle('Machine noise: all runs retained',weight='bold');save(fig,'13_machine_speed.png','Canary is diagnostic, not a filter. Cgroup counters cover the containing cgroup, so they can include other work; host steal time is also retained in CSV.')
# Legacy runs quantify CPU-placement changes only at identical p=8 and capacities.
legacy=DATA/'legacy_runs.csv'
if legacy.exists():
 L=list(csv.DictReader(legacy.open()));fig,axs=plt.subplots(1,2,figsize=(13,5))
 for ax,p in zip(axs,P):
  chosen=['lockfree_spsc','lockfree_mpsc_b0','lockfree_mpsc_b1','lockfree_mpsc_b2']
  for j,v in enumerate(chosen):ax.bar(j,med(v,p)/med('lockfree_spsc',p),color=C[j%3])
  ax.set_xticks(range(4),[nice(v) for v in chosen],rotation=20,ha='right');ax.axhline(1,color='#222',lw=1);title(ax,p)
 axs[0].set_ylabel('Throughput relative to SPSC');fig.suptitle('Equal total capacity: SPSC fan-in vs MPSC',weight='bold');save(fig,'14_capacity_fairness.png','4×8 slots vs shared 32; 8×8 vs shared 64. Both sides deliver identical messages. Memory footprint differs and is logged; global FIFO semantics also differ.')
# Additional profile / contention charts are supplied by collect_profiles.py outputs.
cache=DATA/'cachegrind_summary.csv'
if cache.exists():
 cg=list(csv.DictReader(cache.open()));ok=[x for x in cg if x['status']=='complete']
 if ok:
  fig,axs=plt.subplots(1,2,figsize=(13,5))
  for ax,f,lab in [(axs[0],'instructions','Simulated instructions / message'),(axs[1],'d1_misses','Simulated D1 misses / message')]:
   ax.bar([nice(x['variant']) for x in ok],[float(x[f])/int(x['messages']) for x in ok],color=C[0]);ax.tick_params(axis='x',rotation=40);ax.set_title(lab)
   if f=='instructions': ax.set_yscale('log')
   else: ax.set_ylim(0,None)
  fig.suptitle('Valgrind Cachegrind (simulation)',weight='bold');save(fig,'06_valgrind_cachegrind.png','Not hardware counters. Serializes threads; does not model inter-core coherence or false sharing. Failed/timed-out variants omitted; full status in CSV.')
 else:unavailable('06_valgrind_cachegrind.png','Cachegrind could not complete','See cachegrind_summary.csv and raw diagnostic logs. No simulation data substituted from the previous VM.')
else:unavailable('06_valgrind_cachegrind.png','Cachegrind not collected','No previous-session data is used for the new VM.')
sweep=DATA/'lock_sweep.csv'
if sweep.exists():
 S=list(csv.DictReader(sweep.open()));fig,axs=plt.subplots(1,2,figsize=(13,5))
 for ax,lock in zip(axs,['mutex','spin']):
  for t in [1,2,4]:
   ys=[st.median(float(r['lock_ns_per_acquire']) for r in S if r['lock']==lock and int(r['threads'])==t and int(r['think'])==x) for x in [0,10,100,1000,10000]]
   ax.plot(range(5),ys,'o-',label=f'{t} threads')
  ax.set_xticks(range(5),['0','10','100','1000','10000']);ax.set_title(lock);ax.set_xlabel('Private work iterations');ax.legend()
 axs[0].set_ylabel('Added ns / thread iteration');fig.suptitle('Lock-contention sweep',weight='bold');save(fig,'08_mutex_contention_futex.png','Difference-of-timings estimate; negative values are noise, not negative lock cost. Futex syscall counts are unavailable on this VM.')
 fig,ax=plt.subplots(figsize=(10,4))
 for i,l in enumerate(['mutex','spin']):
  ax.bar(np.arange(3)+(i-.5)*.35,[st.median(float(r['ns_per_iter']) for r in S if r['lock']==l and int(r['threads'])==t and int(r['think'])==0) for t in [1,2,4]],width=.3,label=l,color=C[i])
 ax.set_xticks(range(3),[1,2,4]);ax.set_xlabel('Threads');ax.set_ylabel('Elapsed ns / thread iteration');ax.legend();fig.suptitle('Mutex vs spinlock, no private work',weight='bold');save(fig,'09_mutex_vs_spin_max_contention.png')
else:
 for name in ['08_mutex_contention_futex.png','09_mutex_vs_spin_max_contention.png']:unavailable(name,'Lock sweep unavailable','See report for execution status.')
# Actual profiles, when available, remain separate user-space SVG artifacts.
unavailable('11_flamegraph_breakdown.png','Flamegraph sampling unavailable','Perf record was denied for cpu-clock:u, including an explicit --all-user probe. No fresh sampled stacks or kernel/user percentages are available. The raw permission diagnostics are preserved; archived flamegraphs are not substituted.')
unavailable('15_isolation_status.png','Kernel-isolation improvement: not measured','CPU pinning succeeded. isolcpus/nohz_full/RCU callback offload and IRQ routing were not changed: control files are read-only and the session has no administrative capabilities. There is no valid before/after isolation delta.')
summary=[]
for p in P:
 for v in sorted(V):
  z=vals(v,p);summary.append(dict(variant=v,producers=p,n=len(z),min=float(z.min()),median=float(np.median(z)),max=float(z.max()),total_slots=8*p,queue_bytes=rows(v,p)[0]['queue_bytes']))
with (OUT/'summary.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(summary[0]));w.writeheader();w.writerows(summary)
comparisons=[]
for p in P:
 for a,b in [('lockfree_mpsc_b0','lockfree_spsc'),('lockfree_mpsc_b1','lockfree_spsc'),('lockfree_mpsc_b2','lockfree_spsc'),('lockfree_mpsc_b2','lockfree_mpsc_b0'),('lockfree_spsc','lockfree_spsc_unpinned'),('lockfree_spsc','lockfree_spsc_packed')]:
  aa={int(x['round']):float(x['msgs_per_s']) for x in rows(a,p)};bb={int(x['round']):float(x['msgs_per_s']) for x in rows(b,p)};pairs=sorted(set(aa)&set(bb));av=np.array([aa[k] for k in pairs]);bv=np.array([bb[k] for k in pairs]);idx=rng.integers(0,len(pairs),(10000,len(pairs)));rat=np.median(av[idx],axis=1)/np.median(bv[idx],axis=1);lo,hi=np.quantile(rat,[.025,.975]);comparisons.append(dict(producers=p,numerator=a,denominator=b,ratio=float(np.median(av)/np.median(bv)),lo=float(lo),hi=float(hi)))
(OUT/'comparisons.json').write_text(json.dumps(comparisons,indent=2))
print(f'{len(R)} fresh runs, charts in {OUT}')
