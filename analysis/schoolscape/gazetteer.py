"""gazetteer.json: the places search and the command bar resolve against (SPEC.md 3.11, 14.5, Appendix B).

One entry per state (52), per ODIS county (3,167), per city, and per school district.
States and counties carry the bbox of their boundary polygon from ``boundaries.bboxes()``, the same bbox states.json
and counties.json carry, so a search lands exactly where a click-to-drill does.
Cities and districts have no polygon (SPEC.md 1.4); they carry the bbox of their schools' coordinates (SPEC.md 3.11).

A city or district is keyed by state and exact CSV name (id ``"{ST}:{name}"``), so the three Springfields stay three
places and the app can find a place's schools by matching ``st`` and ``city`` / ``district`` in schools/all.json.
Names are kept byte-for-byte as in the CSV for that reason, including the few with doubled spaces.

Run: ``python -m analysis.schoolscape build`` (all outputs).
"""

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

from . import boundaries, config, download, fixtures

# Cities and districts are grouped by these CSV columns within a state.
PLACE_COLUMNS = {"city": "City", "district": "School District"}


def out_path() -> Path:
    """Reads config.OUT_DIR at call time so ``check`` can redirect it."""
    return config.OUT_DIR / "gazetteer.json"


def school_coordinates() -> pd.DataFrame:
    """NCESSCH (12-digit string), LAT, LON from the NCES EDGE geocode file, rounded like schools/all.json."""
    path = download.extract("geocodes") / config.DOWNLOADS["geocodes"]["shapefile"]
    geo = gpd.read_file(path, columns=["NCESSCH", "LAT", "LON"], ignore_geometry=True)
    geo["NCESSCH"] = geo["NCESSCH"].astype(str).str.zfill(12)
    geo["LAT"] = geo["LAT"].astype(float).round(config.COORD_DECIMALS)
    geo["LON"] = geo["LON"].astype(float).round(config.COORD_DECIMALS)
    return geo[["NCESSCH", "LAT", "LON"]]


def points_bbox(frame: pd.DataFrame) -> list[float]:
    """Bbox of a frame's LAT/LON; a place with one school has a zero-size bbox (the camera helper sets the zoom)."""
    return [float(frame.LON.min()), float(frame.LAT.min()), float(frame.LON.max()), float(frame.LAT.max())]


def state_codes() -> pd.DataFrame:
    """STATEFP, STUSPS, and NAME of the kept states, from the Census state boundary file."""
    shp = download.extract("states_5m") / "cb_2023_us_state_5m.shp"
    states = gpd.read_file(shp, columns=["STATEFP", "STUSPS", "NAME"], ignore_geometry=True)
    return states[~states.STATEFP.isin(config.EXCLUDED_STATEFP)]


def entries(schools: pd.DataFrame, states: pd.DataFrame, state_bboxes: dict, county_bboxes: dict) -> list[dict]:
    """Gazetteer entries in a fixed order: states by STATEFP, counties by GEOID, cities, then districts by (ST, name).

    ``schools`` has the CSV columns State, FIPS County Code, County, City, School District plus LAT and LON;
    ``states`` has STATEFP, STUSPS, NAME; the bbox dicts map STATEFP and GEOID to a boundary bbox.
    A county's state is the one its GEOID names, even where a school's CSV State differs (Navajo Mountain High, in
    San Juan County, Utah, has State AZ); cities and districts follow the CSV State, as schools/all.json does.
    """
    usps = dict(zip(states.STATEFP, states.STUSPS))
    names = dict(zip(states.STATEFP, states.NAME))
    missing = sorted(set(schools["State"]) - set(usps.values()))
    if missing:
        raise SystemExit(f"ODIS states missing from the Census state file: {missing}")
    state_ids = sorted(fp for fp, st in usps.items() if st in set(schools["State"]))
    pairs = schools[["FIPS County Code", "County"]].drop_duplicates()
    if not pairs["FIPS County Code"].is_unique:
        raise SystemExit(f"counties with two names: {pairs[pairs['FIPS County Code'].duplicated(keep=False)]}")
    county_names = dict(zip(pairs["FIPS County Code"], pairs["County"]))
    for level, ids, known in (("state", state_ids, state_bboxes), ("county", county_names, county_bboxes)):
        missing = sorted(set(ids) - set(known))
        if missing:
            raise SystemExit(f"ODIS {level} ids with no boundary polygon: {missing}")

    out = []
    for fp in state_ids:
        out.append({"k": "state", "id": fp, "n": names[fp], "st": usps[fp], "bb": list(state_bboxes[fp])})
    for geoid in sorted(county_names):
        out.append({"k": "county", "id": geoid, "n": county_names[geoid], "st": usps[geoid[:2]],
                    "bb": list(county_bboxes[geoid])})
    for kind, col in PLACE_COLUMNS.items():
        for (st, name), frame in schools.groupby(["State", col], sort=True):
            out.append({"k": kind, "id": f"{st}:{name}", "n": name, "st": st, "bb": points_bbox(frame)})
    return out


def build(dry_run: bool) -> list[Path]:
    if dry_run:
        return []
    df = fixtures.read_csv()
    schools = df.merge(school_coordinates(), on="NCESSCH", how="left", validate="one_to_one")
    unmatched = schools.loc[schools.LAT.isna(), "NCESSCH"].tolist()
    if unmatched:
        raise SystemExit(f"{len(unmatched)} schools have no NCES geocode, e.g. {unmatched[:5]}")
    data = {"entries": entries(schools, state_codes(), boundaries.bboxes("states"), boundaries.bboxes("counties"))}
    path = out_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    return [path]
