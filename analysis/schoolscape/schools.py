# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""ODIS CSV + NCES geocodes -> site/public/data/v1/schools/all.json (SPEC.md 8.2, 8.3, Appendix B).

Also holds the input loaders and the JSON writer shared by aggregates.py and report.py.
"""

import functools
import json
import math
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import pandas as pd

from . import config, download


@functools.cache
def read_catalog() -> tuple[dict, ...]:
    """Catalog layers (LayerDef, SPEC.md Appendix A) in catalog order."""
    return tuple(json.loads(config.CATALOG_JSON.read_text())["layers"])


@functools.cache
def read_csv() -> pd.DataFrame:
    """The pipeline input with identifiers as strings and the three documented missing forms as NaN."""
    return pd.read_csv(
        config.INPUT_CSV,
        dtype={c: str for c in [*config.STRING_COLUMNS, "ct_fill_sources"]},
        na_values=config.MISSING_VALUES,
        keep_default_na=False,
    )


@functools.cache
def read_states() -> gpd.GeoDataFrame:
    """Census 1:5m state polygons without the four territories that have no ODIS rows, sorted by STATEFP."""
    gdf = gpd.read_file(download.extract("states_5m") / "cb_2023_us_state_5m.shp")
    gdf = gdf[~gdf.STATEFP.isin(config.EXCLUDED_STATEFP)]
    return gdf.sort_values("STATEFP").reset_index(drop=True)


@functools.cache
def read_counties() -> gpd.GeoDataFrame:
    """Census 1:5m county polygons without the four territories that have no ODIS rows, sorted by GEOID."""
    gdf = gpd.read_file(download.extract("counties_5m") / "cb_2023_us_county_5m.shp")
    gdf = gdf[~gdf.STATEFP.isin(config.EXCLUDED_STATEFP)]
    return gdf.sort_values("GEOID").reset_index(drop=True)


@functools.cache
def read_geocodes() -> pd.DataFrame:
    """NCES EDGE 2022-23 school geocodes: NCESSCH (zero-padded to 12 digits), CNTY, LAT, LON."""
    path = download.extract("geocodes") / config.DOWNLOADS["geocodes"]["shapefile"]
    geo = gpd.read_file(path, columns=["NCESSCH", "CNTY", "LAT", "LON"], ignore_geometry=True)
    geo["NCESSCH"] = geo["NCESSCH"].astype(str).str.zfill(12)
    return pd.DataFrame(geo)


@dataclass(frozen=True)
class Joined:
    """The input rows sorted by NCESSCH with LAT, LON, CNTY, and STATEFP joined, plus the join diagnostics."""

    frame: pd.DataFrame
    unmatched: list[str]  # NCESSCH values with no geocode
    county_disagreements: list[tuple[str, str, str]]  # (NCESSCH, ODIS FIPS County Code, NCES CNTY)
    state_disagreements: list[tuple[str, str, str]]  # (NCESSCH, STATEFP of State, first two digits of the county)


def join(df: pd.DataFrame, geo: pd.DataFrame, stfp_by_usps: dict[str, str]) -> Joined:
    """Joins coordinates on NCESSCH and states on USPS code; never drops a row."""
    if df["NCESSCH"].duplicated().any():
        raise SystemExit("duplicate NCESSCH in the input CSV")
    geo = geo.drop_duplicates("NCESSCH")
    frame = df.merge(geo, on="NCESSCH", how="left", validate="one_to_one")
    frame = frame.sort_values("NCESSCH", kind="stable").reset_index(drop=True)
    frame["STATEFP"] = frame["State"].map(stfp_by_usps)
    if frame["STATEFP"].isna().any():
        raise SystemExit(f"states not in the boundary file: {sorted(frame.loc[frame.STATEFP.isna(), 'State'].unique())}")
    unmatched = sorted(frame.loc[frame["LAT"].isna() | frame["LON"].isna(), "NCESSCH"])
    matched = frame[frame["CNTY"].notna()]
    bad_county = matched[matched["CNTY"] != matched["FIPS County Code"]]
    bad_state = frame[frame["STATEFP"] != frame["FIPS County Code"].str[:2]]
    return Joined(
        frame=frame,
        unmatched=unmatched,
        county_disagreements=list(bad_county[["NCESSCH", "FIPS County Code", "CNTY"]].itertuples(index=False, name=None)),
        state_disagreements=[(i, s, c[:2]) for i, s, c in
                             bad_state[["NCESSCH", "STATEFP", "FIPS County Code"]].itertuples(index=False, name=None)],
    )


@functools.cache
def joined() -> Joined:
    states = read_states()
    return join(read_csv(), read_geocodes(), dict(zip(states.STUSPS, states.STATEFP)))


def num(v, decimals: int):
    """Rounds to ``decimals`` (an int at 0); NaN and None become None."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    r = round(float(v), decimals)
    return int(r) if decimals == 0 else r


def value_decimals(layer: dict) -> int:
    """School values: integers as in the CSV, Gini two decimals (SPEC.md 8.3)."""
    return config.GINI_DECIMALS if layer["unit"] == "gini" else 0


def mean_decimals(layer: dict) -> int:
    """Area means and medians: one decimal, Gini two (SPEC.md 8.3)."""
    return config.GINI_DECIMALS if layer["unit"] == "gini" else config.MEAN_DECIMALS


def write_json(path: Path, data) -> Path:
    """Deterministic compact JSON: sorted keys, UTF-8, trailing newline."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n")
    return path


def schools_file(frame: pd.DataFrame, layers: tuple[dict, ...]) -> dict:
    """The columnar schools/all.json object (SPEC.md Appendix B) for rows that all have coordinates."""
    values: dict[str, list] = {}
    for layer in layers:
        d = value_decimals(layer)
        values[layer["id"]] = [num(v, d) for v in frame[layer["column"]]]
        if layer.get("pctColumn"):
            values[f"{layer['id']}_pct"] = [num(v, 0) for v in frame[layer["pctColumn"]]]
    filled = frame["ct_fill_sources"].fillna("").str.strip() != ""
    c = config.COORD_DECIMALS
    return {
        "ids": list(frame["NCESSCH"]),
        "name": list(frame["Name"]),
        "district": list(frame["School District"]),
        "st": list(frame["State"]),
        "stfp": list(frame["STATEFP"]),
        "county": list(frame["FIPS County Code"]),
        "countyName": list(frame["County"]),
        "city": list(frame["City"]),
        "zip": list(frame["Zip Code"]),
        "sab": [int(v) for v in frame["SAB Available"]],
        "lat": [round(float(v), c) for v in frame["LAT"]],
        "lon": [round(float(v), c) for v in frame["LON"]],
        "flags": [config.FLAG_CT_FILLED if f else 0 for f in filled],
        "values": values,
    }


def output_path() -> Path:
    return config.OUT_DIR / "schools" / "all.json"


def build(dry_run: bool) -> list[Path]:
    path = output_path()
    if dry_run:
        return [path]
    j = joined()
    if j.unmatched:
        raise SystemExit(f"{len(j.unmatched)} schools have no NCES geocode: {j.unmatched[:10]}")
    if j.county_disagreements:
        raise SystemExit(f"{len(j.county_disagreements)} schools disagree with the NCES county: "
                         f"{j.county_disagreements[:10]}")
    # A school belongs to a state by its ODIS `State` (SPEC.md 5.1) even when its county lies in another state;
    # REPORT.md lists those rows.
    return [write_json(path, schools_file(j.frame, read_catalog()))]
