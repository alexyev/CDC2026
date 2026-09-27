# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""Census cartographic boundaries -> states.topo.json and counties.topo.json, plus centroids and bboxes (SPEC.md 8).

Inputs are the 2023 1:5m state and county shapefiles, downloaded once into .cache/schoolscape/ and verified by SHA-256
(download.py).  The four territories with no ODIS rows are dropped; Puerto Rico and DC stay (SPEC.md 8.3).

Outputs, in site/public/data/v1/ (SPEC.md Appendix B):

- ``states.topo.json``: one object ``states``, 52 geometries with id = STATEFP and properties {"name": NAME}.
- ``counties.topo.json``: one object ``counties``, 3,222 geometries with id = GEOID and properties {"name": NAME}.

``centroids()`` and ``bboxes()`` are the helpers P2 uses for states.json and counties.json (signatures in config.py).
"""

import functools
import gzip
import itertools
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
import topojson

from . import config, download

LEVELS = {
    "states": {"download": "states_5m", "id": "STATEFP", "simplify": config.STATES_SIMPLIFY_DEG, "count": 52},
    "counties": {"download": "counties_5m", "id": "GEOID", "simplify": config.COUNTIES_SIMPLIFY_DEG, "count": 3222},
}

# Measured gzip sizes from SPEC.md 8.2; outputs must stay within SIZE_TOLERANCE of them.
EXPECTED_GZIP_BYTES = {"states": 38_000, "counties": 309_000}
SIZE_TOLERANCE = 0.2


def out_path(level: str) -> Path:
    """Output file for ``level``; reads config.OUT_DIR at call time so ``check`` can redirect it."""
    return config.OUT_DIR / f"{config.TOPO_OBJECTS[level]}.topo.json"


@functools.cache
def load(level: str) -> gpd.GeoDataFrame:
    """Kept boundary polygons of ``level`` ("states" or "counties") in EPSG:4326, sorted by id, with columns id, name,
    and geometry."""
    spec = LEVELS[level]
    key = spec["download"]
    shp = download.extract(key) / (config.DOWNLOADS[key]["url"].rsplit("/", 1)[-1].removesuffix(".zip") + ".shp")
    gdf = gpd.read_file(shp, columns=["STATEFP", spec["id"], "NAME"])
    gdf = gdf[~gdf.STATEFP.isin(config.EXCLUDED_STATEFP)]
    gdf = gdf.rename(columns={spec["id"]: "id", "NAME": "name"})[["id", "name", "geometry"]]
    gdf = gdf.to_crs(4326).sort_values("id").reset_index(drop=True)
    if len(gdf) != spec["count"] or not gdf.id.is_unique:
        raise SystemExit(f"{level}: expected {spec['count']} unique polygons, got {len(gdf)}")
    return gdf


def centroids(level: str) -> dict[str, tuple[float, float]]:
    """Unit id (STATEFP or GEOID) to (lon, lat) area centroid, computed in EPSG:5070 and rounded to 5 decimals."""
    gdf = load(level)
    points = gdf.to_crs(5070).centroid.to_crs(4326)
    d = config.COORD_DECIMALS
    return {i: (round(p.x, d), round(p.y, d)) for i, p in zip(gdf.id, points)}


def bboxes(level: str) -> dict[str, tuple[float, float, float, float]]:
    """Unit id to (minLon, minLat, maxLon, maxLat), rounded to 5 decimals.

    Alaska and the Aleutians West Census Area have western Aleutian islands east of the antimeridian; their bbox keeps
    only the western-hemisphere parts so it never spans the globe.  No ODIS school lies on the dropped islands.
    """
    gdf = load(level)
    d = config.COORD_DECIMALS
    return {i: tuple(round(float(v), d) for v in western_bounds(g)) for i, g in zip(gdf.id, gdf.geometry)}


def western_bounds(geom) -> tuple[float, float, float, float]:
    """Bounds of ``geom``, ignoring its eastern-hemisphere parts when it also has western-hemisphere parts."""
    minx, _, maxx, _ = geom.bounds
    if minx < -90 and maxx > 90:
        parts = [p for p in getattr(geom, "geoms", [geom]) if p.bounds[2] <= 0]
        if parts:
            return tuple(gpd.GeoSeries(parts).total_bounds)
    return geom.bounds


def to_topo(level: str) -> dict:
    """TopoJSON of ``level``: quantized, topology-preserving simplification, id and name on every geometry."""
    name = config.TOPO_OBJECTS[level]
    gdf = load(level).set_index("id", drop=False)
    topo = topojson.Topology(
        gdf, object_name=name, prequantize=config.TOPO_QUANTIZATION, toposimplify=LEVELS[level]["simplify"]
    )
    data = json.loads(topo.to_json())
    for geom in data["objects"][name]["geometries"]:
        if geom.get("type") not in ("Polygon", "MultiPolygon"):
            raise SystemExit(f"{level}: geometry {geom.get('id')} simplified to {geom.get('type')}")
        props = geom.pop("properties")
        geom["id"] = props["id"]
        geom["properties"] = {"name": props["name"]}
    drop_collapsed_rings(data, name)
    return data


def drop_collapsed_rings(data: dict, name: str) -> None:
    """Removes rings that simplification collapsed to fewer than three distinct points, then unused arcs.

    These are enclave slivers of a few hundred square meters (in Denver, Arapahoe, Jefferson CO, and Fairfax VA).  An
    enclave and the hole around it share one arc, so both sides disappear together and the topology stays consistent.
    A collapsed outer ring drops its whole polygon; a geometry that loses every polygon is an error.
    """
    geometries = data["objects"][name]["geometries"]
    # Arcs are delta-encoded: the first position is absolute, the rest are offsets from the previous one.
    points = [set(itertools.accumulate(map(tuple, arc), add)) for arc in data["arcs"]]

    def collapsed(ring: list[int]) -> bool:
        return len(set().union(*(points[arc_index(i)] for i in ring))) < 3

    for geom in geometries:
        kept = [[r for r in rings if not collapsed(r)] for rings in polygons(geom) if not collapsed(rings[0])]
        if not kept:
            raise SystemExit(f"{name}: geometry {geom['id']} collapsed entirely")
        set_polygons(geom, kept)

    used = sorted({arc_index(i) for g in geometries for rings in polygons(g) for ring in rings for i in ring})
    new_index = {old: new for new, old in enumerate(used)}
    for geom in geometries:
        remap = [[[new_index[i] if i >= 0 else ~new_index[~i] for i in r] for r in rings] for rings in polygons(geom)]
        set_polygons(geom, remap)
    data["arcs"] = [data["arcs"][i] for i in used]


def add(a: tuple[int, int], b: tuple[int, int]) -> tuple[int, int]:
    return a[0] + b[0], a[1] + b[1]


def arc_index(i: int) -> int:
    """TopoJSON arc reference to arc index; a negative reference ~i means arc i reversed."""
    return i if i >= 0 else ~i


def polygons(geom: dict) -> list[list[list[int]]]:
    return [geom["arcs"]] if geom["type"] == "Polygon" else geom["arcs"]


def set_polygons(geom: dict, polys: list[list[list[int]]]) -> None:
    geom["type"], geom["arcs"] = ("Polygon", polys[0]) if len(polys) == 1 else ("MultiPolygon", polys)


def odis_county_ids() -> set[str]:
    df = pd.read_csv(config.INPUT_CSV, usecols=["FIPS County Code"], dtype=str, keep_default_na=False)
    return set(df["FIPS County Code"])


def serialize(data) -> bytes:
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def build(dry_run: bool) -> list[Path]:
    if dry_run:
        return []
    missing = sorted(odis_county_ids() - set(load("counties").id))
    if missing:
        raise SystemExit(f"ODIS county FIPS codes with no boundary polygon: {missing}")
    written = []
    for level in LEVELS:
        body = serialize(to_topo(level))
        size = len(gzip.compress(body, 9))
        expected = EXPECTED_GZIP_BYTES[level]
        if abs(size - expected) > SIZE_TOLERANCE * expected:
            raise SystemExit(f"{level}.topo.json is {size} bytes gzipped, more than 20% from {expected}")
        path = out_path(level)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        written.append(path)
    return written
