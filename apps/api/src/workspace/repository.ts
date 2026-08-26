import type { AnalyticsSummary } from "@mentionish/types";

export type WorkspaceRepositoryFactory = (
  accessToken: string,
) => WorkspaceRepository;

export interface WorkspaceRepository {
  analytics(
    userId: string,
    productId: string | undefined,
    windowDays: 7 | 30,
  ): Promise<AnalyticsSummary | null>;
}

export class WorkspaceRepositoryError extends Error {}
