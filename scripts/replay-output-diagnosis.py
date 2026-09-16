"""Read-only historical local-output replay; never opens PS or calls generation."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('v',Path(__file__).resolve().parents[1]/'cep/vision.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
report=json.loads(Path(sys.argv[1]).read_text());rows=[]
for r in report.get('regions',[]):
 q=dict(source=r.get('input'),generated=r.get('preview'),mask=r.get('visionMask'),stage='local')
 if not all(q[k] and Path(q[k]).is_file() for k in ('source','generated','mask')):
  rows.append(dict(id=r['id'],status='missing_files'));continue
 try:rows.append(dict(id=r['id'],status='checked',diagnosis=v.diagnose_result(q)))
 except (ValueError,OSError) as e:rows.append(dict(id=r['id'],status='rejected',error=str(e)))
output=Path(sys.argv[2]);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(rows,ensure_ascii=False,indent=2))
print({s:sum(r['status']==s for r in rows) for s in ('checked','rejected','missing_files')})
