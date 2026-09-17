"""Audit existing task references locally; no API, model, or Photoshop access.
Usage: python audit-logo-materials.py task.json output-directory
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw


def audit(task_file, output):
    task = json.loads(Path(task_file).read_text())
    files = list(dict.fromkeys([task['material']['cutout']] + task['material']['references']))
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    records = []
    sheet = Image.new('RGB', (800, 340 * ((len(files)+1)//2)), '#777777')
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(files):
        file = Path(name)
        with Image.open(file) as im:
            rgba = im.convert('RGBA')
            alpha = rgba.getchannel('A')
            hist = alpha.histogram()
            record = {'file': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                      'size': list(im.size), 'mode': im.mode, 'alphaBounds': alpha.getbbox(),
                      'transparentFraction': hist[0] / (im.width*im.height),
                      'opaqueFraction': hist[255] / (im.width*im.height),
                      'semanticClassification': 'unverified',
                      'standaloneLogo': None}
            records.append(record)
            rgba.thumbnail((390, 300))
            bg = Image.new('RGBA', rgba.size, '#777777')
            bg.alpha_composite(rgba)
            x, y = (i % 2)*400, (i//2)*340
            sheet.paste(bg.convert('RGB'), (x, y+30))
            draw.text((x+5, y+5), 'reference '+str(i)+' / '+file.stem.split('_')[-1], fill='white')
    sheet.save(output/'materials.jpg')
    (output/'materials.json').write_text(json.dumps({'sourceTask': str(task_file),
        'target': task.get('product'), 'references': records,
        'note': 'Transparency does not prove isolated logo. Human image inspection required; no localization inferred.'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    audit(sys.argv[1], sys.argv[2])
