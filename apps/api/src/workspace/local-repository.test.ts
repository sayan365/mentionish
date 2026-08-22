import {
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
  type LocalScannedItem,
} from "@mentionish/database";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalWorkspaceRepositoryFactory } from "./local-repository.js";

const databases: Array<ReturnType<typeof openLocalDatabase>> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function qualifiedItem(
  discovery: LocalDiscoveryRepository,
  scanId: string,
  productId: string,
  item: LocalScannedItem,
): void {
  discovery.saveClassification(
    scanId,
    productId,
    item,
    ["find customers"],
    "find customers",
    {
      overallScore: 78,
      label: "worth_helping",
      tier: "helpful_conversation",
      audienceFit: 80,
      problemFit: 75,
      solutionSeeking: 70,
      buyingIntent: 45,
      replyAppropriateness: 85,
      reasoning: "A relevant conversation worth reviewing.",
    },
    "qualified",
  );
}

function sourceItem(
  externalId: string,
  platform: "reddit" | "hackernews",
): LocalScannedItem {
  return {
    platform,
    externalId,
    itemType: "story",
    title: `Customer discovery conversation ${externalId}`,
    body: "How can I find customers without relying on paid advertising?",
    author: `founder-${externalId}`,
    url:
      platform === "reddit"
        ? `https://reddit.com/comments/${externalId}`
        : `https://news.ycombinator.com/item?id=${externalId}`,
  };
}

describe("local workspace analytics", () => {
  it("calculates real workflow and source totals with product and date filters", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    const first = products.create({
      name: "First product",
      description: "A customer discovery product.",
      phrases: [{ phrase: "find customers", kind: "problem" }],
    });
    const second = products.create({
      name: "Second product",
      description: "Another customer discovery product.",
      phrases: [{ phrase: "find customers", kind: "problem" }],
    });
    const firstScan = discovery.createScan("product", [first.id], 4);
    for (const [externalId, platform] of [
      ["reddit-new", "reddit"],
      ["hn-drafted", "hackernews"],
      ["reddit-posted", "reddit"],
      ["hn-skipped", "hackernews"],
    ] as const) {
      qualifiedItem(
        discovery,
        firstScan.id,
        first.id,
        sourceItem(externalId, platform),
      );
    }
    const secondScan = discovery.createScan("product", [second.id], 1);
    qualifiedItem(
      discovery,
      secondScan.id,
      second.id,
      sourceItem("older-hn", "hackernews"),
    );

    const now = new Date().toISOString();
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    database
      .prepare(
        `UPDATE opportunities SET status='drafted',updated_at=?
          WHERE scanned_post_id=(SELECT id FROM scanned_posts WHERE external_id='hn-drafted')`,
      )
      .run(now);
    database
      .prepare(
        `UPDATE opportunities SET status='posted',posted_at=?,updated_at=?
          WHERE scanned_post_id=(SELECT id FROM scanned_posts WHERE external_id='reddit-posted')`,
      )
      .run(now, now);
    database
      .prepare(
        `UPDATE opportunities
            SET status='skipped',skipped_reason='Not relevant right now.',updated_at=?
          WHERE scanned_post_id=(SELECT id FROM scanned_posts WHERE external_id='hn-skipped')`,
      )
      .run(now);
    database
      .prepare(
        `UPDATE opportunities SET created_at=?,classified_at=?,updated_at=?
          WHERE product_id=?`,
      )
      .run(tenDaysAgo, tenDaysAgo, tenDaysAgo, second.id);
    for (const [id, externalId, verdict, reason] of [
      [
        "10000000-0000-4000-8000-000000000001",
        "reddit-new",
        "useful",
        "strong_problem",
      ],
      [
        "10000000-0000-4000-8000-000000000002",
        "hn-drafted",
        "not_relevant",
        "weak_intent",
      ],
      [
        "10000000-0000-4000-8000-000000000003",
        "hn-skipped",
        "not_relevant",
        "wrong_audience",
      ],
    ] as const) {
      database
        .prepare(
          `INSERT INTO conversation_feedback(
             id,opportunity_id,product_id,verdict,reason,note,created_at
           )
           SELECT ?,opportunity.id,opportunity.product_id,?,?,NULL,?
             FROM opportunities opportunity
             JOIN scanned_posts post ON post.id=opportunity.scanned_post_id
            WHERE post.external_id=?`,
        )
        .run(id, verdict, reason, now, externalId);
    }

    const repository = createLocalWorkspaceRepositoryFactory(
      products,
      discovery,
    )("local-token");
    await expect(
      repository.analytics("local-owner", first.id, 7),
    ).resolves.toEqual({
      window_days: 7,
      product_id: first.id,
      found: 4,
      qualified: 4,
      drafted: 1,
      posted: 1,
      skipped: 1,
      draft_to_post_percent: 100,
      platforms: { reddit: 2, hackernews: 2 },
      feedback: {
        reviewed: 3,
        useful: 1,
        not_relevant: 2,
        useful_percent: 33.3,
        top_negative_reason: "weak_intent",
      },
    });
    await expect(
      repository.analytics("local-owner", undefined, 7),
    ).resolves.toMatchObject({
      found: 4,
      qualified: 4,
    });
    await expect(
      repository.analytics("local-owner", undefined, 30),
    ).resolves.toMatchObject({
      found: 5,
      qualified: 5,
      platforms: { reddit: 2, hackernews: 3 },
    });
    await expect(
      repository.analytics(
        "local-owner",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        7,
      ),
    ).resolves.toBeNull();
  });
});
