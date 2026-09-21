import sys, pathlib, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cep'))
from random_pair_roles import assign
class Tests(unittest.TestCase):
 def shoes(self): return [{'index':i,'bounds':b} for i,b in enumerate([[0,0,100,100],[120,0,220,100],[800,500,900,600],[920,500,1020,600]])]
 def test_pair(self):
  for seed in (0,1):
   s=self.shoes();assign(s,seed);self.assertEqual(s[0]['role'],s[1]['role']);self.assertEqual(s[2]['role'],s[3]['role']);self.assertNotEqual(s[0]['role'],s[2]['role'])
   expected=[x['role'] for x in s];s.reverse();assign(s,seed);s.sort(key=lambda x:x['index']);self.assertEqual(expected,[x['role'] for x in s])
 def test_count(self):
  for n in (0,1,3):
   with self.assertRaises(ValueError):assign(self.shoes()[:n],0)
  for seed in (0,1):
   shoes=self.shoes()[:2];result=assign(shoes,seed)
   self.assertEqual(result['method'],'two_shoes_random_roles')
   self.assertNotEqual(shoes[0]['role'],shoes[1]['role'])
 def test_ambiguous(self):
  with self.assertRaises(ValueError):assign([{'bounds':[x,y,x+100,y+100]} for x,y in [(0,0),(150,0),(0,150),(150,150)]],0)
if __name__=='__main__':unittest.main()
