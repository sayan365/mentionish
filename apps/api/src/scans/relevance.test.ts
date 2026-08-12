import { describe, expect, it } from "vitest";
import { matchingListeningPhrases, planSearchQueries } from "./relevance.js";
describe("manual scan relevance", () => {
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

  it("prefers distinctive intent terms over words repeated across phrases", () => {
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
      "churn software",
      "interview scheduling",
      "onboarding failures",
    ]);
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
});
