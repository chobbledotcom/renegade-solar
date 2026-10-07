#!/usr/bin/env bun

/**
 * correlate-search.js — joins the page grades from grade-pages.js to the
 * SerpDino SERP tracking for renegade-solar.co.uk, so each graded page
 * carries the keywords it ranks for (or should rank for) and each tracked
 * keyword points at the page that owns it.
 *
 * Inputs:
 *   grades/page-grades.csv      written by: bun scripts/grade-pages.js --csv grades/page-grades.csv
 *   SerpDino API                key from /run/secrets/serpdino_api_key
 *
 * Outputs:
 *   grades/page-grades-search.csv   one row per graded page: grade columns
 *                                   plus keywords ranking to it, its best
 *                                   position, and the keywords it should own
 *                                   but doesn't rank for.
 *   grades/tracked-keywords.csv     one row per tracked keyword: position,
 *                                   ranking URL, the page that owns it, that
 *                                   page's grade.
 *
 * Usage:
 *   bun scripts/correlate-search.js [grades/page-grades.csv]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetchKeywordRows } from "./serpdino.js";

const ROOT = resolve(import.meta.dir, "..");
const GRADES_DIR = join(ROOT, "grades");

const stripSite = (url) =>
  String(url ?? "")
    .replace(/^https?:\/\/(www\.)?[^/]+/i, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\/$/, "") || "/";

const pageUrlOf = (url) => stripSite(url);

/** Minimal CSV reader: quotes, escaped quotes, commas, newlines. */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const parseCsvFile = (file) => {
  const [header, ...lines] = parseCsv(readFileSync(file, "utf8"));
  return lines
    .filter((cells) => cells.length > 1)
    .map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
};

const csvEscape = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const writeCsv = (file, header, rows) => {
  writeFileSync(
    file,
    `${header.join(",")}\n${rows.map((r) => r.map(csvEscape).join(",")).join("\n")}\n`,
  );
  console.error(`written ${file} (${rows.length} rows)`);
};

// ---------------------------------------------------------------------------
// Keyword -> page mapping
//
// Tracked keywords carry the URL that ranked (or nothing). For the ones with
// no ranking, the intended page is derived from the keyword itself: a town
// plus a service slug maps to that local page, a bare service term maps to
// its root page or the homepage. Anything else stays unmapped.
// ---------------------------------------------------------------------------

const TOWNS = [
  "prestwich", "whitefield", "blackley", "middleton", "chadderton", "moston",
  "crumpsall", "cheetham hill", "radcliffe", "bury", "rochdale", "heywood",
  "oldham", "bolton", "salford", "stockport", "trafford", "altrincham",
  "hale", "hale barns", "marple", "bramhall", "saddleworth", "shaw", "royton",
  "lees", "failsworth", "hyde", "didsbury", "chorlton", "withington",
  "rusholme",
];

const SERVICE_MAP = [
  {
    re: /\bev charger|electric vehicle charg|smart ev charger|home ev charger|\b7kw ev|\b22kw ev\b/i,
    slug: "electric-vehicle-charger-installations",
    label: "ev",
  },
  {
    re: /\beicr|electrical safety (certificate|inspection)|electrical inspection report|domestic electrical safety\b/i,
    slug: "electrical-safety-inspections-eicr",
    label: "eicr",
  },
  {
    re: /commercial solar|solar panels for (business|warehouse|factory|hotel|bakery)\b/i,
    slug: "commercial-solar-installations",
    label: "commercial-solar",
  },
  {
    re: /\bbattery storage|home battery|solar battery|battery installer|off peak electricity battery/i,
    slug: "home-battery-installations",
    label: "battery",
  },
  {
    re: /\bsolar\b/i,
    slug: "solar-and-battery-installations",
    label: "solar",
  },
];

const townOf = (keyword) => {
  const k = keyword.toLowerCase();
  const town = TOWNS.find((t) => k.includes(t));
  return town ? town.replace(/ /g, "-") : null;
};

const serviceOf = (keyword) => {
  for (const svc of SERVICE_MAP) {
    if (svc.re.test(keyword)) return svc;
  }
  return null;
};

/** The local page a keyword is aiming at, when the keyword names a town and
 * a service the site has pages for. */
const intendedUrl = (keyword) => {
  const k = keyword.toLowerCase();
  const town = townOf(keyword);
  const svc = serviceOf(keyword);
  if (town && svc) return `/${town}/${svc.slug}/`;
  if (!town && svc) return `/services/${svc.slug}/`;
  return null;
};

// Keywords whose best page is a specific guide, brand or accreditation page
// rather than a service x location page. Checked before the generic mapping.
const SPECIAL_TARGETS = [
  { re: /worth it|payback|how much do solar panels save|how long do solar panels last/i, url: "/are-solar-panels-worth-it-manchester/" },
  { re: /off peak electricity/i, url: "/octopus-go-battery-installer-manchester/" },
  { re: /off grid|off-grid/i, url: "/off-grid-solar-installations-manchester/" },
  { re: /\btrina\b/i, url: "/trina-vertex-solar-panel-installer-manchester/" },
  { re: /\bsolax\b/i, url: "/solax-battery-installer-manchester/" },
  { re: /\bgivenergy\b/i, url: "/givenergy-installer-manchester/" },
  { re: /alpha\s?ess\b/i, url: "/alphaess-battery-installer-manchester/" },
  { re: /\bdmegc\b/i, url: "/dmegc-solar-panel-installer-manchester/" },
  { re: /octopus go/i, url: "/octopus-go-battery-installer-manchester/" },
  { re: /\b0 ?vat|zero (rate )?vat\b/i, url: "/0-vat-solar-panels-batteries-manchester/" },
  { re: /landlord eicr|eicr for landlords/i, url: "/solar-and-eicr-for-landlords-manchester/" },
  { re: /terraced house|period propert|conservation area/i, url: "/solar-panels-conservation-areas-period-properties/" },
  { re: /mcs certified/i, url: "/accreditations/mcs-certified/" },
  { re: /napit/i, url: "/accreditations/napit/" },
  { re: /trustmark/i, url: "/accreditations/trustmark/" },
];

/** SERPs sometimes surface an old alias ({town}-{service}/, /services/{town}/
 * ...); canonicalise those to the current URLs so they join to the grades.
 * Returns the same trailing-slash-stripped form as the byUrl keys. */
const canonicalise = (url) => {
  let u = url;
  const alias = u.match(
    /^\/([a-z-]+?)-(solar-and-battery-installations|commercial-solar-installations|electric-vehicle-charger-installations|electrical-safety-inspections-eicr)\/?$/,
  );
  if (alias) u = `/${alias[1]}/${alias[2]}/`;
  const legacy = u.match(/^\/services\/([a-z-]+)\/([a-z-]+)\/?$/);
  // old structure was /services/{service}/{town}/, now /{town}/{service}/
  if (legacy) u = `/${legacy[2]}/${legacy[1]}/`;
  return u.replace(/\/$/, "") || "/";
};

const main = async () => {
  const argCsv = process.argv.slice(2).find((a) => a.endsWith(".csv"));
const gradesFile = resolve(ROOT, argCsv ?? "grades/page-grades.csv");
  if (!existsSync(gradesFile)) {
    console.error(`missing ${gradesFile} - run bun scripts/grade-pages.js --csv grades/page-grades.csv first`);
    return 1;
  }
  const pages = parseCsvFile(gradesFile).map((r) => ({
    ...r,
    url: pageUrlOf(r.url),
  }));
  const byUrl = new Map(pages.map((p) => [p.url, p]));

  console.error(`fetching SerpDino keywords for renegade-solar.co.uk...`);
  const keywords = await fetchKeywordRows();
  console.error(`${keywords.length} tracked keywords`);

  // keyword -> owning page, by the URL that actually ranks
  const rankedTo = new Map(); // page url -> [{keyword, position}]
  const unranked = [];
  for (const kw of keywords) {
    if (kw.url) {
      const target = canonicalise(pageUrlOf(kw.url));
      const page = byUrl.get(target);
      const owner = page ? page.url : target;
      if (!rankedTo.has(owner)) rankedTo.set(owner, []);
      rankedTo.get(owner).push({ keyword: kw.value, position: kw.position });
    } else {
      unranked.push(kw);
    }
  }

  // for unranked keywords, which graded page should own them
  const intendedTo = new Map(); // page url -> [keyword]
  const unmapped = [];
  for (const kw of unranked) {
    const special = SPECIAL_TARGETS.find((s) => s.re.test(kw.value));
    const target = special?.url ?? intendedUrl(kw.value);
    // byUrl keys are trailing-slash-stripped; intended URLs are not
    const key = target ? target.replace(/\/$/, "") || "/" : null;
    if (key && byUrl.has(key)) {
      if (!intendedTo.has(key)) intendedTo.set(key, []);
      intendedTo.get(key).push(kw.value);
    } else {
      unmapped.push(kw.value);
    }
  }

  mkdirSync(GRADES_DIR, { recursive: true });

  // page-level CSV: grades + the search results that land on each page
  const pageHeader = [
    "url", "title", "page_type", "score", "letter", "eeat_score", "eeat_letter",
    "words", "keyword_count", "best_position", "ranking_keywords",
    "missing_keywords", "failed_checks", "pass", "warn", "fail",
  ];
  const pageRows = pages.map((p) => {
    const ranked = (rankedTo.get(p.url) ?? []).sort((a, b) => a.position - b.position);
    const missing = intendedTo.get(p.url) ?? [];
    const best = ranked.length ? Math.min(...ranked.map((r) => r.position)) : "";
    return [
      p.url,
      p.title,
      p.page_type,
      p.score,
      p.letter,
      p.eeat_score,
      p.eeat_letter,
      p.words,
      ranked.length,
      best,
      ranked.map((r) => `${r.keyword} (#${r.position})`).join("; "),
      missing.join("; "),
      p.failed_checks,
      p.pass,
      p.warn,
      p.fail,
    ];
  });
  writeCsv(join(GRADES_DIR, "page-grades-search.csv"), pageHeader, pageRows);

  // keyword-level CSV
  const kwHeader = [
    "keyword", "position", "ranking_url", "page_score", "page_letter",
    "page_eeat", "intended_page", "note",
  ];
  const kwRows = keywords.map((kw) => {
    const target = kw.url
      ? canonicalise(pageUrlOf(kw.url))
      : (() => {
          const special = SPECIAL_TARGETS.find((s) => s.re.test(kw.value));
          const t = special?.url ?? intendedUrl(kw.value);
          return t ? t.replace(/\/$/, "") || "/" : "";
        })();
    const page = byUrl.get(target);
    let note = "";
    if (!page && target) note = "no graded page";
    else if (page && kw.url && page.url !== target) note = `ranks to an old URL`;
    return [
      kw.value,
      kw.position ?? "",
      kw.url ?? "",
      page?.score ?? "",
      page?.letter ?? "",
      page?.eeat_score ?? "",
      target,
      note,
    ];
  });
  writeCsv(join(GRADES_DIR, "tracked-keywords.csv"), kwHeader, kwRows);

  // console summary
  const rankedCount = keywords.filter((k) => k.position).length;
  const gradedRanked = pages
    .map((p) => ({ p, n: (rankedTo.get(p.url) ?? []).length }))
    .filter((x) => x.n > 0);
  console.log(`\n${pages.length} graded pages, ${keywords.length} tracked keywords, ${rankedCount} ranking`);
  console.log(`pages with rankings: ${gradedRanked.length}; unranked keywords: ${unranked.length} (${intendedTo.size} mapped to an intended page, ${unmapped.length} unmapped)`);
  const worstRanked = gradedRanked
    .filter((x) => Number(x.p.score) < 70)
    .sort((a, b) => Number(a.p.score) - Number(b.p.score))
    .slice(0, 8);
  if (worstRanked.length) {
    console.log("\nRanked pages grading under 70 (these earn traffic and need care):");
    for (const { p, n } of worstRanked) {
      console.log(`  ${p.score} ${p.letter} ${String(n).padStart(2)} kw  ${p.url}`);
    }
  }
  const strongButHidden = pages
    .filter((p) => Number(p.eeat_score) >= 80 && !(rankedTo.get(p.url) ?? []).length)
    .sort((a, b) => Number(b.eeat_score) - Number(a.eeat_score))
    .slice(0, 8);
  if (strongButHidden.length) {
    console.log("\nEEAT >= 80 but no tracked ranking (content is fine, visibility is not):");
    for (const p of strongButHidden) {
      console.log(`  EEAT ${p.eeat_score}  ${p.url}`);
    }
  }
  if (unmapped.length) {
    console.log(`\nUnmapped unranked keywords: ${unmapped.join(", ")}`);
  }
  return 0;
};

/** Entry point, exported so the grading kernel can run the correlation
 * without spawning a process. */
export const runCorrelation = main;

if (import.meta.main) {
  process.exit(await main());
}
