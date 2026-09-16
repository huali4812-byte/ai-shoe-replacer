const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {run}=require('../cep/auto-generation.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'detail-gen-'));
(async()=>{try{const input=path.join(dir,'input.png'),ref=path.join(dir,'shoe_logo.png');fs.writeFileSync(input,'fixture');fs.writeFileSync(ref,'ref');let g=0;
const api={analyze:async()=>{throw Error('analysis adapter must not be called')},generate:async(src,refs,prompt,opts)=>{assert.equal(src,input);assert.equal(opts.maxAttempts,1);assert(/Logo|可见内侧/.test(prompt));g++;const out=path.join(dir,'candidate-'+g);fs.writeFileSync(out,'candidate-'+g);return out;}};
const task={input,shoeCount:1,product:{sku:'T',color:'silver'},material:{cutout:ref,references:[]}};
const output=await run({api,task,prompt:'original',options:{}});
assert.equal(output,path.join(dir,'candidate-1'));assert.equal(g,1);assert.equal(task.autoGeneration.status,'received');console.log('PASS inline detail prompt without separate JSON review');
}finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
