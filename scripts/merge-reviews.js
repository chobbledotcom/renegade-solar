#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REVIEWS_DIR = path.join(ROOT, "src", "_data", "reviews");
const REVIEWS_JSON = path.join(ROOT, "src", "_data", "reviews.json");
const FETCH_SCRIPT = path.join(ROOT, "bin", "fetch-reviews");
const GOOGLE_REVIEWS_REPO = "https://github.com/chobbledotcom/google-reviews-iframe.git";
const GOOGLE_REVIEWS_FRAME_DIRS = [
  path.join(ROOT, "..", "google-reviews-iframe", "data", "renegade-solar"),
  path.join(ROOT, "..", "google-reviews-frame", "data", "renegade-solar"),
];
const TEMP_DIR = path.join(ROOT, "temp-reviews");
const SLUG = "renegade-solar";

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", ...opts });
}

function runSilent(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    console.log("Cleaning up temporary directory...");
    fs.rmSync(TEMP_DIR, { recursive: true });
  }
}

function fetchCheckatradeReviews() {
  console.log("Fetching Checkatrade reviews via bin/fetch-reviews...");
  try {
    run(`bash "${FETCH_SCRIPT}"`, { cwd: ROOT });
  } catch (e) {
    console.error("Checkatrade fetch failed:", e.message);
  }
}

function loadGoogleReviews() {
  let reviewsDir;

  const localReviewsDir = GOOGLE_REVIEWS_FRAME_DIRS.find((dir) => fs.existsSync(dir));

  if (localReviewsDir) {
    console.log("Using local google-reviews-iframe data...");
    reviewsDir = localReviewsDir;
  } else {
    console.log("Cloning google-reviews-iframe...");
    try {
      run(`git clone --depth 1 "${GOOGLE_REVIEWS_REPO}" "${TEMP_DIR}"`);
    } catch (e) {
      console.error("Failed to clone google-reviews-iframe:", e.message);
      return [];
    }
    reviewsDir = path.join(TEMP_DIR, "reviews", SLUG);
    if (!fs.existsSync(reviewsDir)) {
      console.warn(`No reviews found for "${SLUG}" in google-reviews-iframe`);
      return [];
    }
  }

  const files = fs.readdirSync(reviewsDir).filter((f) => f.endsWith(".json"));
  const reviews = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(reviewsDir, file), "utf8"));
      if (!raw.content || raw.content.trim().length === 0) continue;
      reviews.push({ ...raw, _fileName: file });
    } catch (e) {
      console.warn(`Failed to parse ${file}:`, e.message);
    }
  }

  console.log(`Loaded ${reviews.length} reviews from Google/Facebook/Trustpilot`);
  return reviews;
}

function loadCheckatradeReviews() {
  if (!fs.existsSync(REVIEWS_DIR)) return [];

  const files = fs.readdirSync(REVIEWS_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("gr-") && !f.startsWith("fb-") && !f.startsWith("tp-"),
  );
  const reviews = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(REVIEWS_DIR, file), "utf8"));
      reviews.push({ ...raw, _fileName: file, _source: "checkatrade" });
    } catch (e) {
      console.warn(`Failed to parse ${file}:`, e.message);
    }
  }

  console.log(`Loaded ${reviews.length} Checkatrade reviews`);
  return reviews;
}

function normalizeReview(raw) {
  const src = raw.source || raw._source || "google";
  const rating = raw.rating ? (typeof raw.rating === "object" ? raw.rating.rating : raw.rating) : 0;

  let normRating;
  if (src === "checkatrade") {
    normRating = rating;
  } else {
    normRating = Math.round(rating * 2 * 10) / 10;
  }

  const text = (raw.review || raw.content || "").trim();
  const firstSentence = text.split(/[.!?]\s/)[0];
  const titleFallback = firstSentence.length > 120 ? firstSentence.substring(0, 117) + "..." : firstSentence;
  const title = raw.title || titleFallback || `Review by ${raw.author || "Customer"}`;

  const date = raw.createdAt || raw.date || new Date().toISOString();
  const postcode = (raw.location && raw.location.postcode) || "";

  let id;
  if (raw.id && src === "checkatrade") {
    id = raw.id;
  } else if (raw.id) {
    id = raw.id;
  } else {
    let uid = (raw.userId || "").replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 40);
    uid = uid.replace(/^(gr|fb|tp)-/, "");
    const dateStr = date.substring(0, 10).replace(/-/g, "");
    id = `${src === "google" ? "gr" : src === "facebook" ? "fb" : src === "trustpilot" ? "tp" : "xx"}-${uid}-${dateStr}`;
  }

  return {
    id,
    title,
    review: text,
    createdAt: date,
    updatedAt: date,
    location: { postcode },
    verified: raw.verified || "VERIFIED",
    rating: {
      qualityOfWorkmanship: normRating,
      reliabilityAndTimekeeping: normRating,
      communication: normRating,
      rating: normRating,
    },
    reviewer: {
      id: raw.userId || "",
      displayName: raw.author || raw.reviewer?.displayName || "",
    },
    source: src,
    authorUrl: raw.authorUrl || "",
  };
}

function writeReviewFiles(reviews) {
  fs.mkdirSync(REVIEWS_DIR, { recursive: true });

  for (const review of reviews) {
    const fileName = `${review.id}.json`;
    const filePath = path.join(REVIEWS_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(review), "utf8");
  }
}

function generateSummary(reviews) {
  const sorted = [...reviews].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );

  const ratings = sorted.map((r) => r.rating.rating);
  const averageRating = ratings.length > 0
    ? Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 100) / 100
    : 0;

  return {
    total: sorted.length,
    averageRating,
    reviews: sorted,
  };
}

function main() {
  try {
    cleanup();

    fetchCheckatradeReviews();

    const checkatrade = loadCheckatradeReviews();
    const google = loadGoogleReviews();

    const allNormalized = [
      ...checkatrade.map(normalizeReview),
      ...google.map(normalizeReview),
    ];

    const seen = new Set();
    const deduped = allNormalized.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    console.log(`Total reviews after merge: ${deduped.length}`);

    writeReviewFiles(deduped);

    const summary = generateSummary(deduped);
    fs.writeFileSync(REVIEWS_JSON, JSON.stringify(summary, null, 2), "utf8");
    console.log(`Written reviews.json with ${summary.total} reviews, avg rating ${summary.averageRating}/10`);

    cleanup();
    console.log("Done!");
  } catch (e) {
    console.error("Error:", e.message);
    cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
