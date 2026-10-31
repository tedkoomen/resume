"""Validate completeness and semantics before rendering/publishing benchmark data."""
import collections,csv,json
from pathlib import Path
root=Path(__file__).resolve().parent.parent;data=root/'data/v3'
for name,counts,variants,reps in [('fair_runs.csv',[4,8],18,30),('legacy_runs.csv',[3,8],18,30),('long_confirmation.csv',[4,8],4,10)]:
 rows=list(csv.DictReader((data/name).open()));c=collections.Counter((r['variant'],int(r['producers'])) for r in rows)
 assert len(rows)==len(counts)*variants*reps,(name,len(rows))
 assert len(c)==len(counts)*variants and set(c.values())=={reps},(name,c)
 assert all(r['pass']=='1' and int(r['errors'])==0 for r in rows)
 for r in rows:
  if name!='legacy_runs.csv':assert int(r['total_slots'])==int(r['producers'])*8
  if int(r['consumer_cpu'])>=0:assert int(r['consumer_cpu']) not in map(int,r['producer_cpus'].split(','))
 for v,p in c:
  rounds=[int(r['round']) for r in rows if r['variant']==v and int(r['producers'])==p]
  assert set(rounds)==set(range(1,reps+1))
 print(name,'validated:',len(rows),'runs')
for san in ['tsan','asan']:
 rows=json.loads((data/'tests'/f'{san}_results.json').read_text());assert len(rows)==90 and all(r['passed'] for r in rows)
print('180 sanitizer results validated')
