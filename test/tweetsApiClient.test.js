import { test } from "bun:test";
import assert from "node:assert/strict";

import { parseTweetsApiResponse, TweetsApiClient } from "../src/tweetsApiClient.js";

const sampleApiResponse = {
  tweets: [
    {
      id: "1870000000000000002",
      text: "@someone reply",
      title: "@someone reply",
      url: "https://x.com/example/status/1870000000000000002",
      pubDate: "Mon, 22 Jun 2026 08:02:00 GMT",
      isReply: true,
      isRepost: false,
      user: { username: "example" },
      media: [
        {
          type: "photo",
          url: "https://pbs.twimg.com/media/a.jpg",
          previewUrl: "https://pbs.twimg.com/media/a.jpg",
        },
      ],
      quoted: {
        id: "1869999999999999998",
        text: "quoted text",
        url: "https://x.com/quoted/status/1869999999999999998",
        user: { username: "quoted" },
      },
    },
    {
      id: "1870000000000000001",
      text: "RT @source: source post",
      title: "RT @source: source post",
      url: "https://x.com/example/status/1870000000000000001",
      pubDate: "Mon, 22 Jun 2026 08:01:00 GMT",
      isReply: false,
      isRepost: true,
      user: { username: "example" },
      retweet: {
        id: "1869999999999999999",
        text: "source post",
        url: "https://x.com/source/status/1869999999999999999",
        user: { username: "source" },
      },
    },
  ],
};

test("builds tweets API URL for bridge polling", () => {
  const client = new TweetsApiClient({
    username: "@example",
    apiBaseUrl: "http://127.0.0.1:3000/",
    limit: 50,
    withReplies: true,
  });

  const url = new URL(client.buildTweetsUrl());

  assert.equal(url.origin, "http://127.0.0.1:3000");
  assert.equal(url.pathname, "/api/users/example/tweets");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.get("include_replies"), "true");
  assert.equal(url.searchParams.get("include_reposts"), "true");
  assert.equal(url.searchParams.get("with_replies"), "true");
});

test("fetches API tweets and normalizes them to bridge posts", async () => {
  let requestUrl;
  let requestHeaders;
  const client = new TweetsApiClient({
    username: "example",
    apiBaseUrl: "http://localhost:3000",
    userAgent: "test-agent",
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestHeaders = init.headers;
      return new Response(JSON.stringify(sampleApiResponse), {
        headers: { "content-type": "application/json" },
      });
    },
  });

  const feed = await client.getRecentFeed();

  assert.match(requestUrl, /^http:\/\/localhost:3000\/api\/users\/example\/tweets\?/);
  assert.equal(requestHeaders["user-agent"], "test-agent");
  assert.equal(feed.notModified, false);
  assert.deepEqual(
    feed.posts.map((post) => post.id),
    ["1870000000000000001", "1870000000000000002"],
  );
  assert.equal(feed.posts[0].isRepost, true);
  assert.equal(feed.posts[0].link, "https://x.com/source/status/1869999999999999999");
  assert.equal(feed.posts[1].isReply, true);
  assert.deepEqual(feed.posts[1].media, [
    {
      type: "photo",
      url: "https://pbs.twimg.com/media/a.jpg",
      previewUrl: "https://pbs.twimg.com/media/a.jpg",
      videoUrl: "",
    },
  ]);
  assert.equal(feed.posts[1].quoted.link, "https://x.com/quoted/status/1869999999999999998");
});

test("parses API tweets with stable x.com post keys", () => {
  const posts = parseTweetsApiResponse(sampleApiResponse);

  assert.equal(posts[0].key, "https://x.com/example/status/1870000000000000002");
  assert.equal(posts[1].key, "https://x.com/source/status/1869999999999999999");
});
