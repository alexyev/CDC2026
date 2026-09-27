# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""Small app fixtures in site/src/test/fixtures/ (SPEC.md 17.2): 10 states, 30 counties, 200 schools.

Values are real: area aggregates, breaks, and national correlations are computed from the full input CSV, and the
schools are a deterministic sample of real rows.  All 52 state polygons are included so the map is complete; the
county polygons are the 30 fixture counties.  The pipeline (P1-P3) owns the real outputs; this module only mirrors
their schemas (SPEC.md Appendix B) closely enough for the app to be built against.

Run: ``python -m analysis.schoolscape fixtures``.
"""

import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import topojson

from . import config, download

OUT = config.FIXTURES_DIR

STATES = ["06", "48", "37", "17", "01", "09", "72", "29", "25", "15"]  # CA TX NC IL AL CT PR MO MA HI
# Three counties per state.  TX includes a one-school (thin) county and a county with no ODIS school; the three
# Springfields (IL, MA, MO) and Albertville, AL support the search and command-bar cases.
COUNTIES = [
    "06037", "06075", "06019",  # Los Angeles, San Francisco, Fresno
    "48201", "48301", "48007",  # Harris, Loving (no ODIS school), Aransas (one school: thin)
    "37135", "37183", "37119",  # Orange, Wake, Mecklenburg
    "17031", "17167", "17019",  # Cook, Sangamon (Springfield), Champaign
    "01095", "01073", "01089",  # Marshall (Albertville), Jefferson, Madison
    "09110", "09120", "09170",  # Capitol, Greater Bridgeport, South Central Connecticut planning regions
    "72127", "72021", "72113",  # San Juan, Bayamon, Ponce
    "29077", "29510", "29095",  # Greene (Springfield), St. Louis city, Jackson
    "25013", "25025", "25017",  # Hampden (Springfield), Suffolk, Middlesex
    "15003", "15001", "15009",  # Honolulu, Hawaii, Maui
]
N_SCHOOLS = 200
FORCED_SCHOOLS = ["010000500871"]  # Albertville High School
LA_SCHOOLS = 20
PER_COUNTY = 6

# Short stand-ins for the narrated stories of presets.py, with the same ids and views.
PRESETS = [
    {"id": "where-stress-concentrates", "label": "Where stress concentrates", "chapter": "The map",
     "view": {"l": "composite", "v": "3.6/38.5/-96.5"},
     "narration": "The bright band is the South.", "caveat": "ODIS measures neighborhoods, not students."},
    {"id": "broadband-attainment", "label": "Digital divide, education divide", "chapter": "Nationally",
     "view": {"l": "broadband,college_2yr_plus", "v": "3.6/38.5/-96.5"},
     "narration": "Missing broadband tracks low adult attainment.", "caveat": "An association, not a cause."},
    {"id": "education-health-by-region", "label": "Same pair, different regions", "chapter": "Region by region",
     "view": {"l": "education,health", "v": "3.46/27.46/-99.67", "cmp": "state:06,state:12"},
     "narration": "Education and health go together more tightly in some regions.",
     "caveat": "Regions are a choice."},
    {"id": "west-housing", "label": "Housing runs backwards in the West", "chapter": "Region by region",
     "view": {"l": "affordability,economic", "v": "5.71/34.22/-119.01", "sel": "state:06"},
     "narration": "Unaffordable housing sits in otherwise less stressed places.",
     "caveat": "ODIS does not measure homelessness."},
    {"id": "one-formula", "label": "One formula does not fit everywhere", "chapter": "Graduation rates",
     "view": {"l": "composite,vacancy", "v": "5.84/43.83/-89.36", "sel": "county:55085"},
     "narration": "Domains predict graduation differently by region.", "caveat": "Graduation is one outcome."},
    {"id": "where-to-look", "label": "Where a lawmaker would look first", "chapter": "So what",
     "view": {"l": "health", "v": "3.6/38.5/-96.5"},
     "narration": "Health is the domain that tracks graduation.", "caveat": "Not proof of what policy would work."},
]


def read_catalog() -> list[dict]:
    return json.loads(config.CATALOG_JSON.read_text())["layers"]


def read_csv() -> pd.DataFrame:
    return pd.read_csv(
        config.INPUT_CSV,
        dtype={c: str for c in [*config.STRING_COLUMNS, "ct_fill_sources"]},
        na_values=config.MISSING_VALUES,
        keep_default_na=False,
    )


def num(v, decimals: int):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    r = round(float(v), decimals)
    return int(r) if decimals == 0 else r


def decimals_for(layer: dict) -> int:
    return config.GINI_DECIMALS if layer["unit"] == "gini" else config.MEAN_DECIMALS


def write(name: str, data) -> Path:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    return path


def load_boundaries():
    states = gpd.read_file(download.extract("states_5m") / "cb_2023_us_state_5m.shp")
    states = states[~states.STATEFP.isin(config.EXCLUDED_STATEFP)].sort_values("STATEFP").reset_index(drop=True)
    counties = gpd.read_file(download.extract("counties_5m") / "cb_2023_us_county_5m.shp")
    counties = counties[~counties.STATEFP.isin(config.EXCLUDED_STATEFP)].sort_values("GEOID").reset_index(drop=True)
    return states, counties


def centroid_bbox(gdf: gpd.GeoDataFrame, id_col: str) -> tuple[dict, dict]:
    cents = gdf.to_crs(5070).centroid.to_crs(4326)
    d = config.COORD_DECIMALS
    centroid = {i: [round(p.x, d), round(p.y, d)] for i, p in zip(gdf[id_col], cents)}
    bbox = {}
    for i, geom in zip(gdf[id_col], gdf.geometry):
        minx, miny, maxx, maxy = geom.bounds
        bbox[i] = [round(minx, d), round(miny, d), round(maxx, d), round(maxy, d)]
    return centroid, bbox


def to_topo(gdf: gpd.GeoDataFrame, id_col: str, name: str, simplify: float) -> dict:
    g = gdf[[id_col, "NAME", "geometry"]].rename(columns={id_col: "id", "NAME": "name"}).set_index("id", drop=False)
    topo = topojson.Topology(g, object_name=name, prequantize=config.TOPO_QUANTIZATION, toposimplify=simplify)
    data = json.loads(topo.to_json())
    for geom in data["objects"][name]["geometries"]:
        props = geom.get("properties", {})
        geom["id"] = props.pop("id")
        geom["properties"] = {"name": props["name"]}
    return data


def measures(df: pd.DataFrame, key: str, ids: list[str], layers: list[dict]) -> dict:
    grouped = df.groupby(key)
    out = {}
    for layer in layers:
        col = layer["column"]
        mean, median, n = grouped[col].mean(), grouped[col].median(), grouped[col].count()
        d = decimals_for(layer)
        out[layer["id"]] = {
            "mean": [num(mean.get(i), d) for i in ids],
            "median": [num(median.get(i), d) for i in ids],
            "n": [int(n.get(i, 0)) for i in ids],
        }
    return out


def unit_means(df: pd.DataFrame, key: str, layers: list[dict]) -> pd.DataFrame:
    return df.groupby(key)[[l["column"] for l in layers]].mean()


def breaks(df: pd.DataFrame, layers: list[dict]) -> dict:
    levels = {"nation": unit_means(df, "State", layers), "state": unit_means(df, "FIPS County Code", layers),
              "local": df}
    out = {}
    for layer in layers:
        col, d = layer["column"], decimals_for(layer)
        out[layer["id"]] = {}
        for level, frame in levels.items():
            v = frame[col].dropna().to_numpy()
            out[layer["id"]][level] = {
                "quint": [num(np.quantile(v, q), d) for q in config.QUINTILES],
                "terc": [num(np.quantile(v, q), d) for q in config.TERCILES],
            }
    return out


def matrices(frame: pd.DataFrame, layers: list[dict]) -> dict:
    cols = [l["column"] for l in layers]
    sub = frame[cols]
    d = config.CORRELATION_DECIMALS

    def clean(m: pd.DataFrame):
        return [[num(v, d) for v in row] for row in m.to_numpy()]

    return {"n": int(len(sub)), "spearman": clean(sub.corr(method="spearman")), "pearson": clean(sub.corr())}


def sample_schools(df: pd.DataFrame, counties: list[str]) -> pd.DataFrame:
    picked: list[str] = list(FORCED_SCHOOLS)
    pools = {}
    for c in counties:
        ids = sorted(df.loc[df["FIPS County Code"] == c, "NCESSCH"])
        pools[c] = [i for i in ids if i not in picked]
    for c in counties:
        want = LA_SCHOOLS if c == "06037" else PER_COUNTY
        pool = pools[c]
        take = [pool[round(k * len(pool) / want)] for k in range(want)] if len(pool) > want else pool
        picked.extend(take)
        pools[c] = [i for i in pool if i not in take]
    # Pad from the largest remaining pools, one at a time, until exactly N_SCHOOLS.
    while len(picked) < N_SCHOOLS:
        c = max(counties, key=lambda k: (len(pools[k]), k))
        picked.append(pools[c].pop(0))
    picked = picked[:N_SCHOOLS]
    return df[df["NCESSCH"].isin(picked)].sort_values("NCESSCH").reset_index(drop=True)


def schools_file(s: pd.DataFrame, geo: pd.DataFrame, layers: list[dict], stfp_by_usps: dict) -> dict:
    s = s.merge(geo, on="NCESSCH", how="left")
    assert s["LAT"].notna().all(), "fixture school without a geocode"
    values = {}
    for layer in layers:
        values[layer["id"]] = [num(v, config.GINI_DECIMALS if layer["unit"] == "gini" else 0) for v in s[layer["column"]]]
        if "pctColumn" in layer:
            values[f"{layer['id']}_pct"] = [num(v, 0) for v in s[layer["pctColumn"]]]
    fill = s["ct_fill_sources"].fillna("")
    return {
        "ids": list(s["NCESSCH"]),
        "name": list(s["Name"]),
        "district": list(s["School District"]),
        "st": list(s["State"]),
        "stfp": [stfp_by_usps[u] for u in s["State"]],
        "county": list(s["FIPS County Code"]),
        "countyName": list(s["County"]),
        "city": list(s["City"]),
        "zip": list(s["Zip Code"]),
        "sab": [int(v) for v in s["SAB Available"]],
        "lat": [round(float(v), config.COORD_DECIMALS) for v in s["LAT"]],
        "lon": [round(float(v), config.COORD_DECIMALS) for v in s["LON"]],
        "flags": [config.FLAG_CT_FILLED if f else 0 for f in fill],
        "values": values,
    }


def school_bbox(frame: pd.DataFrame) -> list[float]:
    d = config.COORD_DECIMALS
    return [round(float(frame.LON.min()), d), round(float(frame.LAT.min()), d),
            round(float(frame.LON.max()), d), round(float(frame.LAT.max()), d)]


def build() -> list[Path]:
    layers = read_catalog()
    df = read_csv()
    states_gdf, counties_gdf = load_boundaries()
    stfp_by_usps = dict(zip(states_gdf.STUSPS, states_gdf.STATEFP))
    usps_by_stfp = {v: k for k, v in stfp_by_usps.items()}
    df["STATEFP"] = df["State"].map(stfp_by_usps)
    assert df["STATEFP"].notna().all()

    geo = gpd.read_file(download.extract("geocodes") / config.DOWNLOADS["geocodes"]["shapefile"],
                        columns=["NCESSCH", "LAT", "LON"], ignore_geometry=True)
    geo["NCESSCH"] = geo["NCESSCH"].astype(str).str.zfill(12)

    written = []
    st_cent, st_bbox = centroid_bbox(states_gdf, "STATEFP")
    fixture_counties = counties_gdf[counties_gdf.GEOID.isin(COUNTIES)]
    missing = sorted(set(COUNTIES) - set(fixture_counties.GEOID))
    assert not missing, f"fixture counties not in the boundary file: {missing}"
    co_cent, co_bbox = centroid_bbox(fixture_counties, "GEOID")
    co_names = dict(zip(fixture_counties.GEOID, fixture_counties.NAMELSAD))

    written.append(write("states.topo.json", to_topo(states_gdf, "STATEFP", "states", config.STATES_SIMPLIFY_DEG)))
    written.append(write("counties.topo.json",
                         to_topo(fixture_counties, "GEOID", "counties", config.COUNTIES_SIMPLIFY_DEG)))

    st_names = dict(zip(states_gdf.STATEFP, states_gdf.NAME))
    written.append(write("states.json", {
        "ids": STATES,
        "usps": [usps_by_stfp[s] for s in STATES],
        "names": [st_names[s] for s in STATES],
        "n": [int((df.STATEFP == s).sum()) for s in STATES],
        "centroid": [st_cent[s] for s in STATES],
        "bbox": [st_bbox[s] for s in STATES],
        "measures": measures(df, "STATEFP", STATES, layers),
    }))
    counties = sorted(COUNTIES)
    written.append(write("counties.json", {
        "ids": counties,
        "st": [c[:2] for c in counties],
        "names": [co_names[c] for c in counties],
        "n": [int((df["FIPS County Code"] == c).sum()) for c in counties],
        "centroid": [co_cent[c] for c in counties],
        "bbox": [co_bbox[c] for c in counties],
        "measures": measures(df, "FIPS County Code", counties, layers),
    }))

    sample = sample_schools(df, counties)
    schools = schools_file(sample, geo, layers, stfp_by_usps)
    written.append(write("schools/all.json", schools))

    written.append(write("breaks.json", breaks(df, layers)))
    cols = [l["column"] for l in layers]
    national = {
        "layers": [l["id"] for l in layers],
        "schools": {
            **matrices(df, layers),
            "mean": {l["id"]: num(df[l["column"]].mean(), decimals_for(l)) for l in layers},
            "median": {l["id"]: num(df[l["column"]].median(), decimals_for(l)) for l in layers},
        },
        "counties": matrices(unit_means(df, "FIPS County Code", layers), layers),
        "states": matrices(unit_means(df, "State", layers), layers),
    }
    assert len(cols) == len(national["layers"])
    written.append(write("national.json", national))

    located = sample.merge(geo, on="NCESSCH")
    entries = [{"k": "state", "id": s, "n": st_names[s], "st": usps_by_stfp[s], "bb": st_bbox[s]} for s in STATES]
    entries += [{"k": "county", "id": c, "n": co_names[c], "st": usps_by_stfp[c[:2]], "bb": co_bbox[c]}
                for c in counties]
    for kind, col in (("city", "City"), ("district", "School District")):
        for (st, name), frame in sorted(located.groupby(["State", col])):
            entries.append({"k": kind, "id": f"{st}:{name}", "n": name, "st": st, "bb": school_bbox(frame)})
    written.append(write("gazetteer.json", {"entries": entries}))
    written.append(write("presets.json", {"presets": PRESETS}))

    catalog = json.loads(config.CATALOG_JSON.read_text())
    written.append(write("catalog.json", catalog))
    written.append(write("meta.json", {
        "build": "fixture",
        "dataVersion": config.DATA_VERSION,
        "odis": "v3 (2026)",
        "nces": "EDGE_GEOCODE_PUBLICSCH_2223",
        "census": "GENZ2023",
        "input": config.INPUT_CSV.name,
        "counts": {"schools": len(schools["ids"]), "states": len(STATES), "counties": len(counties),
                   "countyPolygons": len(fixture_counties)},
        "placeholders": {"connecticut": "filled"},
    }))
    return written
