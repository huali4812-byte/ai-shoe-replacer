// Product display reference matching and isolated AI reference preparation.
const fs=require('fs'),path=require('path'),flow=require('./workflow.cjs');
const VIEWS={'1':'pair','2':'back','3':'sole'};
function colorKey(s){return String(s||'').normalize('NFKC').replace(/\s/g,'').replace(/[／/、|｜_]/g,'-').toLowerCase();}
function productsForRow(products,sku,row){return products.filter(p=>p.sku.trim()===sku&&colorKey(p.color)===colorKey(row.color));}
async function loadMaterials(root,sku){
  if(!fs.existsSync(root))throw Error('Eagle 素材库不可访问');
  const variants=flow.skuVariants(sku),items=new Map();
  for(const v of variants){const found=await flow.eagleSearch(v);if(!Array.isArray(found)||found.length>=200)throw Error('Eagle 查询不完整，不能确认素材唯一性');for(const item of found)if(!item.isDeleted)items.set(item.id,item);}
  const entries=[];
  for(const i of items.values()){
    const m=String(i.name).match(/^([^_]+)_(.+)_(bd|t)_(pair|back|sole)$/i);
    if(!m||!variants.some(v=>v.toLowerCase()===m[1].toLowerCase()))continue;
    if(!/^[a-zA-Z0-9_-]+$/.test(i.id)||/[\\/]/.test(i.name)||!/^(png|jpg|jpeg)$/i.test(i.ext))continue;
    entries.push({color:m[2],kind:m[3].toLowerCase(),view:m[4].toLowerCase(),file:path.join(root,'images',i.id+'.info',i.name+'.'+i.ext)});
  }
  return entries;
}
function makePlan(row,product,entries){
  if(!product)throw Error('颜色未明确对应，请选择本行目标款色');
  if(row.error)throw Error(row.error);
  const slots=[],seen=new Set();
  for(const slot of row.slots){
    const view=slot.view||VIEWS[slot.name];if(!['pair','back','sole'].includes(view)||seen.has(view))throw Error('视角缺失或重复');seen.add(view);
    const pick=kind=>{const hits=entries.filter(e=>e.view===view&&e.kind===kind&&colorKey(e.color)===colorKey(product.color));if(hits.length!==1)throw Error(product.color+' '+view+' '+kind+' 素材必须唯一，实际 '+hits.length);return hits[0].file;};
    const file=pick('bd'),alphaFile=pick('t'),photo=flow.decode(file),alpha=flow.decode(alphaFile);
    if(photo.width!==alpha.width||photo.height!==alpha.height)throw Error(view+' 白底图与透明图尺寸不一致');
    let x0=alpha.width,y0=alpha.height,x1=0,y1=0,transparent=false;
    for(let y=0;y<alpha.height;y++)for(let x=0;x<alpha.width;x++){const a=alpha.data[(y*alpha.width+x)*4+3];if(a<20)transparent=true;if(a>20){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}}
    if(!transparent||x1<=x0||y1<=y0)throw Error(view+' 透明素材没有有效 alpha 轮廓');
    const box=slot.targetBox;if(!box||box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1])throw Error(view+' 缺少有效范围框');
    if(slot.fitMode==='existing_canvas'){x0=0;y0=0;x1=alpha.width;y1=alpha.height;}
    const scale=Math.min((box[2]-box[0])/(x1-x0),(box[3]-box[1])/(y1-y0));
    if(scale>1.01)throw Error(view+' 素材像素不足，需要放大 '+scale.toFixed(2)+' 倍，请提供高清素材');
    slots.push({...slot,file,alphaFile,sha256:flow.fingerprint(file),alphaSha256:flow.fingerprint(alphaFile),sourceSize:[photo.width,photo.height],fraction:[x0/alpha.width,y0/alpha.height,x1/alpha.width,y1/alpha.height]});
  }
  if(slots.length!==3)throw Error('展示行需要 pair/back/sole 三个明确视角');
  return {rowId:row.id,color:row.color,product,slots};
}
function verifyPlan(plan){for(const s of plan.slots){if(flow.fingerprint(s.file)!==s.sha256||flow.fingerprint(s.alphaFile)!==s.alphaSha256)throw Error('素材在匹配后发生变化，请重新读取');}}
// Native resizing happens before JS decoding; full-resolution Eagle JPEGs can
// exceed jpeg-js's allocation limit even when the eventual AI input is small.
async function prepareAIPlan(row,product,entries,folder){
  if(!product)throw Error('请选择本行目标款色');
  if(row.error)throw Error(row.error);
  if(row.slots.length!==3||new Set(row.slots.map(s=>s.view)).size!==3)throw Error('展示行视角缺失或重复');
  fs.mkdirSync(folder,{recursive:true});const slots=[];
  const execFile=require('child_process').execFile;
  for(const slot of row.slots){
    if(!['pair','back','sole'].includes(slot.view))throw Error('未知展示视角');
    const job={...slot};
    for(const kind of ['bd','t']){
      const hits=entries.filter(e=>e.view===slot.view&&e.kind===kind&&colorKey(e.color)===colorKey(product.color));
      if(hits.length!==1)throw Error(product.color+' '+slot.view+' '+kind+' 素材必须唯一，实际 '+hits.length);
      const source=hits[0].file,hash=flow.fingerprint(source),output=path.join(folder,hash+'-'+kind+'.png');
      if(!fs.existsSync(output))await new Promise((resolve,reject)=>execFile('/usr/bin/sips',['-s','format','png','-Z','1536',source,'--out',output],{timeout:120000,maxBuffer:1024*1024},err=>err?reject(Error('产品展示参考图预处理失败：'+err.message)):resolve()));
      const im=flow.decode(output);if(Math.max(im.width,im.height)>1536)throw Error('参考图预处理尺寸超限');
      job[kind==='bd'?'file':'alphaFile']=output;
      job[kind==='bd'?'sha256':'alphaSha256']=flow.fingerprint(output);
      job[kind==='bd'?'originalFile':'originalAlphaFile']=source;
    }
    slots.push(job);
  }
  return {rowId:row.id,product,slots};
}
module.exports={outputFingerprint:flow.fingerprint,VIEWS,colorKey,productsForRow,loadMaterials,makePlan,verifyPlan,prepareAIPlan};
