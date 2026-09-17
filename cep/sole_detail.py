"""C3 local composition only; no detector, model call, warp or production entry.
Caller must supply a verified visible-sole mask in source coordinates plus an
explicit protected-pixel mask (upper/occluders/other shoes). Never infer a sole
from colors or a fixed box. Reuse detail_patch after narrowing its protection.
"""
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image
from detail_patch import run as detail_run


def compose(q):
    if q.get('localizationStatus') != 'verified':
        raise ValueError('localization_insufficient')
    if q.get('referenceStatus') != 'verified':
        raise ValueError('reference_insufficient')
    if q.get('occlusionStatus') != 'verified':
        raise ValueError('occlusion_uncertain')
    output_path = Path(q['output']).resolve()
    for key in ('source', 'base', 'generated', 'mask', 'soleMask', 'protectedMask'):
        input_path = Path(q[key]).resolve()
        if output_path == input_path or (output_path.exists() and output_path.samefile(input_path)):
            raise ValueError('output_overwrites_input:' + key)
    source = Image.open(q['source']).convert('RGB')
    size = source.size
    def mask(key):
        im = Image.open(q[key]).convert('L')
        if im.size != size:
            raise ValueError('mask_coordinate_mismatch:' + key)
        return np.asarray(im)
    sole, shoe, protected = mask('soleMask'), mask('mask'), mask('protectedMask')
    support = (sole >= 254) & (shoe >= 254) & (protected == 0)
    ys, xs = np.where(support)
    if len(xs) < 4:
        raise ValueError('localization_empty')
    w, h = size
    box = [int(xs.min())/w, int(ys.min())/h,
           (int(xs.max())+1)/w, (int(ys.max())+1)/h]
    # Preserve existing executor's area gate; never split automatically to evade it.
    if (box[2]-box[0])*(box[3]-box[1]) > .35:
        raise ValueError('localization_exceeds_shared_area_gate')
    for key in ('base', 'generated'):
        if Image.open(q[key]).size != size:
            raise ValueError('candidate_coordinate_mismatch:' + key)
    Path(q['output']).parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sole-mask-') as tmp:
        narrow = str(Path(tmp)/'support.png')
        Image.fromarray(support.astype('uint8')*255).save(narrow)
        result = detail_run(dict(q, action='compose_detail', mask=narrow, box=box))
    base = np.asarray(Image.open(q['base']).convert('RGB'))
    out = np.asarray(Image.open(q['output']).convert('RGB'))
    changed = np.any(base != out, axis=2)
    outside = int(np.count_nonzero(changed & ~support))
    if outside:
        raise ValueError('outside_pixels_changed')
    return dict(result, box=box, changedPixels=int(changed.sum()),
                outsideChangedPixels=outside, semanticReview='not_performed',
                modelCapability='unverified', status='local_composition_only')
