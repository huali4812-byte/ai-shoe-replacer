'use strict';
const assert=require('assert');
const {build}=require('../cep/reference-guide.cjs');
for(const maskFirst of [true,false]){
 const files=['unknown-a.png','unknown-b.png'];
 const r=build(files,{maskFirst});
 assert.deepEqual(r.images.filter(x=>x.role==='target-reference').map(x=>x.file),files);
 assert.equal(r.images.find(x=>x.role==='target-reference').image,maskFirst?3:2);
 for(const phrase of ['平整皮革覆盖片','不得把正常缝线抹掉','不将平整规则套用到所有鞋款','鞋舌拉环与后跟拉环','不从这些相邻部件借色','目标拉环真实为红色时仍应保留红色'])assert(r.text.includes(phrase),phrase);
 assert.equal(r.mode,'prompt_guidance_not_verified_matching');
}
console.log('PASS side/tab guidance: conditional structure, separate tab colors, reference order unchanged');
