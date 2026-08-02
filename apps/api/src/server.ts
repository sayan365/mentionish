import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createSupabaseVerifier } from "./middleware/auth.js";

const config = loadConfig();
const app = createApp(createSupabaseVerifier(config));

app.listen(config.API_PORT, () => {
  console.log(`Mentionish API listening on port ${config.API_PORT}`);
});
