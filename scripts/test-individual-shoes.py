"""Offline ownership and grouping checks; no model loading or network."""
import importlib.util
import tempfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vision', root / 'cep/vision.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
a = {'role': '主推', 'cropBox': [0, 0, 30, 30]}
b = {'role': '主推', 'cropBox': [15, 0, 45, 30]}
assert v.generation_groups([a, b]) == [[a], [b]]
assert len(v.generation_groups([a, b], structure=True)) == 1
assert v.generation_groups([]) == []
with tempfile.TemporaryDirectory() as folder:
    def region(name, box, support):
        mask = Image.new('L', (box[2]-box[0], box[3]-box[1]), 0)
        mask.paste(255, support)
        file = str(Path(folder) / (name+'.png'))
        mask.save(file)
        return {'box': box, 'mask': file}
    r1 = region('a', [0, 0, 40, 40], (5, 5, 10, 10))
    r2 = region('b', [0, 0, 40, 40], (25, 25, 30, 30))
    v.validate_shoe_supports((40, 40), [r1, r2])  # overlapping crops allowed
    r3 = region('c', [0, 0, 40, 40], (12, 5, 17, 10))
    try:
        v.validate_shoe_supports((40, 40), [r1, r3])
    except ValueError as e:
        assert '重叠' in str(e)
    else:
        raise AssertionError('expanded overlap must reject even for same role')
    neg = region('negative', [-10, -10, 30, 30], (15, 15, 20, 20))
    v.validate_shoe_supports((40, 40), [neg])
print('PASS individual shoes: crop overlap allowed, expanded mask conflict rejected, negative crop supported')
