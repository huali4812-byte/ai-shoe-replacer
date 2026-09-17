const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const version='0.3.2', name='AI-Shoe-PS2024-'+version;
const output=path.join(root,'outputs',name);
fs.mkdirSync(path.join(output,'cep'),{recursive:true});
const files=['index.html','panel.js','product-display.cjs','reference-plan.cjs','reference-guide.cjs','logo-reference.cjs','shoe-evidence.cjs','auto-generation.cjs','detail-routing.cjs','detail_patch.py','revisions.cjs','host.jsx','api.cjs','workflow.cjs','vision.cjs','vision.py','vision-runtime.json','CSInterface.js','styles.css','CSXS/manifest.xml'];
for(const f of files){const dest=path.join(output,'cep',f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,'cep',f),dest);}
fs.copyFileSync(path.join(root,'cep/rules.cjs'),path.join(output,'cep/rules.cjs'));
fs.cpSync(path.join(root,'cep/vendor'),path.join(output,'cep/vendor'),{recursive:true});
fs.copyFileSync(path.join(root,'README-0.3.0.md'),path.join(output,'README.md'));
fs.copyFileSync(path.join(root,'outputs/scan-real-psb.json'),path.join(output,'scan-real-psb.json'));
fs.copyFileSync(path.join(root,'outputs/verification/pixel-verification.json'),path.join(output,'pixel-verification.json'));
console.log(output);
