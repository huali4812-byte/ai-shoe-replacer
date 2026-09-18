'use strict';
const assert=require('assert');
const guide=require('../cep/reference-guide.cjs');
for(const maskFirst of [false,true]){
 const g=guide.build(['target.png'],{maskFirst});
 assert.equal(g.schemaVersion,4);assert.equal(g.mode,'prompt_guidance_not_verified_matching');
 for(const text of ['魔术贴颜色锁定','魔术贴表面、包边、缝线、Logo字标和连接端分别取色','鞋带孔小织带','黑色中央条纹','此例不是所有款式的固定颜色','参考本为织物或哑光时不能添加金属效果','不返回分析或评分'])assert(g.text.includes(text));
 assert.equal(g.images.length,maskFirst?3:2);
 assert.equal(g.images[g.images.length-1].file,'target.png');
}
console.log('PASS component color guide: conditional palette, material rules, image count/index unchanged, guidance not semantic review');
