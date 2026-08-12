import { z } from "zod";

const commonEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DASHBOARD_ORIGIN: z.string().url().default("http://localhost:3000"),
  OPENAI_DRAFT_PROMPT_VERSION: z.string().min(1).max(100).default("draft-v1"),
});

const localEnvironmentSchema = commonEnvironmentSchema.extend({
  MENTIONISH_RUNTIME_MODE: z.literal("local"),
  API_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  MENTIONISH_DATA_DIR: z.string().trim().min(1).optional(),
});

const hostedEnvironmentSchema = commonEnvironmentSchema.extend({
  MENTIONISH_RUNTIME_MODE: z.literal("hosted"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  REDIS_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_JWT_ISSUER: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
});

export type LocalApiConfig = z.infer<typeof localEnvironmentSchema>;
export type HostedApiConfig = z.infer<typeof hostedEnvironmentSchema>;
export type ApiConfig = LocalApiConfig | HostedApiConfig;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const mode = environment.MENTIONISH_RUNTIME_MODE ?? "local";
  const values = { ...environment, MENTIONISH_RUNTIME_MODE: mode };
  return mode === "hosted"
    ? hostedEnvironmentSchema.parse(values)
    : localEnvironmentSchema.parse(values);
}
