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
`index_scores_v3_2026_ct_filled.csv` is a further derived work, also under CC BY 4.0: the fixed file with Connecticut's missing values filled from other public sources, as described in [Connecticut fill](#connecticut-fill) below; those sources and their attribution are listed there.
The CC BY 4.0 license applies to these dataset files only.

## Files

| File | Description |
| --- | --- |
| `index_scores_v3_2026.csv` | The ODIS index scores and indicators, one row per school, exactly as downloaded. |
| `index_scores_v3_2026_fixed.csv` | The same data with full 12-digit `NCESSCH` IDs; see [Corrected NCESSCH IDs](#corrected-ncessch-ids). |
| `ncessch_fix_report.csv` | A per-row audit of how each `NCESSCH` in the fixed file was set. |
| `index_scores_v3_2026_ct_filled.csv` | The fixed file with Connecticut's missing values filled where current public data allows; see [Connecticut fill](#connecticut-fill). |
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

## Connecticut fill

In the ODIS v3 data, Connecticut is by far the most incomplete state: its 208 rows average 21.0 missing cells, against 2.4 for all rows.
Most of that is not missing data but two join problems in how ODIS v3 was assembled:

- **The 96 Connecticut schools without a School Attendance Boundary (SAB) miss every census column.**
  For these schools ODIS maps the school's ZIP to census tracts with the Census 2010 ZCTA-to-tract relationship file.
  Since 2022, Connecticut's tract IDs carry the new planning-region county codes (`09110`-`09190`), so none of the file's Connecticut tracts match the ACS 2019-2023 data and all of their census values come out empty.
  ODIS v2 (2024) had values for the same schools.
- **County-level columns are keyed on planning regions, but the County Health Rankings release ODIS used (2023) has only the 8 old counties for Connecticut.**
  So `Single-parent households`, `Low birth weight`, and `Infant mortality rate` are missing for all 208 rows.
  `Lead exposure risk` and `Park access` come from the City Health Dashboard, which labels its Connecticut tracts with the old county codes, and are also missing for all 208 rows.

`index_scores_v3_2026_ct_filled.csv` fills those gaps where current public data allows, and leaves everything else as ODIS has it.
It is written by `scripts/fill_connecticut.py`, from `index_scores_v3_2026_fixed.csv` (which it does not modify).

### What changed

| | Before | After |
| --- | ---: | ---: |
| Missing cells in the 208 Connecticut rows | 4,368 | 832 |
| Missing cells per Connecticut row | 9 (112 rows) or 35 (96 rows) | 4 (all rows) |
| Connecticut columns with any missing value | 35 | 4 |

3,536 cells were filled:

| Columns | Rows | Cells | Source |
| --- | ---: | ---: | --- |
| 12 census indicators: `Poverty`, `Access to broadband internet`, `Linguistic isolation`, `Access to healthcare`, `SNAP recipients`, `Less than HS`, `2-year college or higher`, `2-year college`, `4-year college`, `Graduate or professional degree`, `Housing vacancy rate`, `Housing affordability` | 96 | 1,152 | ACS 2019-2023, by ZIP |
| 8 race and ethnicity columns | 96 | 768 | ACS 2019-2023, by ZIP |
| `Education`, `Health`, `Housing` scores and their percentile ranks | 96 | 576 | Recomputed with ODIS's weights |
| `Single-parent households` | 208 | 208 | County Health Rankings 2025 |
| `Low birth weight`, `Infant mortality rate` | 208 | 416 | CT Department of Public Health, 2024 |
| `Lead exposure risk` | 208 | 208 | CHD lead index recomputed from ACS 2019-2023 (approximation) |
| `Park access` | 208 | 208 | County Health Rankings 2025 Access to Parks (proxy) |

The 4 cells still missing in every Connecticut row are `Violent crime rate`, `Incarceration rate`, and the `Crime` score and its percentile rank.
They stay missing on purpose: ODIS's crime sources have no per-area Connecticut data.
ODIS's violent crime rate is the last County Health Rankings value (FBI data from 2014 and 2016), which has only old counties for Connecticut, and Vera's incarceration data has no Connecticut counties because Connecticut has no county jails.
Proxies from Connecticut state sources exist but were not used.

Because the new indicators feed the domain scores, some existing Connecticut scores change as well.
These are recomputed, not filled:

| Column | Connecticut rows changed |
| --- | ---: |
| `Economic` (now includes single-parent households) | 204 |
| `Economic Percentile Rank` | 202 |
| `Health` (now includes infant mortality, low birth weight, and lead) | 109 |
| `Health Percentile Rank` | 109 |
| `Housing` (now includes park access) | 106 |
| `Housing Percentile Rank` | 106 |
| `Composite Score` and its percentile rank | 208 each |

Before the fill, the `Composite Score` of the 96 schools without an SAB was their `Economic` score alone; now it averages four domains.

Nothing outside Connecticut changes: every non-CT row is byte-for-byte the fixed file's row, followed by an empty `ct_fill_sources` field.
All percentile ranks and medians of non-CT rows are unchanged.

### Sources

| Used for | Source | License and attribution |
| --- | --- | --- |
| Census indicators, race and ethnicity, lead index inputs, tract population | U.S. Census Bureau, American Community Survey 2019-2023 5-year estimates, census tracts; tables B01003, B17020, B28002, B15002, B25002, B02001, B03002, B25034, C17002, S1602, S2701, S2201, S2503, via the [data.census.gov API](https://data.census.gov/) | U.S. government work, public domain |
| ZIP to tract | U.S. Census Bureau, [2020 ZCTA to 2020 census tract relationship file](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt) | Public domain |
| 2020 to 2022 Connecticut tract codes | CT Data Collaborative, [2022 tract crosswalk](https://github.com/CT-Data-Collaborative/2022-tract-crosswalk) (`2022tractcrosswalk.csv`, commit `5dc032c`) | No license stated; used as a lookup only and not redistributed. Credit: CT Data Collaborative. |
| `Single-parent households`, `Park access` | University of Wisconsin Population Health Institute, [County Health Rankings & Roadmaps 2025](https://www.countyhealthrankings.org/) (`analytic_data2025_v3.csv`, measures `v082` and `v179`) | Free to use with attribution: "University of Wisconsin Population Health Institute. County Health Rankings & Roadmaps 2025. www.countyhealthrankings.org." |
| `Low birth weight`, `Infant mortality rate` | Connecticut Department of Public Health, [Vital Statistics Registration Report 2024](https://portal.ct.gov/dph/resources-and-records/data-research/vital-statistics-and-population-data/vital-statistics), Tables 6 and 19 (`rr2024_v20260727.xlsx`) | Connecticut state government publication. Credit: Connecticut Department of Public Health. |
| Lead index method and tract pool | City Health Dashboard, [Technical Document](https://www.cityhealthdashboard.com/technical-documentation) (2026-07-28) and [tract list](https://www.cityhealthdashboard.com/api/tract-geographic-identifiers.csv); Department of Population Health, NYU Langone Health | Method and tract list only; no City Health Dashboard values are used or redistributed |
| Checks only (not in the output) | Census [2010 ZCTA to tract relationship file](https://www2.census.gov/geo/docs/maps-data/data/rel/zcta_tract_rel_10.txt); County Health Rankings 2023 (`analytic_data2023_0.csv`); [ODIS v2](https://doi.org/10.58153/t94md-edc80) (Hawken et al., 2025, CC BY 4.0) | As above |

The script pins every file by SHA-256 and caches it in `.cache/ct/`, which is gitignored.
The ACS tables are pinned as the CSV of the variables the script keeps, because the API's JSON is not byte-stable.

### Method

The guiding rule is to compute each value the way ODIS computes that column, so filled values sit on the same scale as every other row.
The ODIS v3 technical report was not reachable (the Johns Hopkins archive returns HTTP 403), so the script works from the [v2 technical report](https://doi.org/10.58153/t94md-edc80) and checks each formula against the ODIS v3 values themselves; see [Validation](#validation).

**ODIS's scaling.**
ODIS stores each indicator as a 0-100 "stress" score, not as the raw value.
Each raw share is rounded to 4 decimals, truncated at ODIS's cut points, and scaled linearly so that one raw value scores 0 and another scores 100 (reversed for measures where more is better, such as broadband access).
Race and ethnicity columns are plain percentages.
Where the 0 or 100 point is the most extreme value among ODIS's own schools, including schools with an SAB that cannot be recomputed here, the script fits it from the non-CT schools without an SAB.

| Indicator | Raw value (ACS tract) | Scores 0 | Scores 100 |
| --- | --- | ---: | ---: |
| `Poverty` | (B17020_004 + B17020_005) / B17020_002, the share of people in poverty who are aged 6-17 | 0 | 0.40 (cut) |
| `Access to broadband internet` | B28002_004 / B28002_001 | 1 | 0.40 (cut) |
| `Linguistic isolation` | S1602_C03_001 / S1602_C01_001 | 0 | 0.25 (cut) |
| `Access to healthcare` | S2701_C03_003 / 100, children 6-18 with health insurance | 1 | 0.1649 (fitted) |
| `SNAP recipients` | S2201_C04_009 / 100, the share of SNAP households that have children | 0 | 1 |
| `Less than HS` | B15002 no diploma, both sexes / B15002_001 | 0 | 0.6202 (fitted) |
| `2-year college or higher` | B15002 associate's or higher / B15002_001 | 0.9097 (fitted) | 0 |
| `2-year college` | B15002 associate's / B15002_001 | 0.2637 (fitted) | 0 |
| `4-year college` | B15002 bachelor's / B15002_001 | 0.4985 (fitted) | 0 |
| `Graduate or professional degree` | B15002 master's, professional, or doctorate / B15002_001 | 0.6766 (fitted) | 0 |
| `Housing vacancy rate` | B25002_003 / B25002_001 | 0 | 0.40 (cut) |
| `Housing affordability` | Sum over income brackets of (share of households in the bracket x share of households in the bracket spending 30% or more on housing), from S2503 | 0 | 1 |

Some of these follow ODIS's actual computation rather than the column's plain description in the ODIS README, notably `Poverty`, `SNAP recipients`, and `Housing affordability`.
The filled values match the rest of the file because they use the same computation.

**Item 1: census columns for the 96 schools without an SAB.**
ODIS's documented method for these schools is the population-weighted average of the census tracts that intersect the school's ZIP code.
The weights are each tract's total population (ACS B01003).
The script applies that method with the 2020 ZCTA-to-tract relationship file, relabelling its Connecticut tracts from the 2020 codes to the 2022 planning-region codes with the CT Data Collaborative crosswalk.
Tract numbers did not change in 2022, only the county part of the ID, so the relabel is exact.
All 58 ZIPs of these schools are 2020 ZCTAs.
Tracts in neighboring states that intersect a Connecticut ZIP are included, as ODIS does elsewhere.

**Item 2: single-parent households.**
County Health Rankings 2025 publishes this measure (`v082`, ACS 2019-2023) for the 9 planning regions, so each school takes its region's value.
ODIS's scaling is the minimum and maximum of the CHR 2023 county values it used (0 to 0.7877).

**Item 3: low birth weight and infant mortality.**
County Health Rankings still publishes these for the old counties only, so the script uses the Connecticut Department of Public Health's 2024 Registration Report instead.
Low birth weight is Table 19's births under 2,500 g divided by live births, and infant mortality is Table 6's resident infant deaths per 1,000 live births, both for the planning region.
They are scaled with the CHR 2023 minimum and maximum ODIS used (low birth weight 0.0289 to 0.2170; infant mortality 1.42 to 16.94 per 1,000).

| Planning region | Single-parent households (CHR 2025) | Access to parks (CHR 2025) | Low birth weight (DPH 2024) | Infant mortality per 1,000 (DPH 2024) |
| --- | ---: | ---: | ---: | ---: |
| 09110 Capitol | 27.2% | 65.8% | 8.8% | 4.3 |
| 09120 Greater Bridgeport | 23.9% | 90.3% | 8.0% | 6.7 |
| 09130 Lower Connecticut River Valley | 17.9% | 56.2% | 6.7% | 4.9 |
| 09140 Naugatuck Valley | 27.2% | 66.1% | 9.1% | 6.0 |
| 09150 Northeastern Connecticut | 24.2% | 27.6% | 7.8% | 7.7 |
| 09160 Northwest Hills | 20.0% | 46.4% | 6.2% | 3.6 |
| 09170 South Central Connecticut | 29.5% | 79.1% | 8.1% | 4.6 |
| 09180 Southeastern Connecticut | 26.5% | 55.8% | 8.7% | 4.2 |
| 09190 Western Connecticut | 19.1% | 68.0% | 6.8% | 3.1 |

**Item 4: lead exposure risk (approximation).**
ODIS takes this column from the City Health Dashboard (CHD), which covers only 28 Connecticut places and does not publish values without registration.
The script recomputes CHD's index statewide from ACS 2019-2023 tract data, following the CHD Technical Document:

1. Housing risk: housing units by year built (B25034) weighted by the share with lead-based paint hazards, 78% before 1940, 51.2% for 1940-1959, 17.2% for 1960-1979, and 4.7% from 1980 on, divided by all housing units.
2. Poverty risk: the share of people below 125% of the poverty level (C17002).
3. Both are z-standardized over the tracts CHD reports on (its 2020-shape tract list, Connecticut tracts relabelled), weighted 0.58 and 0.42 (the Vox Media / Washington State Department of Health weights CHD's method derives from), and summed.
4. The sum is ranked into deciles 1-10 using the cut points of the CHD tract pool, so a tract outside CHD's cities gets the decile its score would have in the pool.

Each school takes the population-weighted average over the tracts of its ZIP, and ODIS's scaling maps index 1 to 0 and 10 to 100.
This is used for all 208 Connecticut schools, including the 112 with an SAB, since SAB boundaries are not used here.

**Item 4: park access (proxy).**
ODIS's value is CHD's tract-level share of people within a 10-minute walk of a park, available for large cities only.
The script uses County Health Rankings 2025 Access to Parks (`v179`), the share of each planning region's population living near a park.
That is a coarser geography and a slightly different definition, so every school in a region gets the same value.
ODIS's scaling for this column is taken as 100 at 0% access and 0 at 100% access: the column is reversed in ODIS, and its values pile up at exactly 0 (344 rows) and 100 (224 rows), as they would when some school areas have full and some no access.
CHD's raw values are not available to confirm the end points directly.

**Derived scores.**
A domain score is ODIS's weighted average of its indicators, where a missing indicator drops out and the others re-weight.
The weights are equal within each domain except Education, where `Linguistic isolation` counts double (`Less than HS` 1/4, `2-year college or higher` 1/4, `Linguistic isolation` 1/2); the `Composite Score` averages the domains equally.
The script recomputes a Connecticut domain score only when at least one of its indicators was filled, using the unrounded filled values, and then the composite.
`Crime` stays missing, so the composite averages the other four domains, as ODIS does for any school missing a domain.
A percentile rank is the share of schools with a lower score; each Connecticut score takes the rank ODIS gives the same score in other rows, which every recomputed Connecticut score has, so no other row's rank changes.
Medians are unchanged.

### Validation

The script prints all of these checks; the numbers below are from its output.
"Exact" means the recomputed value equals the ODIS value after rounding to an integer.

1. **ODIS's ZIP method, reproduced.**
   On the 10,692 non-CT schools without an SAB, the same computation with the 2010 relationship file ODIS used reproduces ODIS's values:

   | Indicators | Schools compared | Exact | Within 1 point |
   | --- | ---: | ---: | ---: |
   | 12 census indicators | 10,370-10,384 each | 98.5%-99.8% | 100% |
   | 8 race and ethnicity columns | 10,384 each | 100% | 100% |

   The few non-exact values sit on a rounding boundary.
2. **Effect of the 2020 relationship file.**
   The same schools computed with the 2020 file used for Connecticut differ from ODIS by 0.5-4.8 points on average (MAE; correlation 0.86-0.98), because 2020 tracts and ZIP areas differ from 2010.
   This is a property of the newer geography, not an error, and the Connecticut values carry it too.
   `Poverty` (MAE 4.8) and `SNAP recipients` (3.9) move most; the others move 0.5-2.5 points.
3. **County-level scaling.**
   ODIS's `Single-parent households`, `Low birth weight`, and `Infant mortality rate` values equal the CHR 2023 values scaled as above for 100% of 3,079, 3,000, and 1,208 counties.
4. **Lead index.**
   Recomputed the same way for non-CT schools without an SAB, the index agrees with ODIS's CHD-based values with correlation 0.986 and a mean absolute difference of 3.0 points, and is within one decile (11.1 points) for 97.0% of 5,638 schools.
   It is not exact because CHD's data year and component weights may differ slightly from those used here.
5. **Connecticut checks.**
   - Connecticut schools that have an SAB (112): their ODIS values come from SAB boundaries, so the ZIP method is not expected to match.
     It differs by 1.0-5.6 points on average for 10 of the 12 indicators and by 11 points for `Poverty` and `SNAP recipients`.
     Treat that as the typical gap between a ZIP-area and an attendance-area value.
   - ODIS v2 (2024) values for the 96 filled schools: the filled values differ from v2 by about as much as ODIS v3 differs from v2 for non-CT schools without an SAB (for example `Poverty` MAE 8.8 against 8.9, `Less than HS` 3.7 against 3.2, `Housing affordability` 19.5 against 16.4), since v2 used older ACS data and its own scaling.
   - Relabelling the 2010 file's Connecticut tracts instead of using the 2020 file gives values within 0.4-4.3 points on average (95 schools; one ZIP has no 2010 tract that survived).
6. **Domain scores.**
   Recomputing every domain score and composite of the 23,387 non-CT rows from their rounded indicators gives the same set of missing scores and a largest difference of 0.80, less than the rounding of the inputs; 80%-90% match exactly after rounding.
   The script stops if this check fails.

### The `ct_fill_sources` column

`index_scores_v3_2026_ct_filled.csv` has one column more than the fixed file, `ct_fill_sources`, added last.
It is empty for every non-CT row.
For a Connecticut row it lists what changed, as `source=column|column` groups separated by `;`:

| Key | Meaning |
| --- | --- |
| `acs2023_zip` | Filled from ACS 2019-2023 with ODIS's ZIP method (item 1) |
| `chr2025` | Filled from County Health Rankings 2025, single-parent households |
| `ctdph2024` | Filled from the CT DPH 2024 Registration Report |
| `lead_acs2023` | Filled with the recomputed lead index (approximation) |
| `chr2025_parks` | Filled from County Health Rankings 2025 Access to Parks (proxy) |
| `recomputed` | Domain score or percentile rank recomputed from the filled indicators |

For example, a Connecticut school with an SAB has `chr2025=Single-parent households;ctdph2024=Infant mortality rate|Low birth weight;lead_acs2023=Lead exposure risk;chr2025_parks=Park access;recomputed=Economic|Health|Housing|Composite Score|...`.

The file otherwise keeps the fixed file's format: CRLF line endings, no quoting, integer indicator values, `N/A` for missing indicators, and empty cells for missing scores.

### Caveats

- `Lead exposure risk` is an approximation of CHD's index, and `Park access` is a county-level proxy; do not compare them closely with other states' values.
- `Single-parent households`, `Low birth weight`, `Infant mortality rate`, and `Park access` are one value per planning region, as ODIS's county-level columns are one value per county.
  Their data years are newer than ODIS's for other states: CHR 2025 against CHR 2023 for single-parent households, and single-year 2024 DPH birth and death records against CHR 2023's multi-year national vital statistics.
- For the 96 schools without an SAB, the census values come from the 2020 ZIP-to-tract geography, which moves values by a few points against the 2010 geography used for other states (Validation, check 2).
  Many of these schools are regional or statewide choice schools (technical high schools, magnets), for which the ZIP stands in only loosely for where students live.
- `Crime` stays missing for Connecticut, so its composite averages four domains; leave Connecticut out of Crime-domain comparisons.

### Known follow-up: the same join problem outside Connecticut

The 2010 relationship file problem is not unique to Connecticut.
187 schools without an SAB in other states have ZIPs whose 2010 tracts were all renumbered in 2020, so they miss their census columns too.
They are left as ODIS has them here; the same method could fill them.

### Rerunning

```sh
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/fill_connecticut.py
```

It downloads about 1 GB on the first run (mostly ACS tables, state by state), which takes around 20 minutes, then regenerates `index_scores_v3_2026_ct_filled.csv` and prints the validation above.
The output is deterministic.

## Derived: graduation rates and regional weights

`derived/` holds tables that `analysis/05_regional_weights.py` computes from the ODIS data and federal high school graduation rates.
They are new files; the ODIS files above are not modified, and the Schoolscape map does not read them.
The analysis itself is written up in [`../visualizations/README.md`](../visualizations/README.md#05---regional-weights).

### Files

| File | Rows | Description |
| --- | ---: | --- |
| `derived/graduation_joined.csv` | 23,595 | Every school in `index_scores_v3_2026_ct_filled.csv`, in the same order, with its SY 2022-23 graduation rate joined on `NCESSCH`. |
| `derived/regional_stress_score.csv` | 23,390 | Every school outside Puerto Rico with its ODIS composite, its regionally weighted stress score (national-model weights for Alaska and Hawaii), both national percentiles, and the rank change. |

`graduation_joined.csv` keeps only the join key, the columns needed to place a school (`State`, `FIPS County Code`, and the analysis `region`), and the graduation-rate fields, so it joins back to the ODIS file on `NCESSCH`:

| Column | Meaning |
| --- | --- |
| `NCESSCH`, `State`, `FIPS County Code` | As in the ODIS file (read `NCESSCH` and `FIPS County Code` as strings) |
| `region` | The analysis region of `analysis/03_regional_variation.py`: Northeast, Midwest, South, Pacific Northwest (WA, OR, ID), California, Mountain & Southwest, or the small groups Alaska, Hawaii, and Puerto Rico |
| `acgr_value` | The rate exactly as published, such as `92%`, `90-94%`, `>=95%`, or `S`; empty when the school has no ACGR row |
| `acgr_cohort` | The adjusted cohort size (the rate's denominator) |
| `acgr_status` | `exact`, `range` (a range or bound), `suppressed`, or `not_reported` (no ACGR row) |
| `acgr_low`, `acgr_high`, `acgr_mid`, `acgr_width` | The interval the published value stands for, in percent, its midpoint, and its width (0 for exact rates) |
| `sample_four_domain`, `sample_five_domain` | 1 if the school is in the four-domain or five-domain regional model: a rate with width at most 20 points, one of the six mainland regions, and the domain scores the model uses |
| `sample_national` | 1 if the school is in the national model (a usable rate and all five domain scores, any region), whose weights score Alaska and Hawaii |

The parsing rule for `acgr_low` and `acgr_high`: a range counts both end points (`90-94%` is 90 to 94), `>=X%` is X to 100, `<=X%` is 0 to X, and `<X%` is 0 to X-1.

`regional_stress_score.csv` has `NCESSCH`, `Name`, `State`, `FIPS County Code`, `County`, `region`, `odis_composite` (the ODIS `Composite Score`), `regional_score` (0-100, the school's available domain scores averaged with its region's weights), `odis_percentile` and `regional_percentile` (national percentile ranks among these 23,390 schools, 0-100, higher = more stress), and `rank_change` (`regional_percentile` minus `odis_percentile`).

Both files are plain CSV with LF line endings; missing values are empty cells.

### Graduation-rate source

- **Dataset:** U.S. Department of Education, EDFacts, four-year adjusted cohort graduation rate (ACGR) and cohort count, school level, school year 2022-23, all students (file specifications FS150/FS151, data groups 695/696), published on [ED Data Express](https://eddataexpress.ed.gov/).
- **Download:** the ED Data Express [Data Download Tool](https://eddataexpress.ed.gov/download/data-builder/data-download-tool?f%5B0%5D=all_students%3AAll%20Students%20in%20School&f%5B1%5D=data_group_id%3A695&f%5B2%5D=level%3ASchool&f%5B3%5D=school_year%3A2022-2023) with the filters level = School, school year = 2022-2023, data group = 695, subgroup = All Students in School, exported as CSV (23,911 schools plus one Puerto Rico row with no school ID and the value `MISSING`).
- **Pinning:** the script checks the file's SHA-256 (`88664c9a8bf6ca09ba2e1e86fd8de53d2a564d618a26531909b01bf354f9e035`) and caches it in `.cache/acgr/`, which is gitignored.
  Two exports made minutes apart were byte-identical.
- **License:** a U.S. government work, in the public domain in the United States (17 U.S.C. 105); no permission is needed to use or redistribute it.
  Credit: U.S. Department of Education, ED Data Express.
- **Data notes:** ED Data Express flags that SY 2022-23 rates in Connecticut, Massachusetts, Minnesota, and New Mexico do not always equal the rate recomputed from subgroup cohort counts (rounding, per the states), and that Puerto Rico reported no school-level rates.

The analysis also reads the school type (`SCH_TYPE_TEXT`) from the NCES CCD 2022-23 school directory that `scripts/fix_ncessch.py` pins (see [Corrected NCESSCH IDs](#corrected-ncessch-ids)), for the coverage check only.

### Rerunning

```sh
.venv/bin/pip install -r requirements.txt
.venv/bin/python analysis/05_regional_weights.py
```

The Data Download Tool builds each export in a server-side batch behind a browser check, so a script cannot request it directly.
On first run the script downloads the static CSV that one export produced; if that link has expired, it stops and prints the Data Download Tool link above.
Open it in a web browser, choose **Download Data**, then **CSV**, and save the file as `.cache/acgr/acgr_sch_sy2022-23_all_students.csv`; the script verifies the SHA-256 before using it.
The output is deterministic.
