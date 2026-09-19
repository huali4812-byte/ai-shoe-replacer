'use strict';
const assert=require('assert');
const {interleaveImageLabels}=require('../cep/api.cjs');
const images=[1,2,3,4].map(n=>({type:'image_url',image_url:{url:'image-'+n}}));
const labels=[1,2,3,4].map(n=>'【图'+n+'】');
const content=interleaveImageLabels('提示词',images,labels);
assert.deepEqual(content.map(x=>x.type),['text','text','image_url','text','image_url','text','image_url','text','image_url']);
assert.equal(content[0].text,'提示词');
for(let i=0;i<4;i++){
 assert.equal(content[1+i*2].text,labels[i]);
 assert.equal(content[2+i*2],images[i]);
}
assert.deepEqual(interleaveImageLabels('提示词',images),[{type:'text',text:'提示词'},...images]);
assert.throws(()=>interleaveImageLabels('提示词',images,['只有一个']),/图片标签数量/);
console.log('PASS explicit text label immediately precedes each of four uploaded images');
