import {
  productSchema,
  type CreateProductInput,
  type Product,
  type UpdateProductInput,
} from "@mentionish/types";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type {
  ProductRepository,
  ProductRepositoryFactory,
} from "../products/repository.js";

const userOne = "2b7f1be2-c494-4b23-9515-c8f8ca54d381";
const userTwo = "8b2fe2c6-b772-48eb-9003-861c3a130357";
const now = "2026-08-03T10:00:00.000Z";

function makeProduct(
  id: string,
  userId: string,
  overrides: Partial<Product> = {},
): Product {
  return {
    id,
    user_id: userId,
    name: "Existing product",
    description: "An existing product.",
    keywords: ["existing keyword"],
    voice_persona: null,
    is_active: true,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMemoryRepositoryFactory(
  products: Product[],
): ProductRepositoryFactory {
  return () => {
    const repository: ProductRepository = {
      list(userId) {
        return Promise.resolve(
          products.filter(
            (product) =>
              product.user_id === userId &&
              product.is_active &&
              product.deleted_at === null,
          ),
        );
      },
      get(userId, productId) {
        return Promise.resolve(
          products.find(
            (product) =>
              product.id === productId &&
              product.user_id === userId &&
              product.deleted_at === null,
          ) ?? null,
        );
      },
      create(userId, input: CreateProductInput) {
        const product = makeProduct(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          userId,
          {
            ...input,
            voice_persona: input.voice_persona ?? null,
          },
        );
        products.push(product);
        return Promise.resolve(product);
      },
      update(userId, productId, input: UpdateProductInput) {
        const index = products.findIndex(
          (product) =>
            product.id === productId &&
            product.user_id === userId &&
            product.deleted_at === null,
        );
        const existing = products[index];
        if (index < 0 || !existing) return Promise.resolve(null);
        const updated = productSchema.parse({
          ...existing,
          ...input,
          updated_at: "2026-08-03T10:01:00.000Z",
        });
        products[index] = updated;
        return Promise.resolve(updated);
      },
      softDelete(userId, productId) {
        const product = products.find(
          (candidate) =>
            candidate.id === productId &&
            candidate.user_id === userId &&
            candidate.deleted_at === null,
        );
        if (!product) return Promise.resolve(false);
        product.is_active = false;
        product.deleted_at = "2026-08-03T10:02:00.000Z";
        return Promise.resolve(true);
      },
    };
    return repository;
  };
}

describe("Mentionish API", () => {
  let products: Product[];
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    products = [makeProduct("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", userTwo)];
    app = createApp((token) => {
      if (token === "user-one-token")
        return Promise.resolve({ userId: userOne });
      if (token === "user-two-token")
        return Promise.resolve({ userId: userTwo });
      throw new Error("invalid");
    }, createMemoryRepositoryFactory(products));
  });

  it("serves health without authentication", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("allows only the configured dashboard origin", async () => {
    const allowed = await request(app)
      .get("/health")
      .set("origin", "http://localhost:3000");
    const denied = await request(app)
      .get("/health")
      .set("origin", "https://untrusted.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects a missing bearer token", async () => {
    const response = await request(app).get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("derives the user from a verified token", async () => {
    const response = await request(app)
      .get("/api/me")
      .set("authorization", "Bearer user-one-token");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { id: userOne } });
  });

  it("creates a product with normalized keywords", async () => {
    const response = await request(app)
      .post("/api/products")
      .set("authorization", "Bearer user-one-token")
      .send({
        name: " Acme ",
        description: " Finds customer conversations. ",
        keywords: [" Customer   Churn ", "REDUCE CHURN"],
      });

    expect(response.status).toBe(201);
    const createdProduct = productSchema.parse(
      (response.body as unknown as { data: unknown }).data,
    );
    expect(createdProduct).toMatchObject({
      user_id: userOne,
      name: "Acme",
      description: "Finds customer conversations.",
      keywords: ["customer churn", "reduce churn"],
      voice_persona: null,
    });
  });

  it("rejects keywords that collide after normalization", async () => {
    const response = await request(app)
      .post("/api/products")
      .set("authorization", "Bearer user-one-token")
      .send({
        name: "Acme",
        description: "Description",
        keywords: ["Customer Churn", " customer   churn "],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("lists only active products owned by the authenticated user", async () => {
    products.push(
      makeProduct("cccccccc-cccc-4ccc-8ccc-cccccccccccc", userOne),
      makeProduct("dddddddd-dddd-4ddd-8ddd-dddddddddddd", userOne, {
        is_active: false,
      }),
    );

    const response = await request(app)
      .get("/api/products")
      .set("authorization", "Bearer user-one-token");

    expect(response.status).toBe(200);
    const listedProducts = productSchema
      .array()
      .parse((response.body as unknown as { data: unknown }).data);
    expect(listedProducts).toHaveLength(1);
    expect(listedProducts[0]?.user_id).toBe(userOne);
  });

  it("does not reveal another user's product", async () => {
    const response = await request(app)
      .get("/api/products/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
      .set("authorization", "Bearer user-one-token");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("updates and soft-deletes an owned product", async () => {
    const productId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    products.push(makeProduct(productId, userOne));

    const updateResponse = await request(app)
      .patch(`/api/products/${productId}`)
      .set("authorization", "Bearer user-one-token")
      .send({ keywords: [" New   Keyword "] });
    expect(updateResponse.status).toBe(200);
    const updatedProduct = productSchema.parse(
      (updateResponse.body as unknown as { data: unknown }).data,
    );
    expect(updatedProduct.keywords).toEqual(["new keyword"]);

    const deleteResponse = await request(app)
      .delete(`/api/products/${productId}`)
      .set("authorization", "Bearer user-one-token");
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(app)
      .get(`/api/products/${productId}`)
      .set("authorization", "Bearer user-one-token");
    expect(getResponse.status).toBe(404);
  });
});
