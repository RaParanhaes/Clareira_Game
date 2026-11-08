#!/usr/bin/env python3
"""Slice a reviewed 8x8 generated commoner sheet into fixed-pivot PNG frames."""

from __future__ import annotations

from collections import deque
from pathlib import Path
import sys

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "game/art/avatar-frames/character-layers-v1"
FACING_ORDER = (
    "south", "southeast", "east", "northeast",
    "north", "northwest", "west", "southwest",
)
IDLE = ART / "frames/outfits/commoner/male/idle"
SHEETS = ART / "source/motion/commoner-male"
OUTPUTS = ART / "source/motion/commoner-male/action-frames"
PIVOT_X, PIVOT_Y = 48, 84
REFERENCE_HEIGHT = 80


def components(image: Image.Image) -> list[tuple[int, tuple[int, int, int, int]]]:
    # Alpha threshold separates sprites that barely touch after background removal.
    alpha = image.getchannel("A").point(lambda value: 255 if value > 64 else 0)
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    found = []
    for y in range(image.height):
        for x in range(image.width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            xs, ys = [], []
            while queue:
                px, py = queue.pop()
                xs.append(px)
                ys.append(py)
                for ny in range(max(0, py - 1), min(image.height, py + 2)):
                    for nx in range(max(0, px - 1), min(image.width, px + 2)):
                        if pixels[nx, ny] and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            queue.append((nx, ny))
            if len(xs) > 1_000:
                found.append((len(xs), (min(xs), min(ys), max(xs) + 1, max(ys) + 1)))
    return found


def remove_cutout_fringe(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    source_alpha = rgba.getchannel("A")
    core = source_alpha.point(lambda value: 255 if value > 64 else 0)
    pixels = core.load()
    seen: set[tuple[int, int]] = set()
    largest: list[tuple[int, int]] = []
    for y in range(core.height):
        for x in range(core.width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            component = []
            while queue:
                px, py = queue.pop()
                component.append((px, py))
                for ny in range(max(0, py - 1), min(core.height, py + 2)):
                    for nx in range(max(0, px - 1), min(core.width, px + 2)):
                        if pixels[nx, ny] and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            queue.append((nx, ny))
            if len(component) > len(largest):
                largest = component
    main_mask = Image.new("L", rgba.size, 0)
    mask_pixels = main_mask.load()
    for x, y in largest:
        mask_pixels[x, y] = 255
    main_mask = main_mask.filter(ImageFilter.MaxFilter(3))
    for y in range(rgba.height):
        for x in range(rgba.width):
            if not main_mask.getpixel((x, y)):
                rgba.putpixel((x, y), (0, 0, 0, 0))
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 0 and ((red > 150 and green < 100 and blue < 120)
                              or (red > 190 and green > 170 and blue < 120)):
                pixels[x, y] = (red, green, blue, 0)
    return rgba


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "jump"
    source = SHEETS / f"{action}-8x8-generated.png"
    sheet = Image.open(source).convert("RGBA")

    def sorted_grid(image: Image.Image, allow_missing_dance_direction: bool = False):
        found = components(image)
        expected = 56 if allow_missing_dance_direction else 64
        if len(found) != expected:
            raise RuntimeError(f"expected {expected} isolated {action} sprites, got {len(found)}")
        source_row_count = expected // 8
        sorted_columns = sorted(found, key=lambda item: (item[1][0] + item[1][2]) / 2)
        columns = []
        for column_index in range(8):
            column = sorted_columns[column_index * source_row_count:(column_index + 1) * source_row_count]
            column.sort(key=lambda item: (item[1][1] + item[1][3]) / 2)
            columns.append(column)
        source_rows = [
            [columns[column_index][row_index] for column_index in range(8)]
            for row_index in range(source_row_count)
        ]
        if allow_missing_dance_direction:
            # The generator omitted one view; mirror its opposite rear
            # quarter while keeping the eight frame columns in order.
            if action == "walk-wave":
                # This sheet is laid out as seven facing rows by eight
                # animation columns and omits the northwest rear quarter.
                rows = [source_rows[0], source_rows[1], source_rows[2], source_rows[3],
                        source_rows[4], source_rows[3], source_rows[5], source_rows[6]]
                mirrored_facings = {"northwest"}
            else:
                rows = [source_rows[0], source_rows[1], source_rows[2], source_rows[4],
                        source_rows[3], source_rows[4], source_rows[5], source_rows[6]]
                mirrored_facings = {"northeast"}
        else:
            rows = source_rows
            mirrored_facings = set()
        centers = [
            sum((item[1][0] + item[1][2]) / 2 for item in column) / len(column)
            for column in columns
        ]
        return rows, centers, mirrored_facings

    rows, column_centers, mirrored_facings = sorted_grid(sheet, action != "jump")
    reference_sheet = sheet if action == "jump" else Image.open(SHEETS / "jump-8x8-generated.png").convert("RGBA")
    reference_rows, _, _ = sorted_grid(reference_sheet)

    for facing, row in zip(FACING_ORDER, rows):
        reference_box = reference_rows[FACING_ORDER.index(facing)][-1][1]
        idle_box = Image.open(IDLE / facing / "frame-01.png").getchannel("A").getbbox()
        if idle_box is None:
            raise RuntimeError(f"missing idle art for {facing}")
        idle_width = idle_box[2] - idle_box[0]
        reference = reference_box
        if action == "walk-wave":
            # This sheet already has a complete eight-frame row per facing.
            # Use its own first pose as the scale reference so the waving
            # character does not inherit the wider jump silhouette.
            scale_reference = row[0][1]
            frame8_width = scale_reference[2] - scale_reference[0]
            neutral_height = scale_reference[3] - scale_reference[1]
        else:
            frame8_width = reference[2] - reference[0]
            neutral_height = max(
                row[0][1][3] - row[0][1][1],
                reference[3] - reference[1],
            )
        scale_y = REFERENCE_HEIGHT / neutral_height
        scale_x = idle_width / (frame8_width * scale_y)
        for index, (_, box) in enumerate(row, start=1):
            crop = remove_cutout_fringe(sheet.crop(box))
            mirrored = facing in mirrored_facings
            if mirrored:
                crop = ImageOps.mirror(crop)
            source_width, source_height = crop.size
            width = max(1, round(source_width * scale_y * scale_x))
            height = max(1, round(source_height * scale_y))
            scaled = crop.resize((width, height), Image.Resampling.LANCZOS)
            frame = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
            source_center = (box[0] + box[2]) / 2
            offset_x = round((source_center - column_centers[index - 1]) * scale_y * scale_x)
            if mirrored:
                offset_x = -offset_x
            x = PIVOT_X + offset_x - width // 2
            # Jump height is supplied by the game's z position. Keep the sole
            # anchor fixed in every PNG so the body does not jump twice.
            y = PIVOT_Y - height
            frame.alpha_composite(scaled, (x, y))
            destination = OUTPUTS / action / facing / f"frame-{index:02}.png"
            destination.parent.mkdir(parents=True, exist_ok=True)
            frame.save(destination, optimize=True)
    print(f"{action}: extracted 8 x 8 frames, removed colored cutout fringe, matched idle scale and pivot")


if __name__ == "__main__":
    main()
