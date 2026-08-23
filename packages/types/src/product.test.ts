import { describe, expect, it } from "vitest";
import { productSchema } from "./index";

describe("productSchema", () => {
  it("accepts Supabase timestamps with offsets and microseconds", () => {
    const timestamp = "2026-08-03T20:24:50.282128+00:00";
    const product = productSchema.parse({
      id: "7b4ba173-e4b6-4fc2-ab4e-36a3d0e74653",
      user_id: "2b7f1be2-c494-4b23-9515-c8f8ca54d381",
      name: "Mentionish",
      description: "Find relevant customer conversations.",
      discovery_profile: {
        audiences: ["solo founders"],
        problems: ["cannot find customers"],
        situations: [],
        desired_outcomes: [],
        alternatives: [],
        buying_signals: [],
        helpful_signals: [],
        market_signals: [],
        exclusions: [],
        communities: [],
      },
      keywords: ["customer research"],
      phrases: [
        {
          phrase: "customer research",
          kind: "problem",
          source: "ai_suggested",
          rationale: "Current customer-discovery pain.",
        },
      ],
      voice_persona: null,
      is_active: true,
      deleted_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    expect(product.created_at).toBe(timestamp);
    expect(product.discovery_profile?.audiences).toEqual(["solo founders"]);
    expect(product.phrases?.[0]).toMatchObject({
      kind: "problem",
      source: "ai_suggested",
    });
  });
});
