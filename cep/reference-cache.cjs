'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const root=path.join(os.homedir(),'Pictures','AI-Shoe-Reference-Cache');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const stamp=s=>[s.size,s.mtimeMs,s.ctimeMs,s.ino].join(':');
function readComplete(file,io=fs){
 let fd,data,before,after,error,closeError;
 try{fd=io.openSync(file,'r');before=io.fstatSync(fd);if(!before.isFile()||before.size<=0||before.size>200*1024*1024)throw Error('参考文件尺寸不合法');data=Buffer.alloc(before.size);let offset=0;while(offset<data.length){const n=io.readSync(fd,data,offset,data.length-offset,offset);if(!n)throw Error('参考文件读取不完整');offset+=n;}after=io.fstatSync(fd);if(stamp(before)!==stamp(after))throw Error('参考文件读取期间发生变化');}
 catch(e){error=e;}finally{if(fd!==undefined)try{io.closeSync(fd);}catch(e){closeError=e;}}
 if(error)throw error;if(closeError&&closeError.code!=='EBADF')throw closeError;
 return {data,stat:after,closeError:closeError&&closeError.message};
}
function snapshot(file){
 // Local files keep their identity; only network-volume references need staging.
 if(!path.resolve(file).startsWith('/Volumes/'))return file;
 try{
 const first=readComplete(file),sha256=hash(first.data);let recovery=null;
 if(first.closeError){const second=readComplete(file);if(hash(second.data)!==sha256||stamp(second.stat)!==stamp(first.stat))throw Error('网络参考重复读取不一致');recovery={code:'EBADF',stage:'close',verifiedIndependentReads:2,errors:[first.closeError,second.closeError].filter(Boolean)};}
 const ext=path.extname(file).toLowerCase();let image;
 if(ext==='.png')image=require('./vendor/pngjs').PNG.sync.read(first.data);
 else if(['.jpg','.jpeg'].includes(ext))image=require('./vendor/jpeg-js').decode(first.data,{useTArray:true,maxResolutionInMP:40,maxMemoryUsageInMB:512});
 else throw Error('参考仅支持PNG/JPEG');
 if(!image.width||!image.height||image.width*image.height>40000000)throw Error('参考图片尺寸超限');
 if(stamp(fs.statSync(file))!==stamp(first.stat))throw Error('网络参考校验期间发生变化');
 const folder=path.join(root,hash(Buffer.from(file)),sha256);fs.mkdirSync(folder,{recursive:true});const dest=path.join(folder,path.basename(file));
 if(!fs.existsSync(dest)||hash(fs.readFileSync(dest))!==sha256){const temp=dest+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';try{fs.writeFileSync(temp,first.data,{mode:0o600});if(hash(fs.readFileSync(temp))!==sha256)throw Error('本地参考校验失败');fs.renameSync(temp,dest);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 fs.writeFileSync(dest+'.source.json',JSON.stringify({source:file,sha256,bytes:first.data.length,width:image.width,height:image.height,recovery,time:new Date().toISOString()},null,2),{mode:0o600});
 return dest;
 }catch(e){const wrapped=Error('参考素材本地校验失败：'+path.basename(file)+'；'+e.message);wrapped.code=e.code;wrapped.cause=e;throw wrapped;}
}
module.exports={snapshot,readComplete};
