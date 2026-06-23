import { buildPostKey } from "./format.js";
import { XTransactionIdGenerator } from "./xTransactionId.js";

const X_API_BASE_URL = "https://x.com/i/api/graphql";
const DEFAULT_USER_BY_SCREEN_NAME_ENDPOINT = "IGgvgiOx4QZndDHuD3x9TQ/UserByScreenName";
const DEFAULT_USER_TWEETS_ENDPOINT = "LE3eTyeqhBh2g-fX85O2eQ/UserWithProfileTweetsQueryV2";
const DEFAULT_USER_TWEETS_REPLIES_ENDPOINT = "AcYHjc_YAx-9_rKWdMsKvA/UserWithProfileTweetsAndRepliesQueryV2";
const DEFAULT_BEARER_TOKEN =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const DEFAULT_GRAPHQL_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  c9s_list_members_action_api_enabled: false,
  c9s_superc9s_indication_enabled: false,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const USER_TWEETS_FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: false,
};

const USER_FIELD_TOGGLES = {
  withPayments: false,
  withAuxiliaryUserLabels: true,
};

export class XGraphqlClient {
  constructor({
    authToken,
    ct0,
    bearerToken = DEFAULT_BEARER_TOKEN,
    userAgent,
    clientTransactionId = "auto",
    transactionIdGenerator,
    fetchImpl = fetch,
    fetchTimeoutMs = 15000,
    endpoints = {},
  } = {}) {
    this.authToken = authToken;
    this.ct0 = ct0;
    this.bearerToken = normalizeBearerToken(bearerToken);
    this.userAgent =
      userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    this.fetch = fetchImpl;
    this.fetchTimeoutMs = fetchTimeoutMs;
    this.clientTransactionId = clientTransactionId;
    this.transactionIdGenerator =
      transactionIdGenerator || new XTransactionIdGenerator({ fetchImpl });
    this.endpoints = {
      userByScreenName: endpoints.userByScreenName || DEFAULT_USER_BY_SCREEN_NAME_ENDPOINT,
      userTweets: endpoints.userTweets || DEFAULT_USER_TWEETS_ENDPOINT,
      userTweetsAndReplies:
        endpoints.userTweetsAndReplies || DEFAULT_USER_TWEETS_REPLIES_ENDPOINT,
    };
  }

  async getUserTweets({ username, withReplies = false, cursor, count = 20 } = {}) {
    const user = await this.getUserByScreenName(username);
    if (!user?.id) {
      return {
        user: user || { username },
        tweets: [],
        bottomCursor: "",
      };
    }

    const timeline = await this.getUserTimeline({
      userId: user.id,
      withReplies,
      cursor,
      count,
    });

    return {
      user,
      ...timeline,
    };
  }

  async getUserByScreenName(username) {
    const json = await this.graphqlRequest(this.endpoints.userByScreenName, {
      variables: {
        screen_name: username,
        withGrokTranslatedBio: false,
      },
      fieldToggles: USER_FIELD_TOGGLES,
    });

    const user = firstNonNull(
      json?.data?.user?.result,
      json?.data?.user_result_by_screen_name?.result,
    );
    return parseGraphUser(user);
  }

  async getUserTimeline({ userId, withReplies = false, cursor, count = 20 }) {
    const endpoint = withReplies
      ? this.endpoints.userTweetsAndReplies
      : this.endpoints.userTweets;
    const variables = {
      rest_id: userId,
      count,
    };

    if (cursor) {
      variables.cursor = cursor;
    }

    const json = await this.graphqlRequest(endpoint, {
      variables,
      fieldToggles: USER_TWEETS_FIELD_TOGGLES,
    });

    return parseGraphTimeline(json);
  }

  async graphqlRequest(endpoint, { variables, fieldToggles } = {}) {
    if (!this.authToken || !this.ct0) {
      throw new Error("X_AUTH_TOKEN and X_CT0 are required for direct X GraphQL access.");
    }

    const url = buildGraphqlUrl(endpoint, {
      variables,
      features: DEFAULT_GRAPHQL_FEATURES,
      fieldToggles,
    });
    const signal = AbortSignal.timeout(this.fetchTimeoutMs);
    const headers = await this.buildHeaders(new URL(url).pathname);
    const response = await this.fetch(url, {
      headers,
      signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `X GraphQL request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
      );
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("X GraphQL response was not valid JSON.");
    }

    const errors = Array.isArray(json.errors) ? json.errors : [];
    if (errors.length > 0) {
      const message = errors
        .map((error) => error.message || error.code)
        .filter(Boolean)
        .join("; ");
      throw new Error(`X GraphQL returned errors: ${message || "unknown error"}`);
    }

    return json;
  }

  async buildHeaders(path = "") {
    const headers = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      authorization: this.bearerToken,
      "content-type": "application/json",
      cookie: `auth_token=${this.authToken}; ct0=${this.ct0}`,
      origin: "https://x.com",
      priority: "u=1, i",
      referer: "https://x.com/",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": this.userAgent,
      "x-csrf-token": this.ct0,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
    };

    const transactionId = await this.resolveClientTransactionId(path);
    if (transactionId) {
      headers["x-client-transaction-id"] = transactionId;
    }

    return headers;
  }

  async resolveClientTransactionId(path) {
    if (!this.clientTransactionId) return "";
    if (this.clientTransactionId !== "auto") return this.clientTransactionId;
    return this.transactionIdGenerator.generate(path);
  }
}

export function buildGraphqlUrl(endpoint, { variables, features, fieldToggles } = {}) {
  const url = new URL(`${X_API_BASE_URL}/${endpoint}`);
  url.searchParams.set("variables", JSON.stringify(variables || {}));
  url.searchParams.set("features", JSON.stringify(features || {}));
  if (fieldToggles) {
    url.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));
  }
  return url.toString();
}

export function parseGraphTimeline(json) {
  const instructions = firstArray(
    json?.data?.user?.result?.timeline?.timeline?.instructions,
    json?.data?.user_result?.result?.timeline_response?.timeline?.instructions,
    json?.data?.list?.timeline_response?.timeline?.instructions,
  );
  const tweets = [];
  let bottomCursor = "";

  for (const instruction of instructions) {
    for (const item of instruction?.moduleItems || []) {
      const tweet = parseTimelineTweet(item, "item");
      if (tweet?.id) {
        tweets.push(tweet);
      }
    }

    for (const entry of instruction?.entries || []) {
      const entryId = getEntryId(entry);
      if (entryId.startsWith("cursor-bottom")) {
        bottomCursor = entry?.content?.value || "";
        continue;
      }

      if (
        entryId.startsWith("tweet") ||
        entryId.startsWith("profile-grid") ||
        entryId.includes("-conversation-") ||
        entryId.startsWith("homeConversation")
      ) {
        for (const tweet of extractTweetsFromEntry(entry)) {
          if (tweet?.id) {
            tweets.push(tweet);
          }
        }
      }
    }

    if (getTypeName(instruction) === "TimelinePinEntry") {
      for (const tweet of extractTweetsFromEntry(instruction.entry || {})) {
        if (tweet?.id) {
          tweets.push({ ...tweet, pinned: true });
        }
      }
    }
  }

  return {
    tweets: dedupeTweets(tweets).sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : 1,
    ),
    bottomCursor,
  };
}

export function parseGraphTweet(result) {
  if (!result || typeof result !== "object") return null;
  const typeName = getTypeName(result);
  if (typeName === "TweetWithVisibilityResults") {
    return parseGraphTweet(result.tweet);
  }
  if (typeName === "TweetUnavailable") {
    return null;
  }
  if (typeName === "TweetTombstone") {
    return parseTombstoneTweet(result);
  }

  const legacy = result.legacy || result.details;
  const id = String(result.rest_id || legacy?.id_str || "");
  if (!id) return null;

  const text = parseTweetText(result);
  const user = parseGraphUser(result.core);
  const quoted = parseGraphTweet(firstNonNull(
    result?.quoted_status_result?.result,
    result?.quotedPostResults?.result,
  ));
  const retweet = parseGraphTweet(firstNonNull(
    result?.legacy?.retweeted_status_result?.result,
    result?.legacy?.repostedStatusResults?.result,
    result?.retweeted_status_result?.result,
    result?.repostedStatusResults?.result,
  ));

  const post = {
    id,
    title: text.split("\n").find(Boolean) || "",
    text,
    link: user?.username ? `https://x.com/${user.username}/status/${id}` : `https://x.com/i/status/${id}`,
    pubDate: parseTwitterDate(legacy?.created_at || result?.details?.created_at_ms),
    isReply: Boolean(legacy?.in_reply_to_status_id_str || result?.reply_to_results?.rest_id),
    isRepost: Boolean(retweet),
    isQuote: Boolean(quoted),
    user,
    stats: {
      replies: readInteger(legacy?.reply_count ?? result?.counts?.reply_count),
      retweets: readInteger(legacy?.retweet_count ?? result?.counts?.retweet_count),
      likes: readInteger(legacy?.favorite_count ?? result?.counts?.favorite_count),
      views: readInteger(result?.views?.count),
    },
    media: parseMedia(result),
    quoted,
    retweet,
  };

  return {
    ...post,
    key: buildPostKey(post, user?.username),
  };
}

export function parseGraphUser(value) {
  const user = firstNonNull(
    value?.user_result?.result,
    value?.user_results?.result,
    value?.result,
    value?.core ? value : null,
    value,
  );
  if (!user || typeof user !== "object") return null;

  const legacy = user.legacy || {};
  const core = user.core || {};
  const id = String(user.rest_id || legacy.id_str || "");
  const username = legacy.screen_name || core.screen_name || "";
  if (!id && !username) return null;

  return {
    id,
    username,
    name: legacy.name || core.name || "",
    bio: legacy.description || "",
    location: legacy.location || "",
    profileImageUrl: stripNormalImageSuffix(
      legacy.profile_image_url_https || user?.avatar?.image_url || "",
    ),
    bannerUrl: legacy.profile_banner_url || "",
    followers: readInteger(legacy.followers_count),
    following: readInteger(legacy.friends_count),
    tweets: readInteger(legacy.statuses_count),
    likes: readInteger(legacy.favourites_count),
    protected: Boolean(legacy.protected || user?.privacy?.protected),
    verified: Boolean(legacy.verified || user.is_blue_verified || user?.verification?.is_blue_verified),
  };
}

function extractTweetsFromEntry(entry) {
  const direct = parseTimelineTweet(entry);
  if (direct?.id) {
    return [direct];
  }

  const tweets = [];
  for (const item of entry?.content?.items || []) {
    const tweet = parseTimelineTweet(item, "item");
    if (tweet?.id) {
      tweets.push(tweet);
    }
  }
  return tweets;
}

function parseTimelineTweet(value, root = "content") {
  const result = firstNonNull(
    value?.[root]?.content?.tweet_results?.result,
    value?.[root]?.itemContent?.tweet_results?.result,
    value?.[root]?.content?.tweetResult?.result,
  );
  const tweet = parseGraphTweet(result);
  if (!tweet?.id) {
    const fallbackId = extractStatusIdFromEntryId(getEntryId(value));
    if (fallbackId) {
      return {
        id: fallbackId,
        title: "",
        text: "",
        link: `https://x.com/i/status/${fallbackId}`,
        pubDate: "",
        isReply: false,
        isRepost: false,
        unavailable: true,
        key: `https://x.com/i/status/${fallbackId}`,
      };
    }
  }
  return tweet;
}

function parseTombstoneTweet(result) {
  const text = firstNonNull(
    result?.tombstone?.richText?.text,
    result?.tombstone?.text?.text,
    result?.tombstone?.text,
  );
  return text ? { id: "", text, title: text, unavailable: true } : null;
}

function parseTweetText(result) {
  const legacy = result.legacy || {};
  const noteTweet = result?.note_tweet?.note_tweet_results?.result;
  const noteText = noteTweet?.text;
  return String(noteText || result?.details?.full_text || legacy.full_text || legacy.text || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parseMedia(result) {
  const legacy = result.legacy || {};
  const media = [
    ...(legacy?.extended_entities?.media || []),
    ...(legacy?.entities?.media || []),
    ...(result?.media_entities || []),
  ];
  const seen = new Set();
  return media
    .map((item) => ({
      type: item.type || "",
      url: item.media_url_https || item.media_url || "",
      expandedUrl: item.expanded_url || "",
      previewUrl: item.media_url_https || item.media_url || "",
      videoUrl: chooseVideoUrl(item),
    }))
    .filter((item) => {
      const key = `${item.type}:${item.url}:${item.videoUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return item.url || item.videoUrl;
    });
}

function chooseVideoUrl(item) {
  const variants = item?.video_info?.variants || [];
  const mp4 = variants
    .filter((variant) => variant.content_type === "video/mp4" && variant.url)
    .sort((a, b) => readInteger(b.bitrate) - readInteger(a.bitrate));
  return mp4[0]?.url || "";
}

function parseTwitterDate(value) {
  if (!value) return "";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toUTCString();
}

function getTypeName(value) {
  return value?.__typename || value?.type || "";
}

function getEntryId(value) {
  return value?.entryId || value?.entry_id || "";
}

function extractStatusIdFromEntryId(value) {
  const text = String(value || "");
  const match = text.match(/(\d{10,})$/);
  return match?.[1] || "";
}

function dedupeTweets(tweets) {
  const seen = new Set();
  const result = [];
  for (const tweet of tweets) {
    if (!tweet?.id || seen.has(tweet.id)) continue;
    seen.add(tweet.id);
    result.push(tweet);
  }
  return result;
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function firstNonNull(...values) {
  return values.find((value) => value != null) ?? null;
}

function readInteger(value) {
  const parsed = Number.parseInt(value ?? 0, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripNormalImageSuffix(value) {
  return String(value || "").replace("_normal.", ".");
}

function normalizeBearerToken(value) {
  if (!value) return DEFAULT_BEARER_TOKEN;
  return String(value).startsWith("Bearer ") ? String(value) : `Bearer ${value}`;
}
