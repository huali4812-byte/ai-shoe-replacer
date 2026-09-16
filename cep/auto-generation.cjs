'use strict';
const evidence=require('./shoe-evidence.cjs');
const routing=require('./detail-routing.cjs');
const path=require('path');
// All retries restart from the original input. Never use a rejected output as input.
async function run({api,vision,workDir,cacheDir,task,prompt,maskFirst,options,record=()=>{}}){
 const log={schemaVersion:1,attempts:[],status:'preparing'};
 task.autoGeneration=log;record(log);
 try{
  if(typeof api.analyze!=='function')throw Error('Image analysis adapter unavailable');
  const context=await evidence.prepare({api,task,cacheDir});
  log.view=context.scene;const plan=task.referencePlan;log.references=plan;record(log);
  const inputRefs=(maskFirst?[task.visionMask]:[]).concat(plan.files);
  let correction='',detail=null;
  for(let attempt=1;attempt<=2;attempt++){
   const row={attempt,status:'generating'};log.attempts.push(row);record(log);
   if(detail){
    row.strategy='detail';row.detail=detail;
    const mask=path.join(workDir,'detail-mask.png');
    const common={source:task.input,mask:task.visionMask,box:detail.box};
    await vision.request({...common,action:'prepare_detail',output:mask});
    row.rawOutput=await api.generate(task.input,[mask,...detail.references.map(e=>e.file)],
     '第一张是原始场景，第二张是本次编辑蒙版，其余是目标部件参考。仅重绘白色区域中的'+detail.part+'，保持原场景位置、透视和遮挡。黑色区域不得修改。'+correction,{...options,maxAttempts:1});
    row.output=path.join(workDir,'detail-composed.png');
    await vision.request({...common,action:'compose_detail',base:log.attempts[0].output,generated:row.rawOutput,output:row.output});
   }else{row.strategy='full';row.output=await api.generate(task.input,inputRefs,prompt+evidence.instructions(context)+correction, {...options,maxAttempts:1});}
   row.status='checking';record(log);
   const check=await evidence.review({api,task,context,output:row.output});
   row.check=check;row.status=check.decision;record(log);
   if(check.decision==='pass'&&check.confidence>=.85){task.detailReview=check;log.status='accepted';record(log);return row.output;}
   if(check.decision!=='retry'||check.confidence<.85||!check.reasons.length)break;
   detail=vision&&workDir?routing.select(check,task,plan.entries):null;
   correction='\n上次候选存在以下可见问题。本次仍从原始输入重新生成，保持原任务约束，只针对这些问题改进：'+check.reasons.join('；').slice(0,2000);
  }
  throw Error('自动验收未通过；候选文件保留，已停止自动重生成');
 }catch(e){log.status='blocked';log.error=e.message;record(log);throw e;}
}
module.exports={run};
