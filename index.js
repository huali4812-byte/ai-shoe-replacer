const { app, core, action, constants } = require('photoshop');
const { storage } = require('uxp');
const { parseWorkbook, layerRole, matchProduct } = require('./rules.js');
const $ = id => document.getElementById(id);
const state = { products:[], warnings:[], tasks:[], docId:null, running:false, paused:false, busy:false };
const msg = text => { $('message').textContent = text; };
function doc() {
  if (!app.documents.length) throw new Error('请在 Photoshop 中打开 PSB');
  return app.activeDocument;
}
function sameDoc() {
  const d=doc();
  if (d.id!==state.docId) throw new Error('文档已切换，请切回扫描的文档或重新扫描');
  return d;
}
function controls() {
  ['scan','pickExcel'].forEach(id=>$(id).disabled=state.busy||state.running);
  $('start').disabled=state.busy||state.running||!state.tasks.length||state.tasks.every(t=>t.done);
  $('pause').disabled=!state.running;
  $('report').disabled=state.busy||!state.tasks.length;
}
function render() {
  $('tasks').innerHTML='';
  state.tasks.forEach(t=>{
    const row=document.createElement('div'); row.className='task';
    const title=document.createElement('div'); title.className='task-title';
    title.textContent=`${t.name} · ${t.role==='双鞋'?'紫色 / 两双':t.role==='主推'?'红色 / 主推':'绿色 / 次推'}`;
    row.appendChild(title);
    const detail=document.createElement('p'); detail.textContent=t.status; row.appendChild(detail);
    t.targets.forEach((target,slot)=>{
      const select=document.createElement('select');
      const blank=document.createElement('option'); blank.value=''; blank.textContent=t.targets.length===2?`第 ${slot+1} 双：请选择款色`:'请选择目标款色'; select.appendChild(blank);
      state.products.forEach(p=>{
        const option=document.createElement('option'); option.value=p.id;
        option.textContent=`${p.sku} | ${p.color} | ${p.role||'主次推未明'}`;
        select.appendChild(option);
      });
      select.value=target; select.disabled=t.done||state.running;
      select.onchange=()=>{t.targets[slot]=select.value;t.approved=false;t.status='待确认款色';};
      row.appendChild(select);
    });
    const confirm=document.createElement('button'); confirm.textContent=t.approved?'已确认':'确认款色';
    confirm.disabled=t.done||state.running;
    confirm.onclick=()=>{
      if(t.targets.some(x=>!x)){msg('请先选择每一双鞋的款色');return;}
      t.approved=true;t.status='款色已确认，待创建测试层';render();
    };row.appendChild(confirm);$('tasks').appendChild(row);
  });
  $('taskCount').textContent=`${state.tasks.length} 个标色图层 · ${state.tasks.reduce((sum,t)=>sum+t.targets.length,0)} 个测试位置`;
  controls();
}
async function importExcel() {
  const file=await storage.localFileSystem.getFileForOpening({types:['xlsx'],allowMultiple:false});
  if(!file)return;
  const parsed=parseWorkbook(await file.read({format:storage.formats.binary}));
  state.products=parsed.products;state.warnings=parsed.warnings;state.tasks=[];state.docId=null;
  $('excelName').textContent=file.name;
  $('rulesInfo').textContent=`${parsed.products.length} 个款色 · ${parsed.warnings.length} 项需留意`;
  msg(parsed.warnings.join('；')||'Excel 已解析');render();
}
async function scan() {
  const d=doc();
  if(!state.products.length)throw new Error('请先导入 Excel');
  $('docStatus').textContent=`${d.title} · ${d.width} × ${d.height}`;
  const all=[];
  function walk(layers,parentPath,parentId,visible) {
    for(const layer of layers){
      if(layer.name.startsWith('[换鞋测试]'))continue;
      const entry={id:layer.id,name:layer.name,path:parentPath+'/'+layer.name,parentId,visible:visible&&layer.visible,kind:layer.kind,group:layer.kind===constants.LayerKind.GROUP};
      all.push(entry);
      if(entry.group)walk(layer.layers,entry.path,layer.id,entry.visible);
    }
  }
  walk(d.layers,d.title,null,true);
  const colorById={};
  for(let i=0;i<all.length;i+=40){
    if(doc().id!==d.id)throw new Error('扫描期间文档已切换');
    const batch=all.slice(i,i+40);
    const values=await action.batchPlay(batch.map(l=>({_obj:'get',_target:[{_property:'color'},{_ref:'layer',_id:l.id},{_ref:'document',_id:d.id}],_options:{dialogOptions:'dontDisplay'}})),{});
    values.forEach((v,j)=>{if(v._obj==='error')throw new Error(v.message||'读取图层标色失败');colorById[batch[j].id]=layerRole(v.color);});
  }
  const roles={};const tasks=[];
  for(const l of all){
    roles[l.id]=colorById[l.id]||roles[l.parentId]||'';
    if(!l.visible||l.group||!roles[l.id])continue;
    if(![constants.LayerKind.NORMAL,constants.LayerKind.SMARTOBJECT].includes(l.kind))continue;
    const role=roles[l.id];
    const matches=role==='双鞋'?[]:matchProduct(state.products,l.path,role);
    const auto=matches.length===1;
    tasks.push({...l,role,targets:role==='双鞋'?['','']:[auto?matches[0].id:''],approved:auto,done:false,status:auto?'按货号与标色匹配':'等待确认款色'});
  }
  state.tasks=tasks;state.docId=d.id;
  $('progressBar').style.width='0%';$('progressText').textContent='尚未创建测试图层';render();
  msg(tasks.length?'已扫描可见的标色像素层和智能对象；尚未进行图像鞋位识别':'未找到可见的红、绿、紫色像素层或智能对象');
}
async function createTestGroups() {
  const d=sameDoc();state.running=true;state.paused=false;render();
  try {
    for(const t of state.tasks){
      if(t.done)continue;
      if(state.paused){msg('已暂停，点击创建测试图层可继续');break;}
      if(!t.approved||t.targets.some(id=>!state.products.some(p=>p.id===id))){
        t.status='等待确认款色';msg(`${t.name} 需要确认款色，确认后点击创建测试图层继续`);break;
      }
      await core.executeAsModal(async context=>{
        sameDoc();
        const suspension=await context.hostControl.suspendHistory({documentID:d.id,name:'创建换鞋测试位置'});
        try {
          for(let slot=0;slot<t.targets.length;slot++){
            const product=state.products.find(p=>p.id===t.targets[slot]);
            const group=await d.createLayerGroup({name:`[换鞋测试] ${t.id}-${slot+1} ${product.sku} ${product.color}`});
            const layer=await d.createLayer({name:`空白占位 - 原图层 ${t.id} - 未生成鞋子`});
            await layer.move(group,constants.ElementPlacement.PLACEINSIDE);
          }
          await context.hostControl.resumeHistory(suspension);
        }catch(e){await context.hostControl.resumeHistory(suspension,false);throw e;}
      },{commandName:'创建换鞋测试图层'});
      t.done=true;t.status='独立测试图层已创建';
      $('progressBar').style.width=`${state.tasks.filter(x=>x.done).length/state.tasks.length*100}%`;
    }
    $('progressText').textContent=state.tasks.every(t=>t.done)?'测试图层创建完成，鞋子图像未修改':'测试执行已暂停';
  }finally{state.running=false;state.paused=false;render();}
}
async function exportReport() {
  const file=await storage.localFileSystem.getFileForSaving('换鞋任务报告.json',{types:['json']});
  if(!file)return;
  await file.write(JSON.stringify({mode:'local-workflow-test',aiConnected:false,documentId:state.docId,warnings:state.warnings,tasks:state.tasks.map(t=>({...t,targets:t.targets.map(id=>state.products.find(p=>p.id===id)||null)}))},null,2));
  msg('任务报告已保存');
}
function bind(id,fn){$(id).onclick=async()=>{
  if(state.busy)return;
  state.busy=true;controls();
  try{await fn();}catch(e){msg(`错误：${e.message||e}`);console.error(e);}
  finally{state.busy=false;controls();}
};}
bind('pickExcel',importExcel);bind('scan',scan);bind('start',createTestGroups);bind('report',exportReport);
$('pause').onclick=()=>{state.paused=true;msg('将在当前图层完成后暂停');};
controls();
try{const d=doc();$('docStatus').textContent=`${d.title} · ${d.width} × ${d.height}`;}catch(e){msg(e.message);}
