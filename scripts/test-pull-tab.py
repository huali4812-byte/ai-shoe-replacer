import importlib.util
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('pull_tab',root/'cep/pull_tab.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def mask(box):
 a=np.zeros((32,32),dtype='uint8');x,y,r,b=box;a[y:b,x:r]=255;return Image.fromarray(a)
def reject(fn):
 try: fn()
 except ValueError: return
 raise AssertionError('expected rejection')
e={'artifacts':dict.fromkeys(['input','raw','mask','final','target'],'fixture'),'targetMatched':True,'rawCorrect':False,'finalCorrect':False}
assert m.route(e)['stage']=='generation'
e.update(rawCorrect=True,compositeMismatchConfirmed=True)
assert m.route(e)['action']=='reuse_raw_with_verified_mask'
e['targetMatched']=False;assert m.route(e)['action']=='blocked'
assert m.route({})['action']=='blocked'
d=mask((10,8,16,20));w=mask((8,7,25,28));p=mask((10,8,12,12));shoe=mask((8,18,25,28));c=mask((12,18,16,20))
support=m.exact_support(d,w,p,shoe,c)
a=np.asarray(support);assert not a[8:12,10:12].any();assert np.all(a[np.asarray(w)==0]==0)
base=Image.new('RGB',(32,32),(120,100,100));candidate=Image.new('RGB',(32,32),(230,20,30))
out,report=m.compose(base,candidate,support)
assert report['outsideChangedPixels']==0
assert np.array_equal(np.asarray(out)[a==0],np.asarray(base)[a==0])
assert np.array_equal(np.asarray(out)[np.asarray(p)>0],np.asarray(base)[np.asarray(p)>0])
# Red is allowed: target colors are not globally prohibited.
assert tuple(np.asarray(out)[15,14])==(230,20,30)
reject(lambda:m.exact_support(d,w,mask((0,18,32,21)),shoe,c))
a2=np.asarray(d).copy();a2[2:4,2:4]=255
reject(lambda:m.exact_support(Image.fromarray(a2),mask((0,0,32,32)),p,shoe,c))
reject(lambda:m.exact_support(d,w,p,shoe,mask((0,0,0,0))))
reject(lambda:m.compose(base,candidate.resize((16,16)),support))
reject(lambda:m.exact_support(d,w,Image.new('L',(32,32),128),shoe,c))
print('PASS C2 A/B/unknown routing, independent exact mask, connection, sock/hand pixel protection, no outside changes; semantic correctness unverified')
