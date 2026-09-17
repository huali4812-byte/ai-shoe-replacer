const fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),assert=require('assert');
const {EventEmitter}=require('events');
const {PNG}=require('../cep/vendor/pngjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-recovery-'));
const png=PNG.sync.write(new PNG({width:2,height:2}));
fs.mkdirSync(path.join(root,'.kaienapi'));fs.writeFileSync(path.join(root,'.kaienapi/config.json'),JSON.stringify({api_key:'mock',base_url:'https://mock.invalid'}));
const input=path.join(root,'input.png');fs.writeFileSync(input,png);
let posts=0,gets=0,fail=true;
const https={request(url,options,cb){const req=new EventEmitter();req.end=()=>{posts++;process.nextTick(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={};cb(res);res.emit('data',Buffer.from(JSON.stringify({choices:[{message:{content:'![](https://mock.invalid/result.png)'}}]})));res.emit('end');req.emit('close');});};req.destroy=e=>req.emit('error',e);return req;},get(url,cb){gets++;const req=new EventEmitter();req.setTimeout=()=>{};process.nextTick(()=>{if(fail){req.emit('error',Object.assign(Error('connect ETIMEDOUT'),{code:'ETIMEDOUT'}));return;}const res=new EventEmitter();res.statusCode=200;cb(res);res.emit('data',png);res.emit('end');});return req;}};
function load(){const ctx={module:{exports:{}},Buffer,URL,console:{log(){}},setTimeout:(fn,ms)=>ms<30000?setTimeout(fn,0):setTimeout(fn,ms),clearTimeout,require:n=>n==='https'?https:n==='os'?{homedir:()=>root}:n.startsWith('./')?require('../cep/'+n):require(n)};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cep/api.cjs'),'utf8'),ctx);return ctx.module.exports;}
(async()=>{try{
await assert.rejects(load().generate(input,[input],'same'),/ETIMEDOUT/);assert.equal(posts,1);assert.equal(gets,3);
const cache=path.join(root,'Pictures/AI-Shoe-Results/pending-downloads');assert.equal(fs.readdirSync(cache).length,1);
assert.equal(fs.statSync(path.join(cache,fs.readdirSync(cache)[0])).mode&0o777,0o600);
fail=false;const out=await load().generate(input,[input],'same');assert(fs.readFileSync(out).equals(png));assert.equal(posts,1);assert.equal(gets,4);assert.equal(fs.readdirSync(cache).length,0);
await load().generate(input,[input],'different');assert.equal(posts,2);
console.log('PASS: three download failures, restart recovery without generation, private cache, cleanup, changed request isolated');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
