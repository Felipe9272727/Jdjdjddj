"""Render disjoint source frames in separate Blender processes, at full quality."""
import os, subprocess
from pathlib import Path
here=Path(__file__).resolve().parent
root=here.parent.parent
logs=here/'frames'; logs.mkdir(parents=True,exist_ok=True)
workers=max(1,int(os.getenv('F2_WORKERS','1')))
threads=max(1,int(os.getenv('F2_THREADS','4')))
jobs=[]
try:
    for index in range(workers):
        env={**os.environ,'F2_WORKER':str(index),'F2_WORKERS':str(workers),'LP_NUM_THREADS':str(threads)}
        stream=(logs/f'worker-{index}.log').open('w')
        job=subprocess.Popen([os.getenv('BLENDER_PATH','blender'),'-b','-t',str(threads),'--python-exit-code','1','-P',str(here/'scene.py'),'--','all'],cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT)
        jobs.append((job,stream))
    failed=False
    for job,stream in jobs:
        code=job.wait(); stream.close(); failed=failed or code!=0
    if failed: raise SystemExit('A Blender worker failed; inspect frames/worker-*.log')
finally:
    for job,stream in jobs:
        if job.poll() is None: job.terminate()
        if not stream.closed: stream.close()
