const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require.resolve('../cep/api.cjs'),'utf8');
const code=source.slice(source.indexOf('async function analyze('),source.indexOf('function analysisIdentity('));
let content,payload;const ctx={Buffer,config:()=>({base:'https://example.invalid/',model:'fixture',key:'test-only'}),prepareImage:()=>Buffer.from('image'),API_TIMEOUT_MS:100,request:async(url,body)=>{payload=JSON.parse(body);return Buffer.from(JSON.stringify({choices:[{message:{content}}]}));}};
vm.runInNewContext(code,ctx);
(async()=>{for(const text of ['{"references":[]}','```json\n{"references":[]}\n```','说明\n{"references":[]}', '![image](https://example.invalid/a.png)\n{"references":[]}']){content=text;const r=await ctx.analyze(['fixture'],'p');assert(Array.isArray(r.references));assert.equal(payload.model,'fixture');assert.deepEqual(payload.modalities,['text']);}
for(const text of ['![image](https://example.invalid/image.png)','']){content=text;await assert.rejects(()=>ctx.analyze(['fixture'],'p'),/未返回JSON文字结果/);}
console.log('PASS JSON analysis protocol and explicit image-only/empty response rejection');})().catch(e=>{console.error(e);process.exitCode=1});
