import { test } from "bun:test";
import assert from "node:assert/strict";

import { NitterHtmlClient, parseNitterHtml } from "../src/nitterHtmlClient.js";

const sampleHtml = `
<div class="timeline">
  <div class="timeline-item" data-username="example">
    <a class="tweet-link" href="/example/status/1870000000000000001#m"></a>
    <div class="tweet-body">
      <div>
        <div class="tweet-header">
          <span class="tweet-date">
            <a href="/example/status/1870000000000000001#m" title="Mon, 22 Jun 2026 08:00:00 GMT">1m</a>
          </span>
        </div>
      </div>
      <div class="tweet-content media-body" dir="auto">
        hello
        world
      </div>
    </div>
  </div>
  <div class="timeline-item" data-username="source">
    <a class="tweet-link" href="/source/status/1870000000000000002#m"></a>
    <div class="tweet-body">
      <div>
        <div class="retweet-header">Example retweeted</div>
        <div class="tweet-header">
          <span class="tweet-date">
            <a href="/source/status/1870000000000000002#m" title="Mon, 22 Jun 2026 08:01:00 GMT">2m</a>
          </span>
        </div>
      </div>
      <div class="tweet-content media-body" dir="auto">source post</div>
    </div>
  </div>
  <div class="timeline-item" data-username="example">
    <a class="tweet-link" href="/example/status/1870000000000000003#m"></a>
    <div class="tweet-body">
      <div class="tweet-content media-body" dir="auto">@someone thanks</div>
    </div>
  </div>
</div>`;

test("parses nitter html timeline items", () => {
  const posts = parseNitterHtml(sampleHtml, { sourceUrl: "https://nitter.net/example" });

  assert.equal(posts.length, 3);
  assert.equal(posts[0].id, "1870000000000000001");
  assert.equal(posts[0].text, "hello\nworld");
  assert.equal(posts[0].link, "https://nitter.net/example/status/1870000000000000001#m");
  assert.equal(posts[0].pubDate, "Mon, 22 Jun 2026 08:00:00 GMT");
  assert.equal(posts[1].id, "1870000000000000002");
  assert.equal(posts[1].isRepost, true);
  assert.equal(posts[1].link, "https://nitter.net/source/status/1870000000000000002#m");
  assert.equal(posts[2].isReply, true);
});

test("builds default html url from username", () => {
  const client = new NitterHtmlClient({ username: "@example" });

  assert.equal(client.buildHtmlUrl(), "https://nitter.net/example");
});

test("fetches and sorts html posts oldest to newest", async () => {
  const client = new NitterHtmlClient({
    htmlUrl: "https://nitter.net/example",
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      text: async () => sampleHtml
    })
  });

  const posts = await client.getRecentPosts();

  assert.deepEqual(
    posts.map((post) => post.id),
    ["1870000000000000001", "1870000000000000002", "1870000000000000003"]
  );
});

test("sends html headers and conditional request headers", async () => {
  let requestHeaders;
  const client = new NitterHtmlClient({
    htmlUrl: "https://nitter.net/example",
    userAgent: "CustomHtmlReader/1.0",
    fetchImpl: async (_url, init) => {
      requestHeaders = init.headers;
      return {
        ok: true,
        headers: new Headers({
          etag: "\"abc\"",
          "last-modified": "Mon, 22 Jun 2026 08:00:00 GMT"
        }),
        text: async () => sampleHtml
      };
    }
  });

  const feed = await client.getRecentFeed({
    etag: "\"old\"",
    lastModified: "Sun, 21 Jun 2026 08:00:00 GMT"
  });

  assert.equal(requestHeaders["user-agent"], "CustomHtmlReader/1.0");
  assert.equal(requestHeaders["if-none-match"], "\"old\"");
  assert.equal(requestHeaders["if-modified-since"], "Sun, 21 Jun 2026 08:00:00 GMT");
  assert.equal(feed.cache.etag, "\"abc\"");
  assert.equal(feed.cache.lastModified, "Mon, 22 Jun 2026 08:00:00 GMT");
});
