import { buildPostKey } from "./format.js";

export class TweetsApiClient {
  constructor({
    username,
    apiBaseUrl,
    apiUrl,
    userAgent,
    extraHeaders,
    limit = 100,
    withReplies = false,
    fetchImpl = fetch,
  }) {
    this.username = username?.replace(/^@+/, "");
    this.apiBaseUrl = apiBaseUrl || "http://127.0.0.1:3000";
    this.apiUrl = apiUrl;
    this.userAgent = userAgent || "x-to-meax/0.1.0";
    this.extraHeaders = extraHeaders || {};
    this.limit = limit;
    this.withReplies = withReplies;
    this.fetch = fetchImpl;
  }

  async getRecentPosts({ sinceId } = {}) {
    const feed = await this.getRecentFeed();
    return feed.posts.filter(
      (post) => !sinceId || BigInt(post.id) > BigInt(sinceId),
    );
  }

  async getRecentFeed() {
    const url = this.buildTweetsUrl();
    const response = await this.fetch(url, {
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(
        `Tweets API request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }

    const json = await response.json();
    const posts = parseTweetsApiResponse(json).sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : 1,
    );

    return {
      posts,
      cache: { url },
      notModified: false,
      sourceUrl: url,
    };
  }

  buildHeaders() {
    return {
      "user-agent": this.userAgent,
      accept: "application/json",
      ...this.extraHeaders,
    };
  }

  buildTweetsUrl() {
    const url = this.apiUrl
      ? new URL(this.apiUrl)
      : new URL(
          `/api/users/${encodeURIComponent(this.requireUsername())}/tweets`,
          normalizeBaseUrl(this.apiBaseUrl),
        );

    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set("include_replies", "true");
    url.searchParams.set("include_reposts", "true");
    url.searchParams.set("order", "desc");
    if (this.withReplies) {
      url.searchParams.set("with_replies", "true");
    }
    return url.toString();
  }

  requireUsername() {
    if (!this.username) {
      throw new Error("X_USERNAME is required when TWEETS_API_URL is not set.");
    }
    return this.username;
  }
}

export function parseTweetsApiResponse(json) {
  const tweets = Array.isArray(json?.tweets) ? json.tweets : [];
  return tweets.map(normalizeTweet).filter((post) => post.id);
}

function normalizeTweet(tweet) {
  const link =
    tweet.isRepost && tweet.retweet?.url
      ? String(tweet.retweet.url)
      : String(tweet.url || "");
  const post = {
    id: String(tweet.id || ""),
    title: String(tweet.title || "").trim(),
    text: String(tweet.text || "").trim(),
    link,
    pubDate: String(tweet.pubDate || ""),
    isReply: Boolean(tweet.isReply),
    isRepost: Boolean(tweet.isRepost),
  };

  return {
    ...post,
    key: buildPostKey(post, tweet.user?.username),
  };
}

function normalizeBaseUrl(value) {
  return `${String(value || "").replace(/\/+$/, "")}/`;
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
