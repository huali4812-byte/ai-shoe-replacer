'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
function redact(value){return String(value).replace(/data:[^\s"']+/gi,'[image redacted]').replace(/https?:\/\/[^\s"'<>]+/gi,'[url redacted]').replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [redacted]').replace(/((?:api[_-]?key|authorization|token|password)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,'$1[redacted]');}
function clean(v){if(typeof v==='string')return redact(v).slice(0,12000);if(Array.isArray(v))return v.map(clean);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/key|authorization|token|password|base64/i.test(k)?'[redacted]':clean(x)]));return v;}
function create(options={}){
 const root=options.root||path.join(os.homedir(),'Pictures','AI-Shoe-Results','diagnostics','events');
 const fallback=options.fallback||path.join(os.tmpdir(),'ai-shoe-events');
 const seen=new WeakMap();
 function event(type,details={}){
  const id=crypto.randomBytes(12).toString('hex');
  const record=clean({...details,time:new Date().toISOString(),eventId:id,event:type});
  const line=JSON.stringify(record)+'\n';
  const needsReport=/(?:failed|failure|error|blocked)/i.test(type);
  let eventFile=null,reportFile=null;
  for(const dir of [root,fallback]){
   if(!eventFile)try{fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,new Date().toISOString().slice(0,10)+'.jsonl');fs.appendFileSync(file,line,{mode:0o600});eventFile=file;}catch(e){console.error('[日志写入失败]',redact(e.message));}
   if(needsReport&&!reportFile)try{
    const folder=path.join(dir,'reports',record.time.replace(/[:.]/g,'-')+'-'+id);
    fs.mkdirSync(folder,{recursive:true,mode:0o700});const file=path.join(folder,'report.json'),temp=file+'.tmp';
    fs.writeFileSync(temp,JSON.stringify({schemaVersion:1,reportType:'error_event',status:'failed',runtime:{node:process.version,platform:process.platform,arch:process.arch},error:record,eventLog:eventFile},null,2),{mode:0o600,flag:'wx'});
    fs.renameSync(temp,file);reportFile=file;
   }catch(e){console.error('[错误报告写入失败]',redact(e.message));}
   if(eventFile&&(!needsReport||reportFile))break;
  }
  return {eventId:id,file:eventFile,reportFile,logWriteFailed:!eventFile||(needsReport&&!reportFile)};
 }
 function failure(error,context={}){
  const object=error&&typeof error==='object';if(object&&seen.has(error))return seen.get(error);
  const result=event('attempt_failed',{attempt:1,maxAttempts:1,...context,code:(error&&(error.code||error.name))||'ERROR',message:(error&&error.message)||String(error),stack:error&&error.stack,exitCode:error&&error.exitCode,signal:error&&error.signal,stderr:error&&error.stderr});
  if(object){seen.set(error,result);error.failureEventId=result.eventId;error.failureLog=result.reportFile||result.file;error.failureReport=result.reportFile;}
  return result;
 }
 return {event,failure};
}
module.exports={...create(),create,redact};
