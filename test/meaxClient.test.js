import { test } from "bun:test";
import assert from "node:assert/strict";

import { MeaxClient } from "../src/meaxClient.js";

test("posts images to Meax as multipart media fields", async () => {
  let posted;
  const client = new MeaxClient({
    bearerToken: "token",
    postsUrl: "https://api.meax.jp/api/posts",
    fetchImpl: async (url, init) => {
      if (String(url) === "https://pbs.twimg.com/media/a.png") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        });
      }

      posted = init;
      return new Response("{}", {
        headers: { "content-type": "application/json" },
      });
    },
  });

  await client.createPost({
    content: "image post",
    mediaUrls: ["https://pbs.twimg.com/media/a.png"],
  });

  assert.equal(posted.method, "POST");
  assert.equal(posted.headers.authorization, "Bearer token");
  assert.equal(posted.body.get("content"), "image post");
  assert.equal(posted.body.get("alt"), "");
  const media = posted.body.getAll("media");
  assert.equal(media.length, 1);
  assert.equal(media[0].name, "a.png");
  assert.equal(media[0].type, "image/png");
});
