'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-local-rev-')),py=path.join(root,'.shoe-vision-venv/bin/python');
const files={source:'source.png',mask:'mask.png',part:'part-mask.png',preview:'preview.png',side:'SKU_t_side.png',sole:'SKU_t_sole.png',logo:'SKU_t_logo.png'};
for(const [k,v] of Object.entries(files))files[k]=path.join(tmp,v);
cp.execFileSync(py,['-c',`from PIL import Image,ImageDraw
import sys
for p,c in [(sys.argv[1],'white'),(sys.argv[4],'gray'),(sys.argv[5],'red'),(sys.argv[6],'blue'),(sys.argv[7],'green')]: Image.new('RGB',(80,80),c).save(p)
Image.new('L',(80,80),255).save(sys.argv[2])
m=Image.new('L',(80,80),0); ImageDraw.Draw(m).rectangle((20,50,60,75),fill=255);m.save(sys.argv[3])`,files.source,files.mask,files.part,files.preview,files.side,files.sole,files.logo]);
let generated=[];
const vision={request:async o=>{if(o.action==='diagnose_result')return {passed:true};if(o.action==='compose_parent'){const out=path.join(path.dirname(o.output),'composed.png');fs.copyFileSync(o.source,out);return {output:out,size:[80,80],regions:o.regions.map(r=>({id:r.id,output:r.output,box:r.box})),rejected:[]};}throw Error('unexpected vision '+o.action);}};
const api={generate:async(input,refs,prompt,options)=>{generated.push({input,refs,prompt,options});const out=path.join(tmp,'generated-'+generated.length+'.png');fs.copyFileSync(files.preview,out);return out;}};
const host=async()=>({layerId:9});
const svc=require('../cep/revisions.cjs').createRevisions({api,vision,host,root:path.join(tmp,'versions')});
const material={cutout:files.side,references:[files.sole,files.logo],referenceMetadata:{[files.side]:{view:'outer',detail:'overall'},[files.sole]:{view:'sole',detail:'sole'},[files.logo]:{view:'unknown',detail:'logo'}},logoReferences:[files.logo]};
const p={id:'p',documentId:1,layerId:2,dualRole:false},r={id:'r',documentId:1,layerId:2,role:'主推',shoeCount:1,product:{sku:'SKU',color:'red'},material,input:files.source,visionMask:files.mask,exportBox:[0,0,80,80],protection:{sourceFile:files.source},preview:files.preview,written:false};p.children=[r];
(async()=>{
 await assert.rejects(()=>svc.generate(p,r,{part:'sole',note:'还原纹路'}),/局部选区/);assert.equal(generated.length,0);
 await svc.generate(p,r,{part:'sole',change:'structure',partMask:files.part,note:'还原鞋底纹路'});assert.equal(generated.length,1);assert.equal(generated[0].refs.length,2);assert(generated[0].prompt.includes('仅修改白色蒙版内的鞋底'));assert(generated[0].prompt.includes('还原鞋底纹路'));assert(r.revisionCandidate.selectedReferences.every(x=>x===files.sole));assert.equal(r.revisionCandidate.editMask.endsWith('input-1.png'),true);svc.discard(r);
 await svc.generate(p,r,{part:'logo',change:'color',partMask:files.part,note:'只改Logo颜色'});assert.equal(generated.length,2);assert(r.revisionCandidate.selectedReferences.every(x=>x===files.logo));assert(generated[1].prompt.includes('保持原有几何结构'));assert(generated[1].options.logoReferenceIndices.length===1);console.log('PASS: localized sole/logo revisions require mask, filter references, and preserve non-selected geometry');
 fs.rmSync(tmp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1});
