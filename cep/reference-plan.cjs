'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
// Filename evidence is catalog metadata, never an inferred camera pose.
function classify(file){
 const name=path.basename(file,path.extname(file)).toLowerCase();
 const tokens=name.split(/[_\s.-]+/);
 const has=(words)=>words.some(w=>tokens.includes(w));
 const text=name.replace(/[\\-_]+/g,' ');
 
 // 优先识别内侧/外侧（最关键的视角区分）
 const view=
   has(['inner','medial','inside'])||/内侧|内侧面|medial/.test(text)?'inner':
   has(['outer','lateral','outside'])||/外侧|外侧面|lateral/.test(text)?'outer':
   has(['sideright'])||/右侧(?!.*内)|右侧面(?!.*内)|外侧右/.test(text)?'side-right':
   has(['sideleft'])||/左侧(?!.*外)|左侧面(?!.*外)|内侧左/.test(text)?'side-left':
   has(['side'])||/侧面|侧视/.test(text)?'side':
   has(['front','toe'])||/鞋头|正面|前视/.test(text)?'front':
   has(['back','heel'])||/后跟|后视/.test(text)?'back':
   has(['sole','bottom'])||/鞋底|大底|中底|底部/.test(text)?'sole':
   has(['top','upper'])||/鞋面|俯视|顶部/.test(text)?'top':
   'unknown';
 
 const detail=
   has(['logo'])||/标志|字标|品牌|logo/.test(text)?'logo':
   has(['sole','bottom'])||/鞋底|大底|中底/.test(text)?'sole':
   has(['toe','front'])||/鞋头|包头/.test(text)?'toe':
   has(['upper','top'])||/鞋面|鞋带|魔术贴/.test(text)?'upper':
   has(['heel','back','pulltab'])||/后跟|鞋口|提拉环|拉环/.test(text)?'heel':
   'overall';
 
 return {view,detail,evidence:'filename'};
}
function plan(material,{view='unknown',detail='overall'}={}){
 const files=[...new Set([material.cutout,...(material.references||[])].filter(Boolean))];
 const entries=files.map(file=>({file,...classify(file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
 
 // 如果请求了特定视角或细节，优先匹配
 const matches=entries.filter(e=>(view!=='unknown'&&e.view===view)||(detail!=='overall'&&e.detail===detail));
 
 if(matches.length>0){
   // 有明确匹配时，匹配的放前面
   const ordered=[...matches,...entries.filter(e=>!matches.includes(e))];
   return {schemaVersion:1,requestedView:view,requestedDetail:detail,viewMatched:view!=='unknown'&&matches.some(e=>e.view===view),warnings:matches.some(e=>e.view===view)?[]:['缺少明确对应视角参考'],entries:ordered,files:ordered.map(e=>e.file)};
 }
 
 // 视角未知时，按重要性排序：内侧 > 外侧 > 鞋底 > 其他
 const priority={inner:1,outer:2,sole:3,front:4,back:5,top:6,'side-left':7,'side-right':8,side:9,unknown:10};
 const ordered=[...entries].sort((a,b)=>priority[a.view]-priority[b.view]);
 
 const hasInner=entries.some(e=>e.view==='inner');
 const hasOuter=entries.some(e=>e.view==='outer');
 const hasSole=entries.some(e=>e.view==='sole');
 
 const warnings=[];
 if(!hasInner)warnings.push('缺少内侧参考图');
 if(!hasOuter)warnings.push('缺少外侧参考图');
 if(!hasSole)warnings.push('建议补充鞋底参考图');
 if(view==='unknown')warnings.unshift('场景视角未知，已按内侧→外侧→鞋底优先级排序');
 
 return {schemaVersion:1,requestedView:view,requestedDetail:detail,viewMatched:false,warnings,entries:ordered,files:ordered.map(e=>e.file)};
}
module.exports={classify,plan};
