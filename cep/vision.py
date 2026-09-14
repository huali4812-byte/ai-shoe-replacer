"""Local shoe detection/segmentation. JSON-lines protocol; stdout is protocol only."""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageDraw


def square_box(box, size, padding=0.16):
    x0, y0, x1, y1 = box
    side = max(1, math.ceil(max(x1-x0, y1-y0) * (1+padding*2)))
    cx, cy = (x0+x1)/2, (y0+y1)/2
    width, height = size
    # PIL pads off-canvas pixels. The corresponding mask is zero there.
    left = math.floor(cx-side/2)
    top = math.floor(cy-side/2)
    return [left, top, left+side, top+side]

def safe_box(box, size, xpad=.14, ypad=.18):
    x0,y0,x1,y1=box; w,h=size; bw=max(1,x1-x0); bh=max(1,y1-y0)
    return [max(0,int(x0-bw*xpad)),max(0,int(y0-bh*ypad)),min(w,int(x1+bw*xpad)),min(h,int(y1+bh*ypad))]


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
        touching = [g for g in groups if any(region.get('role') == old.get('role') and boxes_near(region['cropBox'], old['cropBox']) for old in g)]
        if not touching:
            groups.append([region])
            continue
        merged = [region]
        for group in touching:
            merged.extend(group)
            groups.remove(group)
        groups.append(merged)
    return groups


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


def composite(request):
    source = Image.open(request['source']).convert('RGB')
    region = request['region']
    mask = Image.open(region['mask']).convert('L')
    if mask.getbbox() is None:
        raise ValueError('空蒙版，禁止回写')
    generated = Image.open(request['generated']).convert('RGB')
    box = region['box']
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
    expanded_mask = mask.filter(ImageFilter.MaxFilter(9))
    alpha = np.array(expanded_mask)
    outside_mask = alpha == 0
    delta = np.abs(np.array(original, dtype=np.float32)-np.array(generated, dtype=np.float32)).mean(axis=2)
    changed_fraction = float(np.mean(delta[outside_mask] > 40)) if np.any(outside_mask) else 0.0
    # The returned image may alter pixels outside the shoe mask. Those pixels
    # are never written: composite() always takes them from the original.
    # Do not reject an otherwise valid shoe merely because the model changed
    # the crop background; retain the metric for diagnostics instead.
    patch = generated.convert('RGBA')
    patch.putalpha(expanded_mask)
    patch.save(request['output'])
    original = source.crop(box)
    combined = Image.composite(generated, original, expanded_mask)
    before, after, alpha = np.array(original), np.array(combined), np.array(expanded_mask)
    outside = int(np.count_nonzero(np.any(before != after, axis=2) & (alpha == 0)))
    if outside:
        raise ValueError('区域外像素校验失败')
    return {'output': request['output'], 'box': box, 'outsideChangedPixels': outside,
            'editablePixels': int(np.count_nonzero(alpha)), 'size': list(size),
            'modelOutsideChangedFraction': changed_fraction}


def role_ownership(size, regions):
    """Reject contested expanded pixels, including regions without a preview."""
    owners = {}
    for region in regions:
        role = region.get('role')
        if role not in ('主推', '次推'):
            raise ValueError('紫色合成区域缺少明确角色，禁止回写')
        box = region['box']
        mask = Image.open(region['mask']).convert('L')
        if mask.size != (box[2]-box[0], box[3]-box[1]) or mask.getbbox() is None:
            raise ValueError('角色保护蒙版为空或尺寸不一致')
        expanded = mask.filter(ImageFilter.MaxFilter(9))
        full = Image.new('L', size, 0)
        full.paste(expanded, tuple(box[:2]))
        occupied = np.array(full) > 0
        for other, previous in owners.items():
            if other != role and np.any(occupied & previous):
                count = int(np.count_nonzero(occupied & previous))
                raise ValueError(f'跨角色扩展蒙版冲突：{count} 像素归属不明确，禁止整图回写')
        owners[role] = occupied | owners.get(role, np.zeros_like(occupied))


def compose_parent(request):
    original = Image.open(request['source']).convert('RGB')
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
        patch = Image.open(patch_path).convert('RGBA')
        xy = tuple(region['box'][:2])
        canvas.paste(patch.convert('RGB'), xy, patch.getchannel('A'))
        # Union is max(alpha), not alpha composited over alpha.
        full_alpha = Image.new('L', original.size, 0)
        full_alpha.paste(patch.getchannel('A'), xy)
        union = Image.fromarray(np.maximum(np.array(union), np.array(full_alpha)))
        checks.append(check)
    if not checks:
        return {'output': None, 'size': list(canvas.size), 'regions': [], 'rejected': rejected}
    for marker in request.get('protectedMarkers', []):
        if union.crop(tuple(round(x) for x in marker['bounds'])).getbbox():
            raise ValueError('鞋部贴片与保留的提示文字相交，禁止覆盖提示文字')
    outside = np.array(union) == 0
    changed = np.any(np.array(canvas) != np.array(original), axis=2)
    if np.any(changed & outside):
        raise ValueError('完整画布蒙版外像素改变，禁止回写')
    if request.get('transparent'):
        # canvas is already alpha-composited; use binary support to avoid applying
        # a soft alpha twice when Photoshop overlays this on the same source.
        canvas = canvas.convert('RGBA')
        canvas.putalpha(Image.fromarray((np.array(union) > 0).astype('uint8') * 255))
    canvas.save(request['output'])
    return {'output': request['output'], 'size': list(canvas.size),
            'regions': checks, 'rejected': rejected, 'outsideChangedPixels': 0,
            'changedPixels': int(np.count_nonzero(changed))}


class Vision:
    def __init__(self):
        import torch
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, SamProcessor, SamModel
        self.torch = torch
        torch.set_num_threads(4)
        # CPU avoids unsupported MPS operators and cross-device numerical differences.
        self.detector_processor = AutoProcessor.from_pretrained('IDEA-Research/grounding-dino-tiny')
        self.detector = AutoModelForZeroShotObjectDetection.from_pretrained('IDEA-Research/grounding-dino-tiny').eval()
        self.sam_processor = SamProcessor.from_pretrained('facebook/sam-vit-base')
        self.sam = SamModel.from_pretrained('facebook/sam-vit-base').eval()

    def segment(self, image, boxes):
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

    def detect(self, request):
        original = Image.open(request['source']).convert('RGB')
        if original.width*original.height > 80_000_000:
            raise ValueError('内部图片超过 8000 万像素，需单独处理')
        image = original.copy()
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        inputs = self.detector_processor(images=image, text='a shoe. a sock. pants. a bare leg.', return_tensors='pt')
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
                          (0, image.height//3), (image.width//3, image.height//3)]:
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
        report = {'source':request['source'], 'size':list(original.size), 'detections':detections, 'regions':[], 'detector':'grounding-dino-tiny', 'safePadding':{'x':.14,'y':.18}}
        if not shoes:
            report['status'] = 'no_shoe_detected'
            return report
        if len(shoes) > 8:
            raise ValueError('检测鞋数超过 8，疑似多模块内容，停止自动替换')
        # Give SAM expanded context for shoe candidates. Non-shoe boxes stay
        # unchanged because they are used only to build protected regions.
        sam_boxes = [safe_box(d['box'], image.size) if 'shoe' in d['label'] else d['box']
                     for d in detections]
        masks = self.segment(image, sam_boxes)
        protected = np.zeros((image.height, image.width), dtype=bool)
        for d, (mask, confidence) in zip(detections, masks):
            if 'shoe' not in d['label'] and confidence >= .8:
                protected |= mask
        folder = Path(request['folder']); folder.mkdir(parents=True, exist_ok=True)
        overlay = original.copy()
        sx, sy = original.width / image.width, original.height / image.height
        def original_box(box):
            return [round(box[0] * sx), round(box[1] * sy),
                    round(box[2] * sx), round(box[3] * sy)]
        accepted = []
        for i, (d, (mask, confidence)) in enumerate(zip(detections, masks)):
            if 'shoe' not in d['label']:
                continue
            d['segmentationScore'] = confidence
            d['dino_box'] = original_box(d['box'])
            d['safe_box'] = original_box(safe_box(d['box'], image.size))
            if d.get('pass') == 'tile':
                bw, bh = d['box'][2]-d['box'][0], d['box'][3]-d['box'][1]
                # Tile-only detections are accepted only when SAM is strong
                # and the candidate has a shoe-like compact footprint. This
                # admits the missed rear shoe while continuing to reject the
                # tall background/arm false positives seen in the same batch.
                compact = .38 <= (bw / max(bh, 1)) <= 2.4
                if confidence < .93 or not compact:
                    if not (request.get('roleMarkers') and confidence >= .90 and compact):
                        d['skip'] = 'tile_candidate_requires_semantic_verification'
                        continue
            area = (d['box'][2]-d['box'][0])*(d['box'][3]-d['box'][1])
            if confidence < .85 or np.count_nonzero(mask) < max(20,area*.08):
                d['skip'] = 'segmentation_uncertain'; continue
            # Small expansion for shoe shape and contact blending; subtract detected clothing/skin.
            radius = max(1, min(12, round(math.sqrt(area)*.025)))
            expanded = np.array(Image.fromarray(mask.astype('uint8')*255).filter(ImageFilter.MaxFilter(radius*2+1))) > 0
            protected_overlap = int(np.count_nonzero(expanded & protected))
            expanded &= ~protected
            full = np.array(Image.fromarray(expanded.astype('uint8')*255).resize(original.size, Image.Resampling.NEAREST)) > 0
            if not np.any(full):
                d['skip'] = 'empty_after_protection'; continue
            ys,xs = np.where(full)
            bounds = [int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
            role = marker_role(bounds, request['roleMarkers']) if request.get('roleMarkers') else None
            d['role'] = role
            accepted.append({'index':i, 'role':role, 'mask':full, 'bounds':bounds,
                             'cropBox':square_box(bounds, original.size),
                             'score':d['score'], 'segmentationScore':confidence,
                             'protectedOverlap':protected_overlap})
        if request.get('roleMarkers') and {item['role'] for item in accepted} != {'主推', '次推'}:
            raise ValueError('未检测到主推和次推两方鞋位，紫色图暂不生成')
        for group_index, group in enumerate(group_nearby_regions(accepted)):
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
                                      'dinoBoxes':[detections[item['index']].get('dino_box') for item in group],
                                      'safeBoxes':[detections[item['index']].get('safe_box') for item in group],
                                      'input':str(input_path),
                                      'mask':str(mask_path),'shoeCount':len(group),
                                      'detectionIndexes':[item['index'] for item in group],
                                      'score':min(item['score'] for item in group),
                                      'segmentationScore':min(item['segmentationScore'] for item in group)})
            overlay.paste(Image.new('RGB',original.size,(255,0,80)),(0,0),Image.fromarray((full*100).astype('uint8')))
        draw = ImageDraw.Draw(overlay)
        for index, detection in enumerate(detections):
            if detection.get('skip'):
                b = detection['box']
                full_box = [b[0]*original.width/image.width, b[1]*original.height/image.height, b[2]*original.width/image.width, b[3]*original.height/image.height]
                draw.rectangle(full_box, outline=(255, 160, 0), width=3)
                draw.text((full_box[0], max(0, full_box[1]-12)), 'skip '+str(index), fill=(255,160,0))
        overlay.thumbnail((1400,1400)); overlay.save(folder/'detection-preview.jpg')
        report['status'] = 'ready' if report['regions'] else 'segmentation_uncertain'
        report['rejected'] = [
            {'index': i, 'dinoBox': d.get('dino_box', d.get('box')), 'safeBox': d.get('safe_box'),
             'samScore': d.get('segmentationScore'), 'rejectionReason': d.get('skip')}
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
            if request['action'] == 'compose_parent':
                result = compose_parent(request)
            elif request['action'] == 'composite':
                result = composite(request)
            else:
                if vision is None:
                    vision = Vision()
                result = {'ready':True} if request['action'] == 'warmup' else vision.detect(request)
            print(json.dumps({'ok':True,'data':result},ensure_ascii=False),flush=True)
        except Exception as exc:
            print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    serve()
