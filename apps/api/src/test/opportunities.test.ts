import type {
  OpportunityFeedItem,
  OpportunityFeedPage,
  OpportunityFeedQuery,
  Product,
} from "@mentionish/types";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { OpportunityRepositoryFactory } from "../opportunities/repository.js";
import type { ProductRepositoryFactory } from "../products/repository.js";

const userOne = "2b7f1be2-c494-4b23-9515-c8f8ca54d381";
const userTwo = "8b2fe2c6-b772-48eb-9003-861c3a130357";
const productOne = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const opportunityOne = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = "2026-08-06T10:00:00.000Z";

const item: OpportunityFeedItem = {
  id: opportunityOne,
  user_id: userOne,
  product_id: productOne,
  scanned_post_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  intent_score: 88,
  reasoning: "The author asks for a product recommendation.",
  status: "new",
  classified_at: now,
  posted_at: null,
  skipped_reason: null,
  created_at: now,
  updated_at: now,
  draft: null,
  post: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    platform: "hackernews",
    external_id: "123",
    subreddit: null,
    title: "What tool solves this?",
    body: "I need a reliable option.",
    author: "founder",
    url: "https://news.ycombinator.com/item?id=123",
    source_created_at: now,
    scanned_at: now,
    source_checked_at: now,
    source_updated_at: null,
  },
};

function productFactory(): ProductRepositoryFactory {
  return () => ({
    list: () => Promise.resolve([]),
    listArchived: () => Promise.resolve([]),
    get: () => Promise.resolve(null),
    create: (_userId, input) => Promise.resolve(input as unknown as Product),
    update: () => Promise.resolve(null),
    softDelete: () => Promise.resolve(false),
    restore: () => Promise.resolve(null),
  });
}

function opportunityFactory(): OpportunityRepositoryFactory {
  return () => ({
    list(
      userId: string,
      productId: string,
      query: OpportunityFeedQuery,
    ): Promise<OpportunityFeedPage | null> {
      void query;
      return Promise.resolve(
        userId === userOne && productId === productOne
          ? { items: [item], next_cursor: null }
          : null,
      );
    },
    skip(userId, id) {
      return Promise.resolve(userId === userOne && id === opportunityOne);
    },
    markPosted(userId, id) {
      return Promise.resolve(userId === userOne && id === opportunityOne);
    },
    requestDraft() {
      return Promise.resolve({ status: "not_eligible" as const });
    },
    cancelDraft() {
      return Promise.resolve(false);
    },
    getOperation() {
      return Promise.resolve(null);
    },
    updateDraft() {
      return Promise.resolve({ status: "not_found" as const });
    },
  });
}

describe("opportunity API", () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = createApp(
      (token) => {
        if (token === "one") return Promise.resolve({ userId: userOne });
        if (token === "two") return Promise.resolve({ userId: userTwo });
        return Promise.reject(new Error("invalid"));
      },
      productFactory(),
      "http://localhost:3000",
      opportunityFactory(),
    );
  });

  it("returns an owned qualified feed", async () => {
    const response = await request(app)
      .get(`/api/products/${productOne}/opportunities?status=new&min_score=60`)
      .set("authorization", "Bearer one");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [{ id: opportunityOne, intent_score: 88 }],
      pagination: { next_cursor: null },
    });
  });

  it("does not reveal another user's product feed", async () => {
    const response = await request(app)
      .get(`/api/products/${productOne}/opportunities`)
      .set("authorization", "Bearer two");
    expect(response.status).toBe(404);
  });

  it("records only explicit manual lifecycle actions", async () => {
    const skipped = await request(app)
      .post(`/api/opportunities/${opportunityOne}/skip`)
      .set("authorization", "Bearer one")
      .send({ reason: "Not a fit" });
    const posted = await request(app)
      .post(`/api/opportunities/${opportunityOne}/mark-posted`)
      .set("authorization", "Bearer one")
      .send({ posted_at: now });
    const denied = await request(app)
      .post(`/api/opportunities/${opportunityOne}/skip`)
      .set("authorization", "Bearer two")
      .send({ reason: "No access" });
    expect(skipped.status).toBe(200);
    expect(posted.status).toBe(200);
    expect(denied.status).toBe(404);
  });

  it("queues drafting only after an explicit request", async () => {
    const enqueue = vi.fn(() => Promise.resolve());
    const factory: OpportunityRepositoryFactory = () => ({
      ...opportunityFactory()("one"),
      requestDraft: () =>
        Promise.resolve({
          status: "queued",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        }),
    });
    const draftingApp = createApp(
      () => Promise.resolve({ userId: userOne }),
      productFactory(),
      "http://localhost:3000",
      factory,
      { enqueue },
      "draft-v1",
    );
    const response = await request(draftingApp)
      .post(`/api/opportunities/${opportunityOne}/draft`)
      .set("authorization", "Bearer one")
      .send({ regenerate: false });
    expect(response.status).toBe(202);
    expect(enqueue).toHaveBeenCalledWith(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
  });

  it("releases the reservation when the queue is unavailable", async () => {
    const cancelDraft = vi.fn(() => Promise.resolve(true));
    const factory: OpportunityRepositoryFactory = () => ({
      ...opportunityFactory()("one"),
      cancelDraft,
      requestDraft: () =>
        Promise.resolve({
          status: "queued",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        }),
    });
    const draftingApp = createApp(
      () => Promise.resolve({ userId: userOne }),
      productFactory(),
      "http://localhost:3000",
      factory,
      { enqueue: () => Promise.reject(new Error("redis unavailable")) },
      "draft-v1",
    );
    const response = await request(draftingApp)
      .post(`/api/opportunities/${opportunityOne}/draft`)
      .set("authorization", "Bearer one")
      .send({ regenerate: false });
    expect(response.status).toBe(503);
    expect(cancelDraft).toHaveBeenCalledOnce();
  });
});
