#!/usr/bin/env node
'use strict';

/**
 * C6款色与素材绑定审计工具
 * 
 * 检查普通换鞋流程中：
 * 1. Excel目标款色是否唯一匹配到素材组
 * 2. 素材组的cutout和references是否实际存在
 * 3. 参考图文件名解析的view/detail是否合理
 * 4. 实际送入AI的图片SHA256指纹是否与记录一致
 * 5. 同款不同色是否正确区分
 * 6. 素材变更检测
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const workflow = require('../cep/workflow.cjs');
const references = require('../cep/reference-plan.cjs');

function fingerprint(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function auditMaterialBinding(reportFile) {
  console.log('='.repeat(80));
  console.log('C6 款色与素材绑定审计');
  console.log('='.repeat(80));
  console.log(`报告文件: ${reportFile}\n`);

  if (!fs.existsSync(reportFile)) {
    throw Error('报告文件不存在: ' + reportFile);
  }

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const tasks = report.tasks || [];
  
  const issues = [];
  const warnings = [];
  const checked = {
    total: 0,
    withMaterial: 0,
    productMaterialMatch: 0,
    filesMissing: 0,
    filesExist: 0,
    fingerprintMatch: 0,
    fingerprintMismatch: 0,
    viewClassified: 0
  };

  console.log(`批次任务数: ${tasks.length}`);
  console.log(`文档: ${tasks[0]?.name || 'unknown'}\n`);

  // 按货号/颜色分组，检查同款不同色
  const bySkuColor = new Map();
  
  tasks.forEach((task, idx) => {
    checked.total++;
    
    if (!task.product) {
      warnings.push(`任务${idx}[${task.id}]: 无product信息`);
      return;
    }

    const { product, material } = task;
    const key = `${product.sku}/${product.color}`;
    
    if (!bySkuColor.has(key)) {
      bySkuColor.set(key, []);
    }
    bySkuColor.get(key).push(task);

    // 检查1: 款色与素材绑定
    if (!material) {
      issues.push(`任务${idx}[${task.id}]: product存在但material为空 - ${key}`);
      return;
    }

    checked.withMaterial++;

    if (material.sku !== product.sku) {
      issues.push(`任务${idx}[${task.id}]: 货号不匹配 - product=${product.sku}, material=${material.sku}`);
    }

    if (material.color !== product.color) {
      issues.push(`任务${idx}[${task.id}]: 颜色不匹配 - product=${product.color}, material=${material.color}`);
    }

    if (material.sku === product.sku && material.color === product.color) {
      checked.productMaterialMatch++;
    }

    // 检查2: 文件存在性
    const allFiles = [material.cutout, ...(material.references || [])];
    allFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        issues.push(`任务${idx}[${task.id}]: 素材文件不存在 - ${file}`);
        checked.filesMissing++;
      } else {
        checked.filesExist++;
      }
    });

    // 检查3: SHA256指纹一致性
    if (material.hashes && Array.isArray(material.hashes)) {
      material.hashes.forEach(h => {
        const actual = fingerprint(h.file);
        if (!actual) {
          issues.push(`任务${idx}[${task.id}]: 无法读取文件计算指纹 - ${h.file}`);
        } else if (actual !== h.sha256) {
          issues.push(`任务${idx}[${task.id}]: 素材指纹不匹配（素材已变更） - ${path.basename(h.file)}`);
          issues.push(`  记录: ${h.sha256}`);
          issues.push(`  实际: ${actual}`);
          checked.fingerprintMismatch++;
        } else {
          checked.fingerprintMatch++;
        }
      });
    }

    // 检查4: 参考图分类
    if (task.referencePlan) {
      const plan = task.referencePlan;
      checked.viewClassified++;
      
      if (plan.warnings && plan.warnings.length > 0) {
        warnings.push(`任务${idx}[${task.id}]: ${plan.warnings.join('; ')}`);
      }

      // 检查是否有明确的view分类
      const views = plan.entries.map(e => e.view);
      const unknownCount = views.filter(v => v === 'unknown').length;
      
      if (unknownCount === views.length) {
        warnings.push(`任务${idx}[${task.id}]: 所有参考图view=unknown，可能文件命名不规范`);
      }

      // 检查参考图指纹是否在生成请求中
      if (task.autoGeneration && task.autoGeneration.references) {
        const requestFiles = task.autoGeneration.references.files || [];
        const planFiles = plan.files || [];
        
        if (requestFiles.length !== planFiles.length) {
          warnings.push(`任务${idx}[${task.id}]: 参考计划${planFiles.length}张，实际请求${requestFiles.length}张`);
        }
      }
    }
  });

  // 同款不同色检查
  console.log('\n同款不同色检查:');
  console.log('-'.repeat(80));
  
  const skuGroups = new Map();
  bySkuColor.forEach((tasks, key) => {
    const sku = key.split('/')[0];
    if (!skuGroups.has(sku)) {
      skuGroups.set(sku, new Map());
    }
    skuGroups.get(sku).set(key, tasks);
  });

  skuGroups.forEach((colors, sku) => {
    if (colors.size > 1) {
      console.log(`\n货号 ${sku} 有 ${colors.size} 种颜色:`);
      colors.forEach((tasks, key) => {
        const task = tasks[0];
        const cutoutFile = task.material?.cutout ? path.basename(task.material.cutout) : 'N/A';
        console.log(`  ${key.padEnd(40)} -> ${cutoutFile}`);
        
        // 检查是否不同色使用了相同素材文件
        colors.forEach((otherTasks, otherKey) => {
          if (key !== otherKey) {
            const otherTask = otherTasks[0];
            if (task.material?.cutout === otherTask.material?.cutout) {
              issues.push(`同款不同色错误: ${key} 和 ${otherKey} 使用了相同的cutout文件`);
            }
          }
        });
      });
    }
  });

  // 输出统计
  console.log('\n\n审计统计:');
  console.log('-'.repeat(80));
  console.log(`总任务数:           ${checked.total}`);
  console.log(`有素材绑定:         ${checked.withMaterial}`);
  console.log(`款色完全匹配:       ${checked.productMaterialMatch}`);
  console.log(`素材文件存在:       ${checked.filesExist}`);
  console.log(`素材文件缺失:       ${checked.filesMissing}`);
  console.log(`指纹匹配:           ${checked.fingerprintMatch}`);
  console.log(`指纹不匹配(变更):   ${checked.fingerprintMismatch}`);
  console.log(`有参考计划:         ${checked.viewClassified}`);

  // 输出问题
  if (issues.length > 0) {
    console.log('\n\n发现问题 (' + issues.length + ' 项):');
    console.log('='.repeat(80));
    issues.forEach(issue => console.log(issue));
  }

  if (warnings.length > 0) {
    console.log('\n\n警告 (' + warnings.length + ' 项):');
    console.log('='.repeat(80));
    warnings.forEach(warning => console.log(warning));
  }

  if (issues.length === 0 && checked.fingerprintMismatch === 0) {
    console.log('\n\n✓ 款色与素材绑定验证通过');
  } else {
    console.log('\n\n✗ 发现绑定问题或素材变更');
  }

  console.log('='.repeat(80));
  
  return {
    issues,
    warnings,
    stats: checked,
    hasErrors: issues.length > 0 || checked.fingerprintMismatch > 0
  };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node audit-material-binding.cjs <report.json路径>');
    console.error('示例: node audit-material-binding.cjs /Users/.../AI-Shoe-Preview/1789556497573/report.json');
    process.exit(1);
  }

  try {
    const result = auditMaterialBinding(args[0]);
    process.exit(result.hasErrors ? 1 : 0);
  } catch (e) {
    console.error('\n审计失败:', e.message);
    process.exit(1);
  }
}

module.exports = { auditMaterialBinding };
