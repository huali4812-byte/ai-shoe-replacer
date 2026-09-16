const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require.resolve('../cep/host.jsx'),'utf8');
const body=source.slice(source.indexOf('applyProductDisplayRow:function(a){')+'applyProductDisplayRow:'.length,source.indexOf('    applyVisionRegion:')).trim().replace(/,$/,'');
function run(fail=0,rollbackFails=false){
 const group={id:1,visible:true},title={id:2,textItem:{contents:'灰'}};
 const layers=[group,title];const jobs=[];
 for(let i=0;i<3;i++){let layer={id:10+i,parent:group,kind:'smart',visible:true,bounds:[0,0,40,30],resize(){},translate(){}};layers.push(layer);jobs.push({id:layer.id,targetBox:[0,0,40,30],bounds:layer.bounds,fitMode:'existing_canvas',file:'photo.png',sourceSize:[40,30],fraction:[0,0,1,1]});}
 let restored=0,replacements=0;const doc={id:99,layers};Object.defineProperty(doc,'activeHistoryState',{get:()=>1,set:()=>{restored++;if(rollbackFails)throw Error('history unavailable')}});
 const row={id:1,color:'灰',colorLayerId:2,slots:jobs,error:''},task={parent:doc,doc,layerId:1,displayScope:'row',productDisplayRows:[row]};
 const ctx={documentFor:()=>doc,smartTask:()=>task,find:(ls,id)=>ls.find(l=>l.id===id),app:{activeDocument:doc},json:JSON.stringify,bounds:l=>l.bounds,LayerKind:{SMARTOBJECT:'smart'},File:function(){this.exists=true},ActionReference:function(){this.putIdentifier=()=>{}},ActionDescriptor:function(){this.putPath=()=>{}},s:x=>x,c:x=>x,executeActionGet:()=>({hasKey:k=>k==='smartObjectMore',getObjectValue:()=>({hasKey:k=>k==='transform',getList:()=>({count:8,getDouble:i=>[0,0,40,0,40,30,0,30][i]})})}),executeAction:(action)=>{if(action==='placedLayerMakeCopy'){doc.activeLayer={...doc.activeLayer,id:doc.activeLayer.id+100};return;}replacements++;if(replacements===fail)throw Error('replace failed')},DialogModes:{NO:0},AnchorPosition:{MIDDLECENTER:0},UnitValue:x=>x};
 const apply=vm.runInNewContext('('+body+')',ctx),args={id:'x',layerId:1,plan:{rowId:1,product:{color:'灰'},slots:jobs}};
 if(fail){assert.throws(()=>apply(args),rollbackFails?/任务锁定/:/replace failed/);assert.equal(restored,2);assert.equal(!!task.recoveryBlocked,rollbackFails);assert.equal(row.error,'');}
 else{assert.equal(apply(args).slots,3);assert.equal(replacements,3);assert.throws(()=>apply(args),/结构未确认/);}
 assert.equal(ctx.app.activeDocument,doc);
}
run();run(1);run(2);run(3);run(2,true);console.log('PASS: row transaction, each replace failure, independent rollback, recovery lock, duplicate write rejected');
