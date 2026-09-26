"""P1 acceptance (SPEC.md 17.3): boundaries match Appendix B, counts, gzip sizes, ODIS coverage, SHA-256, determinism.

Needs the Census shapefiles in .cache/schoolscape/ (downloaded on first run).
"""

import gzip
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from shapely.geometry import MultiPolygon, Polygon, shape

from analysis.schoolscape import boundaries, config, download


def read_topo(level: str, out_dir: Path = config.OUT_DIR) -> dict:
    return json.loads((out_dir / f"{level}.topo.json").read_text())


def decode(topo: dict, level: str) -> dict[str, MultiPolygon | Polygon]:
    """Geometry id to shapely geometry, decoding the quantized, delta-encoded arcs (TopoJSON spec 2.1.3)."""
    scale, translate = np.array(topo["transform"]["scale"]), np.array(topo["transform"]["translate"])
    arcs = [np.cumsum(np.array(a, dtype=float), axis=0) * scale + translate for a in topo["arcs"]]

    def ring(indexes: list[int]) -> list[tuple[float, float]]:
        points: list[tuple[float, float]] = []
        for i in indexes:
            arc = arcs[i] if i >= 0 else arcs[~i][::-1]
            points.extend(map(tuple, arc[1:] if points else arc))
        return points

    def polygon(rings: list[list[int]]) -> Polygon:
        return Polygon(ring(rings[0]), [ring(r) for r in rings[1:]])

    out = {}
    for g in topo["objects"][level]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        out[g["id"]] = MultiPolygon([polygon(p) for p in polys])
    return out


class CommittedOutputsTest(unittest.TestCase):
    def test_schema_matches_appendix_b(self):
        for level, id_len in (("states", 2), ("counties", 5)):
            topo = read_topo(level)
            self.assertEqual(topo["type"], "Topology")
            self.assertEqual(list(topo["objects"]), [level])
            self.assertEqual(sorted(topo["transform"]), ["scale", "translate"])
            geoms = topo["objects"][level]["geometries"]
            ids = [g["id"] for g in geoms]
            self.assertEqual(ids, sorted(set(ids)))
            for g in geoms:
                self.assertIn(g["type"], ("Polygon", "MultiPolygon"))
                self.assertRegex(g["id"], rf"^\d{{{id_len}}}$")
                self.assertEqual(list(g["properties"]), ["name"])
                self.assertTrue(g["properties"]["name"])

    def test_names(self):
        states = {g["id"]: g["properties"]["name"] for g in read_topo("states")["objects"]["states"]["geometries"]}
        counties = {
            g["id"]: g["properties"]["name"] for g in read_topo("counties")["objects"]["counties"]["geometries"]
        }
        self.assertEqual(states["06"], "California")
        self.assertEqual(states["11"], "District of Columbia")
        self.assertEqual(counties["06037"], "Los Angeles")
        self.assertEqual(counties["35013"], "Doña Ana")
        self.assertEqual(counties["09110"], "Capitol")

    def test_counts_and_kept_territories(self):
        states = [g["id"] for g in read_topo("states")["objects"]["states"]["geometries"]]
        counties = [g["id"] for g in read_topo("counties")["objects"]["counties"]["geometries"]]
        self.assertEqual(len(states), 52)
        self.assertEqual(len(counties), 3222)
        self.assertIn("72", states)
        self.assertIn("11", states)
        for fp in config.EXCLUDED_STATEFP:
            self.assertNotIn(fp, states)
            self.assertFalse(any(c.startswith(fp) for c in counties))
        self.assertEqual({c[:2] for c in counties}, set(states))

    def test_every_odis_county_present(self):
        counties = {g["id"] for g in read_topo("counties")["objects"]["counties"]["geometries"]}
        odis = boundaries.odis_county_ids()
        self.assertEqual(len(odis), 3167)
        self.assertEqual(odis - counties, set())
        self.assertEqual(len(counties - odis), 55)

    def test_gzip_sizes_within_20_percent_of_spec(self):
        for level, expected in (("states", 38_000), ("counties", 309_000)):
            size = len(gzip.compress((config.OUT_DIR / f"{level}.topo.json").read_bytes(), 9))
            self.assertLess(abs(size - expected), 0.2 * expected, f"{level}: {size} bytes gzipped")

    def test_geometries_decode_to_areas_matching_the_source(self):
        for level in ("states", "counties"):
            decoded = decode(read_topo(level), level)
            source = boundaries.load(level).set_index("id").geometry
            for gid, geom in decoded.items():
                src = source[gid]
                self.assertGreater(geom.area, 0, gid)
                # Topology-preserving simplification keeps each area close to its source shape.
                self.assertLess(abs(geom.area - src.area) / src.area, 0.35, gid)
                self.assertTrue(np.allclose(geom.bounds, src.bounds, atol=0.02), gid)

    def test_committed_outputs_are_reproducible(self):
        """What ``check`` does for these files, twice in a row: rebuild into a temporary directory and diff."""
        for _ in range(2):
            with tempfile.TemporaryDirectory() as tmp, mock.patch.object(config, "OUT_DIR", Path(tmp)):
                written = boundaries.build(dry_run=False)
                self.assertEqual([p.name for p in written], ["states.topo.json", "counties.topo.json"])
                for path in written:
                    self.assertEqual(path.parent, Path(tmp))
                    self.assertEqual(path.read_bytes(), (config.OUT_DIR / path.name).read_bytes(), path.name)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(config, "OUT_DIR", Path(tmp)):
            self.assertEqual(boundaries.build(dry_run=True), [])
            self.assertEqual(list(Path(tmp).iterdir()), [])


class HelpersTest(unittest.TestCase):
    def test_centroids(self):
        states, counties = boundaries.centroids("states"), boundaries.centroids("counties")
        self.assertEqual(len(states), 52)
        self.assertEqual(len(counties), 3222)
        self.assertEqual(states["06"], (-119.47235, 37.18609))
        self.assertEqual(states["02"], (-152.43111, 63.76018))
        self.assertTrue(np.allclose(counties["06037"], (-118.2248, 34.32089)))
        for level, cents in (("states", states), ("counties", counties)):
            boxes = boundaries.bboxes(level)
            for gid, (lon, lat) in cents.items():
                minx, miny, maxx, maxy = boxes[gid]
                self.assertTrue(minx <= lon <= maxx and miny <= lat <= maxy, f"{level} {gid}")

    def test_bboxes(self):
        states, counties = boundaries.bboxes("states"), boundaries.bboxes("counties")
        self.assertEqual(len(states), 52)
        self.assertEqual(len(counties), 3222)
        self.assertEqual(states["06"], (-124.40959, 32.53416, -114.13443, 42.00952))
        for boxes in (states, counties):
            for gid, (minx, miny, maxx, maxy) in boxes.items():
                self.assertTrue(-180 <= minx < maxx <= 180 and -90 <= miny < maxy <= 90, gid)
                self.assertLess(maxx - minx, 60, gid)

    def test_alaska_bbox_does_not_wrap_the_antimeridian(self):
        states, counties = boundaries.bboxes("states"), boundaries.bboxes("counties")
        self.assertEqual(states["02"], (-179.14734, 51.21986, -129.97417, 71.35256))
        self.assertEqual(counties["02016"], (-179.14734, 51.21986, -166.09415, 57.22966))


class DropCollapsedRingsTest(unittest.TestCase):
    def test_drops_collapsed_rings_and_reindexes_arcs(self):
        square = [[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]]
        sliver = [[5, 5], [1, 0], [-1, 0]]  # two distinct points: collapsed
        triangle = [[2, 2], [2, 0], [0, 2], [-2, -2]]
        data = {
            "arcs": [sliver, square, triangle],
            "objects": {"x": {"geometries": [
                {"id": "a", "type": "MultiPolygon", "arcs": [[[0]], [[1], [~2]]]},  # sliver part, square with hole
                {"id": "b", "type": "Polygon", "arcs": [[2], [~0]]},  # triangle with a collapsed hole
            ]}},
        }
        boundaries.drop_collapsed_rings(data, "x")
        self.assertEqual(data["arcs"], [square, triangle])
        a, b = data["objects"]["x"]["geometries"]
        self.assertEqual((a["type"], a["arcs"]), ("Polygon", [[0], [~1]]))
        self.assertEqual((b["type"], b["arcs"]), ("Polygon", [[1]]))

    def test_fails_when_a_geometry_collapses_entirely(self):
        data = {"arcs": [[[0, 0], [1, 0], [-1, 0]]],
                "objects": {"x": {"geometries": [{"id": "a", "type": "Polygon", "arcs": [[0]]}]}}}
        with self.assertRaises(SystemExit):
            boundaries.drop_collapsed_rings(data, "x")


class DownloadVerificationTest(unittest.TestCase):
    def test_inputs_are_verified_by_sha256(self):
        for key in ("states_5m", "counties_5m"):
            path = download.fetch(key)
            self.assertEqual(download.sha256(path), config.DOWNLOADS[key]["sha256"])

    def test_hash_mismatch_fails_loudly(self):
        tampered = {**config.DOWNLOADS, "states_5m": {**config.DOWNLOADS["states_5m"], "sha256": "0" * 64}}
        with mock.patch.object(config, "DOWNLOADS", tampered), self.assertRaises(SystemExit) as ctx:
            download.fetch("states_5m")
        self.assertIn("SHA-256 mismatch", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
