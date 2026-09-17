'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../cep/product-display.cjs'),'utf8');
const staged=[],reads=[];let fail=false,changed=false;
const local=f=>{assert(f.startsWith('/local/'),'Network path reached downstream: '+f);reads.push(f);};
const flow={imageDimensions:f=>{local(f);return {width:10,height:10};},decode:f=>{local(f);const data=Buffer.alloc(400);for(let y=2;y<8;y++)for(let x=2;x<8;x++)data[(y*10+x)*4+3]=255;return {width:10,height:10,data};},fingerprint:f=>{local(f);return f+(changed?'changed':'');}};
const cache={snapshot:f=>{if(fail)throw Error('cache validation failed');staged.push(f);return '/local/'+path.basename(f);}};
const box={module:{exports:{}},require:n=>n==='./workflow.cjs'?flow:n==='./reference-cache.cjs'?cache:require(n)};
vm.runInNewContext(source,box);const svc=box.module.exports;
const product={sku:'S',color:'C'},entries=[];
for(const view of ['pair','back','sole'])for(const kind of ['bd','t'])entries.push({view,kind,color:'C',file:'/Volumes/library/'+view+'-'+kind+'.png'});
const row={id:1,color:'C',slots:['pair','back','sole'].map(view=>({view,targetBox:[0,0,6,6]}))};
(async()=>{
 const plan=svc.makePlan(row,product,entries);assert.equal(staged.length,6);svc.verifyPlan(plan);
 for(const s of plan.slots){assert(s.file.startsWith('/local/'));assert(s.alphaFile.startsWith('/local/'));}
 assert(entries.every(e=>e.file.startsWith('/Volumes/')),'Do not mutate old task entries');
 const resolved=await svc.resolveSubjectFrames({slots:[{view:'pair',fitMode:'source_subject_pending',sourceProduct:product,sourceCanvas:[0,0,10,10]}]},'unused',async()=>entries);
 const evidence=resolved.slots[0].sourceEvidence;assert(evidence.photo.startsWith('/local/'));assert(evidence.transparent.startsWith('/local/'));
 changed=true;assert.throws(()=>svc.verifyPlan(plan),/发生变化/);changed=false;
 fail=true;const previous=reads.length;assert.throws(()=>svc.makePlan(row,product,entries),/cache validation failed/);assert.equal(reads.length,previous);
 console.log('PASS display cache: old entries staged, downstream paths local, source evidence local, cache errors stop, fingerprint checks preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
