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


class NoteTest(unittest.TestCase):
    def test_spearman_by_level_uses_unrounded_means_and_pairwise_deletion(self):
        df = pd.DataFrame({
            "State": ["A", "A", "B", "B", "C", "C"],
            "FIPS County Code": ["1", "1", "2", "3", "4", "4"],
            "x": [1.0, 2.0, 3.0, None, 5.0, 6.0],
            "y": [1.0, 1.0, 2.0, 2.5, 3.0, 4.0],
        })
        rho = presets.spearman_by_level(df, "x", "y")
        self.assertAlmostEqual(rho["schools"], df["x"].corr(df["y"], method="spearman"))
        self.assertAlmostEqual(rho["states"], 1.0)
        self.assertAlmostEqual(rho["counties"], 1.0)

    def test_scale_note_format(self):
        note = presets.scale_note({"states": 0.1661, "counties": 0.3966, "schools": 0.2419})
        self.assertEqual(note, "ρ = 0.17 across states, 0.40 across counties, 0.24 across schools")


class DataTest(unittest.TestCase):
    def test_crime_education_reproduces_appendix_c(self):
        rho = presets.spearman_by_level(fixtures.read_csv(), "Crime", "Education")
        self.assertAlmostEqual(rho["states"], 0.1661, places=4)
        self.assertAlmostEqual(rho["counties"], 0.3966, places=4)
        self.assertAlmostEqual(rho["schools"], 0.2419, places=4)


@unittest.skipUnless(presets.out_path().exists(), "presets.json not built")
class CommittedOutputTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.presets = json.loads(presets.out_path().read_text())["presets"]
        cls.layers = {layer["id"]: layer for layer in fixtures.read_catalog()}

    def test_the_five_presets_of_section_3_8(self):
        self.assertEqual(
            [(p["id"], p["label"], p["view"]["l"]) for p in self.presets],
            [("stress-usa", "Where stress concentrates", "composite"),
             ("economic-education", "Economic and education travel together", "economic,education"),
             ("crime-scale", "Same pair, three answers", "crime,education"),
             ("la-education", "Los Angeles by neighborhood", "education"),
             ("california-north-south", "North vs south California", "housing,economic")],
        )

    def test_crime_scale_note(self):
        note = next(p["note"] for p in self.presets if p["id"] == "crime-scale")
        self.assertEqual(note, "ρ = 0.17 across states, 0.40 across counties, 0.24 across schools")

    def test_places_and_levels(self):
        by_id = {p["id"]: p["view"] for p in self.presets}
        for pid in ("stress-usa", "economic-education", "crime-scale"):
            self.assertEqual(by_id[pid]["v"], "3.6/38.5/-96.5")
        zoom = {pid: float(view["v"].split("/")[0]) for pid, view in by_id.items()}
        self.assertEqual(by_id["la-education"]["sel"], "county:06037")
        self.assertGreaterEqual(zoom["la-education"], config.LOCAL_LEVEL_ZOOM)
        self.assertEqual(by_id["california-north-south"]["cmp"], "county:06075,county:06037")
        self.assertTrue(config.STATE_LEVEL_ZOOM <= zoom["california-north-south"] < config.LOCAL_LEVEL_ZOOM)

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
