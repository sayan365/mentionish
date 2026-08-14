import express from "express";
import {
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
} from "@mentionish/database";
import request from "supertest";
import { describe, expect, it } from "vitest";
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
          matched_phrases: ["customer discovery"],
        }),
      ],
    });
    database.close();
  });
});
