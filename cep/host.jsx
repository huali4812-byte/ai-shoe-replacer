#target photoshop
var AI_Shoe_CEP = (function () {
  var s = stringIDToTypeID, c = charIDToTypeID, working = {}, prepared = {}, protections = {}, smartTasks = {}, smartTaskParents = {}, regionTasks = {};
  function smartTask(id){
    if(smartTasks[id])return smartTasks[id];
    var idx=id.lastIndexOf('-r');
    if(idx>0){var base=id.slice(0,idx);if(smartTasks[base])return smartTasks[base];}
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
  function scan() {
    var d = documentFor(), report = { documentId:d.id, document:d.name, width:d.width.as('px'), height:d.height.as('px'), working:!!working[d.id], scanned:0, labels:{}, layers:[], tasks:[], smartObjects:[], errors:[] };
    function walk(list, parent, visible, inherited, generated, purple) {
      for (var i = 0; i < list.length; i++) {
        var l = list[i], name = parent + '/' + l.name, color = '', role = '', reason = '', b = null;
        var isGenerated = generated || l.name.indexOf('[AI-Shoe]') === 0 || l.name.indexOf('[换鞋测试]') === 0;
        var effectiveVisible = visible && l.visible;
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
          else if (role === '双鞋') reason = '紫色双人款暂时跳过';
          else if (l.kind !== LayerKind.SMARTOBJECT) reason = '非智能对象，不自动替换修补层';
          else if (l.kind !== LayerKind.NORMAL && l.kind !== LayerKind.SMARTOBJECT) reason = '非像素层或智能对象';
          else if (!role) reason = '无可用红绿紫标记';
          else if (b[2] <= b[0] || b[3] <= b[1]) reason = '空区域';
          else report.tasks.push({documentId:d.id,layerId:l.id,name:name,role:role,bounds:b,slots:role === '双鞋' ? 2 : 1});
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
      if(smartTasks[a.id]){app.activeDocument=smartTasks[a.id].doc;return {documentId:app.activeDocument.id};}
      var parentKey=String(parent.id)+'/'+String(l.id);
      if(smartTaskParents[parentKey]){smartTasks[a.id]=smartTaskParents[parentKey];app.activeDocument=smartTasks[a.id].doc;return {documentId:app.activeDocument.id};}
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
      var parent=documentFor(a.documentId,true);
      try{
        actions.openSmartTask(a);var t=smartTasks[a.id],d=t.doc,items=[],channels=[];
        function collect(ls,p){for(var i=0;i<ls.length;i++){var l=ls[i];if(!l.visible)continue;if(l.typename==='LayerSet'){collect(l.layers,p+'/'+l.name);continue;}items.push({id:l.id,name:p+'/'+l.name,kind:String(l.kind),bounds:bounds(l)});}}
        collect(d.layers,'');
        for(var i=0;i<d.channels.length;i++){var ch=d.channels[i];if(ch.kind!==ChannelType.COMPONENT&&/^(鞋位|鞋部|换鞋|shoe)[ _-]*(mask|蒙版|选区)?[ _-]*[0-9]*$/i.test(ch.name))channels.push(ch);}
        var diag={taskId:a.id,smartLayerId:t.layerId,width:d.width.as('px'),height:d.height.as('px'),layers:items,shoeChannels:channels.length};
        var f=new File(a.diagnostic);f.encoding='UTF8';f.open('w');f.write(json(diag));f.close();
        var sourceFile=a.contentFile.replace(/\.psb$/i,'-full.png');
        exportCrop(d,[0,0,d.width.as('px'),d.height.as('px')],sourceFile);
        if(channels.length===1){
          d.selection.load(channels[0]);var region=actions.captureSmartProtection({id:a.id,layerId:t.layerId});
          return {box:region.box,smartLayerId:t.layerId,source:'namedChannel',sourceFile:sourceFile,regions:[{box:region.box,mask:null}]};
        }
        return {source:'needsVision',sourceFile:sourceFile,smartLayerId:t.layerId,documentId:d.id};
      }finally{app.activeDocument=parent;}
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
      app.activeDocument=t.parent;var parentHistory=t.parent.activeHistoryState;
      app.activeDocument=t.doc;var internalHistory=t.doc.activeHistoryState;
      app.activeDocument=t.doc;
      try{
        actions.applyPreview({documentId:t.doc.id,layerId:t.layerId,id:a.id,box:box,output:a.output,name:a.name});
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
          target=t.parent.activeLayer; target.visible=true; originalTarget.visible=false;
          t.parentTargetId=target.id;
          if(t.parentKey && smartTaskParents[t.parentKey]) smartTaskParents[t.parentKey].parentTargetId=target.id;
        }
        if(!target)throw Error('回写后找不到可见目标智能对象');
        // ReplaceContents operates on the active layer. Cached targets are
        // reused by later regions, so activate the cached copy before calling
        // the action; otherwise Photoshop replaces the hidden original layer.
        t.parent.activeLayer=target;
        var desc=new ActionDescriptor();desc.putPath(c('null'),new File(a.contentFile));executeAction(s('placedLayerReplaceContents'),desc,DialogModes.NO);
        target.visible=true; t.parent.activeLayer=target;
        try { app.refresh(); } catch(ignoreRefresh) {}
        return {layerId:target.id,originalLayerId:t.layerId,visible:target.visible,documentId:t.parent.id,contentFile:a.contentFile};
      }catch(e){t.parentTargetId=previousTargetId;if(t.parentKey&&smartTaskParents[t.parentKey])smartTaskParents[t.parentKey].parentTargetId=previousTargetId;app.activeDocument=t.doc;t.doc.activeHistoryState=internalHistory;app.activeDocument=t.parent;t.parent.activeHistoryState=parentHistory;throw e;}finally{app.activeDocument=t.parent;}
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
        var rb=bounds(result);result.translate(UnitValue(b[0]+sourceBounds[0]-rb[0],'px'),UnitValue(b[1]+sourceBounds[1]-rb[1],'px'));
        if(t.channel)groupMask(d,group,d.channels.getByName(t.channel));return {groupId:group.id};
      }catch(e){if(group)group.remove();throw e;}finally{if(image)image.close(SaveOptions.DONOTSAVECHANGES);app.activeDocument=d;}
    },
    exportCanvas:function(a){var d=documentFor(a.documentId,true);exportCrop(d,[0,0,d.width.as('px'),d.height.as('px')],a.output);return {output:a.output};},
    saveCopy:function(a){var d=documentFor(a.documentId,true), f=a.output?File(a.output):File.saveDialog('另存换鞋工作副本','*.psb');if(!f)return {cancelled:true};if(!/\.psb$/i.test(f.name))f=File(f.fsName+'.psb');if(f.exists)throw Error('请选择不存在的新文件名，避免覆盖已有文件');var desc=new ActionDescriptor(),options=new ActionDescriptor();options.putBoolean(s('maximizeCompatibility'),true);desc.putObject(c('As  '),s('largeDocumentFormat'),options);desc.putPath(c('In  '),f);desc.putBoolean(c('Cpy '),true);desc.putBoolean(c('LwCs'),true);executeAction(c('save'),desc,DialogModes.NO);return {path:f.fsName};}
  };
  return { dispatch:function(method,args){var units=app.preferences.rulerUnits;try{app.preferences.rulerUnits=Units.PIXELS;if(!actions[method])throw Error('未知操作');return json({ok:true,data:actions[method](args||{})});}catch(e){return json({ok:false,error:e.message});}finally{if(app.documents.length){try{rgb(app.activeDocument);}catch(ignore){}}app.preferences.rulerUnits=units;}}, scanLayers:function(){return json(scan());} };
}());
