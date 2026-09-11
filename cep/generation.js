(function () {
  var panel = document.createElement('section');
  panel.innerHTML = '<h2>整图生成</h2><button id="apiTest">测试 API</button><p id="apiState">未测试</p><label>目标鞋参考图<input id="references" type="file" multiple accept=".png,.jpg,.jpeg"></label><label>目标款色与替换要求<textarea id="instructions" rows="4" style="width:100%;box-sizing:border-box"></textarea></label><button id="generateImage">生成整图</button><p id="generationState" role="status"></p>';
  document.querySelector('main').insertBefore(panel, document.querySelector('footer'));
  var get = function (id) { return document.getElementById(id); };
  var api, fs, path, os;
  try {
    var req = typeof require === 'function' ? require : window.cep_node.require;
    path = req('path'); fs = req('fs'); os = req('os');
    var folder = path.dirname(decodeURIComponent(window.location.pathname));
    api = req(path.join(folder, 'api.cjs'));
  } catch (e) {
    get('apiState').textContent = '无法加载本机 API 模块，请重新安装新版插件并重启 Photoshop';
    get('apiTest').disabled = get('generateImage').disabled = true;
    return;
  }
  function host(script) {
    return new Promise(function (resolve, reject) {
      new CSInterface().evalScript(script, function (result) {
        if (result !== 'OK') reject(new Error(result || 'Photoshop 未返回结果'));
        else resolve(result);
      });
    });
  }
  get('apiTest').onclick = async function () {
    this.disabled = true; get('apiState').textContent = '正在连接';
    try {
      var r = await api.test();
      get('apiState').textContent = r.model + (r.listed ? '：接口连通，模型已列出；图像生成尚未验证' : '：接口连通，但模型未列出；图像生成尚未验证');
    } catch (e) { get('apiState').textContent = e.message; }
    finally { this.disabled = false; }
  };
  get('generateImage').onclick = async function () {
    var refs = Array.from(get('references').files).map(function (f) { return f.path; });
    var instruction = get('instructions').value.trim();
    if (!refs.length || refs.some(function (p) { return !p; }) || !instruction) {
      get('generationState').textContent = '请选择目标鞋参考图并填写明确的目标款色与替换要求'; return;
    }
    var temp, started = Date.now();
    this.disabled = true;
    var controls = ['scan', 'run', 'excel', 'apiTest', 'references', 'instructions'];
    var previous = controls.map(function (id) { var el = get(id), disabled = el.disabled; el.disabled = true; return disabled; });
    var timer = setInterval(function () { get('generationState').textContent = '处理中，已等待 ' + Math.floor((Date.now() - started) / 1000) + ' 秒'; }, 1000);
    try {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-shoe-'));
      var original = path.join(temp, 'original.png');
      await host('AI_Shoe_CEP.exportFullImage(' + JSON.stringify(original) + ')');
      var prompt = '第一张图是完整原图，其余是目标鞋参考图。按以下要求替换鞋子：' + instruction + '。保持完整画布比例和构图，不裁剪、不使用 Mask、不回贴。除鞋子及其直接阴影、倒影、反光外，保留人物、脸、腿、袜子、裤脚、文字、背景和其他物体。严格参照目标鞋的 Logo、鞋型、配色、鞋底、纹理、车线和结构。';
      var output = await api.generate(original, refs, prompt);
      clearInterval(timer);
      get('generationState').textContent = '已保存至 ' + output + '，待人工验收';
      try { await host('AI_Shoe_CEP.openResult(' + JSON.stringify(output) + ')'); }
      catch (e) { get('generationState').textContent += '；Photoshop 打开失败：' + e.message; }
    } catch (e) { get('generationState').textContent = '生成失败：' + e.message; }
    finally {
      clearInterval(timer); this.disabled = false;
      controls.forEach(function (id, i) { get(id).disabled = previous[i]; });
      if (temp) { try { var file = path.join(temp, 'original.png'); if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(temp); } catch (e) {} }
    }
  };
}());
