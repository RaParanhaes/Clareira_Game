#!/usr/bin/env python3
"""Prepare the selected, licensed campfire field recording for the game."""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "game/art/audio/source/campfire-ambient-x-660300-hq-preview-first-182s.mp3"
OUTPUT = ROOT / "game/art/audio/campfire-soft-loop.mp3"
SAMPLE_RATE = 48_000
SOURCE_START_SECONDS = 25.0
SOURCE_SEGMENT_SECONDS = 90.0
FADE_SECONDS = 0.32
PEAK_CEILING_DBFS = -2.5


def decode_float_mono(path: Path, start: float, duration: float, filters: str | None = None) -> np.ndarray:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
               "-ss", str(start), "-t", str(duration)]
    if filters:
        command.extend(["-af", filters])
    command.extend(["-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1",
                    "-ar", str(SAMPLE_RATE), "pipe:1"])
    payload = subprocess.run(command, check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(payload, dtype="<f4").copy()


def prepare_loop() -> np.ndarray:
    # Keep the selected recording natural: only remove subsonic rumble, trim a
    # calm 90-second section, crossfade the seam, and apply uniform peak headroom.
    segment = decode_float_mono(
        SOURCE,
        SOURCE_START_SECONDS,
        SOURCE_SEGMENT_SECONDS,
        "highpass=f=35",
    )
    expected_samples = round(SOURCE_SEGMENT_SECONDS * SAMPLE_RATE)
    if len(segment) < expected_samples * .995:
        raise ValueError(f"Trecho curto: {len(segment) / SAMPLE_RATE:.2f} s decodificados.")
    segment = segment[:expected_samples]

    overlap = round(FADE_SECONDS * SAMPLE_RATE)
    fade = np.linspace(0, math.pi / 2, overlap, endpoint=False)
    seam = segment[-overlap:] * np.cos(fade) + segment[:overlap] * np.sin(fade)
    loop = np.concatenate((seam, segment[overlap:-overlap])).astype(np.float32)

    peak = float(np.max(np.abs(loop)))
    ceiling = 10 ** (PEAK_CEILING_DBFS / 20)
    if peak > ceiling:
        loop *= ceiling / peak
    return loop


def encode_mp3(signal: np.ndarray, output: Path) -> None:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
               "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
               "-codec:a", "libmp3lame", "-b:a", "128k", "-ar", str(SAMPLE_RATE),
               "-ac", "1", str(output)]
    subprocess.run(command, input=signal.tobytes(), check=True)


def measure_asset(path: Path) -> dict:
    decoded = decode_float_mono(path, 0, 120)
    peak = float(np.max(np.abs(decoded)))
    rms = float(np.sqrt(np.mean(decoded * decoded)))
    window = round(.05 * SAMPLE_RATE)
    frames = decoded[:len(decoded) // window * window].reshape(-1, window)
    levels = np.sqrt(np.mean(frames * frames, axis=1))
    steps = np.abs(np.diff(decoded))
    seam_step = float(abs(decoded[0] - decoded[-1]))
    ordinary_step = float(np.percentile(steps, 95))
    frequency = np.fft.rfftfreq(len(decoded), 1 / SAMPLE_RATE)
    power = np.abs(np.fft.rfft(decoded)) ** 2
    bands = {}
    for label, lower, upper in (("20-150 Hz", 20, 150), ("150-600 Hz", 150, 600),
                                ("600-2 kHz", 600, 2_000), ("2-8 kHz", 2_000, 8_000),
                                ("8-20 kHz", 8_000, 20_000)):
        fraction = float(power[(frequency >= lower) & (frequency < upper)].sum() / power.sum())
        bands[label] = round(10 * math.log10(max(fraction, 1e-15)), 2)

    return {
        "measurement_source": "decoded final MP3 at 48 kHz",
        "duration_seconds": round(len(decoded) / SAMPLE_RATE, 3),
        "peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 2),
        "rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 2),
        "crest_factor_db": round(20 * math.log10(max(peak / rms, 1e-12)), 2),
        "50ms_loudness_range_db": round(20 * math.log10(max(levels) / max(min(levels), 1e-12)), 2),
        "loop_edge_step": round(seam_step, 6),
        "95th_percentile_sample_step": round(ordinary_step, 6),
        "loop_edge_step_vs_95th_percentile": round(seam_step / max(ordinary_step, 1e-12), 3),
        "band_energy_db_relative": bands,
        "checks": {
            "no_clipping": peak < 1,
            "at_least_2_5db_peak_headroom": peak <= 10 ** (-2.5 / 20),
            "loop_seam_below_natural_transients": seam_step < ordinary_step,
        },
    }


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Gravação licenciada não encontrada: {SOURCE}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    encode_mp3(prepare_loop(), OUTPUT)
    report = {
        "asset": str(OUTPUT.relative_to(ROOT)),
        "source_file": str(SOURCE.relative_to(ROOT)),
        "source": {
            "title": "campfire deer camp 21 minutes - wind - snow - sleet - part 5",
            "creator": "Ambient-X",
            "freesound_id": 660300,
            "url": "https://freesound.org/people/Ambient-X/sounds/660300/",
            "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "attribution": "Ambient-X, ‘campfire deer camp 21 minutes - wind - snow - sleet - part 5’, via Freesound, CC BY 4.0.",
            "recording": "Field recording at a real campfire. The Freesound HQ preview is retained as a byte-range source excerpt.",
        },
        "excerpt": {
            "source_start_seconds": SOURCE_START_SECONDS,
            "source_duration_seconds": SOURCE_SEGMENT_SECONDS,
            "selection_reason": "Calm fire section before the wind-gust events noted by the uploader.",
        },
        "game_playback": {
            "source_gain": 2.5,
            "bus_gain": 0.9,
            "nearby_gain_change_db_vs_previous": 1.12,
            "presence_eq_frequency_hz": 2200,
            "presence_eq_gain_db": 2.5,
            "panning_model": "HRTF",
            "distance_model": "inverse",
            "reference_distance_world_units": 2,
            "rolloff_factor": 0.72,
            "audible_radius_world_units": 32,
            "distance_fade_start_world_units": 25.6,
            "source_keepalive_radius_world_units": 40,
            "maximum_distance_world_units": 40,
            "peak_protection": {
                "type": "Web Audio DynamicsCompressorNode",
                "threshold_db": -16,
                "knee_db": 12,
                "ratio": 2.5,
                "attack_seconds": 0.012,
                "release_seconds": 0.28,
            },
        },
        "processing": [
            "HQ MP3 preview decoded to mono at 48 kHz for point-source 3D panning",
            "35 Hz high-pass to remove subsonic recording rumble",
            "90-second excerpt, from 00:25 to 01:55 of the source recording",
            f"{round(FADE_SECONDS * 1000)} ms equal-power loop crossfade",
            f"uniform gain only as needed to keep decoded peak at or below {PEAK_CEILING_DBFS} dBFS",
            "no compressor or loudness normalization in the asset build",
            "MP3 128 kbps mono",
        ],
        **measure_asset(OUTPUT),
    }
    (OUTPUT.parent / "campfire-soft-loop.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
