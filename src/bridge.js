import { formatMeaxContent } from "./format.js";
import { compactSeenPostKeys, loadState, maxPostId, mergeFeedCache, saveState } from "./state.js";

export class Bridge {
  constructor({ feedClient, meaxClient, config, logger = console }) {
    this.feedClient = feedClient;
    this.meaxClient = meaxClient;
    this.config = config;
    this.logger = logger;
  }

  async runOnce() {
    const state = await loadState(this.config.stateFile);
    const feed = await this.getFeed(state);
    const feedCache = mergeFeedCache(state.feed, feed.cache);
    const posts = feed.posts;
    const seenKeys = new Set(state.seenPostKeys || []);
    const seenIds = new Set([...seenKeys].map(extractSeenPostId).filter(Boolean));
    const newPosts = posts.filter((post) => !hasSeenPost(post, seenKeys, seenIds));

    if (feed.notModified) {
      if (this.config.dryRun) {
        this.logger.log("Dry run: Nitter feed not modified. State not updated.");
        return { forwarded: 0, seen: 0, dryRun: true, wouldForward: 0 };
      }
      await saveState(this.config.stateFile, {
        ...state,
        feed: feedCache,
        initialized: true
      });
      this.logger.log("Nitter feed not modified.");
      return { forwarded: 0, seen: 0 };
    }

    if (posts.length === 0) {
      if (this.config.dryRun) {
        this.logger.log("Dry run: no Nitter posts. State not updated.");
        return { forwarded: 0, seen: 0, dryRun: true, wouldForward: 0 };
      }
      await saveState(this.config.stateFile, { ...state, feed: feedCache, initialized: true });
      this.logger.log("No Nitter posts.");
      return { forwarded: 0, seen: 0 };
    }

    const newestId = maxPostId(posts.map((post) => post.id));

    if (!state.initialized && !this.config.backfillOnStart) {
      if (this.config.dryRun) {
        this.logger.log(`Dry run: would initialize state from ${posts.length} Nitter posts. State not updated.`);
        return { forwarded: 0, seen: posts.length, dryRun: true, wouldForward: 0 };
      }
      await saveState(this.config.stateFile, {
        lastSeenPostId: newestId,
        seenPostKeys: buildSeenPostKeys(new Set(), posts),
        feed: feedCache,
        initialized: true
      });
      this.logger.log(`Initialized state from Nitter. No posts forwarded.`);
      return { forwarded: 0, seen: posts.length };
    }

    if (newPosts.length === 0) {
      if (this.config.dryRun) {
        this.logger.log(`Dry run: no new Nitter posts. State not updated.`);
        return { forwarded: 0, seen: posts.length, dryRun: true, wouldForward: 0 };
      }
      await saveState(this.config.stateFile, {
        ...state,
        lastSeenPostId: newestId,
        seenPostKeys: buildSeenPostKeys(seenKeys, posts),
        feed: feedCache,
        initialized: true
      });
      this.logger.log("No new Nitter posts.");
      return { forwarded: 0, seen: posts.length };
    }

    const ordered = [...newPosts].sort(comparePosts);
    let forwarded = 0;
    let wouldForward = 0;

    for (const post of ordered) {
      if (post.isReply && !this.config.forwardReplies) {
        if (this.config.dryRun) {
          this.logger.log(`Dry run: would skip reply X post ${post.id}.`);
          continue;
        }
        seenKeys.add(post.key || post.id);
        await saveState(this.config.stateFile, {
          lastSeenPostId: post.id,
          seenPostKeys: buildSeenPostKeys(seenKeys),
          feed: feedCache,
          initialized: true
        });
        this.logger.log(`Skipped reply X post ${post.id}.`);
        continue;
      }

      const content = formatMeaxContent(post, {
        username: this.config.xUsername,
        includePostLink: this.config.includePostLink
      });

      if (!content) {
        this.logger.warn(`Skipping empty X post ${post.id}.`);
        if (this.config.dryRun) {
          continue;
        }
        seenKeys.add(post.key || post.id);
        await saveState(this.config.stateFile, {
          lastSeenPostId: post.id,
          seenPostKeys: buildSeenPostKeys(seenKeys),
          feed: feedCache,
          initialized: true
        });
        continue;
      }

      if (this.config.dryRun) {
        wouldForward += 1;
        this.logger.log(`Dry run: would forward X post ${post.id} to Meax${selectMediaUrls(post, this.config).length ? " with media" : ""}.`);
        continue;
      }

      await this.meaxClient.createPost({
        content,
        mediaUrls: selectMediaUrls(post, this.config)
      });
      forwarded += 1;
      seenKeys.add(post.key || post.id);
      await saveState(this.config.stateFile, {
        lastSeenPostId: post.id,
        seenPostKeys: buildSeenPostKeys(seenKeys),
        feed: feedCache,
        initialized: true
      });
      this.logger.log(`Forwarded X post ${post.id} to Meax.`);
    }

    if (this.config.dryRun) {
      this.logger.log(`Dry run complete. wouldForward=${wouldForward} seen=${posts.length}. State not updated.`);
      return { forwarded: 0, seen: posts.length, dryRun: true, wouldForward };
    }

    await saveState(this.config.stateFile, {
      lastSeenPostId: newestId,
      seenPostKeys: buildSeenPostKeys(seenKeys, posts),
      feed: feedCache,
      initialized: true
    });

    return { forwarded, seen: posts.length };
  }

  async getFeed(state) {
    if (typeof this.feedClient.getRecentFeed === "function") {
      return this.feedClient.getRecentFeed({
        etag: state.feed?.etag,
        lastModified: state.feed?.lastModified,
        cacheUrl: state.feed?.url
      });
    }

    return {
      posts: await this.feedClient.getRecentPosts(),
      cache: {},
      notModified: false
    };
  }
}

function selectMediaUrls(post, config) {
  if (!config.forwardImages) {
    return [];
  }

  const max = config.maxMediaAttachments ?? 4;
  const media = Array.isArray(post.media) ? post.media : [];
  return media
    .filter((item) => isImageMedia(item))
    .map((item) => item.url || item.previewUrl)
    .filter(Boolean)
    .slice(0, max);
}

function isImageMedia(item) {
  if (!item) return false;
  const type = String(item.type || "").toLowerCase();
  const url = String(item.url || item.previewUrl || "");
  return type === "photo" || /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(url);
}

function hasSeenPost(post, seenKeys, seenIds) {
  return seenKeys.has(post.key || post.id) || seenIds.has(post.id);
}

function extractSeenPostId(value) {
  if (!value) return null;
  const text = String(value);
  const leadingId = text.match(/^\d+/);
  if (leadingId) return leadingId[0];
  const statusId = text.match(/\/status(?:es)?\/(\d+)/);
  return statusId?.[1] || null;
}

function buildSeenPostKeys(seenKeys, posts = []) {
  return compactSeenPostKeys([
    ...[...seenKeys].map(normalizeSeenPostKey),
    ...posts.map((post) => post.key || post.id)
  ]);
}

function normalizeSeenPostKey(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/https?:\/\/[^/|]+\/([^/?#|]+)\/status(?:es)?\/(\d+)/);
  if (match) {
    return `https://x.com/${decodeURIComponent(match[1])}/status/${match[2]}`;
  }
  return text;
}

function comparePosts(a, b) {
  const aTime = Date.parse(a.pubDate || "");
  const bTime = Date.parse(b.pubDate || "");
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }
  return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
}
