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
        touching = [g for g in groups if any(boxes_near(region['cropBox'], old['cropBox']) for old in g)]
        if not touching:
            groups.append([region])
            continue
        merged = [region]
        for group in touching:
            merged.extend(group)
            groups.remove(group)
        groups.append(merged)
    return groups


def composite(request):
    source = Image.open(request['source']).convert('RGB')
    region = request['region']
    mask = Image.open(region['mask']).convert('L')
    generated = Image.open(request['generated']).convert('RGB')
    box = region['box']
    size = (box[2]-box[0], box[3]-box[1])
    if mask.size != size:
        raise ValueError('蒙版尺寸与区域不一致，禁止回写')
    # Providers may ignore the requested aspect ratio and return 3:2/4:3.
    # Fit the result inside the target square and fill the remaining pixels
    # from the original crop; this preserves shoe proportions without
    # stretching and still limits writes to the verified mask.
    if generated.size != size:
        fitted = Image.new('RGB', size)
        fitted.paste(source.crop(box), (0, 0))
        scale = min(size[0]/generated.width, size[1]/generated.height)
        nw, nh = max(1, round(generated.width*scale)), max(1, round(generated.height*scale))
        resized = generated.resize((nw, nh), Image.Resampling.LANCZOS)
        fitted.paste(resized, ((size[0]-nw)//2, (size[1]-nh)//2))
        generated = fitted
    original = source.crop(box)
    alpha = np.array(mask)
    outside_mask = alpha == 0
    delta = np.abs(np.array(original, dtype=np.float32)-np.array(generated, dtype=np.float32)).mean(axis=2)
    changed_fraction = float(np.mean(delta[outside_mask] > 40)) if np.any(outside_mask) else 0.0
    # The returned image may alter pixels outside the shoe mask. Those pixels
    # are never written: composite() always takes them from the original.
    # Do not reject an otherwise valid shoe merely because the model changed
    # the crop background; retain the metric for diagnostics instead.
    patch = generated.convert('RGBA')
    patch.putalpha(mask)
    patch.save(request['output'])
    original = source.crop(box)
    combined = Image.composite(generated, original, mask)
    before, after, alpha = np.array(original), np.array(combined), np.array(mask)
    outside = int(np.count_nonzero(np.any(before != after, axis=2) & (alpha == 0)))
    if outside:
        raise ValueError('区域外像素校验失败')
    return {'output': request['output'], 'box': box, 'outsideChangedPixels': outside,
            'editablePixels': int(np.count_nonzero(alpha)), 'size': list(size),
            'modelOutsideChangedFraction': changed_fraction}


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
        report = {'source':request['source'], 'size':list(original.size), 'detections':detections, 'regions':[]}
        if not shoes:
            report['status'] = 'no_shoe_detected'
            return report
        if len(shoes) > 8:
            raise ValueError('检测鞋数超过 8，疑似多模块内容，停止自动替换')
        masks = self.segment(image, [d['box'] for d in detections])
        protected = np.zeros((image.height, image.width), dtype=bool)
        for d, (mask, confidence) in zip(detections, masks):
            if 'shoe' not in d['label'] and confidence >= .8:
                protected |= mask
        folder = Path(request['folder']); folder.mkdir(parents=True, exist_ok=True)
        overlay = original.copy()
        accepted = []
        for i, (d, (mask, confidence)) in enumerate(zip(detections, masks)):
            if 'shoe' not in d['label']:
                continue
            d['segmentationScore'] = confidence
            if d.get('pass') == 'tile':
                d['skip'] = 'tile_candidate_requires_semantic_verification'
                continue
            area = (d['box'][2]-d['box'][0])*(d['box'][3]-d['box'][1])
            if confidence < .85 or np.count_nonzero(mask) < max(20,area*.08):
                d['skip'] = 'segmentation_uncertain'; continue
            # Small expansion for shoe shape and contact blending; subtract detected clothing/skin.
            radius = max(1, min(12, round(math.sqrt(area)*.025)))
            expanded = np.array(Image.fromarray(mask.astype('uint8')*255).filter(ImageFilter.MaxFilter(radius*2+1))) > 0
            expanded &= ~protected
            full = np.array(Image.fromarray(expanded.astype('uint8')*255).resize(original.size, Image.Resampling.NEAREST)) > 0
            if not np.any(full):
                d['skip'] = 'empty_after_protection'; continue
            ys,xs = np.where(full)
            bounds = [int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
            accepted.append({'index':i, 'mask':full, 'bounds':bounds,
                             'cropBox':square_box(bounds, original.size),
                             'score':d['score'], 'segmentationScore':confidence})
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
            report['regions'].append({'index':group_index,'box':box,'input':str(input_path),
                                      'mask':str(mask_path),'shoeCount':len(group),
                                      'detectionIndexes':[item['index'] for item in group],
                                      'score':min(item['score'] for item in group),
                                      'segmentationScore':min(item['segmentationScore'] for item in group)})
            overlay.paste(Image.new('RGB',original.size,(255,0,80)),(0,0),Image.fromarray((full*100).astype('uint8')))
        overlay.thumbnail((1400,1400)); overlay.save(folder/'detection-preview.jpg')
        report['status'] = 'ready' if report['regions'] else 'segmentation_uncertain'
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
            if request['action'] == 'composite':
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
