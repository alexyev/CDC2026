# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""Regional variation: how the ODIS domain scores differ between US regions.

Reads data/index_scores_v3_2026_ct_filled.csv and writes PNG charts plus CSV
tables into visualizations/03-regional-variation/.

The analysis regions start from the Census regions and divisions and split out
the areas the project asked about (see REGIONS below and
visualizations/README.md). For each region it estimates:

- medians of each domain score and the composite, with 95% cluster-bootstrap
  confidence intervals that resample counties, because many indicators are one
  value per county and schools in the same county are not independent;
- Cliff's delta against the rest of the US, a rank-based effect size;
- how much of the school-to-school variation lies between regions, between
  states, between counties, and within counties, from a linear mixed model
  with schools nested in counties nested in states;
- region-specific Spearman correlations of each pair of domains, with a
  county-clustered Wald test of whether the pair's slope differs by region;
- a within-region contrast of schools in large cities against the rest, using
  the dataset's own City Health Dashboard coverage as the large-city marker;
- which domains and indicators drive overall stress within each region,
  measured without the circularity of correlating a domain with a composite
  that contains it (see "Drivers of stress within each region" below).

Run from the repository root:

    python analysis/03_regional_variation.py

The output is deterministic: every random draw comes from one seeded generator.
"""

import importlib
import itertools
import warnings
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import MaxNLocator
from scipy import stats

# Shared palette, rcParams, and helpers from the data overview.
overview = importlib.import_module("01_data_overview")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "index_scores_v3_2026_ct_filled.csv"
OUT = ROOT / "visualizations" / "03-regional-variation"

INK, INK_2, GRID, BLUE = overview.INK, overview.INK_2, overview.GRID, overview.BLUE
MUTED = "#898781"
NEUTRAL = "#b9b8b3"
RED = "#e34948"
# Diverging blue <-> red with a gray midpoint: blue = less stress than the rest
# of the US, red = more.
DIVERGING = LinearSegmentedColormap.from_list(
    "stress", ["#184f95", "#6da7ec", "#f0efec", "#ef8a89", "#b52f2e"])

SEED = 2026
N_BOOT = 2000  # cluster-bootstrap replicates for medians and Cliff's delta
N_BOOT_CORR = 1000  # replicates for the region-specific correlations
MOSTLY_MISSING = 0.25  # flag a region x measure cell when more rows than this are missing

DOMAINS = ["Economic", "Education", "Health", "Housing", "Crime"]
MEASURES = DOMAINS + ["Composite Score"]
SHORT = {"Composite Score": "Composite"}

# Census Bureau regions and divisions (census.gov, "Census Regions and
# Divisions of the United States"). Puerto Rico is not in any Census region.
CENSUS_DIVISIONS = {
    "New England": ("Northeast", "CT ME MA NH RI VT"),
    "Middle Atlantic": ("Northeast", "NJ NY PA"),
    "East North Central": ("Midwest", "IL IN MI OH WI"),
    "West North Central": ("Midwest", "IA KS MN MO NE ND SD"),
    "South Atlantic": ("South", "DE DC FL GA MD NC SC VA WV"),
    "East South Central": ("South", "AL KY MS TN"),
    "West South Central": ("South", "AR LA OK TX"),
    "Mountain": ("West", "AZ CO ID MT NV NM UT WY"),
    "Pacific": ("West", "AK CA HI OR WA"),
}

# Analysis regions. The Census Northeast, Midwest, and South are kept whole;
# the Census West is split into the areas the project asked about. Idaho moves
# from the Mountain division to the Pacific Northwest. Alaska, Hawaii, and
# Puerto Rico are kept as their own small groups rather than merged into a
# region they share little with; their results carry wide intervals.
REGIONS = {
    "Northeast": "CT ME MA NH RI VT NJ NY PA",
    "Midwest": "IL IN MI OH WI IA KS MN MO NE ND SD",
    "South": "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX",
    "Pacific Northwest": "WA OR ID",
    "California": "CA",
    "Mountain & Southwest": "AZ CO MT NV NM UT WY",
    "Alaska": "AK",
    "Hawaii": "HI",
    "Puerto Rico": "PR",
}
ORDER = list(REGIONS)
MAINLAND = ORDER[:6]  # the six regions large enough for the heterogeneity tests
REGION_NOTE = {
    "Northeast": "Census Northeast (New England + Middle Atlantic)",
    "Midwest": "Census Midwest; the project's \"North\"",
    "South": "Census South, including DC",
    "Pacific Northwest": "WA, OR (Census Pacific) + ID (Census Mountain)",
    "California": "Census Pacific, on its own",
    "Mountain & Southwest": "Census Mountain without ID",
    "Alaska": "Census Pacific, on its own (small)",
    "Hawaii": "Census Pacific, on its own (small)",
    "Puerto Rico": "Not in a Census region",
}

# The indicators each domain score averages (ODIS README v3). A missing
# indicator drops out and the others are re-weighted.
DOMAIN_INPUTS = {
    "Economic": ["Unemployment", "Poverty", "Access to broadband internet", "Single-parent households"],
    "Education": ["Less than HS", "2-year college or higher", "Linguistic isolation"],
    "Health": ["Access to healthcare", "Infant mortality rate", "SNAP recipients", "Low birth weight",
               "Lead exposure risk"],
    "Housing": ["Housing vacancy rate", "Housing affordability", "Park access"],
    "Crime": ["Violent crime rate", "Incarceration rate"],
}
INPUTS = [c for cols in DOMAIN_INPUTS.values() for c in cols]
# Flag a region x domain when its schools have, on average, fewer than this
# share of the domain's indicators: the score there measures something narrower.
PARTIAL_INPUTS = 0.6

# Indicators whose availability differs strongly by region, for the missing-data chart.
GAP_COLUMNS = ["Violent crime rate", "Incarceration rate", "Infant mortality rate",
               "Low birth weight", "Single-parent households", "Lead exposure risk", "Park access"]

# Region x measure cells shown as "no data" instead of an estimate.
NO_DATA = 0.9


def load():
    df = pd.read_csv(DATA, dtype=str, keep_default_na=False)
    state_region = {s: r for r, states in REGIONS.items() for s in states.split()}
    state_division = {s: (d, cr) for d, (cr, states) in CENSUS_DIVISIONS.items() for s in states.split()}
    unknown = set(df["State"]) - set(state_region)
    assert not unknown, f"states without a region: {sorted(unknown)}"
    df["region"] = pd.Categorical(df["State"].map(state_region), categories=ORDER, ordered=True)
    df["census_division"] = df["State"].map(lambda s: state_division.get(s, ("None", "None"))[0])
    df["census_region"] = df["State"].map(lambda s: state_division.get(s, ("None", "None"))[1])
    df["county"] = df["FIPS County Code"]
    for col in MEASURES + INPUTS:
        df[col] = pd.to_numeric(df[col].where(~df[col].isin(["N/A", ""])), errors="raise")
    # Large-city marker: ODIS takes Lead exposure risk and Park access from the
    # City Health Dashboard, which covers large cities only, so a school has
    # either value only when its area lies in a covered city. Connecticut's two
    # columns were filled statewide (data/README.md), so the marker is not
    # defined there.
    city = df["Lead exposure risk"].notna() | df["Park access"].notna()
    df["large_city"] = city.where(df["State"] != "CT")
    return df


def region_label(region, n=None):
    return f"{region}\n(n = {n:,})" if n is not None else region


def save(fig, name):
    fig.savefig(OUT / name, dpi=overview.DPI)
    plt.close(fig)


# --- Cluster bootstrap -------------------------------------------------------

def county_groups(df):
    """Row positions of each county, grouped by region, for resampling."""
    groups = {}
    codes = df["county"].to_numpy()
    for region in ORDER:
        rows = np.flatnonzero((df["region"] == region).to_numpy())
        order = rows[np.argsort(codes[rows], kind="stable")]
        _, starts = np.unique(codes[order], return_index=True)
        groups[region] = np.split(order, starts[1:])
    return groups


# Method: Stratified cluster (county) bootstrap (Davison and Hinkley 1997; Field and Welsh 2007); see CITATIONS.md,
# section 3.
def resample(groups, rng):
    """One stratified cluster-bootstrap draw: counties with replacement within each region."""
    return {region: np.concatenate([counties[i] for i in rng.integers(0, len(counties), len(counties))])
            for region, counties in groups.items()}


# Method: Cliff's delta via the Mann-Whitney U statistic (Cliff 1993; Mann and Whitney 1947); see CITATIONS.md,
# section 3.
def cliffs_delta(values, labels):
    """Cliff's delta of each region's values against everyone else's, from one ranking.

    delta = P(region > rest) - P(region < rest), ties counting half, via the
    Mann-Whitney U statistic. Positive means the region's schools tend to score
    higher (more stress). Returns {region: delta}.
    """
    ok = ~np.isnan(values)
    ranks, labels = stats.rankdata(values[ok]), labels[ok]
    n = len(ranks)
    out = {}
    for name in ORDER:
        inside = labels == name
        n1 = inside.sum()
        n2 = n - n1
        if n1 == 0 or n2 == 0:
            out[name] = np.nan
            continue
        u = ranks[inside].sum() - n1 * (n1 + 1) / 2
        out[name] = 2 * u / (n1 * n2) - 1
    return out


def input_share(df, region, measure):
    """Mean share of the domain's indicators present, over the region's schools that have the score."""
    if measure not in DOMAIN_INPUTS:
        return np.nan
    sub = df[(df["region"] == region) & df[measure].notna()]
    return round(float(sub[DOMAIN_INPUTS[measure]].notna().mean(axis=1).mean()), 3) if len(sub) else np.nan


def region_estimates(df, groups, rng):
    """Medians and Cliff's delta per region x measure, with cluster-bootstrap CIs."""
    values = df[MEASURES].to_numpy(dtype=float)
    region = df["region"].to_numpy()

    def estimate(rows):
        v, r = values[rows], region[rows]
        med = np.full((len(ORDER), len(MEASURES)), np.nan)
        delta = np.full_like(med, np.nan)
        for j in range(len(MEASURES)):
            deltas = cliffs_delta(v[:, j], r)
            for i, name in enumerate(ORDER):
                col = v[r == name, j]
                if np.isfinite(col).sum():
                    med[i, j] = np.nanmedian(col)
                delta[i, j] = deltas[name]
        return med, delta

    point_med, point_delta = estimate(np.arange(len(df)))
    boot_med, boot_delta = [], []
    for _ in range(N_BOOT):
        draw = resample(groups, rng)
        med, delta = estimate(np.concatenate([draw[r] for r in ORDER]))
        boot_med.append(med)
        boot_delta.append(delta)
    boot_med, boot_delta = np.array(boot_med), np.array(boot_delta)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med_ci = np.nanpercentile(boot_med, [2.5, 97.5], axis=0)
        delta_ci = np.nanpercentile(boot_delta, [2.5, 97.5], axis=0)

    rows = []
    for i, name in enumerate(ORDER):
        sub = df[df["region"] == name]
        for j, m in enumerate(MEASURES):
            present = sub[m].notna()
            rows.append({
                "region": name, "measure": m,
                "schools": len(sub), "schools_with_value": int(present.sum()),
                "share_missing": round(1 - present.mean(), 4),
                "counties": sub.loc[present, "county"].nunique(), "states": sub.loc[present, "State"].nunique(),
                "median": point_med[i, j], "median_ci_low": med_ci[0, i, j], "median_ci_high": med_ci[1, i, j],
                "cliffs_delta_vs_rest": point_delta[i, j],
                "delta_ci_low": delta_ci[0, i, j], "delta_ci_high": delta_ci[1, i, j],
            })
    summary = pd.DataFrame(rows)
    summary["inputs_present"] = [input_share(df, r, m) for r, m in zip(summary["region"], summary["measure"])]
    # A region with no value for a measure gets no estimate at all.
    empty = summary["schools_with_value"] == 0
    summary.loc[empty, ["median", "median_ci_low", "median_ci_high",
                        "cliffs_delta_vs_rest", "delta_ci_low", "delta_ci_high"]] = np.nan
    return summary


# --- Mixed models --------------------------------------------------------------

# Method: Linear mixed model with nested random intercepts, fitted by REML (Patterson and Thompson 1971; Laird and
# Ware 1982); see CITATIONS.md, section 3.
def fit_nested(data, formula, county_level):
    """REML fit of formula with random intercepts for states and counties within states.

    A county-level measure (one value per county) has no within-county
    variance, which makes the county component and the residual unidentifiable.
    For those the county component is dropped, and the residual is then the
    between-county variance.
    """
    vc = None if county_level else {"county": "0 + C(county)"}
    model = smf.mixedlm(formula, data, groups="State", re_formula="1", vc_formula=vc)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return model.fit(reml=True)


def anova_shares(data):
    """Plain nested sums of squares: the descriptive counterpart of the model shares."""
    y = data["y"]
    means = {level: y.groupby(data[level], observed=True).transform("mean") for level in ("region", "State", "county")}
    total = ((y - y.mean()) ** 2).sum()
    return {
        "region": ((means["region"] - y.mean()) ** 2).sum() / total,
        "state_within_region": ((means["State"] - means["region"]) ** 2).sum() / total,
        "county_within_state": ((means["county"] - means["State"]) ** 2).sum() / total,
        "school_within_county": ((y - means["county"]) ** 2).sum() / total,
    }


def variance_decomposition(df):
    """Share of each measure's variance between regions, states, counties, and schools.

    Fits measure ~ region + (1 | state) + (1 | county within state). The region
    share is the variance of the fitted region means across schools; the other
    shares are the estimated variance components. Also returns the intraclass
    correlation of schools in the same county, used for the design effect, and
    the plain sums-of-squares shares as a cross-check.
    """
    rows = []
    for m in MEASURES:
        data = df.loc[df[m].notna(), ["State", "county", "region", m]].rename(columns={m: "y"})
        data["region"] = data["region"].astype(str)
        county_level = bool((data.groupby("county")["y"].nunique() == 1).all())
        fit = fit_nested(data, "y ~ C(region)", county_level)
        fixed = fit.model.exog @ fit.fe_params.to_numpy()
        state = float(fit.cov_re.iloc[0, 0])
        if county_level:
            county, school = float(fit.scale), 0.0
        else:
            county, school = float(fit.vcomp[0]), float(fit.scale)
        parts = {"region": np.var(fixed), "state_within_region": state,
                 "county_within_state": county, "school_within_county": school}
        total = sum(parts.values())
        row = {"measure": m, "schools": len(data), "county_level_measure": county_level,
               "converged": bool(fit.converged), "total_variance": total}
        row.update({f"share_{k}": v / total for k, v in parts.items()})
        row["icc_county"] = (state + county) / (total - parts["region"])
        row.update({f"anova_share_{k}": v for k, v in anova_shares(data).items()})
        rows.append(row)
    return pd.DataFrame(rows)


# Method: Design effect and effective sample size for clustered data (Kish 1965); see CITATIONS.md, section 3.
def design_effects(df, decomposition):
    """Effective sample size per region: schools / (1 + (m - 1) * ICC).

    m is the school-weighted mean number of schools per county, so large
    counties count for more, as they do in the variance of a mean.
    """
    icc = decomposition.set_index("measure")["icc_county"]
    rows = []
    for region in ORDER:
        sub = df[df["region"] == region]
        for m in MEASURES:
            sizes = sub.loc[sub[m].notna(), "county"].value_counts()
            if sizes.empty:
                continue
            m_bar = (sizes ** 2).sum() / sizes.sum()
            deff = 1 + (m_bar - 1) * icc[m]
            rows.append({"region": region, "measure": m, "schools_per_county_weighted": round(m_bar, 1),
                         "design_effect": round(deff, 1), "effective_n": round(sizes.sum() / deff)})
    return pd.DataFrame(rows)


# --- Correlations by region ----------------------------------------------------

# Method: Spearman rank correlation (Spearman 1904); see CITATIONS.md, section 3.
def spearman(a, b):
    ok = ~(np.isnan(a) | np.isnan(b))
    if ok.sum() < 10:
        return np.nan
    with warnings.catch_warnings():
        # A resampled small region can hold a single county with one Crime value.
        warnings.simplefilter("ignore", stats.ConstantInputWarning)
        return stats.spearmanr(a[ok], b[ok]).statistic


# Method: OLS with county cluster-robust standard errors and a Wald test (Liang and Zeger 1986; Cameron and Miller
# 2015; Wald 1943); see CITATIONS.md, section 3.
def heterogeneity_test(df, a, b):
    """County-clustered Wald test that the slope of b on a is the same in every mainland region.

    Both measures are converted to national rank scores scaled to unit
    variance, so each region's slope is on the Spearman scale.
    """
    data = df.loc[df["region"].isin(MAINLAND) & df[a].notna() & df[b].notna(), [a, b, "region", "county"]].copy()
    for col, name in ((a, "x"), (b, "y")):
        r = stats.rankdata(data[col])
        data[name] = (r - r.mean()) / r.std()
    data["region"] = data["region"].astype(str)
    fit = smf.ols("y ~ C(region) * x", data).fit(cov_type="cluster", cov_kwds={"groups": data["county"]})
    names = [n for n in fit.params.index if ":x" in n]
    test = fit.wald_test(" = 0, ".join(names) + " = 0", scalar=True)
    return float(test.statistic), len(names), float(test.pvalue)


def correlations_by_region(df, groups, rng):
    pairs = list(itertools.combinations(DOMAINS, 2))
    values = {m: df[m].to_numpy(dtype=float) for m in DOMAINS}
    index = {r: np.flatnonzero((df["region"] == r).to_numpy()) for r in ORDER}
    point = {(r, p): spearman(values[p[0]][index[r]], values[p[1]][index[r]]) for r in ORDER for p in pairs}
    boot = {k: [] for k in point}
    for _ in range(N_BOOT_CORR):
        draw = resample(groups, rng)
        for r in ORDER:
            for p in pairs:
                boot[(r, p)].append(spearman(values[p[0]][draw[r]], values[p[1]][draw[r]]))
    rows = []
    for (r, p), rho in point.items():
        b = np.array(boot[(r, p)], dtype=float)
        lo, hi = (np.nanpercentile(b, [2.5, 97.5]) if np.isfinite(b).any() else (np.nan, np.nan))
        n = int((df.loc[df["region"] == r, list(p)].notna().all(axis=1)).sum())
        rows.append({"pair": f"{p[0]} - {p[1]}", "region": r, "schools": n,
                     "spearman": rho, "ci_low": lo, "ci_high": hi})
    national = {f"{a} - {b}": spearman(values[a], values[b]) for a, b in pairs}
    tests = []
    for a, b in pairs:
        stat, dof, p = heterogeneity_test(df, a, b)
        sub = [point[(r, (a, b))] for r in MAINLAND]
        tests.append({"pair": f"{a} - {b}", "national_spearman": national[f"{a} - {b}"],
                      "mainland_min": np.nanmin(sub), "mainland_max": np.nanmax(sub),
                      "mainland_range": np.nanmax(sub) - np.nanmin(sub),
                      "wald_chi2": stat, "wald_df": dof, "wald_p": p})
    return pd.DataFrame(rows), pd.DataFrame(tests)


# --- Large-city contrast -------------------------------------------------------

CITY_MEASURES = ["Economic", "Education"]


def large_city_contrast(df, rng):
    """Median of each measure for large-city and other schools within each region, with county-bootstrap CIs."""
    rows = []
    for region in ORDER:
        sub = df[(df["region"] == region) & df["large_city"].notna()]
        for flag, label in ((True, "Large city"), (False, "Other")):
            part = sub[sub["large_city"] == flag]
            if len(part) < 20:
                continue
            counties = [g.index.to_numpy() for _, g in part.groupby("county")]
            for m in CITY_MEASURES:
                vals = part[m]
                boot = [np.nanmedian(vals.loc[np.concatenate([counties[i] for i in rng.integers(0, len(counties), len(counties))])])
                        for _ in range(N_BOOT)]
                lo, hi = np.percentile(boot, [2.5, 97.5])
                rows.append({"region": region, "group": label, "measure": m, "schools": int(vals.notna().sum()),
                             "counties": len(counties), "median": vals.median(), "ci_low": lo, "ci_high": hi})
    return pd.DataFrame(rows)


# --- Drivers of stress within each region -------------------------------------
#
# The composite is the plain average of whichever domain scores a school has
# (it matches the recomputed mean within 0.8 points, the rounding of the
# inputs). So correlating a domain with the composite is partly true by
# construction: the domain is a fifth of the composite. Two measures avoid that:
#
# - leave-one-out association: the Spearman correlation of a domain with the
#   average of the OTHER domains, and of an indicator with the average of the
#   domains it does not feed. It asks "where this is high, is the rest of
#   community stress high too?"
# - contribution share: the composite's variance within the region split
#   exactly into one term per domain, Cov(w_d * D_d, C) / Var(C), with w_d the
#   domain's weight in each school's composite. The shares sum to 100% and say
#   which domain the differences in overall stress between the region's
#   communities come from.

# Indicators to rank beside the domains, with the domain each one feeds.
DRIVER_INDICATORS = {
    "Poverty": "Economic",
    "Unemployment": "Economic",
    "Single-parent households": "Economic",
    "Access to broadband internet": "Economic",
    "Less than HS": "Education",
    "Linguistic isolation": "Education",
    "SNAP recipients": "Health",
    "Access to healthcare": "Health",
    "Infant mortality rate": "Health",
    "Housing affordability": "Housing",
    "Housing vacancy rate": "Housing",
    "Violent crime rate": "Crime",
}
DRIVERS = DOMAINS + list(DRIVER_INDICATORS)
SIZE_LABELS = [(0.5, "strong"), (0.3, "moderate"), (0.1, "weak"), (0.0, "negligible")]
# A region needs this many counties for a county bootstrap to mean anything:
# Hawaii has 4, so its county-level indicators take only 4 distinct values.
MIN_DRIVER_COUNTIES = 20


def without_domain(df, domain):
    """Average of the domain scores other than `domain`, over those present."""
    return df[[d for d in DOMAINS if d != domain]].mean(axis=1)


def size_label(rho):
    return next(label for cut, label in SIZE_LABELS if abs(rho) >= cut) if np.isfinite(rho) else ""


# Method: Benjamini-Hochberg false discovery rate (Benjamini and Hochberg 1995); see CITATIONS.md, section 3.
def benjamini_hochberg(p):
    """Benjamini-Hochberg adjusted p-values (q-values), NaN-aware."""
    p = np.asarray(p, dtype=float)
    q = np.full_like(p, np.nan)
    ok = np.flatnonzero(np.isfinite(p))
    order = ok[np.argsort(p[ok])]
    ranked = p[order] * len(ok) / np.arange(1, len(ok) + 1)
    q[order] = np.minimum(1, np.minimum.accumulate(ranked[::-1])[::-1])
    return q


# Method: Percentile-bootstrap p-value (Efron and Tibshirani 1993); see CITATIONS.md, section 3.
def bootstrap_p(draws):
    """Two-sided percentile-bootstrap p-value for "the statistic is 0", consistent with the percentile CI."""
    draws = draws[np.isfinite(draws)]
    tail = min((draws <= 0).sum(), (draws >= 0).sum())
    return min(1.0, 2 * (tail + 1) / (len(draws) + 1))


def contribution_shares(parts, composite):
    """Each domain's share of Var(composite): Cov(w_d * D_d, C) / Var(C)."""
    c = composite - composite.mean()
    var = (c ** 2).mean()
    return ((parts - parts.mean(axis=0)) * c[:, None]).mean(axis=0) / var


def driver_analysis(df, groups, rng):
    """Leave-one-out associations and composite variance shares per region, with county-bootstrap CIs."""
    x = {d: df[d].to_numpy(dtype=float) for d in DRIVERS}
    loo = {d: without_domain(df, d).to_numpy() for d in DOMAINS}
    rest = {d: loo[DRIVER_INDICATORS.get(d, d)] for d in DRIVERS}
    present = df[DOMAINS].notna().to_numpy()
    k = present.sum(axis=1)
    weighted = np.where(present, np.nan_to_num(df[DOMAINS].to_numpy(dtype=float)), 0) / k[:, None]
    composite = weighted.sum(axis=1)  # the recomputed composite; parts sum to it exactly
    regions = [r for r in ORDER if df.loc[df["region"] == r, "county"].nunique() >= MIN_DRIVER_COUNTIES]
    index = {r: np.flatnonzero((df["region"] == r).to_numpy()) for r in regions}
    groups = {r: groups[r] for r in regions}

    def estimate(rows_by_region):
        rho = {(r, d): spearman(x[d][rows], rest[d][rows]) for r, rows in rows_by_region.items() for d in DRIVERS}
        share = {r: contribution_shares(weighted[rows], composite[rows]) for r, rows in rows_by_region.items()}
        return rho, share

    point_rho, point_share = estimate(index)
    boot_rho = {key: [] for key in point_rho}
    boot_share = {r: [] for r in regions}
    for _ in range(N_BOOT_CORR):
        rho, share = estimate(resample(groups, rng))
        for key, v in rho.items():
            boot_rho[key].append(v)
        for r, v in share.items():
            boot_share[r].append(v)

    rows = []
    for (r, d), rho in point_rho.items():
        b = np.array(boot_rho[(r, d)], dtype=float)
        ok = np.isfinite(b)
        if not np.isfinite(rho) or ok.sum() < 100:
            continue
        lo, hi = np.percentile(b[ok], [2.5, 97.5])
        n = int((np.isfinite(x[d][index[r]]) & np.isfinite(rest[d][index[r]])).sum())
        rows.append({"region": r, "measure": d, "kind": "domain" if d in DOMAINS else "indicator",
                     "domain": DRIVER_INDICATORS.get(d, d), "schools": n,
                     "counties": df.loc[index[r]][np.isfinite(x[d][index[r]])]["county"].nunique(),
                     "loo_spearman": rho, "ci_low": lo, "ci_high": hi,
                     "p": bootstrap_p(b), "size": size_label(rho),
                     "ci_clears_0.1": bool(lo > 0.1 or hi < -0.1),
                     "ci_clears_0.3": bool(lo > 0.3 or hi < -0.3)})
    drivers = pd.DataFrame(rows)
    drivers["q_bh"] = benjamini_hochberg(drivers["p"])
    drivers["rank_in_region"] = drivers.groupby(["region", "kind"])["loo_spearman"].rank(ascending=False, method="min")

    share_rows = []
    for r in regions:
        b = np.array(boot_share[r])
        lo, hi = np.nanpercentile(b, [2.5, 97.5], axis=0)
        for i, d in enumerate(DOMAINS):
            if not present[index[r], i].any():
                continue
            share_rows.append({"region": r, "domain": d, "share_of_composite_variance": point_share[r][i],
                               "ci_low": lo[i], "ci_high": hi[i],
                               "domain_present": round(float(present[index[r], i].mean()), 4)})
    shares = pd.DataFrame(share_rows)
    shares["rank_in_region"] = shares.groupby("region")["share_of_composite_variance"].rank(ascending=False,
                                                                                               method="min")

    # Do regions differ? Pairwise tests of the mainland regions' leave-one-out
    # correlations: the bootstrap distribution of the difference, from the same
    # draws (regions are resampled independently within each draw).
    d_rows = []
    for m in DRIVERS:
        for r1, r2 in itertools.combinations(MAINLAND, 2):
            a, b = point_rho[(r1, m)], point_rho[(r2, m)]
            if not (np.isfinite(a) and np.isfinite(b)):
                continue
            diff = np.array(boot_rho[(r1, m)], dtype=float) - np.array(boot_rho[(r2, m)], dtype=float)
            lo, hi = np.nanpercentile(diff, [2.5, 97.5])
            d_rows.append({"measure": m, "region_a": r1, "region_b": r2, "spearman_a": a, "spearman_b": b,
                           "difference": a - b, "ci_low": lo, "ci_high": hi, "p": bootstrap_p(diff)})
    differences = pd.DataFrame(d_rows)
    differences["q_bh"] = benjamini_hochberg(differences["p"])
    return drivers, shares, differences


# --- Charts ----------------------------------------------------------------------

def plot_region_sizes(df):
    counts = df.groupby("region", observed=True).agg(
        schools=("State", "size"), counties=("county", "nunique"), states=("State", "nunique"))
    fig, ax = plt.subplots(figsize=(12, 5.6))
    fig.subplots_adjust(left=0.2, right=0.97, top=0.88, bottom=0.16)
    y = np.arange(len(counts))[::-1]
    ax.barh(y, counts["schools"], color=BLUE, height=0.65)
    ax.set_yticks(y)
    ax.set_yticklabels(counts.index, fontsize=10)
    overview.recessive_grid(ax, "x")
    for yi, (region, row) in zip(y, counts.iterrows()):
        states = REGIONS[region].replace(" ", ", ") if row["states"] > 1 else REGIONS[region]
        ax.annotate(f"{row['schools']:,} schools in {row['counties']:,} counties\n{states}", (row["schools"], yi),
                    ha="left", va="center", fontsize=8.5, color=INK_2, xytext=(4, 0), textcoords="offset points",
                    linespacing=1.4)
    ax.set_xlim(0, counts["schools"].max() * 2.05)
    ax.set_xlabel("High schools in the region")
    ax.set_title("The nine analysis regions and how many schools each holds")
    overview.caption(fig, "Regions follow the Census regions, with the Census West split into the Pacific Northwest (WA, OR, ID), "
                          "California, and the Mountain & Southwest states. Alaska, Hawaii, and Puerto Rico stay separate; "
                          "with 43-205 schools in 4-77 counties their estimates are much less certain. Source: ODIS v3, CT-filled file.")
    save(fig, "regions_school_counts.png")
    return counts


def plot_profile_heatmap(summary):
    median = summary.pivot(index="region", columns="measure", values="median").loc[ORDER, MEASURES]
    delta = summary.pivot(index="region", columns="measure", values="cliffs_delta_vs_rest").loc[ORDER, MEASURES]
    missing = summary.pivot(index="region", columns="measure", values="share_missing").loc[ORDER, MEASURES]
    inputs = summary.pivot(index="region", columns="measure", values="inputs_present").loc[ORDER, MEASURES]
    n = summary.groupby("region")["schools"].first().loc[ORDER]
    fig, ax = plt.subplots(figsize=(12, 8.6))
    fig.subplots_adjust(left=0.23, right=0.88, top=0.89, bottom=0.12)
    im = ax.imshow(delta.to_numpy(dtype=float), cmap=DIVERGING, vmin=-0.6, vmax=0.6, aspect="auto")
    for i, region in enumerate(ORDER):
        for j, m in enumerate(MEASURES):
            share = missing.loc[region, m]
            if share >= NO_DATA:
                ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, facecolor="white", edgecolor=NEUTRAL,
                                           hatch="///", linewidth=0))
                ax.text(j, i, "no data", ha="center", va="center", fontsize=9, color=INK_2)
                continue
            d = delta.loc[region, m]
            color = "white" if abs(d) > 0.38 else INK
            notes = []
            if share > MOSTLY_MISSING:
                notes.append(f"{share:.0%} missing")
            if inputs.loc[region, m] < PARTIAL_INPUTS:
                notes.append(f"{inputs.loc[region, m]:.0%} of inputs")
                ax.add_patch(plt.Rectangle((j - 0.46, i - 0.44), 0.92, 0.88, facecolor="none", edgecolor=color,
                                           linestyle=(0, (3, 2)), linewidth=1.2))
            text = f"{median.loc[region, m]:.0f}\nδ {d:+.2f}" + "".join("\n" + n for n in notes)
            ax.text(j, i, text, ha="center", va="center", fontsize=8 if len(notes) > 1 else 8.5, color=color,
                    linespacing=1.2 if len(notes) > 1 else 1.3)
    ax.set_xticks(range(len(MEASURES)))
    ax.set_xticklabels([SHORT.get(m, m) for m in MEASURES], fontsize=10)
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(ORDER)))
    ax.set_yticklabels([f"{r}  (n = {n[r]:,})" for r in ORDER], fontsize=9.5)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_xticks(np.arange(len(MEASURES) + 1) - 0.5, minor=True)
    ax.set_yticks(np.arange(len(ORDER) + 1) - 0.5, minor=True)
    ax.grid(which="minor", color="white", linewidth=2)
    ax.tick_params(which="minor", length=0)
    cbar = fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02)
    cbar.set_label("Cliff's delta against the rest of the US\n(blue = less stress, red = more)")
    cbar.outline.set_visible(False)
    fig.suptitle("Regional profile: median score and effect size against the rest of the US",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Each cell: the region's median score (0-100, higher = more community stress) and Cliff's delta, "
                          "the chance a school in the region scores higher than one elsewhere minus the chance it scores lower. "
                          "|δ| ≈ 0.15 is small, 0.33 medium, 0.47 large. Cells note the share of schools missing the measure "
                          "when it exceeds 25%; hatched cells have none (Puerto Rico and Connecticut have no Crime data). Dashed "
                          "outline: the score rests on under 60% of its indicators (Alaska and Hawaii Crime = violent crime only).")
    save(fig, "region_profile_heatmap.png")


def plot_medians_ci(summary, df):
    national = df[MEASURES].median()
    fig, axes = plt.subplots(2, 3, figsize=(14, 9.2), sharey=True)
    fig.subplots_adjust(left=0.13, right=0.98, top=0.88, bottom=0.12, wspace=0.08, hspace=0.35)
    y = np.arange(len(ORDER))[::-1]
    for ax, m in zip(axes.flat, MEASURES):
        s = summary[summary["measure"] == m].set_index("region").loc[ORDER]
        ok = s["median"].notna()
        ax.hlines(y[ok], s.loc[ok, "median_ci_low"], s.loc[ok, "median_ci_high"], color=BLUE, linewidth=2)
        ax.plot(s.loc[ok, "median"], y[ok], "o", color=BLUE, markersize=7, markeredgecolor="white", markeredgewidth=1.5)
        for yi, (region, row) in zip(y, s.iterrows()):
            if not np.isfinite(row["median"]):
                ax.annotate("no data", (0.5, yi), xycoords=("axes fraction", "data"), ha="center", va="center",
                            fontsize=8, color=MUTED, bbox={"facecolor": "white", "edgecolor": "none", "pad": 1})
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        ax.axvline(national[m], color=INK_2, linestyle="--", linewidth=1)
        ax.annotate(f"US {national[m]:.0f}", (national[m], y[0] + 0.7), ha="left", va="center", fontsize=8,
                    color=INK_2, xytext=(3, 0), textcoords="offset points")
        ax.set_ylim(-0.6, len(ORDER) - 0.1)
        ax.set_title(SHORT.get(m, m), fontsize=11.5)
        overview.recessive_grid(ax, "x")
        ax.set_xlabel("Median score (0-100)", fontsize=9)
    axes[0, 0].set_yticks(y)
    axes[0, 0].set_yticklabels(ORDER, fontsize=9.5)
    axes[1, 0].set_yticklabels(ORDER, fontsize=9.5)
    fig.suptitle("Regional medians with 95% county-cluster bootstrap confidence intervals",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, f"Dots are region medians; bars are 95% intervals from {N_BOOT:,} bootstrap draws that resample whole "
                          "counties within each region, since county-level indicators are shared by every school in a county. "
                          "Dashed line: the median of all US schools. Each panel has its own x range. "
                          "Alaska and Hawaii intervals are wide because they have few schools and counties.")
    save(fig, "region_medians_ci.png")


def plot_distributions(df):
    fig, axes = plt.subplots(3, 2, figsize=(14, 13), sharex=True)
    fig.subplots_adjust(left=0.07, right=0.98, top=0.93, bottom=0.09, hspace=0.3, wspace=0.12)
    positions = np.arange(len(ORDER))
    for ax, m in zip(axes.flat, MEASURES):
        data = [df.loc[(df["region"] == r) & df[m].notna(), m].to_numpy() for r in ORDER]
        keep = [i for i, d in enumerate(data) if len(d) >= 5]
        parts = ax.violinplot([data[i] for i in keep], positions=positions[keep], widths=0.8,
                              showextrema=False)
        for body in parts["bodies"]:
            body.set_facecolor(BLUE)
            body.set_edgecolor("none")
            body.set_alpha(0.35)
        ax.boxplot([data[i] for i in keep], positions=positions[keep], widths=0.18, showfliers=False,
                   patch_artist=True, medianprops={"color": INK, "linewidth": 1.8},
                   boxprops={"facecolor": "white", "edgecolor": INK_2}, whiskerprops={"color": INK_2},
                   capprops={"color": INK_2})
        for i, d in enumerate(data):
            if len(d) < 5:
                ax.annotate("no data", (i, 50), ha="center", va="center", fontsize=8, color=MUTED, rotation=90)
        ax.axhline(df[m].median(), color=INK_2, linestyle="--", linewidth=1)
        ax.set_title(SHORT.get(m, m), fontsize=11.5)
        ax.set_ylim(0, 100)
        ax.set_ylabel("Score (0-100)", fontsize=9)
        overview.recessive_grid(ax, "y")
    for ax in axes[-1]:
        ax.set_xticks(positions)
        ax.set_xticklabels([r.replace(" & ", " &\n").replace("Pacific ", "Pacific\n") for r in ORDER], fontsize=8.5)
    fig.suptitle("Distribution of each score by region", x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Violins show the full spread of school scores; boxes mark the middle half with the median line, "
                          "whiskers reach 1.5 box lengths. Dashed line: the median of all US schools. "
                          "The Crime score is one value per county, which gives its violins their spiky shape.")
    save(fig, "region_distributions.png")


def plot_variance_decomposition(decomposition):
    parts = [("share_region", "Between regions", "#0d366b"),
             ("share_state_within_region", "Between states, same region", "#3987e5"),
             ("share_county_within_state", "Between counties, same state", "#9ec5f4"),
             ("share_school_within_county", "Between schools, same county", "#e4e3df")]
    d = decomposition.set_index("measure").loc[MEASURES[::-1]]
    fig, ax = plt.subplots(figsize=(12, 5.4))
    fig.subplots_adjust(left=0.13, right=0.98, top=0.84, bottom=0.19)
    left = np.zeros(len(d))
    y = np.arange(len(d))
    for col, label, color in parts:
        v = d[col].to_numpy() * 100
        ax.barh(y, v, left=left, color=color, height=0.65, edgecolor="white", linewidth=2, label=label)
        for yi, (l, w) in enumerate(zip(left, v)):
            if w >= 3:
                ax.text(l + w / 2, yi, f"{w:.0f}%", ha="center", va="center", fontsize=9,
                        color="white" if color in ("#0d366b", "#3987e5") else INK)
        left += v
    ax.set_yticks(y)
    ax.set_yticklabels([SHORT.get(m, m) for m in d.index], fontsize=10)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Share of the school-to-school variance (%)")
    ax.legend(ncol=4, frameon=False, loc="lower left", bbox_to_anchor=(0, 1.0), fontsize=9)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_visible(False)
    ax.tick_params(length=0)
    fig.suptitle("Where the variation lives: regions, states, counties, or schools", x=0.01, ha="left",
                 fontsize=13, fontweight="bold")
    overview.caption(fig, "From a linear mixed model per measure: score ~ region + random state + random county within state (REML, "
                          "statsmodels MixedLM). The region share is the variance of the fitted region means. Crime has no "
                          "within-county share because both of its indicators are county-level values.")
    save(fig, "variance_decomposition.png")


def plot_correlation_heatmap(corr, tests):
    tests = tests.sort_values("mainland_range", ascending=False)
    pairs = tests["pair"].tolist()
    rho = corr.pivot(index="pair", columns="region", values="spearman").loc[pairs, ORDER]
    table = np.column_stack([tests["national_spearman"].to_numpy(), rho.to_numpy(dtype=float)])
    cols = ["All US"] + ORDER
    fig, ax = plt.subplots(figsize=(14, 7.6))
    fig.subplots_adjust(left=0.19, right=0.9, top=0.84, bottom=0.12)
    im = ax.imshow(table, cmap=DIVERGING, vmin=-0.8, vmax=0.8, aspect="auto")
    for i in range(table.shape[0]):
        for j in range(table.shape[1]):
            v = table[i, j]
            if np.isnan(v):
                ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, facecolor="white", edgecolor=NEUTRAL,
                                           hatch="///", linewidth=0))
                ax.text(j, i, "no data", ha="center", va="center", fontsize=8, color=INK_2)
            else:
                ax.text(j, i, f"{v:+.2f}", ha="center", va="center", fontsize=9,
                        color="white" if abs(v) > 0.5 else INK, fontweight="bold" if j == 0 else "normal")
    ax.axvline(0.5, color="white", linewidth=5)
    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels([c.replace(" & ", " &\n").replace("Pacific ", "Pacific\n") for c in cols], fontsize=9)
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(pairs)))
    labels = [f"{p}\nrange {r:.2f}, p {_p(pv)}" for p, r, pv in
              zip(pairs, tests["mainland_range"], tests["wald_p"])]
    ax.set_yticklabels(labels, fontsize=8.5)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    cbar = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label("Spearman correlation")
    cbar.outline.set_visible(False)
    fig.suptitle("The same pair, different answers: Spearman correlation of each domain pair by region",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Rows are sorted by how much the correlation varies across the six mainland regions (range = max - min). "
                          "p: county-clustered Wald test that the rank slope is equal in those six regions. "
                          "Alaska and Hawaii (few counties) and Puerto Rico are shown but not tested. See correlations_by_region.csv for 95% intervals.")
    save(fig, "correlations_by_region_heatmap.png")
    return pairs


def _p(p):
    return "< 0.001" if p < 0.001 else f"{p:.3f}"


def plot_correlation_ci(corr, tests, top=4):
    pairs = tests.sort_values("mainland_range", ascending=False)["pair"].head(top).tolist()
    fig, axes = plt.subplots(1, top, figsize=(15, 6.2), sharey=True)
    fig.subplots_adjust(left=0.12, right=0.98, top=0.8, bottom=0.2, wspace=0.08)
    y = np.arange(len(ORDER))[::-1]
    national = tests.set_index("pair")["national_spearman"]
    for ax, pair in zip(axes, pairs):
        s = corr[corr["pair"] == pair].set_index("region").loc[ORDER]
        ok = s["spearman"].notna()
        small = s.index.isin(["Alaska", "Hawaii", "Puerto Rico"])
        for mask, color in ((ok & ~small, BLUE), (ok & small, NEUTRAL)):
            ax.hlines(y[mask], s.loc[mask, "ci_low"], s.loc[mask, "ci_high"], color=color, linewidth=2)
            ax.plot(s.loc[mask, "spearman"], y[mask], "o", color=color, markersize=7,
                    markeredgecolor="white", markeredgewidth=1.5)
        for yi, has in zip(y, ok):
            if not has:
                ax.annotate("no data", (0, yi), ha="center", va="center", fontsize=8, color=MUTED)
        ax.axvline(0, color=NEUTRAL, linewidth=1)
        ax.axvline(national[pair], color=INK_2, linestyle="--", linewidth=1)
        ax.annotate(f"US {national[pair]:+.2f}", (national[pair], y[0] + 0.75), ha="left", va="center", fontsize=8,
                    color=INK_2, xytext=(3, 0), textcoords="offset points")
        ax.set_ylim(-0.6, len(ORDER) + 0.1)
        ax.set_xlim(-0.8, 1)
        ax.set_title(pair.replace(" - ", " vs\n"), fontsize=11)
        ax.set_xlabel("Spearman correlation", fontsize=9)
        overview.recessive_grid(ax, "x")
    axes[0].set_yticks(y)
    axes[0].set_yticklabels(ORDER, fontsize=9.5)
    fig.suptitle(f"The {top} domain pairs whose correlation differs most between regions, with 95% intervals",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, f"Intervals from {N_BOOT_CORR:,} county-cluster bootstrap draws within each region. Dashed line: all US schools. "
                          "Gray: Alaska, Hawaii, and Puerto Rico, which have too few counties for a reliable interval.")
    save(fig, "correlations_by_region_ci.png")


def plot_pair_scatter(df, pair, corr):
    a, b = pair.split(" - ")
    fig, axes = plt.subplots(2, 3, figsize=(13, 9), sharex=True, sharey=True)
    fig.subplots_adjust(left=0.07, right=0.98, top=0.87, bottom=0.1, hspace=0.3, wspace=0.08)
    rho = corr[corr["pair"] == pair].set_index("region")
    cmap = LinearSegmentedColormap.from_list("blue", overview.BLUE_RAMP[1:])
    top = min(100, np.ceil(df.loc[df["region"].isin(MAINLAND), b].max() / 10) * 10 + 10)
    for ax, region in zip(axes.flat, MAINLAND):
        sub = df[(df["region"] == region) & df[a].notna() & df[b].notna()]
        ax.hexbin(sub[a], sub[b], gridsize=25, extent=(0, 100, 0, 100), cmap=cmap, mincnt=1, bins="log",
                  linewidths=0.2)
        r = rho.loc[region]
        ax.set_title(f"{region}\nρ = {r['spearman']:+.2f} [{r['ci_low']:+.2f}, {r['ci_high']:+.2f}], "
                     f"n = {len(sub):,}", fontsize=10.5)
        ax.set_xlim(0, 100)
        ax.set_ylim(0, top)
    for ax in axes[-1]:
        ax.set_xlabel(f"{a} score", fontsize=9.5)
    for ax in axes[:, 0]:
        ax.set_ylabel(f"{b} score", fontsize=9.5)
    fig.suptitle(f"{a} vs {b} by region: the pair whose relationship changes most",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Each hexagon counts schools (log color scale, darker = more). ρ is the Spearman correlation with its "
                          "95% county-cluster bootstrap interval. The six mainland regions only.")
    save(fig, "pair_scatter_by_region.png")


def plot_state_medians(df):
    rows = []
    for state, g in df.groupby("State"):
        c = g["Composite Score"]
        rows.append({"state": state, "region": g["region"].iloc[0], "schools": len(g),
                     "median": c.median(), "q25": c.quantile(0.25), "q75": c.quantile(0.75)})
    states = pd.DataFrame(rows)
    states["region"] = pd.Categorical(states["region"], categories=ORDER, ordered=True)
    states = states.sort_values(["region", "median", "state"], ascending=[True, False, True]).reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(15, 6.4))
    fig.subplots_adjust(left=0.06, right=0.99, top=0.86, bottom=0.2)
    x = np.arange(len(states)) + states["region"].cat.codes.to_numpy() * 1.2
    ax.vlines(x, states["q25"], states["q75"], color=BLUE, linewidth=2, alpha=0.45)
    ax.plot(x, states["median"], "o", color=BLUE, markersize=6, markeredgecolor="white", markeredgewidth=1.2)
    ax.axhline(df["Composite Score"].median(), color=INK_2, linestyle="--", linewidth=1)
    ax.set_xticks(x)
    ax.set_xticklabels(states["state"], fontsize=7.5, rotation=90)
    for region in ORDER:
        xs = x[(states["region"] == region).to_numpy()]
        mid = xs.mean()
        label = {"Pacific Northwest": "Pacific\nNW", "Mountain & Southwest": "Mountain &\nSouthwest",
                 "California": "CA", "Alaska": "AK", "Hawaii": "HI", "Puerto Rico": "PR"}.get(region, region)
        ax.annotate(label, (mid, 0), xycoords=("data", "axes fraction"), ha="center", va="top", fontsize=8.5,
                    color=INK, fontweight="bold", xytext=(0, -26), textcoords="offset points")
        ax.axvspan(xs.min() - 0.6, xs.max() + 0.6, color=GRID, alpha=0.35 if ORDER.index(region) % 2 else 0,
                   linewidth=0)
    ax.set_xlim(x.min() - 1, x.max() + 1)
    ax.set_ylabel("Composite score (0-100)")
    overview.recessive_grid(ax, "y")
    fig.suptitle("States within each region: median composite score and middle half of schools",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Dots are state medians; bars span the 25th to 75th percentile of the state's schools. States are grouped "
                          "by analysis region and sorted by median within it. Dashed line: the median of all US schools. "
                          "Every state counts once, whatever its size.")
    save(fig, "state_medians_by_region.png")
    return states


def plot_large_city(contrast):
    regions = [r for r in ORDER if set(contrast.loc[contrast["region"] == r, "group"]) == {"Large city", "Other"}]
    fig, axes = plt.subplots(1, len(CITY_MEASURES), figsize=(13, 6.2), sharey=True)
    fig.subplots_adjust(left=0.16, right=0.98, top=0.8, bottom=0.2, wspace=0.08)
    y = np.arange(len(regions))[::-1]
    styles = {"Large city": (BLUE, 0.17), "Other": (overview.ORANGE, -0.17)}
    for ax, m in zip(axes, CITY_MEASURES):
        for group, (color, off) in styles.items():
            s = contrast[(contrast["measure"] == m) & (contrast["group"] == group)].set_index("region").loc[regions]
            ax.hlines(y + off, s["ci_low"], s["ci_high"], color=color, linewidth=2)
            ax.plot(s["median"], y + off, "o", color=color, markersize=7, markeredgecolor="white",
                    markeredgewidth=1.5, label="Rest of the region" if group == "Other" else "Large city")
        ax.set_title(m, fontsize=11.5)
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        ax.set_xlabel("Median score (0-100), 95% interval", fontsize=9)
        overview.recessive_grid(ax, "x")
    n = contrast[contrast["measure"] == CITY_MEASURES[0]].pivot(index="region", columns="group", values="schools").loc[regions].astype(int)
    axes[0].set_yticks(y)
    axes[0].set_yticklabels([f"{r}\n{n.loc[r, 'Large city']:,} city / {n.loc[r, 'Other']:,} other" for r in regions],
                            fontsize=9)
    axes[0].legend(frameon=False, loc="lower left", bbox_to_anchor=(0, 1.08), ncol=2)
    fig.suptitle("Large-city schools against the rest, within each region", x=0.01, ha="left", fontsize=13,
                 fontweight="bold")
    overview.caption(fig, "Large city = the school's area has a City Health Dashboard value (Lead exposure risk or Park access), "
                          "which exists only in large cities; a proxy, not an official urban-rural code. Connecticut is excluded "
                          "(those columns were filled statewide) and regions without both groups are left out. "
                          "Only Economic and Education are compared, because Health and Housing include the CHD columns themselves.")
    save(fig, "large_city_contrast.png")


def plot_missing_by_region(df):
    cols = MEASURES + GAP_COLUMNS
    share = df[cols].isna().groupby(df["region"], observed=True).mean().loc[ORDER] * 100
    cmap = LinearSegmentedColormap.from_list("blue", overview.BLUE_RAMP)
    fig, ax = plt.subplots(figsize=(13, 6.8))
    fig.subplots_adjust(left=0.17, right=0.93, top=0.76, bottom=0.1)
    im = ax.imshow(share.to_numpy(), cmap=cmap, vmin=0, vmax=100, aspect="auto")
    for i in range(share.shape[0]):
        for j in range(share.shape[1]):
            v = share.iat[i, j]
            ax.text(j, i, f"{v:.0f}" if v >= 0.5 else "·", ha="center", va="center", fontsize=8.5,
                    color="white" if v > 55 else INK)
    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels([overview._wrap(SHORT.get(c, c), 14) for c in cols], rotation=40, ha="left", fontsize=8.5)
    ax.xaxis.tick_top()
    ax.axvline(len(MEASURES) - 0.5, color="white", linewidth=4)
    ax.set_yticks(range(len(ORDER)))
    ax.set_yticklabels(ORDER, fontsize=9.5)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    cbar = fig.colorbar(im, ax=ax, fraction=0.025, pad=0.02)
    cbar.set_label("Schools missing the column (%)")
    cbar.outline.set_visible(False)
    fig.suptitle("Where each region's data is missing: scores (left) and the gappiest indicators (right)",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Percent of the region's schools with N/A or an empty cell; a dot means none. "
                          "A domain score averages whichever of its indicators exist, so where crime, infant mortality, lead, or "
                          "park data is missing, the Crime, Health, and Housing scores rest on fewer inputs or are absent.")
    save(fig, "missing_by_region.png")
    return share


def _missing_label(region):
    return "too few\ncounties" if region == "Hawaii" else "no data"


def _heat_cell(ax, j, i, rho, q, strong_ci, fontsize=8.5):
    color = "white" if abs(rho) > 0.5 else INK
    if q >= 0.05:  # not significant: gray italic, darker on the stronger colors
        color = INK_2 if abs(rho) > 0.4 else MUTED
    ax.text(j, i, f"{rho:+.2f}" + ("*" if strong_ci else ""), ha="center", va="center", fontsize=fontsize,
            color=color, fontweight="bold" if strong_ci else "normal", fontstyle="italic" if q >= 0.05 else "normal")


def plot_driver_domains(drivers, shares):
    doms = drivers[drivers["kind"] == "domain"]
    rho = doms.pivot(index="region", columns="measure", values="loo_spearman").reindex(index=ORDER, columns=DOMAINS)
    q = doms.pivot(index="region", columns="measure", values="q_bh").reindex(index=ORDER, columns=DOMAINS)
    clears = doms.pivot(index="region", columns="measure", values="ci_clears_0.3").reindex(index=ORDER, columns=DOMAINS)
    share = shares.pivot(index="region", columns="domain", values="share_of_composite_variance") \
        .reindex(index=ORDER, columns=DOMAINS) * 100
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 8), sharey=True)
    fig.subplots_adjust(left=0.13, right=0.97, top=0.83, bottom=0.14, wspace=0.12)
    im1 = ax1.imshow(rho.to_numpy(dtype=float), cmap=DIVERGING, vmin=-0.8, vmax=0.8, aspect="auto")
    cmap = LinearSegmentedColormap.from_list("blue", overview.BLUE_RAMP)
    im2 = ax2.imshow(share.to_numpy(dtype=float), cmap=cmap, vmin=0, vmax=60, aspect="auto")
    for i, r in enumerate(ORDER):
        top_share = share.loc[r].idxmax() if share.loc[r].notna().any() else None
        for j, d in enumerate(DOMAINS):
            v = rho.loc[r, d]
            if np.isfinite(v):
                _heat_cell(ax1, j, i, v, q.loc[r, d], bool(clears.loc[r, d]))
            else:
                ax1.text(j, i, _missing_label(r), ha="center", va="center", fontsize=8, color=MUTED)
            s = share.loc[r, d]
            if np.isfinite(s):
                ax2.text(j, i, f"{s:.0f}%", ha="center", va="center", fontsize=9,
                         color="white" if s > 35 else INK, fontweight="bold" if d == top_share else "normal")
            else:
                ax2.text(j, i, _missing_label(r), ha="center", va="center", fontsize=8, color=MUTED)
    for ax, title in ((ax1, "Association with the other domains\n(leave-one-out Spearman ρ)"),
                      (ax2, "Share of the composite's variance\nwithin the region")):
        ax.set_xticks(range(len(DOMAINS)))
        ax.set_xticklabels(DOMAINS, fontsize=9.5)
        ax.xaxis.tick_top()
        ax.set_title(title, fontsize=11, pad=34)
        ax.tick_params(length=0)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.set_xticks(np.arange(len(DOMAINS) + 1) - 0.5, minor=True)
        ax.set_yticks(np.arange(len(ORDER) + 1) - 0.5, minor=True)
        ax.grid(which="minor", color="white", linewidth=2)
        ax.tick_params(which="minor", length=0)
    ax1.set_yticks(range(len(ORDER)))
    ax1.set_yticklabels(ORDER, fontsize=9.5)
    for im, ax, label in ((im1, ax1, "ρ"), (im2, ax2, "%")):
        cbar = fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02, orientation="horizontal", location="bottom")
        cbar.set_label(label)
        cbar.outline.set_visible(False)
    fig.suptitle("What drives community stress in each region: the five domains", x=0.01, ha="left",
                 fontsize=13, fontweight="bold")
    overview.caption(fig, "Left: Spearman ρ between a domain and the average of the other four, so no domain is correlated with "
                          "itself. * and bold: the 95% county-bootstrap interval lies beyond ±0.3; gray italic: not significant after "
                          "Benjamini-Hochberg correction. Right: each domain's exact share of the composite's variance among the "
                          "region's schools (bold = largest); the shares sum to 100%.")
    save(fig, "drivers_domains.png")


def plot_driver_indicators(drivers):
    ind = drivers[drivers["kind"] == "indicator"]
    cols = list(DRIVER_INDICATORS)
    rho = ind.pivot(index="region", columns="measure", values="loo_spearman").reindex(index=ORDER, columns=cols)
    q = ind.pivot(index="region", columns="measure", values="q_bh").reindex(index=ORDER, columns=cols)
    clears = ind.pivot(index="region", columns="measure", values="ci_clears_0.3").reindex(index=ORDER, columns=cols)
    fig, ax = plt.subplots(figsize=(15, 7.6))
    fig.subplots_adjust(left=0.13, right=0.92, top=0.8, bottom=0.1)
    im = ax.imshow(rho.to_numpy(dtype=float), cmap=DIVERGING, vmin=-0.8, vmax=0.8, aspect="auto")
    for i, r in enumerate(ORDER):
        for j, c in enumerate(cols):
            v = rho.loc[r, c]
            if np.isfinite(v):
                _heat_cell(ax, j, i, v, q.loc[r, c], bool(clears.loc[r, c]))
            else:
                ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1, facecolor="white", edgecolor=NEUTRAL,
                                           hatch="///", linewidth=0))
                ax.text(j, i, _missing_label(r), ha="center", va="center", fontsize=8, color=INK_2)
    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels([f"{overview._wrap(c, 16)}\n({DRIVER_INDICATORS[c]})" for c in cols], rotation=0,
                       fontsize=8.2)
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(ORDER)))
    ax.set_yticklabels(ORDER, fontsize=9.5)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_xticks(np.arange(len(cols) + 1) - 0.5, minor=True)
    ax.set_yticks(np.arange(len(ORDER) + 1) - 0.5, minor=True)
    ax.grid(which="minor", color="white", linewidth=2)
    ax.tick_params(which="minor", length=0)
    cbar = fig.colorbar(im, ax=ax, fraction=0.025, pad=0.02)
    cbar.set_label("Spearman ρ with the domains the indicator does not feed")
    cbar.outline.set_visible(False)
    fig.suptitle("Which indicators travel with the rest of a community's stress, by region", x=0.01, ha="left",
                 fontsize=13, fontweight="bold")
    overview.caption(fig, "Each cell: Spearman ρ between the indicator and the average of the four domains it does not feed (in "
                          "parentheses), so it is not correlated with itself. * and bold: the 95% county-bootstrap interval lies "
                          "beyond ±0.3; gray italic: not significant after Benjamini-Hochberg correction. Hatched: no estimate "
                          "(Puerto Rico lacks the county-level indicators; Hawaii has only 4 counties).")
    save(fig, "drivers_indicators.png")


def plot_driver_differences(drivers, differences):
    fig, axes = plt.subplots(1, len(DOMAINS), figsize=(16, 6.2), sharey=True)
    fig.subplots_adjust(left=0.12, right=0.98, top=0.8, bottom=0.17, wspace=0.08)
    y = np.arange(len(ORDER))[::-1]
    for ax, d in zip(axes, DOMAINS):
        s = drivers[drivers["measure"] == d].set_index("region").reindex(ORDER)
        ok = s["loo_spearman"].notna().to_numpy()
        small = s.index.isin(["Alaska", "Hawaii", "Puerto Rico"])
        for mask, color in ((ok & ~small, BLUE), (ok & small, NEUTRAL)):
            ax.hlines(y[mask], s.loc[mask, "ci_low"], s.loc[mask, "ci_high"], color=color, linewidth=2)
            ax.plot(s.loc[mask, "loo_spearman"], y[mask], "o", color=color, markersize=7,
                    markeredgecolor="white", markeredgewidth=1.5)
        for yi, has in zip(y, ok):
            if not has:
                ax.annotate(_missing_label(ORDER[len(ORDER) - 1 - yi]).replace("\n", " "), (0.2, yi), ha="center",
                            va="center", fontsize=8, color=MUTED,
                            bbox={"facecolor": "white", "edgecolor": "none", "pad": 1})
        for cut in (0.3, 0.5):
            ax.axvline(cut, color=MUTED, linewidth=1, linestyle=":")
        ax.axvline(0, color=NEUTRAL, linewidth=1)
        diff = differences[(differences["measure"] == d) & (differences["q_bh"] < 0.05)]
        ax.set_title(f"{d}\n{len(diff)} of 15 region pairs differ", fontsize=10.5)
        ax.set_xlim(-0.6, 1)
        ax.set_xlabel("Leave-one-out ρ", fontsize=9)
        overview.recessive_grid(ax, "x")
    axes[0].set_yticks(y)
    axes[0].set_yticklabels(ORDER, fontsize=9.5)
    fig.suptitle("Do the regions differ? Each domain's association with the other four, with 95% intervals",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    overview.caption(fig, "Intervals from 1,000 county-cluster bootstrap draws. Dotted lines mark ρ = 0.3 (moderate) and 0.5 (strong). "
                          "\"Region pairs differ\": of the 15 pairs of mainland regions, how many have different ρ at a "
                          "Benjamini-Hochberg q < 0.05 (bootstrap test of the difference). Gray: Alaska and Puerto Rico, not "
                          "tested; Hawaii has too few counties.")
    save(fig, "drivers_differences.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    df = load()
    groups = county_groups(df)

    regions = df.groupby("State").agg(census_region=("census_region", "first"),
                                      census_division=("census_division", "first"),
                                      analysis_region=("region", "first"), schools=("State", "size"),
                                      counties=("county", "nunique")).reset_index()
    regions["analysis_region"] = pd.Categorical(regions["analysis_region"], categories=ORDER, ordered=True)
    regions.sort_values(["analysis_region", "State"]).to_csv(OUT / "regions.csv", index=False)

    counts = plot_region_sizes(df)
    summary = region_estimates(df, groups, rng)
    decomposition = variance_decomposition(df)
    deff = design_effects(df, decomposition)
    summary = summary.merge(deff, on=["region", "measure"], how="left")
    summary.round(4).to_csv(OUT / "region_summary.csv", index=False)
    decomposition.round(4).to_csv(OUT / "variance_decomposition.csv", index=False)

    plot_profile_heatmap(summary)
    plot_medians_ci(summary, df)
    plot_distributions(df)
    plot_variance_decomposition(decomposition)

    corr, tests = correlations_by_region(df, groups, rng)
    corr.round(4).to_csv(OUT / "correlations_by_region.csv", index=False)
    tests.sort_values("mainland_range", ascending=False).round(4).to_csv(OUT / "correlation_heterogeneity.csv",
                                                                         index=False)
    pairs = plot_correlation_heatmap(corr, tests)
    plot_correlation_ci(corr, tests)
    plot_pair_scatter(df, pairs[0], corr)

    states = plot_state_medians(df)
    states.round(2).to_csv(OUT / "state_composite.csv", index=False)
    contrast = large_city_contrast(df, rng)
    contrast.round(2).to_csv(OUT / "large_city_contrast.csv", index=False)
    plot_large_city(contrast)
    missing = plot_missing_by_region(df)

    drivers, shares, differences = driver_analysis(df, groups, rng)
    drivers.round(4).to_csv(OUT / "drivers_by_region.csv", index=False)
    shares.round(4).to_csv(OUT / "composite_variance_shares.csv", index=False)
    differences.round(4).to_csv(OUT / "driver_region_differences.csv", index=False)
    plot_driver_domains(drivers, shares)
    plot_driver_indicators(drivers)
    plot_driver_differences(drivers, differences)

    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 20)
    print("schools, counties, states per region:\n", counts, sep="")
    print("\nmedian [95% CI] and Cliff's delta vs rest of US:")
    for _, r in summary.iterrows():
        if np.isfinite(r["median"]):
            print(f"  {r['region']:<22} {r['measure']:<16} {r['median']:>4.0f} [{r['median_ci_low']:.0f}, "
                  f"{r['median_ci_high']:.0f}]  delta {r['cliffs_delta_vs_rest']:+.2f} [{r['delta_ci_low']:+.2f}, "
                  f"{r['delta_ci_high']:+.2f}]  n {r['schools_with_value']:,}  eff. n {r['effective_n']:,.0f}  "
                  f"missing {r['share_missing']:.0%}")
    print("\nvariance decomposition:\n", decomposition.round(3).to_string(index=False), sep="")
    print("\ncorrelation heterogeneity (mainland):\n",
          tests.sort_values("mainland_range", ascending=False).round(3).to_string(index=False), sep="")
    print("\nlarge-city contrast:\n", contrast.to_string(index=False), sep="")
    print("\nstate composite medians (lowest and highest per region):")
    for region, g in states.groupby("region", observed=True):
        print(f"  {region:<22} {g.iloc[-1]['state']} {g.iloc[-1]['median']:.0f} .. {g.iloc[0]['state']} {g.iloc[0]['median']:.0f}")
    print("\nshare missing by region (%):\n", missing.round(0).to_string(), sep="")
    print("\ndrivers (leave-one-out Spearman, ranked within region):")
    for region, g in drivers.groupby("region", sort=False):
        g = g.sort_values("loo_spearman", ascending=False)
        print(f"  {region}: " + "; ".join(
            f"{r['measure']} {r['loo_spearman']:+.2f} [{r['ci_low']:+.2f}, {r['ci_high']:+.2f}]"
            f"{'' if r['q_bh'] < 0.05 else ' ns'}" for _, r in g.iterrows()))
    print("\ncomposite variance shares:\n",
          shares.pivot(index="region", columns="domain", values="share_of_composite_variance")
          .reindex(ORDER)[DOMAINS].round(3).to_string(), sep="")
    sig = differences[differences["q_bh"] < 0.05]
    print(f"\nregion pairs that differ (BH q < 0.05): {len(sig)} of {len(differences)}")
    print(sig.groupby("measure").size().reindex(DRIVERS).fillna(0).astype(int).to_string())
    print(f"\nwrote {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
