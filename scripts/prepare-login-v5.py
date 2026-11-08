#!/usr/bin/env python3
"""Package generated painted actors for the offline 60 fps login film."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art-source/login-scene/v5'

def prepare_actor(name, boxes, scale, anchor):
    source = Image.open(OUT / f'{name}-source.png').convert('RGBA')
    sheet = Image.new('RGBA', (8 * 256, 256))
    for index, box in enumerate(boxes):
        tile = source.crop(box)
        pixels = np.array(tile)
        alpha = pixels[:, :, 3].astype(float)
        pixels[:, :, 3] = np.clip((alpha - 18) * 255 / 237, 0, 255).astype('uint8')
        tile = Image.fromarray(pixels)
        connected = tile.getchannel('A').point(lambda value: 255 if value > 12 else 0).filter(ImageFilter.MaxFilter(3))
        candidates = np.argwhere(np.asarray(connected) > 0)
        middle = candidates.mean(axis=0)
        seed = candidates[np.argmin(((candidates-middle)**2).sum(axis=1))]
        ImageDraw.floodfill(connected, (int(seed[1]),int(seed[0])), 128)
        pixels = np.array(tile)
        pixels[:,:,3] = np.where(np.asarray(connected)==128,pixels[:,:,3],0)
        grade = {'dragon':[.52,.60,.78],'deer':[.68,.71,.85],'rabbit':[.90,.87,.88]}[name]
        pixels[:,:,:3] = np.clip(pixels[:,:,:3] * np.asarray(grade),0,255).astype('uint8')
        tile = Image.fromarray(pixels)
        bounds = tile.getchannel('A').point(lambda value: 255 if value > 90 else 0).getbbox()
        if not bounds:
            raise ValueError(f'Empty actor {name} {index}')
        trimmed = tile.crop(bounds)
        if name == 'dragon':
            mask = np.asarray(trimmed.getchannel('A')) > 120
            head_band = mask[:, int(mask.shape[1] * .89):].sum(axis=1)
            head_y = int(np.argmax(np.convolve(head_band, np.ones(9), mode='same')))
            x = 230 - trimmed.width * scale
            y = 185 - head_y * scale
        else:
            x = anchor[0] - trimmed.width * scale * (1 if name == 'deer' else .5)
            y = anchor[1] - trimmed.height * scale
        trimmed = trimmed.resize((round(trimmed.width * scale), round(trimmed.height * scale)), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (256, 256))
        frame.alpha_composite(trimmed, (round(x), round(y)))
        sheet.alpha_composite(frame, (index * 256, 0))
    sheet.save(OUT / f'{name}-atlas.png', optimize=True)

def main():
    prepare_actor('dragon', [(0,0,432,470),(432,0,835,470),(835,0,1256,470),(1256,0,1672,470),
                             (0,470,435,941),(435,470,841,941),(841,470,1256,941),(1256,470,1672,941)], .5, (0,0))
    prepare_actor('deer', [(0,0,452,465),(452,0,870,465),(870,0,1268,465),(1268,0,1672,465),
                          (0,465,448,941),(448,465,860,941),(860,465,1265,941),(1265,465,1672,941)], .48, (230,248))
    prepare_actor('rabbit', [(0,0,418,470),(418,0,836,470),(836,0,1254,470),(1254,0,1671,470),
                            (0,470,575,941),(575,470,900,941),(900,470,1321,941),(1321,470,1671,941)], .35, (128,248))
    base = Image.open(ROOT / 'game/art/clareira-login-vila-v1.webp').convert('RGB')
    base.save(OUT / 'base.webp', quality=93, method=6)
    # Reuse the reviewed, generated flame variations, admitting their warm
    # pixels only in the hearth so the rest of the illustration stays stable.
    atlas = Image.new('RGBA', (4 * 120, 130))
    for index in range(4):
        image = Image.open(ROOT / f'art-source/login-scene/frames-v4/frame-{index+2:02}.webp').convert('RGB').crop((1000,570,1120,700))
        values = np.asarray(image).astype(float)
        red, green, blue = [values[:,:,i] for i in range(3)]
        warm = ((red>175)&(green>65)&(blue<155)&(red>green*1.08)&(green>blue*1.2)) | ((red>220)&(green>155)&(blue<190)&(red>=green)&(green>blue))
        mask = Image.fromarray((warm * 220).astype('uint8')).filter(ImageFilter.GaussianBlur(1.5))
        image = image.convert('RGBA'); image.putalpha(mask)
        atlas.alpha_composite(image, (index*120,0))
    atlas.save(OUT/'fire-atlas.png')
    metadata = {'duration':30,'fps':60,'frames':1800,'resolution':[1280,720],
                'reference':'game/art/clareira-login-vila-v1.webp',
                'generation':'built-in image_gen, three transparent 8-pose actor sheets',
                'events':{'dragon':[3,8],'rabbit':[9,16],'deer':[17,25]},
                'ambientPeriods':{'fire':2.5,'river':5,'foliage':10,'smoke':15,'stars':6},
                'budgets':{'runtimeVideos':1,'maxTransferBytes':12*1024*1024,'decodedFramesEstimateBytes':32*1024*1024}}
    (OUT/'production.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(f'Prepared generated actors and fire in {OUT}')

if __name__ == '__main__':
    main()
