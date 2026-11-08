#!/usr/bin/env python3
"""Build the Clareira pixel-art campfire base and eight-frame flame atlas."""

import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "game/art/fire"
W = H = 40
COUNT = 8
DURATION = 100
TRANSPARENT = (0, 0, 0, 0)


def polygon(draw, points, fill, outline=None):
    draw.polygon(points, fill=fill)
    if outline:
        draw.line(points + [points[0]], fill=outline, width=1, joint="curve")


def make_base():
    image = Image.new("RGBA", (W, H), TRANSPARENT)
    d = ImageDraw.Draw(image)
    d.ellipse((4, 29, 35, 37), fill=(8, 10, 9, 75))
    # Two short logs cross above an open ring of hearth stones.
    polygon(d, [(8, 25), (11, 23), (31, 29), (29, 33), (9, 28)], "#30221c", "#201916")
    polygon(d, [(9, 24), (11, 24), (29, 29), (28, 31), (10, 27)], "#795037")
    polygon(d, [(10, 31), (8, 28), (28, 22), (31, 25), (12, 32)], "#261c18", "#1b1715")
    polygon(d, [(11, 30), (10, 28), (28, 23), (29, 25), (12, 31)], "#64432f")
    # Exposed cut ends and two quiet bark highlights make the crossed wood readable.
    polygon(d, [(7, 24), (9, 22), (12, 23), (11, 26), (9, 27)], "#a1744c", "#37271e")
    d.point((9, 24), fill="#d0a06b")
    polygon(d, [(27, 29), (29, 28), (32, 29), (31, 32), (28, 32)], "#996944", "#37271e")
    d.point((29, 29), fill="#d1a16b")
    polygon(d, [(8, 28), (10, 27), (12, 29), (11, 32), (8, 31)], "#80583b", "#30231d")
    polygon(d, [(27, 22), (30, 21), (32, 23), (31, 26), (28, 26)], "#80583b", "#30231d")
    stones = [
        (4, 26, [(1, 2), (3, 0), (6, 1), (7, 4), (5, 7), (2, 6), (0, 4)], "#505956", "#91978d"),
        (11, 28, [(0, 2), (2, 0), (6, 1), (7, 4), (5, 6), (1, 5)], "#454d4a", "#858b80"),
        (18, 30, [(0, 1), (3, 0), (7, 1), (8, 4), (6, 6), (2, 5)], "#3f4744", "#7f877b"),
        (25, 28, [(0, 1), (3, 0), (6, 2), (7, 5), (4, 7), (1, 5)], "#4a5350", "#92968a"),
        (30, 25, [(0, 2), (2, 0), (5, 1), (6, 4), (4, 7), (1, 6)], "#515a56", "#9a9b8c"),
        (5, 32, [(0, 1), (3, 0), (6, 1), (7, 3), (5, 5), (1, 4)], "#444c49", "#858a7e"),
        (27, 32, [(0, 1), (2, 0), (6, 1), (7, 3), (5, 5), (1, 4)], "#454d49", "#8a8d81"),
    ]
    for x, y, shape, color, highlight in stones:
        pts = [(x + dx, y + dy) for dx, dy in shape]
        polygon(d, [(px, py + 1) for px, py in pts], "#222a27")
        polygon(d, pts, color, "#282e2b")
        d.line(pts[:3], fill=highlight, width=1)
        d.point((x + 3, y + 2), fill="#b3ad98")
    # A little warm ash below the flame anchors it without a broad glow.
    d.line([(15, 29), (18, 28), (21, 29), (24, 28)], fill="#a3522d", width=1)
    d.point((19, 28), fill="#e4853a")
    return image


FLAMES = [
    [(13, 28), (11, 25), (12, 21), (15, 18), (14, 14), (17, 10), (19, 16), (21, 19), (23, 12), (25, 8), (27, 15), (29, 19), (29, 24), (26, 28)],
    [(13, 28), (11, 24), (13, 20), (15, 17), (16, 12), (19, 8), (20, 15), (23, 18), (24, 13), (27, 11), (27, 17), (30, 21), (28, 26), (26, 28)],
    [(13, 28), (12, 25), (13, 21), (16, 18), (15, 14), (18, 11), (20, 17), (22, 20), (23, 15), (25, 10), (27, 16), (29, 21), (28, 26), (26, 28)],
    [(13, 28), (11, 25), (13, 22), (14, 18), (17, 15), (17, 10), (20, 15), (22, 19), (24, 14), (26, 12), (26, 18), (29, 21), (28, 26), (26, 28)],
    [(13, 28), (11, 24), (13, 20), (16, 17), (15, 13), (18, 8), (20, 15), (22, 18), (24, 13), (26, 9), (28, 16), (30, 21), (28, 26), (26, 28)],
    [(13, 28), (11, 25), (12, 21), (15, 18), (16, 14), (18, 11), (20, 16), (22, 18), (23, 14), (26, 11), (27, 18), (30, 21), (28, 26), (26, 28)],
    [(13, 28), (11, 24), (13, 20), (15, 17), (14, 13), (17, 9), (19, 16), (22, 19), (23, 15), (25, 12), (28, 18), (29, 23), (27, 27), (26, 28)],
    [(13, 28), (11, 24), (13, 20), (16, 17), (16, 13), (19, 9), (20, 15), (22, 19), (24, 14), (26, 10), (28, 17), (30, 22), (28, 26), (26, 28)],
]


def make_flame(index):
    image = Image.new("RGBA", (W, H), TRANSPARENT)
    d = ImageDraw.Draw(image)
    # The outer edge stays dark enough to read against the light; cores flicker in three warm values.
    outer = FLAMES[index]
    polygon(d, outer, "#a83d28", "#7e3025")
    orange = [(14, 27), (13, 23), (15, 20), (15, 17), (18, 13), (19, 19), (22, 21), (24, 16), (26, 14), (27, 20), (28, 24), (26, 27)]
    shift = [0, 1, -1, 1, 0, -1, 1, 0][index]
    orange = [(x + (shift if x > 21 else 0), y) for x, y in orange]
    polygon(d, orange, "#ed692c")
    yellow = [(15, 27), (15, 23), (17, 20), (17, 17), (19, 19), (20, 22), (22, 19), (24, 17), (25, 22), (25, 26), (23, 27)]
    yellow = [(x + (shift if x > 21 else 0), y) for x, y in yellow]
    polygon(d, yellow, "#ffb63f")
    core = [(17, 27), (17, 23), (19, 20), (20, 23), (21, 21), (23, 24), (22, 27)]
    core = [(x + (shift if x > 21 else 0), y) for x, y in core]
    polygon(d, core, "#ffe58a")
    d.point((19 + (shift if index % 2 else 0), 24), fill="#fff4c0")
    # Small sparks stay close to the flame and move smoothly through the loop.
    spark_positions = [[(17, 7)], [(23, 6), (16, 9)], [(19, 7)], [(27, 8)], [(16, 6), (25, 7)], [(22, 6)], [(17, 8)], [(25, 7), (19, 6)]]
    for sx, sy in spark_positions[index]:
        d.point((sx, sy), fill="#ffc34f")
        if sy < 8 and index % 2 == 0:
            d.point((sx, sy + 1), fill="#d85a32")
    return image


def write_assets():
    OUT.mkdir(parents=True, exist_ok=True)
    base = make_base()
    flames = [make_flame(index) for index in range(COUNT)]
    base.save(OUT / "campfire-hearth-base.png", optimize=True)
    flame_atlas = Image.new("RGBA", (W * COUNT, H), TRANSPARENT)
    composite_atlas = Image.new("RGBA", (W * COUNT, H), TRANSPARENT)
    for index, flame in enumerate(flames):
        x = index * W
        flame_atlas.alpha_composite(flame, (x, 0))
        composite = base.copy()
        composite.alpha_composite(flame)
        composite_atlas.alpha_composite(composite, (x, 0))
    flame_atlas.save(OUT / "campfire-hearth-flame-frames.png", optimize=True)
    composite_atlas.save(OUT / "campfire-hearth-frames.png", optimize=True)
    manifest = {
        "asset": "campfire-hearth-frames.png",
        "baseAsset": "campfire-hearth-base.png",
        "flameAsset": "campfire-hearth-flame-frames.png",
        "sourceGenerator": "scripts/build-campfire-hearth-atlas.py",
        "frameCount": COUNT,
        "frameWidth": W,
        "frameHeight": H,
        "frameOrder": list(range(COUNT)),
        "frameDurationMs": DURATION,
        "loop": True,
        "anchor": {"x": 20, "y": 36},
        "displaySize": {"width": W, "height": H},
        "groundBaselineY": 36,
        "palette": ["#201916", "#795037", "#3f4744", "#91978d", "#a83d28", "#ed692c", "#ffb63f", "#ffe58a"],
        "silhouette": "fixed crossed logs and open stone ring with eight warm flame poses",
    }
    (OUT / "campfire-hearth-frames.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_assets()
