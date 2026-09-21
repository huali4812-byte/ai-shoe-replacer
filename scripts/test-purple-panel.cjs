// Runs the actual panel orchestration with fake DOM/Photoshop/API and real local Python composite.
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),cp=require('child_process'),assert=require('assert');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'purple-panel-'));
const py=path.join(root,'.shoe-vision-venv/bin/python');
const visionFile=path.join(root,baseline?'outputs/purple-review/vision-before.py':'cep/vision.py');
const panelFile=path.join(root,baseline?'outputs/purple-review/panel-before.js':'cep/panel.js');
function python(script,args=[]){return cp.execFileSync(py,['-c',script,...args],{encoding:'utf8'}).trim();}
python("from PIL import Image;import sys;from pathlib import Path;p=Path(sys.argv[1]);Image.new('RGB',(80,80),'white').save(p/'source.png');\nfor i,b in enumerate([(10,10,20,20),(60,60,70,70)]):\n m=Image.new('L',(80,80));m.paste(255,b);m.save(p/f'm{i}.png');Image.new('RGB',(80 if i==0 else 120,80),'red' if i==0 else 'blue').save(p/f'g{i}.png')",[temp]);
function E(tag){this.tag=tag;this.children=[];this.style={};this.value='';this.disabled=false;}
E.prototype.appendChild=function(e){this.children.push(e);return e};E.prototype.replaceChildren=function(...c){this.children=c};E.prototype.add=E.prototype.appendChild;E.prototype.setAttribute=function(k,v){this[k]=v};
const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new E('div'));return els.get(id)};
let generated=0,applied=[],detected=0,composeCalls=0,detectResult=null,apiFailure=false,generationInputs=[];
const vision={request:async req=>{if(req.action==='detect'){detected++;if(detectResult)return detectResult;throw Error('unexpected detection')};composeCalls++;const raw=cp.execFileSync(py,[visionFile],{input:JSON.stringify(req)+'\n',encoding:'utf8'}).trim();const r=JSON.parse(raw);if(!r.ok)throw Error(r.error);return r.data}};
const api={generate:async(input,refs,prompt)=>{generated++;generationInputs.push({input,refs,prompt});if(apiFailure)throw Error('mock no response');python("from PIL import Image;import sys;Image.new('RGB',(80,80),'blue').save(sys.argv[1])",[path.join(temp,'regenerated.png')]);return path.join(temp,'regenerated.png')}};
const context={require:n=>n.endsWith('vision.cjs')?vision:n.endsWith('api.cjs')?api:n.endsWith('workflow.cjs')?{}:n==='os'?{homedir:()=>temp}:require(n),location:{pathname:path.join(root,'cep/index.html')},localStorage:{getItem:()=>null,setItem(){}},document:{body:{dataset:{}},getElementById:get,createElement:t=>new E(t),createTextNode:t=>({tag:'#text',textContent:String(t),children:[]})},Option:function(t,v){this.text=t;this.value=v},window:{confirm:()=>true},console,Date,Set,Map,Promise};
api.analyze=async(files,prompt)=>require('./shoe-evidence-fixture.cjs').analyze(files,prompt);
context.CSInterface=function(){this.evalScript=(script,cb)=>{const m=script.match(/^AI_Shoe_CEP.dispatch\((.*)\)$/),[method,args]=JSON.parse('['+m[1]+']');if(method==='applySmart'){applied.push(args);cb(JSON.stringify({ok:true,data:{layerId:101}}))}else if(method==='saveCopy')cb(JSON.stringify({ok:true,data:{path:'mock.psb'}}));else throw Error('Unexpected Photoshop action '+method)}};
let source=fs.readFileSync(panelFile,'utf8').replace(/  (?:applyTheme\(\);)?render\(\);\n\}\(\)\);/, '  globalThis.testPanel={state,render};\n  render();\n}());');vm.runInNewContext(source,context);
const {state,render}=context.testPanel;
const products={'主推':{sku:'TEST',color:'red',role:'主推'},'次推':{sku:'TEST',color:'blue',role:'次推'}};
function parent(warnings=[]){const t={id:'p',name:'purple',role:'双鞋',dualRole:true,slot:1,layerId:10,documentId:1,product:products['主推'],material:{cutout:path.join(temp,'source.png'),references:[]},roleProducts:products,roleMaterials:{'主推':{cutout:'red',references:[]},'次推':{cutout:'blue',references:[]}},protection:{sourceFile:path.join(temp,'source.png'),roleMarkers:[]},detectionWarnings:warnings,candidateReview:warnings.length?'pending':'clear',rolesConfirmed:true};t.children=['主推','次推'].map((role,i)=>({...t,id:'p-r'+i,role,product:products[role],exported:true,exportBox:[0,0,80,80],visionMask:path.join(temp,'m'+i+'.png'),preview:path.join(temp,'g'+i+'.png'),input:path.join(temp,'source.png'),shoeCount:1,status:'preview'}));return t}
function nodes(e){return [e,...e.children.flatMap(nodes)]};async function click(text){const b=nodes(get('tasks')).find(e=>e.tag==='button'&&e.textContent.includes(text));assert(b,'missing button '+text);assert(!b.disabled);await b.onclick()}
(async()=>{try{
 state.scan={working:true,documentId:1};let t=parent();state.tasks=[t];render();await get('batch').onclick();await get('batch').onclick();
 console.log('B after two batches:',JSON.stringify({generated,applied:applied.length,states:t.children.map(x=>({written:x.written,status:x.status,validation:x.previewValidation}))}));
 if(!baseline){assert.equal(generated,0);assert.equal(applied.length,0);assert.equal(t.children[1].previewValidation,'invalid');
  await click('重新生成区域 2');assert(!t.children[1].preview);assert.equal(t.children[1].previewHistory.length,1);await get('batch').onclick();assert.equal(generated,1);assert.equal(generationInputs[0].refs[0],path.join(temp,'m1.png'));assert(generationInputs[0].prompt.includes('第二张')&&generationInputs[0].prompt.includes('黑色区域'));assert.equal(applied.length,1);assert(applied[0].hideRoleMarkers);assert(t.written);assert(t.children.every(r=>r.written));
 }
 python("from PIL import Image;import sys;Image.new('RGB',(80,80),'blue').save(sys.argv[1])",[path.join(temp,'g1.png')]);
 t=parent(['segmentation_uncertain']);state.tasks=[t];applied=[];await get('batch').onclick();console.log('C:',JSON.stringify({parentWritten:t.written,acceptedWritten:t.acceptedWritten,phase:t.phase,hide:applied[0]?.hideRoleMarkers}));
 if(!baseline){assert(t.acceptedWritten&&!t.written);assert.equal(t.phase,'needs_candidate_review');assert(!applied[0].hideRoleMarkers);const before=generated;await get('batch').onclick();assert.equal(generated,before);assert.equal(applied.length,1);await click('确认跳过候选不是待换鞋');await get('batch').onclick();assert.equal(applied.length,2);assert(!applied[0].hideRoleMarkers);assert(applied[1].hideRoleMarkers);assert(t.written);assert.equal(detected,0)}
 if(!baseline){
  // Explicit local re-detection preserves existing paid previews and never runs generation.
  t=parent(['segmentation_uncertain']);state.tasks=[t];render();
  detectResult={regions:t.children.map(r=>({box:r.exportBox,mask:r.visionMask,role:r.role,input:r.input,shoeCount:1})),detections:[{skip:'segmentation_uncertain'}],preview:'mock-preview.png'};
  const kept=t.children.map(r=>r.preview),calls=generated;
  await click('本地复检候选');assert.deepEqual(t.children.map(r=>r.preview),kept);assert.equal(generated,calls);assert.equal(t.candidateReview,'pending');
  detectResult={...detectResult,regions:[{...detectResult.regions[0],role:'次推'},detectResult.regions[1]]};
  await click('本地复检候选');assert(get('message').textContent.includes('保留全部旧预览'));assert.deepEqual(t.children.map(r=>r.preview),kept);
  // API failures have no usable preview; repeated batch alone must not recharge.
  t=parent();state.tasks=[t];t.children[1].preview=null;apiFailure=true;
  await get('batch').onclick();const failCalls=generated;assert.equal(t.children[1].phase,'no_result');
  await get('batch').onclick();assert.equal(generated,failCalls);
  await click('重新生成区域 2');apiFailure=false;await get('batch').onclick();assert.equal(generated,failCalls+1);assert(t.written);
 }
 if(!baseline){
  // Missing material is a preparation error, not a reason to call paid generation.
  t=parent();state.tasks=[t];t.children[1].preview=null;t.children[1].material={cutout:path.join(temp,'missing.png'),references:[]};
  const before=generated;await get('batch').onclick();assert.equal(generated,before);assert(t.children[1].generationError.includes('ENOENT'));
  // A historical partially-written parent must be allowed to finish using both previews.
  t=parent();state.tasks=[t];t.children[0].written=true;applied=[];
  await get('batch').onclick();assert.equal(applied.length,1);assert(t.children.every(r=>r.written));assert(applied[0].hideRoleMarkers);
 }
 if(!baseline){
  // A cached raw candidate can pass while its final masked composite fails.
  t=parent();state.tasks=[t];applied=[];let reviews=0;
  const originalAnalyze=api.analyze;
  api.analyze=async(files,prompt)=>{const result=await originalAnalyze(files,prompt);if(prompt.startsWith('SHOE_REVIEW_V2')&&prompt.includes('阶段 final')){reviews++;result.shoes[0].checks.pullTab='fail';result.shoes[0].reasons=['residual tab in final composite'];}return result;};
  const paidBefore=generated;await get('batch').onclick();assert.equal(applied.length,1);assert.equal(generated,paidBefore);
  api.analyze=originalAnalyze;
 }
 console.log(baseline?'BASELINE REPRODUCED':'PASS: partial validation, explicit paid retry, cache retention, candidate review and marker finalization');
}finally{fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
