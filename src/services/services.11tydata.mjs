export default {
	eleventyComputed: {
		icon: (data) => {
			if (data.icon == null) return null;
			const pathParts = data.icon.split("/");
			return pathParts[pathParts.length - 1];
		},
	},
};
