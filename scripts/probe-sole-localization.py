"""Offline-only DINO/SAM feasibility probe; outputs never authorize generation."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
import sys, json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'cep'))
from vision import Vision

def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--task',type=Path,default=ROOT/'outputs/sole-scene-audit/failed-evidence.json')
    parser.add_argument('--output',type=Path,default=ROOT/'outputs/c3-sole-fidelity/localization')
    args=parser.parse_args()
    task=json.loads(args.task.read_text())
    folder=args.output
    folder.mkdir(parents=True,exist_ok=True)
    original=Image.open(task['input']).convert('RGB')
    im=original.copy();im.thumbnail((1000,1000))
    shoe=np.asarray(Image.open(task['visionMask']).convert('L').resize(im.size,Image.Resampling.NEAREST))>=254
    v=Vision()
    report={'taskId':task['id'],'source':task['input'],'sourceSha256':hashlib.sha256(Path(task['input']).read_bytes()).hexdigest(),'nativeSize':list(original.size),'probeSize':list(im.size),'modelCapability':'unverified','status':'diagnostic_only','candidates':[]}
    prompts=['shoe outsole. shoe upper. toes. foot.', 'rubber sole. shoe tread. toes. trousers.']
    for pi,prompt in enumerate(prompts):
        inputs=v.detector_processor(images=im,text=prompt,return_tensors='pt')
        with v.torch.inference_mode(): output=v.detector(**inputs)
        r=v.detector_processor.post_process_grounded_object_detection(output,inputs.input_ids,threshold=.20,text_threshold=.20,target_sizes=[(im.height,im.width)])[0]
        labels=r.get('text_labels',r.get('labels'))
        boxes=r['boxes'].tolist()
        masks=v.segment(im,boxes) if boxes else []
        for i,(box,score,label,(mask,sam)) in enumerate(zip(boxes,r['scores'].tolist(),labels,masks)):
            name=f'p{pi}-{i}'
            native=Image.fromarray(mask.astype('uint8')*255).resize(original.size,Image.Resampling.NEAREST)
            native.save(folder/(name+'-mask.png'))
            arr=np.array(im).copy();arr[mask]=(arr[mask]*.45+np.array([255,40,40])*.55).astype('uint8')
            Image.fromarray(arr).save(folder/(name+'-overlay.jpg'))
            report['candidates'].append({'id':name,'prompt':prompt,'label':str(label),'boxProbe':box,'dinoScore':score,'samScore':sam,'maskPixelsProbe':int(mask.sum()),'outsideShoePixelsProbe':int((mask & ~shoe).sum()),'mask':str(folder/(name+'-mask.png')),'verified':False})
    (folder/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
