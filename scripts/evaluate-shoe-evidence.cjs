'use strict';
// Preflight by default. --analyze explicitly enables analysis calls, never generation/PS.
const fs=require('fs'),path=require('path');
function summarize(rows){
 const labeled=rows.filter(r=>['pass','reject'].includes(r.expected));
 return {total:rows.length,labeled:labeled.length,unlabeled:rows.length-labeled.length,
  falseAccept:labeled.filter(r=>r.expected==='reject'&&r.decision==='pass').length,
  falseReject:labeled.filter(r=>r.expected==='pass'&&r.decision==='retry').length,
  inconclusive:labeled.filter(r=>!['pass','retry'].includes(r.decision)).length,
  accuracyCalibrated:false};
}
async function run(file,analyze=false){
 const manifest=JSON.parse(fs.readFileSync(file,'utf8')),rows=[];
 for(const sample of manifest.cases){
  const row={id:sample.id,expected:sample.expected||null};rows.push(row);
  try{
   if(!sample.taskFile)throw Error('截图尚未映射到原始任务，不能把对比截图当原始鞋位');
   const task=JSON.parse(fs.readFileSync(sample.taskFile,'utf8'));
   const files=[task.input,task.preview,task.visionMask,task.material?.cutout,...(task.material?.references||[])];
   if(files.some(f=>!f||!fs.existsSync(f)))throw Error('原始样本或目标素材缺失');
   row.decision='ready';
   if(analyze){const evidence=require('../cep/shoe-evidence.cjs'),api=require('../cep/api.cjs');const context=await evidence.prepare({api,task,cacheDir:path.join(path.dirname(file),'profiles')});const check=await evidence.review({api,task,context,output:task.preview});row.decision=check.decision;row.check=check;}
  }catch(err){row.decision='blocked';row.reason=err.message;}
 }
 return {mode:analyze?'raw-analysis-only':'preflight',rows,summary:summarize(rows)};
}
if(require.main===module)run(process.argv[2],process.argv.includes('--analyze')).then(result=>{const out=process.argv[2]+'.result.json';fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({output:out,summary:result.summary}));}).catch(err=>{console.error(err.message);process.exitCode=1;});
module.exports={run,summarize};
