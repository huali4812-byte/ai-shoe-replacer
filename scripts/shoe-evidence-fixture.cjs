// Protocol fixture only: this deliberately does not claim visual recognition.
const surfaces=['inner','outer','sole','top','front','back'];
function profile(files){return {references:files.map((_,index)=>({index,surfaces,confidence:.95,evidence:'synthetic reference',details:{upper:'smooth inner straps; raised outer straps',sole:'black segmented pads',logo:'Ginoble on target inner heel',pullTab:'blue'}}))};}
function scene(count=1){return {shoes:Array.from({length:count},(_,i)=>({id:'shoe-'+(i+1),box:[i/count,0,(i+.8)/count,.8],foot:'unknown',surfaces:['inner','sole'],confidence:.95,evidence:'synthetic visible surfaces'}))};}
function review(count=1,decision='pass'){return {shoes:scene(count).shoes.map(s=>({id:s.id,confidence:.95,checks:{geometry:'pass',upper:decision==='retry'?'fail':decision==='unknown'?'unknown':'pass',sole:'pass',logo:'pass',pullTab:'pass'},reasons:decision==='pass'?[]:['synthetic visible mismatch'],defects:[]}))};}
function analyze(files,prompt){if(prompt.startsWith('SHOE_REFERENCE_V2'))return profile(files);if(prompt.startsWith('SHOE_SCENE_V2'))return scene(Number((prompt.match(/目标数量 (\d+)/)||[])[1]||1));if(prompt.startsWith('SHOE_REVIEW_V2'))return review(Number((prompt.match(/"shoeId":/g)||[]).length||1));throw Error('unexpected analysis protocol');}
module.exports={profile,scene,review,analyze};
