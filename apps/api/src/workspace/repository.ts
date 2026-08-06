import { createUserDatabase } from "@mentionish/database";
import {
  analyticsSummarySchema,
  usageSummarySchema,
  type AnalyticsSummary,
  type UsageSummary,
} from "@mentionish/types";

export type WorkspaceRepositoryFactory = (
  accessToken: string,
) => WorkspaceRepository;

export interface WorkspaceRepository {
  usage(userId: string): Promise<UsageSummary | null>;
  analytics(
    userId: string,
    productId: string | undefined,
    windowDays: 7 | 30,
  ): Promise<AnalyticsSummary | null>;
}

export class WorkspaceRepositoryError extends Error {}

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

export function createSupabaseWorkspaceRepositoryFactory(
  url: string,
  anonKey: string,
): WorkspaceRepositoryFactory {
  return (accessToken) => {
    const database = createUserDatabase(url, anonKey, accessToken);
    return {
      async usage(userId) {
        void userId;
        const { data, error } = (await database.rpc(
          "get_my_usage",
        )) as RpcResult;
        if (error)
          throw new WorkspaceRepositoryError("Workspace usage is unavailable.");
        if ((data as { status?: string } | null)?.status === "no_entitlement")
          return null;
        return usageSummarySchema.parse(data);
      },
      async analytics(userId, productId, windowDays) {
        void userId;
        const { data, error } = (await database.rpc(
          "get_my_analytics_summary",
          {
            p_product_id: productId ?? null,
            p_window_days: windowDays,
          },
        )) as RpcResult;
        if (error)
          throw new WorkspaceRepositoryError(
            "Workspace analytics are unavailable.",
          );
        if ((data as { status?: string } | null)?.status === "not_found")
          return null;
        return analyticsSummarySchema.parse(data);
      },
    };
  };
}
