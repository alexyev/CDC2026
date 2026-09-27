# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import json
import math
import unittest

import pandas as pd

from analysis.schoolscape import config, fixtures, presets


def project(camera: dict, lon: float, lat: float) -> tuple[float, float]:
    """Screen pixel of (lon, lat) in the design viewport for a camera."""
    world = presets.TILE_SIZE * 2 ** camera["zoom"]
    cx, cy = presets.mercator(camera["lon"], camera["lat"])
    x, y = presets.mercator(lon, lat)
    return presets.VIEWPORT[0] / 2 + (x - cx) * world, presets.VIEWPORT[1] / 2 + (y - cy) * world


class FitTest(unittest.TestCase):
    def assert_inside_padding(self, camera, bbox, tight=True):
        left, top = project(camera, bbox[0], bbox[3])
        right, bottom = project(camera, bbox[2], bbox[1])
        pad, (w, h) = presets.MAP_PADDING, presets.VIEWPORT
        eps = 1e-6
        self.assertGreaterEqual(left, pad["left"] - eps)
        self.assertGreaterEqual(top, pad["top"] - eps)
        self.assertLessEqual(right, w - pad["right"] + eps)
        self.assertLessEqual(bottom, h - pad["bottom"] + eps)
        if tight:  # one axis fills the padded area exactly
            self.assertTrue(math.isclose(left, pad["left"]) or math.isclose(top, pad["top"]))

    def test_fitted_bbox_fills_the_padded_area(self):
        for bbox in ([-118.84, 33.71, -117.72, 34.71], [-10, -5, 30, 40], [-125, 24, -66.5, 49.5]):
            self.assert_inside_padding(presets.fit(bbox), bbox)

    def test_min_zoom_keeps_the_bbox_centered_in_the_padded_area(self):
        bbox = [-120, 33, -117, 35]
        camera = presets.fit(bbox, min_zoom=9)
        self.assertEqual(camera["zoom"], 9)
        x0, y1 = presets.mercator(-120, 33)
        x1, y0 = presets.mercator(-117, 35)
        x, y = project(camera, *presets.unmercator((x0 + x1) / 2, (y0 + y1) / 2))
        self.assertAlmostEqual(x, 680)  # 332 + (1440 - 332 - 412) / 2
        self.assertAlmostEqual(y, 438)  # 72 + (900 - 72 - 96) / 2

    def test_mercator_round_trip(self):
        lon, lat = presets.unmercator(*presets.mercator(-118.25, 34.05))
        self.assertAlmostEqual(lon, -118.25)
        self.assertAlmostEqual(lat, 34.05)

    def test_camera_param_matches_the_url_codec(self):
        self.assertEqual(presets.camera_param({"zoom": 9.0, "lat": 34.0512, "lon": -118.2437}), "9/34.05/-118.24")
        self.assertEqual(presets.camera_param(presets.NATION_CAMERA), "3.6/38.5/-96.5")

    def test_padding_raises_the_fitted_bbox_above_the_story_card(self):
        bbox = [-123.02, 32.53, -116.08, 38.32]
        camera = presets.fit(bbox, padding=presets.STORY_PADDING)
        _, bottom = project(camera, bbox[0], bbox[1])
        self.assertLessEqual(bottom, presets.VIEWPORT[1] - presets.STORY_PADDING["bottom"] + 1e-6)


class FormatTest(unittest.TestCase):
    def test_rho_uses_a_true_minus_sign(self):
        self.assertEqual(presets.rho(-0.5149), "\u22120.51")
        self.assertEqual(presets.rho(0.6942), "0.69")

    def test_share_points_and_ordinal(self):
        self.assertEqual(presets.share(0.4506), "45%")
        self.assertEqual(presets.points(-4.6624), "4.7")
        self.assertEqual([presets.ordinal(v) for v in (92.24, 13.78, 1, 2, 3, 11, 22)],
                         ["92nd", "14th", "1st", "2nd", "3rd", "11th", "22nd"])

    def test_one_requires_exactly_one_row(self):
        frame = pd.DataFrame({"a": [1, 1, 2], "b": ["x", "y", "x"]})
        self.assertEqual(presets.one(frame, a=1, b="y")["b"], "y")
        with self.assertRaises(SystemExit):
            presets.one(frame, a=1)


class FindingsTest(unittest.TestCase):
    """The narrations quote the committed analyses (visualizations/README.md sections 03-05)."""

    @classmethod
    def setUpClass(cls):
        cls.f = presets.findings(fixtures.read_csv())

    def test_numbers_match_the_analysis_write_ups(self):
        expected = {
            "schools": "23,595", "national_median": "28", "south_median": "33", "south_wins": "77%",
            "region_share": "28%", "county_share": "45%",
            "broadband_rho": "0.69", "broadband_n": "23,404", "broadband_coef": "5.5", "other_predictors": "10",
            "edhealth_ca": "0.65", "edhealth_ne": "0.59", "edhealth_south": "0.29",
            "pairs_differ": "8", "pairs_total": "10",
            "housing_low": "0.05", "housing_high": "0.27", "west_affordability": "\u22120.51", "south_housing": "0.08",
            "health_midwest": "4.7", "health_northeast": "1.3", "health_low": "3.4", "health_high": "7.4",
            "crime_share": "45%", "moved": "52%", "oneida_odis": "92nd", "oneida_regional": "14th",
            "midwest_infant": "0.68", "midwest_violent": "0.60", "south_single_parent": "0.55",
            "south_broadband": "0.49",
        }
        self.assertEqual(self.f, expected)


@unittest.skipUnless(presets.out_path().exists(), "presets.json not built")
class CommittedOutputTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.presets = json.loads(presets.out_path().read_text())["presets"]
        cls.layers = {layer["id"]: layer for layer in fixtures.read_catalog()}

    def test_the_six_stories_of_section_3_8_in_story_order(self):
        self.assertEqual(
            [(p["id"], p["chapter"], p["view"]["l"]) for p in self.presets],
            [("where-stress-concentrates", "The map", "composite"),
             ("broadband-attainment", "Nationally", "broadband,college_2yr_plus"),
             ("education-health-by-region", "Region by region", "education,health"),
             ("west-housing", "Region by region", "affordability,economic"),
             ("one-formula", "Graduation rates", "composite,vacancy"),
             ("where-to-look", "So what", "health")],
        )

    def test_narrations_are_short_and_carry_a_caveat(self):
        for p in self.presets:
            sentences = [s for s in p["narration"].split(". ") if s]
            self.assertTrue(2 <= len(sentences) <= 4, p["id"])
            self.assertLessEqual(len(p["narration"]), 420, p["id"])
            self.assertTrue(p["caveat"].endswith("."), p["id"])
            self.assertNotIn("\u2014", p["narration"] + p["caveat"])

    def test_places_and_levels(self):
        by_id = {p["id"]: p["view"] for p in self.presets}
        for pid in ("where-stress-concentrates", "broadband-attainment", "where-to-look"):
            self.assertEqual(by_id[pid]["v"], "3.6/38.5/-96.5")
        zoom = {pid: float(view["v"].split("/")[0]) for pid, view in by_id.items()}
        self.assertEqual(by_id["education-health-by-region"]["cmp"], "state:06,state:12")
        self.assertLess(zoom["education-health-by-region"], config.STATE_LEVEL_ZOOM)
        self.assertEqual(by_id["west-housing"]["sel"], "state:06")
        self.assertEqual(by_id["one-formula"]["sel"], "county:55085")
        for pid in ("west-housing", "one-formula"):
            # Counties at full opacity: past the state-to-county crossfade, short of school pins.
            self.assertTrue(5.5 <= zoom[pid] < config.LOCAL_LEVEL_ZOOM, pid)

    def test_layers_exist_and_are_not_context(self):
        for p in self.presets:
            for layer_id in p["view"]["l"].split(","):
                self.assertIn(layer_id, self.layers)
                self.assertNotEqual(self.layers[layer_id]["group"], "context")

    def test_view_uses_only_url_parameters(self):
        for p in self.presets:
            self.assertLessEqual(set(p["view"]), {"v", "l", "d", "sel", "cmp", "s"})


if __name__ == "__main__":
    unittest.main()
