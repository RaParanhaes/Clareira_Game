from PIL import Image
from pathlib import Path
import json

OUT = Path('game/art/building-materials')
OUT.mkdir(parents=True, exist_ok=True)
size = 16
names = ['timber', 'masonry', 'shingles', 'foundation', 'daub', 'thatch']
atlas = Image.new('RGBA', (size * len(names), size), (0, 0, 0, 0))

def px(material, x, y, value):
    atlas.putpixel((material * size + x, y), (value, value, value, 255))

# Six compact, repeatable material swatches. Runtime palette tinting supplies
# color; these pixel clusters supply distinct grain, joints, relief and scale.
for y in range(size):
    for x in range(size):
        # Oak planks: broad face, grain lines, board seams and a small knot.
        plank, grain = y % 8, (x + (y // 8) * 3) % 13
        if plank == 0: value = 74
        elif plank == 1: value = 128
        elif grain in (2, 3) and plank in (3, 4): value = 176
        elif grain == 4 and plank == 3: value = 104
        elif grain == 5 and plank == 4: value = 148
        elif x in (0, 15): value = 116
        else: value = 218 if grain < 9 else 196
        px(0, x, y, value)

        # Uneven rubble blocks rather than repeated horizontal brick courses.
        course, local_y = y // 8, y % 8
        offset_x = (x + (7 if course else 0)) % 16
        joint = (offset_x in (0, 1, 7, 8) if course == 0
                 else offset_x in (0, 1, 6, 7))
        if local_y == 0 or joint: value = 72
        elif local_y == 1 or offset_x in (2, 9): value = 128
        elif local_y == 7 or (offset_x == 5 and local_y in (2, 6)): value = 164
        elif (x * 7 + y * 3) % 23 == 0: value = 178
        else: value = 211 if local_y < 5 else 192
        px(1, x, y, value)

        # Individual split shingles: overlapping scales and alternating joints.
        row, sx = y % 4, (x + (4 if (y // 4) % 2 else 0)) % 8
        if row == 0 or sx == 0: value = 66
        elif row == 1 or sx == 1: value = 128
        elif row == 3 and sx in (6, 7): value = 160
        elif (x * 3 + y * 5) % 17 == 0: value = 174
        else: value = 214 if sx < 6 else 194
        px(2, x, y, value)

        # Larger, heavier foundation blocks with a recessed mortar course.
        fy, fx = y % 8, (x + (8 if (y // 8) % 2 else 0)) % 16
        if fy == 0 or fx == 0: value = 58
        elif fy == 1 or fx == 1: value = 104
        elif fy == 7 or fx == 7: value = 144
        elif (x * 11 + y * 7) % 23 == 0: value = 157
        else: value = 184
        px(3, x, y, value)

        # Quiet limewashed daub with sparse straw and tiny weathered patches.
        value = 232
        if (x * 13 + y * 7) % 29 == 0: value = 199
        if (x + y * 2) % 37 == 0: value = 211
        if x in (0, 15) or y in (0, 15): value = 160
        if y in (5, 12) and x in (4, 5, 11): value = 217
        px(4, x, y, value)

        # Thick thatch bundles, with a dark lap and loose straw tips.
        course, fiber = y // 4, (x + (y // 4) * 3) % 9
        if y % 4 == 0: value = 74
        elif y % 4 == 1: value = 145
        elif fiber in (0, 1): value = 180
        elif fiber in (4, 5) and y % 4 == 2: value = 205
        else: value = 225
        if y % 4 == 3 and x % 4 != 0: value = 116
        px(5, x, y, value)

atlas.save(OUT / 'architecture-uv-v1.png', optimize=True)
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 2, 'format': 'grayscale-repeatable-uv-tiles',
    'file': 'architecture-uv-v1.png', 'tileSize': [size, size],
    'columns': names, 'uv': 'one tile per material face; repeat by surface dimensions',
    'tint': 'grayscale material clusters map to each building palette at runtime',
}, indent=2) + '\n')
