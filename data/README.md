# Open Data Index for Schools (ODIS), version 3

This directory contains the dataset the CDC2026 project uses.

## Source and attribution

- **Title:** Open Data Index for Schools (ODIS)
- **Authors:** Angela Hawken, Nicholas Minar, Raj Choudhary, Jonathan Kulick
- **Publisher:** Johns Hopkins Research Data Repository
- **DOI:** [https://doi.org/10.7281/T170WN53](https://doi.org/10.7281/T170WN53)
- **License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

Suggested citation, as given in the dataset's README:

> Hawken, Angela; Minar, Nicholas; Choudhary, Raj; Kulick, Jonathan, 2026, "Open Data Index for Schools (ODIS)", https://doi.org/10.7281/T170WN53, Johns Hopkins Research Data Repository, V1.

Both files in this directory are redistributed unmodified from the DOI above under the terms of CC BY 4.0.
The CC BY 4.0 license applies to these dataset files only.

## Files

| File | Description |
| --- | --- |
| `index_scores_v3_2026.csv` | The ODIS index scores and indicators, one row per school. |
| `ODIS README v3.pdf` | The dataset's own README, with the full variable list, methods, and data sources. |

The dataset's companion technical report (`ODIS Technical Report March 2026.pdf`), which details each variable and the methodology, is not included here.
It is available from the [DOI page](https://doi.org/10.7281/T170WN53).

## CSV structure

`index_scores_v3_2026.csv` has 23,599 data rows plus a header row, and 56 columns.
Each row is one US public high school (including magnet, charter, and traditional public schools), described by indicators of the neighborhood around it, synthesized to the school's School Attendance Boundary (SAB).

The columns fall into these groups:

- **School identification:** `NCESSCH` (NCES school ID; see the caveat below), `Name`, `School District`, `State`, `FIPS County Code`, `County`, `City`, `Zip Code`, and `SAB Available` (whether a School Attendance Boundary is available).
- **Gini index:** `Gini index`, a measure of income inequality.
- **Domain scores:** `Economic`, `Education`, `Health`, `Housing`, `Crime`, and `Composite Score` (the weighted average of the five domains), on a 0-100 scale measuring the level of community "stress".
- **Percentile ranks:** `<Domain> Percentile Rank` and `Composite Score Percentile Rank`, the percentile of each domain and composite score.
- **Medians:** `<Domain> Median` and `Composite Score Median`, the median value of each domain and composite score.
- **Indicators:** the components that make up the domain scores, such as `Unemployment`, `Poverty`, `Access to broadband internet`, `Infant mortality rate`, `Housing affordability`, `Violent crime rate`, and educational attainment columns.
- **Race and ethnicity:** population shares such as `White alone` and `Hispanic or Latino`, included for context only; they do not enter into the index calculation.

`FIPS County Code` has leading zeros, so read it as a string.

`NCESSCH` is only partly usable as an identifier, because most of its values lost digits upstream, apparently when the file passed through a spreadsheet:

- 4,441 rows hold a full 12-digit NCES school ID with its leading zero (for example `010000500871`), so read the column as a string.
- The other 19,158 rows hold scientific-notation strings such as `1E+11` or `1.00006E+11`, which cannot be turned back into the original ID.

As a result the column has only 13,233 distinct values across 23,599 rows, so it cannot uniquely identify schools or be joined to NCES data for most rows.
To identify a school, use `Name`, `School District`, `State`, and `Zip Code` together instead; this combination is unique for all but 2 pairs of rows.

Missing values appear in three forms:

- `N/A` - the value is missing in the input sources. This is the code used in the CSV (48,337 cells).
- Empty cells - these occur only in some domain score and percentile-rank columns: `Crime` and `Crime Percentile Rank` (3,219 rows each), `Housing` and `Housing Percentile Rank` (287 each), `Education` and `Education Percentile Rank` (285 each), and `Health` and `Health Percentile Rank` (96 each).
- `Null` - defined in the dataset's README as a value that cannot be calculated due to missingness. This code does not appear in this CSV.

See `ODIS README v3.pdf` for the definition of every column.
