'use strict';
// Preparation is serial. Only completed parent preparations may enter generation.
// Drain in-flight work even on unexpected failure; never release the UI while paid work runs.
async function run({parents,prepare,generate,concurrency=7}){
 if(!Number.isInteger(concurrency)||concurrency<1)throw Error('Invalid pipeline concurrency');
 const active=new Set(),seen=new Set(),regions=[];
 let failure=null;
 async function capacity(){
  while(active.size>=concurrency)await Promise.race(active);
  if(failure)throw failure;
 }
 try{
  for(const parent of parents){
   await capacity();
   const prepared=await prepare(parent);
   for(const region of prepared){
    if(seen.has(region.id))continue;
    seen.add(region.id);regions.push(region);
    await capacity();
    let job;
    job=Promise.resolve().then(()=>generate(region)).catch(e=>{if(!failure)failure=e;}).finally(()=>active.delete(job));
    active.add(job);
   }
  }
 }catch(e){if(!failure)failure=e;}
 await Promise.all(active);
 if(failure)throw failure;
 return regions;
}
module.exports={run};
