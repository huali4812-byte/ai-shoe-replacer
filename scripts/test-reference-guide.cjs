'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const generation=require('../cep/auto-generation.cjs'),guide=require('../cep/reference-guide.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c5-guide-'));
(async()=>{try{
 const files=['t_side.png','t_sideright.png','t_sole.png'].map(n=>{const f=path.join(dir,n);fs.writeFileSync(f,'mock-image');return f;});
 for(const maskFirst of [false,true]){let calls=0;const task={input:'scene.png',visionMask:'mask.png',material:{cutout:files[0],references:files.slice(1)}};
 await generation.run({task,maskFirst,prompt:'base',api:{analyze(){throw Error('analyze forbidden');},async generate(input,refs,prompt,opts){calls++;assert.equal(input,task.input);assert.deepEqual(refs,(maskFirst?[task.visionMask]:[]).concat(task.referencePlan.files));assert.equal(opts.maxAttempts,1);assert(prompt.includes('不能以“内侧”为理由删除'));assert(prompt.includes('不按画面左右、魔术贴方向或Logo有无判定'));return 'mock-output.png';}}});
 assert.equal(calls,1);const g=task.autoGeneration.referenceGuide;assert.equal(g.images.length,files.length+(maskFirst?2:1));assert.equal(g.images[maskFirst?2:1].image,maskFirst?3:2);assert.deepEqual(g.images.filter(x=>x.role==='target-reference').map(x=>x.file),task.referencePlan.files);assert.equal(g.mode,'prompt_guidance_not_verified_matching');
 }
 assert(guide.build(['a']).text.includes('图2是目标鞋款参考'));console.log('PASS C5 live run integration: exact image order, mask offset, one generation, no analyze, sidewall guidance recorded');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
