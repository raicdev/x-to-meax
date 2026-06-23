import { XGraphqlClient } from "./xGraphqlClient.js";

const DEFAULT_ALLOWED_METHODS = "GET, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "content-type";
const DEFAULT_MAX_LIMIT = 100;

export function loadApiConfig(env = process.env) {
  const maxLimit = readInteger(env, "API_MAX_LIMIT", DEFAULT_MAX_LIMIT, {
    min: 1,
    max: 500,
  });
  const defaultLimit = readInteger(env, "API_DEFAULT_LIMIT", 20, {
    min: 1,
    max: maxLimit,
  });

  return {
    host: env.API_HOST || "0.0.0.0",
    port: readInteger(env, "API_PORT", 3000, { min: 1, max: 65535 }),
    corsOrigin: env.API_CORS_ORIGIN || "*",
    defaultLimit,
    maxLimit,
    fetchTimeoutMs: readInteger(env, "API_FETCH_TIMEOUT_MS", 15000, {
      min: 1000,
      max: 120000,
    }),
    xAuthToken: env.X_AUTH_TOKEN,
    xCt0: env.X_CT0,
    xBearerToken: env.X_BEARER_TOKEN,
    xUserAgent: env.X_USER_AGENT,
    xClientTransactionId: env.X_CLIENT_TRANSACTION_ID || "auto",
  };
}

export class TweetsApi {
  constructor({ config = loadApiConfig(), fetchImpl = fetch, logger = console } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.userCache = new Map();
  }

  async handle(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return this.emptyResponse(204);
    }

    if (request.method !== "GET") {
      return this.jsonResponse(
        { error: { code: "method_not_allowed", message: "Only GET is supported." } },
        405,
        { allow: DEFAULT_ALLOWED_METHODS },
      );
    }

    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return this.jsonResponse({ ok: true, backend: "x-graphql" });
    }

    try {
      const route = parseTweetsRoute(url);
      if (!route) {
        return this.jsonResponse(
          { error: { code: "not_found", message: "Route not found." } },
          404,
        );
      }

      const result = await this.getUserTweets({
        username: route.username,
        searchParams: url.searchParams,
      });

      return this.jsonResponse(result);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  async getUserTweets({ username, searchParams }) {
    const normalizedUsername = normalizeUsername(username);
    const limit = readLimit(searchParams.get("limit"), this.config);
    const count = Math.min(limit, 100);
    const sinceId = readOptionalStatusId(searchParams.get("since_id"), "since_id");
    const includeReplies = readBooleanParam(searchParams.get("include_replies"), true);
    const includeReposts = readBooleanParam(searchParams.get("include_reposts"), true);
    const withReplies = readBooleanParam(searchParams.get("with_replies"), false);
    const cursor = readCursor(searchParams.get("cursor"));
    const order = readOrder(searchParams.get("order"));

    const client = this.buildClient();
    const upstream = await client.getUserTweets({
      username: normalizedUsername,
      withReplies,
      cursor,
      count,
    });

    const filtered = filterPosts(upstream.tweets, {
      sinceId,
      includeReplies,
      includeReposts,
    });
    const sorted = sortPosts(filtered, order);
    const tweets = sorted.slice(0, limit).map(serializePost);

    return {
      username: normalizedUsername,
      backend: "x-graphql",
      count: tweets.length,
      total: filtered.length,
      limit,
      nextCursor: upstream.bottomCursor || "",
      user: upstream.user || null,
      tweets,
    };
  }

  buildClient() {
    return new XGraphqlClient({
      authToken: this.config.xAuthToken,
      ct0: this.config.xCt0,
      bearerToken: this.config.xBearerToken,
      userAgent: this.config.xUserAgent,
      clientTransactionId: this.config.xClientTransactionId,
      fetchTimeoutMs: this.config.fetchTimeoutMs,
      fetchImpl: this.fetch,
    });
  }

  jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body, null, 2), {
      status,
      headers: this.headers({
        "content-type": "application/json; charset=utf-8",
        ...headers,
      }),
    });
  }

  emptyResponse(status) {
    return new Response(null, {
      status,
      headers: this.headers(),
    });
  }

  headers(headers = {}) {
    return {
      "access-control-allow-origin": this.config.corsOrigin,
      "access-control-allow-methods": DEFAULT_ALLOWED_METHODS,
      "access-control-allow-headers": DEFAULT_ALLOWED_HEADERS,
      ...headers,
    };
  }

  errorResponse(error) {
    if (error instanceof ApiError) {
      return this.jsonResponse(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.error?.(message);
    const status = isUpstreamError(message) ? 502 : 500;
    const code = status === 502 ? "upstream_error" : "internal_error";
    return this.jsonResponse({ error: { code, message } }, status);
  }
}

export function startTweetsApiServer({
  config = loadApiConfig(),
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const api = new TweetsApi({ config, fetchImpl, logger });
  return Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: (request) => api.handle(request),
  });
}

function parseTweetsRoute(url) {
  const userRoute = url.pathname.match(/^\/api\/users\/([^/]+)\/tweets\/?$/);
  if (userRoute) {
    return { username: decodeURIComponent(userRoute[1]) };
  }

  if (url.pathname === "/api/tweets") {
    return { username: url.searchParams.get("username") };
  }

  return null;
}

function filterPosts(posts, { sinceId, includeReplies, includeReposts }) {
  return posts.filter((post) => {
    if (sinceId && BigInt(post.id) <= BigInt(sinceId)) return false;
    if (!includeReplies && post.isReply) return false;
    if (!includeReposts && post.isRepost) return false;
    return true;
  });
}

function sortPosts(posts, order) {
  return [...posts].sort((a, b) => {
    const result = BigInt(a.id) < BigInt(b.id) ? -1 : 1;
    return order === "asc" ? result : -result;
  });
}

function serializePost(post) {
  return {
    id: post.id,
    text: post.text || "",
    title: post.title || "",
    url: post.link || "",
    pubDate: post.pubDate || "",
    isReply: Boolean(post.isReply),
    isRepost: Boolean(post.isRepost),
    isQuote: Boolean(post.isQuote),
    pinned: Boolean(post.pinned),
    unavailable: Boolean(post.unavailable),
    user: post.user || null,
    stats: post.stats || {},
    media: post.media || [],
    quoted: serializeNestedPost(post.quoted),
    retweet: serializeNestedPost(post.retweet),
  };
}

function serializeNestedPost(post) {
  if (!post?.id) return null;
  return {
    id: post.id,
    text: post.text || "",
    url: post.link || "",
    user: post.user || null,
  };
}

function readLimit(value, config) {
  if (value == null || value === "") return config.defaultLimit;
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || String(limit) !== String(value)) {
    throw new ApiError(400, "invalid_limit", "limit must be an integer.");
  }
  if (limit < 1 || limit > config.maxLimit) {
    throw new ApiError(
      400,
      "invalid_limit",
      `limit must be between 1 and ${config.maxLimit}.`,
    );
  }
  return limit;
}

function readOptionalStatusId(value, name) {
  if (value == null || value === "") return null;
  if (!/^\d+$/.test(value)) {
    throw new ApiError(400, `invalid_${name}`, `${name} must be numeric.`);
  }
  return value;
}

function readBooleanParam(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new ApiError(400, "invalid_boolean", "Boolean query values must be true or false.");
}

function readOrder(value) {
  if (value == null || value === "") return "desc";
  if (!["asc", "desc"].includes(value)) {
    throw new ApiError(400, "invalid_order", "order must be asc or desc.");
  }
  return value;
}

function readCursor(value) {
  if (value == null || value === "") return "";
  if (value.length > 2000) {
    throw new ApiError(400, "invalid_cursor", "cursor is too long.");
  }
  return value;
}

function normalizeUsername(value) {
  const username = String(value || "").replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new ApiError(
      400,
      "invalid_username",
      "username must be 1-15 characters of letters, numbers, or underscore.",
    );
  }
  return username;
}

function readInteger(env, name, defaultValue, { min, max } = {}) {
  const raw = env[name];
  if (raw == null || raw === "") return defaultValue;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || String(value) !== String(raw)) {
    throw new Error(`${name} must be an integer.`);
  }
  if (min != null && value < min) {
    throw new Error(`${name} must be >= ${min}.`);
  }
  if (max != null && value > max) {
    throw new Error(`${name} must be <= ${max}.`);
  }
  return value;
}

function isUpstreamError(message) {
  return /X GraphQL|aborted|timeout|required for direct X GraphQL access/i.test(message);
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
