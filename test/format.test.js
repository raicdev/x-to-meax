import { test } from "bun:test";
import assert from "node:assert/strict";

import { buildPostKey, buildPostLink, convertNitterLinkToXLink, formatMeaxContent } from "../src/format.js";

test("formats normal post text", () => {
  assert.equal(
    formatMeaxContent(
      { id: "1870000000000000000", text: "hello" },
      { username: "example", includePostLink: false }
    ),
    "hello"
  );
});

test("appends normal post link when enabled", () => {
  assert.equal(
    formatMeaxContent(
      { id: "1870000000000000000", text: "hello" },
      { username: "example", includePostLink: true }
    ),
    "hello\n\nhttps://x.com/example/status/1870000000000000000"
  );
});

test("appends quoted post url without quoted text", () => {
  assert.equal(
    formatMeaxContent(
      {
        id: "1870000000000000000",
        text: "my comment",
        quoted: {
          id: "1869999999999999999",
          text: "quoted text",
          link: "https://x.com/source/status/1869999999999999999",
          user: { username: "source" }
        }
      },
      { username: "example", includePostLink: false }
    ),
    "my comment\n\nhttps://x.com/source/status/1869999999999999999"
  );
});

test("formats repost as source post link only", () => {
  assert.equal(
    formatMeaxContent(
      {
        id: "1870000000000000000",
        link: "https://nitter.net/someone/status/1870000000000000000#m",
        text: "RT @someone: source",
        isRepost: true
      },
      { username: "example", includePostLink: true }
    ),
    "https://x.com/someone/status/1870000000000000000"
  );
});

test("builds generic post link without username", () => {
  assert.equal(buildPostLink("1870000000000000000"), "https://x.com/i/status/1870000000000000000");
});

test("converts nitter post links to x post links", () => {
  assert.equal(
    convertNitterLinkToXLink("https://nitter.net/Rothmus/status/2068880183663206685#m"),
    "https://x.com/Rothmus/status/2068880183663206685"
  );
});

test("builds stable x.com based post keys", () => {
  assert.equal(
    buildPostKey({
      id: "2068880183663206685",
      pubDate: "Mon, 22 Jun 2026 08:00:00 GMT",
      link: "https://nt.vern.cc/Rothmus/status/2068880183663206685#m"
    }),
    "https://x.com/Rothmus/status/2068880183663206685"
  );
});
