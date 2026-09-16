const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const e=require('../cep/shoe-evidence.cjs'),fixture=require('./shoe-evidence-fixture.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-evidence-'));
(async()=>{try{
 const file=name=>{const f=path.join(dir,name);fs.writeFileSync(f,name);return f};
 const task={input:file('input'),preview:file('preview'),visionMask:file('mask'),shoeCount:2,role:'主推',product:{sku:'11389',color:'silver'},material:{cutout:file('reference'),references:[]}};
 let calls=0;const api={analysisIdentity:()=> 'fixture-1',analyze:async(...args)=>{calls++;return fixture.analyze(...args)}};
 const cacheDir=path.join(dir,'cache');
 const [a,b]=await Promise.all([e.profile({api,task,cacheDir}),e.profile({api,task,cacheDir})]);assert.equal(calls,1);assert.equal(a.key,b.key);
 await e.profile({api,task,cacheDir});assert.equal(calls,1);
 fs.appendFileSync(task.material.cutout,'changed');await e.profile({api,task,cacheDir});assert.equal(calls,2);
 task.product.color='white';await e.profile({api,task,cacheDir});assert.equal(calls,3);
 const context=await e.prepare({api,task,cacheDir});assert.equal(context.scene.shoes.length,2);assert.equal(context.scene.shoes[0].foot,'unknown');assert.deepEqual(context.scene.shoes[0].surfaces,['inner','sole']);
 const before=calls;await e.prepare({api,task,cacheDir});assert.equal(calls,before);
 fs.appendFileSync(task.visionMask,'changed');await e.prepare({api,task,cacheDir});assert.equal(calls,before+1);
 assert.throws(()=>e.parseScene(fixture.scene(1),2),/数量/);
 for(const n of [NaN,-.1,1.1]){const v=fixture.scene();v.shoes[0].confidence=n;assert.throws(()=>e.parseScene(v,1));}
 const sole=fixture.scene();sole.shoes[0].surfaces=['sole'];assert.equal(e.parseScene(sole,1).shoes[0].foot,'unknown');
 const unknown=fixture.scene();unknown.shoes[0].surfaces=[];assert.throws(()=>e.parseScene(unknown,1));
 const duplicate=fixture.scene(2);duplicate.shoes[1].box=duplicate.shoes[0].box;assert.throws(()=>e.parseScene(duplicate,2),/重复/);
 assert.throws(()=>e.match({...context.profile,references:context.profile.references.map(r=>({...r,surfaces:['outer']}))},context.scene),/缺少明确/);
 for(const part of ['geometry','upper','sole','logo','pullTab']){const v=fixture.review(2);v.shoes[1].checks[part]='fail';v.shoes[1].reasons=['visible mismatch'];assert.equal(e.parseReview(v,context).decision,'retry');}
 const pass=fixture.review(2);assert.equal(e.parseReview(pass,context).decision,'pass'); // legitimate target inner Logo
 pass.shoes[0].checks.sole='not_visible';assert.throws(()=>e.parseReview(pass,context),/遗漏/);
 const invalid=fixture.review(2);delete invalid.shoes[0].checks.logo;assert.throws(()=>e.parseReview(invalid,context));
 const low=fixture.review(2);low.shoes[1].confidence=.4;assert.equal(e.parseReview(low,context).decision,'unknown');
 const composition={regions:[{id:'r',reviewInput:task.input,reviewOutput:file('final')}]};task.id='r';
 await e.gate({api,task,composition,cacheDir});const reviewed=calls;
 await e.gate({api,task,composition,cacheDir});assert.equal(calls,reviewed);
 fs.appendFileSync(composition.regions[0].reviewOutput,'changed');await e.gate({api,task,composition,cacheDir});assert.equal(calls,reviewed+1);
 let raw=0,final=0;const failing={...api,analyze:async(files,prompt)=>{if(!prompt.startsWith('SHOE_REVIEW_V2'))return fixture.analyze(files,prompt);const v=fixture.review(2);if(prompt.includes('阶段 final')){final++;v.shoes[0].checks.pullTab='fail';v.shoes[0].reasons=['old red tab in composite'];}else raw++;return v;}};
 task.shoeReviews={};await assert.rejects(()=>e.gate({api:failing,task,composition,cacheDir}),/最终合成/);assert.equal(task.qualityFailureStage,'composition');assert.equal(raw,1);assert.equal(final,1);
 // Same failed evidence is cached; repeatedly clicking batch does not pay again.
 await assert.rejects(()=>e.gate({api:failing,task,composition,cacheDir}));assert.equal(final,1);
 const unknownApi={...api,analyze:async()=>({})};task.shoeReviews={};await assert.rejects(()=>e.gate({api:unknownApi,task,composition,cacheDir}));
 console.log('PASS per-shoe mixed surfaces, unknown foot, required refs, target Logo semantics, malformed/low evidence, cache content invalidation and final-composite rejection');
}finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(err=>{console.error(err);process.exitCode=1});
