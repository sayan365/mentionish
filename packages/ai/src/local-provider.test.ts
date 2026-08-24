import { describe, expect, it } from "vitest";
function bodyOf(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string")
    throw new Error("Expected a JSON request body.");
  return init.body;
}
import { LocalAiProvider, phraseSuggestionSchema } from "./local-provider.js";
const suggestions = {
  suggestions: [
    ...Array.from({ length: 7 }, (_, index) => ({
      phrase: `customer pain signal ${index + 1}`,
      kind: "problem" as const,
      rationale: "Specific problem language.",
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      phrase: `customer help question ${index + 1}`,
      kind: "question" as const,
      rationale: "Natural help-seeking language.",
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      phrase: `customer tool alternative ${index + 1}`,
      kind: "alternative" as const,
      rationale: "Tool or comparison intent.",
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      phrase: `customer discovery workflow ${index + 1}`,
      kind: "category" as const,
      rationale: "Specific workflow language.",
    })),
    ...Array.from({ length: 1 }, (_, index) => ({
      phrase: `solo founder problem ${index + 1}`,
      kind: "audience" as const,
      rationale: "Audience plus problem context.",
    })),
  ],
};
const discoveryPlan = {
  hypotheses: Array.from({ length: 16 }, (_, index) => ({
    query: `adaptive customer query ${index + 1}`,
    kind: ["pain", "help", "workflow", "alternative", "audience", "buying"][
      index % 6
    ],
    platform: index < 6 ? "reddit" : index < 12 ? "hackernews" : "both",
    rationale: "Explores a distinct current customer intent.",
  })),
};

describe("LocalAiProvider", () => {
  it("generates a provider-neutral manual reply without leaking product promotion", async () => {
    let captured: RequestInit | undefined;
    const provider = new LocalAiProvider("openai", "test-secret", "gpt-test", {
      request: (_url, init) => {
        captured = init;
        return Promise.resolve(
          Response.json({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      draft_text:
                        "Start by interviewing five people who already experience the problem, then use their exact wording to shape a focused outreach test.",
                    }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 80, output_tokens: 28 },
          }),
        );
      },
    });
    const result = await provider.generateReplyDraft({
      platform: "reddit",
      subreddit: "SaaS",
      productName: "Mentionish",
      productDescription: "Helps founders find useful customer conversations.",
      classificationReason: "The author is asking for first-user advice.",
      title: "How do I find my first users?",
      body: "I launched last week and have no audience.",
    });
    expect(result.value.draft_text).toContain("interviewing five people");
    expect(result.usage.totalTokens).toBe(108);
    expect(bodyOf(captured)).toContain(
      "A human will review and manually post it",
    );
    expect(bodyOf(captured)).not.toContain("test-secret");
  });

  it("rejects incomplete or unbalanced recommendation sets", () => {
    expect(
      phraseSuggestionSchema.safeParse({
        suggestions: Array.from({ length: 20 }, (_, index) => ({
          phrase: `duplicate strategy phrase ${index}`,
          kind: "problem",
          rationale: "Unbalanced on purpose.",
        })),
      }).success,
    ).toBe(false);
  });
  it("uses stateless OpenAI structured output and reports usage", async () => {
    let captured: RequestInit | undefined;
    const request = (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  { type: "output_text", text: JSON.stringify(suggestions) },
                ],
              },
            ],
            usage: { input_tokens: 12, output_tokens: 8 },
          }),
          { status: 200 },
        ),
      );
    };
    const provider = new LocalAiProvider("openai", "test-secret", "gpt-test", {
      request,
    });
    const result = await provider.suggestPhrases({
      name: "Mentionish",
      description: "Find useful conversations.",
    });
    expect(result.value).toHaveLength(20);
    expect(result.usage.totalTokens).toBe(20);
    const init = captured;
    expect(JSON.parse(bodyOf(init))).toMatchObject({
      store: false,
      max_output_tokens: 1800,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(bodyOf(init)).toContain("exactly 20 diverse listening intents");
    expect(bodyOf(init)).toContain("7 first-person current pain");
    expect(bodyOf(init)).toContain(
      "direct product need and an adjacent problem",
    );
    expect(bodyOf(init)).not.toContain("test-secret");
  });
  it("improves product context without requesting invented marketing copy", async () => {
    let captured: RequestInit | undefined;
    const request = (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(
        Response.json({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    description:
                      "Mentionish helps solo founders find current public conversations where prospective customers describe relevant problems, so founders can research demand and prepare useful manual replies.",
                    audience_options: [
                      "Solo SaaS founders validating demand through public community conversations.",
                      "Bootstrapped founders who cannot monitor Reddit and Hacker News throughout the day.",
                      "Small B2B product teams researching current customer pain before outreach.",
                    ],
                    discovery_profile: {
                      audiences: ["solo SaaS founders"],
                      problems: [
                        "cannot find first customers",
                        "cannot monitor communities",
                        "wastes time on irrelevant conversations",
                      ],
                      situations: [
                        "recently launched a SaaS",
                        "validating demand",
                      ],
                      desired_outcomes: [
                        "find relevant conversations",
                        "research demand",
                      ],
                      alternatives: ["manual Reddit research"],
                      buying_signals: [
                        "asks for a monitoring tool",
                        "compares social listening tools",
                      ],
                      helpful_signals: [
                        "asks how to find first customers",
                        "needs distribution advice",
                      ],
                      market_signals: [
                        "complains community research takes too long",
                        "shares failed outreach",
                      ],
                      exclusions: [
                        "generic AI model discussion",
                        "unrelated product launch",
                      ],
                      communities: ["Reddit SaaS communities", "Hacker News"],
                    },
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 18, output_tokens: 22 },
        }),
      );
    };
    const provider = new LocalAiProvider("openai", "test-secret", "gpt-test", {
      request,
    });
    const result = await provider.enhanceProductContext({
      name: "Mentionish",
      description: "Find people discussing customer problems.",
      audience: "Solo founders",
    });
    expect(result.value.audience_options).toHaveLength(3);
    expect(result.usage.totalTokens).toBe(40);
    expect(bodyOf(captured)).toContain("Preserve every supplied fact");
    expect(JSON.parse(bodyOf(captured))).toMatchObject({
      max_output_tokens: 1800,
      text: { format: { type: "json_schema", strict: true } },
    });
  });
  it("plans new discovery hypotheses using prior query outcomes as memory", async () => {
    let captured: RequestInit | undefined;
    const provider = new LocalAiProvider("openai", "test-secret", "gpt-test", {
      request: (_url, init) => {
        captured = init;
        return Promise.resolve(
          Response.json({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(discoveryPlan),
                  },
                ],
              },
            ],
            usage: { input_tokens: 20, output_tokens: 30 },
          }),
        );
      },
    });
    const result = await provider.planDiscoveryQueries({
      name: "Mentionish",
      description: "Find current customer problems in public conversations.",
      audience: "Solo founders",
      listeningPhrases: ["find early adopters"],
      recentQueries: [
        { query: "find first users", reviewed: 20, qualified: 0 },
      ],
    });
    expect(result.value).toHaveLength(16);
    expect(bodyOf(captured)).toContain("Recent queries are scan memory");
    expect(bodyOf(captured)).toContain("find first users");
    expect(JSON.parse(bodyOf(captured))).toMatchObject({
      max_output_tokens: 1500,
      text: { format: { type: "json_schema", strict: true } },
    });
  });
  it("uses Anthropic structured output and never puts the key in the body", async () => {
    let captured: RequestInit | undefined;
    const request = (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: JSON.stringify(suggestions) }],
            usage: { input_tokens: 4, output_tokens: 6 },
          }),
          { status: 200 },
        ),
      );
    };
    const provider = new LocalAiProvider(
      "anthropic",
      "anthropic-secret",
      "claude-test",
      { request },
    );
    await expect(
      provider.suggestPhrases({
        name: "Mentionish",
        description: "Find useful conversations.",
      }),
    ).resolves.toMatchObject({
      provider: "anthropic",
      usage: { totalTokens: 10 },
    });
    const init = captured;
    expect(JSON.parse(bodyOf(init))).toMatchObject({
      output_config: { format: { type: "json_schema" } },
    });
    expect(bodyOf(init)).not.toContain("anthropic-secret");
  });
  it("supports OpenRouter chat completions and model discovery", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const request = (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith("/models")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: "free/model", name: "Free model" }],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(suggestions) } }],
            usage: { prompt_tokens: 3, completion_tokens: 7 },
          }),
          { status: 200 },
        ),
      );
    };
    const provider = new LocalAiProvider(
      "openrouter",
      "router-secret",
      "free/model",
      { request },
    );
    await expect(provider.listModels()).resolves.toEqual([
      { id: "free/model", name: "Free model" },
    ]);
    await expect(
      provider.suggestPhrases({
        name: "Mentionish",
        description: "Find conversations.",
      }),
    ).resolves.toMatchObject({
      provider: "openrouter",
      usage: { totalTokens: 10 },
    });
    expect(requests[1]?.url).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(JSON.parse(bodyOf(requests[1]?.init))).toMatchObject({
      response_format: { type: "json_schema" },
    });
  });
  it("classifies conversations with the configured provider and a strict schema", async () => {
    let captured: RequestInit | undefined;
    const request = (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(
        Response.json({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    audience_fit: 90,
                    problem_fit: 88,
                    solution_seeking: 86,
                    buying_intent: 84,
                    reply_appropriateness: 92,
                    need_scope: "core",
                    author_state: "asking",
                    market_research_value: 75,
                    has_direct_product_need: true,
                    seeks_product_category: true,
                    promotes_competing_solution: false,
                    reasoning:
                      "The author is seeking a directly relevant tool.",
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      );
    };
    const provider = new LocalAiProvider("openai", "test-secret", "gpt-test", {
      request,
    });
    await expect(
      provider.qualifyConversation({
        platform: "reddit",
        productName: "Mentionish",
        productDescription: "Find high-intent customer conversations.",
        matchedPhrases: ["find customer conversations"],
        title: "How do I find customers on Reddit?",
        body: "I need a tool that finds relevant posts without constant searching.",
      }),
    ).resolves.toMatchObject({
      value: {
        audience_fit: 90,
        problem_fit: 88,
        solution_seeking: 86,
        buying_intent: 84,
        reply_appropriateness: 92,
        need_scope: "core",
        author_state: "asking",
        market_research_value: 75,
        has_direct_product_need: true,
        seeks_product_category: true,
        promotes_competing_solution: false,
      },
      usage: { totalTokens: 30 },
    });
    expect(JSON.parse(bodyOf(captured))).toMatchObject({
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
  });
});
