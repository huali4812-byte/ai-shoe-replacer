#!/usr/bin/env node
'use strict';

/**
 * C6专项测试：同款不同色素材绑定验证
 * 
 * 这是最关键的测试：确保同一货号的不同配色使用了正确的参考图
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fingerprint(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function testMultiColorBinding(reportFile) {
  console.log('='.repeat(80));
  console.log('C6专项测试：同款不同色素材绑定');
  console.log('='.repeat(80));
  console.log(`报告文件: ${reportFile}\n`);

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const tasks = report.tasks || [];

  // 按货号分组
  const bySku = new Map();
  tasks.forEach(task => {
    if (!task.product || !task.material) return;
    
    const sku = task.product.sku;
    if (!bySku.has(sku)) {
      bySku.set(sku, []);
    }
    bySku.get(sku).push(task);
  });

  console.log(`货号总数: ${bySku.size}`);
  
  const multiColorSkus = Array.from(bySku.entries())
    .filter(([sku, tasks]) => {
      // 统计不同颜色
      const colors = new Set(tasks.map(t => t.product.color));
      return colors.size > 1;
    });

  console.log(`同款不同色货号: ${multiColorSkus.length}\n`);

  if (multiColorSkus.length === 0) {
    console.log('✓ 无同款不同色场景，无需测试');
    console.log('='.repeat(80));
    return { passed: true, tests: [] };
  }

  const testResults = [];
  let totalTests = 0;
  let passedTests = 0;

  multiColorSkus.forEach(([sku, tasks]) => {
    console.log(`\n货号: ${sku}`);
    console.log('-'.repeat(80));

    // 按颜色分组
    const byColor = new Map();
    tasks.forEach(task => {
      const color = task.product.color;
      if (!byColor.has(color)) {
        byColor.set(color, []);
      }
      byColor.get(color).push(task);
    });

    console.log(`配色数: ${byColor.size}`);
    byColor.forEach((colorTasks, color) => {
      console.log(`  - ${color} (${colorTasks.length}个任务)`);
    });

    // 测试1: 每个颜色的素材cutout应该唯一
    const cutoutByColor = new Map();
    byColor.forEach((colorTasks, color) => {
      const cutouts = new Set(colorTasks.map(t => t.material.cutout));
      cutoutByColor.set(color, Array.from(cutouts));
    });

    totalTests++;
    let test1Pass = true;
    console.log('\n测试1: 每个配色使用唯一的cutout文件');
    cutoutByColor.forEach((cutouts, color) => {
      if (cutouts.length > 1) {
        console.log(`  ✗ ${color}: 使用了${cutouts.length}个不同的cutout`);
        cutouts.forEach(c => console.log(`    - ${path.basename(c)}`));
        test1Pass = false;
      } else {
        console.log(`  ✓ ${color}: ${path.basename(cutouts[0])}`);
      }
    });
    if (test1Pass) passedTests++;

    // 测试2: 不同颜色不应该使用相同的cutout
    totalTests++;
    let test2Pass = true;
    console.log('\n测试2: 不同配色不应使用相同cutout');
    const allCutouts = new Map();
    cutoutByColor.forEach((cutouts, color) => {
      const cutout = cutouts[0];
      if (allCutouts.has(cutout)) {
        console.log(`  ✗ cutout冲突: ${path.basename(cutout)}`);
        console.log(`    - ${allCutouts.get(cutout)}`);
        console.log(`    - ${color}`);
        test2Pass = false;
      } else {
        allCutouts.set(cutout, color);
      }
    });
    if (test2Pass) {
      console.log('  ✓ 所有配色使用不同的cutout');
      passedTests++;
    }

    // 测试3: 参考图文件名应包含对应颜色
    totalTests++;
    let test3Pass = true;
    console.log('\n测试3: 参考图文件名颜色匹配');
    byColor.forEach((colorTasks, targetColor) => {
      const task = colorTasks[0];
      const references = task.material.references || [];
      
      references.forEach(ref => {
        const fileName = path.basename(ref);
        const parts = fileName.split('_');
        const fileColor = parts[1];
        
        if (!fileColor) return;
        
        // 简单的颜色token匹配
        const normalizeColor = (s) => String(s).replace(/[\/\s、，,]+/g, '-').toLowerCase();
        const targetTokens = new Set(normalizeColor(targetColor).split('-').filter(Boolean));
        const fileTokens = new Set(normalizeColor(fileColor).split('-').filter(Boolean));
        
        let commonTokens = 0;
        for (const token of targetTokens) {
          if (fileTokens.has(token)) commonTokens++;
        }
        
        if (commonTokens === 0) {
          console.log(`  ✗ ${targetColor}: 参考图颜色不匹配`);
          console.log(`    文件: ${fileName}`);
          console.log(`    目标颜色token: ${Array.from(targetTokens).join(', ')}`);
          console.log(`    文件颜色token: ${Array.from(fileTokens).join(', ')}`);
          test3Pass = false;
        }
      });
    });
    if (test3Pass) {
      console.log('  ✓ 所有参考图颜色匹配');
      passedTests++;
    }

    testResults.push({
      sku,
      colors: byColor.size,
      test1Pass,
      test2Pass,
      test3Pass
    });
  });

  // 汇总
  console.log('\n');
  console.log('='.repeat(80));
  console.log('测试汇总');
  console.log('='.repeat(80));
  console.log(`同款不同色货号:   ${multiColorSkus.length}`);
  console.log(`总测试数:         ${totalTests}`);
  console.log(`通过测试:         ${passedTests}`);
  console.log(`失败测试:         ${totalTests - passedTests}`);
  
  if (totalTests === passedTests) {
    console.log('\n✓ 同款不同色素材绑定验证通过');
  } else {
    console.log('\n✗ 同款不同色素材绑定存在问题');
  }
  console.log('='.repeat(80));

  return {
    passed: totalTests === passedTests,
    tests: testResults,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: totalTests - passedTests
    }
  };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node test-multi-color-binding.cjs <report.json路径>');
    console.error('示例: node test-multi-color-binding.cjs /Users/.../AI-Shoe-Preview/1789556497573/report.json');
    process.exit(1);
  }

  try {
    const result = testMultiColorBinding(args[0]);
    process.exit(result.passed ? 0 : 1);
  } catch (e) {
    console.error('\n测试失败:', e.message);
    process.exit(1);
  }
}

module.exports = { testMultiColorBinding };
