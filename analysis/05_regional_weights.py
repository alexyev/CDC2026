"""Regional weights: how much each ODIS domain predicts high school graduation, region by region.

The ODIS composite weights its five domains equally everywhere.  This analysis joins the federal school-level
four-year adjusted cohort graduation rate (ACGR, SY 2022-23) onto the ODIS schools, fits per-region models of the
graduation rate on the five domain scores, turns each region's effects into domain weights, and scores every school
with its region's weights next to the ODIS composite.

Inputs (read only):

- data/index_scores_v3_2026_ct_filled.csv, the ODIS schools.
- The ED Data Express ACGR export (see ACGR_* below), cached in .cache/acgr/ (gitignored) and pinned by SHA-256.
- The NCES CCD 2022-23 school directory, for school type only (downloaded and pinned by scripts/fix_ncessch.py).
- The Census 2023 county boundaries cached by analysis/schoolscape, for the map only.

Outputs (all new files; nothing existing is modified):

- data/derived/graduation_joined.csv and data/derived/regional_stress_score.csv.
- PNG charts and CSV tables in visualizations/05-regional-weights/.

Run from the repository root:

    python analysis/05_regional_weights.py
"""

import hashlib
import importlib
import importlib.util
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import statsmodels.api as sm
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.outliers_influence import variance_inflation_factor

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "analysis"))

# Shared palette, rcParams, and helpers from the data overview.
overview = importlib.import_module("01_data_overview")

ODIS = ROOT / "data" / "index_scores_v3_2026_ct_filled.csv"
DERIVED = ROOT / "data" / "derived"
OUT = ROOT / "visualizations" / "05-regional-weights"
CACHE = ROOT / ".cache" / "acgr"

# The ACGR file: ED Data Express "Data Download Tool" export of data group 695/696 (four-year ACGR and cohort
# count), school level, SY 2022-23, subgroup "All Students in School".  The tool builds the CSV in a server-side
# batch behind an AWS WAF browser challenge, so a script cannot request ACGR_TOOL_URL directly; ACGR_FILE_URL is
# the static file one such export produced.  Two exports made minutes apart were byte-identical.
ACGR_TOOL_URL = (
    "https://eddataexpress.ed.gov/download/data-builder/data-download-tool/export-csv?"
    "f%5B0%5D=all_students%3AAll%20Students%20in%20School&f%5B1%5D=data_group_id%3A695"
    "&f%5B2%5D=level%3ASchool&f%5B3%5D=school_year%3A2022-2023&page&_format=csv"
)
ACGR_FILE_URL = (
    "https://eddataexpress.ed.gov/sites/default/files/views_data_export/"
    "ede_data_download_data_export_1/1790461460/Data%20Download%20Tool.csv"
)
ACGR_SHA256 = "88664c9a8bf6ca09ba2e1e86fd8de53d2a564d618a26531909b01bf354f9e035"
ACGR_CACHE = CACHE / "acgr_sch_sy2022-23_all_students.csv"

DOMAINS = ["Economic", "Education", "Health", "Housing", "Crime"]
FOUR = DOMAINS[:4]
COUNTY = "FIPS County Code"

# Census regions, with the West split into Mountain, Pacific Northwest, and California.  Alaska and Hawaii stay with
# the rest of the Census Pacific division; Puerto Rico has no region (and no school-level ACGR for SY 2022-23).
REGIONS = {
    "Northeast": ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
    "Midwest": ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
    "South": ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
    "Mountain": ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"],
    "Pacific Northwest": ["WA", "OR", "AK", "HI"],
    "California": ["CA"],
}
REGION_OF = {state: region for region, states in REGIONS.items() for state in states}
REGION_ORDER = list(REGIONS)

# Main model sample: rates reported exactly or within a range of at most 20 points (cohorts of 16 or more).  The
# 50-point bins (">=50%", "<50%", cohorts of 6-15) carry almost no information and are left out.
MAX_WIDTH = 20
PRECISE_WIDTH = 5
BOOTSTRAP = 500
SEED = 2026
FOLDS = 5

INK, INK_2, BLUE, ORANGE, AQUA = overview.INK, overview.INK_2, overview.BLUE, overview.ORANGE, overview.AQUA
NEUTRAL = "#b9b8b3"
LIGHT_NEUTRAL = "#dddcd7"
RED = "#e34948"
DIVERGING = LinearSegmentedColormap.from_list(
    "blue_red", ["#184f95", "#3987e5", "#9ec5f4", "#f0efec", "#f4a3a2", "#e34948", "#a32424"])
SEQUENTIAL = LinearSegmentedColormap.from_list("blue", overview.BLUE_RAMP)


# ---------------------------------------------------------------------------------------------------------------
# Data


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_acgr():
    """Return the cached ACGR export, downloading the pinned static file on first run."""
    if not ACGR_CACHE.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"downloading {ACGR_FILE_URL}", file=sys.stderr)
        try:
            request = urllib.request.Request(ACGR_FILE_URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=120) as response:
                ACGR_CACHE.write_bytes(response.read())
        except OSError as error:
            sys.exit(f"could not download the ACGR file ({error}).\n"
                     f"Open this URL in a web browser, let the export finish, and save the CSV as {ACGR_CACHE}:\n"
                     f"{ACGR_TOOL_URL}")
    digest = sha256(ACGR_CACHE)
    if digest != ACGR_SHA256:
        ACGR_CACHE.unlink()
        sys.exit(f"{ACGR_CACHE.name}: SHA-256 {digest} does not match pinned {ACGR_SHA256}.\n"
                 f"Re-export it in a web browser from:\n{ACGR_TOOL_URL}")
    return ACGR_CACHE


def parse_rate(value):
    """Return (status, low, high) for one ACGR value, in percent.

    Values are privacy protected by cohort size: an exact integer ("92%"), a range ("90-94%"), a bound (">=95%",
    "<=5%", "<50%"), or "S" (suppressed).  A range covers both end points; ">=X" means X to 100, "<=X" 0 to X, and
    "<X" 0 to X-1.
    """
    if value == "S":
        return "suppressed", np.nan, np.nan
    if m := re.fullmatch(r"(\d+)%", value):
        return "exact", float(m[1]), float(m[1])
    if m := re.fullmatch(r"(\d+)-(\d+)%", value):
        return "range", float(m[1]), float(m[2])
    if m := re.fullmatch(r">=(\d+)%", value):
        return "range", float(m[1]), 100.0
    if m := re.fullmatch(r"<=(\d+)%", value):
        return "range", 0.0, float(m[1])
    if m := re.fullmatch(r"<(\d+)%", value):
        return "range", 0.0, float(m[1]) - 1
    raise ValueError(f"unexpected ACGR value {value!r}")


def load_acgr():
    raw = pd.read_csv(fetch_acgr(), dtype=str, keep_default_na=False)
    assert (raw["School Year"] == "2022-2023").all() and (raw["Subgroup"] == "All Students in School").all()
    # One footer-like row for Puerto Rico has no school ID and the value "MISSING": PR reported no school rates.
    no_id = raw["NCES SCH ID"] == ""
    assert no_id.sum() == 1 and raw.loc[no_id, "Value"].item() == "MISSING"
    acgr = raw[~no_id].copy()
    assert acgr["NCES SCH ID"].str.fullmatch(r"\d{12}").all() and acgr["NCES SCH ID"].is_unique
    parsed = acgr["Value"].map(parse_rate)
    acgr["acgr_status"] = [p[0] for p in parsed]
    acgr["acgr_low"] = [p[1] for p in parsed]
    acgr["acgr_high"] = [p[2] for p in parsed]
    acgr["acgr_cohort"] = acgr["Denominator"].astype(int)
    return acgr.rename(columns={"NCES SCH ID": "NCESSCH", "Value": "acgr_value", "State": "acgr_state"})[
        ["NCESSCH", "acgr_state", "acgr_value", "acgr_cohort", "acgr_status", "acgr_low", "acgr_high"]]


def load_ccd_types():
    """NCESSCH -> (state name, school type, charter) from the 2022-23 CCD directory scripts/fix_ncessch.py pins."""
    spec = importlib.util.spec_from_file_location("fix_ncessch", ROOT / "scripts" / "fix_ncessch.py")
    fix = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fix)
    with zipfile.ZipFile(fix.download_directory()) as archive:
        (member,) = [n for n in archive.namelist() if n.endswith(".csv")]
        ccd = pd.read_csv(archive.open(member), dtype=str, keep_default_na=False,
                          usecols=["NCESSCH", "STATENAME", "SCH_TYPE_TEXT", "CHARTER_TEXT"])
    return ccd.rename(columns={"STATENAME": "ccd_state", "SCH_TYPE_TEXT": "school_type", "CHARTER_TEXT": "charter"})


def load_odis():
    raw = pd.read_csv(ODIS, dtype=str, keep_default_na=False)
    df = raw[["NCESSCH", "Name", "State", COUNTY, "County", "SAB Available"]].copy()
    for col in DOMAINS + ["Composite Score"]:
        df[col] = pd.to_numeric(raw[col].replace({"": np.nan, "N/A": np.nan}))
    df["region"] = df["State"].map(REGION_OF)
    assert df["region"].notna().sum() == (df["State"] != "PR").sum(), "every state but PR must have a region"
    return df


def join(odis, acgr, ccd):
    df = odis.merge(acgr, on="NCESSCH", how="left").merge(ccd, on="NCESSCH", how="left")
    df["acgr_status"] = df["acgr_status"].fillna("not_reported")
    df["acgr_mid"] = (df["acgr_low"] + df["acgr_high"]) / 2
    df["acgr_width"] = df["acgr_high"] - df["acgr_low"]
    # A matched ACGR row must be in the same state as the ODIS row (BIE schools are filed under the BIE).
    matched = df["acgr_state"].notna()
    same = df["acgr_state"] == df["ccd_state"]
    assert (same | ~matched | (df["acgr_state"] == "BUREAU OF INDIAN EDUCATION")).all()
    df["usable"] = df["acgr_width"].le(MAX_WIDTH) & df["acgr_cohort"].gt(0)
    df["precise"] = df["acgr_width"].le(PRECISE_WIDTH) & df["acgr_cohort"].gt(0)
    df["coverage"] = np.select(
        [df["acgr_status"] == "not_reported", df["acgr_status"] == "suppressed", ~df["usable"]],
        ["Not in the ACGR file", "Suppressed (cohort 1-5)", "50-point bin only (cohort 6-15)"],
        default="Usable rate (cohort 16+)")
    has_four = df[FOUR].notna().all(axis=1)
    df["sample_four_domain"] = (df["usable"] & has_four & df["region"].notna()).astype(int)
    df["sample_five_domain"] = (df["sample_four_domain"].astype(bool) & df["Crime"].notna()).astype(int)
    return df


def standardize(df):
    """Z-score each domain against its mean and SD over all ODIS schools, so slopes compare across regions."""
    stats = {d: (df[d].mean(), df[d].std()) for d in DOMAINS}
    for d in DOMAINS:
        mean, sd = stats[d]
        df[f"z_{d}"] = (df[d] - mean) / sd
    return stats


# ---------------------------------------------------------------------------------------------------------------
# Models


def design(frame, domains, interacted=True, state_fe=True):
    """Regression matrix: state (or region) intercepts plus domain slopes, per region when interacted."""
    parts = []
    fe = pd.get_dummies(frame["State"] if state_fe else frame["region"], prefix="fe", dtype=float)
    parts.append(fe)
    if interacted:
        for region in REGION_ORDER:
            in_region = (frame["region"] == region).astype(float)
            for d in domains:
                parts.append((frame[f"z_{d}"] * in_region).rename(f"{region}:{d}"))
    else:
        for d in domains:
            parts.append(frame[f"z_{d}"].rename(d))
    return pd.concat(parts, axis=1)


def fit(frame, domains, interacted=True, state_fe=True, y="acgr_mid"):
    X = design(frame, domains, interacted, state_fe)
    groups = pd.factorize(frame[COUNTY])[0]
    return sm.OLS(frame[y].to_numpy(), X).fit(cov_type="cluster", cov_kwds={"groups": groups})


def region_table(res, frame, domains, spec):
    """Per-region slopes with 95% CIs, n, R^2, and within-state R^2 from a fully interacted fit."""
    rows = []
    ci = res.conf_int()
    resid = pd.Series(res.resid, index=frame.index)
    for region in REGION_ORDER:
        sub = frame[frame["region"] == region]
        y = sub["acgr_mid"]
        ssr = float((resid[sub.index] ** 2).sum())
        r2 = 1 - ssr / float(((y - y.mean()) ** 2).sum())
        within = 1 - ssr / float(((y - y.groupby(sub["State"]).transform("mean")) ** 2).sum())
        for d in domains:
            name = f"{region}:{d}"
            rows.append({
                "spec": spec, "region": region, "domain": d,
                "coef": res.params[name], "ci_low": ci.loc[name, 0], "ci_high": ci.loc[name, 1],
                "p_value": res.pvalues[name], "n_schools": len(sub), "n_counties": sub[COUNTY].nunique(),
                "n_states": sub["State"].nunique(), "r2_with_state_fe": r2, "r2_within_state": within,
            })
    return pd.DataFrame(rows)


def heterogeneity_tests(res, frame, domains, spec):
    """Do slopes differ across regions?  Cluster-robust Wald tests (per domain and joint) and a classical LR test."""
    names = list(res.params.index)
    rows = []

    def restriction(ds):
        R = []
        base = REGION_ORDER[0]
        for d in ds:
            for region in REGION_ORDER[1:]:
                r = np.zeros(len(names))
                r[names.index(f"{region}:{d}")] = 1
                r[names.index(f"{base}:{d}")] = -1
                R.append(r)
        return np.array(R)

    for label, ds in [(d, [d]) for d in domains] + [("All domains (joint)", domains)]:
        wald = res.wald_test(restriction(ds), use_f=False, scalar=True)
        rows.append({"spec": spec, "test": label, "method": "Wald, county-clustered",
                     "df": len(ds) * (len(REGION_ORDER) - 1),
                     "statistic": float(wald.statistic), "p_value": float(wald.pvalue)})
    restricted = sm.OLS(frame["acgr_mid"].to_numpy(), design(frame, domains, interacted=False)).fit()
    unrestricted = sm.OLS(frame["acgr_mid"].to_numpy(), design(frame, domains)).fit()
    lr, p, df = unrestricted.compare_lr_test(restricted)
    rows.append({"spec": spec, "test": "All domains (joint)", "method": "Likelihood ratio, iid errors",
                 "df": int(df), "statistic": float(lr), "p_value": float(p)})
    return pd.DataFrame(rows)


def contrasts(res, domains, spec):
    """Every pairwise regional difference in each domain's slope, with 95% CIs and Holm-adjusted p-values."""
    rows = []
    names = list(res.params.index)
    for d in domains:
        block = []
        for i, a in enumerate(REGION_ORDER):
            for b in REGION_ORDER[i + 1:]:
                r = np.zeros(len(names))
                r[names.index(f"{a}:{d}")] = 1
                r[names.index(f"{b}:{d}")] = -1
                t = res.t_test(r)
                low, high = t.conf_int()[0]
                # Ratio a/b with a delta-method 95% CI; only meaningful when b is clearly away from zero.
                ca, cb = res.params[f"{a}:{d}"], res.params[f"{b}:{d}"]
                cov = res.cov_params().loc[[f"{a}:{d}", f"{b}:{d}"], [f"{a}:{d}", f"{b}:{d}"]].to_numpy()
                grad = np.array([1 / cb, -ca / cb ** 2])
                ratio_se = float(np.sqrt(grad @ cov @ grad))
                block.append({"spec": spec, "domain": d, "region_a": a, "region_b": b,
                              "coef_a": ca, "coef_b": cb,
                              "difference": float(t.effect[0]), "ci_low": low, "ci_high": high,
                              "p_value": float(t.pvalue), "ratio_a_to_b": ca / cb,
                              "ratio_ci_low": ca / cb - 1.96 * ratio_se, "ratio_ci_high": ca / cb + 1.96 * ratio_se})
        holm = multipletests([row["p_value"] for row in block], method="holm")[1]
        for row, p in zip(block, holm):
            row["p_holm_within_domain"] = p
        rows += block
    return pd.DataFrame(rows)


def vif_table(frame, domains, spec):
    rows = []
    for region in REGION_ORDER:
        X = sm.add_constant(frame.loc[frame["region"] == region, [f"z_{d}" for d in domains]].to_numpy())
        for i, d in enumerate(domains, start=1):
            rows.append({"spec": spec, "region": region, "domain": d, "vif": variance_inflation_factor(X, i)})
    return pd.DataFrame(rows)


def demeaned_slopes(y, X, groups):
    """OLS slopes of y on X after removing group (state) means from both, the within estimator."""
    n_groups = groups.max() + 1
    counts = np.bincount(groups, minlength=n_groups)
    y_d = y - (np.bincount(groups, weights=y, minlength=n_groups) / counts)[groups]
    X_d = X - np.stack([np.bincount(groups, weights=X[:, j], minlength=n_groups) / counts
                        for j in range(X.shape[1])], axis=1)[groups]
    return np.linalg.lstsq(X_d, y_d, rcond=None)[0]


def weights_from_slopes(slopes, sds):
    """Domain weights on the ODIS 0-100 domain scale, summing to 1.

    A slope is the change in graduation rate (percentage points) per national SD of a domain score.  A domain gets
    weight in proportion to how much graduation falls per point of its score, -slope / SD; a domain whose score is
    not associated with lower graduation (slope >= 0) gets none.
    """
    raw = np.clip(-np.asarray(slopes), 0, None) / np.asarray(sds)
    return raw / raw.sum() if raw.sum() > 0 else np.full(len(raw), 1 / len(raw))


def bootstrap_weights(frame, domains, sds):
    """County-cluster bootstrap of each region's weights; returns {region: array (BOOTSTRAP, len(domains))}."""
    rng = np.random.default_rng(SEED)
    draws = {}
    for region in REGION_ORDER:
        sub = frame[frame["region"] == region]
        counties = sub[COUNTY].to_numpy()
        order = np.argsort(counties, kind="stable")
        _, starts = np.unique(counties[order], return_index=True)
        blocks = np.split(order, starts[1:])
        y = sub["acgr_mid"].to_numpy()
        X = sub[[f"z_{d}" for d in domains]].to_numpy()
        states = pd.factorize(sub["State"])[0]
        out = np.empty((BOOTSTRAP, len(domains)))
        for b in range(BOOTSTRAP):
            idx = np.concatenate([blocks[i] for i in rng.integers(0, len(blocks), len(blocks))])
            groups = pd.factorize(states[idx])[0]
            out[b] = weights_from_slopes(demeaned_slopes(y[idx], X[idx], groups), sds)
        draws[region] = out
    return draws


def regional_scores(df, weights):
    """Weighted average of each school's available domain scores with its region's weights, like ODIS's composite
    (which averages the available domains equally)."""
    W = np.vstack([weights.get(r, np.full(len(DOMAINS), np.nan)) for r in df["region"].fillna("")])
    values = df[DOMAINS].to_numpy()
    present = ~np.isnan(values)
    num = np.nansum(W * np.where(present, values, 0), axis=1)
    den = np.sum(np.where(present, W, 0), axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / den, np.nan)


def composite_variance_shares(df):
    """How much of the spread in the equal-weight composite each domain accounts for, over schools with all five
    domains: cov(domain / 5, composite) / var(composite), which sums to 1 across the domains."""
    full = df[df[DOMAINS].notna().all(axis=1)]
    composite = full[DOMAINS].mean(axis=1)
    return pd.DataFrame([{"domain": d, "sd": full[d].std(), "equal_weight": 0.2,
                          "share_of_composite_variance": (full[d] / 5).cov(composite) / composite.var()}
                         for d in DOMAINS])


def cross_validate(df, sample, sds):
    """Out-of-sample check: fit weights on 4/5 of counties, score the held-out schools, and correlate each score
    with graduation within state.  Returns a per-region table of correlations for the ODIS composite and the
    regional score."""
    rng = np.random.default_rng(SEED)
    counties = np.sort(sample[COUNTY].unique())
    fold_of = dict(zip(counties, rng.permutation(len(counties)) % FOLDS))
    fold = sample[COUNTY].map(fold_of)
    scores = pd.Series(np.nan, index=sample.index)
    for k in range(FOLDS):
        train, test = sample[fold != k], sample[fold == k]
        weights = {}
        for region in REGION_ORDER:
            sub = train[train["region"] == region]
            slopes = demeaned_slopes(sub["acgr_mid"].to_numpy(), sub[[f"z_{d}" for d in DOMAINS]].to_numpy(),
                                     pd.factorize(sub["State"])[0])
            weights[region] = weights_from_slopes(slopes, sds)
        scores[test.index] = regional_scores(test, weights)
    frame = sample.assign(cv_regional=scores)
    rows = []
    for region in REGION_ORDER + ["All regions"]:
        sub = frame if region == "All regions" else frame[frame["region"] == region]
        within = sub[["acgr_mid", "Composite Score", "cv_regional"]] - \
            sub[["acgr_mid", "Composite Score", "cv_regional"]].groupby(sub["State"]).transform("mean")
        rows.append({"region": region, "n_schools": len(sub),
                     "r_odis_composite": within["acgr_mid"].corr(within["Composite Score"]),
                     "r_regional_score_cv": within["acgr_mid"].corr(within["cv_regional"])})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------------------------------------------
# Charts


def save(fig, name):
    fig.savefig(OUT / name, dpi=overview.DPI)
    plt.close(fig)


SHORT_REGION = {"Pacific Northwest": "Pacific NW", "California": "CA", "No region": "PR"}
COVERAGE_ORDER = ["Usable rate (cohort 16+)", "50-point bin only (cohort 6-15)", "Suppressed (cohort 1-5)",
                  "Not in the ACGR file"]
COVERAGE_COLORS = [BLUE, "#9ec5f4", ORANGE, LIGHT_NEUTRAL]


def plot_coverage(df):
    table = pd.crosstab(df["State"], df["coverage"], normalize="index").reindex(columns=COVERAGE_ORDER, fill_value=0)
    counts = df["State"].value_counts()
    keys = pd.DataFrame({"region": [REGION_OF.get(s, "No region") for s in table.index],
                         "usable": table[COVERAGE_ORDER[0]]}, index=table.index)
    keys["rank"] = keys["region"].map({r: i for i, r in enumerate(REGION_ORDER + ["No region"])})
    table = table.loc[keys.sort_values(["rank", "usable"], ascending=[True, False]).index]
    fig, ax = plt.subplots(figsize=(13, 6.4))
    fig.subplots_adjust(left=0.06, right=0.99, top=0.85, bottom=0.25)
    x = np.arange(len(table))
    bottom = np.zeros(len(table))
    for label, color in zip(COVERAGE_ORDER, COVERAGE_COLORS):
        ax.bar(x, table[label] * 100, bottom=bottom, width=0.78, color=color, label=label,
               edgecolor="white", linewidth=0.6)
        bottom += table[label].to_numpy() * 100
    ax.set_xticks(x)
    ax.set_xticklabels(table.index, fontsize=8)
    ax.set_xlim(-0.6, len(table) - 0.4)
    ax.set_ylim(0, 100)
    ax.set_ylabel("Share of the state's ODIS schools (%)")
    overview.recessive_grid(ax, "y")
    # Region brackets under the state codes.
    regions = [REGION_OF.get(s, "No region") for s in table.index]
    start = 0
    for i in range(1, len(regions) + 1):
        if i == len(regions) or regions[i] != regions[start]:
            ax.annotate("", xy=(start - 0.35, -0.085), xytext=(i - 1 + 0.35, -0.085), xycoords=("data", "axes fraction"),
                        arrowprops={"arrowstyle": "-", "color": INK_2, "linewidth": 1})
            label = SHORT_REGION.get(regions[start], regions[start]) if i - start < 5 else regions[start]
            ax.annotate(label, xy=((start + i - 1) / 2, -0.12), xycoords=("data", "axes fraction"), ha="center",
                        va="top", fontsize=8.5, color=INK)
            start = i
    usable = (df["coverage"] == COVERAGE_ORDER[0]).sum()
    fig.suptitle(f"Graduation-rate coverage: {usable:,} of {len(df):,} ODIS schools "
                 f"({usable / len(df):.0%}) have a usable SY 2022-23 rate", x=0.01, ha="left", fontsize=13, fontweight="bold")
    ax.legend(frameon=False, loc="lower left", bbox_to_anchor=(0, 1.02), ncol=4, fontsize=9, borderaxespad=0)
    worst = table[COVERAGE_ORDER[0]].drop("PR").nsmallest(3)
    overview.caption(fig, "States grouped by region, then sorted by usable share. Usable = an exact rate or a range "
                          f"of at most {MAX_WIDTH} points. Lowest usable shares outside Puerto Rico (no school-level "
                          "ACGR in SY 2022-23): "
                          + ", ".join(f"{s} {v:.0%}" for s, v in worst.items())
                          + ". Most schools not in the file are career-technical centers and alternative schools, "
                            "which do not report their own cohort.")
    save(fig, "coverage_by_state.png")
    out = pd.crosstab(df["State"], df["coverage"]).reindex(columns=COVERAGE_ORDER, fill_value=0)
    out.insert(0, "region", [REGION_OF.get(s, "") for s in out.index])
    out.insert(1, "ODIS schools", counts.reindex(out.index))
    out["usable share"] = (out[COVERAGE_ORDER[0]] / out["ODIS schools"]).round(4)
    out.sort_values(["region", "usable share"]).to_csv(OUT / "coverage_by_state.csv")
    return table


def plot_coverage_bias(df):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.4), gridspec_kw={"width_ratios": [1, 1.15]})
    fig.subplots_adjust(left=0.2, right=0.98, top=0.84, bottom=0.22, wspace=0.35)
    types = ["Regular School", "Alternative School", "Career and Technical School", "Special Education School"]
    labels = {"Regular School": "Regular", "Alternative School": "Alternative",
              "Career and Technical School": "Career and technical", "Special Education School": "Special education"}
    shares = pd.crosstab(df["school_type"], df["coverage"], normalize="index").reindex(
        index=types, columns=COVERAGE_ORDER, fill_value=0)
    n_type = df["school_type"].value_counts().reindex(types)
    left = np.zeros(len(types))
    y = np.arange(len(types))[::-1]
    for label, color in zip(COVERAGE_ORDER, COVERAGE_COLORS):
        ax1.barh(y, shares[label] * 100, left=left, color=color, height=0.62, edgecolor="white", linewidth=0.6,
                 label=label)
        left += shares[label].to_numpy() * 100
    ax1.set_yticks(y)
    ax1.set_yticklabels([f"{labels[t]}\n({n_type[t]:,} schools)" for t in types], fontsize=9)
    for yi, t in zip(y, types):
        v = shares.loc[t, COVERAGE_ORDER[0]] * 100
        ax1.annotate(f"{v:.0f}%", (v / 2, yi), ha="center", va="center", fontsize=8.5, color="white",
                     fontweight="bold")
    ax1.set_xlim(0, 100)
    ax1.set_xlabel("Share of ODIS schools of that type (%)")
    ax1.set_title("By NCES school type", fontsize=11)
    overview.recessive_grid(ax1, "x")
    ax1.legend(frameon=False, loc="lower left", bbox_to_anchor=(-0.28, 1.1), ncol=4, fontsize=9, borderaxespad=0)

    in_model = df["sample_four_domain"] == 1
    bins = np.arange(0, 80, 2)
    ax2.hist(df.loc[in_model, "Composite Score"], bins=bins, density=True, color=BLUE, alpha=0.55,
             label=f"In the model sample ({in_model.sum():,})")
    ax2.hist(df.loc[~in_model & df["region"].notna(), "Composite Score"], bins=bins, density=True,
             histtype="step", color=ORANGE, linewidth=2, label=f"Not in the sample ({(~in_model & df['region'].notna()).sum():,})")
    m_in = df.loc[in_model, "Composite Score"].mean()
    m_out = df.loc[~in_model & df["region"].notna(), "Composite Score"].mean()
    ax2.set_xlabel("ODIS composite score (higher = more community stress)")
    ax2.set_ylabel("Density")
    ax2.set_title("ODIS composite of schools in and out of the model", fontsize=11)
    overview.recessive_grid(ax2, "y")
    ax2.legend(frameon=False, loc="upper right", fontsize=9)
    fig.suptitle("Who has a graduation rate? Coverage by school type and by community stress",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, f"Left: school type from the NCES CCD 2022-23 directory. Right: mean composite {m_in:.1f} in "
                          f"the sample and {m_out:.1f} outside it (Puerto Rico excluded). The model sample also needs "
                          "the Economic, Education, Health, and Housing scores. Schools outside it are more often "
                          "small, alternative, or career-technical, but their communities are about as stressed.")
    save(fig, "coverage_bias.png")
    return m_in, m_out


def plot_effects(coefs):
    fig, axes = plt.subplots(2, 3, figsize=(13, 8.2), sharex=True, sharey=True)
    fig.subplots_adjust(left=0.1, right=0.98, top=0.86, bottom=0.14, hspace=0.32, wspace=0.08)
    lo = min(coefs["ci_low"].min(), -0.5)
    hi = max(coefs["ci_high"].max(), 0.5)
    y = {d: i for i, d in enumerate(DOMAINS[::-1])}
    specs = [("Five domains", BLUE, 0.14), ("Four domains (no Crime)", ORANGE, -0.14)]
    for ax, region in zip(axes.flat, REGION_ORDER):
        ax.axvline(0, color=INK_2, linewidth=0.9)
        for spec, color, offset in specs:
            sub = coefs[(coefs["region"] == region) & (coefs["spec"] == spec)]
            ys = [y[d] + offset for d in sub["domain"]]
            ax.hlines(ys, sub["ci_low"], sub["ci_high"], color=color, linewidth=2)
            ax.plot(sub["coef"], ys, "o", color=color, markersize=6, markeredgecolor="white", markeredgewidth=1,
                    label=spec)
        five = coefs[(coefs["region"] == region) & (coefs["spec"] == "Five domains")].iloc[0]
        four = coefs[(coefs["region"] == region) & (coefs["spec"] == "Four domains (no Crime)")].iloc[0]
        ax.set_title(f"{region}\nn = {five['n_schools']:,} / {four['n_schools']:,}, within-state R² = "
                     f"{five['r2_within_state']:.2f}", fontsize=10.5)
        overview.recessive_grid(ax, "x")
        ax.set_yticks(range(len(DOMAINS)))
        ax.set_yticklabels(DOMAINS[::-1])
        ax.set_xlim(lo - 0.3, hi + 0.3)
    for ax in axes[-1]:
        ax.set_xlabel("Change in graduation rate (pp)\nper 1 SD more domain stress")
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, frameon=False, loc="upper right", ncol=2, bbox_to_anchor=(0.99, 0.995))
    fig.suptitle("How much each domain predicts graduation, region by region", x=0.01, ha="left", fontsize=13,
                 fontweight="bold")
    overview.caption(fig, "Points are OLS slopes with state fixed effects (schools compared within their state); bars "
                          "are 95% CIs with standard errors clustered by county. Domains are standardized nationally, "
                          "so slopes compare across regions. n = schools in the five-domain / four-domain sample. "
                          "Left of zero = more stress, lower graduation.")
    save(fig, "domain_effects.png")


def plot_weights(weights, ci):
    regions = ["ODIS (all regions)"] + REGION_ORDER
    matrix = np.vstack([np.full(len(DOMAINS), 0.2)] + [weights[r] for r in REGION_ORDER]) * 100
    fig, ax = plt.subplots(figsize=(11, 6.2))
    fig.subplots_adjust(left=0.18, right=0.98, top=0.85, bottom=0.14)
    ax.imshow(matrix, cmap=SEQUENTIAL, vmin=0, vmax=max(60, matrix.max()), aspect="auto")
    for i, region in enumerate(regions):
        for j, d in enumerate(DOMAINS):
            v = matrix[i, j]
            color = "white" if v > 50 else INK
            text = f"{v:.0f}%"
            if i > 0:
                low, high = ci[region][:, j] * 100
                text += f"\n{low:.0f}-{high:.0f}"
            ax.text(j, i, text, ha="center", va="center", fontsize=9.5 if i else 10, color=color,
                    fontweight="bold" if i == 0 else "normal")
    ax.set_xticks(range(len(DOMAINS)))
    ax.set_xticklabels(DOMAINS)
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(regions)))
    ax.set_yticklabels(regions)
    ax.axhline(0.5, color="white", linewidth=4)
    for side in ax.spines.values():
        side.set_visible(False)
    ax.tick_params(length=0)
    fig.suptitle("Domain weights: ODIS's equal 20% against weights learned from graduation, by region",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Each weight is the share of a region's regional stress score coming from that domain, on "
                          "ODIS's 0-100 domain scale; a domain gets weight in proportion to how much graduation falls "
                          "per point of its score, within state (five-domain model), and none if higher stress is not "
                          f"linked to lower graduation. Small numbers: 95% county-bootstrap interval ({BOOTSTRAP} draws).")
    save(fig, "domain_weights.png")


def plot_score_comparison(scores):
    fig, axes = plt.subplots(2, 3, figsize=(13, 8.6), sharex=True, sharey=True)
    fig.subplots_adjust(left=0.08, right=0.98, top=0.88, bottom=0.14, hspace=0.3, wspace=0.08)
    for ax, region in zip(axes.flat, REGION_ORDER):
        sub = scores[scores["region"] == region]
        others = scores[scores["region"] != region]
        ax.scatter(others["odis_pct"], others["regional_pct"], s=2, color=LIGHT_NEUTRAL, alpha=0.25, linewidths=0,
                   rasterized=True)
        ax.scatter(sub["odis_pct"], sub["regional_pct"], s=3, color=BLUE, alpha=0.35, linewidths=0, rasterized=True)
        ax.plot([0, 100], [0, 100], color=INK_2, linewidth=0.9, linestyle="--")
        rho = sub["odis_pct"].corr(sub["regional_pct"], method="spearman")
        moved = (sub["rank_change"].abs() >= 10).mean()
        ax.set_title(f"{region} ({len(sub):,} schools)", fontsize=10.5)
        ax.text(0.03, 0.97, f"Spearman ρ = {rho:.2f}\n{moved:.0%} move ≥10 points", transform=ax.transAxes,
                ha="left", va="top", fontsize=9, color=INK,
                bbox={"boxstyle": "round,pad=0.3", "facecolor": "white", "edgecolor": "none", "alpha": 0.85})
        ax.set_xlim(0, 100)
        ax.set_ylim(0, 100)
        ax.set_aspect("equal")
        overview.recessive_grid(ax, "both")
    for ax in axes[-1]:
        ax.set_xlabel("ODIS composite, national percentile")
    for ax in axes[:, 0]:
        ax.set_ylabel("Regional score, national percentile")
    rho_all = scores["odis_pct"].corr(scores["regional_pct"], method="spearman")
    fig.suptitle(f"ODIS composite against the regionally weighted score (all schools: Spearman ρ = {rho_all:.2f})",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Each dot is a school, scored with its region's weights; gray dots are the other regions. "
                          "Dots above the dashed line look more stressed under regional weighting than under ODIS's "
                          "equal weights. Percentiles are national, over all schools outside Puerto Rico; ODIS composites are "
                          "whole numbers, hence the columns.")
    save(fig, "score_comparison.png")


def plot_rank_change_map(county):
    from analysis.schoolscape import boundaries

    shapes = boundaries.load("counties").rename(columns={"id": COUNTY})
    conus = shapes[~shapes[COUNTY].str[:2].isin(["02", "15", "72"])].to_crs(5070)
    data = conus.merge(county, on=COUNTY, how="left")
    fig, ax = plt.subplots(figsize=(13, 7.6))
    fig.subplots_adjust(left=0.01, right=0.99, top=0.93, bottom=0.15)
    limit = 20
    norm = TwoSlopeNorm(vmin=-limit, vcenter=0, vmax=limit)
    has = data["mean_rank_change"].notna()
    data[~has].plot(ax=ax, color="white", edgecolor="#c9c8c3", hatch="////", linewidth=0.15)
    data[has].plot(ax=ax, column="mean_rank_change", cmap=DIVERGING, norm=norm, edgecolor="white", linewidth=0.15)
    states = boundaries.load("states")
    states = states[~states["id"].isin(["02", "15", "72"])].to_crs(5070)
    states.boundary.plot(ax=ax, color=INK_2, linewidth=0.4)
    ax.set_axis_off()
    sm_ = plt.cm.ScalarMappable(norm=norm, cmap=DIVERGING)
    cax = fig.add_axes([0.3, 0.115, 0.4, 0.02])
    bar = fig.colorbar(sm_, cax=cax, orientation="horizontal", extend="both")
    bar.set_label("Mean change in national percentile, regional score minus ODIS composite (points)", fontsize=9)
    bar.outline.set_visible(False)
    fig.suptitle("Where the regional weighting disagrees with ODIS: mean rank change by county",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Red: schools rank as more stressed under the regional weights than under ODIS; blue: less. "
                          "Hatched: no ODIS school. Alaska and Hawaii are not drawn; see county_rank_change.csv.")
    save(fig, "rank_change_map.png")


# ---------------------------------------------------------------------------------------------------------------


def fmt_frame(frame, digits=4):
    return frame.round(digits)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DERIVED.mkdir(parents=True, exist_ok=True)
    odis = load_odis()
    df = join(odis, load_acgr(), load_ccd_types())
    stats = standardize(df)
    sds = np.array([stats[d][1] for d in DOMAINS])

    # Derived file 1: the join, one row per ODIS school.
    joined = df[["NCESSCH", "State", COUNTY, "region", "acgr_value", "acgr_cohort", "acgr_status", "acgr_low",
                 "acgr_high", "acgr_mid", "acgr_width", "sample_four_domain", "sample_five_domain"]].copy()
    joined["acgr_cohort"] = joined["acgr_cohort"].astype("Int64")
    joined.to_csv(DERIVED / "graduation_joined.csv", index=False, lineterminator="\n")

    # Coverage.
    plot_coverage(df)
    m_in, m_out = plot_coverage_bias(df)
    cov_region = pd.crosstab(df["region"].fillna("No region (PR)"), df["coverage"]).reindex(columns=COVERAGE_ORDER,
                                                                                          fill_value=0)
    cov_region["four-domain sample"] = df.groupby(df["region"].fillna("No region (PR)"))["sample_four_domain"].sum()
    cov_region["five-domain sample"] = df.groupby(df["region"].fillna("No region (PR)"))["sample_five_domain"].sum()
    cov_region.to_csv(OUT / "coverage_by_region.csv")
    cov_type = pd.crosstab(df["school_type"].fillna("Not in CCD"), df["coverage"]).reindex(columns=COVERAGE_ORDER,
                                                                                            fill_value=0)
    cov_type.to_csv(OUT / "coverage_by_school_type.csv")
    usable = df[df["usable"]]
    cohort_by_status = df.groupby("coverage")["acgr_cohort"].median()

    # Models.
    s4 = df[df["sample_four_domain"] == 1]
    s5 = df[df["sample_five_domain"] == 1]
    res5 = fit(s5, DOMAINS)
    res4 = fit(s4, FOUR)
    coefs = pd.concat([region_table(res5, s5, DOMAINS, "Five domains"),
                       region_table(res4, s4, FOUR, "Four domains (no Crime)")], ignore_index=True)
    fmt_frame(coefs).to_csv(OUT / "domain_effects.csv", index=False)
    tests = pd.concat([heterogeneity_tests(res5, s5, DOMAINS, "Five domains"),
                       heterogeneity_tests(res4, s4, FOUR, "Four domains (no Crime)")], ignore_index=True)
    tests.to_csv(OUT / "heterogeneity_tests.csv", index=False, float_format="%.6g")
    pairs = pd.concat([contrasts(res5, DOMAINS, "Five domains"), contrasts(res4, FOUR, "Four domains (no Crime)")],
                      ignore_index=True)
    pairs.to_csv(OUT / "regional_contrasts.csv", index=False, float_format="%.6g")
    vif = pd.concat([vif_table(s5, DOMAINS, "Five domains"), vif_table(s4, FOUR, "Four domains (no Crime)")])
    fmt_frame(vif, 2).to_csv(OUT / "vif.csv", index=False)
    corr = s5[DOMAINS].corr().round(2)
    corr.to_csv(OUT / "domain_correlations.csv")
    variance = composite_variance_shares(df)
    fmt_frame(variance).to_csv(OUT / "composite_variance_shares.csv", index=False)

    # Sensitivity: the five-domain slopes under other choices.
    sens = [coefs[coefs["spec"] == "Five domains"].assign(variant="Main: state FE, cohorts 16+")]
    precise = s5[s5["precise"]]
    sens.append(region_table(fit(precise, DOMAINS), precise, DOMAINS, "Five domains")
                .assign(variant=f"Precise rates only (range <= {PRECISE_WIDTH} points, cohorts 61+)"))
    sens.append(region_table(fit(s5, DOMAINS, state_fe=False), s5, DOMAINS, "Five domains")
                .assign(variant="No state fixed effects"))
    coarse = df[df["acgr_status"].isin(["exact", "range"]) & df["acgr_cohort"].gt(0) & df[DOMAINS].notna().all(axis=1)
                & df["region"].notna()]
    sens.append(region_table(fit(coarse, DOMAINS), coarse, DOMAINS, "Five domains")
                .assign(variant="All non-suppressed rates, 50-point bins included"))
    sens = pd.concat(sens, ignore_index=True)
    fmt_frame(sens[["variant", "region", "domain", "coef", "ci_low", "ci_high", "p_value", "n_schools",
                    "r2_within_state"]]).to_csv(OUT / "sensitivity.csv", index=False)

    # Weights.
    five = coefs[coefs["spec"] == "Five domains"]
    weights = {r: weights_from_slopes(five[five["region"] == r].set_index("domain").loc[DOMAINS, "coef"], sds)
               for r in REGION_ORDER}
    draws = bootstrap_weights(s5, DOMAINS, sds)
    ci = {r: np.percentile(draws[r], [2.5, 97.5], axis=0) for r in REGION_ORDER}
    wt = pd.DataFrame([{"region": r, "domain": d, "weight": weights[r][j], "ci_low": ci[r][0, j],
                        "ci_high": ci[r][1, j], "odis_weight": 0.2,
                        "share_of_draws_with_zero_weight": float((draws[r][:, j] == 0).mean())}
                       for r in REGION_ORDER for j, d in enumerate(DOMAINS)])
    fmt_frame(wt).to_csv(OUT / "domain_weights.csv", index=False)
    plot_effects(coefs)
    plot_weights(weights, ci)

    # Scores and ranks.
    df["regional_score"] = regional_scores(df, weights)
    scored = df[df["region"].notna()].copy()
    scored["odis_pct"] = scored["Composite Score"].rank(pct=True) * 100
    scored["regional_pct"] = scored["regional_score"].rank(pct=True) * 100
    scored["rank_change"] = scored["regional_pct"] - scored["odis_pct"]
    out = scored[["NCESSCH", "Name", "State", COUNTY, "County", "region", "Composite Score", "regional_score",
                  "odis_pct", "regional_pct", "rank_change"]].rename(columns={
                      "Composite Score": "odis_composite", "odis_pct": "odis_percentile",
                      "regional_pct": "regional_percentile"})
    out = out.round({"regional_score": 2, "odis_percentile": 2, "regional_percentile": 2, "rank_change": 2})
    out.to_csv(DERIVED / "regional_stress_score.csv", index=False, lineterminator="\n")
    plot_score_comparison(scored)

    county = scored.groupby(COUNTY).agg(County=("County", "first"), State=("State", "first"),
                                        region=("region", "first"), schools=("NCESSCH", "size"),
                                        mean_rank_change=("rank_change", "mean"),
                                        mean_odis_percentile=("odis_pct", "mean"),
                                        mean_regional_percentile=("regional_pct", "mean")).reset_index()
    fmt_frame(county.sort_values("mean_rank_change"), 2).to_csv(OUT / "county_rank_change.csv", index=False)
    plot_rank_change_map(county)
    movers = pd.concat([scored.nlargest(15, "rank_change").assign(direction="more stressed under regional weights"),
                        scored.nsmallest(15, "rank_change").assign(direction="less stressed under regional weights")])
    fmt_frame(movers[["direction", "NCESSCH", "Name", "State", "County", "region", "Economic", "Education", "Health",
                      "Housing", "Crime", "Composite Score", "regional_score", "odis_pct", "regional_pct",
                      "rank_change"]], 2).to_csv(OUT / "top_movers.csv", index=False)
    by_region = scored.groupby("region").agg(
        schools=("NCESSCH", "size"),
        spearman=("odis_pct", lambda s: s.corr(scored.loc[s.index, "regional_pct"], method="spearman")),
        mean_rank_change=("rank_change", "mean"), mean_abs_rank_change=("rank_change", lambda s: s.abs().mean()),
        share_moving_10_or_more=("rank_change", lambda s: (s.abs() >= 10).mean())).reindex(REGION_ORDER)
    fmt_frame(by_region).to_csv(OUT / "rank_change_by_region.csv")
    cv = cross_validate(df, s5, sds)
    fmt_frame(cv).to_csv(OUT / "cross_validation.csv", index=False)

    # Console summary: every number quoted in visualizations/README.md.
    pd.set_option("display.width", 200)
    print(f"ODIS schools: {len(df):,}; matched in ACGR: {(df['acgr_status'] != 'not_reported').sum():,}")
    print(df["coverage"].value_counts().reindex(COVERAGE_ORDER).to_string())
    print(df["acgr_status"].value_counts().to_string())
    print("median cohort by coverage:", cohort_by_status.to_dict())
    print(f"usable: exact {(usable['acgr_width'] == 0).sum():,}, width<=5 {(usable['acgr_width'].between(1, 5)).sum():,},"
          f" width<=10 {(usable['acgr_width'].between(6, 10)).sum():,}, width<=20 {(usable['acgr_width'] > 10).sum():,}")
    print(f"composite mean in sample {m_in:.2f}, outside {m_out:.2f}")
    print(cov_region.to_string())
    print(cov_type.to_string())
    print(f"four-domain sample {len(s4):,}, five-domain sample {len(s5):,}")
    print(f"mean grad rate (midpoint) in s5 {s5['acgr_mid'].mean():.1f}, sd {s5['acgr_mid'].std():.1f}")
    print(coefs.round(2).to_string())
    print(tests.to_string())
    print(pairs[pairs["p_holm_within_domain"] < 0.05].round(3).to_string())
    print(vif.groupby("domain")["vif"].max().round(2).to_string())
    print(corr.to_string())
    print(variance.round(3).to_string())
    print(wt.round(3).to_string())
    print(by_region.round(3).to_string())
    print(f"overall Spearman {scored['odis_pct'].corr(scored['regional_pct'], method='spearman'):.3f}; "
          f"share moving >=10 points {(scored['rank_change'].abs() >= 10).mean():.3f}")
    print(county[county["schools"] >= 5].sort_values("mean_rank_change").head(8).round(1).to_string())
    print(county[county["schools"] >= 5].sort_values("mean_rank_change").tail(8).round(1).to_string())
    print(cv.round(3).to_string())
    print(sens.pivot_table(index=["region", "domain"], columns="variant", values="coef").round(2).to_string())


if __name__ == "__main__":
    main()
