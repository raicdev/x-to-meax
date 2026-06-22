import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
});

export class NitterRssClient {
  constructor({
    username,
    rssUrl,
    nitterBaseUrl,
    userAgent,
    extraHeaders,
    fetchImpl = fetch,
  }) {
    this.username = username?.replace(/^@+/, "");
    this.rssUrl = rssUrl;
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
    const url = this.buildRssUrl();
    const useCache = !cacheUrl || cacheUrl === url;
    return this.fetchFeedUrl(url, {
      etag: useCache ? etag : null,
      lastModified: useCache ? lastModified : null,
    });
  }

  async fetchFeedUrl(url, { etag, lastModified } = {}) {
    const response = await this.fetch(url, {
      headers: this.buildHeaders({ etag, lastModified }),
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
        `Nitter RSS request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }

    const xml = await response.text();

    return {
      posts: parseNitterRss(xml).sort((a, b) =>
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

  buildRssUrl() {
    if (this.rssUrl) {
      return this.rssUrl;
    }
    if (!this.username) {
      throw new Error("X_USERNAME is required when NITTER_RSS_URL is not set.");
    }
    return `${this.nitterBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(this.username)}/rss`;
  }
}

function readFeedCache(response) {
  return {
    etag: response.headers?.get?.("etag") || null,
    lastModified: response.headers?.get?.("last-modified") || null,
  };
}

export function parseNitterRss(xml) {
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map(normalizeItem).filter((post) => post.id);
}

function normalizeItem(item) {
  const link = readText(item.link);
  const guid = readText(item.guid);
  const id = extractStatusId(link) || extractStatusId(guid);
  const title = readText(item.title);
  const description = stripHtml(readText(item.description));
  const contentEncoded = stripHtml(readText(item["content:encoded"]));

  return {
    id,
    key: [id, readText(item.pubDate), link].filter(Boolean).join("|"),
    title,
    text: chooseText({ title, description, contentEncoded }),
    link,
    pubDate: readText(item.pubDate),
    isReply: detectReply({ title, description, contentEncoded }),
    isRepost: detectRepost({ title, description, contentEncoded }),
  };
}

function chooseText({ title, description, contentEncoded }) {
  return (
    [contentEncoded, description, title]
      .find((value) => value && value.trim())
      ?.trim() || ""
  );
}

function detectRepost({ title, description, contentEncoded }) {
  const combined = [title, description, contentEncoded]
    .filter(Boolean)
    .join("\n");
  return (
    /^RT by @[^:]+:/i.test(title) ||
    /\bRT\s+@/i.test(combined) ||
    /\bretweeted\b/i.test(combined)
  );
}

function detectReply({ title, description, contentEncoded }) {
  const text = chooseText({ title, description, contentEncoded });
  return /^@\w{1,15}\b/.test(text.trim());
}

export function extractStatusId(value) {
  if (!value) return null;
  if (/^\d+$/.test(String(value))) return String(value);
  const match = String(value).match(/\/status(?:es)?\/(\d+)/);
  return match?.[1] || null;
}

function stripHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readText(value) {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value)
    return String(value.text || "");
  return String(value);
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
