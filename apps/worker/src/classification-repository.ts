import { createServiceDatabase } from "@mentionish/database";
import { z } from "zod";
import type {
  AiCallInput,
  ClassificationClaim,
  ClassificationRepository,
} from "./classification.js";

const claimedSchema = z.object({
  status: z.literal("claimed"),
  usage_event_id: z.string().uuid(),
  lease_token: z.string().uuid(),
  attempt_number: z.number().int().positive(),
  target: z.object({
    opportunity_id: z.string().uuid(),
    user_id: z.string().uuid(),
    product_id: z.string().uuid(),
    product_name: z.string(),
    product_description: z.string(),
    platform: z.enum(["reddit", "hackernews"]),
    title: z.string(),
    body: z.string(),
  }),
});

const inactiveSchema = z.object({
  status: z.enum([
    "not_found",
    "not_eligible",
    "already_completed",
    "busy",
    "no_entitlement",
    "quota_exhausted",
  ]),
});

interface DatabaseResult {
  data: unknown;
  error: { message: string } | null;
}

function requireResult(result: DatabaseResult): unknown {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function nullable(value: number | string | undefined): number | string | null {
  return value ?? null;
}

export class SupabaseClassificationRepository implements ClassificationRepository {
  private readonly database: ReturnType<typeof createServiceDatabase>;

  constructor(url: string, serviceRoleKey: string) {
    this.database = createServiceDatabase(url, serviceRoleKey);
  }

  async claimClassification(
    opportunityId: string,
    promptVersion: string,
  ): Promise<ClassificationClaim> {
    const raw = requireResult(
      (await this.database.rpc("reserve_classification", {
        p_opportunity_id: opportunityId,
        p_prompt_version: promptVersion,
        p_lease_seconds: 600,
      })) as DatabaseResult,
    );
    const inactive = inactiveSchema.safeParse(raw);
    if (inactive.success) return inactive.data;
    const claim = claimedSchema.parse(raw);
    return {
      status: "claimed",
      usageEventId: claim.usage_event_id,
      leaseToken: claim.lease_token,
      attemptNumber: claim.attempt_number,
      target: {
        opportunityId: claim.target.opportunity_id,
        userId: claim.target.user_id,
        productId: claim.target.product_id,
        promptVersion,
        platform: claim.target.platform,
        productName: claim.target.product_name,
        productDescription: claim.target.product_description,
        title: claim.target.title,
        body: claim.target.body,
      },
    };
  }

  async recordAiCall(input: AiCallInput): Promise<string> {
    const result = input.result;
    const { data, error } = await this.database
      .from("ai_calls")
      .insert({
        user_id: input.target.userId,
        opportunity_id: input.target.opportunityId,
        product_id: input.target.productId,
        usage_event_id: input.usageEventId,
        operation_type: "classification",
        provider: "openai",
        requested_model: input.requestedModel,
        returned_model: result?.returnedModel ?? null,
        prompt_version: input.promptVersion,
        reasoning_effort: input.reasoningEffort,
        output_token_cap: input.outputTokenCap,
        input_tokens: result?.usage.inputTokens ?? 0,
        cached_input_tokens: result?.usage.cachedInputTokens ?? 0,
        output_tokens: result?.usage.outputTokens ?? 0,
        reasoning_tokens: result?.usage.reasoningTokens ?? 0,
        total_tokens: result?.usage.totalTokens ?? 0,
        provider_response_id: result?.providerResponseId ?? null,
        latency_ms: nullable(result?.latencyMilliseconds),
        status: input.status,
        error_class: input.errorClass ?? null,
        attempt_number: input.attemptNumber,
        estimated_cost_usd: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!data || typeof data.id !== "string") {
      throw new Error("The AI call record returned no ID.");
    }
    return data.id;
  }

  async completeClassification(
    usageEventId: string,
    leaseToken: string,
    aiCallId: string,
    result: { intent_score: number; reasoning: string },
  ): Promise<boolean> {
    const data = requireResult(
      (await this.database.rpc("complete_classification", {
        p_usage_event_id: usageEventId,
        p_lease_token: leaseToken,
        p_ai_call_id: aiCallId,
        p_intent_score: result.intent_score,
        p_reasoning: result.reasoning,
      })) as DatabaseResult,
    );
    return data === true;
  }

  async releaseClassification(
    usageEventId: string,
    leaseToken: string,
  ): Promise<boolean> {
    const data = requireResult(
      (await this.database.rpc("release_classification", {
        p_usage_event_id: usageEventId,
        p_lease_token: leaseToken,
      })) as DatabaseResult,
    );
    return data === true;
  }
}
