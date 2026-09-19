'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
function hash(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
const output=cp.execFileSync(process.execPath,['scripts/build-cep.cjs'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).pop();
const files=['panel.js','api.cjs','failure-log.cjs','sole-reference.cjs','logo-reference.cjs','host.jsx','vision.py','vision.cjs','reference-plan.cjs','shoe-evidence.cjs','auto-generation.cjs','batch-pipeline.cjs','detail-routing.cjs','detail_patch.py','mask_polarity.py','random_pair_roles.py','revisions.cjs','styles.css'];
const rows=files.map(f=>{const source=path.join(root,'cep',f),built=path.join(output,'cep',f);if(!fs.existsSync(built))throw Error('构建缺文件：'+f);return {file:f,source:hash(source),built:hash(built),equal:hash(source)===hash(built)};});
if(rows.some(r=>!r.equal))throw Error('构建文件与源码不一致');
console.log(JSON.stringify({output,files:rows},null,2));
