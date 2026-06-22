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
    const newPosts = posts.filter((post) => !seenKeys.has(post.key || post.id));

    if (feed.notModified) {
      await saveState(this.config.stateFile, {
        ...state,
        feed: feedCache,
        initialized: true
      });
      this.logger.log("RSS feed not modified.");
      return { forwarded: 0, seen: 0 };
    }

    if (posts.length === 0) {
      await saveState(this.config.stateFile, { ...state, feed: feedCache, initialized: true });
      this.logger.log("No RSS items.");
      return { forwarded: 0, seen: 0 };
    }

    const newestId = maxPostId(posts.map((post) => post.id));

    if (!state.initialized && !this.config.backfillOnStart) {
      await saveState(this.config.stateFile, {
        lastSeenPostId: newestId,
        seenPostKeys: compactSeenPostKeys(posts.map((post) => post.key || post.id)),
        feed: feedCache,
        initialized: true
      });
      this.logger.log(`Initialized state from RSS. No posts forwarded.`);
      return { forwarded: 0, seen: posts.length };
    }

    if (newPosts.length === 0) {
      await saveState(this.config.stateFile, { ...state, feed: feedCache, initialized: true });
      this.logger.log("No new RSS items.");
      return { forwarded: 0, seen: posts.length };
    }

    const ordered = [...newPosts].sort(comparePosts);
    let forwarded = 0;

    for (const post of ordered) {
      if (post.isReply && !this.config.forwardReplies) {
        seenKeys.add(post.key || post.id);
        await saveState(this.config.stateFile, {
          lastSeenPostId: post.id,
          seenPostKeys: compactSeenPostKeys([...seenKeys]),
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
        seenKeys.add(post.key || post.id);
        await saveState(this.config.stateFile, {
          lastSeenPostId: post.id,
          seenPostKeys: compactSeenPostKeys([...seenKeys]),
          feed: feedCache,
          initialized: true
        });
        continue;
      }

      await this.meaxClient.createPost({ content });
      forwarded += 1;
      seenKeys.add(post.key || post.id);
      await saveState(this.config.stateFile, {
        lastSeenPostId: post.id,
        seenPostKeys: compactSeenPostKeys([...seenKeys]),
        feed: feedCache,
        initialized: true
      });
      this.logger.log(`Forwarded X post ${post.id} to Meax.`);
    }

    await saveState(this.config.stateFile, {
      lastSeenPostId: newestId,
      seenPostKeys: compactSeenPostKeys([...seenKeys, ...posts.map((post) => post.key || post.id)]),
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

function comparePosts(a, b) {
  const aTime = Date.parse(a.pubDate || "");
  const bTime = Date.parse(b.pubDate || "");
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }
  return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
}
