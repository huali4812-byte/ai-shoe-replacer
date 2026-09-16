import importlib.util, tempfile, sys, json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v',Path(sys.argv[1]) if len(sys.argv)>1 else root/'cep/vision.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
baseline='--baseline' in sys.argv
with tempfile.TemporaryDirectory() as td:
 p=Path(td);Image.new('RGB',(40,40),'white').save(p/'source.png')
 regions=[]
 for i,(bounds,color,role) in enumerate([((10,10,20,20),'red','主推'),((22,10,32,20),'blue','次推')]):
  mask=Image.new('L',(40,40));mask.paste(255,bounds);mask.save(p/f'm{i}.png');Image.new('RGB',(40,40),color).save(p/f'g{i}.png')
  regions.append(dict(id=str(i),role=role,box=[0,0,40,40],mask=str(p/f'm{i}.png'),generated=str(p/f'g{i}.png'),output=str(p/f'p{i}.png')))
 result=[]
 for rr in [regions,list(reversed(regions))]:
  try:
   r=v.compose_parent(dict(source=str(p/'source.png'),output=str(p/'out.png'),regions=rr,requireRoles=True))
   result.append(dict(pixel=Image.open(p/'out.png').getpixel((19,15)),outside=r['outsideChangedPixels']))
  except ValueError as e:
   assert '跨角色' in str(e);result.append(str(e))
 print('A:',json.dumps(result,ensure_ascii=False))
 if not baseline:assert all(isinstance(r,str) for r in result),'Cross-role overlap must refuse both orders'
 # Even a currently missing preview must retain pixel ownership.
 if not baseline:
  try:v.compose_parent(dict(source=str(p/'source.png'),output=str(p/'out.png'),regions=regions[:1],protectionRegions=regions,requireRoles=True))
  except ValueError as e:assert '跨角色' in str(e)
  else:raise AssertionError('Missing preview lost ownership')
 # Well separated role masks: one bad result must not block the valid one.
 mask=Image.new('L',(40,40));mask.paste(255,(1,1,4,4));mask.save(p/'m0.png')
 mask=Image.new('L',(40,40));mask.paste(255,(30,30,34,34));mask.save(p/'m1.png')
 Image.new('RGB',(60,40),'blue').save(p/'g1.png')
 req=dict(source=str(p/'source.png'),output=str(p/'out.png'),regions=regions,allowPartial=True,requireRoles=True,transparent=True)
 try:
  r=v.compose_parent(req);print('B:',json.dumps(r,ensure_ascii=False))
  if not baseline:
   assert [c['id'] for c in r['regions']]==['0'] and r['rejected'][0]['id']=='1'
   out=Image.open(p/'out.png');assert out.mode=='RGBA' and out.getpixel((31,31))[3]==0
   assert out.getpixel((2,2))==(255,0,0,255)
 except ValueError as e:
  print('B: entire parent failed:',e)
  if not baseline:raise
 if not baseline:
  (p/'g1.png').write_text('corrupt PNG')
  r=v.compose_parent(req);assert r['rejected'][0]['id']=='1'
  req['regions'][1]['written']=True
  try:v.compose_parent(req)
  except ValueError as e:assert '已写回' in str(e)
  else:raise AssertionError('Would erase a previously written result')
  req['regions'][1]['written']=False
  Image.new('RGB',(40,40),'blue').save(p/'g1.png')
  r=v.compose_parent(req);assert len(r['regions'])==2 and not r['rejected']
  out=Image.open(p/'out.png');assert out.getpixel((31,31))==(0,0,255,255)
  req['protectedMarkers']=[{'bounds':[0,0,8,8]}]
  try:v.compose_parent(req)
  except ValueError as e:assert '提示文字' in str(e)
  else:raise AssertionError('Patch would cover retained marker')
 print('PASS' if not baseline else 'BASELINE REPRODUCED')
