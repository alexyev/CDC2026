#!/usr/bin/env python3
# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""Fill the Connecticut gaps in the ODIS v3 data from current public sources.

ODIS v3 leaves many Connecticut cells empty, for two join reasons rather than
for lack of data (see data/README.md, "Connecticut fill"):

1. Census columns for the 96 CT schools without a School Attendance Boundary.
   ODIS maps their ZIP to tracts with the 2010 ZCTA-tract file, whose CT tract
   IDs no longer exist since the 2022 planning-region renumbering.
   Here: the same ODIS method (population-weighted average of the tracts that
   intersect the school's ZIP), with the 2020 ZCTA-tract file relabelled to
   2022 CT tract codes, on ACS 2019-2023 5-year data (the vintage ODIS used).
2. Single-parent households: County Health Rankings (CHR) 2025, by planning region.
3. Low birth weight and infant mortality: CT Department of Public Health 2024
   Registration Report, Tables 19 and 6, by planning region.
4. Lead exposure risk: the City Health Dashboard (CHD) lead index recomputed
   from ACS 2019-2023 tract data statewide.  Park access: CHR 2025 Access to
   Parks by planning region, as a proxy.

The Economic, Education, Health, Housing, and Composite scores and percentile
ranks of CT rows are then recomputed with ODIS's own weights, which this script
first verifies against every other row.  Crime stays missing.

Before filling, the script checks its method against ODIS itself: it
recomputes every ACS indicator for the 10,000+ non-CT schools without an SAB
with ODIS's exact method, fits ODIS's min-max scaling from them, and reports
how often the result equals the ODIS value.  All validation results print to
stdout.

Output (the input files are never modified):
  data/index_scores_v3_2026_ct_filled.csv  the fixed ODIS file with CT filled,
      plus a ct_fill_sources column naming what was filled from where.
      Every non-CT row is byte-for-byte the fixed file's row plus an empty
      ct_fill_sources field.

Usage: .venv/bin/python scripts/fill_connecticut.py
Needs pandas and openpyxl (requirements.txt).  Downloads are cached in
.cache/ct/ (gitignored) and pinned by SHA-256; the first run fetches about
1 GB of ACS tables and takes around 20 minutes.
"""

import hashlib
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import openpyxl
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "ct"
FIXED_CSV = ROOT / "data" / "index_scores_v3_2026_fixed.csv"
FILLED_CSV = ROOT / "data" / "index_scores_v3_2026_ct_filled.csv"
PROVENANCE = "ct_fill_sources"

# Pinned source files: (URL, SHA-256).
SOURCES = {
    # Census 2010 ZCTA-to-tract relationship file, the one ODIS v3 used; here
    # only to reproduce ODIS on non-CT schools.
    "zcta_tract_2010.txt": (
        "https://www2.census.gov/geo/docs/maps-data/data/rel/zcta_tract_rel_10.txt",
        "668a790081a467f1c1a1f4e47c1d41aadd33600b99bdbef8abf6d4dd2ba0d37f",
    ),
    # Census 2020 ZCTA-to-tract relationship file (2020 tract codes).
    "zcta_tract_2020.txt": (
        "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt",
        "6a25d8c3fff4cf612c4d2dccc2c0cd6cb5bc99b807ff3d5d107a2e9b9d68dde0",
    ),
    # CT Data Collaborative 2020-to-2022 CT tract crosswalk, pinned to a commit.
    "ct_tract_crosswalk.csv": (
        "https://raw.githubusercontent.com/CT-Data-Collaborative/2022-tract-crosswalk/"
        "5dc032c0aadf1e79e834f97367d0c4e29604e6be/2022tractcrosswalk.csv",
        "89b3c1c1b4469fcdb3d348c519ebd04daf3f9e002408c4441d22b090e8fe1951",
    ),
    # County Health Rankings 2023 release, the one ODIS v3 used; here only to
    # recover ODIS's scaling of the county-level indicators.
    "chr_2023.csv": (
        "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2023_0.csv",
        "362541ea56a0c6f0d449c7f470c0e02af851a46952d574dc080c08b054598e56",
    ),
    # County Health Rankings 2025 release, which has CT planning regions.
    "chr_2025.csv": (
        "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2025_v3.csv",
        "5a129b856489fe6646013d7fcf85397dd576f6d67a65f5db72738a1df29643de",
    ),
    # CT DPH Vital Statistics Registration Report tables, 2024.
    "ct_dph_rr2024.xlsx": (
        "https://portal.ct.gov/dph/-/media/departments-and-agencies/dph/vital-statistics/"
        "registration-reports/tables/rr2024_v20260727.xlsx",
        "b918aa6a9535a8d9b5e50ea02505cb0be5669071a0e90c4912ce90b71bd8f18e",
    ),
    # The census tracts City Health Dashboard reports on: the pool its lead
    # index deciles are ranked within.
    "chd_tracts.csv": (
        "https://www.cityhealthdashboard.com/api/tract-geographic-identifiers.csv",
        "b6763e79362b0f6bc0674ab7765bad7714d9bb70718997edf4342b9f07e1977d",
    ),
    # ODIS v2 (2024), which still had values for the 96 CT schools; here only
    # as a sanity check.  NYU's server omits its intermediate certificate, so
    # Python cannot verify it (see UNVERIFIED_TLS).
    "odis_v2.csv": (
        "https://ultraviolet.library.nyu.edu/api/records/t94md-edc80/files/index_scores_v2_2024.csv/content",
        "8dd1aadbddca7ecbb1028531b0e035d3c02ebd7a26c75de12a277ed12b49ee9e",
    ),
}

# Hosts whose TLS chain Python cannot verify because the server does not send
# its intermediate certificate.  Downloads from them are still checked against
# the pinned SHA-256, which is what guarantees the content.
UNVERIFIED_TLS = {"ultraviolet.library.nyu.edu"}

# ACS 2019-2023 5-year tract tables, fetched state by state from the
# data.census.gov table API (no key needed; the national request times out for
# the larger subject tables).  Only the listed variables are kept, in a CSV
# whose SHA-256 is pinned.
ACS_API = "https://data.census.gov/api/access/data/table?id={table}&g=040XX00US{state}$1400000"
ACS_TABLES = {
    "ACSDT5Y2023.B01003": ["B01003_001E"],
    "ACSDT5Y2023.B17020": ["B17020_002E", "B17020_004E", "B17020_005E"],
    "ACSDT5Y2023.B28002": ["B28002_001E", "B28002_004E"],
    "ACSST5Y2023.S1602": ["S1602_C01_001E", "S1602_C03_001E"],
    "ACSST5Y2023.S2701": ["S2701_C03_003E"],
    "ACSST5Y2023.S2201": ["S2201_C04_009E"],
    "ACSDT5Y2023.B15002": [f"B15002_{i:03d}E" for i in range(1, 36)],
    "ACSDT5Y2023.B25002": ["B25002_001E", "B25002_003E"],
    "ACSST5Y2023.S2503": [f"S2503_C02_{i:03d}E" for i in (*range(2, 13), 28, 32, 36, 40, 44)],
    "ACSDT5Y2023.B02001": [f"B02001_{i:03d}E" for i in range(1, 9)],
    "ACSDT5Y2023.B03002": ["B03002_001E", "B03002_012E"],
    "ACSDT5Y2023.B25034": [f"B25034_{i:03d}E" for i in range(1, 12)],
    "ACSDT5Y2023.C17002": [f"C17002_{i:03d}E" for i in range(1, 5)],
}
ACS_SHA256 = {
    "ACSDT5Y2023.B01003": "301abdcfc7110d1a5de30e324f6504f694238ae60b04152157c6370310f31a5d",
    "ACSDT5Y2023.B17020": "b659133831111142135d11337759a4d6f35d77540458ba16a151736fa5814998",
    "ACSDT5Y2023.B28002": "aa6921c27298f329e448be56048e748450782a233e0cc13d505f96ed9cd5792f",
    "ACSST5Y2023.S1602": "817a6735e8a2946eb3d04071b9141f6bb1274977eaf7a291f677365c91cbbb39",
    "ACSST5Y2023.S2701": "c718ba854a7d5b1531fa400e537241f0df9df79618139dc010e63b5ff7893c6d",
    "ACSST5Y2023.S2201": "be06ca221bc2bd6d658f502357a29f3ac03c277a7ecd523bc4fedb2b3bcb5c85",
    "ACSDT5Y2023.B15002": "8cc0289494332d4a5779a5e5019ec058de08657926cbb27b9e06471e9e9ea02e",
    "ACSDT5Y2023.B25002": "110c8df6d86b7c1b1c8c779c4cf0dce3fc0ecfc1ce083aca4d55cd4cb183377a",
    "ACSST5Y2023.S2503": "06486f8bbcf4ae869ec6d18a0cb78079622811c44e40086fdfe824387a4a7df6",
    "ACSDT5Y2023.B02001": "293e3cef6df723e5f83da7669161c88ec9f95b7ab4f55891be1ccbcddc376d79",
    "ACSDT5Y2023.B03002": "0c90327303dce9be7785313a2a2565a21372834a1ca2904937e09bc980860f92",
    "ACSDT5Y2023.B25034": "a56b17fad941a50c1869e8ad2987ac62d52943c0f835db85b758fcfd2de67cde",
    "ACSDT5Y2023.C17002": "776c0dcca43a2ed33e924e5e0e135c5f058c50e519be7aebc229d34854ffdd5f",
}
# The 50 states, DC, and Puerto Rico.
STATE_FIPS = [
    "01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18",
    "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33",
    "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49",
    "50", "51", "53", "54", "55", "56", "72",
]

# ACS indicators and the raw values ODIS scales to 0 and to 100: its cut
# points from the v2 technical report (Table 2) and the natural bounds of a
# share.  None marks a bound that is the extreme of ODIS's own school values,
# which include schools with an SAB and so cannot be recomputed here; it is
# fitted from the non-CT schools without an SAB instead (see fit_bound).
# Every formula in tract_measures is confirmed by reproducing ODIS on those
# schools.  Three follow the technical report literally rather than the
# column's plain meaning: Poverty is the share of people in poverty who are
# aged 6-17, SNAP recipients is the share of SNAP households that have
# children, and Housing affordability multiplies each income bracket's share
# of households by that bracket's cost-burdened share.
ACS_BOUNDS = {
    "Poverty": (0, 0.4),
    "Access to broadband internet": (1, 0.4),
    "Linguistic isolation": (0, 0.25),
    "Access to healthcare": (1, None),
    "SNAP recipients": (0, 1),
    "Less than HS": (0, None),
    "2-year college or higher": (None, 0),
    "2-year college": (None, 0),
    "4-year college": (None, 0),
    "Graduate or professional degree": (None, 0),
    "Housing vacancy rate": (0, 0.4),
    "Housing affordability": (0, 1),
}
ACS_INDICATORS = list(ACS_BOUNDS)
RACE_COLUMNS = {
    "White alone": "B02001_002E",
    "Black or African American alone": "B02001_003E",
    "American Indian and Alaska Native alone": "B02001_004E",
    "Asian alone": "B02001_005E",
    "Native Hawaiian and Other Pacific Islander alone": "B02001_006E",
    "Some other race alone": "B02001_007E",
    "Two or more races": "B02001_008E",
    "Hispanic or Latino": "B03002_012E",
}

# CHR 2023 measures behind ODIS's county-level indicators.
CHR_MEASURES = {
    "Single-parent households": "v082_rawvalue",
    "Low birth weight": "v037_rawvalue",
    "Infant mortality rate": "v129_rawvalue",
}

# CHD lead exposure risk index (CHD Technical Document, 2026-07-28): share of
# housing units with lead-based paint hazards by construction era, and share of
# people below 125% of the poverty level, each z-standardized over the CHD
# tract pool and summed with the Vox Media / Washington State DOH weights, then
# ranked into deciles 1-10 within the pool.
LEAD_ERA_WEIGHTS = {  # B25034 variables by year built
    ("B25034_011E",): 0.78,  # 1939 or earlier
    ("B25034_009E", "B25034_010E"): 0.512,  # 1940-1959
    ("B25034_007E", "B25034_008E"): 0.172,  # 1960-1979
    ("B25034_002E", "B25034_003E", "B25034_004E", "B25034_005E", "B25034_006E"): 0.047,  # 1980+
}
LEAD_HOUSING_WEIGHT = 0.58
LEAD_POVERTY_WEIGHT = 0.42

# ODIS's domain weights (verified against every non-CT row in check_domains).
DOMAINS = {
    "Economic": {"Unemployment": 1, "Poverty": 1, "Access to broadband internet": 1,
                 "Single-parent households": 1},
    "Education": {"Less than HS": 1, "2-year college or higher": 1, "Linguistic isolation": 2},
    "Health": {"Access to healthcare": 1, "Infant mortality rate": 1, "SNAP recipients": 1,
               "Low birth weight": 1, "Lead exposure risk": 1},
    "Housing": {"Housing vacancy rate": 1, "Housing affordability": 1, "Park access": 1},
    "Crime": {"Violent crime rate": 1, "Incarceration rate": 1},
}
COMPOSITE = {domain: 1 for domain in DOMAINS}

# Provenance keys written to ct_fill_sources (legend in data/README.md).
SOURCE_KEYS = {
    "acs": "acs2023_zip",
    "Single-parent households": "chr2025",
    "Park access": "chr2025_parks",
    "Low birth weight": "ctdph2024",
    "Infant mortality rate": "ctdph2024",
    "Lead exposure risk": "lead_acs2023",
    "derived": "recomputed",
}


# ---------------------------------------------------------------- downloads

def fetch(url, attempts=4):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (CDC2026 fill_connecticut.py)"})
    context = ssl._create_unverified_context() if request.host in UNVERIFIED_TLS else None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=300, context=context) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == attempts - 1:
                raise
            print(f"  retrying {url}: {error}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(name):
    url, digest = SOURCES[name]
    path = CACHE / name
    if not path.exists():
        print(f"downloading {url}", file=sys.stderr)
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(fetch(url))
    actual = sha256(path)
    if actual != digest:
        sys.exit(f"{path.name}: SHA-256 {actual} does not match pinned {digest}")
    return path


def fetch_acs_state(table, state):
    """Return [(GEOID, values...)] for one ACS table and state."""
    for attempt in range(6):
        body = fetch(ACS_API.format(table=table, state=state))
        try:
            data = json.loads(body)["response"]["data"]
        except (ValueError, KeyError):
            # The API answers overload with an HTML or JSON error body.
            time.sleep(15 * (attempt + 1))
            continue
        header = data[0]
        columns = [header.index("GEO_ID")] + [header.index(v) for v in ACS_TABLES[table]]
        return [[row[i] if row[i] is not None else "" for i in columns] for row in data[1:]]
    sys.exit(f"{table} state {state}: the data.census.gov API kept failing")


def acs_table(table):
    """Return the table's tract rows as a DataFrame indexed by 11-digit GEOID.

    Negative values are the ACS annotation codes for suppressed or unavailable
    estimates, so they become missing values, as ODIS treats them.
    """
    path = CACHE / "acs" / f"{table}.csv"
    if not path.exists():
        print(f"downloading {table} for {len(STATE_FIPS)} states", file=sys.stderr)
        with ThreadPoolExecutor(max_workers=6) as pool:
            parts = list(pool.map(lambda state: fetch_acs_state(table, state), STATE_FIPS))
        rows = sorted(row for part in parts for row in part)
        frame = pd.DataFrame(rows, columns=["GEO_ID"] + ACS_TABLES[table])
        path.parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(path, index=False, lineterminator="\n")
    actual = sha256(path)
    if actual != ACS_SHA256[table]:
        sys.exit(f"{path.name}: SHA-256 {actual} does not match pinned {ACS_SHA256[table]}")
    frame = pd.read_csv(path, dtype=str, keep_default_na=False)
    frame.index = frame.pop("GEO_ID").str[-11:]
    values = frame.apply(pd.to_numeric, errors="coerce")
    return values.where(values >= 0)


# ---------------------------------------------------------------- tract measures

def tract_measures():
    """Return (raw ACS indicator shares, race shares, lead inputs, population), by tract."""
    t = {table.split(".")[1]: acs_table(table) for table in ACS_TABLES}
    b15, s2503 = t["B15002"], t["S2503"]

    def attainment(*ids):
        return sum(b15[f"B15002_{i:03d}E"] for i in ids) / b15["B15002_001E"]

    def burden(income_rows, burden_row):
        return sum(s2503[f"S2503_C02_{i:03d}E"] for i in income_rows) * s2503[f"S2503_C02_{burden_row:03d}E"]

    raw = pd.DataFrame({
        "Poverty": (t["B17020"]["B17020_004E"] + t["B17020"]["B17020_005E"]) / t["B17020"]["B17020_002E"],
        "Access to broadband internet": t["B28002"]["B28002_004E"] / t["B28002"]["B28002_001E"],
        "Linguistic isolation": t["S1602"]["S1602_C03_001E"] / t["S1602"]["S1602_C01_001E"],
        "Access to healthcare": t["S2701"]["S2701_C03_003E"] / 100,
        "SNAP recipients": t["S2201"]["S2201_C04_009E"] / 100,
        "Less than HS": attainment(*range(3, 11), *range(20, 28)),
        "2-year college or higher": attainment(14, 15, 16, 17, 18, 31, 32, 33, 34, 35),
        "2-year college": attainment(14, 31),
        "4-year college": attainment(15, 32),
        "Graduate or professional degree": attainment(16, 17, 18, 33, 34, 35),
        "Housing vacancy rate": t["B25002"]["B25002_003E"] / t["B25002"]["B25002_001E"],
        "Housing affordability": (
            burden((2, 3, 4, 5), 28) + burden((6, 7), 32) + burden((8,), 36)
            + burden((9,), 40) + burden((10, 11, 12), 44)
        ) / 10_000,
    })
    race = pd.DataFrame({
        column: (t["B03002"] if variable.startswith("B03002") else t["B02001"])[variable]
        / (t["B03002"]["B03002_001E"] if variable.startswith("B03002") else t["B02001"]["B02001_001E"])
        for column, variable in RACE_COLUMNS.items()
    })
    b25034, c17002 = t["B25034"], t["C17002"]
    lead = pd.DataFrame({
        "housing": sum(weight * sum(b25034[v] for v in era) for era, weight in LEAD_ERA_WEIGHTS.items())
        / b25034["B25034_001E"],
        "poverty": (c17002["C17002_002E"] + c17002["C17002_003E"] + c17002["C17002_004E"])
        / c17002["C17002_001E"],
    })
    clean = lambda frame: frame.replace([np.inf, -np.inf], np.nan)
    return clean(raw), clean(race), clean(lead), t["B01003"]["B01003_001E"]


# Method: City Health Dashboard lead exposure risk index (City Health Dashboard Technical Document, 2026); see
# CITATIONS.md, section 3.
def lead_index(lead, pool):
    """Recompute the CHD lead exposure risk index (deciles 1-10) for every tract."""
    inputs = lead.dropna()
    in_pool = inputs.loc[inputs.index.isin(pool)]
    z = (inputs - in_pool.mean()) / in_pool.std()
    score = LEAD_HOUSING_WEIGHT * z["housing"] + LEAD_POVERTY_WEIGHT * z["poverty"]
    edges = score.loc[in_pool.index].quantile(np.arange(1, 10) / 10).values
    return pd.Series(np.searchsorted(edges, score.values, side="right") + 1.0, index=score.index)


# ---------------------------------------------------------------- ZIP method

def relationships():
    """Return the 2010 and 2020 ZCTA-tract pairs (CT tracts relabelled to 2022)."""
    rel10 = pd.read_csv(download("zcta_tract_2010.txt"), dtype=str, usecols=["ZCTA5", "GEOID"])
    rel20 = pd.read_csv(download("zcta_tract_2020.txt"), sep="|", dtype=str, encoding="utf-8-sig",
                        usecols=["GEOID_ZCTA5_20", "GEOID_TRACT_20"])
    rel20 = rel20.dropna().rename(columns={"GEOID_ZCTA5_20": "ZCTA5", "GEOID_TRACT_20": "GEOID"})
    crosswalk = ct_crosswalk()
    ct = rel20["GEOID"].str.startswith("09")
    unknown = set(rel20.loc[ct, "GEOID"]) - set(crosswalk)
    assert not unknown, f"CT 2020 tracts missing from the crosswalk: {sorted(unknown)}"
    rel20.loc[ct, "GEOID"] = rel20.loc[ct, "GEOID"].map(crosswalk)
    return rel10, rel20


def ct_crosswalk():
    """Return {2020 CT tract GEOID: 2022 CT tract GEOID}."""
    frame = pd.read_csv(download("ct_tract_crosswalk.csv"), dtype=str, encoding="utf-8-sig")
    assert (frame["tract_fips_2020"].str[-6:] == frame["Tract_fips_2022"].str[-6:]).all()
    return dict(zip(frame["tract_fips_2020"], frame["Tract_fips_2022"]))


# Method: ODIS's population-weighted ZIP-to-tract average (ODIS v2 technical report, Hawken et al. 2025); see
# CITATIONS.md, section 3.
def zip_average(zips, values, relationship, population):
    """ODIS's method for schools without an SAB: the average of the tracts that
    intersect the school's ZIP, weighted by tract population (ACS B01003).

    zips: Series of 5-digit ZIPs; values: tract-level DataFrame.  Tracts with a
    missing value are left out of that value's average.
    """
    pairs = relationship[relationship["ZCTA5"].isin(set(zips))]
    pairs = pairs[pairs["GEOID"].isin(values.index)]
    weight = population.reindex(pairs["GEOID"]).fillna(0).values
    tract_values = values.reindex(pairs["GEOID"]).values
    present = ~np.isnan(tract_values) & (weight[:, None] > 0)
    weighted = np.where(present, tract_values * weight[:, None], 0.0)
    sums = pd.DataFrame(weighted, columns=values.columns).groupby(pairs["ZCTA5"].values).sum()
    weights = pd.DataFrame(np.where(present, weight[:, None], 0.0), columns=values.columns) \
        .groupby(pairs["ZCTA5"].values).sum()
    averages = (sums / weights.where(weights > 0)).reindex(zips.values)
    averages.index = zips.index
    return averages


# ---------------------------------------------------------------- scaling

def round_half_up(values):
    return np.floor(np.asarray(values, dtype=float) + 0.5)


# Method: ODIS's min-max scaling to 0-100 (ODIS v2 technical report, Hawken et al. 2025); see CITATIONS.md, section 3.
def scale(raw, zero, full):
    """ODIS's min-max scaling: raw value `zero` scores 0 and `full` scores 100.

    ODIS rounds raw shares to 4 decimals first and truncates at its cut points;
    for a reversed indicator zero > full.
    """
    return np.clip(100 * (np.round(raw, 4) - zero) / (full - zero), 0, 100)


# Method: Least-squares fit of a scaling end point (Kutner et al. 2005); see CITATIONS.md, section 3.
def fit_bound(raw, scaled, zero, full):
    """Complete (zero, full) when one of them is None: the least-squares value
    that best maps raw to ODIS's scaled values, on rows not at a clip bound."""
    keep = raw.notna() & scaled.notna() & (scaled > 0) & (scaled < 100)
    x, y = np.round(raw[keep], 4), scaled[keep]
    if full is None:
        slope = ((x - zero) * y).sum() / ((x - zero) ** 2).sum()
        return zero, zero + 100 / slope
    slope = ((x - full) * (y - 100)).sum() / ((x - full) ** 2).sum()
    return full - 100 / slope, full


def agreement(ours, theirs):
    """Summary of how our rounded values compare with ODIS's."""
    both = ours.notna() & theirs.notna()
    diff = (round_half_up(ours[both]) - theirs[both]).abs()
    return {
        "n": int(both.sum()),
        "exact": diff.eq(0).mean(),
        "within1": diff.le(1).mean(),
        "within5": diff.le(5).mean(),
        "mae": diff.mean(),
        "r": np.corrcoef(ours[both], theirs[both])[0, 1] if both.sum() > 2 else np.nan,
    }


def show(label, stats, suffix=""):
    print(f"  {label:48s} n={stats['n']:>6,}  exact {stats['exact']:6.1%}  within 1 {stats['within1']:6.1%}  "
          f"within 5 {stats['within5']:6.1%}  MAE {stats['mae']:5.2f}  r {stats['r']:.3f}{suffix}")


# ---------------------------------------------------------------- ODIS file

def read_fixed():
    source = FIXED_CSV.read_bytes()
    header, *lines = source.split(b"\r\n")
    assert not source.endswith(b"\r\n") and all(lines) and b'"' not in source, "unexpected CSV layout"
    columns = header.decode("utf-8").split(",")
    frame = pd.DataFrame([line.decode("utf-8").split(",") for line in lines], columns=columns)
    return header, lines, frame


def numeric(frame, columns):
    return frame[columns].apply(pd.to_numeric, errors="coerce").astype(float)


def is_missing(frame):
    return frame.isin(["N/A", "", "Null"])


# ---------------------------------------------------------------- validation

def validate_acs_method(odis, tract_raw, tract_race, population, rel10, rel20):
    """Reproduce ODIS on non-CT schools without an SAB and fit its scaling.

    Returns {indicator: (zero, full)}.
    """
    schools = odis[(odis["SAB Available"] == "0") & (odis["State"] != "CT")]
    zips = schools["Zip Code"]
    odis_values = numeric(schools, ACS_INDICATORS + list(RACE_COLUMNS))
    with_2010 = zip_average(zips, tract_raw, rel10, population)
    race_2010 = zip_average(zips, tract_race, rel10, population)
    with_2020 = zip_average(zips, tract_raw, rel20, population)

    print(f"\n[1] ODIS's ZIP method with the 2010 file ODIS used, on {len(schools):,} non-CT schools without an SAB")
    scales = {}
    for column, (zero, full) in ACS_BOUNDS.items():
        if zero is None or full is None:
            zero, full = fit_bound(with_2010[column], odis_values[column], zero, full)
        scales[column] = zero, full
        show(column, agreement(pd.Series(scale(with_2010[column], *scales[column]), index=zips.index),
                               odis_values[column]))
    for column in RACE_COLUMNS:
        show(column, agreement(race_2010[column] * 100, odis_values[column]))
    print("  scaling (raw share scoring 0 -> raw share scoring 100; * fitted from these schools):")
    for column, (zero, full) in scales.items():
        mark = lambda bound: "*" if bound is None else " "
        print(f"    {column:34s} {zero:7.4f}{mark(ACS_BOUNDS[column][0])} -> {full:7.4f}{mark(ACS_BOUNDS[column][1])}")

    print("\n[2] Same schools with the 2020 ZCTA-tract file (the file used for CT): effect of the file vintage")
    for column in ACS_INDICATORS:
        show(column, agreement(pd.Series(scale(with_2020[column], *scales[column]), index=zips.index),
                               odis_values[column]))
    return scales


def county_scales(odis):
    """Recover ODIS's scaling of the CHR-based indicators from CHR 2023."""
    chr23 = pd.read_csv(download("chr_2023.csv"), dtype=str, skiprows=[0]).set_index("fipscode")
    print("\n[3] County-level indicators: ODIS values against CHR 2023, one row per county")
    scales = {}
    for column, measure in CHR_MEASURES.items():
        per_county = numeric(odis, [column]).groupby(odis["FIPS County Code"])[column].first().dropna()
        raw = pd.to_numeric(chr23[measure], errors="coerce").reindex(per_county.index)
        # ODIS min-max scales the county values it has, rounded to 4 decimals.
        scales[column] = (raw.round(4).min(), raw.round(4).max())
        show(column, agreement(pd.Series(scale(raw, *scales[column]), index=raw.index), per_county))
    return scales


def validate_lead(odis, lead_by_tract, pool, rel10, population):
    """Compare the recomputed lead index with ODIS's CHD-based values."""
    schools = odis[(odis["SAB Available"] == "0") & (odis["State"] != "CT")]
    in_pool = lead_by_tract.loc[lead_by_tract.index.isin(pool)].to_frame("lead")
    ours = zip_average(schools["Zip Code"], in_pool, rel10, population)["lead"]
    theirs = numeric(schools, ["Lead exposure risk"])["Lead exposure risk"]
    stats = agreement(pd.Series(scale_lead(ours), index=ours.index), theirs)
    both = ours.notna() & theirs.notna()
    within_decile = ((round_half_up(scale_lead(ours[both])) - theirs[both]).abs() <= 100 / 9).mean()
    print("\n[4] Lead exposure risk recomputed from ACS 2019-2023 vs ODIS's CHD values, non-CT schools without an SAB")
    show("Lead exposure risk", stats)
    print(f"  within one decile (11.1 points): {within_decile:.1%}")


def scale_lead(index):
    # The CHD index runs 1-10; ODIS's values sit exactly on multiples of 100/9
    # for single-tract schools, so 1 scores 0 and 10 scores 100.
    return 100 * (np.asarray(index, dtype=float) - 1) / 9


def check_domains(odis, ct):
    """Verify ODIS's domain weights and re-weighting on every non-CT row."""
    rows = odis[~ct]
    print(f"\n[6] Domain scores recomputed from the rounded indicators, {len(rows):,} non-CT rows")
    for domain, weights in {**DOMAINS, "Composite Score": COMPOSITE}.items():
        ours = weighted_average(numeric(rows, list(weights)), weights)
        theirs = numeric(rows, [domain])[domain]
        assert ours.isna().equals(theirs.isna()), f"{domain}: missing pattern differs"
        error = (ours - theirs).abs().max()
        assert error < 1, f"{domain}: largest difference {error:.2f} exceeds rounding"
        stats = agreement(ours, theirs)
        print(f"  {domain:16s} n={stats['n']:>6,}  largest difference {error:.2f}  exact after rounding {stats['exact']:.1%}")
    print("  (inputs are rounded to integers, so differences below 1 are rounding)")


# Method: ODIS's re-weighted domain average (ODIS v2 technical report, Hawken et al. 2025); see CITATIONS.md, section
# 3.
def weighted_average(values, weights):
    """ODIS's domain average: missing inputs drop out and the others re-weight."""
    w = pd.DataFrame({c: np.where(values[c].notna(), weight, 0.0) for c, weight in weights.items()},
                     index=values.index)
    total = w.sum(axis=1)
    return ((values[list(weights)].fillna(0) * w).sum(axis=1) / total).where(total > 0)


def percentile_rank(odis, ct, column, scores):
    """ODIS's rank of a score: the share of schools scoring lower, in percent.

    CT rows take the rank ODIS gives the same score elsewhere, so no non-CT
    rank changes; a score no other row has gets the formula value.
    """
    others = numeric(odis[~ct], [column, f"{column} Percentile Rank"]).dropna()
    lookup = others.groupby(column)[f"{column} Percentile Rank"].first()
    everyone = numeric(odis, [column])[column].dropna()

    def rank(score):
        score = float(round_half_up(score))
        if score in lookup.index:
            return lookup[score]
        return float(round_half_up(100 * (everyone < score).sum() / len(everyone)))

    return scores.map(rank)


# ---------------------------------------------------------------- CT sources

def chr_2025():
    frame = pd.read_csv(download("chr_2025.csv"), dtype=str, skiprows=[0]).set_index("fipscode")
    frame = frame[frame.index.str.match(r"091[1-9]0")]
    assert len(frame) == 9, "expected the 9 CT planning regions in CHR 2025"
    return {
        "Single-parent households": pd.to_numeric(frame["v082_rawvalue"]),
        "Park access": pd.to_numeric(frame["v179_rawvalue"]),
    }


def ct_dph(region_fips):
    """Infant mortality (per 1,000 births) and low birth weight (share of births)
    by planning region, from the CT DPH 2024 Registration Report tables."""
    book = openpyxl.load_workbook(download("ct_dph_rr2024.xlsx"), read_only=True, data_only=True)

    def region_rows(sheet, pick):
        rows, in_regions = {}, False
        for row in book[sheet].iter_rows(values_only=True):
            label = str(row[0] or "").replace("\xa0", " ").strip()
            if label == "PLANNING REGION":
                in_regions = True
            elif in_regions and label.startswith("Unknown"):
                break
            elif in_regions and label:
                rows[region_fips[f"{label} Planning Region"]] = pick(row)
        assert len(rows) == 9, f"{sheet}: expected 9 planning regions, found {len(rows)}"
        return pd.Series(rows)

    # Table 6: resident infant deaths and live births.
    infant = region_rows("TABLE 6", lambda row: 1000 * row[1] / row[2])
    # Table 19: live births and low-birth-weight (<2,500 g) births; the region
    # line is the one for all races and ethnicities.
    low_weight = region_rows("TABLE 19", lambda row: row[11] / row[2])
    return {"Infant mortality rate": infant, "Low birth weight": low_weight}


# ---------------------------------------------------------------- CT checks

def validate_ct(odis, ct_rows, filled, tract_raw, population, rel10, rel20, scales):
    zips = ct_rows["Zip Code"]
    sab = ct_rows["SAB Available"] == "1"
    ours = zip_average(zips[sab], tract_raw, rel20, population)
    print(f"\n[5a] CT schools that have an SAB ({sab.sum()}): ZIP method vs ODIS's SAB-based values "
          "(different geographies, so a sanity check only)")
    for column in ACS_INDICATORS:
        show(column, agreement(pd.Series(scale(ours[column], *scales[column]), index=ours.index),
                               numeric(ct_rows[sab], [column])[column]))

    # ODIS v2 keys rows by the NCESSCH as downloaded, name, and ZIP; the only
    # duplicate keys are the 4 identical rows the fixed file drops.
    v2 = pd.read_csv(download("odis_v2.csv"), dtype=str, keep_default_na=False)
    v2 = v2.drop_duplicates(["NCESSCH", "Name", "Zip Code"], keep=False) \
        .set_index(["NCESSCH", "Name", "Zip Code"])
    v2 = v2.reindex(pd.MultiIndex.from_frame(odis[["NCESSCH_original", "Name", "Zip Code"]]))
    v2.index = odis.index
    nosab = ct_rows.index[~sab]
    print(f"\n[5b] The {len(nosab)} filled CT schools vs ODIS v2 (2024), which had values for them; "
          "for scale, v2 vs v3 for non-CT schools without an SAB in brackets")
    others = odis.index[(odis["SAB Available"] == "0") & (odis["State"] != "CT")]
    for column in ACS_INDICATORS:
        v2_values = numeric(v2, [column])[column]
        baseline = agreement(numeric(odis.loc[others], [column])[column], v2_values[others])
        show(column, agreement(filled.loc[nosab, column], v2_values[nosab]),
             f"  [MAE {baseline['mae']:5.2f}, r {baseline['r']:.3f}]")

    # What ODIS's own 2010 file would give if the CT tracts had been relabelled:
    # 2010 tracts whose code survived into 2020 map to 2022; the rest drop out,
    # as they do for ODIS in other states.
    crosswalk = ct_crosswalk()
    rel10_ct = rel10[rel10["ZCTA5"].isin(set(zips[~sab]))].copy()
    rel10_ct["GEOID"] = rel10_ct["GEOID"].map(lambda g: crosswalk.get(g, g))
    alt = zip_average(zips[~sab], tract_raw, rel10_ct, population)
    print("\n[5c] The filled CT schools: 2020 ZCTA-tract file vs the 2010 file ODIS used, relabelled")
    for column in ACS_INDICATORS:
        show(column, agreement(pd.Series(scale(alt[column], *scales[column]), index=alt.index),
                               pd.Series(round_half_up(filled.loc[nosab, column]), index=nosab)))


# ---------------------------------------------------------------- main

def main():
    header, lines, odis = read_fixed()
    ct = odis["State"] == "CT"
    ct_rows = odis[ct]
    missing = is_missing(odis)

    tract_raw, tract_race, lead_inputs, population = tract_measures()
    rel10, rel20 = relationships()
    acs_scales = validate_acs_method(odis, tract_raw, tract_race, population, rel10, rel20)
    chr_scales = county_scales(odis)

    # Filled values, unrounded, for CT rows; NaN where nothing is filled.
    filled = pd.DataFrame(index=ct_rows.index, columns=odis.columns[:56], dtype=float)
    sources = {index: {} for index in ct_rows.index}

    def record(column, values, key):
        filled.loc[values.index, column] = values
        for index in values.index:
            sources[index].setdefault(key, []).append(column)

    def fill(column, values, key):
        record(column, values[missing.loc[values.index, column] & values.notna()], key)

    # 1. ACS indicators and race for CT schools without an SAB, by ZIP.
    nosab = ct_rows[ct_rows["SAB Available"] == "0"]
    by_zip = zip_average(nosab["Zip Code"], tract_raw, rel20, population)
    race = zip_average(nosab["Zip Code"], tract_race, rel20, population)
    for column in ACS_INDICATORS:
        fill(column, pd.Series(scale(by_zip[column], *acs_scales[column]), index=by_zip.index), SOURCE_KEYS["acs"])
    for column in RACE_COLUMNS:
        fill(column, race[column] * 100, SOURCE_KEYS["acs"])

    # 2 and 3. County-level indicators, by planning region.
    region = ct_rows["FIPS County Code"]
    region_fips = dict(zip(ct_rows["County"], region))
    chr25 = chr_2025()
    dph = ct_dph(region_fips)
    for column, by_region in [("Single-parent households", chr25["Single-parent households"]),
                              ("Low birth weight", dph["Low birth weight"]),
                              ("Infant mortality rate", dph["Infant mortality rate"])]:
        fill(column, pd.Series(scale(by_region.reindex(region).values, *chr_scales[column]), index=region.index),
             SOURCE_KEYS[column])
    print("\nCT planning-region inputs (raw):")
    print(pd.DataFrame({"single-parent (CHR 2025)": chr25["Single-parent households"],
                        "parks (CHR 2025)": chr25["Park access"],
                        "low birth weight (DPH)": dph["Low birth weight"],
                        "infant mortality (DPH)": dph["Infant mortality rate"]}).round(4).to_string())

    # 4. Lead exposure risk, recomputed statewide, and park access from CHR.
    chd = pd.read_csv(download("chd_tracts.csv"), dtype=str)
    pool = set(chd.loc[chd["census_parent_shape_year"] == "2020", "geo_fips"])
    crosswalk = ct_crosswalk()
    pool = {crosswalk.get(tract, tract) for tract in pool}
    lead_by_tract = lead_index(lead_inputs, pool)
    validate_lead(odis, lead_by_tract, pool, rel10, population)
    lead = zip_average(ct_rows["Zip Code"], lead_by_tract.to_frame("lead"), rel20, population)["lead"]
    fill("Lead exposure risk", pd.Series(scale_lead(lead), index=lead.index), SOURCE_KEYS["Lead exposure risk"])
    # Park access is reversed (more access, less stress) and ODIS's values run
    # from 0 at full access to 100 at none.
    parks = chr25["Park access"].reindex(region).values
    fill("Park access", pd.Series(scale(parks, 1.0, 0.0), index=region.index), SOURCE_KEYS["Park access"])

    validate_ct(odis, ct_rows, filled, tract_raw, population, rel10, rel20, acs_scales)

    # Derived scores: recompute a CT domain score when any of its inputs was
    # filled, from the unrounded filled values and ODIS's values otherwise,
    # then the composite; each gets the percentile rank ODIS gives that score.
    check_domains(odis, ct)
    columns = list(odis.columns[28:56])
    indicators = numeric(ct_rows, columns).where(filled[columns].isna(), filled[columns])
    scores = numeric(ct_rows, list(COMPOSITE))
    recomputed = {}
    for domain, weights in DOMAINS.items():
        changed = filled[list(weights)].notna().any(axis=1)
        recomputed[domain] = weighted_average(indicators[list(weights)], weights)[changed].dropna()
        scores.loc[recomputed[domain].index, domain] = recomputed[domain]
    recomputed["Composite Score"] = weighted_average(scores, COMPOSITE)
    for column, values in recomputed.items():
        record(column, values, SOURCE_KEYS["derived"])
        record(f"{column} Percentile Rank", percentile_rank(odis, ct, column, values), SOURCE_KEYS["derived"])

    # Write the output: CT rows rebuilt, every other row copied byte for byte.
    output = ct_rows.copy()
    for column in filled.columns:
        values = filled[column].dropna()
        output.loc[values.index, column] = [str(int(v)) for v in round_half_up(values)]
    order = list(odis.columns)
    output[PROVENANCE] = [
        ";".join(f"{key}={'|'.join(sorted(set(cols), key=order.index))}" for key, cols in sources[i].items())
        for i in output.index
    ]

    ct_positions = set(ct_rows.index)
    written = [header + f",{PROVENANCE}".encode("ascii")]
    for position, line in enumerate(lines):
        if position in ct_positions:
            fields = output.loc[position, order + [PROVENANCE]].tolist()
            assert not any("," in field or '"' in field for field in fields)
            written.append(",".join(fields).encode("utf-8"))
        else:
            written.append(line + b",")
    FILLED_CSV.write_bytes(b"\r\n".join(written))
    verify(lines, ct_positions, order)
    report(odis, ct, output)


def verify(lines, ct_positions, order):
    """Re-read the output and check what changed."""
    out = FILLED_CSV.read_bytes().split(b"\r\n")
    assert len(out) == len(lines) + 1
    for position, (before, after) in enumerate(zip(lines, out[1:])):
        if position not in ct_positions:
            assert after == before + b",", f"non-CT row {position} changed"
    before = pd.read_csv(FIXED_CSV, dtype=str, keep_default_na=False)
    after = pd.read_csv(FILLED_CSV, dtype=str, keep_default_na=False)
    assert list(after.columns) == order + [PROVENANCE]
    ct = before["State"] == "CT"
    changed = (before[order] != after[order]) & ct.values[:, None]
    identity = ["NCESSCH", "Name", "School District", "State", "FIPS County Code", "County", "City",
                "Zip Code", "SAB Available", "Gini index", "Unemployment", "NCESSCH_original", "NCESSCH_status"]
    assert not changed[identity].any().any(), "identifier or untouched column changed"
    assert not changed[[c for c in order if c.endswith("Median")] + ["Crime", "Crime Percentile Rank",
                                                                    "Violent crime rate", "Incarceration rate"]].any().any()


def report(odis, ct, output):
    before = is_missing(odis[ct])
    after = is_missing(output[odis.columns])
    cells = int(before.values.sum() - after.values.sum())
    print(f"\nWrote {FILLED_CSV.relative_to(ROOT)}")
    print(f"CT rows: {ct.sum()}, missing cells before {int(before.values.sum()):,}, after {int(after.values.sum()):,} "
          f"({cells:,} filled)")
    print(f"missing per CT row: mean {before.sum(axis=1).mean():.1f} -> {after.sum(axis=1).mean():.1f}")
    filled_per_column = (before & ~after).sum()
    print("cells filled per column:")
    for column, n in filled_per_column[filled_per_column > 0].items():
        print(f"  {column:48s} {n}")
    changed = ((odis.loc[ct, odis.columns] != output[odis.columns]) & ~before).sum()
    print("existing CT values recomputed (changed):")
    for column, n in changed[changed > 0].items():
        print(f"  {column:48s} {n}")


if __name__ == "__main__":
    main()
