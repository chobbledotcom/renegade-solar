const processSets = {
	"commercial-solar-installations": "commercial",
	"consumer-unit-upgrades": "consumer_unit",
	"electric-vehicle-charger-installations": "ev",
	"electrical-safety-inspections-eicr": "inspection",
	"electrical-testing": "inspection",
	"home-battery-installations": "battery",
	"solar-and-battery-installations": "solar",
	"solar-panel-removal-refit": "removal_refit",
};

export default {
	eleventyComputed: {
		icon: (data) => {
			if (data.icon == null) return null;
			const pathParts = data.icon.split("/");
			return pathParts[pathParts.length - 1];
		},
		service_process_set: (data) => {
			const pathParts = data.page.filePathStem.split("/");
			return processSets[pathParts[2]] ?? "solar";
		},
	},
};
