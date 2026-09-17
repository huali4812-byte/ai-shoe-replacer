'use strict';
// Evidence contract only: no image classifier, network, generation or PS writes.
const crypto=require('crypto');
const SURFACES=['inner','outer','sole','upper','front','back'];
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
// A producer must observe scene alone or reference alone, never a comparison.
// inputs is the complete list of image hashes seen by that producer.
// Provenance is asserted by the producer, not authenticated by this validator.
function validBox(b){return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]<=1&&b[3]<=1&&b[2]>b[0]&&b[3]>b[1];}
function validate(o,asset,role){
 if(!o)return 'missing_observation';
 if(!asset||!asset.sha256||o.sha256!==asset.sha256)return 'stale_or_missing_image';
 if(typeof asset.instanceId!=='string'||!asset.instanceId||o.instanceId!==asset.instanceId||!validBox(asset.box)||!validBox(o.box)||o.box.some((v,i)=>v!==asset.box[i]))return 'missing_or_mismatched_instance';
 if(o.role!==role||o.scope!=='image_only'||!Array.isArray(o.inputs)||o.inputs.length!==1||o.inputs[0]!==asset.sha256)return 'non_independent_observation';
 if(!o.producer||!['offline_visual_review','visual_model'].includes(o.method))return 'unsupported_evidence';
 if(o.status!=='observed'||!Array.isArray(o.surfaces)||!o.surfaces.length)return 'unknown_surface';
 if(new Set(o.surfaces).size!==o.surfaces.length||o.surfaces.some(s=>!SURFACES.includes(s)))return 'invalid_surfaces';
 if(typeof o.rationale!=='string'||!o.rationale.trim())return 'missing_visual_rationale';
 return null;
}
function match({scene,target,references=[],sceneObservation,referenceObservations=[]}){
 const out={schemaVersion:2,sceneInstance:scene?{sha256:scene.sha256,instanceId:scene.instanceId,box:scene.box}:null,sideCorrespondenceReady:false,status:'unknown',allowSideDependentRepair:false,continueExistingFlow:true,calibrated:false,retainedReferences:references.map(r=>r.file),matches:[],reasons:[]};
 const sceneError=validate(sceneObservation,scene,'scene');
 if(sceneError){out.reasons.push(sceneError);return out;}
 if(!target||!target.sku||!target.color){out.reasons.push('missing_target_identity');return out;}
 for(const surface of sceneObservation.surfaces.filter(s=>s==='inner'||s==='outer')){
  const candidates=[];
  for(const ref of references){
   if(ref.sku!==target.sku||ref.color!==target.color)continue;
   const observations=referenceObservations.filter(o=>o.sha256===ref.sha256&&o.instanceId===ref.instanceId);
   if(observations.length!==1){out.reasons.push('missing_or_conflicting_reference_observation');continue;}
   const observation=observations[0];
   if(validate(observation,ref,'reference')){out.reasons.push('invalid_reference_observation');continue;}
   if(ref.sha256===scene.sha256){out.reasons.push('scene_reused_as_target');continue;}
   if(observation.surfaces.includes(surface))candidates.push({file:ref.file,sha256:ref.sha256,instanceId:ref.instanceId,box:ref.box,observation});
  }
  out.matches.push({surface,status:candidates.length?'supported':'unknown',candidates});
 }
 if(!out.matches.length)out.reasons.push('no_known_side_surface');
 out.status=out.matches.length&&out.matches.every(m=>m.status==='supported')?'supported':'unknown';
 // Correspondence alone never authorizes a patch: C4 must provide localization,
 // target-part evidence, occlusion and writable-mask checks independently.
 out.sideCorrespondenceReady=out.status==='supported';
 out.reasons.push('localization_and_part_evidence_required');
 return out;
}
// C4 handoff is evidence, never a patch authorization or executable region.
function handoff(result){return {schemaVersion:1,sceneInstance:result.sceneInstance,correspondenceStatus:result.status,faces:result.matches,sideDependentRepairAllowed:false,continueExistingFlow:true,required:['independent_target_part_localization','occlusion_check','writable_mask_intersection','outside_pixel_preservation'],reason:result.status==='supported'?'part_evidence_required':'correspondence_unknown'};}
module.exports={hash,validate,match,handoff,validBox,SURFACES};
