import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSupabaseVerifier } from "./middleware/auth.js";
import { createSupabaseProductRepositoryFactory } from "./products/repository.js";

const config = loadConfig();
const app = createApp(
  createSupabaseVerifier(config),
  createSupabaseProductRepositoryFactory(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY,
  ),
  config.DASHBOARD_ORIGIN,
);

app.listen(config.API_PORT, () => {
  console.log(`Mentionish API listening on port ${config.API_PORT}`);
});
