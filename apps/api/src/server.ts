import { config as loadEnvironment } from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSupabaseVerifier } from "./middleware/auth.js";
import { createSupabaseProductRepositoryFactory } from "./products/repository.js";
import { createSupabaseOpportunityRepositoryFactory } from "./opportunities/repository.js";
import { createDraftQueue } from "./opportunities/draft-queue.js";
import { createSupabaseWorkspaceRepositoryFactory } from "./workspace/repository.js";

loadEnvironment({ path: new URL("../.env", import.meta.url) });

const config = loadConfig();
const app = createApp(
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

app.listen(config.API_PORT, () => {
  console.log(`Mentionish API listening on port ${config.API_PORT}`);
});
