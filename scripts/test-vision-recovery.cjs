const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path'),{EventEmitter}=require('events');
function harness(behaviors){let count=0;const procs=[];const cp={spawn(){const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stdin=new EventEmitter();const behavior=behaviors[count++];p.stdin.write=()=>setImmediate(()=>behavior(p));p.kill=()=>setImmediate(()=>p.emit('exit',null,'SIGTERM'));procs.push(p);return p;}};const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cep/vision.cjs'),'utf8'),{module:m,require:n=>n==='child_process'?cp:n==='fs'?{existsSync:()=>true,readFileSync:()=>JSON.stringify({python:'/python',architecture:'arm64'})}:n==='./failure-log.cjs'?{event(){},failure(){}}:require(n),__dirname,console,process,setTimeout,clearTimeout});return {api:m.exports,count:()=>count,procs};}
const ok=p=>p.stdout.emit('data',JSON.stringify({ok:true,data:{regions:[]}})+'\n');
(async()=>{
 let h=harness([p=>p.emit('exit',null,'SIGKILL'),ok]);await assert.rejects(h.api.request({action:'detect'}),/SIGKILL/);assert.equal(h.count(),1);await h.api.request({action:'detect'});assert.equal(h.count(),2);h.api.close();
 h=harness([p=>p.stdout.emit('data','{"ok":false,"error":"uncertain"}\n')]);await assert.rejects(h.api.request({action:'detect'}),/uncertain/);assert.equal(h.count(),1);h.api.close();
 h=harness([p=>p.emit('exit',null,'SIGKILL')]);await assert.rejects(h.api.request({action:'compose_parent'}),/SIGKILL/);assert.equal(h.count(),1);
 h=harness([()=>{}]);const pending=h.api.request({action:'detect'});await new Promise(r=>setImmediate(r));h.api.close();await assert.rejects(pending,/主动关闭/);assert.equal(h.count(),1);
 console.log('PASS no automatic detect retry; explicit next request recovery, signal, late exit isolation, no semantic/compose/close retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
