const fs = require("node:fs/promises");
const path = require("path");
const { Image, eleventyImageTransformPlugin } = require("@11ty/eleventy-img");
const { configureScss } = require("./_lib/scss");

module.exports = async (eleventyConfig) => {
	const { EleventyRenderPlugin } = await import("@11ty/eleventy");

	eleventyConfig.addPlugin(EleventyRenderPlugin);
	eleventyConfig.addWatchTarget("./src/**/*");
	eleventyConfig.addPassthroughCopy("src/assets");

	// Configure SCSS compilation
	configureScss(eleventyConfig);

	// Ignore SCSS partials (files starting with underscore)
	eleventyConfig.ignores.add("src/**/_*.scss");
	eleventyConfig.addPassthroughCopy({
		"src/assets/favicon.ico": "/favicon.ico",
	});

	eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
		formats: ["webp", "jpeg", "svg"],
		widths: ["auto", 1200, 900, 600, 400],
		svgShortCircuit: true,
		htmlOptions: {
			imgAttributes: {
				sizes: "auto",
				loading: "lazy",
				decoding: "async",
			},
		},
	});

	eleventyConfig.addShortcode("image", async (src, alt, sizes) => {
		let metadata = await Image(src, {
			widths: [150, 300],
			formats: ["webp", "jpeg"],
			outputDir: "./_site/img/",
		});

		let imageAttributes = {
			alt,
			sizes,
			loading: "lazy",
			decoding: "async",
		};

		// You bet we throw an error on a missing alt (alt="" works okay)
		return Image.generateHTML(metadata, imageAttributes);
	});

	eleventyConfig.addShortcode("serviceAreaLinks", async (currentPage) => {
		const inputPath = currentPage.inputPath;
		const fileSlug = currentPage.fileSlug;

		const dirPath = path.dirname(inputPath);
		const areaDir = path.join(dirPath, fileSlug);

		try {
			const files = await fs.readdir(areaDir);
			const mdFiles = files
				.filter(file => file.endsWith(".md"))
				.map(file => file.replace(".md", ""))
				.sort();

			if (mdFiles.length === 0) {
				return "";
			}

			const baseUrl = currentPage.url;
			const links = mdFiles.map(area => {
				const title = area
					.split("-")
					.map(word => word.charAt(0).toUpperCase() + word.slice(1))
					.join(" ");
				return `[${title}](${baseUrl}${area}/)`;
			});

			if (links.length === 1) {
				return links[0];
			}

			if (links.length === 2) {
				return `${links[0]} and ${links[1]}`;
			}

			const allButLast = links.slice(0, -1).join(", ");
			const last = links[links.length - 1];
			return `${allButLast}, and ${last}`;
		} catch (error) {
			return "";
		}
	});

	return {
		dir: {
			input: "src",
			output: "_site",
			includes: "_includes",
			layouts: "_layouts",
			data: "_data",
		},
		templateFormats: ["liquid", "njk", "md", "html"],
		htmlTemplateEngine: "liquid",
		markdownTemplateEngine: "liquid",
	};
};
