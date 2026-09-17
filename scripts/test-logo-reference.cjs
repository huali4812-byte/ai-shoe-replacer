const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {PNG}=require('../cep/vendor/pngjs'),{prepare}=require('../cep/logo-reference.cjs');
const {run}=require('../cep/auto-generation.cjs');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'logo-ref-'));try{
 const f=path.join(dir,'target_logo.png'),p=new PNG({width:100,height:100});p.data.fill(0);
 for(let y=40;y<60;y++)for(let x=30;x<70;x++){let i=(y*100+x)*4;p.data[i]=255;p.data[i+3]=128;}
 fs.writeFileSync(f,PNG.sync.write(p));const before=fs.readFileSync(f),r=prepare(f),out=PNG.sync.read(r.bytes);
 assert.deepEqual(r.info.crop,[29,39,71,61]);assert.equal(out.width,42);assert.equal(out.data[3],255);assert.equal(out.data[0],255);assert(fs.readFileSync(f).equals(before));
 const opaque=path.join(dir,'opaque.png');p.data.fill(255);fs.writeFileSync(opaque,PNG.sync.write(p));assert.throws(()=>prepare(opaque),/no transparent/);
 for(const maskFirst of [false,true]){let called=0;await run({api:{generate:async(i,refs,prompt,opts)=>{called++;assert.deepEqual(opts.logoReferenceIndices,[maskFirst?2:1]);return f;}},task:{input:opaque,visionMask:opaque,material:{cutout:opaque,references:[f]}},prompt:'test',maskFirst});assert.equal(called,1);}
 const renamed=path.join(dir,'input-4.png');fs.copyFileSync(f,renamed);
 await run({api:{generate:async(i,refs,prompt,opts)=>{assert.deepEqual(opts.logoReferenceIndices,[1]);return f;}},task:{input:opaque,material:{cutout:opaque,references:[renamed],logoReferences:[renamed]}},prompt:'test'});
 console.log('PASS logo alpha crop, no enlargement, original unchanged, mask offset and renamed role');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
