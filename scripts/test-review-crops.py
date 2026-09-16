"""Final review sees the actual composited pixels, including overlapping patches."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('shoe_vision',Path(__file__).resolve().parents[1]/'cep/vision.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
with TemporaryDirectory() as folder:
    p=Path(folder)
    Image.new('RGB',(100,100),'white').save(p/'source.png')
    Image.new('RGB',(60,60),'blue').save(p/'generated.png')
    m=Image.new('L',(60,60));m.paste(255,(20,20,40,40));m.save(p/'mask.png')
    request={'source':str(p/'source.png'),'output':str(p/'full.png'),'transparent':True,'regions':[
        {'id':'r','box':[10,10,70,70],'mask':str(p/'mask.png'),'generated':str(p/'generated.png'),'output':str(p/'patch.png')}]}
    out=v.compose_parent(request);r=out['regions'][0]
    src=Image.open(p/'source.png').convert('RGBA');full=Image.open(out['output']).convert('RGBA')
    expected=Image.alpha_composite(src,full).convert('RGB').crop((10,10,70,70))
    review=Image.open(r['reviewOutput'])
    assert review.mode=='RGB' and review.size==(60,60)
    assert np.array_equal(np.asarray(expected),np.asarray(review))
    assert np.array_equal(np.asarray(Image.open(r['reviewInput'])),np.asarray(src.convert('RGB').crop((10,10,70,70))))
    assert review.getpixel((0,0))==(255,255,255)
    assert review.getpixel((30,30))==(0,0,255)
print('PASS full-resolution opaque review equals actual transparent composite over original')
