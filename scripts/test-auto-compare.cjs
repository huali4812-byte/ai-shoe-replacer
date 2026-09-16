// Offline control-flow checks; does not prove Photoshop's visual arrangement.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
for(const relative of ['cep/host.jsx','outputs/before-auto-compare/candidate/host.jsx']){
 const file=path.join(root,relative);if(!fs.existsSync(file))continue;
 const source=fs.readFileSync(file,'utf8');new vm.Script(source.replace(/^#target.*$/mg,''));
 const start=source.indexOf('arrangeComparison:function(a){');
 const body=source.slice(start+'arrangeComparison:'.length,source.indexOf('    selectLayer:function',start)).trim().replace(/,$/,'');
 function run({missing=false,fail=false,registered=true}={}){
  const original={id:1},copy={id:2},other={id:3},calls=[];let active=other;
  const app={documents:missing?[copy,other]:[original,copy,other],get activeDocument(){return active},set activeDocument(d){active=d;calls.push(d.id)},runMenuItem(id){calls.push(id);active=other;if(fail)throw Error('menu unavailable')}};
  const action=vm.runInNewContext('('+body+')',{app,working:registered?{2:{sourceId:1}}:{},s:x=>x});
  let result,error;try{result=action({documentId:2})}catch(e){error=e}
  return {result,error,active,copy,calls,app};
 }
 let r=run();assert(r.result.arranged);assert.equal(r.active,r.copy);assert.deepEqual(r.calls,[1,2,'2upVertical',2]);assert.equal(r.app.documents.length,3);
 r=run({fail:true});assert(!r.result.arranged);assert(r.result.reason.includes('menu unavailable'));assert.equal(r.active,r.copy);
 r=run({missing:true});assert(!r.result.arranged);assert(!r.calls.includes('2upVertical'));assert.equal(r.active,r.copy);
 r=run({registered:false});assert(r.error);assert(!r.calls.includes('2upVertical'));
 console.log('PASS',relative,'restores work document; missing source/menu failure handled; unregistered document rejected');
}
