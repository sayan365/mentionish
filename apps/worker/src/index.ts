import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker(
  "discovery",
  (job) => {
    console.log("Received discovery job", { id: job.id, name: job.name });
    return Promise.resolve();
  },
  { connection, concurrency: 1 },
);

worker.on("failed", (job, error) =>
  console.error("Discovery job failed", { id: job?.id, error: error.message }),
);

async function shutdown() {
  await worker.close();
  await connection.quit();
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
