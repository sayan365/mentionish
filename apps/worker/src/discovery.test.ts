import type {
  DiscoveredPostInput,
  PlatformCode,
  ScanRunStatus,
} from "@mentionish/types";
import { describe, expect, it, vi } from "vitest";
import type { PlatformAdapter } from "./adapters/types.js";
import {
  runPlatformFetch,
  runRedditContentRevalidation,
  type DiscoveryRepository,
  type ProductTarget,
  type RedditRevalidationRepository,
} from "./discovery.js";

const post: DiscoveredPostInput = {
  platform: "hackernews",
  external_id: "42",
  title: "Need a Mention Tracker",
  body: "Any recommendations?",
  author: "alice",
  url: "https://news.ycombinator.com/item?id=42",
  source_created_at: "2026-08-03T00:00:00.000Z",
  source_updated_at: null,
  raw_metadata: {},
};

class FakeRepository
  implements DiscoveryRepository, RedditRevalidationRepository
{
  products: ProductTarget[] = [
    { id: "product-match", keywords: ["mention tracker"] },
    { id: "product-miss", keywords: ["unrelated"] },
  ];
  persisted: Array<{ post: DiscoveredPostInput; productIds: string[] }> = [];
  purged: Array<{ platform: PlatformCode; externalIds: string[] }> = [];
  finished: Array<{
    status: string;
    queryCount: number;
    itemCount: number;
    errorSummary: string | null;
  }> = [];
  revalidationIds = ["live", "deleted"];

  constructor(private readonly claim: string | null = "scan-run") {}

  claimScanRun(): Promise<string | null> {
    return Promise.resolve(this.claim);
  }

  loadActiveProducts(): Promise<ProductTarget[]> {
    return Promise.resolve(this.products);
  }

  persistMatches(
    persistedPost: DiscoveredPostInput,
    productIds: string[],
  ): Promise<string[]> {
    this.persisted.push({ post: persistedPost, productIds });
    return Promise.resolve(["00000000-0000-4000-8000-000000000001"]);
  }

  purgePosts(platform: PlatformCode, externalIds: string[]): Promise<number> {
    this.purged.push({ platform, externalIds });
    return Promise.resolve(externalIds.length);
  }

  loadRedditPostIdsForRevalidation(): Promise<string[]> {
    return Promise.resolve(this.revalidationIds);
  }

  reconcileRedditPosts(
    requestedExternalIds: string[],
    liveExternalIds: string[],
  ): Promise<{ checkedCount: number; deletedCount: number }> {
    return Promise.resolve({
      checkedCount: liveExternalIds.length,
      deletedCount: requestedExternalIds.length - liveExternalIds.length,
    });
  }

  finishScanRun(
    _scanRunId: string,
    status: Extract<ScanRunStatus, "succeeded" | "failed" | "dead">,
    queryCount: number,
    itemCount: number,
    errorSummary: string | null,
  ): Promise<void> {
    this.finished.push({ status, queryCount, itemCount, errorSummary });
    return Promise.resolve();
  }
}

const adapter: PlatformAdapter = {
  platform: "hackernews",
  fetch: vi.fn(() =>
    Promise.resolve({
      posts: [post],
      queryCount: 3,
      deletedExternalIds: ["41"],
    }),
  ),
};

describe("runPlatformFetch", () => {
  it("claims, purges source deletions, matches, persists, and finishes", async () => {
    const repository = new FakeRepository();
    const onOpportunitiesPersisted = vi.fn(() => Promise.resolve());

    await expect(
      runPlatformFetch({
        adapter,
        repository,
        scheduleBucket: "2026-08-03T00:00:00.000Z",
        workerId: "test-worker",
        onOpportunitiesPersisted,
      }),
    ).resolves.toEqual({
      status: "succeeded",
      queryCount: 3,
      itemCount: 2,
      deletedCount: 1,
    });
    expect(repository.purged).toEqual([
      { platform: "hackernews", externalIds: ["41"] },
    ]);
    expect(repository.persisted).toEqual([
      { post, productIds: ["product-match"] },
    ]);
    expect(onOpportunitiesPersisted).toHaveBeenCalledWith([
      "00000000-0000-4000-8000-000000000001",
    ]);
    expect(repository.finished).toEqual([
      {
        status: "succeeded",
        queryCount: 3,
        itemCount: 2,
        errorSummary: null,
      },
    ]);
  });

  it("does no work when the schedule bucket was already claimed", async () => {
    const repository = new FakeRepository(null);

    await expect(
      runPlatformFetch({
        adapter,
        repository,
        scheduleBucket: "2026-08-03T00:00:00.000Z",
        workerId: "test-worker",
      }),
    ).resolves.toEqual({ status: "duplicate" });
    expect(repository.persisted).toHaveLength(0);
  });
});

describe("runRedditContentRevalidation", () => {
  it("purges posts missing from the authenticated revalidation response", async () => {
    const repository = new FakeRepository();
    const revalidator = {
      revalidate: vi.fn(() => Promise.resolve(new Set(["live"]))),
    };

    await expect(
      runRedditContentRevalidation(revalidator, repository, 100),
    ).resolves.toEqual({
      requestedCount: 2,
      liveCount: 1,
      deletedCount: 1,
    });
    expect(revalidator.revalidate).toHaveBeenCalledWith(["live", "deleted"]);
  });
});
