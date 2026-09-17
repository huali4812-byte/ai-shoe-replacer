"""C2 offline primitives. Observations are supplied evidence, not a color detector.
No API, Photoshop or automatic localization. Unknown evidence stays blocked.
"""
import numpy as np
from PIL import Image


def route(evidence):
    required = ('input', 'raw', 'mask', 'final', 'target')
    if any(not evidence.get('artifacts', {}).get(k) for k in required):
        return {'stage': 'unknown', 'action': 'blocked', 'reason': 'missing_artifacts'}
    if evidence.get('targetMatched') is not True:
        return {'stage': 'unknown', 'action': 'blocked', 'reason': 'target_unverified'}
    raw, final = evidence.get('rawCorrect'), evidence.get('finalCorrect')
    if raw is False:
        return {'stage': 'generation', 'action': 'local_candidate_required',
                'reason': 'raw_incorrect_not_recomposable'}
    if raw is True and final is False and evidence.get('compositeMismatchConfirmed') is True:
        return {'stage': 'composition', 'action': 'reuse_raw_with_verified_mask'}
    if raw is True and final is True:
        return {'stage': 'none', 'action': 'no_repair'}
    return {'stage': 'unknown', 'action': 'blocked', 'reason': 'insufficient_comparison'}


def exact_support(detail, writable, protected, shoe, connection):
    """All masks share native local coordinates. No growth or guessed boxes.

    connection is independently observed attachment support at heel/tab junction;
    shoe contains shoe-body evidence. Neither is inferred from image proportions.
    Overlap with protected pixels is removed, never recovered from socks/hands.
    """
    arrays = []
    size = detail.size
    for im in (detail, writable, protected, shoe, connection):
        if im.size != size or im.mode != 'L':
            raise ValueError('mask_coordinate_or_mode_mismatch')
        a = np.asarray(im)
        if not np.all((a == 0) | (a == 255)):
            raise ValueError('explicit_binary_masks_required')
        arrays.append(a == 255)
    d, w, p, s, c = arrays
    if not d.any() or not c.any():
        raise ValueError('missing_localization_or_connection')
    allowed = d & w & ~p
    # Every disconnected visible component must meet the observed attachment.
    remaining = allowed.copy()
    while remaining.any():
        y, x = np.argwhere(remaining)[0]
        stack = [(int(y), int(x))]
        remaining[y, x] = False
        attached = False
        while stack:
            y, x = stack.pop()
            attached |= bool(c[y, x] and s[y, x])
            for yy, xx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
                if 0 <= yy < size[1] and 0 <= xx < size[0] and remaining[yy, xx]:
                    remaining[yy, xx] = False
                    stack.append((yy, xx))
        if not attached:
            raise ValueError('detached_or_protected_connection')
    if not allowed.any():
        raise ValueError('empty_safe_support')
    return Image.fromarray(allowed.astype('uint8') * 255)


def compose(base, candidate, support):
    """Candidate may be reused correct raw output (A) or mock/local generation (B).
    This proves only pixel containment, never color or attachment correctness.
    """
    if base.mode != 'RGB' or candidate.mode != 'RGB' or support.mode != 'L':
        raise ValueError('explicit_rgb_and_l_required')
    if base.size != candidate.size or base.size != support.size:
        raise ValueError('native_size_mismatch')
    m = np.asarray(support)
    if not np.all((m == 0) | (m == 255)) or not m.any():
        raise ValueError('nonempty_binary_support_required')
    a, b = np.asarray(base), np.asarray(candidate)
    result = a.copy()
    result[m == 255] = b[m == 255]
    outside = int(np.any(result != a, axis=2)[m == 0].sum())
    if outside:
        raise ValueError('outside_changed')
    return Image.fromarray(result), {'outsideChangedPixels': outside,
                                    'semanticReview': 'not_performed'}
