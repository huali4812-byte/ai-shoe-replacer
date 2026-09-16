const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require.resolve('../cep/host.jsx'),'utf8');
const helpers=src.slice(src.indexOf('  function sameBox'),src.indexOf('  function documentFor'));
const body=src.slice(src.indexOf('applyProductDisplayRow:function(a){')+'applyProductDisplayRow:'.length,src.indexOf('    applyVisionRegion:')).trim().replace(/,$/,'');
const samples=require('./fixtures/display-real-warps.json');
function descriptor(o){return {hasKey:k=>Object.hasOwn(o,k),getType:()=> 'double',getDouble(k){if(typeof o[k]!=='number')throw Error('not double');return o[k]},getInteger(k){if(!Number.isInteger(o[k]))throw Error('not int');return o[k]},getEnumerationValue(k){if(!Object.hasOwn(o,k))throw Error('missing enum');return o[k]},getObjectValue(k){if(!o[k])throw Error('missing object');return descriptor(o[k])},getList(k){const a=o[k];if(!Array.isArray(a))throw Error('missing list');return {count:a.length,getDouble:i=>a[i],getObjectValue:i=>descriptor(a[i])}}};}
function run(warp,transform=[0,0,40,0,40,30,0,30],expected=null,missingMore=false){
 const group={id:1,visible:true,typename:'LayerSet',layers:[]};const title={id:2,parent:group,textItem:{contents:'灰'}};group.layers.push(title);
 const jobs=[];for(let i=0;i<3;i++){const l={id:10+i,parent:group,kind:'smart',visible:true,bounds:[0,0,40,30],resize(){},translate(){}};const f={id:20+i,parent:group,bounds:[0,0,40,30]};group.layers.push(l,f);jobs.push({id:l.id,frameId:f.id,fitMode:'subject_frame',targetBox:f.bounds,bounds:l.bounds,file:'photo.png',fraction:[0,0,1,1],sourceSize:[40,30]});}
 const doc={id:99,layers:[group],activeHistoryState:1},row={id:1,color:'灰',colorLayerId:2,slots:jobs,error:''},task={doc,parent:doc,layerId:1,displayScope:'row',productDisplayRows:[row]};let copies=0,replacements=0,reads=0;
 const find=(ls,id)=>{for(const l of ls){if(l.id===id)return l;if(l.layers){const r=find(l.layers,id);if(r)return r;}}};
 const more={};if(warp!==undefined)more.warp=warp;if(transform!==null)more.transform=transform;
 const ctx={s:x=>x,c:x=>x,typeIDToStringID:x=>x,DescValueType:{UNITDOUBLE:'unit'},documentFor:()=>doc,smartTask:()=>task,find,app:{activeDocument:doc},json:JSON.stringify,bounds:l=>l.bounds,LayerKind:{SMARTOBJECT:'smart'},File:function(){this.exists=true},ActionReference:function(){this.putIdentifier=()=>{}},ActionDescriptor:function(){this.putPath=()=>{}},executeActionGet:()=>{reads++;return descriptor(missingMore?{}:{smartObjectMore:more})},executeAction:a=>{if(a==='placedLayerMakeCopy'){copies++;doc.activeLayer={...doc.activeLayer,id:doc.activeLayer.id+100};}else if(a==='placedLayerReplaceContents')replacements++;else throw Error(a)},DialogModes:{NO:0},AnchorPosition:{MIDDLECENTER:0},UnitValue:x=>x};
 const apply=vm.runInNewContext(helpers+'\n('+body+')',ctx);const args={id:'x',layerId:1,plan:{rowId:1,product:{color:'新色'},slots:jobs}};
 if(expected){assert.throws(()=>apply(args),expected);assert.equal(copies,0);assert.equal(replacements,0);assert(reads>0,'must reach descriptor guard');}else{assert.equal(apply(args).slots,3);assert.equal(copies,3);assert.equal(replacements,3);assert.equal(title.textItem.contents,'新色');}
}
for(const s of samples)run(s.warp);
run({warpStyle:'warpNone'});run({warpStyle:'warpArc'},undefined,/有变形/);
run({warpStyle:'warpNone'},[0,0,40,0,40,30,0],/透视/);
for(const t of [[0,0,40,1,40,30,0,30],[40,0,0,0,0,30,40,30],[0,0,40,0,35,30,0,30]])run({warpStyle:'warpNone'},t,/透视/);
run(undefined,undefined,/缺少变换/,true);run(undefined,null,/缺少transform/);run(undefined,[NaN,0,40,0,40,30,0,30],/坐标无效/);
for(const mutate of [w=>w.customEnvelopeWarp.meshPoints[5].horizontal+=1,w=>delete w.customEnvelopeWarp,w=>w.warpPerspective=2,w=>w.customEnvelopeWarp.meshPoints[5].horizontal=NaN]){const w=structuredClone(samples[0].warp);mutate(w);run(w,undefined,/有变形/);}
const c={};vm.runInNewContext(helpers,c);assert(c.sameBox([0,0,1,1],[0.001,0,1,1],.01));assert(!c.sameBox([0,0,1,1],[NaN,0,1,1],.01));assert(!c.sameBox([0,0,1,1],[.02,0,1,1],.01));
console.log('PASS real 9 identity meshes reach 27 replacements; warped/malformed descriptors rejected before copying; finite tolerant boxes');
