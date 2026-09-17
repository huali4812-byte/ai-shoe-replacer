const fs=require('fs'),path=require('path'),cp=require('child_process');
let child=null,pending=null,queue=Promise.resolve(),generation=0;
function start(){
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'vision-runtime.json'),'utf8'));
 if(!fs.existsSync(config.python))throw Error('缺少本地视觉运行环境：'+config.python);
 if(!['arm64','x86_64'].includes(config.architecture))throw Error('视觉环境缺少有效 architecture 配置');
 const proc=cp.spawn('/usr/bin/arch',['-'+config.architecture,config.python,'-u',path.join(__dirname,'vision.py')],{env:{...process.env,HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'},stdio:['pipe','pipe','pipe']});
 child=proc;let buffer='',tail='',failed=false;
 const fail=(reason,retryable=true)=>{
  if(failed)return;failed=true;
  if(child===proc)child=null;
  if(pending&&pending.proc===proc){const p=pending;pending=null;clearTimeout(p.timer);p.reject(Object.assign(Error('本地检测器退出：'+reason+' '+tail),{detectorExited:retryable}));}
 };
 proc.fail=fail;
 proc.stdout.on('data',chunk=>{if(failed)return;buffer+=chunk;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!pending||pending.proc!==proc)continue;const p=pending;pending=null;clearTimeout(p.timer);try{const r=JSON.parse(line);r.ok?p.resolve(r.data):p.reject(Error(r.error));}catch(e){p.reject(Error('检测器返回无效数据'));fail('协议失步',false);proc.kill();}}});
 proc.stderr.on('data',c=>{tail=(tail+c).slice(-3000);});
 proc.on('error',e=>fail(e.message));
 proc.on('exit',(code,signal)=>fail('code='+code+' signal='+(signal||'none')));
 proc.stdin.on('error',e=>{fail('stdin '+e.message);proc.kill();});
 return proc;
}
function once(data){return new Promise((resolve,reject)=>{
 let proc;
 try{proc=child||start();pending={proc,resolve,reject,timer:setTimeout(()=>{proc.fail('请求超时600秒',false);proc.kill();},600000)};
 proc.stdin.write(JSON.stringify(data)+'\n',e=>{if(e){proc.fail('write '+e.message);proc.kill();}});
 }catch(e){if(pending&&pending.proc===proc){clearTimeout(pending.timer);pending=null;}reject(e);}
});}
function request(data){const epoch=generation;const run=async()=>{
 if(epoch!==generation)throw Error('视觉请求已取消');
 const logs=require('./failure-log.cjs');const operationId=require('crypto').randomBytes(12).toString('hex');
 logs.event('attempt_started',{stage:data.action,operationId,source:data.source,attempt:1,maxAttempts:1});
 try{const result=await once(data);logs.event('attempt_succeeded',{stage:data.action,operationId});return result;}catch(e){
  logs.failure(e,{stage:data.action,operationId,source:data.source,attempt:1,maxAttempts:1});throw e;
 }
 };const result=queue.then(run);queue=result.catch(()=>{});return result;}
function close(){generation++;if(child){const proc=child;proc.fail('主动关闭',false);proc.kill();}}
module.exports={request,close};
