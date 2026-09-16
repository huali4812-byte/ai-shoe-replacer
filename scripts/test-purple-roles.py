"""Offline regression for role assignment and preventing cross-role crop merging."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('vision',Path(__file__).resolve().parents[1]/'cep/vision.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
markers=[{'role':'主推','bounds':[72,704,220,753]}, {'role':'次推','bounds':[458,460,558,510]}]
# Approximate boxes from the supplied example, including the boy's farther shoe.
for box,role in [([216,660,335,803],'主推'),([337,612,518,713],'主推'),([443,540,493,611],'次推')]:
 assert v.marker_role(box,markers)==role
try:v.marker_role([45,45,55,55],[{'role':'主推','bounds':[0,40,10,60]},{'role':'次推','bounds':[90,40,100,60]}])
except ValueError:pass
else:raise AssertionError('Ambiguous role accepted')
try:v.marker_role([1,1,10,10],markers[:1])
except ValueError:pass
else:raise AssertionError('Missing secondary role accepted')
a={'cropBox':[0,0,50,50],'role':'主推'}
b={'cropBox':[20,0,70,50],'role':'次推'}
c={'cropBox':[30,0,80,50],'role':'主推'}
groups=v.group_nearby_regions([a,b,c]);assert sorted(map(len,groups))==[1,2]
assert len(v.group_nearby_regions([{'cropBox':[0,0,50,50]},{'cropBox':[20,0,70,50]}]))==1
print('PASS: example shoe roles, ambiguous/missing labels rejected, roles never merged, ordinary grouping preserved')
# Adversarial synthetic cases document the unresolved lack of person association.
# These boxes are stipulated to belong to ONE person; the function receives no such fact.
adversarial=[{'role':'主推','bounds':[0,0,10,20]},{'role':'次推','bounds':[90,0,100,20]}]
paired=[v.marker_role(b,adversarial) for b in ([10,0,20,20],[80,0,90,20])]
assert paired==['主推','次推']
print('D RISK: stipulated same-person shoes split into',paired,'(synthetic, not a real-template verdict)')
far=[{'role':'主推','bounds':[1000000,0,1000010,20]},{'role':'次推','bounds':[2000000,0,2000010,20]}]
assert v.marker_role([0,0,10,20],far)=='主推'
print('D RISK: far-away annotation accepted; no absolute distance bound or person identity input')
