"""Conservative geometric pairing; not person recognition. No model or network."""
import math


def assign(accepted, main_pair):
    if main_pair not in (0, 1):
        raise ValueError('随机主次推状态缺失，请重新准备任务')
    if len(accepted) == 2:
        # Two shoes detected: assign one as main, one as secondary based on random flag
        shoes = sorted(accepted, key=lambda x: (x['bounds'][0], x['bounds'][1]))  # sort by position
        roles = ['主推', '次推'] if main_pair == 0 else ['次推', '主推']
        for i, shoe in enumerate(shoes):
            shoe['role'] = roles[i]
            shoe['roleGroupBox'] = shoe['bounds'][:]
        return {'method':'two_shoes_random_roles','personRecognition':False,'mainPair':main_pair,'shoeCount':2}
    if len(accepted) != 4:
        raise ValueError('无文字紫色图需明确检测到两双共4只鞋，当前%d只；不能猜测配对' % len(accepted))
    shoes = sorted(accepted, key=lambda x: tuple(x['bounds']))
    def center(item):
        x0,y0,x1,y1 = item['bounds']
        if not all(math.isfinite(v) for v in item['bounds']) or x1<=x0 or y1<=y0:
            raise ValueError('鞋框无效，不能随机配对')
        return ((x0+x1)/2, (y0+y1)/2, math.sqrt((x1-x0)*(y1-y0)))
    points = [center(s) for s in shoes]
    def cost(i,j):
        a,b=points[i],points[j]
        ratio=max(a[2],b[2])/min(a[2],b[2])
        distance=math.hypot(a[0]-b[0],a[1]-b[1])/((a[2]+b[2])/2)
        return distance+abs(math.log(ratio)), ratio<=2 and distance<=3
    choices=[]
    for pairs in [((0,1),(2,3)),((0,2),(1,3)),((0,3),(1,2))]:
        scores=[cost(*pair) for pair in pairs]
        choices.append((sum(s[0] for s in scores),pairs,all(s[1] for s in scores)))
    choices.sort(key=lambda x:x[0])
    best=choices[0]
    if not best[2] or choices[1][0]-best[0]<max(.5,best[0]*.3):
        raise ValueError('无文字紫色图两双鞋配对不明确，请添加主推/次推文字')
    for pair_index,pair in enumerate(best[1]):
        bounds=[min(shoes[i]['bounds'][0] for i in pair),min(shoes[i]['bounds'][1] for i in pair),max(shoes[i]['bounds'][2] for i in pair),max(shoes[i]['bounds'][3] for i in pair)]
        for i in pair:
            shoes[i]['role']='主推' if pair_index==main_pair else '次推'
            shoes[i]['roleGroupBox']=bounds[:]
    return {'method':'geometric_pairs_random_roles','personRecognition':False,'mainPair':main_pair,'score':best[0],'margin':choices[1][0]-best[0]}
