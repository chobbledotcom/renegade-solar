#!/usr/bin/env bun

/**
 * serpdino.js — SerpDino (serpdino.com) SERP tracker API client for Renegade
 * Solar.
 *
 * This repo is Renegade Solar's. The script therefore targets the Renegade
 * Solar SERP project by default and REFUSES to touch any other project
 * unless you explicitly pass --any-project (so you can't accidentally
 * refresh someone else's rankings or spend credits on the wrong account).
 *
 * The API is Bearer-auth'd. The key lives at /run/secrets/serpdino_api_key
 * (env SERPDINO_API_KEY overrides it). Cloudflare rejects default fetch
 * user agents, so every request carries a browser UA.
 *
 * Docs: https://serpdino.com/api-docs
 *
 * Examples (project id optional — defaults to Renegade Solar):
 *   bun scripts/serpdino.js projects
 *   bun scripts/serpdino.js keywords
 *   bun scripts/serpdino.js keywords --match "solar"
 *   bun scripts/serpdino.js refresh --match "solar"
 *   bun scripts/serpdino.js refresh --all --dry-run
 *   bun scripts/serpdino.js positions --match "solar"
 *   # other projects are read-only-blocked unless you opt in:
 *   bun scripts/serpdino.js positions <other-project-id> --any-project
 */

import { readFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";

const BASE = "https://serpdino.com";
const KEY_FILE = "/run/secrets/serpdino_api_key";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// The only project this repo works on.
const PROJECT_ID = "69c471892f8cc1f804c10474";
const DOMAIN = "renegade-solar.co.uk";

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

const loadKey = () => {
  const env = process.env.SERPDINO_API_KEY;
  if (env) return env.trim();
  try {
    return readFileSync(KEY_FILE, "utf8").trim();
  } catch {
    return die(`no SERPDINO_API_KEY env var and cannot read ${KEY_FILE}`);
  }
};

const api = async (key, path, method = "GET", payload) => {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": UA,
        Accept: "application/json",
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: { message: String(err) } };
  }
};

const requireOk = (res, what) => {
  if (res.status !== 200 || !res.body.success) {
    die(
      `error ${what}: HTTP ${res.status} ${res.body.message ?? res.body.raw ?? JSON.stringify(res.body).slice(0, 300)}`,
    );
  }
  return res.body;
};

const getProjects = async (key) =>
  requireOk(await api(key, "/api/projects"), "listing projects").projects;

const findProject = async (key, projectId) => {
  const proj = (await getProjects(key)).find((p) => p._id === projectId);
  if (!proj) die(`project ${projectId} not found (or belongs to another user)`);
  return proj;
};

const normaliseDomain = (domain) =>
  String(domain ?? "")
    .toLowerCase()
    .replace(/^www\./, "");

const resolveProject = async (key, opts) => {
  const pid = opts.project ?? PROJECT_ID;
  const proj = await findProject(key, pid);
  if (
    !opts.anyProject &&
    (pid !== PROJECT_ID ||
      normaliseDomain(proj.domain) !== normaliseDomain(DOMAIN))
  ) {
    die(
      `refusing to touch ${proj.name} (${proj.domain}) - this repo only works on the ` +
        `Renegade Solar project (${DOMAIN}). Re-run with --any-project to override.`,
    );
  }
  return proj;
};

// keyword-updates response data is keyed by keyword id; each entry nests the
// keyword document under `keyword` and its dated checks under `updates`.
const getKeywords = async (key, projectId) => {
  const body = requireOk(
    await api(key, `/api/projects/keyword-updates?projectId=${projectId}`),
    "fetching keywords",
  );
  return body.data ?? {};
};

const keywordValue = (entry) => entry.keyword?.value ?? "";

// Best (lowest) position across the most recent checks for a keyword, plus
// the URL that achieved it.
const latestPosition = (entry) => {
  const updates = (entry.updates ?? [])
    .map((update) => update.position)
    .filter((p) => typeof p?.position === "number" && p.position > 0);
  if (!updates.length) return { position: null, url: null };
  const best = updates.reduce((a, b) => (a.position <= b.position ? a : b));
  return { position: best.position, url: best.url ?? null };
};

const filterKeywords = (keywords, match) => {
  if (!match) return keywords;
  const rx = new RegExp(match, "i");
  return Object.fromEntries(
    Object.entries(keywords).filter(([, entry]) =>
      rx.test(keywordValue(entry)),
    ),
  );
};

const cmdProjects = async (key) => {
  for (const p of await getProjects(key)) {
    const mark = p._id === PROJECT_ID ? " <- Renegade" : "";
    const count = String((p.keywords ?? []).length).padEnd(4);
    console.log(
      `${p._id}  ${p.name.padEnd(28)} ${p.domain.padEnd(42)} keywords=${count} freq=${p.updateFrequency}${mark}`,
    );
  }
};

const cmdKeywords = async (key, opts) => {
  const proj = await resolveProject(key, opts);
  const keywords = filterKeywords(await getKeywords(key, proj._id), opts.match);
  const entries = Object.entries(keywords).sort((a, b) =>
    keywordValue(a[1]).localeCompare(keywordValue(b[1])),
  );
  for (const [id, entry] of entries) {
    const { position } = latestPosition(entry);
    const posText = position === null ? "-" : `#${position}`;
    const kw = entry.keyword ?? {};
    console.log(
      `${id}  ${posText.padStart(5)}  [${kw.geoCode ?? "?"}-${kw.langCode ?? "?"}]  ${keywordValue(entry)}`,
    );
  }
  console.log(`\n${entries.length} keyword(s)`);
};

const selectKeywords = (allKeywords, opts) => {
  if (opts.all) return allKeywords;
  if (!opts.match) die("refresh needs --match REGEX or --all");
  return filterKeywords(allKeywords, opts.match);
};

const cmdRefresh = async (key, opts) => {
  const proj = await resolveProject(key, opts);
  const keywords = selectKeywords(await getKeywords(key, proj._id), opts);
  const ids = Object.keys(keywords);
  if (ids.length === 0) die("no keywords matched");
  if (opts.dryRun) {
    console.log(`[dry-run] would refresh ${ids.length} keyword(s):`);
    for (const id of ids.sort()) {
      console.log(`  ${id}  ${keywordValue(keywords[id])}`);
    }
    return;
  }
  const res = await api(key, "/api/scrape/new-keywords", "POST", {
    projectId: proj._id,
    keywordIds: ids,
  });
  requireOk(res, "refresh");
  console.log(`OK: ${res.body.message ?? ""}`);
  console.log(`triggered fresh SERP check for ${ids.length} keyword(s)`);
};

const cmdPositions = async (key, opts) => {
  const proj = await resolveProject(key, opts);
  const keywords = filterKeywords(await getKeywords(key, proj._id), opts.match);
  const rows = Object.entries(keywords).map(([, entry]) => ({
    ...latestPosition(entry),
    value: keywordValue(entry),
  }));
  rows.sort(
    (a, b) =>
      (a.position === null) - (b.position === null) ||
      (a.position ?? 0) - (b.position ?? 0),
  );
  for (const row of rows) {
    const posText = row.position === null ? "not in top" : `#${row.position}`;
    const url = row.url
      ? ` ${row.url.replace(/^https?:\/\/(www\.)?/, "")}`
      : "";
    console.log(`${posText.padStart(10)}  ${row.value}${url}`);
  }
  console.log(`\n${rows.length} keyword(s)`);
};

const parseArgv = (argv) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      match: { type: "string" },
      all: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      project: { type: "string" },
      "any-project": { type: "boolean", default: false },
    },
  });
  return { opts: values, positionals };
};

/** Every tracked keyword for the Renegade Solar project, best-first:
 * { keyword, position, url }. Shared with correlate-search.js. */
export const fetchKeywordRows = async () => {
  const key = loadKey();
  const proj = await resolveProject(key, {});
  const keywords = await getKeywords(key, proj._id);
  const rows = Object.entries(keywords).map(([, entry]) => ({
    ...latestPosition(entry),
    value: keywordValue(entry),
  }));
  rows.sort(
    (a, b) =>
      (a.position === null) - (b.position === null) ||
      (a.position ?? 0) - (b.position ?? 0),
  );
  return rows;
};

const usage = () =>
  console.log(`Usage: bun scripts/serpdino.js <command> [options]

Commands:
  projects                list all SerpDino projects
  keywords                list tracked keywords with latest position
  positions               keyword -> position + ranking URL, best first
  refresh                 trigger a fresh SERP check

Options:
  --match <regex>   filter keywords by regex
  --all             refresh every keyword (refresh only)
  --dry-run         show what refresh would do
  --project <id>    override project id (blocked without --any-project)
  --any-project     allow working on a project other than Renegade Solar`);

const main = async () => {
  const key = loadKey();
  const { opts, positionals } = parseArgv(process.argv.slice(2));
  const [cmd, ...rest] = positionals;
  if (!cmd || cmd === "help" || opts.help) return usage() ?? 0;
  const projectOpt = { project: opts.project ?? rest[0], anyProject: opts["any-project"] };
  switch (cmd) {
    case "projects":
      return cmdProjects(key);
    case "keywords":
      return cmdKeywords(key, { ...projectOpt, match: opts.match });
    case "positions":
      return cmdPositions(key, { ...projectOpt, match: opts.match });
    case "refresh":
      return cmdRefresh(key, {
        ...projectOpt,
        match: opts.match,
        all: opts.all,
        dryRun: opts["dry-run"],
      });
    default:
      console.error(`unknown command '${cmd}'`);
      usage();
      return 1;
  }
};

if (import.meta.main) {
  process.exit(await main());
}
