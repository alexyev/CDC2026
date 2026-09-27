# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""Connecticut fix: missing values in Connecticut before and after the fill.

Compares data/index_scores_v3_2026_fixed.csv (before) with
data/index_scores_v3_2026_ct_filled.csv (after, written by
scripts/fill_connecticut.py) and writes PNG charts plus a per-column table
into visualizations/02-connecticut-fix/.

Run from the repository root:

    python analysis/02_connecticut_fix.py
"""

import importlib
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.ticker import PercentFormatter

# Shared palette, rcParams, and helpers from the data overview.
overview = importlib.import_module("01_data_overview")

ROOT = Path(__file__).resolve().parent.parent
BEFORE = ROOT / "data" / "index_scores_v3_2026_fixed.csv"
AFTER = ROOT / "data" / "index_scores_v3_2026_ct_filled.csv"
OUT = ROOT / "visualizations" / "02-connecticut-fix"
PROVENANCE = "ct_fill_sources"

INK, INK_2, BLUE, ORANGE = overview.INK, overview.INK_2, overview.BLUE, overview.ORANGE
NEUTRAL = "#b9b8b3"
BEFORE_LABEL = "Before (ODIS v3, fixed IDs)"
AFTER_LABEL = "After the Connecticut fill"


def load(path):
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df = df.drop(columns=[PROVENANCE], errors="ignore")
    missing = df == "N/A"
    missing |= df.apply(lambda c: c.str.strip() == "")
    missing |= df.apply(lambda c: c.str.strip().str.casefold() == "null")
    return df, missing


def save(fig, name):
    fig.savefig(OUT / name, dpi=overview.DPI)
    plt.close(fig)


def sources_by_column(after):
    """Map each column to the ct_fill_sources keys that filled it."""
    keys = {}
    for field in after.loc[after["State"] == "CT", PROVENANCE]:
        for part in filter(None, field.split(";")):
            key, columns = part.split("=")
            for column in columns.split("|"):
                keys.setdefault(column, set()).add(key)
    return {column: " ".join(sorted(k)) for column, k in keys.items()}


def column_table(before_missing, after_missing, sources):
    n = len(before_missing)
    table = pd.DataFrame({
        "column": before_missing.columns,
        "group": [overview.GROUP_OF.get(c, "Other") for c in before_missing.columns],
        "missing_before": before_missing.sum().values,
        "missing_after": after_missing.sum().values,
    })
    table["filled"] = table["missing_before"] - table["missing_after"]
    table["share_before"] = (table["missing_before"] / n).round(4)
    table["share_after"] = (table["missing_after"] / n).round(4)
    table["sources"] = table["column"].map(sources).fillna("")
    return table


def plot_by_column(table, n_rows):
    # Most-missing columns on top; ties keep the file's column order.
    s = table[table["missing_before"] > 0].reset_index(names="position")
    s = s.sort_values(["missing_before", "position"], ascending=[True, False])
    fig, ax = plt.subplots(figsize=(11, 13))
    fig.subplots_adjust(left=0.34, right=0.93, top=0.92, bottom=0.08)
    height = 0.38
    y = range(len(s))
    ax.barh([i + height / 2 for i in y], s["share_before"] * 100, height=height, color=ORANGE, label=BEFORE_LABEL)
    ax.barh([i - height / 2 for i in y], s["share_after"] * 100, height=height, color=BLUE, label=AFTER_LABEL)
    for i, (_, row) in enumerate(s.iterrows()):
        ax.annotate(f"{int(row['missing_before'])}", (row["share_before"] * 100, i + height / 2), ha="left",
                    va="center", fontsize=7.5, color=INK_2, xytext=(3, 0), textcoords="offset points")
        ax.annotate(f"{int(row['missing_after'])}", (row["share_after"] * 100, i - height / 2), ha="left",
                    va="center", fontsize=7.5, color=INK_2, xytext=(3, 0), textcoords="offset points")
    ax.set_yticks(list(y))
    ax.set_yticklabels(s["column"], fontsize=8.5)
    ax.set_ylim(-0.7, len(s) - 0.3)
    ax.set_xlim(0, 108)
    ax.xaxis.set_major_formatter(PercentFormatter())
    overview.recessive_grid(ax, "x")
    ax.set_xlabel(f"Connecticut rows missing this column (of {n_rows})")
    fig.suptitle("Connecticut: share of rows missing each column,\nbefore and after the fill",
                 x=0.01, ha="left", fontsize=13, fontweight="bold")
    ax.legend(frameon=False, loc="lower right")
    remaining = s.sort_values("position").loc[s["missing_after"] > 0, "column"].tolist()
    overview.caption(fig, f"Only the {len(s)} columns missing in any Connecticut row before the fill are shown; "
                          "numbers at the bar ends are row counts. "
                          f"After the fill only {', '.join(remaining[:-1])}, and {remaining[-1]} are still missing, as intended: "
                          "ODIS's crime sources have no per-area Connecticut data.")
    save(fig, "ct_missing_by_column.png")


def plot_per_row(before_per_row, after_per_row, n_cols):
    top = int(max(before_per_row.max(), after_per_row.max()))
    bins = range(0, top + 1)
    before = before_per_row.value_counts().reindex(bins, fill_value=0)
    after = after_per_row.value_counts().reindex(bins, fill_value=0)
    fig, ax = plt.subplots(figsize=(13, 5.2))
    fig.subplots_adjust(left=0.07, right=0.99, top=0.86, bottom=0.2)
    width = 0.42
    ax.bar([k - width / 2 for k in bins], before.values, width=width, color=ORANGE, label=BEFORE_LABEL)
    ax.bar([k + width / 2 for k in bins], after.values, width=width, color=BLUE, label=AFTER_LABEL)
    for series, offset in ((before, -width / 2), (after, width / 2)):
        for k, v in series[series > 0].items():
            ax.annotate(f"{v}", (k + offset, v), ha="center", va="bottom", fontsize=8.5, color=INK,
                        xytext=(0, 2), textcoords="offset points")
    overview.recessive_grid(ax, "y")
    ax.set_xticks(list(bins))
    ax.tick_params(axis="x", labelsize=8)
    ax.margins(x=0.01)
    ax.set_ylim(0, max(before.max(), after.max()) * 1.12)
    ax.set_title("Connecticut: missing cells per row, before and after the fill")
    ax.set_xlabel(f"Number of missing cells in the row (out of {n_cols} ODIS columns)")
    ax.set_ylabel("Connecticut rows (high schools)")
    ax.legend(frameon=False, loc="upper center")
    overview.caption(fig, f"Before: the {int((before_per_row == top).sum())} schools without a School Attendance Boundary "
                          f"missed {top} cells each and the other {int((before_per_row < top).sum())} missed "
                          f"{int(before_per_row[before_per_row < top].max())}. After: every Connecticut row misses the same "
                          f"{int(after_per_row.max())} cells, Violent crime rate, Incarceration rate, and the Crime score "
                          "and its rank.")
    save(fig, "ct_missing_per_row.png")


def plot_state_context(before, before_per_row, after, after_per_row):
    after_mean = after_per_row.groupby(after["State"]).mean().sort_values(ascending=False)
    ct_before = before_per_row[before["State"] == "CT"].mean()
    overall = after_per_row.mean()
    fig, ax = plt.subplots(figsize=(13, 5.2))
    fig.subplots_adjust(left=0.06, right=0.99, top=0.86, bottom=0.2)
    colors = [BLUE if state == "CT" else NEUTRAL for state in after_mean.index]
    ax.bar(after_mean.index, after_mean.values, color=colors, width=0.75)
    ct = list(after_mean.index).index("CT")
    ax.bar([ct], [ct_before], width=0.75, fill=False, edgecolor=ORANGE, linewidth=1.5, linestyle="--")
    ax.annotate(f"CT before: {ct_before:.1f}", (ct, ct_before), ha="left", va="center", fontsize=8.5, color=INK,
                xytext=(10, -6), textcoords="offset points")
    ax.annotate(f"CT after: {after_mean['CT']:.1f}", (ct, after_mean["CT"]), ha="left", va="bottom", fontsize=8.5,
                color=INK, xytext=(10, 4), textcoords="offset points")
    ax.axhline(overall, color=INK_2, linewidth=1, linestyle="--")
    ax.annotate(f"All rows: {overall:.2f}", (len(after_mean) - 1, overall), ha="right", va="bottom",
                fontsize=8.5, color=INK_2, xytext=(0, 3), textcoords="offset points")
    overview.recessive_grid(ax, "y")
    ax.tick_params(axis="x", labelsize=8, rotation=90)
    ax.margins(x=0.01)
    ax.set_ylim(0, ct_before * 1.08)
    ax.set_title("Average missing cells per row by state, after the Connecticut fill")
    ax.set_xlabel("State (USPS code), sorted by average missing cells per row after the fill")
    ax.set_ylabel("Mean missing cells per row")
    handles = [plt.Rectangle((0, 0), 1, 1, color=BLUE),
               plt.Rectangle((0, 0), 1, 1, fill=False, edgecolor=ORANGE, linestyle="--", linewidth=1.5),
               plt.Rectangle((0, 0), 1, 1, color=NEUTRAL)]
    ax.legend(handles, ["Connecticut after the fill", "Connecticut before", "Other states (unchanged)"],
              frameon=False, loc="upper right")
    rank = ct + 1
    overview.caption(fig, f"Connecticut drops from the most incomplete state ({ct_before:.1f} missing cells per row) to "
                          f"number {rank} of {len(after_mean)} ({after_mean['CT']:.1f}), alongside the rural Plains and "
                          "Mountain states. No other state changes. The all-rows average falls from "
                          f"{before_per_row.mean():.2f} to {overall:.2f}.")
    save(fig, "ct_missing_by_state.png")
    return after_mean, ct_before


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    before, before_missing = load(BEFORE)
    after, after_missing = load(AFTER)
    raw_after = pd.read_csv(AFTER, dtype=str, keep_default_na=False)
    assert list(before.columns) == list(after.columns)
    assert before.loc[before["State"] != "CT"].equals(after.loc[after["State"] != "CT"])

    ct = before["State"] == "CT"
    table = column_table(before_missing[ct], after_missing[ct], sources_by_column(raw_after))
    table.sort_values(["missing_before", "column"], ascending=[False, True]).to_csv(
        OUT / "ct_missing_by_column.csv", index=False)

    before_per_row = before_missing.sum(axis=1)
    after_per_row = after_missing.sum(axis=1)
    plot_by_column(table, int(ct.sum()))
    plot_per_row(before_per_row[ct], after_per_row[ct], before.shape[1])
    after_mean, ct_before = plot_state_context(before, before_per_row, after, after_per_row)

    print(f"CT rows: {int(ct.sum())}")
    print(f"CT missing cells: before {int(before_missing[ct].values.sum()):,}, after {int(after_missing[ct].values.sum()):,}, "
          f"filled {int(table['filled'].sum()):,}")
    print(f"CT missing per row: before {before_per_row[ct].value_counts().to_dict()}, "
          f"after {after_per_row[ct].value_counts().to_dict()}")
    print(f"CT columns with any missing: before {int((table['missing_before'] > 0).sum())}, "
          f"after {int((table['missing_after'] > 0).sum())}")
    print(f"all rows mean missing per row: before {before_per_row.mean():.2f}, after {after_per_row.mean():.2f}")
    print(f"CT mean per row {ct_before:.1f} -> {after_mean['CT']:.1f}, rank {list(after_mean.index).index('CT') + 1} "
          f"of {len(after_mean)}")
    print(f"wrote {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
