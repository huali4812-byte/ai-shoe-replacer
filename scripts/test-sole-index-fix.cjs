const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {run}=require('../cep/auto-generation.cjs');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sole-index-'));try{
const files=['side.png','back.png','sole.png','heel.png'].map(n=>{const p=path.join(dir,n);fs.writeFileSync(p,'mock '+n);return p;});
let log,prompt,refs;
await run({
  task:{shoeCount:2,input:files[0],material:{cutout:files[0],references:files.slice(1)}},
  prompt:'test',
  record:r=>{log=r},
  api:{generate:async(input,r,p,opts)=>{refs=r;prompt=p;return 'out';}}
});
assert(log.soleReferenceIndices.length===1,'should find one sole');
const soleIdx=log.soleReferenceIndices[0];
assert(refs[soleIdx].endsWith('sole.png'),'sole index should point to sole.png, got '+refs[soleIdx]);
assert(prompt.includes('图'+(soleIdx+1)),'prompt should reference correct image number');
assert(prompt.includes('必须严格按该图的外底纹路'),'strengthened sole instruction');
assert(prompt.includes('不得替换成波浪纹、人字纹或其他通用纹路'),'explicit pattern rejection');
console.log('PASS sole index correctly identifies sole.png position, strengthened pattern instruction');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
