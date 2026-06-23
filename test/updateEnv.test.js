import { test } from "bun:test";
import assert from "node:assert/strict";

import { mergeMissingEnvFields, readEnvEntries } from "../scripts/updateEnv.js";

test("reads env keys without exposing values", () => {
  const entries = readEnvEntries(`
# comment
X_USERNAME=example
export MEAX_BEARER_TOKEN=secret
X_USERNAME=duplicate
`);

  assert.deepEqual(
    entries.map((entry) => entry.key),
    ["X_USERNAME", "MEAX_BEARER_TOKEN"],
  );
});

test("adds only missing fields from env example", () => {
  const result = mergeMissingEnvFields(
    "X_USERNAME=custom\nMEAX_BEARER_TOKEN=secret\n",
    "X_USERNAME=\nNITTER_SOURCE=rss\nMEAX_BEARER_TOKEN=\nDRY_RUN=false\n",
  );

  assert.deepEqual(result.added, ["NITTER_SOURCE", "DRY_RUN"]);
  assert.match(result.text, /X_USERNAME=custom/);
  assert.match(result.text, /MEAX_BEARER_TOKEN=secret/);
  assert.match(result.text, /NITTER_SOURCE=rss/);
  assert.match(result.text, /DRY_RUN=false/);
});

test("does not change env text when every field exists", () => {
  const env = "X_USERNAME=custom\nNITTER_SOURCE=api\n";
  const result = mergeMissingEnvFields(env, "X_USERNAME=\nNITTER_SOURCE=rss\n");

  assert.deepEqual(result.added, []);
  assert.equal(result.text, env);
});
