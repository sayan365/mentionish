import {
  draftOperationSchema,
  opportunityFeedItemSchema,
  type OpportunityFeedItem,
  type OpportunityFeedback,
  type OpportunityFeedbackInput,
  type OpportunityStatus,
  type PlatformCode,
} from "@mentionish/types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class OpportunityApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function apiRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new OpportunityApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "The opportunity request failed.",
    );
  }
  return (await response.json()) as T;
}

export async function listOpportunities(
  accessToken: string,
  productId: string,
  options: {
    status?: OpportunityStatus[];
    platform?: PlatformCode;
    cursor?: string;
    minScore?: number;
  } = {},
): Promise<{ items: OpportunityFeedItem[]; nextCursor: string | null }> {
  const parameters = new URLSearchParams();
  parameters.set("status", (options.status ?? ["new", "drafted"]).join(","));
  parameters.set("min_score", String(options.minScore ?? 60));
  parameters.set("limit", "20");
  if (options.platform) parameters.set("platform", options.platform);
  if (options.cursor) parameters.set("cursor", options.cursor);
  const body = await apiRequest<{
    data: unknown;
    pagination: { next_cursor: string | null };
  }>(
    accessToken,
    `/api/products/${productId}/opportunities?${parameters.toString()}`,
  );
  return {
    items: opportunityFeedItemSchema.array().parse(body.data),
    nextCursor: body.pagination.next_cursor,
  };
}

export async function skipOpportunity(
  accessToken: string,
  opportunityId: string,
): Promise<void> {
  await apiRequest(accessToken, `/api/opportunities/${opportunityId}/skip`, {
    method: "POST",
    body: JSON.stringify({ reason: "Not relevant right now." }),
  });
}

export async function markOpportunityPosted(
  accessToken: string,
  opportunityId: string,
): Promise<void> {
  await apiRequest(
    accessToken,
    `/api/opportunities/${opportunityId}/mark-posted`,
    {
      method: "POST",
      body: JSON.stringify({ posted_at: new Date().toISOString() }),
    },
  );
}

export async function saveOpportunityFeedback(
  accessToken: string,
  opportunityId: string,
  input: OpportunityFeedbackInput,
): Promise<OpportunityFeedback> {
  const body = await apiRequest<{ data: OpportunityFeedback }>(
    accessToken,
    `/api/opportunities/${opportunityId}/feedback`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return body.data;
}

export async function requestDraft(
  accessToken: string,
  opportunityId: string,
  regenerate: boolean,
): Promise<{ operationId: string }> {
  const body = await apiRequest<{ data: { operation_id: string } }>(
    accessToken,
    `/api/opportunities/${opportunityId}/draft`,
    {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    },
  );
  return { operationId: body.data.operation_id };
}

export async function getDraftOperation(
  accessToken: string,
  operationId: string,
) {
  const body = await apiRequest<{ data: unknown }>(
    accessToken,
    `/api/operations/${operationId}`,
  );
  return draftOperationSchema.parse(body.data);
}

export async function saveDraftText(
  accessToken: string,
  draftId: string,
  editedText: string,
  expectedVersion: number,
): Promise<unknown> {
  const body = await apiRequest<{ data: unknown }>(
    accessToken,
    `/api/drafts/${draftId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        edited_text: editedText,
        expected_version: expectedVersion,
      }),
    },
  );
  return body.data;
}
