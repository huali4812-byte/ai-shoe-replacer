const fs=require('fs'),vm=require('vm'),assert=require('assert');
const host=fs.readFileSync(require.resolve('../cep/host.jsx'),'utf8');
const start=host.indexOf('        var outer=find(parent.layers,t.layerId),contextText=');
const code=host.slice(start,host.indexOf('        var sourceFile=',start));
function classify(texts,dual=false){const siblings=texts.map(x=>({visible:true,kind:'text',typename:'ArtLayer',textItem:{contents:x}}));const c={find:()=>({parent:{typename:'LayerSet',layers:siblings}}),parent:{layers:[]},t:{layerId:1},a:{dualRole:dual},LayerKind:{TEXT:'text'}};vm.runInNewContext(code,c);return c.sceneType;}
assert.equal(classify(['❶ 大底后2/3内置加固片','❷ 加固后跟杯']),'shoe_structure');
assert.equal(classify(['底踝协同系统']),'person');
assert.equal(classify(['内置加固片']),'person');
assert.equal(classify(['内置加固片','加固后跟杯'],true),'person');
const panel=fs.readFileSync(require.resolve('../cep/panel.js'),'utf8');
assert((panel.match(/sceneType:t.protection.sceneType/g)||[]).length>=2,'initial and retry detect use scene type');
const a=panel.indexOf('      const structure=t.protection'),b=panel.indexOf("      t.generationState='received'",a);
async function run(sceneType,dual){let call;const c={t:{id:'x',input:'source',protection:{sceneType},dualRole:dual,visionMask:'mask',material:{cutout:'cutout',references:['ref']},product:{sku:'sku',color:'color'}},prompt:'ordinary',api:{generate:async(...args)=>{call=args;return 'result'}}};await vm.runInNewContext('(async()=>{'+panel.slice(a,b)+'})()',c);assert.equal(call[1][0],sceneType==='shoe_structure'||dual?'mask':'cutout');assert.equal(call[2]==='ordinary',sceneType!=='shoe_structure');}
(async()=>{await run('shoe_structure',false);await run('person',false);await run('person',true);console.log('PASS: structural callouts, person/dual exclusions, initial/retry mode and AI mask/prompt routing');})().catch(e=>{console.error(e);process.exit(1)});
