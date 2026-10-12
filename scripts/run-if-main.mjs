/**
 * run-if-main.mjs — shared "run main() only when executed directly" guard.
 *
 * The scripts in this directory double as modules (correlate-search.mjs
 * imports fetchKeywordRows from serpdino.mjs) and as CLIs, so each keeps a
 * direct-execution check. That check lives here in one place; pass
 * import.meta.url from the calling module.
 */

import { pathToFileURL } from "node:url";
import process from "node:process";

export const runIfMain = async (main, metaUrl) => {
  if (process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href) {
    process.exit(await main());
  }
};
