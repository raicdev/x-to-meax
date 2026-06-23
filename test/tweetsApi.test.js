import { test } from "bun:test";
import assert from "node:assert/strict";

import { loadApiConfig, TweetsApi } from "../src/tweetsApi.js";
import {
  buildGraphqlUrl,
  parseGraphTimeline,
  parseGraphTweet,
  XGraphqlClient,
} from "../src/xGraphqlClient.js";
import { XTransactionIdGenerator } from "../src/xTransactionId.js";

const userJson = {
  data: {
    user: {
      result: {
        rest_id: "12345",
        legacy: {
          id_str: "12345",
          screen_name: "example",
          name: "Example User",
          description: "bio",
          profile_image_url_https: "https://pbs.twimg.com/profile_images/a_normal.jpg",
          followers_count: 10,
          friends_count: 5,
          statuses_count: 3,
          favourites_count: 7,
        },
      },
    },
  },
};

const timelineJson = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [
                  timelineEntry("1870000000000000000", {
                    full_text: "first post",
                    created_at: "Mon Jun 22 08:00:00 +0000 2026",
                  }),
                  timelineEntry("1870000000000000001", {
                    full_text: "RT @source: repost",
                    created_at: "Mon Jun 22 08:01:00 +0000 2026",
                    retweeted_status_result: {
                      result: tweetResult("1869999999999999999", {
                        full_text: "source post",
                        screen_name: "source",
                      }),
                    },
                  }),
                  timelineEntry("1870000000000000002", {
                    full_text: "@someone reply",
                    created_at: "Mon Jun 22 08:02:00 +0000 2026",
                    in_reply_to_status_id_str: "1869999999999999998",
                  }),
                  {
                    entryId: "cursor-bottom-0",
                    content: { value: "cursor-next" },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  },
};

test("returns user tweets using the local X GraphQL backend", async () => {
  const urls = [];
  const headers = [];
  const api = new TweetsApi({
    config: testConfig(),
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      headers.push(init.headers);
      return jsonResponse(urls.length === 1 ? userJson : timelineJson);
    },
  });

  const response = await api.handle(
    new Request("http://localhost/api/users/@example/tweets?limit=1"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/UserByScreenName\?/);
  assert.match(urls[1], /\/UserWithProfileTweetsQueryV2\?/);
  assert.equal(headers[0]["x-csrf-token"], "ct0-token");
  assert.equal(headers[0].cookie, "auth_token=auth-token; ct0=ct0-token");
  assert.equal(headers[0]["x-client-transaction-id"], "tid-token");
  assert.equal(body.backend, "x-graphql");
  assert.equal(body.username, "example");
  assert.equal(body.user.id, "12345");
  assert.equal(body.nextCursor, "cursor-next");
  assert.equal(body.count, 1);
  assert.equal(body.total, 3);
  assert.equal(body.tweets[0].id, "1870000000000000002");
  assert.equal(body.tweets[0].url, "https://x.com/example/status/1870000000000000002");
});

test("supports with_replies, cursor, filters, and since_id", async () => {
  let timelineUrl;
  const api = new TweetsApi({
    config: testConfig(),
    fetchImpl: async (url) => {
      if (String(url).includes("UserWithProfileTweetsAndRepliesQueryV2")) {
        timelineUrl = String(url);
      }
      return jsonResponse(String(url).includes("UserByScreenName") ? userJson : timelineJson);
    },
  });

  const response = await api.handle(
    new Request(
      "http://localhost/api/users/example/tweets?with_replies=true&cursor=abc&include_replies=false&include_reposts=false&since_id=1869999999999999999",
    ),
  );
  const body = await response.json();
  const variables = JSON.parse(new URL(timelineUrl).searchParams.get("variables"));

  assert.equal(response.status, 200);
  assert.equal(variables.cursor, "abc");
  assert.equal(variables.rest_id, "12345");
  assert.equal(body.count, 1);
  assert.equal(body.tweets[0].id, "1870000000000000000");
});

test("returns a clear upstream error without X session credentials", async () => {
  const api = new TweetsApi({
    config: testConfig({ xAuthToken: "", xCt0: "" }),
    logger: silentLogger,
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });

  const response = await api.handle(
    new Request("http://localhost/api/users/example/tweets"),
  );
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error.code, "upstream_error");
  assert.match(body.error.message, /X_AUTH_TOKEN and X_CT0 are required/);
});

test("parses X GraphQL timeline instructions", () => {
  const timeline = parseGraphTimeline(timelineJson);

  assert.equal(timeline.bottomCursor, "cursor-next");
  assert.deepEqual(
    timeline.tweets.map((tweet) => tweet.id),
    ["1870000000000000000", "1870000000000000001", "1870000000000000002"],
  );
  assert.equal(timeline.tweets[1].isRepost, true);
  assert.equal(timeline.tweets[2].isReply, true);
});

test("parses note tweet text and media from tweet results", () => {
  const parsed = parseGraphTweet({
    ...tweetResult("1870000000000000003", {
      full_text: "short",
      screen_name: "example",
      extended_entities: {
        media: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/a.jpg",
            expanded_url: "https://x.com/example/status/1870000000000000003/photo/1",
          },
        ],
      },
    }),
    note_tweet: {
      note_tweet_results: {
        result: {
          text: "long note tweet",
        },
      },
    },
  });

  assert.equal(parsed.text, "long note tweet");
  assert.equal(parsed.media[0].type, "photo");
  assert.equal(parsed.media[0].url, "https://pbs.twimg.com/media/a.jpg");
});

test("builds GraphQL URLs with JSON query parameters", () => {
  const url = buildGraphqlUrl("endpoint/Name", {
    variables: { rest_id: "123", count: 20 },
    features: { feature: true },
    fieldToggles: { toggle: false },
  });
  const parsed = new URL(url);

  assert.equal(parsed.pathname, "/i/api/graphql/endpoint/Name");
  assert.deepEqual(JSON.parse(parsed.searchParams.get("variables")), {
    rest_id: "123",
    count: 20,
  });
  assert.deepEqual(JSON.parse(parsed.searchParams.get("features")), {
    feature: true,
  });
  assert.deepEqual(JSON.parse(parsed.searchParams.get("fieldToggles")), {
    toggle: false,
  });
});

test("loads API config from environment without requiring Meax credentials", () => {
  const config = loadApiConfig({
    API_PORT: "4040",
    API_DEFAULT_LIMIT: "5",
    API_MAX_LIMIT: "50",
    X_AUTH_TOKEN: "auth",
    X_CT0: "ct0",
    X_CLIENT_TRANSACTION_ID: "tid",
  });

  assert.equal(config.port, 4040);
  assert.equal(config.defaultLimit, 5);
  assert.equal(config.maxLimit, 50);
  assert.equal(config.xAuthToken, "auth");
  assert.equal(config.xCt0, "ct0");
  assert.equal(config.xClientTransactionId, "tid");
});

test("client normalizes bearer token header", async () => {
  const client = new XGraphqlClient({
    authToken: "auth",
    ct0: "ct0",
    bearerToken: "token",
    clientTransactionId: "",
  });

  assert.equal((await client.buildHeaders()).authorization, "Bearer token");
});

test("generates x-client-transaction-id values from pair dictionaries", async () => {
  const generator = new XTransactionIdGenerator({
    fetchImpl: async () =>
      jsonResponse([
        {
          animationKey: "339c00f851eb851eb8503ae147ae147ae203ae147ae147ae20f851eb851eb8500",
          verification: "nScqd+D2pVzt4VrVRGWyGleCU3r6pFdfdRoQ4hxMogpA/FbqfLhILxO1qmit+6u/",
        },
      ]),
  });

  const value = await generator.generate(
    "/i/api/graphql/LE3eTyeqhBh2g-fX85O2eQ/UserWithProfileTweetsQueryV2",
  );

  assert.match(value, /^[A-Za-z0-9+/]+$/);
  assert.ok(value.length > 20);
});

function timelineEntry(id, legacy) {
  return {
    entryId: `tweet-${id}`,
    content: {
      itemContent: {
        tweet_results: {
          result: tweetResult(id, legacy),
        },
      },
    },
  };
}

function tweetResult(id, legacyOverrides = {}) {
  const screenName = legacyOverrides.screen_name || "example";
  const legacy = {
    id_str: id,
    full_text: "",
    created_at: "Mon Jun 22 08:00:00 +0000 2026",
    reply_count: 1,
    retweet_count: 2,
    favorite_count: 3,
    ...legacyOverrides,
  };
  delete legacy.screen_name;

  return {
    __typename: "Tweet",
    rest_id: id,
    legacy,
    core: {
      user_results: {
        result: {
          rest_id: screenName === "source" ? "54321" : "12345",
          legacy: {
            id_str: screenName === "source" ? "54321" : "12345",
            screen_name: screenName,
            name: screenName === "source" ? "Source" : "Example User",
          },
        },
      },
    },
    views: {
      count: "99",
    },
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function testConfig(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 3000,
    corsOrigin: "*",
    defaultLimit: 20,
    maxLimit: 100,
    fetchTimeoutMs: 15000,
    xAuthToken: "auth-token",
    xCt0: "ct0-token",
    xBearerToken: "bearer-token",
    xUserAgent: "x-to-meax-test/0.1.0",
    xClientTransactionId: "tid-token",
    ...overrides,
  };
}

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};
