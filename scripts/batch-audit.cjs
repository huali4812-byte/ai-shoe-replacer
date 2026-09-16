#!/usr/bin/env node
'use strict';

/**
 * C6批量审计：测试多个历史批次的款色与素材绑定
 */

const fs = require('fs');
const path = require('path');
const { auditMaterialBinding } = require('./audit-material-binding.cjs');
const { auditGenerationReferences } = require('./audit-generation-references.cjs');

function batchAudit(previewRoot) {
  console.log('='.repeat(80));
  console.log('C6批量审计：款色与素材绑定');
  console.log('='.repeat(80));
  console.log(`预览目录: ${previewRoot}\n`);

  if (!fs.existsSync(previewRoot)) {
    throw Error('预览目录不存在');
  }

  // 查找所有批次目录
  const batches = fs.readdirSync(previewRoot)
    .filter(name => /^\d+$/.test(name))
    .map(name => {
      const dir = path.join(previewRoot, name);
      const stat = fs.statSync(dir);
      return { name, dir, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime) // 最新的在前
    .slice(0, 10); // 只测试最近10个批次

  console.log(`找到 ${batches.length} 个最近批次\n`);

  const results = [];
  let totalIssues = 0;
  let totalBatches = 0;
  let passedBatches = 0;

  batches.forEach((batch, idx) => {
    const reportFile = path.join(batch.dir, 'report.json');
    if (!fs.existsSync(reportFile)) {
      console.log(`[${idx + 1}/${batches.length}] ${batch.name} - 跳过（无报告文件）\n`);
      return;
    }

    totalBatches++;
    console.log(`[${idx + 1}/${batches.length}] ${batch.name}`);
    console.log('-'.repeat(80));

    try {
      // 第一阶段：素材绑定检查
      const result1 = auditMaterialBinding(reportFile);
      
      // 第二阶段：生成请求参考图检查
      const result2 = auditGenerationReferences(batch.dir);

      const totalIssuesInBatch = result1.issues.length + result2.issues.length;
      totalIssues += totalIssuesInBatch;

      if (!result1.hasErrors && !result2.hasErrors) {
        passedBatches++;
        console.log('✓ 通过\n');
      } else {
        console.log(`✗ 发现 ${totalIssuesInBatch} 个问题\n`);
      }

      results.push({
        batch: batch.name,
        passed: !result1.hasErrors && !result2.hasErrors,
        issues: totalIssuesInBatch,
        stats: {
          material: result1.stats,
          generation: result2.stats
        }
      });
    } catch (e) {
      console.log(`✗ 审计失败: ${e.message}\n`);
      results.push({
        batch: batch.name,
        passed: false,
        error: e.message
      });
    }
  });

  // 汇总报告
  console.log('\n');
  console.log('='.repeat(80));
  console.log('批量审计汇总');
  console.log('='.repeat(80));
  console.log(`总批次数:         ${totalBatches}`);
  console.log(`通过批次:         ${passedBatches}`);
  console.log(`有问题批次:       ${totalBatches - passedBatches}`);
  console.log(`总问题数:         ${totalIssues}`);
  console.log('='.repeat(80));

  return {
    results,
    summary: {
      total: totalBatches,
      passed: passedBatches,
      failed: totalBatches - passedBatches,
      totalIssues
    }
  };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node batch-audit.cjs <AI-Shoe-Preview目录>');
    console.error('示例: node batch-audit.cjs /Users/.../Pictures/AI-Shoe-Preview');
    process.exit(1);
  }

  try {
    const result = batchAudit(args[0]);
    process.exit(result.summary.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('\n批量审计失败:', e.message);
    process.exit(1);
  }
}

module.exports = { batchAudit };
