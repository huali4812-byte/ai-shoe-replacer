'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {run}=require('../cep/local-detail.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-detail-'));
 try{
 const file=path.join(root,'input.png');fs.writeFileSync(file,'fixture');
 const task={id:'test',input:file,visionMask:file,shoeCount:1};
 let calls=0;
 const api={generate:async(i,refs,prompt,opts)=>{calls++;assert.equal(opts.maxAttempts,1);assert(fs.existsSync(refs[0]));return file;}};
 const vision={request:async q=>{fs.writeFileSync(q.output,'fixture');return {output:q.output,outsideChangedPixels:0};}};
 for(const part of ['logo','sole','sidewall','pullTab']){
 const check={decision:'retry',confidence:.95,geometryCorrect:true,otherPartsCorrect:true,surface:'inner',defects:[{part,visible:true,occluded:false,confidence:.95,box:[.1,.1,.3,.3]}]};
 const args={api,vision,task,base:file,check,entries:[{file,detail:part,surface:'inner'}],root};
 const result=await run(args);assert.equal(result.status,'candidate');assert.equal(result.semanticReview,'not_performed');
 await assert.rejects(run({...args,entries:[]}));
 if(part==='sidewall')await assert.rejects(run({...args,check:{...check,surface:'unknown'}}));
 }
 assert.equal(calls,4);console.log('PASS local part executor: bounded generation, dedicated references, sidewall unknown rejected');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
