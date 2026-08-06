import { createServiceDatabase } from "@mentionish/database";
import type {
  DiscoveredPostInput,
  PlatformCode,
  ScanRunStatus,
} from "@mentionish/types";
import type {
  DiscoveryRepository,
  ProductTarget,
  RedditRevalidationRepository,
} from "./discovery.js";

type ServiceDatabase = ReturnType<typeof createServiceDatabase>;

interface ProductRow {
  id: unknown;
  keywords: unknown;
}

interface ExternalIdRow {
  external_id: unknown;
}

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

function requireNoError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function persistedOpportunityIds(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid discovery persistence result.");
  }
  const opportunityIds = (value as Record<string, unknown>).opportunity_ids;
  if (
    !Array.isArray(opportunityIds) ||
    !opportunityIds.every((id) => typeof id === "string")
  ) {
    throw new Error("Invalid persisted opportunity IDs.");
  }
  return opportunityIds;
}

export class SupabaseDiscoveryRepository
  implements DiscoveryRepository, RedditRevalidationRepository
{
  private readonly database: ServiceDatabase;

  constructor(url: string, serviceRoleKey: string) {
    this.database = createServiceDatabase(url, serviceRoleKey);
  }

  async claimScanRun(
    platform: PlatformCode,
    scheduleBucket: string,
    workerId: string,
  ): Promise<string | null> {
    const result = (await this.database.rpc("claim_scan_run", {
      p_platform: platform,
      p_schedule_bucket: scheduleBucket,
      p_worker_id: workerId,
    })) as RpcResult;
    requireNoError(result.error);
    return typeof result.data === "string" ? result.data : null;
  }

  async loadActiveProducts(): Promise<ProductTarget[]> {
    const { data, error } = await this.database
      .from("products")
      .select("id, keywords")
      .eq("is_active", true)
      .is("deleted_at", null);
    requireNoError(error);

    return ((data ?? []) as ProductRow[]).flatMap((row) => {
      if (
        typeof row.id !== "string" ||
        !Array.isArray(row.keywords) ||
        !row.keywords.every((keyword: unknown) => typeof keyword === "string")
      ) {
        return [];
      }
      return [{ id: row.id, keywords: row.keywords }];
    });
  }

  async persistMatches(
    post: DiscoveredPostInput,
    productIds: string[],
  ): Promise<string[]> {
    const result = (await this.database.rpc("persist_scanned_post_matches", {
      p_platform: post.platform,
      p_external_id: post.external_id,
      p_subreddit: post.subreddit ?? null,
      p_title: post.title,
      p_body: post.body,
      p_author: post.author ?? null,
      p_url: post.url,
      p_source_created_at: post.source_created_at ?? null,
      p_source_updated_at: post.source_updated_at ?? null,
      p_raw_metadata: post.raw_metadata,
      p_product_ids: productIds,
    })) as RpcResult;
    requireNoError(result.error);
    return persistedOpportunityIds(result.data);
  }

  async purgePosts(
    platform: PlatformCode,
    externalIds: string[],
  ): Promise<number> {
    const result = (await this.database.rpc("purge_scanned_posts", {
      p_platform: platform,
      p_external_ids: externalIds,
    })) as RpcResult;
    requireNoError(result.error);
    return nonNegativeInteger(result.data);
  }

  async loadRedditPostIdsForRevalidation(limit: number): Promise<string[]> {
    const { data, error } = await this.database
      .from("scanned_posts")
      .select("external_id")
      .eq("platform", "reddit")
      .order("source_checked_at", { ascending: true })
      .limit(Math.max(1, Math.min(100, limit)));
    requireNoError(error);
    return ((data ?? []) as ExternalIdRow[]).flatMap((row) =>
      typeof row.external_id === "string" ? [row.external_id] : [],
    );
  }

  async reconcileRedditPosts(
    requestedExternalIds: string[],
    liveExternalIds: string[],
  ): Promise<{ checkedCount: number; deletedCount: number }> {
    const result = (await this.database.rpc("reconcile_reddit_posts", {
      p_requested_external_ids: requestedExternalIds,
      p_live_external_ids: liveExternalIds,
    })) as RpcResult;
    requireNoError(result.error);
    if (
      typeof result.data !== "object" ||
      result.data === null ||
      Array.isArray(result.data)
    ) {
      throw new Error("Invalid Reddit revalidation result.");
    }
    const record = result.data as Record<string, unknown>;
    return {
      checkedCount: nonNegativeInteger(record.checked_count),
      deletedCount: nonNegativeInteger(record.deleted_count),
    };
  }

  async finishScanRun(
    scanRunId: string,
    status: Extract<ScanRunStatus, "succeeded" | "failed" | "dead">,
    queryCount: number,
    itemCount: number,
    errorSummary: string | null,
  ): Promise<void> {
    const result = (await this.database.rpc("finish_scan_run", {
      p_scan_run_id: scanRunId,
      p_status: status,
      p_query_count: queryCount,
      p_item_count: itemCount,
      p_error_summary: errorSummary,
    })) as RpcResult;
    requireNoError(result.error);
    if (result.data !== true) {
      throw new Error("The scan run was not in a running state.");
    }
  }
}
