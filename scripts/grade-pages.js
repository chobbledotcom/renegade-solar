#!/usr/bin/env bun

/**
 * Grades every Renegade Solar page against the house rules in AGENTS.md.
 *
 * Mechanical checks (plain code) catch what a regex can: meta title and
 * description quality, thin copy, place-name coverage, the AGENTS.md no-go
 * and voice patterns, em-dashes, US spellings, stale dates and tariff
 * figures, template leakage, broken links, MCS number accuracy, review
 * figures that have drifted from src/_data/reviews.json, and unsupported
 * headline claims (50% savings, zero bills, whole-house backup).
 *
 * Jev checks (TypeSafe System One via the OpenCode zen API) make the
 * judgement calls: the four EEAT dimensions, searcher intent, quotable
 * answers, people-first substance, concrete facts, house voice, cliches,
 * scaled/templated content, choice support, social proof, honest limits,
 * meta accuracy and keyword stuffing. Each question quotes Google's own
 * quality-rater guidance, spam policies or helpful-content self-assessment,
 * and each payload carries same-type sibling URLs so scaled content is
 * judged against the page's real family.
 *
 * Usage:
 *   bun scripts/grade-pages.js                                 # every gradeable page
 *   bun scripts/grade-pages.js src/locations/prestwich.md      # one page, full report
 *   bun scripts/grade-pages.js /prestwich/                     # URL shorthand
 *   bun scripts/grade-pages.js locations                       # a directory
 *   bun scripts/grade-pages.js --type local --limit 10         # sweep one type
 *   bun scripts/grade-pages.js --csv renegade-grades.csv       # batch to CSV
 *   bun scripts/grade-pages.js <target> --no-jev               # mechanical only
 *   bun scripts/grade-pages.js --list-checks
 *
 * The Jev key comes from OPENCODE_API_KEY (or .env) or
 * /run/secrets/opencode_api_key. Grading fails loudly without it; --no-jev
 * runs the mechanical checks alone but must never be shipped as a full grade.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dir, "..");
const SITE_URL = "https://www.renegade-solar.co.uk";
const ZEN_SYSTEMONE_URL = "https://opencode.ai/zen/v1/systemone";
const DEFAULT_MODEL = "jev-1.13";
const DEFAULT_KEY_FILE = "/run/secrets/opencode_api_key";

// Payload guard on the prose sent to Jev per page; an over-limit state
// returns HTTP 400 and quietly degrades the page to mechanical-only grading.
const MAX_BODY_CHARS = 24000;
const MAX_LINKS = 80;

// Sample of same-type sibling URLs sent with each Jev payload for the
// scaled-content question.
const MAX_SIBLINGS = 6;

const CONTENT_DIRS = [
  "pages",
  "services",
  "locations",
  "accreditations",
  "news",
  "properties",
];

// Utility pages with nothing to grade. They stay in the URL map so links
// to them still resolve.
const SKIP_GRADE = new Set([
  "pages/not-found.md",
  "pages/thank-you.md",
]);

// Hub pages that list other pages and are thin by design.
const LISTING_PAGES = new Set([
  "pages/services.md",
  "pages/news.md",
  "pages/gallery.md",
  "pages/accreditations.md",
]);

// AGENTS.md "Where voice applies": legal policies, accreditation details
// and contact data sit outside the house voice, so those checks skip them.
const VOICE_EXEMPT_DIRS = ["accreditations/"];
const VOICE_EXEMPT = new Set([
  "pages/complaints.md",
  "pages/social-value-policy.md",
  "pages/documents.md",
]);
const VOICE_CHECKS = new Set([
  "house_voice",
  "cliche_score",
  "no_go_phrases",
  "voice_anti_patterns",
  "we_voice",
  "contractions",
  "exclamations",
  "emoji_check",
  "scattered_bold",
]);

const ALL_TYPES = [
  "service",
  "local",
  "location",
  "page",
  "accreditation",
  "news",
  "property",
];
const SELLING_TYPES = ["service", "local", "location"];

// ---------------------------------------------------------------------------
// Page discovery and extraction
// ---------------------------------------------------------------------------

const path = (...parts) => join(ROOT, ...parts);

const walkMarkdown = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(full);
    return entry.name.endsWith(".md") && !entry.name.startsWith("_")
      ? [full]
      : [];
  });
};

const relPath = (file) => relative(ROOT, file).split("\\").join("/");

/** Content files live under src/, and every page-type, skip-list and
 * voice-exempt rule is written against the src-relative path. */
const contentRel = (file) => relPath(file).replace(/^src\//, "");

const allContentFiles = () =>
  CONTENT_DIRS.flatMap((dir) => walkMarkdown(path("src", dir)));

const splitFrontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  return { data: Bun.YAML.parse(m[1]) ?? {}, body: text.slice(m[0].length) };
};

const readPage = (file) => splitFrontmatter(readFileSync(file, "utf8"));

const normaliseUrl = (url) => {
  const clean = String(url).split("#")[0].split("?")[0];
  if (!clean || clean === "/") return "/";
  return clean.endsWith("/") ? clean : `${clean}/`;
};

const detectPageType = (rel) => {
  if (rel.startsWith("pages/")) return "page";
  if (rel.startsWith("services/")) {
    return rel.split("/").length > 2 ? "local" : "service";
  }
  if (rel.startsWith("locations/")) return "location";
  if (rel.startsWith("accreditations/")) return "accreditation";
  if (rel.startsWith("news/")) return "news";
  if (rel.startsWith("properties/")) return "property";
  return "page";
};

/** Town name for a location or local page. Location hubs use their own
 * link_title; local pages look the town up in locations/, falling back to
 * the slug, which is also how a misspelt slug surfaces (rushholme). */
const townFor = (x, fm) => {
  if (x.pageType === "location") {
    return fm.link_title || titleCase(x.url.split("/").filter(Boolean)[0] ?? "");
  }
  if (x.pageType !== "local") return "";
  const slug = x.url.split("/").filter(Boolean)[0] ?? "";
  const hubFile = path("src", "locations", `${slug}.md`);
  if (existsSync(hubFile)) {
    const hub = readPage(hubFile).data;
    return hub.link_title || hub.title || titleCase(slug);
  }
  return titleCase(slug);
};

const titleCase = (slug) =>
  String(slug)
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

const firstH1 = (md) => {
  const m = md.match(/^# (.+)$/m);
  return m ? m[1].trim() : "";
};

/** Markdown to plain prose: markup, images, code and template tags dropped
 * so word counts and phrase checks see real copy. */
const markdownToText = (md) =>
  md
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<a\s[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, " ")
    .replace(/(\*\*|__|\*|`)/g, " ")
    .replace(/^\s*>\s?/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();

/** House copy only: blockquotes and inline quoted speech removed, because
 * the voice rules do not apply inside quotation marks (AGENTS.md). Short
 * quoted phrases survive; only spans of three or more words are stripped. */
const stripQuoted = (md) =>
  md
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/"[^"\n]*?\s[^"\n]*?\s[^"\n]*?"/g, " ")
    .replace(/\u201c[^\u201d\n]*?\s[^\u201d\n]*?\s[^\u201d\n]*?\u201d/g, " ");

const faqMarkdown = (faqs) =>
  (Array.isArray(faqs) ? faqs : [])
    .map((f) => `### ${f?.q ?? f?.question ?? ""}\n\n${f?.a ?? f?.answer ?? ""}`)
    .join("\n\n");

/** The page's own copy in render order: hero standfirst, markdown body,
 * then the FAQs the layout prints. */
const pageMarkdown = (pageType, fm, body) => {
  const parts = [];
  if (pageType !== "location" && typeof fm.hero_sub === "string") {
    parts.push(fm.hero_sub);
  }
  parts.push(body);
  parts.push(faqMarkdown(fm.faqs));
  return parts.filter(Boolean).join("\n\n");
};

const ASSET_RE = /\.(jpe?g|png|gif|webp|svg|pdf|css|js|ico|mp4|webm)$/i;

const isPageHref = (target) =>
  target.startsWith("/") &&
  !target.startsWith("//") &&
  !target.startsWith("/assets/") &&
  !ASSET_RE.test(target.split("?")[0]);

const pushLink = (links, seen, text, href) => {
  const target = href?.trim() ?? "";
  if (!isPageHref(target)) return;
  const norm = normaliseUrl(target);
  const label = markdownToText(text ?? "");
  const key = `${norm}|${label}`;
  if (norm === "/" || !label || seen.has(key)) return;
  seen.add(key);
  links.push({ text: label, href: norm });
};

/** Internal page links from the copy: markdown links and raw anchors. */
const extractLinks = (md) => {
  const links = [];
  const seen = new Set();
  for (const m of md.matchAll(/(?<!!)\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) {
    pushLink(links, seen, m[1], m[2]);
  }
  for (const m of md.matchAll(
    /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    pushLink(links, seen, m[2], m[1]);
  }
  return links.slice(0, MAX_LINKS);
};

const extractAlts = (md) =>
  [...md.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)].map((m) => m[1].trim());

const metaTitleOf = (fm) => (typeof fm.title === "string" ? fm.title : "");

const metaDescriptionOf = (fm) =>
  typeof fm.description === "string" ? fm.description : "";

// The layouts render the h1 as heading || link_title || title (page-hero)
// or the markdown's own # heading, so the effective h1 follows the same
// chain the hero uses.
const headingOf = (fm, body) => {
  if (typeof fm.heading === "string" && fm.heading.trim()) {
    return { text: fm.heading, source: "frontmatter" };
  }
  const h1 = firstH1(body);
  if (h1) return { text: h1, source: "markdown" };
  if (typeof fm.link_title === "string" && fm.link_title.trim()) {
    return { text: fm.link_title, source: "fallback" };
  }
  return { text: metaTitleOf(fm), source: metaTitleOf(fm) ? "fallback" : "none" };
};

const metaFieldsOf = (fm) =>
  [
    ["title", metaTitleOf(fm)],
    ["description", metaDescriptionOf(fm)],
  ].filter(([, v]) => v);

/** Data-driven listing pages render content from other files and data; the
 * source markdown alone would understate them. Append what the layout
 * actually renders so grading sees the page a visitor sees. */
const listingContent = (rel) => {
  if (rel === "pages/reviews.md") {
    const data = reviewsFacts();
    // blockquoted: customer voices are exempt from the house voice checks
    return (data.reviews ?? [])
      .slice(0, 30)
      .map(
        (r) =>
          `> **${r.title ?? "Review"}**\n>\n${String(r.review ?? "")
            .slice(0, 280)
            .split(/\r?\n/)
            .map((line) => `> ${line}`)
            .join("\n")}`,
      )
      .join("\n\n");
  }
  if (rel === "pages/news.md") {
    return walkMarkdown(path("src", "news"))
      .map((f) => {
        const p = readPage(f);
        return `### ${p.data.link_title ?? p.data.title ?? ""}\n\n${p.data.description ?? ""}`;
      })
      .join("\n\n");
  }
  if (rel === "pages/services.md") {
    return SERVICE_INDEX.map((s) => {
      const f = path("src", "services", `${s.slug}.md`);
      if (!existsSync(f)) return "";
      const p = readPage(f);
      return `### ${p.data.title ?? ""}\n\n${p.data.description ?? ""}`;
    })
      .filter(Boolean)
      .join("\n\n");
  }
  if (rel === "pages/accreditations.md") {
    return walkMarkdown(path("src", "accreditations"))
      .map((f) => {
        const p = readPage(f);
        return `### ${p.data.title ?? ""}\n\n${p.data.snippet ?? ""}`;
      })
      .join("\n\n");
  }
  return "";
};

/** URL for a content file without an explicit permalink: src/pages/ maps to
 * the site root via pages.json ("/{{ page.fileSlug }}/"), everything else
 * uses its source path. */
const fallbackUrl = (rel) => {
  if (rel.startsWith("pages/")) {
    const slug = rel.replace(/\.md$/, "").split("/").pop();
    return `/${slug}/`;
  }
  return `/${rel.replace(/\.md$/, "")}/`;
};

/** Build the extraction state for one page. */
const extractPage = (file, forcedType) => {
  const rel = contentRel(file);
  const { data: fm, body } = readPage(file);
  const pageType = forcedType || detectPageType(rel);
  const md = [pageMarkdown(pageType, fm, body), listingContent(rel)]
    .filter(Boolean)
    .join("\n\n");
  const houseMd = stripQuoted(md);
  const prose = markdownToText(md);
  const proseHouse = markdownToText(houseMd);
  const heading = headingOf(fm, body);
  const x = {
    file: rel,
    url: normaliseUrl(
      typeof fm.permalink === "string" ? fm.permalink : fallbackUrl(rel),
    ),
    pageType,
    title: metaTitleOf(fm),
    heading: heading.text,
    headingSource: heading.source,
    metaTitle: metaTitleOf(fm),
    metaDescription: metaDescriptionOf(fm),
    markdown: md,
    houseMarkdown: houseMd,
    prose,
    proseHouse,
    words: prose.split(/\s+/).filter(Boolean).length,
    links: extractLinks(md),
    h1Count: (body.match(/^# /gm) ?? []).length,
    subCount: (body.match(/^#{2,3} /gm) ?? []).length,
    faqCount: Array.isArray(fm.faqs) ? fm.faqs.length : 0,
    alts: extractAlts(body),
    metaFields: metaFieldsOf(fm),
    // the close of the page's own copy, before the FAQs
    tail: markdownToText(stripQuoted(body)).slice(-400),
  };
  return { ...x, town: townFor(x, fm) };
};

// ---------------------------------------------------------------------------
// Mechanical checks
//
// Each check fn(extraction, urlMap) returns [status, goodness, note];
// status is PASS, WARN, FAIL or SKIP, and SKIP drops it from the total.
// ---------------------------------------------------------------------------

const hitsOf = (patterns, text) =>
  patterns.filter(([re]) => re.test(text)).map(([, label]) => label);

const listHits = (hits) => hits.slice(0, 5).join(", ");

const US_SPELLING_RE =
  /\b(color|colors|center|centers|centered|favorite|favorites|organiz(e|es|ed|ing|ation)|speciali[z](e|es|ed|ing)|recogniz(e|es|ed)|analyz(e|es|ed|ing)|optimiz(e|es|ed|ing|ation)|traveling|traveled|jewelry|gray|aluminum|meter|meters)\b/gi;

// The AGENTS.md no-go list plus the brochure/AI tells a regex can catch.
// Quoted speech is stripped first, so a customer's own wording is exempt.
const NO_GO_PATTERNS = [
  [/\bowt\b|\bnowt\b|\bour kid\b|\bay up\b|by 'eck|ee bah gum/i, "northern marker"],
  [/\bchampion\b(?!ship)/i, "champion as adjective"],
  [/\bproper (good|job|nightmare|ballache|state)\b|\bdead (good|easy|simple|chuffed)\b/i, "proper/dead as intensifier"],
  [/'appy|\bsummat\b|\bfella\b|\bme (house|roof|battery|panels)\b/i, "phonetic accent spelling"],
  [/salt of the earth|honest as the day/i, "salt of the earth"],
  [/\bno[- ]nonsense\b/i, "no-nonsense"],
  [/(^|[.!]\s+)no hard sell\.?\s*$/im, "no-hard-sell fragment closer"],
  [/\bthe lot\.|\bno messing\b/i, "fragment closer"],
  [/\bpassionate about\b|\bwe believe\b|\bour mission\b/i, "belief statement"],
  [/\bthe ultimate\b|\bcutting[- ]edge\b|\bgame[- ]chang/i, "overselling modifier"],
  [/\blook no further\b|\byour search ends\b/i, "search-ending cliche"],
  [/\bin the heart of\b|\bnestled\b|\bvibrant\b|\bbustling\b/i, "travel-brochure filler"],
  [/\ba testament to\b|\bwe take pride in\b|\bproud to (serve|offer)\b/i, "pride boilerplate"],
  [/\bseamless(ly)?\b|\beffortless(ly)?\b|\bhassle[- ]free\b/i, "smoothness claim"],
  [/\bharness(ing)? the power of the sun\b|\bpower of the sun\b/i, "sun-power cliche"],
  [/\bbright(fen)? your (future|tomorrow)\b|\bgreen revolution\b|\bshining example\b/i, "greenwash cliche"],
  [/\b100% safe\b|\bcompletely safe\b|\btotally safe\b|\brisk[- ]free\b/i, "absolute safety claim"],
  [/\bperfect (for any|addition|choice)\b|\bideal for any(one| occasion)\b/i, "perfect for any"],
];

// Voice anti-patterns from AGENTS.md worth a look but not always wrong.
const VOICE_PATTERNS = [
  [/\bimagine\b|\bpicture (a|the|your)\b/i, "imagine/picture"],
  [/\bnot just\b|\bmore than just\b/i, "not just X"],
  [/\band yes,/i, "and yes, ..."],
  [/\bnot [^.!?]{3,60}, not [^.!?]{3,60} - /i, "not X, not Y - Z"],
  [/\bthe rest is history\b|\brenegade solar followed\b/i, "cinematic closer"],
  [/\bwe've got you covered\b|\bwe've got it covered\b/i, "covered cliche"],
];

// AGENTS.md: ratings and review counts change; tariff figures went stale
// site-wide once already (SEO-OPPORTUNITIES.md, August 2026 fixes).
const DATED_PATTERNS = [
  [/\b(valid|current|certified) until\b|\bexpires?\b/i, "expiry wording"],
  [/\bnew for (the )?20\d\d\b|\bthis (summer|winter|year)'s\b/i, "seasonal framing"],
  [/\b\d{1,2}(\.\d{1,2})?p\s*\/?\s*k?wh\b/i, "tariff rate in copy"],
  [/\b\d{1,2}p per (kwh|unit)\b/i, "unit rate in copy"],
  [/\b20\d\d (offer|deal|scheme)\b/i, "dated offer"],
];

// AGENTS.md "Write For Customers, Not Researchers": research language never
// reaches the page.
const WORKINGS_PATTERNS = [
  [/\b(the )?(source|post|posts|photographs?|screenshots?|records?) (in|says|show|supports?|establish)/i, "citing research material"],
  [/\bas evidence\b|\bevidence (shows|suggests|supports|establishes)\b/i, "evidence language"],
  [/\bthe repository\b|\bsource file\b|\bresearch notes?\b/i, "repository talk"],
  [/\bwe have not repeated\b|\bnot presented as\b|\bdo not imply\b/i, "editorial-process talk"],
  [/\bbeeper\b/i, "Beeper"],
  [/\bthis page (lists|says|shows|covers)\b/i, "page referencing itself"],
];

// Placeholders, generation artefacts and unrendered values that survived
// into published copy. Any hit is a plain bug.
const LEAKAGE_PATTERNS = [
  [
    /\[\s*(insert|add|your|town|venue|name|placeholder|page)[^\]]*\](?!\()/i,
    "[placeholder]",
  ],
  [/\bTODO\b|\bTBC\b|\bFIXME\b|\bXXX\b/, "TODO/TBC marker"],
  [/lorem ipsum/i, "lorem ipsum"],
  [/\bundefined\b|\[object Object\]|\bNaN\b/, "undefined/NaN"],
  [
    /\bas an ai\b|here(?:'s| is) (?:the|a|your) (?:rewritten|updated|revised)\b/i,
    "LLM preamble",
  ],
  [/data-(start|end)=/i, "ChatGPT export attribute"],
];

// Unrendered template code only counts in head fields; the body can carry
// legitimate Liquid (the homepage interpolates the live review count).
const META_LEAKAGE_PATTERNS = [
  ...LEAKAGE_PATTERNS,
  [/\{\{|\{%|\$\{/, "unrendered template code"],
];

// Link text that means nothing out of context (WCAG 2.4.4).
const VAGUE_ANCHOR_RE =
  /^(click )?here$|^(read|find out|learn|see) more$|^(this|that|the) (page|link|one)$|^this$|^link$|^more$/i;

const UNCONTRACTED_RE =
  /\b(we have|we will|we are|it is|do not|does not|did not|is not|are not|cannot|you are|that is|there is|we would)\b/gi;
const CONTRACTED_RE =
  /\b(we've|we'll|we're|it's|don't|doesn't|didn't|isn't|aren't|can't|you're|that's|there's|we'd)\b/gi;

const countMatches = (re, text) => (text.match(re) ?? []).length;

const checkMetaTitleLength = (x) => {
  const n = x.metaTitle.length;
  if (n === 0) return ["FAIL", 0, "no title in front matter"];
  // The August 2026 audit standard: every title ~61 characters or under.
  if (n > 65) return ["FAIL", 0, `${n} chars (target <= 61)`];
  if (n > 61 || n < 15) return ["WARN", 0.5, `${n} chars (target <= 61)`];
  return ["PASS", 1, `${n} chars`];
};

const checkMetaDescriptionPresent = (x) =>
  x.metaDescription.trim()
    ? ["PASS", 1, "present"]
    : ["FAIL", 0, "no meta description in front matter"];

const checkMetaDescriptionLength = (x) => {
  const n = x.metaDescription.length;
  if (!n) return ["SKIP", 0, "no meta description to measure"];
  if (n > 175) return ["FAIL", 0, `${n} chars (target < 160)`];
  if (n >= 160 || n < 70) return ["WARN", 0.5, `${n} chars (target 70-159)`];
  return ["PASS", 1, `${n} chars`];
};

// AGENTS.md location-page structure: the description mentions the location,
// the service and MCS certification. Service terms stay explicit.
const SERVICE_TERM_RE =
  /\b(solar|battery|ev charger|electric vehicle|eicr|electrical|electrician)\b/i;
const CREDENTIAL_TERM_RE =
  /\b(MCS|TrustMark|NAPIT|HIES|Octopus|Checkatrade|Trustpilot)\b/i;

const checkMetaKeywords = (x) => {
  const meta = x.metaDescription;
  if (!meta) return ["SKIP", 0, "no meta description"];
  const missing = [];
  if (!SERVICE_TERM_RE.test(meta)) missing.push("service term");
  if (x.town && !meta.toLowerCase().includes(x.town.toLowerCase())) {
    missing.push(x.town);
  }
  if (SELLING_TYPES.includes(x.pageType) && !CREDENTIAL_TERM_RE.test(meta)) {
    missing.push("MCS/certification");
  }
  if (!missing.length) {
    return ["PASS", 1, "service term, place and credential present"];
  }
  return [
    "WARN",
    missing.length === 1 ? 0.5 : 0,
    `meta description missing: ${missing.join(", ")}`,
  ];
};

const checkHeading = (x) => {
  if (!x.heading) {
    return ["FAIL", 0, "no h1 (no heading front matter, no # heading, no title)"];
  }
  if (x.headingSource === "frontmatter" || x.headingSource === "markdown") {
    return ["PASS", 1, `h1: "${String(x.heading).slice(0, 60)}"`];
  }
  // The hero falls back through link_title/title; the h1 exists but was
  // never written for the page.
  return [
    "WARN",
    0.5,
    `h1 falls back to "${String(x.heading).slice(0, 60)}" - no heading front matter or # heading`,
  ];
};

// AGENTS.md SEO hard rule 2: location and landing pages under roughly 250
// words are too thin; a rewrite must never shorten a page below its count.
const WORD_FLOORS = {
  service: [250, 400],
  local: [250, 320],
  location: [250, 320],
  page: [180, 280],
  accreditation: [100, 180],
  news: [200, 300],
  property: [150, 250],
};

const checkThinContent = (x) => {
  if (LISTING_PAGES.has(x.file)) return ["SKIP", 0, "hub page, thin by design"];
  const [failAt, warnAt] = WORD_FLOORS[x.pageType];
  if (x.words < failAt) return ["FAIL", 0, `${x.words} words of copy`];
  if (x.words < warnAt) return ["WARN", 0.5, `${x.words} words of copy`];
  return ["PASS", 1, `${x.words} words of copy`];
};

const checkSubheadings = (x) => {
  if (x.words < 400)
    return ["SKIP", 0, `${x.words} words, short enough to skip`];
  if (x.subCount >= 2)
    return ["PASS", 1, `${x.subCount} subheadings over ${x.words} words`];
  if (x.subCount === 1)
    return ["WARN", 0.5, `only 1 subheading over ${x.words} words`];
  return ["FAIL", 0, `no subheadings over ${x.words} words`];
};

const checkNoEmDash = (x) => {
  const em = countMatches(/\u2014/g, x.proseHouse);
  const double = countMatches(/(^|\s)--(\s|$)/g, x.proseHouse);
  const n = em + double;
  return n
    ? ["FAIL", 0, `${n} em-dash(es)/double hyphen(s) - AGENTS.md wants a spaced hyphen`]
    : ["PASS", 1, "no em-dashes"];
};

const checkUkSpelling = (x) => {
  const hits = x.proseHouse.match(US_SPELLING_RE);
  if (!hits) return ["PASS", 1, "no US spellings detected"];
  const unique = [...new Set(hits.map((h) => h.toLowerCase()))];
  return ["WARN", 0, `US spelling(s): ${listHits(unique)}`];
};

const patternCheck = (patterns, status, good, what) => (x) => {
  const hits = hitsOf(patterns, x.proseHouse);
  return hits.length
    ? [status, good, `${what}: ${listHits(hits)}`]
    : ["PASS", 1, `no ${what}`];
};

/** Exclamation marks in house copy are a brochure tell; quotes are exempt. */
const checkExclamations = (x) => {
  const n = countMatches(/!/g, x.proseHouse);
  if (n === 0) return ["PASS", 1, "no exclamation marks"];
  return ["WARN", n > 2 ? 0 : 0.5, `${n} exclamation mark(s) in house copy`];
};

const checkEmoji = (x) => {
  const hits = x.proseHouse.match(/\p{Extended_Pictographic}/gu);
  return hits
    ? ["WARN", 0, `emoji in copy (${[...new Set(hits)].join(" ")})`]
    : ["PASS", 1, "no emoji"];
};

const checkBold = (x) => {
  const n = countMatches(/\*\*[^*\n]+\*\*/g, x.houseMarkdown);
  if (n > 4) return ["WARN", 0, `${n} bold phrases - scattered bold reads as AI copy`];
  if (n > 1) return ["WARN", 0.5, `${n} bold phrases in prose`];
  return ["PASS", 1, `${n} bold phrase(s)`];
};

const checkWeVoice = (x) => {
  const n = countMatches(/\b(we|we've|we're|we'll|our|us)\b/gi, x.proseHouse);
  if (n >= 2)
    return ["PASS", 1, `${n} 'we/our/us' - written as the in-house team`];
  const ashley = countMatches(/\bAshley\b/g, x.proseHouse);
  if (ashley >= 2)
    return ["PASS", 1, `${ashley} 'Ashley' - first-person house voice`];
  return ["WARN", 0.5, `only ${n} 'we/our/us' and ${ashley} 'Ashley' - AGENTS.md wants first person`];
};

const checkContractions = (x) => {
  const full = countMatches(UNCONTRACTED_RE, x.proseHouse);
  const short = countMatches(CONTRACTED_RE, x.proseHouse);
  if (full < 3 || full <= short)
    return ["PASS", 1, `${short} contracted vs ${full} uncontracted`];
  const sample = [
    ...new Set(
      (x.proseHouse.match(UNCONTRACTED_RE) ?? []).map((s) => s.toLowerCase()),
    ),
  ];
  return [
    "WARN",
    full > short * 2 ? 0 : 0.5,
    `${full} uncontracted vs ${short} contracted (${listHits(sample)})`,
  ];
};

const checkInternalLinkCount = (x) => {
  const n = x.links.length;
  const sample = x.links
    .slice(0, 4)
    .map((l) => l.text)
    .join(", ")
    .slice(0, 90);
  if (n >= 3) return ["PASS", 1, `${n} internal link(s) (${sample})`];
  if (LISTING_PAGES.has(x.file)) return ["SKIP", 0, "hub page"];
  if (!SELLING_TYPES.includes(x.pageType)) {
    return n
      ? ["PASS", 1, `${n} internal link(s)`]
      : ["WARN", 0.5, "no internal links in copy"];
  }
  return n
    ? ["WARN", 0.5, `${n} internal link(s) (${sample})`]
    : ["FAIL", 0, "no internal links in copy"];
};

// AGENTS.md: every location page uses the place name in internal links;
// service pages route readers to town pages and town hubs to local services.
const checkLocationLinks = (x) => {
  if (x.pageType === "local") {
    const town = x.url.split("/").filter(Boolean)[0] ?? "";
    const n = x.links.filter((l) => l.href.startsWith(`/${town}/`)).length;
    return n
      ? ["PASS", 1, `${n} link(s) into /${town}/`]
      : ["WARN", 0, "no links to the town hub or sibling town pages"];
  }
  if (x.pageType === "location") {
    const town = x.url.split("/").filter(Boolean)[1] ?? "";
    const n = x.links.filter((l) => l.href.startsWith(`/${town}/`)).length;
    return n
      ? ["PASS", 1, `${n} link(s) into /${town}/<service>/`]
      : ["WARN", 0, "no links to local service pages"];
  }
  if (x.pageType === "service") {
    const n = x.links.filter(
      (l) =>
        /^\/[a-z-]+\/(solar-and-battery-installations|commercial-solar-installations|electric-vehicle-charger-installations|electrical-safety-inspections-eicr|home-battery-installations|electrical-testing)\/$/.test(
          l.href,
        ) || /^\/[a-z-]+\/$/.test(l.href),
    ).length;
    return n
      ? ["PASS", 1, `${n} link(s) to town hubs or local service pages`]
      : ["WARN", 0, "no links to town pages"];
  }
  return ["SKIP", 0, "not a selling page"];
};

// AGENTS.md hard rule 5: the place name appears in the title, headings,
// opening paragraph, body and internal links. Count what is missing.
const checkPlaceCoverage = (x) => {
  if (!x.town || !SELLING_TYPES.includes(x.pageType)) {
    return ["SKIP", 0, "no place to check"];
  }
  const t = x.town.toLowerCase();
  const missing = [];
  if (!x.metaTitle.toLowerCase().includes(t)) missing.push("title");
  if (!x.metaDescription.toLowerCase().includes(t)) missing.push("description");
  if (!String(x.heading).toLowerCase().includes(t)) missing.push("h1");
  const firstPara = x.prose.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
  if (!firstPara.toLowerCase().includes(t)) missing.push("opening");
  if (!x.proseHouse.toLowerCase().includes(t)) missing.push("body");
  if (!x.links.some((l) => l.text.toLowerCase().includes(t))) {
    missing.push("link text");
  }
  if (missing.length <= 1)
    return ["PASS", 1, missing.length ? `missing in ${missing[0]}` : "place name in all five spots"];
  return ["WARN", missing.length > 3 ? 0 : 0.5, `place name missing in: ${missing.join(", ")}`];
};

// MCS number accuracy: the site states NAP-66870 / NAPIT member 66870. Any
// other number on a page is a factual error a customer could act on.
const checkMcsNumber = (x) => {
  const bad = [];
  for (const m of x.prose.matchAll(/\bNAP-(\d+)\b/g)) {
    if (m[1] !== "66870") bad.push(`NAP-${m[1]}`);
  }
  for (const m of x.prose.matchAll(/NAPIT[^.\n]{0,40}?member\s*(\d{4,7})/gi)) {
    if (m[1] !== "66870") bad.push(`NAPIT member ${m[1]}`);
  }
  return bad.length
    ? ["FAIL", 0, `wrong certification number(s): ${bad.join(", ")} (should be NAP-66870)`]
    : ["PASS", 1, "certification numbers correct"];
};

// AGENTS.md credentials: MCS, Octopus Trusted Partner, TrustMark, NAPIT,
// HIES, Checkatrade. Selling pages should state at least one with a link;
// every page already carries the accreditation band from the layout, so
// other page types are not penalised for the copy alone.
const checkCredentials = (x) => {
  if (!SELLING_TYPES.includes(x.pageType)) {
    return ["SKIP", 0, "not a selling page"];
  }
  const hit = CREDENTIAL_TERM_RE.test(x.proseHouse);
  const linked = x.links.some((l) => l.href.startsWith("/accreditations/"));
  if (hit && linked) return ["PASS", 1, "credential stated and linked"];
  if (hit) return ["WARN", 0.5, "credential stated but no accreditation link"];
  return ["WARN", 0, "no MCS/TrustMark/NAPIT/HIES/Octopus/Checkatrade mention"];
};

// Review figures drift (reviews.json is the source of truth: 168 reviews,
// 9.96/10). A page quoting old numbers undermines the trust signal.
let reviewsData = null;
const reviewsFacts = () => {
  if (!reviewsData) {
    try {
      reviewsData = JSON.parse(readFileSync(path("src/_data/reviews.json"), "utf8"));
    } catch {
      reviewsData = { total: null, averageRating: null };
    }
  }
  return reviewsData;
};

const checkReviewFigures = (x) => {
  if (!SELLING_TYPES.includes(x.pageType) && x.pageType !== "page") {
    return ["SKIP", 0, "not a selling page"];
  }
  const facts = reviewsFacts();
  if (!facts.total || !facts.averageRating) return ["SKIP", 0, "no review data"];
  const problems = [];
  for (const m of x.proseHouse.matchAll(/\b(\d{2,4})\+? (verified )?reviews\b/gi)) {
    const n = Number(m[1]);
    if (Math.abs(n - facts.total) > 2) {
      problems.push(`${m[1]} reviews (actual ${facts.total})`);
    }
  }
  for (const m of x.proseHouse.matchAll(/\b(\d{1,2}\.\d{1,2})\s*\/\s*10\b/g)) {
    const r = Number(m[1]);
    if (Math.abs(r - facts.averageRating) > 0.05) {
      problems.push(`${m[1]}/10 (actual ${facts.averageRating})`);
    }
  }
  return problems.length
    ? ["WARN", 0, `stale review figure(s): ${problems.join("; ")}`]
    : ["PASS", 1, "review figures match reviews.json"];
};

// AGENTS.md claims requiring qualification: bill-saving percentages, value
// increases, carbon tonnages, zero bills, guaranteed SEG income, payback
// promises, whole-house backup. A regex hit is a flag for the overclaims
// question to confirm or clear.
const HARD_CLAIM_PATTERNS = [
  [/\b(50|70|80|86)% (off|of|on|less)|reduce.{0,20}bills? by \d+%/i, "bill-saving percentage"],
  [/\b\d+(\.\d+)? ?(tonnes?|t) of (co2|carbon)/i, "carbon tonnage"],
  [/increase.{0,30}(property|home|house) (value )?.{0,10}\d+%/i, "property-value percentage"],
  [/\bzero bills?\b|\b100% self[- ]sufficien|\bfree electricity\b/i, "zero-bill promise"],
  [/\bguaranteed? (savings|income|return|export)\b|\bSEG income of\b/i, "guaranteed income"],
  [/pay.{0,10}(back|off).{0,20}in (just )?\d+ (years?|months?)|\bpaid for (itself|off) in \d+/i, "payback promise"],
  [/\b(keep|run|power|powers?|keeping) (the|your|a) (whole|entire|full) house/i, "whole-house backup"],
  [/protects?.{0,20}(from|against) (rising )?(energy|power|electricity) (prices|costs|bills)/i, "price-rise protection"],
];

const checkHardClaims = (x) => {
  const hits = hitsOf(HARD_CLAIM_PATTERNS, x.proseHouse);
  return hits.length
    ? ["WARN", 0, `qualified-claim flag(s): ${listHits(hits)}`]
    : ["PASS", 1, "no unsupported headline claims"];
};

const checkCta = (x) => {
  if (x.file === "pages/contact.md") return ["SKIP", 0, "is the contact page"];
  const CTA_RE =
    /\b(contact|get in touch|ring|call|enquir|quote|book|survey|message ashley|start the ball rolling|get started|talk to ashley|free survey)/i;
  if (CTA_RE.test(x.tail))
    return ["PASS", 1, "copy closes with an enquiry prompt"];
  if (x.links.some((l) => l.href.startsWith("/contact"))) {
    return ["WARN", 0.5, "links /contact/ but the close has no enquiry prompt"];
  }
  if (LISTING_PAGES.has(x.file) || x.pageType === "accreditation") {
    return ["SKIP", 0, "hub or accreditation page"];
  }
  return [
    "WARN",
    0,
    `no enquiry prompt near the end ("...${x.tail.slice(-80)}")`,
  ];
};

const checkFaqCount = (x) => {
  if (!x.faqCount) return ["SKIP", 0, "no faqs block"];
  return x.faqCount >= 3
    ? ["PASS", 1, `${x.faqCount} FAQs`]
    : ["WARN", 0, `${x.faqCount} FAQ(s) - AGENTS.md wants 3+ or none at all`];
};

const checkAltText = (x) => {
  if (!x.alts.length) return ["SKIP", 0, "no images in copy"];
  const empty = x.alts.filter((a) => !a).length;
  const long = x.alts.filter((a) => a.length > 100).length;
  if (!empty && !long)
    return ["PASS", 1, `${x.alts.length} alt text(s) descriptive and under 100 chars`];
  return ["WARN", 0.5, `${empty} empty and ${long} over-100-char alt text(s)`];
};

const checkLeakage = (x) => {
  const metaHits = x.metaFields.flatMap(([field, value]) =>
    hitsOf(META_LEAKAGE_PATTERNS, value).map((hit) => `${hit} in ${field}`),
  );
  const hits = [...metaHits, ...hitsOf(LEAKAGE_PATTERNS, x.markdown)];
  return hits.length
    ? ["FAIL", 0, `template leakage: ${listHits(hits)}`]
    : ["PASS", 1, "no placeholders or generation artefacts"];
};

const checkVagueAnchors = (x) => {
  const vague = x.links.filter((l) => VAGUE_ANCHOR_RE.test(l.text.trim()));
  if (!x.links.length) return ["SKIP", 0, "no internal links"];
  return vague.length
    ? [
        "WARN",
        0.5,
        `vague link text: ${vague
          .slice(0, 3)
          .map((l) => `"${l.text}" -> ${l.href}`)
          .join("; ")}`,
      ]
    : ["PASS", 1, "link text describes each destination"];
};

const checkLinksResolve = (x, urlMap) => {
  const broken = x.links.filter((l) => !urlMap.has(l.href));
  return broken.length
    ? [
        "FAIL",
        0,
        `broken link(s): ${broken
          .slice(0, 3)
          .map((l) => `${l.text} -> ${l.href}`)
          .join("; ")}`,
      ]
    : ["PASS", 1, "all copy links resolve"];
};

// AGENTS.md: keep explicit service language, and link the service page at
// mention. A page that names another service without ever linking it misses
// the internal-link work the keyword deserves.
const SERVICE_INDEX = [
  {
    slug: "solar-and-battery-installations",
    aliases: [/solar panels?/i, /solar (pv|installation|installer)/i, /solar and battery/i],
  },
  {
    slug: "home-battery-installations",
    aliases: [/home batter/i, /battery storage/i, /battery installation/i, /retrofit batter/i],
  },
  {
    slug: "electric-vehicle-charger-installations",
    aliases: [/ev chargers?/i, /electric vehicle chargers?/i, /ev chargepoint/i, /car chargers?/i],
  },
  {
    slug: "electrical-safety-inspections-eicr",
    aliases: [/\beicr\b/i, /electrical safety inspection/i],
  },
  {
    slug: "commercial-solar-installations",
    aliases: [/commercial solar/i, /solar for (business|businesses)/i],
  },
  {
    slug: "electrical-testing",
    aliases: [/electrical testing/i, /\bpat testing\b/i, /landlord (safety|testing)/i],
  },
];

const ownServiceSlug = (x) =>
  x.pageType === "service" || x.pageType === "local"
    ? (x.url.match(
        /\/(solar-and-battery-installations|commercial-solar-installations|electric-vehicle-charger-installations|electrical-safety-inspections-eicr|home-battery-installations|electrical-testing)\//,
      ) ?? [])[1] ?? null
    : null;

const checkServiceLinks = (x) => {
  if (!SELLING_TYPES.includes(x.pageType)) return ["SKIP", 0, "not a selling page"];
  const own = ownServiceSlug(x);
  const linked = new Set(x.links.map((l) => l.href));
  const missing = [];
  for (const svc of SERVICE_INDEX) {
    if (svc.slug === own) continue;
    const mentioned = svc.aliases.some((re) => re.test(x.proseHouse));
    if (!mentioned) continue;
    const satisfied =
      linked.has(`/services/${svc.slug}/`) ||
      [...linked].some((href) => href.endsWith(`/${svc.slug}/`));
    if (!satisfied) missing.push(svc.slug);
  }
  if (!missing.length) return ["PASS", 1, "named services link to their pages"];
  return [
    "WARN",
    missing.length > 2 ? 0 : 0.5,
    `${missing.length} named service(s) unlinked: ${missing.join(", ")}`,
  ];
};

const code = (id, label, fn, weight, types = ALL_TYPES, extra = {}) => ({
  id,
  label,
  engine: "code",
  fn,
  weight,
  types,
  ...extra,
});

const CODE_CHECKS = [
  code("meta_title_length", "Meta title length", checkMetaTitleLength, 3),
  code("meta_description_present", "Meta description present", checkMetaDescriptionPresent, 6),
  code("meta_description_length", "Meta description length", checkMetaDescriptionLength, 2),
  code("meta_keywords", "Meta has service + place + credential", checkMetaKeywords, 3, SELLING_TYPES),
  code("h1_present", "Page heading (h1) present", checkHeading, 3),
  code("thin_content", "Copy not thin", checkThinContent, 5),
  code("subheading_structure", "Subheading structure", checkSubheadings, 2),
  code("no_em_dash", "No em-dashes", checkNoEmDash, 3),
  code("uk_spelling", "UK spellings", checkUkSpelling, 2),
  code("no_go_phrases", "No-go phrases absent", patternCheck(NO_GO_PATTERNS, "FAIL", 0, "no-go phrase(s)"), 5),
  code("voice_anti_patterns", "Voice anti-patterns", patternCheck(VOICE_PATTERNS, "WARN", 0.5, "voice anti-pattern(s)"), 3),
  code("dated_claims", "No stale dates or tariff figures", patternCheck(DATED_PATTERNS, "WARN", 0, "dated claim(s)"), 3),
  code("no_workings", "Doesn't show its workings", patternCheck(WORKINGS_PATTERNS, "FAIL", 0, "research workings in copy"), 4),
  code("emoji_check", "No emoji", checkEmoji, 2),
  code("exclamations", "No exclamation marks", checkExclamations, 2),
  code("scattered_bold", "No scattered bold", checkBold, 2),
  code("we_voice", "Written as 'we'/Ashley", checkWeVoice, 2, SELLING_TYPES),
  code("contractions", "Uses contractions", checkContractions, 2),
  code("internal_link_count", "Internal links in copy", checkInternalLinkCount, 4),
  code("location_links", "Links between town and local pages", checkLocationLinks, 3, SELLING_TYPES),
  code("place_coverage", "Place name in title/h1/opening/links", checkPlaceCoverage, 4, SELLING_TYPES),
  code("service_links", "Named services linked", checkServiceLinks, 2, SELLING_TYPES),
  code("mcs_number", "MCS number correct (NAP-66870)", checkMcsNumber, 4),
  code("credentials_present", "Credentials stated and linked", checkCredentials, 3, SELLING_TYPES),
  code("review_figures", "Review figures match reviews.json", checkReviewFigures, 3, [...SELLING_TYPES, "page"]),
  code("hard_claims", "Headline claims qualified", checkHardClaims, 4),
  code("internal_links_resolve", "Internal links resolve", checkLinksResolve, 5, ALL_TYPES, { critical: true }),
  code("cta_close", "Closes with an enquiry prompt", checkCta, 3),
  code("faq_count", "FAQ block has 3+ questions or none", checkFaqCount, 2),
  code("template_leakage", "No placeholders or template leakage", checkLeakage, 5, ALL_TYPES, { critical: true }),
  code("vague_anchors", "Link text makes sense alone", checkVagueAnchors, 2),
  code("alt_text", "Image alt text present and < 100 chars", checkAltText, 2),
];

// ---------------------------------------------------------------------------
// Jev checks
//
// "score" questions return 0..n-1 against the criteria list; "noul" returns
// a probability. threshold applies to noul checks; invert=true when the
// question asks about a bad thing, so a low probability is good.
// ---------------------------------------------------------------------------

const jevScore = (id, label, weight, instructions, criteria, types = ALL_TYPES) => ({
  id,
  label,
  engine: "jev",
  types,
  weight,
  score_pass: 2,
  score_warn: 1,
  question: { type: "score", instructions, criteria },
});

const jevNoul = (id, label, weight, instructions, criteria, extra = {}) => ({
  id,
  label,
  engine: "jev",
  types: extra.types ?? ALL_TYPES,
  weight,
  threshold: 0.5,
  invert: !!extra.invert,
  question: { type: "noul", instructions, criteria },
});

const JEV_CHECKS = [
  // --- EEAT: each dimension scores 0-3; computeEeat combines the four ---
  jevScore(
    "eeat_experience",
    "EEAT: Experience",
    4,
    "Google's rater guidelines: 'consider the extent to which the content creator has the " +
      "necessary first-hand or life experience for the topic'. How much first-hand experience " +
      "does `body` show for a solar and electrical installation business? Look for named jobs " +
      "and projects (a Bowlee Heywood new build, the University of Manchester Travelling Power " +
      "Station, an eleven-panel Victorian terrace near St Mary's Park), named streets, parks, " +
      "suburbs and property types (Victorian terraces, semis, bungalows, slate roofs, " +
      "chimneys, rooflights), and detail only the person doing the survey would know: shade " +
      "checks, orientation, roof condition, scaffolding, DNO applications. Generic claims " +
      "like 'years of experience' with nothing behind them do not count.",
    [
      "No experience signals - could be any installer's page",
      "Vague experience claims with no specifics",
      "Concrete first-hand experience - named jobs, places, property types or survey detail",
      "Rich, lived-in detail throughout, with named jobs and properties",
    ],
  ),
  jevScore(
    "eeat_expertise",
    "EEAT: Expertise",
    4,
    "Google's rater guidelines: 'consider the extent to which the content creator has the " +
      "necessary knowledge or skill for the topic' - and expertise must be verifiable, not " +
      "self-asserted. How much genuine technical expertise does `body` show? For this site, " +
      "expertise means precise, correct detail: system design and survey process, structural " +
      "and roof considerations, in-roof vs on-roof vs ground mounting, battery sizing from " +
      "actual usage (roughly 5kWh to 15kWh domestic), tariff mechanics (time-of-use charging, " +
      "Smart Export Guarantee eligibility), DNO connection (G98/G99), BS 7671 certification, " +
      "EICR scope and what the inspection covers, named equipment in context (Solax, " +
      "GivEnergy, Alpha ESS, DMEGC, Trina Vertex). Buzzword lists do not count.",
    [
      "No practical or technical detail",
      "Shallow or generic claims, scheme names dropped without context",
      "Solid, correct practical detail - design, survey and installation specifics in context",
      "Deep expertise - precise technical detail that helps someone plan and decide",
    ],
  ),
  jevScore(
    "eeat_authoritativeness",
    "EEAT: Authoritativeness",
    3,
    "Google's rater guidelines: 'consider the extent to which the content creator or the " +
      "website is known as a go-to source for the topic'; raters look for reputation from " +
      "independent sources. How authoritative does the business behind this page come across? " +
      "Signals: MCS certification number NAP-66870 used precisely, NAPIT, TrustMark, HIES, " +
      "Octopus Energy Trusted Partner, the 9.96/10 Checkatrade rating, attributed customer " +
      "reviews, the University of Manchester work, and links in `internal_links` to " +
      "accreditation pages and related services. Unsupported self-descriptions like 'leading' " +
      "or 'trusted' do not count.",
    [
      "No authority signals",
      "Self-asserted standing with nothing backing it",
      "Named accreditations, attributed reviews or checkable registrations appear",
      "Strong - accreditations linked, reviews attributed, registrations cited with numbers",
    ],
  ),
  jevScore(
    "eeat_trustworthiness",
    "EEAT: Trustworthiness",
    5,
    "Google's rater guidelines call trust 'the most important member of the E-E-A-T family " +
      "because untrustworthy pages have low E-E-A-T no matter how Experienced, Expert, or " +
      "Authoritative they may seem'. How trustworthy does `body` feel for someone inviting " +
      "this firm onto their roof or into their electrics? Concrete signals: honest limits " +
      "(what solar will not suit, when a battery alone makes sense, planning constraints in " +
      "conservation areas), no guaranteed savings, qualification of payback and export " +
      "figures, backup capability stated only where the design supports it, direct contact " +
      "with Ashley rather than a call centre, in-house installation with only scaffolding " +
      "subcontracted, clear certification. Generic reassurance does not count.",
    [
      "No trust signals",
      "Generic reassurance with nothing concrete behind it",
      "Concrete signals - honest limits, clear process, certifications stated plainly",
      "Strong - concrete facts, honest limits, no overclaiming, plainly written by the person doing the work",
    ],
  ),

  // --- AI-search lift: does the page state its answer so it can be quoted? ---
  jevScore(
    "quotable_answer",
    "Quotable self-contained answer",
    4,
    "AI search results (Google AI Overviews, ChatGPT, Perplexity) are built by lifting short " +
      "passages that stand on their own. Does `body` state its main answer in one or two " +
      "self-contained sentences near the top - what the business does, where, and for whom - " +
      "that an answer engine could lift verbatim? A page that opens with a heading then dives " +
      "into property detail without ever saying what is offered and where scores low.",
    [
      "No self-contained statement of what the page offers",
      "The offer is implied but never stated in a liftable sentence",
      "One liftable sentence states the offer, though detail follows late",
      "Opens with a clean, quotable statement of what is offered and where, then backs it up",
    ],
  ),
  jevScore(
    "searcher_intent",
    "Searcher intent",
    4,
    "Judge whether `body` serves the person who lands on this page. Work out who they are " +
      "from `page.url` and `page.page_type`: a service page gets someone deciding whether to " +
      "hire for that service (what is included, how it works, what it costs, how to enquire); " +
      "a local page gets someone wanting that service in `page.town` (do you come here, what " +
      "suits local properties, price and next step); a location hub gets someone checking " +
      "what is available in their town; a guide page gets someone researching a question " +
      "(is it worth it, what does VAT apply to, what does the process involve); an " +
      "accreditation page gets someone verifying a credential. Does `body` say early what " +
      "the page offers, answer that visitor's main questions, and make the next step obvious?",
    [
      "Intent not addressed - the visitor can't tell what the page offers them",
      "Intent implied but late or incomplete - main questions left unanswered",
      "Intent addressed - who it's for and the main questions answered clearly",
      "Addressed early and completely - questions answered up front, next step obvious",
    ],
  ),
  jevScore(
    "people_first",
    "People-first, satisfying content",
    4,
    "Google's people-first self-assessment asks: does the content 'provide a substantial, " +
      "complete, or comprehensive description of the topic', provide 'substantial value when " +
      "compared to other pages in search results', leave the reader feeling they've 'learned " +
      "enough about a topic to help achieve their goal' and avoid leaving 'readers feeling " +
      "like they need to search again to get better information from other sources'? The " +
      "search-engine-first warning signs are the inverse: content 'primarily made to attract " +
      "visits from search engines', written to a word count, or summarising without adding " +
      "value. Judge `body` for the person who lands on this page - do they leave able to act?",
    [
      "Reader leaves empty-handed - thin, generic, or built for the search engine",
      "Some substance but the reader will still need another source to act",
      "Substantial - the reader's main questions are answered in enough detail to act",
      "Satisfying and complete - substantial value beyond the obvious, nothing missing",
    ],
  ),
  jevScore(
    "concrete_facts",
    "Concrete facts vs marketing filler",
    5,
    "How concrete is `body`: specific facts, numbers, prices, named places (Prestwich, St " +
      "Mary's Park, Heaton Park, the M60, M24 postcodes), property types, equipment names, " +
      "certification numbers, review scores - versus brochure filler that could describe any " +
      "installer ('reduce your carbon footprint', 'cutting-edge technology')?",
    [
      "Generic filler throughout",
      "Mostly generic with one or two specifics",
      "A healthy mix of concrete facts and selling copy",
      "Concrete facts, numbers and named examples throughout",
    ],
  ),
  jevScore(
    "house_voice",
    "House voice (WhatsApp test)",
    4,
    "Judge `body_house` against this house voice: dry, plain-spoken, sceptical of marketing " +
      "language, recognisably Mancunian without dialect cosplay, written by a working " +
      "electrician about his own work. First person ('I run Renegade Solar', 'we fit'), " +
      "contractions, natural hedges, specifics over abstractions. The test: could Ashley type " +
      "each line on his phone in the back of a van? Brochure polish, short punchy parallel " +
      "sentences, uncontracted formal English and performed comedy all fail. Mock-northern " +
      "dialect ('owt', 'nowt', 'our kid') also fails - it is imitation, not voice. Score ONLY " +
      "`body_house`; quoted customer reviews are exempt and already stripped.",
    [
      "Brochure copy throughout - reads like an agency wrote it",
      "Mostly polished marketing voice with a few plain lines",
      "Mostly plain-spoken with a few brochure lines a light edit would fix",
      "Plain, dry and natural throughout - passes the WhatsApp test line by line",
    ],
  ),
  jevScore(
    "cliche_score",
    "Cliche score",
    4,
    "Judge `body_house` for copywriting cliches - the trying-too-hard structures, not single " +
      "words. Score ONLY `body_house`; quoted reviews are exempt and already stripped. Look " +
      "for: sentence fragments in prose ('No fuss.', 'The lot.'); cinematic one-line closers; " +
      "rule-of-three slogans; contrast flips ('not just solar panels'); 'imagine' or 'picture " +
      "a' daydreams; handling objections nobody raised; borrowed warm-up questions ('Looking " +
      "for a reliable installer?'), especially as the opening line or two in a row; " +
      "self-justifying value phrases ('pays for itself'); overselling modifiers ('ultimate', " +
      "'jaw-dropping'); and copy narrating the site's own structure ('as you can see on our " +
      "pages', 'we've written about this before'). 0 means riddled, 3 means clean.",
    [
      "Riddled - built from advert structures, several distinct failure modes",
      "Multiple cliches - three or more hits, or one structure repeated",
      "A cliche or two that a light rewrite would trim",
      "Clean - plain comfortable prose",
    ],
  ),
  jevScore(
    "scaled_content",
    "Not scaled/templated content",
    4,
    "Google's scaled content abuse policy: 'many pages are generated for the primary purpose " +
      "of manipulating search rankings', typically 'large amounts of unoriginal content that " +
      "provides little to no value to users' - the examples include pages where 'the main " +
      "content is copied or only slightly varied'. Judge `body` as one page among `siblings` " +
      "(same-type pages): does it read as individually written with real local knowledge, or " +
      "as one output of a content pipeline - structure, sentences and lists that would " +
      "survive a find-and-replace of the town name? A page a reader could not tell apart " +
      "from its siblings with the town covered scores 0-1.",
    [
      "Templated - find-and-replace the name and it would be any sibling page",
      "Mostly template with a few page-specific facts bolted on",
      "Mostly written for this page's topic - structure may repeat but the substance is specific",
      "Individually written throughout - a reader could tell it from its siblings blindfolded",
    ],
  ),
  jevScore(
    "choice_support",
    "Helps choose between services and options",
    3,
    "Does `body` help the visitor choose - between services (solar vs battery-only vs EV " +
      "charger), between mounting approaches (on-roof, in-roof, flat, ground), between " +
      "property-appropriate options, or between next steps - or does it just restate service " +
      "names and generic praise? Useful guidance names the deciding factors: roof condition, " +
      "shade, usage patterns, tariff, planning constraints.",
    [
      "No choice guidance - just names or generic praise",
      "A hint of guidance but mostly restated service names",
      "Useful guidance on which service or approach suits which property",
      "Clear deciding factors laid out - property, roof, usage and budget all covered",
    ],
    ["service", "local", "location", "page"],
  ),
  jevScore(
    "service_linking",
    "Services linked at mention",
    3,
    "House rule: when `body` names a service that has its own page (solar and battery " +
      "installations, home batteries, EV chargers, EICR inspections, commercial solar, " +
      "electrical testing), the first meaningful mention should link to that page - its root " +
      "service page or its local variant under the same town. A single service mentioned once " +
      "in passing without a link still scores 2; reserve 0-1 for pages that name two or more " +
      "services and leave them unlinked. Generic passing mentions that add nothing for the " +
      "reader do not need a link. Count the services meaningfully named in `body` and score " +
      "how many are linked.",
    [
      "Names two or more services, none or almost none linked at their mention",
      "Links some service mentions but leaves multiple named services unlinked",
      "Links nearly every meaningfully named service at first mention",
      "Every meaningfully named service in the copy links to its page at first mention",
    ],
    SELLING_TYPES,
  ),

  // --- bounded yes/no checks, quick to confirm by eye ---
  jevNoul(
    "social_proof",
    "Social proof in the copy",
    3,
    "Does `body` quote or attribute a customer review, name a real client or booking (the " +
      "University of Manchester, a named street or park), or cite the Checkatrade rating with " +
      "its score? A bare 'excellent reviews' claim does not count.",
    {
      true: "A review quote, named client or concrete rating appears",
      false: "No social proof anywhere",
    },
  ),
  jevNoul(
    "practical_limits",
    "States practical limits",
    3,
    "Does `body` state honest practical limits: when solar does not suit (shade, roof " +
      "condition, orientation, planning constraints), when a battery alone makes sense, " +
      "what affects payback, what backup can and cannot do, or what is not included? " +
      "AGENTS.md treats candour as a trust signal.",
    {
      true: "At least one honest practical limit appears",
      false: "Claims suitability for everything with no limits stated",
    },
    { types: SELLING_TYPES },
  ),
  jevNoul(
    "service_phrase_opener",
    "Search phrase near the top",
    3,
    "Does the opening of `body` contain the exact phrase a customer would search for - for " +
      "example 'solar panels in Prestwich', 'EICR in Bolton', 'EV charger installation', " +
      "'battery storage' - used naturally in the first paragraph or two? AGENTS.md requires " +
      "the primary phrase early on location and service pages.",
    {
      true: "The page's search phrase appears naturally near the top",
      false: "The main search phrase is absent from the opening",
    },
    { types: ["service", "local", "location"] },
  ),
  jevNoul(
    "meta_accuracy",
    "Title and meta match the page",
    3,
    "Do `page.title` and `page.description` accurately describe what `body` offers? Fail if " +
      "either promises something `body` never delivers (a service, area, price or " +
      "accreditation the copy does not mention), or uses exaggerated framing the copy does " +
      "not back up.",
    {
      true: "Title and meta description are an honest summary of the page",
      false: "Title or meta promises something the page does not deliver",
    },
  ),
  jevNoul(
    "heading_title_match",
    "Heading and title agree",
    2,
    "Do `page.heading` (the visible h1) and `page.title` describe the same core topic, so " +
      "someone clicking the search result lands on the page they expected? Different wording " +
      "is fine; a different subject, service or town is not.",
    {
      true: "Heading and title name the same thing",
      false: "Heading and title describe different things",
    },
    { types: SELLING_TYPES },
  ),
  jevNoul(
    "overclaims",
    "No overclaims",
    4,
    "Does `body_house` make unsupported absolute or superlative claims: guarantees " +
      "('guaranteed savings', 'never pay for electricity again'), bill-saving percentages " +
      "without qualification, zero-bills or full self-sufficiency promises, property-value " +
      "increases, exact payback periods stated as fact, rankings nobody can check ('the best " +
      "installer in Manchester'), or whole-house power-cut protection implied for every " +
      "battery? Google's helpful-content self-check also asks whether the main heading or " +
      "title 'avoids exaggerating or being shocking in nature' - judge `page.title` and " +
      "`page.heading` here too. Specific checkable facts ('MCS NAP-66870', '9.96/10 from 168 " +
      "reviews', '£150 plus VAT') are not overclaims.",
    {
      true: "At least one unsupported guarantee, absolute or unverifiable ranking",
      false: "Claims are specific and checkable, with no guarantees or rankings",
    },
    { invert: true },
  ),
  jevNoul(
    "local_differentiation",
    "Local content, not a town-name swap",
    4,
    "Does `body` contain detail that applies to `page.town` specifically and would be false " +
      "if another town's name were swapped in: a named street, park, school or landmark (St " +
      "Mary's Park, Heaton Park), the housing stock actually found there (Victorian terraces, " +
      "semis, bungalows, new builds), a real job done there, or a named neighbouring area? A " +
      "generic page with the town name dropped in counts as no.",
    {
      true: "Contains detail that only fits this town",
      false: "Reads the same with any town's name swapped in",
    },
    { types: ["local", "location"] },
  ),
  jevNoul(
    "keyword_stuffing",
    "No keyword stuffing",
    2,
    "Google's keyword stuffing policy lists 'blocks of text that list cities and regions " +
      "that a web page is trying to rank for' and 'repeating the same words or phrases so " +
      "often that it sounds unnatural' as signals. Does `body_house` do either - a town list " +
      "doing rankings work rather than reader work, or the page's main search phrase (from " +
      "`page.heading` or `page.title`, e.g. 'solar panels in Prestwich') repeated " +
      "unnaturally? Two or three natural mentions is fine.",
    {
      true: "The main phrase is repeated unnaturally",
      false: "Keywords appear naturally",
    },
    { invert: true },
  ),
];

const CHECKS = [...CODE_CHECKS, ...JEV_CHECKS];

// ---------------------------------------------------------------------------
// Jev client
// ---------------------------------------------------------------------------

const loadApiKey = () => {
  const key = process.env.OPENCODE_API_KEY;
  if (key) return key.trim();
  try {
    return readFileSync(DEFAULT_KEY_FILE, "utf8").trim();
  } catch {
    return null;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const postJev = (payload, apiKey, sessionId) =>
  fetch(ZEN_SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "grade-pages/0.1 (renegade-solar)",
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify(payload),
  });

/** One attempt: { resp } on success, { err, retryAfter } on failure, where
 * retryAfter is null when retrying will not help. */
const attemptJev = async (payload, apiKey, sessionId, attempt) => {
  try {
    const res = await postJev(payload, apiKey, sessionId);
    if (res.ok) return { resp: await res.json() };
    const err = `HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`;
    if (res.status === 429) return { err, retryAfter: 5000 * (attempt + 1) };
    if ([400, 401, 402].includes(res.status)) return { err, retryAfter: null };
    return { err, retryAfter: 1000 + attempt };
  } catch (e) {
    return { err: `${e.name}: ${e.message}`, retryAfter: 1000 + attempt };
  }
};

const callJev = async (state, questions, model, apiKey, sessionId) => {
  const payload = { model, state, questions };
  let last = { err: "no attempts made" };
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await attemptJev(payload, apiKey, sessionId, attempt);
    if (last.resp || last.retryAfter === null) break;
    await sleep(last.retryAfter);
  }
  return {
    resp: last.resp ?? null,
    err: last.resp ? null : last.err,
    req: payload,
  };
};

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

const buildJevState = (x, siblings) => ({
  page: {
    url: `${SITE_URL}${x.url}`,
    page_type: x.pageType,
    title: x.metaTitle,
    heading: x.heading,
    town: x.town,
    description: x.metaDescription,
  },
  body: x.prose.slice(0, MAX_BODY_CHARS),
  body_truncated: x.prose.length > MAX_BODY_CHARS,
  // quoted reviews stripped - customer voices are not judged on house voice
  body_house: x.proseHouse.slice(0, MAX_BODY_CHARS),
  internal_links: x.links,
  // same-type pages, for the scaled-content question
  siblings,
  business: {
    name: "Renegade Solar (Renegade Electrical Ltd)",
    who: "solar panel, battery storage and EV charger installer in North Manchester, run by Ashley Merritt, a qualified electrician with over twenty years' experience including ten on commercial projects, trading since 2018",
    context:
      "MCS-certified, certification number NAP-66870 (administered through NAPIT, member 66870); TrustMark, HIES consumer protection and Octopus Energy Trusted Partner; 9.96/10 from 168 verified Checkatrade reviews; " +
      "based in Prestwich, serving North Manchester and Greater Manchester; in-house installation team, only specialist scaffolding subcontracted; customers deal directly with Ashley, no call centre or commissioned sales team",
  },
});

const activeChecks = (x) =>
  CHECKS.filter(
    (c) =>
      c.types.includes(x.pageType) &&
      !(
        (VOICE_EXEMPT.has(x.file) ||
          VOICE_EXEMPT_DIRS.some((d) => x.file.startsWith(d))) &&
        VOICE_CHECKS.has(c.id)
      ),
  );

const runMechanical = (x, checks, urlMap) => {
  const results = {};
  for (const c of checks.filter((check) => check.engine === "code")) {
    const [status, goodness, note] = c.fn(x, urlMap);
    results[c.id] = {
      label: c.label,
      engine: "code",
      weight: c.weight,
      status,
      goodness,
      note,
      critical: !!c.critical,
    };
  }
  return results;
};

const statusFor = (good, pass, warn) => {
  if (good >= pass) return "PASS";
  return good >= warn ? "WARN" : "FAIL";
};

const gradeNoul = (ans, c) => {
  const p = ans.noul;
  const good = c.invert ? 1 - p : p;
  return {
    value: p,
    goodness: good,
    status: statusFor(good, c.threshold, c.threshold - 0.3),
    note: `noul=${p.toFixed(2)}${c.invert ? " (lower is better)" : ""}`,
  };
};

const gradeScore = (ans, c) => {
  const s = ans.score;
  const good = s >= c.score_pass ? 1 : s >= c.score_warn ? 0.5 : 0;
  const levels = c.question.criteria.length - 1;
  return {
    value: s,
    goodness: good,
    status: statusFor(good, 1, 0.5),
    note: `score=${s.toFixed(2)}/${levels} (conf ${(ans.confidence ?? 0).toFixed(2)})`,
  };
};

/** A hard FAIL the model isn't confident about is a review flag, not a
 * verdict (TypeSafe confidence architecture: act only when confident). */
const softenUnconfident = (entry, confidence) => {
  if (typeof confidence !== "number" || confidence >= 0.3) return entry;
  if (entry.status !== "FAIL") return entry;
  return {
    ...entry,
    status: "WARN",
    goodness: 0.5,
    note: `${entry.note} [low confidence - human review]`,
  };
};

const gradeJevAnswer = (ans, c) => {
  const graded = ans.type === "noul" ? gradeNoul(ans, c) : gradeScore(ans, c);
  return softenUnconfident(
    {
      label: c.label,
      engine: "jev",
      weight: c.weight,
      critical: false,
      raw: ans,
      ...graded,
    },
    ans.confidence,
  );
};

const gradeJevAnswers = (answers, checks) =>
  Object.fromEntries(
    checks
      .filter((c) => answers[c.id])
      .map((c) => [c.id, gradeJevAnswer(answers[c.id], c)]),
  );

const letterFor = (score) => {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return score >= 45 ? "D" : "F";
};

const summarise = (results) => {
  const counted = Object.values(results).filter((r) => r.status !== "SKIP");
  const totalW = counted.reduce((a, r) => a + r.weight, 0);
  const gotW = counted.reduce((a, r) => a + r.weight * r.goodness, 0);
  const score = totalW ? Math.round((100 * gotW) / totalW) : 0;
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const r of counted) counts[r.status]++;
  return { score, letter: letterFor(score), counts };
};

const EEAT_IDS = [
  "eeat_experience",
  "eeat_expertise",
  "eeat_authoritativeness",
  "eeat_trustworthiness",
];

/** The four EEAT dimension scores (0-3 each) combined into a headline, or
 * null when none were graded (mechanical-only runs). */
const computeEeat = (results) => {
  const dims = Object.fromEntries(
    EEAT_IDS.filter((id) => typeof results[id]?.value === "number").map(
      (id) => [id, results[id].value],
    ),
  );
  const values = Object.values(dims);
  if (!values.length) return null;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const score = Math.round((mean / 3) * 100);
  return {
    mean: Math.round(mean * 100) / 100,
    score,
    letter: letterFor(score),
    dimensions: dims,
  };
};

const sessionIdFor = (x) =>
  `grade-pages-${x.url.replace(/[^a-z0-9]/gi, "").slice(-40)}`;

const logVerbose = (opts, req, resp) => {
  if (!opts.verbose) return;
  console.error("--- jev request ---");
  console.error(JSON.stringify(req, null, 2));
  console.error("--- jev response ---");
  console.error(JSON.stringify(resp, null, 2));
};

/** Ask Jev every fuzzy question for the page in one call. */
const runJev = async (x, checks, opts, siblings) => {
  const jevChecks = checks.filter((c) => c.engine === "jev");
  if (!jevChecks.length || opts.noJev)
    return { results: {}, info: null, error: null };
  if (!opts.apiKey) return { results: {}, info: null, error: "no API key" };
  const questions = Object.fromEntries(
    jevChecks.map((c) => [c.id, structuredClone(c.question)]),
  );
  const started = Date.now();
  const { resp, err, req } = await callJev(
    buildJevState(x, siblings),
    questions,
    opts.model,
    opts.apiKey,
    sessionIdFor(x),
  );
  logVerbose(opts, req, resp);
  if (err) return { results: {}, info: null, error: err };
  return {
    results: gradeJevAnswers(resp.answers ?? {}, jevChecks),
    info: {
      model: resp.model ?? opts.model,
      input_tokens: resp.usage?.input_tokens,
      output_tokens: resp.usage?.output_tokens,
      seconds: (Date.now() - started) / 1000,
    },
    error: null,
  };
};

const elapsed = (start) => Math.round((Date.now() - start) / 10) / 100;

const gradePage = async (file, opts, urlMap, siblingIndex) => {
  const start = Date.now();
  try {
    const x = extractPage(file, opts.type);
    const checks = activeChecks(x);
    const jev = await runJev(x, checks, opts, siblingsFor(x, siblingIndex));
    const results = { ...runMechanical(x, checks, urlMap), ...jev.results };
    return {
      file: x.file,
      url: x.url,
      title: x.metaTitle,
      words: x.words,
      place: x.town,
      page_type: x.pageType,
      ...summarise(results),
      checks: results,
      eeat: computeEeat(results),
      jev: jev.info,
      jev_error: jev.error,
      seconds: elapsed(start),
    };
  } catch (e) {
    return {
      file: contentRel(file),
      url: contentRel(file),
      title: "",
      words: 0,
      place: "",
      page_type: "?",
      score: null,
      letter: "E",
      counts: { PASS: 0, WARN: 0, FAIL: 0 },
      checks: {},
      eeat: null,
      jev: null,
      jev_error: null,
      error: `${e.name}: ${e.message}`,
      seconds: elapsed(start),
    };
  }
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const MARKS = { PASS: "+", WARN: "~", FAIL: "X", SKIP: "-" };

const formatEeat = (e) => {
  const dims = EEAT_IDS.filter((id) => id in e.dimensions)
    .map((id) => `${id.replace("eeat_", "")} ${e.dimensions[id].toFixed(1)}`)
    .join(" | ");
  return `EEAT: ${e.score}/100 (${e.letter}) - ${dims}`;
};

const printCheckLine = (r) => {
  const crit = r.critical && r.status === "FAIL" ? " [CRITICAL]" : "";
  console.log(
    `  [${MARKS[r.status]}] ${r.status.padEnd(4)} ${r.label.padEnd(44)} (${r.engine.padEnd(4)} w${r.weight}) ${r.note}${crit}`,
  );
};

const printReport = (x, result) => {
  console.log(`Renegade page grader - ${x.url} (${x.file})`);
  console.log(
    `page type: ${x.pageType}${x.town ? ` (${x.town})` : ""} | words: ${x.words} | checks: ${Object.keys(result.checks).length}\n`,
  );
  for (const r of Object.values(result.checks)) printCheckLine(r);
  const c = result.counts;
  console.log(
    `\nScore: ${result.score}/100 (${result.letter}) - ${c.PASS} pass, ${c.WARN} warn, ${c.FAIL} fail`,
  );
  if (result.eeat) console.log(formatEeat(result.eeat));
  if (result.jev) {
    const j = result.jev;
    console.log(
      `Jev: model=${j.model}, ${j.input_tokens} in / ${j.output_tokens} out tokens, ${j.seconds.toFixed(2)}s`,
    );
  }
};

const failedIds = (row, sep = ",") =>
  Object.entries(row.checks)
    .filter(([, chk]) => chk.status === "FAIL")
    .map(([id]) => id)
    .join(sep);

const progressLine = (row, done, total) => {
  const prefix = `[${done}/${total}]`;
  if (row.score === null)
    return `${prefix} SKIP ${row.url} - ${(row.error ?? "").slice(0, 80)}`;
  const jevNote = row.jev_error ? ` (jev: ${row.jev_error.slice(0, 40)})` : "";
  return `${prefix} ${String(row.score).padStart(3)} ${row.letter} ${row.page_type.padEnd(13)} ${(failedIds(row) || "-").slice(0, 60)} ${row.url}${jevNote}`;
};

const gradeAll = async (targets, opts, urlMap, siblingIndex) => {
  const rows = new Array(targets.length);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const i = next++;
      rows[i] = await gradePage(targets[i], opts, urlMap, siblingIndex);
      done++;
      console.error(progressLine(rows[i], done, targets.length));
    }
  };
  const count = Math.min(opts.workers, targets.length);
  await Promise.all(Array.from({ length: count }, worker));
  return rows.sort(
    (a, b) =>
      (a.score === null) - (b.score === null) ||
      (a.score ?? 0) - (b.score ?? 0),
  );
};

const RULE = "-".repeat(110);

const tableRow = (r) => {
  if (r.score === null) {
    return `${"---".padStart(5)} ${"-".padEnd(2)} ${"".padStart(5)} ${r.page_type.padEnd(13)} ${"".padEnd(9)} ${r.url} - ${(r.error ?? "").slice(0, 60)}`;
  }
  const c = r.counts;
  const eeat = r.eeat ? `${r.eeat.score}${r.eeat.letter}` : "-";
  return `${String(r.score).padStart(5)} ${r.letter.padEnd(2)} ${eeat.padStart(5)} ${r.page_type.padEnd(13)} ${`${c.PASS}/${c.WARN}/${c.FAIL}`.padEnd(9)} ${failedIds(r) || "-"} ${r.url}`;
};

const tally = (rows, status) => {
  const counter = new Map();
  for (const chk of rows.flatMap((r) => Object.values(r.checks))) {
    if (chk.status === status)
      counter.set(chk.label, (counter.get(chk.label) ?? 0) + 1);
  }
  return [...counter].sort((a, b) => b[1] - a[1]);
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const printTally = (heading, status, rows, n) => {
  const top = tally(rows, status).slice(0, n);
  if (!top.length) return;
  console.log(`\n${heading}`);
  for (const [label, count] of top)
    console.log(`  ${status} x${String(count).padEnd(4)} ${label}`);
};

const printEeatSummary = (graded) => {
  const rows = graded.filter((r) => r.eeat);
  if (!rows.length) return;
  const worst = [...rows]
    .sort((a, b) => a.eeat.score - b.eeat.score)
    .slice(0, 5)
    .map((r) => `${r.url} ${r.eeat.score}${r.eeat.letter}`)
    .join(", ");
  console.log(
    `\nEEAT: ${rows.length} pages graded | median ${median(rows.map((r) => r.eeat.score))}/100 | worst: ${worst}`,
  );
};

const printSummary = (rows, seconds) => {
  const graded = rows.filter((r) => r.score !== null);
  if (!graded.length) return;
  const letters = {};
  for (const r of graded) letters[r.letter] = (letters[r.letter] ?? 0) + 1;
  const spread = Object.keys(letters)
    .sort()
    .map((l) => `${l}:${letters[l]}`)
    .join(" ");
  const jevErrors = graded.filter((r) => r.jev_error).length;
  console.log(RULE);
  console.log(
    `${graded.length} graded, ${rows.length - graded.length} errored, ${jevErrors} without Jev | median ${median(graded.map((r) => r.score))} | ${spread} | ${seconds.toFixed(0)}s total`,
  );
  printTally("Most-failed checks across the batch:", "FAIL", graded, 10);
  printTally("Most-warned checks across the batch:", "WARN", graded, 8);
  printEeatSummary(graded);
};

const printTable = (rows, opts, seconds) => {
  console.log(
    `\nRenegade page grader - batch of ${rows.length} (workers=${opts.workers}, model=${opts.noJev ? "none" : opts.model})`,
  );
  console.log(
    `${"Score".padStart(5)} ${"L".padEnd(2)} ${"EEAT".padStart(5)} ${"Type".padEnd(13)} ${"p/w/x".padEnd(9)} Failed checks`,
  );
  console.log(RULE);
  for (const r of rows) console.log(tableRow(r));
  printSummary(rows, seconds);
};

const csvEscape = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Measure columns carry the raw Jev values: score checks 0-3, noul checks
// rendered on the same 0-3 scale (goodness x 3, rounded). Higher is better.
const MEASURE_IDS = [
  ...EEAT_IDS,
  "quotable_answer",
  "searcher_intent",
  "people_first",
  "concrete_facts",
  "house_voice",
  "cliche_score",
  "scaled_content",
  "choice_support",
  "service_linking",
  "social_proof",
  "practical_limits",
  "service_phrase_opener",
  "meta_accuracy",
  "heading_title_match",
  "overclaims",
  "local_differentiation",
  "keyword_stuffing",
];

const measureValue = (r, id) => {
  const chk = r.checks[id];
  if (!chk || typeof chk.value !== "number") return "";
  if (chk.raw?.type === "score") return Math.round(chk.value * 100) / 100;
  return Math.round(chk.goodness * 3 * 100) / 100;
};

const CSV_COLUMNS = [
  "score",
  "letter",
  "eeat_score",
  "eeat_letter",
  "page_type",
  "url",
  "title",
  "words",
  "place",
  "pass",
  "warn",
  "fail",
  "failed_checks",
  ...MEASURE_IDS,
  "jev_error",
  "error",
];

const csvRow = (r) =>
  [
    r.score,
    r.letter,
    r.eeat?.score,
    r.eeat?.letter,
    r.page_type,
    r.url,
    r.title,
    r.words,
    r.place,
    r.counts.PASS,
    r.counts.WARN,
    r.counts.FAIL,
    failedIds(r, ";"),
    ...MEASURE_IDS.map((id) => measureValue(r, id)),
    r.jev_error,
    r.error,
  ]
    .map(csvEscape)
    .join(",");

const writeCsv = (rows, file) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${[CSV_COLUMNS.join(","), ...rows.map(csvRow)].join("\n")}\n`,
  );
  console.error(`\nCSV written to ${file}`);
};

const runBatch = async (targets, opts, urlMap, siblingIndex) => {
  const start = Date.now();
  const rows = await gradeAll(targets, opts, urlMap, siblingIndex);
  if (opts.json) console.log(JSON.stringify(rows, null, 2));
  else printTable(rows, opts, (Date.now() - start) / 1000);
  if (opts.csv) writeCsv(rows, opts.csv);
  return 0;
};

const runSingle = async (file, opts, urlMap, siblingIndex) => {
  const result = await gradePage(file, opts, urlMap, siblingIndex);
  if (result.score === null) {
    console.error(`ERROR grading ${result.url}: ${result.error}`);
    return 2;
  }
  printReport(extractPage(file, opts.type), result);
  if (result.jev_error)
    console.error(
      `note: Jev unavailable (${result.jev_error}); report is mechanical-only`,
    );
  const critical = Object.values(result.checks).filter(
    (r) => r.critical && r.status === "FAIL",
  );
  for (const r of critical) console.log(`CRITICAL: ${r.label}: ${r.note}`);
  return critical.length ? 1 : 0;
};

// ---------------------------------------------------------------------------
// URL map and target resolution
// ---------------------------------------------------------------------------

const permalinksOf = (fm) => [
  fm.permalink,
  ...(Array.isArray(fm.redirect_from) ? fm.redirect_from : []),
];

const builtSiteUrls = (dir, prefix = "/") => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return builtSiteUrls(join(dir, entry.name), `${prefix}${entry.name}/`);
    return entry.name === "index.html" ? [prefix] : [];
  });
};

/** Every URL a copy link could legitimately point at: permalinks and
 * redirect_from aliases from the content files, plus anything Eleventy
 * built, taken from _site/ when a build is on disk. */
const buildUrlMap = () => {
  const pairs = allContentFiles().flatMap((file) =>
    permalinksOf(readPage(file).data)
      .filter((u) => typeof u === "string")
      .map((url) => [normaliseUrl(url), relPath(file)]),
  );
  const built = builtSiteUrls(path("_site")).map((url) => [url, "_site"]);
  // later entries win, so a content file beats a built-site duplicate
  return new Map([...built, ...pairs]);
};

/** permalink: false pages are never built, so there is nothing to grade. */
const isGradeable = (rel) =>
  !SKIP_GRADE.has(rel) &&
  readPage(path("src", rel)).data.permalink !== false;

/** Type and permalink for the sibling index, or null when a file is not a
 * gradeable page with a real permalink. */
const siblingEntry = (file) => {
  const rel = contentRel(file);
  if (!isGradeable(rel)) return null;
  const fm = readPage(file).data;
  if (typeof fm.permalink !== "string") return null;
  return { type: detectPageType(rel), url: normaliseUrl(fm.permalink) };
};

/** Permalink URLs by page type so the scaled-content question can show Jev
 * the family a page belongs to. */
const buildSiblingIndex = () => {
  const index = {};
  for (const file of allContentFiles()) {
    const entry = siblingEntry(file);
    if (!entry) continue;
    if (!index[entry.type]) index[entry.type] = [];
    index[entry.type].push(entry.url);
  }
  for (const urls of Object.values(index)) urls.sort();
  return index;
};

const serviceFamily = (url) => url.split("/")[2] ?? "";

const sampleSiblings = (urls, self) =>
  urls
    .filter((u) => u !== self)
    .slice(0, MAX_SIBLINGS)
    .map((u) => `${SITE_URL}${u}`);

/** Same-type sibling URLs for the scaled-content question. Local pages are
 * sampled within their own service family first (the stricter templating
 * test), widening to the whole local set when a family is thin. */
const siblingsFor = (x, index) => {
  const urls = index[x.pageType] ?? [];
  if (x.pageType !== "local") return sampleSiblings(urls, x.url);
  const family = urls.filter((u) => serviceFamily(u) === serviceFamily(x.url));
  return sampleSiblings(family.length >= 3 ? family : urls, x.url);
};

const resolveFileTarget = (t, gradeable) => {
  let asPath = resolve(ROOT, t.replace(/^\.\//, ""));
  if (!existsSync(asPath)) asPath = resolve(ROOT, "src", t.replace(/^\.\//, ""));
  if (!existsSync(asPath)) return [];
  if (asPath.endsWith(".md")) return [asPath];
  const dirPrefix = `${contentRel(asPath)}/`;
  return gradeable
    .filter((rel) => rel.startsWith(dirPrefix))
    .map((rel) => path(rel));
};

const resolveTarget = (t, urlMap, gradeable) => {
  const files = resolveFileTarget(t, gradeable);
  if (files.length) return files;
  const urlPath = t.startsWith(SITE_URL) ? t.slice(SITE_URL.length) : t;
  const rel = urlPath.startsWith("/") ? urlMap.get(normaliseUrl(urlPath)) : null;
  if (!rel || rel === "_site") throw new Error(`cannot resolve target '${t}'`);
  return [path(rel)];
};

const selectPool = (opts, urlMap) => {
  const gradeable = allContentFiles().map(contentRel).filter(isGradeable);
  const targets = opts.targets.length
    ? opts.targets.flatMap((t) => resolveTarget(t, urlMap, gradeable))
    : gradeable.map((rel) => path("src", rel));
  const filtered = targets.filter((file) => {
    if (!opts.prefix && !opts.onlyType) return true;
    const x = extractPage(file);
    return (
      (!opts.prefix || x.url.includes(opts.prefix)) &&
      (!opts.onlyType || x.pageType === opts.onlyType)
    );
  });
  return opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const usage = () =>
  console.log(`Usage: bun scripts/grade-pages.js [targets] [options]

Targets (default: every gradeable page):
  src/locations/prestwich.md         a source file
  /prestwich/                        URL shorthand (redirect_from aliases work too)
  ${SITE_URL}/services/home-battery-installations/
  locations                          a directory

Options:
  --type <t>      only pages of this type (${ALL_TYPES.join(", ")})
  --prefix <s>    only pages whose URL contains this substring
  --limit <n>     grade at most n pages
  --workers <n>   parallel batch workers (default 4)
  --csv <path>    write batch results to a CSV file
  --json          machine-readable output
  --no-jev        mechanical checks only
  --model <id>    Jev model id (default ${DEFAULT_MODEL})
  --force-type <t> grade the targets as this page type
  --list-checks   print the check schema and exit
  --verbose       dump the Jev request and response
  --help          this message`);

const VALUE_FLAGS = {
  "--prefix": (o, v) => {
    o.prefix = v;
  },
  "--limit": (o, v) => {
    o.limit = Number.parseInt(v, 10) || 0;
  },
  "--workers": (o, v) => {
    o.workers = Math.max(1, Number.parseInt(v, 10) || 4);
  },
  "--csv": (o, v) => {
    o.csv = v;
  },
  "--model": (o, v) => {
    o.model = v;
  },
  "--type": (o, v) => {
    o.onlyType = v;
  },
  "--force-type": (o, v) => {
    o.type = v;
  },
};

const BOOL_FLAGS = {
  "--json": "json",
  "--no-jev": "noJev",
  "--list-checks": "listChecks",
  "--verbose": "verbose",
  "--help": "help",
  "-h": "help",
};

const validateType = (t) => {
  if (t && !ALL_TYPES.includes(t)) {
    throw new Error(`unknown page type '${t}' (${ALL_TYPES.join(", ")})`);
  }
};

/** Consume one argument (and its value, for value flags) into opts. */
const applyArg = (opts, a, rest) => {
  if (VALUE_FLAGS[a]) {
    if (!rest.length) throw new Error(`${a} needs a value`);
    VALUE_FLAGS[a](opts, rest.shift());
    return;
  }
  if (BOOL_FLAGS[a]) {
    opts[BOOL_FLAGS[a]] = true;
    return;
  }
  if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
  opts.targets.push(a);
};

const parseArgs = (argv) => {
  const opts = { targets: [], limit: 0, workers: 4, model: DEFAULT_MODEL };
  const args = [...argv];
  while (args.length) applyArg(opts, args.shift(), args);
  validateType(opts.type);
  validateType(opts.onlyType);
  return opts;
};

const listChecks = () => {
  for (const c of CHECKS) {
    console.log(
      `${c.id.padEnd(26)} ${c.engine.padEnd(5)} w${String(c.weight).padEnd(3)} [${c.types.join(",")}]  ${c.label}${c.critical ? " [CRITICAL]" : ""}`,
    );
  }
  return 0;
};

const run = (opts) => {
  if (opts.help) return usage() ?? 0;
  if (opts.listChecks) return listChecks();
  const urlMap = buildUrlMap();
  const siblingIndex = buildSiblingIndex();
  const pool = selectPool(opts, urlMap);
  if (!pool.length) {
    console.error("no pages match the given targets and filters");
    return 2;
  }
  const withKey = { ...opts, apiKey: opts.noJev ? null : loadApiKey() };
  if (!opts.noJev && !withKey.apiKey) {
    console.error(
      "ERROR: Jev grading needs an API key and none was found.\n" +
        "Looked for OPENCODE_API_KEY in the environment and for /run/secrets/opencode_api_key.\n" +
        "Pass --no-jev if you want the mechanical checks only; do not ship a report as a full grade.",
    );
    return 2;
  }
  if (pool.length === 1 && !opts.json && !opts.csv)
    return runSingle(pool[0], withKey, urlMap, siblingIndex);
  return runBatch(pool, withKey, urlMap, siblingIndex);
};

/** Entry point, also exported so the grading kernel can run a sweep without
 * spawning a process. */
export const runGrader = async (argv = []) => {
  try {
    return await run(parseArgs(argv));
  } catch (e) {
    console.error(e.message);
    usage();
    return 2;
  }
};

export { extractPage };

if (import.meta.main) {
  process.exit(await runGrader(process.argv.slice(2)));
}
