import { createUserDatabase } from "@mentionish/database";
import { z } from "zod";
import {
  opportunityFeedItemSchema,
  draftOperationSchema,
  opportunityFeedPageSchema,
  type OpportunityFeedPage,
  type OpportunityFeedQuery,
  type OpportunityFeedback,
  type OpportunityFeedbackInput,
  type ReplyPreflight,
  type ReplyPreflightReviewInput,
  replyPreflightSchema,
  updateDraftTextSchema,
} from "@mentionish/types";

export type OpportunityRepositoryFactory = (
  accessToken: string,
) => OpportunityRepository;

export type DraftRequestResult =
  | { status: "queued" | "running"; operationId: string }
  | { status: "already_completed"; draftId: string }
  | {
      status:
        "not_found" | "not_eligible" | "no_entitlement" | "quota_exhausted";
    };
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

const opportunityColumns =
  "id,user_id,product_id,scanned_post_id,intent_score,reasoning,status,classified_at,posted_at,skipped_reason,created_at,updated_at";
const postColumns =
  "id,platform,external_id,subreddit,title,body,author,url,source_created_at,scanned_at,source_checked_at,source_updated_at";

interface DatabaseResult {
  data: unknown;
  error: { message: string } | null;
}
function requireDatabaseResult(result: DatabaseResult): unknown {
  if (result.error) throw databaseFailure();
  return result.data;
}
function databaseFailure(): OpportunityRepositoryError {
  return new OpportunityRepositoryError(
    "The opportunity database request failed.",
  );
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = Number.parseInt(
      Buffer.from(cursor, "base64url").toString("utf8"),
      10,
    );
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid");
    return parsed;
  } catch {
    throw new OpportunityRepositoryError("INVALID_CURSOR");
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function createSupabaseOpportunityRepositoryFactory(
  url: string,
  anonKey: string,
): OpportunityRepositoryFactory {
  return (accessToken) => {
    const database = createUserDatabase(url, anonKey, accessToken);
    return {
      async list(userId, productId, query) {
        const { data: product, error: productError } = await database
          .from("products")
          .select("id")
          .eq("id", productId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();
        if (productError) throw databaseFailure();
        if (!product) return null;

        const offset = decodeCursor(query.cursor);
        let request = database
          .from("opportunities")
          .select(opportunityColumns)
          .eq("user_id", userId)
          .eq("product_id", productId)
          .in("status", query.status)
          .gte("intent_score", query.min_score)
          .order("intent_score", { ascending: false })
          .order("created_at", { ascending: false })
          .range(offset, offset + query.limit);
        if (query.platform) {
          const { data: platformPosts, error: platformError } = await database
            .from("scanned_posts")
            .select("id")
            .eq("platform", query.platform);
          if (platformError) throw databaseFailure();
          const ids = (platformPosts ?? []).map((post) => post.id as string);
          if (ids.length === 0)
            return opportunityFeedPageSchema.parse({
              items: [],
              next_cursor: null,
            });
          request = request.in("scanned_post_id", ids);
        }
        const { data: opportunities, error } = await request;
        if (error) throw databaseFailure();
        const rows = opportunities ?? [];
        const pageRows = rows.slice(0, query.limit);
        const postIds = pageRows.map((row) => row.scanned_post_id as string);
        const opportunityIds = pageRows.map((row) => row.id as string);
        const { data: posts, error: postsError } = postIds.length
          ? await database
              .from("scanned_posts")
              .select(postColumns)
              .in("id", postIds)
          : { data: [], error: null };
        if (postsError) throw databaseFailure();
        const { data: drafts, error: draftsError } = opportunityIds.length
          ? await database
              .from("drafts")
              .select(
                "id,opportunity_id,generation_number,generated_text,edited_text,prompt_version,is_current,version,created_at,updated_at",
              )
              .in("opportunity_id", opportunityIds)
              .eq("is_current", true)
          : { data: [], error: null };
        if (draftsError) throw databaseFailure();
        const draftByOpportunity = new Map(
          (drafts ?? []).map((draft) => [
            draft.opportunity_id as string,
            draft,
          ]),
        );
        const postById = new Map(
          (posts ?? []).map((post) => [post.id as string, post]),
        );
        const items = pageRows.map((row) =>
          opportunityFeedItemSchema.parse({
            ...row,
            post: postById.get(row.scanned_post_id as string),
            draft: draftByOpportunity.get(row.id as string) ?? null,
          }),
        );
        return opportunityFeedPageSchema.parse({
          items,
          next_cursor:
            rows.length > query.limit
              ? encodeCursor(offset + query.limit)
              : null,
        });
      },
      async skip(userId, opportunityId, reason) {
        void userId;
        const result = (await database.rpc("skip_opportunity", {
          p_opportunity_id: opportunityId,
          p_reason: reason,
        })) as { data: unknown; error: { message: string } | null };
        if (result.error) throw databaseFailure();
        return result.data === true;
      },
      async markPosted(userId, opportunityId, postedAt) {
        void userId;
        const result = (await database.rpc("mark_opportunity_posted", {
          p_opportunity_id: opportunityId,
          ...(postedAt ? { p_posted_at: postedAt } : {}),
        })) as { data: unknown; error: { message: string } | null };
        if (result.error) throw databaseFailure();
        return result.data === true;
      },
      async getReplyPreflight(userId, opportunityId) {
        const { data: opportunity, error: opportunityError } = await database
          .from("opportunities")
          .select("id,scanned_post_id")
          .eq("id", opportunityId)
          .eq("user_id", userId)
          .maybeSingle();
        if (opportunityError) throw databaseFailure();
        if (!opportunity) return null;
        const { data: post, error: postError } = await database
          .from("scanned_posts")
          .select("platform,subreddit,url")
          .eq("id", opportunity.scanned_post_id as string)
          .maybeSingle();
        if (postError) throw databaseFailure();
        if (!post) return null;
        const sourceUrl = z.string().url().parse(post.url);
        const platform = post.platform === "reddit" ? "reddit" : "hackernews";
        const community =
          typeof post.subreddit === "string" && post.subreddit.trim()
            ? post.subreddit.trim().replace(/^r\//i, "")
            : null;
        return replyPreflightSchema.parse({
          opportunity_id: opportunityId,
          platform,
          community,
          state: platform === "reddit" ? "review_required" : "not_required",
          insertion_allowed: platform !== "reddit",
          reason:
            platform === "reddit"
              ? "This hosted runtime cannot persist the required native Reddit rule review. Use the local application before inserting a Reddit reply."
              : "Hacker News does not use the Reddit community-rule preflight.",
          source_url: sourceUrl,
          rules_url:
            platform === "reddit" && community
              ? `https://www.reddit.com/r/${encodeURIComponent(community)}/about/rules/`
              : null,
          review: null,
          account_context: null,
        });
      },
      recordReplyPreflightReview() {
        return Promise.resolve(null);
      },
      async requestDraft(
        userId,
        opportunityId,
        promptVersion,
        requestKey,
        regenerate,
      ) {
        void userId;
        const result = (await database.rpc("request_draft_generation", {
          p_opportunity_id: opportunityId,
          p_prompt_version: promptVersion,
          p_request_key: requestKey,
          p_regenerate: regenerate,
        })) as DatabaseResult;
        const raw = requireDatabaseResult(result) as Record<string, unknown>;
        const status = raw.status;
        if (status === "queued" || status === "running")
          return {
            status,
            operationId: z.string().uuid().parse(raw.operation_id),
          };
        if (status === "already_completed")
          return { status, draftId: z.string().uuid().parse(raw.draft_id) };
        if (
          status === "not_found" ||
          status === "not_eligible" ||
          status === "no_entitlement" ||
          status === "quota_exhausted"
        )
          return { status };
        throw databaseFailure();
      },
      async cancelDraft(userId, operationId) {
        void userId;
        return (
          requireDatabaseResult(
            (await database.rpc("cancel_draft_request", {
              p_operation_id: operationId,
            })) as DatabaseResult,
          ) === true
        );
      },
      async getOperation(userId, operationId) {
        const { data, error } = await database
          .from("operations")
          .select(
            "id,status,result_draft_id,error_code,created_at,completed_at",
          )
          .eq("id", operationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw databaseFailure();
        return data ? draftOperationSchema.parse(data) : null;
      },
      async updateDraft(userId, draftId, editedText, expectedVersion) {
        void userId;
        const input = updateDraftTextSchema.parse({
          edited_text: editedText,
          expected_version: expectedVersion,
        });
        const raw = requireDatabaseResult(
          (await database.rpc("update_draft_text", {
            p_draft_id: draftId,
            p_expected_version: input.expected_version,
            p_edited_text: input.edited_text,
          })) as DatabaseResult,
        ) as Record<string, unknown>;
        if (raw.status === "updated")
          return { status: "updated", draft: raw.draft };
        if (raw.status === "conflict" || raw.status === "not_found")
          return { status: raw.status };
        throw databaseFailure();
      },
    };
  };
}
