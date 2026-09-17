"""Exact boolean-support equivalence to PIL, including gray/edge/tiny masks."""
import importlib.util
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vision', root/'cep/vision.py')
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
rng = np.random.default_rng(4489)
count = 0
for h, w in [(1,1), (1,19), (17,1), (11,13), (45,61)]:
    blank = np.zeros((h,w), dtype=np.uint8)
    corner = blank.copy(); corner[0,0] = 1
    center = blank.copy(); center[h//2,w//2] = 128
    random = rng.choice([0,0,0,1,127,255], size=(h,w)).astype('uint8')
    for arr in [blank, blank+255, corner, center, random]:
        mask = Image.fromarray(arr)
        for radius in [0,1,2,4,12,32,216]:
            expected = np.asarray(mask.filter(ImageFilter.MaxFilter(2*radius+1))) > 0
            actual = v.expanded_binary_support(mask, radius)
            assert actual.shape == arr.shape
            np.testing.assert_array_equal(actual, expected)
            np.testing.assert_array_equal(np.asarray(mask), arr)
            count += 1
for radius in [-1,1.5]:
    try: v.expanded_binary_support(Image.new('L',(2,2)),radius)
    except ValueError: pass
    else: raise AssertionError('Invalid radius accepted')
print(f'PASS: {count} exact PIL comparisons; no input changes; invalid radius rejected')
