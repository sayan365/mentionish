import express from "express";
import {
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
} from "@mentionish/database";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createLocalScanRouter } from "./routes.js";
import type { LocalScanEngine } from "./engine.js";

describe("local scan audit routes", () => {
  it("returns retained candidate decisions for a scan", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const products = new LocalProductRepository(database);
    const product = products.create({
      name: "Mentionish",
      description: "Find relevant conversations.",
      phrases: [{ phrase: "customer discovery", kind: "problem" }],
    });
    const discovery = new LocalDiscoveryRepository(database);
    const scan = discovery.createScan("product", [product.id], 1);
    discovery.saveClassification(
      scan.id,
      product.id,
      {
        platform: "reddit",
        externalId: "post-1",
        itemType: "story",
        subreddit: "SaaS",
        title: "Need customer discovery advice",
        body: "How can I find my first customers?",
        author: "founder",
        url: "https://www.reddit.com/r/SaaS/comments/post-1/test/",
      },
      ["customer discovery"],
      "customer discovery help",
      {
        overallScore: 42,
        label: "rejected",
        tier: "irrelevant",
        audienceFit: 55,
        problemFit: 50,
        solutionSeeking: 35,
        buyingIntent: 20,
        replyAppropriateness: 55,
        reasoning: "Relevant pain but no tool intent.",
      },
      "rejected",
    );
    const app = express();
    app.use(express.json());
    app.use(
      "/api/scans",
      createLocalScanRouter({} as LocalScanEngine, discovery),
    );

    const response = await request(app).get(`/api/scans/${scan.id}/candidates`);

    expect(response.status).toBe(200);
    const body: unknown = JSON.parse(response.text);
    expect(body).toEqual({
      data: [
        expect.objectContaining({
          platform: "reddit",
          subreddit: "SaaS",
          intent_score: 42,
          decision: "rejected",
          human_review: null,
          matched_phrases: ["customer discovery"],
        }),
      ],
    });

    const candidateId = (body as { data: Array<{ id: string }> }).data[0]!.id;
    const reviewResponse = await request(app)
      .post(`/api/scans/candidates/${candidateId}/review`)
      .send({ human_tier: "helpful_conversation", note: "False negative" });
    expect(reviewResponse.status).toBe(201);

    const reviewed = await request(app).get(`/api/scans/${scan.id}/candidates`);
    const reviewedBody = JSON.parse(reviewed.text) as {
      data: Array<{ human_review: unknown }>;
    };
    expect(reviewedBody.data[0]!.human_review).toMatchObject({
      human_tier: "helpful_conversation",
      note: "False negative",
    });

    const evaluation = await request(app).get(`/api/scans/evaluation`);
    const evaluationBody = JSON.parse(evaluation.text) as { data: unknown };
    expect(evaluationBody.data).toMatchObject({
      reviewed: 1,
      false_negatives: 1,
      actionable_recall_percent: 0,
    });

    const exported = await request(app).get(`/api/scans/evaluation/export`);
    const exportedBody = JSON.parse(exported.text) as {
      data: { cases: unknown[] };
    };
    const exportedCase = exportedBody.data.cases[0] as Record<string, unknown>;
    expect(Object.hasOwn(exportedCase, "title")).toBe(false);
    expect(JSON.stringify(exportedBody)).not.toContain("founder");

    const correction = await request(app)
      .post(`/api/scans/candidates/${candidateId}/review`)
      .send({ human_tier: "irrelevant", note: "Decision was correct" });
    expect(correction.status).toBe(201);
    expect(
      database
        .prepare("SELECT count(*) AS count FROM candidate_human_reviews")
        .get(),
    ).toEqual({ count: 2 });
    const correctedEvaluation = await request(app).get(`/api/scans/evaluation`);
    const correctedEvaluationBody = JSON.parse(correctedEvaluation.text) as {
      data: unknown;
    };
    expect(correctedEvaluationBody.data).toMatchObject({
      reviewed: 1,
      agreement: 1,
      exact_accuracy_percent: 100,
      false_negatives: 0,
    });
    database.close();
  });
});

describe("Reddit safety routes", () => {
  it("returns the canonical safety snapshot and supports a manual pause", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    const discovery = new LocalDiscoveryRepository(database);
    const caution = {
      enabled: true,
      profile: "dedicated-reddit",
      kill_switch: false,
      verified_account: { username: "u/founder" },
      safety: {
        state: "caution",
        reason: "A bounded read succeeded.",
        read_allowed: true,
        last_native_account_check_at: "2026-08-24T10:00:00.000Z",
        last_live_read_at: "2026-08-24T10:00:00.000Z",
        last_failure_at: null,
        cooldown_until: null,
        recent_queries_24h: 2,
        recent_scans_24h: 1,
        events: [],
      },
    };
    const paused = {
      ...caution,
      kill_switch: true,
      safety: {
        ...caution.safety,
        state: "paused",
        reason: "Reddit was paused manually.",
        read_allowed: false,
      },
    };
    const pauseReddit = vi.fn(() => paused);
    const engine = {
      redditConfiguration: vi.fn(() => caution),
      pauseReddit,
    } as unknown as LocalScanEngine;
    const app = express();
    app.use(express.json());
    app.use("/api/scans", createLocalScanRouter(engine, discovery));

    const configuration = await request(app).get("/api/scans/reddit/config");
    expect(configuration.status).toBe(200);
    expect(JSON.parse(configuration.text)).toMatchObject({
      data: { safety: { state: "caution", read_allowed: true } },
    });

    const pause = await request(app).post("/api/scans/reddit/pause");
    expect(pause.status).toBe(200);
    expect(JSON.parse(pause.text)).toMatchObject({
      data: {
        kill_switch: true,
        safety: { state: "paused", read_allowed: false },
      },
    });
    expect(pauseReddit).toHaveBeenCalledOnce();
    database.close();
  });
});
