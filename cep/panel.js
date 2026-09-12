(function () {
  const $=id=>document.getElementById(id), cs=new CSInterface();
  let fs,path,os,api,flow,folder,vision;
  try {const req=typeof require==='function'?require:window.cep_node.require;fs=req('fs');path=req('path');os=req('os');folder=path.dirname(decodeURIComponent(location.pathname));api=req(path.join(folder,'api.cjs'));flow=req(path.join(folder,'workflow.cjs'));vision=req(path.join(folder,'vision.cjs'));}
  catch(e){$('message').textContent='无法加载本机模块：'+e.message;return;}
  const state={scan:null,products:[],materials:[],tasks:[],busy:false,targetSku:''};
const VISION_FOLDER=path.join(os.homedir(),'Pictures','AI-Shoe-Vision');
  function host(method,args){return new Promise((resolve,reject)=>cs.evalScript('AI_Shoe_CEP.dispatch('+JSON.stringify(method)+','+JSON.stringify(args||{})+')',raw=>{try{const r=JSON.parse(raw);if(!r.ok)throw Error(r.error);resolve(r.data);}catch(e){reject(e);}}));}
  function message(t){$('message').textContent=t;}
  async function act(fn){if(state.busy)return;state.busy=true;try{render();await fn();}catch(e){message('操作失败：'+e.message);}finally{state.busy=false;try{render();}catch(e){message('面板刷新失败：'+e.message);}}}
  function button(text,fn,disabled){const b=document.createElement('button');b.textContent=text;b.disabled=state.busy||disabled;b.onclick=()=>act(fn);return b;}
  function rebuild(){
    if(!state.scan)return;
    state.tasks=[];
    state.scan.tasks.forEach(candidate=>{for(let slot=0;slot<1;slot++){
      const options=state.products.filter(p=>p.sku.trim()===state.targetSku&&p.role===candidate.role);
      const product=candidate.role!=='双鞋'&&options.length===1?options[0]:null;
      state.tasks.push({...candidate,id:Date.now()+'-'+candidate.layerId+'-'+slot,slot:slot+1,product,confirmed:false,status:product?'待素材匹配':candidate.role==='双鞋'?'已跳过：紫色双人款暂不处理':options.length>1?'已跳过：Excel 同款同角色存在多个颜色':'已跳过：未选择新货号或所选货号缺少该角色款色'});
    }});
    matchAll();
  }
  function matchAll(){state.tasks.forEach(t=>{if(t.region)return;t.material=null;if(!t.product)return;try{t.material=flow.matchMaterial(state.materials,t.product);t.status='待处理';}catch(e){t.status='已跳过：'+e.message;}});}
  function render(){
    ['scan','working','excel','library','apiTest','save','diagnostics','bindMaterial','libraryPath','cutout','referenceFiles','materialProduct'].forEach(id=>$(id).disabled=state.busy);
    const locked=state.tasks.some(t=>t.children||t.written);
    ['targetSku','scan','working','excel','library','libraryPath','bindMaterial'].forEach(id=>$(id).disabled=state.busy||locked);
    $('save').disabled=state.busy||!state.scan||!state.scan.working;
    $('tasks').replaceChildren();
    $('count').textContent=state.tasks.length+' 个鞋位任务';
    state.tasks.forEach(t=>{
      const row=document.createElement('article');row.className='task';
      const title=document.createElement('strong');title.textContent=t.name+' · '+t.role+' · 鞋位 '+t.slot;row.appendChild(title);
      const details=document.createElement('p');details.textContent='图层 '+t.layerId+' ｜区域 '+(t.region?t.region.box.join(', '):'未确认');row.appendChild(details);
      const assigned=document.createElement('p');assigned.textContent=t.product?'目标：'+t.product.sku+' | '+t.product.color+' | '+t.product.role:'目标：无唯一对应款色';row.appendChild(assigned);
      const status=document.createElement('p');status.textContent=(t.children?t.children.map((r,i)=>(r.shoeCount>1?'鞋组 ':'鞋部 ')+(i+1)+'：'+r.status).join('；'):t.status)+(t.detectionWarnings&&t.detectionWarnings.length?'；另有 '+t.detectionWarnings.length+' 个检测候选未通过校验，已跳过':'');row.appendChild(status);
      row.appendChild(button('定位图层',async()=>{await host('selectLayer',t);message('已定位图层，等待鞋位选区');},!state.scan.working||!!t.region));
      $('tasks').appendChild(row);
    });
  }
  $('working').onclick=()=>act(async()=>{state.scan=await host('createWorking');$('doc').textContent=state.scan.document+' ｜工作副本 ｜'+state.scan.scanned+' 层';rebuild();message('已创建工作副本，原文档保留');});
  $('excel').onchange=e=>{const file=e.target.files[0];if(file)act(async()=>{state.products=[];state.targetSku="";state.materials=[];$("targetSku").replaceChildren(new Option("请选择新货号",""));rebuild();$('materialProduct').replaceChildren();const r=flow.readExcel(file.path);state.products=r.products;Array.from(new Set(r.products.map(p=>p.sku.trim()))).forEach(sku=>$("targetSku").add(new Option(sku,sku)));r.products.forEach(p=>{const label=p.sku+' | '+p.color+' | '+p.role;$('materialProduct').add(new Option(label,p.id));});$('fileName').textContent=file.name+' ｜'+r.products.length+' 款色';rebuild();message(r.warnings.join('；')||'Excel 规则读取完成，已加载 '+r.products.length+' 个目标款色');});};
  $('batch').onclick=()=>act(async()=>{
    if(!state.scan)throw Error('请先扫描 PSB 标记');
    if(!state.scan.working){state.scan=await host('createWorking');rebuild();}
    const ready=state.tasks.filter(t=>t.material&&t.product&&!t.written);
    if(!ready.length)throw Error('没有待生成的已匹配任务');
    const dir=path.join(os.homedir(),'Pictures','AI-Shoe-Preview',String(Date.now()));fs.mkdirSync(dir,{recursive:true});
    fs.mkdirSync(VISION_FOLDER,{recursive:true});
    const exported=[];
    for(const t of ready){if(t.children){exported.push(...t.children);continue;}try{
      t.input=path.join(dir,t.id+'.png');
      t.status='自动进入智能对象并定位鞋部';render();
      t.protection=await host('autoPrepareSmart',{id:t.id,documentId:t.documentId,layerId:t.layerId,diagnostic:path.join(dir,t.id+'-structure.json'),contentFile:path.join(dir,t.id+'-content.psb')});
      if(t.protection.source==='needsVision'){
        // Keep each smart object's masks/crops isolated; the detector uses fixed
        // shoe-0/mask-0 names and concurrent tasks would otherwise overwrite them.
        const visionFolder=path.join(dir,'vision',t.id);
        fs.mkdirSync(visionFolder,{recursive:true});
        t.status='本地检测与分割鞋部（首次加载模型可能较慢）';render();
        const visionResult=await vision.request({action:'detect',source:t.protection.sourceFile,folder:visionFolder});
        fs.writeFileSync(path.join(visionFolder,'detection.json'),JSON.stringify(visionResult,null,2));
        if(!visionResult.regions||!visionResult.regions.length)throw Error('自动检测未找到鞋部：'+(visionResult.status||'unknown'));
        t.detectionWarnings=visionResult.detections.filter(d=>d.skip).map(d=>d.skip);
        t.visionRegions=visionResult.regions;
        const children=[];
        for(let i=0;i<visionResult.regions.length;i++){
          const r=visionResult.regions[i];
          const regionTask={...t,id:t.id+'-r'+i,slot:i+1,shoeCount:r.shoeCount||1,visionMask:r.mask,exportBox:r.box,input:r.input,exported:true};
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
    for(const t of exported){if(t.exported)continue;try{await host('exportSmart',{id:t.id,output:t.input});t.exported=true;}catch(e){t.status='区域导出失败：'+e.message;}render();}
    const runnable=exported.filter(t=>t.exported===true);
    let next=0;
    async function worker(){while(next<runnable.length){const t=runnable[next++];if(t.preview||t.written)continue;try{
      t.status='AI 生成中';render();
      const subject=t.shoeCount>1?'画面中蒙版覆盖的 '+t.shoeCount+' 只原鞋':'原鞋';
      const prompt='第一张图是包含原鞋的局部画面，其余为目标鞋参考图。把'+subject+'全部替换为 '+t.product.sku+' '+t.product.color+'。这是严格的姿态保持任务：逐只新鞋必须与对应原鞋使用完全相同的左右脚、鞋头指向、鞋跟指向、旋转角度、俯仰角、透视和可见鞋底面；原鞋鞋底朝向镜头时新鞋也必须显示鞋底，原鞋从后方或侧后方看到时新鞋也必须从同一方向看到，绝对禁止把侧面参考图直接套成侧面、禁止把鞋底翻转到另一只脚、禁止镜像。输出中必须有且只有 '+(t.shoeCount||1)+' 只新鞋，每只新鞋一一对应原鞋并严格保持原鞋的位置、朝向、大小、透视和遮挡关系，不得增加、删除、移动、镜像或重新排列鞋子。目标鞋的主色、辅色、鞋底颜色、鞋带/织带颜色必须严格以透明主素材和参考图为准，禁止自行补色、改色或套用常见品牌配色。Ginoble/logo 必须保持目标素材中原本的字形、位置、比例和颜色，禁止把 logo 变成蓝色或其他未出现在目标素材中的颜色。仅改变鞋和必要接触阴影，保持构图、比例、人物、衣物、袜子、背景、文字和未遮挡区域完全不变。';
      t.preview=await api.generate(t.input,[t.material.cutout].concat(t.material.references),prompt,{taskId:t.id,aspectRatio:'1:1'});
      t.status='已生成，待保护回写';
    }catch(e){t.status='生成失败：'+e.message;}render();}}
    await Promise.all([worker(),worker(),worker(),worker()]);
    let written=0;
    const groups=new Map();
    for(const t of exported){const key=t.documentId+'/'+t.layerId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
    for(const all of groups.values()){
      const pending=all.filter(t=>!t.written);if(!pending.length)continue;
      try{
        if(all.some(t=>!t.preview||!t.exported))throw Error('同一智能对象仍有区域未生成，保留结果等待补齐');
        const t=all[0];
        let output=t.preview,composed=null;
        if(all.every(x=>x.visionMask)){
          if(all.some(x=>x.protection.sourceFile!==t.protection.sourceFile))throw Error('同一智能对象的原始画布不一致');
          composed=await vision.request({action:'compose_parent',source:t.protection.sourceFile,output:path.join(dir,t.id+'-full-composite.png'),regions:all.map(x=>({box:x.exportBox,mask:x.visionMask,generated:x.preview,output:path.join(dir,x.id+'-composite.png')}))});
          output=composed.output;
        }else if(all.length!==1)throw Error('多区域任务缺少蒙版，禁止整体覆盖');
        const result=await host('applySmart',{id:t.id,documentId:t.documentId,layerId:t.layerId,output,contentFile:path.join(dir,t.id+'-'+Date.now()+'-content.psb'),fullCanvas:!!composed,canvasSize:composed&&composed.size,name:'[AI-Shoe] '+t.product.sku+' '+t.product.color});
        for(const x of pending){x.writeResult=result;x.composition=composed;x.written=true;x.status='已整体回写，待画面验收';written++;}
      }catch(e){for(const t of pending)t.status='未回写：'+e.message;}
      render();
    }
    ready.forEach(t=>{if(t.children)t.written=t.children.every(r=>r.written);});
    const detectedShoes=exported.reduce((n,t)=>n+(Number(t.shoeCount)||0),0);
    const writtenShoes=exported.filter(t=>t.written).reduce((n,t)=>n+(Number(t.shoeCount)||0),0);
    const skippedCandidates=ready.reduce((n,t)=>n+((t.detectionWarnings||[]).length),0);
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({summary:{parentTasks:ready.length,regions:exported.length,detectedShoes,writtenRegions:written,writtenShoes,skippedCandidates},tasks:ready,regions:exported},null,2));
    if(written){const saved=await host('saveCopy',{documentId:state.scan.documentId});fs.writeFileSync(path.join(dir,'saved-document.json'),JSON.stringify({documentId:state.scan.documentId,document:state.scan.document,saved:saved,time:new Date().toISOString()},null,2));message('回写 '+written+' 张；'+(saved.path||'已取消保存'));}
    else message('生成结果已保留；没有可安全回写的任务。详情：'+path.join(dir,'report.json'));
  });
  $('targetSku').onchange=()=>{state.targetSku=$('targetSku').value;state.materials=[];rebuild();render();message('已切换新货号，请检索素材；红标主推、绿标次推');};
  async function loadLibrary(){
    if(!state.targetSku)throw Error('请先选择新货号');
    if(!state.scan)throw Error('请先扫描 PSB 标记');
    const products=Array.from(new Map(state.tasks.filter(t=>t.product).map(t=>[t.product.id,t.product])).values());
    state.materials=[];matchAll();
    if(!products.length){message('全部跳过：所选新货号没有适用于当前标记的唯一款色；未调用 Eagle');render();return;}
    message('正在检索 '+products.length+' 个已匹配款色');
    state.materials=await flow.indexLibrary($('libraryPath').value.trim(),(n,total)=>message('正在检索 '+n+' / '+total),products);
    matchAll();message('已取得 '+state.materials.length+' 个素材组；请查看任务匹配结果');render();
  }
  $('library').onclick=()=>act(async()=>{if(!state.products.length)throw Error('请先选择 Excel，插件需要用其中的货号检索 Eagle');await loadLibrary();});
  $('scan').onclick=()=>act(async()=>{state.scan=await host('scan');$('doc').textContent=state.scan.document+' ｜扫描 '+state.scan.scanned+' 层 ｜标签 '+JSON.stringify(state.scan.labels)+' ｜读取错误 '+state.scan.errors.length;rebuild();if(state.scan.errors.length)throw Error('存在读取错误，请导出扫描诊断');message('标记扫描完成。'+(state.materials.length?'已读取素材库，请检查任务匹配状态。':'尚未读取素材库，请确认目录后点击“读取素材库”。'));});
  $('bindMaterial').onclick=()=>act(async()=>{const product=state.products.find(p=>p.id===$('materialProduct').value),file=$('cutout').files[0];if(!file)throw Error('请选择透明鞋素材 PNG');flow.registerMaterial($('libraryPath').value.trim(),product,file.path,Array.from($('referenceFiles').files).map(f=>f.path));await loadLibrary();});
  $('apiTest').onclick=()=>act(async()=>{const r=await api.test();message(r.model+'：接口连通，/v1/chat/completions；尚未验证本次任务出图');});
  $('diagnostics').onclick=()=>act(async()=>{if(!state.scan)throw Error('请先扫描');const out=path.join(os.homedir(),'Desktop','shoe-scan-'+Date.now()+'.json');fs.writeFileSync(out,JSON.stringify(state.scan,null,2));message(out);});
  $('save').onclick=()=>act(async()=>{const r=await host('saveCopy',{documentId:state.scan.documentId});message(r.cancelled?'已取消另存':r.path);});
  render();
}());
