#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "instagram-posts");
const SOCIALS_FILE = path.join(ROOT, "src", "_data", "socials.json");
const ACTOR_ID = "shu8hvrXbJbY3Eb9W";
const DEFAULT_LIMIT = 20;

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

function getLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  const limit = argument ? Number(argument.slice("--limit=".length)) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("--limit must be an integer between 1 and 100");
  }
  return limit;
}

function safeSlug(date, id) {
  const safeDate = new Date(date).toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
  const safeId = String(id).replace(/[^a-z0-9_-]/gi, "-").slice(0, 80);
  return `${safeDate}-${safeId}`;
}

function getMediaUrls(post) {
  const urls = [post.displayUrl, ...(post.images || []), ...(post.carouselImages || [])];
  for (const child of post.childPosts || []) {
    urls.push(child.displayUrl, ...(child.images || []));
  }
  return [...new Set(urls.filter(Boolean))];
}

function normalizePost(post) {
  if (!post.timestamp || !post.url || !(post.id || post.shortCode)) return null;

  return {
    id: String(post.id || post.shortCode),
    shortCode: post.shortCode || null,
    url: post.url,
    date: new Date(post.timestamp).toISOString(),
    text: (post.caption || "").trim(),
    type: post.type || post.productType || null,
    ownerUsername: post.ownerUsername || "renegadeelectrical",
    ownerFullName: post.ownerFullName || "Renegade Electrical",
    mediaUrls: getMediaUrls(post),
    videoUrl: post.videoUrl || null,
    hashtags: post.hashtags || [],
    mentions: post.mentions || [],
    taggedUsers: post.taggedUsers || [],
    likes: post.likesCount ?? null,
    comments: post.commentsCount ?? null,
    videoViews: post.videoViewCount ?? null,
    videoPlays: post.videoPlayCount ?? null,
  };
}

async function fetchPosts(profileUrl, limit) {
  const endpoint = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      directUrls: [profileUrl],
      resultsType: "posts",
      resultsLimit: limit,
    }),
  });

  if (!response.ok) throw new Error(`Instagram scrape failed (${response.status}): ${await response.text()}`);
  const results = await response.json();
  if (!Array.isArray(results)) throw new Error("Instagram scraper returned an invalid response");
  return results;
}

async function main() {
  loadEnv();
  if (!process.env.APIFY_API_KEY) throw new Error("APIFY_API_KEY is required in .env or the environment");

  const socials = JSON.parse(fs.readFileSync(SOCIALS_FILE, "utf8"));
  const profileUrl = socials.instagram?.url;
  if (!profileUrl) throw new Error("src/_data/socials.json is missing instagram.url");

  const posts = (await fetchPosts(profileUrl, getLimit())).map(normalizePost).filter(Boolean);
  fs.mkdirSync(POSTS_DIR, { recursive: true });

  let saved = 0;
  for (const post of posts) {
    const file = path.join(POSTS_DIR, `${safeSlug(post.date, post.id)}.json`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, `${JSON.stringify(post, null, 2)}\n`, "utf8");
    saved += 1;
  }

  console.log(`Saved ${saved} new Instagram posts (${posts.length - saved} already existed)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { getMediaUrls, normalizePost, safeSlug };
