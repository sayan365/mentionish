import {
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
} from "@mentionish/database";
import { afterEach, describe, expect, it } from "vitest";
import {
  conversationDedupKey,
  classificationConversationContext,
  isUnavailableSourceItem,
  LocalScanEngine,
  qualificationDecision,
} from "./engine.js";
import {
  RedditAuthenticationError,
  RedditRateLimitError,
  type RedditAccountSnapshot,
  type RedditSource,
} from "./reddit-opencli.js";

const qualifyingClassifier = {
  classify: () =>
    Promise.resolve({
      audienceFit: 85,
      problemFit: 90,
      solutionSeeking: 85,
      buyingIntent: 75,
      replyAppropriateness: 90,
      seeksProductCategory: true,
      reasoning:
        "The author is actively asking for a directly relevant solution.",
    }),
};
const databases: ReturnType<typeof openLocalDatabase>[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
async function terminal(repository: LocalDiscoveryRepository, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const scan = repository.getScan(id)!;
    if (["succeeded", "failed", "cancelled"].includes(scan.status)) return scan;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("scan did not complete");
}
describe("qualification decision", () => {
  it("separates helpful conversations from potential buyers", () => {
    expect(
      qualificationDecision({
        audienceFit: 85,
        problemFit: 85,
        solutionSeeking: 75,
        buyingIntent: 35,
        replyAppropriateness: 90,
      }).label,
    ).toBe("worth_helping");
    expect(
      qualificationDecision({
        audienceFit: 85,
        problemFit: 85,
        solutionSeeking: 75,
        buyingIntent: 75,
        replyAppropriateness: 90,
        seeksProductCategory: true,
      }).label,
    ).toBe("potential_buyer");
  });

  it("rejects weak problem fit even when replying would be appropriate", () => {
    expect(
      qualificationDecision({
        audienceFit: 80,
        problemFit: 35,
        solutionSeeking: 70,
        buyingIntent: 65,
        replyAppropriateness: 90,
      }).label,
    ).toBe("rejected");
  });
  it("separates adjacent possible matches from unrelated and competing posts", () => {
    const strongScores = {
      audienceFit: 95,
      problemFit: 95,
      solutionSeeking: 90,
      buyingIntent: 85,
      replyAppropriateness: 95,
    };
    expect(
      qualificationDecision({
        ...strongScores,
        hasDirectProductNeed: false,
      }).label,
    ).toBe("worth_helping");
    expect(
      qualificationDecision({
        ...strongScores,
        hasDirectProductNeed: true,
        seeksProductCategory: false,
      }).label,
    ).toBe("worth_helping");
    expect(
      qualificationDecision({
        ...strongScores,
        hasDirectProductNeed: true,
        seeksProductCategory: false,
      }).label,
    ).toBe("worth_helping");
    expect(
      qualificationDecision({
        ...strongScores,
        problemFit: 18,
        hasDirectProductNeed: false,
      }).label,
    ).toBe("rejected");
    expect(
      qualificationDecision({
        ...strongScores,
        promotesCompetingSolution: true,
      }).label,
    ).toBe("rejected");
    expect(
      qualificationDecision({
        ...strongScores,
        needScope: "adjacent",
        authorState: "asking",
        marketResearchValue: 70,
      }).tier,
    ).toBe("helpful_conversation");
    expect(
      qualificationDecision({
        ...strongScores,
        needScope: "core",
        authorState: "promoting",
        marketResearchValue: 92,
        promotesCompetingSolution: true,
      }).tier,
    ).toBe("market_signal");
    expect(
      qualificationDecision({
        ...strongScores,
        authorState: "promoting",
        marketResearchValue: 42,
        promotesCompetingSolution: true,
      }).tier,
    ).toBe("irrelevant");
  });
});

describe("unavailable source content", () => {
  const base = {
    platform: "hackernews" as const,
    externalId: "42",
    threadExternalId: "42",
    parentExternalId: null,
    itemType: "story" as const,
    title: "Useful title",
    body: "Useful body",
    author: "founder",
    community: "hackernews",
    url: "https://news.ycombinator.com/item?id=42",
    publishedAt: new Date().toISOString(),
    score: 1,
    commentCount: 0,
    metadata: {},
  };

  it("removes dead, deleted, and removed source items before AI review", () => {
    expect(isUnavailableSourceItem({ ...base, title: "[dead]" })).toBe(true);
    expect(isUnavailableSourceItem({ ...base, body: "[deleted]" })).toBe(true);
    expect(isUnavailableSourceItem({ ...base, title: "[removed]" })).toBe(true);
    expect(isUnavailableSourceItem(base)).toBe(false);
  });
});

describe("classification conversation context", () => {
  it("adds bounded parent-thread context to comments without changing stored comment text", () => {
    const item = {
      platform: "reddit" as const,
      externalId: "comment-1",
      threadExternalId: "post-1",
      parentExternalId: "post-1",
      itemType: "comment" as const,
      title: "How do founders find early customers?",
      body: "I have tried cold email, but it is not working.",
      author: "founder",
      url: "https://reddit.com/comments/post-1",
      sourceCreatedAt: null,
      metadata: {
        thread_title: "How do founders find early customers?",
        thread_body:
          "I launched a SaaS and need practical distribution advice.",
      },
    };
    const context = classificationConversationContext(item);
    expect(context.title).toBe("How do founders find early customers?");
    expect(context.body).toContain("Comment:\nI have tried cold email");
    expect(context.body).toContain("Thread context:");
    expect(context.body).toContain("I launched a SaaS");
    expect(item.body).toBe("I have tried cold email, but it is not working.");
  });
});

describe("conversation deduplication", () => {
  it("gives cross-posts from the same author and title one identity", () => {
    const base = {
      platform: "reddit" as const,
      itemType: "story" as const,
      title: "How can I find my first customers without paid ads?",
      body: "I am looking for practical customer discovery help.",
      author: "founder",
      url: "https://www.reddit.com/",
    };
    const first = conversationDedupKey({
      ...base,
      externalId: "post-a",
      subreddit: "saas",
    });
    const second = conversationDedupKey({
      ...base,
      externalId: "post-b",
      subreddit: "startups",
    });
    expect(first).toBe(second);
  });
});

describe("local Hacker News scan engine", () => {
  it("uses different AI search hypotheses on consecutive scans and records the plan", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Discovery",
      description: "Find people asking for customer research help.",
      phrases: [{ phrase: "customer research", kind: "problem" }],
    });
    const observed: string[] = [];
    const fetcher: typeof fetch = (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      observed.push(url.searchParams.get("query") ?? "");
      return Promise.resolve(Response.json({ hits: [] }));
    };
    let planningRound = 0;
    const classifier = {
      ...qualifyingClassifier,
      planQueries: () => {
        planningRound += 1;
        return Promise.resolve(
          Array.from({ length: 16 }, (_, index) => ({
            query: `round ${planningRound} hypothesis ${index + 1}`,
            kind: "pain",
            rationale: "Distinct adaptive exploration.",
          })),
        );
      },
    };
    const discovery = new LocalDiscoveryRepository(database);
    const engine = new LocalScanEngine(
      products,
      discovery,
      fetcher,
      undefined,
      false,
      classifier,
    );
    const first = await terminal(discovery, engine.start(product.id).scanId);
    const firstQueries = new Set(observed.splice(0));
    const second = await terminal(discovery, engine.start(product.id).scanId);
    const secondQueries = new Set(observed);
    expect(first).toMatchObject({
      queries_total: 24,
      queries_completed: 24,
      queries_explored: 12,
    });
    expect(second.plan_summary).toContain("new hypotheses");
    expect([...secondQueries].some((query) => !firstQueries.has(query))).toBe(
      true,
    );
    expect(
      discovery.recentQueryMemory(product.id, "hackernews").length,
    ).toBeGreaterThan(12);
  });

  it("searches stories and comments, matches phrases, and deduplicates repeat scans", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Retention",
      description: "Reduce customer churn",
      phrases: [
        { phrase: "customer churn", kind: "problem" },
        { phrase: "job listing", kind: "exclusion" },
      ],
    });
    const fetcher: typeof fetch = (input) => {
      const url =
        input instanceof URL
          ? input
          : new URL(typeof input === "string" ? input : input.url);
      const comment = url.searchParams.get("tags") === "comment";
      return Promise.resolve(
        new Response(
          JSON.stringify({
            hits: [
              comment
                ? {
                    objectID: "102",
                    _tags: ["comment"],
                    story_id: 100,
                    parent_id: 101,
                    story_title: "SaaS question",
                    comment_text: "How do you reduce customer churn?",
                    author: "alice",
                    created_at: "2026-08-07T10:00:00.000Z",
                  }
                : {
                    objectID: "100",
                    _tags: ["story"],
                    title: "Customer churn help",
                    story_text: "Looking for retention software",
                    author: "bob",
                    created_at: "2026-08-07T09:00:00.000Z",
                  },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const discovery = new LocalDiscoveryRepository(database);
    const engine = new LocalScanEngine(
      products,
      discovery,
      fetcher,
      undefined,
      false,
      qualifyingClassifier,
    );
    const first = await terminal(discovery, engine.start(product.id).scanId);
    expect(first).toMatchObject({
      status: "succeeded",
      queries_completed: 2,
      items_fetched: 2,
      reddit_items_fetched: 0,
      hackernews_items_fetched: 2,
      candidates_matched: 2,
      candidates_rejected: 0,
      candidates_qualified: 2,
      reddit_candidates_matched: 0,
      reddit_candidates_rejected: 0,
      reddit_candidates_qualified: 0,
      hackernews_candidates_matched: 2,
      hackernews_candidates_rejected: 0,
      hackernews_candidates_qualified: 2,
      opportunities_found: 2,
    });
    expect(discovery.listCandidateAudits(first.id)).toHaveLength(2);
    expect(discovery.listCandidateAudits(first.id)[0]).toMatchObject({
      decision: "qualified",
      intent_score: 85,
      qualification_label: "potential_buyer",
      buying_intent: 75,
      platform: "hackernews",
    });
    expect(
      database.prepare("SELECT count(*) AS count FROM scanned_posts").get(),
    ).toEqual({ count: 2 });
    expect(
      database.prepare("SELECT count(*) AS count FROM opportunities").get(),
    ).toEqual({ count: 2 });
    const second = await terminal(discovery, engine.start(product.id).scanId);
    expect(second.opportunities_found).toBe(0);
    expect(
      database.prepare("SELECT count(*) AS count FROM opportunities").get(),
    ).toEqual({ count: 2 });
  });

  it("ingests Reddit posts and comments through a pinned read-only source", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Sales",
      description: "Find SaaS sales help",
      phrases: [{ phrase: "saas sales", kind: "problem" }],
    });
    let plannedReddit:
      { queries: readonly string[]; options?: { days?: 30 | 90 } } | undefined;
    const reddit: RedditSource = {
      verify: () =>
        Promise.resolve({
          username: "u/dedicated",
          totalKarma: 10,
          accountCreated: "2026-01-01",
          verifiedEmail: true,
        }),
      fetch: (queries, _signal, _onProgress, options) => {
        plannedReddit = { queries, ...(options ? { options } : {}) };
        return Promise.resolve({
          commands: 2,
          items: [
            {
              platform: "reddit",
              externalId: "post1",
              itemType: "story",
              subreddit: "saas",
              title: "Need SaaS sales help",
              body: "How should I start?",
              author: "founder",
              url: "https://www.reddit.com/r/saas/comments/post1/test/",
              sourceCreatedAt: "2026-08-07T10:00:00.000Z",
            },
            {
              platform: "reddit",
              externalId: "comment1",
              itemType: "comment",
              subreddit: "saas",
              title: "",
              body: "Our SaaS sales process is broken",
              author: "buyer",
              url: "https://www.reddit.com/r/saas/comments/post1/test/",
              sourceCreatedAt: null,
            },
          ],
        });
      },
    };
    const discovery = new LocalDiscoveryRepository(database);
    discovery.saveRedditVerification(null, { username: "u/dedicated" });
    const emptyHn: typeof fetch = () =>
      Promise.resolve(Response.json({ hits: [] }));
    const engine = new LocalScanEngine(
      products,
      discovery,
      emptyHn,
      reddit,
      true,
      qualifyingClassifier,
    );
    const scan = await terminal(discovery, engine.start(product.id).scanId);
    expect(scan).toMatchObject({
      status: "succeeded",
      error_message: null,
      reddit_items_fetched: 2,
      hackernews_items_fetched: 0,
      candidates_matched: 2,
      candidates_rejected: 0,
      candidates_qualified: 2,
      reddit_candidates_matched: 2,
      reddit_candidates_rejected: 0,
      reddit_candidates_qualified: 2,
      hackernews_candidates_matched: 0,
      hackernews_candidates_rejected: 0,
      hackernews_candidates_qualified: 0,
      opportunities_found: 2,
    });
    expect(plannedReddit).toMatchObject({
      queries: ["saas sales"],
      options: { days: 30 },
    });
    expect(
      database
        .prepare(
          "SELECT platform, count(*) AS count FROM scanned_posts GROUP BY platform",
        )
        .all(),
    ).toEqual([{ platform: "reddit", count: 2 }]);
  });

  it("persists the Reddit kill switch on authentication failure while HN finishes", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Product",
      description: "Description",
      phrases: [{ phrase: "customer problem", kind: "problem" }],
    });
    const reddit: RedditSource = {
      verify: () => Promise.reject(new RedditAuthenticationError("Logged out")),
      fetch: () =>
        Promise.reject(
          new RedditAuthenticationError(
            "The selected Reddit profile is logged out.",
          ),
        ),
    };
    const discovery = new LocalDiscoveryRepository(database);
    discovery.saveRedditVerification(null, { username: "u/dedicated" });
    const emptyHn: typeof fetch = () =>
      Promise.resolve(Response.json({ hits: [] }));
    const engine = new LocalScanEngine(
      products,
      discovery,
      emptyHn,
      reddit,
      true,
      qualifyingClassifier,
    );
    const scan = await terminal(discovery, engine.start(product.id).scanId);
    expect(scan).toMatchObject({
      status: "succeeded",
      error_code: "REDDIT_PAUSED",
    });
    expect(discovery.isRedditHalted()).toBe(true);
    expect(discovery.redditSafetySnapshot(true)).toMatchObject({
      state: "blocked",
      read_allowed: false,
    });
  });

  it("pauses Reddit for a reported cooldown and refuses an early retest", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    const reddit: RedditSource = {
      verify: () =>
        Promise.reject(
          new RedditRateLimitError(
            "Reddit requested a cooldown.",
            "rate_limit",
            60,
          ),
        ),
      fetch: () => Promise.resolve({ commands: 0, items: [] }),
    };
    const engine = new LocalScanEngine(
      products,
      discovery,
      fetch,
      reddit,
      true,
      qualifyingClassifier,
    );

    await expect(
      engine.verifyRedditProfile("dedicated-reddit"),
    ).rejects.toThrow("Reddit requested a cooldown.");
    const configuration = engine.redditConfiguration() as {
      kill_switch: boolean;
      safety: { state: string; read_allowed: boolean; cooldown_until: unknown };
    };
    expect(configuration).toMatchObject({
      kill_switch: true,
      safety: {
        state: "paused",
        read_allowed: false,
      },
    });
    expect(typeof configuration.safety.cooldown_until).toBe("string");
    await expect(
      engine.verifyRedditProfile("dedicated-reddit"),
    ).rejects.toThrow("REDDIT_COOLDOWN_ACTIVE");
  });

  it("allows only one Reddit browser command at a time", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    let finish: ((account: RedditAccountSnapshot) => void) | undefined;
    const reddit: RedditSource = {
      verify: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      fetch: () => Promise.resolve({ commands: 0, items: [] }),
    };
    const engine = new LocalScanEngine(
      products,
      discovery,
      fetch,
      reddit,
      true,
      qualifyingClassifier,
    );

    const first = engine.verifyRedditProfile("dedicated-reddit");
    await expect(
      engine.verifyRedditProfile("dedicated-reddit"),
    ).rejects.toThrow("REDDIT_SESSION_BUSY");
    finish?.({
      username: "u/founder",
      totalKarma: 50,
      accountCreated: "2025-01-01T00:00:00.000Z",
      verifiedEmail: true,
    });
    await expect(first).resolves.toMatchObject({ username: "u/founder" });
  });

  it("aborts an in-flight Reddit command when the manual kill switch is used", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    const reddit: RedditSource = {
      verify: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Reddit read aborted.")),
            { once: true },
          );
        }),
      fetch: () => Promise.resolve({ commands: 0, items: [] }),
    };
    const engine = new LocalScanEngine(
      products,
      discovery,
      fetch,
      reddit,
      true,
      qualifyingClassifier,
    );

    const verification = engine.verifyRedditProfile("dedicated-reddit");
    expect(engine.pauseReddit()).toMatchObject({
      kill_switch: true,
      safety: { state: "paused", read_allowed: false },
    });
    await expect(verification).rejects.toThrow("Reddit read aborted.");
    expect(discovery.redditSafetySnapshot(true).state).toBe("paused");
  });
  it("requires AI configuration and rejects candidates below the qualification threshold", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Retention",
      description: "Reduce customer churn",
      phrases: [{ phrase: "customer churn", kind: "problem" }],
    });
    const discovery = new LocalDiscoveryRepository(database);
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          hits: [
            {
              objectID: "weak-1",
              _tags: ["story"],
              title: "How do I reduce customer churn?",
              story_text:
                "I am researching general benchmarks, not looking for a product.",
            },
          ],
        }),
      );
    expect(() =>
      new LocalScanEngine(products, discovery, fetcher).start(product.id),
    ).toThrow("AI_CLASSIFICATION_NOT_CONFIGURED");
    const classifier = {
      classify: () =>
        Promise.resolve({
          audienceFit: 35,
          problemFit: 35,
          solutionSeeking: 20,
          buyingIntent: 10,
          replyAppropriateness: 40,
          reasoning:
            "Informational content without current solution-seeking intent.",
        }),
    };
    const engine = new LocalScanEngine(
      products,
      discovery,
      fetcher,
      undefined,
      false,
      classifier,
    );
    const scan = await terminal(discovery, engine.start(product.id).scanId);
    expect(scan).toMatchObject({
      status: "succeeded",
      items_fetched: 2,
      reddit_items_fetched: 0,
      hackernews_items_fetched: 2,
      candidates_matched: 1,
      candidates_rejected: 1,
      candidates_qualified: 0,
      reddit_candidates_matched: 0,
      reddit_candidates_rejected: 0,
      reddit_candidates_qualified: 0,
      hackernews_candidates_matched: 1,
      hackernews_candidates_rejected: 1,
      hackernews_candidates_qualified: 0,
      opportunities_found: 0,
    });
    expect(discovery.listCandidateAudits(scan.id)).toEqual([
      expect.objectContaining({
        decision: "rejected",
        intent_score: 26,
        qualification_label: "rejected",
        buying_intent: 10,
        platform: "hackernews",
        matched_phrases: ["customer churn"],
      }),
    ]);
    expect(
      database.prepare("SELECT count(*) AS count FROM opportunities").get(),
    ).toEqual({ count: 0 });
  });
});
