"""Exercise restricted affinity masks and reject producer/consumer co-location."""
import subprocess
binary='build/v3/fanin_lockfree_spsc'
r=subprocess.run(['taskset','-c','2,4,6',binary,'1000','1','2','2'],capture_output=True,text=True)
assert r.returncode==0 and 'producer cpus [4,6]' in r.stdout, r.stdout+r.stderr
r=subprocess.run(['taskset','-c','2',binary,'1000','1','2','1'],capture_output=True,text=True)
assert r.returncode!=0
r=subprocess.run([binary,'1000','1','1024','1'],capture_output=True,text=True)
assert r.returncode!=0
print('3 affinity checks passed')
