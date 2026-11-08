#!/usr/bin/env python3
"""Package approved avatar source sheets as aligned transparent PNG frames."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "game/art/avatar-frames/neutral-body-v2"
SOURCE = ART / "source"
OUTPUT = ART / "frames"
ATLASES = ART / "atlases"
REVIEW = ROOT / "logs/avatar-frame-review-v2"

SIZE = (96, 96)
PIVOT = (48, 84)
TARGET_ART_HEIGHT = 80
ALPHA_THRESHOLD = 96
MIN_COMPONENT_AREA = 1100
FACINGS = (
    "south",
    "southeast",
    "east",
    "northeast",
    "north",
    "northwest",
    "west",
    "southwest",
)
BODIES = ("male", "female")
ACTION_SOURCES = {
    "idle": {body: SOURCE / f"{body}-base.png" for body in BODIES},
}


def grid_cell(image: Image.Image, col: int, row: int, columns: int, rows: int) -> Image.Image:
    left = round(col * image.width / columns)
    right = round((col + 1) * image.width / columns)
    top = round(row * image.height / rows)
    bottom = round((row + 1) * image.height / rows)
    return image.crop((left, top, right, bottom))


def clean_components(cell: Image.Image) -> Image.Image:
    """Make crisp alpha and discard isolated generator debris, retaining detached limbs."""
    cell = cell.convert("RGBA")
    width, height = cell.size
    alpha = cell.getchannel("A").point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    mask = bytearray(alpha.tobytes())
    visited = bytearray(len(mask))

    for start, value in enumerate(mask):
        if not value or visited[start]:
            continue
        component = [start]
        visited[start] = 1
        cursor = 0
        while cursor < len(component):
            index = component[cursor]
            cursor += 1
            y, x = divmod(index, width)
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                row_offset = next_y * width
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row_offset + next_x
                    if mask[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        component.append(neighbor)
        if len(component) < MIN_COMPONENT_AREA:
            for index in component:
                mask[index] = 0

    cell.putalpha(Image.frombytes("L", (width, height), bytes(mask)))
    return cell


def visible_bbox(cell: Image.Image) -> tuple[int, int, int, int]:
    bounds = cell.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("empty frame cell after alpha cleanup")
    return bounds


def extract_grid(path: Path, columns: int, rows: int) -> list[list[Image.Image]]:
    if not path.is_file():
        raise FileNotFoundError(path)
    image = Image.open(path).convert("RGBA")
    if image.width < columns or image.height < rows:
        raise ValueError(f"sheet is too small: {path}")
    return [
        [clean_components(grid_cell(image, col, row, columns, rows)) for col in range(columns)]
        for row in range(rows)
    ]


def normalize_grid(source_rows: list[list[Image.Image]]) -> list[list[Image.Image]]:
    result: list[list[Image.Image]] = []
    for row in source_rows:
        output_row: list[Image.Image] = []
        for cell in row:
            left, top, right, bottom = visible_bbox(cell)
            art = cell.crop((left, top, right, bottom))
            scale = TARGET_ART_HEIGHT / art.height
            scaled = art.resize(
                (max(1, round(art.width * scale)), TARGET_ART_HEIGHT),
                Image.Resampling.NEAREST,
            )
            x_offset = PIVOT[0] - scaled.width // 2
            y_offset = PIVOT[1] - TARGET_ART_HEIGHT
            if x_offset < 0 or x_offset + scaled.width > SIZE[0]:
                raise ValueError(f"figure exceeds the {SIZE[0]}px cell after normalization")
            frame = Image.new("RGBA", SIZE, (0, 0, 0, 0))
            frame.alpha_composite(scaled, (x_offset, y_offset))
            bounds = frame.getchannel("A").getbbox()
            if not bounds or bounds[3] - bounds[1] != TARGET_ART_HEIGHT or bounds[3] != PIVOT[1]:
                raise ValueError("normalized figure must keep the fixed art height and sole pivot")
            output_row.append(frame)
        result.append(output_row)
    return result


def save_frames(body: str, action: str, frames_by_facing: list[list[Image.Image]]) -> Image.Image:
    action_dir = OUTPUT / body / action
    action_dir.mkdir(parents=True, exist_ok=True)
    for direction, frames in zip(FACINGS, frames_by_facing):
        for index, frame in enumerate(frames, start=1):
            path = action_dir / direction / f"frame-{index:02d}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            frame.save(path, optimize=True)

    atlas = Image.new("RGBA", (SIZE[0] * len(frames_by_facing), SIZE[1]), (0, 0, 0, 0))
    for col, frames in enumerate(frames_by_facing):
        atlas.alpha_composite(frames[0], (col * SIZE[0], 0))
    atlas_path = ATLASES / body / f"{action}.png"
    atlas_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_path, optimize=True)
    return atlas


def build_body_actions(body: str) -> dict[str, list[list[Image.Image]]]:
    base_rows = extract_grid(ACTION_SOURCES["idle"][body], 4, 2)
    base_cells = [cell for row in base_rows for cell in row]
    idle_frames = normalize_grid([base_cells])[0]
    return {"idle": [[frame] for frame in idle_frames]}


def action_manifest(body: str, action: str, source_frames: list[list[Image.Image]]) -> dict:
    count = len(source_frames[0])
    layout = "direction-left-to-right"
    value = {
        "atlas": f"atlases/{body}/{action}.png",
        "frameCount": count,
        "layout": layout,
        "loop": True,
        "durationMs": 100,
        "frames": {
            facing: [
                f"frames/{body}/{action}/{facing}/frame-{index:02d}.png"
                for index in range(1, count + 1)
            ]
            for facing in FACINGS
        },
    }
    return value


def write_manifest(actions: dict[str, dict[str, dict[str, list[list[Image.Image]]]]]) -> None:
    manifest = {
        "schemaVersion": 1,
        "assetVersion": 2,
        "name": "neutral-body-v2",
        "description": "Adult male and female directional bases in a plain fitted opaque white layer; every frame shares scale and a ground pivot.",
        "sourceGrid": {
            "columns": 4,
            "rows": 2,
            "readingOrder": list(FACINGS),
        },
        "canvas": {"width": SIZE[0], "height": SIZE[1]},
        "artHeight": TARGET_ART_HEIGHT,
        "pivot": {"x": PIVOT[0], "y": PIVOT[1], "anchor": "sole-center"},
        "facings": list(FACINGS),
        "bodies": {},
        "sequenceConvention": "frame-01 is the first pose; frame numbers increase in play order with two digits.",
    }
    for body in BODIES:
        body_actions = actions[body]
        manifest["bodies"][body] = {
            "baseSource": f"source/{body}-base.png",
            "actions": {
                action: action_manifest(body, action, frames)
                for action, frames in body_actions.items()
            },
        }
    (ART / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def make_review(actions: dict[str, dict[str, dict[str, list[list[Image.Image]]]]]) -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    bg = (34, 54, 49, 255)
    cell = 176
    font = ImageFont.load_default()

    base_pair = Image.new("RGBA", (cell * 4, cell * 4), bg)
    base_draw = ImageDraw.Draw(base_pair)
    for body_row, body in enumerate(BODIES):
        frames = actions[body]["idle"]
        body_contact = Image.new("RGBA", (cell * 4, cell * 2), bg)
        body_draw = ImageDraw.Draw(body_contact)
        for index, (facing, frame) in enumerate(zip(FACINGS, [row[0] for row in frames])):
            x, y = (index % 4) * cell, (index // 4) * cell
            enlarged = frame.resize((cell, cell), Image.Resampling.NEAREST)
            body_contact.alpha_composite(enlarged, (x, y))
            body_draw.text((x + 4, y + 4), facing, font=font, fill=(225, 236, 221, 255))
            global_y = body_row * cell * 2 + y
            base_pair.alpha_composite(enlarged, (x, global_y))
            base_draw.text((x + 4, global_y + 4), f"{body} · {facing}", font=font, fill=(225, 236, 221, 255))
        body_contact.save(REVIEW / f"{body}-base-directions.png", optimize=True)

    base_pair.save(REVIEW / "base-pair-directions.png", optimize=True)

def main() -> None:
    assets: dict[str, dict[str, dict[str, list[list[Image.Image]]]]] = {}
    for body in BODIES:
        assets[body] = build_body_actions(body)
        for action, frames in assets[body].items():
            save_frames(body, action, frames)
    write_manifest(assets)
    make_review(assets)
    print(f"Built 16 directional base frames on 96×96 cells with pivot {PIVOT}.")
    print(f"Manifest: {ART / 'manifest.json'}")
    print(f"Contact sheets and review GIFs: {REVIEW}")


if __name__ == "__main__":
    main()
