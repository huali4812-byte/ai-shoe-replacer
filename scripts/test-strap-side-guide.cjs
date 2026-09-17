'use strict';
const assert=require('assert'),{build}=require('../cep/reference-guide.cjs');
for(const maskFirst of [false,true]){
 const files=['target-side.png','target-back.png'];
 const guide=build(files,{maskFirst,entries:[{file:files[1],view:'inner',evidence:'user_catalog_convention'}]});
 for(const text of ['固定端、回折端、圆角贴合端','禁止从原鞋或另一侧参考复制环扣','不能规定所有鞋款内侧都没有环扣','不可通过有无环扣反推场景内外侧','后跟提拉环误作魔术贴环扣删除'])assert(guide.text.includes(text));
 assert(guide.text.includes('图'+(maskFirst?4:3)+'按本资源库已确认命名约定为内侧参考'));
 assert.deepEqual(guide.images.filter(x=>x.role==='target-reference').map(x=>x.file),files);
 assert.equal(guide.mode,'prompt_guidance_not_verified_matching');
}
console.log('PASS strap connection guidance, conditional ring preservation, no side inference, pull-tab distinction, catalog image offsets unchanged');
