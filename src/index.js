import { Bridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import { MeaxClient } from "./meaxClient.js";
import { NitterRssClient } from "./nitterRssClient.js";

const once = process.argv.includes("--once");

async function main() {
  const config = loadConfig();
  const feedClient = new NitterRssClient({
    username: config.xUsername,
    rssUrl: config.nitterRssUrl,
    nitterBaseUrl: config.nitterBaseUrl,
    userAgent: config.rssUserAgent,
    extraHeaders: config.rssExtraHeaders
  });
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
    setInterval(tick, config.pollIntervalMs);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
