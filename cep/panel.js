(function () {
  const $=id=>document.getElementById(id), cs=new CSInterface();
  let fs,path,os,api,flow,folder,vision;
  try {const req=typeof require==='function'?require:window.cep_node.require;fs=req('fs');path=req('path');os=req('os');folder=path.dirname(decodeURIComponent(location.pathname));api=req(path.join(folder,'api.cjs'));flow=req(path.join(folder,'workflow.cjs'));vision=req(path.join(folder,'vision.cjs'));}
  catch(e){$('message').textContent='无法加载本机模块：'+e.message;return;}
  const state={scan:null,products:[],materials:[],tasks:[],busy:false,targetSku:'',theme:localStorage.getItem('shoe-theme')==='dark'?'dark':'light'};
  function applyTheme(){document.body.dataset.theme=state.theme;$('themeToggle').textContent=state.theme==='dark'?'☀ 白天':'☾ 夜间';}
const VISION_FOLDER=path.join(os.homedir(),'Pictures','AI-Shoe-Vision');
  function host(method,args){return new Promise((resolve,reject)=>cs.evalScript('AI_Shoe_CEP.dispatch('+JSON.stringify(method)+','+JSON.stringify(args||{})+')',raw=>{try{if(!raw||!String(raw).trim())throw Error('Photoshop 未返回结果，可能是脚本异常或插件未重载');const r=JSON.parse(raw);if(!r.ok)throw Error(r.error);resolve(r.data);}catch(e){reject(e);}}));}
  // Presentation state only; never used to decide generation or writeback.
  const expandedTaskPaths=new Set();
  let batchStage='';
  function showBatchStage(text){batchStage=text;message(text);}
  function message(t){$('message').textContent=t;}
  async function act(fn,uiLabel){if(state.busy)return;state.busy=true;if(uiLabel)showBatchStage(uiLabel);try{render();await fn();}catch(e){message('操作失败：'+e.message);}finally{state.busy=false;batchStage='';try{render();}catch(e){message('面板刷新失败：'+e.message);}}}
  function button(text,fn,disabled){const b=document.createElement('button');b.textContent=text;b.disabled=state.busy||disabled;b.onclick=()=>act(fn);return b;}
  let revisions;
  const revisionForms=new Map();
  function revisionService(){
    if(!revisions){const req=typeof require==='function'?require:window.cep_node.require;revisions=req(path.join(folder,'revisions.cjs')).createRevisions({api,vision,host,root:path.join(os.homedir(),'Pictures','AI-Shoe-Revisions')});}
    return revisions;
  }
  function renderRevision(row,parent,r,index){
    if(!r.preview||!r.visionMask||!r.input)return;
    let form=revisionForms.get(r.id);if(!form){form={open:false,reason:'同样条件再试一次',note:''};revisionForms.set(r.id,form);}
    const wrap=document.createElement('details');wrap.className='revision';wrap.open=form.open||!!r.revisionCandidate;wrap.ontoggle=()=>{form.open=wrap.open;};
    const label=document.createElement('summary');label.textContent='效果不满意 · '+r.role+' · '+(r.shoeCount>1?'鞋组 '+(index+1)+'（'+r.shoeCount+' 只一起）':'鞋位 '+(index+1));wrap.appendChild(label);
    const note=document.createElement('p');note.textContent='从换鞋前原图重做；当前结果保留，应用后才替换。版本选择限本次面板会话，文件会保存在本机。';wrap.appendChild(note);
    const candidate=r.revisionCandidate;
    if(candidate){
      const comparison=document.createElement('div');comparison.className='revision-comparison';
      for(const [text,file] of [['当前生成图',r.preview],['新生成图',candidate.preview],['新版本合成预览',candidate.composition.output]]){
        const figure=document.createElement('figure'),caption=document.createElement('figcaption'),img=document.createElement('img');caption.textContent=text;img.alt=text;img.src=(typeof require==='function'?require:window.cep_node.require)('url').pathToFileURL(file).href;figure.appendChild(caption);figure.appendChild(img);comparison.appendChild(figure);
      }
      wrap.appendChild(comparison);
      wrap.appendChild(button('应用新版本',async()=>{await revisionService().apply(parent,r);updateParent(parent);message('新版本已应用，其他已写回鞋位保留。请检查画面并另存 PSB。');},false));
      wrap.appendChild(button('保留当前版本',async()=>{revisionService().discard(r);message('保留当前版本，新生成文件已归档。');},false));
    }else{
      const reason=document.createElement('select');reason.setAttribute('aria-label','重做原因');
      ['同样条件再试一次','鞋款或配色不准确','朝向、姿态不对','边缘、遮挡不自然','返回图正常，仅重新合成','鞋位或角色识别错误'].forEach(text=>{const option=document.createElement('option');option.value=text;option.textContent=text;reason.appendChild(option);});
      reason.value=form.reason;reason.disabled=state.busy;reason.onchange=()=>{form.reason=reason.value;};wrap.appendChild(reason);
      const input=document.createElement('textarea');input.placeholder='可选：补充具体要求';input.setAttribute('aria-label','重做补充要求');input.value=form.note;input.disabled=state.busy;input.oninput=()=>{form.note=input.value;};wrap.appendChild(input);
      wrap.appendChild(button('准备新版本…',async()=>{
        if(form.reason==='鞋位或角色识别错误'){message('请先检查鞋位与主次推标记，可使用本地复检入口。当前结果保留；不自动改角色或调用生成。');return;}
        const local=form.reason==='返回图正常，仅重新合成';
        if(!window.confirm((local?'仅复用当前生成图重新合成，不调用AI；不会自动修正错误蒙版。':'为'+r.role+'区域 '+(index+1)+'（'+(r.shoeCount||1)+' 只鞋）生成一个新版本，可能产生费用。')+'当前结果不会覆盖，生成后需点击应用。是否继续？'))return;
        message(local?'正在本地重新合成…':'正在生成候选版本，当前结果保留…');
        await revisionService().generate(parent,r,{reason:form.reason,note:form.note,local});message('新版本已准备好，请对比后选择应用或保留当前版本。');
      },false));
    }
    row.appendChild(wrap);
  }
  function hasUnreviewedCandidates(t){return !!(t.detectionWarnings&&t.detectionWarnings.length)&&t.candidateReview!=='dismissed';}
  function updateParent(t){
    if(!t.children)return;
    t.acceptedWritten=t.children.length>0&&t.children.every(r=>r.written);
    t.written=t.acceptedWritten&&!hasUnreviewedCandidates(t)&&!t.needsFinalize;
    t.phase=hasUnreviewedCandidates(t)?'needs_candidate_review':t.needsFinalize?'needs_marker_finalize':t.written?'written':t.children.some(r=>r.written)?'partial':'pending';
  }
  function queueRegeneration(t){
    if(t.written)throw Error('已写回区域不能通过此入口重新生成');
    t.previewHistory=t.previewHistory||[];
    if(t.preview)t.previewHistory.push({path:t.preview,error:t.validationError||t.generationError||null,time:new Date().toISOString()});
    t.preview=null;t.previewValidation='unvalidated';t.generationState='queued';t.phase='queued';
    t.status='已明确请求重新生成；下次批量仅生成本区域，可能收费';
  }
  function maskKey(r){return JSON.stringify(r.box||r.exportBox)+'/'+fs.readFileSync(r.mask||r.visionMask).toString('base64')+'/'+r.role;}
  async function retryDetection(t){
    const folder=path.join(path.dirname(t.protection.sourceFile),'review-'+t.id+'-'+Date.now());fs.mkdirSync(folder,{recursive:true});
    const result=await vision.request({action:'detect',source:t.protection.sourceFile,folder,roleMarkers:t.dualRole?t.protection.roleMarkers:null});
    fs.writeFileSync(path.join(folder,'detection.json'),JSON.stringify(result,null,2));
    const key=r=>maskKey({...r,role:r.role||t.role});
    const byKey=new Map((result.regions||[]).map(r=>[key(r),r]));
    // Never attach an old paid preview to a changed mask or silently remove a written shoe.
    if(t.children.some(r=>!byKey.has(key(r))))throw Error('复检改变了已接受鞋位的蒙版或角色；保留全部旧预览，需单独检查，未替换任务');
    const oldKeys=new Set(t.children.map(key)),extra=(result.regions||[]).filter(r=>!oldKeys.has(key(r)));
    const additions=[];
    for(const r of extra){
      const product=t.dualRole?t.roleProducts[r.role]:t.product,material=t.dualRole?t.roleMaterials[r.role]:t.material;
      if(!product||!material)throw Error('新增候选缺少明确款色；保留原任务');
      const child={...t,children:undefined,id:t.id+'-r'+(t.children.length+additions.length),role:r.role||t.role,product,material,visionMask:r.mask,exportBox:r.box,input:r.input,shoeCount:r.shoeCount||1,exported:true,written:false,preview:null,phase:'queued',previewValidation:'unvalidated',status:'新增检测鞋位，待生成'};
      const applied=await host('applyVisionRegion',{id:child.id,layerId:t.layerId,box:r.box,mask:r.mask});
      if(JSON.stringify(applied.box)!==JSON.stringify(r.box))throw Error('新增鞋位坐标不一致');
      additions.push(child);
    }
    t.children.push(...additions);t.detectionWarnings=(result.detections||[]).filter(d=>d.skip).map(d=>d.skip);
    t.detectionPreview=result.preview;t.candidateReview=t.detectionWarnings.length?'pending':'clear';
    t.needsFinalize=!!t.dualRole&&!t.detectionWarnings.length;t.written=false;updateParent(t);
    message('本地复检完成；保留已有预览，新增 '+additions.length+' 个区域；仍待复核 '+t.detectionWarnings.length+' 个候选。');
  }
  function rebuild(){
    if(!state.scan)return;
    state.tasks=[];
    state.scan.tasks.forEach(candidate=>{for(let slot=0;slot<1;slot++){
      const isDisplay=candidate.taskType==='product_display';
      const options=isDisplay?[]:state.products.filter(p=>p.sku.trim()===state.targetSku&&p.role===candidate.role);
      const dualRole=candidate.role==='双鞋';
      const roleProducts={};for(const role of ['主推','次推']){const found=state.products.filter(p=>p.sku.trim()===state.targetSku&&p.role===role);if(found.length===1)roleProducts[role]=found[0];}
      const product= isDisplay?null : dualRole?(roleProducts['主推']&&roleProducts['次推']?roleProducts['主推']:null):(options.length===1?options[0]:null);
      const status=isDisplay?'产品展示：待进入智能对象读取展示行':product?'待素材匹配':candidate.role==='双鞋'?'已跳过：紫色图需要唯一主推和次推款色':options.length>1?'已跳过：Excel 同款同角色存在多个颜色':'已跳过：未选择新货号或所选货号缺少该角色款色';
      state.tasks.push({...candidate,dualRole,roleProducts,id:Date.now()+'-'+candidate.layerId+'-'+slot,slot:slot+1,product,confirmed:false,status});
    }});
    matchAll();
  }
  function displayService(){const req=typeof require==='function'?require:window.cep_node.require;return req(path.join(folder,'product-display.cjs'));}
  async function prepareDisplay(t){
    if(!state.targetSku)throw Error('请先选择新货号');
    const svc=displayService(),materials=await svc.loadMaterials($('libraryPath').value.trim(),state.targetSku);
    if(t.displayRows){t.displayMaterials=materials;t.status='展示素材已重新读取';render();return;}
    const inspection=await host('inspectProductDisplay',t);
    const skuProducts=state.products.filter(p=>p.sku.trim()===state.targetSku);
    const uniqueProducts=[];const seenProducts=new Set();
    for(const p of skuProducts){if(!seenProducts.has(p.id)){seenProducts.add(p.id);uniqueProducts.push(p);}}
    const byDisplayOrder=inspection.rows.length===uniqueProducts.length&&uniqueProducts.length>0;
    t.displayRows=inspection.rows.map((row,index)=>{
      const exact=svc.productsForRow(skuProducts,state.targetSku,row);
      const selected=exact.length===1?exact[0]:(byDisplayOrder?uniqueProducts[index]:null);
      return {...row,productId:selected?selected.id:'',status:row.error||(selected?(exact.length===1?'已按颜色自动匹配':'已按展示顺序自动绑定目标款色'):'待匹配目标款色')};
    });
    t.displayMaterials=materials;
    t.status='展示行已读取；颜色不匹配的行请选择目标款色';render();
  }
  async function applyDisplay(t,dir){
    if(!t.displayRows||!t.displayMaterials)await prepareDisplay(t);
    let writes=0;const svc=displayService();
    for(const row of t.displayRows){if(row.written)continue;try{
      const product=state.products.find(p=>p.id===row.productId&&p.sku.trim()===state.targetSku);
      const plan=svc.makePlan(row,product,t.displayMaterials);svc.verifyPlan(plan);
      row.result=await host('applyProductDisplayRow',{id:t.id,documentId:t.documentId,layerId:t.layerId,plan,contentFile:path.join(dir,t.id+'-row-'+row.id+'-'+Date.now()+'.psb')});
      row.plan=plan;row.written=true;row.status='三视角已回写，待视觉验收';writes++;
    }catch(e){row.status='产品展示待确认：'+e.message;}render();}
    t.written=t.displayRows.length>0&&t.displayRows.every(r=>r.written);
    t.status=t.written?'产品展示全部展示行已回写，待验收':'产品展示部分未完成，请查看各行原因';
    try{fs.writeFileSync(path.join(dir,t.id+'-product-display.json'),JSON.stringify(t,null,2));}catch(e){t.status+='；回写记录保存失败：'+e.message;}return writes;
  }
  async function applyDisplayAI(t,dir){
    if(!t.displayRows||!t.displayMaterials)await prepareDisplay(t);
    let writes=0;const svc=displayService();
    // Recover tasks created by an older panel version: bind rows by order when
    // the report has empty productId values but the SKU has one unique product
    // for each displayed row.
    const skuProducts=state.products.filter(p=>p.sku.trim()===state.targetSku),ordered=[];
    const seen=new Set();for(const p of skuProducts)if(!seen.has(p.id)){seen.add(p.id);ordered.push(p);}
    if(t.displayRows.length===ordered.length&&ordered.length>0){t.displayRows.forEach((row,i)=>{if(!row.productId)row.productId=ordered[i].id;});}
    for(const row of t.displayRows){
      if(row.written)continue;
      try{
        const product=state.products.find(p=>p.id===row.productId&&p.sku.trim()===state.targetSku);
        if(!product)throw Error('请为展示行选择明确目标款色');
        const plan=svc.makePlan(row,product,t.displayMaterials);svc.verifyPlan(plan);
        for(const slot of plan.slots){
          const input=path.join(dir,t.id+'-'+row.id+'-'+slot.id+'-input.png');
          const prepared=await host('prepareProductDisplayAI',{id:t.id,documentId:t.documentId,slotId:slot.id,input});
          const output=await api.generate(input,[slot.file,slot.alphaFile],
            '这是产品展示模块中的鞋部智能对象原图。仅把画面中的鞋替换为 '+product.sku+' '+product.color+'，保持原图画布尺寸、构图、鞋的数量、视角、比例、位置、阴影和白色背景不变；不要生成文字、分隔线或其他产品。目标鞋的颜色、鞋底、Logo和结构严格参考第二张目标鞋图。第三张是透明主体参考，仅用于识别鞋轮廓。',
            {ratio:'1:1'});
          await host('applyProductDisplayAI',{id:prepared.id,documentId:t.documentId,layerId:slot.id,output,canvasSize:prepared.size,contentFile:path.join(dir,t.id+'-'+row.id+'-'+slot.id+'-content.psb'),name:'[AI-Shoe] 产品展示 '+product.color});
        }
        row.written=true;row.status='AI 已回写，待视觉验收';writes++;
      }catch(e){row.status='产品展示 AI 待确认：'+e.message;}
      render();
    }
    t.written=t.displayRows.length>0&&t.displayRows.every(r=>r.written);
    t.status=t.written?'产品展示 AI 全部回写，待验收':'产品展示部分未完成，请查看各行原因';
    try{fs.writeFileSync(path.join(dir,t.id+'-product-display-ai.json'),JSON.stringify(t,null,2));}catch(e){t.status+='；记录保存失败：'+e.message;}
    return writes;
  }
  function matchAll(){state.tasks.forEach(t=>{if(t.region)return;t.material=null;if(!t.product)return;try{t.material=flow.matchMaterial(state.materials,t.product);if(t.dualRole){t.roleMaterials={};for(const role of ['主推','次推'])t.roleMaterials[role]=flow.matchMaterial(state.materials,t.roleProducts[role]);}t.status=t.dualRole?'待读取内部主推／次推标注':'待处理';}catch(e){t.material=null;t.status='已跳过：'+e.message;}});}
  function render(){
    $('batch').disabled=state.busy;
    $('batch').textContent=batchStage?'正在处理…':state.busy?'请等待当前操作…':'开始批量换鞋';
    ['scan','working','excel','library','apiTest','save','diagnostics','bindMaterial','libraryPath','cutout','referenceFiles','materialProduct'].forEach(id=>$(id).disabled=state.busy);
    const locked=state.tasks.some(t=>t.children||t.written||t.displayRows);
    ['targetSku','scan','working','excel','library','libraryPath','bindMaterial'].forEach(id=>$(id).disabled=state.busy||locked);
    $('save').disabled=state.busy||!state.scan||!state.scan.working;
    $('tasks').replaceChildren();
    $('count').textContent=state.tasks.length+' 个鞋位任务';
    state.tasks.forEach(t=>{
      const row=document.createElement('article');row.className='task collapsed';
      const abnormal=!!(t.detectionWarnings&&t.detectionWarnings.length)||!!t.generationError||!!(t.children&&t.children.some(r=>r.generationState==='no_result'||r.previewValidation==='invalid'));
      const toggle=document.createElement('button');toggle.className='task-toggle '+(abnormal?'warning':'normal');toggle.textContent='›';toggle.title=abnormal?'展开异常详情':'展开任务详情';toggle.onclick=()=>{row.classList.toggle('collapsed');toggle.textContent=row.classList.contains('collapsed')?'›':'⌄';};row.appendChild(toggle);
      const fullName=String(t.name||'未命名图层');
      const shortName=fullName.split('/').filter(Boolean).pop()||fullName;
      const title=document.createElement('strong');title.textContent=shortName+' · '+t.role;title.title=fullName;row.appendChild(title);
      const pathDetails=document.createElement('details');pathDetails.className='task-path';pathDetails.open=expandedTaskPaths.has(t.id);
      const pathSummary=document.createElement('summary');pathSummary.textContent='完整图层路径';pathDetails.appendChild(pathSummary);
      const pathText=document.createElement('div');pathText.textContent=fullName;pathDetails.appendChild(pathText);
      pathDetails.ontoggle=()=>{if(pathDetails.open)expandedTaskPaths.add(t.id);else expandedTaskPaths.delete(t.id);};row.appendChild(pathDetails);
      if(t.taskType==='product_display'){
        const info=document.createElement('p');info.textContent=t.status;row.appendChild(info);
        row.appendChild(button('读取展示行与素材',async()=>{await prepareDisplay(t);message(t.status);},!state.scan.working||t.written));
        for(const displayRow of t.displayRows||[]){
          const label=document.createElement('p');label.textContent=displayRow.color+'：'+displayRow.status;row.appendChild(label);
          const select=document.createElement('select');select.setAttribute('aria-label',displayRow.color+' 目标款色');select.add(new Option('请选择明确对应的目标款色',''));
          state.products.filter(p=>p.sku.trim()===state.targetSku).forEach(p=>select.add(new Option(p.color,p.id)));
          select.value=displayRow.productId;select.disabled=state.busy||displayRow.written;select.onchange=()=>{displayRow.productId=select.value;};row.appendChild(select);
        }
        row.appendChild(button('AI 替换产品展示',async()=>{
          const dir=path.join(os.homedir(),'Pictures','AI-Shoe-Preview','display-'+Date.now());fs.mkdirSync(dir,{recursive:true});
          const count=await applyDisplayAI(t,dir);message('产品展示 AI 回写 '+count+' 行；'+t.status+'。请另存 PSB 副本。');
        },!state.scan.working||t.written));
        $('tasks').appendChild(row);return;
      }
      const details=document.createElement('p');details.textContent='图层 '+t.layerId+' · 鞋位 '+t.slot+' ｜区域 '+(t.region?t.region.box.join(', '):(t.children?'已确认 '+t.children.length+' 个区域':t.exportBox?t.exportBox.join(', '):'尚未检测'));row.appendChild(details);
      const assigned=document.createElement('p');assigned.textContent=t.product?'目标：'+t.product.sku+' | '+(t.dualRole?'主推 '+t.roleProducts['主推'].color+' ／次推 '+t.roleProducts['次推'].color:t.product.color+' | '+t.product.role):'目标：无唯一对应款色';row.appendChild(assigned);
      const status=document.createElement('p');status.textContent=(t.children?t.children.map((r,i)=>(r.shoeCount>1?'鞋组 ':'鞋部 ')+(i+1)+(t.dualRole?' '+r.role:'')+'：'+r.status).join('；'):t.status)+(t.detectionWarnings&&t.detectionWarnings.length?'；另有 '+t.detectionWarnings.length+' 个检测候选未通过校验，已跳过':'');row.appendChild(status);
      row.appendChild(button('定位图层',async()=>{await host('selectLayer',t);message('已定位图层，等待鞋位选区');},!state.scan.working||!!t.region));
      if(t.protection&&!t.children&&!t.written&&!t.dualRole){
        row.appendChild(button('手动选择鞋位',async()=>{await host('openSmartTask',t);message('已打开内部工作副本，请选择鞋及必要阴影，再点击确认手动选区');},!state.scan.working));
        row.appendChild(button('确认手动选区',async()=>{const manual=await host('captureManualRegion',t);t.protection=manual;t.exportBox=manual.box;t.visionMask=manual.mask;t.input=manual.input;t.exported=true;t.manualRegion=true;t.status='手动区域已确认，可继续批量换鞋';message(t.status);},!state.scan.working));
      }
      if(t.children){
        const summary=document.createElement('p');summary.textContent=t.phase==='needs_candidate_review'?'整图待检查：跳过候选尚未确认，不等于完成':t.needsFinalize?'待收尾：下次批量仅完成回写及提示隐藏':t.acceptedWritten?'已接受区域全部写回，最终画面待验收':'';row.appendChild(summary);
        t.children.forEach((r,i)=>{if(!r.written&&(r.previewValidation==='invalid'||r.generationState==='no_result'))row.appendChild(button('重新生成区域 '+(i+1),async()=>{if(!window.confirm('仅重新生成这个失败区域；原预览将保留归档，其他结果复用。是否加入下次批量？'))return;queueRegeneration(r);t.written=false;message(r.status);},false));});
        if(hasUnreviewedCandidates(t)){
          const view=document.createElement('details'),label=document.createElement('summary');label.textContent='查看检测图与跳过候选';view.appendChild(label);
          if(t.detectionPreview){const img=document.createElement('img');img.src=t.detectionPreview;img.style.maxWidth='100%';view.appendChild(img);}else{const note=document.createElement('p');note.textContent='旧任务缺少候选图，请先点击本地复检后再检查。';view.appendChild(note);}
          const reasons=document.createElement('p');reasons.textContent=t.detectionWarnings.join('；');view.appendChild(reasons);row.appendChild(view);
          row.appendChild(button('确认跳过候选不是待换鞋',async()=>{if(!window.confirm('请确认所有跳过候选都不是需要换鞋的区域。若包含漏鞋，请取消并使用本地复检。此操作不接受低置信度候选。'))return;t.candidateReview='dismissed';t.candidateReviewedAt=new Date().toISOString();t.needsFinalize=!!t.dualRole;t.written=false;updateParent(t);message('已记录人工复核；下次批量复用全部结果完成收尾，不重新生成。');},false));
          row.appendChild(button('本地复检候选（保留已有预览）',async()=>{await retryDetection(t);},false));
        }
      }
      (t.children||[t]).forEach((r,i)=>renderRevision(row,t,r,i));
      $('tasks').appendChild(row);
    });
  }
  $('working').onclick=()=>act(async()=>{state.scan=await host('createWorking');$('doc').textContent=state.scan.document+' ｜工作副本 ｜'+state.scan.scanned+' 层';rebuild();message('已创建工作副本，原文档保留');});
  $('excel').onchange=e=>{const file=e.target.files[0];if(file)act(async()=>{state.products=[];state.targetSku="";state.materials=[];$("targetSku").replaceChildren(new Option("请选择新货号",""));rebuild();$('materialProduct').replaceChildren();const r=flow.readExcel(file.path);state.products=r.products;Array.from(new Set(r.products.map(p=>p.sku.trim()))).forEach(sku=>$("targetSku").add(new Option(sku,sku)));r.products.forEach(p=>{const label=p.sku+' | '+p.color+' | '+p.role;$('materialProduct').add(new Option(label,p.id));});$('fileName').textContent=file.name+' ｜'+r.products.length+' 款色';rebuild();message(r.warnings.join('；')||'Excel 规则读取完成，已加载 '+r.products.length+' 个目标款色');});};
  $('batch').onclick=()=>act(async()=>{
    if(!state.scan)throw Error('请先扫描 PSB 标记');
    if(!state.scan.working){state.scan=await host('createWorking');rebuild();}
    const ready=state.tasks.filter(t=>t.material&&t.product&&!t.written);
    const displays=state.tasks.filter(t=>t.taskType==='product_display'&&!t.written);
    if(!ready.length&&!displays.length)throw Error('没有待处理的已匹配任务');
    // Window layout is optional; failure must not discard prepared or paid results.
    let comparison;
    try{comparison=await host('arrangeComparison',{documentId:state.scan.documentId});}
    catch(e){comparison={arranged:false,reason:'自动双联垂直未完成：'+e.message};}
    $('doc').textContent=state.scan.document+' ｜工作副本'+(comparison.arranged?' ｜双联垂直':(' ｜'+comparison.reason));
    const dir=path.join(os.homedir(),'Pictures','AI-Shoe-Preview',String(Date.now()));fs.mkdirSync(dir,{recursive:true});
    let displayWrites=0;
    for(const t of displays){try{displayWrites+=await applyDisplayAI(t,dir);}catch(e){t.status='产品展示 AI 待确认：'+e.message;}render();}
    fs.mkdirSync(VISION_FOLDER,{recursive:true});
    const exported=[];
    for(const t of ready){if(t.children){exported.push(...t.children);continue;}if(t.manualRegion){exported.push(t);continue;}try{
      t.input=path.join(dir,t.id+'.png');
      t.status='自动进入智能对象并定位鞋部';showBatchStage('正在定位鞋位 · 图层 '+t.layerId);render();
      t.protection=await host('autoPrepareSmart',{id:t.id,documentId:t.documentId,layerId:t.layerId,dualRole:t.dualRole,diagnostic:path.join(dir,t.id+'-structure.json'),contentFile:path.join(dir,t.id+'-content.psb')});
      if(t.protection.source==='needsVision'){
        // Keep each smart object's masks/crops isolated; the detector uses fixed
        // shoe-0/mask-0 names and concurrent tasks would otherwise overwrite them.
        const visionFolder=path.join(dir,'vision',t.id);
        fs.mkdirSync(visionFolder,{recursive:true});
        t.status='本地检测与分割鞋部（首次加载模型可能较慢）';showBatchStage('正在识别鞋部 · 图层 '+t.layerId+'（首次加载模型可能较慢）');render();
        const visionResult=await vision.request({action:'detect',source:t.protection.sourceFile,folder:visionFolder,roleMarkers:t.dualRole?t.protection.roleMarkers:null});
        fs.writeFileSync(path.join(visionFolder,'detection.json'),JSON.stringify(visionResult,null,2));
        if(!visionResult.regions||!visionResult.regions.length)throw Error('自动检测未找到鞋部：'+(visionResult.status||'unknown'));
        t.detectionWarnings=visionResult.detections.filter(d=>d.skip).map(d=>d.skip);
        t.detectionPreview=visionResult.preview;t.candidateReview=t.detectionWarnings.length?'pending':'clear';
        t.visionRegions=visionResult.regions;
        const children=[];
        for(let i=0;i<visionResult.regions.length;i++){
          const r=visionResult.regions[i];
          const regionTask={...t,role:r.role||t.role,product:t.dualRole?t.roleProducts[r.role]:t.product,material:t.dualRole?t.roleMaterials[r.role]:t.material,id:t.id+'-r'+i,slot:i+1,shoeCount:r.shoeCount||1,visionMask:r.mask,exportBox:r.box,input:r.input,previewValidation:'unvalidated',phase:'queued',exported:true};
          if(!regionTask.product||!regionTask.material)throw Error('鞋位缺少明确的主次推款色');
          const applied=await host('applyVisionRegion',{id:regionTask.id,layerId:t.layerId,box:r.box,mask:r.mask});
          // Photoshop clips a crop to the internal canvas. Use that exact box
          // for export and compositing so an edge shoe cannot be misaligned.
          if(JSON.stringify(applied.box)!==JSON.stringify(r.box))throw Error('Photoshop 裁剪坐标与视觉蒙版不一致，已停止');
          regionTask.exportBox=applied.box;
          children.push(regionTask);
        }
        t.children=children;exported.push(...children);
      }else{
        t.exportBox=t.protection.box;
        t.visionMask=t.protection.regions&&t.protection.regions[0]?t.protection.regions[0].mask:null;
        exported.push(t);
      }
    }catch(e){t.status='导出失败：'+e.message;}render();}
    showBatchStage('正在准备鞋位图像');
    for(const t of exported){if(t.exported)continue;try{await host('exportSmart',{id:t.id,output:t.input});t.exported=true;}catch(e){t.status='区域导出失败：'+e.message;}render();}
    const runnable=exported.filter(t=>t.exported===true);
    let next=0;
    async function worker(){while(next<runnable.length){const t=runnable[next++];if(t.preview||t.written||t.previewValidation==='invalid'||t.generationState==='no_result')continue;try{
      t.generationState='requesting';t.phase='generating';t.status='AI 生成中';render();
      const subject=t.shoeCount>1?'画面中蒙版覆盖的 '+t.shoeCount+' 只原鞋':'原鞋';
      const prompt=(t.dualRole?'第一张图是原始局部画面，第二张是同坐标黑白目标蒙版：仅白色区域中的鞋属于本次'+t.role+'目标，黑色区域内其他人的鞋保持不变；第三张及之后才是目标鞋参考图。蒙版不是鞋款参考，不要把蒙版画进输出。':'第一张图是包含原鞋的局部画面，其余为目标鞋参考图。')+'输出必须是与第一张输入完全相同的正方形画布（1:1），禁止返回3:2或任何横向画布。把'+subject+'全部替换为 '+t.product.sku+' '+t.product.color+'。这是严格的姿态保持任务：逐只新鞋必须与对应原鞋使用完全相同的左右脚、鞋头指向、鞋跟指向、旋转角度、俯仰角、透视和可见鞋底面；原鞋鞋底朝向镜头时新鞋也必须显示鞋底，原鞋从后方或侧后方看到时新鞋也必须从同一方向看到，绝对禁止把侧面参考图直接套成侧面、禁止把鞋底翻转到另一只脚、禁止镜像。输出中必须有且只有 '+(t.shoeCount||1)+' 只新鞋，每只新鞋一一对应原鞋并严格保持原鞋的位置、朝向、大小、透视和遮挡关系，不得增加、删除、移动、镜像或重新排列鞋子。目标鞋的主色、辅色、鞋底颜色、鞋带/织带颜色必须严格以透明主素材和参考图为准，禁止自行补色、改色或套用常见品牌配色。Ginoble/logo 必须保持目标素材中原本的字形、位置、比例和颜色，禁止把 logo 变成蓝色或其他未出现在目标素材中的颜色。鞋面、鞋头、鞋侧和后跟的所有品牌 Logo/字标都属于必须还原的鞋体细节：优先参考对应角度的 Logo 特写，不要用其他角度或文字猜测替代；保持字形、拼写、方向、浮雕/凹陷关系、相对鞋面位置、大小、厚度、边缘清晰度和原本材质明暗。后跟 Logo 只能出现在后跟对应位置，鞋侧凹陷 Logo 只能沿鞋侧曲面透视，禁止把 Logo 移到鞋头、鞋带、提拉环或另一只鞋，禁止生成乱码、镜像、重复或不存在的品牌字样。鞋舌提拉环和后跟提拉环（pull tab）是鞋子的一部分：必须保留原鞋中对应提拉环的数量、位置、连接关系、宽度、长度、厚度和朝向，并严格使用目标鞋素材中的提拉环颜色与织带纹理；目标鞋没有提拉环时禁止新增，目标鞋有提拉环时禁止漏掉、复制、拉长、缩短、移到鞋外或在袜子/裤脚后方凭空生成。提拉环不能被误当作鞋带、鞋舌或另一只鞋。仅改变鞋和必要接触阴影，保持构图、比例、人物、衣物、袜子、背景、文字和未遮挡区域完全不变。';
      const genOpts={taskId:t.id,aspectRatio:'1:1',validateAspect:true};
      t.preview=await api.generate(t.input,(t.dualRole?[t.visionMask]:[]).concat([t.material.cutout],t.material.references),prompt,genOpts);
      t.generationState='received';t.previewValidation='unvalidated';t.phase='unvalidated_preview';t.status='已取得结果，待本地验证';
    }catch(e){t.generationState='no_result';t.generationError=e.message;t.phase='no_result';t.status='未取得可用结果：'+e.message+'；需明确点击重新生成';}render();}}
    // AI 请求最多 7 并发；Photoshop 导出与回写仍保持串行。
    showBatchStage('正在生成换鞋结果，请稍候');
    const concurrency=7;
    showBatchStage('AI 最多 7 并发；Photoshop 串行回写');
    await Promise.all(Array.from({length:concurrency},worker));
    showBatchStage('正在验证生成结果并回写工作副本');
    let written=0,documentWrites=displayWrites;
    const groups=new Map();
    for(const t of exported){const key=t.documentId+'/'+t.layerId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
    for(const all of groups.values()){
      const parent=ready.find(p=>p.documentId===all[0].documentId&&p.layerId===all[0].layerId);
      const pending=all.filter(t=>!t.written&&t.preview&&t.exported&&t.previewValidation!=='invalid');
      if(!pending.length&&!(parent&&parent.needsFinalize))continue;
      try{
        let complete=all.filter(t=>t.preview&&t.exported&&t.previewValidation!=='invalid');
        if(!complete.length)continue;
        const t=complete[0];let output=t.preview,composed=null;
        if(complete.every(x=>x.visionMask)){
          if(all.some(x=>x.protection.sourceFile!==t.protection.sourceFile))throw Error('同一智能对象的原始画布不一致');
          composed=await vision.request({action:'compose_parent',source:t.protection.sourceFile,output:path.join(dir,t.id+'-full-composite.png'),allowPartial:true,requireRoles:!!t.dualRole,transparent:!!t.dualRole,
            // Visible labels stay protected on partial writes; a complete validated
            // transaction hides the separate layers in applySmart with rollback.
            finalizeRoleMarkers:!!t.dualRole&&complete.length===all.length&&!hasUnreviewedCandidates(parent),
            protectedMarkers:t.dualRole?(t.protection.roleMarkers||[]):[],
            protectionRegions:all.map(x=>({box:x.exportBox,mask:x.visionMask,role:x.role})),
            regions:complete.map(x=>({id:x.id,role:x.role,written:!!x.written,box:x.exportBox,mask:x.visionMask,generated:x.preview,output:path.join(dir,x.id+'-composite.png')}))});
          for(const bad of composed.rejected||[]){const r=all.find(x=>x.id===bad.id);r.previewValidation='invalid';r.phase='invalid_preview';r.validationError=bad.error;r.status='预览验证失败：'+bad.error+'；已保留，需明确重新生成';}
          const accepted=new Set(composed.regions.map(r=>r.id));complete=complete.filter(r=>accepted.has(r.id));
          for(const r of complete){r.previewValidation='valid';if(!r.written){r.phase='composable';r.status='本地验证通过，待回写';}}
          if(!composed.output||!complete.length)continue;
          if(!complete.some(r=>!r.written)&&!(parent&&parent.needsFinalize))continue;
          output=composed.output;
        }else if(all.length!==1)throw Error('多区域任务缺少蒙版，禁止整体覆盖');
        const hideRoleMarkers=!!t.dualRole&&complete.length===all.length&&!hasUnreviewedCandidates(parent);
        const result=await host('applySmart',{id:complete[0].id,documentId:t.documentId,layerId:t.layerId,output,contentFile:path.join(dir,t.id+'-'+Date.now()+'-content.psb'),hideRoleMarkers,fullCanvas:!!composed,canvasSize:composed&&composed.size,name:'[AI-Shoe] '+t.product.sku+' '+t.product.color});
        documentWrites++;
        for(const x of complete.filter(x=>!x.written)){x.writeResult=result;x.composition=composed;x.written=true;x.phase='written';x.status='已回写，待画面验收';written++;}
        if(parent){parent.markersHidden=hideRoleMarkers;parent.needsFinalize=false;}
      }catch(e){for(const t of pending){if(t.previewValidation==='invalid')continue;t.writeError=e.message;t.status='未回写：'+e.message;}}
      if(parent)updateParent(parent);render();
    }
    ready.forEach(updateParent);
    const detectedShoes=exported.reduce((n,t)=>n+(Number(t.shoeCount)||0),0);
    const writtenShoes=exported.filter(t=>t.written).reduce((n,t)=>n+(Number(t.shoeCount)||0),0);
    const skippedCandidates=ready.reduce((n,t)=>n+((t.detectionWarnings||[]).length),0);
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({summary:{parentTasks:ready.length,regions:exported.length,detectedShoes,writtenRegions:written,writtenShoes,skippedCandidates,displayWrittenRows:displayWrites},tasks:ready,productDisplays:displays,regions:exported},null,2));
    if(documentWrites){showBatchStage('回写完成，等待另存 PSB 副本');const saved=await host('saveCopy',{documentId:state.scan.documentId});fs.writeFileSync(path.join(dir,'saved-document.json'),JSON.stringify({documentId:state.scan.documentId,document:state.scan.document,saved:saved,time:new Date().toISOString()},null,2));message('鞋位回写 '+written+' 个，产品展示 '+displayWrites+' 行；'+(saved.path||'已取消保存'));}
    else message('生成结果已保留；没有可安全回写的任务。详情：'+path.join(dir,'report.json'));
  },'正在准备批量换鞋…');
  $('themeToggle').onclick=()=>{if(state.busy)return;state.theme=state.theme==='dark'?'light':'dark';localStorage.setItem('shoe-theme',state.theme);applyTheme();message((state.theme==='dark'?'夜间':'白天')+'模式已启用；AI 并发固定为 7，Photoshop 串行回写');};
  $('targetSku').onchange=()=>{state.targetSku=$('targetSku').value;state.materials=[];rebuild();render();message(state.targetSku?'已选择新货号 '+state.targetSku+'，请读取素材库':'已清除新货号选择');};
  async function loadLibrary(){
    if(!state.targetSku)throw Error('请先选择新货号');
    if(!state.scan)throw Error('请先扫描 PSB 标记');
    const products=Array.from(new Map(state.tasks.filter(t=>t.product).flatMap(t=>(t.dualRole?Object.values(t.roleProducts):[t.product]).map(p=>[p.id,p]))).values());
    state.materials=[];matchAll();
    if(!products.length){
      const selected=state.products.filter(p=>p.sku.trim()===state.targetSku);
      const counts=['主推','次推'].map(role=>{const n=selected.filter(p=>p.role===role).length;return role+' '+n+' 条'+(n===0?'（缺少标记）':n>1?'（不唯一）':'');});
      const taskRoles=Array.from(new Set(state.tasks.map(t=>t.role))).join('、');
      message('未检索 Eagle：'+(state.tasks.length?'当前任务需要 '+taskRoles+'；':'没有可处理的标记图层；')+'所选 '+state.targetSku+'：'+counts.join('，')+'；未分配 '+selected.filter(p=>!p.role).length+' 条。请在 Excel 色号文字中用红色标主推、绿色标次推；紫色双人图需要两者各一条。');render();return;
    }
    message('正在检索 '+products.length+' 个已匹配款色');
    state.materials=await flow.indexLibrary($('libraryPath').value.trim(),(n,total)=>message('正在检索 '+n+' / '+total),products);
    matchAll();message('已取得 '+state.materials.length+' 个素材组；请查看任务匹配结果');render();
  }
  $('library').onclick=()=>act(async()=>{if(!state.products.length)throw Error('请先选择 Excel，插件需要用其中的货号检索 Eagle');await loadLibrary();});
  $('scan').onclick=()=>act(async()=>{state.scan=await host('scan');$('doc').textContent=state.scan.document+' ｜扫描 '+state.scan.scanned+' 层 ｜标签 '+JSON.stringify(state.scan.labels)+' ｜读取错误 '+state.scan.errors.length;rebuild();if(state.scan.errors.length)throw Error('存在读取错误，请导出扫描诊断');message('标记扫描完成。'+(state.materials.length?'已读取素材库，请检查任务匹配状态。':'尚未读取素材库，请确认目录后点击“读取素材库”。'));});
  $('bindMaterial').onclick=()=>act(async()=>{const product=state.products.find(p=>p.id===$('materialProduct').value),file=$('cutout').files[0];if(!file)throw Error('请选择透明鞋素材 PNG');flow.registerMaterial($('libraryPath').value.trim(),product,file.path,Array.from($('referenceFiles').files).map(f=>f.path));await loadLibrary();});
  $('apiTest').onclick=()=>act(async()=>{const r=await api.test();message(r.model+'：接口可访问；模型清单'+(r.listed===true?'已列出':r.listed===false?'未列出（不代表生图不可用）':'不可查询（不代表生图不可用）')+'；实际生图仍需服务端通道可用');});
  $('diagnostics').onclick=()=>act(async()=>{if(!state.scan)throw Error('请先扫描');const out=path.join(os.homedir(),'Desktop','shoe-scan-'+Date.now()+'.json');fs.writeFileSync(out,JSON.stringify(state.scan,null,2));message(out);});
  $('save').onclick=()=>act(async()=>{const r=await host('saveCopy',{documentId:state.scan.documentId});message(r.cancelled?'已取消另存':r.path);});
  applyTheme();render();
}());
