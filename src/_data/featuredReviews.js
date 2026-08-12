const reviews = require("./reviews.json");

// Whitespace inside a review is whatever the customer typed - blank lines,
// hard wraps, trailing spaces. Collapse it to single spaces so a quotation
// reads properly when it is pulled out of the list and set as one paragraph.
const flatten = (text) =>
	String(text || "")
		.replace(/\s+/g, " ")
		.trim();

// The motifs quote reviews by position. Picking straight out of reviews.json
// would mean the featured quote changes character every time the review feed
// updates, and could land on a 900-word one that has to be cut mid-sentence.
// This is a stable pool: top-rated, long enough to say something, short enough
// to print whole, newest first.
const MIN_LENGTH = 110;
const MAX_LENGTH = 340;

module.exports = () => {
	const pool = reviews.reviews
		.filter((review) => review.rating && review.rating.rating >= 9.5)
		.map((review) => ({ ...review, review: flatten(review.review) }))
		.filter(
			(review) =>
				review.review.length >= MIN_LENGTH &&
				review.review.length <= MAX_LENGTH,
		)
		.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

	// Fall back to the raw list rather than rendering nothing if the length
	// window ever excludes everything.
	return pool.length
		? pool
		: reviews.reviews.map((review) => ({
				...review,
				review: flatten(review.review),
			}));
};
