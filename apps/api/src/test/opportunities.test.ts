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
  feedback: null,
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
    recordFeedback(userId, id, input) {
      return Promise.resolve(
        userId === userOne && id === opportunityOne
          ? {
              id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              opportunity_id: id,
              ...input,
              note: input.note ?? null,
              created_at: now,
            }
          : null,
      );
    },
    getReplyPreflight(userId, id) {
      return Promise.resolve(
        userId === userOne && id === opportunityOne
          ? {
              opportunity_id: id,
              platform: "hackernews" as const,
              community: null,
              state: "not_required" as const,
              insertion_allowed: true,
              reason:
                "Hacker News does not use the Reddit community-rule preflight.",
              source_url: item.post.url,
              rules_url: null,
              review: null,
              account_context: null,
            }
          : null,
      );
    },
    recordReplyPreflightReview() {
      return Promise.resolve(null);
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

  it("records structured feedback and rejects mismatched reasons", async () => {
    const saved = await request(app)
      .post(`/api/opportunities/${opportunityOne}/feedback`)
      .set("authorization", "Bearer one")
      .send({
        verdict: "useful",
        reason: "strong_problem",
        note: "This is exactly the pain the product addresses.",
      });
    const invalid = await request(app)
      .post(`/api/opportunities/${opportunityOne}/feedback`)
      .set("authorization", "Bearer one")
      .send({ verdict: "useful", reason: "wrong_audience" });
    const denied = await request(app)
      .post(`/api/opportunities/${opportunityOne}/feedback`)
      .set("authorization", "Bearer two")
      .send({ verdict: "not_relevant", reason: "wrong_audience" });

    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({
      data: { verdict: "useful", reason: "strong_problem" },
    });
    expect(invalid.status).toBe(400);
    expect(denied.status).toBe(404);
  });

  it("returns the current reply preflight without caching it", async () => {
    const response = await request(app)
      .get(`/api/opportunities/${opportunityOne}/reply-preflight`)
      .set("authorization", "Bearer one");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      data: {
        opportunity_id: opportunityOne,
        state: "not_required",
        insertion_allowed: true,
      },
    });
  });

  it("queues local Reddit drafting while reply insertion is not ready", async () => {
    const enqueue = vi.fn(() => Promise.resolve());
    const requestDraftOperation = vi.fn(() =>
      Promise.resolve({
        status: "queued" as const,
        operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    );
    const factory: OpportunityRepositoryFactory = () => ({
      ...opportunityFactory()("one"),
      getReplyPreflight: () =>
        Promise.resolve({
          opportunity_id: opportunityOne,
          platform: "reddit" as const,
          community: "SaaS",
          state: "review_required" as const,
          insertion_allowed: false,
          reason: "Review the current thread and rules before inserting.",
          source_url: "https://reddit.com/r/SaaS/comments/example",
          rules_url: "https://www.reddit.com/r/SaaS/about/rules/",
          review: null,
          account_context: null,
        }),
      requestDraft: requestDraftOperation,
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
      .set("idempotency-key", "11111111-1111-4111-8111-111111111111")
      .send({ regenerate: false });
    expect(response.status).toBe(202);
    expect(requestDraftOperation).toHaveBeenCalledWith(
      userOne,
      opportunityOne,
      "draft-v1",
      "11111111-1111-4111-8111-111111111111",
      false,
    );
    expect(enqueue).toHaveBeenCalledWith(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
  });

  it("queues drafting only after an explicit request", async () => {
    const enqueue = vi.fn(() => Promise.resolve());
    const requestDraftOperation = vi.fn(() =>
      Promise.resolve({
        status: "queued" as const,
        operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    );
    const factory: OpportunityRepositoryFactory = () => ({
      ...opportunityFactory()("one"),
      requestDraft: requestDraftOperation,
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
      .set("idempotency-key", "11111111-1111-4111-8111-111111111111")
      .send({ regenerate: false });
    expect(response.status).toBe(202);
    expect(enqueue).toHaveBeenCalledWith(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(requestDraftOperation).toHaveBeenCalledWith(
      userOne,
      opportunityOne,
      "draft-v1",
      "11111111-1111-4111-8111-111111111111",
      false,
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
