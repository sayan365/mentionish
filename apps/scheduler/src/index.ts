import { config as loadEnvironment } from "dotenv";
import {
  maintenanceJobSchema,
  platformFetchJobSchema,
  queueNames,
} from "@mentionish/types";
import { Queue } from "bullmq";
import IORedis from "ioredis";

loadEnvironment({ path: new URL("../.env", import.meta.url) });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const platformFetchQueue = new Queue(queueNames.platformFetch, { connection });
const maintenanceQueue = new Queue(queueNames.maintenance, { connection });
const retryOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

await platformFetchQueue.upsertJobScheduler(
  "hackernews-scan",
  { every: 15 * 60 * 1000 },
  {
    name: "scan-platform",
    data: platformFetchJobSchema.parse({
      platform: "hackernews",
      interval_minutes: 15,
    }),
    opts: retryOptions,
  },
);

const redditBackend = process.env.REDDIT_DATA_BACKEND?.trim() || "oauth";
if (
  redditBackend !== "oauth" &&
  redditBackend !== "rdt_cli" &&
  redditBackend !== "opencli"
) {
  throw new Error("REDDIT_DATA_BACKEND must be oauth, rdt_cli, or opencli.");
}
const redditBackendRiskAccepted =
  redditBackend === "oauth" ||
  (redditBackend === "rdt_cli" &&
    process.env.REDDIT_COOKIE_BACKEND_RISK_ACCEPTED === "true") ||
  (redditBackend === "opencli" &&
    process.env.REDDIT_BROWSER_BACKEND_RISK_ACCEPTED === "true");
const redditEnabled =
  process.env.REDDIT_DISCOVERY_ENABLED === "true" &&
  process.env.REDDIT_POLICY_RISK_ACCEPTED === "true" &&
  process.env.REDDIT_KILL_SWITCH !== "true" &&
  redditBackendRiskAccepted;

if (redditEnabled) {
  await platformFetchQueue.upsertJobScheduler(
    "reddit-scan",
    { every: 25 * 60 * 1000 },
    {
      name: "scan-platform",
      data: platformFetchJobSchema.parse({
        platform: "reddit",
        interval_minutes: 25,
      }),
      opts: retryOptions,
    },
  );
  await maintenanceQueue.upsertJobScheduler(
    "reddit-content-revalidation",
    { every: 12 * 60 * 60 * 1000 },
    {
      name: "revalidate-reddit-content",
      data: maintenanceJobSchema.parse({
        task: "reddit-content-revalidation",
      }),
      opts: retryOptions,
    },
  );
} else {
  await platformFetchQueue.removeJobScheduler("reddit-scan");
  await maintenanceQueue.removeJobScheduler("reddit-content-revalidation");
}

console.log("Mentionish scheduler active", {
  queue: queueNames.platformFetch,
  redditEnabled,
  redditBackend,
  hackerNewsFallbackEnabled: true,
});
