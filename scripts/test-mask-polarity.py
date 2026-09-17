import sys, pathlib, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cep'))
from PIL import Image
import numpy as np
from mask_polarity import propose
class T(unittest.TestCase):
 def test_white_bg(self):
  a=np.full((100,100,3),255,np.uint8);a[20:80,25:75]=[180,180,180]
  # Mask all writable (no inversion): should pass through unchanged
  m=Image.fromarray(np.full((100,100),255,np.uint8));r,e=propose(Image.fromarray(a),m,[0,0,100,100]);self.assertEqual(e['status'],'unchanged')
  # Inverted: background is writable (white in mask), object is black
  m=Image.fromarray((np.min(a,axis=2)>=248).astype('uint8')*255);r,e=propose(Image.fromarray(a),m,[0,0,100,100]);self.assertEqual(e['status'],'candidate');self.assertTrue(r is not None)
 def test_transparent_guard(self):
  a=Image.new('RGBA',(10,10),(255,255,255,0));r,e=propose(a,Image.new('L',(10,10),255),[0,0,10,10]);self.assertEqual(e['status'],'not_applicable')
if __name__=='__main__':unittest.main()
