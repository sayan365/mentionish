import type {
  draftOperationSchema,
  OpportunityFeedPage,
  OpportunityFeedQuery,
  OpportunityFeedback,
  OpportunityFeedbackInput,
  ReplyPreflight,
  ReplyPreflightReviewInput,
} from "@mentionish/types";

export type OpportunityRepositoryFactory = (
  accessToken: string,
) => OpportunityRepository;

export type DraftRequestResult =
  | { status: "queued" | "running"; operationId: string }
  | { status: "already_completed"; draftId: string }
  | { status: "not_found" | "not_eligible" };

export type DraftOperation = ReturnType<typeof draftOperationSchema.parse>;

export interface OpportunityRepository {
  list(
    userId: string,
    productId: string,
    query: OpportunityFeedQuery,
  ): Promise<OpportunityFeedPage | null>;
  skip(userId: string, opportunityId: string, reason: string): Promise<boolean>;
  markPosted(
    userId: string,
    opportunityId: string,
    postedAt?: string,
  ): Promise<boolean>;
  recordFeedback?(
    userId: string,
    opportunityId: string,
    input: OpportunityFeedbackInput,
  ): Promise<OpportunityFeedback | null>;
  getReplyPreflight(
    userId: string,
    opportunityId: string,
  ): Promise<ReplyPreflight | null>;
  recordReplyPreflightReview(
    userId: string,
    opportunityId: string,
    input: ReplyPreflightReviewInput,
  ): Promise<ReplyPreflight | null>;
  requestDraft(
    userId: string,
    opportunityId: string,
    promptVersion: string,
    requestKey: string,
    regenerate: boolean,
  ): Promise<DraftRequestResult>;
  cancelDraft(userId: string, operationId: string): Promise<boolean>;
  getOperation(
    userId: string,
    operationId: string,
  ): Promise<DraftOperation | null>;
  updateDraft(
    userId: string,
    draftId: string,
    editedText: string,
    expectedVersion: number,
  ): Promise<
    { status: "updated"; draft: unknown } | { status: "conflict" | "not_found" }
  >;
}

export class OpportunityRepositoryError extends Error {}
