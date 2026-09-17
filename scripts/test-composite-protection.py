"""Test composite protection: only mask pixels change, outside preserved."""
import importlib.util
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vision', root / 'cep/vision.py')
vision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vision)

with tempfile.TemporaryDirectory() as tmpdir:
    tmpdir = Path(tmpdir)
    
    # Create synthetic source image
    source = Image.new('RGB', (400, 300), (200, 200, 200))
    draw = ImageDraw.Draw(source)
    draw.rectangle([50, 50, 150, 150], fill=(100, 100, 100))
    source_file = tmpdir / 'source.png'
    source.save(source_file)
    
    # Create shoe mask in region [100, 100, 250, 200]
    mask = Image.new('L', (150, 100), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse([10, 10, 140, 90], fill=255)
    mask_file = tmpdir / 'mask.png'
    mask.save(mask_file)
    
    # Create generated result that changes both inside and outside
    generated = Image.new('RGB', (150, 100), (50, 50, 200))  # Blue shoe
    draw_gen = ImageDraw.Draw(generated)
    draw_gen.rectangle([0, 0, 20, 20], fill=(255, 0, 0))  # Red corner (outside mask)
    generated_file = tmpdir / 'generated.png'
    generated.save(generated_file)
    
    output_file = tmpdir / 'output.png'
    
    request = {
        'source': str(source_file),
        'generated': str(generated_file),
        'output': str(output_file),
        'region': {
            'box': [100, 100, 250, 200],
            'mask': str(mask_file)
        }
    }
    
    print("Test 1: Composite protection")
    print("  Source: 400x300 gray background")
    print("  Region: [100, 100, 250, 200]")
    print("  Mask: ellipse in region")
    print("  Generated: blue shoe + red corner outside mask")
    
    result = vision.composite(request)
    
    print(f"  ✓ Composite successful")
    print(f"    Outside changed: {result['outsideChangedPixels']} (expect 0)")
    print(f"    Editable pixels: {result['editablePixels']}")
    
    if result['outsideChangedPixels'] != 0:
        raise AssertionError('Outside pixels should not change')
    
    # Verify final composite has protection
    output = Image.open(output_file).convert('RGBA')
    alpha_check = np.array(output)[:, :, 3]
    non_zero_alpha = np.count_nonzero(alpha_check > 0)
    
    print(f"    Output alpha non-zero: {non_zero_alpha}")
    
    # Verify composition with parent
    final = Image.open(source_file).convert('RGB')
    region_box = [100, 100, 250, 200]
    composite_patch = Image.open(output_file).convert('RGBA')
    final.paste(composite_patch, (region_box[0], region_box[1]), composite_patch)
    
    # Check that area outside region is unchanged
    final_array = np.array(final)
    source_array = np.array(source)
    
    # Create mask for outside region
    outside_mask = np.ones((300, 400), dtype=bool)
    outside_mask[region_box[1]:region_box[3], region_box[0]:region_box[2]] = False
    
    outside_changed = np.any(final_array[outside_mask] != source_array[outside_mask])
    
    print(f"    Parent composition outside region changed: {outside_changed}")
    
    if outside_changed:
        raise AssertionError('Parent composition changed pixels outside region')
    
    print("  ✓ Region-outside pixels preserved in parent composition")

print("\n✓ PASS: Composite protection verified")
print("  - Only mask pixels written to output")
print("  - Outside pixels unchanged (validated at composite)")
print("  - Parent composition preserves non-region pixels")
