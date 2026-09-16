#target photoshop
var AI_Shoe_CEP = (function () {
  var s = stringIDToTypeID, c = charIDToTypeID, working = {}, prepared = {}, protections = {}, smartTasks = {}, smartTaskParents = {}, regionTasks = {};
  function smartTask(id){
    if(smartTasks[id]){if(smartTasks[id].recoveryBlocked)throw Error('上次回滚未完成，任务已锁定；请保留文档并检查后重新建立工作副本');return smartTasks[id];}
    var idx=id.lastIndexOf('-r');
    if(idx>0){var base=id.slice(0,idx);if(smartTasks[base]){if(smartTasks[base].recoveryBlocked)throw Error('上次回滚未完成，任务已锁定');return smartTasks[base];}}
    return null;
  }
  function json(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\x00-\x1f]/g, function (x) { return '\\u' + ('0000' + x.charCodeAt(0).toString(16)).slice(-4); }) + '"';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    var a = [], k;
    if (v instanceof Array) { for (k = 0; k < v.length; k++) a.push(json(v[k])); return '[' + a.join(',') + ']'; }
    for (k in v) if (v.hasOwnProperty(k)) a.push(json(k) + ':' + json(v[k]));
    return '{' + a.join(',') + '}';
  }
  function documentFor(id, requireWorking) {
    if (!app.documents.length) throw Error('请先打开 PSB');
    var d = app.activeDocument;
    if (id && d.id !== id) throw Error('文档已切换，请回到对应工作副本');
    if (requireWorking && !working[d.id]) throw Error('请先创建工作副本，不能直接写入原始文档');
    return d;
  }
  function activatePreparedParent(id){
    if(!id||!working[id])throw Error('未登记的工作副本，禁止自动切换或写入');
    for(var i=0;i<app.documents.length;i++){
      if(app.documents[i].id===id){app.activeDocument=app.documents[i];return documentFor(id,true);}
    }
    throw Error('对应工作副本已关闭，请重新创建工作副本');
  }
  function rgb(d) { d.activeChannels = d.componentChannels; }
  function bounds(layer) { var a = layer.bounds, b = []; for (var i = 0; i < 4; i++) b.push(a[i].as('px')); return b; }
  function find(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; if (list[i].typename === 'LayerSet') { var r = find(list[i].layers, id); if (r) return r; } }
    return null;
  }
  function label(layer) {
    var ref = new ActionReference(); ref.putIdentifier(s('layer'), layer.id);
    var desc = executeActionGet(ref);
    if (!desc.hasKey(s('color'))) throw Error('图层描述符没有 color 字段');
    return typeIDToStringID(desc.getEnumerationValue(s('color')));
  }
  function isVectorSmart(layer) {
    if (!layer || layer.kind !== LayerKind.SMARTOBJECT) return false;
    try {
      var ref=new ActionReference();ref.putIdentifier(s('layer'),layer.id);var d=executeActionGet(ref);
      if(d.hasKey(s('smartObject'))){var so=d.getObjectValue(s('smartObject'));if(so.hasKey(s('fileReference'))){var f='';try{f=so.getString(s('fileReference'));}catch(pathType){f=String(so.getPath(s('fileReference')));}if(/\.(ai|pdf|eps|svg)(?:$|\?)/i.test(f))return true;}}
      return /矢量智能对象|\.ai$/i.test(String(layer.name));
    } catch(e) { return /矢量智能对象|\.ai$/i.test(String(layer.name)); }
  }
  function scan() {
    var d = documentFor(), report = { documentId:d.id, document:d.name, width:d.width.as('px'), height:d.height.as('px'), working:!!working[d.id], scanned:0, labels:{}, layers:[], tasks:[], smartObjects:[], errors:[] };
    function walk(list, parent, visible, inherited, generated, purple) {
      for (var i = 0; i < list.length; i++) {
        var l = list[i], name = parent + '/' + l.name, color = '', role = '', reason = '', b = null;
        var productDisplay = /产品展示/.test(String(l.name)) || /产品展示/.test(String(parent));
        var isGenerated = generated || l.name.indexOf('[AI-Shoe]') === 0 || l.name.indexOf('[换鞋测试]') === 0;
        var effectiveVisible = visible && l.visible;
        var vectorLayer=isVectorSmart(l);
        if(vectorLayer){report.layers.push({layerId:l.id,name:name,kind:'VECTOR',visible:effectiveVisible,reason:'矢量智能对象，跳过自动处理'});continue;}
        if(productDisplay&&effectiveVisible&&!isGenerated&&l.typename==='LayerSet'){
          var rowViews={},rowCount=0;
          for(var di=0;di<l.layers.length;di++){var dl=l.layers[di],dn=String(dl.name),dv=dn.match(/^([123])$/)||dn.match(/_(?:bd|t)_(pair|back|sole)$/i);if(dl.typename!=='LayerSet'&&dl.kind===LayerKind.SMARTOBJECT&&dl.visible&&dv){rowViews[dv[1]]=true;rowCount++;}}
          if(rowCount>=2){report.tasks.push({documentId:d.id,layerId:l.id,name:name,role:'产品展示',taskType:'product_display',displayScope:'row',displayEvidence:'named_group_smart_slots',bounds:bounds(l),slots:1});continue;}
        }
        report.scanned++;
        try {
          color = label(l); report.labels[color] = (report.labels[color] || 0) + 1;
          role = ({red:'主推',grain:'次推',green:'次推',violet:'双鞋',indigo:'双鞋'})[color] || (color === 'none' ? inherited : '');
          if(purple)role='双鞋';
          b = bounds(l);
        } catch (e) { reason = '读取失败：' + e.message; report.errors.push({layerId:l.id,name:name,error:reason}); }
        if (!reason) {
          if (isGenerated) reason = '生成图层';
          else if (!effectiveVisible) reason = '图层或父组隐藏';
          else if (l.typename === 'LayerSet') reason = '图层组，继续检查子层';
          else if (l.kind !== LayerKind.SMARTOBJECT) reason = '非智能对象，不自动替换修补层';
          else if (l.kind !== LayerKind.NORMAL && l.kind !== LayerKind.SMARTOBJECT) reason = '非像素层或智能对象';
          else {
            var displayCandidate=productDisplay;
            if(displayCandidate)role='产品展示';
            if(!role)reason='无可用红绿紫标记';
            else if(b[2]<=b[0]||b[3]<=b[1])reason='空区域';
          else report.tasks.push({documentId:d.id,layerId:l.id,name:name,role:role,bounds:b,slots:role==='双鞋'?null:1,taskType:displayCandidate?'product_display':'shoe',displayEvidence:productDisplay?'named':'bottom_pending_structure',multiStyle:true});
          }
        }
        var kindName = l.typename === 'LayerSet' ? 'GROUP' : l.kind === LayerKind.SMARTOBJECT ? 'SMARTOBJECT' : (l.kind === LayerKind.NORMAL ? 'NORMAL' : String(l.kind));
        report.layers.push({layerId:l.id,name:name,label:color,role:role,kind:kindName,visible:effectiveVisible,bounds:b,reason:reason || '候选鞋位，需确认区域'});
        if (kindName === 'SMARTOBJECT') report.smartObjects.push({layerId:l.id,name:name,bounds:b,visible:effectiveVisible});
        if (l.typename === 'LayerSet') walk(l.layers, name, effectiveVisible, role, isGenerated, purple || role==='双鞋');
      }
    }
    walk(d.layers, d.name, true, '', false);
    return report;
  }
  function exportCrop(d, box, output, channelName) {
    var copy = null;
    try {
      copy = d.duplicate('AI-Shoe-temp', true);
      rgb(copy);
      copy.crop([UnitValue(box[0],'px'),UnitValue(box[1],'px'),UnitValue(box[2],'px'),UnitValue(box[3],'px')]);
      copy.flatten();
      if (channelName) {
        copy.selection.deselect(); var black = new SolidColor(); black.rgb.hexValue = '000000'; copy.selection.selectAll(); copy.selection.fill(black); copy.selection.deselect();
        copy.selection.load(copy.channels.getByName(channelName)); var white = new SolidColor(); white.rgb.hexValue = 'FFFFFF'; copy.selection.fill(white); copy.selection.deselect();
      }
      copy.saveAs(new File(output), new PNGSaveOptions(), true, Extension.LOWERCASE);
    } finally { if (copy) copy.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument = d; }
  }
  function place(d, file, name, box, fit) {
    var image = null, layer;
    try { image = app.open(new File(file)); layer = image.activeLayer.duplicate(d, ElementPlacement.PLACEATBEGINNING); }
    finally { if (image) image.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument = d; }
    d.activeLayer = layer; layer.name = name;
    var b = bounds(layer);
    if (fit) { var scale = Math.min((box[2]-box[0])/(b[2]-b[0]),(box[3]-box[1])/(b[3]-b[1]))*100; layer.resize(scale,scale,AnchorPosition.MIDDLECENTER); b = bounds(layer); }
    layer.translate(UnitValue(box[0]-b[0] + (fit ? ((box[2]-box[0])-(b[2]-b[0]))/2 : 0),'px'),UnitValue(box[1]-b[1] + (fit ? ((box[3]-box[1])-(b[3]-b[1]))/2 : 0),'px'));
    return layer;
  }
  function groupMask(d, group, channel) {
    d.activeLayer = group; d.selection.load(channel);
    var desc = new ActionDescriptor(); desc.putClass(c('Nw  '), c('Chnl'));
    var ref = new ActionReference(); ref.putEnumerated(c('Chnl'), c('Chnl'), c('Msk ')); desc.putReference(c('At  '), ref); desc.putEnumerated(c('Usng'), c('UsrM'), c('RvlS'));
    executeAction(c('Mk  '), desc, DialogModes.NO); d.selection.deselect();
  }
  var actions = {
    exportSmartSource:function(a){
      var parent=documentFor(a.documentId,true),l=find(parent.layers,a.layerId),source=null,copy=null,opened=false,old=parent.activeLayer;
      if(!l||l.kind!==LayerKind.SMARTOBJECT)throw Error('目标不是智能对象，请重新扫描');
      var before=[];for(var i=0;i<app.documents.length;i++)before.push(app.documents[i].id);
      try{
        parent.activeLayer=l;executeAction(s('placedLayerEditContents'),new ActionDescriptor(),DialogModes.NO);
        source=app.activeDocument;if(source.id===parent.id)throw Error('无法进入智能对象（可能为矢量对象）');
        opened=true;for(var i=0;i<before.length;i++)if(before[i]===source.id)opened=false;
        if(!opened&&!source.saved)throw Error('智能对象内部有未保存修改，暂不处理');
        if(source.mode!==DocumentMode.RGB||source.bitsPerChannel!==BitsPerChannelType.EIGHT)throw Error('内部不是 RGB 8 位，暂不自动转换');
        copy=source.duplicate('AI-Shoe-content-'+a.id,false);
        if(opened){source.close(SaveOptions.DONOTSAVECHANGES);source=null;}
        app.activeDocument=copy;working[copy.id]={sourceId:parent.id};
        actions.saveCopy({documentId:copy.id,output:a.contentFile});
        var w=copy.width.as('px'),h=copy.height.as('px');
        exportCrop(copy,[0,0,w,h],a.output);
        smartTasks[a.id]={parent:parent,layerId:l.id,width:w,height:h,contentFile:a.contentFile,source:a.output};
        return {width:w,height:h,layerId:l.id,source:a.output};
      }finally{if(copy){var id=copy.id;copy.close(SaveOptions.DONOTSAVECHANGES);delete working[id];}if(source&&opened)source.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=parent;parent.activeLayer=old;}
    },
    commitSmartPatches:function(a){
      var parent=documentFor(a.documentId,true),t=smartTasks[a.id],copy=null,image=null,history=parent.activeHistoryState;
      if(!t||t.parent.id!==parent.id||!a.patches||!a.patches.length)throw Error('没有已验证的内部结果');
      var original=find(parent.layers,t.layerId);if(!original)throw Error('外层智能对象已删除');
      try{
        copy=app.open(new File(t.contentFile));working[copy.id]={sourceId:parent.id};
        if(copy.width.as('px')!==t.width||copy.height.as('px')!==t.height)throw Error('内部文档尺寸已变化');
        for(var i=0;i<a.patches.length;i++){
          var patch=a.patches[i],b=patch.box;
          image=app.open(new File(patch.output));
          if(image.width.as('px')!==b[2]-b[0]||image.height.as('px')!==b[3]-b[1])throw Error('贴片尺寸不符');
          var src=bounds(image.activeLayer),layer=image.activeLayer.duplicate(copy,ElementPlacement.PLACEATBEGINNING);
          image.close(SaveOptions.DONOTSAVECHANGES);image=null;app.activeDocument=copy;
          var dst=bounds(layer);layer.translate(UnitValue(b[0]+src[0]-dst[0],'px'),UnitValue(b[1]+src[1]-dst[1],'px'));layer.name='[AI-Shoe] 鞋部 '+(i+1);
        }
        actions.saveCopy({documentId:copy.id,output:a.contentFile});
        var id=copy.id;copy.close(SaveOptions.DONOTSAVECHANGES);copy=null;delete working[id];app.activeDocument=parent;
        // Make an independent instance; shared and linked originals remain intact.
        parent.activeLayer=original;executeAction(s('placedLayerMakeCopy'),new ActionDescriptor(),DialogModes.NO);
        var target=parent.activeLayer;var desc=new ActionDescriptor();desc.putPath(c('null'),new File(a.contentFile));executeAction(s('placedLayerReplaceContents'),desc,DialogModes.NO);
        target.name='[AI-Shoe] '+a.name;original.visible=false;
        return {layerId:target.id,originalLayerId:original.id,patches:a.patches.length};
      }catch(e){app.activeDocument=parent;parent.activeHistoryState=history;throw e;}
      finally{if(image)image.close(SaveOptions.DONOTSAVECHANGES);if(copy){var id=copy.id;copy.close(SaveOptions.DONOTSAVECHANGES);delete working[id];}app.activeDocument=parent;}
    },
    openSmartTask:function(a){
      var parent=documentFor(a.documentId,true),l=find(parent.layers,a.layerId);
      if(!l)throw Error('标记图层不存在');
      if(l.kind!==LayerKind.SMARTOBJECT){
        var siblings=l.parent.layers,base=null,seen=false;
        if(l.grouped){for(var i=0;i<siblings.length;i++){if(siblings[i].id===l.id){seen=true;continue;}if(seen&&!siblings[i].grouped){base=siblings[i];break;}}}
        if(!base||base.kind!==LayerKind.SMARTOBJECT)throw Error('标记层不是智能对象，且没有直接剪贴关联的智能对象底层');l=base;
      }
      if(smartTasks[a.id]){if(smartTasks[a.id].recoveryBlocked)throw Error('上次回滚未完成，不能复用内部任务');app.activeDocument=smartTasks[a.id].doc;return {documentId:app.activeDocument.id};}
      var parentKey=String(parent.id)+'/'+String(l.id);
      if(smartTaskParents[parentKey]){if(smartTaskParents[parentKey].recoveryBlocked)throw Error('上次回滚未完成，不能复用内部任务');smartTasks[a.id]=smartTaskParents[parentKey];app.activeDocument=smartTasks[a.id].doc;return {documentId:app.activeDocument.id};}
      var ref=new ActionReference();ref.putIdentifier(s('layer'),l.id);var desc=executeActionGet(ref);
      if(desc.hasKey(s('smartObject'))){var so=desc.getObjectValue(s('smartObject'));if(so.hasKey(s('linked'))&&so.getBoolean(s('linked')))throw Error('链接智能对象暂不处理，避免修改外部素材');}
      var openIds={};for(var oi=0;oi<app.documents.length;oi++)openIds[app.documents[oi].id]=true;
      parent.activeLayer=l;executeAction(s('placedLayerEditContents'),new ActionDescriptor(),DialogModes.NO);
      var source=app.activeDocument;if(source.id===parent.id)throw Error('未打开智能对象内容');
      if(openIds[source.id]&&!source.saved){app.activeDocument=parent;throw Error('智能对象内部有未保存的修改，已保留该文档');}
      var sourceId=source.id;var copy=source.duplicate('AI-Shoe-content-'+a.id,false);if(!openIds[source.id])source.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=copy;
      working[copy.id]={sourceId:sourceId};smartTasks[a.id]={doc:copy,parent:parent,layerId:l.id,parentKey:parentKey};smartTaskParents[parentKey]=smartTasks[a.id];
      return {documentId:copy.id,width:copy.width.as('px'),height:copy.height.as('px')};
    },
    autoPrepareSmart:function(a){
      var parent=activatePreparedParent(a.documentId);
      try{
        actions.openSmartTask(a);var t=smartTasks[a.id],d=t.doc,items=[],channels=[];
        function collect(ls,p){for(var i=0;i<ls.length;i++){var l=ls[i];if(!l.visible)continue;if(l.typename==='LayerSet'){collect(l.layers,p+'/'+l.name);continue;}items.push({id:l.id,name:p+'/'+l.name,kind:String(l.kind),bounds:bounds(l)});}}
        collect(d.layers,'');
        for(var i=0;i<d.channels.length;i++){var ch=d.channels[i];if(ch.kind!==ChannelType.COMPONENT&&/^(鞋位|鞋部|换鞋|shoe)[ _-]*(mask|蒙版|选区)?[ _-]*[0-9]*$/i.test(ch.name))channels.push(ch);}
        var diag={taskId:a.id,smartLayerId:t.layerId,width:d.width.as('px'),height:d.height.as('px'),layers:items,shoeChannels:channels.length};
        var f=new File(a.diagnostic);f.encoding='UTF8';f.open('w');f.write(json(diag));f.close();
        var markers=[];
        function collectMarkers(ls){for(var mi=0;mi<ls.length;mi++){var ml=ls[mi];if(!ml.visible)continue;if(ml.typename==='LayerSet'){collectMarkers(ml.layers);continue;}if(ml.kind===LayerKind.TEXT){var text=String(ml.textItem.contents).replace(/\s/g,'');if(/^(主推|次推)(色)?$/.test(text))markers.push({id:ml.id,role:text.indexOf('主推')===0?'主推':'次推',bounds:bounds(ml)});}}}
        if(a.dualRole){collectMarkers(d.layers);var main=false,secondary=false;for(var mi=0;mi<markers.length;mi++){main=main||markers[mi].role==='主推';secondary=secondary||markers[mi].role==='次推';}if(!markers.length||(!main&&!secondary))throw Error('紫色多款图内部需有可识别的款式文字图层');t.roleMarkers=markers;t.styleCount=markers.length;}
        // Structural callouts must be present in the immediate containing group.
        // A section name alone also matches people photographs in this template.
        var outer=find(parent.layers,t.layerId),contextText='';
        if(outer&&outer.parent.typename==='LayerSet'){
          var siblings=outer.parent.layers;
          for(var si=0;si<siblings.length;si++){var sl=siblings[si];if(sl.visible&&sl.typename!=='LayerSet'&&sl.kind===LayerKind.TEXT)contextText+=String(sl.textItem.contents);}
        }
        var sceneType=!a.dualRole&&/内置加固片/.test(contextText)&&/加固后跟杯/.test(contextText)?'shoe_structure':'person';
        var sourceFile=a.contentFile.replace(/\.psb$/i,'-full.png');
        try{for(var mi=0;mi<markers.length;mi++)find(d.layers,markers[mi].id).visible=false;exportCrop(d,[0,0,d.width.as('px'),d.height.as('px')],sourceFile);}
        finally{for(var mi=0;mi<markers.length;mi++)find(d.layers,markers[mi].id).visible=true;}
        if(channels.length===1&&!a.dualRole){
          d.selection.load(channels[0]);var region=actions.captureSmartProtection({id:a.id,layerId:t.layerId});
          return {box:region.box,smartLayerId:t.layerId,source:'namedChannel',sourceFile:sourceFile,regions:[{box:region.box,mask:null}]};
        }
        return {source:'needsVision',sourceFile:sourceFile,smartLayerId:t.layerId,documentId:d.id,roleMarkers:markers,sceneType:sceneType};
      }finally{app.activeDocument=parent;}
    },
    inspectProductDisplay:function(a){
      var parent=documentFor(a.documentId,true);
      try{
        var candidate=find(parent.layers,a.layerId),t,d,rows=[];
        if(a.displayScope==='row'){
          if(!candidate||candidate.typename!=='LayerSet'||!/产品展示/.test(a.name||''))throw Error('产品展示行目标无效');
          t=smartTasks[a.id];if(!t)t=smartTasks[a.id]={doc:parent,parent:parent,layerId:a.layerId,displayScope:'row'};
          if(t.recoveryBlocked)throw Error('上次回滚失败，任务锁定');d=parent;
        }else{actions.openSmartTask(a);t=smartTask(a.id);d=t.doc;}
        function walk(list){for(var i=0;i<list.length;i++){var g=list[i];if(g.typename!=='LayerSet'||!g.visible)continue;
          var slots=[],colors=[],frames={},error='',views={};
          for(var j=0;j<g.layers.length;j++){var l=g.layers[j],n=String(l.name),m=n.match(/^([123])\s*范围框$/);
            if(m){if(frames[m[1]])error='重复范围框';frames[m[1]]={id:l.id,box:bounds(l)};continue;}
            if(!l.visible)continue;
            if(l.kind===LayerKind.TEXT)colors.push({id:l.id,text:String(l.textItem.contents)});
            var number=n.match(/^([123])$/),named=n.match(/_(?:bd|t)_(pair|back|sole)$/i),view=number?({'1':'pair','2':'back','3':'sole'})[number[1]]:named?named[1].toLowerCase():null;
            if(view&&l.kind===LayerKind.SMARTOBJECT){if(views[view])error='重复视角 '+view;views[view]=true;slots.push({id:l.id,name:n,view:view,bounds:bounds(l)});}
          }
          if(slots.length){
            if(colors.length!==1)error='颜色标题必须唯一，实际 '+colors.length;
            if(slots.length!==3||!views.pair||!views.back||!views.sole)error='需 pair/back/sole 三个智能对象';
            for(var k=0;k<slots.length;k++){var num=({pair:'1',back:'2',sole:'3'})[slots[k].view],f=frames[num];if(!f){slots[k].targetBox=slots[k].bounds;slots[k].fitMode='existing_canvas';}else{slots[k].targetBox=f.box;slots[k].frameId=f.id;slots[k].fitMode='subject_frame';}}
            rows.push({id:g.id,name:g.name,color:colors.length===1?colors[0].text:'',colorLayerId:colors.length===1?colors[0].id:null,slots:slots,bounds:bounds(g),error:error});
          }else walk(g.layers);
        }}
        walk(a.displayScope==='row'?[candidate]:d.layers);rows.sort(function(x,y){return x.bounds[1]-y.bounds[1]});
        if(!rows.length)throw Error('产品展示待确认：内部未找到颜色标题及三视角智能对象展示行');
        t.productDisplayRows=rows;return {documentId:d.id,rows:rows,width:d.width.as('px'),height:d.height.as('px')};
      }finally{app.activeDocument=parent;}
    },
    updateProductDisplayTitle:function(a){
      var parent=documentFor(a.documentId,true),t=smartTask(a.id);
      if(!t||t.parent.id!==parent.id||t.displayScope!=='row')throw Error('该模板标题不在父文档展示行中，暂不自动改字');
      var row=null;for(var i=0;i<t.productDisplayRows.length;i++)if(t.productDisplayRows[i].id===a.rowId)row=t.productDisplayRows[i];
      if(!row||!a.color||typeof a.color!=='string')throw Error('展示行或目标颜色无效');
      var title=find(parent.layers,row.colorLayerId),group=find(parent.layers,row.id);
      if(!title||!group||title.parent.id!==group.id||title.kind!==LayerKind.TEXT)throw Error('颜色标题图层已变化');
      if(String(title.textItem.contents)!==row.color&&String(title.textItem.contents)!==a.color)throw Error('标题已被手动修改，请重新核对');
      var history=parent.activeHistoryState,dialogs=app.displayDialogs;
      try{
        app.displayDialogs=DialogModes.NO;
        try{title.textItem.contents=a.color;}
        catch(fontError){
          // Photoshop can throw a modal missing-font dialog while assigning
          // text. Fall back to a known installed font and retry silently.
          title.textItem.font='ArialMT';
          title.textItem.contents=a.color;
        }
        row.color=a.color;return {color:a.color,layerId:title.id,fontFallback:'ArialMT'};
      }
      catch(e){parent.activeHistoryState=history;throw e;}
      finally{app.displayDialogs=dialogs;}
    },
    prepareProductDisplayAI:function(a){
      var parent=documentFor(a.documentId,true),slot=find(parent.layers,a.slotId);
      if(!slot||slot.kind!==LayerKind.SMARTOBJECT)throw Error('产品展示槽位不是智能对象');
      if(isVectorSmart(slot))throw Error('矢量智能对象不支持自动换鞋');
      var taskId=a.id+'-display-'+a.slotId;
      actions.openSmartTask({id:taskId,documentId:a.documentId,layerId:a.slotId});
      var t=smartTask(taskId),d=t.doc;t.width=d.width.as('px');t.height=d.height.as('px');t.box=[0,0,t.width,t.height];t.layerId=slot.id;t.parent=parent;
      protections[taskId]={documentId:d.id,layerId:slot.id,box:t.box,channel:null};
      app.activeDocument=d;exportCrop(d,t.box,a.input);app.activeDocument=parent;
      return {id:taskId,documentId:d.id,size:[d.width.as('px'),d.height.as('px')],input:a.input};
    },
    applyProductDisplayAI:function(a){
      var t=smartTask(a.id);if(!t)throw Error('产品展示 AI 任务已失效');
      var parent=documentFor(a.documentId,true);
      if(parent.id!==t.parent.id)throw Error('产品展示父文档已变化');
      var original=find(parent.layers,t.layerId);if(!original)throw Error('产品展示槽位已不存在');
      var history=parent.activeHistoryState,target=null,generated=null,normalized=null,stage='validate',dialogs=app.displayDialogs;
      try{
        app.displayDialogs=DialogModes.NO;
        var f=new File(a.output);if(!f.exists)throw Error('AI 生成结果不存在');
        if(!(t.width>0&&t.height>0))throw Error('原槽位尺寸无效');
        stage='normalize';generated=app.open(f);
        var iw=generated.width.as('px'),ih=generated.height.as('px');
        // Gemini may return a square even when the slot canvas is 3:2 (or the
        // reverse). Fit uniformly, then add canvas around it; never stretch
        // the generated shoe to force a ratio.
        var fit=Math.min(t.width/iw,t.height/ih),fitW=Math.max(1,Math.round(iw*fit)),fitH=Math.max(1,Math.round(ih*fit));
        generated.resizeImage(UnitValue(fitW,'px'),UnitValue(fitH,'px'),null,ResampleMethod.BICUBIC);
        generated.resizeCanvas(UnitValue(t.width,'px'),UnitValue(t.height,'px'),AnchorPosition.MIDDLECENTER);
        stage='save_normalized';
        normalized=new File(a.contentFile||Folder.temp.fsName+'/AI-Shoe-display-'+a.id+'-'+new Date().getTime()+'.psb');
        if(normalized.exists)normalized=new File(normalized.fsName+'.'+new Date().getTime()+'.psb');
        if(normalized.exists)throw Error('临时文件已存在，请重试');
        var save=new ActionDescriptor(),opts=new ActionDescriptor();opts.putBoolean(s('maximizeCompatibility'),true);
        save.putObject(c('As  '),s('largeDocumentFormat'),opts);save.putPath(c('In  '),normalized);save.putBoolean(c('Cpy '),true);save.putBoolean(c('LwCs'),true);
        executeAction(c('save'),save,DialogModes.NO);
        normalized=new File(normalized.fsName);
        if(!normalized.exists||normalized.length<=0)throw Error('标准化PSB未写入指定路径');
        generated.close(SaveOptions.DONOTSAVECHANGES);generated=null;
        stage='copy_target';app.activeDocument=parent;parent.activeLayer=original;
        executeAction(s('placedLayerMakeCopy'),new ActionDescriptor(),DialogModes.NO);target=parent.activeLayer;
        if(target.id===original.id||target.kind!==LayerKind.SMARTOBJECT)throw Error('未创建独立智能对象');
        stage='replace_contents';app.activeDocument=parent;parent.activeLayer=target;
        var replacement=new ActionDescriptor();replacement.putPath(c('null'),normalized);
        executeAction(s('placedLayerReplaceContents'),replacement,DialogModes.NO);
        target.name=a.name||('[AI-Shoe] 产品展示 '+t.layerId);target.visible=true;original.visible=false;
        return {layerId:target.id,originalLayerId:original.id,documentId:parent.id,contentFile:normalized.fsName};
      }catch(e){
        var recovery=[];
        if(generated){try{generated.close(SaveOptions.DONOTSAVECHANGES);generated=null;}catch(closeError){recovery.push('关闭临时图失败：'+closeError.message);}}
        try{app.activeDocument=parent;parent.activeHistoryState=history;}catch(rollbackError){recovery.push('回滚失败：'+rollbackError.message);}
        if(recovery.length)t.recoveryBlocked=true;
        throw Error('产品展示 '+stage+'：'+e.message+(recovery.length?'；任务锁定；'+recovery.join('；'):''));
      }finally{app.displayDialogs=dialogs;app.activeDocument=parent;}
    },
    applyProductDisplayRow:function(a){
      var parent=documentFor(a.documentId,true),t=smartTask(a.id);
      if(!t||t.parent.id!==parent.id||t.layerId!==a.layerId)throw Error('产品展示内部任务已失效');
      var row=null;for(var ri=0;ri<(t.productDisplayRows||[]).length;ri++)if(t.productDisplayRows[ri].id===a.plan.rowId)row=t.productDisplayRows[ri];
      if(!row||row.error||a.plan.slots.length!==3)throw Error('展示行结构未确认');
      var group=find(t.doc.layers,row.id),title=find(t.doc.layers,row.colorLayerId);
      if(!group||!group.visible||!title||String(title.textItem.contents)!==row.color)throw Error('颜色标题或展示行已变化，请重新读取');
      var ph=parent.activeHistoryState,previous=t.parentTargetId;
      app.activeDocument=t.doc;var ih=t.doc.activeHistoryState;
      try{
        for(var i=0;i<a.plan.slots.length;i++){
          var job=a.plan.slots[i],expected=null;for(var j=0;j<row.slots.length;j++)if(row.slots[j].id===job.id)expected=row.slots[j];
          if(!expected||expected.fitMode!==job.fitMode||json(expected.targetBox)!==json(job.targetBox))throw Error('展示槽位计划不一致');
          var layer=find(t.doc.layers,job.id),frame=find(t.doc.layers,expected.frameId);
          if(!layer||layer.parent.id!==group.id||layer.kind!==LayerKind.SMARTOBJECT||!layer.visible||(expected.frameId&&(!frame||json(bounds(frame))!==json(expected.targetBox)))||json(bounds(layer))!==json(expected.bounds))throw Error('展示槽位或范围框已变化');
          var f=new File(job.file);if(!f.exists)throw Error('展示素材不存在');
          t.doc.activeLayer=layer;var ref=new ActionReference();ref.putIdentifier(s('layer'),layer.id);var ld=executeActionGet(ref);
          if(ld.hasKey(s('smartObject'))){var so=ld.getObjectValue(s('smartObject'));if(so.hasKey(s('linked'))&&so.getBoolean(s('linked')))throw Error('链接展示素材不自动替换');}
          if(ld.hasKey(s('smartObjectMore'))){var more=ld.getObjectValue(s('smartObjectMore'));
            if(more.hasKey(s('warp'))){var warp=more.getObjectValue(s('warp'));if(warp.hasKey(s('warpStyle'))&&typeIDToStringID(warp.getEnumerationValue(s('warpStyle')))!=='warpNone')throw Error('展示槽位有变形，请先确认模板');}
            if(more.hasKey(s('transform'))){var tr=more.getList(s('transform'));if(tr.count!==8||Math.abs(tr.getDouble(1)-tr.getDouble(3))>.5||Math.abs(tr.getDouble(2)-tr.getDouble(4))>.5||Math.abs(tr.getDouble(5)-tr.getDouble(7))>.5||Math.abs(tr.getDouble(0)-tr.getDouble(6))>.5||tr.getDouble(2)<=tr.getDouble(0)||tr.getDouble(5)<=tr.getDouble(1))throw Error('展示槽位旋转、翻转或透视变形，不能自动替换');}
          }
          var slotOriginal=layer;executeAction(s('placedLayerMakeCopy'),new ActionDescriptor(),DialogModes.NO);layer=t.doc.activeLayer;
          if(layer.id===slotOriginal.id||layer.parent.id!==group.id)throw Error('未创建独立展示智能对象');
          layer.name='[AI-Shoe] '+slotOriginal.name;slotOriginal.visible=false;
          var desc=new ActionDescriptor();desc.putPath(c('null'),f);executeAction(s('placedLayerReplaceContents'),desc,DialogModes.NO);
          var b=bounds(layer),frac=job.fraction,box=job.targetBox;
          if(!job.sourceSize||Math.abs(((b[2]-b[0])/(b[3]-b[1]))/(job.sourceSize[0]/job.sourceSize[1])-1)>.01)throw Error('展示槽位存在非等比缩放或裁切，已停止避免变形');
          var pw=(frac[2]-frac[0])*(b[2]-b[0]),pht=(frac[3]-frac[1])*(b[3]-b[1]);
          if(pw<=0||pht<=0)throw Error('素材主体框无效');
          var scale=Math.min((box[2]-box[0])/pw,(box[3]-box[1])/pht)*100;
          layer.resize(scale,scale,AnchorPosition.MIDDLECENTER);b=bounds(layer);
          layer.translate(UnitValue((box[0]+box[2])/2-b[0]-(frac[0]+frac[2])/2*(b[2]-b[0]),'px'),UnitValue((box[1]+box[3])/2-b[1]-(frac[1]+frac[3])/2*(b[3]-b[1]),'px'));
          if(frame)frame.visible=false;
        }
        if(!a.plan.product||!a.plan.product.color)throw Error('目标颜色标题缺失');
        title.textItem.contents=a.plan.product.color;
        if(t.displayScope==='row'){row.error='本行已回写，禁止重复执行';return {rowId:row.id,layerId:row.id,slots:3,scope:'existing_smart_object_contents'};}
        actions.saveCopy({documentId:t.doc.id,output:a.contentFile});
        app.activeDocument=parent;var original=find(parent.layers,t.layerId),target=t.parentTargetId?find(parent.layers,t.parentTargetId):null;
        if(!target){if(!original)throw Error('外层智能对象不存在');parent.activeLayer=original;executeAction(s('placedLayerMakeCopy'),new ActionDescriptor(),DialogModes.NO);target=parent.activeLayer;t.parentTargetId=target.id;original.visible=false;}
        parent.activeLayer=target;var pd=new ActionDescriptor();pd.putPath(c('null'),new File(a.contentFile));executeAction(s('placedLayerReplaceContents'),pd,DialogModes.NO);target.visible=true;
        row.error='本行已回写，禁止重复执行';
        return {rowId:row.id,layerId:target.id,slots:3,contentFile:a.contentFile};
      }catch(e){var errors=[];try{app.activeDocument=t.doc;t.doc.activeHistoryState=ih;}catch(ie){errors.push(ie.message);}try{app.activeDocument=parent;parent.activeHistoryState=ph;}catch(pe){errors.push(pe.message);}t.parentTargetId=previous;if(errors.length){t.recoveryBlocked=true;throw Error(e.message+'；回滚失败，任务锁定：'+errors.join('；'));}throw e;}
      finally{app.activeDocument=parent;}
    },
    applyVisionRegion:function(a){
      var t=smartTask(a.id);if(!t)throw Error('内部任务已失效');
      var d=t.doc,w=d.width.as('px'),h=d.height.as('px');
      var box=[Math.floor(a.box[0]),Math.floor(a.box[1]),Math.ceil(a.box[2]),Math.ceil(a.box[3])];
      if(box[2]<=0||box[3]<=0||box[0]>=w||box[1]>=h)throw Error('视觉检测框与内部画布不相交');
      if(box[2]<=box[0]||box[3]<=box[1])throw Error('视觉检测框无效');
      regionTasks[a.id]={box:box,mask:a.mask||null,layerId:a.layerId};
      protections[a.id]={documentId:d.id,layerId:a.layerId,box:box,channel:null,maskFile:a.mask||null};
      return {box:box};
    },
    captureManualRegion:function(a){
      var t=smartTasks[a.id];if(!t||app.activeDocument.id!==t.doc.id)throw Error('请先打开内部工作副本并选择鞋部');
      var folder=new Folder(Folder.temp.fsName+'/AI-Shoe-manual-'+a.id);if(!folder.exists)folder.create();
      var region=actions.captureSmartProtection(a),d=t.doc;
      var source=folder.fsName+'/source.png',mask=folder.fsName+'/mask.png',input=folder.fsName+'/input.png';
      app.activeDocument=d;
      try{
        exportCrop(d,[0,0,d.width.as('px'),d.height.as('px')],source);
        exportCrop(d,region.box,input);
        exportCrop(d,region.box,mask,protections[a.id].channel);
        return {source:'manual',sourceFile:source,box:region.box,mask:mask,input:input};
      }finally{app.activeDocument=t.parent;}
    },
    captureSmartProtection:function(a){
      var t=smartTasks[a.id];if(!t||app.activeDocument.id!==t.doc.id)throw Error('请先进入此任务的智能对象副本');
      var d=t.doc,b;try{b=bounds({bounds:d.selection.bounds});}catch(e){throw Error('请在内部原图选择鞋子和必要阴影');}
      var side=Math.ceil(Math.max(b[2]-b[0],b[3]-b[1])*1.16),w=d.width.as('px'),h=d.height.as('px');
      if(side>w||side>h)throw Error('鞋位方框超出内部图片尺寸，请缩小选区');
      var x=Math.max(0,Math.min(w-side,Math.floor((b[0]+b[2]-side)/2))),y=Math.max(0,Math.min(h-side,Math.floor((b[1]+b[3]-side)/2)));
      var ch=d.channels.add();ch.name='AI-Shoe-protect-'+a.id;d.selection.store(ch);d.selection.deselect();rgb(d);
      t.box=[x,y,x+side,y+side];protections[a.id]={documentId:d.id,layerId:a.layerId,box:b,channel:ch.name};app.activeDocument=t.parent;
      return {box:t.box,documentId:d.id};
    },
    exportSmart:function(a){var t=smartTask(a.id);if(!t)throw Error('自动准备未成功，已跳过');var rt=regionTasks[a.id];var box=rt?rt.box:t.box;if(!box)throw Error('自动准备未成功，已跳过');app.activeDocument=t.doc;try{exportCrop(t.doc,box,a.output);return {box:box};}finally{app.activeDocument=t.parent;}},
    applySmart:function(a){
      var t=smartTask(a.id);if(!t)throw Error('内部任务已失效');
      var rt=regionTasks[a.id];var box=rt?rt.box:t.box;if(!box)throw Error('内部任务已失效');
      if(a.fullCanvas){if(!a.canvasSize||a.canvasSize[0]!==t.doc.width.as('px')||a.canvasSize[1]!==t.doc.height.as('px'))throw Error('完整画布尺寸不一致');box=[0,0,a.canvasSize[0],a.canvasSize[1]];}
      var previousTargetId=t.parentTargetId;
      var previousPatchGroups=t.patchGroupIds||[],newPatchGroups=[];
      app.activeDocument=t.parent;var parentHistory=t.parent.activeHistoryState;
      app.activeDocument=t.doc;var internalHistory=t.doc.activeHistoryState;
      app.activeDocument=t.doc;
      try{
        if(a.patches&&a.patches.length){
          for(var pi=0;pi<a.patches.length;pi++){
            var patch=a.patches[pi];
            if(!patch.box||!patch.output||!patch.name)throw Error('分层贴片信息不完整');
            var placed=actions.applyPreview({documentId:t.doc.id,layerId:t.layerId,id:a.id,box:patch.box,output:patch.output,name:patch.name});
            newPatchGroups.push(placed.groupId);
          }
        }else{
          var placedSingle=actions.applyPreview({documentId:t.doc.id,layerId:t.layerId,id:a.id,box:box,output:a.output,name:a.name});
          if(placedSingle)newPatchGroups.push(placedSingle.groupId);
        }
        // Hide only groups tracked by this task. History rollback restores them
        // if saving or replacing the parent fails; original artwork stays intact.
        for(var gi=0;gi<previousPatchGroups.length;gi++){var oldPatch=find(t.doc.layers,previousPatchGroups[gi]);if(oldPatch)oldPatch.visible=false;}
        if(t.roleMarkers){for(var mi=0;mi<t.roleMarkers.length;mi++){var marker=find(t.doc.layers,t.roleMarkers[mi].id);if(!marker)throw Error('主次推提示图层已变化，请重新准备任务');marker.visible=!a.hideRoleMarkers;}}
        actions.saveCopy({documentId:t.doc.id,output:a.contentFile});
        app.activeDocument=t.parent;documentFor(t.parent.id,true);t.parent.activeLayer=find(t.parent.layers,t.layerId);
        // Replace an independent parent instance so shared embedded contents cannot
        // leave the visible layer pointing at a stale/shared object.
        var originalTarget=find(t.parent.layers,t.layerId),target=null;
        if(t.parentTargetId) target=find(t.parent.layers,t.parentTargetId);
        if(!target && t.parentKey && smartTaskParents[t.parentKey].parentTargetId){target=find(t.parent.layers,smartTaskParents[t.parentKey].parentTargetId);t.parentTargetId=target&&target.id;}
        if(!target){
          if(!originalTarget)throw Error('回写后找不到目标智能对象');
          app.activeDocument=t.parent; t.parent.activeLayer=originalTarget;
          executeAction(s('placedLayerMakeCopy'),new ActionDescriptor(),DialogModes.NO);
          target=t.parent.activeLayer;
          t.parentTargetId=target.id;
          if(t.parentKey && smartTaskParents[t.parentKey]) smartTaskParents[t.parentKey].parentTargetId=target.id;
        }
        if(!target)throw Error('回写后找不到可见目标智能对象');
        // ReplaceContents operates on the active layer. Cached targets are
        // reused by later regions, so activate the cached copy before calling
        // the action; otherwise Photoshop replaces the hidden original layer.
        t.parent.activeLayer=target;
        var desc=new ActionDescriptor();desc.putPath(c('null'),new File(a.contentFile));executeAction(s('placedLayerReplaceContents'),desc,DialogModes.NO);
        // MakeCopy/ReplaceContents can drop the original clipping relationship.
        // Restore it even for a cached target from a previous write.
        if(!originalTarget||target.id===originalTarget.id)throw Error('回写目标与原层身份异常');
        target.move(originalTarget,ElementPlacement.PLACEBEFORE);
        // Moving a layer can release its clipping mask. Restore clipping last.
        target.grouped=originalTarget.grouped;
        originalTarget.visible=false;
        if(target.grouped!==originalTarget.grouped||originalTarget.visible)throw Error('回写剪贴关系或原层可见性校验失败');
        target.visible=true; t.parent.activeLayer=target;
        try { app.refresh(); } catch(ignoreRefresh) {}
        t.patchGroupIds=newPatchGroups;
        return {layerId:target.id,originalLayerId:t.layerId,visible:target.visible,documentId:t.parent.id,contentFile:a.contentFile};
      }catch(e){
        var rollbackErrors=[];
        // Always attempt both documents; one failed history restore must not skip the other.
        try{app.activeDocument=t.doc;t.doc.activeHistoryState=internalHistory;}catch(internalError){rollbackErrors.push('内部：'+internalError.message);}
        try{app.activeDocument=t.parent;t.parent.activeHistoryState=parentHistory;}catch(parentError){rollbackErrors.push('父文档：'+parentError.message);}
        t.parentTargetId=previousTargetId;if(t.parentKey&&smartTaskParents[t.parentKey])smartTaskParents[t.parentKey].parentTargetId=previousTargetId;
        if(rollbackErrors.length){t.recoveryBlocked=true;throw Error(e.message+'；回滚未完成，任务已锁定：'+rollbackErrors.join('；'));}
        throw e;
      }finally{try{app.activeDocument=t.parent;}catch(ignoreActivation){}}
    },
    exportMarked:function(a){
      var d=documentFor(a.documentId,true),l=find(d.layers,a.layerId),b=bounds(l);
      var box=[Math.max(0,Math.floor(b[0])),Math.max(0,Math.floor(b[1])),Math.min(d.width.as('px'),Math.ceil(b[2])),Math.min(d.height.as('px'),Math.ceil(b[3]))];
      if(box[2]<=box[0]||box[3]<=box[1])throw Error('标记图层在画布内没有可见区域');
      exportCrop(d,box,a.output); return {box:box};
    },
    scan:scan,
    createWorking:function () {
      var d = documentFor(); if (working[d.id]) return scan();
      if (d.mode !== DocumentMode.RGB || d.bitsPerChannel !== BitsPerChannelType.EIGHT) throw Error('当前仅支持 RGB 8 位，避免隐式改变文档色彩和位深');
      var copy = d.duplicate('[AI-Shoe] ' + d.name, false); working[copy.id] = {sourceId:d.id}; return scan();
    },
    arrangeComparison:function(a){
      var copy=null,source=null;
      for(var i=0;i<app.documents.length;i++)if(app.documents[i].id===a.documentId)copy=app.documents[i];
      if(!copy||!working[copy.id])throw Error('换鞋工作副本已关闭或未登记');
      var sourceId=working[copy.id].sourceId;
      try{
        for(var j=0;j<app.documents.length;j++)if(app.documents[j].id===sourceId)source=app.documents[j];
        if(!source)return {arranged:false,reason:'原文档已关闭，未自动双联垂直'};
        // Make the before/after documents the most recently active pair.
        app.activeDocument=source;
        app.activeDocument=copy;
        app.runMenuItem(s('2upVertical'));
        return {arranged:true,sourceId:source.id,documentId:copy.id};
      }catch(e){return {arranged:false,reason:'自动双联垂直未完成：'+e.message};}
      finally{app.activeDocument=copy;}
    },
    selectLayer:function (a) { var d = documentFor(a.documentId,true), l = find(d.layers,a.layerId); if (!l) throw Error('图层不存在，请重新扫描'); d.activeLayer = l; d.selection.deselect(); return {layerId:l.id,bounds:bounds(l)}; },
    prepare:function (a) {
      var d = documentFor(a.documentId,true), l = find(d.layers,a.layerId); if (!l) throw Error('目标图层不存在');
      if (prepared[a.id]) throw Error('任务已建立，请勿重复置入');
      rgb(d);
      var lb=bounds(l), clip=l, siblings=l.parent.layers, found=false;
      if(l.grouped){
        for(var i=0;i<siblings.length;i++){
          if(siblings[i].id===l.id){found=true;continue;}
          if(found && !siblings[i].grouped){clip=siblings[i];break;}
        }
        var cb=bounds(clip);lb=[Math.max(lb[0],cb[0]),Math.max(lb[1],cb[1]),Math.min(lb[2],cb[2]),Math.min(lb[3],cb[3])];
      }
      var allowed=[Math.max(0,Math.ceil(lb[0])),Math.max(0,Math.ceil(lb[1])),Math.min(d.width.as('px'),Math.floor(lb[2])),Math.min(d.height.as('px'),Math.floor(lb[3]))];
      if(allowed[2]<=allowed[0]||allowed[3]<=allowed[1])throw Error('标记图层在画布内没有可见区域');
      var box;
      try {box=bounds({bounds:d.selection.bounds});}catch(e){throw Error('尚未建立鞋位保护选区。请在标记图片内选择鞋子及必要融合区域；不能把整张场景当作鞋位');}
      d.selection.select([[allowed[0],allowed[1]],[allowed[2],allowed[1]],[allowed[2],allowed[3]],[allowed[0],allowed[3]]],SelectionType.INTERSECT);
      try {box=bounds({bounds:d.selection.bounds});}catch(e){throw Error('当前选区与标记图层可见范围不相交');}
      box=[Math.floor(box[0]),Math.floor(box[1]),Math.ceil(box[2]),Math.ceil(box[3])];
      var key;
      for (key in prepared) if (prepared.hasOwnProperty(key) && prepared[key].documentId === d.id) { var other=prepared[key].box; if (box[0]<other[2] && box[2]>other[0] && box[1]<other[3] && box[3]>other[1]) throw Error('与已有鞋位区域重叠，请拆分选区'); }
      var ch = d.channels.add(); ch.name = 'AI-Shoe-mask-' + a.id; d.selection.store(ch); d.selection.deselect(); rgb(d);
      var group = null;
      try {
        exportCrop(d,box,a.original); exportCrop(d,box,a.mask,ch.name);
        group = d.layerSets.add(); group.name = '[AI-Shoe] ' + a.sku + ' ' + a.color;
        group.blendMode = BlendMode.NORMAL; groupMask(d,group,ch);
        var shoe = place(d,a.cutout,'真实鞋素材',box,true); shoe.move(group,ElementPlacement.INSIDE);
        d.activeLayer = shoe;
        prepared[a.id] = {documentId:d.id,layerId:l.id,box:box,groupId:group.id,channel:ch.name};
        return prepared[a.id];
      } catch (e) { if (group) group.remove(); ch.remove(); throw e; }
    },
    exportPrepared:function (a) {
      var t=prepared[a.id]; if (!t) throw Error('请先置入真实素材'); var d=documentFor(t.documentId,true);
      var group=find(d.layers,t.groupId); if (!group || !group.visible) throw Error('合成组缺失或隐藏');
      exportCrop(d,t.box,a.output); return t;
    },
    apply:function (a) {
      var t=prepared[a.id]; if (!t) throw Error('任务已失效'); var d=documentFor(t.documentId,true);
      var old=find(d.layers,t.groupId); if (!old) throw Error('合成组已删除');
      var image = null, result = null;
      try {
        image=app.open(new File(a.output));
        if (image.width.as('px')!==t.box[2]-t.box[0] || image.height.as('px')!==t.box[3]-t.box[1]) throw Error('结果尺寸与鞋位不一致');
        result=image.activeLayer.duplicate(d,ElementPlacement.PLACEATBEGINNING);
      } finally { if(image)image.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=d; }
      // The flattened patch has full rectangular bounds. It is clipped again by the saved selection.
      result.name='[AI-Shoe] AI 融合 待验收'; var b=bounds(result);result.translate(UnitValue(t.box[0]-b[0],'px'),UnitValue(t.box[1]-b[1],'px'));
      var group=d.layerSets.add();group.name='[AI-Shoe] 融合结果 ' + a.id;group.blendMode=BlendMode.NORMAL;
      try { result.move(group,ElementPlacement.INSIDE);groupMask(d,group,d.channels.getByName(t.channel));old.visible=false;d.activeLayer=group; }
      catch(e){group.remove();throw e;}
      t.resultGroupId=group.id; return {groupId:group.id,status:'待人工验收'};
    },
    captureProtection:function(a){
      var d=documentFor(a.documentId,true), box;
      try{box=bounds({bounds:d.selection.bounds});}catch(e){throw Error('请先选择鞋子及必要阴影区域');}
      var l=find(d.layers,a.layerId),lb=bounds(l);
      if(box[0]<Math.max(0,lb[0])||box[1]<Math.max(0,lb[1])||box[2]>Math.min(d.width.as('px'),lb[2])||box[3]>Math.min(d.height.as('px'),lb[3]))throw Error('选区超出目标图层或画布');
      for(var k in protections){var t=protections[k],b=t.box;if(k!==a.id&&t.documentId===d.id&&box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1])throw Error('与其他鞋位保护区域重叠');}
      var ch=d.channels.add();ch.name='AI-Shoe-protect-'+a.id;d.selection.store(ch);d.selection.deselect();rgb(d);
      protections[a.id]={documentId:d.id,layerId:l.id,box:box,channel:ch.name};return protections[a.id];
    },
    applyPreview:function(a){
      var d=documentFor(a.documentId,true),t=protections[a.id],b=a.box,image=null,group=null;
      if(!t||t.documentId!==d.id||t.layerId!==a.layerId)throw Error('缺少鞋位保护选区，禁止整图覆盖');
      if(a.maskFile&&!(new File(a.maskFile)).exists)throw Error('视觉蒙版文件不存在：'+a.maskFile);
      if(!b||b.length!==4||b[2]<=b[0]||b[3]<=b[1])throw Error('缺少有效导出坐标');
      try{
        image=app.open(new File(a.output));var w=b[2]-b[0],h=b[3]-b[1];
        if(Math.abs((image.width.as('px')/image.height.as('px'))/(w/h)-1)>0.01)throw Error('生成比例与导出比例不一致，禁止拉伸回写');
        image.resizeImage(UnitValue(w,'px'),UnitValue(h,'px'),null,ResampleMethod.BICUBIC);
        // Layer bounds exclude transparent padding. Preserve its offset within
        // the crop canvas when moving the patch into the internal document.
        var sourceBounds=bounds(image.activeLayer);
        var result=image.activeLayer.duplicate(d,ElementPlacement.PLACEATBEGINNING);image.close(SaveOptions.DONOTSAVECHANGES);image=null;app.activeDocument=d;
        group=d.layerSets.add();group.name=a.name;group.blendMode=BlendMode.NORMAL;result.move(group,ElementPlacement.INSIDE);
        result.name=(a.name||'[AI-Shoe] 换鞋结果')+' · 鞋部贴片';
        var rb=bounds(result);result.translate(UnitValue(b[0]+sourceBounds[0]-rb[0],'px'),UnitValue(b[1]+sourceBounds[1]-rb[1],'px'));
        if(t.channel)groupMask(d,group,d.channels.getByName(t.channel));return {groupId:group.id};
      }catch(e){if(group)group.remove();throw e;}finally{if(image)image.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=d;}
    },
    exportCanvas:function(a){var d=documentFor(a.documentId,true);exportCrop(d,[0,0,d.width.as('px'),d.height.as('px')],a.output);return {output:a.output};},
    saveCopy:function(a){var d=documentFor(a.documentId,true), f=a.output?File(a.output):File.saveDialog('另存换鞋工作副本','*.psb');if(!f)return {cancelled:true};if(!/\.psb$/i.test(f.name))f=File(f.fsName+'.psb');if(f.exists)throw Error('请选择不存在的新文件名，避免覆盖已有文件');var desc=new ActionDescriptor(),options=new ActionDescriptor();options.putBoolean(s('maximizeCompatibility'),true);desc.putObject(c('As  '),s('largeDocumentFormat'),options);desc.putPath(c('In  '),f);desc.putBoolean(c('Cpy '),true);desc.putBoolean(c('LwCs'),true);executeAction(c('save'),desc,DialogModes.NO);return {path:f.fsName};}
  };
  return { dispatch:function(method,args){var units=app.preferences.rulerUnits;try{app.preferences.rulerUnits=Units.PIXELS;if(!actions[method])throw Error('未知操作');return json({ok:true,data:actions[method](args||{})});}catch(e){return json({ok:false,error:e.message});}finally{if(app.documents.length){try{rgb(app.activeDocument);}catch(ignore){}}app.preferences.rulerUnits=units;}}, scanLayers:function(){return json(scan());} };
}());
