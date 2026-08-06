import type {
  AiResult,
  DraftInput,
  DraftResult,
  DraftingService,
} from "@mentionish/ai";

export interface DraftTarget extends DraftInput {
  productId: string;
}
export type DraftClaim =
  | { status: "not_found" | "not_eligible" | "already_completed" }
  | {
      status: "claimed";
      operationId: string;
      usageEventId: string;
      leaseToken: string;
      attemptNumber: number;
      target: DraftTarget;
    };
export interface DraftAiCallInput {
  target: DraftTarget;
  usageEventId: string;
  promptVersion: string;
  requestedModel: string;
  outputTokenCap: number;
  attemptNumber: number;
  status: "succeeded" | "failed";
  result?: AiResult<DraftResult>;
  errorClass?: string;
}
export interface DraftRepository {
  claim(operationId: string): Promise<DraftClaim>;
  recordAiCall(input: DraftAiCallInput): Promise<string>;
  complete(
    operationId: string,
    leaseToken: string,
    aiCallId: string,
    draftText: string,
  ): Promise<string | null>;
  fail(operationId: string, errorCode: string): Promise<boolean>;
}
export interface DraftRunnerOptions {
  requestedModel: string;
  outputTokenCap: number;
}
function errorClass(error: unknown): string {
  return error instanceof Error
    ? error.constructor.name.slice(0, 100)
    : "UnknownError";
}

export async function runDraftGeneration(
  operationId: string,
  service: DraftingService,
  repository: DraftRepository,
  options: DraftRunnerOptions,
) {
  const claim = await repository.claim(operationId);
  if (claim.status !== "claimed") return { status: claim.status } as const;
  let aiCallId: string | undefined;
  try {
    const result = await service.generateDraft(claim.target);
    aiCallId = await repository.recordAiCall({
      target: claim.target,
      usageEventId: claim.usageEventId,
      promptVersion: claim.target.promptVersion,
      requestedModel: options.requestedModel,
      outputTokenCap: options.outputTokenCap,
      attemptNumber: claim.attemptNumber,
      status: "succeeded",
      result,
    });
    const draftId = await repository.complete(
      claim.operationId,
      claim.leaseToken,
      aiCallId,
      result.value.draft_text,
    );
    if (!draftId)
      throw new Error("The draft reservation expired before commit.");
    return { status: "succeeded", draftId } as const;
  } catch (error) {
    if (!aiCallId) {
      try {
        await repository.recordAiCall({
          target: claim.target,
          usageEventId: claim.usageEventId,
          promptVersion: claim.target.promptVersion,
          requestedModel: options.requestedModel,
          outputTokenCap: options.outputTokenCap,
          attemptNumber: claim.attemptNumber,
          status: "failed",
          errorClass: errorClass(error),
        });
      } catch {
        /* preserve original failure */
      }
    }
    await repository.fail(claim.operationId, errorClass(error));
    throw error;
  }
}
