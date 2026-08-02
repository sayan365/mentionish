import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_JWT_ISSUER: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return environmentSchema.parse(environment);
}
