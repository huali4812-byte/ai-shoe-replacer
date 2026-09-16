"""Candidate rectangle intersected with existing protection; no mask expansion."""
from PIL import Image
import numpy as np
import math

def run(q):
    source = Image.open(q['source']).convert('RGB')
    mask = Image.open(q['mask']).convert('L')
    if mask.size != source.size or mask.getbbox() is None:
        raise ValueError('Invalid detail protection mask')
    b = q['box']
    if len(b) != 4 or any(not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 or v > 1 for v in b):
        raise ValueError('Invalid normalized detail box')
    if b[2] <= b[0] or b[3] <= b[1] or (b[2]-b[0])*(b[3]-b[1]) > .35:
        raise ValueError('Unsafe detail area')
    rect = Image.new('L', source.size)
    box = tuple(round(v * source.size[i % 2]) for i, v in enumerate(b))
    rect.paste(255, box)
    support = (np.array(rect) > 0) & (np.array(mask) >= 254)
    if support.sum() < 4:
        raise ValueError('Empty detail/protection intersection')
    local = Image.fromarray(support.astype('uint8') * 255)
    if q['action'] == 'prepare_detail':
        local.save(q['output'])
    else:
        def load(f):
            im = Image.open(f).convert('RGB')
            if abs((im.width/im.height)/(source.width/source.height)-1) > .01:
                raise ValueError('Detail result aspect mismatch')
            return im.resize(source.size, Image.Resampling.LANCZOS)
        base, generated = load(q['base']), load(q['generated'])
        result = Image.composite(generated, base, local)
        if np.any(np.any(np.array(result) != np.array(base), axis=2) & ~support):
            raise ValueError('Detail outside changed')
        result.save(q['output'])
    return {'output':q['output'], 'size':list(source.size), 'editablePixels':int(support.sum()), 'outsideChangedPixels':0}
