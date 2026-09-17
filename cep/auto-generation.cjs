'use strict';
const references=require('./reference-plan.cjs');
const referenceGuide=require('./reference-guide.cjs');
const INLINE_INSTRUCTIONS='\n【换鞋前的逐鞋核对】先把原图中的每一只鞋分别当作独立对象核对：记录其位置、大小、鞋头/鞋跟方向、透视、倾斜、遮挡和实际可见面。不得用画面左/右推断左右脚，也不得把一只鞋的结构套到另一只鞋；一只鞋若同时露出内侧、外侧、鞋面或鞋底，必须分别保留这些可见面。\n【目标款式与可见面】原图只决定姿态、位置、透视、遮挡和背景；目标参考只决定目标鞋的款式、颜色、材料和结构。把每张参考图只用于它实际展示的部位和角度，不因参考图更清楚就把鞋旋转成参考角度，不把内外侧互换。无法确认的侧别不要臆测，优先遵循原图当前可见轮廓和目标参考共同支持的结构。\n【必须逐项保留的细节】逐只核对鞋面分区、拼接边界、车线、鞋头形状、侧墙/中底的分层与凸起、鞋口、鞋带、魔术贴、拉环、Logo/字标和鞋底。目标参考中可见的魔术贴、Logo、字标、浮雕/凹陷、凸起结构、拉环数量与连接位置都应保留；目标对应面没有的装饰禁止跨侧新增。Logo必须按参考的字形、方向、位置、大小、数量和材质呈现，禁止乱码、镜像、重复、漂移或把Logo复制到另一侧。\n【颜色与鞋底】所有颜色、材质和明暗关系以目标参考为准，不沿用原鞋旧色，不让原红/蓝等颜色渗入拉环、鞋面、侧墙或中底；但不得擅自把目标参考本身存在的颜色删掉。鞋底必须按目标参考的可见结构重现：区分外底/中底/侧墙，若目标为块状橡胶分区、颗粒面或分叉结构，必须保留其分区形状与沟槽、凸起和边齿，不得替换成波浪纹或通用人字纹；若目标本身是其他纹路，则忠实遵循目标，不把块状纹路强加给所有鞋款。\n【生成前自检】生成前再次逐只检查：当前可见面是否匹配、内外侧是否混用、每只鞋的姿态是否保持、目标颜色是否完整、Logo/魔术贴/拉环是否在正确位置、鞋底分区和纹路是否来自目标参考。保持每只鞋原位置、尺度、朝向、透视、遮挡及背景，不镜像、不旋转、不改变构图，不生成对比拼图。最终只返回生成图片，不返回JSON、说明文字或分析过程。';
async function run({api,task,prompt,maskFirst=false,options={},record=()=>{}}){
 const log={schemaVersion:2,analysis:'inline_prompt_only',semanticReview:'not_performed',attempts:[],status:'preparing'};
 task.autoGeneration=log;record(log);
 try{
  const plan=references.plan(task.material,{view:'unknown'});
  task.referencePlan=plan;log.references=plan;
  if(maskFirst&&!task.visionMask)throw Error('缺少编辑蒙版');
  const refs=(maskFirst?[task.visionMask]:[]).concat(plan.files);
  const logoFiles=new Set([...(task.material.logoReferences||[]),...plan.entries.filter(e=>e.detail==='logo').map(e=>e.file)]);
  const logoReferenceIndices=refs.map((file,i)=>logoFiles.has(file)&&file!==task.visionMask?i:-1).filter(i=>i>=0);
  log.logoReferenceIndices=logoReferenceIndices;
  const guide=referenceGuide.build(plan.files,{maskFirst});log.referenceGuide=guide;
  const row={attempt:1,strategy:'full',status:'generating'};log.attempts.push(row);record(log);
  row.output=await api.generate(task.input,refs,prompt+INLINE_INSTRUCTIONS+guide.text,{...options,logoReferenceIndices,maxAttempts:1});
  row.status='received';log.status='received';record(log);return row.output;
 }catch(e){log.status='failed';log.error=e.message;record(log);throw e;}
}
module.exports={run,INLINE_INSTRUCTIONS};
