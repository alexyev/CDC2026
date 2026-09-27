# Citations

This file cites everything the CDC2026 project used that its team did not create: the primary dataset, every external data source, the statistical methods and their standard references, the software, and the generative AI tools.
The Carolina Data Challenge rules ask for all four, and ask that AI-generated code and statistical methods be cited where they are used.
Every source file in `analysis/`, `scripts/`, and `site/` carries a header comment pointing here, and the functions that implement a statistical method name it and point to [Statistical methods](#3-statistical-methods).

Contents:

1. [Primary dataset](#1-primary-dataset)
2. [External data sources](#2-external-data-sources)
3. [Statistical methods](#3-statistical-methods)
4. [Generative AI use](#4-generative-ai-use)
5. [Software and licenses](#5-software-and-licenses)

## 1. Primary dataset

**Open Data Index for Schools (ODIS), version 3.**

- **Authors:** Angela Hawken, Nicholas Minar, Raj Choudhary, Jonathan Kulick
- **Publisher:** Johns Hopkins Research Data Repository, 2026, V1
- **DOI:** [https://doi.org/10.7281/T170WN53](https://doi.org/10.7281/T170WN53)
- **License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **Used for:** everything; one row per US public high school (23,599 rows as published).

Suggested citation, as given in the dataset's README:

> Hawken, Angela; Minar, Nicholas; Choudhary, Raj; Kulick, Jonathan, 2026, "Open Data Index for Schools (ODIS)", https://doi.org/10.7281/T170WN53, Johns Hopkins Research Data Repository, V1.

`data/index_scores_v3_2026.csv` and `data/ODIS README v3.pdf` are redistributed unmodified under CC BY 4.0.
The project's derived files (`data/index_scores_v3_2026_fixed.csv`, `data/ncessch_fix_report.csv`, `data/index_scores_v3_2026_ct_filled.csv`, and `data/derived/`) are derived works under the same license; [data/README.md](data/README.md) documents exactly what changed and why.

## 2. External data sources

Every source below is downloaded by a committed script, pinned by SHA-256, and cached in a gitignored `.cache/` directory, unless noted otherwise.
None of them is used to change an ODIS value outside Connecticut.

### 2.1 School identifiers and locations

**NCES Common Core of Data (CCD), public school directory, school year 2022-23.**

- **Publisher:** U.S. Department of Education, National Center for Education Statistics (NCES)
- **File:** [ccd_sch_029_2223_w_1a_083023.zip](https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2223_w_1a_083023.zip), listed at [nces.ed.gov/ccd/files.asp](https://nces.ed.gov/ccd/files.asp)
- **License:** U.S. government work, public domain
- **Used for:** recovering the 19,154 NCESSCH school IDs that ODIS v3 stores in rounded scientific notation (`scripts/fix_ncessch.py`); school type and charter status for the graduation-rate coverage check (`analysis/05_regional_weights.py`).

**NCES EDGE Public School Geocodes, school year 2022-23.**

- **Publisher:** U.S. Department of Education, NCES, Education Demographic and Geographic Estimates (EDGE) program
- **File:** [EDGE_GEOCODE_PUBLICSCH_2223.zip](https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2223.zip), described at [nces.ed.gov/programs/edge/Geographic/SchoolLocations](https://nces.ed.gov/programs/edge/Geographic/SchoolLocations)
- **License:** U.S. government work, public domain
- **Used for:** the latitude and longitude of every school pin on the Schoolscape map, and a check that each ODIS county code matches NCES (`analysis/schoolscape/schools.py`).

The school profile in the app links each school to its public NCES "Search for Public Schools" page (`https://nces.ed.gov/ccd/schoolsearch/`); no data is read from it.

### 2.2 Boundaries and geography

**U.S. Census Bureau, Cartographic Boundary Files, 2023.**

- **Files:** [cb_2023_us_state_5m.zip](https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_5m.zip) and [cb_2023_us_county_5m.zip](https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip) (1:5,000,000), from [census.gov, Cartographic Boundary Files](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html)
- **License:** U.S. government work, public domain
- **Used for:** the state and county polygons, centroids, and bounding boxes of the map (`analysis/schoolscape/boundaries.py`, `aggregates.py`, `gazetteer.py`), and the county map in `analysis/05_regional_weights.py`.
  The 1:500,000 county file is pinned in `analysis/schoolscape/config.py` for later per-state detail but is not used by any current output.

**U.S. Census Bureau, Census Regions and Divisions of the United States.**

- **Source:** [census.gov, Census Regions and Divisions](https://www2.census.gov/geo/pdfs/maps-data/maps/reference/us_regdiv.pdf)
- **License:** U.S. government work, public domain
- **Used for:** the starting point of the analysis regions in `analysis/03_regional_variation.py` (the Census Northeast, Midwest, and South kept whole; the Census West split into the areas the project asked about), which `analysis/05_regional_weights.py` reuses.

### 2.3 Connecticut fill

ODIS v3 leaves most Connecticut values empty because of two join problems; `scripts/fill_connecticut.py` fills them.
[data/README.md, "Connecticut fill"](data/README.md#connecticut-fill) has the full method and validation.

| Source | Publisher, title, version | URL | License and terms | Used for |
| --- | --- | --- | --- | --- |
| American Community Survey | U.S. Census Bureau, ACS 2019-2023 5-year estimates, census tracts; tables B01003, B17020, B28002, B15002, B25002, B02001, B03002, B25034, C17002, S1602, S2701, S2201, S2503 | [data.census.gov API](https://data.census.gov/) | U.S. government work, public domain | 12 census indicators and 8 race and ethnicity shares for the 96 Connecticut schools without an attendance boundary; lead index inputs; tract population weights |
| ZCTA to tract relationship file | U.S. Census Bureau, 2020 ZCTA to 2020 census tract relationship file | [tab20_zcta520_tract20_natl.txt](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt) | Public domain | ZIP-to-tract weighting, ODIS's documented method for schools without a boundary |
| Connecticut tract crosswalk | CT Data Collaborative, 2022 tract crosswalk (`2022tractcrosswalk.csv`, commit `5dc032c`) | [github.com/CT-Data-Collaborative/2022-tract-crosswalk](https://github.com/CT-Data-Collaborative/2022-tract-crosswalk) | No license stated; used as a lookup only and not redistributed. Credit: CT Data Collaborative. | Relabelling 2020 Connecticut tract codes to the 2022 planning-region codes |
| County Health Rankings 2025 | University of Wisconsin Population Health Institute, County Health Rankings & Roadmaps 2025 (`analytic_data2025_v3.csv`, measures `v082` and `v179`) | [countyhealthrankings.org](https://www.countyhealthrankings.org/) | Free to use with attribution: "University of Wisconsin Population Health Institute. County Health Rankings & Roadmaps 2025. www.countyhealthrankings.org." | `Single-parent households`; `Park access` (a planning-region proxy) |
| Connecticut vital statistics | Connecticut Department of Public Health, Vital Statistics Registration Report 2024, Tables 6 and 19 (`rr2024_v20260727.xlsx`) | [portal.ct.gov/dph, Vital Statistics](https://portal.ct.gov/dph/resources-and-records/data-research/vital-statistics-and-population-data/vital-statistics) | Connecticut state government publication. Credit: Connecticut Department of Public Health. | `Low birth weight`, `Infant mortality rate` by planning region |
| City Health Dashboard lead index method | Department of Population Health, NYU Langone Health, City Health Dashboard Technical Document (2026-07-28) and tract list | [Technical Document](https://www.cityhealthdashboard.com/technical-documentation), [tract list](https://www.cityhealthdashboard.com/api/tract-geographic-identifiers.csv) | Method and tract list only; no City Health Dashboard values are used or redistributed | Recomputing the `Lead exposure risk` index from ACS data (an approximation); the method's 0.58 / 0.42 weights come from the Vox Media and Washington State Department of Health lead risk index that the Technical Document cites |

Used for checks only, not in any output:

- U.S. Census Bureau, [2010 ZCTA to tract relationship file](https://www2.census.gov/geo/docs/maps-data/data/rel/zcta_tract_rel_10.txt) (public domain), to reproduce ODIS's own values.
- County Health Rankings & Roadmaps 2023 (`analytic_data2023_0.csv`), to recover ODIS's scaling of the county-level indicators.
- **ODIS v2:** Hawken et al., 2025, Open Data Index for Schools v2, NYU UltraViolet, [https://doi.org/10.58153/t94md-edc80](https://doi.org/10.58153/t94md-edc80) (CC BY 4.0), to compare filled values; its technical report is the method reference for ODIS's indicator scaling, since the v3 technical report was not reachable.

### 2.4 Graduation rates

**EDFacts four-year adjusted cohort graduation rate (ACGR), school level, school year 2022-23.**

- **Publisher:** U.S. Department of Education, EDFacts, published on [ED Data Express](https://eddataexpress.ed.gov/) (file specifications FS150/FS151, data groups 695/696, all students)
- **Download:** the ED Data Express Data Download Tool, exported as CSV; SHA-256 `88664c9a8bf6ca09ba2e1e86fd8de53d2a564d618a26531909b01bf354f9e035`
- **License:** U.S. government work, public domain in the United States (17 U.S.C. 105). Credit: U.S. Department of Education, ED Data Express.
- **Used for:** the outcome in the regional weights analysis (`analysis/05_regional_weights.py`, `data/derived/graduation_joined.csv`, `data/derived/regional_stress_score.csv`).

### 2.5 Map basemap, fonts, and icons

- **Basemap tiles and style:** [OpenFreeMap](https://openfreemap.org/) (free, no API key), "dark" style at `https://tiles.openfreemap.org/styles/dark`, restyled at load time by `site/src/basemap/theme.ts`.
- **Tile schema:** © [OpenMapTiles](https://openmaptiles.org/) (vector tile schema; its low-zoom layers draw on Natural Earth, public domain).
- **Map data:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
  The map shows the attribution line "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" through MapLibre's attribution control.
- **Map labels:** Noto Sans Regular glyphs served by OpenFreeMap (Google, SIL Open Font License 1.1).
- **Interface fonts:** [Inter](https://rsms.me/inter/) (Rasmus Andersson) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (JetBrains), both SIL Open Font License 1.1, self-hosted through [Fontsource](https://fontsource.org/) (`@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` 5.3.0).
- **Icons:** [Lucide](https://lucide.dev/) (`lucide-react` 1.48.0, ISC).
- **UI components:** [shadcn/ui](https://ui.shadcn.com/) (MIT), whose component source the shadcn CLI copies into `site/src/components/ui/` and `site/src/lib/utils.ts`; see [Generative AI use](#4-generative-ai-use) for how those files were then adapted.

### 2.6 Services the app calls at runtime

- **Jev** (`jev-1.13.0`), TypeSafe AI's System One model, through `@typesafe-ai/sdk` 0.6.0, and **Claude Haiku 4.5** (`claude-haiku-4-5`), Anthropic, through `@anthropic-ai/sdk` 0.128.0, parse "Ask the map" requests; see [Generative AI use](#4-generative-ai-use).
- **Vercel** hosts the site and the command function.

## 3. Statistical methods

The table lists each method the analysis scripts and the app's statistics engine use, where it is implemented, and its standard reference.
Full references follow the table.

| Method | Where | References |
| --- | --- | --- |
| Spearman rank correlation, average ranks for ties, pairwise deletion | `site/src/stats/correlation.ts` (`averageRanks`, `spearman`); `analysis/schoolscape/aggregates.py`; `analysis/03_regional_variation.py` (`spearman`); `analysis/04_national_relationships.py` (`correlations`) | Spearman 1904 |
| Pearson product-moment correlation | `site/src/stats/correlation.ts` (`pearson`); `analysis/schoolscape/aggregates.py`; `analysis/05_regional_weights.py` (`cross_validate`) | Pearson 1895 |
| Fisher z transformation: 95% interval for Pearson r, minimum detectable correlation, naive-interval comparison | `site/src/stats/correlation.ts` (`pearsonInterval`); `analysis/04_national_relationships.py` (`min_detectable_rho`, `main`) | Fisher 1915, 1921; Cohen 1988 |
| Bonett-Wright 95% interval for Spearman's rho (n > 5,000) | `site/src/stats/correlation.ts` (`bonettWrightInterval`) | Bonett and Wright 2000 |
| t approximation for the significance of Spearman's rho (naive p) | `analysis/04_national_relationships.py` (`correlations`) | Zar 1972 |
| Percentile bootstrap (seeded, 1,000 resamples of pairs) | `site/src/stats/bootstrap.ts` (`bootstrapSpearman`) | Efron 1979; Efron and Tibshirani 1993 |
| Cluster (county) bootstrap, stratified by region where noted; bootstrap standard errors and percentile intervals; two-sided percentile-bootstrap p-value | `analysis/03_regional_variation.py` (`resample`, `region_estimates`, `correlations_by_region`, `large_city_contrast`, `driver_analysis`, `bootstrap_p`); `analysis/04_national_relationships.py` (`correlations`); `analysis/05_regional_weights.py` (`bootstrap_weights`) | Davison and Hinkley 1997; Field and Welsh 2007; Efron and Tibshirani 1993 |
| Pseudorandom numbers: xoshiro128\*\* seeded by splitmix32 (app); NumPy's PCG64 `default_rng` with fixed seeds (analysis) | `site/src/stats/bootstrap.ts` (`createRng`); every `np.random.default_rng(SEED)` | Blackman and Vigna 2021; Steele, Lea, and Flood 2014; O'Neill 2014 |
| Benjamini-Hochberg false discovery rate | `analysis/03_regional_variation.py` (`benjamini_hochberg`); `analysis/04_national_relationships.py` (`correlations`, via statsmodels `multipletests`) | Benjamini and Hochberg 1995 |
| Holm step-down adjustment | `analysis/05_regional_weights.py` (`contrasts`) | Holm 1979 |
| Cliff's delta (via the Mann-Whitney U statistic) | `analysis/03_regional_variation.py` (`cliffs_delta`) | Cliff 1993; Mann and Whitney 1947 |
| Linear mixed model with nested random intercepts, fitted by REML; variance components and intraclass correlation | `analysis/03_regional_variation.py` (`fit_nested`, `variance_decomposition`) | Patterson and Thompson 1971; Laird and Ware 1982 |
| Design effect and effective sample size for clustered data | `analysis/03_regional_variation.py` (`design_effects`) | Kish 1965 |
| Ordinary least squares | `analysis/04_national_relationships.py` (`fit_ols`, `attainment_model`); `analysis/05_regional_weights.py` (`fit`); the scatter trend lines in `site/src/components/Scatter.tsx` and `CompareScatter.tsx` (`ols`) | Kutner et al. 2005 |
| Cluster-robust (county, state) standard errors and Wald tests | `analysis/03_regional_variation.py` (`heterogeneity_test`); `analysis/04_national_relationships.py` (`fit_ols`); `analysis/05_regional_weights.py` (`fit`, `heterogeneity_tests`, `contrasts`) | Liang and Zeger 1986; Cameron and Miller 2015; Wald 1943 |
| Heteroskedasticity-consistent HC3 standard errors | `analysis/04_national_relationships.py` (`attainment_model`, county-level fit) | MacKinnon and White 1985 |
| Likelihood ratio test | `analysis/05_regional_weights.py` (`heterogeneity_tests`) | Wilks 1938 |
| State fixed effects and the within (demeaned) estimator | `analysis/05_regional_weights.py` (`design`, `demeaned_slopes`, `cross_validate`) | Wooldridge 2010 |
| Delta method for the ratio of two slopes | `analysis/05_regional_weights.py` (`contrasts`) | Oehlert 1992 |
| Variance inflation factors | `analysis/04_national_relationships.py` (`attainment_model`); `analysis/05_regional_weights.py` (`vif_table`) | Marquardt 1970; Kutner et al. 2005 |
| Principal component analysis of the correlation matrix | `analysis/04_national_relationships.py` (`pca`) | Pearson 1901; Hotelling 1933; Jolliffe 2002 |
| Horn's parallel analysis for the number of components | `analysis/04_national_relationships.py` (`pca`) | Horn 1965 |
| Varimax rotation | `analysis/04_national_relationships.py` (`varimax`) | Kaiser 1958 |
| Rank-based inverse normal transformation | `analysis/04_national_relationships.py` (`normal_scores`) | Beasley, Erickson, and Allison 2009 |
| Tucker's congruence coefficient | `analysis/04_national_relationships.py` (`congruence`) | Tucker 1951; Lorenzo-Seva and ten Berge 2006 |
| Optimal one-to-one matching of components (Hungarian method) | `analysis/04_national_relationships.py` (`aligned_columns`, via SciPy `linear_sum_assignment`) | Kuhn 1955; Crouse 2016 |
| Average-linkage hierarchical clustering with optimal leaf ordering (heatmap order) | `analysis/04_national_relationships.py` (`plot_heatmap`) | Sokal and Michener 1958; Bar-Joseph, Gifford, and Jaakkola 2001 |
| Ridge regression with the penalty chosen by efficient leave-one-out cross-validation (`RidgeCV`) | `analysis/04_national_relationships.py` (`attainment_model`) | Hoerl and Kennard 1970; Golub, Heath, and Wahba 1979 |
| Histogram-based gradient boosting (`HistGradientBoostingRegressor`) | `analysis/04_national_relationships.py` (`attainment_model`) | Friedman 2001; Ke et al. 2017 |
| K-fold and group (county) K-fold cross-validation | `analysis/04_national_relationships.py` (`cv_r2`, `attainment_model`); `analysis/05_regional_weights.py` (`cross_validate`) | Stone 1974; Roberts et al. 2017 |
| Sample quantiles (NumPy's default linear interpolation) for the map's quintile and tercile class breaks | `analysis/schoolscape/aggregates.py` (`quantiles`) | Hyndman and Fan 1996 |
| Bivariate choropleth (3 x 3 tercile grid) | `site/src/map/choropleth.ts` | Trumbo 1981 |
| Correlations at area and school level, and the ecological fallacy caveat | the insight panel; `analysis/04_national_relationships.py` (between- and within-county correlations) | Robinson 1950 |
| Effect-size bands for correlations (0.1 weak, 0.3 moderate, 0.5 strong) | `analysis/03_regional_variation.py`, `analysis/04_national_relationships.py` | Cohen 1988 |
| Line simplification of the boundary TopoJSON | `analysis/schoolscape/boundaries.py` (via the `topojson` package's default Douglas-Peucker simplification) | Douglas and Peucker 1973 |
| ODIS indicator scaling (min-max to 0-100), population-weighted ZIP averages, and domain weights, reproduced for Connecticut | `scripts/fill_connecticut.py` (`scale`, `fit_bound`, `zip_average`, `weighted_average`, `percentile_rank`) | ODIS v2 technical report (Hawken et al. 2025, [doi:10.58153/t94md-edc80](https://doi.org/10.58153/t94md-edc80)) |
| City Health Dashboard lead exposure risk index (z-scores weighted 0.58 / 0.42, ranked into deciles) | `scripts/fill_connecticut.py` (`lead_index`) | City Health Dashboard Technical Document (2026) |

The regional domain weights in `analysis/05_regional_weights.py` (`weights_from_slopes`) and the circularity guard in `analysis/03_regional_variation.py` and `analysis/04_national_relationships.py` (leave-one-out correlations and exact variance shares, `Cov(w_d D_d, C) / Var(C)`) are the project's own constructions from the standard tools above; [visualizations/README.md](visualizations/README.md) explains them.

### References

- Bar-Joseph, Z., Gifford, D. K., and Jaakkola, T. S. (2001). Fast optimal leaf ordering for hierarchical clustering. *Bioinformatics*, 17(suppl. 1), S22-S29.
- Beasley, T. M., Erickson, S., and Allison, D. B. (2009). Rank-based inverse normal transformations are increasingly used, but are they merited? *Behavior Genetics*, 39(5), 580-595.
- Benjamini, Y., and Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. *Journal of the Royal Statistical Society, Series B*, 57(1), 289-300.
- Blackman, D., and Vigna, S. (2021). Scrambled linear pseudorandom number generators. *ACM Transactions on Mathematical Software*, 47(4), 36.
- Bonett, D. G., and Wright, T. A. (2000). Sample size requirements for estimating Pearson, Kendall and Spearman correlations. *Psychometrika*, 65(1), 23-28.
- Cameron, A. C., and Miller, D. L. (2015). A practitioner's guide to cluster-robust inference. *Journal of Human Resources*, 50(2), 317-372.
- Cliff, N. (1993). Dominance statistics: Ordinal analyses to answer ordinal questions. *Psychological Bulletin*, 114(3), 494-509.
- Cohen, J. (1988). *Statistical Power Analysis for the Behavioral Sciences* (2nd ed.). Lawrence Erlbaum.
- Crouse, D. F. (2016). On implementing 2D rectangular assignment algorithms. *IEEE Transactions on Aerospace and Electronic Systems*, 52(4), 1679-1696.
- Davison, A. C., and Hinkley, D. V. (1997). *Bootstrap Methods and Their Application*. Cambridge University Press.
- Douglas, D. H., and Peucker, T. K. (1973). Algorithms for the reduction of the number of points required to represent a digitized line or its caricature. *Cartographica*, 10(2), 112-122.
- Efron, B. (1979). Bootstrap methods: Another look at the jackknife. *The Annals of Statistics*, 7(1), 1-26.
- Efron, B., and Tibshirani, R. J. (1993). *An Introduction to the Bootstrap*. Chapman and Hall.
- Field, C. A., and Welsh, A. H. (2007). Bootstrapping clustered data. *Journal of the Royal Statistical Society, Series B*, 69(3), 369-390.
- Fisher, R. A. (1915). Frequency distribution of the values of the correlation coefficient in samples from an indefinitely large population. *Biometrika*, 10(4), 507-521.
- Fisher, R. A. (1921). On the "probable error" of a coefficient of correlation deduced from a small sample. *Metron*, 1, 3-32.
- Friedman, J. H. (2001). Greedy function approximation: A gradient boosting machine. *The Annals of Statistics*, 29(5), 1189-1232.
- Golub, G. H., Heath, M., and Wahba, G. (1979). Generalized cross-validation as a method for choosing a good ridge parameter. *Technometrics*, 21(2), 215-223.
- Hoerl, A. E., and Kennard, R. W. (1970). Ridge regression: Biased estimation for nonorthogonal problems. *Technometrics*, 12(1), 55-67.
- Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics*, 6(2), 65-70.
- Horn, J. L. (1965). A rationale and test for the number of factors in factor analysis. *Psychometrika*, 30(2), 179-185.
- Hotelling, H. (1933). Analysis of a complex of statistical variables into principal components. *Journal of Educational Psychology*, 24(6), 417-441.
- Hyndman, R. J., and Fan, Y. (1996). Sample quantiles in statistical packages. *The American Statistician*, 50(4), 361-365.
- Jolliffe, I. T. (2002). *Principal Component Analysis* (2nd ed.). Springer.
- Kaiser, H. F. (1958). The varimax criterion for analytic rotation in factor analysis. *Psychometrika*, 23(3), 187-200.
- Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q., and Liu, T.-Y. (2017). LightGBM: A highly efficient gradient boosting decision tree. *Advances in Neural Information Processing Systems*, 30.
- Kish, L. (1965). *Survey Sampling*. Wiley.
- Kuhn, H. W. (1955). The Hungarian method for the assignment problem. *Naval Research Logistics Quarterly*, 2(1-2), 83-97.
- Kutner, M. H., Nachtsheim, C. J., Neter, J., and Li, W. (2005). *Applied Linear Statistical Models* (5th ed.). McGraw-Hill.
- Laird, N. M., and Ware, J. H. (1982). Random-effects models for longitudinal data. *Biometrics*, 38(4), 963-974.
- Liang, K.-Y., and Zeger, S. L. (1986). Longitudinal data analysis using generalized linear models. *Biometrika*, 73(1), 13-22.
- Lorenzo-Seva, U., and ten Berge, J. M. F. (2006). Tucker's congruence coefficient as a meaningful index of factor similarity. *Methodology*, 2(2), 57-64.
- MacKinnon, J. G., and White, H. (1985). Some heteroskedasticity-consistent covariance matrix estimators with improved finite sample properties. *Journal of Econometrics*, 29(3), 305-325.
- Mann, H. B., and Whitney, D. R. (1947). On a test of whether one of two random variables is stochastically larger than the other. *The Annals of Mathematical Statistics*, 18(1), 50-60.
- Marquardt, D. W. (1970). Generalized inverses, ridge regression, biased linear estimation, and nonlinear estimation. *Technometrics*, 12(3), 591-612.
- Oehlert, G. W. (1992). A note on the delta method. *The American Statistician*, 46(1), 27-29.
- O'Neill, M. E. (2014). *PCG: A family of simple fast space-efficient statistically good algorithms for random number generation* (Technical Report HMC-CS-2014-0905). Harvey Mudd College.
- Patterson, H. D., and Thompson, R. (1971). Recovery of inter-block information when block sizes are unequal. *Biometrika*, 58(3), 545-554.
- Pearson, K. (1895). Note on regression and inheritance in the case of two parents. *Proceedings of the Royal Society of London*, 58, 240-242.
- Pearson, K. (1901). On lines and planes of closest fit to systems of points in space. *Philosophical Magazine*, 2(11), 559-572.
- Roberts, D. R., et al. (2017). Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure. *Ecography*, 40(8), 913-929.
- Robinson, W. S. (1950). Ecological correlations and the behavior of individuals. *American Sociological Review*, 15(3), 351-357.
- Sokal, R. R., and Michener, C. D. (1958). A statistical method for evaluating systematic relationships. *University of Kansas Science Bulletin*, 38, 1409-1438.
- Spearman, C. (1904). The proof and measurement of association between two things. *The American Journal of Psychology*, 15(1), 72-101.
- Steele, G. L., Lea, D., and Flood, C. H. (2014). Fast splittable pseudorandom number generators. *Proceedings of the 2014 ACM International Conference on Object Oriented Programming Systems Languages and Applications (OOPSLA)*, 453-472.
- Stone, M. (1974). Cross-validatory choice and assessment of statistical predictions. *Journal of the Royal Statistical Society, Series B*, 36(2), 111-147.
- Trumbo, B. E. (1981). A theory for coloring bivariate statistical maps. *The American Statistician*, 35(4), 220-226.
- Tucker, L. R. (1951). *A Method for Synthesis of Factor Analysis Studies* (Personnel Research Section Report No. 984). Department of the Army.
- Wald, A. (1943). Tests of statistical hypotheses concerning several parameters when the number of observations is large. *Transactions of the American Mathematical Society*, 54(3), 426-482.
- Wilks, S. S. (1938). The large-sample distribution of the likelihood ratio for testing composite hypotheses. *The Annals of Mathematical Statistics*, 9(1), 60-62.
- Wooldridge, J. M. (2010). *Econometric Analysis of Cross Section and Panel Data* (2nd ed.). MIT Press.
- Zar, J. H. (1972). Significance testing of the Spearman rank correlation coefficient. *Journal of the American Statistical Association*, 67(339), 578-580.

### Statistical software

- **pandas** 3.0.6: McKinney, W. (2010). Data structures for statistical computing in Python. *Proceedings of the 9th Python in Science Conference*, 56-61.
- **NumPy** 2.5.3: Harris, C. R., et al. (2020). Array programming with NumPy. *Nature*, 585, 357-362.
- **SciPy** 1.18.1: Virtanen, P., et al. (2020). SciPy 1.0: Fundamental algorithms for scientific computing in Python. *Nature Methods*, 17, 261-272.
- **statsmodels** 0.15.0: Seabold, S., and Perktold, J. (2010). statsmodels: Econometric and statistical modeling with Python. *Proceedings of the 9th Python in Science Conference*, 92-96.
- **scikit-learn** 1.9.1: Pedregosa, F., et al. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research*, 12, 2825-2830.
- **Matplotlib** 3.11.2: Hunter, J. D. (2007). Matplotlib: A 2D graphics environment. *Computing in Science and Engineering*, 9(3), 90-95.
- **GeoPandas** 1.1.4, **Shapely** 2.1.2, **pyogrio** 0.13.0, **pyproj** 3.8.0 (PROJ), **topojson** 1.10, and **openpyxl** 3.1.5 for geometry, projections, TopoJSON, and spreadsheet reading.
- **D3** (`d3-array` 3.2.4, `d3-scale` 4.0.2, `d3-shape` 3.2.0): Bostock, M., Ogievetsky, V., and Heer, J. (2011). D3: Data-Driven Documents. *IEEE Transactions on Visualization and Computer Graphics*, 17(12), 2301-2309.
- **MapLibre GL JS** 6.11.2 ([maplibre.org](https://maplibre.org/)) for the map, and **deck.gl** 9.4.0 ([deck.gl](https://deck.gl/); Wang, Y. (2019). Deck.gl: Large-scale web-based visual analytics made easy. arXiv:1910.08865) for the school pins.

The app's own statistics (Spearman, Pearson, the intervals, the bootstrap, and the histograms in `site/src/stats/`) are implemented directly in TypeScript and tested against reference values computed with SciPy (`site/src/test/fixtures/stats-cases.json`).

## 4. Generative AI use

### Building the project

- **Claude Code (Anthropic)** built this project.
  It ran "firstmate", an orchestration setup in which a supervising Claude session dispatched autonomous Claude Code worker sessions.
  Those workers wrote essentially all of the code, data-processing scripts, analyses, figures, and documentation in this repository, under the team's direction and review.
- **Claude Opus 5.5** (`claude-opus-5-5`) was the model of the supervisor and of the build and analysis workers.
- **Claude Fable 5.1** (`claude-fable-5-1`), running as a worker, conducted the design interview and wrote the build specification, [SPEC.md](SPEC.md).
- **Claude (Fable) in chat** was used by the team for brainstorming, for example estimating the match rates for recovering the broken school IDs.
- **no-mistakes**, an automated code review pipeline that runs Claude, reviewed early changes before they were merged.

### Where AI-generated code lives

Effectively all code in this repository is AI-generated:

- `analysis/`: the five analysis scripts and the Schoolscape data pipeline (`analysis/schoolscape/`), including its tests and the generated `REPORT.md`.
- `scripts/`: `fix_ncessch.py` and `fill_connecticut.py`.
- `site/`: the whole web app, including `site/src/`, the command function in `site/api/`, the end-to-end tests in `site/e2e/`, the development harness in `site/dev/`, and the build and lint configuration.
  The files in `site/src/components/ui/` and `site/src/lib/utils.ts` started as shadcn/ui component source copied in by the shadcn CLI (MIT) and were then adapted by the Claude Code workers.
- Documentation: [README.md](README.md), [STORY.md](STORY.md), [SPEC.md](SPEC.md), [data/README.md](data/README.md), [visualizations/README.md](visualizations/README.md), the app's About text, and this file.
- Figures and tables: every PNG and CSV in `visualizations/`, and the derived data files in `data/`, are outputs of the AI-written scripts above.

Every hand-authored source file in these directories carries a header comment, "Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.", and every function that implements a statistical method names it and points to [Statistical methods](#3-statistical-methods).
Data files, JSON, lockfiles, and generated outputs carry no header.

### In the app at runtime

- The "Ask the map" command bar turns a typed request into a map view.
  It asks **Jev** (TypeSafe AI, model `jev-1.13.0`) first, falls back to **Claude Haiku 4.5** (`claude-haiku-4-5`, Anthropic), and falls back last to an offline rule-based parser that runs in the browser (`site/src/command/localParser.ts`).
- The model returns only typed choices: layers from a fixed catalog and places from candidates the app found itself.
  It never produces data values; the app looks places up in its own gazetteer and every number on screen comes from the data files.

### Data values

No generative AI produced or altered any data value.
Every number in the data files, the figures, the map, [STORY.md](STORY.md), and the app comes from the cited datasets through the committed, rerunnable scripts: `scripts/fix_ncessch.py`, `scripts/fill_connecticut.py`, `analysis/*.py`, and `python -m analysis.schoolscape build`.

## 5. Software and licenses

The exact versions are pinned in [requirements.txt](requirements.txt) (Python) and [site/package.json](site/package.json) with [site/package-lock.json](site/package-lock.json) (JavaScript).
All dependencies are free and open source under permissive licenses.

**Python** (Python 3.12 or newer):

| Package | Version | License |
| --- | --- | --- |
| pandas | 3.0.6 | BSD-3-Clause |
| NumPy | 2.5.3 | BSD-3-Clause |
| SciPy | 1.18.1 | BSD-3-Clause |
| statsmodels | 0.15.0 | BSD-3-Clause |
| scikit-learn | 1.9.1 | BSD-3-Clause |
| Matplotlib | 3.11.2 | Matplotlib License (PSF-based, BSD-compatible) |
| GeoPandas | 1.1.4 | BSD-3-Clause |
| Shapely | 2.1.2 | BSD-3-Clause |
| pyogrio | 0.13.0 | MIT |
| pyproj | 3.8.0 | MIT |
| topojson | 1.10 | BSD-3-Clause |
| openpyxl | 3.1.5 | MIT |

**JavaScript, runtime** (licenses as recorded in `site/package-lock.json`):

| Package | Version | License | Role |
| --- | --- | --- | --- |
| react, react-dom | 19.3.0 | MIT | UI |
| maplibre-gl | 6.11.2 | BSD-3-Clause | map, choropleth, camera |
| @deck.gl/core, @deck.gl/layers, @deck.gl/mapbox | 9.4.0 | MIT | school pins |
| d3-array, d3-scale, d3-shape | 3.2.4, 4.0.2, 3.2.0 | ISC | scatter plots and histograms |
| topojson-client | 3.1.0 | ISC | TopoJSON to GeoJSON |
| zustand | 5.0.15 | MIT | app state |
| zod | 4.6.5 | MIT | schema validation |
| fuse.js | 7.5.0 | Apache-2.0 | fuzzy search |
| motion | 13.4.4 | MIT | panel transitions |
| radix-ui, cmdk | 1.6.7, 1.1.1 | MIT | UI primitives (via shadcn/ui) |
| class-variance-authority, clsx, tailwind-merge | 0.7.1, 2.1.1, 3.7.0 | Apache-2.0, MIT, MIT | class names |
| lucide-react | 1.48.0 | ISC | icons |
| @fontsource-variable/inter, @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 | fonts |
| @anthropic-ai/sdk | 0.128.0 | MIT | Claude API client in the command function |
| @typesafe-ai/sdk | 0.6.0 | MIT | Jev API client in the command function |

**JavaScript, development:** TypeScript 6.0.3 (Apache-2.0), Vite 8.3.1 and @vitejs/plugin-react 6.1.1 (MIT), Tailwind CSS 4.3.3 and tw-animate-css 1.4.0 (MIT), Vitest 5.0.2 (MIT), Playwright 1.63.0 (Apache-2.0), Testing Library 16.3.3 (MIT), jsdom 30.1.1 (MIT), ESLint 10.11.0 with typescript-eslint 8.70.1 and the React plugins (MIT), and Prettier 3.9.9 (MIT); the full list is in [site/package.json](site/package.json).
