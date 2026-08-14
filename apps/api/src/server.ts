import {
  getLocalSchemaVersion,
  initializeLocalDatabase,
  LocalProductRepository,
  LocalDiscoveryRepository,
  LocalSettingsRepository,
} from "@mentionish/database";
import { config as loadEnvironment } from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  createLocalInstallationVerifier,
  createSupabaseVerifier,
} from "./middleware/auth.js";
import { createLocalProductRepositoryFactory } from "./products/local-repository.js";
import { createSupabaseProductRepositoryFactory } from "./products/repository.js";
import { createLocalOpportunityRepositoryFactory } from "./opportunities/local-repository.js";
import { createSupabaseOpportunityRepositoryFactory } from "./opportunities/repository.js";
import { createDraftQueue } from "./opportunities/draft-queue.js";
import { createLocalWorkspaceRepositoryFactory } from "./workspace/local-repository.js";
import { createSupabaseWorkspaceRepositoryFactory } from "./workspace/repository.js";
import { loadOrCreateLocalInstallationToken } from "./local/installation-token.js";
import { EncryptedFileSecretStore } from "./local/secret-store.js";
import {
  createLocalAiRouter,
  LocalAiSettingsService,
} from "./ai/local-routes.js";
import { LocalScanEngine } from "./scans/engine.js";
import { createLocalScanRouter } from "./scans/routes.js";
import { OpenCliRedditSource } from "./scans/reddit-opencli.js";

loadEnvironment({ path: new URL("../.env", import.meta.url) });

const config = loadConfig();
let closeDatabase: (() => void) | undefined;

const app =
  config.MENTIONISH_RUNTIME_MODE === "local"
    ? (() => {
        const initialized = initializeLocalDatabase({
          environment: process.env,
        });
        closeDatabase = () => initialized.database.close();
        const products = new LocalProductRepository(initialized.database);
        const discovery = new LocalDiscoveryRepository(initialized.database);
        const installation = loadOrCreateLocalInstallationToken(
          initialized.paths.dataDirectory,
        );
        const aiSettings = new LocalAiSettingsService(
          new LocalSettingsRepository(initialized.database),
          new EncryptedFileSecretStore(initialized.paths.dataDirectory),
        );
        const redditEnabled =
          process.env.REDDIT_DISCOVERY_ENABLED === "true" &&
          process.env.REDDIT_POLICY_RISK_ACCEPTED === "true";
        const scanEngine = new LocalScanEngine(
          products,
          discovery,
          fetch,
          new OpenCliRedditSource(() => discovery.redditProfile()),
          redditEnabled,
          {
            planQueries: async (input) => {
              const result = await aiSettings
                .client("classification")
                .planDiscoveryQueries({
                  name: input.productName,
                  description: input.productDescription,
                  audience: input.productAudience,
                  discoveryProfile: input.productDiscoveryProfile,
                  listeningPhrases: input.listeningPhrases,
                  recentQueries: input.recentQueries,
                });
              return result.value;
            },
            classify: async (input) => {
              const result = await aiSettings
                .client("classification")
                .qualifyConversation(input);
              return {
                audienceFit: result.value.audience_fit,
                problemFit: result.value.problem_fit,
                solutionSeeking: result.value.solution_seeking,
                buyingIntent: result.value.buying_intent,
                replyAppropriateness: result.value.reply_appropriateness,
                needScope: result.value.need_scope,
                authorState: result.value.author_state,
                marketResearchValue: result.value.market_research_value,
                hasDirectProductNeed: result.value.has_direct_product_need,
                seeksProductCategory: result.value.seeks_product_category,
                promotesCompetingSolution:
                  result.value.promotes_competing_solution,
                reasoning: result.value.reasoning,
              };
            },
          },
          () => aiSettings.snapshot().configured,
        );
        return createApp(
          createLocalInstallationVerifier(installation.token),
          createLocalProductRepositoryFactory(products),
          config.DASHBOARD_ORIGIN,
          createLocalOpportunityRepositoryFactory(products, discovery),
          undefined,
          config.OPENAI_DRAFT_PROMPT_VERSION,
          createLocalWorkspaceRepositoryFactory(products),
          {
            installationToken: installation.token,
            status: () => ({
              runtime_mode: "local",
              database_path: initialized.paths.databasePath,
              schema_version: getLocalSchemaVersion(initialized.database),
              first_run:
                products.list().length === 0 &&
                products.listArchived().length === 0,
              installation_token_created: installation.created,
            }),
            settings: () => ({
              runtime_mode: "local",
              database: {
                path: initialized.paths.databasePath,
                backups_directory: initialized.paths.backupsDirectory,
              },
              ai_provider: aiSettings.snapshot(),
              platforms: {
                hackernews: { enabled: true },
                reddit: {
                  enabled: redditEnabled,
                  experimental: true,
                  backend: "OpenCLI",
                  kill_switch: discovery.isRedditHalted(),
                },
                twitter: { enabled: false, experimental: true },
              },
            }),
          },
          createLocalAiRouter(aiSettings),
          createLocalScanRouter(scanEngine, discovery),
        );
      })()
    : createApp(
        createSupabaseVerifier(config),
        createSupabaseProductRepositoryFactory(
          config.SUPABASE_URL,
          config.SUPABASE_ANON_KEY,
        ),
        config.DASHBOARD_ORIGIN,
        createSupabaseOpportunityRepositoryFactory(
          config.SUPABASE_URL,
          config.SUPABASE_ANON_KEY,
        ),
        createDraftQueue(config.REDIS_URL),
        config.OPENAI_DRAFT_PROMPT_VERSION,
        createSupabaseWorkspaceRepositoryFactory(
          config.SUPABASE_URL,
          config.SUPABASE_ANON_KEY,
        ),
      );

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  console.log(
    `Mentionish ${config.MENTIONISH_RUNTIME_MODE} API listening at http://${config.API_HOST}:${config.API_PORT}`,
  );
});

function shutdown(): void {
  server.close(() => {
    closeDatabase?.();
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
