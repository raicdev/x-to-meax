import { test } from "bun:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

test("normalizes username and allows username without numeric user ID", () => {
  const original = { ...process.env };
  try {
    process.env.X_USERNAME = "@example";
    process.env.MEAX_BEARER_TOKEN = "meax-token";
    delete process.env.NITTER_SOURCE;
    delete process.env.RSS_USER_AGENT;
    delete process.env.RSS_REQUEST_HEADERS_JSON;

    const config = loadConfig();

    assert.equal(config.xUsername, "example");
    assert.equal(config.nitterSource, "rss");
    assert.equal(config.nitterBaseUrl, "https://nitter.net");
    assert.equal(config.rssUserAgent, "x-to-meax/0.1.0");
    assert.deepEqual(config.rssExtraHeaders, {});
    assert.equal(config.forwardReplies, false);
  } finally {
    process.env = original;
  }
});

test("reads custom rss request headers", () => {
  const original = { ...process.env };
  try {
    process.env.X_USERNAME = "example";
    process.env.MEAX_BEARER_TOKEN = "meax-token";
    process.env.NITTER_SOURCE = "rss";
    process.env.RSS_REQUEST_HEADERS_JSON = "{\"x-feed-token\":\"token\"}";

    const config = loadConfig();

    assert.deepEqual(config.rssExtraHeaders, { "x-feed-token": "token" });
  } finally {
    process.env = original;
  }
});

test("can use nitter html source", () => {
  const original = { ...process.env };
  try {
    delete process.env.X_USERNAME;
    process.env.NITTER_SOURCE = "html";
    process.env.NITTER_HTML_URL = "https://nitter.net/example";
    process.env.MEAX_BEARER_TOKEN = "meax-token";

    const config = loadConfig();

    assert.equal(config.nitterSource, "html");
    assert.equal(config.nitterHtmlUrl, "https://nitter.net/example");
  } finally {
    process.env = original;
  }
});

test("rejects unknown nitter source", () => {
  const original = { ...process.env };
  try {
    process.env.X_USERNAME = "example";
    process.env.NITTER_SOURCE = "api";
    process.env.MEAX_BEARER_TOKEN = "meax-token";

    assert.throws(() => loadConfig(), /NITTER_SOURCE must be rss or html/);
  } finally {
    process.env = original;
  }
});

test("allows explicit nitter rss url without username", () => {
  const original = { ...process.env };
  try {
    delete process.env.X_USERNAME;
    process.env.NITTER_SOURCE = "rss";
    process.env.NITTER_RSS_URL = "https://nitter.net/example/rss";
    process.env.MEAX_BEARER_TOKEN = "meax-token";

    const config = loadConfig();

    assert.equal(config.nitterRssUrl, "https://nitter.net/example/rss");
  } finally {
    process.env = original;
  }
});
