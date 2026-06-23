import { loadApiConfig, startTweetsApiServer } from "./tweetsApi.js";

const config = loadApiConfig();
const server = startTweetsApiServer({ config });

console.log(`Tweets API listening on http://${config.host}:${server.port}`);
console.log(
  `Try: http://localhost:${server.port}/api/users/${encodeURIComponent(
    process.env.X_USERNAME || "elonmusk",
  )}/tweets`,
);
