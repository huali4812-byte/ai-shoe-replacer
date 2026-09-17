const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),vm=require('vm'),{createRequire}=require('module');
const plan=require('../cep/reference-plan.cjs'),guide=require('../cep/reference-guide.cjs');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-side-'));try{
 const items=['side','back','heel','logo','sole','sideright'].map((view,id)=>({id:String(id),name:'GB2616_中灰-豆米-月灰_t_'+view,ext:'png'}));
 for(const i of items){const f=path.join(dir,'images',i.id+'.info',i.name+'.png');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'fixture');}
 const filename=path.resolve(__dirname,'../cep/workflow.cjs'),m={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\neagleSearch=async()=>TEST_ITEMS;', {require:createRequire(filename),module:m,exports:m.exports,Buffer,process,setTimeout,TEST_ITEMS:items});
 const [material]=await m.exports.indexLibrary(dir,null,[{sku:'GB2616',color:'中灰/豆米/月灰'}]);
 assert.equal(material.references.length,5);
 const p=plan.plan(material);assert.equal(p.entries.find(e=>e.file.endsWith('_t_back.png')).view,'inner');assert.equal(p.entries.find(e=>e.file.endsWith('_t_side.png')).view,'outer');assert.equal(p.entries.find(e=>e.file.endsWith('_t_heel.png')).view,'back');
 assert.equal(plan.classify('generic_back.png').view,'back');
 for(const maskFirst of [false,true]){const g=guide.build(p.files,{maskFirst,entries:p.entries});assert(g.text.includes('命名约定为内侧参考'));assert(g.text.includes('命名约定为外侧参考'));assert(g.text.includes('命名约定为后跟参考'));}
 const renamed=path.join(dir,'input-3.png');fs.writeFileSync(renamed,'fixture');assert.equal(plan.plan({cutout:renamed,referenceMetadata:{[renamed]:plan.classify('GB2616_x_t_back.png')}}).entries[0].view,'inner');
 console.log('PASS real workflow selection via mocked Eagle, catalog mapping, explicit guide and renamed metadata');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
