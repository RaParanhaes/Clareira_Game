#!/usr/bin/env python3
"""Inspect the real MP4, decoded loop boundary, and actor event frames."""
from pathlib import Path
import json
import subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
VIDEO=ROOT/'game/art/clareira-login-loop-v5.mp4'
OUT=ROOT/'logs/login-v5'
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_frames','-show_entries','format=duration,size','-of','json',str(VIDEO)]))
stream=probe['streams'][0]
assert stream['r_frame_rate']=='60/1',probe
assert int(stream['nb_frames'])==1800,probe
assert float(probe['format']['duration'])==30,probe
assert int(probe['format']['size'])<12*1024*1024,probe
frames={}
for time in [0,1/60,5.5,11.5,20.5,29+58/60,29+59/60]:
    file=OUT/f'encoded-{time:.4f}.png'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',f'{time:.7f}','-i',str(VIDEO),'-frames:v','1',str(file)],check=True)
    frames[time]=Image.open(file).convert('RGB')
def error(a,b):
    return float(np.abs(np.asarray(a).astype(float)-np.asarray(b).astype(float)).mean())
boundary=error(frames[0],frames[29+59/60])
adjacent=[error(frames[0],frames[1/60]),error(frames[29+58/60],frames[29+59/60])]
assert boundary<1.5,{'boundary':boundary,'adjacent':adjacent}
assert (OUT/'frame-0.000.png').read_bytes()==(OUT/'frame-30.000.png').read_bytes()
frames[0].save(ROOT/'game/art/clareira-login-poster-v5.webp',quality=91,method=6)
contact=Image.new('RGB',(1280,760),'#10191c');draw=ImageDraw.Draw(contact)
for index,time in enumerate([0,5.5,11.5,20.5]):
    x=(index%2)*640;y=(index//2)*380
    contact.paste(frames[time].resize((640,360)),(x,y+20))
    draw.text((x+8,y+4),f'{time:.1f}s',fill='#f0d79b')
contact.save(OUT/'review.jpg',quality=93)
audit={'media':probe,'sourceBoundaryIdentical':True,'decodedSeamMeanAbsoluteError':boundary,'adjacentFrameErrors':adjacent,'events':{'dragon':5.5,'rabbit':11.5,'deer':20.5}}
(OUT/'media-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit))
