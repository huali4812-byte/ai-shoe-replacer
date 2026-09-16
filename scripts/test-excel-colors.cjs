const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require('path').join(__dirname,'../cep/rules.cjs'),'utf8');
const {createRequire}=require('module');const context={require:createRequire(require('path').join(__dirname,'../cep/rules.cjs')),module:{exports:{}}};
vm.createContext(context);vm.runInContext(source+'\nmodule.exports.test={xml,colorResolver};',context);
const {xml,colorResolver}=context.module.exports.test;
const empty={files:{}};
let resolve=colorResolver(empty,xml('<styleSheet/>'));
assert.equal(resolve(xml('<color indexed="10"/>').documentElement),'主推');
assert.equal(resolve(xml('<color indexed="11"/>').documentElement),'次推');
assert.equal(resolve(xml('<color indexed="25"/>').documentElement),'');
assert.equal(resolve(xml('<color rgb="FF00B050"/>').documentElement),'次推');
resolve=colorResolver(empty,xml('<styleSheet><colors><indexedColors><rgbColor rgb="FFFF0000"/><rgbColor rgb="FF00FF00"/></indexedColors></colors></styleSheet>'));
assert.equal(resolve(xml('<color indexed="0"/>').documentElement),'主推');
assert.equal(resolve(xml('<color indexed="1"/>').documentElement),'次推');
const wb={files:{'xl/theme/theme1.xml':{content:'<a:theme xmlns:a="urn:test"><a:clrScheme><a:dk1><a:srgbClr val="FF0000"/></a:dk1></a:clrScheme></a:theme>'}}};
resolve=colorResolver(wb,xml('<styleSheet/>'));
assert.equal(resolve(xml('<color theme="1"/>').documentElement),'主推');
assert.equal(resolve(xml('<color theme="1" tint="0.5"/>').documentElement),'');
if(process.argv[2]){
 const r=context.module.exports.parseWorkbook(fs.readFileSync(process.argv[2]));
 assert.equal(r.products.length,3);assert.equal(r.products[0].role,'主推');assert.equal(r.products[1].role,'次推');assert.equal(r.products[2].role,'');
}
console.log('PASS: RGB, standard/custom indexed palette, theme, unknown shade, real workbook roles');
