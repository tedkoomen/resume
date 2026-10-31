"""Render actual perf script output with the archived upstream FlameGraph helpers."""
from pathlib import Path
import subprocess,csv
ROOT=Path(__file__).resolve().parent.parent
src=ROOT/'data/v3/flamegraphs';out=ROOT/'charts/v3/flamegraphs';out.mkdir(parents=True,exist_ok=True)
rows=[]
for p in sorted(src.glob('*.stacks')):
 folded=subprocess.run(['perl',str(ROOT/'tools/FlameGraph/stackcollapse-perf.pl'),str(p)],capture_output=True,text=True,check=True).stdout
 if not folded.strip():continue
 (src/(p.stem+'.folded')).write_text(folded)
 samples=sum(int(x.rsplit(' ',1)[1]) for x in folded.splitlines())
 r=subprocess.run(['perl',str(ROOT/'tools/FlameGraph/flamegraph.pl'),'--title',p.stem+' (user-space CPU-clock samples)'],input=folded,capture_output=True,text=True,check=True)
 (out/(p.stem+'.svg')).write_text(r.stdout)
 rows.append(dict(profile=p.stem,samples=samples))
with (src/'sample_counts.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=['profile','samples']);w.writeheader();w.writerows(rows)
print('Rendered',len(rows),'actual profiles')
