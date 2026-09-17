const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {create}=require('../cep/failure-log.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'failure-test-'));
try{
 const log=create({root:path.join(root,'events'),fallback:path.join(root,'fallback')});
 const e=Object.assign(Error('Bearer SECRET https://example.invalid/image?token=SECRET api_key=SECRET'),{code:'ETIMEDOUT'});
 const a=log.failure(e,{taskId:'task',stage:'download',attempt:1,maxAttempts:3});
 assert.deepStrictEqual(log.failure(e,{stage:'panel'}),a);
 assert.equal(path.basename(a.reportFile),'report.json');assert.equal(e.failureLog,a.reportFile);
 const report=JSON.parse(fs.readFileSync(a.reportFile,'utf8'));assert.equal(report.error.stage,'download');assert.equal(report.error.taskId,'task');assert(!JSON.stringify(report).includes('SECRET'));
 assert.equal(fs.statSync(a.reportFile).mode&0o777,0o600);
 const second=log.event('task_blocked',{stage:'material_binding',password:'SECRET'});assert(second.reportFile!==a.reportFile);assert(fs.existsSync(a.reportFile));
 assert(log.failure(null).reportFile);
 log.event('attempt_succeeded',{taskId:'task',stage:'download',attempt:2,maxAttempts:3});
 const raw=fs.readFileSync(a.file,'utf8');assert(!raw.includes('SECRET'));assert.equal(raw.trim().split('\n').length,4);
 const blocked=path.join(root,'file');fs.writeFileSync(blocked,'x');
 const fallback=create({root:blocked,fallback:path.join(root,'fallback')});assert(fallback.failure(Error('disk failure')).file.includes('fallback'));
 const reportBlocked=path.join(root,'reports-blocked');fs.mkdirSync(reportBlocked);fs.writeFileSync(path.join(reportBlocked,'reports'),'blocked');
 const partial=create({root:reportBlocked,fallback:path.join(root,'report-fallback')}).failure(Error('timeout 600 seconds'),{stage:'detect'});assert(partial.file.startsWith(reportBlocked));assert(partial.reportFile.includes('report-fallback'));assert(!partial.logWriteFailed);
 const none=create({root:blocked,fallback:blocked}).failure(Error('no disk'));assert(none.logWriteFailed);assert.equal(none.reportFile,null);
 console.log('PASS immediate private report.json, redaction, dedup, null error, independent report fallback, total failure, JSONL compatibility');
}finally{fs.rmSync(root,{recursive:true,force:true});}
