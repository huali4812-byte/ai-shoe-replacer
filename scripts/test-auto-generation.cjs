const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {run}=require('../cep/auto-generation.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auto-shoe-'));
(async()=>{try{
 const input=path.join(dir,'shoe.png');fs.writeFileSync(input,'fixture');
 const planFile=path.join(dir,'ref.png');fs.writeFileSync(planFile,'ref');
 let calls=0, analyses=0;
 const api={analyze:async()=>{analyses++;throw Error('analysis adapter must not be called')},generate:async(i,refs,prompt,opts)=>{assert.equal(i,input);assert.equal(opts.maxAttempts,1);assert.deepEqual(refs,[planFile]);assert(prompt.includes('唯一款式依据'));assert(prompt.includes('不得新增、复制或悬空'));assert(prompt.includes('不要输出产品图'));assert(prompt.includes('必须先清除原鞋的魔术贴'));assert(prompt.includes('参考为一条就只能生成一条'));assert(prompt.includes('绝不能残留原鞋Logo'));assert(prompt.includes('不能延伸成第二条魔术贴'));assert(prompt.includes('禁止把后跟放大为灰色硬壳'));const out=path.join(dir,'out.png');fs.writeFileSync(out,'candidate');calls++;return out;}};
 const task={input,shoeCount:1,product:{sku:'T',color:'silver'},material:{cutout:planFile,references:[]}};
 const output=await run({api,task,prompt:'base prompt',options:{}});
 assert.equal(output,path.join(dir,'out.png'));assert.equal(calls,1);assert.equal(analyses,0);assert.equal(task.autoGeneration.status,'received');assert.equal(task.autoGeneration.analysis,'inline_prompt_only');assert.equal(task.autoGeneration.referenceStrategy,'primary_plus_optional_logo_and_sole');assert.equal(task.autoGeneration.references.files.length,1);
 const composite=path.join(dir,'SKU_color_合成图.png'),pair=path.join(dir,'SKU_color_bd_pair.jpg'),bdLogo=path.join(dir,'SKU_color_bd_logo.jpg');
for(const f of [composite,pair,bdLogo])fs.copyFileSync(input,f);
let four;
await run({api:{generate:async(original,refs,prompt,options)=>{four={original,refs,prompt,options};return input;}},task:{input,shoeCount:2,material:{cutout:planFile,references:[composite,pair,bdLogo]}},prompt:'旧提示不应进入四图模式'});
assert.equal(four.original,composite);assert.deepEqual(four.refs,[pair,input,bdLogo]);assert.equal(four.prompt,'图1、图2两张图为同一款鞋子，把这款鞋子的所有元素如配色、Logo、印花、纹理、材质等1:1还原，穿到图3脚上，鞋身Logo文字细节以图4为准；图4仅提供Logo文字细节，不复制图4中魔术贴打开或展开的状态，魔术贴保持图3中每只鞋原有的闭合状态、方向和遮挡。');assert.deepEqual(four.options.logoReferenceIndices,[2]);
console.log('PASS inline Gemini view/detail prompt and catalog four-image mode: fixed image order, short user prompt, single generation accepted');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
