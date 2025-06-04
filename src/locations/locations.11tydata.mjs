export default {
  eleventyComputed: {
    icon: (data) => {
      if (data.icon == null) return "";
      const pathParts = data.icon.split("/");
      return pathParts[pathParts.length - 1];
    },
  },
};
