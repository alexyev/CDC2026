import contextlib
import io
import unittest

from analysis.schoolscape import __main__ as cli
from analysis.schoolscape import config


class DryRunTest(unittest.TestCase):
    def test_dry_run_prints_every_output_and_writes_nothing(self):
        before = sorted(config.OUT_DIR.rglob("*")) if config.OUT_DIR.exists() else []
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            cli.main(["build", "--dry-run"])
        text = out.getvalue()
        for name in ("states.topo.json", "counties.topo.json", "schools/all.json", "states.json", "counties.json",
                     "breaks.json", "national.json", "gazetteer.json", "presets.json", "catalog.json", "meta.json",
                     "REPORT.md"):
            self.assertIn(name, text)
        self.assertIn("index_scores_v3_2026_ct_filled.csv", text)
        after = sorted(config.OUT_DIR.rglob("*")) if config.OUT_DIR.exists() else []
        self.assertEqual(before, after)

    def test_input_is_the_connecticut_filled_csv(self):
        self.assertEqual(config.INPUT_CSV.name, "index_scores_v3_2026_ct_filled.csv")
        self.assertTrue(config.INPUT_CSV.exists())


if __name__ == "__main__":
    unittest.main()
