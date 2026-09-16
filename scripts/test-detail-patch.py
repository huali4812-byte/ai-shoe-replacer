import sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cep'))
from detail_patch import run
from PIL import Image
import numpy as np
with tempfile.TemporaryDirectory() as d:
 p=Path(d)
 for n,c in [('source','white'),('base','blue'),('generated','red')]:Image.new('RGB',(40,40),c).save(p/(n+'.png'))
 m=Image.new('L',(40,40));m.paste(255,(10,10,20,20));m.save(p/'mask.png')
 q={k:str(p/(k+'.png')) for k in ['source','base','generated','mask']};q.update(box=[.2,.2,.6,.6],output=str(p/'out.png'))
 run(dict(q,action='compose_detail'))
 a=np.array(Image.open(p/'out.png'));assert (a[10:20,10:20]==[255,0,0]).all();assert (a[0,0]==[0,0,255]).all();assert (a[22,22]==[0,0,255]).all()
 run(dict(q,action='prepare_detail'));assert Image.open(p/'out.png').getbbox()==(10,10,20,20)
 print('PASS intersection only; original mask protection; unchanged accepted base outside defect')
