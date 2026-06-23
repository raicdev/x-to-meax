import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Bridge } from "../src/bridge.js";

test("first run records newest post without forwarding by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
      const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => [
          { id: "1870000000000000001", key: "1870000000000000001|date", text: "newer" },
          { id: "1870000000000000000", key: "1870000000000000000|date", text: "older" }
        ]
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: false,
        includePostLink: false
      },
      logger: silentLogger
    });

    const result = await bridge.runOnce();

    assert.deepEqual(result, { forwarded: 0, seen: 2 });
    assert.deepEqual(posted, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("backfill forwards oldest to newest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
      const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => [
          { id: "1870000000000000002", key: "1870000000000000002|date", text: "third" },
          { id: "1870000000000000000", key: "1870000000000000000|date", text: "first" },
          { id: "1870000000000000001", key: "1870000000000000001|date", text: "second" }
        ]
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: true,
        includePostLink: false
      },
      logger: silentLogger
    });

    const result = await bridge.runOnce();

    assert.deepEqual(result, { forwarded: 3, seen: 3 });
    assert.deepEqual(
      posted.map((post) => post.content),
      ["first", "second", "third"]
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not refire items already seen in rss state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const posts = [{ id: "1870000000000000000", key: "1870000000000000000|date", text: "first" }];
    const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => posts
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: true,
        includePostLink: false
      },
      logger: silentLogger
    });

    assert.equal((await bridge.runOnce()).forwarded, 1);
    assert.equal((await bridge.runOnce()).forwarded, 0);
    assert.equal(posted.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not refire items when nitter base URL changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const stateFile = join(dir, "state.json");
    const posts = [
      {
        id: "1870000000000000000",
        key: "https://x.com/example/status/1870000000000000000",
        text: "first"
      }
    ];
    const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => posts
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile,
        backfillOnStart: true,
        includePostLink: false
      },
      logger: silentLogger
    });

    await Bun.write(
      stateFile,
      JSON.stringify({
        initialized: true,
        seenPostKeys: [
          "1870000000000000000|date|https://nitter.net/example/status/1870000000000000000#m"
        ]
      })
    );

    const result = await bridge.runOnce();
    const saved = JSON.parse(await Bun.file(stateFile).text());

    assert.equal(result.forwarded, 0);
    assert.deepEqual(posted, []);
    assert.deepEqual(saved.seenPostKeys, [
      "https://x.com/example/status/1870000000000000000"
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dry run does not post or update state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const stateFile = join(dir, "state.json");
    const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => [
          { id: "1870000000000000000", key: "1870000000000000000|date", text: "first" }
        ]
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile,
        backfillOnStart: true,
        includePostLink: false,
        dryRun: true
      },
      logger: silentLogger
    });

    const result = await bridge.runOnce();

    assert.deepEqual(result, { forwarded: 0, seen: 1, dryRun: true, wouldForward: 1 });
    assert.deepEqual(posted, []);
    await assert.rejects(() => Bun.file(stateFile).text());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips replies by default and records them as seen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const posts = [
      { id: "1870000000000000000", key: "1870000000000000000|date", text: "@someone thanks", isReply: true }
    ];
    const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => posts
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: true,
        forwardReplies: false,
        includePostLink: false
      },
      logger: silentLogger
    });

    assert.equal((await bridge.runOnce()).forwarded, 0);
    assert.equal((await bridge.runOnce()).forwarded, 0);
    assert.deepEqual(posted, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("can forward replies when enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => [
          { id: "1870000000000000000", key: "1870000000000000000|date", text: "@someone thanks", isReply: true }
        ]
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: true,
        forwardReplies: true,
        includePostLink: false
      },
      logger: silentLogger
    });

    assert.equal((await bridge.runOnce()).forwarded, 1);
    assert.equal(posted[0].content, "@someone thanks");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("passes image media urls to Meax when forwarding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const bridge = new Bridge({
      feedClient: {
        getRecentPosts: async () => [
          {
            id: "1870000000000000000",
            key: "1870000000000000000|date",
            text: "photo",
            media: [
              { type: "photo", url: "https://pbs.twimg.com/media/a.jpg" },
              { type: "video", url: "https://video.twimg.com/a.mp4" }
            ]
          }
        ]
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: true,
        includePostLink: false,
        forwardImages: true,
        maxMediaAttachments: 4
      },
      logger: silentLogger
    });

    assert.equal((await bridge.runOnce()).forwarded, 1);
    assert.deepEqual(posted[0].mediaUrls, ["https://pbs.twimg.com/media/a.jpg"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("passes feed cache headers and stores updated feed cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const stateFile = join(dir, "state.json");
    let receivedCache;
    const bridge = new Bridge({
      feedClient: {
        getRecentFeed: async (cache) => {
          receivedCache = cache;
          return {
            posts: [{ id: "1870000000000000000", key: "1870000000000000000|date", text: "first" }],
            cache: {
              etag: "\"new\"",
              lastModified: "Mon, 22 Jun 2026 08:00:00 GMT",
              url: "https://nitter.net/example/rss"
            },
            notModified: false
          };
        }
      },
      meaxClient: {
        createPost: async () => {}
      },
      config: {
        stateFile,
        backfillOnStart: true,
        includePostLink: false
      },
      logger: silentLogger
    });

    await bridge.runOnce();
    await bridge.runOnce();

    assert.deepEqual(receivedCache, {
      etag: "\"new\"",
      lastModified: "Mon, 22 Jun 2026 08:00:00 GMT",
      cacheUrl: "https://nitter.net/example/rss"
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("handles not modified feeds without posting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "x-to-meax-"));
  try {
    const posted = [];
    const bridge = new Bridge({
      feedClient: {
        getRecentFeed: async () => ({
          posts: [],
          cache: { etag: "\"same\"" },
          notModified: true
        })
      },
      meaxClient: {
        createPost: async (post) => posted.push(post)
      },
      config: {
        stateFile: join(dir, "state.json"),
        backfillOnStart: true,
        includePostLink: false
      },
      logger: silentLogger
    });

    assert.deepEqual(await bridge.runOnce(), { forwarded: 0, seen: 0 });
    assert.deepEqual(posted, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const silentLogger = {
  log() {},
  warn() {},
  error() {}
};
