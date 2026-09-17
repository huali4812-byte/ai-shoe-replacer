'use strict';
// Bounded local edit executor. Candidate localization is supplied, never guessed.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {select}=require('./detail-routing.cjs');
const instructions={
 logo:'只修复指定部位的Logo。以目标实物参考的字形、同色压印/浮雕及材质为准，不使用海报品牌颜色，不把银色压印改成深色印刷。',
 sole:'只修复鞋底。按目标前掌/后跟橡胶分区、中央连接结构和颗粒纹理重建；保留场景透视，不沿用旧鞋纹路。',
 sidewall:'只修复当前可见侧墙。对应面平整就保持平整，有凸起才还原凸起；对应面有Logo必须保留，不从另一侧复制。',
 pullTab:'只修复可见提拉环的颜色、织带纹理与连接结构，不沿用旧鞋颜色；目标本身存在的颜色合法。不改袜子裤脚。',
 toe:'只修复指定鞋头结构和材质。',upper:'只修复指定鞋面拼接和结构。'
};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function run({api,vision,task,base,check,entries,root}){
 const candidate=select(check,task,entries);
 if(!candidate)throw Error('局部修复缺少可靠定位、同侧专用参考或安全条件');
 if(candidate.part==='sidewall'&&!['inner','outer'].includes(check.surface))throw Error('侧墙可见面未确定，禁止猜测');
 if(candidate.part==='sidewall'&&candidate.references.some(e=>e.surface!==check.surface))throw Error('侧墙参考与场景可见面不一致');
 const files=[task.input,task.visionMask,base,...candidate.references.map(e=>e.file)];
 const before=files.map(hash);
 fs.mkdirSync(root,{recursive:true});
 const folder=fs.mkdtempSync(path.join(root,'detail-'));
 const record={part:candidate.part,box:candidate.box,status:'preparing',semanticReview:'not_performed',before,files};
 const save=()=>fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(record,null,2));
 save();
 try{
  const mask=path.join(folder,'mask.png');
  await vision.request({action:'prepare_detail',source:task.input,mask:task.visionMask,box:candidate.box,output:mask});
  if(!fs.existsSync(mask))throw Error('局部蒙版未生成');
  record.status='generating';save();
  record.generated=await api.generate(base,[mask,...candidate.references.map(e=>e.file)],
   '第一张为当前候选，第二张为编辑蒙版，其余是目标部件参考。只修改白色范围，保持画布比例、鞋的姿态、尺度、遮挡和背景，禁止镜像或旋转成参考角度。'+instructions[candidate.part]+'最终只输出图片，不画蒙版。',
   {taskId:task.id+'-'+path.basename(folder),maxAttempts:1,validateAspect:true});
  if(files.some((f,i)=>hash(f)!==before[i]))throw Error('修复期间输入变化，禁止应用');
  record.composition=await vision.request({action:'compose_detail',source:task.input,mask:task.visionMask,box:candidate.box,base,generated:record.generated,output:path.join(folder,'candidate.png')});
  if(!record.composition.output||record.composition.outsideChangedPixels!==0)throw Error('局部合成保护未通过');
  record.status='candidate';save();return {...record,folder};
 }catch(e){record.status='failed';record.error=e.message;save();throw e;}
}
module.exports={run};
