#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "social-posts");
const SOCIALS_FILE = path.join(ROOT, "src", "_data", "socials.json");
const ACTOR_ID = "KoJrdxJCTtpon81KY";
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

function getPostDate(post) {
  const value = post.time || post.createdTime || post.date;
  if (value) return new Date(value).toISOString();
  if (!post.timestamp) return null;

  const timestamp = Number(post.timestamp);
  return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
}

function getPostText(post) {
  return (post.text || post.message || post.caption || "").replace(/\s+/g, " ").trim();
}

function getMediaUrls(post) {
  const urls = [post.fullPicture, post.image, post.displayUrl];
  for (const item of post.media || []) {
    urls.push(item?.photo_image?.uri, item?.thumbnail, item?.url);
  }
  return [...new Set(urls.filter(Boolean))];
}

function safeSlug(date, id) {
  const safeDate = date.replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
  const safeId = String(id).replace(/[^a-z0-9]/gi, "-").slice(0, 80);
  return `${safeDate}-${safeId}`;
}

async function fetchPosts(facebookUrl, limit) {
  const endpoint = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startUrls: [{ url: facebookUrl }],
      resultsLimit: limit,
    }),
  });

  if (!response.ok) throw new Error(`Facebook scrape failed (${response.status}): ${await response.text()}`);
  const results = await response.json();
  if (!Array.isArray(results)) throw new Error("Facebook scraper returned an invalid response");
  return results;
}

function normalizePost(post) {
  const date = getPostDate(post);
  const url = post.url || post.postUrl;
  const id = post.postId || post.id || url;
  if (!date || !url || !id) return null;

  const text = getPostText(post);
  return {
    id: String(id),
    url,
    date,
    text,
    title: text.slice(0, 240) || "View this post on Facebook",
    pageName: post.pageName || post.user?.name || "Renegade Solar",
    pageUrl: post.pageUrl || post.user?.url || "https://www.facebook.com/RenSolarManchester/",
    mediaUrls: getMediaUrls(post),
    reactions: post.likes ?? post.reactions ?? post.reactionsCount ?? null,
    comments: post.comments ?? post.commentsCount ?? null,
    shares: post.shares ?? post.sharesCount ?? null,
  };
}

async function main() {
  loadEnv();
  if (!process.env.APIFY_API_KEY) throw new Error("APIFY_API_KEY is required in .env or the environment");

  const socials = JSON.parse(fs.readFileSync(SOCIALS_FILE, "utf8"));
  const facebookUrl = socials.facebook?.url;
  if (!facebookUrl) throw new Error("src/_data/socials.json is missing facebook.url");

  const posts = (await fetchPosts(facebookUrl, getLimit())).map(normalizePost).filter(Boolean);
  fs.mkdirSync(POSTS_DIR, { recursive: true });

  let saved = 0;
  for (const post of posts) {
    const file = path.join(POSTS_DIR, `${safeSlug(post.date, post.id)}.json`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, `${JSON.stringify(post, null, 2)}\n`, "utf8");
    saved += 1;
  }

  console.log(`Saved ${saved} new Facebook posts (${posts.length - saved} already existed)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { getPostDate, normalizePost, safeSlug };
