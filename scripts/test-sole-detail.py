"""Offline C3 protection tests; synthetic masks are not detector validation."""
import sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'cep'))
import numpy as np
from PIL import Image
from sole_detail import compose

with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp)
    for name, color in [('source', 80), ('base', 90), ('generated', 180)]:
        Image.new('RGB', (100, 100), (color, color, color)).save(p/(name+'.png'))
    shoe = np.full((100,100),255,dtype=np.uint8)
    sole = np.zeros_like(shoe); sole[20:50,30:70]=255
    sole[20:30,30:40]=0  # nonrectangular support must survive
    protected = np.zeros_like(shoe); protected[35:40,40:50]=255
    for name, arr in [('mask',shoe),('soleMask',sole),('protectedMask',protected)]:
        Image.fromarray(arr).save(p/(name+'.png'))
    q = {k:str(p/(k+'.png')) for k in ['source','base','generated','mask','soleMask','protectedMask']}
    q.update(output=str(p/'out.png'), localizationStatus='verified', referenceStatus='verified', occlusionStatus='verified')
    r = compose(q)
    assert r['outsideChangedPixels']==0 and r['changedPixels']==1050
    assert r['semanticReview']=='not_performed'
    for field, reason in [('localizationStatus','localization_insufficient'),('referenceStatus','reference_insufficient'),('occlusionStatus','occlusion_uncertain')]:
        try: compose(dict(q, **{field:'unknown'}))
        except ValueError as e: assert str(e)==reason
        else: raise AssertionError(field)
    def rejected(change, reason):
        try: compose(dict(q, **change))
        except ValueError as e: assert str(e)==reason, str(e)
        else: raise AssertionError(reason)
    for key in ['source','base','generated','mask','soleMask','protectedMask']:
        rejected({'output':q[key]}, 'output_overwrites_input:'+key)
    Image.new('L',(99,100),255).save(p/'wrong.png')
    rejected({'soleMask':str(p/'wrong.png')},'mask_coordinate_mismatch:soleMask')
    rejected({'generated':str(p/'wrong.png')},'candidate_coordinate_mismatch:generated')
    Image.new('L',(100,100),255).save(p/'protected-all.png')
    rejected({'protectedMask':str(p/'protected-all.png')},'localization_empty')
    Image.new('L',(100,100),0).save(p/'empty-shoe.png')
    rejected({'mask':str(p/'empty-shoe.png')},'localization_empty')
    # Soft protection is excluded, not rounded away.
    soft=protected.copy();soft[40:45,50:55]=1
    Image.fromarray(soft).save(p/'soft.png')
    assert compose(dict(q,protectedMask=str(p/'soft.png')))['changedPixels']==1025
    Image.new('L',(100,100),255).save(q['soleMask'])
    try: compose(q)
    except ValueError as e: assert str(e)=='localization_exceeds_shared_area_gate'
    else: raise AssertionError('area gate')
print('PASS sole composition: irregular support, protected hole/soft edges, outside=0, blockers, area gate, size checks, input overwrite rejected')
