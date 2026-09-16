import importlib.util,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('vision',Path(__file__).resolve().parents[1]/'cep/vision.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp);Image.new('RGB',(40,40),'white').save(p/'source.png');Image.new('RGB',(40,40),'red').save(p/'generated.png')
 mask=np.zeros((40,40),dtype='uint8');mask[15:25,5:35]=255;Image.fromarray(mask).save(p/'mask.png')
 for scene in ['shoe_structure','person']:
  r={'box':[0,0,40,40],'mask':str(p/'mask.png'),'sceneType':scene,'generated':str(p/'generated.png'),'output':str(p/'patch.png')}
  v.compose_parent({'source':str(p/'source.png'),'regions':[r],'output':str(p/'result.png')})
  out=np.array(Image.open(p/'result.png'))
  assert tuple(out[20,20])==(255,0,0)
  if scene=='shoe_structure':assert np.all(out[mask==0]==255),'floating components/outside pixels changed'
  else:assert tuple(out[14,20])==(255,0,0),'ordinary boundary expansion regressed'
print('PASS: body editable, structure exterior protected, ordinary expansion retained')
