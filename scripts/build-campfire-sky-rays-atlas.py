"""Build the animated celestial-ray atlas used during the campfire arrival."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image
from PIL import ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "game" / "art" / "fire"
SOURCE = OUT / "campfire-sky-rays-source.png"
SOURCE_FRAME_COUNT = 8
FRAME_COUNT = SOURCE_FRAME_COUNT * 2
FRAME_WIDTH = 128
FRAME_HEIGHT = 384
FRAME_DURATION_MS = 60


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    source_frames = []
    for index in range(SOURCE_FRAME_COUNT):
        left = round(index * source.width / SOURCE_FRAME_COUNT)
        right = round((index + 1) * source.width / SOURCE_FRAME_COUNT)
        frame = source.crop((left, 0, right, source.height))
        frame = frame.resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)
        core = frame.copy()
        core.putalpha(core.getchannel("A").point(lambda value: round(value * .78)))

        # The light belongs to each animation frame, so it stays attached to
        # the bolt instead of appearing as a detached ground-side glow.
        alpha = core.getchannel("A")
        outer_alpha = alpha.filter(ImageFilter.GaussianBlur(18)).point(lambda value: round(value * .32))
        inner_alpha = alpha.filter(ImageFilter.GaussianBlur(6)).point(lambda value: round(value * .38))
        outer_glow = Image.new("RGBA", core.size, (255, 139, 58, 0))
        outer_glow.putalpha(outer_alpha)
        inner_glow = Image.new("RGBA", core.size, (255, 211, 132, 0))
        inner_glow.putalpha(inner_alpha)
        emissive = Image.new("RGBA", core.size, (0, 0, 0, 0))
        emissive.alpha_composite(outer_glow)
        emissive.alpha_composite(inner_glow)
        emissive.alpha_composite(core)
        source_frames.append(emissive)

    atlas = Image.new("RGBA", (FRAME_COUNT * FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
    for index, frame in enumerate(source_frames):
        atlas.paste(frame, (index * 2 * FRAME_WIDTH, 0))
        next_frame = source_frames[(index + 1) % SOURCE_FRAME_COUNT]
        midpoint = Image.blend(frame, next_frame, .5)
        atlas.paste(midpoint, ((index * 2 + 1) * FRAME_WIDTH, 0))

    atlas_path = OUT / "campfire-sky-rays-frames.png"
    atlas.save(atlas_path, optimize=True)
    manifest = {
        "asset": atlas_path.name,
        "source": SOURCE.name,
        "sourceGenerator": "scripts/build-campfire-sky-rays-atlas.py",
        "frameCount": FRAME_COUNT,
        "frameWidth": FRAME_WIDTH,
        "frameHeight": FRAME_HEIGHT,
        "frameDurationMs": FRAME_DURATION_MS,
        "loop": True,
        "sourceFrameCount": SOURCE_FRAME_COUNT,
        "interpolation": "50-percent-crossfade-between-source-frames",
        "emission": {"bakedIntoFrames": True, "coreOpacity": 0.78, "outerGlowBlurPx": 18, "innerGlowBlurPx": 6},
        "anchor": {"x": FRAME_WIDTH // 2, "y": FRAME_HEIGHT},
        "description": "Pixel-art golden lightning bolts with turquoise accents; warm inner and outer emission glows are baked into every animation frame.",
    }
    (OUT / "campfire-sky-rays-frames.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"{atlas_path.relative_to(ROOT)}: {atlas.width}x{atlas.height}, {atlas_path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
