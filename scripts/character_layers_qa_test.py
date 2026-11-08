"""Visual contract checks for isometric costume, item, and effect exports."""

import json
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "game/art/avatar-frames/character-layers-v1"
FACINGS = (
    "south", "southeast", "east", "northeast",
    "north", "northwest", "west", "southwest",
)


class CharacterLayersQaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    def test_every_costume_facing_is_distinct_and_shares_the_ground_pivot(self):
        self.assertEqual(self.manifest["facings"], list(FACINGS))
        pivot = self.manifest["pivot"]
        self.assertEqual((pivot["x"], pivot["y"]), (48, 84))
        for outfit_id, body_variants in self.manifest["outfits"].items():
            for body, outfit in body_variants.items():
                with self.subTest(outfit=outfit_id, body=body):
                    self.assertEqual(list(outfit["framesByFacing"]), list(FACINGS))
                    cells = []
                    for facing in FACINGS:
                        frame_path = ROOT / outfit["framesByFacing"][facing][0]
                        with Image.open(frame_path) as image:
                            image.verify()
                        with Image.open(frame_path) as source:
                            frame = source.convert("RGBA")
                        self.assertEqual(frame.size, (96, 96))
                        bounds = frame.getchannel("A").getbbox()
                        self.assertIsNotNone(bounds, f"{outfit_id}/{body}/{facing} is blank")
                        left, top, right, bottom = bounds
                        self.assertGreater(left, 0, f"{outfit_id}/{body}/{facing} clips at left edge")
                        self.assertLess(right, 96, f"{outfit_id}/{body}/{facing} clips at right edge")
                        self.assertEqual(bottom, pivot["y"], f"{outfit_id}/{body}/{facing} misses ground line")
                        self.assertGreaterEqual(bottom - top, 78)
                        self.assertLessEqual(bottom - top, 82)
                        self.assertLessEqual(abs((left + right) / 2 - pivot["x"]), 0.5)
                        cells.append(frame.tobytes())
                    self.assertEqual(len(set(cells)), 8, f"{outfit_id}/{body} repeats a direction frame")

                    self.assertEqual(outfit["turnaroundPreviewDurationMs"], 120)
                    with Image.open(ROOT / "review-gifs" / f"{outfit_id}-{body}-turnaround.gif") as turnaround:
                        self.assertEqual(turnaround.size, (96, 96))
                        self.assertEqual(turnaround.n_frames, 8)
                        self.assertEqual(turnaround.info.get("duration"), outfit["turnaroundPreviewDurationMs"])

    def test_each_item_has_eight_direction_cells_and_an_item_socket(self):
        for item_id, item in self.manifest["equipment"].items():
            with self.subTest(item=item_id):
                self.assertEqual(list(item["sockets"]), list(FACINGS))
                with Image.open(ROOT / item["atlas"]) as source:
                    atlas = source.convert("RGBA")
                self.assertEqual(atlas.size, (96 * 8, 96))
                cells = [atlas.crop((index * 96, 0, (index + 1) * 96, 96)).tobytes() for index in range(8)]
                self.assertEqual(len(set(cells)), 8)

    def test_effect_gifs_match_loop_or_one_shot_playback_properties(self):
        for effect_id, effect in self.manifest["effects"].items():
            with self.subTest(effect=effect_id):
                self.assertEqual(effect["frameCount"], 8)
                self.assertGreater(effect["frameDurationMs"], 0)
                if effect.get("framesByFacing"):
                    review_gifs = [
                        ROOT / "review-gifs" / "effects" / effect_id / f"{facing}.gif"
                        for facing in FACINGS
                    ]
                else:
                    review_gifs = [ROOT / "review-gifs" / f"{effect_id}.gif"]
                for review_gif in review_gifs:
                    with Image.open(review_gif) as gif:
                        self.assertEqual(gif.n_frames, effect["frameCount"])
                        self.assertEqual(gif.info.get("duration"), effect["frameDurationMs"])
                        if effect["loop"]:
                            self.assertEqual(gif.info.get("loop"), 0)
                        else:
                            self.assertNotIn("loop", gif.info)

    def test_missing_body_actions_are_not_listed_as_completed_clips(self):
        movement = self.manifest["movementClips"]
        implemented = set(movement.get("implementedActions", []))
        missing = set(movement["missingActions"])
        self.assertTrue(implemented)
        self.assertTrue(missing)
        self.assertEqual(movement["status"], "partial")
        self.assertFalse(implemented & missing)
        for profile in movement["profiles"].values():
            self.assertTrue(profile)
            self.assertNotIn("idle", profile)


if __name__ == "__main__":
    unittest.main()
