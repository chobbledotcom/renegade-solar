#!/usr/bin/env node

/**
 * CPD ratchet check - fails if the duplication threshold could be lowered.
 *
 * Reads the current --min-tokens value from package.json's cpd script, then
 * runs jscpd with minTokens - 1. If the codebase still passes at the lower
 * threshold, this check fails to force tightening it.
 *
 * A pass requires evidence that jscpd completed a scan: a fresh JSON report
 * in .jscpd-report/. A nonzero jscpd exit without one means jscpd itself
 * failed (missing dependency, invalid config, crash) and the ratchet fails
 * rather than reading the error as "clones found at the lower threshold".
 *
 * Ported from chobble-template's scripts/cpd-ratchet.js; paths mirror this
 * repo's cpd script (keep the two in sync).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { throwIfSpawnFailed } from "./cpd.mjs";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const REPORT = join(ROOT_DIR, ".jscpd-report", "jscpd-report.json");

// Read current threshold from package.json cpd script (single source of truth)
const pkg = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf-8"));
const cpdScript = pkg.scripts.cpd;
const match = cpdScript.match(/--min-tokens\s+(\d+)/);
if (!match) {
  throw new Error("Could not find --min-tokens in package.json cpd script");
}
const CURRENT_MIN_TOKENS = Number(match[1]);
const RATCHET_MIN_TOKENS = CURRENT_MIN_TOKENS - 1;

// Paths matching the cpd script and .jscpd.json (keep in sync)
const paths = [
	"src/_includes",
	"src/_layouts",
	"src/css",
	"assets-src",
	"scripts",
	"_lib",
	".eleventy.js",
	"src/pages",
	"src/services",
	"src/locations",
	"src/accreditations",
	"src/news",
	"src/properties",
];

// Clear the previous report so its presence after the run proves jscpd
// completed this scan.
rmSync(REPORT, { force: true });
mkdirSync(join(ROOT_DIR, ".jscpd-report"), { recursive: true });

const result = spawnSync(
  "npx",
  [
    "jscpd",
    ...paths,
    "--min-tokens",
    String(RATCHET_MIN_TOKENS),
  ],
  {
    cwd: ROOT_DIR,
    stdio: "inherit",
  },
);

throwIfSpawnFailed(result, "jscpd");

const status = result.status ?? 1;

if (!existsSync(REPORT)) {
  console.error(
    `\n❌ CPD ratchet failed: jscpd exited with status ${status} but wrote no report to .jscpd-report/jscpd-report.json`,
  );
  console.error(
    "   The scan never completed, so there is no evidence about duplication - fix jscpd and re-run.",
  );
  process.exit(1);
}

let clones;
try {
  clones = JSON.parse(readFileSync(REPORT, "utf-8")).duplicates.length;
} catch (error) {
  console.error(`\n❌ CPD ratchet failed: could not read ${REPORT}: ${error.message}`);
  process.exit(1);
}

if (status === 0 && clones === 0) {
  // jscpd completed cleanly and found nothing at the lower threshold -
  // threshold can be tightened!
  console.error(
    `\n❌ CPD ratchet failed: code passed with minTokens=${RATCHET_MIN_TOKENS}`,
  );
  console.error(
    `   Update --min-tokens to ${RATCHET_MIN_TOKENS} in package.json cpd script`,
  );
  process.exit(1);
}

if (status !== 0 && clones > 0) {
  // jscpd completed and failed the threshold check - current threshold is correct
  console.log(
    `\n✅ CPD ratchet passed: minTokens=${CURRENT_MIN_TOKENS} is correct (${clones} clone(s) at ${RATCHET_MIN_TOKENS})`,
  );
  process.exit(0);
}

console.error(
  `\n❌ CPD ratchet failed: incoherent result - jscpd exit status ${status} with ${clones} clone(s) at minTokens=${RATCHET_MIN_TOKENS}`,
);
process.exit(1);
