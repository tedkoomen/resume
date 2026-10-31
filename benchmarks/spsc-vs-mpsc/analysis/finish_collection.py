"""Sequential follow-up collection after the legacy matrix has closed its CSV."""
import json,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
marker=ROOT/'data/v3/legacy_failures.json'
for _ in range(900):
 if marker.exists():break
 time.sleep(1)
else:raise SystemExit('Legacy runner did not finish within 15 minutes')
print('legacy matrix finished:',marker.read_text(),flush=True)
for script,args in [('run_long_confirmation.py',[]),('collect_vm_profiles.py',['sweep']),('collect_vm_profiles.py',['profiles']),('collect_vm_profiles.py',['cachegrind'])]:
 print('START',script,*args,flush=True)
 subprocess.run([sys.executable,str(ROOT/'analysis'/script),*args],cwd=ROOT,check=True)
print('ALL COLLECTION FINISHED',flush=True)
(ROOT/'data/v3/collection_complete.txt').write_text('Native runs and separate profiling completed. See per-profile statuses.\n')
