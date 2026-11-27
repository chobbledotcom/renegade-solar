// Masonry layout for the reviews grid.
//
// CSS cannot flow cards into the shortest of several columns without reordering
// them (column-count fills down a column, not across), so the placement is done
// in JS. Card heights are predicted with pretext rather than read back from the
// DOM: getBoundingClientRect/offsetHeight force a reflow, while pretext
// segments each text block and measures it on a canvas with the browser's own
// font engine, so the line count matches what the browser paints.
//
// That accuracy depends on the CSS agreeing with pretext's model, which assumes
// `overflow-wrap: break-word` (set on .review-title and .review) and a plain
// font shorthand. The predictable pieces of a card - padding, the gap between
// its blocks, the review body's max-height - are mirrored from
// src/css/_customer-reviews.scss below.
//
// Column widths are the only thing a resize changes; prepared text is
// width-independent, so a resize re-runs arithmetic only. Webfonts do change
// the metrics, so both caches are dropped once they have loaded.
//
// This is bundled into ../src/assets/masonry.js via `npm run build:js`. Edit
// THIS file, never the bundled output.

import { clearCache, layout, prepare } from "@chenglou/pretext";

// --- Measurements (must match _customer-reviews.scss) -----------------------
const CARD_GAP = 32; // gap between cards, both axes (2rem)
const SECTION_GAP = 16; // gap between blocks inside a card (1rem)
const CARD_PADDING = 24; // card padding, all sides (1.5rem)
const MIN_COL_WIDTH = 300; // narrowest a column may get before dropping one
const MOBILE_BREAKPOINT = 768; // single column at or below this width

// Prepared text per card, kept across resizes and dropped when fonts change.
let preparedCards = new WeakMap();

// Prepare one text block: its text, the font it paints in, its line height and
// the max-height its card shares (only the review body has one).
const prepareBlock = (el) => {
	if (!el) return null;
	const style = getComputedStyle(el);
	const cap = Number.parseFloat(style.maxHeight);
	return {
		text: prepare(
			el.textContent || "",
			`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
		),
		lineHeight: Number.parseFloat(style.lineHeight),
		maxHeight: Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY,
		el,
	};
};

// The blocks that make up a card, in the order the flex column lays them out.
const prepareCard = (card) => {
	const headerLineHeights = [".rating", ".date"]
		.map((selector) => card.querySelector(selector))
		.filter(Boolean)
		.map((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
	return {
		// Rating and date share one flex row, so the taller line box wins.
		header: headerLineHeights.length ? Math.max(...headerLineHeights) : null,
		title: prepareBlock(card.querySelector(".review-title")),
		review: prepareBlock(card.querySelector(".review")),
		meta: prepareBlock(card.querySelector(".review-meta")),
	};
};

// Rendered height of one block at the given content width. The review body
// scrolls past its CSS max-height, so a long one must not stretch the card.
const blockHeight = (block, contentWidth) =>
	Math.min(
		layout(block.text, contentWidth, block.lineHeight).height,
		block.maxHeight,
	);

// Rendered height of one card, from its prepared blocks. Callers prepare every
// card before touching the DOM, so the style reads in prepareCard share a
// single style pass.
const cardHeight = (blocks, contentWidth) => {
	const heights = [blocks.header];
	if (blocks.title) heights.push(blockHeight(blocks.title, contentWidth));
	if (blocks.review) {
		const { el, text, lineHeight, maxHeight } = blocks.review;
		const height = layout(text, contentWidth, lineHeight).height;
		// Fade the bottom edge of a review long enough to scroll.
		const clamped = height > maxHeight;
		if (clamped !== el.classList.contains("is-clamped")) {
			el.classList.toggle("is-clamped", clamped);
		}
		heights.push(Math.min(height, maxHeight));
	}
	if (blocks.meta) heights.push(blockHeight(blocks.meta, contentWidth));
	// Every block is a flex child, so an empty one still adds a gap.
	const present = heights.filter((height) => height !== null);
	const gaps = present.length > 1 ? SECTION_GAP * (present.length - 1) : 0;
	return present.reduce((sum, height) => sum + height, 0) + gaps + CARD_PADDING * 2;
};

const placeCards = (container) => {
	const cards = [...container.querySelectorAll(":scope > li")];
	const width = container.offsetWidth;
	// Width is 0 when the container is hidden (display:none ancestor, an
	// unrendered preview). Leave the CSS grid fallback alone and try again on
	// the next resize.
	if (cards.length === 0 || width === 0) return;

	const colCount =
		width < MOBILE_BREAKPOINT
			? 1
			: Math.max(2, Math.floor((width + CARD_GAP) / (MIN_COL_WIDTH + CARD_GAP)));
	const colWidth = (width - CARD_GAP * (colCount - 1)) / colCount;
	const contentWidth = colWidth - CARD_PADDING * 2;

	// Style reads (and nothing else) for cards not prepared yet, then measure,
	// then write. Keeps one style pass before the placement writes.
	for (const card of cards) {
		if (!preparedCards.has(card)) preparedCards.set(card, prepareCard(card));
	}
	const cardsWithHeights = cards.map((card) => ({
		card,
		height: cardHeight(preparedCards.get(card), contentWidth),
	}));

	container.classList.add("masonry-ready");
	const colHeights = new Float64Array(colCount);
	for (const { card, height } of cardsWithHeights) {
		const col = colHeights.indexOf(Math.min(...colHeights));
		card.style.width = `${colWidth}px`;
		card.style.transform = `translate(${col * (colWidth + CARD_GAP)}px, ${colHeights[col]}px)`;
		colHeights[col] += height + CARD_GAP;
	}

	container.style.height = `${Math.max(0, Math.max(...colHeights) - CARD_GAP)}px`;
};

const debounce = (fn, delay) => {
	let timer = null;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(fn, delay);
	};
};

const layoutAll = () => {
	const containers = document.querySelectorAll("ul.reviews-grid.masonry");
	for (const container of containers) placeCards(container);
};

// Drop the prepared text and lay out again: webfont metrics differ from the
// fallback's, so heights measured before a face lands are stale.
let relayoutQueued = false;
const relayoutForFonts = () => {
	// `loadingdone` and `fonts.ready` both report the same batch; coalesce.
	if (relayoutQueued) return;
	relayoutQueued = true;
	setTimeout(() => {
		relayoutQueued = false;
		preparedCards = new WeakMap();
		clearCache();
		layoutAll();
	}, 0);
};

const init = () => {
	layoutAll();
	const fonts = document.fonts;
	if (!fonts) return;
	// A face that lands later (a second weight, an icon font) changes metrics.
	fonts.addEventListener("loadingdone", relayoutForFonts);
	// A face already in flight when this ran will fire `loadingdone` too, but
	// only if it finishes after this listener attached, so also wait on ready.
	if (fonts.status === "loading") fonts.ready.then(relayoutForFonts);
};

// Run on page load; relayout on resize.
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
window.addEventListener("resize", debounce(layoutAll, 100));
