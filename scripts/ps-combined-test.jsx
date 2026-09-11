#target photoshop
$.evalFile(new File('/Users/zhangjiabin/Documents/ps识别插件/cep/host.jsx'));
var testRoot='/Users/zhangjiabin/Documents/ps识别插件/outputs/verification';
function call(method,args){var r=eval('('+AI_Shoe_CEP.dispatch(method,args)+')');if(!r.ok)throw Error(method+': '+r.error);return r.data;}
function tag(layer,value){var s=stringIDToTypeID,desc=new ActionDescriptor(),ref=new ActionReference();ref.putIdentifier(s('layer'),layer.id);desc.putReference(s('null'),ref);var props=new ActionDescriptor();props.putEnumerated(s('color'),s('color'),s(value));desc.putObject(s('to'),s('layer'),props);executeAction(s('set'),desc,DialogModes.NO);}
var original=app.activeDocument;
var test=app.open(File(testRoot+'/baseline.png'));test.activeLayer.name='GW2000 target';tag(test.activeLayer,'red');
var hidden=test.layerSets.add();hidden.name='hidden parent';var child=hidden.artLayers.add();child.name='hidden child';tag(child,'grain');hidden.visible=false;
var copy=call('createWorking'),target=null;
for(var i=0;i<copy.tasks.length;i++)if(copy.tasks[i].role==='主推')target=copy.tasks[i];
if(!target)throw Error('fixture scan did not find red task');
if(copy.tasks.length!==1)throw Error('hidden child became task');
call('selectLayer',target);
app.activeDocument.selection.select([[10,10],[50,10],[45,45],[10,50]]);
var region=call('prepare',{id:'fixture',documentId:copy.documentId,layerId:target.layerId,sku:'GW2000',color:'藕粉',cutout:testRoot+'/cutout.png',original:testRoot+'/original.png',mask:testRoot+'/mask.png'});
call('exportPrepared',{id:'fixture',output:testRoot+'/composite.png'});
var f=File(testRoot+'/host-prepare.json');f.encoding='UTF8';f.open('w');f.write(AI_Shoe_CEP.dispatch('scan'));f.close();
app.activeDocument.name;

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
