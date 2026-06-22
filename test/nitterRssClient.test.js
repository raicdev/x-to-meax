import { test } from "bun:test";
import assert from "node:assert/strict";

import { extractStatusId, NitterRssClient, parseNitterRss } from "../src/nitterRssClient.js";

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>hello &amp; welcome</title>
      <link>https://nitter.net/example/status/1870000000000000000#m</link>
      <guid>https://nitter.net/example/status/1870000000000000000#m</guid>
      <pubDate>Mon, 22 Jun 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[hello &amp; welcome<br>line 2]]></description>
    </item>
    <item>
      <title>RT by @example: source</title>
      <link>https://nitter.net/someone/status/1870000000000000001#m</link>
      <guid isPermaLink="false">1870000000000000001</guid>
      <pubDate>Mon, 22 Jun 2026 08:01:00 GMT</pubDate>
      <description>source</description>
    </item>
    <item>
      <title>@someone thanks</title>
      <link>https://nitter.net/example/status/1870000000000000002#m</link>
      <guid isPermaLink="false">1870000000000000002</guid>
      <pubDate>Mon, 22 Jun 2026 08:02:00 GMT</pubDate>
      <description><![CDATA[<p>@someone thanks</p>]]></description>
    </item>
  </channel>
</rss>`;

test("parses nitter rss items", () => {
  const posts = parseNitterRss(sampleRss);

  assert.equal(posts.length, 3);
  assert.equal(posts[0].id, "1870000000000000000");
  assert.equal(
    posts[0].key,
    "https://x.com/example/status/1870000000000000000"
  );
  assert.equal(posts[0].text, "hello & welcome\nline 2");
  assert.equal(posts[1].id, "1870000000000000001");
  assert.equal(posts[1].isRepost, true);
  assert.equal(posts[2].isReply, true);
});

test("builds default rss url from username", () => {
  const client = new NitterRssClient({ username: "@example" });

  assert.equal(client.buildRssUrl(), "https://nitter.net/example/rss");
});

test("fetches and sorts rss posts oldest to newest", async () => {
  const client = new NitterRssClient({
    rssUrl: "https://nitter.net/example/rss",
    fetchImpl: async () => ({
      ok: true,
      text: async () => sampleRss
    })
  });

  const posts = await client.getRecentPosts();

  assert.deepEqual(
    posts.map((post) => post.id),
    ["1870000000000000000", "1870000000000000001", "1870000000000000002"]
  );
});

test("sends rss headers and conditional request headers", async () => {
  let requestHeaders;
  const client = new NitterRssClient({
    rssUrl: "https://nitter.net/example/rss",
    userAgent: "CustomRSSReader/1.0",
    fetchImpl: async (_url, init) => {
      requestHeaders = init.headers;
      return {
        ok: true,
        headers: new Headers({
          etag: "\"abc\"",
          "last-modified": "Mon, 22 Jun 2026 08:00:00 GMT"
        }),
        text: async () => sampleRss
      };
    }
  });

  const feed = await client.getRecentFeed({
    etag: "\"old\"",
    lastModified: "Sun, 21 Jun 2026 08:00:00 GMT"
  });

  assert.equal(requestHeaders["user-agent"], "CustomRSSReader/1.0");
  assert.equal(requestHeaders.accept, undefined);
  assert.equal(requestHeaders["accept-language"], undefined);
  assert.equal(requestHeaders["cache-control"], undefined);
  assert.equal(requestHeaders["if-none-match"], "\"old\"");
  assert.equal(requestHeaders["if-modified-since"], "Sun, 21 Jun 2026 08:00:00 GMT");
  assert.equal(feed.cache.etag, "\"abc\"");
  assert.equal(feed.cache.lastModified, "Mon, 22 Jun 2026 08:00:00 GMT");
});

test("uses the app user agent by default", () => {
  const client = new NitterRssClient({
    username: "example",
  });

  const headers = client.buildHeaders();

  assert.equal(headers["user-agent"], "x-to-meax/0.1.0");
});

test("can add custom rss request headers", () => {
  const client = new NitterRssClient({
    username: "example",
    extraHeaders: {
      "x-feed-token": "token",
    },
  });

  const headers = client.buildHeaders();

  assert.equal(headers["x-feed-token"], "token");
});

test("handles not modified rss response", async () => {
  const client = new NitterRssClient({
    rssUrl: "https://nitter.net/example/rss",
    fetchImpl: async () => ({
      ok: false,
      status: 304,
      statusText: "Not Modified",
      headers: new Headers({
        etag: "\"abc\""
      }),
      text: async () => ""
    })
  });

  const feed = await client.getRecentFeed();

  assert.equal(feed.notModified, true);
  assert.deepEqual(feed.posts, []);
  assert.equal(feed.cache.etag, "\"abc\"");
});

test("extracts status id from nitter or x links", () => {
  assert.equal(extractStatusId("https://nitter.net/example/status/1870000000000000000#m"), "1870000000000000000");
  assert.equal(extractStatusId("https://x.com/example/status/1870000000000000001"), "1870000000000000001");
  assert.equal(extractStatusId("1870000000000000002"), "1870000000000000002");
});
