// Masonry layout for the reviews grid.
//
// Adapted from the chobble-template masonry layout. Uses uWrap to predict each
// card's height from computed font metrics, so cards can be positioned in a
// single pass with no reflow / flash of mis-positioned content.
//
// This is bundled (with uWrap inlined) into ../src/assets/masonry.js via
// `npm run build:js`. Edit THIS file, never the bundled output.
//
// The numeric constants below are tuned to renegade-solar's review-card CSS in
// src/css/_customer-reviews.scss. If you change the card padding, gaps, border
// or column sizing there, update the matching constant here.

import { varPreLine } from "uwrap";

// --- Measurements (must match _customer-reviews.scss) -----------------------
const CARD_GAP = 32; // gap between cards, both axes (2rem)
const SECTION_GAP = 16; // gap between sections inside a card (1rem)
const CARD_PADDING = 24; // card padding, all sides (1.5rem)
const CARD_BORDER = 0; // cards use box-shadow, no border
const MIN_COL_WIDTH = 300; // narrowest a column may get before dropping one
const MOBILE_BREAKPOINT = 768; // single column at or below this width

// --- uWrap line-counting, cached per font -----------------------------------
const counterCache = new Map();

const getCounter = (font) => {
	if (counterCache.has(font)) return counterCache.get(font);
	const ctx = document.createElement("canvas").getContext("2d");
	ctx.font = font;
	const counter = varPreLine(ctx).count;
	counterCache.set(font, counter);
	return counter;
};

const getFont = (el) => {
	const s = getComputedStyle(el);
	return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
};

const getLineHeight = (el) => Number.parseFloat(getComputedStyle(el).lineHeight);

// The element's CSS max-height in px, or Infinity when unset ("none").
const capHeight = (el) => {
	const max = Number.parseFloat(getComputedStyle(el).maxHeight);
	return Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
};

const textHeight = (text, font, lineHeight, width) =>
	getCounter(font)(text, width) * lineHeight;

// Predicted rendered height of an element's text content at a given width.
const elTextHeight = (el, width) => {
	const text = (el.textContent || "").trim().replace(/\s+/g, " ");
	return textHeight(text, getFont(el), getLineHeight(el), width);
};

// Measure an element matched by selector, or null when it is absent.
const measureOrNull = (card, selector, width) => {
	const el = card.querySelector(selector);
	return el ? elTextHeight(el, width) : null;
};

// Sum a list of section heights with inter-section gaps and the card padding.
const sumSections = (heights) => {
	const valid = heights.filter((h) => h !== null);
	const gaps = valid.length > 1 ? SECTION_GAP * (valid.length - 1) : 0;
	const padding = CARD_PADDING * 2;
	const border = CARD_BORDER * 2;
	return valid.reduce((sum, h) => sum + h, 0) + gaps + padding + border;
};

// Predict the full height of one review card at the given inner column width.
const measureReviewCard = (card, contentWidth) => {
	// Header: rating (left) and date (right) share one row, each single-line.
	const ratingEl = card.querySelector(".rating");
	const dateEl = card.querySelector(".date");
	const headerEls = [ratingEl, dateEl].filter(Boolean);
	const headerHeight = headerEls.length
		? Math.max(...headerEls.map((el) => getLineHeight(el)))
		: null;

	const titleHeight = measureOrNull(card, ".review-title", contentWidth);

	// The review body scrolls past a CSS max-height, so cap the predicted height
	// there — otherwise a long review over-reserves space and leaves a big gap.
	const reviewEl = card.querySelector(".review");
	const reviewText = measureOrNull(card, ".review", contentWidth);
	let reviewHeight = null;
	if (reviewText !== null) {
		const cap = capHeight(reviewEl);
		reviewHeight = Math.min(reviewText, cap);
		// Flag reviews tall enough to scroll so CSS can fade the clipped edge.
		reviewEl.classList.toggle("is-clamped", reviewText > cap);
	}

	const metaHeight = measureOrNull(card, ".review-meta", contentWidth);

	return sumSections([headerHeight, titleHeight, reviewHeight, metaHeight]);
};

const placeCards = (container) => {
	const cards = [...container.querySelectorAll(":scope > li")];
	if (cards.length === 0) return;

	const width = container.offsetWidth;
	const colCount =
		width < MOBILE_BREAKPOINT
			? 1
			: Math.max(
					2,
					Math.floor((width + CARD_GAP) / (MIN_COL_WIDTH + CARD_GAP)),
				);
	const colWidth = (width - CARD_GAP * (colCount - 1)) / colCount;
	const contentWidth = colWidth - CARD_PADDING * 2 - CARD_BORDER * 2;
	const colHeights = new Float64Array(colCount);

	for (const card of cards) {
		const cardHeight = measureReviewCard(card, contentWidth);
		const col = colHeights.indexOf(Math.min(...colHeights));
		card.style.width = `${colWidth}px`;
		card.style.transform = `translate(${col * (colWidth + CARD_GAP)}px, ${colHeights[col]}px)`;
		colHeights[col] += cardHeight + CARD_GAP;
	}

	const maxHeight = Math.max(...colHeights);
	container.style.height = `${maxHeight - CARD_GAP}px`;
	container.classList.add("masonry-ready");
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

const init = () => {
	if (!document.querySelector("ul.reviews-grid.masonry")) return;
	layoutAll();
};

// Run on first load and after every Turbo navigation; relayout on resize.
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
document.addEventListener("turbo:load", init);
window.addEventListener("resize", debounce(layoutAll, 100));
