"""presets.json: the narrated data stories of the layer dock (SPEC.md 3.8, Appendix B).

The stories walk through STORY.md in order: the map, what the data says nationally, how it differs by region, one
formula against graduation rates, and where a lawmaker would look first.  Each preset's ``view`` is a set of URL
parameters (SPEC.md 3.10) that site/src/lib/urlCodec.ts decodes into a full view state, and its ``narration`` and
``caveat`` are shown in the story card when the view loads.  Nothing in a preset is typed in by hand that the data
can supply:

- place cameras are fitted in the 1440x900 design viewport with the standard map padding, the way the app's camera
  helper frames a place;
- every number in a narration is read from the committed analysis tables in visualizations/ (sections 03, 04, and
  05 of visualizations/README.md), or, for the school count and national median, from the input CSV, so a rerun of
  the analyses that moves a number shows up in ``python -m analysis.schoolscape check``.

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
# While a story is open its card sits at the bottom of the map area and camera fits keep clear of it
# (site/src/map/camera.ts mapPadding); place stories are framed the same way, with the card's height at 1440x900.
STORY_PADDING = {**MAP_PADDING, "bottom": 300}
TILE_SIZE = 512  # MapLibre world size in pixels at zoom 0

VIS_DIR = config.ROOT / "visualizations"
REGIONAL = VIS_DIR / "03-regional-variation"
NATIONAL = VIS_DIR / "04-national-relationships"
WEIGHTS = VIS_DIR / "05-regional-weights"

DOMAINS = ("Economic", "Education", "Health", "Housing", "Crime")
MAINLAND = ("Northeast", "Midwest", "South", "Pacific Northwest", "California", "Mountain & Southwest")
MINUS = "−"


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


def fit(bbox: list[float], min_zoom: float = 0, padding: dict = MAP_PADDING) -> dict:
    """The camera MapLibre's fitBounds lands on for ``bbox`` in VIEWPORT with ``padding``, zoom at least min_zoom."""
    x0, y1 = mercator(bbox[0], bbox[1])
    x1, y0 = mercator(bbox[2], bbox[3])
    width, height = VIEWPORT
    inner_w = width - padding["left"] - padding["right"]
    inner_h = height - padding["top"] - padding["bottom"]
    scale = min(inner_w / ((x1 - x0) * TILE_SIZE), inner_h / ((y1 - y0) * TILE_SIZE))
    zoom = max(math.log2(scale), min_zoom)
    # The bbox center sits at the center of the padded area; the camera is the center of the whole viewport.
    world = TILE_SIZE * 2**zoom
    dx = (width / 2 - (padding["left"] + inner_w / 2)) / world
    dy = (height / 2 - (padding["top"] + inner_h / 2)) / world
    lon, lat = unmercator((x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy)
    return {"zoom": zoom, "lat": lat, "lon": lon}


def camera_param(camera: dict) -> str:
    """The URL `v` value, zoom/lat/lon with 2 decimals, as urlCodec.encodeCamera writes it."""
    return "/".join(f"{round(camera[k], 2):g}" for k in ("zoom", "lat", "lon"))


def union(*boxes: list[float]) -> list[float]:
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


# --- Number formats for the narrations ---

def rho(value: float) -> str:
    """A Spearman coefficient to 2 decimals, with a true minus sign."""
    text = f"{value:.2f}"
    return text.replace("-", MINUS)


def share(value: float) -> str:
    return f"{round(value * 100)}%"


def points(value: float) -> str:
    """Graduation percentage points, unsigned, to 1 decimal."""
    return f"{abs(value):.1f}"


def ordinal(value: float) -> str:
    n = round(value)
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def one(frame: pd.DataFrame, **match) -> pd.Series:
    """The single row of ``frame`` whose columns equal ``match``."""
    rows = frame
    for column, value in match.items():
        rows = rows[rows[column] == value]
    if len(rows) != 1:
        raise SystemExit(f"expected one row for {match}, found {len(rows)}")
    return rows.iloc[0]


def findings(df: pd.DataFrame) -> dict[str, str]:
    """Every number the narrations quote, formatted, with the analysis table it comes from."""
    summary = pd.read_csv(REGIONAL / "region_summary.csv")
    variance = pd.read_csv(REGIONAL / "variance_decomposition.csv")
    by_region = pd.read_csv(REGIONAL / "correlations_by_region.csv")
    heterogeneity = pd.read_csv(REGIONAL / "correlation_heterogeneity.csv")
    drivers = pd.read_csv(REGIONAL / "drivers_by_region.csv")
    pairs = pd.read_csv(NATIONAL / "spearman_pairs.csv")
    attainment = pd.read_csv(NATIONAL / "attainment_model_coefficients.csv")
    effects = pd.read_csv(WEIGHTS / "domain_effects.csv")
    effects = effects[effects["spec"] == "Five domains"]
    weights_variance = pd.read_csv(WEIGHTS / "composite_variance_shares.csv")
    rank_change = pd.read_csv(WEIGHTS / "rank_change_by_region.csv")
    counties = pd.read_csv(WEIGHTS / "county_rank_change.csv", dtype={"FIPS County Code": str})

    f: dict[str, str] = {}
    f["schools"] = f"{len(df):,}"
    f["national_median"] = f"{df['Composite Score'].median():.0f}"

    # 03: the South's composite, its Cliff's delta as a win rate (ties count half), and where the variance lives.
    south = one(summary, region="South", measure="Composite Score")
    f["south_median"] = f"{south['median']:.0f}"
    f["south_wins"] = share((1 + south["cliffs_delta_vs_rest"]) / 2)
    composite = one(variance, measure="Composite Score")
    f["region_share"] = share(composite["share_region"])
    f["county_share"] = share(composite["share_county_within_state"])

    # 04: broadband and adult attainment.
    pair = one(pairs, measure_a="Access to broadband internet", measure_b="2-year college or higher")
    f["broadband_rho"] = rho(pair["rho_school"])
    f["broadband_n"] = f"{pair['n_schools']:,}"
    main = attainment[attainment["sample"] == "Main model"]
    f["broadband_coef"] = f"{one(main, predictor='Access to broadband internet')['coef_points_per_sd']:.1f}"
    f["other_predictors"] = f"{len(main) - 1}"

    # 03: Education and Health by region, and how many domain pairs differ.
    pair = "Education - Health"
    for key, region in (("ca", "California"), ("ne", "Northeast"), ("south", "South")):
        f[f"edhealth_{key}"] = rho(one(by_region, pair=pair, region=region)["spearman"])
    if one(heterogeneity, pair=pair)["wald_p"] >= 0.001:
        raise SystemExit("the Education - Health heterogeneity test no longer has p < 0.001")
    f["pairs_differ"] = f"{(heterogeneity['wald_p'] < 0.05).sum()}"
    f["pairs_total"] = f"{len(heterogeneity)}"

    # 04 and 03: Housing against the other domains nationally, and the West's affordability twist.
    housing = pairs[
        pairs["measure_a"].isin(DOMAINS) & pairs["measure_b"].isin(DOMAINS)
        & ((pairs["measure_a"] == "Housing") | (pairs["measure_b"] == "Housing"))
    ]["rho_school"]
    f["housing_low"], f["housing_high"] = rho(housing.min()), rho(housing.max())
    west = {rho(one(drivers, region=r, measure="Housing affordability")["loo_spearman"])
            for r in ("California", "Pacific Northwest")}
    if len(west) != 1:
        raise SystemExit("California and the Pacific Northwest no longer share one affordability association")
    f["west_affordability"] = west.pop()
    f["south_housing"] = rho(one(drivers, region="South", measure="Housing")["loo_spearman"])

    # 05: Health against graduation, Crime's weight in the composite, and how far regional weights move schools.
    health = effects[effects["domain"] == "Health"].set_index("region")["coef"]
    f["health_midwest"], f["health_northeast"] = points(health["Midwest"]), points(health["Northeast"])
    strong = health[["Midwest", "South", "Mountain & Southwest"]]
    f["health_low"], f["health_high"] = points(strong.max()), points(strong.min())
    crime = effects[(effects["domain"] == "Crime") & effects["region"].isin(MAINLAND)]
    if ((crime["ci_low"] > 0) | (crime["ci_high"] < 0)).any():
        raise SystemExit("Crime is now significantly linked to graduation in some region")
    f["crime_share"] = share(one(weights_variance, domain="Crime")["share_of_composite_variance"])
    f["moved"] = share(one(rank_change, region="All schools")["share_moving_10_or_more"])
    oneida = one(counties, **{"FIPS County Code": "55085"})
    f["oneida_odis"], f["oneida_regional"] = ordinal(oneida["mean_odis_percentile"]), ordinal(
        oneida["mean_regional_percentile"]
    )

    # 03: where a lawmaker would look first.
    for key, region, measure in (
        ("midwest_infant", "Midwest", "Infant mortality rate"),
        ("midwest_violent", "Midwest", "Violent crime rate"),
        ("south_single_parent", "South", "Single-parent households"),
        ("south_broadband", "South", "Access to broadband internet"),
    ):
        f[key] = rho(one(drivers, region=region, measure=measure)["loo_spearman"])
    return f


def presets(df: pd.DataFrame, places: dict[str, dict], layers: dict[str, dict]) -> list[dict]:
    """The stories of SPEC.md 3.8 in story order.

    ``df`` is the input CSV, ``places`` gazetteer entries keyed by "{k}:{id}", ``layers`` catalog layers keyed by id.
    """
    f = findings(df)
    nation = camera_param(NATION_CAMERA)
    california, florida, wisconsin = places["state:06"], places["state:12"], places["state:55"]
    oneida = places["county:55085"]
    # California's coast from Marin to San Diego, where its least affordable housing is.
    coast = union(places["county:06041"]["bb"], places["county:06073"]["bb"])
    out = [
        {
            "id": "where-stress-concentrates",
            "label": "Where stress concentrates",
            "chapter": "The map",
            "view": {"l": "composite", "v": nation},
            "narration": (
                f"All {f['schools']} US public high schools, colored by the neighborhood around each. "
                f"The bright band is the South: median Composite Score {f['south_median']} against "
                f"{f['national_median']} nationally, and more stressed than a school elsewhere in {f['south_wins']} "
                "of pairings. "
                f"Yet {f['county_share']} of the differences lie between counties of the same state, against "
                f"{f['region_share']} between regions, so zoom in."
            ),
            "caveat": "ODIS measures conditions around a school, not its students or anyone's psychological stress.",
        },
        {
            "id": "broadband-attainment",
            "label": "Digital divide, education divide",
            "chapter": "Nationally",
            "view": {"l": "broadband,college_2yr_plus", "v": nation},
            "narration": (
                "Where more households lack broadband, fewer adults hold a college degree: "
                f"ρ = {f['broadband_rho']} across {f['broadband_n']} schools, the second-strongest link across "
                "domains. "
                f"Even with {f['other_predictors']} other conditions held fixed, missing broadband is the strongest "
                f"predictor of low adult attainment, {f['broadband_coef']} points per standard deviation (SD)."
            ),
            "caveat": "An association across neighborhoods, not proof that wiring homes would raise degrees.",
        },
        {
            "id": "education-health-by-region",
            "label": "Same pair, different regions",
            "chapter": "Region by region",
            "view": {
                "l": "education,health",
                "cmp": f"state:{california['id']},state:{florida['id']}",
                "v": camera_param(fit(union(california["bb"], florida["bb"]), padding=STORY_PADDING)),
            },
            "narration": (
                "Education and health stress rise together, but how tightly depends on the region: "
                f"ρ = {f['edhealth_ca']} in California and {f['edhealth_ne']} in the Northeast, only "
                f"{f['edhealth_south']} in the South (p < 0.001). "
                f"{f['pairs_differ']} of the {f['pairs_total']} domain pairs differ by region; the panel recomputes "
                "this one live for California and Florida."
            ),
            "caveat": "Regions are a choice, and states within one region can differ as much as regions do.",
        },
        {
            "id": "west-housing",
            "label": "Housing runs backwards in the West",
            "chapter": "Region by region",
            "view": {
                "l": "affordability,economic",
                "sel": f"state:{california['id']}",
                "v": camera_param(fit(coast, padding=STORY_PADDING)),
            },
            "narration": (
                f"Nationally, Housing barely moves with the other domains (ρ = {f['housing_low']} to "
                f"{f['housing_high']}). "
                "In California and the Pacific Northwest it runs backwards: unaffordable housing sits in otherwise "
                f"less stressed places (ρ = {f['west_affordability']}), which a composite ranking would miss. "
                f"In the South, housing is barely tied to the rest (ρ = {f['south_housing']})."
            ),
            "caveat": "ODIS housing is vacancy, affordability, and park access; it does not measure homelessness.",
        },
        {
            "id": "one-formula",
            "label": "One formula does not fit everywhere",
            "chapter": "Graduation rates",
            "view": {
                "l": "composite,vacancy",
                "sel": f"county:{oneida['id']}",
                "v": camera_param(fit(wisconsin["bb"], padding=STORY_PADDING)),
            },
            "narration": (
                "The composite weighs domains equally everywhere; graduation does not. "
                f"One SD more Health stress goes with {f['health_midwest']} points lower graduation in the Midwest "
                f"but {f['health_northeast']} in the Northeast, and Crime, {f['crime_share']} of the composite's "
                "spread, predicts it in no region. "
                f"Reweighting moves {f['moved']} of schools 10+ percentiles. Oneida County's lake schools, selected "
                "here, top the vacancy scale from vacation homes and fall from the "
                f"{f['oneida_odis']} to the {f['oneida_regional']}."
            ),
            "caveat": "Graduation is one outcome, and these are associations within states, not causes.",
        },
        {
            "id": "where-to-look",
            "label": "Where a lawmaker would look first",
            "chapter": "So what",
            "view": {"l": "health", "v": nation},
            "narration": (
                "If graduation is the goal, start with Health, the domain that tracks it: "
                f"{f['health_low']} to {f['health_high']} points per SD in the Midwest, South, and Mountain & "
                "Southwest. "
                "Within regions, the numbers point to infant mortality and violent crime in the Midwest "
                f"(ρ = {f['midwest_infant']}, {f['midwest_violent']}) and to single-parent households and missing "
                f"broadband in the South ({f['south_single_parent']}, {f['south_broadband']})."
            ),
            "caveat": "This is where the numbers point, not proof of what policy would work.",
        },
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
    entries = json.loads(gazetteer.out_path().read_text())["entries"]
    places = {f"{e['k']}:{e['id']}": e for e in entries}
    layers = {layer["id"]: layer for layer in fixtures.read_catalog()}
    data = {"presets": presets(df, places, layers)}
    path = out_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    return [path]
