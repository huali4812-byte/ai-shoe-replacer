"""Test structure diagram retains merged generation path while normal scenes use individual shoes."""
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vision', root / 'cep/vision.py')
vision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vision)

# Mock regions representing two detected shoes
regions = [
    {'role': '主推', 'cropBox': [100, 100, 300, 300], 'box': [100, 100, 300, 300], 'index': 0},
    {'role': '主推', 'cropBox': [400, 100, 600, 300], 'box': [400, 100, 600, 300], 'index': 1}
]

print("Test: Structure diagram vs normal scene generation grouping")

# Normal scene: one region per shoe
normal_groups = vision.generation_groups(regions, structure=False)
print(f"  Normal scene (structure=False): {len(normal_groups)} groups")
for i, group in enumerate(normal_groups):
    print(f"    Group {i}: {len(group)} shoe(s), indices {[r['index'] for r in group]}")

if len(normal_groups) != 2:
    raise AssertionError(f'Expected 2 individual groups, got {len(normal_groups)}')
if any(len(g) != 1 for g in normal_groups):
    raise AssertionError('Normal scene should have one shoe per group')

# Structure diagram: merged groups (existing group_nearby_regions behavior)
structure_groups = vision.generation_groups(regions, structure=True)
print(f"\n  Structure diagram (structure=True): {len(structure_groups)} groups")
for i, group in enumerate(structure_groups):
    print(f"    Group {i}: {len(group)} shoe(s), indices {[r['index'] for r in group]}")

# Structure diagrams can merge nearby shoes
# With boxes [100-300] and [400-600], horizontal gap is 100px
# group_nearby_regions uses 0.5 * max(w,h) threshold, so 200*0.5=100
# They are exactly at threshold; check actual behavior
print(f"\n  Structure grouping result: {'merged' if len(structure_groups)==1 else 'separated'}")

# Test widely separated shoes (definitely not merged)
separated_regions = [
    {'role': '主推', 'cropBox': [100, 100, 300, 300], 'box': [100, 100, 300, 300], 'index': 0},
    {'role': '主推', 'cropBox': [800, 100, 1000, 300], 'box': [800, 100, 1000, 300], 'index': 1}
]

sep_normal = vision.generation_groups(separated_regions, structure=False)
sep_structure = vision.generation_groups(separated_regions, structure=True)

print(f"\n  Widely separated shoes:")
print(f"    Normal: {len(sep_normal)} groups (expect 2)")
print(f"    Structure: {len(sep_structure)} groups (expect 2, too far to merge)")

if len(sep_normal) != 2:
    raise AssertionError('Separated shoes should produce 2 groups in normal mode')

# Test very close shoes (should merge in structure mode)
close_regions = [
    {'role': '主推', 'cropBox': [100, 100, 300, 300], 'box': [100, 100, 300, 300], 'index': 0},
    {'role': '主推', 'cropBox': [280, 100, 480, 300], 'box': [280, 100, 480, 300], 'index': 1}
]

close_normal = vision.generation_groups(close_regions, structure=False)
close_structure = vision.generation_groups(close_regions, structure=True)

print(f"\n  Close shoes (20px gap):")
print(f"    Normal: {len(close_normal)} groups (expect 2)")
print(f"    Structure: {len(close_structure)} groups (expect 1, merged)")

if len(close_normal) != 2:
    raise AssertionError('Close shoes should still produce 2 groups in normal mode')
if len(close_structure) != 1:
    raise AssertionError('Close shoes should merge in structure mode')

print("\n✓ PASS: Structure diagram preserves group_nearby_regions merge behavior")
print("  - Normal scenes: one shoe per generation (individual_shoes mode)")
print("  - Structure diagrams: nearby shoes merged (existing grouped path)")
print("  - Close proximity merges in structure mode, not in normal mode")
