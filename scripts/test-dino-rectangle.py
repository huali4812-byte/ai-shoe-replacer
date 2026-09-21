import importlib.util
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vision', ROOT / 'cep' / 'vision.py')
vision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vision)

# DINO ownership is padded into a writable safety rectangle; AI context is a
# still larger square around that rectangle.
edit, crop, mask = vision.dino_rectangle_region([100.2, 120.4, 199.1, 180.2], (500, 400))
assert edit == [68, 88, 232, 213]
assert crop[2] - crop[0] == crop[3] - crop[1]
assert crop[0] < edit[0] and crop[1] < edit[1]
assert mask.size == (crop[2] - crop[0], crop[3] - crop[1])
a = np.asarray(mask)
assert np.all(a[edit[1]-crop[1]:edit[3]-crop[1], edit[0]-crop[0]:edit[2]-crop[0]] == 255)
assert np.count_nonzero(a) == (edit[2]-edit[0]) * (edit[3]-edit[1])

# Portrait canvases must never produce an off-canvas square wider than the
# canvas. This exact shape previously yielded [-1033, 0, 2417, 3450] and forced
# a 1024px AI result to be enlarged 3.37x.
portrait = vision.square_box([11, 548, 1374, 2879], (1888, 3840))
assert portrait == [0, 769, 1888, 2657], portrait

# Real 4522 regression: two full-frame shoes were 11–13k pixels, while two
# low-confidence tile false positives covered 67k and 220k pixels and later
# overwrote the sharp generation. Both scale outliers must be rejected.
full_max = 13434
assert vision.tile_scale_outlier({'box':[54,845,365,1063], 'pass':'tile', 'score':.325}, full_max)
assert vision.tile_scale_outlier({'box':[205,367,522,1061], 'pass':'tile', 'score':.303}, full_max)
assert not vision.tile_scale_outlier({'box':[54,845,165,963], 'pass':'tile', 'score':.325}, full_max)
assert not vision.tile_scale_outlier({'box':[54,845,365,1063], 'pass':'tile', 'score':.55}, full_max)

# Real 12050 regression: DINO found the two shoes at the person's feet plus
# two huge upper-body/trouser false positives. A one-person task may retain the
# clear bottom pair, but must never merge all four into one AI scene edit.
boxes = [[428,1542,1107,2097], [3,1456,591,1783],
         [148,3,757,1395], [621,919,1025,1398]]
detections = [{'detector_box': box} for box in boxes]
accepted = [{'index': i, 'bounds': box} for i, box in enumerate(boxes)]
kept, skipped = vision.filter_single_person_footline(accepted, detections, 2103)
assert [item['index'] for item in kept] == [0, 1], kept
assert [item['index'] for item in skipped] == [2, 3], skipped
# More than two boxes sharing the footline is ambiguous and must not be
# silently truncated by score or detector order.
ambiguous_boxes = [[10,1500,300,1900], [350,1510,650,1910], [700,1490,1000,1920]]
ambiguous_detections = [{'detector_box': box} for box in ambiguous_boxes]
ambiguous = [{'index': i, 'bounds': box} for i, box in enumerate(ambiguous_boxes)]
kept, skipped = vision.filter_single_person_footline(ambiguous, ambiguous_detections, 2103)
assert len(kept) == 3 and not skipped

# Composition must use the padded rectangle exactly: no old SAM-style edge
# dilation, no polarity inference, and no changes outside the writable box.
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

# Matching aspect ratio is accepted even when the AI result needs enlargement.
with tempfile.TemporaryDirectory() as folder:
    p = Path(folder)
    Image.new('RGB', (2100, 2100), 'white').save(p / 'source.png')
    Image.new('L', (2100, 2100), 255).save(p / 'mask.png')
    Image.new('RGB', (1024, 1024), 'red').save(p / 'generated.png')
    region = {'box':[0,0,2100,2100], 'mask':str(p/'mask.png'), 'maskMode':'dino_rectangle',
              'noMaskExpansion':True, 'generated':str(p/'generated.png'), 'output':str(p/'patch.png')}
    result = vision.compose_parent({'source':str(p/'source.png'), 'output':str(p/'out.png'), 'regions':[region]})
    assert result['regions'][0]['size'] == [2100, 2100]
    assert Image.open(p / 'out.png').size == (2100, 2100)

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

print('PASS: DINO ownership, in-canvas crops, proportional enlargement, opaque scenes, alpha preservation, and aspect guard')
