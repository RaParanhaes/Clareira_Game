#!/usr/bin/env python3
"""Build labeled contact sheet and a sample cave-room composition for review."""
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'game/art/dungeon'
EVID=Path('/home/rafael/clareira-evidencias/2026-11-17-world-masmorra/tileset')
EVID.mkdir(parents=True,exist_ok=True)
files=sorted(ART.glob('*.png'))
subprocess.run(['magick','montage',*[str(f) for f in files],'-background','#101722','-fill','#e7dcc5','-font','DejaVu-Sans','-pointsize','13','-label','%t','-tile','5x','-geometry','112x96+8+8',str(EVID/'contato.png')],check=True)

canvas=EVID/'montagem.png'
subprocess.run(['magick','-size','720x480','xc:#101722',str(canvas)],check=True)
def put(filename,cx,cy,pivot=None):
    f=ART/f'{filename}.png'
    if pivot:
        x=cx-pivot[0];y=cy-pivot[1]
        resize=[]
    else:
        # scene-art.mjs draws terrain cells at 66x38 to hide subpixel seams.
        w,h=(66,38) if filename.startswith('piso-') else map(int,subprocess.check_output(['magick','identify','-format','%w %h',str(f)]).decode().split())
        x=cx-w//2;y=cy-h//2
        resize=['-filter','point','-resize',f'{w}x{h}!'] if filename.startswith('piso-') else []
    tmp=canvas.with_suffix('.tmp.png')
    subprocess.run(['magick',str(canvas),'(',str(f),*resize,')','-geometry',f'+{x}+{y}','-compose','over','-composite',str(tmp)],check=True)
    tmp.replace(canvas)

# Ground plane in the exact 64x36 logical projection used by scene-art.mjs.
for j in range(5):
    for i in range(6):
        cx=360+(i-j)*32; cy=145+(i+j)*18
        patches={(1,1):'piso-terra',(2,2):'piso-terra',(4,3):'piso-terra',
                 (0,2):'piso-cascalho',(4,1):'piso-cascalho',(1,4):'piso-cascalho',
                 (3,2):'piso-poca'}
        put(patches.get((i,j),'piso-pedra'),cx,cy)
# Uneven back wall and a return corner; each base lands on a projected floor contact.
for name,cx,cy in [('parede-baixa-b',267,175),('parede-alta-a',347,157),('canto-alto',418,175),('parede-baixa-c',472,206),('parede-alta-b',492,237)]:
    put(name,cx,cy,(48,61))
# Small set dressing, wall torch, and a descent opening leave the central floor readable.
put('estalagmite-1',304,255)
put('estalagmite-2',426,287)
put('estalagmite-3',510,265)
put('tocha-frame-2',348,128,(16,28))
put('escada-descendo',393,292,(40,58))
# Enlarge the room itself with nearest-neighbor sampling for a useful visual review.
tmp=EVID/'montagem-crop.png'
subprocess.run(['magick',str(canvas),'-crop','380x300+170+80','+repage','-filter','point','-resize','720x568!',str(tmp)],check=True)
tmp.replace(canvas)
print(f'Pranchas: {EVID}/contato.png e {canvas}')
