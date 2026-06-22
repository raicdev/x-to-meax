import * as cheerio from "cheerio";

import { buildPostKey } from "./format.js";
import { extractStatusId } from "./nitterRssClient.js";

export class NitterHtmlClient {
  constructor({
    username,
    htmlUrl,
    nitterBaseUrl,
    userAgent,
    extraHeaders,
    fetchImpl = fetch,
  }) {
    this.username = username?.replace(/^@+/, "");
    this.htmlUrl = htmlUrl;
    this.nitterBaseUrl = nitterBaseUrl || "https://nitter.net";
    this.userAgent = userAgent || "x-to-meax/0.1.0";
    this.extraHeaders = extraHeaders || {};
    this.fetch = fetchImpl;
  }

  async getRecentPosts({ sinceId } = {}) {
    const feed = await this.getRecentFeed();
    return feed.posts.filter(
      (post) => !sinceId || BigInt(post.id) > BigInt(sinceId),
    );
  }

  async getRecentFeed({ etag, lastModified, cacheUrl } = {}) {
    const url = this.buildHtmlUrl();
    const useCache = !cacheUrl || cacheUrl === url;
    const response = await this.fetch(url, {
      headers: this.buildHeaders({
        etag: useCache ? etag : null,
        lastModified: useCache ? lastModified : null,
      }),
    });

    const cache = readFeedCache(response);
    cache.url = url;

    if (response.status === 304) {
      return {
        posts: [],
        cache,
        notModified: true,
        sourceUrl: url,
      };
    }

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(
        `Nitter HTML request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }

    const html = await response.text();
    validateNitterHtml(html, url);
    const posts = parseNitterHtml(html, { sourceUrl: url });

    return {
      posts: posts.sort((a, b) =>
        BigInt(a.id) < BigInt(b.id) ? -1 : 1,
      ),
      cache,
      notModified: false,
      sourceUrl: url,
    };
  }

  buildHeaders({ etag, lastModified } = {}) {
    const headers = {
      "user-agent": this.userAgent,
    };

    if (etag) {
      headers["if-none-match"] = etag;
    }
    if (lastModified) {
      headers["if-modified-since"] = lastModified;
    }

    return {
      ...headers,
      ...this.extraHeaders,
    };
  }

  buildHtmlUrl() {
    if (this.htmlUrl) {
      return this.htmlUrl;
    }
    if (!this.username) {
      throw new Error("X_USERNAME is required when NITTER_HTML_URL is not set.");
    }
    return `${this.nitterBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(this.username)}`;
  }
}

export function parseNitterHtml(html, { sourceUrl = "https://nitter.net" } = {}) {
  const $ = cheerio.load(html);
  const posts = [];

  $(".timeline-item").each((_index, element) => {
    const post = normalizeTimelineItem($, element, sourceUrl);
    if (post?.id) {
      posts.push(post);
    }
  });

  return posts;
}

export function validateNitterHtml(html, url) {
  if (!html.trim()) {
    throw new Error(`Nitter HTML response was empty for ${url}.`);
  }

  const $ = cheerio.load(html);
  if ($(".timeline-item").length === 0 && $(".timeline").length === 0) {
    throw new Error(`Nitter HTML response did not contain a timeline for ${url}.`);
  }
}

function normalizeTimelineItem($, element, sourceUrl) {
  const item = $(element);
  const link = absolutizeUrl(item.children("a.tweet-link").attr("href"), sourceUrl);
  const id = extractStatusId(link);
  if (!id) {
    return null;
  }

  const text = normalizeText(item.find(".tweet-body > .tweet-content").first().text());
  const title = text.split("\n").find(Boolean) || "";
  const pubDate = item.find(".tweet-date a").first().attr("title") || "";
  const isRepost = item.find(".retweet-header").length > 0;

  const post = {
    id,
    title,
    text,
    link,
    pubDate,
    isReply: /^@\w{1,15}\b/.test(text.trim()),
    isRepost,
  };
  return {
    ...post,
    key: buildPostKey(post),
  };
}

function normalizeText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]{2,}/g, " "))
    .filter(Boolean)
    .join("\n");
}

function absolutizeUrl(value, sourceUrl) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return String(value);
  }
}

function readFeedCache(response) {
  return {
    etag: response.headers?.get?.("etag") || null,
    lastModified: response.headers?.get?.("last-modified") || null,
  };
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
