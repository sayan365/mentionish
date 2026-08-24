import {
  LocalDiscoveryRepository,
  LocalProductRepository,
  openLocalDatabase,
} from "@mentionish/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalAiSettingsService } from "../ai/local-routes.js";
import { localOwnerId } from "../middleware/auth.js";
import { LocalDraftQueue } from "./local-drafting.js";
import { createLocalOpportunityRepositoryFactory } from "./local-repository.js";

const databases: Array<ReturnType<typeof openLocalDatabase>> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("local draft generation", () => {
  it("persists a generated draft, operation outcome, and append-only edits", async () => {
    const database = openLocalDatabase({ filePath: ":memory:" });
    databases.push(database);
    const products = new LocalProductRepository(database);
    const discovery = new LocalDiscoveryRepository(database);
    const product = products.create({
      name: "Founder helper",
      description: "Helps founders find relevant customer conversations.",
      voicePersona: "Useful and concise.",
      phrases: [{ phrase: "find first customers", kind: "problem" }],
    });
    const scan = discovery.createScan("product", [product.id], 1);
    discovery.saveClassification(
      scan.id,
      product.id,
      {
        platform: "hackernews",
        externalId: "draft-target",
        itemType: "story",
        title: "Ask HN: How did you find your first customers?",
        body: "I launched last week and need practical advice.",
        author: "founder",
        url: "https://news.ycombinator.com/item?id=draft-target",
      },
      ["find first customers"],
      "find first customers",
      {
        overallScore: 88,
        label: "potential_buyer",
        tier: "direct_opportunity",
        audienceFit: 90,
        problemFit: 92,
        solutionSeeking: 90,
        buyingIntent: 65,
        replyAppropriateness: 95,
        reasoning:
          "The author is asking for practical customer discovery help.",
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
    const aiSettings = {
      snapshot: () => ({
        configured: true,
        provider: "openai" as const,
        drafting_model: "draft-model",
      }),
    } as unknown as LocalAiSettingsService;
    const generateReplyDraft = vi.fn().mockResolvedValue({
      value: {
        draft_text:
          "Start with five people who already feel this problem, ask about their current workflow, and use their wording to refine the next outreach round.",
      },
      provider: "openai" as const,
      model: "draft-model",
      latencyMilliseconds: 25,
      usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 },
    });
    const queue = new LocalDraftQueue(discovery, aiSettings, () => ({
      generateReplyDraft,
    }));

    const requested = await repository.requestDraft(
      localOwnerId,
      opportunity.id,
      "draft-v2",
      "11111111-1111-4111-8111-111111111111",
      false,
    );
    expect(requested.status).toBe("queued");
    if (requested.status !== "queued") throw new Error("Draft was not queued.");
    await queue.enqueue(requested.operationId);
    await vi.waitFor(async () => {
      expect(
        (await repository.getOperation(localOwnerId, requested.operationId))
          ?.status,
      ).toBe("succeeded");
    });

    const page = await repository.list(localOwnerId, product.id, {
      status: ["drafted"],
      min_score: 0,
      limit: 20,
    });
    const draft = page?.items[0]?.draft;
    expect(draft).toMatchObject({
      generation_number: 1,
      version: 1,
      prompt_version: "draft-v2",
    });
    expect(generateReplyDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: "Founder helper",
        platform: "hackernews",
      }),
    );
    if (!draft) throw new Error("Generated draft was not returned.");

    const updated = await repository.updateDraft(
      localOwnerId,
      draft.id,
      `${draft.edited_text}\n\nKeep the first reply focused on their question.`,
      draft.version,
    );
    expect(updated.status).toBe("updated");
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM draft_versions WHERE draft_id=?",
        )
        .get(draft.id),
    ).toEqual({ count: 2 });
    expect(
      await repository.updateDraft(
        localOwnerId,
        draft.id,
        "A stale edit.",
        draft.version,
      ),
    ).toEqual({ status: "conflict" });
  });
});
