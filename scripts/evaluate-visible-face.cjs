'use strict';
// Offline preflight only. No api module, Eagle query, PS, or classifier invocation.
const fs=require('fs'),path=require('path'),face=require('../cep/visible-face.cjs'),planner=require('../cep/reference-plan.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'outputs/shoe-evidence-0916');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'evaluation-manifest.json')));
const output={schemaVersion:1,mode:'offline_unknown_baseline',cases:[],orderAudit:null,accuracy:null,limitations:['No validated independent visual observer available','Screenshots not mapped to original tasks; no validated positive pair','Filename labels never establish anatomical side']};
for(const c of manifest.cases){
 const row={id:c.id,label:c.expected,issue:c.issue||null,status:'unknown',allowSideDependentRepair:false,continueExistingFlow:true};
 if(c.comparison){row.comparison=c.comparison;row.exists=fs.existsSync(c.comparison);if(row.exists)row.sha256=face.hash(fs.readFileSync(c.comparison));row.reason='comparison_is_not_independent_scene_and_reference';}
 if(c.taskFile){try{
  const t=JSON.parse(fs.readFileSync(c.taskFile));const files=[t.material.cutout,...t.material.references];
  const refs=files.map(file=>({file,sha256:face.hash(fs.readFileSync(file)),sku:t.product.sku,color:t.product.color}));
  const result=face.match({scene:{sha256:face.hash(fs.readFileSync(t.input))},target:t.product,references:refs});Object.assign(row,{reason:result.reasons,result});
  const p=planner.plan(t.material,{view:'unknown'});output.orderAudit={task:t.id,input:t.input,loadedFiles:files,plannedFiles:p.files,classification:p.entries.map(e=>({file:e.file,view:e.view,evidence:e.evidence})),expectedImageOrder:[t.input,...(t.dualRole?[t.visionMask]:[]),...p.files],evidence:'current code replay; not original HTTP payload audit'};
 }catch(e){row.reason='missing_material';row.error=e.message;}}
 output.cases.push(row);
}
output.summary={total:output.cases.length,unknown:output.cases.filter(c=>c.status==='unknown').length,matched:0,falseAccept:null,falseReject:null};
const dir=path.join(root,'outputs/c5-visible-face');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'evaluation.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
