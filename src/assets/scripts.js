(() => {
	window.addEventListener("load", () => {
		var form = document.querySelector("form[data-botpoison-public-key]");
		var button = form?.querySelector("button[type=submit]");
		if (!button) return;
		form.addEventListener("botpoison-challenge-start", () => {
			button.setAttribute("disabled", "disabled");
		});
		form.addEventListener("botpoison-challenge-success", () => {
			button.removeAttribute("disabled");
		});
		form.addEventListener("botpoison-challenge-error", () => {
			button.removeAttribute("disabled");
		});
	});
})();
