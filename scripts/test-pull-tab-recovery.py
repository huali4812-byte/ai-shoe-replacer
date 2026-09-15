"""No models: exercise detail attachment and independent hand protection."""
import importlib.util, contextlib
from pathlib import Path
from types import SimpleNamespace
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('vision',root/'cep/vision.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
model=v.Vision.__new__(v.Vision)
class Inputs(dict): input_ids=None
class Processor:
 def __call__(self,**kw):return Inputs()
 def post_process_grounded_object_detection(self,*a,**kw):
  return [dict(boxes=np.array([[20,20,30,30],[15,15,40,35],[20,20,23,30]]),scores=np.array([.4,.8,.8]),text_labels=['shoe tongue','sock','hand'])]
model.detector_processor=Processor();model.detector=lambda **kw:None
model.torch=SimpleNamespace(inference_mode=contextlib.nullcontext)
def rect(b):
 m=np.zeros((100,100),bool);m[b[1]:b[3],b[0]:b[2]]=True;return m
model.segment=lambda *a:[(rect([20,20,30,30]),.98),(rect([15,15,40,35]),.99),(rect([20,20,23,30]),.99)]
base=Image.fromarray(rect([25,32,80,80]).astype('uint8')*255)
m,d=model.recover_pull_tabs(Image.new('RGB',(100,100)),base);a=np.array(m)>0
assert a[25,25] and not a[25,21], 'recover tab from sock but preserve the hand'
assert np.all(a[np.array(base)>0]),'do not erase existing shoe'
model.segment=lambda *a:[(rect([20,20,30,30]),.8),(rect([15,15,40,35]),.99),(rect([20,20,23,30]),.99)]
m,d=model.recover_pull_tabs(Image.new('RGB',(100,100)),base)
assert np.array_equal(np.array(m),np.array(base))
print('PASS: strong detail recovered from sock, hand preserved, uncertain detail rejected')
