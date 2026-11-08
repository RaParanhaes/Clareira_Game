#!/usr/bin/env python3
"""Build the small, pixel-grid campfire animation used by the Canvas renderer."""

import json
import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "game/art/fire"
FRAME_COUNT = 16
FRAME_WIDTH = 16
FRAME_HEIGHT = 24
SOURCE_SCALE = 12
PALETTE = ["#a93a28", "#d64c27", "#ed6927", "#f58d2e", "#ffc04a", "#ffe987"]


def hex_color(value):
    value = value.removeprefix("#")
    return tuple(int(value[offset:offset + 2], 16) for offset in (0, 2, 4)) + (255,)


COLORS = [hex_color(value) for value in PALETTE]


def frame_for(index):
    phase = 2 * math.pi * index / FRAME_COUNT
    image = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    body_lean = round(1.1 * math.sin(phase + 0.25))
    tip_lean = round(1.8 * math.sin(phase + 1.05))
    side_lean = round(1.5 * math.sin(phase * 1.5 + 0.9))
    ripple = round(math.sin(phase * 2 + 0.4))

    def shape(points, lean, color, tip_shift=0):
        moved = []
        for x, y in points:
            # The foot stays planted while the upper flame bends and ripples.
            t = (FRAME_HEIGHT - y) / FRAME_HEIGHT
            sway = round(lean * t + ripple * t * (1 - t))
            moved.append((max(0, min(FRAME_WIDTH - 1, x + sway)), max(0, min(FRAME_HEIGHT - 1, y + (tip_shift if y <= 3 else 0)))))
        draw.polygon(moved, fill=color)

    # Two interleaving tongues make the silhouette dance without widening the whole fire.
    main_tongue = [
        (7, 23), (4, 22), (2, 21), (3, 19), (1, 18), (2, 15),
        (4, 13), (3, 11), (4, 9), (6, 7), (6, 4), (8, 1), (9, 0),
        (9, 4), (11, 7), (10, 10), (13, 12), (14, 15), (13, 17),
        (14, 20), (11, 22), (9, 23),
    ]
    shape(main_tongue, tip_lean, COLORS[1], round(1.8 * math.sin(phase + 1.05)))

    # A separate lick breaks out from alternating sides; its peak and curl move each beat.
    lick_left = math.sin(phase * 1.5 + 0.4) < 0
    side = -1 if lick_left else 1
    base_x = 7
    lick_height = round(2 * math.sin(phase + 0.3))
    lick = [(base_x + side * 1, 20), (base_x + side * 3, 18),
            (base_x + side * 5, 15 + lick_height), (base_x + side * 5, 12 + lick_height),
            (base_x + side * 4, 11 + lick_height), (base_x + side * 3, 14 + lick_height),
            (base_x + side * 2, 16), (base_x, 19)]
    shape(lick, side_lean, COLORS[2])

    # Broken inner ribbons read as turbulent tongues instead of one oval candle core.
    inner = [
        (5, 22), (4, 20), (6, 18), (5, 16), (7, 13), (6, 11),
        (8, 8), (9, 11), (11, 14), (10, 16), (11, 18), (9, 21),
    ]
    shape(inner, round(body_lean * 0.65), COLORS[3])
    core = [
        (6, 21), (6, 19), (7, 17), (6, 15), (8, 13), (8, 11),
        (9, 13), (10, 15), (9, 17), (10, 19), (8, 21),
    ]
    shape(core, round(body_lean * 0.45), COLORS[4])

    # Small, offset hot streaks break up the single candle-like center line.
    if index % 4 != 1:
        cx = 7 + round(0.8 * math.sin(phase * 2 + 0.7))
        streak_y = 14 + (index % 3)
        draw.point((cx, streak_y), fill=COLORS[5])
        draw.point((cx + (1 if index % 2 else -1), streak_y + 1), fill=COLORS[5])

    return image


def write_assets():
    OUT.mkdir(parents=True, exist_ok=True)
    frames = [frame_for(index) for index in range(FRAME_COUNT)]
    atlas = Image.new("RGBA", (FRAME_WIDTH * FRAME_COUNT, FRAME_HEIGHT), (0, 0, 0, 0))
    source = Image.new("RGBA", (FRAME_WIDTH * FRAME_COUNT * SOURCE_SCALE, FRAME_HEIGHT * SOURCE_SCALE), (0, 0, 0, 0))

    for index, frame in enumerate(frames):
        atlas.paste(frame, (index * FRAME_WIDTH, 0))
        enlarged = frame.resize((FRAME_WIDTH * SOURCE_SCALE, FRAME_HEIGHT * SOURCE_SCALE), Image.Resampling.NEAREST)
        source.paste(enlarged, (index * FRAME_WIDTH * SOURCE_SCALE, 0))

    atlas.save(OUT / "campfire-flame-frames.png", optimize=True)
    source.save(OUT / "campfire-flame-source.png", optimize=True)
    manifest = {
        "asset": "campfire-flame-frames.png",
        "source": "campfire-flame-source.png",
        "sourceGenerator": "scripts/build-campfire-flame-atlas.py",
        "frameCount": FRAME_COUNT,
        "frameWidth": FRAME_WIDTH,
        "frameHeight": FRAME_HEIGHT,
        "frameOrder": list(range(FRAME_COUNT)),
        "frameDurationMs": 80,
        "loop": True,
        "anchor": {"x": FRAME_WIDTH // 2, "y": FRAME_HEIGHT},
        "displaySize": {"width": 14, "height": FRAME_HEIGHT},
        "palette": PALETTE,
        "alphaThreshold": 1,
        "sourceCanvas": list(source.size),
        "sourceFrameWidth": FRAME_WIDTH * SOURCE_SCALE,
        "silhouette": "compact layered flame with two independently swaying tongues and broken golden hot spots",
    }
    (OUT / "campfire-flame-frames.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_assets()
