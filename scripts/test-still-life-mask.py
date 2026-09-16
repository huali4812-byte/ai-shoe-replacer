"""Rebuild old perforated masks only in explicit still-life repair mode."""
import importlib.util,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('vision',root/'cep/vision.py');v=importlib.util.module_from_spec(s);s.loader.exec_module(v)
m=v.Vision.__new__(v.Vision)
with tempfile.TemporaryDirectory() as temp:
 p=Path(temp);Image.new('RGB',(100,100)).save(p/'input.png');Image.new('L',(100,100)).save(p/'old.png')
 def segment(image,boxes):
  a=np.zeros((image.height,image.width),bool);b=list(map(int,boxes[0]));a[b[1]:b[3],b[0]:b[2]]=True
  return [(a,.98)]
 m.segment=segment
 req=dict(input=str(p/'input.png'),mask=str(p/'old.png'),output=str(p/'new.png'),shoeBoxes=[[20,30,70,60]],repairMode='still_life')
 r=m.refine_region(req);a=np.array(Image.open(r['mask']));assert a[45,40]==255 and a[10,10]==0
 assert r['restoredPixels']==1500
 m.segment=lambda image,boxes:[(np.ones((image.height,image.width),bool),.90)]
 try:m.refine_region(req);raise AssertionError('accepted uncertain shoe')
 except ValueError:pass
 req['shoeBoxes']=[]
 try:m.refine_region(req);raise AssertionError('accepted missing boxes')
 except ValueError:pass
print('PASS: explicit rebuild fills shoe interior, preserves outside, rejects uncertainty/missing boxes')
