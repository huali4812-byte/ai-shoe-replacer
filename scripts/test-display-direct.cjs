const fs=require('fs'),vm=require('vm'),assert=require('assert'),os=require('os'),path=require('path');
const s=fs.readFileSync(require.resolve('../cep/panel.js'),'utf8');
const body=s.slice(s.indexOf('  async function applyDisplay(t,'),s.indexOf('  async function updateDisplayTitle'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'display-direct-'));
let writes=0,fail=false;const product={id:'p',sku:'S',color:'C'};
const ctx={fs,path,state:{products:[product],targetSku:'S'},render(){},displayService:()=>({makePlan(row,p){assert(p);return {product:p,slots:[]};},verifyPlan(){}}),host:async(method,args)=>{assert.equal(method,'applyProductDisplayRow');assert.equal(args.plan.product.color,'C');writes++;if(fail)throw Error('write failed');return {};},api:{generate(){throw Error('AI forbidden');},analyze(){throw Error('AI forbidden');}}};
vm.runInNewContext(body+';this.run=applyDisplay',ctx);
(async()=>{try{const row={id:1,productId:'p'},t={id:'t',displayMaterials:[],displayRows:[row]};fail=true;await ctx.run(t,dir);assert(!row.written);fail=false;await ctx.run(t,dir);assert(row.written&&t.written);await ctx.run(t,dir);assert.equal(writes,2);assert(s.includes('displayWrites+=await applyDisplay(t,dir)'));assert(s.includes('const count=await applyDisplay(t,dir)'));console.log('PASS direct Eagle routing, write failure retry, no duplicate writes, zero AI');}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
