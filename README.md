# CDC2026

**Winner: 1st place, Social Sciences track, Carolina Data Challenge 2026 (UNC Chapel Hill).**

**[STORY.md](STORY.md) is the data story for judges**: what the Schoolscape map shows, what the data says nationally and region by region, and what a policymaker could take from it, in about three minutes.

**[CITATIONS.md](CITATIONS.md) cites every data source, statistical method, software package, and generative AI tool the project used**, including where AI-generated code lives.

## Data

This project uses the [Open Data Index for Schools (ODIS)](https://doi.org/10.7281/T170WN53), version 3, by Hawken, Minar, Choudhary, and Kulick (Johns Hopkins Research Data Repository, 2026), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
See [data/README.md](data/README.md) for the full citation and the CSV's structure.
`data/index_scores_v3_2026_ct_filled.csv` adds Connecticut values that ODIS v3 leaves missing, filled from current Census, County Health Rankings, and Connecticut Department of Public Health data; see [data/README.md](data/README.md#connecticut-fill).

## Analysis

- [visualizations/](visualizations/README.md) - rendered charts with short write-ups, readable on GitHub without running any code.
- [analysis/](analysis/) - the Python scripts that generate them; see [visualizations/README.md](visualizations/README.md#regenerating) for the one-command rerun.

## Schoolscape

[Schoolscape](site/) is an interactive map of community stress around every US public high school, built on the ODIS data for the Carolina Data Challenge 2026.
Each ODIS measure is a layer over a dark map of the United States: states at the national view, counties when you zoom in, and school pins from zoom 8.
[SPEC.md](SPEC.md) is the build specification.
It is live at [schoolscape.alexanderyevchenko.com](https://schoolscape.alexanderyevchenko.com).

Run the app (Node 22 or newer):

```sh
cd site
npm ci
npm run dev                         # the app against site/public/data/v1/
VITE_USE_FIXTURES=1 npm run dev     # the app against the small fixtures in site/src/test/fixtures/
npm run build && npm test && npm run lint
```

Build the data (Python 3.12 or newer, from the repo root, with `pip install -r requirements.txt`):

```sh
python -m analysis.schoolscape build --dry-run   # print the planned outputs
python -m analysis.schoolscape build             # write site/public/data/v1/
python -m analysis.schoolscape check             # rebuild and diff against the committed outputs
python -m analysis.schoolscape fixtures          # rebuild the app fixtures
```

The pipeline reads `data/index_scores_v3_2026_ct_filled.csv` and downloads the NCES school geocodes and Census boundary files into `.cache/schoolscape/`, verified by SHA-256.
