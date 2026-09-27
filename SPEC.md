# Schoolscape: build specification

Status: v1 build spec, written 2026-09-26 from the captain's interview answers; updated the same day for the Connecticut-filled input (section 8.1).
Commit this file to the CDC2026 repository as `SPEC.md`.
It is written for parallel build workers: every section is a contract, and section 17 breaks the work into independent tasks with acceptance criteria.

Schoolscape is an interactive map of community stress around every US public high school.
Each measure from the Open Data Index for Schools (ODIS) v3 is a layer over a dark map of the United States.
Zooming out generalizes to states, zooming in breaks down to counties and then to individual schools as pins.
Selecting two layers shows how they are correlated, honestly, at the level you are looking at, and lets you compare regions.
A natural-language command bar turns "compare crime and education in LA County and California" into a view.

## Scout summary

What was done: the repo READMEs and the ODIS README were read, the fixed CSV was profiled, the design interview in `questions.md` was run and the captain's answers folded in, every external claim (tile service, boundaries, geocodes, package versions and licenses, Vercel plan terms, Claude pricing) was verified against current sources, the inputs were downloaded and hash-pinned, real payload sizes were measured, and reference statistics were computed for the test fixtures.
Evidence for every number is in Appendix D; sources are in Appendix E.

What was found:

- Eight ODIS columns, including the whole Crime domain, are county-level constants, so "crime by neighborhood" cannot come from ODIS; the tract-derived layers (Education, Housing, Economic, Composite) carry the neighborhood story, and the spec labels the difference honestly.
- All 23,595 schools get coordinates from the NCES geocode file with a 100% match, and their county codes agree with NCES for every row.
- The entire data set gzips to about 2.3 MB, so plain static files on Vercel suffice and no tile server is needed; OpenFreeMap provides a keyless, unlimited dark basemap.
- The Carolina Data Challenge link is due Sunday 2026-09-27 at 11:00 local time, so the work breakdown is sized for wide parallelism after one thin foundation task.

What is recommended: build exactly this spec in three waves (T0, then eighteen parallel tasks, then integration and QA).
No item in this spec waits on a captain decision; Connecticut is filled from current public sources (section 2), and only its crime columns stay missing.

## 0. How to use this document

- Sections 1 to 16 define the product, data, design, and stack.
- Section 17 is the work breakdown.
  Task T0 lays the foundation and every other task starts after it and runs in parallel.
- Appendix A holds the TypeScript contracts every task imports; Appendix B holds the data file schemas; Appendix C holds test fixtures with expected values; Appendix D is the evidence behind the numbers in this document; Appendix E lists sources.
- The pipeline input is `data/index_scores_v3_2026_ct_filled.csv`, the fixed CSV with Connecticut's missing values filled (`data/README.md`, "Connecticut fill"); the former `[CT-PLACEHOLDER]` items are resolved in place.
- "Must" and "never" are contract words; "should" is a strong default a worker may deviate from with a one-line reason in the PR.

Decisions in this spec come from the design interview (`questions.md`) and the captain's answers, summarized here so nobody has to reread it:

| Topic | Decision |
| --- | --- |
| Deadline | Full v1, link submitted 11:00 local time Sunday 2026-09-27; built by many parallel agents in roughly 2 to 3 hours after a thin foundation |
| Audience and story | General explorer: the map is the product, the correlation panel is the insight engine, narrated stories give a way in |
| County-level crime | Honest flattening: county-sourced layers keep county fills at school zoom, pins inherit the county value with a badge |
| AI feature | Natural-language command bar that turns text into validated app state via a Vercel function calling Claude |
| Name | Schoolscape |
| Layers | Three tiers: 7 primary scores, 20 indicators grouped by domain, 8 race and ethnicity context layers (selectable, labeled "not in the index") |
| Naming | Keep ODIS column names, add plain-English subtitles, one color direction: dim = low stress, bright = high stress |
| Zoom | States below z5, counties z5 to z8, pins from z8; free pan and zoom like Google Maps, click-to-drill is a shortcut |
| Aggregation | Unweighted mean of school values with n shown |
| Correlation | Spearman headline with 95% interval and n; Pearson in details; two numbers (areas on screen, schools inside them); n under 10 shows "too few" |
| Compare | Pin up to two areas at the current level; viewport vs national always shown |
| Pins | Circles on the same scale as polygons; county fills fade out from z8 to z9.5; favorites (starred schools) stay visible at every zoom and can be compared side by side |
| Profile | Full card in a side drawer with its own URL |
| Look | Dark only; glass panels; one accent; purple-to-teal bivariate scheme; Inter with tabular numerals |
| Mobile | Desktop only; no mobile design in v1 |
| Missing data | Distinct no-data style, never a color on the scale; thin areas marked; pairwise deletion with counts shown |
| Stack | React 19, TypeScript, Vite, MapLibre GL JS, deck.gl for pins, Tailwind 4, shadcn/ui, Motion, d3, Zustand; Python pipeline; site lives in this repo under `site/` |
| Performance | First map paint under 2 s; HTTP caching for static data and client-side caching; accessibility best-effort |

## 1. Product overview

### 1.1 One paragraph

Schoolscape shows the ODIS community-stress measures for 23,595 US public high schools as map layers.
At the national view it colors states, at the state view it colors counties, and from zoom 8 it shows every school as a pin, with county fills fading away.
Any two layers can be shown together as a bivariate choropleth, and an insight panel computes the correlation between them for what is on screen, or for the selected state or county, at two levels at once: across the areas drawn and across the schools inside them.
Users can pin two areas to compare, star schools to keep them visible at every zoom and compare them side by side, and type a request into a command bar that Claude turns into a validated view.
Everything is static except the command bar's serverless function.

### 1.2 Audience and headline story

Primary audience: Carolina Data Challenge judges and visitors to the captain's personal site, on a laptop, with no prior knowledge of ODIS.
Headline story: community stress is uneven, its five domains do not move together everywhere, and the correlation you measure depends on the level you measure it at.
Six narrated stories (section 3.8) walk through that story and what it means region by region, following [STORY.md](STORY.md).

### 1.3 User stories

1. As a visitor, I open the site and immediately see the United States colored by Composite Score, with a legend, so I understand the map without reading instructions.
2. As a visitor, I zoom in anywhere with the scroll wheel and see states become counties and counties become school pins, without clicking anything.
3. As a visitor, I click a state to fly into it, then a county to fly into that, and a breadcrumb takes me back up.
4. As a visitor, I pick a second layer and the map becomes a 3x3 bivariate choropleth with a legend I can read.
5. As a visitor, I see the correlation between my two layers for what is on screen, with an interval and the number of units, and a one-line note on why the area-level and school-level numbers differ.
6. As a visitor, I pin two areas (two states, or two counties) and compare their correlations and distributions side by side.
7. As a visitor, I hover a pin to see the school's name and values, and click it to open a full profile with every indicator and how it compares to its county, state, and the nation.
8. As a visitor, I star schools; their pins stay visible at every zoom, including the national view, and a favorites panel compares them side by side.
9. As a visitor, I type "compare crime and education in Los Angeles County and California" and the map selects the layers, flies to the places, and opens compare mode.
10. As a visitor, I copy the URL and someone else sees exactly my view, including layers, place, compare pins, and starred schools.
11. As a visitor, I can tell where data is missing and where an area has only one or two schools, and no color ever pretends otherwise.
12. As a visitor, I can read where the data comes from, how scores are built, and what "county-level measure" means.

### 1.4 Non-goals for v1

- Mobile or narrow layouts (desktop only; a minimum width of 1100 px is assumed).
- Light theme.
- School district or city polygons as a zoom level.
- Hexbin or heatmap layers.
- Any data source beyond ODIS v3, Census boundaries, and NCES geocodes (in particular no neighborhood-level crime source).
- Accounts, server-side state, analytics, or cookies.
- Free-form lasso selection.
- Re-scaling color classes to the current viewport (fixed national breaks only).

## 2. Data facts that constrain the design

These come from the pipeline input `data/index_scores_v3_2026_ct_filled.csv` (23,595 rows, 59 columns: the 58 columns of `data/index_scores_v3_2026_fixed.csv` plus the audit column `ct_fill_sources`) and were verified for this spec (Appendix D).
The two files differ only in Connecticut's 208 rows.

- Rows are schools in 50 states, DC, and Puerto Rico, in 3,167 counties.
  The median county has 4 schools; 586 counties have exactly 1 and 1,129 have 2 or fewer; 523 have 10 or more; Los Angeles County has 509.
- Every school has a coordinate: all 23,595 `NCESSCH` values match the NCES EDGE 2022-23 public school geocode file, and the county FIPS code in ODIS agrees with the NCES county for every row.
- Eight columns are county-level: `Crime`, `Violent crime rate`, `Incarceration rate`, `Infant mortality rate`, `Low birth weight`, `Single-parent households`, `Unemployment`, and `Gini index` take exactly one value per county.
  All 509 Los Angeles County schools have `Crime` = 28.
  Tract-derived layers vary strongly inside a county: in Los Angeles County the school-level standard deviation is 22.3 for `Education`, 6.5 for `Housing`, 4.8 for `Economic`, 0.0 for `Crime`.
- Every score and indicator is already an ODIS 0-100 stress scaling, not a raw unit.
  `Unemployment` has a national median of 15 and a maximum of 100, so it is not a labor-force percentage.
  Higher means more community stress for every score and indicator.
  The eight race and ethnicity columns are population shares in percent and carry no stress direction.
- The six `... Median` columns are single national constants (Economic 27, Education 22, Health 29, Housing 20, Crime 33, Composite 28) and are not layers.
  The six `... Percentile Rank` columns are national percentile ranks of the scores (0 to 100) and are exposed as a display toggle, not as layers.
- Missing values: `Crime` and `Crime Percentile Rank` are empty for 13.6% of schools (3,219), all of Connecticut and Puerto Rico and most of SD, NE, IA, MT, KS, VT, WY.
  `Lead exposure risk` and `Park access` are missing for about 51% of schools in almost every state except Connecticut.
  `Violent crime rate` (24.9%), `Infant mortality rate` (23.8%), and `Incarceration rate` (23.0%) are next.
  Everything else is missing for at most 1.3% of rows.
  Every row has `Composite Score`, `Economic`, `Health`, `Gini index`, and `Unemployment`.
- Connecticut: 208 rows, filled by `scripts/fill_connecticut.py` from current Census, County Health Rankings, and Connecticut Department of Public Health data (`data/README.md`, "Connecticut fill").
  Every Connecticut row now has every column except `Crime`, `Crime Percentile Rank`, `Violent crime rate`, and `Incarceration rate`, which stay missing because ODIS's crime sources have no per-area Connecticut data.
  `Lead exposure risk` is an approximation (the City Health Dashboard index recomputed from ACS 2019-2023) and `Park access` is a proxy (County Health Rankings 2025 Access to Parks, one value per planning region); profiles and the About page say so.
  Connecticut's domain scores and composite are recomputed from the filled indicators, and its county codes are the 2022 planning regions (`09110` to `09190`), which the 2023 Census boundaries also use.
- Correlation depends on level.
  Crime vs Education, Spearman: 0.17 across state means (n = 50), 0.40 across county means (n = 2,211), 0.24 across schools (n = 20,201).
  Pearson: 0.12, 0.26, 0.07.
- Measured payload sizes (gzip): all schools with every field 1.37 MB; states TopoJSON 38 KB; counties TopoJSON 309 KB at the 1:5m resolution; county aggregates 166 KB; gazetteer about 310 KB.
  The whole data set is under 3 MB gzipped, so plain static files are used and there is no tile server.

## 3. Information architecture and interaction

### 3.1 One page, one URL

Schoolscape is a single page.
There is no router library.
All view state lives in the URL query string (section 3.10), so every view is a permalink.
The About and Data page is a modal on the same URL with `about=1`.

### 3.2 Screen layout (desktop, 1280 px and wider)

```
+--------------------------------------------------------------------------------------+
| [Schoolscape]  [ Ask the map: compare crime and education in LA County and CA  ⌘K ]  |
|                                                          [Search /] [★ Favorites] [?]|
|                                                                                      |
| +-- Layer dock (300) --+                               +-- Insight panel (380) ----+ |
| | Composite  Economic  |                               | Composite × Education     | |
| | Education  Health    |          MAP (full bleed)     | Areas on screen  ρ 0.55   | |
| | Housing  Crime  Gini |                               |   95% CI 0.32 to 0.71     | |
| | ▸ Indicators (20)    |                               |   n = 52 states           | |
| | ▸ Context (8)        |                               | Schools inside  ρ 0.56    | |
| | [score | percentile] |                               |   n = 23,310              | |
| | Stories: 1 2 3 4 5 6  |                               | [scatter]  [details]      | |
| +----------------------+                               | [Compare] A: -   B: -     | |
|                                                        +---------------------------+ |
| Nation › California › Los Angeles County   [AK] [HI] [PR]        +-- Legend --+     |
|                                                                  | 3x3 grid   |     |
|                                                                  | No data ▨  |     |
|                                                                  +------------+     |
+--------------------------------------------------------------------------------------+
```

- The map fills the viewport.
  Panels float over it as glass surfaces (section 9.5) with 16 px margins.
- Top bar (height 56): the Schoolscape wordmark at left on a rounded 48 px tile filled with the basemap land color (`#0b0d12`) and a hairline `--border` (a button that reopens the landing page, section 3.15, with a pointer cursor, a stronger border and a faint lift of the tile on hover, and the focus ring on keyboard focus), the command bar centered (560 px wide), search, favorites, and about at right.
- Layer dock at left, 300 px wide, top-aligned under the top bar.
- Insight panel at right, 380 px wide.
- Breadcrumb and quick-jump chips at bottom left; legend at bottom right.
- The profile drawer (420 px) slides in from the right over the insight panel.
- The favorites panel opens as a drawer from the right, 560 px wide, and the compare table inside it can widen to 720 px.
- Map padding: `fitBounds` and `flyTo` always use `{ top: 72, left: 332, right: 412, bottom: 96 }` so targets land in the visible gap between panels; while the story card is open (section 3.8), fits raise the bottom to clear it.
- The layer dock, command bar, search box, insight panel, and legend each have a minimize button (a minus in the panel's header) that folds the panel into a compact glass chip in the same corner; clicking the chip restores it.
  The layer dock's chip names the active layers with their A/B marks, and the legend's chip keeps a thumbnail of the ramp or the 3x3 grid; the search chip is a 48 px icon button like its neighbors.
  Favorites and About are never minimizable.
- A minimized panel stays mounted but hidden, so its typed text, open sections, and shortcuts survive; while the legend is minimized the insight panel may grow down to the legend chip.
- Minimized panels are per-viewer layout, stored in localStorage (`schoolscape.panels.v1`) and never in the URL.

### 3.3 Levels

| Level | Zoom | Units drawn | Colored by |
| --- | --- | --- | --- |
| `nation` | z < 5 | 52 states (50 + DC + PR) | state aggregate |
| `state` | 5 ≤ z < 8 | counties | county aggregate |
| `local` | z ≥ 8 | school pins; county fills fade out from z8 (opacity 0.85) to z9.5 (opacity 0) | school values |

- Levels are driven by zoom only.
  Free pan and zoom with the mouse wheel, trackpad, drag, and double-click are always on, with no snapping and no forced camera moves.
- State fills fade out between z4.5 and z5.5 while county fills fade in over the same range, so the transition is a crossfade, not a cut.
- Starred schools (favorites) are drawn at every level, including `nation`.
- Initial camera: `fitBounds([[-187.6, 17.8], [-65.1, 71.5]])` with the standard padding, so the contiguous US, Alaska with the whole Aleutian chain, Hawaii, and Puerto Rico are all in view, centered between the panels; it lands near z2.0 on a 1440 x 900 window and z2.8 on 1920 x 1080.
  The west edge is Attu Island (172.46° E) written unwrapped as 172.46 - 360 so the fit runs west across the antimeridian.
  The `Nation` breadcrumb, Escape at the top level, and the command bar's reset return to the same view.
  A view that sets the default camera (`v=3.6/38.5/-96.5`, or no `v`), such as a national story or the back button, flies to that same fitted view rather than to the literal camera.
- The world wraps horizontally: MapLibre renders world copies and deck.gl repeats its layers on them, so panning past either edge comes back in from the other side, and fills, outlines, pins, hover, tooltips, and clicks work on every copy.
  There are no `maxBounds`.
- The minimum zoom follows the map's width so no place is ever drawn twice: the viewport never spans more than 300.4° of longitude, which is 360° less Alaska with the Aleutians (57.6°, the widest state or county, 172.46° E to 130.0° W) and a 2° margin.
  With MapLibre's 512 px world, that floor is `log2(width × 360 / (512 × 300.4))`, never below 0, and it is recomputed on every resize: z1.58 at 1280 px, z1.75 at 1440 px, and z2.17 at 1920 px.
  The national view still fits above it at 1280 x 800 (z1.62), so the whole Aleutian chain stays in frame.

### 3.4 Click-to-drill and breadcrumb

- Clicking a state at `nation` level flies to that state's bbox (1,200 ms) with `zoom = max(fitZoom, 5.1)`, so it lands in `state` level even where a large state fits just below z5 on a small window, and selects it.
- Clicking a county at `state` level flies to the county's bbox with `zoom = max(fitZoom, 8.2)` so the map lands in `local` level even for large counties.
- Clicking a pin at `local` level selects the school and opens its profile drawer.
- With the profile drawer open, a click on the map away from the pins closes the drawer and does nothing else; its X and Escape close it too.
- The breadcrumb shows `Nation › {State} › {County}` for the selected chain; clicking a crumb flies to it.
  Escape goes up one level; Escape with a drawer open closes the drawer first.
- Selection outline: white 2 px stroke with an accent glow (section 9.3).
- Quick-jump chips `AK`, `HI`, `PR` fly to those bboxes because they sit far from the contiguous US and are small in the national view; no insets.

### 3.5 Hover and tooltips

Hovering a state, a county, or a school pin shows an overview card: a compact profile of that unit built from data the app already holds (`states.json`, `counties.json`, `schools/all.json`), so hovering never makes a network request.

- Hovering a polygon raises a 1.5 px white outline at 0.7 opacity and shows its card within 120 ms; the card only rebuilds when the hovered unit or the view changes, and cursor moves only re-place it.
- Every card has the same shape:
  - Header: the unit's name, then its parent and school count ("California · 509 schools"; "United States · 1,918 schools" for a state), or for a school its district, city, and state.
  - Rows: the active layers first, marked `A` and `B`, then the composite and the five domain scores (Economic, Education, Health, Housing, Crime) that are not active, split from the active rows by a hairline.
    Each row shows the label, the county-level badge where relevant, a small bar, the value, and a percentile.
    Areas show the mean to one decimal and the percentile of that mean among all US peers ("vs. all states" for states, "vs. US counties" for counties); schools show the score as the CSV has it and its national percentile ("vs. US schools").
    The bar fills to the percentile, magenta for layer A, teal for layer B, and grey for the rest; a layer without a percentile (indicators and context on schools) shows no bar and "–".
    The display toggle (section 3.6) decides which column is emphasized: the value in score display, the percentile in percentile display.
  - Missing values read "No data" with the reason from section 7 underneath when it is known ("ODIS has no crime inputs for this state"; "Not available for about half of schools nationally"); an area row with `1 ≤ n < 3` for that layer says "Few schools (n = 2)".
  - Notes: "No ODIS high schools in this county" for an empty county, "Few schools (n = 2)" when the whole area is thin, the Connecticut line from section 7 for Connecticut areas and schools, and for states "County-level measures are school-weighted means of county values" when a county-level row has a value.
    Connecticut school rows for `lead_risk` and `park_access` carry the "approx." and "proxy" badges.
  - Hint: "Click to zoom into {State}", "Click to zoom in to its schools", "Click to pin for compare" while compare is armed, or "Click pin for full profile".
- Placement: to the right of and below the cursor or pin by 14 px, flipped left or above when the card would leave the map, and kept 8 px inside the map; the card always stays to one side of the anchor, so it never covers the cursor.
  Cards float above the panels and drawers and below dialogs.
- A starred pin drawn over the polygons (section 3.12) owns the hover and the click: the area under it shows no card and does not drill.
- A pin whose profile drawer is open shows no card: the drawer already holds everything the card would, and the card would sit over it.
- Cards never contain interactive controls except the star button on pin cards; clicking still drills (areas) or opens the profile drawer (pins).
- Area cards hide while the camera moves, including the flight of a click-to-drill, and come back on the next pointer move.

### 3.6 Layer dock

- Primary tier: seven chips in a 2-column grid (`Composite Score`, `Economic`, `Education`, `Health`, `Housing`, `Crime`, `Gini index`).
- Indicators: an expandable list grouped by domain with the domain heading and a short subtitle per indicator.
- Context: an expandable list of the eight race and ethnicity shares, headed "Context (not in the index)" with a permanent one-line note.
- Selection model: the first click sets the primary layer (A), a second click on another layer sets the secondary layer (B) and turns on bivariate mode; clicking B again removes it; clicking A while B exists promotes B to A.
  A chip shows an `A` or `B` mark when active.
  At most two layers.
- County-level badge: chips for the eight county-level columns carry a small `county` badge with a tooltip: "This measure is only available per county. Every school in a county shares the same value."
- Display toggle `score | national percentile` applies to the six score layers with percentile columns; it changes pin colors, tooltips, and profiles; area fills always use score means, and area hover cards emphasize the percentile of the mean among peer areas instead (section 3.5).
- Stories: the six narrated stories as a numbered list (section 3.8).

### 3.7 Insight panel

Scope: the panel describes either what is on screen or the selected area.
- With nothing selected, or a school, city, or district selected, it describes what is on screen (section 6.1), and a dashed `On screen` chip sits beside the `Insight` eyebrow.
- With a state or county selected (by a map click, search, the command bar, the breadcrumb, or the URL `sel`), it describes that area wherever the camera is, and the chip reads `Selected state` or `Selected county` with an X that clears the selection.
  Escape and the `Nation` crumb clear it too (a county's Escape first goes up to its state, which then becomes the scope).
- A state is described by its counties with schools and all of its schools (both rows, like the `state` level); a county by its schools alone (like the `local` level, since one county cannot be correlated across counties).
- Scoped headings name the area: one layer reads "{Layer A} in {Texas}" over "229 counties · 1,918 schools", with "By county" and "By school" above the two histograms, or "{Layer A} in {Cook County, IL}" over "265 schools"; two layers keep "{A} × {B}" over "229 counties and 1,918 schools in Texas" or "265 schools in Cook County, IL".
  Counties are named with their state's postal code, and long names wrap rather than truncate.
- Scoped row labels read "Counties in this state", "Schools inside them", and "Schools in this county"; too-few rows end "Clear the selection or pick a larger area."
- In a county, a county-level layer is one value for every school, so the note reads "{Layer} is only available per county, so every school here shares one value." (or names both layers when both are county-level).
- The national median and the "Nationwide" baseline stay as they are; compare mode keeps its own pinned-area logic, and its one-pin "Viewport" column stays the viewport.
- The scoped numbers depend only on the selection and the layers: panning and zooming recompute nothing.

States, in order of precedence:

1. `loading`: skeleton lines while data or the worker result is pending.
2. `one-layer`: heading "{Layer A} across {N} {states|counties} on screen"; a histogram of the on-screen areas with the national median marked; below it "and {M} schools inside them" with the schools histogram.
   At `local` level the areas part is omitted and only the schools histogram is shown.
3. `two-layers`: the correlation block (section 7.3), the scatter (section 7.4), a details disclosure, and the compare controls.
4. `too-few`: "Too few {areas|schools} to correlate (n = {n}). Zoom out or pick a larger area." shown for whichever half has n < 10; the other half still renders.
5. `compare`: when one or two areas are pinned, the panel shows one column per pinned area plus the national baseline (section 3.9).

On screen, the panel recomputes on `moveend` with a 150 ms debounce and on any layer change; with a scope, only on a selection or layer change.

### 3.8 Stories

The stories are six narrated views that walk through the data story in [STORY.md](STORY.md), in its order: the map, what the data says nationally, how it differs by region, one formula against graduation rates, and where a lawmaker would look first.
Each story is a full view state plus its narration (Appendix B, `presets.json`), written by `analysis/schoolscape/presets.py`.
Every number in a narration is read from the committed analysis tables in `visualizations/` (sections 03 to 05 of `visualizations/README.md`) or from the pipeline input, so `python -m analysis.schoolscape check` fails if a rerun of the analyses moves one.

| id | Chapter | Label | View |
| --- | --- | --- | --- |
| `where-stress-concentrates` | The map | Where stress concentrates | Composite Score, nation |
| `broadband-attainment` | Nationally | Digital divide, education divide | Access to broadband internet × 2-year college or higher, nation |
| `education-health-by-region` | Region by region | Same pair, different regions | Education × Health, compare California (06) with Florida (12) |
| `west-housing` | Region by region | Housing runs backwards in the West | Housing affordability × Economic, California selected so the insight panel describes the whole state, the coast from Marin (06041) to San Diego (06073) framed with counties drawn |
| `one-formula` | Graduation rates | One formula does not fit everywhere | Composite Score × Housing vacancy rate, Oneida County, Wisconsin (55085) selected so the insight panel shows its five schools at the top of the vacancy scale (too few to correlate, by design), Wisconsin framed |
| `where-to-look` | So what | Where a lawmaker would look first | Health, nation |

- The layer dock lists the stories in order under "Stories, in order", numbered; clicking one opens its view, and it reads as active while the view still shows its layers.
- Story card: while a story's view is live (the store's `preset` names it) and the map guide is closed, a card at the bottom of the map area shows "Story n of 6 · {chapter}", the label, the narration (2 to 4 sentences with the key numbers), and a one-line caveat, with progress dots that open any story, Back, and Next ("Explore on your own" on the last story).
  Its left edge is the 332 px map padding, or 12 px right of the breadcrumb row when that row is wider; it is 480 px wide, 16 px above the bottom.
- The story ends, and the card goes, when the viewer changes the layers or anything else but the camera (the preset tag is dropped, section 3.10), or closes the card or presses "Explore on your own"; the view stays as it is.
- While the card is open, camera fits keep clear of it: the map padding's bottom becomes the card's height plus its margins (section 3.2), so a national story frames the nation above the card; place stories are fitted in the 1440 x 900 design viewport with a 300 px bottom padding.
- Stories use no context layers (section 4.3).

### 3.9 Compare mode (areas)

- The `Compare` toggle in the insight panel arms compare mode; a hint reads "Click up to two {states|counties} to pin them."
- Pinned areas get a persistent outline: A in amber, B in coral (section 9.3), with a chip in the panel showing the name and a remove button.
- Panel content in compare state: for each pinned area, the correlation block for the schools inside it (ρ, interval, n); the overlaid scatter with A and B clouds in their colors; per-layer distribution strips for A, B, and the nation.
- With one pin, the second column is "Viewport" (everything on screen), so A vs viewport is always available.
- Compare pins must be at the same level; pinning at a different level replaces the pins with a toast "Compare pins reset to {level}".
- Turning compare off clears pins.
- The compare heading carries a `Done` button: it clears both pins, turns compare off, and fits the map to the union of the pinned areas (standard padding, kept at the level where those areas are drawn), so the user sees the region they compared.

### 3.10 URL state

All parameters are optional; absent means default.

| Param | Example | Meaning |
| --- | --- | --- |
| `v` | `v=3.6/38.5/-96.5` | zoom/lat/lon, 2 decimals |
| `l` | `l=composite,education` | layers A[,B] (catalog ids) |
| `d` | `d=pct` | display `score` (default) or `pct` |
| `sel` | `sel=county:06037` | selected area or school (`state:06`, `county:06037`, `school:060000000001`) |
| `cmp` | `cmp=county:06037,county:06075` | compare pins |
| `s` | `s=060000000001` | profile drawer open for this school |
| `fav` | `fav=0600...,0600...` | starred schools carried in the link (max 20) |
| `fp` | `fp=1` | favorites panel open |
| `p` | `p=broadband-attainment` | story that produced this view; opens its card |
| `about` | `about=1` | About modal open |

- Camera changes use `history.replaceState` (debounced 300 ms).
  Opening or closing a drawer, changing layers, or changing compare pins uses `pushState` so the back button undoes them.
- The store is the source of truth; a `urlCodec` module encodes and decodes it and is unit-tested both ways.

### 3.11 Search

- The search box (`/` focuses it) uses fuzzy matching over the gazetteer (states, counties, cities, districts) and school names.
- Results are grouped by kind, at most 8 shown, keyboard navigable.
- Choosing a state or county selects it and flies to its bbox at the level below it, as a click does (section 3.4); a city or district flies to the bbox of its schools and highlights those pins; a school opens the profile and centers the map at z12.

### 3.12 Favorites

- A star button appears in pin tooltips, in the profile drawer header, and in search results for schools.
- Starred schools are stored in `localStorage` under `schoolscape.favorites.v1` as an array of `NCESSCH` strings, and are appended to the URL as `fav` (up to 20) whenever the user copies the link with the share button; a URL with `fav` merges those ids into local favorites on load.
- Starred pins render in a dedicated deck.gl layer at every zoom: 7 px radius, amber fill, 1.5 px white stroke with a 1 px dark halo, above ordinary pins, never hidden by the zoom rule.
- The favorites panel lists starred schools (name, city, state, composite) with remove buttons and a `Compare starred` view: a table with one column per school (up to 6, the first 6 by star order with a hint to remove some) and one row per measure, grouped as scores, indicators by domain, and context.
  Each cell shows the value and, for scores, the national percentile as a small chip; the highest-stress cell in each row is tinted; county-level rows carry the badge; missing values show the no-data glyph.
- A `Show only starred` toggle dims unstarred pins to 25% opacity.
- Clicking a school in the panel centers the map on it without changing zoom if it is already in `local` level, otherwise flies to z12.

### 3.13 Command bar

- Placeholder: "Ask the map: compare crime and education in LA County and California".
  `⌘K` or `Ctrl+K` focuses it; Enter submits; Escape clears.
- States: `idle`, `parsing` (spinner in the bar, 8 s cap), `applied` (a brief chip summarizes what changed, for example "Crime × Education · Los Angeles County vs California · compare"), `needs-choice` (place ambiguity shows up to 3 candidate chips inline, for example "Springfield, IL / MA / MO"), `needs-layer` (Jev was unsure which measure was meant and shows up to 3 layer chips, for example "Which measure? Poverty / Composite Score / Single-parent households"), `degraded` (the function was unavailable; the local parser ran and the chip says "offline parse"), `no-match` ("I couldn't find a layer or place in that. Try: crime in Texas").
- Chips from the function end with a quiet tag naming the engine that read the request: "powered by Jev" or "powered by Claude".
- What it can change: layers A and B, the selected place (fly to it), compare pins (two places at the same level), the profile drawer (a school), and the display toggle.
  It never types numbers into the app and never creates data.
- Full design in section 14.

### 3.14 Keyboard

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | focus command bar, restoring it if minimized |
| `/` | focus search, restoring it if minimized |
| `Esc` | close drawer, else go up one level |
| `1` to `7` | set primary layer to the nth primary chip |
| `Shift+1` to `Shift+7` | set secondary layer |
| `c` | toggle compare mode |
| `f` | toggle favorites panel |
| `+` / `-` | zoom in/out |
| `?` | open About |

Keys are ignored while an input has focus.

### 3.15 Empty, error, and first-run states

- Primer (no URL params and no `schoolscape.primerSeen.v1` localStorage flag): the page opens on a full-viewport landing that explains how to read the map, and a URL with any parameter (a shared view) skips it.
  It is its own page, not a card over the map: the Schoolscape brand where the top bar's brand sits, then one calm left-aligned column with lots of space around it (the headline, the definition of stress as plain body text, one quiet line on percentiles, and the three actions), on a dark brand-lit backdrop through which the map shows blurred and dimmed.
  Nothing else competes for attention: the guide to reading the map waits behind a quiet "How to read the map" disclosure below the actions, and the title, definition, and actions fit without scrolling at 1280 x 800.
  The map is already loaded underneath, so leaving the landing is a same-page transition of about 800 ms with no reload: the landing's content lifts and fades out while its backdrop fades, the map comes into focus from a slight zoom, and the panels slide in from their edges to their resting places, moving only transform, filter, and opacity so nothing reflows.
  Under `prefers-reduced-motion` it is a plain 300 ms crossfade with nothing moving.
  It opens with what "stress" means in ODIS (adverse social and economic conditions in the neighborhood around a school, from census, health, and crime data; not the school, its students, or anyone's psychological stress), then one line: higher means more stress, and a percentile is the share of places with less stress.
  Opening the disclosure reveals, under a hairline and scrolled into view, a two-by-two guide of four short sections (no card boxes): what the layers measure (the five domains and the Composite, two percentile examples, the Gini index, where higher means more inequality, county-level measures), reading one layer (ramp, fixed national classes, no data and few schools, the three levels), reading two layers (the 3x3 grid, ρ and n and "too few", the level changing the answer, correlation is not causation), and finding patterns (clusters, outliers, compare, stories; ODIS is one snapshot, so patterns are about place, not time).
  Its actions are "Take me there" (goes to the map; so does Escape), "Walk me through an example" (the same transition, then the tour enters once the panels have landed), and "Tell me the story" (the same transition, then the first story of section 3.8, whose card enters once the landing has given way); each sets the flag.
  The About dialog's "How to read the map" button and the Schoolscape brand at top left (a button labeled "Schoolscape - about this map") reopen it: the landing fades back over the map as the map blurs and the panels step away.
  Keyboard: the landing takes focus when it opens, Tab reaches the three actions and then the disclosure, and Enter activates the focused one.
- Guided tour: five steps on the live map with Composite Score × Gini index at the national view, each in a card at the bottom of the map area beside the layer dock (left edge at the 332 px map padding) with an accent ring around the panel it talks about (legend, legend, map, insight panel, layer dock): one layer, adding a second layer, the off-diagonal exceptions, the correlation numbers (with the nationwide 0.50 / 0.36 / 0.33 by level), and "your turn" with the correlation-is-not-causation note.
  Each step sets its layers, restores the panel it rings if the viewer minimized it, and flies back to the national framing if the camera wandered far; ending the tour (last step, close button, or Escape) leaves that view live.
  Neither the primer nor the tour is URL state.
- First run (no URL params and no localStorage flag): a dismissible hint, centered in the gap between the layer dock and the insight panel and wrapping to two lines when that gap is narrow, reads "Scroll to zoom. Click a state to dive in. Pick two layers to see how they relate." and disappears on the first interaction; it waits until the primer, the tour, and any story are closed, and after the primer until its landing has given way to the map.
- Legend: the univariate "Lower stress / Higher stress" labels carry an info mark and a tooltip with the same definition of stress, for viewers who skipped the primer.
- Data load failure: a toast with a retry button; the map stays interactive with whatever loaded.
- Basemap tile failure: fills still render over the dark background; a small notice appears in the attribution corner.
- Command function failure: handled by the degraded state above; never a modal.

## 4. Layer catalog

The catalog is one JSON file, `site/data/catalog.json`, hand-authored in T0 from this table and imported by the app, the command function, and the Python pipeline.
Ids are stable; labels are the ODIS column names; subtitles are plain English.
`resolution` is `county` for the eight columns verified constant within county, else `tract`.
`polarity` is `stress` (higher = more stress) or `neutral` (context shares).
`missing` is the share of schools with no value in the pipeline input; `site/data/catalog.json` carries the exact shares.

### 4.1 Primary scores (group `score`)

| id | label (CSV column) | percentile column | resolution | missing | subtitle |
| --- | --- | --- | --- | --- | --- |
| `composite` | `Composite Score` | `Composite Score Percentile Rank` | tract (includes county-level components) | 0% | Weighted average of the five domains, 0-100, higher = more community stress |
| `economic` | `Economic` | `Economic Percentile Rank` | tract (includes county-level Unemployment and Single-parent households) | 0% | Unemployment, child poverty, broadband access, single-parent households |
| `education` | `Education` | `Education Percentile Rank` | tract | 0.8% | Adults without a diploma, 2-year college or higher, linguistic isolation |
| `health` | `Health` | `Health Percentile Rank` | tract (includes county-level components) | 0% | Healthcare access, infant mortality, SNAP, low birth weight, lead risk |
| `housing` | `Housing` | `Housing Percentile Rank` | tract | 0.8% | Vacancy, affordability, park access |
| `crime` | `Crime` | `Crime Percentile Rank` | county | 13.6% | Violent crime rate and jail incarceration rate, one value per county |
| `gini` | `Gini index` | none | county | 0% | Income inequality, 0 to 1, one value per county |

### 4.2 Indicators (group `indicator`), 0-100 ODIS scaling, higher = more stress

| id | label (CSV column) | domain | resolution | missing | subtitle |
| --- | --- | --- | --- | --- | --- |
| `unemployment` | `Unemployment` | economic | county | 0% | Unemployed adults 16+ |
| `poverty` | `Poverty` | economic | tract | 0.8% | Children 0-17 in poverty |
| `broadband` | `Access to broadband internet` | economic | tract | 0.8% | Households without broadband (scaled as stress) |
| `single_parent` | `Single-parent households` | economic | county | 0.9% | Children living with a single parent |
| `less_than_hs` | `Less than HS` | education | tract | 0.8% | Adults 25+ without a high-school diploma |
| `college_2yr_plus` | `2-year college or higher` | education | tract | 0.8% | Adults 25+ without a 2-year degree or higher (scaled as stress) |
| `college_2yr` | `2-year college` | education | tract | 0.8% | 2-year degree attainment (scaled as stress) |
| `college_4yr` | `4-year college` | education | tract | 0.8% | 4-year degree attainment (scaled as stress) |
| `grad_degree` | `Graduate or professional degree` | education | tract | 0.8% | Graduate degree attainment (scaled as stress) |
| `linguistic_isolation` | `Linguistic isolation` | education | tract | 0.8% | Limited-English-speaking households |
| `healthcare_access` | `Access to healthcare` | health | tract | 0.8% | Children 6-18 without health insurance (scaled as stress) |
| `infant_mortality` | `Infant mortality rate` | health | county | 23.8% | Infant deaths per 1,000 live births |
| `snap` | `SNAP recipients` | health | tract | 0.9% | Households with children receiving SNAP |
| `low_birth_weight` | `Low birth weight` | health | county | 1.3% | Births under 2.5 kg |
| `lead_risk` | `Lead exposure risk` | health | tract | 51.2% | Lead exposure risk index |
| `vacancy` | `Housing vacancy rate` | housing | tract | 0.8% | Vacant housing units |
| `affordability` | `Housing affordability` | housing | tract | 0.8% | Households spending 30% or more of income on housing |
| `park_access` | `Park access` | housing | tract | 51.0% | Population not within a 10-minute walk of green space (scaled as stress) |
| `violent_crime` | `Violent crime rate` | crime | county | 24.9% | Reported violent offenses per 100,000 |
| `incarceration` | `Incarceration rate` | crime | county | 23.0% | Jail incarceration per 100,000 residents 15-64 |

Subtitles for indicators whose ODIS description names the "good" quantity (broadband, degrees, insurance, park access) must say "(scaled as stress)" because the CSV values rise with stress; the exact ODIS direction of these scalings is documented in the ODIS Technical Report, which is not in the repo, so the About page says "ODIS scaling, higher = more stress" and nothing more specific.

### 4.3 Context (group `context`), percent of population, neutral polarity

| id | label (CSV column) | missing |
| --- | --- | --- |
| `ctx_white` | `White alone` | 0.8% |
| `ctx_black` | `Black or African American alone` | 0.8% |
| `ctx_aian` | `American Indian and Alaska Native alone` | 0.8% |
| `ctx_asian` | `Asian alone` | 0.8% |
| `ctx_nhpi` | `Native Hawaiian and Other Pacific Islander alone` | 0.8% |
| `ctx_other` | `Some other race alone` | 0.8% |
| `ctx_two_plus` | `Two or more races` | 0.8% |
| `ctx_hispanic` | `Hispanic or Latino` | 0.8% |

Context layers use the same univariate ramp (bright = higher share) but the legend title reads "share of population" and the dock note reads "Race and ethnicity shares are included by ODIS for context only and do not enter any score."
They are excluded from story presets.

### 4.4 Columns that are not layers

`NCESSCH`, `Name`, `School District`, `State`, `FIPS County Code`, `County`, `City`, `Zip Code`, `SAB Available` are identifiers used in profiles and search.
The six `... Median` columns are national constants and are dropped.
`NCESSCH_original`, `NCESSCH_status`, and `ct_fill_sources` are pipeline audit columns and are not shipped to the site; `ct_fill_sources` sets the Connecticut flag (section 8.3).

## 5. Zoom levels and aggregation rules

### 5.1 Aggregation

- The value of a state or county for a layer is the unweighted mean of the non-missing values of the schools inside it, rounded to one decimal, with `n` = the number of schools that have a value.
  The median is also stored for tooltips.
- A school belongs to a county by `FIPS County Code` and to a state by `State`.
- Areas with `n = 0` for a layer are "no data" for that layer.
  Areas with `1 ≤ n < 3` are "thin" and get the thin-data outline (section 8).
- County-level columns collapse to the county value automatically; at state level they become the school-weighted mean of county values, and the state hover card says "County-level measures are school-weighted means of county values".
- Counties in the boundary file with no ODIS school (55 of 3,222) are drawn as no data.

### 5.2 Class breaks

- Univariate: five classes by quintiles of the unit distribution at that level, computed nationally by the pipeline and fixed (never rescaled to the viewport): `nation` breaks use the 52 state aggregates, `state` breaks use the 3,167 county aggregates, `local` breaks use the 23,595 schools.
  Example for Composite Score: school breaks 21 / 25 / 30 / 35; county breaks 23.0 / 27.0 / 31.0 / 37.7; state breaks 24.1 / 25.8 / 29.3 / 34.0.
- Bivariate: terciles of each layer at that level give a 3x3 grid; the class index is `3 * classA + classB` with A the primary layer.
- Percentile display uses fixed breaks at 20 / 40 / 60 / 80.
- Gini uses the same quintile rule on its 0 to 1 range.
- Breaks are shipped in `breaks.json` (Appendix B); the client never computes breaks.

### 5.3 Pins

- Pins are deck.gl `ScatterplotLayer` circles: radius 5 px at z8 growing to 6.5 px at z12 (clamped to 3 to 7 px), fill by the active scale.
- Every pin is cased in two tones so it stands out from any county fill behind it, including a fill of its own class: a 1 px dark ring `rgba(10,12,16,0.9)` and, just outside it, a 1 px light halo `rgba(236,239,245,0.78)` drawn by a stroke-only layer under the pins.
  Whatever the fill, one of the two tones has at least 3:1 contrast with it, which a unit test checks for every ramp color.
- No clustering; 23,595 points render natively.
- Below z8 ordinary pins are hidden; starred pins are always drawn.
- Hover picking uses deck.gl `pickable`; click opens the profile.
- Pin color for a county-level layer equals the county value, which is the honest flattening decision; the tooltip shows the badge.

## 6. Correlation method and presentation

### 6.1 Units at each level

| Level | "Areas on screen" | "Schools inside them" |
| --- | --- | --- |
| `nation` | states whose centroid is inside the viewport | all schools in those states |
| `state` | counties whose centroid is inside the viewport | all schools in those counties |
| `local` | not shown (a note says "{k} counties in view") | schools whose pin is inside the viewport |

Centroids and bboxes come from the aggregate files so no geometry math runs on the client.
Area values for correlations are the unrounded means of the school values behind each area, recomputed from `schools/all.json` whenever it holds every school behind the shipped mean, because the shipped means are rounded for display and rounding ties ranks (Gini to two decimals), which moved Composite × Gini across all states from the nationwide 0.50 to 0.48.

With a state or county selected, the units are that area's instead (section 3.7): a state's counties with schools and every school whose state is that state, or a county's schools.

### 6.2 Statistics

- Headline: Spearman rank correlation ρ with average ranks for ties.
- Interval: 95%.
  For n ≤ 5,000 use a seeded percentile bootstrap with 1,000 resamples (seed 42, resampling pairs).
  For n > 5,000 use the Bonett and Wright approximation: `z = atanh(ρ)`, `se = sqrt((1 + ρ²/2) / (n − 3))`, interval `tanh(z ± 1.96 se)`, labeled "approx." in the details.
- Details disclosure: Pearson r, r², pairwise-missing counts ("2,202 of 2,221 schools have both values"), the method line, and the bootstrap seed.
- Pairwise deletion only: a unit is used if both values are present.
- `n < 10` → `too-few` state; `10 ≤ n < 30` → a "small sample" tag next to n.
- All statistics run in a Web Worker (`stats.worker.ts`) so the map never stutters; the main thread sends typed arrays and a request id and drops stale results.
- Reference values for tests are in Appendix C.

### 6.3 Correlation block copy

Two stacked rows, each with a level label, the number, the interval, and n:

```
Areas on screen        ρ = 0.40   95% CI 0.36 to 0.43   n = 2,211 counties
Schools inside them    ρ = 0.24   95% CI 0.23 to 0.26   n = 20,201 schools
```

Under the rows, one line, always present when both rows show:
"Correlations across areas and across schools answer different questions. An area-level number says nothing about any individual school (the ecological fallacy)."

When only one row can be computed the line reads "Only {schools|areas} can be correlated at this zoom." (with a selected state, "Only {schools|counties} can be correlated in this state."; with a selected county, "Only schools can be correlated inside one county.").

### 6.4 Scatter and distributions

- Scatter: x = layer A, y = layer B, one point per unit of the row the user has focused (default: areas at nation and state level, schools at local level), drawn on a canvas via d3 scales; a thin OLS line; hovering a point highlights the unit on the map and vice versa.
  With more than 3,000 points the radius drops to 1.5 px and opacity to 0.5.
- Distributions (one-layer state): 20 bins over the layer's national range (0-100 in steps of 5; Gini 0-1 in steps of 0.05) with the national median as a vertical rule.
- Compare state: A and B clouds in their pin colors, the viewport or nation in text-3 gray.

### 6.5 National baseline

`national.json` carries the full 35 x 35 Spearman and Pearson matrices at the school, county, and state levels so the panel can print "nationwide: ρ = 0.24 across schools" instantly, without touching the worker.

## 7. Missing and thin data rules

- No data is never a color on the scale.
  Polygons: a diagonal hatch (45°, 1 px lines `rgba(255,255,255,0.14)` every 6 px) over `rgba(255,255,255,0.03)`, drawn by a second fill layer with `fill-pattern` whose `fill-opacity` is driven by feature-state (`nd = true`).
  Pins: a hollow ring at 0.7 of the pin radius, 1.25 px stroke `--text-2` with a 1 px dark halo, no fill, drawn under the filled pins; the smaller size keeps it from reading as a dark pin with a light halo.
- Thin data (`1 ≤ n < 3` for an area): the normal fill plus a dotted outline `rgba(255,255,255,0.35)`, dash `[1, 2]`; the tooltip says "Few schools (n = 2)".
- Legend: "No data" and "Few schools (under 3)" swatches always shown under the ramp.
- Correlation: pairwise deletion with the count shown (section 6.2).
- Bivariate: if either layer is missing the unit is no data.
- Profiles: a missing indicator shows "no data" in text-3 and the reason when known: for `crime`, `violent_crime`, and `incarceration` in Connecticut and Puerto Rico "ODIS has no crime inputs for this state"; for `lead_risk` and `park_access` "not available for about half of schools nationally".
- Connecticut profiles (rows with the `ctFilled` flag, section 8.3) carry one line under the header: "Connecticut values filled from current public sources; lead exposure is an approximation and park access a regional proxy." with a link to the About page's Connecticut paragraph, and the `lead_risk` and `park_access` rows carry an "approx." and a "proxy" badge.
- The pipeline treats `N/A`, empty, and `Null` as missing (the three forms documented in `data/README.md`).

## 8. Data contract: what the Python pipeline must produce

### 8.1 Inputs (all free, pinned by SHA-256)

| Input | URL | SHA-256 | License |
| --- | --- | --- | --- |
| ODIS v3, fixed and Connecticut-filled | in repo, `data/index_scores_v3_2026_ct_filled.csv` (written by `scripts/fill_connecticut.py` from `data/index_scores_v3_2026_fixed.csv`) | committed | CC BY 4.0; the Connecticut fill sources and their credits are listed in `data/README.md`, "Connecticut fill" |
| NCES EDGE public school geocodes 2022-23 | `https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2223.zip` (31.9 MB) | `eba99090e451069910f32627f5d7142e89774679076bb52dc559f98703c16ae7` | US federal government data, public domain |
| Census cartographic boundaries, states 1:5m, 2023 | `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_5m.zip` (1.1 MB) | `0f606018e81fe99a204d08aa7ac1f8d00516143ddc95900b79eeecfee65da8c3` | US federal government data, public domain |
| Census cartographic boundaries, counties 1:5m, 2023 | `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip` (3.0 MB) | `13b2bcdd81fee8476220793dd1023c4f1d2887945b5f66eef52afa98c99d2485` | US federal government data, public domain |
| Census cartographic boundaries, counties 1:500k, 2023 (later, per-state detail) | `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip` (11.6 MB) | `99d6597b1fc7767deef62e01d28d8b5dcbd578e151855f7dc0d173cbf5bf0868` | US federal government data, public domain |

Downloads go to `.cache/schoolscape/` (gitignored), the same pattern `scripts/fix_ncessch.py` uses.
The pipeline verifies the SHA-256 before use and fails loudly on mismatch.
The geocode zip contains the same data as a pipe-delimited `.TXT` without a header row and as a shapefile; read the shapefile (`Shapefiles_SCH/EDGE_GEOCODE_PUBLICSCH_2223.shp`) because it carries field names.

### 8.2 Outputs

All files are written to `site/public/data/v1/`, committed, deterministic (sorted keys, fixed rounding, no timestamps except in `meta.json`), and served with immutable cache headers.
When the data changes, bump `v1` to `v2` in both the pipeline and `site/src/data/paths.ts`.

| File | Purpose | Measured gzip size |
| --- | --- | --- |
| `meta.json` | build id, source versions, counts, placeholders | < 1 KB |
| `catalog.json` | copy of `site/data/catalog.json` for runtime validation | 8 KB |
| `states.topo.json` | 52 state polygons, TopoJSON, quantized 1e5, simplified 0.01° | 38 KB |
| `counties.topo.json` | 3,222 county polygons (1:5m source), TopoJSON, simplified 0.005° | 309 KB |
| `states.json` | state aggregates, centroids, bboxes | ~12 KB |
| `counties.json` | county aggregates, centroids, bboxes | 166 KB |
| `schools/all.json` | every school, every layer, coordinates, identifiers, columnar | 1.37 MB |
| `gazetteer.json` | states, counties, cities, districts with bboxes for search and command resolution | 309 KB |
| `breaks.json` | class breaks per layer per level | ~10 KB |
| `national.json` | national means, medians, n, and correlation matrices at three levels | ~60 KB |
| `presets.json` | the narrated stories | < 4 KB |

Schemas are in Appendix B.
Total: about 2.3 MB gzipped; the first paint needs only `states.topo.json`, `states.json`, `breaks.json`, and `catalog.json` (about 70 KB).

### 8.3 Rules the pipeline must follow

- Read `NCESSCH`, `FIPS County Code`, and `Zip Code` as strings.
- Treat `N/A`, empty, and `Null` as missing.
- Exclude the four territories with no ODIS rows from the boundary files (`STATEFP` 60, 66, 69, 78) and keep Puerto Rico (72) and DC (11).
- Join coordinates on `NCESSCH` after zero-padding the geocode id to 12 digits; assert 100% match (the verified state of the data) and write any unmatched ids to the report.
- Assert that the ODIS county FIPS equals the NCES `CNTY` for every school; write disagreements to the report (currently zero).
- Round scores and indicators to integers where the CSV has integers, means to one decimal, Gini to two decimals, coordinates to five decimals.
- Compute breaks with numpy's default (linear interpolation) quantile on the unit distribution at each level, excluding missing, with unrounded area means, then round to one decimal (Gini two); this reproduces the section 5.2 examples.
- Compute the national correlation matrices with pairwise deletion, Spearman with average ranks, Pearson standard.
- Write `analysis/schoolscape/REPORT.md` with counts, missing shares per layer, unmatched joins, and the Connecticut summary; deterministic.
- The CLI is `python -m analysis.schoolscape build` from the repo root; `--check` re-runs and diffs against the committed outputs and exits non-zero on any difference (used by CI).
- Connecticut: `meta.json.placeholders.connecticut` is `"filled"`; the 208 rows with a non-empty `ct_fill_sources` are flagged in `schools/all.json` field `flags` with bit value 1 (`ctFilled`, `SchoolFlag.ctFilled` in `site/src/lib/dataTypes.ts`) so profiles can show the Connecticut note, and no rows are dropped.

### 8.4 Python environment

Add to `requirements.txt` (versions verified on PyPI on 2026-09-26):

```
pandas==3.0.6
numpy==2.5.3
scipy==1.18.1
geopandas==1.1.4
shapely==2.1.2
pyogrio==0.13.0
pyproj==3.8.0
topojson==1.10
```

`matplotlib` stays for the existing EDA script.
All are BSD or MIT licensed.
Python 3.12 or newer; the machine here has 3.14.6.

## 9. Visual design system

### 9.1 Principles

Dark, quiet, precise.
The map is the hero; panels are frosted glass that recede.
Data colors are the only saturated things on screen besides the accent.
Numbers are set in tabular figures and never jitter.

### 9.2 Design tokens

Defined once in `site/src/styles/tokens.css` as CSS custom properties and mirrored in Tailwind via `@theme inline`.

```css
:root {
  /* surfaces */
  --bg-0: #0a0c10;            /* page and basemap background */
  --bg-1: #0f1218;
  --surface: rgba(18, 21, 28, 0.84);
  --surface-strong: rgba(18, 21, 28, 0.88);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --highlight: rgba(255, 255, 255, 0.04);

  /* text */
  --text-1: #f2f4f8;
  --text-2: #aeb6c4;
  --text-3: #6f7889;

  /* accent (interactive state) */
  --accent: #2ee6c5;
  --accent-strong: #5cf2d8;
  --accent-dim: rgba(46, 230, 197, 0.16);
  --focus-ring: 0 0 0 2px rgba(46, 230, 197, 0.65);

  /* marks */
  --mark-a: #ffd166;          /* compare pin A, favorites star */
  --mark-b: #ff7a59;          /* compare pin B */
  --selection: #ffffff;

  /* univariate ramp, low -> high stress (5 classes) */
  --u1: #262a36;
  --u2: #472b5c;
  --u3: #742f7f;
  --u4: #a93a9c;
  --u5: #e068c0;

  /* bivariate 3x3, index 3*a + b (a = primary layer class 0..2, b = secondary 0..2) */
  --bv0: #262a36;  --bv1: #1e6b6b;  --bv2: #22c2b0;
  --bv3: #742f7f;  --bv4: #6b5d95;  --bv5: #6fc6c9;
  --bv6: #e068c0;  --bv7: #d58ad6;  --bv8: #f2f0fa;

  /* data states */
  --nodata-hatch: rgba(255, 255, 255, 0.14);
  --nodata-fill: rgba(255, 255, 255, 0.03);
  --thin-outline: rgba(255, 255, 255, 0.35);
  --hover-outline: rgba(255, 255, 255, 0.7);

  /* radii, spacing, shadow */
  --r-chip: 8px; --r-card: 12px; --r-panel: 16px; --r-pill: 999px;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px;
  --shadow-panel: 0 12px 40px rgba(0, 0, 0, 0.45);
  --blur-panel: 18px;
}
```

- The primary layer (A) owns the magenta axis and the univariate ramp; the secondary layer (B) owns the teal axis.
  The accent is also teal, so on-map selection never uses the accent fill: selection is a white 2 px stroke with a 6 px accent glow, which stays visible over every class.
- Legend text and all figures use `font-variant-numeric: tabular-nums`.
- Contrast: `--text-1` on `--bg-0` is above 17:1; `--text-2` above 8:1; `--text-3` above 4.5:1 for 12 px labels only.
- Color-blindness: the bivariate grid separates the two axes by lightness as well as hue (row and column both brighten), which keeps it readable under deuteranopia and protanopia; Q2 verifies with a simulator and may nudge hex values within the same structure.

### 9.3 Map marks

| Mark | Style |
| --- | --- |
| Polygon fill, univariate | `--u1..--u5` at opacity 0.85 (state level) |
| Polygon fill, bivariate | `--bv0..--bv8` at opacity 0.85 |
| Polygon outline | `rgba(255,255,255,0.10)` 0.6 px; state borders `rgba(255,255,255,0.22)` 1 px |
| Hover | outline `--hover-outline` 1.5 px |
| Selected | outline `--selection` 2 px plus glow `rgba(46,230,197,0.55)` 6 px (a second line layer with blur) |
| Compare A / B | outline `--mark-a` / `--mark-b` 2.5 px |
| Pin | circle, fill by scale, stroke `rgba(10,12,16,0.9)` 1 px, light halo `rgba(236,239,245,0.78)` 1 px outside it |
| Starred pin | radius 7 px, fill `--mark-a`, stroke white 1.5 px, dark halo 1 px, always on top |
| Hovered pin | radius +2 px, stroke white 1.5 px, dark halo 1 px |
| No data | hatch layer (section 7) / hollow ring pin |
| Thin | dotted outline `--thin-outline` |

### 9.4 Typography

- UI: Inter Variable from `@fontsource-variable/inter` 5.3.0 (OFL 1.1), self-hosted, `font-display: swap`.
- Code and ids: JetBrains Mono Variable from `@fontsource-variable/jetbrains-mono` 5.3.0 (OFL 1.1).
- Scale: 11 (badges, uppercase with 0.06 em tracking), 12 (captions), 13 (body in panels), 14 (chips, inputs), 16 (panel titles), 20 (headline numbers), 28 (profile score).
- Line height 1.35 for body, 1.1 for numbers.
- Headline numbers (ρ, scores) at 20 to 28 px, weight 600, tabular.

### 9.5 Glass panel recipe

```css
.glass {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-panel), inset 0 1px 0 var(--highlight);
  backdrop-filter: blur(var(--blur-panel)) saturate(1.2);
  border-radius: var(--r-panel);
}
```

- Only the unprefixed `backdrop-filter` is written: the CSS build adds the `-webkit-` copy, and a hand-written one after it made the build drop the unprefixed rule, which left Chromium with no blur.
- `--surface` is 0.84 opaque so secondary text keeps 6:1 contrast even over the palest fill (`--bv8`); at 0.66 it fell to 3.7:1 and captions to 1.7:1.

- Padding 16 px; section gaps 12 px; chip grid gap 8 px.
- Drawers use `--surface-strong` so text stays readable over busy map areas.
- Hover cards (section 3.5) use the glass recipe with `--surface-strong` and `--border-strong`, radius 12, padding 10 x 12, width 320 px; the blur keeps their small text readable over busy map labels.

### 9.6 Motion

- Durations: hover 120 ms, chip and toggle 200 ms, panel and drawer open 280 ms, fly-to 1,200 ms (MapLibre `flyTo` with `curve` 1.42 and `speed` 1.2), map fill transitions 250 ms (`fill-color-transition`).
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` for UI; MapLibre's default for camera.
- Motion (the `motion` package) drives panel enter and exit (`opacity` 0 → 1, `y` 8 → 0) and the applied-command chip.
- `prefers-reduced-motion: reduce`: all UI durations 0; `flyTo` becomes `jumpTo`.
- Nothing decorative animates; no ambient motion.

### 9.7 Basemap style

- Source: OpenFreeMap `https://tiles.openfreemap.org/styles/dark` (verified today: HTTP 200, 21 KB style JSON, `background-color` `rgb(12,12,12)`, OpenMapTiles schema, vector source `https://tiles.openfreemap.org/planet`).
  OpenFreeMap is free with no API key and no request limits and allows production use; attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" must be shown, which MapLibre's attribution control does from the style.
- The app fetches the style JSON at startup and patches it before `new Map({ style })`:
  - `background` `background-color` → `#0b0d12`; `water` fills → `#0f141c`; landcover and landuse fills → hidden; `building` layers → hidden; `poi` and `housenumber` symbol layers → hidden; road lines → colors dimmed to `#1a1f28` and `#242a35`; boundary lines → `#2a303c`; all remaining symbol layers → `text-color` `#8b93a3`, `text-halo-color` `#0b0d12`, `text-opacity` 0.75.
  - Labels show one name, English else Latin-script else local (`coalesce` of `name_en`, `name:latin`, `name`), instead of the style's Latin plus local-script pair, so first paint loads the Latin glyph ranges only; the place labels' `icon-image` (`circle-11`, which the OpenFreeMap sprite lacks) is removed.
  - Patching is by layer id prefix (`poi`, `building`, `housenumber`, `landcover`, `landuse`, `water`, `road`, `boundary`, `place`) and lives in `basemap/theme.ts` with a unit test against a saved copy of the style.
- Layer order: Schoolscape fill layers are inserted with `beforeId` = the first `symbol` layer, so labels render above fills; deck.gl runs interleaved (`new MapboxOverlay({ interleaved: true })`) with its pin layers given `beforeId` of the same symbol layer.
- Fallback: if the style fetch fails, a minimal inline style with only the background color is used so fills still render, and the attribution corner shows "Basemap unavailable".
- Documented alternative (not built): self-hosted Protomaps basemap PMTiles with the `pmtiles` protocol, which needs a US extract cut from the 120 GB daily planet build; the hosted Protomaps API needs an API key and is free for non-commercial use only, so it is not the default.

## 10. Performance, caching, and accessibility budgets

### 10.1 Performance budget

| Metric | Budget | How measured |
| --- | --- | --- |
| First map paint (state fills visible) | < 2.0 s on broadband, cold cache, 1440x900 | `performance.mark('schoolscape:first-paint')` fired on the first `idle` after state feature-states are set; read by Playwright |
| Critical path payload | < 450 KB gzip (app JS without deck.gl and d3, fonts, `states.topo.json`, `states.json`, `breaks.json`, `catalog.json`) | `vite build` report plus `curl -I` sizes |
| Pan and zoom | no frame over 32 ms during a 3 s scripted pan at z6 and z9 | Playwright + `requestAnimationFrame` sampling |
| Layer switch | fills recolor within 250 ms | timestamp around `setFeatureState` loop |
| Correlation | result within 400 ms for the national school-level pair (n ≈ 23k, approximation path) and within 1.5 s for a 5,000-unit bootstrap | worker timing |

Loading sequence:

1. `index.html` with `<link rel="preconnect" href="https://tiles.openfreemap.org">` and `<link rel="preload" as="fetch" crossorigin>` for the basemap style and the four critical data files (a Vite plugin in `vite.config.ts` writes them); fonts are not preloaded, since at 10 Mbps their bytes delayed the app script and the first contentful paint.
2. Main bundle: React, Zustand, MapLibre, store, shell, map core; MapLibre and React are separate long-cached chunks.
   deck.gl, d3, fuse.js, and the command engines are dynamic imports; the profile drawer, favorites panel, About dialog, and guided tour load on first open, or once the first paint is on screen and the browser is idle, whichever comes first.
3. On map `load`: apply state fills, fire the first-paint mark.
4. Then, once the first-paint mark has fired (or after 4 s if the map never paints), via `requestIdleCallback`: `counties.topo.json` + `counties.json`, `schools/all.json` + deck.gl, `gazetteer.json` + fuse.js, `national.json`.
5. Pins and search become available as their data lands; the UI shows a subtle "loading schools" chip until `all.json` is parsed.

### 10.2 Caching

- Vite fingerprints app assets under `/assets/`; data files live under `/data/v1/` and are versioned by directory.
- `site/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    { "source": "/data/(.*)", "headers": [ { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] },
    { "source": "/assets/(.*)", "headers": [ { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] },
    { "source": "/", "headers": [ { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" } ] },
    { "source": "/(.*)", "headers": [ { "key": "X-Content-Type-Options", "value": "nosniff" }, { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" } ] }
  ],
  "functions": { "api/command.ts": { "maxDuration": 15 } }
}
```

  The `headers` and `functions` shapes follow Vercel's `vercel.json` reference.
- Client side: parsed data files are held in a module-level cache (`dataCache.ts`) keyed by path so re-entering a level never refetches; the worker keeps the last schools arrays; correlation results are memoized by (layers, unit ids hash).
- D1 verifies with `curl -sI` that `/data/v1/states.json` returns the immutable header and a `content-encoding` of `br` or `gzip`; if Vercel does not compress `.json` automatically, D1 switches the pipeline to write `.json.gz` alongside and the loader to prefer it.

### 10.3 Accessibility (best-effort, not gates)

- Every panel control is a real button or input with a visible focus ring (`--focus-ring`) and an accessible name.
- Panels are keyboard reachable in DOM order: top bar, layer dock, insight panel, legend.
- Tooltips are also exposed as an `aria-live="polite"` region summarizing the hovered unit.
- The legend has text alternatives for every swatch.
- A "Data table" button in the insight panel opens the units the panel describes (on screen or in the selected area) as a sortable table (name, values, n) for screen readers and for copy-paste.
- Reduced motion honored (section 9.6).
- Color-blind check of both palettes with a deuteranopia and protanopia simulator recorded in Q2.

## 11. Stack and libraries

All versions were read from the npm registry and PyPI on 2026-09-26; all licenses are free and permissive.

| Package | Version | License | Role |
| --- | --- | --- | --- |
| `react`, `react-dom` | 19.3.0 | MIT | UI |
| `typescript` | 6.0.3 | Apache-2.0 | strict mode on; not 7.0.2, because TypeScript 7 has no stable compiler API and `typescript-eslint` 8.70 requires `typescript` below 6.1 |
| `vite`, `@vitejs/plugin-react` | 8.3.1, 6.1.1 | MIT | build and dev server |
| `maplibre-gl` | 6.11.2 | BSD-3-Clause | map, choropleth fill layers, camera |
| `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/mapbox` | 9.4.0 | MIT | school pins (`ScatterplotLayer`) via `MapboxOverlay` interleaved with MapLibre |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | MIT | styling; tokens via `@theme inline` |
| `shadcn` (CLI) | 4.21.0 | MIT | Button, Toggle, Tooltip, Dialog, Sheet, Popover, Command, Table, Switch, Tabs, Badge |
| `motion` | 13.4.4 | MIT | panel transitions (`import { motion } from "motion/react"`) |
| `d3-scale`, `d3-array`, `d3-shape` (from `d3` 7.9.0) | 4.0.2, 3.2.4 | ISC | scatter and histograms on canvas |
| `zustand` | 5.0.15 | MIT | app store |
| `fuse.js` | 7.5.0 | Apache-2.0 | fuzzy search over gazetteer and school names |
| `topojson-client` | 3.1.0 | ISC | TopoJSON to GeoJSON in the browser |
| `lucide-react` | 1.48.0 | ISC | icons |
| `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` | 5.3.0 | OFL-1.1 | fonts, self-hosted |
| `zod` | 4.6.5 | MIT | schema for the command function and data validation |
| `@anthropic-ai/sdk` | 0.128.0 | MIT | Claude API client in the Vercel function |
| `vitest` | 5.0.2 | MIT | unit tests |
| `@playwright/test` | 1.63.0 | Apache-2.0 | end-to-end and performance checks |
| `eslint`, `prettier` | 10.11.0, 3.9.9 | MIT | lint and format |
| `vercel` (CLI, dev dependency) | latest | Apache-2.0 | `vercel dev` runs Vite plus the function locally |

Notes verified against current docs:

- deck.gl's `MapboxOverlay` supports MapLibre GL JS and, from MapLibre v3, interleaved rendering; `@deck.gl/mapbox` 9.4.0 peer-depends only on `@deck.gl/core`, `@luma.gl/core`, and `@math.gl/web-mercator`, so MapLibre 6 is not constrained by a peer range (Appendix E).
- MapLibre GL JS 6.0.0 was released 2026-07-22 and 6.11.2 on 2026-09-24.
- shadcn/ui supports Tailwind v4 and React 19 (`@theme inline`, `data-slot`, no `forwardRef`).
- Vercel Hobby is free for personal, non-commercial use, includes 100 GB fast data transfer, 1,000,000 function invocations, and function durations up to 300 s; a personal project link for a data challenge fits its fair-use terms.
- The `zod` v4 line is the current major; the Anthropic SDK's `zodOutputFormat` helper is used with it in A2, and if the helper rejects v4 schemas at build time, A2 pins `zod@3.25.x` for the function only.

No paid service is required for the site; the only metered service is the Claude API behind the command bar (section 14.6).

## 12. Repository layout

```
CDC2026/
  SPEC.md                            this document
  README.md                          add a "Schoolscape" section linking site/ and the live URL
  requirements.txt                   pipeline deps (section 8.4)
  data/                              ODIS files (unchanged)
  analysis/
    01_data_overview.py              existing EDA
    schoolscape/                     pipeline package
      __main__.py                    CLI: build | check
      config.py                      paths, URLs, SHA-256 pins, level thresholds shared with the app
      download.py                    cached, hash-verified downloads
      boundaries.py                  shapefiles -> TopoJSON (states, counties), centroids, bboxes
      schools.py                     CSV + geocodes -> schools/all.json
      aggregates.py                  states.json, counties.json, breaks.json, national.json
      gazetteer.py                   gazetteer.json
      presets.py                     presets.json
      report.py                      REPORT.md
      fixtures.py                    site/src/test/fixtures/ (T0; python -m analysis.schoolscape fixtures)
      tests/                         unittest modules with fixtures
  site/                              the app (Vercel project root)
    package.json
    vite.config.ts
    vercel.json
    index.html
    api/
      command.ts                     Vercel function (section 14)
      _lib/                          schema.ts, prompt.ts, ratelimit.ts
    data/
      catalog.json                   layer catalog, single source of truth
    public/
      data/v1/                       pipeline outputs (committed)
      favicon.svg
    src/
      main.tsx, App.tsx
      styles/tokens.css, styles/globals.css
      lib/types.ts                   Appendix A contracts
      lib/urlCodec.ts
      lib/dataCache.ts, lib/loaders.ts
      lib/scales.ts                  class assignment, colors
      lib/geo.ts                     viewport membership, bbox helpers
      store/useStore.ts              Zustand store
      map/MapProvider.tsx            map instance context
      map/MapCanvas.tsx              MapLibre init, basemap theme, level machine
      map/choropleth.ts              fill layers, feature-state, hatch, outlines
      map/pins.ts                    deck.gl overlay and layers
      map/camera.ts                  flyTo helpers with standard padding
      basemap/theme.ts
      stats/stats.worker.ts, stats/correlation.ts, stats/bootstrap.ts, stats/histogram.ts
      components/TopBar.tsx, CommandBar.tsx, SearchBox.tsx
      components/LayerDock.tsx, Legend.tsx, Breadcrumb.tsx, QuickJump.tsx
      components/InsightPanel.tsx, Scatter.tsx, Distribution.tsx, ComparePanel.tsx
      components/ProfileDrawer.tsx, FavoritesPanel.tsx, AboutDialog.tsx, Toasts.tsx
      components/Primer.tsx, GuidedTour.tsx, FirstRunHint.tsx, lib/guide.ts   map guide (3.15)
      command/resolver.ts, command/localParser.ts, command/apply.ts
      test/fixtures/                 small JSON fixtures (10 states, 30 counties, 200 schools)
    e2e/                             Playwright specs
```

Vercel project settings: root directory `site`, framework preset Vite, build command `npm run build`, output `dist`.

## 13. Environment, deployment, and local development

- Node 22 or newer (the machine here has 26.7.0).
- `npm ci && npm run dev` runs Vite alone; the command bar then works in degraded (local parser) mode.
- `npx vercel dev` runs Vite plus `api/command.ts`; it reads `TYPESAFE_API_KEY` and `ANTHROPIC_API_KEY` from `site/.env.local` (gitignored; `vercel env pull .env.local` fills it).
- Production: Vercel project on the Hobby plan; `TYPESAFE_API_KEY` and `ANTHROPIC_API_KEY` set as environment variables for Production and Preview; optional `JEV_MODEL` and `COMMAND_MODEL`.
- Domain: `schoolscape.<personal-site-domain>` as a CNAME to Vercel; the personal site's domain was not given, so the About page and README use a placeholder until hosting is set up (hosting is explicitly a later concern).
- Scripts: `dev`, `build`, `preview`, `lint`, `format`, `test` (Vitest), `e2e` (Playwright), `data:check` (`python -m analysis.schoolscape check` via a tiny wrapper).

## 14. The AI command bar

### 14.1 Behavior

The user types a request; a model turns it into a small, validated intent; the browser turns the intent into view state.
The first engine is Jev, TypeSafe's System One model, which returns typed decisions with calibrated probabilities instead of text.
Before calling the function, the browser finds every place the text might name in its own gazetteer and school index (section 14.5) and sends those candidates along; Jev only chooses among them.
One Jev request answers six typed questions at once: the action, a first and a second layer from the catalog, a first and a second place from the candidates, and whether the user asked for percentiles.
When an answer about a place or a layer is unsure, the browser shows "did you mean" chips instead of guessing, and applies the view when one is clicked.
Claude (section 14.4) is the second engine: it runs when Jev is not configured or fails, and returns places as free text with a kind for the browser to resolve.
No model ever sees or returns coordinates, ids, or numbers: Jev picks candidate labels and catalog layer ids from closed lists, and Claude returns catalog ids and place names.
If the function is unavailable for any reason, a local parser produces the same intent shape from keyword and fuzzy matching, and the UI says so.
Fallback order: Jev, then Claude, then the local parser, so the command bar never breaks.

### 14.2 Intent schema (shared by the function and the client, `api/_lib/schema.ts`)

```ts
import { z } from "zod";
import catalog from "../../data/catalog.json";

export const LayerIdSchema = z.enum(catalog.layers.map((l) => l.id) as [string, ...string[]]);

export const PlaceQuerySchema = z.object({
  query: z.string().min(1).max(80),               // the place as written, e.g. "LA County"
  kind: z.enum(["state", "county", "city", "district", "school", "unknown"]),
  stateHint: z.string().max(40).optional(),       // e.g. "California" when the user said it
});

export const IntentSchema = z.object({
  action: z.enum(["explore", "compare", "profile", "clear"]),
  layers: z.array(LayerIdSchema).max(2),          // [] means keep current layers
  places: z.array(PlaceQuerySchema).max(2),       // [] means keep current place
  display: z.enum(["score", "pct"]).optional(),
  note: z.string().max(140).optional(),           // one short sentence the UI may show, e.g. why a layer was chosen
});
export type Intent = z.infer<typeof IntentSchema>;
```

The request also carries `candidates`: up to 20 places the browser found in the text, each `{ label, kind, state?, text, start, selected? }`, where `label` is a unique readable name such as "Cook County, Illinois", `text` is the words that named it as typed, `start` their offset (`-1` for the selected place when the text does not name it), and `selected` marks the place selected on the map now.
Refs, bboxes, and scores stay in the browser.

The response is `{ ok: true, engine: "claude", model, intent }`, or for Jev `{ ok: true, engine: "jev", model, intent, picks, ask? }`, or `{ ok: false, error }`.
`picks` holds the candidate label behind each of `intent.places`, in order; `ask` is at most one low-confidence answer to put to the user, `{ kind: "place" | "layer", index, options }`, where `index` points into `intent.places` or `intent.layers` (a layer index equal to `intent.layers.length` adds a layer).

### 14.3 The function (`api/command.ts`)

Engine order: Jev when `TYPESAFE_API_KEY` is set, then Claude when `ANTHROPIC_API_KEY` is set, each skipped when unconfigured and left on any error, timeout, or answer that does not map to a valid intent.
With neither key the function answers `503 not_configured`; when every configured engine fails it answers with the last engine's error; either way the browser runs its local parser.
Jev gets 2.5 s and no retry; Claude after a failed Jev call gets 5 s and no retry, so both fit inside the browser's 8 s cap.

The Jev engine (`api/_lib/jev.ts`, SDK `@typesafe-ai/sdk`, `POST https://api.typesafe.ai/v1/systemone`, model pinned to `jev-1.13.0`, overridable with `JEV_MODEL`):

- State is only `{ request: text }`; Jev reads instructions literally and loses accuracy with unrelated context, so the view context is not sent.
- `action`: Choice over explore, compare, profile, clear, each with a one-line criterion.
- `layer_1`, `layer_2`: Choice over every catalog id plus `none`; each option's criterion comes from the catalog label and aliases, and domain scores say to choose them only when the request names the domain in general.
- `place_1`, `place_2`: Choice over the candidate labels plus `none`, each described by kind, state, and the words that named it; the selected place is described as such so "here" or "this county" can point at it.
  These two questions are left out when there are no candidates.
- `percentile`: Noul, with criteria asking for words like percentile, rank, or ranking.
- Code, not Jev, owns the invariants: places are ordered by where the text names them; a repeated pick, a second place whose words overlap the first, and a state written right after a place in it ("Cook County, Illinois") are dropped; a repeated layer is dropped; `clear` empties everything; `compare` without two places or `profile` without a place becomes `explore`; `display = "pct"` when the noul is at least 0.5.
- Confidence gate, tuned on the utterance sets: a place pick under probability 0.6 (0.9 when the same words also name a place of the same kind in another state, since Jev knows Cook County, Illinois at 0.99 but leans on a coin flip for "Jefferson County"), a layer pick under 0.5, or a `none` first layer under 0.7 becomes `ask`, offering up to three options at probability 0.1 or more (for places, also every candidate named by the same words, so "Springfield" offers IL, MA, and MO); fewer than two options means no question.
  Places are asked about before layers, and only one question is asked.
- Any answer naming an option that was never offered, or a missing answer, sends the request on to Claude.

The Claude engine:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { IntentSchema } from "./_lib/schema";
import { SYSTEM_PROMPT } from "./_lib/prompt";
import { allow } from "./_lib/ratelimit";

const Body = z.object({
  text: z.string().min(1).max(300),
  context: z.object({
    level: z.enum(["nation", "state", "local"]),
    layers: z.array(z.string()).max(2),
    selected: z.string().optional(),               // human-readable name of the selected place
  }),
});

const client = new Anthropic({ timeout: 8_000, maxRetries: 1 });   // reads ANTHROPIC_API_KEY
const MODEL = process.env.COMMAND_MODEL ?? "claude-haiku-4-5";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!allow(ip)) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
    const { text, context } = parsed.data;

    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify({ text, context }) }],
        output_config: { format: zodOutputFormat(IntentSchema) },
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        return Response.json({ ok: false, error: "no_parse" }, { status: 422 });
      }
      const intent = IntentSchema.parse(response.parsed_output);   // re-validate on our side
      return Response.json({ ok: true, intent, model: MODEL });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return Response.json({ ok: false, error: "upstream_rate_limited" }, { status: 503 });
      if (err instanceof Anthropic.APIConnectionError) return Response.json({ ok: false, error: "upstream_unreachable" }, { status: 503 });
      if (err instanceof Anthropic.APIError) return Response.json({ ok: false, error: "upstream_error" }, { status: 502 });
      return Response.json({ ok: false, error: "unknown" }, { status: 500 });
    }
  },
};
```

- The handler shape (`export default { async fetch(request) }`) is the one Vercel documents for non-Next.js projects in the `api/` directory; `maxDuration` 15 s is set in `vercel.json`.
- `messages.parse` with `output_config.format` from `zodOutputFormat` is the structured-output path in the current SDK; if the chosen model rejects `output_config.format` (HTTP 400) at A2's smoke test, A2 switches to a single strict tool (`set_view`, `strict: true`, `additionalProperties: false`) with the same schema and reads `tool_use.input`.
- No `thinking` parameter is sent (Claude Haiku 4.5 would need `budget_tokens` and the task does not benefit); no prefill; `temperature: 0` for repeatability.
- Rate limit: `_lib/ratelimit.ts` keeps an in-memory token bucket per IP (30 requests per minute); it is best-effort on serverless and documented as such.
- The keys never reach the browser; the browser only calls `/api/command`.

### 14.4 System prompt (`api/_lib/prompt.ts`)

The prompt is a constant string built once from the catalog:

1. Role: "You convert one request about a map of US high-school community stress into a small JSON intent. You never invent numbers, ids, or coordinates."
2. The layer list: one line per catalog entry, `id | label | group | aliases` (aliases hand-authored in the catalog, e.g. `crime: crime, safety, violence`; `economic: economy, income, jobs, unemployment` only when the user does not name the indicator).
3. Rules: choose at most two layers, primary first; put places in `places` exactly as written with the best `kind` (`county` when the text says county or names a well-known county, `state` for states, `school` when it looks like a school name); `action = compare` when the text compares two places or says "vs", "versus", "compare", "against"; `action = profile` when a single school is named; `action = clear` for "reset" or "start over"; `explore` otherwise; use `display = "pct"` when the user says percentile or rank; leave `layers` empty when no layer is mentioned; `note` is at most one short sentence.
4. Six few-shot examples as JSON pairs, including "compare crime and education in LA County and California", "show me poverty in Texas", "where is housing stress worst in the Bay Area" (city kind: unknown, stateHint California), "Albertville High School" (profile), "percentile view of composite in Cook County Illinois", and "reset".

### 14.5 Client side (`command/`)

- `candidates.ts` finds place candidates before the request: exact gazetteer and school names over 1- to 4-word spans of the text (up to 10 words when the span looks like a school name), skipping spans that start or end on filler or consist only of measure or generic school words; then a strict fuzzy pass (adjusted score 0.15 or better, name length within a third of the typed words) over leftover runs, retried between measure words, for typos such as "Missisippi poverty".
  Each place keeps the longest span that found it, a place found only inside a longer matched span ("York" in "New York", "Illinois" in "Cook County Illinois") is dropped, at most three places per span are kept, and the list is capped at 20 with the selected place added last.
- For a Jev answer, each pick maps back to the ref of the candidate the browser found, and those refs are passed as already-chosen places, so the resolver never re-guesses a place Jev picked; an `ask` becomes `needs-choice` (place chips, regions excluded) or `needs-layer` (layer chips) and nothing is applied until a chip is clicked.
- `apply.ts` receives an `Intent`, resolves each place with `resolver.ts` (fuse.js over the gazetteer and school names, `threshold` 0.3, kind and `stateHint` used as boosts), and:
  - 0 candidates → `no-match` state for that place;
  - 1 candidate, or a top candidate scoring at least 0.15 better than the next → use it;
  - otherwise → `needs-choice` with up to three chips.
- Then, in order: set layers if given; set display if given; for `compare` with two resolved places at the same level, arm compare, pin both, and fit the union of their bboxes; for one place, select and fly to it; for `profile`, open the drawer; for `clear`, reset to the default view.
- `localParser.ts` (fallback): lowercases the text, finds layer mentions by fuse over labels and aliases, finds place mentions by fuse over 1- to 4-word windows, sets `compare` when two places or a comparison word are found, `profile` when the best match is a school; returns the same `Intent` shape.
  It runs when the function returns any non-200, times out at 8 s, or the app is offline.
  Runs of fewer than three letters never count as a fuzzy place ("s" from "what's", "as").
- The chip after applying summarizes the change in words; the intent `note` shows as a tooltip on the chip; chips from the function end with "powered by Jev" or "powered by Claude".

### 14.6 Model, cost, and key

- First engine: Jev 1.13 (`jev-1.13.0`), TypeSafe's System One model, chosen because a command is a set of closed decisions, which is what Jev answers, and because it is cheaper and faster than a generative model.
  Pricing from the TypeSafe models page on 2026-09-26: $0.042 per million input tokens; output tokens are free.
  A command sends about 3,400 to 3,900 input tokens (the layer criteria appear in both layer questions), so it costs about $0.00016, and 1,000 commands cost about $0.16, roughly a twelfth of Claude Haiku 4.5.
  Measured end to end through the function on the utterance sets: median about 200 ms, max about 700 ms.
- Key: `TYPESAFE_API_KEY` in Vercel project environment variables; never in the repo.
- Second engine: `claude-haiku-4-5` (Claude Haiku 4.5), chosen because the captain asked for a current, cheap, fast model for a small structured parse.
  Pricing from the Claude pricing page on 2026-09-26: $1 per million input tokens, $5 per million output tokens (cache reads $0.10 per million).
  Upgrade path: `COMMAND_MODEL=claude-sonnet-5` at $2 / $10 per million if A2's parse tests show Haiku misreading places.
- Cost per command: about 1,400 system tokens + 60 user tokens in, about 80 tokens out ≈ $0.0019 on Haiku 4.5 (≈ $0.0037 on Sonnet 5), so 1,000 commands cost about $2.
- Key: `ANTHROPIC_API_KEY` in Vercel project environment variables; never in the repo.
- Failure and degradation: a failing Jev call falls through to Claude; no key, quota exhausted, timeouts, or 429 on every configured engine lead to the `degraded` state with the local parser; the site is fully usable without the function.

### 14.7 Tests (A2 and A1)

- Unit: schema round trips; the prompt contains every catalog id; the handler rejects non-POST, oversized text, and malformed bodies; upstream errors map to the documented status codes (mock the SDK client).
- Contract: a fixture of 12 utterances with expected intents; A2 runs them against the real API once with the key from the environment and records the pass count in the PR (target 11 of 12 or better).
- Client: resolver disambiguation cases (Springfield; "LA" → Los Angeles County; "Cook County" with stateHint Illinois; a school name), local parser parity on the 12 utterances (target 9 of 12).
- Jev: unit tests for candidate extraction, the question set, the answer-to-intent mapping and its invariants, the confidence gate, the client's handling of `picks` and `ask`, and the engine order with both SDKs mocked.
- Live accuracy (`src/command/engines.live.test.ts`, run only with `COMMAND_LIVE=1` and a key, never in CI): both 12-utterance sets plus 20 held-out paraphrases, typos, and a "here" request, each through candidates, the function, and the planner, scored on the planned view against the expected intent's view, with the local parser on the same set.

## 15. About and Data page

A dialog reachable from the `?` button and `about=1`, with a "How to read the map" button in its header that reopens the primer (section 3.15), and these sections in this order:

1. What this is: two sentences and the CDC 2026 mention.
2. How to read it: what "stress" means, levels, bivariate legend, the two correlation numbers, the ecological-fallacy note, county-level measures, favorites, and the command bar.
3. Data: ODIS v3 citation exactly as in `data/README.md` (Hawken, Minar, Choudhary, Kulick, 2026, Johns Hopkins Research Data Repository, DOI 10.7281/T170WN53, CC BY 4.0), the NCESSCH correction summary with a link to `data/README.md`, the Connecticut fill sources with their credit lines from `data/README.md` (ACS 2019-2023, County Health Rankings & Roadmaps 2025, Connecticut Department of Public Health 2024, CT Data Collaborative tract crosswalk), NCES EDGE geocodes 2022-23, Census cartographic boundaries 2023, OpenStreetMap via OpenFreeMap (ODbL, attribution line).
4. Method: unweighted means, fixed national breaks, Spearman with bootstrap or approximate intervals, pairwise deletion, no imputation.
5. Known gaps: crime missing for Connecticut and Puerto Rico and much of the rural Plains; lead and park access missing for about half of schools outside Connecticut.
   Then one Connecticut paragraph: ODIS v3 left most Connecticut values empty because of two join problems (2022 planning-region codes and a County Health Rankings release with only the old counties); Schoolscape uses a file that fills them from current Census, County Health Rankings, and Connecticut Department of Public Health data and recomputes Connecticut's domain scores; crime, violent crime, and incarceration stay missing because ODIS's crime sources have no per-area Connecticut data; lead exposure is an approximation recomputed from ACS data and park access a planning-region proxy; link to `data/README.md`, "Connecticut fill".
6. Built with: the stack list and "The specification and the code were produced by AI agents (Claude) directed by Alexander Yevchenko for the Carolina Data Challenge 2026."

## 16. First release versus later

v1 (this spec, all sections) ships by Sunday 11:00.

Later, in rough priority order:

1. Per-state school files and 1:500k county detail per state (data already measured at 45 KB gz for Texas), to cut the initial schools payload.
2. Rescale-to-view class breaks as a toggle.
3. School district polygons as a fourth level.
4. A neighborhood crime layer for showcase metros from city open data, clearly separated from ODIS.
5. Light theme and narrow layouts.
6. "Explain this view" narrative from Claude grounded in the panel's numbers.

## 17. Work breakdown

### 17.1 How the work is organized

- T0 is the only serial task.
  It fixes the repo layout, installs the stack, defines every contract in Appendix A, writes the catalog, ships fixtures, and leaves a running shell with empty slots.
  Target: 45 minutes, one worker.
- Wave 1: eighteen independent tasks start the moment T0 is on `main`.
  Each task owns the files listed under "Deliverables" and touches nothing else; shared files (`types.ts`, `catalog.json`, `useStore.ts`, `tokens.css`) are frozen after T0 and changed only through I1.
  Each task builds against T0's fixtures and mocks so it does not wait on the pipeline.
  Target: 60 to 90 minutes each, in parallel.
- Wave 2: I1 integrates, then Q1 and Q2 verify.
  Target: 45 to 60 minutes.
- Every task: TypeScript strict, `npm run lint` and `npm test` green, a PR to `main` that names the task id in its title, and a two-line summary of any deviation from this spec.
- Acceptance criteria are written so a reviewer can check them without reading the code.

### 17.2 T0 Foundation (serial, first)

Deliverables: `site/` scaffold (Vite 8, React 19, TS 7 strict, Tailwind 4 with `@theme inline` tokens, shadcn initialized with the components listed in section 11, ESLint 10 flat config, Prettier, Vitest, Playwright config with one smoke test), `site/vercel.json` (section 10.2), `site/data/catalog.json` from section 4 with aliases, `src/lib/types.ts` (Appendix A verbatim), `src/store/useStore.ts` with the full state shape and no-op actions, `src/lib/urlCodec.ts` with tests, `src/lib/loaders.ts` and `dataCache.ts` typed against Appendix B and pointed at `src/test/fixtures/` when `import.meta.env.VITE_USE_FIXTURES` is set, the shell layout with every panel slot rendering a labeled placeholder, `styles/tokens.css` from section 9.2, `MapProvider` context (map instance, `ready` flag, `level`), a `useLevel()` hook implementing section 3.3 thresholds, the `stats` worker interface file with a stub, `analysis/schoolscape/` package skeleton with `config.py` and the CLI accepting `build` and `check`, `requirements.txt` updates, README section.
Fixtures: 10 states, 30 counties, 200 schools sampled from the real CSV, with correct schemas, plus the Appendix C stats cases.

Acceptance:
- `npm ci && npm run build && npm test && npm run lint` succeed from `site/`.
- `npm run dev` shows the dark shell with the map container, the six panel placeholders, and the top bar at 1440x900 with no layout overflow.
- `urlCodec` round-trips every parameter in section 3.10 (unit test).
- `python -m analysis.schoolscape build --dry-run` prints the planned outputs without writing.

### 17.3 Wave 1 tasks

Each entry: Goal · Deliverables · Depends on · Acceptance.

**P1 Boundaries pipeline**
Goal: shapefiles to `states.topo.json` and `counties.topo.json` plus centroids and bboxes.
Deliverables: `boundaries.py`, tests (`download.py` landed in T0 because the fixture builder needs it).
Depends on: T0 (config, paths).
Acceptance: outputs match Appendix B; 52 states and 3,222 counties; gzip sizes within 20% of section 8.2; every ODIS county FIPS present; SHA-256 verified; `check` passes twice in a row.

**P2 Schools and aggregates pipeline**
Goal: `schools/all.json`, `states.json`, `counties.json`, `breaks.json`, `national.json`, `meta.json`, `REPORT.md`.
Deliverables: `schools.py`, `aggregates.py`, `report.py`, tests.
Depends on: T0; uses P1's centroid and bbox helper or computes its own from the shapefiles (agree on `boundaries.centroids()` signature in T0's `config.py` docstring).
Acceptance: 23,595 schools with coordinates; county FIPS agreement 100%; Appendix C reference correlations reproduced to 4 decimals from `national.json`; breaks for `composite` equal section 5.2; the `ctFilled` flag set on exactly the 208 Connecticut rows; deterministic (`check` passes).

**P3 Gazetteer and presets**
Goal: `gazetteer.json` and `presets.json`.
Deliverables: `gazetteer.py`, `presets.py`, tests.
Depends on: T0.
Acceptance: 52 states, 3,167 counties, 8,242 cities, 11,876 districts with bboxes from their schools; the six stories from section 3.8 decode with `urlCodec`.

**M1 Map core and choropleth**
Goal: MapLibre with the themed OpenFreeMap dark style, level machine, state and county fill layers with feature-state classes, crossfades, hover and selection outlines, no-data hatch, thin outlines, click-to-drill, breadcrumb, quick-jump chips, camera helpers with standard padding, first-paint mark.
Deliverables: `MapCanvas.tsx`, `choropleth.ts`, `camera.ts`, `basemap/theme.ts` (+ test), `Breadcrumb.tsx`, `QuickJump.tsx`.
Depends on: T0.
Acceptance: with fixtures, states color by Composite at load and the first-paint mark fires; scrolling from z3.6 to z9 crossfades states to counties to nothing without a visible cut; clicking a state flies to it and the breadcrumb updates; no-data areas show the hatch; a Playwright test asserts the mark and the breadcrumb text.

**M2 Pins (deck.gl)**
Goal: `MapboxOverlay` interleaved with a `ScatterplotLayer` for schools colored by the active scale, a starred layer always visible, hover and click picking, hide-below-z8 rule.
Deliverables: `pins.ts`, `usePins` hook.
Depends on: T0 (`MapProvider` contract, store).
Acceptance: 23,595 fixture-scaled points (use the 200-school fixture tiled to 23k for the perf check) pan at 60 fps at z9; hovering a pin shows the tooltip; starred ids render at z3; layer order keeps labels above pins.

**U1 Layer dock**
Goal: section 3.6.
Deliverables: `LayerDock.tsx`.
Depends on: T0.
Acceptance: A/B selection model behaves exactly as specified; county badge and context note present; keyboard `1` to `7` and `Shift` variants work; presets row dispatches the preset view state.

**U2 Legend**
Goal: univariate and bivariate legends with break labels, level label, no-data and thin swatches, percentile mode labels.
Deliverables: `Legend.tsx`, `lib/scales.ts` (+ tests for class assignment).
Depends on: T0.
Acceptance: class assignment tests pass for boundaries (values equal to a break go to the upper class); the 3x3 grid shows A on the vertical axis and B on the horizontal with layer names; swatches have text alternatives.

**S1 Stats engine**
Goal: worker with Spearman, Pearson, bootstrap, Bonett-Wright interval, histograms, viewport membership helpers, request cancellation.
Deliverables: `stats/*`, `lib/geo.ts`, tests.
Depends on: T0.
Acceptance: Appendix C fixtures reproduce to 6 decimals; ties handled with average ranks; a 23k-pair request returns in under 400 ms in a Node benchmark; stale results are dropped.

**U3 Insight panel**
Goal: sections 3.7, 6.3, 6.4 except compare.
Deliverables: `InsightPanel.tsx`, `Scatter.tsx`, `Distribution.tsx`.
Depends on: T0 (worker interface, mocked results).
Acceptance: all five states render from mocked results; scatter hover highlights the unit via the store; copy strings match section 6.3 exactly; "Data table" opens a sortable table.

**U4 Compare mode**
Goal: section 3.9.
Deliverables: `ComparePanel.tsx`, compare slice actions in a separate file merged by I1, outline layer spec for M1.
Depends on: T0.
Acceptance: pinning, replacing, level reset toast, and clearing behave as specified; A and B colors correct; URL `cmp` round-trips.

**U5 Profile drawer**
Goal: section 3.5 pin tooltip content and the full profile card.
Deliverables: `ProfileDrawer.tsx`.
Depends on: T0.
Acceptance: opens from `s=` in the URL; every indicator grouped by domain with badges; vs county, state, nation ticks computed from aggregates; star toggles; "center on map" calls the camera helper; NCES link is `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID={NCESSCH}`.

**U6 Search**
Goal: section 3.11.
Deliverables: `SearchBox.tsx`, `lib/search.ts` (fuse index over gazetteer and school names).
Depends on: T0.
Acceptance: "los angeles" returns Los Angeles County first; "albertville high" returns the school; keyboard navigation; selecting flies or opens as specified.

**U7 Favorites**
Goal: section 3.12.
Deliverables: `FavoritesPanel.tsx`, `lib/favorites.ts` (localStorage, URL merge), compare table.
Depends on: T0 (M2 draws starred ids from the store).
Acceptance: star persists across reloads; `fav` in the URL merges; the compare table renders six schools with highest-stress cells tinted and badges; "show only starred" dims other pins via a store flag.

**U8 URL state, presets, first-run**
Goal: sections 3.10, 3.8, 3.15 wiring: store to URL sync with push/replace rules, preset loader, first-run hint, share button that appends `fav`.
Deliverables: `lib/urlSync.ts`, `components/ShareButton.tsx`, `FirstRunHint.tsx`.
Depends on: T0.
Acceptance: back button closes a drawer; camera moves do not add history entries; loading `?p=broadband-attainment` reproduces the story; the hint shows once.

**A1 Command bar client**
Goal: sections 3.13, 14.5.
Deliverables: `CommandBar.tsx`, `command/resolver.ts`, `command/localParser.ts`, `command/apply.ts`, tests.
Depends on: T0.
Acceptance: the 12-utterance fixture resolves through `apply` with a mocked function response; disambiguation chips appear for "Springfield"; degraded mode triggers on a 503 and on timeout; the applied chip text matches the spec.

**A2 Command function**
Goal: sections 14.2 to 14.4, 14.6, 14.7.
Deliverables: `api/command.ts`, `api/_lib/*`, tests, `.env.example`.
Depends on: T0.
Acceptance: unit tests pass with a mocked SDK; a real-API smoke run on the 12 utterances passes 11 or more and its output is pasted in the PR; `vercel dev` serves `/api/command`; no key in the bundle (grep `dist/`).

**U9 About and Data**
Goal: section 15.
Deliverables: `AboutDialog.tsx`, content in `src/content/about.md` rendered as React.
Depends on: T0.
Acceptance: every citation and license line present, including the Connecticut fill sources; the Connecticut paragraph of section 15 present.

**D1 Deployment and caching**
Goal: Vercel project config, headers, compression check, environment documentation, a preview deployment.
Deliverables: `vercel.json` final, `site/README.md` deploy section, a preview URL in the PR.
Depends on: T0.
Acceptance: `curl -sI <preview>/data/v1/states.json` shows `cache-control: public, max-age=31536000, immutable` and `content-encoding: br` or `gzip`; `/` is `must-revalidate`; the function responds 405 to GET.

### 17.4 Wave 2

**I1 Integration and polish**
Goal: merge all wave-1 work, replace fixtures with pipeline outputs, wire M2 to M1's map, U4 outlines into `choropleth.ts`, U7 starred ids into `pins.ts`, A1 to A2, run the full loading sequence, fix seams, pixel pass on every panel at 1440x900 and 1920x1080.
Depends on: all wave-1 tasks.
Acceptance: every user story in section 1.3 demonstrable on a preview deployment; no console errors; `npm run build` under 1.2 MB total JS gzip; the six stories work.

**Q1 End-to-end and performance**
Goal: Playwright suite: load, zoom through three levels, bivariate legend, correlation numbers appear, compare two counties, star and compare two schools, command bar happy path and degraded path, permalink round-trip; performance script for section 10.1 budgets against the preview deployment.
Depends on: I1.
Acceptance: suite green; first-paint under 2.0 s in three consecutive runs; frame budget met.

**Q2 Design and accessibility QA**
Goal: color-blind simulation of both palettes with screenshots, contrast audit, keyboard walk-through, reduced-motion check, copy proofread against this spec, README screenshots.
Depends on: I1.
Acceptance: a QA note in the PR with screenshots; any palette nudge stays within the structure of section 9.2 and is reflected in `tokens.css`.

### 17.5 Dependency graph

```
T0 --+-- P1 --+
     +-- P2 --+
     +-- P3 --+
     +-- M1 --+
     +-- M2 --+
     +-- U1 .. U9 --+--> I1 --> Q1, Q2 (parallel) --> ship
     +-- S1 --+
     +-- A1 --+
     +-- A2 --+
     +-- D1 --+
```

## 18. Open questions and assumptions

None of these blocks the build; each is an assumption a worker can act on now.

1. Favorites: confirmed by the captain as "star schools, keep them visible at every zoom, compare starred schools side by side, persist locally and in the permalink"; spec'd in section 3.12.
2. Personal-site domain: not given; the subdomain is a placeholder and hosting is a later concern.
3. Connecticut: resolved by the Connecticut-filled input (section 2); the `flags` bit, `meta.json.placeholders`, About paragraph, and profile note are specified in sections 7, 8.3, and 15.
4. Accent color: the interview chose a teal accent and a purple-to-teal bivariate scheme, which share a hue; section 9.2 resolves the conflict by never using the accent as a map fill and by using a white selection stroke with an accent glow.
5. Structured outputs on Claude Haiku 4.5 and `zod` v4 with the SDK helper are verified in A2 with documented fallbacks (strict tool use; `zod@3.25.x`).
6. Vercel automatic compression of `.json` under `public/` is verified in D1 with a documented fallback (`.json.gz`).
7. The ODIS Technical Report (which defines each scaling exactly) is not in the repo; subtitles say "scaled as stress" where the raw quantity is a "good" one, and the About page keeps the wording general.

## Appendix A. TypeScript contracts (`site/src/lib/types.ts`)

```ts
export type Level = "nation" | "state" | "local";
export type LayerGroup = "score" | "indicator" | "context";
export type Domain = "composite" | "economic" | "education" | "health" | "housing" | "crime" | "gini";
export type Resolution = "tract" | "county";
export type Polarity = "stress" | "neutral";
export type Display = "score" | "pct";

export interface LayerDef {
  id: string;                 // catalog id, e.g. "composite", "poverty", "ctx_hispanic"
  label: string;              // exact CSV column name
  group: LayerGroup;
  domain?: Domain;            // indicators only
  column: string;             // CSV column
  pctColumn?: string;         // "<X> Percentile Rank" for the six scores
  resolution: Resolution;
  polarity: Polarity;
  unit: "score" | "scaled" | "percent" | "gini";
  subtitle: string;
  aliases: string[];          // for the command bar and local parser
  missingShare: number;       // 0..1
  note?: string;              // e.g. "includes county-level components"
}

export type PlaceKind = "state" | "county" | "city" | "district" | "school";
export interface PlaceRef { kind: PlaceKind; id: string; }          // state: STATEFP "06"; county: GEOID "06037"; school: NCESSCH; city/district: "{ST}:{name}"
export interface Camera { lon: number; lat: number; zoom: number; }
export type BBox = [number, number, number, number];                 // [minLon, minLat, maxLon, maxLat]

export interface ViewState {
  camera: Camera;
  layers: [] | [string] | [string, string];   // A, B
  display: Display;
  selected?: PlaceRef;
  compare: { armed: boolean; pins: PlaceRef[] };   // 0..2 pins, same kind
  profile?: string;                            // NCESSCH
  favorites: string[];                         // NCESSCH[]
  favoritesPanel: boolean;
  showOnlyStarred: boolean;
  about: boolean;
  preset?: string;
}

export interface UnitValues { id: string; name: string; parent?: string; n: number; values: Record<string, number | null>; medians?: Record<string, number | null>; }

export interface PairStats { method: "spearman" | "pearson"; r: number | null; ci: [number, number] | null; ciMethod: "bootstrap" | "approx" | null; n: number; nMissing: number; tooFew: boolean; }
export interface InsightRequest { requestId: number; layerA: string; layerB?: string; areas?: { ids: string[]; x: (number | null)[]; y?: (number | null)[] }; schools: { ids: string[]; x: (number | null)[]; y?: (number | null)[] }; bootstrap: { resamples: 1000; seed: 42 }; }
export interface Histogram { bins: number[]; counts: number[]; median: number | null; }
export interface InsightResult { requestId: number; areas?: { spearman: PairStats; pearson: PairStats; histA: Histogram; histB?: Histogram }; schools: { spearman: PairStats; pearson: PairStats; histA: Histogram; histB?: Histogram }; ms: number; }

export interface Intent { action: "explore" | "compare" | "profile" | "clear"; layers: string[]; places: { query: string; kind: PlaceKind | "unknown"; stateHint?: string }[]; display?: Display; note?: string; }
export type CommandOutcome = { status: "applied"; summary: string } | { status: "needs-choice"; place: string; candidates: PlaceRef[] } | { status: "no-match" } | { status: "degraded"; summary: string };
```

Store actions (names fixed by T0, implemented by owners): `setLayerA`, `setLayerB`, `clearLayerB`, `setDisplay`, `setCamera`, `select`, `clearSelection`, `armCompare`, `pinCompare`, `unpinCompare`, `openProfile`, `closeProfile`, `toggleFavorite`, `setFavoritesPanel`, `setShowOnlyStarred`, `setAbout`, `applyPreset`, `applyIntent`, `hoverUnit` (id or null, for scatter and map linking).

## Appendix B. Data file schemas (`site/public/data/v1/`)

Columnar JSON: arrays aligned by index; `null` for missing.

```jsonc
// meta.json
{ "build": "2026-09-27T02:00:00Z", "dataVersion": "v1", "odis": "v3 (2026)", "nces": "EDGE_GEOCODE_PUBLICSCH_2223", "census": "GENZ2023", "input": "index_scores_v3_2026_ct_filled.csv", "counts": { "schools": 23595, "states": 52, "counties": 3167, "countyPolygons": 3222 }, "placeholders": { "connecticut": "filled" } }

// states.topo.json / counties.topo.json: one object each, named "states" / "counties"; every geometry has
// id = STATEFP ("06") / GEOID ("06037") and properties { "name": "California" } / { "name": "Los Angeles" }

// states.json  (index i is the same across arrays)
{ "ids": ["01", "02", ...], "usps": ["AL", "AK", ...], "names": ["Alabama", ...], "n": [400, 76, ...],
  "centroid": [[-86.8, 32.8], ...], "bbox": [[-88.5, 30.2, -84.9, 35.0], ...],
  "measures": { "composite": { "mean": [31.2, ...], "median": [30, ...], "n": [400, ...] }, "crime": { ... }, ... } }

// counties.json  (3,222 entries, ids = GEOID; counties with no school have n 0 and null means)
{ "ids": ["01001", ...], "st": ["01", ...], "names": ["Autauga County", ...], "n": [3, ...], "centroid": [[...]], "bbox": [[...]], "measures": { ... } }

// schools/all.json
{ "ids": ["010000500871", ...], "name": ["Albertville High School", ...], "district": [...], "st": ["AL", ...], "stfp": ["01", ...], "county": ["01095", ...], "countyName": [...], "city": [...], "zip": [...], "sab": [1, 0, ...],
  "lat": [34.2622, ...], "lon": [-86.2049, ...], "flags": [0, ...],   // bit value 1 = ctFilled (section 8.3)
  "values": { "composite": [31, ...], "composite_pct": [63, ...], "economic": [...], "economic_pct": [...], ..., "gini": [0.46, ...], "poverty": [...], ..., "ctx_hispanic": [...] } }

// breaks.json
{ "composite": { "nation": { "quint": [23.7, 25.8, 29.3, 34.0], "terc": [24.9, 30.9] }, "state": { "quint": [23.0, 27.0, 31.0, 37.7], "terc": [...] }, "local": { "quint": [21, 25, 30, 35], "terc": [...] } }, "crime": { ... }, ... }

// national.json
{ "layers": ["composite", "economic", ...],
  "schools": { "n": 23595, "mean": { "composite": 28.3, ... }, "median": { ... }, "spearman": [[1, 0.75, ...], ...], "pearson": [[...]] },
  "counties": { "n": 3167, "spearman": [[...]], "pearson": [[...]] },
  "states": { "n": 52, "spearman": [[...]], "pearson": [[...]] } }

// gazetteer.json
{ "entries": [ { "k": "state", "id": "06", "n": "California", "st": "CA", "bb": [-124.4, 32.5, -114.1, 42.0] },
               { "k": "county", "id": "06037", "n": "Los Angeles County", "st": "CA", "bb": [...] },
               { "k": "city", "id": "CA:Los Angeles", "n": "Los Angeles", "st": "CA", "bb": [...] },
               { "k": "district", "id": "CA:Los Angeles Unified", "n": "Los Angeles Unified", "st": "CA", "bb": [...] } ] }
// school names for search come from schools/all.json

// catalog.json  (copy of site/data/catalog.json; LayerDef[] from Appendix A)
{ "version": 1, "layers": [ { "id": "composite", "label": "Composite Score", "group": "score", "column": "Composite Score", "pctColumn": "Composite Score Percentile Rank", "resolution": "tract", "polarity": "stress", "unit": "score", "subtitle": "Weighted average of the five domains, 0-100, higher = more community stress", "aliases": ["composite", "overall", "stress", "total"], "missingShare": 0, "note": "includes county-level components" }, ... ] }

// presets.json
{ "presets": [ { "id": "broadband-attainment", "label": "Digital divide, education divide", "chapter": "Nationally", "view": { "l": "broadband,college_2yr_plus", "v": "3.6/38.5/-96.5" }, "narration": "Where more households lack broadband, fewer adults hold a college degree: ρ = 0.69 across 23,404 schools, ...", "caveat": "An association across neighborhoods, not proof that wiring homes would raise degrees." }, ... ] }
```

## Appendix C. Test fixtures with expected values

Computed with scipy 1.18.1 and numpy 2.5.3 from the pipeline input `data/index_scores_v3_2026_ct_filled.csv` (Appendix D); area-level values use unrounded area means.
The Economic vs Education rows and the state breaks changed with the Connecticut fill; the Crime rows did not, because Connecticut has no crime values.
`site/src/test/fixtures/stats-cases.json` carries these cases.

Small cases for the stats engine (6-decimal targets):

```
x = [3, 7, 1, 9, 4, 6, 8, 2, 5, 10, 12, 11]
y = [2, 8, 3, 7, 5, 9, 6, 1, 4, 12, 10, 11]
spearman = 0.881119   pearson = 0.881119   (x and y are permutations of 1..12, so both agree)

x = [1, 2, 2, 3, 4, 4, 4, 5]
y = [2, 1, 3, 3, 5, 4, 6, 7]
spearman (average ranks for ties) = 0.920034   pearson = 0.888170
```

Reference values from the full data (4-decimal targets for `national.json` and for P2):

| Pair | Level | Spearman | Pearson | n |
| --- | --- | --- | --- | --- |
| Crime vs Education | schools, national | 0.2419 | 0.0655 | 20,201 |
| Economic vs Education | schools, national | 0.5574 | 0.4927 | 23,406 |
| Crime vs Education | schools, California | 0.2361 | 0.1408 | 2,202 |
| Crime vs Education | county means | 0.3966 | 0.2560 | 2,211 |
| Crime vs Education | state means | 0.1661 | 0.1180 | 50 |
| Economic vs Education | state means | 0.4964 | 0.4785 | 52 |

Bootstrap reference: county means, Crime vs Education, percentile bootstrap, seed 42, 1,000 resamples with numpy's `default_rng(42)`: 95% interval 0.362 to 0.431.
A JavaScript RNG will not reproduce these bounds exactly; S1's test asserts the interval contains 0.3966, has width between 0.05 and 0.10, and is stable across two runs with the same seed.

Composite Score quintile breaks: schools 21 / 25 / 30 / 35; county means 23.0 / 27.0 / 31.0 / 37.7; state means 24.1 / 25.8 / 29.3 / 34.0.

## Appendix D. Evidence

All commands were run in the scout worktree on 2026-09-26 with the repo's `.venv` (pandas 3.0.6, scipy 1.18.1, geopandas 1.1.4, topojson 1.10).

- Column groups and missingness: `data/README.md` "CSV structure" and "Corrected NCESSCH IDs"; `visualizations/README.md` "01 - Data overview"; `visualizations/01-data-overview/missing_by_column.csv`.
- County-level columns: `df.groupby('FIPS County Code')[col].nunique().max()` equals 1 for `Crime`, `Violent crime rate`, `Incarceration rate`, `Infant mortality rate`, `Low birth weight`, `Single-parent households`, `Unemployment`, `Gini index` (in both the fixed and the Connecticut-filled CSV); equals 84 for `Education`, 65 for `Poverty`, 76 for `Lead exposure risk`.
- Los Angeles County: 509 rows; `Crime` unique value 28; standard deviations Education 22.3, Housing 6.5, Health 5.2, Economic 4.8, Composite 5.8, Crime 0.0.
- County counts: 3,167 distinct FIPS; quantiles of schools per county 10% 1, 25% 2, 50% 4, 75% 7, 90% 14, max 509; 586 counties with one school, 1,129 with two or fewer, 523 with ten or more.
- Medians: each `... Median` column has one distinct value (27, 22, 29, 20, 33, 28); `Composite Score Percentile Rank` has Spearman 1.0 with `Composite Score`, range 0 to 100.
- Geocode join: `EDGE_GEOCODE_PUBLICSCH_2223.shp` has 102,268 rows with fields `NCESSCH, LEAID, NAME, ..., CNTY, NMCNTY, LOCALE, LAT, LON, CBSA, ...`; merge on zero-padded `NCESSCH` matched 23,595 of 23,595; `CNTY == FIPS County Code` for all rows; latitude 17.96 to 71.30, longitude -166.53 to -65.44; NCES locale codes: city 5,939, suburb 6,044, town 3,601, rural 8,011.
- Boundaries: `cb_2023_us_state_5m` has 56 features, 52 kept; `cb_2023_us_county_5m` 3,235 features, 3,222 kept; all 3,167 ODIS county FIPS present; 55 polygons have no ODIS school.
- Sizes (gzip level 9): schools columnar 6.07 MB raw / 1.37 MB; per-state split 1.51 MB total (CA 135 KB, TX 123 KB); points-only index 304 KB; county aggregates 166 KB; states TopoJSON 38 KB at 0.01° (28 KB at 0.02°); counties 5m TopoJSON 309 KB at 0.005° (269 KB at 0.01°); counties 500k TopoJSON 614 KB at 0.002°; Texas 500k per-state 45 KB; gazetteer 309 KB; school-name index 328 KB.
- Correlations and breaks: Appendix C.
- Basemap: `curl https://tiles.openfreemap.org/styles/{dark,positron,liberty,bright,fiord}` all HTTP 200; the dark style's first bytes show `"background-color":"rgb(12,12,12)"` and the `openmaptiles` vector source.
- Downloads and checksums: section 8.1; all four URLs returned HTTP 200 with the content lengths listed.
- Package versions and licenses: `npm view <pkg> version license` and PyPI JSON on 2026-09-26 (section 11, section 8.4).

## Appendix E. Sources

- ODIS v3: https://doi.org/10.7281/T170WN53 (CC BY 4.0); the dataset README `data/ODIS README v3.pdf`; the public site https://odis.naf.org/.
- NCES EDGE school geocodes: https://nces.ed.gov/programs/edge/Geographic/SchoolLocations and https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2223.zip.
- Census cartographic boundary files: https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html and https://www2.census.gov/geo/tiger/GENZ2023/shp/.
- OpenFreeMap: https://openfreemap.org/ (free, no API key, no limits, commercial use allowed, attribution required) and https://openfreemap.org/quick_start/ (style URL pattern and attribution text).
- Protomaps (documented fallback): https://docs.protomaps.com/basemaps/downloads (ODbL produced work, 120 GB planet) and https://protomaps.com/api (API key required, free for non-commercial use).
- deck.gl with MapLibre: https://deck.gl/docs/api-reference/mapbox/overview.
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/.
- shadcn/ui on Tailwind v4 and React 19: https://ui.shadcn.com/docs/tailwind-v4.
- Motion: https://motion.dev/docs/react.
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby; `vercel.json`: https://vercel.com/docs/project-configuration/vercel-json; functions quickstart: https://vercel.com/docs/functions/quickstart.
- Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing; models: https://platform.claude.com/docs/en/about-claude/models/overview.
- Fontsource: https://fontsource.org/.
- Carolina Data Challenge 2026: https://cdc.cs.unc.edu/ (September 26-27, 2026, theme "AI for Social Good").
