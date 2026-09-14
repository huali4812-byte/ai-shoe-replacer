const XLSX = require('./vendor/xlsx.full.min.js');
const { DOMParser } = require('./vendor/xmldom/lib/index.js');

function xml(text) { return new DOMParser().parseFromString(text, 'text/xml'); }
function fileText(wb, path) {
  const f = wb.files[path];
  if (!f) throw new Error(`Excel 内部文件缺失：${path}`);
  if (typeof f.content === 'string') return f.content;
  const bytes = f.content;
  // Decode UTF-8 without requiring Node APIs in Photoshop's UXP runtime.
  const chunks = [];
  for (let i=0; i<bytes.length; i+=4096) {
    chunks.push(Array.from(bytes.slice(i,i+4096), b => '%' + b.toString(16).padStart(2,'0')).join(''));
  }
  return decodeURIComponent(chunks.join(''));
}
function role(rgb) {
  const value = String(rgb || '').slice(-6).toUpperCase();
  if (['FF0000','FE0300'].includes(value)) return '主推';
  if (['70AD47','92D04F','00B14D','00B050','008000','00FF00'].includes(value)) return '次推';
  return '';
}
// Resolve original OOXML colors: the bundled SheetJS drops zero padding for indexed colors.
function colorResolver(wb, stylesXml) {
  const palette = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '+
    '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '+
    '800000 008000 000080 808000 800080 008080 C0C0C0 808080 '+
    '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCCC '+
    '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF '+
    '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 '+
    '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 '+
    '003366 339966 003300 333300 993300 993366 333399 333333').split(' ');
  const indexed = stylesXml.getElementsByTagName('indexedColors')[0];
  if(indexed) Array.from(indexed.getElementsByTagName('rgbColor')).forEach((c,i)=>palette[i]=c.getAttribute('rgb').slice(-6));
  const theme=[];
  if(wb.files['xl/theme/theme1.xml']) {
    const doc=xml(fileText(wb,'xl/theme/theme1.xml'));
    const scheme=Array.from(doc.getElementsByTagName('*')).find(n=>n.localName==='clrScheme');
    if(scheme) Array.from(scheme.childNodes).filter(n=>n.nodeType===1).forEach(n=>{
      const c=Array.from(n.childNodes).find(x=>x.nodeType===1);
      const index=['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'].indexOf(n.localName);
      if(index>=0)theme[index]=c&&(c.getAttribute('lastClr')||c.getAttribute('val'));
    });
  }
  return c=>{
    if(!c||c.getAttribute('auto')==='1')return '';
    let value=c.getAttribute('rgb');
    if(!value&&c.hasAttribute('indexed'))value=palette[Number(c.getAttribute('indexed'))];
    if(!value&&c.hasAttribute('theme'))value=theme[Number(c.getAttribute('theme'))];
    // Do not guess unsupported/custom shades into red or green roles.
    if(c.hasAttribute('tint')&&Number(c.getAttribute('tint'))!==0)return '';
    return role(value);
  };
}
function parseWorkbook(data) {
  const wb = XLSX.read(new Uint8Array(data), {type:'array', cellStyles:true, bookFiles:true});
  const stylesXml=xml(fileText(wb,'xl/styles.xml'));
  const resolveColor=colorResolver(wb,stylesXml);
  const fonts=Array.from(stylesXml.getElementsByTagName('fonts')[0].getElementsByTagName('font'));
  const book = xml(fileText(wb,'xl/workbook.xml'));
  const rels = xml(fileText(wb,'xl/_rels/workbook.xml.rels'));
  const relMap = {};
  Array.from(rels.getElementsByTagName('Relationship')).forEach(r => {
    const target = r.getAttribute('Target');
    relMap[r.getAttribute('Id')] = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//,'');
  });
  const result = [], warnings = [];
  for (const sheetNode of Array.from(book.getElementsByTagName('sheet'))) {
    const name = sheetNode.getAttribute('name'), sheet = wb.Sheets[name];
    if (!sheet) continue;
    // Stored dimensions can include a million formatted-but-empty rows.
    const cells = Object.keys(sheet).filter(k => /^[A-Z]+[0-9]+$/.test(k) && sheet[k].v != null && String(sheet[k].v).trim());
    const skuHeader = cells.find(k => ['货号','下单款号','款号','商品款号'].includes(String(sheet[k].v).replace(/\s+/g,'').trim()));
    const colorHeader = cells.find(k => String(sheet[k].v).startsWith('色号'));
    if (!skuHeader || !colorHeader) {
      if (skuHeader) warnings.push(`${name} 只有货号，没有色号列，未用于款色匹配`);
      continue;
    }
    const sc = XLSX.utils.decode_cell(skuHeader), cc = XLSX.utils.decode_cell(colorHeader);
    const raw = xml(fileText(wb,relMap[sheetNode.getAttribute('r:id')]));
    const styles = {};
    Array.from(raw.getElementsByTagName('c')).forEach(c => { styles[c.getAttribute('r')] = Number(c.getAttribute('s') || 0); });
    const mergedValue = (row,col) => {
      let address = XLSX.utils.encode_cell({r:row,c:col});
      const merge = (sheet['!merges'] || []).find(m => row>=m.s.r && row<=m.e.r && col>=m.s.c && col<=m.e.c);
      if (merge) address = XLSX.utils.encode_cell(merge.s);
      return String((sheet[address] || {}).v || '').trim();
    };
    for (const address of cells) {
      const pos = XLSX.utils.decode_cell(address);
      if (pos.c !== cc.c || pos.r <= cc.r) continue;
      const cell = sheet[address], sku = mergedValue(pos.r,sc.c);
      if (!sku) { warnings.push(`${name}!${address} 缺少货号`); continue; }
      const style = (wb.Styles.CellXf || [])[styles[address]] || {};
      const font = fonts[style.fontId];
      const baseRole = resolveColor(font&&font.getElementsByTagName('color')[0]);
      const runs = cell.r ? Array.from(xml('<root>'+cell.r+'</root>').getElementsByTagName('r')) : [];
      const roles = new Set(runs.filter(r => r.getElementsByTagName('t').length).map(r => {
        const c = r.getElementsByTagName('color')[0];
        return c ? resolveColor(c) : baseRole;
      }));
      const detected = roles.size ? (roles.size === 1 ? Array.from(roles)[0] : '') : baseRole;
      result.push({id:`${name}!${address}`,sku,color:String(cell.v).trim(),role:detected,source:`${name}!${address}`});
      if (!detected) warnings.push(`${name}!${address} 主次推标记不明确，需要确认`);
    }
  }
  if (!result.length) throw new Error('没有找到同时包含货号和色号的工作表');
  return {products:result,warnings};
}
function layerRole(value) {
  const name = String(value && value._value || value || '').toLowerCase();
  return ({red:'主推',green:'次推',grain:'次推',violet:'双鞋',purple:'双鞋'})[name] || '';
}
function matchProduct(products, text, wantedRole) {
  return products.filter(p => p.role === wantedRole && new RegExp('(^|[^A-Za-z0-9])'+p.sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^A-Za-z0-9])','i').test(text));
}
module.exports = {parseWorkbook,layerRole,matchProduct};
