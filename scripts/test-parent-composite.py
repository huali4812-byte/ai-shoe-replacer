import importlib.util, tempfile
from pathlib import Path
from PIL import Image
import numpy as np
spec=importlib.util.spec_from_file_location('vision',Path(__file__).resolve().parents[1]/'cep/vision.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
with tempfile.TemporaryDirectory() as folder:
 p=Path(folder);Image.new('RGB',(12,8),'white').save(p/'source.png')
 regions=[]
 for i,(box,color) in enumerate([([-2,0,2,4],'red'),([8,4,12,8],'blue')]):
  Image.new('L',(4,4),255).save(p/f'm{i}.png');Image.new('RGB',(8,8),color).save(p/f'g{i}.png')
  regions.append(dict(box=box,mask=str(p/f'm{i}.png'),generated=str(p/f'g{i}.png'),output=str(p/f'p{i}.png')))
 request=dict(source=str(p/'source.png'),output=str(p/'out.png'),regions=regions)
 r=v.compose_parent(request);a=np.array(Image.open(p/'out.png'))
 assert tuple(a[0,0])==(255,0,0) and tuple(a[7,11])==(0,0,255)
 assert tuple(a[4,5])==(255,255,255) and r['outsideChangedPixels']==0
 Image.new('RGB',(12,8),'red').save(p/'g1.png')
 try:v.compose_parent(request)
 except ValueError:pass
 else:raise AssertionError('aspect mismatch accepted')
print('PASS: two shoes retained, negative coordinates clipped, exterior preserved, invalid aspect rejected')
