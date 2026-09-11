#target photoshop
var testRoot='/Users/zhangjiabin/Documents/ps识别插件/outputs/verification';
function call(method,args){var r=eval('('+AI_Shoe_CEP.dispatch(method,args)+')');if(!r.ok)throw Error(method+': '+r.error);return r.data;}
var d=app.activeDocument;
call('apply',{id:'fixture',output:testRoot+'/protected-host.png'});
call('exportCanvas',{documentId:d.id,output:testRoot+'/after-host.png'});
var file=File(testRoot+'/roundtrip-'+new Date().getTime()+'.psb');call('saveCopy',{documentId:d.id,output:file.fsName});
var reopened=app.open(file);reopened.flatten();reopened.saveAs(File(testRoot+'/after-reopen.png'),new PNGSaveOptions(),true,Extension.LOWERCASE);reopened.close(SaveOptions.DONOTSAVECHANGES);
app.activeDocument=d;d.close(SaveOptions.DONOTSAVECHANGES);
for(var i=app.documents.length-1;i>=0;i--)if(app.documents[i].name==='baseline.png')app.documents[i].close(SaveOptions.DONOTSAVECHANGES);
'applied, saved and reopened';
