import importlib.util
import tempfile
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('prep', Path(__file__).with_name('prepare-logo-reference.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
with tempfile.TemporaryDirectory() as folder:
    folder = Path(folder)
    src = folder/'source.png'
    im = Image.new('RGBA', (200, 100), (255, 0, 0, 0))
    im.paste((0, 0, 0, 128), (80, 30, 120, 70))
    im.save(src)
    before = src.read_bytes()
    r = p.prepare(src, folder/'out.png')
    assert r['alphaBounds'] == [80, 30, 120, 70]
    assert r['outputSize'] == [42, 42]  # no upscaling
    out = Image.open(folder/'out.png')
    assert out.getpixel((0, 0)) == (255, 255, 255)
    assert out.getpixel((20, 20)) == (127, 127, 127)
    assert src.read_bytes() == before
    for output in [src, folder/'out.png']:
        try:
            p.prepare(src, output)
        except ValueError:
            pass
        else:
            raise AssertionError('overwrite allowed')
    Image.new('RGBA', (10, 10)).save(src)
    try:
        p.prepare(src, folder/'empty.png')
    except ValueError:
        pass
    else:
        raise AssertionError('empty accepted')
    Image.new('RGB', (200, 100), 'blue').save(src)
    r = p.prepare(src, folder/'opaque.png', 64)
    assert r['crop'] == [0, 0, 200, 100] and r['sourceWasOpaque']
    assert r['outputSize'] == [64, 32]
print('PASS alpha boundary, hidden RGB, opacity, no enlargement, immutable inputs/outputs')
