'use strict';
// Maps actual image positions, not filename-derived anatomical labels.
function build(files,{maskFirst=false}={}){
 const images=[{image:1,role:'scene'},...(maskFirst?[{image:2,role:'mask'}]:[]),...files.map((file,i)=>({image:i+(maskFirst?3:2),role:'target-reference',file}))];
 const text='\n【实际输入图号与侧墙约束】\n图1是待换鞋原场景，仅提供姿态、位置、透视、遮挡和背景，不是目标款式。'+(maskFirst?'图2是编辑蒙版，不是鞋款参考。':'')+'\n'+images.filter(x=>x.role==='target-reference').map(x=>'图'+x.image+'是目标鞋款参考，请独立辨认其中各只鞋的可见面。').join('\n')+'\n参考图片排列顺序不代表内外侧优先级；side、sideright等文件名不是解剖内外侧证据。先观察原场景每只鞋的可见面，再独立观察目标参考，不按画面左右、魔术贴方向或Logo有无判定内外侧。允许侧面与鞋面、鞋底同时可见，各参考仅提供它实际显示的局部结构，不把不同面的结构拼接到同一侧墙。\n目标对应面是平整条带时保持平整，不强加另一面的凸起、连接块或深色曲线装饰；目标对应面存在侧墙Logo时应保留，不能以“内侧”为理由删除。凸起和Logo均按目标对应面可见证据处理，不规定所有鞋款必须有或没有。侧别不能确认时不要强行命名或镜像翻转，不跨侧复制专属结构；继续按实际可见参考生成，不输出分析文字或JSON。';
 return {schemaVersion:1,mode:'prompt_guidance_not_verified_matching',images,text};
}
module.exports={build};
