#!/usr/bin/env python3
"""Build the directional pixel frames for the avatar's travelling energy aura."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "game/art/avatar-frames/character-layers-v1"
DIRECTIONS = (
    ("south", 0),
    ("southeast", 0),
    ("east", 0),
    ("northeast", 0),
    ("north", 0),
    ("northwest", 0),
    ("west", 0),
    ("southwest", 0),
)
SIZE = 96
FRAME_COUNT = 8


def path_points(center_x):
    return [
        (center_x, 25),
        (center_x + 1, 31),
        (center_x - 2, 37),
        (center_x + 2, 43),
        (center_x, 50),
        (center_x + 1, 57),
        (center_x - 2, 64),
        (center_x, 73),
    ]


def interpolate_path(points, amount):
    length = len(points) - 1
    position = max(0.0, min(1.0, amount)) * length
    start = min(length - 1, int(position))
    fraction = position - start
    x1, y1 = points[start]
    x2, y2 = points[start + 1]
    return round(x1 + (x2 - x1) * fraction), round(y1 + (y2 - y1) * fraction)


def draw_pulse(draw, x, y, alpha=255):
    draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=(20, 139, 181, round(alpha * 0.3)))
    draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=(67, 221, 226, round(alpha * 0.72)))
    draw.point((x, y), fill=(223, 255, 244, alpha))


def build_frame(direction_index, offset, frame_index):
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    center_x = 48 + offset
    points = path_points(center_x)

    # A faint pixel channel follows the spine and limbs; the bright current travels through it.
    draw.line(points, fill=(31, 173, 195, 78), width=2)
    reach = 3 if direction_index in (2, 6) else 6
    for branch in (
        [(center_x, 32), (center_x - reach // 2, 31), (center_x - reach, 38)],
        [(center_x, 32), (center_x + reach // 2, 31), (center_x + reach, 38)],
        [(center_x, 57), (center_x - 3, 64), (center_x - 4, 72)],
        [(center_x, 57), (center_x + 3, 64), (center_x + 4, 72)],
    ):
        draw.line(branch, fill=(38, 159, 185, 65), width=2)

    progress = frame_index / FRAME_COUNT
    for lag, alpha in ((0.0, 255), (0.16, 125), (0.31, 54)):
        amount = (progress - lag) % 1
        x, y = interpolate_path(points, amount)
        draw_pulse(draw, x, y, alpha)

    # Small side sparks echo the moving pulse without obscuring the face.
    if frame_index in (1, 2, 5, 6):
        side = -1 if direction_index in (1, 2, 3) else 1
        spark_x, spark_y = center_x + side * 5, 34 + (frame_index % 3) * 3
        draw.rectangle((spark_x, spark_y, spark_x + 1, spark_y + 1), fill=(127, 243, 238, 168))
    return image


def main():
    frames_root = ART / "frames/effects/aura-flow"
    review_root = ART / "review-gifs/effects/aura-flow"
    atlas = Image.new("RGBA", (SIZE * FRAME_COUNT, SIZE * len(DIRECTIONS)), (0, 0, 0, 0))
    contact = Image.new("RGB", (SIZE * 4, SIZE * 2), (20, 36, 42))
    integration = Image.new("RGBA", (SIZE * len(DIRECTIONS), SIZE * 3), (20, 36, 42, 255))
    idle_atlas = Image.open(ART / "atlases/outfits/commoner/male/idle.png").convert("RGBA")
    walk_atlas = Image.open(ART / "atlases/outfits/commoner/male/walk.png").convert("RGBA")

    for direction_index, (direction, offset) in enumerate(DIRECTIONS):
        direction_dir = frames_root / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        preview_frames = []
        for frame_index in range(FRAME_COUNT):
            image = build_frame(direction_index, offset, frame_index)
            image.save(direction_dir / f"frame-{frame_index + 1:02d}.png", optimize=True)
            atlas.alpha_composite(image, (frame_index * SIZE, direction_index * SIZE))
            preview_frames.append(image)
        review_root.mkdir(parents=True, exist_ok=True)
        preview_frames[0].save(
            review_root / f"{direction}.gif",
            save_all=True,
            append_images=preview_frames[1:],
            duration=110,
            loop=0,
            disposal=2,
            optimize=False,
        )
        first = preview_frames[0].resize((SIZE, SIZE), Image.Resampling.NEAREST)
        contact_x = (direction_index % 4) * SIZE
        contact_y = (direction_index // 4) * SIZE
        contact.paste(Image.alpha_composite(Image.new("RGBA", first.size, (20, 36, 42, 255)), first).convert("RGB"), (contact_x, contact_y))

    atlas.save(ART / "atlases/effects/aura-flow.png", optimize=True)
    contact.resize((SIZE * 8, SIZE * 4), Image.Resampling.NEAREST).save(review_root / "contact.png", optimize=True)
    for direction_index, (direction, _) in enumerate(DIRECTIONS):
        base = idle_atlas.crop((direction_index * SIZE, 0, (direction_index + 1) * SIZE, SIZE))
        energy = Image.alpha_composite(base, atlas.crop((direction_index * SIZE, direction_index * SIZE,
                                                          (direction_index + 1) * SIZE, (direction_index + 1) * SIZE)))
        walk = walk_atlas.crop((direction_index * SIZE, direction_index * SIZE,
                                (direction_index + 1) * SIZE, (direction_index + 1) * SIZE))
        integration.alpha_composite(base, (direction_index * SIZE, 0))
        integration.alpha_composite(energy, (direction_index * SIZE, SIZE))
        integration.alpha_composite(walk, (direction_index * SIZE, SIZE * 2))
    integration.convert("RGB").resize((SIZE * len(DIRECTIONS) * 2, SIZE * 3 * 2), Image.Resampling.NEAREST).save(
        review_root / "character-integration.png", optimize=True,
    )


if __name__ == "__main__":
    main()
