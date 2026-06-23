function readBoolean(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function readInteger(name, defaultValue, { min, max } = {}) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
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

export function loadConfig() {
  const xUsername = process.env.X_USERNAME?.replace(/^@+/, "");
  const nitterSource = process.env.NITTER_SOURCE || "rss";
  if (!["rss", "html", "api"].includes(nitterSource)) {
    throw new Error("NITTER_SOURCE must be rss, html, or api.");
  }

  const config = {
    xUsername,
    nitterSource,
    nitterBaseUrl: process.env.NITTER_BASE_URL || "https://nitter.net",
    nitterRssUrl: process.env.NITTER_RSS_URL,
    nitterHtmlUrl: process.env.NITTER_HTML_URL,
    tweetsApiBaseUrl: process.env.TWEETS_API_BASE_URL || "http://127.0.0.1:3000",
    tweetsApiUrl: process.env.TWEETS_API_URL,
    tweetsApiLimit: readInteger("TWEETS_API_LIMIT", 100, { min: 1, max: 500 }),
    rssUserAgent: process.env.RSS_USER_AGENT || "x-to-meax/0.1.0",
    rssExtraHeaders: readJsonObject("RSS_REQUEST_HEADERS_JSON", {}),
    meaxBearerToken: process.env.MEAX_BEARER_TOKEN,
    meaxPostsUrl: process.env.MEAX_POSTS_URL || "https://api.meax.jp/api/posts",
    pollIntervalMs:
      readInteger("POLL_INTERVAL_SECONDS", 300, { min: 30 }) * 1000,
    forwardReplies: readBoolean("FORWARD_REPLIES", false),
    forwardImages: readBoolean("FORWARD_IMAGES", true),
    maxMediaAttachments: readInteger("MAX_MEDIA_ATTACHMENTS", 4, { min: 0, max: 10 }),
    includePostLink: readBoolean("INCLUDE_POST_LINK", false),
    backfillOnStart: readBoolean("BACKFILL_ON_START", false),
    dryRun: readBoolean("DRY_RUN", false),
    stateFile: process.env.STATE_FILE || "data/state.json",
  };

  const missing = [];
  if (config.nitterSource === "rss" && !config.xUsername && !config.nitterRssUrl)
    missing.push("X_USERNAME or NITTER_RSS_URL");
  if (config.nitterSource === "html" && !config.xUsername && !config.nitterHtmlUrl)
    missing.push("X_USERNAME or NITTER_HTML_URL");
  if (config.nitterSource === "api" && !config.xUsername && !config.tweetsApiUrl)
    missing.push("X_USERNAME or TWEETS_API_URL");
  if (!config.dryRun && !config.meaxBearerToken) missing.push("MEAX_BEARER_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  return config;
}

function readJsonObject(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;

  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be a JSON object.`);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }

  return value;
}
