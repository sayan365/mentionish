import "dotenv/config";
import { createHash } from "node:crypto";
import {
  maintenanceJobSchema,
  platformFetchJobId,
  platformFetchJobSchema,
  queueNames,
  scheduleBucket,
  type PlatformCode,
} from "@mentionish/types";
import { UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";
import { HackerNewsAdapter } from "./adapters/hackernews.js";
import { RedditAdapter, RedditAuthenticationError } from "./adapters/reddit.js";
import type { PlatformAdapter } from "./adapters/types.js";
import { runPlatformFetch, runRedditContentRevalidation } from "./discovery.js";
import { SupabaseDiscoveryRepository } from "./repository.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when discovery is enabled.`);
  return value;
}

function boundedInteger(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const processingEnabled = process.env.DISCOVERY_PROCESSING_ENABLED === "true";
const redditEnabled =
  process.env.REDDIT_DISCOVERY_ENABLED === "true" &&
  process.env.REDDIT_POLICY_RISK_ACCEPTED === "true";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const repository = processingEnabled
  ? new SupabaseDiscoveryRepository(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    )
  : null;
const hackerNewsAdapter = new HackerNewsAdapter();
let redditAdapter: RedditAdapter | undefined;
let redditHaltKey: string | undefined;

function redditConfiguration(): {
  adapter: RedditAdapter;
  haltKey: string;
} {
  if (!redditEnabled) {
    throw new UnrecoverableError(
      "Reddit discovery requires REDDIT_DISCOVERY_ENABLED and REDDIT_POLICY_RISK_ACCEPTED.",
    );
  }
  const clientId = requiredEnvironment("REDDIT_CLIENT_ID");
  redditHaltKey ??=
    "mentionish:reddit:auth-halt:" +
    createHash("sha256").update(clientId).digest("hex").slice(0, 16);
  redditAdapter ??= new RedditAdapter(
    {
      clientId,
      clientSecret: requiredEnvironment("REDDIT_CLIENT_SECRET"),
      userAgent: requiredEnvironment("REDDIT_USER_AGENT"),
    },
    fetch,
    {
      maxQueriesPerScan: boundedInteger("REDDIT_MAX_QUERIES_PER_SCAN", 20, 100),
      onRateLimit: (rateLimit) => {
        console.log("Reddit API rate limit", rateLimit);
      },
      cache: {
        async get(key) {
          const value = await connection.get(key);
          if (value === null) return null;
          try {
            return JSON.parse(value) as unknown;
          } catch {
            await connection.del(key);
            return null;
          }
        },
        async set(key, value, ttlSeconds) {
          await connection.set(key, JSON.stringify(value), "EX", ttlSeconds);
        },
      },
      cacheTtlSeconds: 300,
    },
  );
  return { adapter: redditAdapter, haltKey: redditHaltKey };
}

async function redditAdapterForWork(): Promise<RedditAdapter> {
  const configuration = redditConfiguration();
  if (await connection.exists(configuration.haltKey)) {
    throw new UnrecoverableError(
      "Reddit discovery is halted after an authorization failure.",
    );
  }
  return configuration.adapter;
}

async function haltRedditOnAuthenticationFailure(
  error: RedditAuthenticationError,
): Promise<never> {
  const configuration = redditConfiguration();
  await connection.set(
    configuration.haltKey,
    JSON.stringify({
      halted_at: new Date().toISOString(),
      reason: "authorization_failure",
    }),
  );
  console.error("Reddit discovery halted after authorization failure", {
    error: error.message,
  });
  throw new UnrecoverableError(error.message);
}

async function adapterFor(platform: PlatformCode): Promise<PlatformAdapter> {
  return platform === "hackernews" ? hackerNewsAdapter : redditAdapterForWork();
}

if (redditEnabled && process.env.REDDIT_CLEAR_AUTH_HALT === "true") {
  const configuration = redditConfiguration();
  await connection.del(configuration.haltKey);
  console.log("Cleared the Reddit authorization halt by operator request");
}

const platformFetchWorker = new Worker(
  queueNames.platformFetch,
  async (job) => {
    const data = platformFetchJobSchema.parse(job.data);
    const bucket = scheduleBucket(
      new Date(job.timestamp),
      data.interval_minutes,
    );
    const operationId = platformFetchJobId(data.platform, bucket);

    if (!repository) {
      console.log("Skipped platform fetch because discovery is disabled", {
        id: job.id,
        operationId,
        platform: data.platform,
        scheduleBucket: bucket,
      });
      return { status: "disabled" };
    }

    try {
      const result = await runPlatformFetch({
        adapter: await adapterFor(data.platform),
        repository,
        scheduleBucket: bucket,
        workerId:
          process.env.DISCOVERY_WORKER_ID?.trim() || `worker-${process.pid}`,
      });
      console.log("Completed platform fetch job", {
        id: job.id,
        operationId,
        platform: data.platform,
        scheduleBucket: bucket,
        ...result,
      });
      return result;
    } catch (error) {
      if (error instanceof RedditAuthenticationError) {
        return haltRedditOnAuthenticationFailure(error);
      }
      throw error;
    }
  },
  { connection, concurrency: 1 },
);

const maintenanceWorker = new Worker(
  queueNames.maintenance,
  async (job) => {
    const data = maintenanceJobSchema.parse(job.data);
    if (data.task !== "reddit-content-revalidation") {
      return { status: "ignored", task: data.task };
    }
    if (!repository) return { status: "disabled" };

    try {
      const result = await runRedditContentRevalidation(
        await redditAdapterForWork(),
        repository,
        boundedInteger("REDDIT_REVALIDATION_BATCH_SIZE", 100, 100),
      );
      console.log("Completed Reddit content revalidation", result);
      return result;
    } catch (error) {
      if (error instanceof RedditAuthenticationError) {
        return haltRedditOnAuthenticationFailure(error);
      }
      throw error;
    }
  },
  { connection, concurrency: 1 },
);

platformFetchWorker.on("failed", (job, error) => {
  console.error("Platform fetch job failed", {
    id: job?.id,
    error: error.message,
  });
});

maintenanceWorker.on("failed", (job, error) => {
  console.error("Maintenance job failed", {
    id: job?.id,
    error: error.message,
  });
});

async function shutdown() {
  await Promise.all([platformFetchWorker.close(), maintenanceWorker.close()]);
  await connection.quit();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

console.log("Mentionish worker active", {
  queue: queueNames.platformFetch,
  discoveryEnabled: processingEnabled,
  redditEnabled,
  hackerNewsFallbackEnabled: true,
});
