"""C2 real-image diagnostic only; cached local models, no downloads/API."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
import sys,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'cep'))
from vision import Vision

def main():
    task=json.loads((ROOT/'outputs/tab-color-audit/task.json').read_text())
    folder=ROOT/'outputs/c2-pull-tab/localization';folder.mkdir(parents=True,exist_ok=True)
    report={'taskId':task['id'],'status':'diagnostic_only','generationAllowed':False,'images':[]}
    def save(): (folder/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    save()
    try:
        v=Vision()
        for name,file in [('input',task['input']),('raw',task['preview']),('target',task['material']['cutout'])]:
            original=Image.open(file).convert('RGBA')
            rgb=Image.new('RGBA',original.size,'white');rgb.alpha_composite(original);im=rgb.convert('RGB');im.thumbnail((1100,1100))
            entry={'name':name,'file':file,'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest(),'nativeSize':list(original.size),'probeSize':list(im.size),'candidates':[]};report['images'].append(entry)
            inputs=v.detector_processor(images=im,text='shoe pull tab. heel loop. sock. trousers. hand.',return_tensors='pt')
            with v.torch.inference_mode(): output=v.detector(**inputs)
            r=v.detector_processor.post_process_grounded_object_detection(output,inputs.input_ids,threshold=.20,text_threshold=.20,target_sizes=[(im.height,im.width)])[0]
            labels=r.get('text_labels',r.get('labels'));boxes=r['boxes'].tolist();masks=v.segment(im,boxes) if boxes else []
            for i,(box,score,label,(mask,sam)) in enumerate(zip(boxes,r['scores'].tolist(),labels,masks)):
                stem=name+'-'+str(i)
                Image.fromarray(mask.astype('uint8')*255).save(folder/(stem+'-mask.png'))
                arr=np.array(im);arr[mask]=(arr[mask]*.45+np.array([255,40,40])*.55).astype('uint8');overlay=Image.fromarray(arr);ImageDraw.Draw(overlay).rectangle(box,outline='blue',width=2);overlay.save(folder/(stem+'-overlay.jpg'))
                entry['candidates'].append({'id':stem,'label':str(label),'box':box,'dinoScore':score,'samScore':sam,'maskPixels':int(mask.sum()),'mask':str(folder/(stem+'-mask.png')),'verified':False})
            save();print(name,len(entry['candidates']),flush=True)
        report['status']='needs_visual_localization_review';save()
    except Exception as e:
        report.update(status='blocked',error=str(e));save();raise
if __name__=='__main__':main()
