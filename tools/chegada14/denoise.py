"""Apply official Intel OIDN RT to Blender's LDR plates, preserving originals.
OIDN_BIN=/path/to/oidnDenoise python tools/chegada14/denoise.py [plate-name]
Requires NumPy/Pillow. Official CLI: https://github.com/RenderKit/oidn/releases
"""
from pathlib import Path
from PIL import Image
import numpy as np, os, subprocess, sys
root=Path(__file__).resolve().parent/'frames';out=root/'denoised';out.mkdir(exist_ok=True)
binary=os.environ.get('OIDN_BIN','oidnDenoise')
for name in (sys.argv[1:] or ['portal','vista','fall','helmet','ground']):
 source=root/(name+'.png');target=out/(name+'.png')
 data=np.asarray(Image.open(source).convert('RGB'),dtype=np.float32)/255
 with (out/'input.pfm').open('wb') as f:
  f.write(f'PF\n{data.shape[1]} {data.shape[0]}\n-1.0\n'.encode());np.flipud(data).astype('<f4').tofile(f)
 subprocess.run([binary,'--device','cpu','--ldr',str(out/'input.pfm'),'--srgb','-o',str(out/'output.pfm'),'--threads','3'],check=True)
 with (out/'output.pfm').open('rb') as f:
  assert f.readline().strip()==b'PF';w,h=map(int,f.readline().split());scale=float(f.readline());den=np.fromfile(f,dtype='<f4' if scale<0 else '>f4').reshape(h,w,3)
 Image.fromarray(np.clip(np.flipud(den)*255+.5,0,255).astype(np.uint8)).save(target)
 print(target)
(out/'input.pfm').unlink(missing_ok=True);(out/'output.pfm').unlink(missing_ok=True)
