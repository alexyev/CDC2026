"""catalog.json, meta.json, and analysis/schoolscape/REPORT.md (SPEC.md 8.2, 8.3).

Runs last: the reference statistics in REPORT.md are read back from the national.json that aggregates.py wrote.
REPORT.md is deterministic; the only timestamp in the outputs is meta.json's ``build``.
"""

import datetime
import gzip
import json
import os
from collections import Counter
from pathlib import Path

import pandas as pd
from scipy import stats

from . import config, download
from .schools import Joined, joined, read_catalog, read_counties, write_json

# SPEC.md Appendix C: (layer A, layer B, national.json level or a state's USPS code, spearman, pearson, n).
REFERENCE = [
    ("crime", "education", "schools", 0.2419, 0.0655, 20201),
    ("economic", "education", "schools", 0.5574, 0.4927, 23406),
    ("crime", "education", "CA", 0.2361, 0.1408, 2202),
    ("crime", "education", "counties", 0.3966, 0.2560, 2211),
    ("crime", "education", "states", 0.1661, 0.1180, 50),
    ("economic", "education", "states", 0.4964, 0.4785, 52),
]
# SPEC.md 5.2: Composite Score quintile breaks per level.
COMPOSITE_BREAKS = {"local": [21, 25, 30, 35], "state": [23.0, 27.0, 31.0, 37.7], "nation": [24.1, 25.8, 29.3, 34.0]}
LEVEL_UNITS = {"schools": "schools", "counties": "county means", "states": "state means"}
# Outputs written by P2 whose sizes the report lists (the other tasks' files are reported by their owners).
SIZED = ("schools/all.json", "states.json", "counties.json", "breaks.json", "national.json", "catalog.json")


def build_stamp() -> str:
    """UTC build time; ``SOURCE_DATE_EPOCH`` pins it for reproducible builds."""
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    now = (datetime.datetime.fromtimestamp(int(epoch), datetime.UTC) if epoch
           else datetime.datetime.now(datetime.UTC))
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def meta(frame: pd.DataFrame, county_polygons: int) -> dict:
    return {
        "build": build_stamp(),
        "dataVersion": config.DATA_VERSION,
        "odis": "v3 (2026)",
        "nces": "EDGE_GEOCODE_PUBLICSCH_2223",
        "census": "GENZ2023",
        "input": config.INPUT_CSV.name,
        "counts": {
            "schools": int(len(frame)),
            "states": int(frame["STATEFP"].nunique()),
            "counties": int(frame["FIPS County Code"].nunique()),
            "countyPolygons": county_polygons,
        },
        "placeholders": {"connecticut": "filled"},
    }


def fmt_int(n: int) -> str:
    return f"{n:,}"


def pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f}%" if whole else "n/a"


def ok(flag: bool) -> str:
    return "yes" if flag else "**NO**"


def table(header: list[str], rows: list[list]) -> list[str]:
    out = ["| " + " | ".join(header) + " |", "| " + " | ".join("---" for _ in header) + " |"]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return out


def fill_sources(values: pd.Series) -> Counter:
    """Rows per Connecticut fill source key in ``ct_fill_sources`` ("key=col|col;key=col")."""
    counts: Counter = Counter()
    for v in values.dropna():
        for part in v.split(";"):
            if "=" in part:
                counts[part.split("=", 1)[0]] += 1
    return counts


def reference_rows(frame: pd.DataFrame, national: dict, layers) -> list[list]:
    column = {layer["id"]: layer["column"] for layer in layers}
    index = {layer_id: i for i, layer_id in enumerate(national["layers"])}
    rows = []
    for a, b, level, rho, r, n in REFERENCE:
        if level in national:
            got_rho = national[level]["spearman"][index[a]][index[b]]
            got_r = national[level]["pearson"][index[a]][index[b]]
            table_ = frame if level == "schools" else frame.groupby(
                "FIPS County Code" if level == "counties" else "STATEFP")[[column[a], column[b]]].mean()
            unit = LEVEL_UNITS[level]
            source = f"national.json `{level}`"
        else:
            table_ = frame[frame["State"] == level]
            pair = table_[[column[a], column[b]]].dropna()
            got_rho = round(float(stats.spearmanr(pair[column[a]], pair[column[b]]).statistic), 4)
            got_r = round(float(stats.pearsonr(pair[column[a]], pair[column[b]]).statistic), 4)
            unit = f"schools, {level}"
            source = "computed here"
        got_n = int(table_[[column[a], column[b]]].dropna().shape[0])
        match = got_rho == rho and got_r == r and got_n == n
        rows.append([f"{a} vs {b}", unit, f"{rho:.4f}", f"{got_rho:.4f}", f"{r:.4f}", f"{got_r:.4f}",
                     fmt_int(n), fmt_int(got_n), source, ok(match)])
    return rows


def report_md(j: Joined, layers, national: dict, breaks: dict, county_polygons: int, sizes: list[list]) -> str:
    frame = j.frame
    n = len(frame)
    counties_with_schools = frame.groupby("FIPS County Code").size()
    states_with_schools = frame.groupby("STATEFP").size()
    ct = frame[frame["ct_fill_sources"].fillna("").str.strip() != ""]
    ct_missing = [c for c in [layer["column"] for layer in layers] if ct[c].isna().any()]
    lines = [
        "# Schoolscape pipeline report",
        "",
        "Written by `python -m analysis.schoolscape build` (SPEC.md 8.3); deterministic, regenerated on every build.",
        "",
        "## Inputs",
        "",
        *table(["Input", "SHA-256"], [
            [f"`{config.INPUT_CSV.relative_to(config.ROOT)}`", f"`{download.sha256(config.INPUT_CSV)}`"],
            *[[f"`{spec['url'].rsplit('/', 1)[-1]}`", f"`{spec['sha256']}`"]
              for key, spec in config.DOWNLOADS.items() if key != "counties_500k"],
        ]),
        "",
        "## Counts",
        "",
        *table(["Item", "Count"], [
            ["Schools (rows)", fmt_int(n)],
            ["Schools with coordinates", fmt_int(int(frame["LAT"].notna().sum()))],
            ["States and territories with schools", fmt_int(len(states_with_schools))],
            ["Counties with schools", fmt_int(len(counties_with_schools))],
            ["County polygons (1:5m)", fmt_int(county_polygons)],
            ["County polygons with no ODIS school (drawn as no data)", fmt_int(county_polygons - len(counties_with_schools))],
            ["Counties with exactly 1 school", fmt_int(int((counties_with_schools == 1).sum()))],
            ["Thin counties (1 to 2 schools)", fmt_int(int((counties_with_schools < config.THIN_N).sum()))],
            ["Counties with 10 or more schools", fmt_int(int((counties_with_schools >= 10).sum()))],
            ["Median schools per county", f"{counties_with_schools.median():g}"],
            ["Largest county", f"{counties_with_schools.idxmax()} ({fmt_int(int(counties_with_schools.max()))} schools)"],
        ]),
        "",
        "## Geocode join",
        "",
        "Coordinates come from the NCES EDGE 2022-23 public school geocodes, joined on `NCESSCH` zero-padded to 12 digits.",
        "",
        *table(["Check", "Result", "Pass"], [
            ["Schools matched to a geocode", f"{fmt_int(n - len(j.unmatched))} of {fmt_int(n)} "
                                             f"({pct(n - len(j.unmatched), n)})", ok(not j.unmatched)],
            ["ODIS `FIPS County Code` equals NCES `CNTY`",
             f"{fmt_int(n - len(j.unmatched) - len(j.county_disagreements))} of {fmt_int(n - len(j.unmatched))}",
             ok(not j.county_disagreements)],
        ]),
        "",
        f"Latitudes range from {frame['LAT'].min():.2f} to {frame['LAT'].max():.2f} and longitudes from "
        f"{frame['LON'].min():.2f} to {frame['LON'].max():.2f}.",
        "",
        f"Unmatched ids: {', '.join(f'`{i}`' for i in j.unmatched) or 'none'}.",
        "",
        "County disagreements: " + (", ".join(f"`{i}` (ODIS {a}, NCES {b})" for i, a, b in j.county_disagreements)
                                    or "none") + ".",
        "",
        "Schools whose ODIS `State` differs from the state of their county "
        "(they count toward their ODIS `State` in state aggregates, SPEC.md 5.1): "
        + (", ".join(f"`{i}` (`State` FIPS {s}, county state FIPS {c})" for i, s, c in j.state_disagreements)
           or "none") + ".",
        "",
        "## Missing values per layer",
        "",
        "Share of schools with no value (`N/A`, empty, or `Null` in the CSV); `catalog` is the share in `site/data/catalog.json`.",
        "",
        *table(["Layer", "Column", "Missing", "Share", "Catalog", "Connecticut missing"], [
            [f"`{layer['id']}`", layer["column"], fmt_int(int(frame[layer["column"]].isna().sum())),
             pct(int(frame[layer["column"]].isna().sum()), n), f"{100 * layer['missingShare']:.1f}%",
             fmt_int(int(ct[layer["column"]].isna().sum()))]
            for layer in layers
        ]),
        "",
        "## Connecticut",
        "",
        f"{fmt_int(len(ct))} rows have a non-empty `ct_fill_sources` and carry the `ctFilled` flag (bit value "
        f"{config.FLAG_CT_FILLED}) in `schools/all.json`; states of flagged rows: {', '.join(sorted(ct['State'].unique()))}.",
        f"Connecticut rows in the input: {fmt_int(int((frame['State'] == 'CT').sum()))}; none are dropped.",
        f"County codes are the 2022 planning regions: {', '.join(sorted(ct['FIPS County Code'].unique()))}.",
        f"Layers still missing for Connecticut: {', '.join(f'`{c}`' for c in ct_missing) or 'none'}.",
        "",
        *table(["Fill source", "Rows"], [[f"`{k}`", fmt_int(v)] for k, v in sorted(fill_sources(ct["ct_fill_sources"]).items())]),
        "",
        "## Reference statistics (SPEC.md Appendix C)",
        "",
        "Pairwise deletion; Spearman with average ranks; area levels use unrounded area means.",
        "",
        *table(["Pair", "Units", "Spearman expected", "Spearman", "Pearson expected", "Pearson", "n expected", "n",
                "Source", "Match"], reference_rows(frame, national, layers)),
        "",
        "## Composite Score quintile breaks (SPEC.md 5.2)",
        "",
        *table(["Level", "Expected", "breaks.json", "Match"], [
            [level, " / ".join(f"{v:g}" for v in want), " / ".join(f"{v:g}" for v in breaks["composite"][level]["quint"]),
             ok(breaks["composite"][level]["quint"] == want)]
            for level, want in COMPOSITE_BREAKS.items()
        ]),
        "",
        "## Output sizes",
        "",
        *table(["File", "Bytes", "Gzip -9 bytes"], sizes),
        "",
    ]
    return "\n".join(lines)


def gzip_size(path: Path) -> int:
    return len(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0))


def build(dry_run: bool) -> list[Path]:
    catalog_path, meta_path = config.OUT_DIR / "catalog.json", config.OUT_DIR / "meta.json"
    if dry_run:
        return [catalog_path, meta_path, config.REPORT_MD]
    j = joined()
    layers = read_catalog()
    county_polygons = int(len(read_counties()))
    written = [write_json(catalog_path, json.loads(config.CATALOG_JSON.read_text())),
               write_json(meta_path, meta(j.frame, county_polygons))]
    national = json.loads((config.OUT_DIR / "national.json").read_text())
    breaks = json.loads((config.OUT_DIR / "breaks.json").read_text())
    sizes = [[f"`{name}`", fmt_int(p.stat().st_size), fmt_int(gzip_size(p))]
             for name in SIZED if (p := config.OUT_DIR / name).exists()]
    config.REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
    config.REPORT_MD.write_text(report_md(j, layers, national, breaks, county_polygons, sizes))
    written.append(config.REPORT_MD)
    return written
