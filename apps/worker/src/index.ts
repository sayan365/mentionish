import {
  AiProviderError,
  aiRoles,
  OpenAiClassificationService,
  OpenAiDraftingService,
} from "@mentionish/ai";
import { config as loadEnvironment } from "dotenv";
import { createHash } from "node:crypto";
import {
  classifyIntentJobId,
  classifyIntentJobSchema,
  generateDraftJobSchema,
  maintenanceJobSchema,
  platformFetchJobId,
  platformFetchJobSchema,
  queueNames,
  scheduleBucket,
  type PlatformCode,
} from "@mentionish/types";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";
import { HackerNewsAdapter } from "./adapters/hackernews.js";
import {
  createOpenCliCommandRunner,
  OpenCliRedditAdapter,
} from "./adapters/reddit-opencli.js";
import {
  createRdtCommandRunner,
  RdtCliRedditAdapter,
} from "./adapters/reddit-rdt.js";
import {
  RedditAdapter,
  RedditAuthenticationError,
  RedditRateLimitError,
} from "./adapters/reddit.js";
import type { PlatformAdapter } from "./adapters/types.js";
import {
  runPlatformFetch,
  runRedditContentRevalidation,
  type RedditRevalidator,
} from "./discovery.js";
import { SupabaseClassificationRepository } from "./classification-repository.js";
import { runIntentClassification } from "./classification.js";
import { SupabaseDraftRepository } from "./drafting-repository.js";
import { runDraftGeneration } from "./drafting.js";
import { SupabaseDiscoveryRepository } from "./repository.js";

loadEnvironment({ path: new URL("../.env", import.meta.url) });

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required when its worker feature is enabled.`);
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
const classificationEnabled =
  processingEnabled && process.env.AI_CLASSIFICATION_ENABLED === "true";
const classifierPromptVersion =
  process.env.OPENAI_CLASSIFIER_PROMPT_VERSION?.trim() || "intent-v1";
const classifierModel =
  process.env.OPENAI_CLASSIFIER_MODEL?.trim() || aiRoles.classification.model;
const classifierOutputTokenCap = boundedInteger(
  "OPENAI_CLASSIFIER_MAX_OUTPUT_TOKENS",
  aiRoles.classification.maxOutputTokens,
  500,
);
const draftingEnabled = process.env.AI_DRAFTING_ENABLED === "true";
const draftingPromptVersion =
  process.env.OPENAI_DRAFT_PROMPT_VERSION?.trim() || "draft-v1";
const draftingModel =
  process.env.OPENAI_DRAFT_MODEL?.trim() || aiRoles.drafting.model;
const draftingOutputTokenCap = boundedInteger(
  "OPENAI_DRAFT_MAX_OUTPUT_TOKENS",
  aiRoles.drafting.maxOutputTokens,
  1200,
);
const redditBackend = (() => {
  const value = process.env.REDDIT_DATA_BACKEND?.trim() || "oauth";
  if (value !== "oauth" && value !== "rdt_cli" && value !== "opencli") {
    throw new Error("REDDIT_DATA_BACKEND must be oauth, rdt_cli, or opencli.");
  }
  return value;
})();
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
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const classificationQueue = new Queue(queueNames.classifyIntent, {
  connection,
});
const repository = processingEnabled
  ? new SupabaseDiscoveryRepository(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    )
  : null;
const classificationRepository = classificationEnabled
  ? new SupabaseClassificationRepository(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    )
  : null;
const classificationService = classificationEnabled
  ? new OpenAiClassificationService({
      apiKey: requiredEnvironment("OPENAI_API_KEY"),
      model: classifierModel,
      maxOutputTokens: classifierOutputTokenCap,
    })
  : null;
const draftRepository = draftingEnabled
  ? new SupabaseDraftRepository(
      requiredEnvironment("SUPABASE_URL"),
      requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    )
  : null;
const draftingService = draftingEnabled
  ? new OpenAiDraftingService({
      apiKey: requiredEnvironment("OPENAI_API_KEY"),
      model: draftingModel,
      maxOutputTokens: draftingOutputTokenCap,
    })
  : null;
async function enqueueClassifications(opportunityIds: string[]): Promise<void> {
  if (!classificationEnabled) return;
  await Promise.all(
    opportunityIds.map((opportunityId) =>
      classificationQueue.add(
        queueNames.classifyIntent,
        {
          opportunity_id: opportunityId,
          prompt_version: classifierPromptVersion,
        },
        {
          jobId: classifyIntentJobId(opportunityId, classifierPromptVersion),
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: 5_000,
        },
      ),
    ),
  );
}
const hackerNewsAdapter = new HackerNewsAdapter();
type RedditWorkAdapter = PlatformAdapter & RedditRevalidator;
let redditAdapter: RedditWorkAdapter | undefined;
let redditHaltKey: string | undefined;
let redditCooldownKey: string | undefined;

function redditCache() {
  return {
    async get(key: string) {
      const value = await connection.get(key);
      if (value === null) return null;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        await connection.del(key);
        return null;
      }
    },
    async set(key: string, value: unknown, ttlSeconds: number) {
      await connection.set(key, JSON.stringify(value), "EX", ttlSeconds);
    },
  };
}

function redditConfiguration(): {
  adapter: RedditWorkAdapter;
  haltKey: string;
  cooldownKey: string;
} {
  if (!redditEnabled) {
    throw new UnrecoverableError(
      "Reddit discovery is disabled or its required risk acknowledgement is missing.",
    );
  }

  const identity =
    redditBackend === "oauth"
      ? requiredEnvironment("REDDIT_CLIENT_ID")
      : requiredEnvironment("REDDIT_ACCOUNT_USERNAME");
  const identityHash = createHash("sha256")
    .update(redditBackend + ":" + identity)
    .digest("hex")
    .slice(0, 16);
  redditHaltKey ??= "mentionish:reddit:auth-halt:" + identityHash;
  redditCooldownKey ??= "mentionish:reddit:rate-cooldown:" + identityHash;

  if (!redditAdapter) {
    if (redditBackend === "oauth") {
      redditAdapter = new RedditAdapter(
        {
          clientId: identity,
          clientSecret: requiredEnvironment("REDDIT_CLIENT_SECRET"),
          userAgent: requiredEnvironment("REDDIT_USER_AGENT"),
        },
        fetch,
        {
          maxQueriesPerScan: boundedInteger(
            "REDDIT_MAX_QUERIES_PER_SCAN",
            20,
            100,
          ),
          onRateLimit: (rateLimit) => {
            console.log("Reddit API rate limit", rateLimit);
          },
          cache: redditCache(),
          cacheTtlSeconds: 300,
        },
      );
    } else if (redditBackend === "rdt_cli") {
      redditAdapter = new RdtCliRedditAdapter(
        createRdtCommandRunner(
          process.env.REDDIT_RDT_EXECUTABLE?.trim() || "rdt",
          requiredEnvironment("REDDIT_RDT_HOME"),
          boundedInteger("REDDIT_RDT_TIMEOUT_SECONDS", 45, 120) * 1_000,
        ),
        {
          maxQueriesPerScan: boundedInteger(
            "REDDIT_MAX_QUERIES_PER_SCAN",
            5,
            20,
          ),
          maxResultsPerQuery: boundedInteger(
            "REDDIT_MAX_RESULTS_PER_QUERY",
            25,
            100,
          ),
          maxRevalidationPerRun: boundedInteger(
            "REDDIT_REVALIDATION_BATCH_SIZE",
            10,
            25,
          ),
          cache: redditCache(),
          cacheTtlSeconds: 300,
        },
      );
    } else {
      redditAdapter = new OpenCliRedditAdapter(
        createOpenCliCommandRunner(
          process.execPath,
          requiredEnvironment("REDDIT_OPENCLI_SCRIPT"),
          boundedInteger("REDDIT_OPENCLI_TIMEOUT_SECONDS", 60, 120) * 1_000,
        ),
        {
          maxQueriesPerScan: boundedInteger(
            "REDDIT_MAX_QUERIES_PER_SCAN",
            5,
            20,
          ),
          maxResultsPerQuery: boundedInteger(
            "REDDIT_MAX_RESULTS_PER_QUERY",
            25,
            100,
          ),
          maxRevalidationPerRun: boundedInteger(
            "REDDIT_REVALIDATION_BATCH_SIZE",
            10,
            25,
          ),
          cache: redditCache(),
          cacheTtlSeconds: 300,
        },
      );
    }
  }

  return {
    adapter: redditAdapter,
    haltKey: redditHaltKey,
    cooldownKey: redditCooldownKey,
  };
}

async function redditAdapterForWork(): Promise<RedditWorkAdapter> {
  const configuration = redditConfiguration();
  if (await connection.exists(configuration.haltKey)) {
    throw new UnrecoverableError(
      "Reddit discovery is halted after an authorization failure.",
    );
  }
  if (await connection.exists(configuration.cooldownKey)) {
    const remainingSeconds = await connection.ttl(configuration.cooldownKey);
    throw new UnrecoverableError(
      `Reddit discovery is cooling down after rate limiting (${Math.max(0, remainingSeconds)} seconds remaining).`,
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

async function cooldownRedditOnRateLimit(
  error: RedditRateLimitError,
): Promise<never> {
  const configuration = redditConfiguration();
  const cooldownSeconds = Math.max(
    300,
    Math.min(21_600, error.retryAfterSeconds ?? 3_600),
  );
  await connection.set(
    configuration.cooldownKey,
    JSON.stringify({
      halted_at: new Date().toISOString(),
      reason: "rate_limited",
      cooldown_seconds: cooldownSeconds,
    }),
    "EX",
    cooldownSeconds,
  );
  console.error("Reddit discovery entered rate-limit cooldown", {
    cooldownSeconds,
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

if (redditEnabled && process.env.REDDIT_CLEAR_RATE_LIMIT_COOLDOWN === "true") {
  const configuration = redditConfiguration();
  await connection.del(configuration.cooldownKey);
  console.log("Cleared the Reddit rate-limit cooldown by operator request");
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
        onOpportunitiesPersisted: enqueueClassifications,
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
      if (error instanceof RedditRateLimitError) {
        return cooldownRedditOnRateLimit(error);
      }
      throw error;
    }
  },
  { connection, concurrency: 1 },
);

const classificationWorker =
  classificationEnabled && classificationRepository && classificationService
    ? new Worker(
        queueNames.classifyIntent,
        async (job) => {
          const data = classifyIntentJobSchema.parse(job.data);
          let result;
          try {
            result = await runIntentClassification(
              data.opportunity_id,
              classificationService,
              classificationRepository,
              {
                promptVersion: data.prompt_version,
                requestedModel: classifierModel,
                outputTokenCap: classifierOutputTokenCap,
              },
            );
          } catch (error) {
            if (error instanceof AiProviderError && !error.retryable) {
              throw new UnrecoverableError(error.message);
            }
            throw error;
          }
          console.log("Completed classification job", {
            id: job.id,
            opportunityId: data.opportunity_id,
            status: result.status,
            score: result.status === "succeeded" ? result.score : undefined,
          });
          return result;
        },
        {
          connection,
          concurrency: boundedInteger("AI_CLASSIFICATION_CONCURRENCY", 2, 10),
        },
      )
    : null;

const draftWorker =
  draftingEnabled && draftRepository && draftingService
    ? new Worker(
        queueNames.generateDraft,
        async (job) => {
          const data = generateDraftJobSchema.parse(job.data);
          try {
            const result = await runDraftGeneration(
              data.operation_id,
              draftingService,
              draftRepository,
              {
                requestedModel: draftingModel,
                outputTokenCap: draftingOutputTokenCap,
              },
            );
            console.log("Completed draft job", {
              id: job.id,
              operationId: data.operation_id,
              status: result.status,
            });
            return result;
          } catch (error) {
            if (error instanceof AiProviderError && !error.retryable)
              throw new UnrecoverableError(error.message);
            throw error;
          }
        },
        {
          connection,
          concurrency: boundedInteger("AI_DRAFTING_CONCURRENCY", 1, 5),
        },
      )
    : null;
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
      if (error instanceof RedditRateLimitError) {
        return cooldownRedditOnRateLimit(error);
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

classificationWorker?.on("failed", (job, error) => {
  console.error("Classification job failed", {
    id: job?.id,
    error: error.message,
  });
});

draftWorker?.on("failed", (job, error) => {
  console.error("Draft job failed", { id: job?.id, error: error.message });
});
maintenanceWorker.on("failed", (job, error) => {
  console.error("Maintenance job failed", {
    id: job?.id,
    error: error.message,
  });
});

async function shutdown() {
  await Promise.all([
    platformFetchWorker.close(),
    maintenanceWorker.close(),
    classificationWorker?.close(),
    draftWorker?.close(),
    classificationQueue.close(),
  ]);
  await connection.quit();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

console.log("Mentionish worker active", {
  queue: queueNames.platformFetch,
  discoveryEnabled: processingEnabled,
  classificationEnabled,
  draftingEnabled,
  draftingModel,
  draftingPromptVersion,
  classifierModel,
  classifierPromptVersion,
  redditEnabled,
  redditBackend,
  hackerNewsFallbackEnabled: true,
});
