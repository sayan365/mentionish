import type {
  LocalDiscoveryRepository,
  LocalProductRepository,
} from "@mentionish/database";
import {
  draftOperationSchema,
  opportunityFeedbackSchema,
  opportunityFeedItemSchema,
  opportunityFeedPageSchema,
  replyPreflightSchema,
  updateDraftTextSchema,
  type ReplyPreflight,
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
  draft_id: string | null;
  draft_generation_number: number | null;
  draft_generated_text: string | null;
  draft_edited_text: string | null;
  draft_prompt_version: string | null;
  draft_is_current: number | null;
  draft_version: number | null;
  draft_created_at: string | null;
  draft_updated_at: string | null;
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

interface PreflightOpportunityRow {
  id: string;
  platform: "reddit" | "hackernews";
  subreddit: string | null;
  url: string;
}

interface PreflightReviewRow {
  reviewed_at: string;
  expires_at: string;
  native_eligibility: "allowed" | "blocked";
  promotion_policy: "allowed" | "restricted" | "unknown";
  ai_content_policy: "allowed" | "restricted" | "unknown";
}

export function createLocalOpportunityRepositoryFactory(
  products: LocalProductRepository,
  discovery?: LocalDiscoveryRepository,
): OpportunityRepositoryFactory {
  const getReplyPreflight = (opportunityId: string): ReplyPreflight | null => {
    if (!discovery) return null;
    const database = discovery.databaseHandle();
    const opportunity = database
      .prepare(
        `SELECT opportunity.id,post.platform,post.subreddit,post.url
           FROM opportunities opportunity
           JOIN scanned_posts post ON post.id=opportunity.scanned_post_id
          WHERE opportunity.id=?`,
      )
      .get(opportunityId) as PreflightOpportunityRow | undefined;
    if (!opportunity) return null;
    const community =
      opportunity.subreddit?.trim().replace(/^r\//i, "") || null;
    const rulesUrl =
      opportunity.platform === "reddit" && community
        ? `https://www.reddit.com/r/${encodeURIComponent(community)}/about/rules/`
        : null;
    const account = discovery.redditVerifiedAccount();
    const accountContext =
      opportunity.platform === "reddit"
        ? {
            username:
              typeof account?.username === "string"
                ? account.username.replace(/^u\//i, "")
                : null,
            total_karma:
              typeof account?.totalKarma === "number"
                ? account.totalKarma
                : null,
            account_created_at:
              typeof account?.accountCreated === "string"
                ? account.accountCreated
                : null,
            verified_email:
              typeof account?.verifiedEmail === "boolean"
                ? account.verifiedEmail
                : null,
          }
        : null;
    if (opportunity.platform !== "reddit")
      return replyPreflightSchema.parse({
        opportunity_id: opportunity.id,
        platform: opportunity.platform,
        community,
        state: "not_required",
        insertion_allowed: true,
        reason: "Hacker News does not use the Reddit community-rule preflight.",
        source_url: opportunity.url,
        rules_url: null,
        review: null,
        account_context: null,
      });

    const review = database
      .prepare(
        `SELECT review.created_at AS reviewed_at,snapshot.expires_at,
                review.native_eligibility,snapshot.promotion_policy,
                snapshot.ai_content_policy
           FROM reply_preflight_reviews review
           JOIN community_rule_snapshots snapshot
             ON snapshot.id=review.community_rule_snapshot_id
          WHERE review.opportunity_id=?
          ORDER BY review.created_at DESC,review.rowid DESC LIMIT 1`,
      )
      .get(opportunityId) as PreflightReviewRow | undefined;

    let state: "review_required" | "caution" | "blocked" = "review_required";
    let insertionAllowed = false;
    let reason =
      "Open the current thread and community rules, then record one native eligibility review before inserting or manually posting a reply. Local draft generation remains available.";
    if (!community) {
      reason =
        "The Reddit community is unavailable, so Mentionish cannot link the current rules. Review the source natively; reply insertion remains blocked.";
    } else if (review && Date.parse(review.expires_at) <= Date.now()) {
      reason =
        "The saved native review is older than 24 hours. Recheck the current thread, community rules, and reply eligibility.";
    } else if (review?.native_eligibility === "blocked") {
      state = "blocked";
      reason =
        "Reddit did not make the native reply action available. Mentionish will not insert a reply for this conversation.";
    } else if (
      review?.promotion_policy === "restricted" ||
      review?.ai_content_policy === "restricted"
    ) {
      state = "blocked";
      reason =
        "Your native rule review found a promotion or AI-content restriction. Mentionish will not insert a reply for this conversation.";
    } else if (review?.native_eligibility === "allowed") {
      state = "caution";
      insertionAllowed = true;
      reason =
        review.promotion_policy === "unknown" ||
        review.ai_content_policy === "unknown"
          ? "Native review is current, but at least one policy was not explicit. Keep the reply useful, disclose material relationships, and avoid unnecessary links."
          : "Native review is current. This remains an accepted-risk manual reply; Mentionish never submits it.";
    }

    return replyPreflightSchema.parse({
      opportunity_id: opportunity.id,
      platform: opportunity.platform,
      community,
      state,
      insertion_allowed: insertionAllowed,
      reason,
      source_url: opportunity.url,
      rules_url: rulesUrl,
      review: review
        ? {
            reviewed_at: review.reviewed_at,
            expires_at: review.expires_at,
            native_eligibility: review.native_eligibility,
            promotion_policy: review.promotion_policy,
            ai_content_policy: review.ai_content_policy,
          }
        : null,
      account_context: accountContext,
    });
  };

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
                    draft.id AS draft_id,
                    draft.generation_number AS draft_generation_number,
                    draft.generated_text AS draft_generated_text,
                    draft.edited_text AS draft_edited_text,
                    draft.prompt_version AS draft_prompt_version,
                    draft.is_current AS draft_is_current,
                    draft.version AS draft_version,
                    draft.created_at AS draft_created_at,
                    draft.updated_at AS draft_updated_at,
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
               LEFT JOIN drafts draft
                 ON draft.opportunity_id=o.id AND draft.is_current=1
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
            draft:
              row.draft_id &&
              row.draft_generation_number &&
              row.draft_generated_text !== null &&
              row.draft_edited_text !== null &&
              row.draft_prompt_version &&
              row.draft_version &&
              row.draft_created_at &&
              row.draft_updated_at
                ? {
                    id: row.draft_id,
                    opportunity_id: row.id,
                    generation_number: row.draft_generation_number,
                    generated_text: row.draft_generated_text,
                    edited_text: row.draft_edited_text,
                    prompt_version: row.draft_prompt_version,
                    is_current: row.draft_is_current === 1,
                    version: row.draft_version,
                    created_at: row.draft_created_at,
                    updated_at: row.draft_updated_at,
                  }
                : null,
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
    getReplyPreflight(_userId, opportunityId) {
      return Promise.resolve(getReplyPreflight(opportunityId));
    },
    recordReplyPreflightReview(_userId, opportunityId, input) {
      if (!discovery) return Promise.resolve(null);
      const database = discovery.databaseHandle();
      const opportunity = database
        .prepare(
          `SELECT opportunity.id,post.platform,post.subreddit,post.url
             FROM opportunities opportunity
             JOIN scanned_posts post ON post.id=opportunity.scanned_post_id
            WHERE opportunity.id=?`,
        )
        .get(opportunityId) as PreflightOpportunityRow | undefined;
      const community = opportunity?.subreddit?.trim().replace(/^r\//i, "");
      if (!opportunity || opportunity.platform !== "reddit" || !community)
        return Promise.resolve(null);
      const now = new Date();
      const snapshotId = randomUUID();
      const reviewId = randomUUID();
      const rulesUrl = `https://www.reddit.com/r/${encodeURIComponent(community)}/about/rules/`;
      database
        .transaction(() => {
          database
            .prepare(
              `INSERT INTO community_rule_snapshots(
                 id,platform,community,rules_url,review_method,
                 promotion_policy,ai_content_policy,reviewed_at,expires_at
               ) VALUES (?,'reddit',?,?,'user_native_review',?,?,?,?)`,
            )
            .run(
              snapshotId,
              community,
              rulesUrl,
              input.promotion_policy,
              input.ai_content_policy,
              now.toISOString(),
              new Date(now.getTime() + 86_400_000).toISOString(),
            );
          database
            .prepare(
              `INSERT INTO reply_preflight_reviews(
                 id,opportunity_id,community_rule_snapshot_id,thread_reviewed,
                 native_eligibility,unnecessary_links_removed,
                 disclosure_acknowledged,manual_submit_acknowledged,created_at
               ) VALUES (?,?,?,1,?,1,1,1,?)`,
            )
            .run(
              reviewId,
              opportunityId,
              snapshotId,
              input.native_eligibility,
              now.toISOString(),
            );
        })
        .immediate();
      return Promise.resolve(getReplyPreflight(opportunityId));
    },
    requestDraft(
      _userId,
      opportunityId,
      promptVersion,
      requestKey,
      regenerate,
    ) {
      if (!discovery) return Promise.resolve({ status: "not_found" });
      const database = discovery.databaseHandle();
      const result = database
        .transaction(() => {
          const opportunity = database
            .prepare(
              `SELECT id,status FROM opportunities
                WHERE id=? AND status IN ('new','drafted')`,
            )
            .get(opportunityId) as { id: string; status: string } | undefined;
          if (!opportunity) return { status: "not_found" as const };

          const existingRequest = database
            .prepare(
              `SELECT id,status,result_draft_id FROM draft_operations
                WHERE request_key=?`,
            )
            .get(requestKey) as
            | {
                id: string;
                status: "queued" | "running" | "succeeded" | "failed";
                result_draft_id: string | null;
              }
            | undefined;
          if (existingRequest) {
            if (
              existingRequest.status === "succeeded" &&
              existingRequest.result_draft_id
            )
              return {
                status: "already_completed" as const,
                draftId: existingRequest.result_draft_id,
              };
            if (
              existingRequest.status === "queued" ||
              existingRequest.status === "running"
            )
              return {
                status: existingRequest.status,
                operationId: existingRequest.id,
              };
          }

          const active = database
            .prepare(
              `SELECT id,status FROM draft_operations
                WHERE opportunity_id=? AND status IN ('queued','running')
                ORDER BY created_at DESC LIMIT 1`,
            )
            .get(opportunityId) as
            { id: string; status: "queued" | "running" } | undefined;
          if (active) return { status: active.status, operationId: active.id };

          if (!regenerate) {
            const current = database
              .prepare(
                `SELECT id FROM drafts
                  WHERE opportunity_id=? AND is_current=1`,
              )
              .get(opportunityId) as { id: string } | undefined;
            if (current)
              return {
                status: "already_completed" as const,
                draftId: current.id,
              };
          }

          const operationId = randomUUID();
          database
            .prepare(
              `INSERT INTO draft_operations(
                 id,opportunity_id,status,request_key,regenerate,
                 prompt_version,created_at
               ) VALUES (?,?,'queued',?,?,?,?)`,
            )
            .run(
              operationId,
              opportunityId,
              requestKey,
              regenerate ? 1 : 0,
              promptVersion,
              new Date().toISOString(),
            );
          return { status: "queued" as const, operationId };
        })
        .immediate();
      return Promise.resolve(result);
    },
    cancelDraft(_userId, operationId) {
      if (!discovery) return Promise.resolve(false);
      return Promise.resolve(
        discovery
          .databaseHandle()
          .prepare(
            `UPDATE draft_operations
                SET status='failed',error_code='QUEUE_UNAVAILABLE',completed_at=?
              WHERE id=? AND status IN ('queued','running')`,
          )
          .run(new Date().toISOString(), operationId).changes === 1,
      );
    },
    getOperation(_userId, operationId) {
      if (!discovery) return Promise.resolve(null);
      const row = discovery
        .databaseHandle()
        .prepare(
          `SELECT id,status,result_draft_id,error_code,created_at,completed_at
             FROM draft_operations WHERE id=?`,
        )
        .get(operationId);
      return Promise.resolve(row ? draftOperationSchema.parse(row) : null);
    },
    updateDraft(_userId, draftId, editedText, expectedVersion) {
      if (!discovery) return Promise.resolve({ status: "not_found" });
      const input = updateDraftTextSchema.parse({
        edited_text: editedText,
        expected_version: expectedVersion,
      });
      const database = discovery.databaseHandle();
      const result = database
        .transaction(() => {
          const draft = database
            .prepare(
              `SELECT id,opportunity_id,generation_number,generated_text,
                      edited_text,prompt_version,is_current,version,
                      created_at,updated_at
                 FROM drafts WHERE id=? AND is_current=1`,
            )
            .get(draftId) as Record<string, unknown> | undefined;
          if (!draft) return { status: "not_found" as const };
          if (draft.version !== input.expected_version)
            return { status: "conflict" as const };
          const nextVersion = input.expected_version + 1;
          const now = new Date().toISOString();
          const changed = database
            .prepare(
              `UPDATE drafts SET edited_text=?,version=?,updated_at=?
                WHERE id=? AND is_current=1 AND version=?`,
            )
            .run(
              input.edited_text,
              nextVersion,
              now,
              draftId,
              input.expected_version,
            ).changes;
          if (changed !== 1) return { status: "conflict" as const };
          database
            .prepare(
              `INSERT INTO draft_versions(id,draft_id,version,text,source,created_at)
               VALUES (?,?,?,?,'edited',?)`,
            )
            .run(randomUUID(), draftId, nextVersion, input.edited_text, now);
          return {
            status: "updated" as const,
            draft: opportunityFeedItemSchema.shape.draft.unwrap().parse({
              ...draft,
              is_current: draft.is_current === 1,
              edited_text: input.edited_text,
              version: nextVersion,
              updated_at: now,
            }),
          };
        })
        .immediate();
      return Promise.resolve(result);
    },
  });
}
