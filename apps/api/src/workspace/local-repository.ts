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
  feedback_reviewed: number;
  feedback_useful: number;
  feedback_not_relevant: number;
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
                 AND (
                   o.skipped_reason = 'Not relevant right now.'
                   OR o.skipped_reason LIKE 'Feedback:%'
                 )
             ) AS skipped,
             count(*) FILTER (
               WHERE o.classified_at >= ? AND p.platform = 'reddit'
             ) AS reddit,
             count(*) FILTER (
               WHERE o.classified_at >= ? AND p.platform = 'hackernews'
             ) AS hackernews,
             count(*) FILTER (WHERE feedback.created_at >= ?) AS feedback_reviewed,
             count(*) FILTER (
               WHERE feedback.created_at >= ? AND feedback.verdict = 'useful'
             ) AS feedback_useful,
             count(*) FILTER (
               WHERE feedback.created_at >= ? AND feedback.verdict = 'not_relevant'
             ) AS feedback_not_relevant
           FROM opportunities o
           JOIN scanned_posts p ON p.id = o.scanned_post_id
           LEFT JOIN conversation_feedback feedback ON feedback.id=(
             SELECT latest.id FROM conversation_feedback latest
              WHERE latest.opportunity_id=o.id
              ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1
           )
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
          cutoff,
          cutoff,
          cutoff,
          productId ?? null,
          productId ?? null,
        ) as LocalAnalyticsRow;
      const topNegativeReason = discovery
        .databaseHandle()
        .prepare(
          `SELECT feedback.reason,count(*) AS total
             FROM opportunities opportunity
             JOIN conversation_feedback feedback ON feedback.id=(
               SELECT latest.id FROM conversation_feedback latest
                WHERE latest.opportunity_id=opportunity.id
                ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1
             )
            WHERE feedback.created_at >= ?
              AND feedback.verdict='not_relevant'
              AND (? IS NULL OR opportunity.product_id = ?)
            GROUP BY feedback.reason
            ORDER BY total DESC,feedback.reason ASC
            LIMIT 1`,
        )
        .get(cutoff, productId ?? null, productId ?? null) as
        { reason: string; total: number } | undefined;
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
          feedback: {
            reviewed: row.feedback_reviewed,
            useful: row.feedback_useful,
            not_relevant: row.feedback_not_relevant,
            useful_percent:
              row.feedback_reviewed === 0
                ? 0
                : Math.round(
                    (row.feedback_useful / row.feedback_reviewed) * 1_000,
                  ) / 10,
            top_negative_reason: topNegativeReason?.reason ?? null,
          },
        }),
      );
    },
  });
}
