import {
  matchingProductKeywords,
  type DiscoveredPostInput,
  type PlatformCode,
  type ScanRunStatus,
} from "@mentionish/types";
import type { PlatformAdapter } from "./adapters/types.js";

export interface ProductTarget {
  id: string;
  keywords: string[];
}

export interface DiscoveryRepository {
  claimScanRun(
    platform: PlatformCode,
    scheduleBucket: string,
    workerId: string,
  ): Promise<string | null>;
  loadActiveProducts(): Promise<ProductTarget[]>;
  persistMatches(
    post: DiscoveredPostInput,
    productIds: string[],
  ): Promise<void>;
  purgePosts(platform: PlatformCode, externalIds: string[]): Promise<number>;
  finishScanRun(
    scanRunId: string,
    status: Extract<ScanRunStatus, "succeeded" | "failed" | "dead">,
    queryCount: number,
    itemCount: number,
    errorSummary: string | null,
  ): Promise<void>;
}

export interface RedditRevalidator {
  revalidate(externalIds: readonly string[]): Promise<Set<string>>;
}

export interface RedditRevalidationRepository {
  loadRedditPostIdsForRevalidation(limit: number): Promise<string[]>;
  reconcileRedditPosts(
    requestedExternalIds: string[],
    liveExternalIds: string[],
  ): Promise<{ checkedCount: number; deletedCount: number }>;
}

export interface RunPlatformFetchInput {
  adapter: PlatformAdapter;
  repository: DiscoveryRepository;
  scheduleBucket: string;
  workerId: string;
}

export async function runPlatformFetch({
  adapter,
  repository,
  scheduleBucket,
  workerId,
}: RunPlatformFetchInput): Promise<
  | { status: "duplicate" }
  | {
      status: "succeeded";
      queryCount: number;
      itemCount: number;
      deletedCount: number;
    }
> {
  const scanRunId = await repository.claimScanRun(
    adapter.platform,
    scheduleBucket,
    workerId,
  );
  if (!scanRunId) return { status: "duplicate" };

  let queryCount = 0;
  let itemCount = 0;
  try {
    const products = await repository.loadActiveProducts();
    const keywords = [
      ...new Set(products.flatMap((product) => product.keywords)),
    ];
    const result = await adapter.fetch(keywords);
    const deletedExternalIds = result.deletedExternalIds ?? [];
    queryCount = result.queryCount;
    itemCount = result.posts.length + deletedExternalIds.length;
    const deletedCount =
      deletedExternalIds.length > 0
        ? await repository.purgePosts(adapter.platform, deletedExternalIds)
        : 0;

    for (const post of result.posts) {
      const productIds = products.flatMap((product) =>
        matchingProductKeywords(post, product.keywords).length > 0
          ? [product.id]
          : [],
      );
      if (productIds.length > 0) {
        await repository.persistMatches(post, productIds);
      }
    }

    await repository.finishScanRun(
      scanRunId,
      "succeeded",
      queryCount,
      itemCount,
      null,
    );
    return {
      status: "succeeded",
      queryCount,
      itemCount,
      deletedCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.finishScanRun(
      scanRunId,
      "failed",
      queryCount,
      itemCount,
      message.slice(0, 2000),
    );
    throw error;
  }
}

export async function runRedditContentRevalidation(
  adapter: RedditRevalidator,
  repository: RedditRevalidationRepository,
  batchSize: number,
): Promise<{
  requestedCount: number;
  liveCount: number;
  deletedCount: number;
}> {
  const requestedIds = await repository.loadRedditPostIdsForRevalidation(
    Math.max(1, Math.min(100, batchSize)),
  );
  if (requestedIds.length === 0) {
    return { requestedCount: 0, liveCount: 0, deletedCount: 0 };
  }

  const liveIds = await adapter.revalidate(requestedIds);
  const result = await repository.reconcileRedditPosts(requestedIds, [
    ...liveIds,
  ]);
  return {
    requestedCount: requestedIds.length,
    liveCount: result.checkedCount,
    deletedCount: result.deletedCount,
  };
}
