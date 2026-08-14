import type {
  LocalDiscoveryRepository,
  LocalProductRepository,
} from "@mentionish/database";
import { analyticsSummarySchema } from "@mentionish/types";
import type { WorkspaceRepositoryFactory } from "./repository.js";

interface LocalAnalyticsRow {
  found: number;
  qualified: number;
  drafted: number;
  posted: number;
  skipped: number;
  reddit: number;
  hackernews: number;
}

export function createLocalWorkspaceRepositoryFactory(
  products: LocalProductRepository,
  discovery: LocalDiscoveryRepository,
): WorkspaceRepositoryFactory {
  return () => ({
    usage() {
      const activeProducts = products.list().length;
      return Promise.resolve({
        plan: "free",
        entitlement_status: "active",
        period: {
          starts_at: "1970-01-01T00:00:00.000Z",
          ends_at: null,
        },
        classification: {
          used: 0,
          reserved: 0,
          limit: 0,
          remaining: 0,
          resets_at: null,
        },
        draft: {
          used: 0,
          reserved: 0,
          limit: 0,
          remaining: 0,
          resets_at: null,
        },
        products: { active: activeProducts, limit: 2_147_483_647 },
      });
    },
    analytics(_userId, productId, windowDays) {
      if (productId && !products.get(productId)) return Promise.resolve(null);
      const cutoff = new Date(
        Date.now() - windowDays * 24 * 60 * 60 * 1_000,
      ).toISOString();
      const row = discovery
        .databaseHandle()
        .prepare(
          `SELECT
             count(*) FILTER (WHERE o.created_at >= ?) AS found,
             count(*) FILTER (WHERE o.classified_at >= ?) AS qualified,
             count(*) FILTER (
               WHERE o.status = 'drafted' AND o.updated_at >= ?
             ) AS drafted,
             count(*) FILTER (WHERE o.posted_at >= ?) AS posted,
             count(*) FILTER (
               WHERE o.status = 'skipped' AND o.updated_at >= ?
                 AND o.skipped_reason = 'Not relevant right now.'
             ) AS skipped,
             count(*) FILTER (
               WHERE o.classified_at >= ? AND p.platform = 'reddit'
             ) AS reddit,
             count(*) FILTER (
               WHERE o.classified_at >= ? AND p.platform = 'hackernews'
             ) AS hackernews
           FROM opportunities o
           JOIN scanned_posts p ON p.id = o.scanned_post_id
          WHERE (? IS NULL OR o.product_id = ?)`,
        )
        .get(
          cutoff,
          cutoff,
          cutoff,
          cutoff,
          cutoff,
          cutoff,
          cutoff,
          productId ?? null,
          productId ?? null,
        ) as LocalAnalyticsRow;
      const draftToPostPercent =
        row.drafted === 0
          ? 0
          : Math.round((row.posted / row.drafted) * 1_000) / 10;
      return Promise.resolve(
        analyticsSummarySchema.parse({
          window_days: windowDays,
          product_id: productId ?? null,
          found: row.found,
          qualified: row.qualified,
          drafted: row.drafted,
          posted: row.posted,
          skipped: row.skipped,
          draft_to_post_percent: draftToPostPercent,
          platforms: {
            reddit: row.reddit,
            hackernews: row.hackernews,
          },
        }),
      );
    },
  });
}
