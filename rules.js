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
function parseWorkbook(data) {
  const wb = XLSX.read(new Uint8Array(data), {type:'array', cellStyles:true, bookFiles:true});
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
    const skuHeader = cells.find(k => String(sheet[k].v).trim() === '货号');
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
      const font = (wb.Styles.Fonts || [])[style.fontId] || {};
      const baseRole = role(font.color && font.color.rgb);
      const runs = cell.r ? Array.from(xml('<root>'+cell.r+'</root>').getElementsByTagName('r')) : [];
      const roles = new Set(runs.filter(r => r.getElementsByTagName('t').length).map(r => {
        const c = r.getElementsByTagName('color')[0];
        return c ? role(c.getAttribute('rgb')) : baseRole;
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
