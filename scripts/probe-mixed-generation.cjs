#!/usr/bin/env node
'use strict';
// Isolated protocol probe. No production module changes, retries or PS writes.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {createRequire}=require('module');
const root=path.resolve(__dirname,'..');
function adapter(){
  const file=path.join(root,'cep/api.cjs'),m={exports:{}};
  const context={require:createRequire(file),module:m,exports:m.exports,Buffer,URL,console,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports={config,prepareImage,request};',context,{filename:file});
  return m.exports;
}
function inspect(raw){
  let envelope;try{envelope=JSON.parse(raw);}catch(_){envelope=null;}
  const msg=envelope&&envelope.choices&&envelope.choices[0]&&envelope.choices[0].message;
  const content=msg?msg.content:raw;
  const parts=Array.isArray(content)?content:[{text:typeof content==='string'?content:''}];
  const text=parts.filter(p=>p&&typeof p.text==='string').map(p=>p.text).join('\n');
  const match=text.match(/<shoe_observation>\s*([\s\S]*?)\s*<\/shoe_observation>/);
  let observation=null,analysisStatus='missing';
  if(match){try{
    const value=JSON.parse(match[1]);
    const surfaces=['inner','outer','upper','sole','front','back','unknown'];
    if(value.schemaVersion!==1||!Array.isArray(value.shoes)||!value.shoes.length)throw Error('schema');
    const ids=new Set();
    for(const s of value.shoes){
      if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||typeof s.position!=='string'||typeof s.toeDirection!=='string'||typeof s.occlusion!=='string'||!Array.isArray(s.visibleSurfaces)||!s.visibleSurfaces.length||s.visibleSurfaces.some(v=>!surfaces.includes(v)))throw Error('shoe schema');
      ids.add(s.id);
    }
    observation=value;analysisStatus='valid_unverified';
  }catch(_){analysisStatus='invalid';}}
  const structured=parts.filter(p=>p&&(p.image_url||p.type==='image')).length+(msg&&Array.isArray(msg.images)?msg.images.length:0);
  const links=(text.match(/!\[[^\]]*\]\(https?:\/\/[^)]+\)|<img\b[^>]*>|data:image\//gi)||[]).length;
  return {responseFormat:msg?'chat_message':envelope?'other_json':'text',partTypes:parts.map(p=>p.type||'text'),analysisStatus,observation,imageIndicators:structured+links,semanticReview:'not_performed'};
}
async function main(){
  if(!process.argv.includes('--send'))throw Error('Real request requires --send; one potentially billable POST, no retries.');
  const dir=path.join(root,'outputs/mixed-generation-probe',new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const report={started:new Date().toISOString(),phase:'preflight',postAttempts:0,psWrite:false,installed:false};
  const save=()=>fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2),{mode:0o600});
  const log=(event,details={})=>fs.appendFileSync(path.join(dir,'events.jsonl'),JSON.stringify({time:new Date().toISOString(),event,...details})+'\n',{mode:0o600});
  try{
    const task=JSON.parse(fs.readFileSync(path.join(root,'outputs/shoe-evidence-0916/sample-task.json'),'utf8'));
    const files=[task.input,task.visionMask,task.material.cutout,...task.material.references];
    const api=adapter(),c=api.config();
    const prompt='第一张为原始局部场景，第二张是同坐标编辑蒙版（白色为鞋区域），其余为目标鞋参考。将场景中的'+task.shoeCount+'只鞋替换为目标参考款式，保持原位置、尺度、朝向、透视、遮挡与背景。原图只决定姿态，目标图决定配色、拼接、魔术贴、Logo、拉环和鞋底纹路。逐鞋匹配可见面，不把画面左右当成左右脚，不按有无Logo或魔术贴猜内外侧；允许同时可见多个面，无法确定则unknown。不同视角参考仅用于对应部件，不把鞋转成参考角度，不跨侧复制装饰。\n本次响应必须同时包含简短可观察事实JSON文字及一张生成图片。先输出<shoe_observation>{"schemaVersion":1,"shoes":[{"id":"shoe-1","position":"画面位置","toeDirection":"鞋头朝向","visibleSurfaces":["unknown"],"occlusion":"遮挡说明"}]}</shoe_observation>，每只鞋一条，可见面只能用inner/outer/upper/sole/front/back/unknown。不输出推理过程，不声称质量验收通过。然后输出一张与第一张相同1:1画布的替换结果图片，JSON不要画进图片，不要对比拼图。';
    const content=[{type:'text',text:prompt}];
    report.files=[];
    for(const file of files){const raw=api.prepareImage(file);content.push({type:'image_url',image_url:{url:'data:'+(raw[0]===137?'image/png':'image/jpeg')+';base64,'+raw.toString('base64')}});report.files.push({file,preparedBytes:raw.length,preparedSha256:crypto.createHash('sha256').update(raw).digest('hex')});}
    fs.writeFileSync(path.join(dir,'prompt.txt'),prompt,{mode:0o600});
    const payload=JSON.stringify({model:c.model,messages:[{role:'user',content}],modalities:['text','image'],extra_body:{google:{response_modalities:['TEXT','IMAGE'],image_config:{aspect_ratio:'1:1'}}}});
    report.model=c.model;report.requestBytes=Buffer.byteLength(payload);report.phase='request';report.postAttempts=1;save();
    const raw=await api.request(c.base+'chat/completions',payload,{'Authorization':'Bearer '+c.key,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},300000,log);
    fs.writeFileSync(path.join(dir,'response.private.txt'),raw,{mode:0o600});
    Object.assign(report,inspect(raw.toString('utf8')));
    report.phase='response_received';
    report.protocolCandidate=report.analysisStatus==='valid_unverified'&&report.imageIndicators>0;
    // Indicators are not decoded/downloaded image validation or visual acceptance.
  }catch(e){report.phase='failed';report.error=e.message;process.exitCode=1;}
  finally{report.finished=new Date().toISOString();save();console.log(JSON.stringify({result:path.join(dir,'result.json'),phase:report.phase,analysisStatus:report.analysisStatus,imageIndicators:report.imageIndicators,protocolCandidate:report.protocolCandidate,error:report.error},null,2));}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={inspect};
