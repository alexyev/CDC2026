# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import json
import unittest
from collections import Counter

import pandas as pd

from analysis.schoolscape import config, fixtures, gazetteer


def schools(rows):
    return pd.DataFrame(rows, columns=["State", "FIPS County Code", "County", "City", "School District", "LAT", "LON"])


STATES = pd.DataFrame({"STATEFP": ["17", "02", "25"], "STUSPS": ["IL", "AK", "MA"],
                       "NAME": ["Illinois", "Alaska", "Massachusetts"]})
STATE_BBOXES = {"17": (-91.5, 37, -87.5, 42.5), "02": (-179.2, 51, -130, 71.4), "25": (-73.5, 41.2, -69.9, 42.9)}
COUNTY_BBOXES = {"25013": (-73.1, 41.9, -72.1, 42.2), "17167": (-89.99, 39.5, -89.2, 40.0),
                 "17031": (-88.3, 41.4, -87.5, 42.2)}
SCHOOLS = schools([
    ["IL", "17167", "Sangamon County", "Springfield", "Springfield Sd 186", 39.80, -89.65],
    ["IL", "17167", "Sangamon County", "Springfield", "Springfield Sd 186", 39.72, -89.61],
    ["MA", "25013", "Hampden County", "Springfield", "Springfield", 42.10, -72.58],
    ["IL", "17031", "Cook County", "Chicago", "City of Chicago  Sd 299", 41.88, -87.63],
])


def build_entries(frame=SCHOOLS):
    return gazetteer.entries(frame, STATES, STATE_BBOXES, COUNTY_BBOXES)


class EntriesTest(unittest.TestCase):
    def setUp(self):
        self.entries = build_entries()

    def test_order_and_ids(self):
        self.assertEqual(
            [(e["k"], e["id"]) for e in self.entries],
            [("state", "17"), ("state", "25"), ("county", "17031"), ("county", "17167"), ("county", "25013"),
             ("city", "IL:Chicago"), ("city", "IL:Springfield"), ("city", "MA:Springfield"),
             ("district", "IL:City of Chicago  Sd 299"), ("district", "IL:Springfield Sd 186"),
             ("district", "MA:Springfield")],
        )

    def test_only_places_with_schools(self):
        self.assertNotIn("02", [e["id"] for e in self.entries])

    def test_names_and_states(self):
        by_id = {(e["k"], e["id"]): e for e in self.entries}
        self.assertEqual(by_id["state", "17"]["n"], "Illinois")
        self.assertEqual(by_id["state", "17"]["st"], "IL")
        self.assertEqual(by_id["county", "25013"]["n"], "Hampden County")
        self.assertEqual(by_id["county", "25013"]["st"], "MA")
        # City and district names are kept exactly as in the CSV so the app can match them in schools/all.json.
        self.assertEqual(by_id["district", "IL:City of Chicago  Sd 299"]["n"], "City of Chicago  Sd 299")

    def test_polygon_and_school_bboxes(self):
        by_id = {(e["k"], e["id"]): e["bb"] for e in self.entries}
        self.assertEqual(by_id["state", "25"], [-73.5, 41.2, -69.9, 42.9])
        self.assertEqual(by_id["county", "17167"], [-89.99, 39.5, -89.2, 40.0])
        self.assertEqual(by_id["city", "IL:Springfield"], [-89.65, 39.72, -89.61, 39.8])
        # One school: a zero-size bbox at the school.
        self.assertEqual(by_id["city", "MA:Springfield"], [-72.58, 42.1, -72.58, 42.1])

    def test_missing_county_polygon_fails(self):
        extra = pd.concat([SCHOOLS, schools([["IL", "17999", "Nowhere County", "Nowhere", "Nowhere", 40.0, -89.0]])])
        with self.assertRaisesRegex(SystemExit, "17999"):
            build_entries(extra)

    def test_county_state_comes_from_its_geoid(self):
        # A school whose CSV State differs from its county's state (Navajo Mountain High: AZ, San Juan County UT).
        stray = schools([["MA", "17031", "Cook County", "Chicago", "Chicago", 41.9, -87.6]])
        by_id = {(e["k"], e["id"]): e for e in build_entries(pd.concat([SCHOOLS, stray]))}
        self.assertEqual(by_id["county", "17031"]["st"], "IL")
        self.assertEqual(by_id["city", "MA:Chicago"]["st"], "MA")

    def test_county_with_two_names_fails(self):
        stray = schools([["IL", "17031", "Kook County", "Chicago", "Chicago", 41.9, -87.6]])
        with self.assertRaisesRegex(SystemExit, "two names"):
            build_entries(pd.concat([SCHOOLS, stray]))


@unittest.skipUnless(gazetteer.out_path().exists(), "gazetteer.json not built")
class CommittedOutputTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = json.loads(gazetteer.out_path().read_text())["entries"]
        cls.df = fixtures.read_csv()

    def test_counts(self):
        # SPEC.md 17.3 counts cities and districts by name nationally (8,242 and 11,876); the gazetteer keys them by
        # state so same-named places in different states stay apart.
        counts = Counter(e["k"] for e in self.entries)
        self.assertEqual(counts["state"], 52)
        self.assertEqual(counts["county"], 3167)
        self.assertEqual(counts["city"], self.df.groupby(["State", "City"]).ngroups)
        self.assertEqual(counts["city"], 11835)
        self.assertEqual(counts["district"], 12129)

    def test_ids_are_unique_and_match_the_csv(self):
        self.assertEqual(len({(e["k"], e["id"]) for e in self.entries}), len(self.entries))
        ids = {k: {e["id"] for e in self.entries if e["k"] == k} for k in ("county", "city", "district")}
        self.assertEqual(ids["county"], set(self.df["FIPS County Code"]))
        self.assertEqual(ids["city"], set(self.df["State"] + ":" + self.df["City"]))
        self.assertEqual(ids["district"], set(self.df["State"] + ":" + self.df["School District"]))

    def test_state_codes(self):
        states = {e["id"]: e["st"] for e in self.entries if e["k"] == "state"}
        self.assertEqual(set(states.values()), set(self.df["State"]))
        for e in self.entries:
            if e["k"] == "county":
                self.assertEqual(e["st"], states[e["id"][:2]])
            if e["k"] in ("city", "district"):
                self.assertTrue(e["id"].startswith(e["st"] + ":"))

    def test_bboxes_are_well_formed(self):
        for e in self.entries:
            w, s, east, n = e["bb"]
            self.assertTrue(-180 <= w <= east <= 180 and -90 < s <= n < 90 and east - w < 90, e)
            for v in e["bb"]:
                self.assertEqual(round(v, config.COORD_DECIMALS), v)

    def test_known_places(self):
        by_id = {(e["k"], e["id"]): e for e in self.entries}
        self.assertEqual(by_id["county", "06037"]["n"], "Los Angeles County")
        self.assertEqual(by_id["county", "09110"]["n"], "Capitol Planning Region")
        # Alaska's bbox does not wrap the antimeridian (boundaries.bboxes).
        self.assertGreater(by_id["state", "02"]["bb"][0], -180)
        springfields = sorted(e["st"] for e in self.entries if e["k"] == "city" and e["n"] == "Springfield")
        for st in ("IL", "MA", "MO"):
            self.assertIn(st, springfields)


@unittest.skipUnless((config.CACHE_DIR / "EDGE_GEOCODE_PUBLICSCH_2223.zip").exists(), "NCES geocodes not downloaded")
class RebuildTest(unittest.TestCase):
    def test_school_bboxes_contain_their_schools(self):
        df = fixtures.read_csv().merge(gazetteer.school_coordinates(), on="NCESSCH")
        entries = {(e["k"], e["id"]): e["bb"] for e in json.loads(gazetteer.out_path().read_text())["entries"]}
        for kind, col in gazetteer.PLACE_COLUMNS.items():
            ids = df["State"] + ":" + df[col]
            for place, lon, lat in zip(ids, df.LON, df.LAT):
                w, s, e, n = entries[kind, place]
                self.assertTrue(w <= lon <= e and s <= lat <= n, (place, lon, lat))


if __name__ == "__main__":
    unittest.main()
