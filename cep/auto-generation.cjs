'use strict';
const references=require('./reference-plan.cjs');
const referenceGuide=require('./reference-guide.cjs');
const INLINE_INSTRUCTIONS='\n【唯一款式依据】目标鞋主参考是唯一完整款式依据；如另有鞋底细节图，它只用于鞋底纹理、分区和颜色，不代表需要露出鞋底。参考图不是要复制到画面的产品照片。不要生成参考图的白底、黑底、阴影、第二只鞋或展示构图。\n【严格一对一替换】编辑蒙版内原来有几只鞋，输出仍只能有相同数量。每只新鞋必须占据对应旧鞋的位置、大小、朝向、左右脚、透视和遮挡；不得新增、复制或悬空任何鞋体、鞋带、魔术贴、Logo、提拉环、鞋底或零件。\n【场景保护】只替换蒙版内鞋体。人物、腿、袜子、裤子、地面、背景、文字、光影和蒙版外内容保持第一张图不变。不要输出产品图、拼图、对比图或说明文字，只返回与第一张相同尺寸的最终图。';
const SINGLE_PROMPT=role=>`【输入顺序】图1是唯一待编辑的原场景；图2是${role}目标鞋合成图；图3是同款成双参考图，只补充目标鞋内外侧和材质；图4只补充Logo及其承载部件。\n【任务】只把图1当前编辑区域中原有的唯一一只原鞋完整替换为图2目标鞋。输出必须仍是图1场景，且恰好只有原位置的一只鞋。禁止把图2、图3或图4当作待编辑底图，禁止复制参考图背景、产品构图、第二只鞋、另一只脚或独立零件。\n【单鞋对应】新鞋必须完整占据原鞋轮廓，保持原鞋位置、大小、朝向、左右脚、透视、倾斜、穿着、遮挡、鞋口连接和落地关系。不得悬空、移动、放大、改成产品展示角度，不得把鞋头、鞋底、后跟或另一只参考鞋拼接到原鞋之外。\n【完整换款】先清除原鞋旧魔术贴、搭扣、鞋带系统、Logo、侧墙结构、孔洞、凸块、拼接、鞋底和旧色，再按图2重建；图3只补充当前可见面，不得决定鞋子数量。只使用当前可见面对应的内侧、外侧、鞋面、后跟或鞋底结构，不跨侧复制Logo、环扣和装饰。\n【部件准确】只保留目标实际存在的一套主魔术贴并正常闭合；Logo按图4的文字、颜色、比例、方向和附着位置贴合透视，禁止镜像、乱码、重复或漂浮。网布、皮革、包边、鞋带、织带、魔术贴、缝线、Logo、拉环、中底和外底分别按目标取色与材质。\n【场景保护】除图1原鞋区域外，人物、腿、袜子、裤脚、地面、背景、文字、图形标注、光影和所有其他像素保持图1不变。最终只返回与图1完全相同尺寸和构图的结果图。`;
const SOLE_PROMPT='把图1中当前可见的鞋底换成图2的鞋底。童鞋鞋底为视觉主体，严格还原图2的大底轮廓、分区、颜色、防滑纹路、沟槽、颗粒、边缘和Logo；鞋底采用半透明透视效果，透过鞋底可以隐约看见脚底足型轮廓。保持图1中脚、腿、袜子、鞋面、姿态、朝向、透视、位置、数量、遮挡、背景和构图不变，不新增鞋、不改变成侧视鞋，不复制图2的黑底或产品展示构图。柔和均匀影棚柔光，干净通透，电商童鞋卖点展示图。只返回与图1相同尺寸的最终图。';
const REPLACEMENT_OVERRIDE='\n【最终换款硬规则，本段优先于前文】原场景鞋只提供位置、大小、朝向、左右脚、透视、脚部遮挡和落地关系；原鞋的款式结构一律不得保留。必须先清除原鞋的魔术贴、搭扣、鞋带系统、Logo、侧墙图案、开孔、凸块、拼接线和装饰，再完全按目标主参考重建。每只目标鞋只能有目标参考实际显示的一套魔术贴：参考为一条就只能生成一条，禁止把原鞋魔术贴留在下面或旁边，禁止叠加、分叉、上下双层或生成第二条；参考没有魔术贴则不得生成。鞋侧仅采用目标参考可见的轮廓、拼接和装饰，绝不能残留原鞋Logo、字母、圆形标、弧形凸纹、孔洞、色块或原款侧墙特征。看不清的目标细节应简化为干净连续的目标鞋材质，不得借用原鞋特征补全。\n【Logo位置与方向锁定】Logo不是自由装饰，也不是整鞋贴纸。先确定目标Logo实际附着在哪一个部件，再按该部件的局部坐标重建：若Logo位于横跨脚背的魔术贴，必须沿魔术贴长轴排列，处在参考显示的同一端/同一高度/同一方向，保持字母顺序、字距、整体宽高比例、基线和与边缘的间距；不得移到鞋侧、鞋舌、后跟或鞋底，不得旋转90度、镜像、弯曲变形、截断、重复或漂浮。Logo必须贴合承载面的透视、弯曲、缝线和遮挡，只在参考明确可见的区域出现；参考未显示Logo时不要凭原鞋补回。\n【鞋外侧颜色与结构锁定】每只鞋先判断场景中实际可见的目标鞋面，不按画面左右、鞋头朝向或原鞋颜色猜测内外侧。该可见面颜色以目标对应参考的分区为准：网布、皮革覆盖片、侧墙装饰、鞋头包边、鞋带、拉环和魔术贴分别取色；不能用目标整鞋平均色覆盖外侧，不能把原鞋外侧颜色、另一面的颜色或相邻部件颜色带入。保留目标参考明确存在的明暗分区、边界、纹理和材质；光照只产生同色明暗变化，不改变色相、分区或材料归属。\n【魔术贴与鞋侧层级】每只鞋只有目标参考中横跨脚背的那一条宽魔术贴闭合带；鞋侧纵向或斜向的窄皮条、织带、包边和骨架仅是鞋侧固定装饰，必须停留在鞋侧，不能横跨脚背，不能延伸成第二条魔术贴，不能与主魔术贴上下叠放。主魔术贴的起点、终点、宽度、圆角、缝线和连接位置严格照目标主参考；可见品牌文字或Logo应完整位于这一条主魔术贴上，不得截断、拆分或复制到鞋侧。\n【鞋底后跟不得变形】严格保持目标主参考的鞋头包边、中底厚度、外底高度和后跟轮廓比例；禁止把后跟放大为灰色硬壳、厚平台、楔形块或外凸配重，禁止因原鞋结构而增厚鞋底。场景透视只改变观看角度，不改变目标鞋真实结构比例。';
async function run({api,task,prompt,maskFirst=false,options={},record=()=>{}}){
 const log={schemaVersion:2,analysis:'inline_prompt_only',semanticReview:'not_performed',attempts:[],status:'preparing'};
 task.autoGeneration=log;record(log);
 try{
  const fullPlan=references.plan(task.material,{view:'unknown'});
  const byName=pattern=>fullPlan.entries.find(e=>pattern.test(require('path').basename(e.sourceFile||e.file)));
  const compositeEntry=byName(/_合成图(?:\.[^.]+)?$/i),pairEntry=byName(/_bd_pair(?:\.[^.]+)?$/i),bdLogoEntry=byName(/_bd_logo(?:\.[^.]+)?$/i);
  const soleCatalogEntry=byName(/_t_sole(?:\.[^.]+)?$/i);
  if(task.generationKind==='sole'){
   if(!soleCatalogEntry)throw Error('鞋底任务缺少对应 _t_sole 素材');
   const plan={...fullPlan,entries:[soleCatalogEntry],files:[soleCatalogEntry.file],warnings:(fullPlan.warnings||[]).concat('鞋底两图模式：场景原图、t_sole鞋底')};
   task.referencePlan=plan;log.fullReferenceCount=fullPlan.files.length;log.referenceStrategy='scene_plus_t_sole';log.references=plan;log.imageOrder=[task.input,soleCatalogEntry.file];log.soleReferenceIndices=[0];log.soleStatus='dedicated_t_sole_bound';
   const row={attempt:1,strategy:'sole_two_image',status:'generating'};log.attempts.push(row);record(log);
   row.output=await api.generate(task.input,[soleCatalogEntry.file],SOLE_PROMPT,{...options,imageLabels:['【图1：待编辑原图】只修改其中当前可见鞋底。','【图2：目标 t_sole 鞋底图】只提供目标大底轮廓、分区、颜色、纹路、材质和Logo。'],logoReferenceIndices:[],soleReferenceIndices:[0],maxAttempts:1});
   row.status='received';log.status='received';record(log);return row.output;
  }
  if(compositeEntry&&pairEntry&&bdLogoEntry){
   const singleRole=task.generationKind==='single_main'?'主推':task.generationKind==='single_secondary'?'次推':null;
   const shortPrompt=singleRole?SINGLE_PROMPT(singleRole):`【任务】
图1、图2展示同一款目标鞋。把图3中当前编辑区域对应的同一个人的一双原鞋，完整替换为图1、图2中的目标鞋；鞋身Logo的文字、颜色、比例和附着位置以图4为准。最终只返回完成换鞋后的图3场景，不返回说明文字、产品图、拼图或对比图。

【一双鞋整体对应】
必须把图3中的两只鞋作为同一双进行理解和重建。输出仍然只能有两只鞋，一只对应原场景左脚位置，另一只对应原场景右脚位置。两只鞋属于同一目标款式和同一配色，但必须分别保持各自在图3中的位置、大小、朝向、左右脚关系、透视、倾斜、脚部遮挡和落地关系。不得合并、遗漏或新增鞋子，不得复制同一只鞋代替另一只，也不得让两只鞋使用相同朝向。

【款式依据】
图1是目标鞋的主要款式、整体结构和配色依据。图2用于补充图1没有清楚展示的鞋面、内外侧、鞋底、材质和颜色细节。图4只补充Logo及其承载部件的细节，不复制图4中的背景、额外鞋体或为展示Logo而打开、展开、抬起的魔术贴状态。目标参考决定款式、结构、颜色、材质、Logo和零部件；图3原鞋只提供位置、姿态、左右脚、透视、遮挡、穿着关系、落地关系和场景光照。

【先清除原鞋再重建】
先清除两只原鞋的旧魔术贴、搭扣、鞋带系统、Logo、字母、侧墙图案、开孔、凸块、拼接线、装饰和旧配色，再分别按照目标参考重建。不能只给原鞋换颜色，不能把目标局部覆盖在原鞋结构上，不得残留原鞋特征。

【左右脚与可见面】
分别判断两只鞋实际露出的鞋面、内侧、外侧、后跟和鞋底，不根据画面左右位置猜测内外侧，也不能把同一侧结构复制给两只鞋。每只鞋只使用目标参考中与其实际可见面对应的结构；不得把内外侧互换，不得为了对称而复制Logo、环扣、凸起或装饰。

【魔术贴】
每只鞋只能生成目标参考中实际存在的一套主魔术贴。目标为一条时每只鞋只能有一条，禁止叠加、分叉、上下双层或生成第二条。主魔术贴的宽度、圆角、起点、终点、缝线、连接端、闭合方向和遮挡关系按照目标结构，并适配图3中对应脚的姿态。鞋侧窄皮条、织带、包边和骨架不能延伸成第二条魔术贴。不得复制图4中为拍摄Logo而打开或展开的状态；魔术贴保持正常穿着时的闭合状态，并服从图3中各自的方向、透视和遮挡。

【Logo】
先识别Logo实际附着在魔术贴、鞋舌、侧墙还是后跟，再按该部件的局部坐标重建。Logo的文字、颜色、字母顺序、字距、比例、方向、基线、边缘距离和材质以图4为准。Logo必须贴合承载面的透视、弯曲、缝线和遮挡，不得镜像、旋转90度、拆字、乱码、截断、重复、漂浮或移动到其他部件。两只鞋分别根据各自可见面呈现Logo；目标对应面没有Logo时不得为了对称补上。

【颜色与材质】
两只鞋必须属于图1、图2中的同一目标配色，但每个部件独立取色。分别还原鞋面网布、皮革覆盖片、鞋头包边、侧墙、中底、外底、鞋带、鞋带孔织带、魔术贴表面、魔术贴包边、缝线、Logo字标、连接端、鞋舌拉环和后跟拉环。不得用整鞋平均色覆盖所有部件，不得继承原鞋颜色，也不得让相邻部件串色。目标存在双色、条纹、深浅分区、渐变、金属反光或不同材质时，保留边界、对比和材质差异。场景光照只能改变明暗和阴影，不能改变目标色相、取消分区或把彩色小部件灰化。

【鞋底与后跟】
鞋头包边、中底厚度、外底高度、鞋底分区、后跟轮廓和整体比例按照目标参考。不得继承原鞋鞋底，不得生成厚平台、楔形块、灰色硬壳或外凸配重。只有图3原本可见鞋底时才根据图2补充纹理、沟槽、橡胶分区和材质；不得为了展示鞋底而旋转鞋子或露出原本不可见的底面。

【场景保护】
只替换当前编辑区域中的这一双鞋。人物、腿、脚踝、袜子、裤脚、手、地面、背景、文字、构图、场景光影和编辑区域外内容保持图3不变。保留裤脚压住鞋口、袜子进入鞋口、双脚前后关系、鞋体之间遮挡和鞋底接触地面的关系。不得修改人物姿势，不得缩放或移动双脚，不得增加腿、脚、鞋或独立零件。

【输出前检查】
确认两只原鞋均已替换，输出恰好两只同款同配色目标鞋；两只鞋分别保持原位置、大小、朝向、左右脚、透视和遮挡；内外侧结构正确；原鞋结构和旧色已清除；魔术贴数量正确且正常闭合；Logo来自图4并位于正确承载面；小部件颜色和材质来自目标参考；人物、裤脚、袜子、地面和背景保持不变。最终只输出与图3相同尺寸的换鞋结果图。`;
   const imageLabels=singleRole?[
    '【图1：唯一待编辑原场景】只替换其中当前编辑区域原有的一只鞋，其余像素和构图保持不变。',
    '【图2：目标鞋合成图】只提供目标款式、轮廓、结构和配色，不提供输出场景或鞋子数量。',
    '【图3：目标鞋成双参考图】只补充同款鞋内外侧、材质和当前可见面，不得复制第二只鞋或产品背景。',
    '【图4：目标鞋 Logo 参考图】只补充Logo文字、颜色、比例、材质和附着位置。'
   ]:[
    '【图1：目标鞋合成图】目标鞋的主要款式、整体轮廓、结构和配色依据。',
    '【图2：目标鞋成双参考图】与图1相同的目标鞋，只补充内外侧、鞋面、鞋底、颜色和材质；不复制其中的鞋子数量、背景或排列。',
    '【图3：待换鞋场景图】只替换当前编辑区域对应的同一个人的一双鞋，其他内容保持不变。',
    '【图4：目标鞋 Logo 参考图】只补充Logo文字、颜色、比例、材质和附着位置；不复制展示状态或额外鞋体。'
   ];
   const selected=[compositeEntry,pairEntry,bdLogoEntry];
   const plan={...fullPlan,entries:selected,files:selected.map(e=>e.file),warnings:(fullPlan.warnings||[]).concat('用户验证四图模式：场景、合成图、bd_pair、bd_logo')};
   task.referencePlan=plan;log.fullReferenceCount=fullPlan.files.length;log.referenceStrategy=singleRole?'single_scene_composite_pair_logo':'catalog_composite_pair_scene_logo';log.references=plan;log.isolatedShoe=!!singleRole;log.logoReferenceIndices=[2];log.logoStatus='dedicated_bd_logo_bound';log.soleReferenceIndices=[];log.soleStatus='not_used_in_four_image_mode';log.imageOrder=singleRole?[task.input,compositeEntry.file,pairEntry.file,bdLogoEntry.file]:[compositeEntry.file,pairEntry.file,task.input,bdLogoEntry.file];
   const row={attempt:1,strategy:singleRole?'single_scene_first_four_image':'catalog_four_image',status:'generating'};log.attempts.push(row);record(log);
   row.output=singleRole
    ?await api.generate(task.input,[compositeEntry.file,pairEntry.file,bdLogoEntry.file],shortPrompt,{...options,imageLabels,logoReferenceIndices:[2],soleReferenceIndices:[],maxAttempts:1})
    :await api.generate(compositeEntry.file,[pairEntry.file,task.input,bdLogoEntry.file],shortPrompt,{...options,imageLabels,logoReferenceIndices:[2],soleReferenceIndices:[],maxAttempts:1});
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
