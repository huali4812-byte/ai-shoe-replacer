const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PNG } = require('./vendor/pngjs');
const jpeg = require('./vendor/jpeg-js');
const { parseWorkbook } = require('./rules.cjs');
const http = require('http');
function eagleSearch(keyword){return new Promise((resolve,reject)=>{const req=http.get('http://localhost:41595/api/item/list?limit=200&offset=0&keyword='+encodeURIComponent(keyword),r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>{try{const j=JSON.parse(b);resolve(j.data||[])}catch(e){reject(Error('Eagle API 返回无效数据'))}})});req.setTimeout(5000,()=>req.destroy(Error('Eagle API 超时')));req.on('error',reject)})}
function readExcel(file) { return parseWorkbook(fs.readFileSync(file)); }
function imageDimensions(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (w > 0 && h > 0 && w * h <= 40000000) return { width: w, height: h };
  } else if (b[0] === 0xFF && b[1] === 0xD8) {
    let pos = 2;
    while (pos < b.length - 8) {
      if (b[pos] !== 0xFF) break;
      const marker = b[pos + 1], len = b.readUInt16BE(pos + 2);
      if (marker === 0xC0 || marker === 0xC2) {
        const h = b.readUInt16BE(pos + 5), w = b.readUInt16BE(pos + 7);
        if (w > 0 && h > 0 && w * h <= 40000000) return { width: w, height: h };
      }
      pos += 2 + len;
    }
  }
  throw Error('无法读取图像尺寸或尺寸超过 4000 万像素');
}
function decode(file) {
  const b = fs.readFileSync(file);
  let image;
  if (b.slice(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) image = PNG.sync.read(b);
  else image = jpeg.decode(b,{useTArray:true,maxResolutionInMP:40,maxMemoryUsageInMB:512});
  if (!image.width || !image.height || image.width*image.height > 40000000) throw Error('图像尺寸无效或超过 4000 万像素');
  return image;
}
function fingerprint(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function exactSku(text, sku) {
  return new RegExp('(^|[^A-Za-z0-9])' + sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '($|[^A-Za-z0-9])','i').test(text);
}
function skuVariants(sku) {
  const s=String(sku).trim();
  const m=s.match(/^([A-Z]{2})(?:\/([A-Z]))+(\d+)$/i);
  if (m) { const n=m[3], base=m[1][0], letters=[m[1][1],...(s.match(/(?<=\/)[A-Z]/gi)||[])]; return Array.from(new Set(letters.map(x=>base+x+n))); }
  return [s];
}
function targets(products, task) {
  return products.filter(p=>exactSku(task.name,String(p.sku).trim()) && p.role===task.role);
}
async function indexLibrary(root, progress, wantedProducts) {
  if (!root) throw Error('请填写 Eagle 素材库路径');
  if (!fs.existsSync(root)) {
    const hint=path.join(process.env.HOME||'', 'Library/Application Support/Eagle/Settings');
    throw Error('插件进程无法访问素材库路径：'+root+'。Eagle 已打开不代表该路径已挂载；请在 Finder 确认目录，或将可访问的 Eagle 库路径填入。设置目录：'+hint);
  }
  if (!fs.statSync(root).isDirectory()) throw Error('素材库路径不是目录：'+root);
  const groups = [], errors=[];
  if (wantedProducts && wantedProducts.length) {
    try {
      const bySku=new Map();
      const queryStats=[];
      for(const sku of new Set(wantedProducts.flatMap(p=>skuVariants(p.sku)))){
        const items=await eagleSearch(sku);
        if(!Array.isArray(items))throw Error('Eagle 返回格式无效');
        if(items.length>=200)throw Error(sku+' 查询达到200条上限，不能确认唯一性');
        const live=Array.from(new Map(items.filter(i=>!i.isDeleted).map(i=>[i.id,i])).values());
        bySku.set(sku,live);
        queryStats.push(sku+'='+live.length+'条');
      }
      const diagnostics=[];
      const colorKey=v=>String(v).normalize('NFKC').toLowerCase().trim()
        .replace(/清新粉|蜜粉|雾粉紫/g,'粉色')
        .replace(/[／/\\|｜、，,]/g,'-').replace(/[\\s_]+/g,'-')
        .split('-').map(x=>x.trim()).filter(Boolean);
      const colorMatch=(a,b)=>{const A=new Set(colorKey(a)),B=new Set(colorKey(b));let n=0;for(const x of A)if(B.has(x))n++;return n>=Math.min(2,A.size,B.size);};
      for(const p of wantedProducts){
        const variants=skuVariants(p.sku), items=variants.flatMap(s=>bySku.get(s)||[]);
        const skuHits=items.filter(i=>variants.some(s=>String(i.name||'').split('_')[0].toUpperCase()===s.toUpperCase()));
        const hits=skuHits.filter(i=>{const parts=String(i.name||'').split('_');return colorMatch(parts[1],p.color);});
        const cutouts=hits.filter(i=>/_t_side$/i.test(i.name)&&i.ext.toLowerCase()==='png');
        const refs=hits.filter(i=>/_t_(logo|sideright|sole|back|heel)$/i.test(i.name)||/_bd_(pair|logo)$/i.test(i.name)||/_合成图$/i.test(i.name));
        const file=i=>path.join(root,'images',i.id+'.info',i.name+'.'+i.ext);
        const reason=cutouts.length!==1?'透明侧面素材需唯一，实际 '+cutouts.length:!refs.length?'缺少参考图':'';
        diagnostics.push(p.sku+' / '+p.color+'：变体['+variants.join(',')+']，查询['+queryStats.join(',')+']，合并 '+items.length+' 条，货号匹配 '+skuHits.length+' 条，同色 '+hits.length+' 条，'+(reason||'分组成功'));
        if (!reason && hits.length) diagnostics.push('命中素材：'+hits.map(i=>i.name).join('；'));
        if (!hits.length && skuHits.length) diagnostics.push('颜色未匹配素材：'+skuHits.slice(0,20).map(i=>i.name).join('；'));
        if(reason)continue;
        const files=[cutouts[0]].concat(refs).map(file);
        const missing=files.filter(f=>!fs.existsSync(f));
        if(missing.length){diagnostics.push('原文件不可访问：'+missing.join('；'));continue;}
        groups.push({id:p.sku+'|'+p.color,sku:p.sku,color:p.color,cutout:require('./reference-cache.cjs').snapshot(files[0]),references:files.slice(1).map(f=>require('./reference-cache.cjs').snapshot(f)),source:'Eagle API'});
      }
      if(!groups.length)throw Error(diagnostics.join('；'));
      return groups;
    } catch(e) { throw Error('Eagle 原生检索不可用：'+e.message+'；已停止，不再扫描 34566 条素材'); }
  }
  // Explicit metadata avoids guessing aliases, colors, or which photos belong together.
  function load(file) {
    const index = JSON.parse(fs.readFileSync(file,'utf8'));
    if (!Array.isArray(index.materials)) throw Error('素材索引缺少 materials 数组：' + file);
    index.materials.forEach(m=>{
      if (!m.id || !m.sku || !m.color || !Array.isArray(m.references) || !m.references.length || !m.cutout) throw Error('素材记录缺少 id/sku/color/references/cutout：' + file);
      const resolve = v=>{ const full=fs.realpathSync(path.resolve(path.dirname(file),v)); if(!fs.statSync(full).isFile())throw Error('素材不是文件');return full; };
      groups.push({id:String(m.id),sku:String(m.sku).trim(),color:String(m.color).trim(),references:m.references.map(resolve),cutout:resolve(m.cutout),source:file});
    });
  }
  if (wantedProducts && wantedProducts.length && groups.length===0) throw Error('Eagle 未检索到目标款号素材');
  const manifest=path.join(root,'shoe-materials.json');
  if (fs.existsSync(manifest)) load(manifest);
  else {
    const images=path.join(root,'images');
    if (!fs.existsSync(images)) throw Error('目录缺少可检索的 images 子目录；请确认 Eagle 库路径');
    // Eagle item tags: sku:CODE, color:COLOR, shoe-set:ID, role:cutout or role:reference.
    const sets=new Map();
    const wanted=(wantedProducts||[]).map(p=>String(p.sku).replace(/\//g,'').toLowerCase());
    const entries=fs.readdirSync(images).filter(n=>n.endsWith('.info') && (!wanted.length || wanted.some(s=>n.toLowerCase().includes(s))));
    for (let start=0;start<entries.length;start+=200) {
      const batch=entries.slice(start,start+200);
      await Promise.all(batch.map(async n=>{
      const folder=path.join(images,n), metaFile=path.join(folder,'metadata.json');
      try {
        const m=JSON.parse(fs.readFileSync(metaFile,'utf8')),tags=m.tags||[];
        const tag=k=>{const values=tags.filter(t=>typeof t==='string'&&t.startsWith(k+':')).map(t=>t.slice(k.length+1).trim());if(values.length>1)throw Error('重复标签 '+k);return values[0];};
        const sku=tag('sku'), color=tag('color'), id=tag('shoe-set'), role=tag('role');
        if(!sku&&!color&&!id)return;
        if(!sku||!color||!id||!['cutout','reference'].includes(role))throw Error('鞋素材标签不完整');
        const filename=path.join(folder,m.name+'.'+m.ext);if(!fs.existsSync(filename))throw Error('素材文件缺失');
        const key=JSON.stringify([sku,color,id]);if(!sets.has(key))sets.set(key,{id,sku,color,references:[],cutouts:[],source:metaFile});
        sets.get(key)[role==='cutout'?'cutouts':'references'].push(filename);
      }catch(e){errors.push({file:metaFile,error:e.message});}
      }));
      if(progress)progress(Math.min(start+batch.length,entries.length),entries.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    sets.forEach(m=>{
      if(m.cutouts.length!==1||!m.references.length) errors.push({file:m.source,error:'素材组需要唯一抠图和至少一张参考图'});
      else groups.push({id:m.id,sku:m.sku,color:m.color,cutout:m.cutouts[0],references:m.references,source:m.source});
    });
  }
  if(errors.length)throw Error('素材索引错误：'+JSON.stringify(errors));
  if(!groups.length)throw Error('素材库没有明确标注款色的素材组');
  return groups;
}
function matchMaterial(groups, product) {
  const matches=groups.filter(m=>m.sku===product.sku&&m.color===product.color);
  if(matches.length!==1)throw Error(product.sku+' / '+product.color+'：匹配到 '+matches.length+' 个素材组，必须唯一匹配');
  const result=matches[0],image=decode(result.cutout);
  let opaque=false,transparent=false;
  for(let i=3;i<image.data.length;i+=4){opaque=opaque||image.data[i]>0;transparent=transparent||image.data[i]===0;}
  if(!opaque||!transparent)throw Error('真实鞋素材必须是已抠图的透明 PNG，不能把白底产品图直接当作鞋子合成');
  if(path.extname(result.cutout).toLowerCase()!=='.png')throw Error('抠图必须为 PNG');
  return {...result,hashes:[result.cutout].concat(result.references).map(file=>({file,sha256:fingerprint(file)}))};
}
function validateTask(task) {
  if(!task.product||!task.material||!task.region||!task.confirmed)throw Error('任务缺少款色、唯一素材、选区或合成确认');
  if(task.material.sku!==task.product.sku||task.material.color!==task.product.color)throw Error('款色与素材不一致');
  task.material.hashes.forEach(h=>{if(fingerprint(h.file)!==h.sha256)throw Error('素材已变更，请重新建立任务');});
  return task;
}
function protect(originalFile, maskFile, generatedFile, output) {
  const original=decode(originalFile),mask=decode(maskFile),generated=decode(generatedFile);
  if([mask,generated].some(i=>i.width!==original.width||i.height!==original.height))throw Error('生成尺寸与任务区域不一致，禁止自动缩放回写');
  const result=new PNG({width:original.width,height:original.height});
  let protectedPixels=0, editablePixels=0;
  for(let i=0;i<original.data.length;i+=4){
    const allowed=mask.data[i]>0&&mask.data[i+3]>0;
    if(allowed)editablePixels++;else protectedPixels++;
    // Binary boundary: soft transition remains in Photoshop's saved selection mask.
    const source=allowed?generated:original;
    for(let j=0;j<4;j++)result.data[i+j]=source.data[i+j];
  }
  fs.writeFileSync(output,PNG.sync.write(result));
  return {width:result.width,height:result.height,protectedPixels,editablePixels,outsideChangedPixels:0};
}
function writeReport(folder, report) { fs.writeFileSync(path.join(folder,'task.json'),JSON.stringify(report,null,2)); }
function registerMaterial(root, product, cutout, references) {
  if(!product)throw Error('请选择 Excel 款色');
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('请选择存在的离线素材目录');
  const filename=path.join(root,'shoe-materials.json');
  const index=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):{materials:[]};
  if(!Array.isArray(index.materials))throw Error('现有素材索引格式不正确');
  if(index.materials.some(m=>m.sku===product.sku&&m.color===product.color))throw Error('该款色已有登记，请先解决现有记录，不能重复添加');
  const m={id:crypto.randomBytes(8).toString('hex'),sku:product.sku,color:product.color,cutout,references};
  if(!references.length)throw Error('至少需要一张多角度参考图');
  matchMaterial([m],product);
  index.materials.push(m);fs.writeFileSync(filename,JSON.stringify(index,null,2));
  return filename;
}
module.exports={readExcel,targets,indexLibrary,matchMaterial,validateTask,protect,decode,imageDimensions,fingerprint,writeReport,registerMaterial,eagleSearch,skuVariants};
