import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function loadState(path) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return {
      lastSeenPostId: parsed.lastSeenPostId || null,
      seenPostKeys: Array.isArray(parsed.seenPostKeys) ? parsed.seenPostKeys : [],
      feed: parsed.feed && typeof parsed.feed === "object" ? parsed.feed : {},
      initialized: Boolean(parsed.initialized)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        lastSeenPostId: null,
        seenPostKeys: [],
        feed: {},
        initialized: false
      };
    }
    throw error;
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function maxPostId(ids) {
  let max = null;
  for (const id of ids) {
    if (!id) continue;
    if (max == null || BigInt(id) > BigInt(max)) {
      max = id;
    }
  }
  return max;
}

export function compactSeenPostKeys(keys, limit = 500) {
  return [...new Set(keys.filter(Boolean))].slice(-limit);
}

export function mergeFeedCache(current = {}, next = {}) {
  return {
    etag: next.etag || current.etag || null,
    lastModified: next.lastModified || current.lastModified || null,
    url: next.url || current.url || null
  };
}
