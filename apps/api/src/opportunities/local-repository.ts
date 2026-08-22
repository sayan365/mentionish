import type {
  LocalDiscoveryRepository,
  LocalProductRepository,
} from "@mentionish/database";
import {
  opportunityFeedbackSchema,
  opportunityFeedPageSchema,
} from "@mentionish/types";
import { randomUUID } from "node:crypto";
import { localOwnerId } from "../middleware/auth.js";
import type { OpportunityRepositoryFactory } from "./repository.js";

interface FeedRow {
  id: string;
  product_id: string;
  scanned_post_id: string;
  intent_score: number | null;
  qualification_label: "worth_helping" | "potential_buyer";
  audience_fit: number | null;
  problem_fit: number | null;
  solution_seeking: number | null;
  buying_intent: number | null;
  reply_appropriateness: number | null;
  reasoning: string | null;
  status: "unclassified" | "new" | "drafted" | "posted" | "skipped";
  classified_at: string | null;
  posted_at: string | null;
  skipped_reason: string | null;
  created_at: string;
  updated_at: string;
  platform: "reddit" | "hackernews";
  external_id: string;
  subreddit: string | null;
  title: string;
  body: string;
  author: string | null;
  url: string;
  source_created_at: string | null;
  scanned_at: string;
  source_checked_at: string;
  source_updated_at: string | null;
  feedback_id: string | null;
  feedback_verdict: "useful" | "not_relevant" | null;
  feedback_reason: string | null;
  feedback_note: string | null;
  feedback_created_at: string | null;
}
function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  if (!Number.isInteger(value) || value < 0) throw new Error("INVALID_CURSOR");
  return value;
}
export function createLocalOpportunityRepositoryFactory(
  products: LocalProductRepository,
  discovery?: LocalDiscoveryRepository,
): OpportunityRepositoryFactory {
  return () => ({
    list(_userId, productId, query) {
      if (!products.get(productId)) return Promise.resolve(null);
      if (!discovery) return Promise.resolve({ items: [], next_cursor: null });
      const offset = decodeCursor(query.cursor);
      const db = discovery.databaseHandle();
      const statusMarks = query.status.map(() => "?").join(",");
      const platformClause = query.platform ? " AND p.platform = ?" : "";
      const parameters: unknown[] = [
        productId,
        ...query.status,
        query.min_score,
      ];
      if (query.platform) parameters.push(query.platform);
      parameters.push(query.limit + 1, offset);
      const rows = db
        .prepare(
          `WITH ranked AS (
             SELECT o.*,p.platform,p.external_id,p.subreddit,p.title,p.body,
                    p.author,p.url,p.source_created_at,p.scanned_at,
                    p.source_checked_at,p.source_updated_at,
                    feedback.id AS feedback_id,
                    feedback.verdict AS feedback_verdict,
                    feedback.reason AS feedback_reason,
                    feedback.note AS feedback_note,
                    feedback.created_at AS feedback_created_at,
                    ROW_NUMBER() OVER (
                      PARTITION BY CASE
                        WHEN length(trim(coalesce(p.author,''))) > 0
                         AND length(trim(p.title)) >= 20
                        THEN lower(trim(p.author)) || '|' || lower(trim(p.title))
                        ELSE 'source:' || p.platform || ':' || p.external_id
                      END
                      ORDER BY o.intent_score DESC,o.created_at ASC
                    ) AS dedup_rank
               FROM opportunities o
               JOIN scanned_posts p ON p.id=o.scanned_post_id
               LEFT JOIN conversation_feedback feedback ON feedback.id=(
                 SELECT latest.id FROM conversation_feedback latest
                  WHERE latest.opportunity_id=o.id
                  ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1
               )
              WHERE o.product_id=? AND o.status IN (${statusMarks})
                AND o.intent_score>=?${platformClause}
           )
           SELECT * FROM ranked WHERE dedup_rank=1
           ORDER BY intent_score DESC,created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(...parameters) as FeedRow[];
      const page = rows.slice(0, query.limit);
      return Promise.resolve(
        opportunityFeedPageSchema.parse({
          items: page.map((row) => ({
            id: row.id,
            user_id: localOwnerId,
            product_id: row.product_id,
            scanned_post_id: row.scanned_post_id,
            intent_score: row.intent_score,
            qualification_label: row.qualification_label,
            audience_fit: row.audience_fit,
            problem_fit: row.problem_fit,
            solution_seeking: row.solution_seeking,
            buying_intent: row.buying_intent,
            reply_appropriateness: row.reply_appropriateness,
            reasoning: row.reasoning,
            status: row.status,
            classified_at: row.classified_at,
            posted_at: row.posted_at,
            skipped_reason: row.skipped_reason,
            created_at: row.created_at,
            updated_at: row.updated_at,
            post: {
              id: row.scanned_post_id,
              platform: row.platform,
              external_id: row.external_id,
              subreddit: row.subreddit,
              title: row.title,
              body: row.body,
              author: row.author,
              url: row.url,
              source_created_at: row.source_created_at,
              scanned_at: row.scanned_at,
              source_checked_at: row.source_checked_at,
              source_updated_at: row.source_updated_at,
            },
            draft: null,
            feedback:
              row.feedback_id &&
              row.feedback_verdict &&
              row.feedback_reason &&
              row.feedback_created_at
                ? {
                    id: row.feedback_id,
                    opportunity_id: row.id,
                    verdict: row.feedback_verdict,
                    reason: row.feedback_reason,
                    note: row.feedback_note,
                    created_at: row.feedback_created_at,
                  }
                : null,
          })),
          next_cursor:
            rows.length > query.limit
              ? Buffer.from(String(offset + query.limit)).toString("base64url")
              : null,
        }),
      );
    },
    skip(_userId, opportunityId, reason) {
      if (!discovery) return Promise.resolve(false);
      const now = new Date().toISOString();
      return Promise.resolve(
        discovery
          .databaseHandle()
          .prepare(
            "UPDATE opportunities SET status='skipped',skipped_reason=?,updated_at=? WHERE id=?",
          )
          .run(reason, now, opportunityId).changes === 1,
      );
    },
    markPosted(_userId, opportunityId, postedAt) {
      if (!discovery) return Promise.resolve(false);
      const now = new Date().toISOString();
      return Promise.resolve(
        discovery
          .databaseHandle()
          .prepare(
            "UPDATE opportunities SET status='posted',posted_at=?,updated_at=? WHERE id=?",
          )
          .run(postedAt ?? now, now, opportunityId).changes === 1,
      );
    },
    recordFeedback(_userId, opportunityId, input) {
      if (!discovery) return Promise.resolve(null);
      const database = discovery.databaseHandle();
      const saved = database
        .transaction(() => {
          const opportunity = database
            .prepare(
              "SELECT id,product_id,status,skipped_reason FROM opportunities WHERE id=?",
            )
            .get(opportunityId) as
            | {
                id: string;
                product_id: string;
                status: string;
                skipped_reason: string | null;
              }
            | undefined;
          if (!opportunity) return null;
          const id = randomUUID();
          const now = new Date().toISOString();
          database
            .prepare(
              `INSERT INTO conversation_feedback(
                 id,opportunity_id,product_id,verdict,reason,note,created_at
               ) VALUES (?,?,?,?,?,?,?)`,
            )
            .run(
              id,
              opportunityId,
              opportunity.product_id,
              input.verdict,
              input.reason,
              input.note?.trim() || null,
              now,
            );
          if (input.verdict === "not_relevant") {
            database
              .prepare(
                `UPDATE opportunities
                    SET status='skipped',skipped_reason=?,updated_at=?
                  WHERE id=?`,
              )
              .run(`Feedback: ${input.reason}`, now, opportunityId);
          } else if (
            opportunity.status === "skipped" &&
            opportunity.skipped_reason?.startsWith("Feedback:")
          ) {
            database
              .prepare(
                `UPDATE opportunities
                    SET status='new',skipped_reason=NULL,updated_at=?
                  WHERE id=?`,
              )
              .run(now, opportunityId);
          }
          return opportunityFeedbackSchema.parse({
            id,
            opportunity_id: opportunityId,
            ...input,
            note: input.note?.trim() || null,
            created_at: now,
          });
        })
        .immediate();
      return Promise.resolve(saved);
    },
    requestDraft() {
      return Promise.resolve({ status: "not_found" });
    },
    cancelDraft() {
      return Promise.resolve(false);
    },
    getOperation() {
      return Promise.resolve(null);
    },
    updateDraft() {
      return Promise.resolve({ status: "not_found" });
    },
  });
}
