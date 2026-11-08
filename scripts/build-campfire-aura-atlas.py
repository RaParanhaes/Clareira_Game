#!/usr/bin/env python3
"""Convert the generated eight-pose aura reference into a compact game atlas."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "game/art/fire"
SOURCE = OUT / "campfire-aura-source.png"
FRAME_COUNT = 8
FRAME_WIDTH = 64
FRAME_HEIGHT = 64
GRID_COLUMNS = 4
GRID_ROWS = 2
ALPHA_CUTOFF = 96
PALETTE = [
    "#584624", "#96702c", "#c7953e", "#f0c667", "#ffe9a1",
    "#164d55", "#287b80", "#54aaa6", "#796b9d", "#b3a3d0",
]


def rgba(value):
    value = value.removeprefix("#")
    return tuple(int(value[offset:offset + 2], 16) for offset in (0, 2, 4))


COLORS = [rgba(value) for value in PALETTE]


def nearest_color(pixel):
    r, g, b = pixel
    return min(COLORS, key=lambda color: (r-color[0])**2 + (g-color[1])**2 + (b-color[2])**2)


def crop_frame(source, index):
    column = index % GRID_COLUMNS
    row = index // GRID_COLUMNS
    left = round(column * source.width / GRID_COLUMNS)
    right = round((column + 1) * source.width / GRID_COLUMNS)
    top = round(row * source.height / GRID_ROWS)
    bottom = round((row + 1) * source.height / GRID_ROWS)
    return source.crop((left, top, right, bottom))


def prepare_frame(source, index):
    frame = crop_frame(source, index)
    frame = frame.resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)
    pixels = []
    for r, g, b, alpha in frame.getdata():
        if alpha < ALPHA_CUTOFF:
            pixels.append((0, 0, 0, 0))
            continue
        color = nearest_color((r, g, b))
        if alpha < 150:
            alpha = 72
        elif alpha < 220:
            alpha = 144
        else:
            alpha = 210
        pixels.append((*color, alpha))
    frame.putdata(pixels)
    return frame


def write_assets():
    if not SOURCE.is_file():
        raise SystemExit(f"Fonte ausente: {SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    if source.width < GRID_COLUMNS or source.height < GRID_ROWS:
        raise SystemExit("A fonte não tem resolução suficiente para a grade 4 × 2.")
    frames = [prepare_frame(source, index) for index in range(FRAME_COUNT)]
    atlas = Image.new("RGBA", (FRAME_WIDTH * FRAME_COUNT, FRAME_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.paste(frame, (index * FRAME_WIDTH, 0))
    atlas.save(OUT / "campfire-aura-frames.png", optimize=True)
    manifest = {
        "asset": "campfire-aura-frames.png",
        "source": "campfire-aura-source.png",
        "sourceGenerator": "scripts/build-campfire-aura-atlas.py",
        "sourceGrid": {"columns": GRID_COLUMNS, "rows": GRID_ROWS},
        "frameCount": FRAME_COUNT,
        "frameWidth": FRAME_WIDTH,
        "frameHeight": FRAME_HEIGHT,
        "frameOrder": list(range(FRAME_COUNT)),
        "frameDurationMs": 120,
        "loop": True,
        "anchor": {"x": 32, "y": 48},
        "displaySize": {"width": 64, "height": 64},
        "displayOffset": {"x": -32, "y": -48},
        "palette": PALETTE,
        "alphaCutoff": ALPHA_CUTOFF,
        "layers": {"groundAura": "lower 40%", "sparkles": "upper 55%"},
        "silhouette": "broken amber and teal orbit with sparse floating star motes",
    }
    (OUT / "campfire-aura-frames.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_assets()
