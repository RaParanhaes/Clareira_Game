#!/usr/bin/env python3
"""Render the generated login-scene stills into a seamless 30-second MP4 loop."""

from io import BytesIO
from pathlib import Path
import subprocess

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FRAME_DIR = ROOT / "art-source/login-scene/frames-v4"
OUTPUT = ROOT / "game/art/clareira-login-loop-v4.mp4"
FPS = 30
FRAMES_PER_STATE = 18
LOOPS = 10


def smoothstep(value: float) -> float:
    value = min(1.0, max(0.0, value))
    return value * value * (3.0 - 2.0 * value)


def main() -> None:
    source_paths = [ROOT / "game/art/clareira-login-vila-v2.webp"] + [
        FRAME_DIR / f"frame-{number:02}.webp" for number in range(2, 6)
    ]
    images = [Image.open(path).convert("RGB") for path in source_paths]
    expected_size = images[0].size
    if any(image.size != expected_size for image in images):
        raise SystemExit("Login animation frames must all have the original image dimensions")

    # The generator makes subtle whole-image redraws even when only the fire is
    # requested to move. Keep the poster pixel-locked and admit only warm flame
    # and firelit-cobblestone pixels from each generated frame.
    base = images[0]
    localized = [base]
    for generated in images[1:]:
        mask = Image.new("L", expected_size, 0)
        left, top, right, bottom = 1008, 574, 1110, 695
        for y in range(top, bottom):
            for x in range(left, right):
                red, green, blue = generated.getpixel((x, y))
                flame = red > 175 and green > 65 and blue < 155 and red > green * 1.08 and green > blue * 1.2
                ember = red > 220 and green > 155 and blue < 190 and red >= green and green > blue
                if flame or ember:
                    mask.putpixel((x, y), 230)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=1.5))
        localized.append(Image.composite(generated, base, mask))
    for image in images[1:]:
        image.close()
    images = localized

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "image2pipe", "-framerate", str(FPS), "-vcodec", "mjpeg", "-i", "pipe:0",
        "-an", "-vf", "scale=1280:720:flags=lanczos",
        "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-r", str(FPS), str(OUTPUT),
    ]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert encoder.stdin is not None
        for _ in range(LOOPS):
            for index, current in enumerate(images):
                following = images[(index + 1) % len(images)]
                transition_start = FRAMES_PER_STATE // 2
                for frame in range(FRAMES_PER_STATE):
                    if frame < transition_start:
                        rendered = current
                    else:
                        progress = (frame - transition_start + 1) / (FRAMES_PER_STATE - transition_start)
                        rendered = Image.blend(current, following, smoothstep(progress))
                    buffer = BytesIO()
                    rendered.save(buffer, format="JPEG", quality=93, subsampling=0)
                    encoder.stdin.write(buffer.getvalue())
        encoder.stdin.close()
        error = encoder.stderr.read().decode("utf-8", "replace") if encoder.stderr else ""
        status = encoder.wait()
        if status:
            raise RuntimeError(f"ffmpeg exited with status {status}: {error}")
    finally:
        for image in images:
            image.close()
        if encoder.poll() is None:
            encoder.kill()
    total_frames = LOOPS * len(images) * FRAMES_PER_STATE
    print(f"Rendered {OUTPUT} ({total_frames} frames, {total_frames / FPS:g}s)")


if __name__ == "__main__":
    main()
