const fs=require('fs'),path=require('path'),crypto=require('crypto');
function createRevisions({api,vision,host,root}) {
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const regions=p=>p.children||[p];
  function fingerprint(r){return JSON.stringify({input:hash(r.input),source:hash(r.protection.sourceFile),mask:hash(r.visionMask),box:r.exportBox,role:r.role,product:r.product,refs:[r.material.cutout].concat(r.material.references).map(hash)});}
  function record(v){fs.writeFileSync(path.join(v.folder,'version.json'),JSON.stringify(v,null,2));}
  function check(r){if(!r.preview||!r.visionMask||!r.input||!r.protection||!r.protection.sourceFile)throw Error('缺少原图、蒙版或当前预览，不能安全重做；请先完成鞋位准备');}
  async function compose(p,r,preview,folder){
    const all=regions(p),chosen=all.filter(x=>x===r||x.written);
    if(chosen.some(x=>!x.visionMask||!x.preview||x.protection.sourceFile!==r.protection.sourceFile))throw Error('已有结果或原始画布不完整，禁止覆盖');
    const out=await vision.request({action:'compose_parent',source:r.protection.sourceFile,output:path.join(folder,'full-composite.png'),allowPartial:false,requireRoles:!!p.dualRole,transparent:!!p.dualRole,protectedMarkers:p.dualRole?(r.protection.roleMarkers||[]):[],protectionRegions:all.map(x=>({box:x.exportBox,mask:x.visionMask,role:x.role})),regions:chosen.map((x,i)=>({id:x.id,role:x.role,written:!!x.written,box:x.exportBox,mask:x.visionMask,generated:x===r?preview:x.preview,output:path.join(folder,'patch-'+i+'.png')}))});
    if(!out.output||out.rejected&&out.rejected.length||!out.regions||chosen.some(x=>!out.regions.some(y=>y.id===x.id)))throw Error('合成校验未完整通过，保留当前版本');
    return out;
  }
  async function generate(p,r,{reason='同样条件再试一次',note='',local=false}={}){
    check(r);if(r.revisionCandidate)throw Error('请先应用或保留当前版本，再创建下一版');
    const folder=fs.mkdtempSync(path.join((fs.mkdirSync(root,{recursive:true}),root),'version-'));
    const v={id:path.basename(folder),folder,regionId:r.id,parentId:p.id,createdAt:new Date().toISOString(),status:'preparing',reason,note,local,basePreview:r.preview,fingerprint:fingerprint(r)};record(v);
    try{
      const originals=[r.input,r.visionMask,r.material.cutout].concat(r.material.references);
      const copies=originals.map((f,i)=>{const dest=path.join(folder,'input-'+i+path.extname(f));fs.copyFileSync(f,dest);return dest;});
      v.inputs=copies;record(v);
      if(local){v.preview=path.join(folder,'reused'+path.extname(r.preview));fs.copyFileSync(r.preview,v.preview);}
      else{
        const prompt='第一张是换鞋前的原始局部图，第二张是同坐标黑白蒙版，仅白色鞋位允许修改，后面是目标鞋参考图。将蒙版内 '+(r.shoeCount||1)+' 只鞋替换为 '+r.product.sku+' '+r.product.color+'（'+r.role+'）。必须保留原图画布尺寸和1:1比例、逐只鞋的位置、左右脚、鞋尖方向、透视、大小及前后遮挡；严格遵循参考鞋款、配色、Logo和纹理。鞋面、鞋头、鞋侧和后跟的品牌 Logo/字标必须按对应角度参考图还原，保持正确拼写、方向、位置、大小、浮雕或凹陷质感与透视；禁止乱码、镜像、重复、移位或生成不存在的字样，禁止把后跟Logo放到鞋侧或把鞋侧Logo放到鞋头。鞋舌提拉环和后跟提拉环（pull tab）必须先擦除原提拉环，绝对不能保留原鞋红色或旧纹理，再按目标鞋素材重绘真实的数量、位置、连接关系、尺寸、朝向、颜色、边缘包缝和织带纹理；目标鞋无提拉环时禁止新增，有提拉环时禁止漏掉、复制或移位，禁止把提拉环误当作鞋带、鞋舌或另一只鞋。其他人物、鞋、腿、袜子、文字和背景保持不变，禁止把蒙版画入输出。此次重点：'+reason+'。补充要求：'+note;
        v.status='generating';record(v);v.preview=await api.generate(copies[0],copies.slice(1),prompt,{taskId:r.id+'-'+v.id,aspectRatio:'1:1',validateAspect:true});
      }
      if(fingerprint(r)!==v.fingerprint||r.preview!==v.basePreview)throw Error('输入或当前版本已经变化，请重新核对');
      v.composition=await compose(p,r,v.preview,folder);v.status='candidate';record(v);r.revisionCandidate=v;return v;
    }catch(e){v.status='failed';v.error=e.message;record(v);throw e;}
  }
  function discard(r){const v=r.revisionCandidate;if(!v)return;v.status='not_selected';record(v);r.revisionCandidate=null;}
  async function apply(p,r){
    const v=r.revisionCandidate;if(!v||v.status!=='candidate')throw Error('没有可应用的新版本');
    if(r.preview!==v.basePreview||fingerprint(r)!==v.fingerprint)throw Error('鞋位、素材或当前版本已变化，不能应用旧候选');
    const outputDir=fs.mkdtempSync(path.join(v.folder,'apply-'));
    const composition=await compose(p,r,v.preview,outputDir);
    const all=regions(p),hideRoleMarkers=!!p.dualRole&&all.every(x=>x===r||x.written)&&!(p.detectionWarnings&&p.detectionWarnings.length&&p.candidateReview!=='dismissed');
    v.status='applying';record(v);
    let result;
    try{result=await host('applySmart',{id:r.id,documentId:r.documentId,layerId:r.layerId,output:composition.output,contentFile:path.join(outputDir,'content.psb'),hideRoleMarkers,fullCanvas:true,canvasSize:composition.size,name:'[AI-Shoe] '+r.product.sku+' '+r.product.color});}
    catch(e){v.status='candidate';v.applyError=e.message;record(v);throw e;}
    r.revisionHistory=r.revisionHistory||[];r.revisionHistory.push({preview:r.preview,composition:r.composition,written:!!r.written,replacedAt:new Date().toISOString()});
    r.preview=v.preview;r.composition=composition;r.writeResult=result;r.written=true;r.previewValidation='valid';r.phase='written';r.status='新版本已回写，待画面验收';r.revisionCandidate=null;
    p.markersHidden=hideRoleMarkers;p.needsFinalize=!!p.dualRole&&!hideRoleMarkers;
    v.status='applied';v.appliedAt=new Date().toISOString();v.composition=composition;
    try{record(v);}catch(e){v.logWarning=e.message;}
    return v;
  }
  return {generate,apply,discard};
}
module.exports={createRevisions};
