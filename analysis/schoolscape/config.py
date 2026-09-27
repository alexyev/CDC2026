# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""Paths, pinned inputs, and constants shared by the Schoolscape pipeline and the app (SPEC.md section 8).

Numbers that the app also uses (level zooms, data version) must match site/src/map/levels.ts and
site/src/data/paths.ts.

Shared helper signatures agreed in T0 (implemented by their owners):

- ``boundaries.centroids(level: str) -> dict[str, tuple[float, float]]`` (P1): unit id (STATEFP or GEOID) to
  (lon, lat) centroid, computed in EPSG:5070 and rounded to 5 decimals; ``level`` is "states" or "counties".
- ``boundaries.bboxes(level: str) -> dict[str, tuple[float, float, float, float]]`` (P1): unit id to
  [minLon, minLat, maxLon, maxLat], rounded to 5 decimals; Alaska's bbox must not wrap the antimeridian.
- Every build module in OUTPUTS exposes ``build(dry_run: bool) -> list[Path]`` and returns the files it wrote.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Input.  The Connecticut-filled file is the fixed ODIS v3 CSV plus Connecticut values from current public
# sources (data/README.md, "Connecticut fill") and a trailing ct_fill_sources column.
INPUT_CSV = ROOT / "data" / "index_scores_v3_2026_ct_filled.csv"
CATALOG_JSON = ROOT / "site" / "data" / "catalog.json"

# Outputs.  Bump DATA_VERSION together with site/src/data/paths.ts when the data changes.
DATA_VERSION = "v1"
OUT_DIR = ROOT / "site" / "public" / "data" / DATA_VERSION
REPORT_MD = ROOT / "analysis" / "schoolscape" / "REPORT.md"
FIXTURES_DIR = ROOT / "site" / "src" / "test" / "fixtures"

# Downloads are cached here (gitignored) and verified by SHA-256 before use.
CACHE_DIR = ROOT / ".cache" / "schoolscape"

DOWNLOADS = {
    "geocodes": {
        "url": "https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2223.zip",
        "sha256": "eba99090e451069910f32627f5d7142e89774679076bb52dc559f98703c16ae7",
        "shapefile": "Shapefiles_SCH/EDGE_GEOCODE_PUBLICSCH_2223.shp",
    },
    "states_5m": {
        "url": "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_5m.zip",
        "sha256": "0f606018e81fe99a204d08aa7ac1f8d00516143ddc95900b79eeecfee65da8c3",
    },
    "counties_5m": {
        "url": "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip",
        "sha256": "13b2bcdd81fee8476220793dd1023c4f1d2887945b5f66eef52afa98c99d2485",
    },
    "counties_500k": {
        "url": "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip",
        "sha256": "99d6597b1fc7767deef62e01d28d8b5dcbd578e151855f7dc0d173cbf5bf0868",
    },
}

# CSV reading rules (SPEC.md 8.3).
MISSING_VALUES = ["N/A", "", "Null"]
STRING_COLUMNS = ["NCESSCH", "FIPS County Code", "Zip Code"]
# Pipeline audit columns that are never shipped to the site.
AUDIT_COLUMNS = ["NCESSCH_original", "NCESSCH_status", "ct_fill_sources"]

# Territories with no ODIS rows, dropped from the boundary files; Puerto Rico (72) and DC (11) stay.
EXCLUDED_STATEFP = ["60", "66", "69", "78"]

# Levels (SPEC.md 3.3): nation below z5, state from z5, local from z8.
STATE_LEVEL_ZOOM = 5
LOCAL_LEVEL_ZOOM = 8
LEVELS = ("nation", "state", "local")

# Areas with 1 <= n < THIN_N schools are "thin" (SPEC.md 5.1).
THIN_N = 3

# Rounding (SPEC.md 8.3).
MEAN_DECIMALS = 1
GINI_DECIMALS = 2
COORD_DECIMALS = 5
CORRELATION_DECIMALS = 4

# Class breaks (SPEC.md 5.2): numpy's default (linear) quantile of the unit distribution at each level.
QUINTILES = (0.2, 0.4, 0.6, 0.8)
TERCILES = (1 / 3, 2 / 3)

# TopoJSON (SPEC.md 8.2): object names and feature ids the app relies on.
TOPO_OBJECTS = {"states": "states", "counties": "counties"}  # feature id = STATEFP / GEOID, properties.name
STATES_SIMPLIFY_DEG = 0.01
COUNTIES_SIMPLIFY_DEG = 0.005
TOPO_QUANTIZATION = 100_000

# schools/all.json `flags` bits.
FLAG_CT_FILLED = 1  # Connecticut row with values filled from non-ODIS sources (ct_fill_sources non-empty)

# Output files, in build order, with the module that writes them and its owner task (SPEC.md 17.3).
OUTPUTS = [
    ("boundaries", "P1", [OUT_DIR / "states.topo.json", OUT_DIR / "counties.topo.json"]),
    ("schools", "P2", [OUT_DIR / "schools" / "all.json"]),
    ("aggregates", "P2", [OUT_DIR / f for f in ("states.json", "counties.json", "breaks.json", "national.json")]),
    ("gazetteer", "P3", [OUT_DIR / "gazetteer.json"]),
    ("presets", "P3", [OUT_DIR / "presets.json"]),
    ("report", "P2", [OUT_DIR / "catalog.json", OUT_DIR / "meta.json", REPORT_MD]),
]
