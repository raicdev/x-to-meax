import { createHash, randomInt } from "node:crypto";

const DEFAULT_KEYWORD = "obfiowerehiring";
const DEFAULT_PAIRS_URL =
  "https://raw.githubusercontent.com/fa0311/x-client-transaction-id-pair-dict/refs/heads/main/pair.json";
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const TIME_EPOCH_OFFSET_SECONDS = 1682924400;

export class XTransactionIdGenerator {
  constructor({
    fetchImpl = fetch,
    pairsUrl = DEFAULT_PAIRS_URL,
    keyword = DEFAULT_KEYWORD,
    ttlMs = DEFAULT_TTL_MS,
  } = {}) {
    this.fetch = fetchImpl;
    this.pairsUrl = pairsUrl;
    this.keyword = keyword;
    this.ttlMs = ttlMs;
    this.pairs = [];
    this.lastFetchedAt = 0;
  }

  async generate(path) {
    const pair = await this.getPair();
    const seconds = Math.floor(Date.now() / 1000 - TIME_EPOCH_OFFSET_SECONDS);
    const timeBytes = [
      seconds & 0xff,
      (seconds >> 8) & 0xff,
      (seconds >> 16) & 0xff,
      (seconds >> 24) & 0xff,
    ];
    const data = `GET!${path}!${seconds}${this.keyword}${pair.animationKey}`;
    const hash = createHash("sha256").update(data).digest();
    const key = Buffer.from(pair.verification, "base64");
    const payload = Buffer.concat([
      key,
      Buffer.from(timeBytes),
      hash.subarray(0, 16),
      Buffer.from([3]),
    ]);
    const randomByte = randomInt(0, 256);
    const encoded = Buffer.from([
      randomByte,
      ...payload.map((value) => value ^ randomByte),
    ]);

    return encoded.toString("base64").replace(/=/g, "");
  }

  async getPair() {
    await this.refreshPairs();
    if (this.pairs.length === 0) {
      throw new Error("No x-client-transaction-id pairs are available.");
    }
    return this.pairs[randomInt(0, this.pairs.length)];
  }

  async refreshPairs() {
    const now = Date.now();
    if (this.pairs.length > 0 && now - this.lastFetchedAt < this.ttlMs) {
      return;
    }

    const response = await this.fetch(this.pairsUrl);
    if (!response.ok) {
      throw new Error(
        `x-client-transaction-id pair request failed: ${response.status} ${response.statusText}`,
      );
    }

    const pairs = await response.json();
    if (!Array.isArray(pairs) || pairs.length === 0) {
      throw new Error("x-client-transaction-id pair response was empty.");
    }

    this.pairs = pairs.filter(
      (pair) =>
        typeof pair?.animationKey === "string" &&
        typeof pair?.verification === "string",
    );
    this.lastFetchedAt = now;
  }
}
