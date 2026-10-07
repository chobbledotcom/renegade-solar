# Renegade Solar

The website for Renegade Solar - solar panel installers in Manchester

**Important Files:**

- ["To Do" list](TODO.md)
- [Pages to edit](src/pages)
- [Accreditations to edit](src/accreditations)
- [Services to edit](src/services)
- [Upload images](src/assets)
- [Credits](CREDITS.md)

**Page grading and search tracking:**

- `bun scripts/grade-pages.js` grades every page against AGENTS.md - mechanical
  checks in code (meta quality, thin copy, place-name coverage, no-go phrases,
  MCS number accuracy, review-figure drift, broken links) plus Jev fuzzy
  checks (the four EEAT dimensions, searcher intent, quotable answers,
  scaled content, house voice) against Google's quality rater guidance.
  `--csv grades/page-grades.csv` for a sweep, a source path or URL for a
  single page report, `--no-jev` for mechanical only.
- `bun scripts/serpdino.js positions` reads the tracked keyword positions
  from the Renegade Solar SerpDino project.
- `bun scripts/correlate-search.js` joins the grades CSV to the SERP
  tracking and writes `grades/page-grades-search.csv` (per page: grade,
  ranking keywords, best position, keywords it should own but doesn't) and
  `grades/tracked-keywords.csv` (per keyword: position, ranking URL, owning
  page, that page's grade).

[renegade-solar.co.uk](https://renegade-solar.co.uk)

