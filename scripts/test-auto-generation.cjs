const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {run}=require('../cep/auto-generation.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auto-shoe-'));
(async()=>{try{
 const input=path.join(dir,'shoe.png');fs.writeFileSync(input,'fixture');
 const planFile=path.join(dir,'ref.png');fs.writeFileSync(planFile,'ref');
 let calls=0, analyses=0;
 const api={analyze:async()=>{analyses++;throw Error('analysis adapter must not be called')},generate:async(i,refs,prompt,opts)=>{assert.equal(i,input);assert.equal(opts.maxAttempts,1);assert(refs.includes(planFile));assert(/逐只核对|实际可见面|鞋底必须/.test(prompt));const out=path.join(dir,'out.png');fs.writeFileSync(out,'candidate');calls++;return out;}};
 const task={input,shoeCount:1,product:{sku:'T',color:'silver'},material:{cutout:planFile,references:[]}};
 const output=await run({api,task,prompt:'base prompt',options:{}});
 assert.equal(output,path.join(dir,'out.png'));assert.equal(calls,1);assert.equal(analyses,0);assert.equal(task.autoGeneration.status,'received');assert.equal(task.autoGeneration.analysis,'inline_prompt_only');
 console.log('PASS inline Gemini view/detail prompt: no JSON analysis call, original input/reference flow, single generation accepted');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
