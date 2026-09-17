'use strict';
// Explicit sole references only. Reuse tested alpha crop, premultiplied bilinear
// resampling and white flattening; never apply to scene images or masks.
const subject=require('./logo-reference.cjs');
function prepare(file){
 const result=subject.prepare(file);
 return {bytes:result.bytes,info:{...result.info,kind:'sole'}};
}
module.exports={prepare};
