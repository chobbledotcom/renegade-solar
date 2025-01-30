const fs = require("node:fs/promises");
const path = require("path");
const { Image, eleventyImageTransformPlugin } = require("@11ty/eleventy-img");

module.exports = async function (eleventyConfig) {
	const { EleventyRenderPlugin } = await import("@11ty/eleventy");

	eleventyConfig.addPlugin(EleventyRenderPlugin);
	eleventyConfig.addWatchTarget("./src/**/*");
	eleventyConfig.addPassthroughCopy("src/assets");
	eleventyConfig.addPassthroughCopy({
		"src/assets/favicon.ico": "/favicon.ico",
	});

	eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
		widths: ["auto"],
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

	return {
		dir: {
			input: "src",
			output: "_site",
			includes: "_includes",
			layouts: "_layouts",
			data: "_data",
		},
		templateFormats: ["liquid", "njk", "md"],
		htmlTemplateEngine: "liquid",
		markdownTemplateEngine: "liquid",
	};
};
