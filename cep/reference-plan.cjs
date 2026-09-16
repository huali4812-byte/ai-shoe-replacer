'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
// Filename evidence is catalog metadata, never an inferred camera pose.
function classify(file){
 const name=path.basename(file,path.extname(file)).toLowerCase();
 const tokens=name.split(/[_\s.-]+/);
 const has=(words)=>words.some(w=>tokens.includes(w));
 const text=name.replace(/[\\-_]+/g,' ');
 const view=has(['sideright'])||/右侧|右侧面|外侧右/.test(text)?'side-right':has(['sideleft'])||/左侧|左侧面|内侧左/.test(text)?'side-left':has(['side'])||/侧面|侧视|内侧|外侧/.test(text)?'side':has(['front','toe'])||/鞋头|正面|前视/.test(text)?'front':has(['back','heel'])||/后跟|后视/.test(text)?'back':has(['sole'])||/鞋底|大底|中底/.test(text)?'sole':has(['top','upper'])||/鞋面|俯视|顶部/.test(text)?'top':'unknown';
 const detail=has(['logo'])||/标志|字标|品牌/.test(text)?'logo':has(['sole'])||/鞋底|大底|中底/.test(text)?'sole':has(['toe','front'])||/鞋头|包头/.test(text)?'toe':has(['upper','top'])||/鞋面|鞋带|魔术贴/.test(text)?'upper':has(['heel','back'])||/后跟|鞋口|提拉环/.test(text)?'heel':'overall';
 return {view,detail,evidence:'filename'};
}
function plan(material,{view='unknown',detail='overall'}={}){
 const files=[...new Set([material.cutout,...(material.references||[])].filter(Boolean))];
 const entries=files.map(file=>({file,...classify(file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
 const matches=entries.filter(e=>(view!=='unknown'&&e.view===view)||(detail!=='overall'&&e.detail===detail));
 const ordered=[...matches,...entries.filter(e=>!matches.includes(e))];
 return {schemaVersion:1,requestedView:view,requestedDetail:detail,viewMatched:view!=='unknown'&&matches.some(e=>e.view===view),warnings:view==='unknown'?['场景视角未知，保留全部参考，不猜内外侧']:matches.some(e=>e.view===view)?[]:['缺少明确对应视角参考'],entries:ordered,files:ordered.map(e=>e.file)};
}
module.exports={classify,plan};
