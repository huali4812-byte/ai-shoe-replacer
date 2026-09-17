import hashlib
import importlib.util
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('lt', Path(__file__).resolve().parents[1]/'cep/logo_transfer.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as t:
    p = Path(t)
    Image.new('RGB',(100,100),'gray').save(p/'base.png')
    a = Image.new('RGBA',(20,10),(255,0,0,0))
    a.paste((220,220,220,255),(3,2,16,8));a.save(p/'logo.png')
    Image.new('L',(100,100),255).save(p/'shoeMask.png')
    protect = Image.new('L',(100,100),0);protect.paste(255,(45,0,50,100));protect.save(p/'protectedMask.png')
    q = {k:str(p/(k+'.png')) for k in ('base','logo','shoeMask','protectedMask')}
    hashes = {k:hashlib.sha256(Path(v).read_bytes()).hexdigest() for k,v in q.items()}
    q.update(output=str(p/'out.png'),quad=[[20,20],[70,25],[65,45],[22,40]],evidence={
        'localization':'verified','logoIsolation':'verified','occlusion':'verified',
        'surfaceModel':'planar','part':'strap','provenance':'synthetic test only','hashes':hashes})
    r=m.transfer(q);assert r['outsideChangedPixels']==0 and r['changedPixels']>0
    before=np.array(Image.open(q['base']));after=np.array(Image.open(q['output']))
    assert np.array_equal(before[:,45:50],after[:,45:50])
    for change in [dict(quad=list(reversed(q['quad']))),dict(quad=[[0,0]]*4),
                   dict(quad=[[0,0],[99,0],[99,99],[0,99]]),
                   dict(evidence={**q['evidence'],'localization':'unknown'}),
                   dict(evidence={**q['evidence'],'part':'sidewall','surface':'inner','referenceSurface':'outer'}),
                   dict(evidence={**q['evidence'],'hashes':{}})]:
        try:m.transfer({**q,'output':str(p/'rejected.png'),**change})
        except ValueError:pass
        else:raise AssertionError(change)
    try:m.transfer(q)
    except ValueError:pass
    else:raise AssertionError('overwrite')
print('PASS planar transfer: protected pixels, winding, degeneracy, area, evidence, stale input and overwrite rejection')
