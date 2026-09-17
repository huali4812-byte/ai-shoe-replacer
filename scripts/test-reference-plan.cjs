#!/usr/bin/env node
'use strict';

const references = require('../cep/reference-plan.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 创建临时测试文件
const tempDir = path.join(os.tmpdir(), 'shoe-test-' + Date.now());
fs.mkdirSync(tempDir, { recursive: true });

const testFiles = [
  'Z2003-矿石灰-外侧.png',
  'Z2003-矿石灰-内侧.jpg',
  'Z2003-矿石灰-鞋底.jpg',
  'Z2003-矿石灰-鞋头.jpg',
  'Z2003-矿石灰-后跟.jpg',
  'Z2003-矿石灰-cutout.png'
];

// 创建空文件
testFiles.forEach(name => {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, 'test');
});

const material = {
  cutout: path.join(tempDir, 'Z2003-矿石灰-cutout.png'),
  references: testFiles.slice(0, 5).map(name => path.join(tempDir, name))
};

console.log('测试1: 场景视角未知（应按内侧→外侧→鞋底优先级排序）\n');
const plan1 = references.plan(material, { view: 'unknown' });
console.log('warnings:', plan1.warnings);
console.log('\n排序结果：');
plan1.entries.forEach((e, i) => {
  const name = path.basename(e.file);
  console.log(`  ${i + 1}. ${name.padEnd(30)} [view: ${e.view}]`);
});

console.log('\n\n测试2: 请求外侧视角（应优先匹配外侧）\n');
const plan2 = references.plan(material, { view: 'outer' });
console.log('warnings:', plan2.warnings);
console.log('viewMatched:', plan2.viewMatched);
console.log('\n排序结果：');
plan2.entries.forEach((e, i) => {
  const name = path.basename(e.file);
  const marker = e.view === 'outer' ? ' ← 匹配' : '';
  console.log(`  ${i + 1}. ${name.padEnd(30)} [view: ${e.view}]${marker}`);
});

// 清理
fs.rmSync(tempDir, { recursive: true });
