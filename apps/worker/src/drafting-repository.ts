import { createServiceDatabase } from "@mentionish/database";
import { z } from "zod";
import type {
  DraftAiCallInput,
  DraftClaim,
  DraftRepository,
} from "./drafting.js";

interface DatabaseResult {
  data: unknown;
  error: { message: string } | null;
}
function requireResult(result: DatabaseResult): unknown {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const inactiveSchema = z.object({
  status: z.enum(["not_found", "not_eligible", "already_completed"]),
});
const claimSchema = z.object({
  status: z.literal("claimed"),
  operation_id: z.string().uuid(),
  usage_event_id: z.string().uuid(),
  lease_token: z.string().uuid(),
  attempt_number: z.number().int().positive(),
  generation_number: z.number().int().positive(),
  prompt_version: z.string(),
  target: z.object({
    opportunity_id: z.string().uuid(),
    user_id: z.string().uuid(),
    product_id: z.string().uuid(),
    product_name: z.string(),
    product_description: z.string(),
    voice_persona: z.string().nullable(),
    platform: z.enum(["reddit", "hackernews"]),
    subreddit: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    classification_reason: z.string(),
  }),
});

export class SupabaseDraftRepository implements DraftRepository {
  private readonly database: ReturnType<typeof createServiceDatabase>;
  constructor(url: string, serviceRoleKey: string) {
    this.database = createServiceDatabase(url, serviceRoleKey);
  }
  async claim(operationId: string): Promise<DraftClaim> {
    const raw = requireResult(
      (await this.database.rpc("begin_draft_operation", {
        p_operation_id: operationId,
      })) as DatabaseResult,
    );
    const inactive = inactiveSchema.safeParse(raw);
    if (inactive.success) return inactive.data;
    const claim = claimSchema.parse(raw);
    return {
      status: "claimed",
      operationId: claim.operation_id,
      usageEventId: claim.usage_event_id,
      leaseToken: claim.lease_token,
      attemptNumber: claim.attempt_number,
      target: {
        operationId: claim.operation_id,
        opportunityId: claim.target.opportunity_id,
        userId: claim.target.user_id,
        productId: claim.target.product_id,
        promptVersion: claim.prompt_version,
        platform: claim.target.platform,
        subreddit: claim.target.subreddit,
        productName: claim.target.product_name,
        productDescription: claim.target.product_description,
        voicePersona: claim.target.voice_persona,
        classificationReason: claim.target.classification_reason,
        title: claim.target.title,
        body: claim.target.body,
      },
    };
  }
  async recordAiCall(input: DraftAiCallInput): Promise<string> {
    const result = input.result;
    const response = await this.database
      .from("ai_calls")
      .insert({
        user_id: input.target.userId,
        opportunity_id: input.target.opportunityId,
        product_id: input.target.productId,
        usage_event_id: input.usageEventId,
        operation_type: "draft",
        provider: "openai",
        requested_model: input.requestedModel,
        returned_model: result?.returnedModel ?? null,
        prompt_version: input.promptVersion,
        reasoning_effort: "low",
        output_token_cap: input.outputTokenCap,
        input_tokens: result?.usage.inputTokens ?? 0,
        cached_input_tokens: result?.usage.cachedInputTokens ?? 0,
        output_tokens: result?.usage.outputTokens ?? 0,
        reasoning_tokens: result?.usage.reasoningTokens ?? 0,
        total_tokens: result?.usage.totalTokens ?? 0,
        provider_response_id: result?.providerResponseId ?? null,
        latency_ms: result?.latencyMilliseconds ?? null,
        status: input.status,
        error_class: input.errorClass ?? null,
        attempt_number: input.attemptNumber,
        estimated_cost_usd: null,
      })
      .select("id")
      .single();
    if (response.error) throw new Error(response.error.message);
    if (!response.data || typeof response.data.id !== "string")
      throw new Error("The AI call record returned no ID.");
    return response.data.id;
  }
  async complete(
    operationId: string,
    leaseToken: string,
    aiCallId: string,
    draftText: string,
  ): Promise<string | null> {
    const raw = requireResult(
      (await this.database.rpc("complete_draft_operation", {
        p_operation_id: operationId,
        p_lease_token: leaseToken,
        p_ai_call_id: aiCallId,
        p_draft_text: draftText,
      })) as DatabaseResult,
    );
    return typeof raw === "string" ? z.string().uuid().parse(raw) : null;
  }
  async fail(operationId: string, errorCode: string): Promise<boolean> {
    return (
      requireResult(
        (await this.database.rpc("fail_draft_operation", {
          p_operation_id: operationId,
          p_error_code: errorCode,
        })) as DatabaseResult,
      ) === true
    );
  }
}
