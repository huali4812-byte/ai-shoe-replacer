// Reproduce Photoshop's active-layer semantics without opening user documents.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const file=process.argv[2]||'cep/host.jsx';
const source=fs.readFileSync(file,'utf8');
const body=source.slice(source.indexOf('applySmart:function(a){')+'applySmart:'.length,source.indexOf('    exportMarked:function')) .trim().replace(/,$/,'');
const original={id:1,visible:true},parent={id:10,layers:[original],activeLayer:original,activeHistoryState:{}},doc={id:20,activeHistoryState:{}};
const task={parent,doc,layerId:1,parentKey:'10/1'};
const writes=[];
const context={smartTask:()=>task,regionTasks:{r0:{box:[0,0,10,10]},r1:{box:[10,0,20,10]}},app:{activeDocument:parent,refresh(){}},
  actions:{applyPreview(){},saveCopy(){}},documentFor(){},find:(ls,id)=>ls.find(l=>l.id===id),smartTaskParents:{'10/1':task},
  s:x=>x,c:x=>x,File:function(x){this.path=x;},ActionDescriptor:function(){this.putPath=()=>{};},DialogModes:{NO:0},
  executeAction(action){if(action==='placedLayerMakeCopy'){const copy={id:2,visible:true};parent.layers.push(copy);parent.activeLayer=copy;}else if(action==='placedLayerReplaceContents')writes.push(parent.activeLayer.id);}};
const apply=vm.runInNewContext('('+body+')',context);
apply({id:'r0',contentFile:'first.psb'});
apply({id:'r1',contentFile:'second.psb'});
assert.deepEqual(writes,[2,2],'Both regions must replace the visible copy, never the hidden original');
assert.equal(parent.layers.length,2);
assert.equal(original.visible,false);
console.log('PASS: two regions replace the same visible smart-object copy');
