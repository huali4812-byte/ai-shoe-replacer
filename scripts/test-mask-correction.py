import importlib.util,tempfile,json,hashlib
from pathlib import Path
from unittest.mock import patch
from PIL import Image
root=Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('v',root/'cep/vision.py');v=importlib.util.module_from_spec(s);s.loader.exec_module(v)
with tempfile.TemporaryDirectory() as td, patch.object(v.Path,'home',return_value=Path(td)):
 src=Image.new('RGB',(20,20),'white');fallback=Image.new('L',(10,10));box=[1,1,11,11];assert v.corrected_mask(src,box,fallback)[1] is None
 home=Path(td)/'Pictures/AI-Shoe-Mask-Repairs';home.mkdir(parents=True);mask=home/'mask.png';Image.new('L',(10,10),255).save(mask);key=hashlib.sha256(src.tobytes()).hexdigest();rec=dict(sourceHash=key,sourceSize=[20,20],box=box,mask=mask.name,maskHash=hashlib.sha256(mask.read_bytes()).hexdigest(),status='verified');(home/(key+'.json')).write_text(json.dumps(rec))
 assert v.corrected_mask(src,box,fallback)[0].getextrema()==(255,255)
 assert v.corrected_mask(src,[0,0,10,10],fallback)[1] is None
 assert v.corrected_mask(Image.new('RGB',(20,20),'red'),box,fallback)[1] is None
 Image.new('L',(10,10),1).save(mask)
 try:v.corrected_mask(src,box,fallback);raise AssertionError('changed mask accepted')
 except ValueError:pass
print('PASS correction matches exact source/crop only; tampered mask blocked')
