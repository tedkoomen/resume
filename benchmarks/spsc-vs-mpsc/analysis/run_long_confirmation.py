"""Longer, equal-work confirmation of the primary atomic-queue comparisons."""
import csv,json,random
from run_vm import OUT,FIELDS,once
cells=[(v,p) for v in ['lockfree_spsc','lockfree_mpsc_b0','lockfree_mpsc_b1','lockfree_mpsc_b2'] for p in [4,8]]
rng=random.Random(4422)
with (OUT/'long_confirmation.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader()
 for rnd in range(1,11):
  rng.shuffle(cells)
  for v,p in cells:
   r=once('fair',v,p,1000000);w.writerow({'scenario':'long_confirmation','round':rnd,'variant':v,**r});f.flush()
  print('long confirmation round',rnd,flush=True)
