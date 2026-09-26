"""Data overview of the ODIS v3 dataset: what the rows are and how much is missing.

Reads data/index_scores_v3_2026_fixed.csv and writes PNG charts plus a
per-column missing-value table into visualizations/01-data-overview/.

Run from the repository root:

    python analysis/01_data_overview.py
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "index_scores_v3_2026_fixed.csv"
OUT = ROOT / "visualizations" / "01-data-overview"

DPI = 170

# Palette: the dataviz reference palette (light mode).
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e4e3df"
BLUE = "#2a78d6"
ORANGE = "#eb6834"
AQUA = "#1baf7a"
BLUE_RAMP = ["#f7f9fc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

DOMAINS = ["Economic", "Education", "Health", "Housing", "Crime", "Composite Score"]

# Column groups, following data/README.md "CSV structure".
GROUPS = {
    "Identifiers": [
        "NCESSCH", "Name", "School District", "State", "FIPS County Code",
        "County", "City", "Zip Code", "SAB Available",
    ],
    "Gini index": ["Gini index"],
    "Domain scores": DOMAINS,
    "Percentile ranks": [f"{d} Percentile Rank" for d in DOMAINS],
    "Medians": [f"{d} Median" for d in DOMAINS],
    "Indicators": [
        "Unemployment", "Poverty", "Access to broadband internet",
        "Single-parent households", "Linguistic isolation", "Access to healthcare",
        "Infant mortality rate", "SNAP recipients", "Low birth weight",
        "Lead exposure risk", "Housing vacancy rate", "Housing affordability",
        "Park access", "Violent crime rate", "Incarceration rate", "Less than HS",
        "2-year college or higher", "2-year college", "4-year college",
        "Graduate or professional degree",
    ],
    "Race and ethnicity": [
        "White alone", "Black or African American alone",
        "American Indian and Alaska Native alone", "Asian alone",
        "Native Hawaiian and Other Pacific Islander alone", "Some other race alone",
        "Two or more races", "Hispanic or Latino",
    ],
    "Added by NCESSCH fix": ["NCESSCH_original", "NCESSCH_status"],
}
GROUP_OF = {col: group for group, cols in GROUPS.items() for col in cols}

# Missing-per-row bands. Nothing falls between 12 and 25 missing cells, so the
# natural gap separates "some" from "many".
BANDS = [("None (0)", 0, 0), ("Some (1-11)", 1, 11), ("Many (26+)", 26, None)]

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "text.color": INK,
    "axes.labelcolor": INK,
    "axes.edgecolor": INK_2,
    "axes.titlesize": 13,
    "axes.titleweight": "bold",
    "axes.titlelocation": "left",
    "axes.titlepad": 12,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.color": INK_2,
    "ytick.color": INK_2,
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "savefig.facecolor": "white",
})


def load():
    df = pd.read_csv(DATA, dtype=str, keep_default_na=False)
    missing_kinds = {
        "N/A": df == "N/A",
        "empty": df.apply(lambda c: c.str.strip() == ""),
        "Null": df.apply(lambda c: c.str.strip().str.casefold() == "null"),
    }
    return df, missing_kinds


def missing_blocks(missing):
    """Group columns whose missing cells fall in exactly the same rows.

    Returns {label: [columns]} ordered by overall missing share, for columns
    with any missing value. A domain score always goes missing together with
    its percentile rank, and often with the indicators that feed it.
    """
    blocks = {}
    for col in missing.columns:
        if missing[col].any():
            blocks.setdefault(missing[col].values.tobytes(), []).append(col)
    labelled = {}
    for cols in sorted(blocks.values(), key=lambda c: -missing[c[0]].mean()):
        domain = next((c for c in cols if c in DOMAINS), None)
        if domain and len(cols) == 2:
            label = f"{domain} score + rank"
        elif domain:
            label = f"{domain} score + rank + {len(cols) - 2} indicators"
        else:
            label = " + ".join(cols)
        labelled[label] = cols
    return labelled


def caption(fig, text):
    fig.text(0.01, 0.01, text, ha="left", va="bottom", fontsize=8.5, color=INK_2, wrap=True)


def save(fig, name):
    fig.savefig(OUT / name, dpi=DPI)
    plt.close(fig)


def recessive_grid(ax, axis):
    ax.grid(axis=axis, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def plot_rows_per_state(df):
    counts = df["State"].value_counts().sort_values(ascending=False)
    fig, ax = plt.subplots(figsize=(13, 5.2))
    fig.subplots_adjust(left=0.06, right=0.99, top=0.86, bottom=0.2)
    ax.bar(counts.index, counts.values, color=BLUE, width=0.75)
    recessive_grid(ax, "y")
    ax.set_title(f"Rows per state: {len(df):,} high schools across {len(counts)} states and territories")
    ax.set_xlabel("State (USPS code), sorted by row count")
    ax.set_ylabel("Rows (high schools)")
    ax.tick_params(axis="x", labelsize=8, rotation=90)
    ax.margins(x=0.01)
    ax.set_ylim(0, counts.max() * 1.05)
    for state in counts.index[:3]:
        ax.annotate(f"{counts[state]:,}", (state, counts[state]), ha="center", va="top", rotation=90,
                    fontsize=8.5, color="white", fontweight="bold", xytext=(0, -5), textcoords="offset points")
    fewest = " and ".join(sorted(counts.index[counts == counts.min()]))
    caption(fig, f"One row = one US public high school. Median {int(counts.median())} rows per state; "
                 f"{counts.index[0]} has the most ({counts.iloc[0]:,}); {fewest} have the fewest ({counts.iloc[-1]}). "
                 "Includes DC and Puerto Rico (PR). Source: ODIS v3, index_scores_v3_2026_fixed.csv.")
    save(fig, "rows_per_state.png")
    return counts


def plot_missing_per_row(per_row):
    dist = per_row.value_counts().sort_index()
    full = dist.reindex(range(0, int(per_row.max()) + 1), fill_value=0)
    fig, ax = plt.subplots(figsize=(14, 5.2))
    fig.subplots_adjust(left=0.08, right=0.99, top=0.86, bottom=0.2)
    colors = [AQUA if k == 0 else (ORANGE if k >= 26 else BLUE) for k in full.index]
    ax.bar(full.index, full.values, color=colors, width=0.8)
    recessive_grid(ax, "y")
    ax.set_title("Missing cells per row (N/A, empty, or Null)")
    ax.set_xlabel(f"Number of missing cells in the row (out of {per_row.attrs['n_cols']} columns)")
    ax.set_ylabel("Rows (high schools)")
    ax.set_xticks(range(0, full.index.max() + 1, 1))
    ax.tick_params(axis="x", labelsize=8)
    ax.margins(x=0.01)
    for k, v in dist.items():
        ax.annotate(f"{v:,}", (k, v), ha="center", va="bottom", fontsize=7, color=INK,
                    xytext=(0, 2), textcoords="offset points")
    handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in (AQUA, BLUE, ORANGE)]
    ax.legend(handles, [b[0] for b in BANDS], frameon=False, loc="upper right", title="Band")
    caption(fig, f"{dist.get(0, 0):,} of {len(per_row):,} rows ({dist.get(0, 0) / len(per_row):.0%}) are complete. "
                 "The common counts (2, 3, 4, 7) come from a few indicators that are missing together; "
                 "nothing falls between 12 and 25, and the 285 rows with 26+ missing lack almost all census-based columns.")
    save(fig, "missing_per_row_histogram.png")


def band_counts(per_row):
    rows = []
    for label, lo, hi in BANDS:
        mask = per_row >= lo if hi is None else per_row.between(lo, hi)
        rows.append((label, int(mask.sum())))
    return rows


def plot_missing_bands(per_row):
    bands = band_counts(per_row)
    total = len(per_row)
    fig, ax = plt.subplots(figsize=(11, 2.3))
    fig.subplots_adjust(left=0.02, right=0.98, top=0.8, bottom=0.18)
    left = 0
    for (label, n), color in zip(bands, (AQUA, BLUE, ORANGE)):
        ax.barh(0, n, left=left, color=color, height=0.6, edgecolor="white", linewidth=2)
        share = n / total
        text = f"{label}\n{n:,} rows ({share:.1%})"
        if share > 0.12:
            ax.text(left + n / 2, 0, text, ha="center", va="center", color="white", fontsize=10, fontweight="bold")
        else:
            ax.annotate(text, (left + n, 0.3), ha="right", va="bottom", fontsize=9, color=INK,
                        xytext=(0, 4), textcoords="offset points")
        left += n
    ax.set_xlim(0, total)
    ax.set_ylim(-0.35, 0.75)
    ax.axis("off")
    ax.set_title("Share of rows with zero, some, or many missing cells")
    caption(fig, "Bands use the natural gap in the per-row distribution: no row has 12-25 missing cells. "
                 "Most incomplete rows miss only a handful of indicators; very few rows are mostly empty.")
    save(fig, "missing_row_bands.png")
    return bands


def plot_missing_by_column(summary, n_rows):
    s = summary[summary["missing_total"] > 0].sort_values("missing_total")
    n_complete = int((summary["missing_total"] == 0).sum())
    fig, ax = plt.subplots(figsize=(11, 10))
    fig.subplots_adjust(left=0.36, right=0.93, top=0.93, bottom=0.1)
    y = range(len(s))
    na_share = s["na_count"] / n_rows * 100
    empty_share = s["empty_count"] / n_rows * 100
    ax.barh(y, na_share, color=BLUE, height=0.7, label="N/A (missing in input sources)")
    ax.barh(y, empty_share, left=na_share, color=ORANGE, height=0.7, label="Empty cell (domain score not computed)")
    ax.set_yticks(list(y))
    ax.set_yticklabels(s["column"], fontsize=8.5)
    recessive_grid(ax, "x")
    ax.set_xlabel("Rows missing this column (%)")
    ax.set_title("Share of rows missing each column")
    for i, (_, row) in enumerate(s.iterrows()):
        ax.annotate(f"{row['missing_share']:.1%}  ({int(row['missing_total']):,})", (row["missing_share"] * 100, i),
                    ha="left", va="center", fontsize=7.5, color=INK_2, xytext=(3, 0), textcoords="offset points")
    ax.set_xlim(0, 60)
    ax.legend(frameon=False, loc="lower right")
    caption(fig, f"Only the {len(s)} columns with any missing value are shown; the other {n_complete} "
                 "(identifiers, Gini index, Economic and Composite scores and ranks, all medians, Unemployment) are always filled. "
                 "No cell uses the Null code. Lead exposure risk and Park access alone explain most incomplete rows.")
    save(fig, "missing_by_column.png")


def plot_missing_by_state(df, missing, per_row):
    by_state = pd.DataFrame({
        "rows": df.groupby("State").size(),
        "mean_missing": per_row.groupby(df["State"]).mean(),
        "share_incomplete": (per_row > 0).groupby(df["State"]).mean(),
    }).sort_values("mean_missing", ascending=False)
    overall = per_row.mean()

    fig, ax = plt.subplots(figsize=(13, 5.2))
    fig.subplots_adjust(left=0.06, right=0.99, top=0.86, bottom=0.2)
    colors = [ORANGE if v > 2 * overall else BLUE for v in by_state["mean_missing"]]
    ax.bar(by_state.index, by_state["mean_missing"], color=colors, width=0.75)
    ax.axhline(overall, color=INK_2, linewidth=1, linestyle="--")
    ax.annotate(f"All rows: {overall:.2f}", (len(by_state) - 1, overall), ha="right", va="bottom",
                fontsize=8.5, color=INK_2, xytext=(0, 3), textcoords="offset points")
    for state in by_state.index[:2]:
        ax.annotate(f"{by_state.loc[state, 'mean_missing']:.1f}", (state, by_state.loc[state, "mean_missing"]),
                    ha="center", va="bottom", fontsize=8.5, color=INK, xytext=(0, 2), textcoords="offset points")
    recessive_grid(ax, "y")
    ax.tick_params(axis="x", labelsize=8, rotation=90)
    ax.margins(x=0.01)
    ax.set_ylim(0, by_state["mean_missing"].max() * 1.08)
    ax.set_title("Average missing cells per row, by state")
    ax.set_xlabel("State (USPS code), sorted by average missing cells per row")
    ax.set_ylabel("Mean missing cells per row")
    handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in (ORANGE, BLUE)]
    ax.legend(handles, ["More than twice the all-rows average", "Other states"], frameon=False, loc="upper right")
    caption(fig, "Missingness is strongly state-dependent. Connecticut (CT) and Puerto Rico (PR) have no crime, "
                 "lead, park, infant-mortality, or low-birth-weight data at all, and 96 CT rows also lack every census-based column. "
                 "Rural Plains and Mountain states (SD, VT, ID, MT, IA, NE) lack many crime and health indicators.")
    save(fig, "missing_by_state.png")

    # Heatmap: share of each state's rows missing each block of columns that
    # always go missing together.
    blocks = missing_blocks(missing)
    cols = [f"{label} ({len(c)})" if len(c) > 1 else label for label, c in blocks.items()]
    shares = pd.DataFrame({name: missing[c[0]] for name, c in zip(cols, blocks.values())}) \
        .groupby(df["State"]).mean().loc[by_state.index]
    cmap = LinearSegmentedColormap.from_list("blue", BLUE_RAMP)
    fig, ax = plt.subplots(figsize=(10, 13))
    fig.subplots_adjust(left=0.1, right=0.9, top=0.8, bottom=0.05)
    im = ax.imshow(shares.values * 100, aspect="auto", cmap=cmap, vmin=0, vmax=100)
    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels([_wrap(c, 28) for c in cols], rotation=50, ha="left", fontsize=8)
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(shares)))
    ax.set_yticklabels(shares.index, fontsize=8)
    ax.set_ylabel("State, sorted by average missing cells per row")
    for spine in ax.spines.values():
        spine.set_visible(False)
    cbar = fig.colorbar(im, ax=ax, fraction=0.025, pad=0.01)
    cbar.set_label("Rows in the state missing this column (%)")
    cbar.outline.set_visible(False)
    fig.suptitle("Where the missing values are:\nshare of each state's rows missing each column block",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    caption(fig, "Columns that are always missing in the same rows are merged into one block (column count in parentheses), "
                 "sorted by overall missing share. Lead exposure risk and Park access are missing across most states; "
                 "crime and health gaps are regional; Incarceration rate is missing for every row in AK, CT, DE, HI, PR, RI, and VT.")
    save(fig, "missing_by_state_heatmap.png")
    return by_state


def plot_patterns(missing, per_row, top=10):
    blocks = missing_blocks(missing)
    names = list(blocks)
    block_missing = pd.DataFrame({name: missing[blocks[name][0]] for name in names})
    patterns = block_missing.apply(lambda r: tuple(n for n in names if r[n]), axis=1)
    vc = patterns[per_row > 0].value_counts().head(top)
    labels = [f"{', '.join(p)}  [{sum(len(blocks[n]) for n in p)}]" for p in vc.index][::-1]
    fig, ax = plt.subplots(figsize=(12, 6.5))
    fig.subplots_adjust(left=0.45, right=0.95, top=0.88, bottom=0.14)
    ax.barh(range(len(vc)), vc.values[::-1], color=BLUE, height=0.7)
    ax.set_yticks(range(len(vc)))
    ax.set_yticklabels([_wrap(t, 75) for t in labels], fontsize=8)
    recessive_grid(ax, "x")
    for i, v in enumerate(vc.values[::-1]):
        ax.annotate(f"{v:,}", (v, i), ha="left", va="center", fontsize=8, color=INK_2,
                    xytext=(3, 0), textcoords="offset points")
    ax.set_xlabel("Rows with exactly this set of missing columns")
    n_incomplete = int((per_row > 0).sum())
    ax.set_title(f"Most common sets of missing columns (top {top} of {patterns[per_row > 0].nunique()})")
    caption(fig, f"The top {top} patterns cover {vc.sum():,} of the {n_incomplete:,} incomplete rows ({vc.sum() / n_incomplete:.0%}). "
                 "The number in brackets is how many cells the pattern leaves missing. A domain score and its percentile rank "
                 "are always missing together, so they are shown as one item.")
    save(fig, "missing_patterns.png")
    return vc


def _wrap(text, width):
    words, lines, line = text.split(" "), [], ""
    for w in words:
        if len(line) + len(w) + 1 > width and line:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    lines.append(line)
    return "\n".join(lines)


def column_summary(df, kinds, missing):
    n = len(df)
    summary = pd.DataFrame({
        "column": df.columns,
        "group": [GROUP_OF.get(c, "Other") for c in df.columns],
        "na_count": [int(kinds["N/A"][c].sum()) for c in df.columns],
        "empty_count": [int(kinds["empty"][c].sum()) for c in df.columns],
        "null_count": [int(kinds["Null"][c].sum()) for c in df.columns],
        "missing_total": [int(missing[c].sum()) for c in df.columns],
    })
    summary["missing_share"] = (summary["missing_total"] / n).round(4)
    return summary


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df, kinds = load()
    missing = kinds["N/A"] | kinds["empty"] | kinds["Null"]
    unknown = set(df.columns) - set(GROUP_OF)
    assert not unknown, f"columns without a group: {sorted(unknown)}"

    per_row = missing.sum(axis=1)
    per_row.attrs["n_cols"] = df.shape[1]
    summary = column_summary(df, kinds, missing)
    summary.sort_values(["missing_total", "column"], ascending=[False, True]).to_csv(
        OUT / "missing_by_column.csv", index=False)

    counts = plot_rows_per_state(df)
    plot_missing_per_row(per_row)
    bands = plot_missing_bands(per_row)
    plot_missing_by_column(summary, len(df))
    by_state = plot_missing_by_state(df, missing, per_row)
    plot_patterns(missing, per_row)

    print(f"rows: {len(df):,}  columns: {df.shape[1]}  states: {len(counts)}")
    print("columns per group:", {g: len(c) for g, c in GROUPS.items()})
    print(f"missing cells: N/A {int(kinds['N/A'].values.sum()):,}, empty {int(kinds['empty'].values.sum()):,}, "
          f"Null {int(kinds['Null'].values.sum()):,}, total {int(missing.values.sum()):,} "
          f"({missing.values.mean():.2%} of cells)")
    print(f"columns with any missing: {int((summary['missing_total'] > 0).sum())}")
    print("rows by band:", {label: n for label, n in bands})
    print(f"mean missing per row: {per_row.mean():.2f}, median: {per_row.median():.0f}")
    print("highest mean missing per row by state:", by_state["mean_missing"].head(8).round(2).to_dict())
    print("lowest:", by_state["mean_missing"].tail(5).round(2).to_dict())
    print(f"wrote {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
