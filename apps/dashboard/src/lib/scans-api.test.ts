import { afterEach, describe, expect, it, vi } from "vitest";
import { listScanCandidates } from "./scans-api";

afterEach(() => vi.unstubAllGlobals());

describe("scan candidate audit API", () => {
  it("loads the retained decisions for one scan", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        Response.json({
          data: [
            {
              id: "candidate-1",
              scan_id: "scan-1",
              product_id: "product-1",
              platform: "reddit",
              external_id: "post-1",
              item_type: "story",
              subreddit: "SaaS",
              title: "Need customer discovery advice",
              body: "How do I find customers?",
              author: "founder",
              url: "https://reddit.com/example",
              source_created_at: null,
              matched_phrases: ["customer discovery"],
              intent_score: 42,
              qualification_label: "rejected",
              audience_fit: 55,
              problem_fit: 50,
              solution_seeking: 35,
              buying_intent: 20,
              reply_appropriateness: 55,
              reasoning: "Relevant pain but no tool intent.",
              decision: "rejected",
              created_at: "2026-08-07T00:00:00.000Z",
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listScanCandidates("token", "scan-1")).resolves.toHaveLength(
      1,
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "http://localhost:4000/api/scans/scan-1/candidates?limit=500",
    );
    expect(init?.headers).toMatchObject({
      authorization: "Bearer token",
    });
  });
});
