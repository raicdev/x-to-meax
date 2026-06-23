import { Bridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import { MeaxClient } from "./meaxClient.js";
import { NitterHtmlClient } from "./nitterHtmlClient.js";
import { NitterRssClient } from "./nitterRssClient.js";
import { TweetsApiClient } from "./tweetsApiClient.js";

const once = process.argv.includes("--once");
const dryRun = process.argv.includes("--dry-run");
if (dryRun) {
  process.env.DRY_RUN = "true";
}

async function main() {
  const config = loadConfig();
  const feedClient = buildFeedClient(config);
  const meaxClient = new MeaxClient({
    bearerToken: config.meaxBearerToken,
    postsUrl: config.meaxPostsUrl
  });
  const bridge = new Bridge({ feedClient, meaxClient, config });

  const tick = async () => {
    try {
      const result = await bridge.runOnce();
      console.log(`Check complete. seen=${result.seen} forwarded=${result.forwarded}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      if (once) {
        process.exitCode = 1;
      }
    }
  };

  await tick();

  if (!once) {
    console.log(`Polling every ${Math.round(config.pollIntervalMs / 1000)} seconds.`);
    if (config.dryRun) {
      console.log("Dry run enabled. Meax posts and state updates are disabled.");
    }
    setInterval(tick, config.pollIntervalMs);
  }
}

function buildFeedClient(config) {
  const baseOptions = {
    username: config.xUsername,
    nitterBaseUrl: config.nitterBaseUrl,
    userAgent: config.rssUserAgent,
    extraHeaders: config.rssExtraHeaders
  };

  if (config.nitterSource === "html") {
    return new NitterHtmlClient({
      ...baseOptions,
      htmlUrl: config.nitterHtmlUrl
    });
  }

  if (config.nitterSource === "api") {
    return new TweetsApiClient({
      username: config.xUsername,
      apiBaseUrl: config.tweetsApiBaseUrl,
      apiUrl: config.tweetsApiUrl,
      userAgent: config.rssUserAgent,
      extraHeaders: config.rssExtraHeaders,
      limit: config.tweetsApiLimit,
      withReplies: config.forwardReplies
    });
  }

  return new NitterRssClient({
    ...baseOptions,
    rssUrl: config.nitterRssUrl
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
