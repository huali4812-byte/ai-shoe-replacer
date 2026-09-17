"""Read-only local report inventory; visual review decides visible outsole."""
import json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/c3-sole-fidelity/sample-search'
OUT.mkdir(parents=True,exist_ok=True)
seen=set();rows=[]
reports=sorted((Path.home()/'Pictures/AI-Shoe-Preview').glob('*/report.json'),reverse=True)
def walk(v):
    if isinstance(v,dict):
        if v.get('input') and v.get('visionMask') and v.get('preview'): yield v
        for item in v.values():yield from walk(item)
    elif isinstance(v,list):
        for item in v:yield from walk(item)
for report in reports:
    try:d=json.loads(report.read_text())
    except (ValueError,OSError):continue
    for t in walk(d):
        f=Path(t['input'])
        if not f.is_file():continue
        digest=hashlib.sha256(f.read_bytes()).hexdigest()
        if digest in seen:continue
        seen.add(digest)
        rows.append({'index':len(rows),'taskId':t.get('id'),'layerId':t.get('layerId'),'name':t.get('name'),'report':str(report),'input':str(f),'sha256':digest,'mask':t['visionMask'],'aiRaw':t['preview'],'shoeCount':t.get('shoeCount'),'material':t.get('material'),'composition':t.get('composition'),'product':t.get('product')})
    if len(rows)>=80:break
for start in range(0,len(rows),20):
    canvas=Image.new('RGB',(1200,1100),'white');draw=ImageDraw.Draw(canvas)
    for j,r in enumerate(rows[start:start+20]):
        im=Image.open(r['input']).convert('RGB');im.thumbnail((290,245))
        x=(j%4)*300;y=(j//4)*220
        # fit within each contact cell without distorting scene geometry
        im.thumbnail((290,192));canvas.paste(im,(x,y+24))
        draw.text((x+4,y+3),f"{r['index']} | layer {r['layerId']}",fill='black')
    canvas.save(OUT/f'contact-{start//20}.jpg')
(OUT/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
print('unique input scenes',len(rows),'contact sheets',(len(rows)+19)//20)
