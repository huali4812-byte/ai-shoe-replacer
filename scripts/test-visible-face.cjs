'use strict';
const assert=require('assert'),{match,hash,handoff}=require('../cep/visible-face.cjs');
const scene={sha256:hash('scene'),instanceId:'shoe-1',box:[0,0,.5,1]},ref={file:'t_sideright.png',sha256:hash('ref'),sku:'S',color:'C',instanceId:'reference-shoe-1',box:[0,0,1,1]};
const obs=(asset,role,surfaces)=>({sha256:asset.sha256,instanceId:asset.instanceId,box:asset.box,role,surfaces,inputs:[asset.sha256],scope:'image_only',producer:'synthetic-test',method:'offline_visual_review',status:'observed',rationale:'synthetic fixture, not visual validation'});
const input={scene,target:{sku:'S',color:'C'},references:[ref],sceneObservation:obs(scene,'scene',['inner','sole']),referenceObservations:[obs(ref,'reference',['inner','upper'])]};
let r=match(input);assert.equal(r.status,'supported');assert.equal(r.matches[0].surface,'inner');assert.equal(r.allowSideDependentRepair,false);assert(r.continueExistingFlow);
for(const change of [
 {sceneObservation:undefined},
 {sceneObservation:{...input.sceneObservation,instanceId:'shoe-2'}},
 {sceneObservation:{...input.sceneObservation,box:[0,0,1,1]}},
 {sceneObservation:{...input.sceneObservation,box:[0,0,NaN,1]}},
 {referenceObservations:[{...input.referenceObservations[0],instanceId:'other-shoe'}]},
 {sceneObservation:{...input.sceneObservation,method:'filename'}},
 {sceneObservation:{...input.sceneObservation,surfaces:['side-right']}},
 {sceneObservation:{...input.sceneObservation,inputs:[scene.sha256,ref.sha256]}},
 {sceneObservation:{...input.sceneObservation,sha256:hash('changed')}},
 {referenceObservations:[obs(ref,'reference',['outer'])]},
 {referenceObservations:[...input.referenceObservations,...input.referenceObservations]},
 {target:{sku:'other',color:'C'}},
 {sceneObservation:obs(scene,'scene',['inner','outer','sole'])}
]){r=match({...input,...change});assert.equal(r.status,'unknown');assert(!r.allowSideDependentRepair);assert(r.continueExistingFlow);assert.deepEqual(r.retainedReferences,[ref.file]);}
assert.equal(match({...input,sceneObservation:obs(scene,'scene',['sole'])}).status,'unknown');
const multiRef={...ref,instanceId:'reference-shoe-2',box:[.5,0,1,1]};
r=match({...input,references:[ref,multiRef],sceneObservation:obs(scene,'scene',['inner','outer','sole']),referenceObservations:[obs(ref,'reference',['inner']),obs(multiRef,'reference',['outer'])]});assert.equal(r.status,'supported');assert.equal(r.matches.length,2);assert.equal(r.matches[1].candidates[0].instanceId,multiRef.instanceId);assert(!handoff(r).sideDependentRepairAllowed);assert.deepEqual(handoff(r).sceneInstance.box,scene.box);
console.log('PASS C5: independent evidence, multiple surfaces, stale/filename/circular/conflicting evidence, unknown fallback, no patch authorization');
