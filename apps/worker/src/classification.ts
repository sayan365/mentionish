import type {
  AiResult,
  ClassificationInput,
  ClassificationResult,
  ClassificationService,
} from "@mentionish/ai";

export interface ClassificationTarget extends ClassificationInput {
  userId: string;
  productId: string;
}

export type ClassificationClaim =
  | {
      status:
        | "not_found"
        | "not_eligible"
        | "already_completed"
        | "busy"
        | "no_entitlement"
        | "quota_exhausted";
    }
  | {
      status: "claimed";
      usageEventId: string;
      leaseToken: string;
      attemptNumber: number;
      target: ClassificationTarget;
    };

export interface AiCallInput {
  target: ClassificationTarget;
  usageEventId: string;
  promptVersion: string;
  requestedModel: string;
  reasoningEffort: "none";
  outputTokenCap: number;
  attemptNumber: number;
  status: "succeeded" | "failed";
  result?: AiResult<ClassificationResult>;
  errorClass?: string;
}

export interface ClassificationRepository {
  claimClassification(
    opportunityId: string,
    promptVersion: string,
  ): Promise<ClassificationClaim>;
  recordAiCall(input: AiCallInput): Promise<string>;
  completeClassification(
    usageEventId: string,
    leaseToken: string,
    aiCallId: string,
    result: ClassificationResult,
  ): Promise<boolean>;
  releaseClassification(
    usageEventId: string,
    leaseToken: string,
  ): Promise<boolean>;
}

export interface ClassificationRunnerOptions {
  promptVersion: string;
  requestedModel: string;
  outputTokenCap: number;
}

function errorClass(error: unknown): string {
  if (error instanceof Error) return error.constructor.name.slice(0, 100);
  return "UnknownError";
}

export async function runIntentClassification(
  opportunityId: string,
  service: ClassificationService,
  repository: ClassificationRepository,
  options: ClassificationRunnerOptions,
): Promise<
  | { status: Exclude<ClassificationClaim["status"], "claimed"> }
  | { status: "succeeded"; score: number; qualified: boolean }
> {
  const claim = await repository.claimClassification(
    opportunityId,
    options.promptVersion,
  );
  if (claim.status !== "claimed") return { status: claim.status };

  let successfulAiCallId: string | undefined;
  try {
    const result = await service.classifyIntent(claim.target);
    successfulAiCallId = await repository.recordAiCall({
      target: claim.target,
      usageEventId: claim.usageEventId,
      promptVersion: options.promptVersion,
      requestedModel: options.requestedModel,
      reasoningEffort: "none",
      outputTokenCap: options.outputTokenCap,
      attemptNumber: claim.attemptNumber,
      status: "succeeded",
      result,
    });
    const committed = await repository.completeClassification(
      claim.usageEventId,
      claim.leaseToken,
      successfulAiCallId,
      result.value,
    );
    if (!committed) {
      throw new Error("The classification lease expired before commit.");
    }
    return {
      status: "succeeded",
      score: result.value.intent_score,
      qualified: result.value.intent_score >= 60,
    };
  } catch (error) {
    if (!successfulAiCallId) {
      try {
        await repository.recordAiCall({
          target: claim.target,
          usageEventId: claim.usageEventId,
          promptVersion: options.promptVersion,
          requestedModel: options.requestedModel,
          reasoningEffort: "none",
          outputTokenCap: options.outputTokenCap,
          attemptNumber: claim.attemptNumber,
          status: "failed",
          errorClass: errorClass(error),
        });
      } catch {
        // The original provider/validation failure remains the retry signal.
      }
    }
    await repository.releaseClassification(
      claim.usageEventId,
      claim.leaseToken,
    );
    throw error;
  }
}
