"""Experimental planar logo transfer. No detection, AI, relighting or PS access.
Requires externally established logo alpha and ordered destination corners.
Coordinates use base-image pixels, clockwise TL,TR,BR,BL; no mirroring.
"""
import hashlib
from pathlib import Path
import numpy as np
from PIL import Image


def transfer(q):
    required = ('base', 'logo', 'shoeMask', 'protectedMask')
    paths = {k: Path(q[k]) for k in required}
    out = Path(q['output'])
    if out.exists() or out.resolve() in [p.resolve() for p in paths.values()]:
        raise ValueError('Output must be new; never overwrite inputs')
    evidence = q.get('evidence', {})
    if (evidence.get('localization') != 'verified' or
        evidence.get('logoIsolation') != 'verified' or
        evidence.get('occlusion') != 'verified' or
        evidence.get('surfaceModel') != 'planar' or
        evidence.get('part') not in ('strap', 'sidewall', 'heel')):
        raise ValueError('Missing localization/isolation/occlusion/planarity evidence')
    # These attestations are prerequisites, not machine proof of visual truth.
    if not isinstance(evidence.get('provenance'), str) or not evidence['provenance'].strip():
        raise ValueError('Missing evidence provenance')
    if evidence.get('part') in ('sidewall', 'heel') and (
        evidence.get('surface') not in ('inner', 'outer', 'back') or
        evidence.get('surface') != evidence.get('referenceSurface')):
        raise ValueError('Unknown or mismatched surface')
    hashes = {k: hashlib.sha256(p.read_bytes()).hexdigest() for k, p in paths.items()}
    if evidence.get('hashes') != hashes:
        raise ValueError('Stale or missing input fingerprints')
    base = Image.open(paths['base']).convert('RGB')
    asset = Image.open(paths['logo'])
    if asset.mode != 'RGBA':
        raise ValueError('Logo requires explicit RGBA isolation mask')
    alpha = np.array(asset.getchannel('A'))
    if not np.any(alpha) or not np.any(alpha == 0):
        raise ValueError('Logo must have nonempty isolated alpha')
    masks = [Image.open(paths[k]).convert('L') for k in ('shoeMask', 'protectedMask')]
    if any(m.size != base.size for m in masks):
        raise ValueError('Protection masks must match base pixels')
    quad = np.asarray(q['quad'], dtype=float)
    if quad.shape != (4, 2) or not np.isfinite(quad).all():
        raise ValueError('Invalid quadrilateral')
    if np.any(quad < 0) or np.any(quad[:, 0] > base.width-1) or np.any(quad[:, 1] > base.height-1):
        raise ValueError('Quadrilateral outside canvas')
    edges = np.roll(quad, -1, axis=0)-quad
    cross = edges[:, 0]*np.roll(edges[:, 1], -1)-edges[:, 1]*np.roll(edges[:, 0], -1)
    if np.any(cross <= 1e-6):
        raise ValueError('Mirrored, concave or degenerate quadrilateral')
    area = .5*abs(np.sum(quad[:, 0]*np.roll(quad[:, 1], -1)-quad[:, 1]*np.roll(quad[:, 0], -1)))
    if area < 4 or area > base.width*base.height*.35:
        raise ValueError('Unsafe logo area')
    # Inverse homography for Pillow: destination pixel -> isolated asset pixel.
    target = [(0, 0), (asset.width-1, 0), (asset.width-1, asset.height-1), (0, asset.height-1)]
    rows, values = [], []
    for (x, y), (u, v) in zip(quad, target):
        rows.extend([[x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]])
        values.extend([u,v])
    coeff = np.linalg.solve(np.array(rows), values)
    denom = quad @ coeff[6:] + 1
    if not np.isfinite(coeff).all() or np.any(denom <= 1e-8):
        raise ValueError('Unstable projective mapping')
    warped = asset.transform(base.size, Image.Transform.PERSPECTIVE, coeff,
                             resample=Image.Resampling.BICUBIC)
    support = (np.array(masks[0]) >= 254) & (np.array(masks[1]) == 0)
    wa = np.array(warped.getchannel('A'))
    wa[~support] = 0
    if np.count_nonzero(wa) < 4:
        raise ValueError('No editable logo support')
    warped.putalpha(Image.fromarray(wa))
    result = Image.alpha_composite(base.convert('RGBA'), warped).convert('RGB')
    changed = np.any(np.array(result) != np.array(base), axis=2)
    if np.any(changed & (wa == 0)):
        raise ValueError('Outside logo changed')
    if not np.any(changed):
        raise ValueError('No visible change')
    if any(hashlib.sha256(p.read_bytes()).hexdigest() != hashes[k] for k,p in paths.items()):
        raise ValueError('Inputs changed during transfer')
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('xb') as f:
        result.save(f, format='PNG')
    return {'output':str(out), 'outsideChangedPixels':0, 'changedPixels':int(changed.sum()),
            'inputHashes':hashes, 'semanticReview':'not_performed',
            'mode':'planar_rgba_transfer', 'removesExistingLogo':False,
            'warning':'Does not erase old letters, reconstruct embossing or adapt lighting. Not production-ready.'}
