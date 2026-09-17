'use strict';
const fs=require('fs');
const {PNG}=require('./vendor/pngjs');
// Only explicitly identified logo references enter here, never scene or masks.
function prepare(file){
 const raw=fs.readFileSync(file),im=PNG.sync.read(raw);
 const w=im.width,h=im.height;let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(im.data[(y*w+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 if(x1<0)throw Error('empty logo reference');
 if(x0===0&&y0===0&&x1===w-1&&y1===h-1)throw Error('no transparent margin');
 const pad=Math.max(1,Math.round(Math.max(x1-x0+1,y1-y0+1)*.02));
 x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(w,x1+1+pad);y1=Math.min(h,y1+1+pad);
 const scale=Math.min(1,1024/Math.max(x1-x0,y1-y0)),ow=Math.max(1,Math.round((x1-x0)*scale)),oh=Math.max(1,Math.round((y1-y0)*scale));
 const out=new PNG({width:ow,height:oh});
 // Bilinear sampling in premultiplied color, flattened on white.
 for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
  const sx=Math.max(x0,Math.min(x1-1,x0+(x+.5)*(x1-x0)/ow-.5)),sy=Math.max(y0,Math.min(y1-1,y0+(y+.5)*(y1-y0)/oh-.5));
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;const rgb=[0,0,0];
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const i=(Math.min(y1-1,iy+dy)*w+Math.min(x1-1,ix+dx))*4,a=im.data[i+3]/255,weight=(dx?fx:1-fx)*(dy?fy:1-fy);
   for(let c=0;c<3;c++)rgb[c]+=(im.data[i+c]*a+255*(1-a))*weight;
  }
  const j=(y*ow+x)*4;for(let c=0;c<3;c++)out.data[j+c]=Math.round(rgb[c]);out.data[j+3]=255;
 }
 return {bytes:PNG.sync.write(out),info:{mode:'alpha_subject_crop_white',sourceSize:[w,h],crop:[x0,y0,x1,y1],outputSize:[ow,oh]}};
}
module.exports={prepare};
