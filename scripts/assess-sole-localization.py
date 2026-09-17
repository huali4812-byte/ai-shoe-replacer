"""Reproducible diagnostic rejection, NOT an automatic acceptance classifier."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
folder = ROOT/'outputs/c3-sole-fidelity/localization'
report = json.loads((folder/'report.json').read_text())
soles = [c for c in report['candidates'] if c['label'] in ('shoe outsole','rubber sole','shoe tread')]
uppers = [c for c in report['candidates'] if c['label']=='shoe upper']
rows=[]
for c in soles:
    a=np.asarray(Image.open(c['mask']))>0
    y,x=np.where(a)
    area=float((x.max()-x.min()+1)*(y.max()-y.min()+1)/a.size) if len(x) else 0
    overlaps=[]
    for u in uppers:
        b=np.asarray(Image.open(u['mask']))>0
        if a.shape!=b.shape: raise ValueError('mask coordinate mismatch')
        union=int((a|b).sum())
        overlaps.append({'upperId':u['id'],'iou':float((a&b).sum()/union) if union else 0})
    reasons=['localization_not_verified','occlusion_not_verified']
    if not len(x): reasons.append('empty_support')
    if area>.35: reasons.append('shared_area_gate_exceeded')
    if any(o['iou']>.9 for o in overlaps): reasons.append('sole_upper_semantic_conflict')
    rows.append({'id':c['id'],'boxAreaFraction':area,'upperOverlaps':overlaps,'blockers':reasons})
result={'taskId':report['taskId'],'status':'blocked','acceptanceImplemented':False,'candidates':rows,'note':'Absence of a conflict never proves a reliable sole or protected mask.'}
assert rows and any('sole_upper_semantic_conflict' in r['blockers'] for r in rows), 'Historical failure regression changed; inspect evidence'
(folder/'assessment.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print('PASS real sample rejection replay:',len(rows),'sole candidates; no automatic acceptance')
