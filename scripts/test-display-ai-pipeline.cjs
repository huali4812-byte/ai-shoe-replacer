const fs=require('fs'),vm=require('vm'),assert=require('assert'),os=require('os'),path=require('path');
const s=fs.readFileSync(require.resolve('../cep/panel.js'),'utf8');const body=s.slice(s.indexOf('  async function applyDisplayAI'),s.indexOf('  function matchAll'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'display-pipeline-'));
let fingerprint="hash";const output=path.join(dir,"generated.png");fs.writeFileSync(output,"image");
let generation=0,write=0,fail=true;const product={id:'p',sku:'S',color:'C'},svc={prepareAIPlan:async()=>({slots:[{id:1,file:'bd',alphaFile:'t'}]}),verifyPlan(){},outputFingerprint:()=>fingerprint};
const ctx={fs,path,state:{products:[product],targetSku:'S'},displayService:()=>svc,render(){},host:async(method)=>{if(method==='prepareProductDisplayAI')return {id:'slot',size:[100,100]};write++;if(fail)throw Error('mock PS write failure');return {};},api:{generate:async()=>{generation++;return output;}}};
vm.runInNewContext(body+';this.run=applyDisplayAI',ctx);
(async()=>{try{
const row={id:1,productId:'p'},t={id:'t',name:'产品展示/1',displayMaterials:[],displayRows:[row]};
await ctx.run(t,dir);assert.equal(write,0);assert(!row.written);assert.equal(row.slotResults[1].review,'pending');
await ctx.run(t,dir);assert.equal(generation,1);assert.equal(write,0);
row.slotResults[1].review='rejected';await ctx.run(t,dir);assert.equal(write,0);assert.equal(generation,1);
const approve=()=>Object.assign(row.slotResults[1],{review:'approved',approvedHash:fingerprint,approvedReference:undefined,approvedProduct:'p'});
approve();fingerprint='changed';await ctx.run(t,dir);assert.equal(write,0);assert.equal(row.slotResults[1].review,'pending');
approve();await ctx.run(t,dir);assert.equal(row.failure.phase,'write_slot');assert(!row.written);
fail=false;await ctx.run(t,dir);assert.equal(generation,1);assert(row.written);assert.equal(write,2);
await ctx.run(t,dir);assert.equal(write,2);
console.log('PASS: pending/rejected never write, changed file invalidates approval, approved write retry reuses output, written skipped');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
