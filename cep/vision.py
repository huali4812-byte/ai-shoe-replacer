"""Local shoe detection/segmentation. JSON-lines protocol; stdout is protocol only."""
import json
import math
import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage


def opaque_scene(image, background=(255, 255, 255)):
    """Return an RGB scene without exposing hidden RGB under transparent pixels."""
    rgba = image.convert('RGBA')
    base = Image.new('RGBA', rgba.size, (*background, 255))
    return Image.alpha_composite(base, rgba).convert('RGB')


def expanded_binary_support(mask, radius):
    """Exactly MaxFilter(2*radius+1) > 0 for an L mask, without a large kernel.

    Boolean OR is separable. Clipped windows equal PIL edge replication for
    this predicate; output dimensions and support at image edges are unchanged.
    """
    if not isinstance(radius, int) or radius < 0:
        raise ValueError('Expansion radius must be a nonnegative integer')
    if mask.mode != 'L':
        raise ValueError('Expansion requires an L mask')
    support = np.asarray(mask) > 0
    for axis in (1, 0):
        length = support.shape[axis]
        prefix = np.cumsum(support, axis=axis, dtype=np.int32)
        pad = [(0, 0), (0, 0)]
        pad[axis] = (1, 0)
        prefix = np.pad(prefix, pad, mode='constant')
        positions = np.arange(length)
        low = np.maximum(positions-radius, 0)
        high = np.minimum(positions+radius+1, length)
        support = np.take(prefix, high, axis=axis) > np.take(prefix, low, axis=axis)
    return support


def square_box(box, size, padding=0.24, min_margin=24):
    """Square AI crop with real source context around every detected shoe.

    Detection boxes can be tight around pull tabs/toes. Use a larger margin and
    shift the square back inside the canvas instead of introducing off-canvas
    black padding when source pixels are available on the opposite side.
    """
    x0, y0, x1, y1 = box
    extent=max(1,x1-x0,y1-y0)
    side=max(1,math.ceil(extent+2*max(min_margin,extent*padding)))
    width,height=size;side=min(side,max(width,height))
    cx,cy=(x0+x1)/2,(y0+y1)/2
    left=math.floor(cx-side/2);top=math.floor(cy-side/2)
    if side<=width:left=min(max(0,left),width-side)
    if side<=height:top=min(max(0,top),height-side)
    return [left,top,left+side,top+side]

def safe_box(box, size, xpad=.14, ypad=.18):
    x0,y0,x1,y1=box; w,h=size; bw=max(1,x1-x0); bh=max(1,y1-y0)
    return [max(0,int(x0-bw*xpad)),max(0,int(y0-bh*ypad)),min(w,int(x1+bw*xpad)),min(h,int(y1+bh*ypad))]


def dino_rectangle_region(box, size):
    """Use the detector rectangle as ownership and a padded square as AI context."""
    width, height = size
    edit = [max(0, int(math.floor(box[0]))), max(0, int(math.floor(box[1]))),
            min(width, int(math.ceil(box[2]))), min(height, int(math.ceil(box[3])))]
    if edit[2] <= edit[0] or edit[3] <= edit[1]:
        raise ValueError('DINO 鞋框为空')
    crop = square_box(edit, size)
    mask = Image.new('L', (crop[2]-crop[0], crop[3]-crop[1]), 0)
    mask.paste(255, (edit[0]-crop[0], edit[1]-crop[1],
                     edit[2]-crop[0], edit[3]-crop[1]))
    return edit, crop, mask


def boxes_near(a, b):
    """Group shoes whose padded crops would show each other."""
    aw, ah = a[2]-a[0], a[3]-a[1]
    bw, bh = b[2]-b[0], b[3]-b[1]
    gap = max(4, round(min(max(aw, ah), max(bw, bh)) * .12))
    return not (a[2]+gap < b[0] or b[2]+gap < a[0] or
                a[3]+gap < b[1] or b[3]+gap < a[1])


def group_nearby_regions(regions):
    groups = []
    for region in regions:
        # Support both 'cropBox' (from early detection) and 'box' (from final regions)
        box = region.get('cropBox') or region.get('box')
        if not box:
            groups.append([region])
            continue
        touching = [g for g in groups if any(
            region.get('role') == old.get('role') and
            boxes_near(box, old.get('cropBox') or old.get('box'))
            for old in g if (old.get('cropBox') or old.get('box'))
        )]
        if not touching:
            groups.append([region])
            continue
        merged = [region]
        for group in touching:
            merged.extend(group)
            groups.remove(group)
        groups.append(merged)
    return groups


def _pair_cost(a, b):
    ab = a.get('bounds') or a.get('box') or a.get('cropBox')
    bb = b.get('bounds') or b.get('box') or b.get('cropBox')
    ac=((ab[0]+ab[2])/2,(ab[1]+ab[3])/2);bc=((bb[0]+bb[2])/2,(bb[1]+bb[3])/2)
    sa=math.sqrt(max(1,(ab[2]-ab[0])*(ab[3]-ab[1])))
    sb=math.sqrt(max(1,(bb[2]-bb[0])*(bb[3]-bb[1])))
    return math.hypot(ac[0]-bc[0],ac[1]-bc[1])/((sa+sb)/2)+abs(math.log(sa/sb))


def _pair_bucket(items):
    """Prefer clear physical pairs, with safe single-shoe fallback.

    A missed or false-positive detection must not block every valid shoe in the
    layer. Ambiguous shoes retain the older independent generation behavior.
    """
    if len(items)==0:return []
    if len(items)==1:return [[items[0]]]
    if len(items)==2:return [[items[0],items[1]]]
    def match(rest, allow_single):
        if not rest:return [(0,[])]
        first=rest[0];out=[]
        if allow_single:
            for score,groups in match(rest[1:],False):
                out.append((score,[[first]]+groups))
        for i in range(1,len(rest)):
            second=rest[i]
            for score,groups in match(rest[1:i]+rest[i+1:],allow_single):
                out.append((score+_pair_cost(first,second),[[first,second]]+groups))
        return out
    choices=sorted(match(list(items),len(items)%2==1),key=lambda x:x[0])
    # If several assignments are similarly plausible, generating each shoe
    # independently is safer than pairing shoes from different people.
    if len(choices)>1 and choices[1][0]-choices[0][0] < max(.5,choices[0][0]*.3):
        return [[item] for item in items]
    return choices[0][1]


def generation_groups(regions, structure=False, generation_kind=None):
    """Generate pairs only for pair tasks; marked single tasks stay single."""
    if structure:return group_nearby_regions(regions)
    if generation_kind in ('single_main','single_secondary','sole'):
        return [[r] for r in regions]
    buckets={}
    for region in regions:buckets.setdefault(region.get('role') or '__single_product__',[]).append(region)
    groups=[]
    for role in sorted(buckets):groups.extend(_pair_bucket(buckets[role]))
    return groups


def merge_overlapping_regions(source, regions, folder):
    """Keep every detected shoe as an independent generation unit.

    Crop overlap is harmless. If only the optional 4px edit margins collide,
    disable expansion for both shoes. Real semantic-mask overlap is ambiguous:
    reject it instead of silently combining two or more shoes into one request.
    """
    if len(regions) < 2:
        return regions
    size = source.size
    semantic, expanded = [], []
    for region in regions:
        box = region['box']
        mask = Image.open(region['mask']).convert('L')
        if mask.size != (box[2]-box[0], box[3]-box[1]) or not mask.getbbox():
            raise ValueError('单鞋蒙版为空或尺寸不一致')
        raw = Image.new('L', size, 0)
        raw.paste(mask, tuple(box[:2]))
        grown = Image.new('L', size, 0)
        grown.paste(mask.filter(ImageFilter.MaxFilter(9)), tuple(box[:2]))
        semantic.append(np.asarray(raw) > 0)
        expanded.append(np.asarray(grown) > 0)
    for i in range(len(regions)):
        for j in range(i):
            # Keep close or slightly overlapping shoes as independent
            # generation units. Disable dilation for both masks so the
            # overlap is not widened during composition; writeback remains
            # non-blocking and preserves the detected regions.
            if np.any(semantic[i] & semantic[j]) or np.any(expanded[i] & expanded[j]):
                regions[i]['noMaskExpansion'] = True
                regions[j]['noMaskExpansion'] = True
    return regions


def validate_shoe_supports(size, regions):
    """Final validation that regions are safe to write independently.

    This should never fail if generation_groups() works correctly.
    """
    if not regions:
        return
    occupied = np.zeros((size[1], size[0]), dtype=bool)
    for region in regions:
        box = region['box']
        mask = Image.open(region['mask']).convert('L')
        if mask.size != (box[2]-box[0], box[3]-box[1]) or not mask.getbbox():
            raise ValueError('单鞋蒙版为空或尺寸不一致')
        full = Image.new('L', size, 0)
        editable = mask if region.get('noMaskExpansion') else mask.filter(ImageFilter.MaxFilter(9))
        full.paste(editable, tuple(box[:2]))
        support = np.array(full) > 0
        # Expanded edit margins are not ownership and may legitimately touch.
        occupied |= support


def marker_role(box, markers):
    """Use annotation proximity only when the competing role is clearly farther."""
    cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
    distances = {}
    for marker in markers:
        x0, y0, x1, y1 = marker['bounds']
        # Labels sit beside shoes: vertical alignment is more informative than horizontal distance.
        distance = math.hypot(max(x0-cx, 0, cx-x1), 2 * max(y0-cy, 0, cy-y1))
        role = marker['role']
        distances[role] = min(distance, distances.get(role, float('inf')))
    if set(distances) != {'主推', '次推'}:
        raise ValueError('紫色图缺少主推或次推文字标注')
    ordered = sorted(distances, key=distances.get)
    if distances[ordered[1]] - distances[ordered[0]] < max(12, distances[ordered[1]] * .2):
        raise ValueError('鞋位与主次推标注距离相近，请将文字移近对应鞋子后重试')
    return ordered[0]


def assign_shoe_groups(accepted, markers):
    """Bind two physical shoe groups to the two labels, globally and once.

    Label layers are hidden only after their bounds are recorded.  Grouping
    first prevents detector order, left/right order, or one unusually large
    foreground shoe from swapping 主推 and 次推.
    """
    role_markers={m['role']:m for m in markers}
    if set(role_markers) != {'主推','次推'}:
        raise ValueError('紫色图缺少主推或次推文字标注')
    groups=_pair_bucket(accepted)
    if len(groups) != 2 or any(len(g) > 2 for g in groups):
        raise ValueError('无法将鞋位稳定分成主推和次推两组，请将文字移近对应一双鞋后重试')
    def group_box(group):
        boxes=[x['bounds'] for x in group]
        return [min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]
    def distance(box, marker):
        cx,cy=(box[0]+box[2])/2,(box[1]+box[3])/2
        x0,y0,x1,y1=marker['bounds']
        return math.hypot(max(x0-cx,0,cx-x1),2*max(y0-cy,0,cy-y1))
    boxes=[group_box(g) for g in groups]
    direct=distance(boxes[0],role_markers['主推'])+distance(boxes[1],role_markers['次推'])
    swapped=distance(boxes[0],role_markers['次推'])+distance(boxes[1],role_markers['主推'])
    if abs(direct-swapped) < max(12,min(direct,swapped)*.2):
        raise ValueError('两组鞋位与主次推标注距离相近，请将文字移近对应鞋子后重试')
    roles=['主推','次推'] if direct < swapped else ['次推','主推']
    for group,box,role in zip(groups,boxes,roles):
        for item in group:
            item['role']=role
            item['roleGroupBox']=box[:]
            item['roleBinding']='global_marker_group'


def diagnose_result(request):
    source = Image.open(request['source']).convert('RGB')
    generated = Image.open(request['generated']).convert('RGB')
    mask = Image.open(request['mask']).convert('L')
    stage = request.get('stage', 'local')
    if stage not in ('local', 'parent'):
        raise ValueError('未知诊断阶段')
    if source.size != mask.size or mask.getbbox() is None:
        raise ValueError('原图和蒙版尺寸不一致或蒙版为空')
    original_generated_size = list(generated.size)
    if generated.size != source.size:
        if stage != 'local' or abs((generated.width/generated.height)/(source.width/source.height)-1) > .01:
            raise ValueError('生成比例或完整画布尺寸不一致')
        generated = generated.resize(source.size, Image.Resampling.LANCZOS)
    m = np.array(mask) > 0
    delta = np.abs(np.array(source, dtype=np.int16) - np.array(generated, dtype=np.int16)).mean(axis=2)
    outside = ~m
    exact_changed = int(np.count_nonzero(outside & np.any(np.array(source) != np.array(generated), axis=2)))
    outside_changed = int(np.count_nonzero(outside & (delta > 24)))
    outside_total = int(np.count_nonzero(outside))
    boundary = np.zeros_like(m)
    boundary[1:] |= m[1:] != m[:-1]
    boundary[:,1:] |= m[:,1:] != m[:,:-1]
    boundary_changed = int(np.count_nonzero(boundary & (delta > 40)))
    return {'stage': stage, 'generatedSize': original_generated_size,
            'exactOutsideChangedPixels': exact_changed,
            'semanticChecked': False,
            'size': list(source.size), 'outsideChangedPixels': outside_changed,
            'outsidePixels': outside_total,
            'outsideChangedFraction': outside_changed / max(1, outside_total),
            'boundaryChangedPixels': boundary_changed,
            'passed': stage == 'local' or exact_changed == 0}


def corrected_mask(source, box, fallback):
    """Reuse a locally verified correction only for identical source pixels and crop.

    This is not a scene classifier: a changed image or crop retains its own mask.
    Read on each composition so existing sessions can reuse newly verified masks.
    """
    root = Path.home() / 'Pictures' / 'AI-Shoe-Mask-Repairs'
    if not root.exists():
        return fallback, None
    key = hashlib.sha256(source.tobytes()).hexdigest()
    manifest = root / (key + '.json')
    if not manifest.exists():
        return fallback, None
    record = json.loads(manifest.read_text())
    if record.get('sourceSize') != list(source.size) or record.get('box') != list(box):
        return fallback, None
    if record.get('sourceHash') != key or record.get('status') != 'verified':
        return fallback, None
    path = root / record['mask']
    if path.parent != root or hashlib.sha256(path.read_bytes()).hexdigest() != record['maskHash']:
        raise ValueError('已验证蒙版文件变化，停止复用纠正')
    mask = Image.open(path).convert('L')
    if mask.size != fallback.size or not mask.getbbox():
        raise ValueError('已验证蒙版尺寸异常')
    return mask, str(manifest)


def composite(request):
    source_file = Image.open(request['source'])
    source = opaque_scene(source_file)
    region = request['region']
    mask = Image.open(region['mask']).convert('L')
    if mask.getbbox() is None:
        raise ValueError('空蒙版，禁止回写')
    box = region['box']

    correction = None
    if region.get('maskMode') != 'dino_rectangle':
        # Legacy/manual semantic masks retain polarity and verified repair support.
        from mask_polarity import propose
        repaired, polarity = propose(source, mask, box)
        if polarity['status'] == 'candidate':
            correction = {'method': 'white_background_inversion', 'evidence': polarity}
            mask = repaired
        elif polarity['status'] not in ('unchanged', 'not_applicable'):
            correction = {'method': 'polarity_check_inconclusive', 'evidence': polarity}
        mask, legacy_correction = corrected_mask(source, box, mask)
        if legacy_correction and not correction:
            correction = legacy_correction
        elif legacy_correction and correction:
            correction = {'primary': correction, 'secondary': legacy_correction}

    generated = Image.open(request['generated']).convert('RGB')
    size = (box[2]-box[0], box[3]-box[1])
    if mask.size != size:
        raise ValueError('蒙版尺寸与区域不一致，禁止回写')
    if generated.size != size:
        if abs((generated.width / generated.height) / (size[0] / size[1]) - 1) > 0.01:
            raise ValueError(f'生成比例不符：{generated.width}x{generated.height}，区域 {size[0]}x{size[1]}，禁止回写')
        # Preserve the model output aspect ratio; never stretch a shoe.
        scale = min(size[0] / generated.width, size[1] / generated.height)
        fitted = generated.resize((max(1, round(generated.width * scale)), max(1, round(generated.height * scale))), Image.Resampling.LANCZOS)
        canvas = Image.new('RGB', size, (0, 0, 0))
        canvas.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
        generated = canvas
    original = source.crop(box)
    # Expand the editable boundary slightly so the replacement shoe is not
    # clipped by the old shoe silhouette (the source shoe mask is only a
    # protection guide, not the new shoe's final outline).
    expanded_mask = mask if (region.get('sceneType') == 'shoe_structure' or region.get('noMaskExpansion')) else mask.filter(ImageFilter.MaxFilter(9))
    alpha = np.array(expanded_mask)
    outside_mask = alpha == 0
    delta = np.abs(np.array(original, dtype=np.float32)-np.array(generated, dtype=np.float32)).mean(axis=2)
    changed_fraction = float(np.mean(delta[outside_mask] > 40)) if np.any(outside_mask) else 0.0
    # The returned image may contain colored streaks on a white generation
    # background. Keep the original mask as the ownership limit, but when the
    # generated border is white, remove disconnected non-background artifacts
    # from the patch alpha. This is cleanup only; it never rejects writeback.
    patch_mask = np.array(expanded_mask) > 0
    if region.get('maskMode') != 'dino_rectangle':
        try:
            rgb = np.asarray(generated)
            border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
            if float(np.mean(np.min(border, axis=1) >= 245)) >= .9:
                foreground = np.min(rgb, axis=2) < 238
                labels, count = ndimage.label(foreground)
                if count:
                    sizes = np.bincount(labels.ravel()); sizes[0] = 0
                    main = labels == int(np.argmax(sizes))
                    # Recover antialiased shoe edges, but not isolated line noise.
                    main = ndimage.binary_dilation(main, iterations=2)
                    patch_mask &= main
        except Exception:
            pass
    patch_alpha = Image.fromarray((patch_mask.astype('uint8') * 255), mode='L')
    original = source.crop(box)
    combined = Image.composite(generated, original, patch_alpha)
    if region.get('maskMode') == 'dino_rectangle':
        # DINO ownership is enforced during composition, but its artifact is an
        # opaque scene crop. Never turn a rectangular edit into an alpha cutout.
        combined.save(request['output'])
    else:
        patch = generated.convert('RGBA')
        patch.putalpha(patch_alpha)
        patch.save(request['output'])
    before, after, alpha = np.array(original), np.array(combined), np.array(patch_alpha)
    outside = int(np.count_nonzero(np.any(before != after, axis=2) & (alpha == 0)))
    if outside:
        raise ValueError('区域外像素校验失败')
    return {'output': request['output'], 'box': box, 'maskCorrection':correction, 'outsideChangedPixels': outside,
            'editablePixels': int(np.count_nonzero(alpha)), 'size': list(size),
            'modelOutsideChangedFraction': changed_fraction}


def role_ownership(size, regions):
    """Validate original semantic ownership and mark unsafe edit dilation."""
    owners = {}
    expanded_by_role = {}
    for region in regions:
        role = region.get('role')
        if role not in ('主推', '次推'):
            raise ValueError('紫色合成区域缺少明确角色，禁止回写')
        box = region['box']
        mask = Image.open(region['mask']).convert('L')
        if mask.size != (box[2]-box[0], box[3]-box[1]) or mask.getbbox() is None:
            raise ValueError('角色保护蒙版为空或尺寸不一致')
        # Ownership comes from the original semantic mask only. Dilation is
        # merely an editable boundary and falsely rejects close double shoes.
        full = Image.new('L', size, 0)
        full.paste(mask, tuple(box[:2]))
        occupied = np.array(full) > 0
        for other, previous in owners.items():
            if other != role and np.any(occupied & previous):
                # SAM can assign a narrow shared boundary to both close shoes.
                # Keep both role-specific generations and continue writeback;
                # disabling dilation prevents the shared area from growing.
                region['noMaskExpansion'] = True
                for earlier in regions:
                    if earlier.get('role') == other:
                        earlier['noMaskExpansion'] = True
        expanded_full = Image.new('L', size, 0)
        expanded_full.paste(mask.filter(ImageFilter.MaxFilter(9)), tuple(box[:2]))
        expanded = np.array(expanded_full) > 0
        if any(other != role and np.any(expanded & previous)
               for other, previous in expanded_by_role.items()):
            region['noMaskExpansion'] = True
        for other, previous in expanded_by_role.items():
            if other != role and np.any(expanded & previous):
                for earlier in regions:
                    if earlier.get('role') == other:
                        earlier['noMaskExpansion'] = True
        owners[role] = occupied | owners.get(role, np.zeros_like(occupied))
        expanded_by_role[role] = expanded | expanded_by_role.get(role, np.zeros_like(expanded))


def compose_parent(request):
    source_file = Image.open(request['source'])
    original = opaque_scene(source_file)
    original_alpha = source_file.convert('RGBA').getchannel('A') if 'A' in source_file.getbands() else None
    canvas = original.copy()
    union = Image.new('L', original.size, 0)
    checks, rejected = [], []
    if not request['regions']:
        raise ValueError('没有可合成区域')
    protections = request.get('protectionRegions', request['regions'])
    if request.get('requireRoles') or len({r.get('role') for r in protections if r.get('role')}) > 1:
        keys = {(tuple(r['box']), r['mask'], r.get('role')) for r in protections}
        if any((tuple(r['box']), r['mask'], r.get('role')) not in keys for r in request['regions']):
            raise ValueError('合成区域与角色保护清单不一致')
        role_ownership(original.size, protections)
        no_expansion = {(tuple(r['box']), r['mask'], r.get('role'))
                        for r in protections if r.get('noMaskExpansion')}
        for region in request['regions']:
            if (tuple(region['box']), region['mask'], region.get('role')) in no_expansion:
                region['noMaskExpansion'] = True
    for region in request['regions']:
        try:
            patch_path = region['output']
            check = composite({'source': request['source'], 'region': region,
                               'generated': region['generated'], 'output': patch_path})
        except (ValueError, OSError) as exc:
            if region.get('written'):
                raise ValueError('已写回区域无法复用，停止合成以保留原结果：' + str(exc)) from exc
            if not request.get('allowPartial'):
                raise
            rejected.append({'id': region.get('id'), 'error': str(exc)})
            continue
        check.update(id=region.get('id'), role=region.get('role'))
        patch = Image.open(patch_path)
        xy = tuple(region['box'][:2])
        if region.get('maskMode') == 'dino_rectangle':
            # The local file is an opaque scene crop. The rectangle mask is used
            # only in memory to merge pixels into the full original canvas.
            support = Image.open(region['mask']).convert('L')
            canvas.paste(patch.convert('RGB'), xy, support)
        else:
            patch = patch.convert('RGBA')
            support = patch.getchannel('A')
            canvas.paste(patch.convert('RGB'), xy, support)
        # Union is max(support), not alpha composited over alpha.
        full_alpha = Image.new('L', original.size, 0)
        full_alpha.paste(support, xy)
        union = Image.fromarray(np.maximum(np.array(union), np.array(full_alpha)))
        checks.append(check)
    if not checks:
        return {'output': None, 'size': list(canvas.size), 'regions': [], 'rejected': rejected}
    # Only a complete, validated transaction may remove the separate text
    # layers. A partial result must still preserve their visible rectangles.
    markers_will_hide = bool(request.get('finalizeRoleMarkers') and request.get('requireRoles')
                             and not rejected and len(checks) == len(protections)
                             and {r.get('role') for r in checks} == {'主推', '次推'})
    for marker in ([] if markers_will_hide else request.get('protectedMarkers', [])):
        if union.crop(tuple(round(x) for x in marker['bounds'])).getbbox():
            raise ValueError('鞋部贴片与保留的提示文字相交，禁止覆盖提示文字')
    outside = np.array(union) == 0
    changed = np.any(np.array(canvas) != np.array(original), axis=2)
    if np.any(changed & outside):
        raise ValueError('完整画布蒙版外像素改变，禁止回写')
    # Full-resolution opaque review crops come from the final canvas after all
    # patches, not the raw generator result or an isolated transparent patch.
    for check in checks:
        base = str(Path(check['output']).with_suffix(''))
        check['reviewInput'] = base + '-review-input.png'
        check['reviewOutput'] = base + '-review-final.png'
        original.crop(tuple(check['box'])).save(check['reviewInput'])
        canvas.crop(tuple(check['box'])).save(check['reviewOutput'])
    if request.get('transparent'):
        # Legacy/manual patch mode keeps only edited support.
        output_alpha = Image.fromarray((np.array(union) > 0).astype('uint8') * 255)
        canvas = canvas.convert('RGBA')
        canvas.putalpha(output_alpha)
    elif original_alpha is not None:
        # Full-scene writeback preserves the smart object's original transparent
        # canvas. AI sees a white preview, while untouched alpha never becomes a
        # hidden black/white rectangle in Photoshop.
        canvas = canvas.convert('RGBA')
        canvas.putalpha(original_alpha)
    canvas.save(request['output'])
    return {'output': request['output'], 'size': list(canvas.size),
            'regions': checks, 'rejected': rejected, 'outsideChangedPixels': 0,
            'changedPixels': int(np.count_nonzero(changed)), 'markersWillHide': markers_will_hide}


class Vision:
    def __init__(self):
        import torch
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
        self.torch = torch
        torch.set_num_threads(4)
        # CPU avoids unsupported MPS operators and cross-device numerical differences.
        self.detector_processor = AutoProcessor.from_pretrained('IDEA-Research/grounding-dino-tiny')
        self.detector = AutoModelForZeroShotObjectDetection.from_pretrained('IDEA-Research/grounding-dino-tiny').eval()
        # Normal detection is DINO-rectangle-only. Keep SAM lazy for the explicit
        # legacy/manual mask-refinement command, so ordinary shoe preparation
        # neither loads nor calls the segmentation model.
        self.sam_processor = None
        self.sam = None

    def segment(self, image, boxes):
        if self.sam_processor is None:
            from transformers import SamProcessor, SamModel
            self.sam_processor = SamProcessor.from_pretrained('facebook/sam-vit-base')
            self.sam = SamModel.from_pretrained('facebook/sam-vit-base').eval()
        inputs = self.sam_processor(images=image, input_boxes=[boxes], return_tensors='pt')
        with self.torch.inference_mode():
            output = self.sam(**inputs)
        masks = self.sam_processor.image_processor.post_process_masks(
            output.pred_masks, inputs['original_sizes'], inputs['reshaped_input_sizes'])[0]
        result = []
        for i in range(len(boxes)):
            best = int(output.iou_scores[0, i].argmax())
            result.append((masks[i, best].numpy().astype(bool), float(output.iou_scores[0, i, best])))
        return result

    def recover_pull_tabs(self, image, shoe_mask):
        """Find small shoe appendages missed by whole-shoe SAM.

        Work in the native crop, not the downsampled full canvas. A detail must
        have explicit detector semantics, a compact high-quality mask and be
        attached to the existing shoe. Large shoe/hand false positives fail.
        """
        bounds = shoe_mask.getbbox()
        if not bounds:
            return shoe_mask, []
        reach = max(8, round(max(bounds[2]-bounds[0], bounds[3]-bounds[1])*.10))
        connected = expanded_binary_support(shoe_mask, reach)
        inputs = self.detector_processor(images=image, text='shoe pull tab. shoe tongue. heel loop. hand. sock.', return_tensors='pt')
        with self.torch.inference_mode():
            outputs = self.detector(**inputs)
        result = self.detector_processor.post_process_grounded_object_detection(
            outputs, inputs.input_ids, threshold=.20, text_threshold=.20,
            target_sizes=[(image.height, image.width)])[0]
        labels = result.get('text_labels', result.get('labels'))
        boxes, candidates = [], []
        for box, score, label in zip(result['boxes'].tolist(), result['scores'].tolist(), labels):
            b = [max(0,round(box[0])),max(0,round(box[1])),min(image.width,round(box[2])),min(image.height,round(box[3]))]
            area = max(0,b[2]-b[0])*max(0,b[3]-b[1])
            detail = 'pull tab' in label or 'heel loop' in label or 'shoe tongue' in label
            if not area or (detail and (min(b[0],b[1],image.width-b[2],image.height-b[3]) < 2 or area > image.width*image.height*.025 or max(b[2]-b[0],b[3]-b[1]) > max(image.size)*.22)):
                continue
            if not detail and not ('hand' in label or 'sock' in label):
                continue
            boxes.append(b); candidates.append({'box':b,'label':label,'score':score,'detail':detail})
        if not boxes:
            return shoe_mask, []
        masks = self.segment(image, boxes)
        protected = np.zeros((image.height,image.width), dtype=bool)
        hands = np.zeros_like(protected)
        for c,(m,score) in zip(candidates,masks):
            if not c['detail'] and score >= .85:
                protected |= m
                if 'hand' in c['label']:
                    hands |= m
        updated = np.array(shoe_mask)>0
        diagnostics = []
        for c,(m,score) in zip(candidates,masks):
            if not c['detail']: continue
            b=c['box']; allowed=np.zeros_like(m);allowed[b[1]:b[3],b[0]:b[2]]=True
            m=m & allowed
            c.update(samScore=score,maskArea=int(m.sum()))
            if score < .90 or m.sum()<12 or not np.any(m & connected):
                c['rejectionReason']='detail_uncertain_or_detached'
            else:
                # Local hand/sock segmentation is more precise than a broad
                # full-image protection box; never overwrite those local masks.
                detail = np.array(Image.fromarray(m.astype('uint8')*255).filter(ImageFilter.MaxFilter(5)))>0
                detail &= ~protected
                # A sock mask can swallow the tab lying directly over it.
                # Recover only the precise, strongly identified tab pixels,
                # never the safety margin or hand pixels in that overlap.
                if c['score'] >= .30 and score >= .95:
                    recovered = m & protected & ~hands
                    c['recoveredFromSockPixels'] = int(recovered.sum())
                    detail |= recovered
                c['addedPixels']=int(np.count_nonzero(detail & ~updated))
                updated |= detail
            diagnostics.append(c)
        return Image.fromarray(updated.astype('uint8')*255), diagnostics

    def refine_region(self, request):
        image=Image.open(request['input']).convert('RGB')
        mask=Image.open(request['mask']).convert('L')
        if mask.size != image.size:
            raise ValueError('细节补检输入与蒙版尺寸不一致')
        if request.get('repairMode') == 'still_life':
            boxes = request.get('shoeBoxes')
            if not boxes or len(boxes) > 8:
                raise ValueError('摆拍修复缺少可靠鞋框，请重新检测')
            rebuilt = np.zeros((image.height, image.width), dtype=bool)
            diagnostics = []
            for b in boxes:
                context = safe_box(b, image.size, xpad=.20, ypad=.30)
                if context[2] <= context[0] or context[3] <= context[1]:
                    raise ValueError('摆拍鞋框超出当前区域')
                local_box = [b[0]-context[0], b[1]-context[1], b[2]-context[0], b[3]-context[1]]
                part, confidence = self.segment(image.crop(context), [local_box])[0]
                allowed = np.zeros_like(part)
                bounded = safe_box(local_box, (part.shape[1], part.shape[0]), xpad=.14, ypad=.18)
                allowed[bounded[1]:bounded[3], bounded[0]:bounded[2]] = True
                part &= allowed
                area = max(1, (b[2]-b[0])*(b[3]-b[1]))
                if confidence < .95 or part.sum() < area*.20:
                    raise ValueError('摆拍鞋主体分割不可靠，保留当前版本')
                rebuilt[context[1]:context[3], context[0]:context[2]] |= part
                diagnostics.append({'box':b, 'samScore':confidence, 'maskArea':int(part.sum())})
            Image.fromarray(rebuilt.astype('uint8')*255).save(request['output'])
            return {'mask':request['output'], 'repairMode':'still_life', 'shoes':diagnostics,
                    'restoredPixels':int(np.count_nonzero(rebuilt & (np.array(mask)==0)))}
        diagnostics=[]
        for b in request.get('shoeBoxes', [list(mask.getbbox() or (0,0,*image.size))]):
            context=safe_box(b,image.size,xpad=.20,ypad=.30)
            part,details=self.recover_pull_tabs(image.crop(context),mask.crop(context))
            mask.paste(part,tuple(context[:2]))
            for detail in details: detail['contextBox']=context
            diagnostics.extend(details)
        mask.save(request['output'])
        return {'mask':request['output'],'pullTabRecovery':diagnostics}

    def detect(self, request):
        structure = request.get('sceneType') == 'shoe_structure' and not request.get('roleMarkers')
        original = opaque_scene(Image.open(request['source']))
        if original.width*original.height > 80_000_000:
            raise ValueError('内部图片超过 8000 万像素，需单独处理')
        image = original.copy()
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        inputs = self.detector_processor(images=image, text='a shoe.', return_tensors='pt')
        with self.torch.inference_mode():
            outputs = self.detector(**inputs)
        result = self.detector_processor.post_process_grounded_object_detection(
            outputs, inputs.input_ids, threshold=.27, text_threshold=.25,
            target_sizes=[(image.height, image.width)])[0]
        labels = result.get('text_labels', result.get('labels'))
        detections = []
        for box, score, label in zip(result['boxes'].tolist(), result['scores'].tolist(), labels):
            x0, y0, x1, y1 = box
            box = [max(0,x0), max(0,y0), min(image.width,x1), min(image.height,y1)]
            if box[2] <= box[0] or box[3] <= box[1]:
                continue
            # Suppress duplicate boxes for the same visible shoe.
            duplicate = False
            for old in detections:
                if ('shoe' in label) != ('shoe' in old['label']):
                    continue
                a = old['box']
                intersection = max(0,min(a[2],box[2])-max(a[0],box[0]))*max(0,min(a[3],box[3])-max(a[1],box[1]))
                union = (a[2]-a[0])*(a[3]-a[1])+(box[2]-box[0])*(box[3]-box[1])-intersection
                if union and intersection/union > .65:
                    duplicate = True
            if not duplicate:
                detections.append({'box':box,'score':score,'label':label})
        # A second pass on overlapping tiles gives small/background shoes
        # more pixels without lowering the confidence threshold.
        for left, top in [(0, 0), (image.width//3, 0),
                          (0, image.height//3), (image.width//3, image.height//3)] if not structure else []:
            tile = image.crop((left, top, min(image.width, left+image.width*2//3),
                               min(image.height, top+image.height*2//3)))
            ti = self.detector_processor(images=tile, text='a shoe.', return_tensors='pt')
            with self.torch.inference_mode():
                to = self.detector(**ti)
            tr = self.detector_processor.post_process_grounded_object_detection(
                to, ti.input_ids, threshold=.27, text_threshold=.25,
                target_sizes=[(tile.height, tile.width)])[0]
            for tb, score in zip(tr['boxes'].tolist(), tr['scores'].tolist()):
                box = [max(0,tb[0]+left), max(0,tb[1]+top),
                       min(image.width,tb[2]+left), min(image.height,tb[3]+top)]
                area = max(0,box[2]-box[0])*max(0,box[3]-box[1])
                if not area:
                    continue
                duplicate = False
                for old in detections:
                    if 'shoe' not in old['label']:
                        continue
                    a = old['box']
                    inter = max(0,min(a[2],box[2])-max(a[0],box[0]))*max(0,min(a[3],box[3])-max(a[1],box[1]))
                    if inter/min(area,(a[2]-a[0])*(a[3]-a[1])) > .6:
                        duplicate = True
                if not duplicate:
                    detections.append({'box':box,'score':score,'label':'a shoe','pass':'tile'})
        shoes = [d for d in detections if 'shoe' in d['label']]
        report = {'source':request['source'], 'size':list(original.size), 'detections':detections, 'regions':[], 'detector':'grounding-dino-tiny', 'maskMode':'dino_rectangle', 'safePadding':{'fraction':.24,'minimumPixels':24,'shape':'square'}, 'sceneType':'shoe_structure' if structure else 'person'}
        if not shoes:
            report['status'] = 'no_shoe_detected'
            return report
        if len(shoes) > 8:
            raise ValueError('检测鞋数超过 8，疑似多模块内容，停止自动替换')
        # DINO rectangles are now the sole ownership source. SAM is deliberately
        # absent here: the detector box becomes the local write mask, while a
        # larger square crop supplies safe scene context to the image model.
        folder = Path(request['folder']); folder.mkdir(parents=True, exist_ok=True)
        overlay = original.copy()
        sx, sy = original.width / image.width, original.height / image.height
        def original_box(box):
            return [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy]
        dual = bool(request.get('roleMarkers') or request.get('randomPairRoles'))
        accepted = []
        for i, d in enumerate(detections):
            if 'shoe' not in d['label']:
                continue
            edit_box, crop_box, _ = dino_rectangle_region(original_box(d['box']), original.size)
            d['dino_box'] = edit_box
            d['safe_box'] = crop_box
            d['segmentationMode'] = 'dino_rectangle'
            d['mask_area'] = (edit_box[2]-edit_box[0])*(edit_box[3]-edit_box[1])
            if d.get('pass') == 'tile':
                bw, bh = d['box'][2]-d['box'][0], d['box'][3]-d['box'][1]
                compact = .38 <= (bw / max(bh, 1)) <= 4.0
                if not compact:
                    d['skip'] = 'tile_candidate_not_shoe_shaped'
                    continue
            if structure:
                bw, bh = d['box'][2]-d['box'][0], d['box'][3]-d['box'][1]
                if bw / max(bh, 1) < 2 or bw < image.width * .5:
                    d['skip'] = 'structure_body_uncertain'
                    continue
                d['protectionMode'] = 'structure_dino_rectangle'
            role = None
            d['role'] = role
            full = np.zeros((original.height, original.width), dtype=bool)
            full[edit_box[1]:edit_box[3], edit_box[0]:edit_box[2]] = True
            accepted.append({'index':i, 'role':role, 'mask':full, 'bounds':edit_box,
                             'cropBox':crop_box, 'score':d['score'],
                             'segmentationScore':None, 'protectedOverlap':0})
        role_error = None
        if dual:
            try:
                if request.get('roleMarkers'):
                    assign_shoe_groups(accepted, request['roleMarkers'])
                elif request.get('randomPairRoles'):
                    from random_pair_roles import assign
                    report['roleAssignment'] = assign(accepted, request.get('randomMainPair'))
                else:
                    raise ValueError('紫色角色分配配置缺失')
                for item in accepted:
                    d = detections[item['index']]
                    d['role'] = d['assigned_role'] = item['role']
                    d['roleGroupBox'] = item['roleGroupBox']
            except ValueError as exc:
                role_error = str(exc)
                for item in accepted:
                    detections[item['index']]['skip'] = 'role_assignment_uncertain'
                accepted = []
        for group_index, group in enumerate(generation_groups(accepted, structure, request.get('generationKind'))):
            full = np.zeros((original.height, original.width), dtype=bool)
            bounds = [original.width, original.height, 0, 0]
            for item in group:
                full |= item['mask']
                bounds = [min(bounds[0],item['bounds'][0]), min(bounds[1],item['bounds'][1]),
                          max(bounds[2],item['bounds'][2]), max(bounds[3],item['bounds'][3])]
            box = square_box(bounds, original.size)
            mask_image = Image.fromarray(full.astype('uint8')*255).crop(box)
            crop = original.crop(box)
            input_path = folder/('shoe-group-%d.png'%group_index)
            mask_path = folder/('mask-group-%d.png'%group_index)
            crop.save(input_path); mask_image.save(mask_path)
            report['regions'].append({'index':group_index,'role':group[0].get('role'),'box':box,
                                      'maskMode':'dino_rectangle','maskCorrection':None,
                                      'pullTabRecovery':[], 'noMaskExpansion':True,
                                      'dinoBoxes':[detections[item['index']].get('dino_box') for item in group],
                                      'safeBoxes':[detections[item['index']].get('safe_box') for item in group],
                                      'input':str(input_path),
                                      'mask':str(mask_path),'shoeCount':len(group),
                                      'detectionIndexes':[item['index'] for item in group],
                                      'score':min(item['score'] for item in group),
                                      'segmentationScore':None})
            overlay.paste(Image.new('RGB',original.size,(255,0,80)),(0,0),Image.fromarray((full*100).astype('uint8')))
        if not structure:
            # Reconcile conflicts using the actual recovered/corrected masks.
            # The pre-generation detection items do not have final mask paths.
            report['regions'] = merge_overlapping_regions(original, report['regions'], folder)
            validate_shoe_supports(original.size, report['regions'])
            report['generationMode'] = 'dino_rectangle_regions'
        draw = ImageDraw.Draw(overlay)
        for index, detection in enumerate(detections):
            if detection.get('skip'):
                b = detection['box']
                full_box = [b[0]*original.width/image.width, b[1]*original.height/image.height, b[2]*original.width/image.width, b[3]*original.height/image.height]
                draw.rectangle(full_box, outline=(255, 160, 0), width=3)
                draw.text((full_box[0], max(0, full_box[1]-12)), 'skip '+str(index), fill=(255,160,0))
        overlay.thumbnail((1400,1400)); overlay.save(folder/'detection-preview.jpg')
        report['status'] = 'ready' if report['regions'] else 'segmentation_uncertain'
        if role_error:
            report['status'] = role_error
        for d in detections:
            if 'shoe' in d['label']:
                d['rejection_reason'] = d.get('skip')
        report['rejected'] = [
            {'index': i, 'dinoBox': d.get('dino_box', d.get('box')), 'safeBox': d.get('safe_box'),
             'samScore': None, 'rejectionReason': d.get('skip')}
            for i, d in enumerate(detections) if d.get('skip')
        ]
        report['preview'] = str(folder/'detection-preview.jpg')
        return report


def serve():
    import sys
    vision = None
    source = sys.stdin
    if len(sys.argv) > 1 and sys.argv[1] != '-':
        source = open(sys.argv[1])
    for line in source:
        try:
            request = json.loads(line)
            if request['action'] in ('prepare_detail', 'compose_detail'):
                from detail_patch import run as detail_patch
                result = detail_patch(request)
            elif request['action'] == 'compose_parent':
                result = compose_parent(request)
            elif request['action'] == 'diagnose_result':
                result = diagnose_result(request)
            elif request['action'] == 'composite':
                result = composite(request)
            else:
                if vision is None:
                    vision = Vision()
                result = ({'ready':True} if request['action'] == 'warmup' else
                          vision.refine_region(request) if request['action'] == 'refine_region' else vision.detect(request))
            print(json.dumps({'ok':True,'data':result},ensure_ascii=False),flush=True)
        except Exception as exc:
            print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    serve()
