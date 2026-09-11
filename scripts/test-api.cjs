const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { EventEmitter } = require('events');
const source = fs.readFileSync(path.join(__dirname, '../cep/api.cjs'), 'utf8');
const {PNG}=require('../cep/vendor/pngjs');
const png = PNG.sync.write(new PNG({width:2,height:2}));
let status = 200, response, recorded, saved = [], exists = [];
const fakeFs = {
  readFileSync(file) { return file.endsWith('config.json') ? JSON.stringify({ api_key: 'test-secret', base_url: 'https://example.test/v1/', model: 'gpt-sol' }) : png; },
  statSync() { return { size: 8 }; },
  mkdirSync(dir) { exists.push(dir); },
  writeFileSync(file, bytes, options) { saved.push({ file, bytes, options }); }
};
const https = { request(url, options, callback) {
  const req = new EventEmitter();
  req.end = body => {
    recorded = { url, options, body };
    process.nextTick(() => {
      const res = new EventEmitter(); res.statusCode = status; callback(res);
      res.emit('data', Buffer.from(JSON.stringify(response))); res.emit('end'); req.emit('close');
    });
  };
  req.destroy = error => { req.emit('error', error); req.emit('close'); };
  return req;
} };
const context = { module: { exports: {} }, Buffer, URL, setTimeout, clearTimeout,
  require(name) { return name === 'fs' ? fakeFs : name === 'https' ? https : name.startsWith('./vendor/') ? require('../cep/'+name) : require(name); }
};
vm.runInNewContext(source, context);
const api = context.module.exports;
(async () => {
  response = { data: [{ id: 'gpt-sol' }] };
  assert.equal((await api.test()).listed, true);
  assert.equal(recorded.url, 'https://example.test/v1/models');
  response = { data: [] }; assert.equal((await api.test()).listed, false);
  response = { data: [{ b64_json: png.toString('base64') }] };
  await api.generate('/original.png', ['/reference.jpg'], 'Exact target');
  assert.equal(recorded.url, 'https://example.test/v1/images/edits');
  assert.equal(recorded.options.headers.Authorization, 'Bearer test-secret');
  const payload = recorded.body.toString();
  assert(payload.includes('gpt-sol')); assert(payload.includes('Exact target'));
  assert.equal((payload.match(/name="image\[\]"/g) || []).length, 2);
  assert(!payload.includes('test-secret'));
  assert.equal(saved.length, 1); assert.equal(saved[0].options.flag, 'wx');
  response = { data: [{ b64_json: Buffer.from('not an image').toString('base64') }] };
  await assert.rejects(api.generate('/original.png', ['/reference.jpg'], 'x'), /PNG\/JPEG/);
  status = 401;
  await assert.rejects(api.test(), /HTTP 401/);
  assert.equal(saved.length, 1);
  console.log('PASS: config URL, model status, multipart references, output validation, HTTP failure');
})().catch(e => { console.error(e); process.exitCode = 1; });
