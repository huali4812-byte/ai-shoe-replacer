const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {classify,plan}=require('../cep/reference-plan.cjs');
assert.equal(classify('GW2003_t_sideright.png').view,'side-right');
assert.equal(classify('GW2003_t_logo.png').detail,'logo');
assert.equal(classify('outside.png').view,'unknown');
assert.equal(classify('GW2003_鞋底.png').detail,'sole');
assert.equal(classify('GW2003_鞋头包头.png').detail,'toe');
assert.equal(classify('GW2003_鞋面魔术贴.png').detail,'upper');
assert.equal(classify('GW2003_品牌字标.png').detail,'logo');
assert.equal(classify('GW2003_后跟提拉环.png').view,'back');
assert.equal(classify('GW2003_内侧.png').view,'side');
assert.equal(classify('GW2003_外侧.png').view,'side');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'refs-'));
try{
const files=['shoe_t_side.png','shoe_t_sole.png','shoe_t_logo.png'].map(n=>{const f=path.join(dir,n);fs.writeFileSync(f,n);return f;});
const material={cutout:files[0],references:files.slice(1)};
assert.deepEqual(plan(material).files,files);
assert.equal(plan(material,{view:'sole'}).files[0],files[1]);
assert.equal(plan(material,{view:'back'}).viewMatched,false);
assert.equal(plan(material).entries[0].sha256.length,64);
assert.throws(()=>plan({cutout:path.join(dir,'missing.png')}));
console.log('PASS classification, stable fallback, view ordering, hashes and missing files');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
