import { describe, expect, it, vi } from "vitest";
import hackerNewsItems from "./fixtures/hackernews-items.json";
import redditListing from "./fixtures/reddit-listing.json";
import { HackerNewsAdapter, normalizeHackerNewsItem } from "./hackernews.js";
import { normalizeRedditPost, RedditAdapter } from "./reddit.js";

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
}

describe("Hacker News adapter", () => {
  it("normalizes fixture stories and ignores deleted items", () => {
    expect(normalizeHackerNewsItem(hackerNewsItems[0])).toMatchObject({
      platform: "hackernews",
      external_id: "42001",
      title: "Ask HN: Better social listening for founders?",
      body: "I need a mention tracker & response workflow.",
    });
    expect(normalizeHackerNewsItem(hackerNewsItems[1])).toBeNull();
  });

  it("deduplicates feed ids and reports source-deleted items", async () => {
    const fetchFn = vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("newstories.json")) {
        return Promise.resolve(Response.json([42001]));
      }
      if (url.endsWith("askstories.json")) {
        return Promise.resolve(Response.json([42001, 42002]));
      }
      const id = url.includes("42001") ? 0 : 1;
      return Promise.resolve(Response.json(hackerNewsItems[id]));
    });
    const result = await new HackerNewsAdapter(fetchFn, 10).fetch();

    expect(result.queryCount).toBe(4);
    expect(result.posts).toHaveLength(1);
    expect(result.deletedExternalIds).toEqual(["42002"]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});

describe("Reddit adapter", () => {
  const children = redditListing.data.children;

  it("normalizes fixture posts and ignores removed content", () => {
    expect(normalizeRedditPost(children[0]?.data)).toMatchObject({
      platform: "reddit",
      external_id: "abc123",
      subreddit: "saas",
      title: "Looking for a mention tracker",
    });
    expect(normalizeRedditPost(children[1]?.data)).toBeNull();
  });

  it("uses application-only OAuth, a query budget, and rate telemetry", async () => {
    const rateObserver = vi.fn();
    const fetchFn = vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.includes("access_token")) {
        return Promise.resolve(
          Response.json({
            access_token: "fixture-token",
            expires_in: 3600,
          }),
        );
      }
      return Promise.resolve(
        Response.json(redditListing, {
          headers: {
            "x-ratelimit-used": "1",
            "x-ratelimit-remaining": "99",
            "x-ratelimit-reset": "60",
          },
        }),
      );
    });
    const adapter = new RedditAdapter(
      {
        clientId: "fixture-id",
        clientSecret: "fixture-secret",
        userAgent: "web:mentionish:test (by /u/test)",
      },
      fetchFn,
      {
        maxQueriesPerScan: 1,
        rotationSeed: () => 0,
        onRateLimit: rateObserver,
      },
    );
    const result = await adapter.fetch(["mention tracker", "social listening"]);

    expect(result.queryCount).toBe(1);
    expect(result.posts).toHaveLength(1);
    expect(result.deletedExternalIds).toEqual(["removed1"]);
    expect(rateObserver).toHaveBeenCalledWith({
      used: 1,
      remaining: 99,
      resetSeconds: 60,
      retryAfterSeconds: null,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("shares a short-lived search cache across retry executions", async () => {
    const values = new Map<string, unknown>();
    const cache = {
      get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
      set: vi.fn((key: string, value: unknown) => {
        values.set(key, value);
        return Promise.resolve();
      }),
    };
    const fetchFn = vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      return Promise.resolve(
        url.includes("access_token")
          ? Response.json({ access_token: "fixture-token", expires_in: 3600 })
          : Response.json(redditListing),
      );
    });
    const adapter = new RedditAdapter(
      {
        clientId: "fixture-id",
        clientSecret: "fixture-secret",
        userAgent: "web:mentionish:test (by /u/test)",
      },
      fetchFn,
      { cache },
    );

    await expect(adapter.fetch(["mention tracker"])).resolves.toMatchObject({
      queryCount: 1,
    });
    await expect(adapter.fetch(["mention tracker"])).resolves.toMatchObject({
      queryCount: 0,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(cache.set).toHaveBeenCalledOnce();
  });
  it("revalidates stored post ids through the read-only info endpoint", async () => {
    const fetchFn = vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.includes("access_token")) {
        return Promise.resolve(
          Response.json({ access_token: "fixture-token", expires_in: 3600 }),
        );
      }
      expect(url).toContain("/api/info");
      expect(url).toContain("t3_abc123");
      return Promise.resolve(Response.json(redditListing));
    });
    const adapter = new RedditAdapter(
      {
        clientId: "fixture-id",
        clientSecret: "fixture-secret",
        userAgent: "web:mentionish:test (by /u/test)",
      },
      fetchFn,
    );

    await expect(adapter.revalidate(["abc123", "removed1"])).resolves.toEqual(
      new Set(["abc123"]),
    );
  });
});
