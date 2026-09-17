"""Offline material-reference preparation, NOT a logo extractor or repair tool."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image


def prepare(source, output, max_side=1024):
    source, output = Path(source), Path(output)
    if source.resolve() == output.resolve():
        raise ValueError('Cannot overwrite source material')
    if not isinstance(max_side, int) or not 64 <= max_side <= 2048:
        raise ValueError('Invalid output limit')
    raw = source.read_bytes()
    with Image.open(source) as im:
        rgba = im.convert('RGBA')
        alpha = rgba.getchannel('A')
        bounds = alpha.getbbox()
        if bounds is None:
            raise ValueError('Empty transparent material')
        # All nonzero-alpha pixels are retained; no threshold removes fine marks.
        padding = max(1, round(max(bounds[2]-bounds[0], bounds[3]-bounds[1])*.02))
        crop = (max(0, bounds[0]-padding), max(0, bounds[1]-padding),
                min(im.width, bounds[2]+padding), min(im.height, bounds[3]+padding))
        part = rgba.crop(crop)
        # Flatten BEFORE resizing to avoid invisible RGB leaking at edges.
        white = Image.new('RGBA', part.size, (255, 255, 255, 255))
        white.alpha_composite(part)
        result = white.convert('RGB')
        result.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            raise ValueError('Output already exists; preserve evidence')
        with output.open('xb') as f:
            result.save(f, format='PNG')
        return {'source': str(source), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
                'sourceSize': list(im.size), 'alphaBounds': list(bounds), 'crop': list(crop),
                'output': str(output), 'outputSize': list(result.size),
                'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                'scale': result.width/(crop[2]-crop[0]),
                'sourceWasOpaque': alpha.getextrema() == (255, 255),
                'standaloneLogo': False, 'semanticLocalization': 'not_performed',
                'note': 'Whole visible material preserved. White background is a preprocessing choice, not recovered physical lighting.'}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-logo-reference.py input.png output.png')
    print(json.dumps(prepare(*sys.argv[1:]), ensure_ascii=False, indent=2))
