export type AiProviderName =
  "openai" | "anthropic" | "openrouter" | "openai-compatible";
export interface AiSettingsSnapshot {
  configured: boolean;
  provider: AiProviderName | null;
  base_url: string | null;
  classification_model: string | null;
  drafting_model: string | null;
  key_suffix: string | null;
  validated_at: string | null;
}
export interface AiModelOption {
  id: string;
  name: string;
}
export interface PhraseSuggestion {
  phrase: string;
  kind: "problem" | "question" | "alternative" | "category" | "audience";
  rationale: string;
}
export interface ProductContextEnhancement {
  description: string;
  audience_options: string[];
  discovery_profile: DiscoveryProfile;
  provider: AiProviderName;
  model: string;
  latency_ms: number;
  usage: { totalTokens: number };
}
function baseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) throw new Error("NEXT_PUBLIC_API_URL is required");
  return value.replace(/\/$/, "");
}
async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(baseUrl() + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? "The AI provider request failed.");
  }
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}
export const getAiSettings = (token: string) =>
  request<AiSettingsSnapshot>(token, "/api/ai/settings");
export const saveAiSettings = (
  token: string,
  input: {
    provider: AiProviderName;
    api_key?: string;
    base_url?: string | null;
    classification_model: string;
    drafting_model: string;
  },
) =>
  request<AiSettingsSnapshot>(token, "/api/ai/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const listAiModels = (token: string) =>
  request<AiModelOption[]>(token, "/api/ai/models");
export const testAiSettings = (token: string) =>
  request<AiSettingsSnapshot & { latency_ms: number }>(token, "/api/ai/test", {
    method: "POST",
  });
export const removeAiSettings = (token: string) =>
  request<void>(token, "/api/ai/settings", { method: "DELETE" });
export const suggestPhrases = (
  token: string,
  input: { name: string; description: string; audience?: string | null; discoveryProfile?: DiscoveryProfile | null; listeningPhrases?: string[] },
) =>
  request<{
    suggestions: PhraseSuggestion[];
    provider: AiProviderName;
    model: string;
    latency_ms: number;
    usage: { totalTokens: number };
  }>(token, "/api/ai/phrase-suggestions", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const enhanceProductContext = (
  token: string,
  input: { name: string; description: string; audience?: string | null; discoveryProfile?: DiscoveryProfile | null; listeningPhrases?: string[] },
) =>
  request<ProductContextEnhancement>(token, "/api/ai/product-context", {
    method: "POST",
    body: JSON.stringify(input),
  });
import type { DiscoveryProfile } from "@mentionish/types";
