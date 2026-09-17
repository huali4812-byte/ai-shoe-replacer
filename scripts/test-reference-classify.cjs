#!/usr/bin/env node
'use strict';

const references = require('../cep/reference-plan.cjs');

// 测试各种文件名
const testFiles = [
  '/path/to/GW-亮银色-内侧.jpg',
  '/path/to/Z2003-矿石灰-外侧.png',
  '/path/to/Y-陨石灰-鞋底.jpg',
  '/path/to/1539-inner.png',
  '/path/to/1539-outer.png',
  '/path/to/1539-sole.png',
  '/path/to/侧面.jpg',
  '/path/to/左侧.jpg',
  '/path/to/右侧.jpg',
  '/path/to/鞋头.jpg',
  '/path/to/后跟.jpg',
  '/path/to/logo-inner.jpg',
  '/path/to/pulltab-back.jpg'
];

console.log('文件名分类测试：\n');
console.log('文件名'.padEnd(35), '→', 'view'.padEnd(12), 'detail'.padEnd(10));
console.log('-'.repeat(70));

for (const file of testFiles) {
  const result = references.classify(file);
  const name = file.split('/').pop();
  console.log(name.padEnd(35), '→', result.view.padEnd(12), result.detail.padEnd(10));
}
