export default {
	eleventyComputed: {
		logo: (data) => {
			if (data.logo == null) return null;
			const pathParts = data.logo.split("/");
			return pathParts[pathParts.length - 1];
		},
	},
};
