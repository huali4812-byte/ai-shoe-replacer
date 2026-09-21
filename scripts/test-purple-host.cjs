// Photoshop behavior is mocked: verifies control flow, not Photoshop rendering/history fidelity.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const source=fs.readFileSync(path.join(root,baseline?'outputs/purple-review/host-before.jsx':'cep/host.jsx'),'utf8');
const body=source.slice(source.indexOf('applySmart:function(a){')+'applySmart:'.length,source.indexOf('    exportMarked:function')).trim().replace(/,$/,'');
function run(failure,restoreFailure,hide=false,clipped=true,settleMode='normal'){
 const group={id:50,opacity:40,hasMask:true},original={id:1,visible:true,grouped:clipped};let moved=0,restores=[],active;
 const marker={id:22,visible:true,parent:group,grouped:true,move(){moved++;this.parent=doc}};
 const parent={id:10,layers:[original],activeLayer:original},doc={id:20,layers:[marker]};
 let task={parent,doc,layerId:1,parentKey:'10/1',roleMarkers:[{id:22}]};
 for(const [d,name] of [[doc,'internal'],[parent,'parent']])Object.defineProperty(d,'activeHistoryState',{get:()=>({name}),set:()=>{restores.push(name);if(restoreFailure===name)throw Error(name+' restore fault');if(name==='internal'){marker.visible=true;marker.parent=group;}else{original.visible=true;parent.layers=[original];}}});
 const context={smartTask:()=>task,regionTasks:{r:{box:[0,0,20,20]}},app:{get activeDocument(){return active},set activeDocument(d){active=d},refresh(){}},actions:{applyPreview(){if(failure==='preview')throw Error('preview fault')},saveCopy(){if(failure==='save')throw Error('save fault')}},documentFor(){},find:(ls,id)=>failure==='marker'&&ls===doc.layers?null:ls.find(l=>l.id===id),smartTaskParents:{'10/1':task},s:x=>x,c:x=>x,File:function(){},ActionDescriptor:function(){this.putPath=()=>{}},DialogModes:{NO:0},ElementPlacement:{PLACEATBEGINNING:1},executeAction(a){if(a==='placedLayerMakeCopy'){const copy={id:2,visible:true,move(){this.grouped=false;if(failure==='move')throw Error('move fault')}};let value=!clipped,writes=0;
 Object.defineProperty(copy,'grouped',{get:()=>value,set:v=>{writes++;if(settleMode==='permanent')return;if(settleMode==='delayed'&&writes<=3)return;value=v;}});
 parent.layers.push(copy);parent.activeLayer=copy;if(failure==='copy')throw Error('copy fault')}else {parent.activeLayer.grouped=false;if(failure==='replace')throw Error('replace fault')}}};
 const apply=vm.runInNewContext('('+body+')',context);let error;
 try{apply({id:'r',contentFile:'never-written.psb',hideRoleMarkers:hide})}catch(e){error=e.message}
 return {error,moved,restores,marker,group,original,task,parent};
}
const failed=run('save','internal');console.log('E internal restore failure:',JSON.stringify({error:failed.error,restores:failed.restores}));
const partial=run();console.log('E partial marker:',JSON.stringify({moved:partial.moved,sameParent:partial.marker.parent===partial.group}));
if(!baseline){
 assert.match(source,/roleTextLayers:roleTextLayers/);
 assert.match(source,/normalizedText:text/);
 assert.match(source,/recognizedRole:role/);
 assert.match(source,/roleAssignmentMode=markerPlan\.random\?'stable_random':'text_coordinates'/);
 assert.match(source,/roleAssignmentMode='invalid_markers'/);
 const planText=source.slice(source.indexOf('  function dualRoleMarkerPlan('),source.indexOf('  function identityDisplayWarp('));
 const planCtx={};vm.runInNewContext(planText,planCtx);
 const random0=planCtx.dualRoleMarkerPlan([],null,.2);assert.equal(random0.random,true);assert.equal(random0.mainPair,0);
 const stable=planCtx.dualRoleMarkerPlan([],random0.mainPair,.9);assert.equal(stable.mainPair,0,'retry must retain the original random role assignment');
 assert.equal(planCtx.dualRoleMarkerPlan([],null,.8).mainPair,1);
 const marked=planCtx.dualRoleMarkerPlan([{role:'主推'},{role:'次推'}],1,.2);assert.equal(marked.random,false);assert.equal(marked.mainPair,null);
 assert.throws(()=>planCtx.dualRoleMarkerPlan([{role:'主推'}],null,.2),/同时保留各一个标记，或同时删除/);
 assert.throws(()=>planCtx.dualRoleMarkerPlan([{role:'主推'},{role:'主推'}],null,.2),/不完整或重复/);
 assert.deepEqual(failed.restores,['internal','parent']);assert(failed.task.recoveryBlocked);assert(failed.original.visible);assert(failed.error.includes('save fault')&&failed.error.includes('回滚未完成'));
 assert.equal(partial.parent.activeLayer.grouped,true);
 assert.equal(partial.moved,0);assert.equal(partial.marker.parent,partial.group);assert.equal(partial.marker.grouped,true);assert.equal(partial.group.opacity,40);assert(partial.marker.visible);
 const unclipped=run(null,null,false,false);assert.equal(unclipped.parent.activeLayer.grouped,false);
 for(const clipped of [true,false]){const delayed=run(null,null,false,clipped,'delayed');assert(!delayed.error,delayed.error);assert.equal(delayed.parent.activeLayer.grouped,clipped);assert(!delayed.original.visible);
 const permanent=run(null,null,false,clipped,'permanent');assert.match(permanent.error,/已恢复3次/);assert.deepEqual(permanent.restores,['internal','parent']);assert(permanent.original.visible);}
 const success=run(null,null,true);assert(!success.marker.visible);assert.equal(success.marker.parent,success.group);
 for(const point of ['preview','marker','save','copy','replace','move']){const r=run(point);assert(r.error);assert.deepEqual(r.restores,['internal','parent']);assert(r.original.visible);assert(r.marker.visible);assert.equal(r.task.parentTargetId,undefined);assert(!r.task.recoveryBlocked);}
 const rp=run('replace','parent');assert.deepEqual(rp.restores,['internal','parent']);assert(rp.task.recoveryBlocked);
 const lookup=source.slice(source.indexOf('  function smartTask('),source.indexOf('  function json('));
 const c={smartTasks:{p:failed.task}};vm.runInNewContext(lookup,c);assert.throws(()=>c.smartTask('p-r0'),/锁定/);
 console.log('PASS: zero labels enable stable random roles; partial/duplicate labels stop; marker transactions remain safe');
}else console.log('BASELINE REPRODUCED');
