#!/usr/bin/env node

const path = require("path");
const { ROOT, socialFetchCli } = require("./social-fetch-common");

const ACTOR_ID = "shu8hvrXbJbY3Eb9W";
const POSTS_DIR = path.join(ROOT, "instagram-posts");

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

socialFetchCli(module, {
  network: "instagram",
  label: "Instagram",
  actorId: ACTOR_ID,
  postsDir: POSTS_DIR,
  buildPayload: (url, limit) => ({ directUrls: [url], resultsType: "posts", resultsLimit: limit }),
  normalizePost,
});

module.exports = { getMediaUrls, normalizePost };
