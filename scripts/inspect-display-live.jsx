#target photoshop
(function(){
  var d=app.activeDocument,lines=['document\t'+d.name+'\t'+d.id+'\t'+d.width.as('px')+'\t'+d.height.as('px')];
  function walk(ls,p){for(var i=0;i<ls.length;i++){var l=ls[i],b=l.bounds,n=p+'/'+l.name;lines.push([l.id,l.typename==='LayerSet'?'GROUP':String(l.kind),l.visible,n.replace(/[\t\r\n]/g,' '),[b[0].as('px'),b[1].as('px'),b[2].as('px'),b[3].as('px')].join(','),l.typename!=='LayerSet'&&l.kind===LayerKind.TEXT?String(l.textItem.contents).replace(/[\t\r\n]/g,' '):''].join('\t'));if(l.typename==='LayerSet')walk(l.layers,n);}}
  walk(d.layers,'');var f=new File('/Users/zhangjiabin/Documents/ps识别插件/outputs/display-live-structure.tsv');f.encoding='UTF8';f.open('w');f.write(lines.join('\n'));f.close();
})();
