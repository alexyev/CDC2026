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

`index_scores_v3_2026.csv` and `ODIS README v3.pdf` are redistributed unmodified from the DOI above under the terms of CC BY 4.0.
`index_scores_v3_2026_fixed.csv` and `ncessch_fix_report.csv` are derived works of the same ODIS data, also under CC BY 4.0: the ODIS data with its `NCESSCH` school IDs corrected, as described in [Corrected NCESSCH IDs](#corrected-ncessch-ids) below.
The CC BY 4.0 license applies to these dataset files only.

## Files

| File | Description |
| --- | --- |
| `index_scores_v3_2026.csv` | The ODIS index scores and indicators, one row per school, exactly as downloaded. |
| `index_scores_v3_2026_fixed.csv` | The same data with full 12-digit `NCESSCH` IDs; see [Corrected NCESSCH IDs](#corrected-ncessch-ids). |
| `ncessch_fix_report.csv` | A per-row audit of how each `NCESSCH` in the fixed file was set. |
| `ODIS README v3.pdf` | The dataset's own README, with the full variable list, methods, and data sources. |

The dataset's companion technical report (`ODIS Technical Report March 2026.pdf`), which details each variable and the methodology, is not included here.
It is available from the [DOI page](https://doi.org/10.7281/T170WN53).

## CSV structure

`index_scores_v3_2026.csv` has 23,599 data rows plus a header row, and 56 columns.
Each row is one US public high school (including magnet, charter, and traditional public schools), described by indicators of the neighborhood around it, synthesized to the school's School Attendance Boundary (SAB).

The columns fall into these groups:

- **School identification:** `NCESSCH` (NCES school ID; see the caveat below and the corrected file), `Name`, `School District`, `State`, `FIPS County Code`, `County`, `City`, `Zip Code`, and `SAB Available` (whether a School Attendance Boundary is available).
- **Gini index:** `Gini index`, a measure of income inequality.
- **Domain scores:** `Economic`, `Education`, `Health`, `Housing`, `Crime`, and `Composite Score` (the weighted average of the five domains), on a 0-100 scale measuring the level of community "stress".
- **Percentile ranks:** `<Domain> Percentile Rank` and `Composite Score Percentile Rank`, the percentile of each domain and composite score.
- **Medians:** `<Domain> Median` and `Composite Score Median`, the median value of each domain and composite score.
- **Indicators:** the components that make up the domain scores, such as `Unemployment`, `Poverty`, `Access to broadband internet`, `Infant mortality rate`, `Housing affordability`, `Violent crime rate`, and educational attainment columns.
- **Race and ethnicity:** population shares such as `White alone` and `Hispanic or Latino`, included for context only; they do not enter into the index calculation.

`FIPS County Code` has leading zeros, so read it as a string.

In `index_scores_v3_2026.csv`, `NCESSCH` is only partly usable as an identifier, because most of its values lost digits upstream, apparently when the file passed through a spreadsheet:

- 4,441 rows hold a full 12-digit NCES school ID with its leading zero (for example `010000500871`), so read the column as a string.
- The other 19,158 rows hold the ID rounded to 6 significant digits in scientific notation, such as `1E+11` or `1.00006E+11`.
  These are all schools whose ID starts with a state code of 10 (Delaware) or higher, including Bureau of Indian Education schools (59) and Puerto Rico (72); the IDs from states 01-09 kept their digits.

As a result the column has only 13,233 distinct values across 23,599 rows, so it cannot uniquely identify schools or be joined to NCES data for most rows.
Use `index_scores_v3_2026_fixed.csv` instead, where every row has its full, unique 12-digit ID.

Missing values appear in three forms:

- `N/A` - the value is missing in the input sources. This is the code used in the CSV (48,337 cells).
- Empty cells - these occur only in some domain score and percentile-rank columns: `Crime` and `Crime Percentile Rank` (3,219 rows each), `Housing` and `Housing Percentile Rank` (287 each), `Education` and `Education Percentile Rank` (285 each), and `Health` and `Health Percentile Rank` (96 each).
- `Null` - defined in the dataset's README as a value that cannot be calculated due to missingness. This code does not appear in this CSV.

See `ODIS README v3.pdf` for the definition of every column.

## Corrected NCESSCH IDs

`NCESSCH` is the school ID assigned by the National Center for Education Statistics (NCES).
The ODIS README names the NCES CCD "Schools Points" map service as its school source, and the IDs match the NCES Common Core of Data (CCD) public school directory for school year 2022-23: every intact ID in the ODIS file appears in it, with the same school and district names.
`scripts/fix_ncessch.py` uses that directory to recover the broken IDs.

### Source

- **Dataset:** NCES Common Core of Data (CCD), public school directory, school year 2022-23, listed at [nces.ed.gov/ccd/files.asp](https://nces.ed.gov/ccd/files.asp).
- **File:** [ccd_sch_029_2223_w_1a_083023.zip](https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2223_w_1a_083023.zip), pinned in the script by SHA-256.

The directory is about 13 MB zipped, so it is not committed; the script downloads it into `.cache/nces/`, which is gitignored.

### Method

1. **Surviving digits are a hard filter.**
   A directory ID is a candidate for a broken row only if rounding it half up to 6 significant digits gives exactly the stored value, and the school is in the row's `State`.
   For example, `210028902059` rounds to `2.10029E+11`.
2. **Name and ZIP must match.**
   Of those candidates, the script keeps the ones whose school name equals the row's `Name` and whose location ZIP equals `Zip Code`.
   Names are compared after uppercasing, removing punctuation, and expanding the abbreviations NCES uses, such as `H S` for High School and `EL` for Elementary.
3. **Tie-break on open high schools.**
   If more than one candidate is left, only those that were open in 2022-23 and offered grade 12 are kept, since ODIS covers open high schools only.
   Every ID matched without this step meets both conditions.
4. **Exactly one candidate or nothing.**
   A row is recovered only when exactly one candidate is left.
   Rows with no candidate or with several are dropped from the fixed file rather than given a guessed ID.

The script also checks that no ID is assigned to two rows, that every intact ID exists in the directory, and that each kept row is byte-for-byte identical to the original apart from the `NCESSCH` field.
As a cross-check, the `School District` of every recovered row equals the NCES district name of its recovered ID.

### Coverage

| Result | Rows |
| --- | ---: |
| Intact ID, verified in the 2022-23 directory | 4,441 |
| Recovered, one name and ZIP match | 19,146 |
| Recovered after the open high school tie-break | 8 |
| Dropped, ambiguous | 4 |
| No candidate | 0 |

19,154 of the 19,158 broken IDs (99.98%) were recovered.

The 4 dropped rows are two pairs of byte-identical rows in the original file:

- Rows 4922 and 4923, `Highlands Virtual Franchise` (Highlands, FL 33870).
  NCES lists two schools with that name, ZIP, and district, `120084007753` and `120084007859`, both open with grades 6-12.
- Rows 13492 and 13494, `Bergen County Technical High School - Paramus` (NJ 07652).
  NCES lists two schools with that name, ZIP, and district, `340147000252` and `340147000264`, both open with grades 9-12.

Each pair clearly stands for those two schools, but nothing in the data says which row is which, so neither row gets an ID.
Row numbers count data rows from 1 in `index_scores_v3_2026.csv`.

### Fixed file

`index_scores_v3_2026_fixed.csv` has 23,595 data rows and 58 columns, in the original row order minus the 4 dropped rows.
Every row is byte-for-byte identical to the original, including the CRLF line endings, except:

- `NCESSCH` holds the full 12-digit ID, so read it as a string.
- `NCESSCH_original`, added as the last-but-one column, holds the value as downloaded.
- `NCESSCH_status`, added as the last column, is `intact` (the original ID, verified in the directory) or `recovered`.

`ncessch_fix_report.csv` has one row for each of the 23,599 original rows.
Its columns are `row`, `NCESSCH_original`, `NCESSCH`, `status` (`intact`, `recovered`, or `dropped`), `rule` (`name+zip` or `name+zip+grade12` for recovered rows, `ambiguous` for dropped rows), `candidates` (the space-separated IDs that matched on name and ZIP), and the row's `Name`, `School District`, `State`, and `Zip Code`.

### Rerunning

```sh
python3 scripts/fix_ncessch.py
```

It needs Python 3 and nothing beyond the standard library.
It downloads the directory on first run, regenerates both derived files, and prints the counts above; the output is deterministic.
