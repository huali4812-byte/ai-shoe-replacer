const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { PNG } = require('./vendor/pngjs');
const jpeg = require('./vendor/jpeg-js');
function prepareImage(file) {
  const raw=fs.readFileSync(file); if(raw.length<8)return raw;
  try { const p=PNG.sync.read(raw); const max=1024, scale=Math.min(1,max/Math.max(p.width,p.height));
    if(scale===1 && raw.length<=6*1024*1024)return raw;
    const w=Math.max(1,Math.round(p.width*scale)),h=Math.max(1,Math.round(p.height*scale));
    const data=Buffer.alloc(w*h*4); for(let y=0;y<h;y++){const sy=Math.min(p.height-1,Math.floor(y/scale));for(let x=0;x<w;x++){const sx=Math.min(p.width-1,Math.floor(x/scale));const a=(sy*p.width+sx)*4,b=(y*w+x)*4;data[b]=p.data[a];data[b+1]=p.data[a+1];data[b+2]=p.data[a+2];data[b+3]=255;}}
    return jpeg.encode({width:w,height:h,data},82).data;
  } catch (_) { return raw; }
}

function aspectRatio(file){
  const raw=fs.readFileSync(file),im=raw[0]===137?PNG.sync.read(raw):jpeg.decode(raw);
  return ['1:1','4:3','3:4','16:9','9:16','21:9','9:21','3:2','2:3'].reduce((best,r)=>{const ratio=x=>{const a=x.split(':');return +a[0]/+a[1];};return Math.abs(ratio(r)-im.width/im.height)<Math.abs(ratio(best)-im.width/im.height)?r:best;},'1:1');
}
function config() {
  const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.kaienapi/config.json'), 'utf8'));
  if (!c.api_key) throw new Error('本机 API 配置缺少 api_key');
  const base = new URL(c.base_url || 'https://kaienapi.com');
  if (base.protocol !== 'https:') throw new Error('API 地址必须使用 HTTPS');
  base.pathname = base.pathname.replace(/\/$/, '').replace(/\/v1$/, '') + '/v1/';
  // This gateway's image-edit route is explicitly configured for Gemini image
  // preview. Keep unrelated local CLI model settings from changing this route.
  return { key: c.api_key, base: base.href, model: 'gemini-3.1-flash-image-preview' };
}
const API_TIMEOUT_MS = 300000;
function request(url, body, headers, timeout, log = ()=>{}) {
  let stage="连接"; log("request_start");
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: body ? 'POST' : 'GET', headers }, res => {
      stage="接收响应"; log("response_headers",{status:res.statusCode,requestId:res.headers["x-request-id"]||null});
      const parts = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 100 * 1024 * 1024) req.destroy(new Error('接口响应超过 100 MB'));
        else parts.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        log('response_end',{bytes:size});
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const body=Buffer.concat(parts).toString('utf8').slice(0,2000);
          const unavailable=/model_not_found|No available channel|no available channel/i.test(body);
          return reject(Object.assign(new Error('接口 HTTP '+res.statusCode+'：'+(body||'服务端未返回正文')+(unavailable?'；服务端当前没有该模型的可用通道':'')+'；未获得图片'),{gatewayUnavailable:unavailable,statusCode:res.statusCode}));
        }
        resolve(Buffer.concat(parts));
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('接口超时（'+stage+'，'+(timeout||API_TIMEOUT_MS)/1000+'秒）')), timeout || API_TIMEOUT_MS);
    req.on('close', () => clearTimeout(timer));
    req.on('socket',socket=>{log('socket',{reused:!!req.reusedSocket});socket.once('lookup',()=>log('dns'));socket.once('connect',()=>log('tcp'));socket.once('secureConnect',()=>{stage='上传';log('tls');});});
    req.on('finish',()=>{stage='等待响应';log('request_flushed');});
    req.on('error', e=>{log('request_error',{stage,code:e.code||null});reject(e);});
    req.end(body);
  });
}
function download(url, timeout, log = ()=>{}) {
  return new Promise((resolve,reject)=>{ 
    const req=https.get(url,res=>{ const p=[]; let size=0; log('download_headers',{status:res.statusCode});
      res.on('data',x=>{size+=x.length;p.push(x)});
      res.on('end',()=>{log('download_end',{status:res.statusCode,bytes:size});res.statusCode>=200&&res.statusCode<300?resolve(Buffer.concat(p)):reject(Error('图片下载 HTTP '+res.statusCode));});
      res.on('error',reject);
    });
    req.on('error',e=>{log('download_error',{code:e.code||null,error:e.message});reject(e)});
    req.setTimeout(timeout||60000,function(){this.destroy(Error('图片下载超时'))});
  });
}
async function test() {
  const c = config();
  try {
    const result = JSON.parse((await request(c.base + 'models', null, { Authorization: 'Bearer ' + c.key }, 20000)).toString());
    return { model: c.model, listed: (result.data || []).some(m => m.id === c.model), modelListChecked: true };
  } catch (e) {
    // /models is restricted on some gateway accounts; this does not prove that
    // chat/completions cannot use the configured image model.
    return { model: c.model, listed: null, modelListChecked: false, diagnostic: e.message };
  }
}
async function generate(original, references, prompt, options = {}) {
  const logDir=path.join(os.homedir(),"Pictures","AI-Shoe-Results","diagnostics");fs.mkdirSync(logDir,{recursive:true});
  const logFile=path.join(logDir,Date.now()+"-"+crypto.randomBytes(4).toString("hex")+".jsonl"),epoch=Date.now();
  const log=(event,details={})=>fs.appendFileSync(logFile,JSON.stringify({time:new Date().toISOString(),elapsedMs:Date.now()-epoch,taskId:options.taskId||null,event,...details})+"\n");
  log("prepare_start");
  try {
  const c=config(); if(!references.length) throw Error('请选择目标鞋参考图');
  const started=Date.now();
  const content=[{type:'text',text:prompt}];
  for(const file of [original].concat(references)){const ext=path.extname(file).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[ext];if(!mime)throw Error('原图和参考图仅支持 PNG/JPEG');const raw=prepareImage(file);content.push({type:'image_url',image_url:{url:'data:'+(raw[0]===137?'image/png':'image/jpeg')+';base64,'+raw.toString('base64')}});}
  const inputBytes=[original].concat(references).reduce((n,f)=>n+fs.statSync(f).size,0);
  const requestedAspect=options.aspectRatio||aspectRatio(original);
  const payload=JSON.stringify({model:c.model,messages:[{role:'user',content}],extra_body:{google:{image_config:{aspect_ratio:requestedAspect}}}});
  log('payload',{originalBytes:inputBytes,preparedBytes:content.slice(1).reduce((n,p)=>n+Buffer.from(p.image_url.url.split(',')[1],'base64').length,0),requestBytes:Buffer.byteLength(payload),images:content.length-1,model:c.model,requestedAspect});
  console.log('[AI] files='+inputBytes+' bytes, request='+Buffer.byteLength(payload)+' bytes, model='+c.model);
  const headers={'Authorization':'Bearer '+c.key,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)};
  let response;
  for(let attempt=1;attempt<=3;attempt++){
    try { log('attempt_start',{attempt}); response=await request(c.base+'chat/completions',payload,headers,API_TIMEOUT_MS,log); break; }
    catch(e){
      const transient=!!e.gatewayUnavailable || /HTTP 502|HTTP 503|HTTP 504|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|socket hang up/i.test(e.message||'');
      log('attempt_failed',{attempt,transient,error:e.message});
      if(!transient||attempt===3) throw e;
      await new Promise(resolve=>setTimeout(resolve,1500*attempt));
    }
  }
  const data=JSON.parse(response.toString());
  console.log('[AI] response after '+(Date.now()-started)+' ms');
  const msg=data.choices&&data.choices[0]&&data.choices[0].message, parts=msg&&msg.content; let bytes=null;
  const arr=Array.isArray(parts)?parts:[{text:parts||''}]; for(const part of arr){const u=part.image_url&& (part.image_url.url||part.image_url);if(typeof u==='string'&&u.startsWith('data:')){bytes=Buffer.from(u.split(',')[1],'base64');break;}if(typeof part.text==='string'){const m=part.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);if(m){bytes=Buffer.from(m[1],'base64');break;}const link=part.text.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)||part.text.match(/https?:\/\/[^\s]+\.(?:png|jpg|jpeg)(?:\?[^\s]*)?/i);if(link){const imageUrl=link[1]||link[0];let last;for(let attempt=1;attempt<=3;attempt++){try{log("download_start",{attempt});bytes=await download(imageUrl,60000,log);break;}catch(e){last=e;const transient=/ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|socket hang up/i.test(e.message||'');log('download_attempt_failed',{attempt,transient,error:e.message});if(!transient||attempt===3)throw e;await new Promise(resolve=>setTimeout(resolve,1000*attempt));}}if(!bytes&&last)throw last;break;}}}
  if(!bytes)throw Error('接口未返回图片内容'); const png=bytes.slice(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])); if(!png&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('接口返回内容不是 PNG/JPEG');
  try { const im=png?PNG.sync.read(bytes):jpeg.decode(bytes); log('image_dimensions',{width:im.width,height:im.height,requestedAspect}); if(options.validateAspect){const actual=im.width/im.height, want=+requestedAspect.split(':')[0]/+requestedAspect.split(':')[1]; if(Math.abs(actual/want-1)>0.01) throw Error('接口忽略比例，返回 '+im.width+'x'+im.height+'（要求 '+requestedAspect+'）');} } catch (e) { if(options.validateAspect) throw e; }
  const folder=path.join(os.homedir(),'Pictures','AI-Shoe-Results');fs.mkdirSync(folder,{recursive:true});const out=path.join(folder,Date.now()+'-'+crypto.randomBytes(4).toString('hex')+(png?'.png':'.jpg'));fs.writeFileSync(out,bytes,{flag:'wx'});log("success",{output:out});return out;
  } catch(e){log("failed",{errorType:e.name,error:e.message||String(e)});throw Error(e.message+"；诊断："+logFile);}
}
module.exports = { test, generate };
