const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
let child=null, pending=null, buffer='', tail='', queue=Promise.resolve();
function start(){
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'vision-runtime.json'),'utf8'));
  if(!fs.existsSync(config.python))throw Error('缺少本地视觉运行环境：'+config.python);
  if(!['arm64','x86_64'].includes(config.architecture))throw Error('视觉环境缺少有效 architecture 配置');
  buffer='';tail='';
  child=cp.spawn('/usr/bin/arch',['-'+config.architecture,config.python,'-u',path.join(__dirname,'vision.py')],{env:{...process.env,HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'},stdio:['pipe','pipe','pipe']});
  child.stdout.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!pending)continue;try{const r=JSON.parse(line),p=pending;pending=null;clearTimeout(p.timer);r.ok?p.resolve(r.data):p.reject(Error(r.error));}catch(e){const p=pending;pending=null;if(p){clearTimeout(p.timer);p.reject(Error('检测器返回无效数据'));}}}});
  child.stderr.on('data',c=>{tail=(tail+c).slice(-3000);});
  const fail=e=>{child=null;if(pending){clearTimeout(pending.timer);pending.reject(Error('本地检测器退出：'+e+' '+tail));pending=null;}};
  child.on('error',e=>fail(e.message));child.on('exit',(code)=>fail('exit '+code));
}
function request(data){const run=()=>new Promise((resolve,reject)=>{try{if(!child)start();pending={resolve,reject,timer:setTimeout(()=>{if(child)child.kill();},600000)};child.stdin.write(JSON.stringify(data)+'\n');}catch(e){reject(e);}});const result=queue.then(run);queue=result.catch(()=>{});return result;}
function close(){if(child)child.kill();}
module.exports={request,close};
