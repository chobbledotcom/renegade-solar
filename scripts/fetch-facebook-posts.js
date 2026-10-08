#!/usr/bin/env node

const path = require("path");
const { ROOT, socialFetchCli } = require("./social-fetch-common");

const ACTOR_ID = "KoJrdxJCTtpon81KY";
const POSTS_DIR = path.join(ROOT, "social-posts");

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

socialFetchCli(module, {
  network: "facebook",
  label: "Facebook",
  actorId: ACTOR_ID,
  postsDir: POSTS_DIR,
  buildPayload: (url, limit) => ({ startUrls: [{ url }], resultsLimit: limit }),
  normalizePost,
});

module.exports = { getPostDate, normalizePost };
