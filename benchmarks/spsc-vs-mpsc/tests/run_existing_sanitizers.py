"""Run already-built sanitizer matrix with explicit result records.
Use ASAN_OPTIONS=detect_leaks=0 in process namespaces where LSan cannot inspect threads.
"""
import json,os,subprocess
from pathlib import Path
out=Path('data/v3/tests');out.mkdir(parents=True,exist_ok=True)
failed=False
for san in ['tsan','asan']:
 results=[]
 for b in sorted(Path('build/tests').glob(f'{san}_*')):
  if b.suffix:continue
  for p in [1,3,8]:
   n=5000 if san=='tsan' else 20000
   if b.name.startswith(san+'_i2') and p==8:n=200
   env={**os.environ,'TSAN_OPTIONS':'halt_on_error=1'}
   r=subprocess.run(['timeout','120',str(b),str(n),'1','0',str(p)],env=env,capture_output=True,text=True)
   (out/f'{b.name}_p{p}.txt').write_text(r.stdout+r.stderr)
   ok=r.returncode==0 and 'PASSED' in r.stdout
   results.append(dict(binary=b.name,producers=p,exit=r.returncode,passed=ok));failed|=not ok
 (out/f'{san}_results.json').write_text(json.dumps(results,indent=2))
 print(san,sum(r['passed'] for r in results),'/',len(results))
raise SystemExit(int(failed))
