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
    # Well-separated shoes should generate individually
    groups = v.generation_groups([r1, r2])
    assert len(groups) == 2 and len(groups[0]) == 1 and len(groups[1]) == 1

    r3 = region('c', [0, 0, 40, 40], (12, 5, 17, 10))
    # Detection grouping remains individual; final-mask reconciliation merges conflicts
    groups_overlap = v.generation_groups([r1, r3])
    assert len(groups_overlap) == 2 and all(len(g) == 1 for g in groups_overlap)
    source = Image.new('RGB', (40, 40), 'white')
    source_path = Path(folder) / 'source.png'
    source.save(source_path)
    final_regions = []
    for i, item in enumerate((r1, r3)):
        final_regions.append({'index': i, 'role': '主推', 'box': item['box'],
                              'mask': item['mask'], 'shoeCount': 1,
                              'detectionIndexes': [i], 'dinoBoxes': [], 'safeBoxes': [],
                              'pullTabRecovery': [], 'score': 1, 'segmentationScore': 1})
    separated_same_role = v.merge_overlapping_regions(source, final_regions, Path(folder))
    assert len(separated_same_role) == 2 and all(r.get('noMaskExpansion') for r in separated_same_role)

    r4 = region('d', [0, 0, 40, 40], (8, 5, 14, 10))
    real_overlap = [dict(final_regions[0]), {**dict(final_regions[1]), **r4}]
    try:
        v.merge_overlapping_regions(source, real_overlap, Path(folder))
    except ValueError as e:
        assert '主体蒙版重叠' in str(e)
    else:
        raise AssertionError('same-role overlapping shoes must not be merged into one request')

    # Different products stay independent and use their exact semantic masks,
    # because only the optional 4px-per-side expansion conflicts here.
    cross_role = [dict(final_regions[0]), dict(final_regions[1])]
    cross_role[1]['role'] = '次推'
    separated = v.merge_overlapping_regions(source, cross_role, Path(folder))
    assert len(separated) == 2 and all(r.get('noMaskExpansion') for r in separated)
    v.validate_shoe_supports(source.size, separated)
    v.role_ownership(source.size, separated)

    # Final validation accepts already reconciled non-overlapping semantic masks.
    v.validate_shoe_supports((40, 40), separated_same_role)

    neg = region('negative', [-10, -10, 30, 30], (15, 15, 20, 20))
    v.validate_shoe_supports((40, 40), [neg])
print('PASS individual shoes: crop overlap allowed, expanded mask conflict rejected, negative crop supported')
