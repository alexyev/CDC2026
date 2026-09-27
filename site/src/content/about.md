# About Schoolscape

## What this is

Schoolscape is an interactive map of community stress around every US public high school, built on the Open Data Index for Schools (ODIS) v3.
It was made for the [Carolina Data Challenge 2026](https://cdc.cs.unc.edu/), whose theme is AI for Social Good.

## How to read it

**What "stress" means.** In ODIS, stress is the level of adverse social and economic conditions in the neighborhood around a school: economic hardship, lower adult education, health risks, housing strain, and crime, measured from census, health, and crime data.
It describes the community, not the school or its students, and higher always means more adverse conditions.

**Levels.** Zoomed out, the map colors the 52 states (50 states, DC, and Puerto Rico).
From zoom 5 it colors counties, and from zoom 8 every school appears as a pin while the county fills fade away.
Each state and county shows the average of the schools inside it, and dim means low stress while bright means high stress.

**Two layers at once.** Pick a second layer and the map becomes a 3x3 bivariate choropleth.
The primary layer (A) runs up the magenta axis and the secondary layer (B) runs across the teal axis, so the brightest cells are high on both.

<!-- bivariate-legend -->

**Two correlation numbers.** The insight panel measures how your two layers move together for what is on screen, twice: across the areas drawn (states or counties) and across the schools inside them.
Each number is a Spearman rank correlation (ρ) with a 95% interval and the number of units it used.

**The ecological fallacy.** Correlations across areas and across schools answer different questions.
An area-level number says nothing about any individual school, and the two often differ: Crime and Education correlate at ρ = 0.17 across states, 0.40 across counties, and 0.24 across schools.

**County-level measures.** Eight measures exist only per county: Crime, Violent crime rate, Incarceration rate, Infant mortality rate, Low birth weight, Single-parent households, Unemployment, and Gini index.
Every school in a county shares the same value, so these layers keep their county fills at school zoom and carry a `county` badge.
The tract-derived layers (the Composite Score and the Economic, Education, Health, and Housing scores) are the ones that vary from one neighborhood to the next.

**Favorites.** Star a school from its pin, its profile, or search.
Starred schools stay visible at every zoom, persist in this browser, travel in shared links, and can be compared side by side in the favorites panel.

**The command bar.** Type a request such as "compare education and health in LA County and California" and a language model turns it into layers, places, and a camera move: Jev, TypeSafe's System One model, first, and Claude when Jev is unavailable.
The model only picks layers from a fixed list and places from candidates the app found; the app looks the places up itself and never shows numbers the model wrote.
When the service is unavailable, a local parser handles the request and the result is marked "offline parse".

## Data

**Open Data Index for Schools (ODIS) v3.**
Hawken, Angela; Minar, Nicholas; Choudhary, Raj; Kulick, Jonathan, 2026, "Open Data Index for Schools (ODIS)", [https://doi.org/10.7281/T170WN53](https://doi.org/10.7281/T170WN53), Johns Hopkins Research Data Repository, V1.
Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Schoolscape uses a derived version of this data, also under CC BY 4.0, with the school IDs corrected and Connecticut's gaps filled, as described below.

**Corrected school IDs.**
The ODIS v3 file stores 19,158 of its 23,599 NCES school IDs (NCESSCH) rounded to six significant digits.
They were recovered from the NCES Common Core of Data public school directory for 2022-23 by matching the surviving digits, school name, and ZIP code: 19,154 IDs were restored and 4 rows that are ambiguous duplicates were dropped, which leaves 23,595 schools.
Details are in [data/README.md, "Corrected NCESSCH IDs"](https://github.com/alexyev/CDC2026/blob/main/data/README.md#corrected-ncessch-ids).

**Connecticut fill sources.**

- U.S. Census Bureau, American Community Survey 2019-2023 5-year estimates, and the 2020 ZCTA to census tract relationship file (public domain).
- University of Wisconsin Population Health Institute. County Health Rankings & Roadmaps 2025. www.countyhealthrankings.org.
- Connecticut Department of Public Health, Vital Statistics Registration Report 2024. Credit: Connecticut Department of Public Health.
- CT Data Collaborative, 2022 tract crosswalk, used as a lookup only and not redistributed. Credit: CT Data Collaborative.
- City Health Dashboard (Department of Population Health, NYU Langone Health), lead index method and tract list only; no City Health Dashboard values are used.

**School locations.** National Center for Education Statistics, EDGE Public School Geocodes 2022-23 (public domain).
Every one of the 23,595 schools matched a geocode.

**Boundaries.** U.S. Census Bureau, Cartographic Boundary Files 2023, states and counties at 1:5,000,000 (public domain).

**Basemap.** [OpenFreeMap](https://openfreemap.org/) © [OpenMapTiles](https://openmaptiles.org/), data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL).

## Method

- **Aggregation.** A state or county value is the unweighted mean of the non-missing values of the schools inside it, shown with n, the number of schools that have a value.
  Areas with fewer than 3 schools are marked "few schools".
- **Color classes.** Five classes by national quintiles at each level (states, counties, schools), or terciles for the 3x3 bivariate grid.
  The breaks are fixed nationally and never rescaled to the view, so a color means the same thing everywhere.
- **Correlation.** Spearman rank correlation with average ranks for ties; Pearson r in the details.
  The 95% interval is a seeded percentile bootstrap (1,000 resamples, seed 42) for up to 5,000 units, and the Bonett-Wright approximation above that.
  Fewer than 10 units shows "too few" instead of a number.
- **Missing values.** Pairwise deletion: a unit counts only when both layers have a value, and the panel shows how many did.
  Missing data is drawn as a hatch, never as a color on the scale.
- **No imputation.** Schoolscape never estimates a missing value; the only filled values are Connecticut's, which come from the public sources listed above.

All scores and indicators use the ODIS scaling, where higher means more stress.
Race and ethnicity shares are included by ODIS for context only and do not enter any score.

## Known gaps

- **Crime** is missing for all of Connecticut and Puerto Rico and for most schools in the rural Plains and a few other states (South Dakota, Nebraska, Iowa, Montana, Kansas, Vermont, and Wyoming), about 14% of schools overall.
- **Lead exposure risk** and **Park access** are missing for about half of schools in almost every state outside Connecticut.

### Connecticut

ODIS v3 left most Connecticut values empty because of two join problems: Connecticut's census tracts now carry its 2022 planning-region codes, and the County Health Rankings release ODIS used has only the old counties.
Schoolscape uses a file that fills those values from current Census, County Health Rankings, and Connecticut Department of Public Health data and recomputes Connecticut's domain scores.
Crime, Violent crime rate, and Incarceration rate stay missing because ODIS's crime sources have no per-area Connecticut data.
Lead exposure is an approximation recomputed from ACS data, and park access is a planning-region proxy.
See [data/README.md, "Connecticut fill"](https://github.com/alexyev/CDC2026/blob/main/data/README.md#connecticut-fill).

## Built with

- **App:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, Motion, and Zustand.
- **Map:** MapLibre GL JS for the basemap and choropleth, deck.gl for the school pins, and topojson-client.
- **Analysis:** d3 for the charts, a Web Worker for the statistics, and fuse.js for search.
- **Data pipeline:** Python with pandas, NumPy, SciPy, and GeoPandas.
- **Command bar:** Jev (TypeSafe System One), with Claude Haiku 4.5 as the fallback, through a Vercel Function with zod validation.
- **Type:** Inter and JetBrains Mono.
- **Hosting:** Vercel.

The specification and the code were produced by AI agents (Claude) directed by Alexander Yevchenko for the Carolina Data Challenge 2026.
Every data source, statistical method, and AI tool is cited in [CITATIONS.md](https://github.com/alexyev/CDC2026/blob/main/CITATIONS.md).
