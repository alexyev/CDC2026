# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""P2 tests: unit tests on small frames, acceptance checks on the committed outputs, and a determinism check.

Run from the repo root: ``python -m unittest discover -s analysis/schoolscape/tests -t .``.
"""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import MultiPolygon, box

from analysis.schoolscape import __main__ as cli
from analysis.schoolscape import aggregates, config, report, schools

OUT = config.OUT_DIR

SCORE = {"id": "composite", "column": "Composite Score", "pctColumn": "Composite Score Percentile Rank", "unit": "score"}
GINI = {"id": "gini", "column": "Gini index", "unit": "gini"}
CRIME = {"id": "crime", "column": "Crime", "unit": "score"}


def load(name: str):
    return json.loads((OUT / name).read_text())


def inputs_cached() -> bool:
    return all((config.CACHE_DIR / spec["url"].rsplit("/", 1)[-1]).exists()
               for key, spec in config.DOWNLOADS.items() if key != "counties_500k")


def school_rows() -> pd.DataFrame:
    return pd.DataFrame({
        "NCESSCH": ["000000000002", "000000000001", "000000000003"],
        "Name": ["B High", "A High", "C High"],
        "School District": ["D1", "D1", "D2"],
        "State": ["AL", "AL", "CT"],
        "FIPS County Code": ["01001", "01001", "09110"],
        "County": ["Autauga County", "Autauga County", "Capitol"],
        "City": ["X", "X", "Y"],
        "Zip Code": ["01234", "01234", "06101"],
        "SAB Available": [1, 0, 1],
        "Composite Score": [30.0, 20.0, np.nan],
        "Composite Score Percentile Rank": [60.0, 40.0, np.nan],
        "Gini index": [0.456, 0.456, 0.5],
        "Crime": [np.nan, np.nan, np.nan],
        "ct_fill_sources": [np.nan, "", "recomputed=Composite Score"],
    })


class JoinTest(unittest.TestCase):
    def test_join_pads_ids_sorts_rows_and_reports_disagreements(self):
        df = school_rows()
        geo = pd.DataFrame({"NCESSCH": ["1", "000000000002"], "CNTY": ["01001", "01003"],
                            "LAT": [32.5, 32.6], "LON": [-86.5, -86.6]})
        geo["NCESSCH"] = geo["NCESSCH"].str.zfill(12)
        j = schools.join(df, geo, {"AL": "01", "CT": "09"})
        self.assertEqual(list(j.frame["NCESSCH"]), ["000000000001", "000000000002", "000000000003"])
        self.assertEqual(j.unmatched, ["000000000003"])
        self.assertEqual(j.county_disagreements, [("000000000002", "01001", "01003")])
        self.assertEqual(j.state_disagreements, [])
        self.assertEqual(list(j.frame["STATEFP"]), ["01", "01", "09"])

    def test_state_disagreement_keeps_the_odis_state(self):
        df = school_rows().iloc[:1].assign(State="AZ")
        geo = pd.DataFrame({"NCESSCH": ["000000000002"], "CNTY": ["01001"], "LAT": [1.0], "LON": [2.0]})
        j = schools.join(df, geo, {"AZ": "04"})
        self.assertEqual(j.state_disagreements, [("000000000002", "04", "01")])
        self.assertEqual(j.frame["STATEFP"].iloc[0], "04")

    def test_unknown_state_fails_loudly(self):
        geo = pd.DataFrame({"NCESSCH": [], "CNTY": [], "LAT": [], "LON": []})
        with self.assertRaises(SystemExit):
            schools.join(school_rows(), geo, {"AL": "01"})


class SchoolsFileTest(unittest.TestCase):
    def test_columns_rounding_nulls_and_flags(self):
        frame = school_rows().assign(STATEFP=["01", "01", "09"], LAT=[32.123456, 33.0, 41.7], LON=[-86.1, -86.2, -72.7])
        out = schools.schools_file(frame, (SCORE, GINI, CRIME))
        self.assertEqual(out["values"]["composite"], [30, 20, None])
        self.assertIsInstance(out["values"]["composite"][0], int)
        self.assertEqual(out["values"]["composite_pct"], [60, 40, None])
        self.assertEqual(out["values"]["gini"], [0.46, 0.46, 0.5])
        self.assertEqual(out["values"]["crime"], [None, None, None])
        self.assertNotIn("gini_pct", out["values"])
        self.assertEqual(out["flags"], [0, 0, config.FLAG_CT_FILLED])
        self.assertEqual(out["lat"][0], 32.12346)
        self.assertEqual(out["zip"], ["01234", "01234", "06101"])
        self.assertEqual(out["sab"], [1, 0, 1])

    def test_num(self):
        self.assertIsNone(schools.num(float("nan"), 1))
        self.assertIsNone(schools.num(None, 0))
        self.assertEqual(schools.num(27.25, 1), 27.2)
        self.assertEqual(schools.num(np.float64(3.6), 0), 4)


class AggregateTest(unittest.TestCase):
    frame = pd.DataFrame({
        "STATEFP": ["01", "01", "01", "02"],
        "FIPS County Code": ["01001", "01001", "01003", "02013"],
        "Composite Score": [20.0, 31.0, 40.0, np.nan],
        "Gini index": [0.41, 0.41, 0.5, 0.45],
    })

    def test_measures_are_unweighted_means_with_counts_and_nulls(self):
        m = aggregates.measures(self.frame, "FIPS County Code", ["01001", "01003", "02013", "02016"], (SCORE, GINI))
        self.assertEqual(m["composite"]["mean"], [25.5, 40.0, None, None])
        self.assertEqual(m["composite"]["median"], [25.5, 40.0, None, None])
        self.assertEqual(m["composite"]["n"], [2, 1, 0, 0])
        self.assertEqual(m["gini"]["mean"], [0.41, 0.5, 0.45, None])

    def test_breaks_use_linear_quantiles_of_unrounded_unit_means(self):
        b = aggregates.breaks(self.frame, (SCORE,))["composite"]
        self.assertEqual(b["local"]["quint"], [schools.num(np.quantile([20, 31, 40], q), 1) for q in config.QUINTILES])
        self.assertEqual(b["state"]["terc"], [schools.num(np.quantile([25.5, 40], q), 1) for q in config.TERCILES])
        self.assertEqual(b["nation"]["quint"], [30.3] * 4)  # one state with a value: 30.333...

    def test_empty_level_gives_null_breaks(self):
        empty = self.frame.assign(**{"Composite Score": np.nan})
        self.assertEqual(aggregates.breaks(empty, (SCORE,))["composite"]["local"]["terc"], [None, None])

    def test_matrices_use_average_ranks_and_pairwise_deletion(self):
        # SPEC.md Appendix C small case with ties, plus a row missing y that pairwise deletion must drop.
        table = pd.DataFrame({"Composite Score": [1, 2, 2, 3, 4, 4, 4, 5, 9],
                              "Gini index": [2, 1, 3, 3, 5, 4, 6, 7, np.nan]})
        m = aggregates.matrices(table, (SCORE, GINI))
        self.assertEqual(m["spearman"][0][1], 0.92)
        self.assertEqual(m["pearson"][0][1], 0.8882)
        self.assertEqual(m["n"], 9)

    def test_antimeridian_bbox_keeps_the_western_hemisphere(self):
        geom = MultiPolygon([box(-179.5, 51, -130, 71), box(172, 52, 179.8, 53)])
        self.assertEqual(aggregates.bbox(geom), [-179.5, 51.0, -130.0, 71.0])
        self.assertEqual(aggregates.bbox(box(-90, 30, -80, 35)), [-90.0, 30.0, -80.0, 35.0])


class ReportHelpersTest(unittest.TestCase):
    def test_fill_sources_counts_rows_per_source(self):
        counts = report.fill_sources(pd.Series(["a=X|Y;b=Z", "b=Z", np.nan]))
        self.assertEqual(dict(counts), {"a": 1, "b": 2})

    def test_check_ignores_only_the_meta_build_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a" / "meta.json", Path(tmp) / "b" / "meta.json"
            a.parent.mkdir()
            b.parent.mkdir()
            a.write_text(json.dumps({"build": "2026-09-26T00:00:00Z", "counts": {"schools": 1}}))
            b.write_text(json.dumps({"build": "2026-09-27T00:00:00Z", "counts": {"schools": 1}}))
            self.assertTrue(cli.same_output(a, b))
            b.write_text(json.dumps({"build": "2026-09-27T00:00:00Z", "counts": {"schools": 2}}))
            self.assertFalse(cli.same_output(a, b))


class CommittedOutputsTest(unittest.TestCase):
    """SPEC.md 17.3 P2 acceptance, read from the committed files in site/public/data/v1/."""

    @classmethod
    def setUpClass(cls):
        cls.schools = load("schools/all.json")
        cls.states = load("states.json")
        cls.counties = load("counties.json")
        cls.breaks = load("breaks.json")
        cls.national = load("national.json")
        cls.meta = load("meta.json")

    def test_every_school_has_coordinates_and_aligned_columns(self):
        s = self.schools
        self.assertEqual(len(s["ids"]), 23595)
        self.assertEqual(s["ids"], sorted(s["ids"]))
        for key, column in s.items():
            if key != "values":
                self.assertEqual(len(column), 23595, key)
        for key, column in s["values"].items():
            self.assertEqual(len(column), 23595, key)
        self.assertTrue(all(isinstance(v, float) and -180 <= v <= 180 for v in s["lon"]))
        self.assertTrue(all(isinstance(v, float) and -90 <= v <= 90 for v in s["lat"]))
        catalog = json.loads(config.CATALOG_JSON.read_text())["layers"]
        expected = {layer["id"] for layer in catalog} | {f"{layer['id']}_pct" for layer in catalog if layer.get("pctColumn")}
        self.assertEqual(set(s["values"]), expected)

    def test_ct_filled_flag_is_set_on_exactly_the_connecticut_rows(self):
        flagged = [st for st, f in zip(self.schools["st"], self.schools["flags"]) if f & config.FLAG_CT_FILLED]
        self.assertEqual(len(flagged), 208)
        self.assertEqual(set(flagged), {"CT"})
        self.assertEqual(self.schools["st"].count("CT"), 208)

    def test_school_areas_resolve_to_aggregate_ids(self):
        self.assertTrue(set(self.schools["county"]) <= set(self.counties["ids"]))
        self.assertTrue(set(self.schools["stfp"]) <= set(self.states["ids"]))

    def test_area_files(self):
        self.assertEqual(len(self.states["ids"]), 52)
        self.assertEqual(len(self.counties["ids"]), 3222)
        self.assertEqual(sum(1 for n in self.counties["n"] if n == 0), 55)
        self.assertEqual(sum(1 for n in self.counties["n"] if n > 0), 3167)
        self.assertEqual(sum(self.states["n"]), 23595)
        la = self.counties["ids"].index("06037")
        self.assertEqual(self.counties["n"][la], 509)
        self.assertEqual(self.counties["measures"]["crime"]["mean"][la], 28.0)
        for f in (self.states, self.counties):
            for box_ in f["bbox"]:
                self.assertLess(box_[0], box_[2])
                self.assertLess(box_[2] - box_[0], 60)  # no box wraps the antimeridian
        empty = self.counties["n"].index(0)
        self.assertIsNone(self.counties["measures"]["composite"]["mean"][empty])

    def test_reference_correlations_reproduce_to_four_decimals(self):
        index = {layer_id: i for i, layer_id in enumerate(self.national["layers"])}
        for a, b, level, rho, r, _n in report.REFERENCE:
            if level not in self.national:
                continue
            with self.subTest(pair=f"{a}/{b}", level=level):
                self.assertEqual(self.national[level]["spearman"][index[a]][index[b]], rho)
                self.assertEqual(self.national[level]["pearson"][index[a]][index[b]], r)
        self.assertEqual((self.national["schools"]["n"], self.national["counties"]["n"], self.national["states"]["n"]),
                         (23595, 3167, 52))
        self.assertEqual(self.national["schools"]["spearman"][index["crime"]][index["crime"]], 1.0)

    def test_composite_breaks_equal_section_5_2(self):
        for level, want in report.COMPOSITE_BREAKS.items():
            self.assertEqual(self.breaks["composite"][level]["quint"], want, level)
        for layer in self.breaks.values():
            for level in ("nation", "state", "local"):
                for kind in ("quint", "terc"):
                    values = layer[level][kind]
                    self.assertEqual(values, sorted(values))

    def test_meta_and_catalog(self):
        self.assertEqual(self.meta["counts"], {"schools": 23595, "states": 52, "counties": 3167, "countyPolygons": 3222})
        self.assertEqual(self.meta["placeholders"], {"connecticut": "filled"})
        self.assertEqual(self.meta["input"], "index_scores_v3_2026_ct_filled.csv")
        self.assertEqual(load("catalog.json"), json.loads(config.CATALOG_JSON.read_text()))

    def test_no_nan_in_outputs(self):
        for name in ("schools/all.json", "states.json", "counties.json", "breaks.json", "national.json"):
            text = (OUT / name).read_text()
            self.assertNotIn("NaN", text, name)


@unittest.skipUnless(inputs_cached(), "pipeline inputs are not downloaded into .cache/schoolscape/")
class DeterminismTest(unittest.TestCase):
    def test_check_passes(self):
        with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()):
            cli.main(["check"])
        self.assertIn("check passed", out.getvalue())


if __name__ == "__main__":
    unittest.main()
