const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require.resolve('../cep/host.jsx'),'utf8');new vm.Script(src.replace(/^#target.*$/mg,''));
const fn=src.slice(src.indexOf('    applyProductDisplayAI:function(a){')+'    applyProductDisplayAI:'.length,src.indexOf('    applyProductDisplayRow:')).trim().replace(/,$/,'');
function run(fault, size=[1264,843]){
 const files=new Map([['generated.png',10]]),original={id:1,kind:'smart',visible:true},parent={id:10,layers:[original],activeLayer:original},other={id:30};
 let restored=0,closed=0,replaced=0,saved=false;Object.defineProperty(parent,'activeHistoryState',{get:()=>1,set:()=>{restored++;if(fault==='rollback')throw Error('history failed');}});
 const app={activeDocument:parent,displayDialogs:'ALL'};
 const t={parent,layerId:1,width:1200,height:800};
 function File(p){if(!(this instanceof File))return new File(p);this.fsName=p;Object.defineProperty(this,'exists',{get:()=>files.has(p)});Object.defineProperty(this,'length',{get:()=>files.get(p)||0});}
 function Descriptor(){this.data={};this.putBoolean=(k,v)=>this.data[k]=v;this.putPath=(k,v)=>this.data[k]=v;this.putObject=(k,type,v)=>{this.data[k]=type;};}
 app.open=()=>{const d={width:{as:()=>size[0]},height:{as:()=>size[1]},resizeImage(w,h){assert(Math.abs(w/h-size[0]/size[1])<.005);assert(w<=1200&&h<=800);},resizeCanvas(w,h){assert.equal(w,1200);assert.equal(h,800);},close(){closed++;app.activeDocument=other;}};app.activeDocument=d;return d;};
 const ctx={app,documentFor:()=>parent,smartTask:()=>t,find:()=>original,File,Folder:{temp:{fsName:'/tmp'}},ActionDescriptor:Descriptor,s:x=>x,c:x=>x,LayerKind:{SMARTOBJECT:'smart'},DialogModes:{NO:'NO'},AnchorPosition:{MIDDLECENTER:0},UnitValue:x=>x,ResampleMethod:{BICUBIC:0},SaveOptions:{DONOTSAVECHANGES:0},executeAction:(action,d,mode)=>{
  assert.equal(mode,'NO');
  if(action==='save'){assert.equal(d.data['As  '],'largeDocumentFormat');saved=true;if(fault!=='missing')files.set(d.data['In  '].fsName,100);}
  if(action==='placedLayerMakeCopy'){assert(saved);assert.equal(app.activeDocument,parent);parent.activeLayer={id:2,kind:'smart'};}
  if(action==='placedLayerReplaceContents'){assert.equal(app.activeDocument,parent);assert.equal(parent.activeLayer.id,2);assert(d.data.null.exists);if(fault==='replace'||fault==='rollback')throw Error('replace failed');replaced++;}
 }};
 const call=vm.runInNewContext('('+fn+')',ctx);
 if(fault){assert.throws(()=>call({id:'t',documentId:10,output:'generated.png',contentFile:'/tmp/result.psb'}),fault==='missing'?/save_normalized/:/replace_contents/);assert.equal(restored,1);assert(original.visible);if(fault==='rollback')assert(t.recoveryBlocked);}
 else{const r=call({id:'t',documentId:10,output:'generated.png',contentFile:'/tmp/result.psb'});assert.equal(r.layerId,2);assert.equal(replaced,1);assert(!original.visible);}
 assert.equal(app.activeDocument,parent);assert.equal(app.displayDialogs,'ALL');assert.equal(closed,1);
}
run();run(null,[1024,1024]);run(null,[1600,900]);run(null,[1376,768]);run('missing');run('replace');run('rollback');console.log('PASS: explicit PSB format, existence check, parent reactivation, target selection, cleanup, rollback lock and dialog restoration');
