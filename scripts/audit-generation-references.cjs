#!/usr/bin/env node
'use strict';

/**
 * C6深度审计：检查AI生成请求中实际使用的参考图
 * 
 * 验证从Excel款色 -> Eagle素材 -> 参考计划 -> AI请求的完整链路
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const workflow = require('../cep/workflow.cjs');

function fingerprint(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function auditGenerationReferences(batchFolder) {
  console.log('='.repeat(80));
  console.log('C6深度审计：AI生成请求参考图验证');
  console.log('='.repeat(80));
  console.log(`批次目录: ${batchFolder}\n`);

  const reportFile = path.join(batchFolder, 'report.json');
  if (!fs.existsSync(reportFile)) {
    throw Error('批次报告文件不存在');
  }

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const tasks = report.tasks || [];
  
  const issues = [];
  const checked = {
    totalTasks: 0,
    withGeneration: 0,
    referencesVerified: 0,
    fingerprintChecked: 0,
    fingerprintMismatch: 0,
    viewMismatch: 0
  };

  console.log(`批次任务数: ${tasks.length}\n`);

  tasks.forEach((task, idx) => {
    checked.totalTasks++;

    if (!task.product || !task.material) return;

    const taskKey = `${task.id} [${task.product.sku}/${task.product.color}]`;

    // 查找子区域
    const regions = [];
    if (task.region) {
      regions.push(task);
    }
    if (task.children) {
      regions.push(...task.children);
    }

    regions.forEach((region, rIdx) => {
      const regionKey = region.id;
      
      // 读取auto-generation记录
      const genFile = path.join(batchFolder, `${regionKey}-auto-generation.json`);
      if (!fs.existsSync(genFile)) return;

      checked.withGeneration++;
      
      const genRecord = JSON.parse(fs.readFileSync(genFile, 'utf8'));
      
      // 验证参考计划
      if (!genRecord.references) {
        issues.push(`${regionKey}: 缺少references记录`);
        return;
      }

      const plan = genRecord.references;
      checked.referencesVerified++;

      // 检查requestedView与实际可见面
      if (plan.requestedView === 'unknown' && plan.warnings) {
        // 这是预期的，记录但不算错误
      }

      // 验证每个参考图的指纹
      if (plan.entries && Array.isArray(plan.entries)) {
        plan.entries.forEach(entry => {
          checked.fingerprintChecked++;
          
          const actual = fingerprint(entry.file);
          if (!actual) {
            issues.push(`${regionKey}: 参考图文件不存在 - ${path.basename(entry.file)}`);
          } else if (entry.sha256 && actual !== entry.sha256) {
            issues.push(`${regionKey}: 参考图指纹不匹配 - ${path.basename(entry.file)}`);
            issues.push(`  记录: ${entry.sha256}`);
            issues.push(`  实际: ${actual}`);
            checked.fingerprintMismatch++;
          }

          // 检查view分类
          if (entry.view === 'unknown' && entry.detail === 'overall') {
            // 文件名无法识别视角
          }
        });
      }

      // 验证实际发送的文件列表
      if (genRecord.attempts && genRecord.attempts.length > 0) {
        const attempt = genRecord.attempts[0];
        if (attempt.output && attempt.output.references) {
          const sentRefs = attempt.output.references || [];
          const planFiles = plan.files || [];
          
          if (sentRefs.length !== planFiles.length) {
            issues.push(`${regionKey}: 参考计划${planFiles.length}张，实际发送${sentRefs.length}张`);
          }

          // 验证发送的文件与计划一致
          sentRefs.forEach((ref, i) => {
            if (i < planFiles.length && ref !== planFiles[i]) {
              issues.push(`${regionKey}: 参考图顺序不一致 [${i}]`);
              issues.push(`  计划: ${path.basename(planFiles[i])}`);
              issues.push(`  实际: ${path.basename(ref)}`);
            }
          });
        }
      }

      // 检查是否有错误的款色参考
      if (region.material && task.material) {
        const regionMaterial = region.material;
        const taskMaterial = task.material;
        
        // 双人图场景：子区域可以有独立的款色（主推/次推）
        const isDualPerson = task.dualRole === true;
        const isChildRegion = region.role !== undefined;
        
        if (regionMaterial.sku !== taskMaterial.sku || 
            regionMaterial.color !== taskMaterial.color) {
          
          // 双人图的子区域允许不同款色
          if (isDualPerson && isChildRegion) {
            // 验证子区域的款色与其role对应的roleProducts是否一致
            const roleProduct = task.roleProducts && task.roleProducts[region.role];
            if (roleProduct) {
              if (regionMaterial.sku !== roleProduct.sku || 
                  regionMaterial.color !== roleProduct.color) {
                issues.push(`${regionKey}: 双人图区域素材与角色款色不一致`);
                issues.push(`  角色: ${region.role}`);
                issues.push(`  预期: ${roleProduct.sku}/${roleProduct.color}`);
                issues.push(`  实际: ${regionMaterial.sku}/${regionMaterial.color}`);
              }
            }
          } else {
            // 非双人图场景，区域素材必须与任务素材一致
            issues.push(`${regionKey}: 区域素材与任务素材不一致`);
            issues.push(`  任务: ${taskMaterial.sku}/${taskMaterial.color}`);
            issues.push(`  区域: ${regionMaterial.sku}/${regionMaterial.color}`);
          }
        }

        // 验证参考图确实来自该款色的素材组
        if (plan.entries) {
          // 使用workflow的skuVariants处理多品牌联名货号，如GW/Y/Z2003 -> [GW2003, GY2003, GZ2003]
          const validSkus = workflow.skuVariants(taskMaterial.sku);
          
          plan.entries.forEach(entry => {
            const fileName = path.basename(entry.file);
            const parts = fileName.split('_');
            const skuInFile = parts[0];
            const colorInFile = parts[1];
            
            // 检查货号是否在有效变体列表中
            if (skuInFile && !validSkus.some(v => v === skuInFile)) {
              issues.push(`${regionKey}: 参考图货号不匹配 - ${fileName}`);
              issues.push(`  目标货号: ${taskMaterial.sku} (变体: ${validSkus.join(', ')})`);
              issues.push(`  文件货号: ${skuInFile}`);
            }
            
            // 检查颜色是否匹配（关键！）
            if (colorInFile) {
              const normalizeColor = (s) => String(s).replace(/[\/\s、，,]+/g, '-').toLowerCase();
              const normalizedTargetColor = normalizeColor(taskMaterial.color);
              const normalizedFileColor = normalizeColor(colorInFile);
              
              // 颜色token匹配检查
              const colorTokensTarget = new Set(normalizedTargetColor.split('-').filter(Boolean));
              const colorTokensFile = new Set(normalizedFileColor.split('-').filter(Boolean));
              let commonTokens = 0;
              for (const token of colorTokensTarget) {
                if (colorTokensFile.has(token)) commonTokens++;
              }
              
              // 如果没有任何共同颜色词，则报告错误（同款不同色的关键检查）
              if (commonTokens === 0) {
                issues.push(`${regionKey}: 参考图颜色不匹配 - ${fileName}`);
                issues.push(`  目标颜色: ${taskMaterial.color}`);
                issues.push(`  文件颜色: ${colorInFile}`);
              }
            }
          });
        }
      }
    });
  });

  // 输出统计
  console.log('\n审计统计:');
  console.log('-'.repeat(80));
  console.log(`总任务数:           ${checked.totalTasks}`);
  console.log(`有生成记录:         ${checked.withGeneration}`);
  console.log(`参考计划验证:       ${checked.referencesVerified}`);
  console.log(`参考图指纹检查:     ${checked.fingerprintChecked}`);
  console.log(`指纹不匹配:         ${checked.fingerprintMismatch}`);

  // 输出问题
  if (issues.length > 0) {
    console.log('\n\n发现问题 (' + issues.length + ' 项):');
    console.log('='.repeat(80));
    issues.forEach(issue => console.log(issue));
  }

  if (issues.length === 0 && checked.fingerprintMismatch === 0) {
    console.log('\n\n✓ AI生成请求参考图验证通过');
  } else {
    console.log('\n\n✗ 发现参考图绑定问题');
  }

  console.log('='.repeat(80));
  
  return {
    issues,
    stats: checked,
    hasErrors: issues.length > 0 || checked.fingerprintMismatch > 0
  };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node audit-generation-references.cjs <批次目录>');
    console.error('示例: node audit-generation-references.cjs /path/to/AI-Shoe-Preview/example-batch');
    process.exit(1);
  }

  try {
    const result = auditGenerationReferences(args[0]);
    process.exit(result.hasErrors ? 1 : 0);
  } catch (e) {
    console.error('\n审计失败:', e.message);
    process.exit(1);
  }
}

module.exports = { auditGenerationReferences };
