'use strict';
const references=require('./reference-plan.cjs');
const INLINE_INSTRUCTIONS='\n【生成前的图像理解】请在本次生图中先逐只辨认原图鞋的位置、数量、鞋头鞋跟方向、透视和遮挡，判断实际可见的内侧、外侧、鞋面及鞋底；一只鞋可同时显示多个面，不得用画面左右猜左右脚。随后逐只对应目标参考的可见面，核对鞋面拼接、鞋头、鞋底分区及纹路、Logo和拉环，再完成替换。原图只提供姿态和遮挡，目标参考提供款式和配色；不同角度的部件参考仅用于对应部件，不改变整鞋姿态。Logo是否存在以目标对应面为准，目标内侧有Logo也应保留，禁止跨侧复制装饰；拉环颜色以目标为准，不沿用旧色，也不一律禁止红色。保持每只鞋位置、尺度、朝向及遮挡，不镜像、不旋转成参考角度。输出前对照上述项目检查，最终只返回生成图片，不返回JSON、说明文字或对比拼图。';
async function run({api,task,prompt,maskFirst=false,options={},record=()=>{}}){
 const log={schemaVersion:2,analysis:'inline_prompt_only',semanticReview:'not_performed',attempts:[],status:'preparing'};
 task.autoGeneration=log;record(log);
 try{
  const plan=references.plan(task.material,{view:'unknown'});
  task.referencePlan=plan;log.references=plan;
  if(maskFirst&&!task.visionMask)throw Error('缺少编辑蒙版');
  const refs=(maskFirst?[task.visionMask]:[]).concat(plan.files);
  const row={attempt:1,strategy:'full',status:'generating'};log.attempts.push(row);record(log);
  row.output=await api.generate(task.input,refs,prompt+INLINE_INSTRUCTIONS,{...options,maxAttempts:1});
  row.status='received';log.status='received';record(log);return row.output;
 }catch(e){log.status='failed';log.error=e.message;record(log);throw e;}
}
module.exports={run,INLINE_INSTRUCTIONS};
