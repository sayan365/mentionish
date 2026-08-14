import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type LocalScanStatus =
  "pending" | "running" | "cancelling" | "cancelled" | "succeeded" | "failed";
export interface LocalScanRun {
  id: string;
  scope: "all" | "product";
  status: LocalScanStatus;
  product_ids: string[];
  platform: "hackernews";
  queries_total: number;
  queries_completed: number;
  items_fetched: number;
  reddit_items_fetched: number;
  hackernews_items_fetched: number;
  candidates_matched: number;
  candidates_rejected: number;
  candidates_qualified: number;
  candidates_direct: number;
  candidates_helpful: number;
  candidates_market_signals: number;
  reddit_candidates_matched: number;
  reddit_candidates_rejected: number;
  reddit_candidates_qualified: number;
  hackernews_candidates_matched: number;
  hackernews_candidates_rejected: number;
  hackernews_candidates_qualified: number;
  opportunities_found: number;
  queries_explored: number;
  queries_reused: number;
  plan_summary: string;
  current_message: string;
  error_code: string | null;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}
export interface LocalScannedItem {
  platform: "hackernews" | "reddit";
  externalId: string;
  itemType: "story" | "comment";
  subreddit?: string | null;
  parentExternalId?: string | null;
  threadExternalId?: string | null;
  title: string;
  body: string;
  author?: string | null;
  url: string;
  sourceCreatedAt?: string | null;
  metadata?: Record<string, unknown>;
}
export type LocalCandidateDecision = "rejected" | "qualified";
export type LocalQualificationLabel =
  "rejected" | "worth_helping" | "potential_buyer";
export type LocalDiscoveryTier =
  | "direct_opportunity"
  | "helpful_conversation"
  | "market_signal"
  | "irrelevant";
export interface LocalCandidateAudit {
  id: string;
  scan_id: string;
  product_id: string;
  platform: "hackernews" | "reddit";
  external_id: string;
  item_type: "story" | "comment";
  subreddit: string | null;
  title: string;
  body: string;
  author: string | null;
  url: string;
  source_created_at: string | null;
  matched_phrases: string[];
  source_query: string | null;
  intent_score: number;
  discovery_tier: LocalDiscoveryTier;
  need_scope: "core" | "adjacent" | "unrelated";
  author_state: "asking" | "comparing" | "sharing" | "promoting";
  market_research_value: number;
  qualification_label: LocalQualificationLabel;
  audience_fit: number | null;
  problem_fit: number | null;
  solution_seeking: number | null;
  buying_intent: number | null;
  reply_appropriateness: number | null;
  reasoning: string;
  decision: LocalCandidateDecision;
  created_at: string;
}
export type LocalDiscoveryQueryStrategy =
  "explore" | "proven" | "rotate" | "fallback";
export interface LocalDiscoveryQueryMemory {
  query: string;
  normalizedQuery: string;
  timesUsed: number;
  itemsFetched: number;
  candidatesReviewed: number;
  candidatesQualified: number;
  lastUsedAt: string;
}
interface ScanRow {
  id: string;
  scope: "all" | "product";
  status: LocalScanStatus;
  product_ids_json: string;
  platform: "hackernews";
  queries_total: number;
  queries_completed: number;
  items_fetched: number;
  reddit_items_fetched: number;
  hackernews_items_fetched: number;
  candidates_matched: number;
  candidates_rejected: number;
  candidates_qualified: number;
  candidates_direct: number;
  candidates_helpful: number;
  candidates_market_signals: number;
  reddit_candidates_matched: number;
  reddit_candidates_rejected: number;
  reddit_candidates_qualified: number;
  hackernews_candidates_matched: number;
  hackernews_candidates_rejected: number;
  hackernews_candidates_qualified: number;
  opportunities_found: number;
  queries_explored: number;
  queries_reused: number;
  plan_summary: string;
  current_message: string;
  error_code: string | null;
  error_message: string | null;
  cancel_requested: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}
function mapScan(row: ScanRow): LocalScanRun {
  const { product_ids_json: ignored, cancel_requested, ...rest } = row;
  void ignored;
  return {
    ...rest,
    product_ids: JSON.parse(row.product_ids_json) as string[],
    cancel_requested: cancel_requested === 1,
  };
}
export class LocalDiscoveryRepository {
  constructor(private readonly database: Database.Database) {}
  recoverInterrupted(): void {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `UPDATE scan_runs SET status='failed', error_code='APP_RESTARTED', error_message='The application stopped before this scan completed.', completed_at=?, updated_at=? WHERE status IN ('pending','running','cancelling')`,
      )
      .run(now, now);
  }
  createScan(
    scope: "all" | "product",
    productIds: string[],
    queriesTotal: number,
  ): LocalScanRun {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO scan_runs(id,scope,status,product_ids_json,queries_total,created_at,updated_at) VALUES (?,?,'pending',?,?,?,?)`,
      )
      .run(id, scope, JSON.stringify(productIds), queriesTotal, now, now);
    return this.getScan(id)!;
  }
  getScan(id: string): LocalScanRun | null {
    const row = this.database
      .prepare("SELECT * FROM scan_runs WHERE id=?")
      .get(id) as ScanRow | undefined;
    return row ? mapScan(row) : null;
  }
  listScans(limit = 20): LocalScanRun[] {
    return (
      this.database
        .prepare("SELECT * FROM scan_runs ORDER BY created_at DESC LIMIT ?")
        .all(limit) as ScanRow[]
    ).map(mapScan);
  }
  activeScan(): LocalScanRun | null {
    const row = this.database
      .prepare(
        "SELECT * FROM scan_runs WHERE status IN ('pending','running','cancelling') ORDER BY created_at DESC LIMIT 1",
      )
      .get() as ScanRow | undefined;
    return row ? mapScan(row) : null;
  }
  updateScan(
    id: string,
    changes: Partial<
      Pick<
        LocalScanRun,
        | "status"
        | "queries_completed"
        | "items_fetched"
        | "reddit_items_fetched"
        | "hackernews_items_fetched"
        | "candidates_matched"
        | "candidates_rejected"
        | "candidates_qualified"
        | "candidates_direct"
        | "candidates_helpful"
        | "candidates_market_signals"
        | "reddit_candidates_matched"
        | "reddit_candidates_rejected"
        | "reddit_candidates_qualified"
        | "hackernews_candidates_matched"
        | "hackernews_candidates_rejected"
        | "hackernews_candidates_qualified"
        | "opportunities_found"
        | "queries_total"
        | "queries_explored"
        | "queries_reused"
        | "plan_summary"
        | "current_message"
        | "error_code"
        | "error_message"
        | "started_at"
        | "completed_at"
      >
    >,
  ): void {
    const entries = Object.entries(changes).filter(
      ([, value]) => value !== undefined,
    );
    if (!entries.length) return;
    const columns = entries.map(([key]) => `${key}=?`).join(",");
    this.database
      .prepare(`UPDATE scan_runs SET ${columns}, updated_at=? WHERE id=?`)
      .run(...entries.map(([, value]) => value), new Date().toISOString(), id);
  }
  recentQueryMemory(
    productId: string,
    platform: "reddit" | "hackernews",
    limit = 80,
  ): LocalDiscoveryQueryMemory[] {
    const rows = this.database
      .prepare(
        `SELECT query,normalized_query,
                count(*) AS times_used,
                sum(items_fetched) AS items_fetched,
                sum(candidates_reviewed) AS candidates_reviewed,
                sum(candidates_qualified) AS candidates_qualified,
                max(executed_at) AS last_used_at
           FROM discovery_query_runs
          WHERE product_id=? AND platform=?
          GROUP BY normalized_query
          ORDER BY last_used_at DESC
          LIMIT ?`,
      )
      .all(productId, platform, Math.max(1, Math.min(250, limit))) as Array<{
      query: string;
      normalized_query: string;
      times_used: number;
      items_fetched: number;
      candidates_reviewed: number;
      candidates_qualified: number;
      last_used_at: string;
    }>;
    return rows.map((row) => ({
      query: row.query,
      normalizedQuery: row.normalized_query,
      timesUsed: row.times_used,
      itemsFetched: row.items_fetched,
      candidatesReviewed: row.candidates_reviewed,
      candidatesQualified: row.candidates_qualified,
      lastUsedAt: row.last_used_at,
    }));
  }
  recordQueryRun(input: {
    scanId: string;
    productId: string;
    platform: "reddit" | "hackernews";
    query: string;
    strategy: LocalDiscoveryQueryStrategy;
    itemsFetched: number;
    candidatesReviewed: number;
    candidatesQualified: number;
  }): void {
    const normalized = input.query
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
    this.database
      .prepare(
        `INSERT INTO discovery_query_runs(
           id,scan_id,product_id,platform,query,normalized_query,strategy,
           items_fetched,candidates_reviewed,candidates_qualified,executed_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        input.scanId,
        input.productId,
        input.platform,
        input.query.trim(),
        normalized,
        input.strategy,
        input.itemsFetched,
        input.candidatesReviewed,
        input.candidatesQualified,
        new Date().toISOString(),
      );
  }
  requestCancel(id: string): boolean {
    return (
      this.database
        .prepare(
          "UPDATE scan_runs SET cancel_requested=1,status='cancelling',updated_at=? WHERE id=? AND status IN ('pending','running')",
        )
        .run(new Date().toISOString(), id).changes === 1
    );
  }
  isCancelRequested(id: string): boolean {
    return this.getScan(id)?.cancel_requested ?? true;
  }
  saveClassification(
    scanId: string,
    productId: string,
    item: LocalScannedItem,
    phrases: string[],
    sourceQuery: string,
    classification: {
      overallScore: number;
      label: LocalQualificationLabel;
      tier: LocalDiscoveryTier;
      audienceFit: number;
      problemFit: number;
      solutionSeeking: number;
      buyingIntent: number;
      replyAppropriateness: number;
      needScope?: "core" | "adjacent" | "unrelated";
      authorState?: "asking" | "comparing" | "sharing" | "promoting";
      marketResearchValue?: number;
      reasoning: string;
    },
    decision: LocalCandidateDecision,
  ): boolean {
    const now = new Date().toISOString();
    return this.database
      .transaction(() => {
        const found = this.database
          .prepare(
            "SELECT id FROM scanned_posts WHERE platform=? AND external_id=?",
          )
          .get(item.platform, item.externalId) as { id: string } | undefined;
        const postId = found?.id ?? randomUUID();
        this.database
          .prepare(
            `INSERT INTO scanned_posts(id,platform,external_id,item_type,parent_external_id,thread_external_id,subreddit,title,body,author,url,source_created_at,scanned_at,source_checked_at,source_updated_at,raw_metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(platform,external_id) DO UPDATE SET title=excluded.title,body=excluded.body,author=excluded.author,url=excluded.url,source_checked_at=excluded.source_checked_at,source_updated_at=excluded.source_updated_at,raw_metadata_json=excluded.raw_metadata_json`,
          )
          .run(
            postId,
            item.platform,
            item.externalId,
            item.itemType,
            item.parentExternalId ?? null,
            item.threadExternalId ?? null,
            item.subreddit ??
              (typeof item.metadata?.subreddit === "string"
                ? item.metadata.subreddit
                : null),
            item.title,
            item.body,
            item.author ?? null,
            item.url,
            item.sourceCreatedAt ?? null,
            now,
            now,
            item.sourceCreatedAt ?? null,
            JSON.stringify(item.metadata ?? {}),
          );
        const score = Math.max(
          0,
          Math.min(100, Math.round(classification.overallScore)),
        );
        const reasoning = classification.reasoning.trim().slice(0, 500);
        this.database
          .prepare(
            `INSERT INTO scan_candidate_evaluations(id,scan_id,product_id,scanned_post_id,matched_phrases_json,source_query,intent_score,qualification_label,discovery_tier,audience_fit,problem_fit,solution_seeking,buying_intent,reply_appropriateness,need_scope,author_state,market_research_value,reasoning,decision,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scan_id,product_id,scanned_post_id) DO UPDATE SET matched_phrases_json=excluded.matched_phrases_json,source_query=excluded.source_query,intent_score=excluded.intent_score,qualification_label=excluded.qualification_label,discovery_tier=excluded.discovery_tier,audience_fit=excluded.audience_fit,problem_fit=excluded.problem_fit,solution_seeking=excluded.solution_seeking,buying_intent=excluded.buying_intent,reply_appropriateness=excluded.reply_appropriateness,need_scope=excluded.need_scope,author_state=excluded.author_state,market_research_value=excluded.market_research_value,reasoning=excluded.reasoning,decision=excluded.decision`,
          )
          .run(
            randomUUID(),
            scanId,
            productId,
            postId,
            JSON.stringify(phrases),
            sourceQuery.trim().slice(0, 100) || null,
            score,
            classification.label,
            classification.tier,
            classification.audienceFit,
            classification.problemFit,
            classification.solutionSeeking,
            classification.buyingIntent,
            classification.replyAppropriateness,
            classification.needScope ?? "unrelated",
            classification.authorState ?? "sharing",
            Math.max(
              0,
              Math.min(
                100,
                Math.round(classification.marketResearchValue ?? 0),
              ),
            ),
            reasoning,
            decision,
            now,
          );
        if (decision === "rejected") {
          const sharedCrossPostIdentity =
            Boolean(item.author?.trim()) && item.title.trim().length >= 20;
          const targetClause = sharedCrossPostIdentity
            ? `scanned_post_id IN (
                 SELECT id FROM scanned_posts
                  WHERE lower(trim(coalesce(author,'')))=lower(trim(?))
                    AND lower(trim(title))=lower(trim(?))
               )`
            : `scanned_post_id=?`;
          this.database
            .prepare(
              `UPDATE opportunities
                  SET status='skipped',
                      skipped_reason='Automatically removed after a stricter qualification review.',
                      updated_at=?
                WHERE product_id=? AND status='new' AND ${targetClause}`,
            )
            .run(
              now,
              productId,
              ...(sharedCrossPostIdentity
                ? [item.author!.trim(), item.title.trim()]
                : [postId]),
            );
          return false;
        }
        const existingOpportunity = this.database
          .prepare(
            "SELECT id,status,skipped_reason FROM opportunities WHERE product_id=? AND scanned_post_id=?",
          )
          .get(productId, postId) as
          | { id: string; status: string; skipped_reason: string | null }
          | undefined;
        if (existingOpportunity) {
          const automaticallySkipped =
            existingOpportunity.status === "skipped" &&
            existingOpportunity.skipped_reason ===
              "Automatically removed after a stricter qualification review.";
          this.database
            .prepare(
              `UPDATE opportunities
                  SET matched_phrases_json=?,intent_score=?,qualification_label=?,discovery_tier=?,
                      audience_fit=?,problem_fit=?,solution_seeking=?,
                      buying_intent=?,reply_appropriateness=?,reasoning=?,
                      status=?,skipped_reason=?,classified_at=?,updated_at=?
                WHERE id=?`,
            )
            .run(
              JSON.stringify(phrases),
              score,
              classification.label,
              classification.tier,
              classification.audienceFit,
              classification.problemFit,
              classification.solutionSeeking,
              classification.buyingIntent,
              classification.replyAppropriateness,
              reasoning,
              automaticallySkipped ? "new" : existingOpportunity.status,
              automaticallySkipped ? null : existingOpportunity.skipped_reason,
              now,
              now,
              existingOpportunity.id,
            );
          return false;
        }
        const inserted = this.database
          .prepare(
            `INSERT OR IGNORE INTO opportunities(id,product_id,scanned_post_id,matched_phrases_json,intent_score,qualification_label,discovery_tier,audience_fit,problem_fit,solution_seeking,buying_intent,reply_appropriateness,reasoning,status,classified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,? ,'new',?,?,?)`,
          )
          .run(
            randomUUID(),
            productId,
            postId,
            JSON.stringify(phrases),
            score,
            classification.label,
            classification.tier,
            classification.audienceFit,
            classification.problemFit,
            classification.solutionSeeking,
            classification.buyingIntent,
            classification.replyAppropriateness,
            reasoning,
            now,
            now,
            now,
          );
        return inserted.changes === 1;
      })
      .immediate();
  }
  listCandidateAudits(scanId: string, limit = 100): LocalCandidateAudit[] {
    const rows = this.database
      .prepare(
        `SELECT evaluation.id,evaluation.scan_id,evaluation.product_id,
                post.platform,post.external_id,post.item_type,post.subreddit,
                post.title,post.body,post.author,post.url,post.source_created_at,
                evaluation.matched_phrases_json,evaluation.source_query,evaluation.intent_score,
                evaluation.qualification_label,evaluation.discovery_tier,evaluation.audience_fit,
                evaluation.problem_fit,evaluation.solution_seeking,
                evaluation.buying_intent,evaluation.reply_appropriateness,
                evaluation.need_scope,evaluation.author_state,evaluation.market_research_value,
                evaluation.reasoning,evaluation.decision,evaluation.created_at
           FROM scan_candidate_evaluations AS evaluation
           JOIN scanned_posts AS post ON post.id=evaluation.scanned_post_id
          WHERE evaluation.scan_id=?
          ORDER BY evaluation.intent_score DESC,evaluation.created_at DESC
          LIMIT ?`,
      )
      .all(scanId, Math.max(1, Math.min(500, limit))) as Array<
      Omit<LocalCandidateAudit, "matched_phrases"> & {
        matched_phrases_json: string;
      }
    >;
    return rows.map(({ matched_phrases_json, ...row }) => ({
      ...row,
      matched_phrases: JSON.parse(matched_phrases_json) as string[],
    }));
  }
  pruneCandidateAudits(keepRecentScans = 10): void {
    const keep = Math.max(1, Math.min(50, keepRecentScans));
    this.database
      .transaction(() => {
        this.database
          .prepare(
            `DELETE FROM scan_candidate_evaluations
              WHERE scan_id NOT IN (
                SELECT id FROM scan_runs ORDER BY created_at DESC LIMIT ?
              )`,
          )
          .run(keep);
        this.database
          .prepare(
            `DELETE FROM scanned_posts
              WHERE NOT EXISTS (
                SELECT 1 FROM opportunities
                 WHERE opportunities.scanned_post_id=scanned_posts.id
              )
                AND NOT EXISTS (
                  SELECT 1 FROM scan_candidate_evaluations
                   WHERE scan_candidate_evaluations.scanned_post_id=scanned_posts.id
                )`,
          )
          .run();
      })
      .immediate();
  }
  redditProfile(): string | null {
    const row = this.database
      .prepare(
        "SELECT non_secret_value_json AS value FROM settings WHERE key='reddit.opencli_profile'",
      )
      .get() as { value: string } | undefined;
    if (!row) return null;
    try {
      const value = JSON.parse(row.value) as unknown;
      return typeof value === "string" && value ? value : null;
    } catch {
      return null;
    }
  }
  redditVerifiedAccount(): Record<string, unknown> | null {
    const row = this.database
      .prepare(
        "SELECT non_secret_value_json AS value FROM settings WHERE key='reddit.verified_account'",
      )
      .get() as { value: string } | undefined;
    if (!row) return null;
    try {
      const value = JSON.parse(row.value) as unknown;
      return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  saveRedditVerification(
    profile: string | null,
    account: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString();
    const save = this.database.prepare(
      "INSERT INTO settings(key,non_secret_value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET non_secret_value_json=excluded.non_secret_value_json,updated_at=excluded.updated_at",
    );
    this.database
      .transaction(() => {
        save.run("reddit.opencli_profile", JSON.stringify(profile), now);
        save.run(
          "reddit.verified_account",
          JSON.stringify({ ...account, verifiedAt: now }),
          now,
        );
        this.clearRedditHalt();
      })
      .immediate();
  }
  isRedditHalted(): boolean {
    const row = this.database
      .prepare(
        "SELECT non_secret_value_json AS value FROM settings WHERE key='reddit.kill_switch'",
      )
      .get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) === true : false;
  }
  haltReddit(reason: string): void {
    this.database
      .prepare(
        "INSERT INTO settings(key,non_secret_value_json,updated_at) VALUES ('reddit.kill_switch','true',?) ON CONFLICT(key) DO UPDATE SET non_secret_value_json='true',updated_at=excluded.updated_at",
      )
      .run(new Date().toISOString());
    this.database
      .prepare(
        "INSERT INTO settings(key,non_secret_value_json,updated_at) VALUES ('reddit.halt_reason',?,?) ON CONFLICT(key) DO UPDATE SET non_secret_value_json=excluded.non_secret_value_json,updated_at=excluded.updated_at",
      )
      .run(JSON.stringify(reason.slice(0, 300)), new Date().toISOString());
  }
  clearRedditHalt(): void {
    this.database
      .prepare(
        "DELETE FROM settings WHERE key IN ('reddit.kill_switch','reddit.halt_reason')",
      )
      .run();
  }
  databaseHandle(): Database.Database {
    return this.database;
  }
}
