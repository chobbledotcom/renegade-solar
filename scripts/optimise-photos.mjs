#!/usr/bin/env node
//
// Resize and re-encode the source photographs in src/assets/photos.
//
// Photos come off a phone at 4096x3072 and 5MB. The site never displays one
// wider than about 1200 CSS pixels, so anything past ~2000px is bytes nobody
// downloads on purpose - and any photo used without going through the Eleventy
// image transform is served at full size.
//
// Run it after adding photos:
//
//   npm run optimise-photos            # rewrite anything oversized
//   npm run optimise-photos -- --dry   # report what it would do
//
// Re-running is safe: a photo already within the limits is left alone.

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = "src/assets/photos";
const MAX_EDGE = 2000; // longest side, in pixels
const QUALITY = 78;
const dryRun = process.argv.includes("--dry");

const kb = (bytes) => Math.round(bytes / 1024);

const files = (await fs.readdir(DIR))
	.filter((name) => /\.jpe?g$/i.test(name))
	.sort();

let before = 0;
let after = 0;
let rewritten = 0;

for (const name of files) {
	const file = path.join(DIR, name);
	const original = (await fs.stat(file)).size;
	const image = sharp(file, { failOn: "none" });
	const { width, height } = await image.metadata();

	before += original;

	const oversized = Math.max(width, height) > MAX_EDGE;

	// mozjpeg gets meaningfully smaller files than libjpeg at the same visual
	// quality, so it is worth re-encoding even a photo that needs no resize.
	const output = await image
		.rotate() // honour EXIF orientation before we drop the metadata
		.resize({
			width: oversized ? MAX_EDGE : null,
			height: oversized ? MAX_EDGE : null,
			fit: "inside",
			withoutEnlargement: true,
		})
		.jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
		.toBuffer();

	// Never make a file bigger than it already was.
	if (output.length >= original) {
		after += original;
		console.log(`  keep   ${name} (${kb(original)}KB, already smaller)`);
		continue;
	}

	after += output.length;
	rewritten += 1;
	const size = oversized ? `${width}x${height} -> max ${MAX_EDGE}px` : "re-encoded";
	console.log(
		`  ${dryRun ? "would" : "write"}  ${name}: ${kb(original)}KB -> ${kb(output.length)}KB (${size})`,
	);

	if (!dryRun) await fs.writeFile(file, output);
}

console.log(
	`\n${rewritten}/${files.length} photos ${dryRun ? "would be " : ""}rewritten. ` +
		`${(before / 1024 / 1024).toFixed(1)}MB -> ${(after / 1024 / 1024).toFixed(1)}MB ` +
		`(${Math.round((1 - after / before) * 100)}% smaller).`,
);
