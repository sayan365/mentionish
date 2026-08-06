import {
  analyticsSummarySchema,
  usageSummarySchema,
  type AnalyticsSummary,
  type UsageSummary,
} from "@mentionish/types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class WorkspaceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(apiUrl + path, {
    headers: { authorization: "Bearer " + accessToken },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new WorkspaceApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Workspace data could not be loaded.",
    );
  }
  return (await response.json()) as T;
}

export async function getUsage(accessToken: string): Promise<UsageSummary> {
  const body = await request<{ data: unknown }>(accessToken, "/api/usage");
  return usageSummarySchema.parse(body.data);
}

export async function getAnalytics(
  accessToken: string,
  options: { productId?: string; window: "7d" | "30d" },
): Promise<AnalyticsSummary> {
  const parameters = new URLSearchParams({ window: options.window });
  if (options.productId) parameters.set("product_id", options.productId);
  const body = await request<{ data: unknown }>(
    accessToken,
    "/api/analytics/summary?" + parameters.toString(),
  );
  return analyticsSummarySchema.parse(body.data);
}
