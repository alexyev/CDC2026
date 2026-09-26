"""State and county aggregates, class breaks, and national baselines (SPEC.md 5.1, 5.2, 6.5, 8.2, Appendix B).

Writes states.json, counties.json, breaks.json, and national.json to site/public/data/v1/.
Area values are unweighted means of the non-missing school values; breaks and correlations use the unrounded means.
"""

import importlib
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

from . import config
from .schools import joined, mean_decimals, num, read_catalog, read_counties, read_states, write_json

FILES = ("states.json", "counties.json", "breaks.json", "national.json")


def crosses_antimeridian(bounds: tuple[float, float, float, float]) -> bool:
    return bounds[0] < -170 and bounds[2] > 170


def bbox(geom) -> list[float]:
    """[minLon, minLat, maxLon, maxLat]; a shape split by the antimeridian (Alaska, the Aleutians) keeps its
    western-hemisphere parts so the box never wraps the globe."""
    bounds = geom.bounds
    if crosses_antimeridian(bounds) and hasattr(geom, "geoms"):
        west = [g for g in geom.geoms if g.centroid.x < 0]
        bounds = gpd.GeoSeries(west).total_bounds
    d = config.COORD_DECIMALS
    return [round(float(v), d) for v in bounds]


def local_centroids(gdf: gpd.GeoDataFrame, id_col: str) -> dict[str, list[float]]:
    """Area centroids computed in EPSG:5070 (CONUS Albers), returned as [lon, lat] rounded to 5 decimals."""
    points = gdf.to_crs(5070).centroid.to_crs(4326)
    d = config.COORD_DECIMALS
    return {i: [round(p.x, d), round(p.y, d)] for i, p in zip(gdf[id_col], points)}


def centroids_and_bboxes(level: str, gdf: gpd.GeoDataFrame, id_col: str) -> tuple[dict, dict]:
    """P1's ``boundaries.centroids`` / ``boundaries.bboxes`` when available (config.py docstring), else the same
    rules computed here, so the aggregates always match the polygons."""
    try:
        boundaries = importlib.import_module(f"{__package__}.boundaries")
    except ModuleNotFoundError as err:
        if err.name != f"{__package__}.boundaries":
            raise
        boundaries = None
    if boundaries is not None and hasattr(boundaries, "centroids") and hasattr(boundaries, "bboxes"):
        cents, boxes = boundaries.centroids(level), boundaries.bboxes(level)
        return ({k: [float(v[0]), float(v[1])] for k, v in cents.items()},
                {k: [float(x) for x in v] for k, v in boxes.items()})
    return local_centroids(gdf, id_col), {i: bbox(g) for i, g in zip(gdf[id_col], gdf.geometry)}


def unit_means(frame: pd.DataFrame, key: str, layers) -> pd.DataFrame:
    """Unrounded per-unit means of every layer, one row per unit that has at least one school."""
    return frame.groupby(key)[[layer["column"] for layer in layers]].mean()


def measures(frame: pd.DataFrame, key: str, ids: list[str], layers) -> dict:
    """{layer id: {mean, median, n}} aligned with ``ids``; units without a value get null and n 0."""
    grouped = frame.groupby(key)
    out = {}
    for layer in layers:
        col, d = layer["column"], mean_decimals(layer)
        mean, median, n = grouped[col].mean(), grouped[col].median(), grouped[col].count()
        out[layer["id"]] = {
            "mean": [num(mean.get(i), d) for i in ids],
            "median": [num(median.get(i), d) for i in ids],
            "n": [int(n.get(i, 0)) for i in ids],
        }
    return out


def area_file(frame: pd.DataFrame, gdf: gpd.GeoDataFrame, level: str, id_col: str, name_col: str, key: str,
              layers) -> dict:
    ids = list(gdf[id_col])
    cents, boxes = centroids_and_bboxes(level, gdf, id_col)
    counts = frame.groupby(key).size()
    return {
        "ids": ids,
        "names": list(gdf[name_col]),
        "n": [int(counts.get(i, 0)) for i in ids],
        "centroid": [cents[i] for i in ids],
        "bbox": [boxes[i] for i in ids],
        "measures": measures(frame, key, ids, layers),
    }


def quantiles(values: np.ndarray, qs: tuple[float, ...], decimals: int) -> list:
    """numpy's default (linear) quantiles, rounded after interpolation (SPEC.md 8.3)."""
    if len(values) == 0:
        return [None] * len(qs)
    return [num(np.quantile(values, q), decimals) for q in qs]


def breaks(frame: pd.DataFrame, layers) -> dict:
    """Quintile and tercile breaks per layer at each level: nation over state means, state over county means,
    local over schools (SPEC.md 5.2)."""
    units = {
        "nation": unit_means(frame, "STATEFP", layers),
        "state": unit_means(frame, "FIPS County Code", layers),
        "local": frame,
    }
    out = {}
    for layer in layers:
        col, d = layer["column"], mean_decimals(layer)
        out[layer["id"]] = {}
        for level, table in units.items():
            v = table[col].dropna().to_numpy(dtype=float)
            out[layer["id"]][level] = {"quint": quantiles(v, config.QUINTILES, d),
                                       "terc": quantiles(v, config.TERCILES, d)}
    return out


def matrices(table: pd.DataFrame, layers) -> dict:
    """Pairwise-deletion Spearman (average ranks) and Pearson matrices indexed like ``layers``."""
    sub = table[[layer["column"] for layer in layers]]
    d = config.CORRELATION_DECIMALS

    def clean(m: pd.DataFrame) -> list[list]:
        return [[num(v, d) for v in row] for row in m.to_numpy()]

    return {"n": int(len(sub)), "spearman": clean(sub.corr(method="spearman")), "pearson": clean(sub.corr())}


def national(frame: pd.DataFrame, layers) -> dict:
    return {
        "layers": [layer["id"] for layer in layers],
        "schools": {
            **matrices(frame, layers),
            "mean": {layer["id"]: num(frame[layer["column"]].mean(), mean_decimals(layer)) for layer in layers},
            "median": {layer["id"]: num(frame[layer["column"]].median(), mean_decimals(layer)) for layer in layers},
        },
        "counties": matrices(unit_means(frame, "FIPS County Code", layers), layers),
        "states": matrices(unit_means(frame, "STATEFP", layers), layers),
    }


def build(dry_run: bool) -> list[Path]:
    paths = [config.OUT_DIR / f for f in FILES]
    if dry_run:
        return paths
    layers = read_catalog()
    frame = joined().frame
    states, counties = read_states(), read_counties()

    missing = sorted(set(frame["FIPS County Code"]) - set(counties.GEOID))
    if missing:
        raise SystemExit(f"{len(missing)} ODIS county FIPS codes have no boundary polygon: {missing[:10]}")

    st = {**area_file(frame, states, "states", "STATEFP", "NAME", "STATEFP", layers), "usps": list(states.STUSPS)}
    co = {**area_file(frame, counties, "counties", "GEOID", "NAMELSAD", "FIPS County Code", layers),
          "st": list(counties.STATEFP)}

    return [
        write_json(paths[0], st),
        write_json(paths[1], co),
        write_json(paths[2], breaks(frame, layers)),
        write_json(paths[3], national(frame, layers)),
    ]
