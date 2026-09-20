const fs=require('fs'),path=require('path'),crypto=require('crypto');
const generation=require('./auto-generation.cjs');
function createRevisions({api,vision,host,root}) {
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const regions=p=>p.children||[p];
  function fingerprint(r){return JSON.stringify({input:hash(r.input),source:hash(r.protection.sourceFile),mask:hash(r.visionMask),box:r.exportBox,role:r.role,product:r.product,refs:[r.material.cutout].concat(r.material.references).map(hash)});}
  function record(v){fs.writeFileSync(path.join(v.folder,'version.json'),JSON.stringify(v,null,2));}
  function check(r){if(!r.preview||!r.visionMask||!r.input||!r.protection||!r.protection.sourceFile)throw Error('缺少原图、蒙版或当前预览，不能安全重做；请先完成鞋位准备');}
  async function compose(p,r,preview,folder,refinedMask){
    const all=regions(p),chosen=all.filter(x=>x===r||x.written);
    if(chosen.some(x=>!x.visionMask||!x.preview||x.protection.sourceFile!==r.protection.sourceFile))throw Error('已有结果或原始画布不完整，禁止覆盖');
    const out=await vision.request({action:'compose_parent',source:r.protection.sourceFile,output:path.join(folder,'full-composite.png'),allowPartial:false,requireRoles:!!p.dualRole,transparent:false,finalizeRoleMarkers:!!p.dualRole&&chosen.length===all.length&&!(p.detectionWarnings&&p.detectionWarnings.length&&p.candidateReview!=='dismissed'),protectedMarkers:p.dualRole?(r.protection.roleMarkers||[]):[],protectionRegions:all.map(x=>({box:x.exportBox,mask:x===r&&refinedMask?refinedMask:x.visionMask,maskMode:x.maskMode,noMaskExpansion:!!x.noMaskExpansion,role:x.role})),regions:chosen.map((x,i)=>({id:x.id,role:x.role,written:!!x.written,box:x.exportBox,mask:x===r&&refinedMask?refinedMask:x.visionMask,maskMode:x.maskMode,noMaskExpansion:!!x.noMaskExpansion,generated:x===r?preview:x.preview,output:path.join(folder,'patch-'+i+'.png')}))});
    if(!out.output||out.rejected&&out.rejected.length||!out.regions||chosen.some(x=>!out.regions.some(y=>y.id===x.id)))throw Error('合成校验未完整通过，保留当前版本');
    return out;
  }
  async function generate(p,r,{reason='同样条件再试一次',note='',local=false,repairMode=null,part=null,change='structure',partMask=null,attach=true}={}){
    check(r);if(repairMode && (repairMode!=='still_life'||!local||p.dualRole))throw Error('摆拍修复仅适用于无人、无脚部的独立摆拍鞋图');if(attach&&(r.revisionCandidates&&r.revisionCandidates.length||r.revisionCandidate))throw Error('请先应用或保留当前候选，再创建新版本');
    const localized=['sole','logo','strap','tongue','inner','outer','sidewall','pullTab','toe','upper','heel'].includes(part);
    if(localized&&partMask&&!fs.existsSync(partMask))throw Error('已记录的 Photoshop 局部选区文件不存在，请重新读取或清除后继续');
    if(localized&&!String(note).trim())throw Error('请输入该部位需要修改的具体要求');
    const folder=fs.mkdtempSync(path.join((fs.mkdirSync(root,{recursive:true}),root),'version-'));
    const v={id:path.basename(folder),folder,regionId:r.id,parentId:p.id,createdAt:new Date().toISOString(),status:'preparing',reason,note,local,repairMode,part,change,maskSource:localized&&partMask?'manual_part_selection':localized?'existing_shoe_mask':'existing_shoe_mask',basePreview:r.preview,fingerprint:fingerprint(r)};record(v);
    try{
      const plan=require('./reference-plan.cjs');
      const allReferences=[r.material.cutout].concat(r.material.references||[]);
      const selectedReferences=localized?plan.revisionReferences(r.material,part).map(e=>e.sourceFile||e.file):allReferences;
      if(localized&&!selectedReferences.length)throw Error('资源库缺少 '+part+' 对应参考图，已停止生成');
      const originals=[localized?r.preview:r.input,localized?(partMask||r.visionMask):r.visionMask].concat(selectedReferences);
      const copies=originals.map((f,i)=>{const dest=path.join(folder,'input-'+i+path.extname(f));fs.copyFileSync(i>=2?require('./reference-cache.cjs').snapshot(f):f,dest);return dest;});
      v.inputs=copies;v.selectedReferences=selectedReferences;v.editMask=copies[1];record(v);
      if(local){
        if(r.maskMode==='dino_rectangle')throw Error('当前鞋位使用 DINO 矩形蒙版，不再执行 SAM 轮廓补检');
        const detected=(r.visionRegions||[]).find(x=>JSON.stringify(x.box)===JSON.stringify(r.exportBox));
        const shoeBoxes=detected&&detected.dinoBoxes?detected.dinoBoxes.map(b=>[b[0]-r.exportBox[0],b[1]-r.exportBox[1],b[2]-r.exportBox[0],b[3]-r.exportBox[1]]):undefined;
        const refined=await vision.request({action:'refine_region',input:copies[0],mask:copies[1],shoeBoxes,repairMode,output:path.join(folder,'refined-mask.png')});
        if(repairMode && refined.repairMode!==repairMode)throw Error('本地视觉服务仍是旧版本，请保存工作并重启Photoshop后重试');
        if(!refined.mask||!fs.existsSync(refined.mask))throw Error('提拉环补检没有返回可用蒙版');
        v.maskRepair=refined;v.refinedMask=refined.mask;v.pullTabRecovery=refined.pullTabRecovery;record(v);
      }
      if(local){v.preview=path.join(folder,'reused'+path.extname(r.preview));fs.copyFileSync(r.preview,v.preview);}
      else{
        const partNames={sole:'鞋底',logo:'Logo',strap:'魔术贴',tongue:'鞋舌',inner:'鞋内侧',outer:'鞋外侧',sidewall:'鞋侧结构',pullTab:'提拉环',toe:'鞋头',upper:'鞋面',heel:'后跟和鞋口'};
        const partName=partNames[part]||'选定部位';
        const scopeInstruction=partMask?'白色蒙版是用户精确框选范围，任何像素变化都不得超出该范围。':'当前未提供精确局部框选，白色蒙版覆盖当前整只鞋；即使整鞋可编辑，也只能修改指定的'+partName+'，鞋上其他部位必须逐像素尽量保持第一张图。';
        const localInstruction=localized?scopeInstruction+'仅修改白色蒙版内的'+partName+'；黑色区域及白色区域外的鞋型、轮廓、其他鞋体部件、人物和背景必须保持第一张图不变。'+(change==='color'?'只校正该部位颜色、材质和分色，保持原有几何结构、厚度、纹路位置及鞋型不变，禁止改变轮廓、数量、连接关系或相邻结构。':'按照对应部位参考还原结构、纹理、材质和颜色，不改变相邻部件；只处理用户选定的原因，不顺带修改其他属性。'):'将蒙版内 '+(r.shoeCount||1)+' 只鞋替换为 '+r.product.sku+' '+r.product.color+'（'+r.role+'）。';
        const prompt='第一张是当前结果局部图，第二张是同坐标黑白编辑蒙版，仅白色区域允许修改，后面只提供与本次修改对应的目标参考图。'+localInstruction+'必须保留第一张画布尺寸和1:1比例、鞋的位置、左右脚、鞋尖方向、透视、大小及遮挡。禁止把蒙版画入输出。此次重点：'+reason+'。用户要求：'+note;
        const edit={...r,generationKind:'revision',input:copies[0],visionMask:copies[1],material:{cutout:copies[2],references:copies.slice(3),referenceMetadata:Object.fromEntries(selectedReferences.map((file,i)=>[copies[i+2],r.material.referenceMetadata&&r.material.referenceMetadata[file]||plan.classify(file)])),logoReferences:selectedReferences.map((file,i)=>plan.classify(file).detail==='logo'?copies[i+2]:null).filter(Boolean)}};
        v.status='generating';record(v);v.preview=await generation.run({api,task:edit,prompt,maskFirst:true,options:{taskId:r.id+'-'+v.id,aspectRatio:'1:1',validateAspect:true},record:log=>{v.generation=log;record(v);}});

      }
      if(fingerprint(r)!==v.fingerprint||r.preview!==v.basePreview)throw Error('输入或当前版本已经变化，请重新核对');
      v.outputDiagnosis=await vision.request({action:'diagnose_result',stage:'local',source:copies[0],generated:v.preview,mask:v.refinedMask||copies[1]});
      record(v);
      if(!v.outputDiagnosis.passed)throw Error('局部输出诊断未通过；蒙版外变化仅作记录，最终由合成保护');
      v.composition=await compose(p,r,v.preview,folder,v.refinedMask||v.editMask);v.status='candidate';record(v);if(attach){r.revisionCandidates=[v];r.revisionCandidate=v;}return v;
    }catch(e){v.status='failed';v.error=e.message;record(v);throw e;}
  }
  async function generateGlobal(items,{count=4,concurrency=8}={}){
    if(!Array.isArray(items)||!items.length)throw Error('没有选择需要重做的鞋位');
    if(items.some(x=>x.r.revisionCandidates&&x.r.revisionCandidates.length||x.r.revisionCandidate))throw Error('所选鞋位已有候选版本，请先应用或保留');
    const jobs=[];for(const item of items)for(let i=0;i<count;i++)jobs.push({item,index:i});
    const successes=new Map(),failures=[];let cursor=0;
    async function worker(){while(cursor<jobs.length){const job=jobs[cursor++],item=job.item;try{const v=await generate(item.p,item.r,{...(item.options||{}),attach:false});if(!successes.has(item.r))successes.set(item.r,[]);successes.get(item.r).push(v);}catch(e){failures.push({regionId:item.r.id,index:job.index,error:e.message});}}}
    await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},worker));
    for(const item of items){const list=successes.get(item.r)||[];item.r.revisionCandidates=list;item.r.revisionCandidate=list[0]||null;}
    if(!successes.size){const details=[...new Set(failures.map(x=>x.error))].slice(0,3).join('；');throw Error('全部重换候选生成失败'+(details?'：'+details:''));}
    return {candidates:[...successes.values()].flat(),failures};
  }
  async function generateBatch(p,items,settings){return generateGlobal(items.map(x=>({...x,p})),settings);}
  function discard(r,v){const list=r.revisionCandidates||[r.revisionCandidate].filter(Boolean),targets=v?[v]:list;for(const x of targets){x.status='not_selected';record(x);}r.revisionCandidates=v?list.filter(x=>x!==v):[];r.revisionCandidate=r.revisionCandidates[0]||null;}
  async function apply(p,r,candidate){
    const v=candidate||r.revisionCandidate;if(!v||v.status!=='candidate')throw Error('没有可应用的新版本');
    if(r.preview!==v.basePreview||fingerprint(r)!==v.fingerprint)throw Error('鞋位、素材或当前版本已变化，不能应用旧候选');
    const outputDir=fs.mkdtempSync(path.join(v.folder,'apply-'));
    const composition=await compose(p,r,v.preview,outputDir,v.refinedMask||v.editMask);
    const all=regions(p),hideRoleMarkers=!!p.dualRole&&all.every(x=>x===r||x.written)&&!(p.detectionWarnings&&p.detectionWarnings.length&&p.candidateReview!=='dismissed');
    v.semanticReview='not_performed';
    v.status='applying';record(v);
    let result;
    try{result=await host('applySmart',{id:r.id,documentId:r.documentId,layerId:r.layerId,output:composition.output,patches:null,contentFile:path.join(outputDir,'content.psb'),hideRoleMarkers,fullCanvas:true,canvasSize:composition.size,name:'[AI-Shoe] '+r.product.sku+' '+r.product.color});}
    catch(e){v.status='candidate';v.applyError=e.message;record(v);throw e;}
    r.revisionHistory=r.revisionHistory||[];r.revisionHistory.push({preview:r.preview,composition:r.composition,written:!!r.written,replacedAt:new Date().toISOString()});
    if(v.refinedMask)r.visionMask=v.refinedMask;
    r.preview=v.preview;r.composition=composition;r.writeResult=result;r.written=true;r.previewValidation='valid';r.phase='written';r.status='新版本已回写，待画面验收';for(const other of (r.revisionCandidates||[])){if(other!==v&&other.status==='candidate'){other.status='not_selected';record(other);}}r.revisionCandidates=[];r.revisionCandidate=null;
    p.markersHidden=hideRoleMarkers;p.needsFinalize=!!p.dualRole&&!hideRoleMarkers;
    v.status='applied';v.appliedAt=new Date().toISOString();v.composition=composition;
    try{record(v);}catch(e){v.logWarning=e.message;}
    return v;
  }
  return {generate,generateBatch,generateGlobal,apply,discard};
}
module.exports={createRevisions};
