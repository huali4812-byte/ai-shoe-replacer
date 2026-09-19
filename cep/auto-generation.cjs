'use strict';
const references=require('./reference-plan.cjs');
const referenceGuide=require('./reference-guide.cjs');
const INLINE_INSTRUCTIONS='\n【唯一款式依据】目标鞋主参考是唯一完整款式依据；如另有鞋底细节图，它只用于鞋底纹理、分区和颜色，不代表需要露出鞋底。参考图不是要复制到画面的产品照片。不要生成参考图的白底、黑底、阴影、第二只鞋或展示构图。\n【严格一对一替换】编辑蒙版内原来有几只鞋，输出仍只能有相同数量。每只新鞋必须占据对应旧鞋的位置、大小、朝向、左右脚、透视和遮挡；不得新增、复制或悬空任何鞋体、鞋带、魔术贴、Logo、提拉环、鞋底或零件。\n【场景保护】只替换蒙版内鞋体。人物、腿、袜子、裤子、地面、背景、文字、光影和蒙版外内容保持第一张图不变。不要输出产品图、拼图、对比图或说明文字，只返回与第一张相同尺寸的最终图。';
const REPLACEMENT_OVERRIDE='\n【最终换款硬规则，本段优先于前文】原场景鞋只提供位置、大小、朝向、左右脚、透视、脚部遮挡和落地关系；原鞋的款式结构一律不得保留。必须先清除原鞋的魔术贴、搭扣、鞋带系统、Logo、侧墙图案、开孔、凸块、拼接线和装饰，再完全按目标主参考重建。每只目标鞋只能有目标参考实际显示的一套魔术贴：参考为一条就只能生成一条，禁止把原鞋魔术贴留在下面或旁边，禁止叠加、分叉、上下双层或生成第二条；参考没有魔术贴则不得生成。鞋侧仅采用目标参考可见的轮廓、拼接和装饰，绝不能残留原鞋Logo、字母、圆形标、弧形凸纹、孔洞、色块或原款侧墙特征。看不清的目标细节应简化为干净连续的目标鞋材质，不得借用原鞋特征补全。\n【Logo位置与方向锁定】Logo不是自由装饰，也不是整鞋贴纸。先确定目标Logo实际附着在哪一个部件，再按该部件的局部坐标重建：若Logo位于横跨脚背的魔术贴，必须沿魔术贴长轴排列，处在参考显示的同一端/同一高度/同一方向，保持字母顺序、字距、整体宽高比例、基线和与边缘的间距；不得移到鞋侧、鞋舌、后跟或鞋底，不得旋转90度、镜像、弯曲变形、截断、重复或漂浮。Logo必须贴合承载面的透视、弯曲、缝线和遮挡，只在参考明确可见的区域出现；参考未显示Logo时不要凭原鞋补回。\n【鞋外侧颜色与结构锁定】每只鞋先判断场景中实际可见的目标鞋面，不按画面左右、鞋头朝向或原鞋颜色猜测内外侧。该可见面颜色以目标对应参考的分区为准：网布、皮革覆盖片、侧墙装饰、鞋头包边、鞋带、拉环和魔术贴分别取色；不能用目标整鞋平均色覆盖外侧，不能把原鞋外侧颜色、另一面的颜色或相邻部件颜色带入。保留目标参考明确存在的明暗分区、边界、纹理和材质；光照只产生同色明暗变化，不改变色相、分区或材料归属。\n【魔术贴与鞋侧层级】每只鞋只有目标参考中横跨脚背的那一条宽魔术贴闭合带；鞋侧纵向或斜向的窄皮条、织带、包边和骨架仅是鞋侧固定装饰，必须停留在鞋侧，不能横跨脚背，不能延伸成第二条魔术贴，不能与主魔术贴上下叠放。主魔术贴的起点、终点、宽度、圆角、缝线和连接位置严格照目标主参考；可见品牌文字或Logo应完整位于这一条主魔术贴上，不得截断、拆分或复制到鞋侧。\n【鞋底后跟不得变形】严格保持目标主参考的鞋头包边、中底厚度、外底高度和后跟轮廓比例；禁止把后跟放大为灰色硬壳、厚平台、楔形块或外凸配重，禁止因原鞋结构而增厚鞋底。场景透视只改变观看角度，不改变目标鞋真实结构比例。';
async function run({api,task,prompt,maskFirst=false,options={},record=()=>{}}){
 const log={schemaVersion:2,analysis:'inline_prompt_only',semanticReview:'not_performed',attempts:[],status:'preparing'};
 task.autoGeneration=log;record(log);
 try{
  const fullPlan=references.plan(task.material,{view:'unknown'});
  const byName=pattern=>fullPlan.entries.find(e=>pattern.test(require('path').basename(e.sourceFile||e.file)));
  const compositeEntry=byName(/_合成图(?:\.[^.]+)?$/i),pairEntry=byName(/_bd_pair(?:\.[^.]+)?$/i),bdLogoEntry=byName(/_bd_logo(?:\.[^.]+)?$/i);
  if(compositeEntry&&pairEntry&&bdLogoEntry){
   const shortPrompt='图1、图2两张图为同一款鞋子，把这款鞋子的所有元素如配色、Logo、印花、纹理、材质等1:1还原，穿到图3脚上，鞋身Logo文字细节以图4为准；图4仅提供Logo文字细节，不复制图4中魔术贴打开或展开的状态，魔术贴保持图3中每只鞋原有的闭合状态、方向和遮挡。';
   const selected=[compositeEntry,pairEntry,bdLogoEntry];
   const plan={...fullPlan,entries:selected,files:selected.map(e=>e.file),warnings:(fullPlan.warnings||[]).concat('用户验证四图模式：合成图、bd_pair、场景、bd_logo')};
   task.referencePlan=plan;log.fullReferenceCount=fullPlan.files.length;log.referenceStrategy='catalog_composite_pair_scene_logo';log.references=plan;log.isolatedShoe=false;log.logoReferenceIndices=[2];log.logoStatus='dedicated_bd_logo_bound';log.soleReferenceIndices=[];log.soleStatus='not_used_in_four_image_mode';log.imageOrder=[compositeEntry.file,pairEntry.file,task.input,bdLogoEntry.file];
   const row={attempt:1,strategy:'catalog_four_image',status:'generating'};log.attempts.push(row);record(log);
   row.output=await api.generate(compositeEntry.file,[pairEntry.file,task.input,bdLogoEntry.file],shortPrompt,{...options,logoReferenceIndices:[2],soleReferenceIndices:[],maxAttempts:1});
   row.status='received';log.status='received';record(log);return row.output;
  }
  const primaryEntry=fullPlan.entries.find(e=>e.sourceFile===task.material.cutout)||fullPlan.entries.find(e=>e.detail==='overall')||fullPlan.entries[0];
  if(!primaryEntry)throw Error('缺少目标鞋主参考图');
  const logoEntry=fullPlan.entries.find(e=>e!==primaryEntry&&e.detail==='logo');
  const soleEntry=fullPlan.entries.find(e=>e!==primaryEntry&&e!==logoEntry&&e.detail==='sole'&&e.view==='sole');
  const selectedEntries=[primaryEntry].concat(logoEntry?[logoEntry]:[]).concat(soleEntry?[soleEntry]:[]);
  const plan={...fullPlan,entries:selectedEntries,files:selectedEntries.map(e=>e.file),warnings:(fullPlan.warnings||[]).concat('稳定生成模式：一张主参考，最多附加一张Logo局部和一张鞋底细节')};
  task.referencePlan=plan;log.fullReferenceCount=fullPlan.files.length;log.referenceStrategy='primary_plus_optional_logo_and_sole';log.references=plan;
  const isolatedShoe=task.shoeCount===1&&!!task.visionMask;
  if(isolatedShoe&&!maskFirst){maskFirst=true;prompt+='\n【实际输入顺序修正，以此为准】图1原场景，图2黑白编辑蒙版，图3起才是目标参考。仅白色区域的一只鞋允许修改；裁切中其他鞋只作位置背景，不参与本次换鞋。';}
  log.isolatedShoe=isolatedShoe;
  if(isolatedShoe)prompt+='\n【当前只处理一只鞋】黑白蒙版中的白色区域只对应这一只原鞋。不得把参考图本身作为第二只鞋放进场景，不得在鞋口、裤脚或背景附近增加任何独立零件。';
  if(maskFirst&&!task.visionMask)throw Error('缺少编辑蒙版');
  const refs=(maskFirst?[task.visionMask]:[]).concat(plan.files);
  const logoFiles=new Set([...(task.material.logoReferences||[]),...plan.entries.filter(e=>e.detail==='logo').map(e=>e.file)]);
  const logoReferenceIndices=refs.map((file,i)=>logoFiles.has(file)&&file!==task.visionMask?i:-1).filter(i=>i>=0);
  log.logoReferenceIndices=logoReferenceIndices;
  log.logoStatus=logoReferenceIndices.length?'dedicated_reference_bound':'no_dedicated_reference';
  const logoGuide=logoReferenceIndices.length?'\n【Logo与魔术贴颜色专用参考图号】'+logoReferenceIndices.map(i=>'图'+(i+1)).join('、')+'只用于目标品牌Logo及其所在主魔术贴的准确外形、比例、文字、颜色、材质和位置。该图对魔术贴表面色、包边色、缝线色、字标色及彼此明暗关系的证据优先于场景旧鞋和款色文字；场景光照只改变整体受光明暗，不能改换这些部件的色相或把对比抹平。每只鞋只生成这一套Logo和这一条主魔术贴；完整照抄其圆角轮廓、宽度、连接端和可见文字，彻底删除原鞋魔术贴轮廓。不得把Logo局部图当成第二只鞋或额外贴片。':'';
  const soleEntries=plan.entries.filter(e=>e.view==='sole'&&e.detail==='sole');
  const soleReferenceIndices=soleEntries.map(e=>refs.indexOf(e.file)).filter(i=>i>=0);
  log.soleReferenceIndices=soleReferenceIndices;
  log.soleStatus=soleReferenceIndices.length?'dedicated_reference_bound':'no_dedicated_reference';
  const soleGuide=soleReferenceIndices.length?'\n【鞋底参考图号】'+soleReferenceIndices.map(i=>'图'+(i+1)).join('、')+'为本次目标鞋底专用参考。必须严格按该图的外底纹路、分区形状、橡胶块边界、沟槽深度、颗粒排布和材质层次还原，不得替换成波浪纹、人字纹或其他通用纹路。鞋底颜色、前后掌分区、侧墙接缝必须与该参考一致。只用于原场景实际可见的外底，不改变姿态露出原本不可见的底面，不用于鞋面或中底侧墙。':'';
  const guide=referenceGuide.build(plan.files,{maskFirst,entries:plan.entries});log.referenceGuide=guide;
  const row={attempt:1,strategy:'full',status:'generating'};log.attempts.push(row);record(log);
  row.output=await api.generate(task.input,refs,prompt+INLINE_INSTRUCTIONS+guide.text+logoGuide+soleGuide+REPLACEMENT_OVERRIDE,{...options,logoReferenceIndices,soleReferenceIndices,maxAttempts:1});
  row.status='received';log.status='received';record(log);return row.output;
 }catch(e){log.status='failed';log.error=e.message;record(log);throw e;}
}
module.exports={run,INLINE_INSTRUCTIONS,REPLACEMENT_OVERRIDE};
