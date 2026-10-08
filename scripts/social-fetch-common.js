#!/usr/bin/env node

/**
 * Shared scaffolding for the social-post fetchers. Facebook and Instagram
 * both pull from Apify actors and drop JSON files into their own directory;
 * everything identical between them lives here so each fetch script only
 * carries its platform-specific normalisation.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOCIALS_FILE = path.join(ROOT, "src", "_data", "socials.json");
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

async function fetchApifyPosts({ actorId, platform, url, limit, buildPayload }) {
  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(url, limit)),
  });

  if (!response.ok) throw new Error(`${platform} scrape failed (${response.status}): ${await response.text()}`);
  const results = await response.json();
  if (!Array.isArray(results)) throw new Error(`${platform} scraper returned an invalid response`);
  return results;
}

function readSocialUrl(network) {
  const socials = JSON.parse(fs.readFileSync(SOCIALS_FILE, "utf8"));
  const url = socials[network]?.url;
  if (!url) throw new Error(`src/_data/socials.json is missing ${network}.url`);
  return url;
}

function savePosts(posts, postsDir, label) {
  fs.mkdirSync(postsDir, { recursive: true });

  let saved = 0;
  for (const post of posts) {
    const file = path.join(postsDir, `${safeSlug(post.date, post.id)}.json`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, `${JSON.stringify(post, null, 2)}\n`, "utf8");
    saved += 1;
  }

  console.log(`Saved ${saved} new ${label} posts (${posts.length - saved} already existed)`);
}

/** Runs one fetcher end to end and wires up the CLI entry point. */
function socialFetchCli(currentModule, { network, label, actorId, postsDir, buildPayload, normalizePost }) {
  if (currentModule !== require.main) return;

  (async () => {
    loadEnv();
    if (!process.env.APIFY_API_TOKEN) throw new Error("APIFY_API_TOKEN is required in .env or the environment");

    const url = readSocialUrl(network);
    const posts = (await fetchApifyPosts({ actorId, platform: label, url, limit: getLimit(), buildPayload }))
      .map(normalizePost)
      .filter(Boolean);
    savePosts(posts, postsDir, label);
  })().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { ROOT, loadEnv, getLimit, safeSlug, fetchApifyPosts, readSocialUrl, savePosts, socialFetchCli };
