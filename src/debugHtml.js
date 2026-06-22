import { NitterHtmlClient, parseNitterHtml, validateNitterHtml } from "./nitterHtmlClient.js";

function readJsonObject(name) {
  const raw = process.env[name];
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return parsed;
}

function buildClient() {
  const args = process.argv.slice(2);
  const positionalUrl = args.find((arg) => !arg.startsWith("--"));
  const username = process.env.X_USERNAME?.replace(/^@+/, "");
  const htmlUrl = positionalUrl || process.env.NITTER_HTML_URL;

  if (!htmlUrl && !username) {
    throw new Error("Set NITTER_HTML_URL or X_USERNAME before running debug:html.");
  }

  return new NitterHtmlClient({
    username,
    htmlUrl,
    nitterBaseUrl: process.env.NITTER_BASE_URL || "https://nitter.net",
    userAgent: process.env.RSS_USER_AGENT || "x-to-meax/0.1.0",
    extraHeaders: readJsonObject("RSS_REQUEST_HEADERS_JSON"),
  });
}

async function main() {
  const client = buildClient();
  const url = client.buildHtmlUrl();
  const headers = client.buildHeaders();

  console.log(`HTML URL: ${url}`);
  console.log("Request headers:");
  for (const [name, value] of Object.entries(headers)) {
    console.log(`  ${name}: ${value}`);
  }

  const response = await fetch(url, { headers });
  const body = await response.text();
  validateNitterHtml(body, url);
  const directPosts = parseNitterHtml(body, { sourceUrl: url });

  console.log(`Status: ${response.status} ${response.statusText}`);
  console.log("Response headers:");
  for (const [name, value] of response.headers) {
    console.log(`  ${name}: ${value}`);
  }

  console.log(`Direct parsed posts: ${directPosts.length}`);

  const feed = await client.getRecentFeed();
  console.log(`Selected source URL: ${feed.sourceUrl}`);
  console.log(`Parsed posts: ${feed.posts.length}`);
  for (const post of feed.posts.slice(0, 5)) {
    console.log(`  ${post.id} ${post.pubDate || ""} ${post.title || post.text}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
