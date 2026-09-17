'use strict';
const path = require('path');

/**
 * 验证参考图文件名是否符合规范
 * 规范命名示例：
 *   - GW-亮银色-内侧.jpg
 *   - Z2003-矿石灰-外侧.png
 *   - Y-陨石灰-鞋底.jpg
 */
function validateReferenceNaming(files) {
  const warnings = [];
  const errors = [];
  
  const required = {
    inner: false,   // 内侧
    outer: false,   // 外侧
    sole: false     // 鞋底
  };
  
  for (const file of files) {
    const basename = path.basename(file, path.extname(file));
    const lower = basename.toLowerCase();
    
    // 检查是否包含必需的视角关键词
    if (/内侧|inner|medial/i.test(basename)) {
      required.inner = true;
    } else if (/外侧|outer|lateral/i.test(basename)) {
      required.outer = true;
    } else if (/鞋底|底部|sole|bottom/i.test(basename)) {
      required.sole = true;
    } else if (/侧面|side/i.test(basename)) {
      // 模糊的"侧面"标注
      warnings.push(`${path.basename(file)}: 标注为"侧面"，建议明确标注"内侧"或"外侧"`);
    } else {
      // 没有明确视角标注
      warnings.push(`${path.basename(file)}: 文件名缺少视角标注（内侧/外侧/鞋底等）`);
    }
    
    // 检查是否包含款色信息
    if (!/[\u4e00-\u9fa5]{2,}|[A-Z0-9]{2,}/i.test(basename)) {
      warnings.push(`${path.basename(file)}: 文件名建议包含款色信息`);
    }
  }
  
  // 检查必需视角是否齐全
  if (!required.inner) {
    errors.push('缺少"内侧"视角参考图');
  }
  if (!required.outer) {
    errors.push('缺少"外侧"视角参考图');
  }
  if (!required.sole) {
    warnings.push('建议补充"鞋底"视角参考图，有助于鞋底纹路验证');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 建议标准文件名
 */
function suggestFilename(sku, color, view) {
  const viewMap = {
    inner: '内侧',
    outer: '外侧',
    sole: '鞋底',
    front: '鞋头',
    back: '后跟',
    top: '俯视'
  };
  return `${sku}-${color}-${viewMap[view] || view}`;
}

module.exports = { validateReferenceNaming, suggestFilename };
