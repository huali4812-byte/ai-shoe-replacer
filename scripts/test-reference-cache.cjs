const assert=require('assert'),{readComplete}=require('../cep/reference-cache.cjs');
function io({close='EBADF',short=false,readError=false,changed=false}={}){let stats=0;return {openSync:()=>3,fstatSync:()=>({size:3,mtimeMs:changed?stats++:1,ctimeMs:1,ino:1,isFile:()=>true}),readSync:(fd,b,o,n)=>{if(readError)throw Error('read failed');if(short)return 0;b.fill(1,o,o+n);return n;},closeSync:()=>{if(close)throw Object.assign(Error(close),{code:close});}};}
assert.equal(readComplete('x',io()).closeError,'EBADF');
assert.equal(readComplete('x',io({close:null})).data.length,3);
assert.throws(()=>readComplete('x',io({short:true})),/不完整/);
assert.throws(()=>readComplete('x',io({readError:true})),/read failed/);
assert.throws(()=>readComplete('x',io({changed:true})),/变化/);
assert.throws(()=>readComplete('x',io({close:'EIO'})),/EIO/);
console.log('PASS reference read guards: complete bytes, stable stat, primary error preserved, close-only EBADF distinguished');
