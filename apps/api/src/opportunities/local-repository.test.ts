import {
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
} from "@mentionish/database";
import { afterEach, describe, expect, it } from "vitest";
import { localOwnerId } from "../middleware/auth.js";
import { createLocalOpportunityRepositoryFactory } from "./local-repository.js";

const databases: Array<ReturnType<typeof openLocalDatabase>> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("local opportunity feedback", () => {
  it("fails closed until a current native Reddit review is recorded", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    discovery.saveRedditVerification("dedicated-reddit", {
      username: "u/founder",
      totalKarma: 120,
      accountCreated: "2024-01-01T00:00:00.000Z",
      verifiedEmail: true,
    });
    const product = products.create({
      name: "Preflight product",
      description: "Find Reddit conversations where founders need help.",
      phrases: [{ phrase: "find first customers", kind: "problem" }],
    });
    const scan = discovery.createScan("product", [product.id], 1);
    discovery.saveClassification(
      scan.id,
      product.id,
      {
        platform: "reddit",
        externalId: "preflight-post",
        itemType: "story",
        subreddit: "SaaS",
        title: "How can I find my first customers?",
        body: "I launched recently and need a practical way to reach users.",
        author: "founder",
        url: "https://reddit.com/r/SaaS/comments/preflight-post",
      },
      ["find first customers"],
      "find first customers",
      {
        overallScore: 82,
        label: "worth_helping",
        tier: "helpful_conversation",
        audienceFit: 85,
        problemFit: 85,
        solutionSeeking: 75,
        buyingIntent: 45,
        replyAppropriateness: 90,
        reasoning: "A founder is actively asking for customer discovery help.",
      },
      "qualified",
    );
    const opportunity = database
      .prepare("SELECT id FROM opportunities WHERE product_id=?")
      .get(product.id) as { id: string };
    const repository = createLocalOpportunityRepositoryFactory(
      products,
      discovery,
    )("local-token");

    expect(
      await repository.getReplyPreflight(localOwnerId, opportunity.id),
    ).toMatchObject({
      state: "review_required",
      insertion_allowed: false,
      community: "SaaS",
      account_context: { username: "founder", total_karma: 120 },
    });

    const current = await repository.recordReplyPreflightReview(
      localOwnerId,
      opportunity.id,
      {
        thread_reviewed: true,
        rules_reviewed: true,
        native_eligibility: "allowed",
        promotion_policy: "allowed",
        ai_content_policy: "unknown",
        unnecessary_links_removed: true,
        disclosure_acknowledged: true,
        manual_submit_acknowledged: true,
      },
    );
    expect(current).toMatchObject({
      state: "caution",
      insertion_allowed: true,
    });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM community_rule_snapshots")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM reply_preflight_reviews")
        .get(),
    ).toEqual({ count: 1 });
    database
      .prepare("UPDATE community_rule_snapshots SET expires_at=?")
      .run("2020-01-01T00:00:00.000Z");
    expect(
      await repository.getReplyPreflight(localOwnerId, opportunity.id),
    ).toMatchObject({ state: "review_required", insertion_allowed: false });

    const blocked = await repository.recordReplyPreflightReview(
      localOwnerId,
      opportunity.id,
      {
        thread_reviewed: true,
        rules_reviewed: true,
        native_eligibility: "allowed",
        promotion_policy: "restricted",
        ai_content_policy: "allowed",
        unnecessary_links_removed: true,
        disclosure_acknowledged: true,
        manual_submit_acknowledged: true,
      },
    );
    expect(blocked).toMatchObject({
      state: "blocked",
      insertion_allowed: false,
    });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM reply_preflight_reviews")
        .get(),
    ).toEqual({ count: 2 });
  });

  it("keeps append-only history and exposes only the latest rating", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    const product = products.create({
      name: "Feedback product",
      description: "Find conversations worth helping.",
      phrases: [{ phrase: "find first customers", kind: "problem" }],
    });
    const scan = discovery.createScan("product", [product.id], 1);
    discovery.saveClassification(
      scan.id,
      product.id,
      {
        platform: "reddit",
        externalId: "feedback-post",
        itemType: "story",
        title: "How can I find my first customers?",
        body: "I launched recently and need a practical way to reach users.",
        author: "founder",
        url: "https://reddit.com/comments/feedback-post",
      },
      ["find first customers"],
      "find first customers",
      {
        overallScore: 82,
        label: "worth_helping",
        tier: "helpful_conversation",
        audienceFit: 85,
        problemFit: 85,
        solutionSeeking: 75,
        buyingIntent: 45,
        replyAppropriateness: 90,
        reasoning: "A founder is actively asking for customer discovery help.",
      },
      "qualified",
    );
    const opportunity = database
      .prepare("SELECT id FROM opportunities WHERE product_id=?")
      .get(product.id) as { id: string };
    const repository = createLocalOpportunityRepositoryFactory(
      products,
      discovery,
    )("local-token");

    const rejected = await repository.recordFeedback!(
      localOwnerId,
      opportunity.id,
      { verdict: "not_relevant", reason: "weak_intent", note: null },
    );
    expect(rejected?.verdict).toBe("not_relevant");
    expect(
      database
        .prepare("SELECT status FROM opportunities WHERE id=?")
        .get(opportunity.id),
    ).toEqual({ status: "skipped" });

    const corrected = await repository.recordFeedback!(
      localOwnerId,
      opportunity.id,
      {
        verdict: "useful",
        reason: "strong_problem",
        note: "The initial rating was too strict.",
      },
    );
    expect(corrected?.verdict).toBe("useful");
    expect(
      database
        .prepare("SELECT count(*) AS count FROM conversation_feedback")
        .get(),
    ).toEqual({ count: 2 });
    expect(
      database
        .prepare("SELECT status FROM opportunities WHERE id=?")
        .get(opportunity.id),
    ).toEqual({ status: "new" });

    const page = await repository.list(localOwnerId, product.id, {
      status: ["new"],
      min_score: 0,
      limit: 20,
    });
    expect(page?.items[0]?.feedback).toMatchObject({
      verdict: "useful",
      reason: "strong_problem",
      note: "The initial rating was too strict.",
    });
  });

  it("does not calibrate sparse feedback and applies bounded adjustments after enough evidence", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    const product = products.create({
      name: "Calibration product",
      description: "Find founders asking how to reach their first customers.",
      phrases: [{ phrase: "find first customers", kind: "problem" }],
    });
    const scan = discovery.createScan("product", [product.id], 5);
    const repository = createLocalOpportunityRepositoryFactory(
      products,
      discovery,
    )("local-token");

    for (let index = 0; index < 5; index += 1) {
      discovery.saveClassification(
        scan.id,
        product.id,
        {
          platform: "reddit",
          externalId: `calibration-${index}`,
          itemType: "story",
          title: `Customer discovery question ${index}`,
          body: "I need a practical way to find my first customers.",
          author: "founder",
          url: `https://reddit.com/comments/calibration-${index}`,
        },
        ["find first customers"],
        "find first customers",
        {
          overallScore: 72,
          label: "worth_helping",
          tier: "helpful_conversation",
          audienceFit: 75,
          problemFit: 80,
          solutionSeeking: 70,
          buyingIntent: 30,
          replyAppropriateness: 80,
          reasoning: "A founder is asking for practical help.",
        },
        "qualified",
      );
      const opportunity = database
        .prepare(
          "SELECT id FROM opportunities WHERE product_id=? AND scanned_post_id=(SELECT id FROM scanned_posts WHERE external_id=?)",
        )
        .get(product.id, `calibration-${index}`) as { id: string };
      await repository.recordFeedback!(localOwnerId, opportunity.id, {
        verdict: "not_relevant",
        reason: "weak_intent",
        note: null,
      });

      if (index === 1) {
        const sparse = discovery.feedbackCalibration(product.id, "reddit");
        expect(sparse.reviewed).toBe(2);
        expect(sparse.sourceAdjustment).toBe(0);
        expect(sparse.phraseAdjustments.size).toBe(0);
      }
    }

    const calibrated = discovery.feedbackCalibration(product.id, "reddit");
    expect(calibrated.reviewed).toBe(5);
    expect(calibrated.sourceAdjustment).toBe(-3);
    expect(calibrated.phraseAdjustments.get("find first customers")).toBe(-5);
  });
});
