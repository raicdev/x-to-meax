import { test } from "bun:test";
import assert from "node:assert/strict";

import { maxPostId, mergeFeedCache } from "../src/state.js";

test("compares snowflake IDs as integers", () => {
  assert.equal(maxPostId(["9", "10", "2"]), "10");
});

test("merges feed cache headers", () => {
  assert.deepEqual(
    mergeFeedCache(
      { etag: "\"old\"", lastModified: "Sun, 21 Jun 2026 08:00:00 GMT" },
      { etag: "\"new\"", url: "https://nitter.net/example/rss" }
    ),
    {
      etag: "\"new\"",
      lastModified: "Sun, 21 Jun 2026 08:00:00 GMT",
      url: "https://nitter.net/example/rss",
    }
  );
});
