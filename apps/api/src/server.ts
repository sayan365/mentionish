import {
  assertLocalWorkspaceCanReset,
  createLocalDatabaseBackup,
  getLocalSchemaVersion,
  initializeLocalDatabase,
  LocalDiscoveryRepository,
  LocalProductRepository,
  LocalSettingsRepository,
  resetLocalWorkspaceDatabase,
} from "@mentionish/database";
import { config as loadEnvironment } from "dotenv";
import {
  createLocalAiRouter,
  LocalAiSettingsService,
} from "./ai/local-routes.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadOrCreateLocalInstallationToken } from "./local/installation-token.js";
import { createLocalDataRouter } from "./local/data-routes.js";
import { EncryptedFileSecretStore } from "./local/secret-store.js";
import { createLocalInstallationVerifier } from "./middleware/auth.js";
import { LocalDraftQueue } from "./opportunities/local-drafting.js";
import { createLocalOpportunityRepositoryFactory } from "./opportunities/local-repository.js";
import { createLocalProductRepositoryFactory } from "./products/local-repository.js";
import { LocalScanEngine } from "./scans/engine.js";
import { OpenCliRedditSource } from "./scans/reddit-opencli.js";
import { createLocalScanRouter } from "./scans/routes.js";
import { createLocalWorkspaceRepositoryFactory } from "./workspace/local-repository.js";

loadEnvironment({ path: new URL("../.env", import.meta.url) });

const config = loadConfig();
const initialized = initializeLocalDatabase({ environment: process.env });
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
        promotesCompetingSolution: result.value.promotes_competing_solution,
        reasoning: result.value.reasoning,
      };
    },
  },
  () => aiSettings.snapshot().configured,
);

const app = createApp(
  createLocalInstallationVerifier(installation.token),
  createLocalProductRepositoryFactory(products),
  config.DASHBOARD_ORIGIN,
  createLocalOpportunityRepositoryFactory(products, discovery),
  new LocalDraftQueue(discovery, aiSettings),
  config.OPENAI_DRAFT_PROMPT_VERSION,
  createLocalWorkspaceRepositoryFactory(products, discovery),
  {
    installationToken: installation.token,
    status: () => ({
      runtime_mode: "local",
      database_path: initialized.paths.databasePath,
      schema_version: getLocalSchemaVersion(initialized.database),
      first_run:
        products.list().length === 0 && products.listArchived().length === 0,
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
  createLocalDataRouter({
    dataDirectory: initialized.paths.dataDirectory,
    databasePath: initialized.paths.databasePath,
    backupsDirectory: initialized.paths.backupsDirectory,
    schemaVersion: () => getLocalSchemaVersion(initialized.database),
    createBackup: () =>
      createLocalDatabaseBackup(
        initialized.database,
        initialized.paths.backupsDirectory,
      ),
    reset: async () => {
      assertLocalWorkspaceCanReset(initialized.database);
      const backup = await createLocalDatabaseBackup(
        initialized.database,
        initialized.paths.backupsDirectory,
      );
      const cleared = resetLocalWorkspaceDatabase(initialized.database);
      aiSettings.clearLocalSecrets();
      return { backup, cleared };
    },
  }),
);

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  console.log(
    `Mentionish API listening at http://${config.API_HOST}:${config.API_PORT}`,
  );
});

function shutdown(): void {
  server.close(() => {
    initialized.database.close();
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
