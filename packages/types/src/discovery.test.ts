import { describe, expect, it } from "vitest";
import { matchingProductKeywords } from "./index.js";

describe("matchingProductKeywords", () => {
  it("matches normalized phrases in title and body deterministically", () => {
    expect(
      matchingProductKeywords(
        {
          title: "How do I REDUCE churn?",
          body: "We need a better customer   feedback loop.",
        },
        [" reduce   churn ", "Customer Feedback", "missing", "REDUCE CHURN"],
      ),
    ).toEqual(["reduce churn", "customer feedback"]);
  });

  it("requires Unicode word boundaries", () => {
    expect(
      matchingProductKeywords(
        { title: "Painting workflows", body: "A cataloguing tool" },
        ["AI", "catalog"],
      ),
    ).toEqual([]);
  });

  it("matches punctuation-delimited phrases and Unicode-normalized text", () => {
    expect(
      matchingProductKeywords(
        {
          title: "Need: caf" + String.fromCodePoint(0xe9) + " analytics",
          body: "Any recommendations?",
        },
        ["cafe" + String.fromCodePoint(0x301) + " analytics"],
      ),
    ).toEqual(["caf" + String.fromCodePoint(0xe9) + " analytics"]);
  });
});
