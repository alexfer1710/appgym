"""Remove the flat light-blue background baked into an exercise illustration.
Background = colour of the border, flood-filled from the edges; the floor shadow
(bluish, darker than the background, touching it) becomes a soft black shadow."""
import sys,collections
from PIL import Image
import numpy as np
from scipy import ndimage
src,dst=sys.argv[1],sys.argv[2]
im=np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h,w,_=im.shape
border=np.concatenate([im[0],im[-1],im[:,0],im[:,-1]])
bg=np.median(border,axis=0)
dist=np.abs(im-bg).sum(axis=2)
near=dist<=40
lab,_=ndimage.label(near)
edge_labels=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
sizes=ndimage.sum(near,lab,index=np.arange(lab.max()+1))
big=set(np.nonzero(sizes>h*w*0.0008)[0])-{0}   # enclosed background patches (inside frames)
mask=np.isin(lab,list(edge_labels|big))
lum=im.mean(axis=2);bglum=bg.mean()
sat=im.max(axis=2)-im.min(axis=2)
cand=(~mask)&(lum<bglum-4)&(lum>bglum-110)&(sat<80)&(im[:,:,2]>=im[:,:,0]+10)
lab2,n=ndimage.label(cand)
touch=ndimage.binary_dilation(mask,iterations=2)
keep=set(np.unique(lab2[touch&cand]))-{0}
shadow=np.isin(lab2,list(keep))
alpha=np.full((h,w),255.0)
alpha[mask]=0
alpha[shadow]=((bglum-lum[shadow])*2.4).clip(25,150)
rgb=im.copy();rgb[shadow]=[30,30,40]
# soften the cut edge: object pixels right next to the background fade slightly
ring=ndimage.binary_dilation(mask,iterations=1)&~mask&~shadow
alpha[ring]=np.minimum(alpha[ring],(dist[ring]/120*255).clip(90,255))
out=np.dstack([rgb.clip(0,255),alpha]).astype(np.uint8)
Image.fromarray(out,'RGBA').save(dst,optimize=True)
print(dst.split('/')[-1],'bg',bg.astype(int).tolist(),'bg%',round(mask.mean()*100),'shadow%',round(shadow.mean()*100,1))
