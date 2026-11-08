#!/usr/bin/env python3
"""Prepare versioned generated plates and fixed-pivot atlases for the login film."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art-source/login-scene/v6'
V5 = ROOT / 'art-source/login-scene/v5'


def trim_alpha(tile, threshold=24):
    tile = tile.convert('RGBA')
    alpha = np.asarray(tile.getchannel('A'))
    alpha = np.where(alpha > threshold, alpha, 0).astype('uint8')
    tile.putalpha(Image.fromarray(alpha))
    box = tile.getchannel('A').getbbox()
    if box is None:
        raise ValueError('empty sprite tile')
    return tile.crop(box)


def remove_small_components(tile, min_area=320):
    rgba=np.asarray(tile.convert('RGBA')).copy()
    rgba[:,:,3]=np.where(rgba[:,:,3]>20,rgba[:,:,3],0)
    mask=rgba[:,:,3]>20
    h,w=mask.shape; seen=np.zeros((h,w),dtype=bool)
    for sy,sx in zip(*np.nonzero(mask)):
        if seen[sy,sx]: continue
        stack=[(sy,sx)]; seen[sy,sx]=True; points=[]
        while stack:
            y,x=stack.pop(); points.append((y,x))
            for ny in range(max(0,y-1),min(h,y+2)):
                for nx in range(max(0,x-1),min(w,x+2)):
                    if mask[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; stack.append((ny,nx))
        if len(points)<min_area:
            yy,xx=zip(*points); rgba[yy,xx,3]=0
    return Image.fromarray(rgba,'RGBA')


def fit_tile(tile, canvas=(256, 256), max_size=(230, 190), anchor='bottom', grade=(1, 1, 1)):
    tile = trim_alpha(tile)
    px = np.asarray(tile).copy()
    px[:, :, :3] = np.clip(px[:, :, :3].astype(float) * np.asarray(grade), 0, 255).astype('uint8')
    tile = Image.fromarray(px, 'RGBA')
    scale = min(max_size[0] / tile.width, max_size[1] / tile.height)
    tile = tile.resize((round(tile.width * scale), round(tile.height * scale)), Image.Resampling.LANCZOS)
    frame = Image.new('RGBA', canvas)
    x = (canvas[0] - tile.width) // 2
    y = canvas[1] - tile.height - 8 if anchor == 'bottom' else (canvas[1] - tile.height) // 2
    frame.alpha_composite(tile, (x, y))
    return frame


def prepare_fox():
    source = Image.open(OUT / 'fox-poses-generated.png').convert('RGBA')
    frames = []
    # The generated 3x2 contact sheet is authored at stable view and scale.
    cells = [(c*512, r*512, (c+1)*512, (r+1)*512) for r in range(2) for c in range(3)]
    for i, box in enumerate(cells):
        tile=source.crop(box)
        # The generated top-left fox has two stray pixels from the next row's ears;
        # keep the authored cell boundary clean instead of allowing a ghost pose.
        if i == 0:
            alpha=tile.getchannel('A'); pix=np.asarray(alpha).copy(); pix[445:,:]=0
            tile.putalpha(Image.fromarray(pix))
        frames.append(fit_tile(tile, max_size=(232, 184), grade=(.78, .78, .91)))
    # A quiet eight-step cycle holds the same contact pose through long rests.
    order = [0, 1, 2, 2, 3, 4, 5, 0]
    atlas = Image.new('RGBA', (8*256, 256))
    for i, pose in enumerate(order):
        atlas.alpha_composite(frames[pose], (i*256, 0))
    atlas.save(OUT / 'fox-atlas.png', optimize=True)


def prepare_traveler():
    source=Image.open(OUT/'traveler-generated.png').convert('RGBA')
    atlas=Image.new('RGBA',(8*256,256))
    for row in range(2):
        for col in range(4):
            tile=source.crop((col*384,row*512,(col+1)*384,(row+1)*512))
            frame=fit_tile(tile,max_size=(155,236),grade=(.84,.82,.9))
            atlas.alpha_composite(remove_small_components(frame,min_area=50),((row*4+col)*256,0))
    atlas.save(OUT/'traveler-atlas.png',optimize=True)


def prepare_ground_dragon():
    source = Image.open(OUT / 'dragon-ground-poses-generated.png').convert('RGBA')
    # Generated subjects cross the nominal panel grid. Use reviewed subject boxes
    # so the dragon is not cut at a wing, head, or paw.
    cells = [(840, 150, 1671, 590), (0, 550, 835, 941),
             (835, 550, 1671, 941)]
    frames=[]
    pieces=[source.crop(box) for box in cells]
    look=Image.open(OUT/'dragon-look-generated.png').convert('RGBA')
    pieces.insert(2,look)
    # landing, folded, raised head, warm breath
    for raw in pieces:
        tile=remove_small_components(trim_alpha(raw, threshold=18))
        pix=np.asarray(tile).copy()
        pix[:,:,:3]=np.clip(pix[:,:,:3].astype(float)*np.array([.69,.73,.9]),0,255).astype('uint8')
        tile=Image.fromarray(pix,'RGBA')
        scale=min(222/tile.width,190/tile.height)
        tile=tile.resize((round(tile.width*scale),round(tile.height*scale)),Image.Resampling.LANCZOS)
        # Align the eye toward the right-facing head landmark and feet to one baseline.
        alpha=np.asarray(tile.getchannel('A'))>80
        yy,xx=np.nonzero(alpha)
        head_x=int(xx.max())
        x=230-head_x; y=245-tile.height
        frame=Image.new('RGBA',(256,256)); frame.alpha_composite(tile,(x,y))
        # Downscaling turns distant paint flecks into isolated 1–2px debris;
        # remove only disconnected remnants after final-size normalization.
        frames.append(remove_small_components(frame, min_area=100))
    order=[frames[0],frames[1],frames[2],frames[2],frames[3],frames[2],frames[1],frames[1]]
    atlas=Image.new('RGBA',(8*256,256))
    for i,frame in enumerate(order): atlas.alpha_composite(frame,(i*256,0))
    atlas.save(OUT/'dragon-ground-atlas.png',optimize=True)


def prepare_base():
    base=Image.open(ROOT/'game/art/clareira-login-vila-v1.webp').convert('RGB')
    # Replace just the foreground fox habitat with its generated clean plate; a wide,
    # feathered boundary keeps the densely painted ground from revealing a hard patch.
    box=(1300,740,1560,915); size=(box[2]-box[0],box[3]-box[1])
    clean=Image.open(OUT/'fox-clear-generated.png').convert('RGB').resize(size,Image.Resampling.LANCZOS)
    mask=Image.new('L',size,0)
    d=ImageDraw.Draw(mask); d.rounded_rectangle((9,9,size[0]-10,size[1]-10),radius=25,fill=255)
    mask=mask.filter(ImageFilter.GaussianBlur(7))
    base.paste(clean,box[:2],mask)
    base.save(OUT/'base.webp',quality=94,method=6)

    # Full generated six-pane off-state, including the nearby surfaces that lose spill.
    off=Image.open(OUT/'window-upper-off-generated.png').convert('RGB')
    off=off.resize((63,70),Image.Resampling.LANCZOS)
    off.save(OUT/'window-upper-off.webp',quality=95,method=6)
    castle=Image.open(OUT/'castle-light-off-generated.png').convert('RGBA').resize((32,40),Image.Resampling.LANCZOS)
    castle_mask=Image.new('L',(32,40),0)
    d=ImageDraw.Draw(castle_mask);d.ellipse((3,7,30,39),fill=255)
    castle.putalpha(castle_mask.filter(ImageFilter.GaussianBlur(2)))
    castle.save(OUT/'castle-window-off.png',optimize=True)


def main():
    prepare_fox(); prepare_traveler(); prepare_ground_dragon(); prepare_base()
    # Preserve the previously approved dragon/rabbit/deer and fire atlases exactly.
    for name in ('dragon-atlas.png','rabbit-atlas.png','deer-atlas.png','fire-atlas.png'):
        (OUT/name).write_bytes((V5/name).read_bytes())
    meta={
      'duration':360,'fps':60,'frames':21600,'resolution':[1280,720],
      'reference':'game/art/clareira-login-vila-v1.webp',
      'generation':'built-in image_gen; fox states, quadrupedal dragon landing/perch/breath poses, window off plate and fox habitat cleanup',
      'approvedAssetsReused':['v5 dragon flight','v5 rabbit','v5 deer','v5 fire'],
      'events':{'rabbitA':[35,62],'windowOff':[72,74,178,180],'dragonFirst':[88,185],'deer':[185,214],'foxSleepyWake':[223,232],'rabbitB':[242,271],'foxFullWake':[271,298],'dragonReturn':[298,317]},
      'budgets':{'runtimeVideos':1,'maxTransferBytes':94371840,'decodedFramesEstimateBytes':33554432}
    }
    (OUT/'production.json').write_text(json.dumps(meta,indent=2)+'\n')
    print(f'Prepared v6 assets in {OUT}')

if __name__=='__main__': main()
