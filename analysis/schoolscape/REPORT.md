# Schoolscape pipeline report

Written by `python -m analysis.schoolscape build` (SPEC.md 8.3); deterministic, regenerated on every build.

## Inputs

| Input | SHA-256 |
| --- | --- |
| `data/index_scores_v3_2026_ct_filled.csv` | `c8743f084e094ba7a860d38060f5b1dbb414afc0b39db3da4a20d9e76db8e5d9` |
| `EDGE_GEOCODE_PUBLICSCH_2223.zip` | `eba99090e451069910f32627f5d7142e89774679076bb52dc559f98703c16ae7` |
| `cb_2023_us_state_5m.zip` | `0f606018e81fe99a204d08aa7ac1f8d00516143ddc95900b79eeecfee65da8c3` |
| `cb_2023_us_county_5m.zip` | `13b2bcdd81fee8476220793dd1023c4f1d2887945b5f66eef52afa98c99d2485` |

## Counts

| Item | Count |
| --- | --- |
| Schools (rows) | 23,595 |
| Schools with coordinates | 23,595 |
| States and territories with schools | 52 |
| Counties with schools | 3,167 |
| County polygons (1:5m) | 3,222 |
| County polygons with no ODIS school (drawn as no data) | 55 |
| Counties with exactly 1 school | 586 |
| Thin counties (1 to 2 schools) | 1,129 |
| Counties with 10 or more schools | 523 |
| Median schools per county | 4 |
| Largest county | 06037 (509 schools) |

## Geocode join

Coordinates come from the NCES EDGE 2022-23 public school geocodes, joined on `NCESSCH` zero-padded to 12 digits.

| Check | Result | Pass |
| --- | --- | --- |
| Schools matched to a geocode | 23,595 of 23,595 (100.0%) | yes |
| ODIS `FIPS County Code` equals NCES `CNTY` | 23,595 of 23,595 | yes |

Latitudes range from 17.96 to 71.30 and longitudes from -166.53 to -65.44.

Unmatched ids: none.

County disagreements: none.

Schools whose ODIS `State` differs from the state of their county (they count toward their ODIS `State` in state aggregates, SPEC.md 5.1): `490090000491` (`State` FIPS 04, county state FIPS 49).

## Missing values per layer

Share of schools with no value (`N/A`, empty, or `Null` in the CSV); `catalog` is the share in `site/data/catalog.json`.

| Layer | Column | Missing | Share | Catalog | Connecticut missing |
| --- | --- | --- | --- | --- | --- |
| `composite` | Composite Score | 0 | 0.0% | 0.0% | 0 |
| `economic` | Economic | 0 | 0.0% | 0.0% | 0 |
| `education` | Education | 189 | 0.8% | 0.8% | 0 |
| `health` | Health | 0 | 0.0% | 0.0% | 0 |
| `housing` | Housing | 191 | 0.8% | 0.8% | 0 |
| `crime` | Crime | 3,219 | 13.6% | 13.6% | 208 |
| `gini` | Gini index | 0 | 0.0% | 0.0% | 0 |
| `unemployment` | Unemployment | 0 | 0.0% | 0.0% | 0 |
| `poverty` | Poverty | 193 | 0.8% | 0.8% | 0 |
| `broadband` | Access to broadband internet | 191 | 0.8% | 0.8% | 0 |
| `single_parent` | Single-parent households | 208 | 0.9% | 0.9% | 0 |
| `less_than_hs` | Less than HS | 189 | 0.8% | 0.8% | 0 |
| `college_2yr_plus` | 2-year college or higher | 189 | 0.8% | 0.8% | 0 |
| `college_2yr` | 2-year college | 189 | 0.8% | 0.8% | 0 |
| `college_4yr` | 4-year college | 189 | 0.8% | 0.8% | 0 |
| `grad_degree` | Graduate or professional degree | 189 | 0.8% | 0.8% | 0 |
| `linguistic_isolation` | Linguistic isolation | 191 | 0.8% | 0.8% | 0 |
| `healthcare_access` | Access to healthcare | 193 | 0.8% | 0.8% | 0 |
| `infant_mortality` | Infant mortality rate | 5,622 | 23.8% | 23.8% | 0 |
| `snap` | SNAP recipients | 205 | 0.9% | 0.9% | 0 |
| `low_birth_weight` | Low birth weight | 308 | 1.3% | 1.3% | 0 |
| `lead_risk` | Lead exposure risk | 12,086 | 51.2% | 51.2% | 0 |
| `vacancy` | Housing vacancy rate | 191 | 0.8% | 0.8% | 0 |
| `affordability` | Housing affordability | 191 | 0.8% | 0.8% | 0 |
| `park_access` | Park access | 12,036 | 51.0% | 51.0% | 0 |
| `violent_crime` | Violent crime rate | 5,879 | 24.9% | 24.9% | 208 |
| `incarceration` | Incarceration rate | 5,420 | 23.0% | 23.0% | 208 |
| `ctx_white` | White alone | 189 | 0.8% | 0.8% | 0 |
| `ctx_black` | Black or African American alone | 189 | 0.8% | 0.8% | 0 |
| `ctx_aian` | American Indian and Alaska Native alone | 189 | 0.8% | 0.8% | 0 |
| `ctx_asian` | Asian alone | 189 | 0.8% | 0.8% | 0 |
| `ctx_nhpi` | Native Hawaiian and Other Pacific Islander alone | 189 | 0.8% | 0.8% | 0 |
| `ctx_other` | Some other race alone | 189 | 0.8% | 0.8% | 0 |
| `ctx_two_plus` | Two or more races | 189 | 0.8% | 0.8% | 0 |
| `ctx_hispanic` | Hispanic or Latino | 189 | 0.8% | 0.8% | 0 |

## Connecticut

208 rows have a non-empty `ct_fill_sources` and carry the `ctFilled` flag (bit value 1) in `schools/all.json`; states of flagged rows: CT.
Connecticut rows in the input: 208; none are dropped.
County codes are the 2022 planning regions: 09110, 09120, 09130, 09140, 09150, 09160, 09170, 09180, 09190.
Layers still missing for Connecticut: `Crime`, `Violent crime rate`, `Incarceration rate`.

| Fill source | Rows |
| --- | --- |
| `acs2023_zip` | 96 |
| `chr2025` | 208 |
| `chr2025_parks` | 208 |
| `ctdph2024` | 208 |
| `lead_acs2023` | 208 |
| `recomputed` | 208 |

## Reference statistics (SPEC.md Appendix C)

Pairwise deletion; Spearman with average ranks; area levels use unrounded area means.

| Pair | Units | Spearman expected | Spearman | Pearson expected | Pearson | n expected | n | Source | Match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| crime vs education | schools | 0.2419 | 0.2419 | 0.0655 | 0.0655 | 20,201 | 20,201 | national.json `schools` | yes |
| economic vs education | schools | 0.5574 | 0.5574 | 0.4927 | 0.4927 | 23,406 | 23,406 | national.json `schools` | yes |
| crime vs education | schools, CA | 0.2361 | 0.2361 | 0.1408 | 0.1408 | 2,202 | 2,202 | computed here | yes |
| crime vs education | county means | 0.3966 | 0.3966 | 0.2560 | 0.2560 | 2,211 | 2,211 | national.json `counties` | yes |
| crime vs education | state means | 0.1661 | 0.1661 | 0.1180 | 0.1180 | 50 | 50 | national.json `states` | yes |
| economic vs education | state means | 0.4964 | 0.4964 | 0.4785 | 0.4785 | 52 | 52 | national.json `states` | yes |

## Composite Score quintile breaks (SPEC.md 5.2)

| Level | Expected | breaks.json | Match |
| --- | --- | --- | --- |
| local | 21 / 25 / 30 / 35 | 21 / 25 / 30 / 35 | yes |
| state | 23 / 27 / 31 / 37.7 | 23 / 27 / 31 / 37.7 | yes |
| nation | 24.1 / 25.8 / 29.3 / 34 | 24.1 / 25.8 / 29.3 / 34 | yes |

## Output sizes

| File | Bytes | Gzip -9 bytes |
| --- | --- | --- |
| `schools/all.json` | 6,264,006 | 1,412,906 |
| `states.json` | 30,375 | 9,498 |
| `counties.json` | 1,616,645 | 401,838 |
| `breaks.json` | 6,611 | 1,808 |
| `national.json` | 54,617 | 18,323 |
| `catalog.json` | 10,972 | 2,246 |
