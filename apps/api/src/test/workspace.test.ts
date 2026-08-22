import type { AnalyticsSummary, UsageSummary } from "@mentionish/types";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { ProductRepositoryFactory } from "../products/repository.js";
import type { WorkspaceRepositoryFactory } from "../workspace/repository.js";

const userOne = "2b7f1be2-c494-4b23-9515-c8f8ca54d381";
const userTwo = "8b2fe2c6-b772-48eb-9003-861c3a130357";
const productOne = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = "2026-08-06T10:00:00.000Z";

const productFactory: ProductRepositoryFactory = () => ({
  list: () => Promise.resolve([]),
  listArchived: () => Promise.resolve([]),
  get: () => Promise.resolve(null),
  create: (_userId, input) => Promise.resolve(input as never),
  update: () => Promise.resolve(null),
  softDelete: () => Promise.resolve(false),
  restore: () => Promise.resolve(null),
});

const usage: UsageSummary = {
  plan: "free",
  entitlement_status: "active",
  period: { starts_at: now, ends_at: null },
  classification: {
    used: 12,
    reserved: 0,
    limit: 50,
    remaining: 38,
    resets_at: null,
  },
  draft: { used: 1, reserved: 0, limit: 5, remaining: 4, resets_at: null },
  products: { active: 1, limit: 1 },
};
const analytics: AnalyticsSummary = {
  window_days: 7,
  product_id: productOne,
  found: 20,
  qualified: 8,
  drafted: 3,
  posted: 1,
  skipped: 2,
  draft_to_post_percent: 33.3,
  platforms: { reddit: 7, hackernews: 1 },
  feedback: {
    reviewed: 4,
    useful: 3,
    not_relevant: 1,
    useful_percent: 75,
    top_negative_reason: "weak_intent",
  },
};

const workspaceFactory: WorkspaceRepositoryFactory = () => ({
  usage(userId) {
    return Promise.resolve(userId === userOne ? usage : null);
  },
  analytics(userId, productId, windowDays) {
    if (userId !== userOne || productId !== productOne)
      return Promise.resolve(null);
    return Promise.resolve({ ...analytics, window_days: windowDays });
  },
});

function app() {
  return createApp(
    (token) => {
      if (token === "one") return Promise.resolve({ userId: userOne });
      if (token === "two") return Promise.resolve({ userId: userTwo });
      return Promise.reject(new Error("invalid"));
    },
    productFactory,
    "http://localhost:3000",
    undefined,
    undefined,
    "draft-v1",
    workspaceFactory,
  );
}

describe("workspace API", () => {
  it("returns authoritative owned usage", async () => {
    const response = await request(app())
      .get("/api/usage")
      .set("authorization", "Bearer one");
    expect(response.status).toBe(200);
    const body = response.body as { data: unknown };
    expect(body.data).toMatchObject({
      plan: "free",
      classification: { remaining: 38 },
      draft: { limit: 5 },
    });
  });

  it("validates analytics windows and hides non-owned products", async () => {
    const valid = await request(app())
      .get("/api/analytics/summary?product_id=" + productOne + "&window=30d")
      .set("authorization", "Bearer one");
    const invalid = await request(app())
      .get("/api/analytics/summary?window=90d")
      .set("authorization", "Bearer one");
    const hidden = await request(app())
      .get("/api/analytics/summary?product_id=" + productOne)
      .set("authorization", "Bearer two");
    expect(valid.status).toBe(200);
    const validBody = valid.body as { data: { window_days: number } };
    expect(validBody.data.window_days).toBe(30);
    expect(invalid.status).toBe(400);
    expect(hidden.status).toBe(404);
  });
});
