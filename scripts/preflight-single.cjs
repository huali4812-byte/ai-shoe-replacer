'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
function exists(file,label){if(!file||!fs.existsSync(file))throw Error(label+'不存在：'+(file||''));return file;}
function main(file){
 exists(file,'任务报告');const report=JSON.parse(fs.readFileSync(file));
 const rows=[...(report.regions||[]),...(report.tasks||[]).filter(x=>x.preview&&!report.regions?.some(r=>r.id===x.id))];
 if(!rows.length)throw Error('报告没有可测试区域');
 const checked=rows.map(r=>{const p=r.protection||{};const files={input:r.input,preview:r.preview,mask:r.visionMask,source:p.sourceFile,cutout:r.material&&r.material.cutout};
  const missing=Object.entries(files).filter(([,v])=>v&&!fs.existsSync(v)).map(([k,v])=>k+':'+v);
  return {id:r.id,name:r.name,taskType:r.taskType,missing,available:Object.entries(files).filter(([,v])=>v&&fs.existsSync(v)).map(([k])=>k),referenceCount:r.material?.references?.length||0};});
 const result={schemaVersion:1,report:file,generatedAt:new Date().toISOString(),api:{config:fs.existsSync(path.join(os.homedir(),'.kaienapi/config.json'))},rows:checked,ready:checked.some(r=>!r.missing.length&&r.available.includes('input')&&r.available.includes('mask'))};
 console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module){try{main(process.argv[2]||'');}catch(e){console.error('PREFLIGHT_FAILED: '+e.message);process.exitCode=1;}}
module.exports={main};
