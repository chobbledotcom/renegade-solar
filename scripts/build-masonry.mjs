// Bundles assets-src/masonry.js (and its uWrap dependency) into a single
// self-contained file at src/assets/masonry.js, which Eleventy then copies
// through to the built site. Run with `npm run build:js`.
//
// The output is committed to the repo (like the other prebuilt assets in
// src/assets) so the Eleventy deploy build does not need a bundling step.

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
	entryPoints: [resolve(root, "assets-src/masonry.js")],
	outfile: resolve(root, "src/assets/masonry.js"),
	bundle: true,
	format: "iife",
	target: "es2017",
	minify: true,
	mainFields: ["module", "main"],
	legalComments: "none",
});

console.log("Built src/assets/masonry.js");
