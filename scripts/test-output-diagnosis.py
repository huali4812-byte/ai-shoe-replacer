import importlib.util,tempfile
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('v',Path(__file__).resolve().parents[1]/'cep/vision.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)
 Image.new('RGB',(40,40),'white').save(p/'s.png')
 m=Image.new('L',(40,40));m.paste(255,(10,10,30,30));m.save(p/'m.png')
 Image.new('RGB',(80,80),'red').save(p/'g.png')
 q=dict(source=str(p/'s.png'),mask=str(p/'m.png'),generated=str(p/'g.png'))
 assert v.diagnose_result(q)['passed']
 Image.new('RGB',(40,40),'red').save(p/'g.png')
 assert not v.diagnose_result(dict(q,stage='parent'))['passed']
 Image.new('RGB',(40,40),'white').save(p/'g.png')
 assert v.diagnose_result(dict(q,stage='parent'))['passed']
 Image.new('RGB',(60,40),'white').save(p/'g.png')
 try:v.diagnose_result(q)
 except ValueError:pass
 else:raise AssertionError('wrong ratio accepted')
print('PASS local resize/background advisory; parent exact protection; ratio rejection')
