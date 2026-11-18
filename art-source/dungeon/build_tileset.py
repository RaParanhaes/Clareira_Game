#!/usr/bin/env python3
"""Export the hand-authored, grid-snapped SVG cave atlas to nearest-neighbor PNGs."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent
OUT = ROOT / "game/art/dungeon"
INK="#17110c"; SL="#4b4f57"; SL_L="#646a73"; SL_D="#34383f"
O="#9b7342"; O_L="#c49a5c"; BR="#5e4330"; M="#5f7a46"; M_L="#8aa463"; M_D="#33462b"
E="#4d3c2c"; E_L="#65503b"; E_D="#3a2d21"; ST="#4a4d52"; ST_L="#5c6068"; ST_D="#363940"
G="#48413a"; G_L="#746a5d"; G_D="#2f2a25"; WATER="#19222b"; GLINT="#4f6c74"

def svg(w,h,body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">{body}</svg>'
def p(points, color): return f'<polygon points="{points}" fill="{color}"/>'
def r(x,y,w,h,color): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>'
def save(name,w,h,body,pivot,height,kind):
    s=svg(w,h,body); (SRC/f'{name}.svg').write_text(s)
    subprocess.run(['magick','-background','none',str(SRC/f'{name}.svg'),'-alpha','on',str(OUT/f'{name}.png')],check=True)
    return dict(id=name,arquivo=f'{name}.png',tamanho={'largura':w,'altura':h},pivo_contato={'x':pivot[0],'y':pivot[1]},altura_parede=height,tipo=kind)

assets=[]
# 64 x 36 tile plane; stepped perimeter keeps a recognizable iso footprint while breaking the ruler-straight edge.
outline='32,0 38,3 43,6 48,9 53,12 59,15 64,18 59,21 53,24 48,27 43,30 38,33 32,36 26,33 21,30 16,27 11,24 5,21 0,18 5,15 11,12 16,9 21,6 26,3'
def floor(name,base,mid,light,spots,water=False):
    b=p(outline,mid)
    b+=p('32,3 48,11 42,14 32,12 20,14 15,11',light if not water else WATER)
    for x,y,c,ww,hh in spots:b+=r(x,y,ww,hh,c)
    if water:b+=p('18,16 25,14 31,15 24,17',GLINT)+r(39,20,7,1,'#39565c')+r(15,21,3,1,'#718878')
    else:b+=p('8,15 13,12 17,13 12,17',base)+p('46,24 54,21 59,18 55,23 48,26',base)
    # tiny broken edge chips and deliberate material flecks
    b+=r(10,13,2,2,light)+r(51,20,2,2,base)+r(28,25,3,1,light)+r(38,10,2,1,base)
    # Broken chips and gravel flecks soften the tile edge without breaking its seamless footprint.
    b+=r(12,10,2,1,light)+r(17,7,2,1,base)+r(53,14,2,1,light)+r(46,28,2,1,base)+r(18,27,2,1,light)+r(8,20,2,1,base)
    return save(name,64,36,b,(32,18),0,'piso')
assets += [floor('piso-terra',E,E_L,O,[(13,16,O,3,1),(30,8,E_D,2,2),(40,24,O,2,1),(22,25,E_D,3,1)]),
           floor('piso-pedra',ST,SL,SL_L,[(17,14,SL_D,7,2),(36,18,SL_D,8,2),(25,23,SL_L,3,1)]),
           floor('piso-cascalho',G,G_L,O,[(12,16,SL,3,2),(20,11,G_D,2,2),(34,19,O,2,1),(47,15,SL_L,3,2),(27,26,G_D,2,1)]),
           floor('piso-poca',ST_D,ST,WATER,[(14,12,SL,2,2),(44,22,ST_L,2,2)],True)]

def wall(name,hh,seed,corner=False):
    # irregular silhouette of a fractured block ridge with faceted front, moss cap and exposed ochre seams.
    top=16 if hh==30 else 7; basey=61
    profiles=[
        f'7,{basey-10} 13,{top+12} 21,{top+4} 29,{top+8} 39,{top-1} 47,{top+7} 57,{top+3} 67,{top+11} 76,{top+5} 87,{basey-8} 81,{basey-4} 75,{basey+1} 69,{basey-3} 61,{basey+2} 54,{basey-4} 48,{basey-5} 42,{basey+2} 36,{basey-3} 30,{basey+1} 23,{basey-3} 16,{basey+2} 7,{basey}',
        f'6,{basey-8} 12,{top+8} 23,{top+1} 32,{top+10} 43,{top+5} 52,{top-2} 62,{top+8} 74,{top+1} 86,{top+13} 89,{basey-9} 84,{basey-3} 77,{basey+2} 70,{basey-2} 63,{basey+1} 56,{basey-4} 48,{basey} 41,{basey-3} 34,{basey+2} 27,{basey-3} 19,{basey+1} 12,{basey-2} 6,{basey-2}',
        f'8,{basey-11} 15,{top+11} 25,{top+6} 33,{top+1} 42,{top+9} 54,{top+2} 63,{top+5} 72,{top-1} 83,{top+9} 88,{basey-7} 83,{basey-3} 78,{basey+2} 71,{basey-2} 64,{basey+1} 57,{basey-4} 50,{basey} 44,{basey-3} 37,{basey+2} 30,{basey-3} 24,{basey} 17,{basey-4} 8,{basey-3}'
    ]
    if corner:
        pts=f'9,{basey-12} 16,{top+9} 27,{top+1} 38,{top+8} 48,{top+4} 57,{top+12} 67,{top+6} 77,{top+13} 88,{top+17} 83,{basey-8} 73,{basey-1} 64,{basey-8} 54,{basey-2} 45,{basey} 31,{basey-4} 19,{basey} 9,{basey-5}'
    else:
        pts=profiles[seed%3]
    b=p(pts,INK)+p(pts.replace('7,','8,',1),SL_D)
    # main stone faces
    b+=p(f'9,{basey-10} 17,{top+13} 29,{top+10} 38,{basey-5} 27,{basey-1}',SL)
    b+=p(f'31,{top+11} 42,{top+3} 54,{top+11} 53,{basey-6} 38,{basey-3}',ST_L)
    b+=p(f'55,{top+12} 68,{top+7} 81,{top+14} 77,{basey-7} 60,{basey-4}',SL)
    b+=p(f'17,{top+14} 31,{top+11} 38,{basey-5} 26,{basey-3} 11,{basey-8}',SL_D)
    b+=p(f'39,{top+12} 53,{top+10} 53,{basey-6} 39,{basey-4}',ST_D)
    b+=p(f'63,{top+13} 80,{top+15} 77,{basey-7} 61,{basey-5}',SL_D)
    # moss cap discontinuous clusters
    mosses=[(f'13,{top+12} 18,{top+7} 25,{top+5} 31,{top+9} 28,{top+13} 19,{top+13}',f'47,{top+8} 53,{top+4} 61,{top+7} 65,{top+12} 56,{top+13} 49,{top+11}'),
            (f'15,{top+9} 20,{top+4} 27,{top+5} 31,{top+11} 24,{top+13} 17,{top+12}',f'57,{top+10} 64,{top+6} 71,{top+8} 77,{top+14} 68,{top+15} 60,{top+13}'),
            (f'18,{top+12} 22,{top+7} 30,{top+4} 35,{top+10} 31,{top+14} 22,{top+14}',f'42,{top+9} 48,{top+3} 55,{top+7} 59,{top+12} 51,{top+14} 44,{top+12}')]
    ma,mb=mosses[seed%3]
    b+=p(ma,M)+p(mb,M_L if seed%2 else M)
    b+=r(18,top+5,3,2,M_L)+r(25,top+8,3,1,M_D)+r(46,top+2,3,2,M)+r(57,top+8,2,2,M_D)
    # mineral strata, chips and cracks
    b+=p(f'19,{top+19} 25,{top+17} 31,{top+19} 27,{top+21}',O)+r(46,top+20,5,2,O)+r(48,top+20,2,1,O_L)
    b+=p(f'12,{basey-17} 16,{basey-20} 19,{basey-18} 17,{basey-13}',SL_L)+r(69,basey-20,4,2,SL_L)
    b+=p(f'34,{top+18} 36,{top+19} 33,{top+24} 35,{top+26} 31,{top+28}',INK)
    b+=r(24,basey-7,3,2,ST_L)+r(59,basey-11,2,2,ST_L)
    if corner:
        b+=p(f'53,{top+8} 64,{top+12} 71,{top+21} 69,{basey-9} 58,{basey-7}',SL_D)
        b+=r(63,top+15,4,2,O)
    return save(name,96,72,b,(48,basey),hh,'parede-canto' if corner else 'parede')

# Six straight pieces in two heights, plus two hand-joined corners.
assets += [wall('parede-baixa-a',30,0),wall('parede-baixa-b',30,1),wall('parede-baixa-c',30,2),
           wall('parede-alta-a',52,0),wall('parede-alta-b',52,1),wall('parede-alta-c',52,2),
           wall('canto-baixo',30,1,True),wall('canto-alto',52,2,True)]

for i,(w,h) in enumerate([(19,31),(25,38),(17,27)]):
    b=p(f'{32-w//2},63 {32-w//2+3},59 {32},58 {32+w//2-3},59 {32+w//2},63',INK)
    b+=p(f'{32-w//2+2},61 {32-3},10 {32+2},6 {32+w//2-2},61 {32},67',SL_D)
    b+=p(f'{32-3},10 {32+2},6 {32+5},61 {32},67',SL_L)+p(f'{32-w//2+2},61 {32-3},10 {32},67',SL)
    b+=p(f'{32-3},10 {32+2},6 {32+1},24 {32-4},28',O)+p(f'{32+2},6 {32+5},61 {32+1},24',ST_D)
    b+=r(32-w//2+5,59,4,2,M)+r(32+w//2-7,60,3,2,M_L)+r(31,14,2,2,O_L)
    assets.append(save(f'estalagmite-{i+1}',64,72,b,(32,67),0,'estalagmite'))

# Wall torch: bracket in place, followed by four compact flame frames. Shared 32x48 canvas/pivot.
for i in range(4):
    b=r(12,24,7,3,BR)+r(14,19,3,7,O)+r(13,26,8,2,INK)+r(14,27,6,2,BR)
    b+=r(14,20,1,4,O_L)+r(17,22,2,3,BR)+r(12,25,2,2,INK)
    heights=[10,13,11,14]; fh=heights[i]; fy=20-fh
    shape=f'16,20 13,17 14,{fy+5} 16,{fy} 18,{fy+4} 20,{fy+1} 20,17 18,20'
    b+=p(shape,'#e96635')+p(f'16,19 15,16 16,{fy+5} 18,{fy+5} 18,18', '#ffa448')
    b+=p(f'17,19 16,17 17,{fy+6} 18,17 18,19','#ffd77a')
    if i in (1,3):b+=r(12,fy+7,2,2,'#c84a36')
    if i==2:b+=r(20,fy+8,2,2,'#c84a36')
    assets.append(save(f'tocha-frame-{i+1}',32,48,b,(16,28),0,'tocha-frame' if i else 'tocha'))

# Descending stair opening with broken stone rim, a deep void and individually legible treads.
b=p('6,28 16,22 29,11 43,9 56,15 72,24 75,40 65,51 50,64 34,60 18,53 7,42',INK)
b+=p('9,27 18,22 30,13 42,12 55,17 69,25 71,39 63,48 50,60 35,57 20,50 10,41',SL_D)
# Rear and side stones frame the black opening; the lower lip remains broken and uneven.
b+=p('9,27 18,22 30,13 42,12 55,17 63,22 51,26 37,24 24,30 14,34',SL)
b+=p('9,27 14,34 24,30 26,44 20,50 10,41',ST_L)
b+=p('63,22 69,25 71,39 63,48 56,43 58,31 51,26',SL_L)
b+=p('14,34 24,30 37,24 51,26 62,31 60,43 49,54 35,51 23,47 16,41',INK)
# Four receding steps, each with a lit tread and a darker front face.
b+=p('27,31 38,26 50,30 41,35 31,35',SL_L)+p('31,35 41,35 50,30 50,33 41,39 31,38',SL_D)
b+=p('26,37 38,32 51,36 41,42 30,42',ST_L)+p('30,42 41,42 51,36 51,40 41,46 30,45',ST_D)
b+=p('25,43 38,38 53,43 42,49 29,49',SL_L)+p('29,49 42,49 53,43 53,47 42,54 29,52',SL_D)
b+=p('24,49 39,45 55,50 44,57 31,55',ST)+p('31,55 44,57 55,50 53,54 44,61 32,59',SL_D)
b+=r(16,26,4,2,M)+r(23,20,4,2,M_L)+r(53,21,4,2,M)+r(65,27,3,2,M_L)
b+=p('12,35 18,32 23,33 19,37 14,38',O)+r(59,44,5,2,SL_L)+r(20,48,4,2,SL)
assets.append(save('escada-descendo',80,72,b,(40,58),0,'escada'))

(OUT/'manifest.json').write_text(json.dumps({'versao':1,'grade_tile':{'largura':64,'altura':36},'paleta':'game/theme.mjs:cave','artefatos':assets},ensure_ascii=False,indent=2)+'\n')
print(f'Exportados {len(assets)} sprites em {OUT}')
