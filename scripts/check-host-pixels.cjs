const fs=require('fs'),path=require('path'),assert=require('assert');
const {PNG}=require('../cep/vendor/pngjs');const flow=require('../cep/workflow.cjs');
const root=path.join(__dirname,'../outputs/verification');const f=n=>path.join(root,n);
if(process.argv[2]==='prepare'){
 const input=flow.decode(f('original.png')),bad=new PNG({width:input.width,height:input.height});
 for(let i=0;i<bad.data.length;i+=4){bad.data[i]=255;bad.data[i+3]=255;}
 fs.writeFileSync(f('malicious-model.png'),PNG.sync.write(bad));
 console.log(flow.protect(f('original.png'),f('mask.png'),f('malicious-model.png'),f('protected-host.png')));
}else{
 const original=flow.decode(f('baseline.png')),mask=flow.decode(f('mask.png'));
 const reports=[];
 for(const filename of ['after-host.png','after-reopen.png']){
 const output=flow.decode(f(filename));assert.equal(output.width,original.width);assert.equal(output.height,original.height);
 let outsideChanged=0,insideChanged=0,protectedPixels=0;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){
  const allowed=x>=10&&x<50&&y>=10&&y<50&&mask.data[((y-10)*mask.width+x-10)*4]>0;
  const i=(y*64+x)*4,changed=!output.data.slice(i,i+4).equals(original.data.slice(i,i+4));
  if(allowed){if(changed)insideChanged++;}else{protectedPixels++;if(changed)outsideChanged++;}
 }
 assert.equal(outsideChanged,0,filename+' changed protected pixels');assert(insideChanged>0);
 reports.push({filename,protectedPixels,outsideChangedPixels:outsideChanged,insideChangedPixels:insideChanged});
 }
 fs.writeFileSync(f('pixel-verification.json'),JSON.stringify(reports,null,2));console.log(reports);
}
