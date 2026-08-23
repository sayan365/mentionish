import { describe, expect, it } from "vitest";
import {
  discoveryCandidateEvidence,
  matchingListeningPhrases,
  planOutcomeAnchorQueries,
  planSearchQueries,
  selectAdaptiveQueries,
} from "./relevance.js";
describe("manual scan relevance", () => {
  it("removes contraction fragments from generated search queries", () => {
    expect(
      planSearchQueries(["can't get traction for my startup"], 1),
    ).toEqual(["get traction for my startup"]);
  });

  it("turns customer-language sentences into bounded compact queries", () => {
    const result = planSearchQueries(
      [
        "we're spending too much time sourcing candidates manually",
        "how do you find qualified candidates faster without adding recruiters",
        "our interview scheduling is a full-time job",
      ],
      5,
    );
    expect(result).toContain("sourcing candidates");
    expect(result.some((query) => query.includes("interview scheduling"))).toBe(
      true,
    );
  });
  it("matches concept overlap without requiring a verbatim long sentence", () => {
    expect(
      matchingListeningPhrases(
        {
          title: "Manual sourcing candidates takes forever",
          body: "How can our recruiting team automate this?",
        },
        ["we're spending too much time sourcing candidates manually"],
      ),
    ).toHaveLength(1);
  });
  it("keeps short phrases strict", () => {
    expect(
      matchingListeningPhrases(
        { title: "Hiring discussion", body: "General advice" },
        ["interview scheduling"],
      ),
    ).toEqual([]);
  });
  it("samples compact queries across the complete phrase set", () => {
    const phrases = [
      "alpha workflow",
      "bravo workflow",
      "charlie workflow",
      "delta workflow",
      "echo workflow",
      "foxtrot workflow",
      "golf workflow",
      "hotel workflow",
      "india workflow",
      "juliet workflow",
      "kilo workflow",
      "lima workflow",
      "mike workflow",
      "november workflow",
      "oscar workflow",
      "papa workflow",
      "quebec workflow",
      "romeo workflow",
      "sierra workflow",
      "tango workflow",
    ];
    const queries = planSearchQueries(phrases, 6);
    expect(queries).toHaveLength(6);
    expect(queries[0]).toBe("alpha workflow");
    expect(queries.at(-1)).toBe("tango workflow");
  });

  it("retains repeated domain terms that prevent unrelated results", () => {
    expect(
      planSearchQueries(
        [
          "customer churn software",
          "customer interview scheduling",
          "customer onboarding failures",
        ],
        3,
      ),
    ).toEqual([
      "customer churn software",
      "customer interview scheduling",
      "customer onboarding failures",
    ]);
  });

  it("keeps founder and SaaS context in high-intent search queries", () => {
    expect(
      planSearchQueries(
        [
          "where do founders find customers",
          "how to get first users for a SaaS",
          "launched my SaaS but have no users",
        ],
        3,
      ),
    ).toEqual([
      "where founders find customers",
      "how to get first users for saas",
      "launched my saas but have no users",
    ]);
  });

  it("does not recreate the vague queries from the failed Mentionish scan", () => {
    const queries = planSearchQueries(
      [
        "finding customers without paid ads",
        "reddit research takes too long",
        "hard to find real user pain",
        "wasting time on unqualified leads",
        "cold outreach gets no responses",
        "where do founders find customers",
        "how to find people needing my product",
        "how do i validate a startup idea",
        "where can i find early adopters",
        "solo founders struggling customer acquisition",
      ],
      10,
    );

    expect(queries).toContain("where founders find customers");
    expect(queries).toContain("solo founders struggling customer acquisition");
    expect(queries).not.toContain("how find real user pain");
    expect(queries).not.toContain("where find people needing this");
  });

  it("guarantees acquisition anchors from approved product context", () => {
    expect(
      planOutcomeAnchorQueries(
        "A local tool for SaaS founders seeking early adopters and searching for customers.",
      ),
    ).toEqual([
      "how to get first users saas",
      "how to get first customers saas",
      "struggling to get users saas",
      "launched saas no users",
      "no traction saas",
    ]);
    expect(
      planOutcomeAnchorQueries(
        "A retention tool that helps finance teams understand subscription churn.",
      ),
    ).toEqual([]);
  });

  it("matches natural reordered wording within a bounded distance", () => {
    expect(
      matchingListeningPhrases(
        {
          title: "Customer churn is getting difficult",
          body: "We urgently need to reduce it before our next renewal cycle.",
        },
        ["reduce customer churn"],
      ),
    ).toEqual(["reduce customer churn"]);
  });

  it("can apply exclusions without requiring help-seeking language", () => {
    expect(
      matchingListeningPhrases(
        {
          title: "Weekly recruitment agency promotion",
          body: "Our recruitment agency shares a product launch.",
        },
        ["recruitment agency"],
        { requireHelpIntent: false },
      ),
    ).toEqual(["recruitment agency"]);
  });

  it("rejects job listings and unrelated interview mentions", () => {
    const phrases = [
      "how to reduce time to hire for software engineers",
      "our interview scheduling is a full-time job",
    ];
    expect(
      matchingListeningPhrases(
        {
          title: "Ask HN: Who is hiring?",
          body: "Senior Software Engineer, full-time",
        },
        phrases,
      ),
    ).toEqual([]);
    expect(
      matchingListeningPhrases(
        {
          title: "A historical interview",
          body: "The first interview was published in 1990.",
        },
        phrases,
      ),
    ).toEqual([]);
  });

  it("rotates toward unseen hypotheses instead of immediately repeating a scan", () => {
    const now = Date.parse("2026-08-15T12:00:00.000Z");
    const result = selectAdaptiveQueries(
      ["customer churn", "retention workflow"],
      ["users keep cancelling", "reduce subscription losses"],
      [
        {
          query: "customer churn",
          normalizedQuery: "customer churn",
          timesUsed: 1,
          itemsFetched: 20,
          candidatesReviewed: 3,
          candidatesQualified: 0,
          lastUsedAt: "2026-08-15T11:30:00.000Z",
        },
      ],
      2,
      now,
    );
    expect(result).toEqual([
      { query: "users keep cancelling", strategy: "explore" },
      { query: "reduce subscription losses", strategy: "explore" },
    ]);
  });

  it("lets conceptual help-seeking candidates reach AI without an exact phrase", () => {
    const evidence = discoveryCandidateEvidence(
      {
        title: "How can we stop subscribers leaving?",
        body: "We need advice because renewals keep falling every month.",
      },
      ["reduce customer churn", "customer retention software"],
      "A retention product helps SaaS teams understand cancellations and improve renewals.",
      "renewal problems",
    );
    expect(evidence.score).toBeGreaterThanOrEqual(48);
    expect(
      matchingListeningPhrases(
        {
          title: "How can we stop subscribers leaving?",
          body: "We need advice because renewals keep falling every month.",
        },
        ["reduce customer churn"],
      ),
    ).toEqual([]);
  });

  it("does not call generic consumer comparisons a founder discovery phrase match", () => {
    expect(
      matchingListeningPhrases(
        {
          title: "Arabic clones vs Perfume Parlour",
          body: "I researched three products and want an alternative. Has anyone compared them?",
        },
        [
          "reddit research takes too long",
          "hacker news search alternatives",
          "manual versus automated lead research",
        ],
      ),
    ).toEqual([]);
  });
});
