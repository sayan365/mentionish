import type { LocalDiscoveryRepository } from "@mentionish/database";
import type { LocalAiProvider } from "@mentionish/ai";
import { randomUUID } from "node:crypto";
import type { LocalAiSettingsService } from "../ai/local-routes.js";
import type { DraftQueue } from "./draft-queue.js";

interface DraftTargetRow {
  operation_id: string;
  opportunity_id: string;
  prompt_version: string;
  platform: "reddit" | "hackernews";
  subreddit: string | null;
  title: string;
  body: string;
  product_name: string;
  product_description: string;
  voice_persona: string | null;
  classification_reason: string | null;
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("configure an ai provider")) return "AI_NOT_CONFIGURED";
  if (message.includes("key is unavailable") || message.includes("401"))
    return "AI_AUTH_FAILED";
  if (message.includes("429") || message.includes("rate"))
    return "AI_RATE_LIMITED";
  if (message.includes("safety check")) return "DRAFT_SAFETY_REJECTED";
  if (message.includes("usable draft") || message.includes("draft data"))
    return "AI_INVALID_RESPONSE";
  return "AI_PROVIDER_ERROR";
}

export class LocalDraftQueue implements DraftQueue {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly discovery: LocalDiscoveryRepository,
    private readonly aiSettings: LocalAiSettingsService,
    private readonly createClient: () => Pick<
      LocalAiProvider,
      "generateReplyDraft"
    > = () => aiSettings.client("drafting"),
  ) {
    const now = new Date().toISOString();
    this.discovery
      .databaseHandle()
      .prepare(
        `UPDATE draft_operations
            SET status='failed',error_code='APP_RESTARTED',completed_at=?
          WHERE status IN ('queued','running')`,
      )
      .run(now);
  }

  enqueue(operationId: string): Promise<void> {
    if (this.inFlight.has(operationId)) return Promise.resolve();
    this.inFlight.add(operationId);
    queueMicrotask(() => {
      void this.run(operationId).finally(() => {
        this.inFlight.delete(operationId);
      });
    });
    return Promise.resolve();
  }

  private claim(operationId: string): DraftTargetRow | null {
    const database = this.discovery.databaseHandle();
    return database
      .transaction(() => {
        const startedAt = new Date().toISOString();
        const changed = database
          .prepare(
            `UPDATE draft_operations SET status='running',started_at=?
              WHERE id=? AND status='queued'`,
          )
          .run(startedAt, operationId).changes;
        if (changed !== 1) return null;
        return (
          (database
            .prepare(
              `SELECT operation.id AS operation_id,
                      opportunity.id AS opportunity_id,
                      operation.prompt_version,
                      post.platform,post.subreddit,post.title,post.body,
                      product.name AS product_name,
                      product.description AS product_description,
                      product.voice_persona,
                      opportunity.reasoning AS classification_reason
                 FROM draft_operations operation
                 JOIN opportunities opportunity
                   ON opportunity.id=operation.opportunity_id
                 JOIN scanned_posts post
                   ON post.id=opportunity.scanned_post_id
                 JOIN products product
                   ON product.id=opportunity.product_id
                WHERE operation.id=? AND operation.status='running'`,
            )
            .get(operationId) as DraftTargetRow | undefined) ?? null
        );
      })
      .immediate();
  }

  private async run(operationId: string): Promise<void> {
    const target = this.claim(operationId);
    if (!target) return;
    const database = this.discovery.databaseHandle();
    try {
      const client = this.createClient();
      const result = await client.generateReplyDraft({
        platform: target.platform,
        subreddit: target.subreddit,
        productName: target.product_name,
        productDescription: target.product_description,
        voicePersona: target.voice_persona,
        classificationReason: target.classification_reason ?? "",
        title: target.title,
        body: target.body,
      });
      database
        .transaction(() => {
          const active = database
            .prepare("SELECT status FROM draft_operations WHERE id=?")
            .get(operationId) as { status: string } | undefined;
          if (active?.status !== "running") return;
          const generation = database
            .prepare(
              `SELECT coalesce(max(generation_number),0)+1 AS generation
                 FROM drafts WHERE opportunity_id=?`,
            )
            .get(target.opportunity_id) as { generation: number };
          const now = new Date().toISOString();
          const draftId = randomUUID();
          database
            .prepare(
              "UPDATE drafts SET is_current=0,updated_at=? WHERE opportunity_id=? AND is_current=1",
            )
            .run(now, target.opportunity_id);
          database
            .prepare(
              `INSERT INTO drafts(
                 id,opportunity_id,generation_number,generated_text,edited_text,
                 prompt_version,provider,model,is_current,version,created_at,updated_at
               ) VALUES (?,?,?,?,?,?,?,?,1,1,?,?)`,
            )
            .run(
              draftId,
              target.opportunity_id,
              generation.generation,
              result.value.draft_text,
              result.value.draft_text,
              target.prompt_version,
              result.provider,
              result.model,
              now,
              now,
            );
          database
            .prepare(
              `INSERT INTO draft_versions(id,draft_id,version,text,source,created_at)
               VALUES (?,?,1,?,'generated',?)`,
            )
            .run(randomUUID(), draftId, result.value.draft_text, now);
          database
            .prepare(
              `INSERT INTO local_ai_calls(
                 id,operation_id,provider,model,latency_ms,input_tokens,
                 output_tokens,total_tokens,status,created_at
               ) VALUES (?,?,?,?,?,?,?,?,'succeeded',?)`,
            )
            .run(
              randomUUID(),
              operationId,
              result.provider,
              result.model,
              result.latencyMilliseconds,
              result.usage.inputTokens,
              result.usage.outputTokens,
              result.usage.totalTokens,
              now,
            );
          database
            .prepare(
              "UPDATE opportunities SET status='drafted',updated_at=? WHERE id=?",
            )
            .run(now, target.opportunity_id);
          database
            .prepare(
              `UPDATE draft_operations
                  SET status='succeeded',result_draft_id=?,error_code=NULL,completed_at=?
                WHERE id=? AND status='running'`,
            )
            .run(draftId, now, operationId);
        })
        .immediate();
    } catch (error) {
      const now = new Date().toISOString();
      const snapshot = this.aiSettings.snapshot();
      database
        .transaction(() => {
          database
            .prepare(
              `INSERT INTO local_ai_calls(
                 id,operation_id,provider,model,status,error_class,created_at
               ) VALUES (?,?,?,?,'failed',?,?)`,
            )
            .run(
              randomUUID(),
              operationId,
              snapshot.provider,
              snapshot.drafting_model,
              error instanceof Error
                ? error.constructor.name.slice(0, 100)
                : "UnknownError",
              now,
            );
          database
            .prepare(
              `UPDATE draft_operations
                  SET status='failed',error_code=?,completed_at=?
                WHERE id=? AND status='running'`,
            )
            .run(safeErrorCode(error), now, operationId);
        })
        .immediate();
    }
  }
}
