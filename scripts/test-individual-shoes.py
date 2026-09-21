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
assert v.generation_groups([a, b]) == [[a, b]], 'single person must use one scene-level generation'
assert len(v.generation_groups([a, b], structure=True)) == 1
assert v.generation_groups([]) == []
assert v.generation_groups([a, b], generation_kind='sole') == [[a, b]], 'sole must use one scene-level generation'
# Final AI crops keep at least 24%/24px context and shift inside the canvas.
assert v.square_box([100,100,200,180],(500,500)) == [76,66,224,214]
edge=v.square_box([10,5,110,85],(500,500))
assert edge[0] == 0 and edge[1] == 0 and edge[2]-edge[0] == 148
c = {'role': '次推', 'cropBox': [100, 0, 130, 30]}
d = {'role': '次推', 'cropBox': [115, 0, 145, 30]}
assert v.generation_groups([a, c, b, d], generation_kind='sole') == [[a, c, b, d]]
assert v.generation_groups([a, c, b, d]) == [[a, b], [c, d]], 'dual person must use one scene per role'
odd = v.generation_groups([a, b, {'role':'主推','cropBox':[200,0,230,30]}])
assert len(odd) == 1 and len(odd[0]) == 3, odd
with tempfile.TemporaryDirectory() as folder:
    def region(name, box, support):
        mask = Image.new('L', (box[2]-box[0], box[3]-box[1]), 0)
        mask.paste(255, support)
        file = str(Path(folder) / (name+'.png'))
        mask.save(file)
        return {'box': box, 'mask': file}
    r1 = region('a', [0, 0, 40, 40], (5, 5, 10, 10))
    r2 = region('b', [0, 0, 40, 40], (25, 25, 30, 30))
    # Two shoes of the same product generate as one physical pair.
    groups = v.generation_groups([r1, r2])
    assert len(groups) == 1 and len(groups[0]) == 2

    r3 = region('c', [0, 0, 40, 40], (12, 5, 17, 10))
    groups_overlap = v.generation_groups([r1, r3])
    assert len(groups_overlap) == 1 and len(groups_overlap[0]) == 2
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
    reconciled = v.merge_overlapping_regions(source, real_overlap, Path(folder))
    assert len(reconciled) == 2 and all(r.get('noMaskExpansion') for r in reconciled)

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
print('PASS person-level generation: single person <=1 region, dual person <=2 role regions, sole =1 region')
