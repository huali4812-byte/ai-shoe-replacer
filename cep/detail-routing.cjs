'use strict';
const TYPES=['logo','sole','sidewall','pullTab','toe','upper'];
// Coordinates are normalized in the original local input, never the reference.
function select(check,task,entries){
 if(task.shoeCount!==1||task.dualRole||!task.visionMask||task.protection?.sceneType==='shoe_structure')return null;
 if(check.decision!=='retry'||check.confidence<.9||check.geometryCorrect!==true||check.otherPartsCorrect!==true||!Array.isArray(check.defects)||check.defects.length!==1)return null;
 const d=check.defects[0];
 if(!d||!TYPES.includes(d.part)||d.visible!==true||d.occluded!==false||!Number.isFinite(d.confidence)||d.confidence<.9||d.confidence>1)return null;
 const b=d.box;
 if(!Array.isArray(b)||b.length!==4||b.some(x=>!Number.isFinite(x)||x<0||x>1)||b[2]<=b[0]||b[3]<=b[1]||(b[2]-b[0])*(b[3]-b[1])>.35)return null;
 // Dedicated part evidence only: a generic side/heel view does not prove
 // the logo or pull tab is visible. Never expand to all references silently.
 const references=entries.filter(e=>e.detail===d.part);
 if(!references.length)return null;
 return {part:d.part,box:b,references,evidence:d.evidence||'',confidence:d.confidence,localOnly:true};
}
module.exports={select};
