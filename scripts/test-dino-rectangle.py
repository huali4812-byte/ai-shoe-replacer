import importlib.util
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vision', ROOT / 'cep' / 'vision.py')
vision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vision)

# DINO ownership is rectangular; AI context is a larger square with the same
# dimensions as the stored local mask.
edit, crop, mask = vision.dino_rectangle_region([100.2, 120.4, 199.1, 180.2], (500, 400))
assert edit == [100, 120, 200, 181]
assert crop[2] - crop[0] == crop[3] - crop[1]
assert crop[0] < edit[0] and crop[1] < edit[1]
assert mask.size == (crop[2] - crop[0], crop[3] - crop[1])
a = np.asarray(mask)
assert np.all(a[edit[1]-crop[1]:edit[3]-crop[1], edit[0]-crop[0]:edit[2]-crop[0]] == 255)
assert np.count_nonzero(a) == (edit[2]-edit[0]) * (edit[3]-edit[1])

# Composition must use the rectangle exactly: no old SAM-style edge dilation,
# no polarity inference, and no changes in the padded context outside the box.
with tempfile.TemporaryDirectory() as folder:
    p = Path(folder)
    source = Image.new('RGB', mask.size, 'white')
    generated = Image.new('RGB', mask.size, 'red')
    source.save(p / 'source.png')
    generated.save(p / 'generated.png')
    mask.save(p / 'mask.png')
    region = {
        'box': [0, 0, mask.width, mask.height],
        'mask': str(p / 'mask.png'),
        'maskMode': 'dino_rectangle',
        'noMaskExpansion': True,
        'generated': str(p / 'generated.png'),
        'output': str(p / 'patch.png'),
    }
    result = vision.compose_parent({
        'source': str(p / 'source.png'),
        'output': str(p / 'out.png'),
        'regions': [region],
    })
    local = Image.open(p / 'patch.png')
    assert local.mode == 'RGB', 'DINO intermediate must remain an opaque scene crop, not an alpha cutout'
    composed = Image.open(p / 'out.png')
    assert composed.mode == 'RGB', 'Photoshop writeback must be an opaque full scene, not an alpha patch'
    out = np.asarray(composed)
    white = np.all(out == (255, 255, 255), axis=2)
    red = np.all(out == (255, 0, 0), axis=2)
    assert np.count_nonzero(red) == np.count_nonzero(a)
    assert np.all(white[a == 0])
    assert result['outsideChangedPixels'] == 0

# Transparent Photoshop canvases may store black RGB under alpha=0. That hidden
# color must never become the AI scene, and full-scene writeback must retain the
# original alpha instead of creating an opaque black/white rectangle.
with tempfile.TemporaryDirectory() as folder:
    p = Path(folder)
    rgba = Image.new('RGBA', (40, 40), (0, 0, 0, 0))
    rgba.paste((20, 30, 40, 255), (12, 10, 28, 30))
    rgba.save(p / 'source.png')
    clean = vision.opaque_scene(Image.open(p / 'source.png'))
    clean_a = np.asarray(clean)
    assert np.all(clean_a[0, 0] == (255, 255, 255)), 'hidden black RGB leaked into AI scene'
    Image.new('L', (40, 40), 255).save(p / 'mask.png')
    Image.new('RGB', (40, 40), 'red').save(p / 'generated.png')
    region = {'box':[0,0,40,40], 'mask':str(p/'mask.png'), 'maskMode':'dino_rectangle',
              'noMaskExpansion':True, 'generated':str(p/'generated.png'), 'output':str(p/'patch.png')}
    vision.compose_parent({'source':str(p/'source.png'), 'output':str(p/'out.png'), 'regions':[region]})
    restored = Image.open(p / 'out.png')
    assert restored.mode == 'RGBA'
    assert np.array_equal(np.asarray(restored.getchannel('A')), np.asarray(rgba.getchannel('A')))
    assert np.all(np.asarray(restored.convert('RGB'))[15, 15] == (255, 0, 0))

# Mismatched model aspect ratio remains a hard failure.
with tempfile.TemporaryDirectory() as folder:
    p = Path(folder)
    Image.new('RGB', (40, 40), 'white').save(p / 'source.png')
    Image.new('L', (40, 40), 255).save(p / 'mask.png')
    Image.new('RGB', (60, 40), 'red').save(p / 'generated.png')
    region = {'box':[0,0,40,40], 'mask':str(p/'mask.png'), 'maskMode':'dino_rectangle',
              'noMaskExpansion':True, 'generated':str(p/'generated.png'), 'output':str(p/'patch.png')}
    try:
        vision.compose_parent({'source':str(p/'source.png'), 'output':str(p/'out.png'), 'regions':[region]})
    except ValueError as exc:
        assert '生成比例不符' in str(exc)
    else:
        raise AssertionError('aspect mismatch accepted')

panel = (ROOT / 'cep' / 'panel.js').read_text()
revisions = (ROOT / 'cep' / 'revisions.cjs').read_text()
assert "transparent:false" in panel and "output,patches:null" in panel
assert "transparent:false" in revisions and "output:composition.output,patches:null" in revisions
assert "transparent:true" not in panel and "transparent:!!p.dualRole" not in revisions

print('PASS: DINO rectangle ownership, opaque AI scenes, preserved source alpha, padded square context, and aspect guard')
