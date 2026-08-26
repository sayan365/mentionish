import { z } from "zod";
import { httpUrlSchema } from "@mentionish/types";

const commonEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DASHBOARD_ORIGIN: httpUrlSchema.default("http://localhost:3000"),
  OPENAI_DRAFT_PROMPT_VERSION: z.string().min(1).max(100).default("draft-v1"),
});

const environmentSchema = commonEnvironmentSchema.extend({
  API_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  MENTIONISH_DATA_DIR: z.string().trim().min(1).optional(),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return environmentSchema.parse(environment);
}
