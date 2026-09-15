const fs=require('fs'),path=require('path'),assert=require('assert'),svc=require('../cep/product-display.cjs'),flow=require('../cep/workflow.cjs');
(async()=>{
 const report=JSON.parse(fs.readFileSync(process.argv[2]));const dest=path.resolve('outputs/display-diagnosis-20260915');const results=[];
 for(const t of report.productDisplays.filter(t=>t.displayRows)){
  const row=t.displayRows[0],entry=t.displayMaterials.find(e=>svc.colorKey(e.color)===svc.colorKey(t.roleProducts['主推'].color));
  // Replay all three actual Eagle colors, without Photoshop or API calls.
  const colors=[...new Set(t.displayMaterials.map(e=>e.color))];
  const color=colors[results.length];const product={id:'replay-'+results.length,sku:'GW/Y/Z2003',color};
  const plan=await svc.prepareAIPlan(row,product,t.displayMaterials,path.join(dest,'references'));svc.verifyPlan(plan);assert.equal(plan.slots.length,3);
  results.push({rowId:row.id,color,slots:plan.slots.map(s=>{const im=flow.decode(s.file);assert(Math.max(im.width,im.height)<=1536);return {view:s.view,size:[im.width,im.height],source:s.originalFile,prepared:s.file};})});
 }
 assert.equal(results.length,3);fs.writeFileSync(path.join(dest,'replay.json'),JSON.stringify(results,null,2));console.log('PASS: actual Eagle 3 colors / 9 views preprocessed, decoded and fingerprint verified; no AI requests');
})().catch(e=>{console.error(e);process.exitCode=1});
