import {
  LocalSettingsRepository,
  openLocalDatabase,
} from "@mentionish/database";
import { describe, expect, it } from "vitest";
import { LocalAiSettingsService } from "./local-routes.js";
import type { SecretStore } from "../local/secret-store.js";
class MemorySecrets implements SecretStore {
  values = new Map<string, string>();
  get(key: string) {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.values.set(key, value);
  }
  delete(key: string) {
    this.values.delete(key);
  }
}
describe("LocalAiSettingsService", () => {
  it("persists only masked provider metadata in SQLite", () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const settings = new LocalSettingsRepository(database);
    const secrets = new MemorySecrets();
    const service = new LocalAiSettingsService(settings, secrets);
    service.save({
      provider: "openai",
      api_key: "sk-private-value",
      classification_model: "gpt-classify",
      drafting_model: "gpt-draft",
    });
    expect(service.snapshot()).toEqual({
      configured: true,
      provider: "openai",
      base_url: "https://api.openai.com/v1",
      classification_model: "gpt-classify",
      drafting_model: "gpt-draft",
      key_suffix: "alue",
      validated_at: null,
    });
    expect(JSON.stringify(settings.get("ai_provider"))).not.toContain(
      "sk-private-value",
    );
    expect(secrets.get("ai_provider:openai")).toBe("sk-private-value");
    service.remove();
    expect(service.snapshot().configured).toBe(false);
    database.close();
  });
});
