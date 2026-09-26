"""presets.json: the five story presets of the layer dock (SPEC.md 3.8, Appendix B).

Each preset's ``view`` is a set of URL parameters (SPEC.md 3.10) that site/src/lib/urlCodec.ts decodes into a full
view state.  Nothing in a preset is typed in by hand that the data can supply:

- place cameras are fitted in the 1440x900 design viewport with the standard map padding, the way the app's camera
  helper frames a place: Los Angeles to the bbox of its schools (its polygon takes in two offshore islands) at no less
  than the county drill zoom, so it opens at the local level; the California pair to its two county bboxes;
- the crime-scale note quotes Spearman correlations computed from the input at the three levels.

Run: ``python -m analysis.schoolscape build`` (all outputs); gazetteer.json must be built first.
"""

import json
import math
from pathlib import Path

import pandas as pd

from . import config, fixtures, gazetteer

# The app's camera constants; these mirror site/src/store/useStore.ts (DEFAULT_CAMERA) and site/src/map/levels.ts.
NATION_CAMERA = {"zoom": 3.6, "lat": 38.5, "lon": -96.5}
VIEWPORT = (1440, 900)  # design viewport, width x height (SPEC.md 10.1)
MAP_PADDING = {"top": 72, "left": 332, "right": 412, "bottom": 96}
COUNTY_DRILL_MIN_ZOOM = 8.2
TILE_SIZE = 512  # MapLibre world size in pixels at zoom 0

# The layer pair whose correlation changes with the level it is measured at (SPEC.md 1.2, 2).
SCALE_PAIR = ("crime", "education")


def out_path() -> Path:
    """Reads config.OUT_DIR at call time so ``check`` can redirect it."""
    return config.OUT_DIR / "presets.json"


def mercator(lon: float, lat: float) -> tuple[float, float]:
    """Web Mercator world coordinates in [0, 1], y growing southward."""
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return (lon + 180) / 360, (1 - y / math.pi) / 2


def unmercator(x: float, y: float) -> tuple[float, float]:
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))
    return x * 360 - 180, lat


def fit(bbox: list[float], min_zoom: float = 0) -> dict:
    """The camera MapLibre's fitBounds lands on for ``bbox`` in VIEWPORT with MAP_PADDING, zoom at least min_zoom."""
    x0, y1 = mercator(bbox[0], bbox[1])
    x1, y0 = mercator(bbox[2], bbox[3])
    width, height = VIEWPORT
    inner_w = width - MAP_PADDING["left"] - MAP_PADDING["right"]
    inner_h = height - MAP_PADDING["top"] - MAP_PADDING["bottom"]
    scale = min(inner_w / ((x1 - x0) * TILE_SIZE), inner_h / ((y1 - y0) * TILE_SIZE))
    zoom = max(math.log2(scale), min_zoom)
    # The bbox center sits at the center of the padded area; the camera is the center of the whole viewport.
    world = TILE_SIZE * 2**zoom
    dx = (width / 2 - (MAP_PADDING["left"] + inner_w / 2)) / world
    dy = (height / 2 - (MAP_PADDING["top"] + inner_h / 2)) / world
    lon, lat = unmercator((x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy)
    return {"zoom": zoom, "lat": lat, "lon": lon}


def camera_param(camera: dict) -> str:
    """The URL `v` value, zoom/lat/lon with 2 decimals, as urlCodec.encodeCamera writes it."""
    return "/".join(f"{round(camera[k], 2):g}" for k in ("zoom", "lat", "lon"))


def union(*boxes: list[float]) -> list[float]:
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def spearman_by_level(df: pd.DataFrame, col_a: str, col_b: str) -> dict[str, float]:
    """Spearman of two columns across state means, county means, and schools; pairwise deletion, unrounded means."""
    pair = df[["State", "FIPS County Code", col_a, col_b]]
    frames = {
        "states": pair.groupby("State")[[col_a, col_b]].mean(),
        "counties": pair.groupby("FIPS County Code")[[col_a, col_b]].mean(),
        "schools": pair[[col_a, col_b]],
    }
    return {level: float(f[col_a].corr(f[col_b], method="spearman")) for level, f in frames.items()}


def scale_note(rho: dict[str, float]) -> str:
    levels = ("states", "counties", "schools")
    return "ρ = " + ", ".join(f"{rho[level]:.2f} across {level}" for level in levels)


def presets(df: pd.DataFrame, coords: pd.DataFrame, places: dict[str, dict], layers: dict[str, dict]) -> list[dict]:
    """The five presets of SPEC.md 3.8 in chip order.

    ``df`` is the input CSV, ``coords`` NCESSCH/LAT/LON, ``places`` gazetteer entries keyed by "{k}:{id}",
    ``layers`` catalog layers keyed by id.
    """
    nation = camera_param(NATION_CAMERA)
    la, sf = places["county:06037"], places["county:06075"]
    la_schools = coords[coords.NCESSCH.isin(df.loc[df["FIPS County Code"] == la["id"], "NCESSCH"])]
    la_camera = fit(gazetteer.points_bbox(la_schools), min_zoom=COUNTY_DRILL_MIN_ZOOM)
    rho = spearman_by_level(df, *(layers[i]["column"] for i in SCALE_PAIR))
    out = [
        {"id": "stress-usa", "label": "Where stress concentrates", "view": {"l": "composite", "v": nation}},
        {"id": "economic-education", "label": "Economic and education travel together",
         "view": {"l": "economic,education", "v": nation}},
        {"id": "crime-scale", "label": "Same pair, three answers", "view": {"l": ",".join(SCALE_PAIR), "v": nation},
         "note": scale_note(rho)},
        {"id": "la-education", "label": "Los Angeles by neighborhood",
         "view": {"l": "education", "sel": f"county:{la['id']}", "v": camera_param(la_camera)}},
        {"id": "california-north-south", "label": "North vs south California",
         "view": {"l": "housing,economic", "cmp": f"county:{sf['id']},county:{la['id']}",
                  "v": camera_param(fit(union(sf["bb"], la["bb"])))}},
    ]
    for preset in out:
        for layer_id in preset["view"]["l"].split(","):
            if layers[layer_id]["group"] == "context":
                raise SystemExit(f"preset {preset['id']} uses context layer {layer_id} (SPEC.md 4.3)")
    return out


def build(dry_run: bool) -> list[Path]:
    if dry_run:
        return []
    df = fixtures.read_csv()
    coords = gazetteer.school_coordinates()
    entries = json.loads(gazetteer.out_path().read_text())["entries"]
    places = {f"{e['k']}:{e['id']}": e for e in entries}
    layers = {layer["id"]: layer for layer in fixtures.read_catalog()}
    data = {"presets": presets(df, coords, places, layers)}
    path = out_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    return [path]
