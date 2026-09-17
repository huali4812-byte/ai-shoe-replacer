"""Single-case manual point experiment, never an automatic sole detector."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import torch
from transformers import SamProcessor, SamModel
ROOT=Path(__file__).resolve().parents[1]
def main():
    task=json.loads((ROOT/'outputs/sole-scene-audit/failed-evidence.json').read_text())
    folder=ROOT/'outputs/c3-sole-fidelity/points';folder.mkdir(parents=True,exist_ok=True)
    native=Image.open(task['input']).convert('RGB');im=native.copy();im.thumbnail((1000,1000))
    # Manually observed points in this sample's 1000px preview, not proportions.
    positive=[[450,480],[550,560],[750,650],[350,550],[620,470]]
    negative=[[350,285],[470,300],[570,340],[190,370],[270,350],[350,335],[190,490],[470,780],[860,430]]
    points=positive+negative;labels=[1]*len(positive)+[0]*len(negative)
    torch.set_num_threads(4)
    proc=SamProcessor.from_pretrained('facebook/sam-vit-base',local_files_only=True)
    model=SamModel.from_pretrained('facebook/sam-vit-base',local_files_only=True).eval()
    inputs=proc(images=im,input_points=[[points]],input_labels=[[labels]],return_tensors='pt')
    with torch.inference_mode(): out=model(**inputs,multimask_output=True)
    masks=proc.image_processor.post_process_masks(out.pred_masks,inputs['original_sizes'],inputs['reshaped_input_sizes'])[0][0]
    old=np.asarray(Image.open(ROOT/'outputs/c3-sole-fidelity/localization/p0-0-mask.png').resize(im.size,Image.Resampling.NEAREST))>0
    rows=[]
    for i,tensor in enumerate(masks):
        m=tensor.numpy().astype(bool)
        Image.fromarray(m.astype('uint8')*255).resize(native.size,Image.Resampling.NEAREST).save(folder/f'candidate-{i}-mask.png')
        a=np.asarray(im).copy();a[m]=(a[m]*.5+np.array([255,30,30])*.5).astype('uint8')
        overlay=Image.fromarray(a);draw=ImageDraw.Draw(overlay)
        for (x,y),label in zip(points,labels):draw.ellipse((x-5,y-5,x+5,y+5),fill='lime' if label else 'blue')
        overlay.save(folder/f'candidate-{i}-overlay.jpg')
        ys,xs=np.where(m)
        rows.append({'index':i,'samScore':float(out.iou_scores[0,0,i]),'pixelsProbe':int(m.sum()),'removedFromBoxCandidate':int((old&~m).sum()),'addedToBoxCandidate':int((m&~old).sum()),'boxFraction':float((xs.max()-xs.min()+1)*(ys.max()-ys.min()+1)/m.size) if len(xs) else 0,'verified':False})
    report={'taskId':task['id'],'source':task['input'],'manualSamplePoints':True,'probeSize':list(im.size),'positive':positive,'negative':negative,'candidates':rows,'automaticLocalization':'not_implemented','semanticReview':'pending','generation':'not_run'}
    (folder/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(rows,indent=2))
if __name__=='__main__':main()
