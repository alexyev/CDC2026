# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""National relationships between the ODIS measures.

How the five domain scores, the composite, the Gini index, and the indicators
relate to each other across all US public high schools:

1. Spearman correlations with pairwise deletion, a county-cluster bootstrap
   interval for each, and the same correlation between and within counties.
2. Principal components of the index inputs: how many dimensions of
   community stress there are, and what each loads on.
3. A model of neighborhood educational attainment from the non-education
   indicators: OLS with county-clustered standard errors, variance inflation
   factors, and county-grouped cross-validation of linear, ridge, and gradient
   boosting fits.

Reads data/index_scores_v3_2026_ct_filled.csv and writes PNG charts plus CSV
tables into visualizations/04-national-relationships/. Missing cells (N/A or
empty) are never imputed: each analysis uses the rows that have what it needs
and reports its n. The random steps (bootstrap, parallel analysis, fold
shuffling, gradient boosting) use fixed seeds, so the output is deterministic.

Run from the repository root:

    python analysis/04_national_relationships.py
"""

import importlib
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import statsmodels.api as sm
from matplotlib.colors import LinearSegmentedColormap, LogNorm
from matplotlib.gridspec import GridSpec
from scipy.cluster import hierarchy
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import squareform
from scipy.stats import norm, rankdata
from scipy.stats import t as student_t
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression, RidgeCV
from sklearn.model_selection import GroupKFold, KFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.outliers_influence import variance_inflation_factor

# Shared palette, rcParams, and helpers from the data overview.
overview = importlib.import_module("01_data_overview")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "index_scores_v3_2026_ct_filled.csv"
OUT = ROOT / "visualizations" / "04-national-relationships"
SOURCE = "Source: ODIS v3, index_scores_v3_2026_ct_filled.csv."

INK, INK_2, GRID = overview.INK, overview.INK_2, overview.GRID
BLUE, ORANGE, AQUA = overview.BLUE, overview.ORANGE, overview.AQUA
YELLOW, MAGENTA, NEUTRAL = "#eda100", "#e87ba4", "#b9b8b3"
# Diverging blue <-> red around a gray midpoint (dataviz reference pair).
DIVERGING = LinearSegmentedColormap.from_list(
    "blue_red", ["#184f95", "#3987e5", "#9ec5f4", "#f0efec", "#f3b0af", "#e34948", "#a3201f"])
BAND_COLOR = {"moderate": "#6da7ec", "strong": "#184f95"}
BLUE_SEQ = LinearSegmentedColormap.from_list("blue", overview.BLUE_RAMP)

SEED = 20260927
# Conventional effect-size bands for |rho| (Cohen): lower bound of each band.
BANDS = [("negligible", 0.0), ("weak", 0.1), ("moderate", 0.3), ("strong", 0.5)]
N_BOOT = 200
N_PARALLEL = 100
N_FOLDS = 5

# The ODIS index: each domain score is the equal-weight average of the scaled
# indicators it has (Education weights Linguistic isolation twice), and the
# composite is the equal-weight average of the domains a school has.
DOMAIN_INPUTS = {
    "Economic": ["Unemployment", "Poverty", "Access to broadband internet", "Single-parent households"],
    "Education": ["Less than HS", "2-year college or higher", "Linguistic isolation"],
    "Health": ["Access to healthcare", "Infant mortality rate", "SNAP recipients", "Low birth weight",
               "Lead exposure risk"],
    "Housing": ["Housing vacancy rate", "Housing affordability", "Park access"],
    "Crime": ["Violent crime rate", "Incarceration rate"],
}
DOMAINS = list(DOMAIN_INPUTS)
DOMAIN_WEIGHT = {"Linguistic isolation": 2.0}  # relative weight within its domain; others 1
COMPOSITE = "Composite Score"
INDEX_INPUTS = [c for cols in DOMAIN_INPUTS.values() for c in cols]
# Reported but not part of the index.
EXTRA_ATTAINMENT = ["2-year college", "4-year college", "Graduate or professional degree"]
GINI = "Gini index"
# Attainment shares where one population contains the other.
NESTED_ATTAINMENT = [{"2-year college or higher", c} for c in EXTRA_ATTAINMENT] + [
    {"4-year college", "Graduate or professional degree"}]
MEASURES = DOMAINS + [COMPOSITE, GINI] + INDEX_INPUTS + EXTRA_ATTAINMENT
DOMAIN_OF = {c: d for d, cols in DOMAIN_INPUTS.items() for c in cols}
DOMAIN_COLOR = {"Economic": BLUE, "Education": ORANGE, "Health": AQUA, "Housing": YELLOW, "Crime": MAGENTA}

# Indicators with 2% or less missing; Infant mortality rate, the crime
# indicators (about 25% missing), Lead exposure risk and Park access (about 51%)
# enter only the sensitivity runs.
CORE_INPUTS = [
    "Unemployment", "Poverty", "Access to broadband internet", "Single-parent households",
    "Less than HS", "2-year college or higher", "Linguistic isolation",
    "Access to healthcare", "SNAP recipients", "Low birth weight",
    "Housing vacancy rate", "Housing affordability",
]
MID_INPUTS = ["Infant mortality rate", "Violent crime rate", "Incarceration rate"]
SPARSE_INPUTS = ["Lead exposure risk", "Park access"]

# Attainment model: the Education domain without its Linguistic isolation
# half, explained by everything that is not an attainment measure.
OUTCOME = "Attainment"
OUTCOME_PARTS = ["Less than HS", "2-year college or higher"]
PREDICTOR_GROUPS = {
    "Economic": ["Unemployment", "Poverty", "Access to broadband internet", "Single-parent households"],
    "Health": ["Access to healthcare", "SNAP recipients", "Low birth weight", "Infant mortality rate"],
    "Housing": ["Housing vacancy rate", "Housing affordability"],
    "Crime": ["Violent crime rate", "Incarceration rate"],
    "Language": ["Linguistic isolation"],
    "Inequality": [GINI],
}
PREDICTORS = [c for cols in PREDICTOR_GROUPS.values() for c in cols]
GROUP_OF = {c: g for g, cols in PREDICTOR_GROUPS.items() for c in cols}
# The main model leaves out the three predictors missing for about a quarter of
# schools (mostly rural counties); the extended model adds them on the smaller sample.
MAIN_SAMPLE = "Main model"
EXTENDED_SAMPLE = "Adding infant mortality and crime"
COUNTY_SAMPLE = "Main model on county means"
MODEL_SAMPLES = {
    MAIN_SAMPLE: [c for c in PREDICTORS if c not in MID_INPUTS],
    EXTENDED_SAMPLE: PREDICTORS,
}


def load():
    df = pd.read_csv(DATA, dtype=str, keep_default_na=False)
    cols = [c for c in MEASURES if c in df.columns]
    assert cols == MEASURES, f"missing columns: {sorted(set(MEASURES) - set(cols))}"
    raw = df[MEASURES]
    missing = (raw == "N/A") | raw.apply(lambda c: c.str.strip().isin(["", "Null", "null"]))
    num = raw.mask(missing).apply(pd.to_numeric)
    return df[["State", "FIPS County Code"]].rename(columns={"FIPS County Code": "county"}), num


def county_level_columns(num, county):
    """Columns that take a single value in every county: shared by all its schools."""
    return [c for c in num.columns if (num[c].groupby(county).nunique() <= 1).all()]


def label(col, county_level=()):
    name = f"{col} domain" if col in DOMAINS else col
    return f"{name} *" if col in county_level else name


def save(fig, name):
    fig.savefig(OUT / name, dpi=overview.DPI)
    plt.close(fig)


def interval(center, low, high):
    """Error-bar half-widths; a percentile interval need not contain its point estimate."""
    return [np.clip(center - low, 0, None), np.clip(high - center, 0, None)]


def pairwise_n(frame):
    present = frame.notna().to_numpy(dtype=float)
    return pd.DataFrame(present.T @ present, index=frame.columns, columns=frame.columns).astype(int)


def upper_pairs(matrix):
    cols = matrix.columns
    return [(cols[i], cols[j]) for i in range(len(cols)) for j in range(i + 1, len(cols))]


# ---------------------------------------------------------------------------
# 1. Correlations


# Method: Spearman rank correlation (Spearman 1904) with a county-cluster bootstrap (Field and Welsh 2007), the t
# approximation for its p-value (Zar 1972), and Benjamini-Hochberg FDR (Benjamini and Hochberg 1995); see
# CITATIONS.md, section 3.
def correlations(num, county, county_level):
    """Spearman rho by pair, at school level, between counties, and within counties."""
    rho = num.corr(method="spearman")
    n = pairwise_n(num)

    # County-cluster bootstrap: resample whole counties, so schools that share
    # county-level values are not counted as independent evidence.
    rng = np.random.default_rng(SEED)
    codes, uniques = pd.factorize(county)
    rows_of = [np.flatnonzero(codes == k) for k in range(len(uniques))]
    values = num.to_numpy()
    boot = []
    for _ in range(N_BOOT):
        pick = rng.integers(0, len(uniques), len(uniques))
        idx = np.concatenate([rows_of[k] for k in pick])
        boot.append(pd.DataFrame(values[idx], columns=num.columns).corr(method="spearman").to_numpy())
    boot = np.stack(boot)
    boot_se = pd.DataFrame(boot.std(axis=0, ddof=1), index=rho.index, columns=rho.columns)
    lo = pd.DataFrame(np.percentile(boot, 2.5, axis=0), index=rho.index, columns=rho.columns)
    hi = pd.DataFrame(np.percentile(boot, 97.5, axis=0), index=rho.index, columns=rho.columns)

    # Between counties: one row per county, the mean of its schools.
    means = num.groupby(county).mean()
    rho_between = means.corr(method="spearman")
    n_between = pairwise_n(means)

    # Within counties: each value minus its county mean. County-level columns
    # have no within-county variation, so their pairs are left empty.
    varying = [c for c in num.columns if c not in county_level]
    centered = num[varying] - num[varying].groupby(county).transform("mean")
    multi = county.map(county.value_counts()) > 1
    rho_within = centered[multi].corr(method="spearman")
    n_within = pairwise_n(centered[multi])

    rows = []
    for a, b in upper_pairs(rho):
        within = (a in varying and b in varying)
        rows.append({
            "measure_a": a, "measure_b": b,
            "rho_school": rho.loc[a, b], "ci95_low": lo.loc[a, b], "ci95_high": hi.loc[a, b],
            "n_schools": n.loc[a, b], "se_cluster_bootstrap": boot_se.loc[a, b],
            "rho_between_counties": rho_between.loc[a, b], "n_counties": n_between.loc[a, b],
            "rho_within_counties": rho_within.loc[a, b] if within else np.nan,
            "n_within": n_within.loc[a, b] if within else 0,
        })
    pairs = pd.DataFrame(rows)
    pairs["county_level_measure"] = pairs["measure_a"].isin(county_level) | pairs["measure_b"].isin(county_level)
    pairs["construction"] = [construction(a, b) for a, b in zip(pairs["measure_a"], pairs["measure_b"])]
    pairs["strength"] = [strength_band(r) for r in pairs["rho_school"]]

    # Significance. The naive p treats every school as independent; the
    # clustered p uses the county-cluster bootstrap standard error instead.
    # Both get a Benjamini-Hochberg correction across all pairs in the matrix.
    r, k = pairs["rho_school"].to_numpy(), pairs["n_schools"].to_numpy()
    t_stat = r * np.sqrt((k - 2) / np.clip(1 - r ** 2, 1e-12, None))
    pairs["p_naive"] = 2 * student_t.sf(np.abs(t_stat), k - 2)
    pairs["q_bh_naive"] = multipletests(pairs["p_naive"], method="fdr_bh")[1]
    pairs["p_clustered"] = 2 * norm.sf(np.abs(r / pairs["se_cluster_bootstrap"]))
    pairs["q_bh_clustered"] = multipletests(pairs["p_clustered"], method="fdr_bh")[1]
    # Smallest |rho| this pair could detect (alpha 0.05 two-sided, 80% power),
    # with the county count as the sample size when a measure is county-level.
    n_eff = np.where(pairs["county_level_measure"], pairs["n_counties"], pairs["n_schools"])
    pairs["n_effective"] = n_eff
    pairs["min_detectable_rho"] = min_detectable_rho(n_eff)
    pairs["reliable"] = (pairs["q_bh_clustered"] < 0.05) & ((pairs["ci95_low"] > 0) | (pairs["ci95_high"] < 0))
    pairs["meaningful"] = pairs["rho_school"].abs() >= 0.3
    return rho, n, pairs


CIRCULAR = {"domain in composite", "indicator in composite (via its domain)", "indicator in its own domain",
            "nested attainment measures"}


# Method: Fisher z approximation (Fisher 1921) for the minimum detectable correlation (Cohen 1988); see CITATIONS.md,
# section 3.
def min_detectable_rho(n, alpha=0.05, power=0.8):
    """Smallest |rho| detectable at this n (Fisher z approximation)."""
    return np.tanh((norm.ppf(1 - alpha / 2) + norm.ppf(power)) / np.sqrt(np.asarray(n, dtype=float) - 3))


def strength_band(r):
    r = abs(r)
    return next(name for name, lo in reversed(BANDS) if r >= lo)


def construction(a, b):
    """Whether a pair is related by how ODIS builds its scores, not only by the data."""
    pair = {a, b}
    if COMPOSITE in pair:
        other = (pair - {COMPOSITE}).pop()
        if other in DOMAINS:
            return "domain in composite"
        if other in DOMAIN_OF:
            return "indicator in composite (via its domain)"
        return "independent"
    for d, inputs in DOMAIN_INPUTS.items():
        if d in pair and pair & set(inputs):
            return "indicator in its own domain"
    if pair in NESTED_ATTAINMENT:
        return "nested attainment measures"
    if all(m in DOMAIN_OF for m in pair) and DOMAIN_OF[a] == DOMAIN_OF[b]:
        return "same domain"
    return "independent"


def leave_one_out(num):
    """Correlations with the part-whole overlap removed.

    Each domain against the composite of the other domains, and each indicator
    against the rest of its own domain (the other inputs, with ODIS's weights).
    """
    rows = []
    domains = num[DOMAINS]
    for d in DOMAINS:
        rest = domains.drop(columns=d).mean(axis=1)
        pair, pair_loo = num[[d, COMPOSITE]].dropna(), pd.concat([num[d], rest], axis=1).dropna()
        rows.append({"kind": "domain vs composite", "measure": d, "whole": COMPOSITE,
                     "rho_raw": pair[d].corr(pair[COMPOSITE], method="spearman"), "n_raw": len(pair),
                     "rho_leave_one_out": pair_loo.iloc[:, 0].corr(pair_loo.iloc[:, 1], method="spearman"),
                     "n_leave_one_out": len(pair_loo)})
    for d, inputs in DOMAIN_INPUTS.items():
        weights = pd.Series({c: DOMAIN_WEIGHT.get(c, 1.0) for c in inputs})
        for c in inputs:
            others = [o for o in inputs if o != c]
            w = num[others].notna() * weights[others]
            rest = (num[others].fillna(0) * weights[others]).sum(axis=1) / w.sum(axis=1).replace(0, np.nan)
            pair, pair_loo = num[[c, d]].dropna(), pd.concat([num[c], rest], axis=1).dropna()
            rows.append({"kind": "indicator vs own domain", "measure": c, "whole": d,
                         "rho_raw": pair[c].corr(pair[d], method="spearman"), "n_raw": len(pair),
                         "rho_leave_one_out": pair_loo.iloc[:, 0].corr(pair_loo.iloc[:, 1], method="spearman"),
                         "n_leave_one_out": len(pair_loo)})
    return pd.DataFrame(rows)


# Method: Average-linkage hierarchical clustering (Sokal and Michener 1958) with optimal leaf ordering (Bar-Joseph,
# Gifford, and Jaakkola 2001); see CITATIONS.md, section 3.
def plot_heatmap(rho, n, county_level):
    dist = 1 - rho.to_numpy()
    np.fill_diagonal(dist, 0)
    condensed = squareform(dist, checks=False)
    link = hierarchy.optimal_leaf_ordering(hierarchy.linkage(condensed, method="average"), condensed)
    cols = rho.columns[hierarchy.leaves_list(link)]
    m = rho.loc[cols, cols].to_numpy()
    k = len(cols)

    fig = plt.figure(figsize=(15, 16))
    gs = GridSpec(2, 3, figure=fig, width_ratios=[0.9, 17, 0.45], height_ratios=[2.2, 17],
                  left=0.22, right=0.95, top=0.925, bottom=0.255, wspace=0.02, hspace=0.02)
    ax_dendro = fig.add_subplot(gs[0, 1])
    ax_strip = fig.add_subplot(gs[1, 0])
    ax = fig.add_subplot(gs[1, 1])
    ax_cbar = fig.add_subplot(gs[1, 2])

    hierarchy.dendrogram(link, ax=ax_dendro, color_threshold=0, above_threshold_color=INK_2, no_labels=True)
    ax_dendro.set_xlim(0, 10 * k)
    ax_dendro.axis("off")

    im = ax.imshow(m, cmap=DIVERGING, vmin=-1, vmax=1, aspect="auto")
    for i in range(k):
        for j in range(k):
            if i == j:
                continue
            v = m[i, j]
            ax.text(j, i, f"{v:.2f}".replace("0.", ".").replace("-.", "−."), ha="center", va="center",
                    fontsize=6.3, color="white" if abs(v) > 0.55 else INK)
            if construction(cols[i], cols[j]) in CIRCULAR:
                ax.add_patch(plt.Rectangle((j - 0.46, i - 0.46), 0.92, 0.92, fill=False, ec=INK, lw=1.1))
    labels = [label(c, county_level) for c in cols]
    ax.set_xticks(range(k))
    ax.set_xticklabels(labels, rotation=90, fontsize=8.5)
    ax.set_yticks([])
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)

    strip_colors = [INK if c == COMPOSITE else DOMAIN_COLOR.get(DOMAIN_OF.get(c, c), NEUTRAL) for c in cols]
    for i, color in enumerate(strip_colors):
        ax_strip.add_patch(plt.Rectangle((0, i - 0.5), 1, 1, color=color, ec="white", lw=1))
        if cols[i] in DOMAINS or cols[i] == COMPOSITE:
            ax_strip.text(0.5, i, "D", ha="center", va="center", fontsize=7, color="white", fontweight="bold")
    ax_strip.set_xlim(0, 1)
    ax_strip.set_ylim(k - 0.5, -0.5)
    ax_strip.set_yticks(range(k))
    ax_strip.set_yticklabels(labels, fontsize=8.5)
    ax_strip.set_xticks([])
    ax_strip.tick_params(length=0)
    for spine in ax_strip.spines.values():
        spine.set_visible(False)

    cbar = fig.colorbar(im, cax=ax_cbar)
    cbar.set_label("Spearman ρ (both measures are scored so that higher = more stress)")
    cbar.outline.set_visible(False)

    handles = [plt.Rectangle((0, 0), 1, 1, color=DOMAIN_COLOR[d]) for d in DOMAINS]
    handles += [plt.Rectangle((0, 0), 1, 1, color=NEUTRAL), plt.Rectangle((0, 0), 1, 1, color=INK)]
    names = [f"{d} input" for d in DOMAINS] + ["Not in the index", "Composite"]
    fig.legend(handles, names, loc="lower left", bbox_to_anchor=(0.22, 0.072), ncol=7, frameon=False,
               fontsize=9, title="Row colour: which domain the measure feeds (D = a domain score itself)",
               title_fontsize=9, alignment="left")
    fig.legend([plt.Rectangle((0, 0), 1, 1, fill=False, ec=INK, lw=1.1)],
               [("Outlined cell: related by construction (a score and its own input, a domain and the composite, "
                 "or nested attainment shares), so part of the correlation is built in")],
               loc="lower left", bbox_to_anchor=(0.22, 0.052), frameon=False, fontsize=9)

    fig.suptitle("How the ODIS measures move together across 23,595 US public high schools",
                 x=0.01, ha="left", fontsize=15, fontweight="bold", y=0.975)
    fig.text(0.01, 0.945, "Spearman rank correlation, pairwise deletion; rows and columns ordered by average-linkage "
             "clustering on 1 − ρ (tree on top).", fontsize=10, color=INK_2)
    nmin, nmax = n.where(~np.eye(len(n), dtype=bool)).stack().agg(["min", "max"]).astype(int)
    overview.caption(fig, f"n per pair ranges from {nmin:,} to {nmax:,} schools (pairs with Lead exposure risk or "
                     "Park access have the fewest). * = county-level measure, one value shared by every school in the "
                     "county; its correlations rest on about 3,100 counties, not on every school. "
                     "Pair-level n, Benjamini-Hochberg-corrected p-values, county-cluster bootstrap 95% intervals, and between- and within-county "
                     "correlations are in spearman_pairs.csv. " + SOURCE)
    save(fig, "correlation_heatmap.png")
    return list(cols)


def plot_domain_pairs(num, county, county_level):
    """Scatter matrix of the five domain scores with school- and county-level rho."""
    k = len(DOMAINS)
    means = num[DOMAINS].groupby(county).mean()
    fig, axes = plt.subplots(k, k, figsize=(13, 13))
    fig.subplots_adjust(left=0.08, right=0.98, top=0.9, bottom=0.1, wspace=0.12, hspace=0.12)
    for i, a in enumerate(DOMAINS):
        for j, b in enumerate(DOMAINS):
            ax = axes[i, j]
            ax.tick_params(labelsize=7.5)
            if i == j:
                ax.hist(num[a].dropna(), bins=range(0, 102, 3), color=DOMAIN_COLOR[a], edgecolor="white",
                        linewidth=0.5)
                ax.set_yticks([])
                ax.set_xlim(0, 100)
                ax.spines["left"].set_visible(False)
                ax.text(0.97, 0.93, f"n = {num[a].notna().sum():,}", transform=ax.transAxes, ha="right",
                        va="top", fontsize=8, color=INK_2)
            elif i > j:
                pair = num[[b, a]].dropna()
                ax.hexbin(pair[b], pair[a], gridsize=34, extent=(0, 100, 0, 100), cmap=BLUE_SEQ,
                          norm=LogNorm(vmin=1, vmax=400), mincnt=1, linewidths=0)
                ax.set_xlim(0, 100)
                ax.set_ylim(0, 100)
            else:
                pair = num[[a, b]].dropna()
                rho_s = pair[a].corr(pair[b], method="spearman")
                cpair = means[[a, b]].dropna()
                rho_c = cpair[a].corr(cpair[b], method="spearman")
                ax.axis("off")
                ax.text(0.5, 0.66, f"ρ = {rho_s:.2f}", ha="center", va="center", fontsize=17,
                        fontweight="bold", color=INK, transform=ax.transAxes)
                ax.text(0.5, 0.44, f"schools, n = {len(pair):,}", ha="center", va="center", fontsize=8.5,
                        color=INK_2, transform=ax.transAxes)
                ax.text(0.5, 0.24, f"county means: ρ = {rho_c:.2f}\n(n = {len(cpair):,} counties)",
                        ha="center", va="center", fontsize=8.5, color=INK_2, transform=ax.transAxes)
            if j == 0 and i > 0:
                ax.set_ylabel(label(a, county_level), fontsize=10)
            if i == k - 1:
                ax.set_xlabel(label(b, county_level), fontsize=10)
            if j > 0 and i > j:
                ax.set_yticklabels([])
            if i < k - 1 and i >= j:
                ax.set_xticklabels([])
    axes[0, 0].set_ylabel(label(DOMAINS[0]), fontsize=10)
    fig.suptitle("The five domain scores against each other", x=0.01, ha="left", fontsize=15,
                 fontweight="bold", y=0.975)
    fig.text(0.01, 0.94, "Below the diagonal: schools per hexagon (log colour scale, darker = more). Diagonal: each "
             "score's distribution (0-100, higher = more stress). Above: Spearman ρ.", fontsize=10, color=INK_2)
    overview.caption(fig, "Each pair uses the schools with both scores. The Crime domain (*) is county-level, so every "
                     "school in a county shares it.\nCounty means weight every county equally, whether it has 1 "
                     "high school or 509. " + SOURCE)
    save(fig, "domain_pairs.png")


def plot_scales(pairs):
    """School-level, between-county, and within-county rho for the domain pairs."""
    d = pairs[pairs["measure_a"].isin(DOMAINS) & pairs["measure_b"].isin(DOMAINS)].copy()
    d = d.sort_values("rho_school").reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(11, 6.5))
    fig.subplots_adjust(left=0.2, right=0.97, top=0.9, bottom=0.2)
    y = np.arange(len(d))
    for row in d.itertuples():
        xs = [v for v in (row.rho_school, row.rho_between_counties, row.rho_within_counties) if pd.notna(v)]
        ax.plot([min(xs), max(xs)], [row.Index] * 2, color=GRID, linewidth=3, zorder=1)
    ax.errorbar(d["rho_school"], y, xerr=interval(d["rho_school"], d["ci95_low"], d["ci95_high"]),
                fmt="none", ecolor=BLUE, elinewidth=1.2, capsize=3, zorder=2)
    specs = [("rho_school", BLUE, "o", "All schools"),
             ("rho_between_counties", ORANGE, "s", "Between counties (county means)"),
             ("rho_within_counties", AQUA, "D", "Within counties (school minus its county mean)")]
    for col, color, marker, name in specs:
        ax.scatter(d[col], y, s=64, color=color, marker=marker, edgecolor="white", linewidth=1.5, zorder=3,
                   label=name)
    for row in d.itertuples():
        if pd.isna(row.rho_within_counties):
            ax.text(0.66, row.Index, "no within-county value:\nCrime is county-level", va="center", fontsize=8,
                    color=INK_2)
    ax.set_yticks(y)
    ax.set_yticklabels([f"{a} × {b}" for a, b in zip(d["measure_a"], d["measure_b"])], fontsize=9.5)
    ax.axvline(0, color=INK_2, linewidth=0.8)
    overview.recessive_grid(ax, "x")
    ax.set_xlim(-0.4, 1.0)
    ax.set_xlabel("Spearman ρ between the two domain scores")
    ax.legend(frameon=False, loc="lower right", fontsize=9)
    ax.set_title("Domain correlations depend on the scale you look at")
    overview.caption(fig, "Blue bars: 95% county-cluster bootstrap intervals for the all-schools ρ "
                     f"({N_BOOT} resamples of whole counties).\nBetween-county ρ uses about 3,100 county means; "
                     "within-county ρ uses schools in counties with 2+ high schools, after subtracting the "
                     "county mean.\nCounties stand in for local labor and housing markets here. " + SOURCE)
    save(fig, "correlation_by_scale.png")
    return d


def plot_circularity(loo):
    """Raw vs leave-one-out rho for the part-whole pairs."""
    dom = loo[loo["kind"] == "domain vs composite"].sort_values("rho_raw").reset_index(drop=True)
    ind = loo[loo["kind"] == "indicator vs own domain"].copy()
    ind["order"] = ind["whole"].map({d: i for i, d in enumerate(DOMAINS)})
    ind = ind.sort_values(["order", "rho_raw"], ascending=[False, True]).reset_index(drop=True)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 7.6), gridspec_kw={"width_ratios": [1, 1.25]})
    fig.subplots_adjust(left=0.1, right=0.98, top=0.83, bottom=0.17, wspace=0.62)
    for ax, d, labels, title in (
            (ax1, dom, [f"{m} domain" for m in dom["measure"]], "Each domain against the composite"),
            (ax2, ind, [f"{m}  [{w}]" for m, w in zip(ind["measure"], ind["whole"])],
             "Each indicator against its own domain")):
        y = np.arange(len(d))
        for row in d.itertuples():
            ax.plot([row.rho_leave_one_out, row.rho_raw], [row.Index] * 2, color=GRID, linewidth=3, zorder=1)
        ax.scatter(d["rho_raw"], y, s=60, color=BLUE, edgecolor="white", linewidth=1.5, zorder=3,
                   label="As published (the score contains the measure)")
        ax.scatter(d["rho_leave_one_out"], y, s=60, color=ORANGE, marker="s", edgecolor="white", linewidth=1.5,
                   zorder=3, label="Leave-one-out (the measure removed from the score)")
        ax.set_yticks(y)
        ax.set_yticklabels(labels, fontsize=9)
        ax.axvline(0, color=INK_2, linewidth=0.8)
        ax.set_xlim(-0.6, 1.0)
        overview.recessive_grid(ax, "x")
        ax.set_xlabel("Spearman ρ")
        ax.set_title(title, fontsize=12)
    handles, names = ax1.get_legend_handles_labels()
    fig.legend(handles, names, frameon=False, loc="lower left", bbox_to_anchor=(0.01, 0.075), fontsize=9, ncol=2)
    fig.suptitle("How much of a score's correlation is built in", x=0.01, ha="left", fontsize=14,
                 fontweight="bold", y=0.97)
    fig.text(0.01, 0.915, "A domain is the average of its indicators and the composite the average of the domains, "
             "so each correlates with its parts partly by construction.", fontsize=10, color=INK_2)
    overview.caption(fig, "Leave-one-out: the composite recomputed as the mean of the other domains a school has, and "
                     "a domain recomputed from its other indicators with ODIS's weights (Linguistic isolation "
                     "counts double in Education). The gap between the two points is the built-in part. "
                     "Values in leave_one_out.csv. " + SOURCE)
    save(fig, "circularity_leave_one_out.png")


def plot_reliable_pairs(pairs, county_level):
    """Cross-domain indicator pairs that are both statistically reliable and at least moderate."""
    ind = pairs[pairs["measure_a"].isin(INDEX_INPUTS + [GINI]) & pairs["measure_b"].isin(INDEX_INPUTS + [GINI])
                & (pairs["construction"] == "independent")]
    keep = ind[ind["reliable"] & ind["meaningful"]].sort_values("rho_school").reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(12, 0.3 * len(keep) + 3.2))
    fig.subplots_adjust(left=0.42, right=0.97, top=1 - 1.25 / (0.3 * len(keep) + 3.2),
                        bottom=1.3 / (0.3 * len(keep) + 3.2))
    y = np.arange(len(keep))
    colors = [BAND_COLOR[b] for b in keep["strength"]]
    ax.hlines(y, 0, keep["rho_school"], color=GRID, linewidth=2, zorder=1)
    ax.errorbar(keep["rho_school"], y, xerr=interval(keep["rho_school"], keep["ci95_low"], keep["ci95_high"]),
                fmt="none", ecolor=INK_2, elinewidth=1, capsize=2.5, zorder=2)
    ax.scatter(keep["rho_school"], y, s=46, c=colors, edgecolor="white", linewidth=1.2, zorder=3)
    ax.set_yticks(y)
    ax.set_yticklabels([f"{label(a, county_level)}  ×  {label(b, county_level)}"
                        for a, b in zip(keep["measure_a"], keep["measure_b"])], fontsize=8.5)
    ax.axvline(0, color=INK_2, linewidth=0.8)
    for x in (-0.5, -0.3, 0.3, 0.5):
        ax.axvline(x, color=INK_2, linewidth=0.6, linestyle=":")
    ax.set_xlim(-0.8, 0.9)
    ax.set_ylim(-0.7, len(keep) - 0.3)
    overview.recessive_grid(ax, "x")
    ax.set_xlabel("Spearman ρ across schools, with 95% county-cluster bootstrap interval")
    handles = [plt.Line2D([], [], marker="o", linestyle="", markersize=7, color=BAND_COLOR[b]) for b in
               ("moderate", "strong")]
    ax.legend(handles, ["Moderate (0.3 ≤ |ρ| < 0.5)", "Strong (|ρ| ≥ 0.5)"], frameon=False, loc="lower right",
              fontsize=9)
    n_all, n_rel = len(ind), int(ind["reliable"].sum())
    fig.suptitle("Which neighborhood stresses go together across domains", x=0.01, ha="left", fontsize=14,
                 fontweight="bold", y=1 - 0.3 / (0.3 * len(keep) + 3.2))
    fig.text(0.01, 1 - 0.75 / (0.3 * len(keep) + 3.2),
             f"Of {n_all} pairs of indicators from different domains, {n_rel} are statistically reliable; "
             f"the {len(keep)} shown are reliable and at least moderate (|ρ| ≥ 0.3).", fontsize=10, color=INK_2)
    overview.caption(fig, "Reliable: Benjamini-Hochberg q < 0.05 across all pairs, with p from the county-cluster "
                     "bootstrap standard error, and a 95% interval that excludes 0. Pairs from the same domain and "
                     "pairs related by construction are left out. * = county-level measure. " + SOURCE)
    save(fig, "cross_domain_pairs.png")
    return ind


# ---------------------------------------------------------------------------
# 2. Principal components


# Method: Rank-based inverse normal transformation (Beasley, Erickson, and Allison 2009); see CITATIONS.md, section 3.
def normal_scores(frame):
    """Rank-based inverse-normal transform per column, so PCA follows Spearman, not outliers."""
    n = len(frame)
    return frame.apply(lambda c: pd.Series(norm.ppf((rankdata(c) - 0.5) / n), index=c.index))


# Method: Varimax rotation (Kaiser 1958); see CITATIONS.md, section 3.
def varimax(loadings, tol=1e-10, max_iter=500):
    p, k = loadings.shape
    rotation = np.eye(k)
    total = 0
    for _ in range(max_iter):
        rotated = loadings @ rotation
        u, s, vt = np.linalg.svd(loadings.T @ (rotated ** 3 - rotated @ np.diag((rotated ** 2).sum(0)) / p))
        rotation = u @ vt
        if total and s.sum() / total < 1 + tol:
            break
        total = s.sum()
    return loadings @ rotation


# Method: Principal component analysis (Hotelling 1933; Jolliffe 2002) with Horn's parallel analysis (Horn 1965); see
# CITATIONS.md, section 3.
def pca(num, columns, rng):
    data = normal_scores(num[columns].dropna())
    corr = np.corrcoef(data.to_numpy(), rowvar=False)
    eigval, eigvec = np.linalg.eigh(corr)
    eigval, eigvec = eigval[::-1], eigvec[:, ::-1]
    # Horn's parallel analysis: keep components whose eigenvalue beats the 95th
    # percentile of eigenvalues from uncorrelated data of the same shape.
    n, p = data.shape
    null = np.stack([np.linalg.eigvalsh(np.corrcoef(rng.standard_normal((n, p)), rowvar=False))[::-1]
                     for _ in range(N_PARALLEL)])
    threshold = np.percentile(null, 95, axis=0)
    keep = int(np.argmax(eigval <= threshold)) if (eigval <= threshold).any() else p
    loadings = eigvec[:, :keep] * np.sqrt(eigval[:keep])
    rotated = varimax(loadings) if keep > 1 else loadings
    # Order rotated components by variance, and make each one's largest loading positive.
    ss = (rotated ** 2).sum(0)
    rotated = rotated[:, np.argsort(-ss)]
    rotated *= np.sign(rotated[np.abs(rotated).argmax(0), range(keep)])
    return {
        "columns": columns, "n": n, "eigval": eigval, "threshold": threshold, "keep": keep,
        "loadings": pd.DataFrame(rotated, index=columns, columns=[f"RC{i + 1}" for i in range(keep)]),
        "unrotated_pc1": pd.Series(eigvec[:, 0] * np.sqrt(eigval[0]) * np.sign(eigvec[:, 0].sum()), index=columns),
        "rows": data.index,
    }


# Method: Tucker's congruence coefficient (Tucker 1951; Lorenzo-Seva and ten Berge 2006); see CITATIONS.md, section 3.
def congruence(a, b):
    """Tucker's congruence coefficient between two loading vectors on shared variables."""
    shared = a.index.intersection(b.index)
    x, y = a[shared], b[shared]
    return float((x * y).sum() / np.sqrt((x ** 2).sum() * (y ** 2).sum()))


def plot_scree(runs):
    fig, axes = plt.subplots(1, len(runs), figsize=(15, 5.4), sharey=True)
    fig.subplots_adjust(left=0.06, right=0.99, top=0.8, bottom=0.24, wspace=0.08)
    for ax, (name, run) in zip(axes, runs.items()):
        p = len(run["eigval"])
        x = np.arange(1, p + 1)
        colors = [BLUE if i < run["keep"] else NEUTRAL for i in range(p)]
        ax.bar(x, run["eigval"], color=colors, width=0.7)
        ax.plot(x, run["threshold"], color=ORANGE, linewidth=2, marker="o", markersize=4,
                label="Parallel analysis, 95th pct.")
        cum = run["eigval"][:run["keep"]].sum() / p
        ax.set_title(f"{name}\n{p} indicators, n = {run['n']:,} schools", fontsize=11)
        ax.text(0.97, 0.8, f"{run['keep']} components kept\n{cum:.0%} of variance", transform=ax.transAxes,
                ha="right", va="top", fontsize=9.5, color=INK)
        ax.set_xticks(x)
        ax.tick_params(axis="x", labelsize=8)
        ax.set_xlabel("Component")
        overview.recessive_grid(ax, "y")
    axes[0].set_ylabel("Eigenvalue (variance in indicator units)")
    axes[0].legend(frameon=False, loc="upper center", fontsize=9)
    fig.suptitle("How many dimensions of community stress? Eigenvalues of the indicator correlations",
                 x=0.01, ha="left", fontsize=14, fontweight="bold", y=0.97)
    overview.caption(fig, "Blue bars: components kept by Horn's parallel analysis (eigenvalue above the 95th "
                     f"percentile of {N_PARALLEL} same-sized uncorrelated datasets). Indicators are rank-transformed "
                     "to normal scores first. Left: the 12 indicators missing in 2% of rows or fewer. Middle adds "
                     "Infant mortality and the two crime indicators; right adds Lead exposure risk and Park access, "
                     "which exist only for about half the schools, mostly in cities. Complete cases only. " + SOURCE)
    save(fig, "pca_scree.png")


# Method: Hungarian method (Kuhn 1955), via SciPy's linear_sum_assignment (Crouse 2016); see CITATIONS.md, section 3.
def aligned_columns(main, run):
    """The run's components reordered to best match the main run's, one to one."""
    if run is main:
        return list(run["loadings"].columns)
    cong = np.array([[abs(congruence(main["loadings"][m], run["loadings"][o])) for o in run["loadings"]]
                     for m in main["loadings"]])
    _, cols = linear_sum_assignment(-cong)
    return [run["loadings"].columns[c] for c in cols]


def plot_loadings(runs, county_level):
    main = next(iter(runs.values()))
    fig, axes = plt.subplots(1, len(runs), figsize=(19, 10),
                             gridspec_kw={"width_ratios": [r["keep"] for r in runs.values()]})
    fig.subplots_adjust(left=0.175, right=0.93, top=0.8, bottom=0.12, wspace=0.05)
    order = [c for c in INDEX_INPUTS]
    for ax, (name, run) in zip(axes, runs.items()):
        cols = aligned_columns(main, run)
        L = run["loadings"][cols].reindex(order)
        im = ax.imshow(L.to_numpy(dtype=float), cmap=DIVERGING, vmin=-1, vmax=1, aspect="auto")
        for i in range(L.shape[0]):
            for j in range(L.shape[1]):
                v = L.iat[i, j]
                if pd.isna(v):
                    ax.text(j, i, "not in run", ha="center", va="center", fontsize=7, color=INK_2)
                    continue
                ax.text(j, i, f"{v:+.2f}", ha="center", va="center", fontsize=8.5,
                        color="white" if abs(v) > 0.55 else INK, fontweight="bold" if abs(v) >= 0.5 else None)
        names = component_names(run)
        ax.set_xticks(range(L.shape[1]))
        ax.set_xticklabels([f"{c}\n{names[c]}" for c in cols], fontsize=8.5)
        ax.xaxis.tick_top()
        ax.set_title(f"{name}\n{len(run['columns'])} indicators, n = {run['n']:,}", fontsize=11, pad=62)
        ax.tick_params(length=0)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.set_yticks(range(len(order)))
        ax.set_yticklabels([f"{label(c, county_level)}  [{DOMAIN_OF[c]}]" for c in order] if ax is axes[0] else [],
                           fontsize=9)
    cax = fig.add_axes([0.94, 0.12, 0.01, 0.68])
    cbar = fig.colorbar(im, cax=cax)
    cbar.set_label("Loading (correlation of indicator with component)")
    cbar.outline.set_visible(False)
    fig.suptitle("What the dimensions are: varimax-rotated component loadings", x=0.01, ha="left",
                 fontsize=15, fontweight="bold", y=0.975)
    fig.text(0.01, 0.935, "Columns are the kept components of each run (RC = rotated component, numbered by variance "
             "within its run), placed under the main-run component they match best; the two top-loading "
             "indicators name each.", fontsize=10, color=INK_2)
    overview.caption(fig, "Every indicator is scored so that higher = more stress, so a positive loading means that "
                     "stress rises with the component. Bold: |loading| ≥ 0.5. Brackets: the domain the indicator "
                     "feeds. * = county-level.\nEach run uses only the schools that have all of its indicators; the "
                     "right run over-represents cities, where Lead exposure risk and Park access exist. " + SOURCE)
    save(fig, "pca_loadings.png")


# ---------------------------------------------------------------------------
# 3. Attainment model


def model_frame(num, county, state, predictors):
    frame = num[predictors].copy()
    frame[OUTCOME] = num[OUTCOME_PARTS].mean(axis=1, skipna=False)
    frame["county"] = county
    frame["state"] = state
    return frame.dropna()


# Method: OLS with cluster-robust standard errors (Liang and Zeger 1986; Cameron and Miller 2015) and variance
# inflation factors (Marquardt 1970); see CITATIONS.md, section 3.
def fit_ols(frame, predictors):
    """OLS on z-scored predictors: coefficient = attainment points per 1 SD of the predictor."""
    x = (frame[predictors] - frame[predictors].mean()) / frame[predictors].std()
    X = sm.add_constant(x)
    y = frame[OUTCOME]
    by_county = sm.OLS(y, X).fit(cov_type="cluster", cov_kwds={"groups": pd.factorize(frame["county"])[0]})
    by_state = sm.OLS(y, X).fit(cov_type="cluster", cov_kwds={"groups": pd.factorize(frame["state"])[0]})
    naive = sm.OLS(y, X).fit()
    vif = {c: variance_inflation_factor(X.to_numpy(), i + 1) for i, c in enumerate(predictors)}
    ci = by_county.conf_int()
    table = pd.DataFrame({
        "predictor": predictors,
        "group": [GROUP_OF[c] for c in predictors],
        "coef_points_per_sd": by_county.params[predictors].to_numpy(),
        "ci95_low": ci.loc[predictors, 0].to_numpy(),
        "ci95_high": ci.loc[predictors, 1].to_numpy(),
        "se": by_county.bse[predictors].to_numpy(),
        "se_type": "clustered by county",
        "p": by_county.pvalues[predictors].to_numpy(),
        "se_state_clustered": by_state.bse[predictors].to_numpy(),
        "se_naive": naive.bse[predictors].to_numpy(),
        "vif": [vif[c] for c in predictors],
    })
    return by_county, table


# Method: Cross-validation (Stone 1974), grouped by county (Roberts et al. 2017); see CITATIONS.md, section 3.
def cv_r2(frame, predictors, model, folds):
    scores = cross_val_score(model, frame[predictors], frame[OUTCOME], groups=frame["county"], cv=folds,
                             scoring="r2")
    return scores.mean(), scores.std(ddof=1)


def linear():
    return make_pipeline(StandardScaler(), LinearRegression())


# Method: Ridge regression (Hoerl and Kennard 1970) with efficient leave-one-out alpha (Golub, Heath, and Wahba 1979),
# histogram gradient boosting (Friedman 2001; Ke et al. 2017), and HC3 standard errors (MacKinnon and White 1985); see
# CITATIONS.md, section 3.
def attainment_model(num, county, state):
    folds = GroupKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    models = {
        "OLS": linear(),
        "Ridge (alpha by inner CV)": make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-3, 4, 29))),
        "Gradient boosting (nonlinear)": HistGradientBoostingRegressor(random_state=SEED),
    }
    frames, fits, tables, cv_rows = {}, {}, [], []
    for sample, predictors in MODEL_SAMPLES.items():
        frame = model_frame(num, county, state, predictors)
        frames[sample] = frame
        fits[sample], table = fit_ols(frame, predictors)
        tables.append(table.assign(sample=sample, n=len(frame), n_counties=frame["county"].nunique()))
        for name, model in models.items():
            mean, sd = cv_r2(frame, predictors, model, folds)
            cv_rows.append({"analysis": "model", "model": name, "sample": sample, "n": len(frame),
                            "cv_r2_mean": mean, "cv_r2_sd": sd})
        full_r2 = cv_rows[-len(models)]["cv_r2_mean"]
        for group, cols in PREDICTOR_GROUPS.items():
            cols = [c for c in cols if c in predictors]
            if not cols:
                continue
            rest = [c for c in predictors if c not in cols]
            mean_alone, sd_alone = cv_r2(frame, cols, linear(), folds)
            mean_rest, sd_rest = cv_r2(frame, rest, linear(), folds)
            cv_rows.append({"analysis": "group alone", "model": "OLS", "sample": sample, "group": group,
                            "n_predictors": len(cols), "n": len(frame), "cv_r2_mean": mean_alone,
                            "cv_r2_sd": sd_alone})
            cv_rows.append({"analysis": "group dropped", "model": "OLS", "sample": sample, "group": group,
                            "n_predictors": len(cols), "n": len(frame), "cv_r2_mean": mean_rest,
                            "cv_r2_sd": sd_rest, "unique_r2": full_r2 - mean_rest})

    # The main model one level up: one row per county (the mean of its schools),
    # so every county counts once and county-level predictors are not repeated.
    predictors = MODEL_SAMPLES[MAIN_SAMPLE]
    counties = frames[MAIN_SAMPLE].groupby("county")[predictors + [OUTCOME]].mean()
    scores = cross_val_score(linear(), counties[predictors], counties[OUTCOME],
                             cv=KFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED), scoring="r2")
    cv_rows.append({"analysis": "model", "model": "OLS", "sample": COUNTY_SAMPLE, "n": len(counties),
                    "cv_r2_mean": scores.mean(), "cv_r2_sd": scores.std(ddof=1)})
    x = sm.add_constant((counties[predictors] - counties[predictors].mean()) / counties[predictors].std())
    county_fit = sm.OLS(counties[OUTCOME], x).fit(cov_type="HC3")
    ci = county_fit.conf_int()
    tables.append(pd.DataFrame({
        "predictor": predictors, "group": [GROUP_OF[c] for c in predictors],
        "coef_points_per_sd": county_fit.params[predictors].to_numpy(),
        "ci95_low": ci.loc[predictors, 0].to_numpy(), "ci95_high": ci.loc[predictors, 1].to_numpy(),
        "se": county_fit.bse[predictors].to_numpy(), "se_type": "HC3 robust, one row per county",
        "p": county_fit.pvalues[predictors].to_numpy(),
    }).assign(sample=COUNTY_SAMPLE, n=len(counties), n_counties=len(counties)))
    fits[COUNTY_SAMPLE] = county_fit

    coefficients = pd.concat(tables, ignore_index=True)
    first = ["sample", "n", "n_counties"]
    coefficients = coefficients[first + [c for c in coefficients.columns if c not in first]]
    return {"frames": frames, "fits": fits, "coefficients": coefficients, "cv": pd.DataFrame(cv_rows),
            "outcome_sd": frames[MAIN_SAMPLE][OUTCOME].std()}


def plot_coefficients(result, county_level):
    t = result["coefficients"]
    ext = t[t["sample"] == EXTENDED_SAMPLE].sort_values("coef_points_per_sd").reset_index(drop=True)
    order = list(ext["predictor"])
    fig, ax = plt.subplots(figsize=(12, 8.4))
    fig.subplots_adjust(left=0.29, right=0.97, top=0.81, bottom=0.19)
    y = np.arange(len(order))
    for sample, offset, color, marker in ((MAIN_SAMPLE, 0.15, BLUE, "o"), (EXTENDED_SAMPLE, -0.15, ORANGE, "s")):
        table = t[t["sample"] == sample].set_index("predictor")
        frame = result["frames"][sample]
        rows = [(i, table.loc[p]) for i, p in enumerate(order) if p in table.index]
        yy = np.array([i for i, _ in rows]) + offset
        coef = np.array([r["coef_points_per_sd"] for _, r in rows])
        lo = np.array([r["ci95_low"] for _, r in rows])
        hi = np.array([r["ci95_high"] for _, r in rows])
        ax.errorbar(coef, yy, xerr=[coef - lo, hi - coef], fmt="none", ecolor=color, elinewidth=1.5, capsize=3)
        ax.scatter(coef, yy, s=56, color=color, marker=marker, edgecolor="white", linewidth=1.5, zorder=3,
                   label=f"{sample}: {len(rows)} predictors, n = {len(frame):,} schools in "
                         f"{frame['county'].nunique():,} counties (R² = {result['fits'][sample].rsquared:.2f})")
    ax.axvline(0, color=INK_2, linewidth=0.9)
    ax.set_yticks(y)
    ax.set_yticklabels([f"{label(p, county_level)}  [{g}]" for p, g in zip(ext["predictor"], ext["group"])],
                       fontsize=9.5)
    overview.recessive_grid(ax, "x")
    ax.set_xlabel("Change in the attainment score (0-100, higher = lower attainment) per 1 SD of the predictor, "
                  "others held fixed")
    ax.legend(frameon=False, loc="lower left", bbox_to_anchor=(-0.02, 1.0), fontsize=9)
    fig.suptitle("What goes with lower adult educational attainment around a school", x=0.01, ha="left",
                 fontsize=14, fontweight="bold", y=0.97)
    fig.text(0.01, 0.915, "One linear model with all predictors at once; points are associations with 95% "
             "intervals, not causal effects.", fontsize=10, color=INK_2)
    overview.caption(fig, "Outcome: the mean of the Less than HS and 2-year college or higher scores, i.e. the "
                     "Education domain without its Linguistic isolation half "
                     f"(SD = {result['outcome_sd']:.1f} points). OLS on z-scored predictors; intervals use "
                     "standard errors clustered by county, because county-level predictors (*) are shared by all "
                     "schools in a county. The orange model has only the counties that report infant mortality "
                     "and both crime indicators, which leaves out most rural counties. " + SOURCE)
    save(fig, "attainment_model_coefficients.png")


def plot_variance(result):
    cv = result["cv"]
    models = cv[cv["analysis"] == "model"]
    main_groups = cv[cv["sample"] == MAIN_SAMPLE]
    groups_alone = main_groups[main_groups["analysis"] == "group alone"].set_index("group")
    groups_drop = main_groups[main_groups["analysis"] == "group dropped"].set_index("group")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6.4), gridspec_kw={"width_ratios": [1, 1.15]})
    fig.subplots_adjust(left=0.13, right=0.98, top=0.8, bottom=0.3, wspace=0.55)

    names = list(dict.fromkeys(models.loc[models["sample"] == MAIN_SAMPLE, "model"]))
    y = np.arange(len(names))
    for sample, offset, color in ((MAIN_SAMPLE, -0.18, BLUE), (EXTENDED_SAMPLE, 0.18, ORANGE)):
        m = models[models["sample"] == sample].set_index("model").loc[names]
        ax1.barh(y + offset, m["cv_r2_mean"], height=0.34, color=color, xerr=m["cv_r2_sd"],
                 error_kw={"ecolor": INK_2, "capsize": 3, "elinewidth": 1},
                 label=f"{sample} (n = {int(m['n'].iloc[0]):,})")
        for yi, v in zip(y + offset, m["cv_r2_mean"]):
            ax1.text(0.02, yi, f"{v:.2f}", va="center", ha="left", fontsize=9, color="white", fontweight="bold")
    ax1.set_yticks(y)
    ax1.set_yticklabels([n.replace(" (", "\n(") for n in names], fontsize=9.5)
    ax1.invert_yaxis()
    ax1.set_xlim(0, 1)
    ax1.set_xlabel("Out-of-sample R² (mean ± SD over 5 county-grouped folds)")
    ax1.set_title("How much of attainment the models explain", fontsize=12)
    ax1.legend(frameon=False, loc="upper left", bbox_to_anchor=(-0.05, -0.2), fontsize=9)
    overview.recessive_grid(ax1, "x")

    order = groups_alone["cv_r2_mean"].sort_values(ascending=False).index
    y = np.arange(len(order))
    ax2.barh(y - 0.18, groups_alone.loc[order, "cv_r2_mean"], height=0.34, color=AQUA, label="Group alone")
    ax2.barh(y + 0.18, groups_drop.loc[order, "unique_r2"], height=0.34, color=YELLOW,
             label="Lost when only this group is dropped (unique share)")
    for offset, values in ((-0.18, groups_alone.loc[order, "cv_r2_mean"]),
                           (0.18, groups_drop.loc[order, "unique_r2"])):
        for yi, v in zip(y + offset, values):
            ax2.text(max(v, 0) + 0.01, yi, "< 0" if v <= -0.005 else f"{max(v, 0):.2f}", va="center", fontsize=8.5,
                     color=INK_2)
    ax2.set_yticks(y)
    ax2.set_yticklabels([f"{g}\n({int(k)} predictor{'s' if k > 1 else ''})"
                         for g, k in zip(order, groups_alone.loc[order, "n_predictors"])], fontsize=9.5)
    ax2.invert_yaxis()
    ax2.set_xlim(0, 0.75)
    ax2.set_xlabel(f"Out-of-sample R², OLS, main model (n = {int(groups_alone['n'].iloc[0]):,})")
    ax2.set_title("Which predictor groups carry it", fontsize=12)
    ax2.legend(frameon=False, loc="upper left", bbox_to_anchor=(-0.05, -0.2), fontsize=9)
    overview.recessive_grid(ax2, "x")

    fig.suptitle("Variance explained in neighborhood educational attainment, tested on unseen counties",
                 x=0.01, ha="left", fontsize=14, fontweight="bold", y=0.97)
    overview.caption(fig, "Folds keep whole counties together, so every score comes from counties the model never "
                     "saw. A group's unique share is how much R² falls when only that group is left out; shares "
                     "overlap, so they do not add up to the total. Negative out-of-sample R² (worse than predicting "
                     "the mean) is labelled < 0. " + SOURCE)
    save(fig, "attainment_model_r2.png")


# ---------------------------------------------------------------------------


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ids, num = load()
    county, state = ids["county"], ids["State"]
    county_level = county_level_columns(num, county)
    print(f"rows: {len(num):,}  counties: {county.nunique():,}  states: {state.nunique()}")
    print("county-level columns:", county_level)

    rho, n, pairs = correlations(num, county, county_level)
    pairs.to_csv(OUT / "spearman_pairs.csv", index=False, float_format="%.4g")
    loo = leave_one_out(num)
    loo.to_csv(OUT / "leave_one_out.csv", index=False, float_format="%.4f")
    plot_circularity(loo)
    cross = plot_reliable_pairs(pairs, county_level)
    print(loo.round(2).to_string())
    print("all pairs: strength x reliable\n", pd.crosstab(pairs["strength"], pairs["reliable"]))
    print("naive BH q<.05:", int((pairs["q_bh_naive"] < 0.05).sum()), "clustered BH q<.05:",
          int((pairs["q_bh_clustered"] < 0.05).sum()), "of", len(pairs))
    print("cross-domain indicator pairs: strength x reliable\n", pd.crosstab(cross["strength"], cross["reliable"]))
    print("min detectable rho: n=23595", float(min_detectable_rho(23595)), "n=3167", float(min_detectable_rho(3167)),
          "n=10000", float(min_detectable_rho(10000)))
    print("naive p threshold rho at n=23595:", float(np.tanh(norm.ppf(0.975) / np.sqrt(23592))))
    print("unreliable but naive-significant:", pairs[(pairs["q_bh_naive"] < 0.05) & ~pairs["reliable"]][
        ["measure_a", "measure_b", "rho_school", "ci95_low", "ci95_high", "q_bh_naive", "q_bh_clustered"]]
        .round(3).to_string())
    z, half = np.arctanh(pairs["rho_school"]), norm.ppf(0.975) / np.sqrt(pairs["n_schools"] - 3)
    ratio = (pairs["ci95_high"] - pairs["ci95_low"]) / (np.tanh(z + half) - np.tanh(z - half))
    print("CI width ratio clustered/naive (Fisher), median by county_level_measure:",
          ratio.groupby(pairs["county_level_measure"]).median().round(2).to_dict())
    order = plot_heatmap(rho, n, county_level)
    plot_domain_pairs(num, county, county_level)
    scales = plot_scales(pairs)
    print("heatmap order:", order)
    cols = ["measure_a", "measure_b", "rho_school", "ci95_low", "ci95_high", "n_schools",
            "rho_between_counties", "rho_within_counties"]
    print(scales[cols].round(2).to_string())
    top = pairs[~pairs["measure_a"].isin(DOMAINS + [COMPOSITE]) & ~pairs["measure_b"].isin(DOMAINS + [COMPOSITE])]
    top = top.assign(abs_rho=top["rho_school"].abs()).sort_values("abs_rho", ascending=False)
    print("strongest indicator pairs:\n", top[cols].head(15).round(2).to_string())
    print("most negative indicator pairs:\n", top.sort_values("rho_school")[cols].head(8).round(2).to_string())
    comp = pairs[(pairs["measure_a"] == COMPOSITE) | (pairs["measure_b"] == COMPOSITE)]
    print("composite pairs:\n", comp[cols].round(2).to_string())

    rng = np.random.default_rng(SEED)
    runs = {
        "Main: core indicators": pca(num, CORE_INPUTS, rng),
        "Adding infant mortality and crime": pca(num, CORE_INPUTS + MID_INPUTS, rng),
        "All 17 index inputs": pca(num, INDEX_INPUTS, rng),
    }
    main_run = runs["Main: core indicators"]
    for name, run in runs.items():
        print(f"PCA {name}: n={run['n']:,} keep={run['keep']} eig={np.round(run['eigval'][:6], 2)} "
              f"thr={np.round(run['threshold'][:6], 2)} var kept={run['eigval'][:run['keep']].sum() / len(run['columns']):.3f} "
              f"pc1 share={run['eigval'][0] / len(run['columns']):.3f}")
        print(run["loadings"].round(2).to_string())
        if run is not main_run:
            print("  aligned to main:", {m: (o, round(congruence(main_run["loadings"][m], run["loadings"][o]), 2))
                                         for m, o in zip(main_run["loadings"], aligned_columns(main_run, run))})
    plot_scree(runs)
    plot_loadings(runs, county_level)
    tables = []
    for name, run in runs.items():
        long = run["loadings"].reset_index(names="indicator").melt(
            id_vars="indicator", var_name="component", value_name="loading")
        match = dict(zip(aligned_columns(main_run, run), main_run["loadings"].columns))
        long["matches_main_component"] = long["component"].map(match)
        long["congruence_with_main"] = [
            congruence(main_run["loadings"][match[c]], run["loadings"][c]) for c in long["component"]]
        tables.append(long.assign(run=name, n=run["n"]))
    loadings = pd.concat(tables)[["run", "n", "component", "matches_main_component", "congruence_with_main",
                                  "indicator", "loading"]]
    loadings.to_csv(OUT / "pca_loadings.csv", index=False, float_format="%.4f")

    # How much of the composite the first unrotated component tracks.
    scores = normal_scores(num.loc[main_run["rows"], CORE_INPUTS]) @ main_run["unrotated_pc1"]
    print(f"PC1 vs composite spearman: {scores.corr(num.loc[main_run['rows'], COMPOSITE], method='spearman'):.3f}")

    result = attainment_model(num, county, state)
    result["coefficients"].to_csv(OUT / "attainment_model_coefficients.csv", index=False, float_format="%.4f")
    result["cv"].to_csv(OUT / "attainment_model_cv.csv", index=False, float_format="%.4f")
    plot_coefficients(result, county_level)
    plot_variance(result)
    print(result["coefficients"].round(3).to_string())
    print(result["cv"].round(3).to_string())
    print(f"outcome sd {result['outcome_sd']:.2f}; in-sample R2:",
          {k: round(f.rsquared, 3) for k, f in result["fits"].items()},
          "condition numbers (z-scored):", {k: round(np.linalg.cond(f.model.exog), 1) for k, f in result["fits"].items()})
    print(f"wrote {OUT}/")


def component_names(run):
    """Short names for rotated components, from their top-loading indicators."""
    names = {}
    for c in run["loadings"]:
        top = run["loadings"][c].abs().sort_values(ascending=False).index[:2]
        names[c] = "\n".join(SHORT.get(t, t) for t in top)
    return names


SHORT = {
    "Access to broadband internet": "broadband", "Single-parent households": "single parent",
    "Linguistic isolation": "language", "Access to healthcare": "insurance", "Infant mortality rate": "infant mort.",
    "SNAP recipients": "SNAP", "Low birth weight": "birth weight", "Lead exposure risk": "lead",
    "Housing vacancy rate": "vacancy", "Housing affordability": "affordability", "Park access": "parks",
    "Violent crime rate": "violent crime", "Incarceration rate": "incarceration", "Less than HS": "no HS",
    "2-year college or higher": "no degree", "Unemployment": "unemployment", "Poverty": "poverty",
}


if __name__ == "__main__":
    main()
