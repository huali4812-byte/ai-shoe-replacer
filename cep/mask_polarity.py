"""Offline white-product mask repair candidate. Not a person/alpha classifier.
Never changes source assets or authorizes Photoshop writes. Transparent isolated
objects require a separate alpha-preserving replacement transaction.
"""
import numpy as np
from PIL import Image
from scipy import ndimage


def propose(source, mask, box):
    """Check for inverted mask on the crop region only, not full canvas."""
    x0, y0, x1, y1 = box
    # Clamp box to source bounds
    x0_clamp, y0_clamp = max(0, x0), max(0, y0)
    x1_clamp, y1_clamp = min(source.width, x1), min(source.height, y1)
    if x0_clamp >= x1_clamp or y0_clamp >= y1_clamp:
        return None, {'status': 'not_applicable', 'reason': 'box_outside_source'}
    
    # Crop source and mask to overlapping region
    source_crop = source.crop((x0_clamp, y0_clamp, x1_clamp, y1_clamp))
    # Mask coordinates relative to box origin
    mask_x0, mask_y0 = x0_clamp - x0, y0_clamp - y0
    mask_x1, mask_y1 = mask_x0 + (x1_clamp - x0_clamp), mask_y0 + (y1_clamp - y0_clamp)
    mask_crop = mask.crop((mask_x0, mask_y0, mask_x1, mask_y1))
    
    rgb = np.asarray(source_crop.convert('RGB'))
    local = np.asarray(mask_crop.convert('L'))
    if source_crop.mode == 'RGBA' and source_crop.getchannel('A').getextrema()[0] < 255:
        return None, {'status':'not_applicable', 'reason':'transparent_source_requires_alpha_path'}
    white = np.min(rgb, axis=2) >= 248
    border = np.concatenate([white[0],white[-1],white[:,0],white[:,-1]])
    if border.mean() < .99:
        return None, {'status':'not_applicable','reason':'not_uniform_white_border'}
    seeds = np.zeros(white.shape, bool)
    seeds[0]=white[0]; seeds[-1]=white[-1]; seeds[:,0]=white[:,0]; seeds[:,-1]=white[:,-1]
    background = ndimage.binary_propagation(seeds, mask=white)
    foreground = ~background
    area = float(foreground.mean())
    if not .1 < area < .85:
        return None, {'status':'unknown','reason':'foreground_area_ambiguous','foregroundFraction':area}
    labels, count = ndimage.label(foreground)
    sizes = np.bincount(labels.ravel()); sizes[0]=0
    if not count or sizes.max()/max(1,foreground.sum()) < .98:
        return None, {'status':'unknown','reason':'multiple_foreground_components'}
    
    # Check writable coverage on the cropped region
    crop_writable = local > 127
    fg_coverage=float(crop_writable[foreground].mean()); bg_coverage=float(crop_writable[background].mean())
    evidence={'foregroundFraction':area,'foregroundCoverage':fg_coverage,'backgroundCoverage':bg_coverage,'thresholdWhite':248,'psWriteAllowed':False}
    if fg_coverage>.1 or bg_coverage<.85:
        return None,dict(evidence,status='unchanged',reason='no_strong_inverse_evidence')
    
    # Return full-size repaired mask matching original mask dimensions
    repaired_crop = Image.fromarray(foreground.astype('uint8')*255)
    repaired = Image.new('L', mask.size, 0)
    repaired.paste(repaired_crop, (mask_x0, mask_y0))
    return repaired,dict(evidence,status='candidate',reason='white_background_selected_instead_of_foreground',limitations='White footwear edges/old silhouette require review; not production authorization')
