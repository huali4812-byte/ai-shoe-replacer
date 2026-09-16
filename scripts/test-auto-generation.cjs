const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {run}=require('../cep/auto-generation.cjs'),fixture=require('./shoe-evidence-fixture.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auto-shoe-'));
(async()=>{try{
const f=path.join(dir,'shoe_t_side.png');fs.writeFileSync(f,'fixture');
const task=()=>({input:f,shoeCount:1,product:{sku:'T',color:'silver'},material:{cutout:f,references:[]}});
for(const decision of ['pass','retry','unknown']){
 let calls=0;
 const api={analyze:async(files,prompt)=>prompt.startsWith('SHOE_REVIEW_V2')?fixture.review(1,decision):fixture.analyze(files,prompt),generate:async(input,refs,prompt,opts)=>{assert.equal(input,f);assert.equal(opts.maxAttempts,1);const output=path.join(dir,'output-'+(++calls));fs.writeFileSync(output,'candidate-'+calls);return output;}};
 const t=task();const promise=run({api,task:t,prompt:'p',options:{}});
 if(decision==='pass')assert.equal(await promise,path.join(dir,'output-1'));else await assert.rejects(()=>promise);
 assert.equal(calls,decision==='retry'?2:1);assert.equal(t.autoGeneration.attempts.length,calls);
}
let calls=0;
await assert.rejects(()=>run({api:{analyze:async()=>{throw Error('unavailable')},generate:async()=>calls++},task:task(),options:{}}));assert.equal(calls,0);
console.log('PASS per-shoe preparation, accepted output, two-attempt cap, unknown blocks, original input reuse, unavailable analysis');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
