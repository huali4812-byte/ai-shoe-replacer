#target photoshop
$.evalFile(new File(File($.fileName).parent.parent.fsName+'/cep/host.jsx'));
var testRoot=File($.fileName).parent.parent.fsName+'/outputs/verification';
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
