#!/usr/bin/env python3
"""Keep the commoner PNG actions on one palette and one native-size contract."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "game/art/avatar-frames/character-layers-v1"
FACING_ORDER = (
    "south", "southeast", "east", "northeast",
    "north", "northwest", "west", "southwest",
)
FACING_LABELS = ("S", "SE", "E", "NE", "N", "NW", "W", "SW")
CELL = (96, 96)
FRAME_COUNTS = {"walk": 8, "run": 8, "wave": 8, "sit-chair": 8, "jump": 8, "dance": 8, "sit-ground": 8, "crouch": 8, "crouch-walk": 8, "walk-wave": 8}
FRAME_DELAYS = {"walk": 100, "run": 100, "wave": 110, "sit-chair": 120, "jump": 110, "dance": 115, "sit-ground": 120, "crouch": 110, "crouch-walk": 105, "walk-wave": 110}
HORIZONTAL_FIT = {"walk": {"east": .83, "west": .83}}
PALETTE_SIZE = 128
REVIEW_BACKGROUND = (31, 35, 37)


def opaque_luma(image: Image.Image) -> float:
    rgba = image.convert("RGBA")
    pixels = [
        rgba.getpixel((x, y))[:3]
        for y in range(rgba.height)
        for x in range(rgba.width)
        if rgba.getpixel((x, y))[3] > 128
    ]
    if not pixels:
        raise ValueError("cannot measure a fully transparent frame")
    return sum(.2126 * r + .7152 * g + .0722 * b for r, g, b in pixels) / len(pixels)


def shared_palette(idle_frames: list[Image.Image]) -> Image.Image:
    sample = Image.new("RGB", (CELL[0] * len(idle_frames), CELL[1]), (0, 0, 0))
    for index, frame in enumerate(idle_frames):
        rgba = frame.convert("RGBA")
        sample.paste(rgba.convert("RGB"), (index * CELL[0], 0), rgba.getchannel("A"))
    return sample.quantize(
        colors=PALETTE_SIZE,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )


def color_map(image: Image.Image, palette: Image.Image, gamma: float = 1.0) -> Image.Image:
    rgba = image.convert("RGBA")
    rgb = rgba.convert("RGB")
    if gamma != 1.0:
        lut = [round(255 * (value / 255) ** gamma) for value in range(256)]
        rgb = Image.merge("RGB", tuple(channel.point(lut) for channel in rgb.split()))
    result = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB").convert("RGBA")
    result.putalpha(rgba.getchannel("A"))
    return result


def match_idle_luma(image: Image.Image, palette: Image.Image, target: float) -> tuple[Image.Image, float]:
    low, high = .35, 2.5
    best_image = color_map(image, palette)
    best_gamma = 1.0
    best_error = abs(opaque_luma(best_image) - target)
    for _ in range(16):
        gamma = (low + high) / 2
        candidate = color_map(image, palette, gamma)
        value = opaque_luma(candidate)
        error = abs(value - target)
        if error < best_error:
            best_image, best_gamma, best_error = candidate, gamma, error
        if value > target:
            low = gamma
        else:
            high = gamma
    return best_image, best_gamma


def fit_frame_width(image: Image.Image, action: str, facing: str) -> Image.Image:
    factor = HORIZONTAL_FIT.get(action, {}).get(facing, 1.0)
    if factor == 1.0:
        return image
    width = round(CELL[0] * factor)
    resized = image.resize((width, CELL[1]), Image.Resampling.NEAREST)
    fitted = Image.new("RGBA", CELL, (0, 0, 0, 0))
    fitted.alpha_composite(resized, ((CELL[0] - width) // 2, 0))
    return fitted


def ensure_source_frames(action: str) -> Path:
    source_root = ART / "source/motion/commoner-male/action-frames" / action
    frame_root = ART / "frames/outfits/commoner/male" / action
    for facing in FACING_ORDER:
        for index in range(1, FRAME_COUNTS[action] + 1):
            source_path = source_root / facing / f"frame-{index:02d}.png"
            if source_path.exists():
                continue
            current_path = frame_root / facing / f"frame-{index:02d}.png"
            if not current_path.exists():
                raise FileNotFoundError(f"missing {action} source frame: {current_path}")
            source_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(current_path, source_path)
    return source_root


def save_atlas(action: str, frames: dict[str, list[Image.Image]]) -> None:
    atlas = Image.new("RGBA", (CELL[0] * FRAME_COUNTS[action], CELL[1] * len(FACING_ORDER)), (0, 0, 0, 0))
    for row, facing in enumerate(FACING_ORDER):
        for column, frame in enumerate(frames[facing]):
            atlas.alpha_composite(frame, (column * CELL[0], row * CELL[1]))
    path = ART / "atlases/outfits/commoner/male" / f"{action}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(path, optimize=True)


def save_contact_sheet(action: str, frames: dict[str, list[Image.Image]]) -> None:
    scale = 2
    cell_w, cell_h = CELL[0] * scale, CELL[1] * scale
    label_h = 18
    gutter = 70
    sheet = Image.new(
        "RGBA",
        (gutter + cell_w * FRAME_COUNTS[action], (cell_h + label_h) * len(FACING_ORDER)),
        (*REVIEW_BACKGROUND, 255),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for row, (facing, label) in enumerate(zip(FACING_ORDER, FACING_LABELS)):
        y = row * (cell_h + label_h)
        draw.text((3, y + 3), f"{label} {facing}", fill=(245, 231, 198, 255), font=font)
        for column, frame in enumerate(frames[facing]):
            x = gutter + column * cell_w
            enlarged = frame.resize((cell_w, cell_h), Image.Resampling.NEAREST)
            sheet.alpha_composite(enlarged, (x, y + label_h))
            draw.text((x + 3, y + 3), f"{column + 1:02d}", fill=(190, 213, 213, 255), font=font)
    path = ART / "review-gifs" / action / "commoner-male" / "contact-2x.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, optimize=True)


def save_facing_gifs(action: str, frames: dict[str, list[Image.Image]], palette: Image.Image) -> None:
    palette_colors = (palette.getpalette() or [])[: PALETTE_SIZE * 3]
    palette_colors.extend(REVIEW_BACKGROUND)
    palette_image = Image.new("P", (1, 1))
    palette_image.putpalette(palette_colors + [0] * (768 - len(palette_colors)))
    for facing in FACING_ORDER:
        gif_frames = []
        for frame in frames[facing]:
            background = Image.new("RGBA", CELL, (*REVIEW_BACKGROUND, 255))
            background.alpha_composite(frame)
            gif_frames.append(background.convert("RGB").quantize(palette=palette_image, dither=Image.Dither.NONE))
        destination = ART / "review-gifs" / action / "commoner-male" / f"{facing}.gif"
        destination.parent.mkdir(parents=True, exist_ok=True)
        gif_frames[0].save(
            destination,
            save_all=True,
            append_images=gif_frames[1:],
            duration=FRAME_DELAYS[action],
            loop=0,
            disposal=2,
            optimize=False,
        )


def normalize_action(action: str) -> None:
    if action not in FRAME_COUNTS:
        raise ValueError(f"supported actions are: {', '.join(FRAME_COUNTS)}")
    idle_root = ART / "frames/outfits/commoner/male/idle"
    idle = {
        facing: Image.open(idle_root / facing / "frame-01.png").convert("RGBA")
        for facing in FACING_ORDER
    }
    if any(image.size != CELL for image in idle.values()):
        raise ValueError("all idle reference frames must be 96x96")
    palette = shared_palette([idle[facing] for facing in FACING_ORDER])

    # The standing base uses this same shared palette as every movement action.
    for facing in FACING_ORDER:
        idle[facing] = color_map(idle[facing], palette)
        idle[facing].save(idle_root / facing / "frame-01.png", optimize=True)
    idle_atlas = Image.new("RGBA", (CELL[0] * len(FACING_ORDER), CELL[1]), (0, 0, 0, 0))
    for column, facing in enumerate(FACING_ORDER):
        idle_atlas.alpha_composite(idle[facing], (column * CELL[0], 0))
    idle_atlas.save(ART / "atlases/outfits/commoner/male/idle.png", optimize=True)

    source_root = ensure_source_frames(action)
    output_root = ART / "frames/outfits/commoner/male" / action
    frames: dict[str, list[Image.Image]] = {}
    gamma_values = []
    for facing in FACING_ORDER:
        frames[facing] = []
        target_luma = opaque_luma(idle[facing])
        for index in range(1, FRAME_COUNTS[action] + 1):
            source_path = source_root / facing / f"frame-{index:02d}.png"
            source_frame = Image.open(source_path).convert("RGBA")
            if source_frame.size != CELL:
                raise ValueError(f"expected a 96x96 frame: {source_path}")
            frame, gamma = match_idle_luma(source_frame, palette, target_luma)
            frame = fit_frame_width(frame, action, facing)
            gamma_values.append(gamma)
            destination = output_root / facing / f"frame-{index:02d}.png"
            destination.parent.mkdir(parents=True, exist_ok=True)
            frame.save(destination, optimize=True)
            frames[facing].append(frame)

    save_atlas(action, frames)
    save_contact_sheet(action, frames)
    save_facing_gifs(action, frames, palette)
    print(
        f"{action}: 8 facings x {FRAME_COUNTS[action]} frames; "
        f"shared {PALETTE_SIZE}-color palette; gamma range "
        f"{min(gamma_values):.2f}-{max(gamma_values):.2f}"
    )


def main() -> None:
    actions = sys.argv[1:] or ["walk"]
    for action in actions:
        normalize_action(action)


if __name__ == "__main__":
    main()
