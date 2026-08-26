import {
  LocalAiProvider,
  aiProviderSchema,
  productDiscoveryProfileSchema,
  providerBaseUrls,
} from "@mentionish/ai";
import type { AiModelOption } from "@mentionish/ai";
import type { LocalSettingsRepository } from "@mentionish/database";
import { Router, type Response } from "express";
import { z } from "zod";
import type { SecretStore } from "../local/secret-store.js";

const providerInputSchema = z.object({
  provider: aiProviderSchema,
  api_key: z.string().trim().max(500).optional(),
  base_url: z.string().trim().url().max(500).nullable().optional(),
  classification_model: z.string().trim().min(2).max(200),
  drafting_model: z.string().trim().min(2).max(200),
});
const phraseInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  audience: z.string().trim().max(1000).nullable().optional(),
  discoveryProfile: productDiscoveryProfileSchema.nullable().optional(),
  listeningPhrases: z
    .array(z.string().trim().min(2).max(80))
    .max(25)
    .optional(),
});
const productContextInputSchema = phraseInputSchema;
type ProviderName = z.infer<typeof aiProviderSchema>;
interface SavedProvider {
  provider: ProviderName;
  base_url: string | null;
  classification_model: string;
  drafting_model: string;
  key_suffix: string | null;
  validated_at: string | null;
}
interface LegacySavedProvider {
  provider: ProviderName;
  model: string;
  key_suffix: string;
  validated_at: string | null;
}
export interface AiSettingsSnapshot extends SavedProvider {
  configured: boolean;
}
const SETTINGS_KEY = "ai_provider";
const SECRET_PREFIX = "ai_provider:";

export class LocalAiSettingsService {
  constructor(
    private readonly settings: LocalSettingsRepository,
    private readonly secrets: SecretStore,
  ) {}
  private saved(): SavedProvider | null {
    const value = this.settings.get<SavedProvider | LegacySavedProvider>(
      SETTINGS_KEY,
    );
    if (!value) return null;
    if ("classification_model" in value) return value;
    return {
      provider: value.provider,
      base_url: providerBaseUrls[value.provider],
      classification_model: value.model,
      drafting_model: value.model,
      key_suffix: value.key_suffix,
      validated_at: value.validated_at,
    };
  }
  snapshot():
    | AiSettingsSnapshot
    | {
        configured: false;
        provider: null;
        base_url: null;
        classification_model: null;
        drafting_model: null;
        key_suffix: null;
        validated_at: null;
      } {
    const saved = this.saved();
    if (!saved)
      return {
        configured: false,
        provider: null,
        base_url: null,
        classification_model: null,
        drafting_model: null,
        key_suffix: null,
        validated_at: null,
      };
    const key = this.secrets.get(SECRET_PREFIX + saved.provider);
    return {
      configured: saved.provider === "openai-compatible" || key !== null,
      ...saved,
    };
  }
  save(input: z.infer<typeof providerInputSchema>): void {
    const previous = this.saved();
    const suppliedKey = input.api_key?.trim() || null;
    const existingKey =
      previous?.provider === input.provider
        ? this.secrets.get(SECRET_PREFIX + input.provider)
        : null;
    if (input.provider !== "openai-compatible" && !suppliedKey && !existingKey)
      throw new Error("Enter an API key for this provider.");
    if (input.provider === "openai-compatible" && !input.base_url)
      throw new Error(
        "Enter the OpenAI-compatible base URL, including /v1 when required.",
      );
    if (previous && previous.provider !== input.provider)
      this.secrets.delete(SECRET_PREFIX + previous.provider);
    if (suppliedKey)
      this.secrets.set(SECRET_PREFIX + input.provider, suppliedKey);
    const saved: SavedProvider = {
      provider: input.provider,
      base_url:
        input.provider === "openai-compatible"
          ? (input.base_url ?? null)
          : providerBaseUrls[input.provider],
      classification_model: input.classification_model,
      drafting_model: input.drafting_model,
      key_suffix: suppliedKey
        ? suppliedKey.slice(-4)
        : previous?.provider === input.provider
          ? previous.key_suffix
          : null,
      validated_at: null,
    };
    this.settings.set(SETTINGS_KEY, saved);
  }
  remove(): void {
    const saved = this.saved();
    if (saved) this.secrets.delete(SECRET_PREFIX + saved.provider);
    this.settings.delete(SETTINGS_KEY);
  }
  clearLocalSecrets(): void {
    for (const provider of [
      "openai",
      "anthropic",
      "openai-compatible",
    ] as const)
      this.secrets.delete(SECRET_PREFIX + provider);
  }
  client(
    role: "classification" | "drafting" = "classification",
  ): LocalAiProvider {
    const saved = this.saved();
    if (!saved) throw new Error("Configure an AI provider in Settings first.");
    const key = this.secrets.get(SECRET_PREFIX + saved.provider) ?? "";
    if (saved.provider !== "openai-compatible" && !key)
      throw new Error(
        "The saved AI key is unavailable. Add it again in Settings.",
      );
    const model =
      role === "classification"
        ? saved.classification_model
        : saved.drafting_model;
    return new LocalAiProvider(
      saved.provider,
      key,
      model,
      undefined,
      undefined,
      saved.base_url ?? undefined,
    );
  }
  listModels(): Promise<AiModelOption[]> {
    return this.client().listModels();
  }
  markValidated(): void {
    const saved = this.saved();
    if (saved)
      this.settings.set(SETTINGS_KEY, {
        ...saved,
        validated_at: new Date().toISOString(),
      });
  }
}
function error(response: Response, caught: unknown): void {
  response.status(400).json({
    error: {
      code: "AI_PROVIDER_ERROR",
      message:
        caught instanceof Error
          ? caught.message
          : "The AI provider request failed.",
      request_id: response.getHeader("x-request-id"),
      details: {},
    },
  });
}
export function createLocalAiRouter(service: LocalAiSettingsService): Router {
  const router = Router();
  router.get("/settings", (_request, response) => {
    response.setHeader("cache-control", "no-store");
    response.json({ data: service.snapshot() });
  });
  router.put("/settings", (request, response) => {
    const parsed = providerInputSchema.safeParse(request.body);
    if (!parsed.success)
      return error(
        response,
        new Error("Enter valid provider settings and select both models."),
      );
    try {
      service.save(parsed.data);
      response.json({ data: service.snapshot() });
    } catch (caught) {
      error(response, caught);
    }
  });
  router.delete("/settings", (_request, response) => {
    service.remove();
    response.status(204).end();
  });
  router.get("/models", async (_request, response) => {
    try {
      response.json({ data: await service.listModels() });
    } catch (caught) {
      error(response, caught);
    }
  });
  router.post("/test", async (_request, response) => {
    try {
      const result = await service.client("classification").testConnection();
      service.markValidated();
      response.json({
        data: {
          ...service.snapshot(),
          latency_ms: result.latencyMilliseconds,
          usage: result.usage,
        },
      });
    } catch (caught) {
      error(response, caught);
    }
  });
  router.post("/phrase-suggestions", async (request, response) => {
    const parsed = phraseInputSchema.safeParse(request.body);
    if (!parsed.success)
      return error(
        response,
        new Error("Add a product name and description first."),
      );
    try {
      const result = await service
        .client("classification")
        .suggestPhrases(parsed.data);
      response.json({
        data: {
          suggestions: result.value,
          provider: result.provider,
          model: result.model,
          latency_ms: result.latencyMilliseconds,
          usage: result.usage,
        },
      });
    } catch (caught) {
      error(response, caught);
    }
  });
  router.post("/product-context", async (request, response) => {
    const parsed = productContextInputSchema.safeParse(request.body);
    if (!parsed.success)
      return error(
        response,
        new Error("Add a product name and description before using AI."),
      );
    try {
      const result = await service
        .client("classification")
        .enhanceProductContext(parsed.data);
      response.json({
        data: {
          ...result.value,
          provider: result.provider,
          model: result.model,
          latency_ms: result.latencyMilliseconds,
          usage: result.usage,
        },
      });
    } catch (caught) {
      error(response, caught);
    }
  });
  return router;
}
