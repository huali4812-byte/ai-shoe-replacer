#!/usr/bin/env node
'use strict';

// 测试不同 Gemini 模型的文本分析能力
const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_FILE = path.join(require('os').homedir(), '.kaienapi/config.json');

async function testModel(modelName, imageFile) {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const base = (config.base_url || 'https://kaienapi.com').replace(/\/$/, '') + '/v1/';
  
  // 准备图片
  const imageData = fs.readFileSync(imageFile);
  const base64 = imageData.toString('base64');
  const mime = imageFile.endsWith('.png') ? 'image/png' : 'image/jpeg';
  
  const payload = JSON.stringify({
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '这是一张鞋的图片，请返回 JSON：{"color":"颜色","view":"视角"}' },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` }}
      ]
    }],
    modalities: ['text'],
    extra_body: { google: { response_modalities: ['TEXT'] }}
  });

  return new Promise((resolve, reject) => {
    const req = https.request(base + 'chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.api_key,
        'Content-Type': 'application/json'
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            const content = data.choices?.[0]?.message?.content || '';
            resolve({ model: modelName, status: 'success', content });
          } catch (e) {
            resolve({ model: modelName, status: 'json_error', raw: body.slice(0, 500) });
          }
        } else {
          resolve({ model: modelName, status: 'http_error', code: res.statusCode, body: body.slice(0, 500) });
        }
      });
    });
    
    req.on('error', e => resolve({ model: modelName, status: 'network_error', error: e.message }));
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.end(payload);
  });
}

(async () => {
  const testImage = process.argv[2];
  if (!testImage || !fs.existsSync(testImage)) {
    console.error('用法: node test-analysis-model.cjs <测试图片路径>');
    process.exit(1);
  }

  console.log('测试图片:', testImage);
  console.log('\n开始测试不同模型的文本分析能力...\n');

  const models = [
    'gemini-3.1-flash-image-preview',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp'
  ];

  for (const model of models) {
    console.log(`测试 ${model}...`);
    const result = await testModel(model, testImage);
    console.log(JSON.stringify(result, null, 2));
    console.log('---\n');
  }
})();
