import type { LocalProductRepository } from "@mentionish/database";
import type { WorkspaceRepositoryFactory } from "./repository.js";

export function createLocalWorkspaceRepositoryFactory(
  products: LocalProductRepository,
): WorkspaceRepositoryFactory {
  return () => ({
    usage() {
      const activeProducts = products.list().length;
      return Promise.resolve({
        plan: "free",
        entitlement_status: "active",
        period: {
          starts_at: "1970-01-01T00:00:00.000Z",
          ends_at: null,
        },
        classification: {
          used: 0,
          reserved: 0,
          limit: 0,
          remaining: 0,
          resets_at: null,
        },
        draft: {
          used: 0,
          reserved: 0,
          limit: 0,
          remaining: 0,
          resets_at: null,
        },
        products: { active: activeProducts, limit: 2_147_483_647 },
      });
    },
    analytics(_userId, productId, windowDays) {
      if (productId && !products.get(productId)) return Promise.resolve(null);
      return Promise.resolve({
        window_days: windowDays,
        product_id: productId ?? null,
        found: 0,
        qualified: 0,
        drafted: 0,
        posted: 0,
        skipped: 0,
        draft_to_post_percent: 0,
        platforms: { reddit: 0, hackernews: 0 },
      });
    },
  });
}
