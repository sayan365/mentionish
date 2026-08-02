import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue("discovery", { connection });

await queue.upsertJobScheduler(
  "hackernews-scan",
  { every: 15 * 60 * 1000 },
  {
    name: "scan",
    data: { platform: "hackernews" },
    opts: { attempts: 5, backoff: { type: "exponential", delay: 1_000 } },
  },
);

if (process.env.REDDIT_DISCOVERY_ENABLED === "true") {
  await queue.upsertJobScheduler(
    "reddit-scan",
    { every: 25 * 60 * 1000 },
    {
      name: "scan",
      data: { platform: "reddit" },
      opts: { attempts: 5, backoff: { type: "exponential", delay: 1_000 } },
    },
  );
}

console.log("Mentionish scheduler active");
