#!/usr/bin/env python3
"""Normalize approved eight-view costume sheets and author pixel FX atlases."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "game/art/avatar-frames/character-layers-v1"
SOURCE = ART / "source"
FRAMES = ART / "frames"
ATLASES = ART / "atlases"
SHEETS = ART / "sheets"
GIFS = ART / "review-gifs"

CELL = (96, 96)
PIVOT = (48, 84)
ART_HEIGHT = 80
FACINGS = (
    "south", "southeast", "east", "northeast",
    "north", "northwest", "west", "southwest",
)
FIT_TEMPLATES = {
    "commoner": ("commoner-male.png", "commoner-female.png"),
    "mage-robe": ("mage-male.png", "mage-female.png"),
    "dimension-coat": ("dimension-coat-male.png", "dimension-coat-female.png"),
    "dark-armor": ("dark-armor-male.png", "dark-armor-female.png"),
    "light-armor": ("light-armor-male.png", "light-armor-female.png"),
}
GENDERS = ("male", "female")
OUTFIT_PROPERTIES = {
    "commoner": {
        "characterId": "character.peasant",
        "motionProfileId": "animation-profile.standard",
        "compatibleFitGroupIds": ["fit-group.average"],
        "bundledSlots": ["body-shape", "hair", "eyes", "headwear", "back-item"],
    },
    "mage-robe": {
        "characterId": "character.mage",
        "motionProfileId": "animation-profile.spellcaster",
        "compatibleFitGroupIds": ["fit-group.average", "fit-group.slim", "fit-group.hunched"],
        "bundledSlots": ["body-shape", "hair", "eyes", "headwear", "back-item"],
    },
    "dimension-coat": {
        "characterId": "character.dimensional-traveler",
        "motionProfileId": "animation-profile.nimble",
        "compatibleFitGroupIds": [
            "fit-group.average", "fit-group.slim", "fit-group.broad", "fit-group.heavy", "fit-group.hunched",
        ],
        "bundledSlots": ["body-shape", "hair", "eyes", "headwear", "back-item"],
    },
    "dark-armor": {
        "characterId": "character.dark-knight",
        "motionProfileId": "animation-profile.heavy",
        "compatibleFitGroupIds": ["fit-group.broad"],
        "bundledSlots": ["body-shape", "hair", "eyes", "headwear", "back-item"],
    },
    "light-armor": {
        "characterId": "character.light-knight",
        "motionProfileId": "animation-profile.trained",
        "compatibleFitGroupIds": ["fit-group.broad"],
        "bundledSlots": ["body-shape", "hair", "eyes", "headwear", "back-item"],
    },
}


def connected_components(alpha: Image.Image) -> list[dict]:
    """Find the eight opaque character silhouettes without trusting grid spacing."""
    half = alpha.resize((alpha.width // 2, alpha.height // 2), Image.Resampling.NEAREST)
    width, height = half.size
    mask = bytearray(half.point(lambda value: 1 if value >= 240 else 0).tobytes())
    visited = bytearray(len(mask))
    components: list[dict] = []

    for start, active in enumerate(mask):
        if not active or visited[start]:
            continue
        pixels = [start]
        visited[start] = 1
        cursor = 0
        left = right = start % width
        top = bottom = start // width
        while cursor < len(pixels):
            index = pixels[cursor]
            cursor += 1
            y, x = divmod(index, width)
            left = min(left, x)
            right = max(right, x)
            top = min(top, y)
            bottom = max(bottom, y)
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                row_offset = next_y * width
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row_offset + next_x
                    if mask[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        pixels.append(neighbor)
        if len(pixels) >= 5000:
            components.append({
                "pixels": pixels,
                "bounds": (left, top, right + 1, bottom + 1),
                "area": len(pixels),
            })

    if len(components) != 8:
        raise ValueError(f"expected 8 character silhouettes, found {len(components)}")

    # Group the two rows before ordering each row left-to-right. Exact vertical
    # centers vary with pose (a foot or hat can sit a few pixels higher), so a
    # center-y/x sort can silently exchange neighboring direction cells.
    by_row_center = sorted(components, key=lambda item: (item["bounds"][1] + item["bounds"][3]) / 2)
    row_gaps = [
        ((by_row_center[index + 1]["bounds"][1] + by_row_center[index + 1]["bounds"][3]) / 2)
        - ((by_row_center[index]["bounds"][1] + by_row_center[index]["bounds"][3]) / 2)
        for index in range(len(by_row_center) - 1)
    ]
    row_split = max(range(len(row_gaps)), key=row_gaps.__getitem__) + 1
    if row_split != 4:
        raise ValueError(f"expected 4 silhouettes in each direction row, found {row_split} and {8 - row_split}")
    top_row = sorted(by_row_center[:row_split], key=lambda item: item["bounds"][0])
    bottom_row = sorted(by_row_center[row_split:], key=lambda item: item["bounds"][0])
    components = top_row + bottom_row
    if any(x0 <= 1 or y0 <= 1 or x1 >= width - 1 or y1 >= height - 1
           for x0, y0, x1, y1 in (item["bounds"] for item in components)):
        raise ValueError("a character touches the source-sheet edge and may be clipped")
    if components[3]["bounds"][1] >= components[4]["bounds"][1]:
        raise ValueError("direction rows are not in a clear top-to-bottom order")
    return components


def extract_component(source: Image.Image, component: dict) -> Image.Image:
    width, height = source.size
    half_width, half_height = width // 2, height // 2
    core_bytes = bytearray(half_width * half_height)
    for index in component["pixels"]:
        core_bytes[index] = 255
    core = Image.frombytes("L", (half_width, half_height), bytes(core_bytes))
    mask = core.resize((width, height), Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(5))
    alpha = ImageChops.multiply(source.getchannel("A"), mask)
    result = source.copy()
    result.putalpha(alpha)
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError("empty silhouette after background removal")
    return result.crop(bounds)


def normalize_sprites(sprites: list[Image.Image]) -> tuple[list[Image.Image], dict]:
    heights = sorted(sprite.height for sprite in sprites)
    source_height = (heights[3] + heights[4]) / 2
    scale = ART_HEIGHT / source_height
    normalized: list[Image.Image] = []
    actual_heights: list[int] = []
    widths: list[int] = []
    for sprite in sprites:
        width = max(1, round(sprite.width * scale))
        height = max(1, round(sprite.height * scale))
        if width > CELL[0] or height > ART_HEIGHT + 3:
            raise ValueError(f"normalized sprite is outside the 96x96 / 80px fit: {width}x{height}")
        nearest = sprite.resize((width, height), Image.Resampling.NEAREST)
        alpha = nearest.getchannel("A")
        solid = Image.new("RGB", nearest.size, (0, 0, 0))
        solid.paste(nearest.convert("RGB"), mask=alpha)
        palette = solid.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        raster = palette.convert("RGB").convert("RGBA")
        raster.putalpha(alpha)
        x = PIVOT[0] - width // 2
        y = PIVOT[1] - height
        frame = Image.new("RGBA", CELL, (0, 0, 0, 0))
        frame.alpha_composite(raster, (x, y))
        bbox = frame.getchannel("A").getbbox()
        if bbox is None or bbox[3] != PIVOT[1] or bbox[0] < 0 or bbox[2] > CELL[0]:
            raise ValueError("sprite missed its fixed sole-center pivot")
        actual_heights.append(bbox[3] - bbox[1])
        widths.append(bbox[2] - bbox[0])
        normalized.append(frame)
    return normalized, {
        "sourceMedianHeight": source_height,
        "scale": scale,
        "artHeightRange": [min(actual_heights), max(actual_heights)],
        "artWidthRange": [min(widths), max(widths)],
    }


def write_appearance(outfit_id: str, gender: str, source_path: Path) -> dict:
    source = Image.open(source_path).convert("RGBA")
    if source.size != (1536, 1024):
        raise ValueError(f"unexpected source size {source.size}: {source_path}")
    components = connected_components(source.getchannel("A"))
    extracted = [extract_component(source, component) for component in components]
    looks, bounds = normalize_sprites(extracted)
    direction_frames = dict(zip(FACINGS, looks))

    # The commoner sheet repeats a front-facing right diagonal in its final
    # top-row cell. Use the matching rear three-quarter view mirrored from NW
    # for NE so the eight facing labels agree with the game direction contract.
    direction_overrides = {}
    if outfit_id == "commoner" and gender == "male":
        direction_frames["northeast"] = direction_frames["northwest"].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        direction_overrides["northeast"] = "horizontal-mirror-of-northwest; source northeast cell repeats a front-right view"

    frame_root = FRAMES / "outfits" / outfit_id / gender / "idle"
    for facing, frame in direction_frames.items():
        frame_path = frame_root / facing / "frame-01.png"
        frame_path.parent.mkdir(parents=True, exist_ok=True)
        frame.save(frame_path, optimize=True)

    atlas = Image.new("RGBA", (CELL[0] * 8, CELL[1]), (0, 0, 0, 0))
    for index, facing in enumerate(FACINGS):
        atlas.alpha_composite(direction_frames[facing], (index * CELL[0], 0))
    atlas_path = ATLASES / "outfits" / outfit_id / gender / "idle.png"
    atlas_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_path, optimize=True)

    make_direction_gif(outfit_id, gender, [direction_frames[facing] for facing in FACINGS])
    appearance = {
        "source": f"source/{source_path.name}",
        "atlas": str(atlas_path.relative_to(ART)),
        **OUTFIT_PROPERTIES[outfit_id],
        "action": "idle",
        "frameCount": 1,
        "turnaroundPreviewDurationMs": 120,
        "framesByFacing": {
            facing: [str((frame_root / facing / "frame-01.png").relative_to(ART))]
            for facing in FACINGS
        },
        "scaleDiagnostics": bounds,
        "silhouetteComponents": len(components),
        "renderLayer": "full-avatar",
        "includes": ["body", "hair", "eyes", "headwear", "outfit", "cape", "boots"],
    }
    if direction_overrides:
        appearance["directionOverrides"] = direction_overrides
    return appearance


def make_direction_gif(outfit_id: str, gender: str, frames: list[Image.Image]) -> None:
    GIFS.mkdir(parents=True, exist_ok=True)
    sequence = []
    for frame in frames:
        background = Image.new("RGBA", CELL, (29, 36, 41, 255))
        background.alpha_composite(frame)
        sequence.append(background.convert("P", palette=Image.Palette.ADAPTIVE))
    destination = GIFS / f"{outfit_id}-{gender}-turnaround.gif"
    sequence[0].save(
        destination, save_all=True, append_images=sequence[1:],
        # GIF stores delays in 10 ms units, so keep the declared value exact.
        duration=120, loop=0, disposal=2, optimize=False,
    )


def arc_points(cx: int, cy: int, rx: int, ry: int, start: float, end: float, count: int) -> list[tuple[int, int]]:
    return [
        (round(cx + math.cos(start + (end - start) * i / count) * rx),
         round(cy + math.sin(start + (end - start) * i / count) * ry))
        for i in range(count + 1)
    ]


def effect_frame(effect_id: str, frame: int) -> Image.Image:
    image = Image.new("RGBA", CELL, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    phase = frame * math.tau / 8
    center = (48, 46)
    if effect_id == "aura-void":
        colors = ((45, 25, 69, 180), (112, 49, 154, 245), (207, 95, 224, 255))
        for ring, (rx, ry) in enumerate(((19, 31), (24, 36))):
            points = arc_points(*center, rx, ry, phase + ring * 1.7, phase + ring * 1.7 + math.pi * 1.45, 15)
            draw.line(points, fill=colors[ring], width=2 if ring == 0 else 1)
        for mote in range(9):
            angle = phase * (1 if mote % 2 else -1) + mote * math.tau / 9
            radius = 29 + (mote % 3) * 4
            x = round(center[0] + math.cos(angle) * radius)
            y = round(center[1] + math.sin(angle) * (radius + 7))
            size = 1 + (mote + frame) % 2
            draw.rectangle((x, y, x + size, y + size), fill=colors[(mote + frame) % 3])
    elif effect_id == "aura-radiance":
        colors = ((145, 91, 26, 190), (255, 192, 74, 240), (255, 238, 176, 255))
        for ray in range(12):
            angle = phase * .25 + ray * math.tau / 12
            inner, outer = 24 + ray % 3, 30 + (ray + frame) % 5
            a = (round(center[0] + math.cos(angle) * inner), round(center[1] + math.sin(angle) * (inner + 7)))
            b = (round(center[0] + math.cos(angle) * outer), round(center[1] + math.sin(angle) * (outer + 7)))
            draw.line((a, b), fill=colors[(ray + frame) % 3], width=1)
        draw.line(arc_points(*center, 21, 33, phase, phase + math.pi * 1.7, 18), fill=colors[1], width=1)
        for mote in range(8):
            angle = phase + mote * math.tau / 8
            x = round(center[0] + math.cos(angle) * 28)
            y = round(center[1] + math.sin(angle) * 36)
            draw.rectangle((x, y, x + 1, y + 1), fill=colors[(mote + frame) % 3])
    elif effect_id in ("spellcast-blue", "rift-activate"):
        accent = (81, 189, 255, 255) if effect_id == "spellcast-blue" else (203, 95, 255, 255)
        shadow = (31, 83, 147, 220) if effect_id == "spellcast-blue" else (83, 34, 141, 220)
        radius = 4 + ((frame + 1) % 8) * 3
        draw.ellipse((48 - radius, 43 - radius // 2, 48 + radius, 43 + radius // 2), outline=shadow, width=1)
        draw.arc((48 - radius - 3, 43 - radius, 48 + radius + 3, 43 + radius),
                 start=(frame * 45) % 360, end=(frame * 45 + 210) % 360, fill=accent, width=2)
        for mote in range(7):
            angle = phase + mote * math.tau / 7
            distance = 7 + (mote * 5 + frame * 3) % 22
            x = round(48 + math.cos(angle) * distance)
            y = round(43 + math.sin(angle) * distance * .7)
            draw.rectangle((x, y, x + (mote % 2), y + (mote % 2)), fill=accent if mote % 2 else shadow)
        if frame in (2, 3, 6, 7):
            draw.polygon([(48, 31), (50, 40), (58, 43), (50, 46), (48, 55), (46, 46), (38, 43), (46, 40)], fill=accent)
    else:
        raise ValueError(f"unknown effect: {effect_id}")
    return image


def write_effect(effect_id: str, loop: bool = True) -> dict:
    frames = [effect_frame(effect_id, index) for index in range(8)]
    atlas = Image.new("RGBA", (CELL[0] * len(frames), CELL[1]), (0, 0, 0, 0))
    frame_paths = []
    for index, frame in enumerate(frames, start=1):
        path = FRAMES / "effects" / effect_id / f"frame-{index:02d}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        frame.save(path, optimize=True)
        atlas.alpha_composite(frame, ((index - 1) * CELL[0], 0))
        frame_paths.append(str(path.relative_to(ART)))
    atlas_path = ATLASES / "effects" / f"{effect_id}.png"
    atlas_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_path, optimize=True)
    gif_frames = []
    for frame in frames:
        background = Image.new("RGBA", CELL, (20, 24, 30, 255))
        background.alpha_composite(frame)
        gif_frames.append(background.convert("P", palette=Image.Palette.ADAPTIVE))
    GIFS.mkdir(parents=True, exist_ok=True)
    gif_options = {
        "save_all": True,
        "append_images": gif_frames[1:],
        "duration": 90,
        "disposal": 2,
    }
    if loop:
        gif_options["loop"] = 0
    gif_frames[0].save(GIFS / f"{effect_id}.gif", **gif_options)
    return {
        "atlas": str(atlas_path.relative_to(ART)),
        "frameCount": len(frames),
        "frameDurationMs": 90,
        "loop": loop,
        "frames": frame_paths,
        "anchor": {"x": 48, "y": 46, "kind": "character-center"},
    }


ITEMS = {
    "axe": {"grip": "two-hand", "actions": ["idle", "walk", "chop"], "profile": "heavy"},
    "sword": {"grip": "one-hand", "actions": ["idle", "walk", "slash"], "profile": "trained"},
    "knife": {"grip": "one-hand", "actions": ["idle", "walk", "stab"], "profile": "nimble"},
    "lantern": {"grip": "one-hand", "actions": ["idle", "walk", "carry"], "profile": "lantern-carry"},
    "branch": {"grip": "one-hand", "actions": ["idle", "walk", "carry"], "profile": "standard"},
    "staff": {"grip": "two-hand", "actions": ["idle", "walk", "cast"], "profile": "spellcaster"},
    "dimensional-device": {"grip": "one-hand", "actions": ["idle", "walk", "activate"], "profile": "nimble"},
    "dark-sword": {"grip": "one-hand", "actions": ["idle", "walk", "slash"], "profile": "heavy"},
    "light-sword": {"grip": "one-hand", "actions": ["idle", "walk", "slash"], "profile": "trained"},
}
HAND_SOCKETS = {
    "south": (37, 58), "southeast": (41, 58), "east": (50, 58), "northeast": (56, 57),
    "north": (59, 58), "northwest": (48, 58), "west": (38, 58), "southwest": (34, 58),
}
ITEM_AXES = {
    "south": (-4, -1), "southeast": (2, -1), "east": (8, -2), "northeast": (6, -3),
    "north": (4, -1), "northwest": (-5, -2), "west": (-8, -2), "southwest": (-6, -3),
}


def item_frame(item_id: str, facing: str) -> Image.Image:
    image = Image.new("RGBA", CELL, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    hx, hy = HAND_SOCKETS[facing]
    dx, dy = ITEM_AXES[facing]
    definition = ITEMS[item_id]
    if item_id == "lantern":
        draw.line((hx, hy, hx, hy - 9), fill=(49, 36, 27, 255), width=2)
        draw.rectangle((hx - 5, hy - 17, hx + 5, hy - 8), fill=(39, 30, 24, 255), outline=(20, 18, 18, 255))
        draw.rectangle((hx - 3, hy - 15, hx + 3, hy - 10), fill=(255, 190, 71, 255))
        draw.point((hx - 1, hy - 13), fill=(255, 239, 167, 255))
    elif item_id == "dimensional-device":
        draw.ellipse((hx - 6, hy - 6, hx + 6, hy + 6), fill=(38, 39, 74, 255), outline=(19, 19, 29, 255))
        draw.ellipse((hx - 4, hy - 4, hx + 4, hy + 4), outline=(151, 91, 223, 255), width=2)
        draw.point((hx, hy - 2), fill=(218, 157, 255, 255))
        draw.point((hx + 2, hy + 1), fill=(108, 233, 255, 255))
    else:
        length = 27 if item_id == "staff" else 20 if item_id in ("sword", "dark-sword", "light-sword") else 12 if item_id == "knife" else 18
        end = (hx + dx, hy + dy - length)
        if item_id == "branch":
            draw.line((hx, hy, *end), fill=(48, 37, 29, 255), width=3)
            draw.line((end[0], end[1] + 4, end[0] - 4, end[1] - 3), fill=(55, 40, 29, 255), width=2)
            draw.line((end[0] + 1, end[1] + 1, end[0] + 6, end[1] - 4), fill=(55, 40, 29, 255), width=2)
            draw.point((end[0] + 6, end[1] - 4), fill=(95, 127, 64, 255))
        else:
            shaft = item_id in ("staff", "axe")
            metal = item_id in ("sword", "knife", "dark-sword", "light-sword", "axe")
            if item_id == "staff":
                draw.line((hx, hy, *end), fill=(36, 26, 23, 255), width=4)
                draw.line((hx - 1, hy - 1, end[0] - 1, end[1] + 1), fill=(132, 83, 49, 255), width=2)
                draw.polygon([(end[0], end[1] - 5), (end[0] + 4, end[1]), (end[0], end[1] + 5), (end[0] - 4, end[1])], fill=(60, 117, 184, 255), outline=(22, 31, 45, 255))
                draw.point((end[0] - 1, end[1] - 1), fill=(143, 223, 255, 255))
            elif item_id == "axe":
                draw.line((hx, hy, *end), fill=(45, 31, 23, 255), width=3)
                draw.line((end[0] - 6, end[1] + 2, end[0] + 4, end[1] - 1), fill=(45, 42, 42, 255), width=5)
                draw.polygon([(end[0] - 2, end[1] - 7), (end[0] + 8, end[1] - 3), (end[0] + 6, end[1] + 5), (end[0] - 4, end[1] + 3)], fill=(126, 137, 145, 255), outline=(35, 37, 40, 255))
            else:
                color = (78, 38, 44, 255) if item_id == "dark-sword" else (252, 224, 153, 255) if item_id == "light-sword" else (181, 190, 194, 255)
                edge = (22, 24, 29, 255)
                draw.line((hx, hy, *end), fill=edge, width=5 if item_id != "knife" else 3)
                draw.line((hx, hy, *end), fill=color, width=2 if item_id != "knife" else 1)
                draw.line((hx - 4, hy - 1, hx + 4, hy + 1), fill=(206, 154, 79, 255), width=2)
                draw.rectangle((hx - 2, hy + 1, hx + 2, hy + 4), fill=(67, 45, 32, 255))
                draw.point(end, fill=(255, 248, 208, 255) if item_id == "light-sword" else color)
    return image


def write_equipment() -> dict:
    result = {}
    for item_id, definition in ITEMS.items():
        frames = [item_frame(item_id, facing) for facing in FACINGS]
        atlas = Image.new("RGBA", (CELL[0] * len(frames), CELL[1]), (0, 0, 0, 0))
        sockets = {}
        frame_paths = {}
        for index, (facing, frame) in enumerate(zip(FACINGS, frames), start=1):
            path = FRAMES / "equipment" / item_id / "idle" / facing / "frame-01.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            frame.save(path, optimize=True)
            atlas.alpha_composite(frame, ((index - 1) * CELL[0], 0))
            sockets[facing] = {"x": HAND_SOCKETS[facing][0], "y": HAND_SOCKETS[facing][1], "anchor": "main-hand"}
            frame_paths[facing] = [str(path.relative_to(ART))]
        atlas_path = ATLASES / "equipment" / f"{item_id}.png"
        atlas_path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(atlas_path, optimize=True)
        result[item_id] = {
            "atlas": str(atlas_path.relative_to(ART)), "frameCount": 1,
            "framesByFacing": frame_paths, "slot": "main-hand", "grip": definition["grip"],
            "actions": definition["actions"], "motionProfileId": f"animation-profile.{definition['profile']}",
            "renderLayer": "hand-item-front", "sockets": sockets,
        }
    return result


def make_contact_sheet(appearances: dict, effects: dict) -> None:
    SHEETS.mkdir(parents=True, exist_ok=True)
    background = (29, 36, 41, 255)
    cell_w, cell_h = 120, 126
    sheet = Image.new("RGBA", (4 * cell_w, 10 * cell_h), background)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for outfit_index, outfit_id in enumerate(FIT_TEMPLATES):
        for gender_index, gender in enumerate(GENDERS):
            row = outfit_index * 2 + gender_index
            frames = []
            for facing in FACINGS:
                path = FRAMES / "outfits" / outfit_id / gender / "idle" / facing / "frame-01.png"
                frames.append(Image.open(path).convert("RGBA"))
            label = f"{outfit_id} / {gender}"
            draw.text((4, row * cell_h + 3), label, font=font, fill=(236, 231, 218, 255))
            for index, frame in enumerate(frames):
                x = index % 4 * cell_w + (cell_w - CELL[0]) // 2
                y = row * cell_h + 22 + index // 4 * 96
                draw.line((index % 4 * cell_w + 14, y + PIVOT[1], index % 4 * cell_w + cell_w - 14, y + PIVOT[1]), fill=(83, 100, 104, 255), width=1)
                sheet.alpha_composite(frame, (x, y))
    sheet.save(SHEETS / "avatar-outfits-all.png", optimize=True)

    effect_sheet = Image.new("RGBA", (4 * 144, 4 * 144), background)
    for index, effect_id in enumerate(effects):
        x, y = index % 4 * 144, index // 4 * 144
        draw = ImageDraw.Draw(effect_sheet)
        draw.text((x + 4, y + 3), effect_id, font=font, fill=(236, 231, 218, 255))
        atlas_path = ART / effects[effect_id]["atlas"]
        atlas = Image.open(atlas_path).convert("RGBA")
        frame = atlas.crop((0, 0, 96, 96)).resize((96, 96), Image.Resampling.NEAREST)
        effect_sheet.alpha_composite(frame, (x + 24, y + 32))
    effect_sheet.save(SHEETS / "effects-first-frame.png", optimize=True)

    equipment_ids = list(ITEMS)
    equipment_sheet = Image.new("RGBA", (3 * 192, 3 * 128), background)
    for index, item_id in enumerate(equipment_ids):
        x, y = index % 3 * 192, index // 3 * 128
        draw = ImageDraw.Draw(equipment_sheet)
        draw.text((x + 5, y + 3), item_id, font=font, fill=(236, 231, 218, 255))
        atlas = Image.open(ATLASES / "equipment" / f"{item_id}.png").convert("RGBA")
        frame = atlas.crop((0, 0, 96, 96)).resize((96, 96), Image.Resampling.NEAREST)
        equipment_sheet.alpha_composite(frame, (x + 48, y + 21))
    equipment_sheet.save(SHEETS / "equipment-all.png", optimize=True)


def main() -> None:
    outfits = {}
    for outfit_id, sources in FIT_TEMPLATES.items():
        outfits[outfit_id] = {}
        for gender, filename in zip(GENDERS, sources):
            outfits[outfit_id][gender] = write_appearance(outfit_id, gender, SOURCE / filename)

    effects = {
        "aura-void": write_effect("aura-void"),
        "aura-radiance": write_effect("aura-radiance"),
        "spellcast-blue": write_effect("spellcast-blue", loop=False),
        "rift-activate": write_effect("rift-activate", loop=False),
    }
    effects["aura-void"].update({"characters": ["character.dark-knight"], "trigger": "passive", "renderLayer": "aura-back"})
    effects["aura-radiance"].update({"characters": ["character.light-knight"], "trigger": "passive", "renderLayer": "aura-back"})
    effects["spellcast-blue"].update({"characters": ["character.mage"], "trigger": "cast", "renderLayer": "hand-item-front"})
    effects["rift-activate"].update({"characters": ["character.dimensional-traveler"], "trigger": "activate", "renderLayer": "hand-item-front"})
    equipment = write_equipment()
    make_contact_sheet(outfits, effects)
    manifest = {
        "schemaVersion": 1,
        "assetVersion": 1,
        "canvas": {"width": CELL[0], "height": CELL[1]},
        "artHeight": ART_HEIGHT,
        "pivot": {"x": PIVOT[0], "y": PIVOT[1], "anchor": "sole-center"},
        "facings": list(FACINGS),
        "appearanceMode": "full-body-raster-variant",
        "frameOrder": "direction-left-to-right; actions use numbered frames starting at 01",
        "paletteSampling": "nearest-neighbor; 64-color per-frame reduction",
        "outfits": outfits,
        "effects": effects,
        "equipment": equipment,
        "movementClips": {
            "status": "missing",
            "reason": "No approved action PNG sequence exists. The generated walk study repeated poses and lacked alternating grounded contacts, so movement and emote commands keep the reviewed idle frame.",
            "missingActions": [
                "walk", "run", "jump", "sit", "wave", "dance",
                "walk-wave", "walk-dance", "crouch", "crouch-walk",
            ],
            "profiles": {
                "standard": ["walk", "run", "jump", "sit", "wave", "dance", "crouch"],
                "spellcaster": ["walk", "run", "jump", "cast", "sit", "wave", "dance", "crouch"],
                "nimble": ["walk", "run", "jump", "slash", "stab", "activate", "sit", "wave", "dance", "crouch"],
                "heavy": ["walk", "run", "jump", "chop", "slash", "sit", "wave", "dance", "crouch"],
                "trained": ["walk", "run", "jump", "slash", "sit", "wave", "dance", "crouch"],
            },
        },
    }
    (ART / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built 10 eight-direction costume atlases, {len(equipment)} item atlases and {len(effects)} eight-frame effect atlases.")
    print(f"Contact sheet: {SHEETS / 'avatar-outfits-all.png'}")
    print(f"Properties: {ART / 'manifest.json'}")


if __name__ == "__main__":
    main()
