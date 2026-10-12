# Renegade Solar

The website for Renegade Solar - solar panel installers in Manchester

## Development

The dev environment is managed with [devenv](https://devenv.sh). The shell
activates when you cd into the repo (trust it once with `devenv allow`), or
run one-off commands through `devenv shell`.

- `npm run serve`, or `devenv up` - start the development server
- `npm run build` - build the site in the `_site` directory
- `lint` - lint all files using Biome

**Important Files:**

- ["To Do" list](TODO.md)
- [Pages to edit](src/pages)
- [Accreditations to edit](src/accreditations)
- [Services to edit](src/services)
- [Upload images](src/assets)
- [Credits](CREDITS.md)

**Page grading and search tracking:**

- `node scripts/grade-pages.mjs` grades every page against AGENTS.md - mechanical
  checks in code (meta quality, thin copy, place-name coverage, no-go phrases,
  MCS number accuracy, review-figure drift, broken links) plus Jev fuzzy
  checks (the four EEAT dimensions, searcher intent, quotable answers,
  scaled content, house voice) against Google's quality rater guidance.
  `--csv grades/page-grades.csv` for a sweep, a source path or URL for a
  single page report, `--no-jev` for mechanical only.
- `node scripts/serpdino.mjs positions` reads the tracked keyword positions
  from the Renegade Solar SerpDino project.
- `node scripts/correlate-search.mjs` joins the grades CSV to the SERP
  tracking and writes `grades/page-grades-search.csv` (per page: grade,
  ranking keywords, best position, keywords it should own but doesn't) and
  `grades/tracked-keywords.csv` (per keyword: position, ranking URL, owning
  page, that page's grade).

[renegade-solar.co.uk](https://renegade-solar.co.uk)

