import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("API authentication boundary", () => {
  const app = createApp((token) => {
    if (token !== "valid-token") throw new Error("invalid");
    return Promise.resolve({
      userId: "2b7f1be2-c494-4b23-9515-c8f8ca54d381",
    });
  });

  it("serves health without authentication", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
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
      .set("authorization", "Bearer valid-token");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { id: "2b7f1be2-c494-4b23-9515-c8f8ca54d381" },
    });
  });
});
