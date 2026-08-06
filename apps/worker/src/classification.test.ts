import type {
  AiResult,
  ClassificationResult,
  ClassificationService,
} from "@mentionish/ai";
import { describe, expect, it, vi } from "vitest";
import {
  runIntentClassification,
  type AiCallInput,
  type ClassificationClaim,
  type ClassificationRepository,
} from "./classification.js";

const target = {
  opportunityId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  productId: "00000000-0000-4000-8000-000000000003",
  promptVersion: "intent-v1",
  platform: "hackernews" as const,
  productName: "Mentionish",
  productDescription: "Community opportunity discovery.",
  title: "Looking for a monitoring tool",
  body: "Any recommendations?",
};

const result: AiResult<ClassificationResult> = {
  value: { intent_score: 60, reasoning: "Explicit recommendation request." },
  provider: "openai",
  requestedModel: "gpt-5.6-luna",
  returnedModel: "gpt-5.6-luna",
  providerResponseId: "resp_1",
  status: "completed",
  latencyMilliseconds: 25,
  usage: {
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 20,
    reasoningTokens: 0,
    totalTokens: 120,
  },
};

class FakeRepository implements ClassificationRepository {
  calls: AiCallInput[] = [];
  completed = vi.fn(() => Promise.resolve(true));
  released = vi.fn(() => Promise.resolve(true));

  constructor(
    readonly claim: ClassificationClaim = {
      status: "claimed",
      usageEventId: "00000000-0000-4000-8000-000000000004",
      leaseToken: "00000000-0000-4000-8000-000000000005",
      attemptNumber: 1,
      target,
    },
  ) {}

  claimClassification(): Promise<ClassificationClaim> {
    return Promise.resolve(this.claim);
  }

  recordAiCall(input: AiCallInput): Promise<string> {
    this.calls.push(input);
    return Promise.resolve("00000000-0000-4000-8000-000000000006");
  }

  completeClassification = this.completed;
  releaseClassification = this.released;
}

const options = {
  promptVersion: "intent-v1",
  requestedModel: "gpt-5.6-luna",
  outputTokenCap: 250,
};

describe("runIntentClassification", () => {
  it("commits score 60 as qualified and records one successful call", async () => {
    const repository = new FakeRepository();
    const service: ClassificationService = {
      classifyIntent: vi.fn(() => Promise.resolve(result)),
    };

    await expect(
      runIntentClassification(
        target.opportunityId,
        service,
        repository,
        options,
      ),
    ).resolves.toEqual({ status: "succeeded", score: 60, qualified: true });
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.status).toBe("succeeded");
    expect(repository.completed).toHaveBeenCalledOnce();
    expect(repository.released).not.toHaveBeenCalled();
  });

  it("does not call the provider for an existing lease or exhausted quota", async () => {
    const classifyIntent = vi.fn(() => Promise.resolve(result));
    const service: ClassificationService = { classifyIntent };
    for (const status of ["busy", "quota_exhausted"] as const) {
      const repository = new FakeRepository({ status });
      await expect(
        runIntentClassification(
          target.opportunityId,
          service,
          repository,
          options,
        ),
      ).resolves.toEqual({ status });
    }
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it("records failure, releases quota, and preserves the retry error", async () => {
    const repository = new FakeRepository();
    const service: ClassificationService = {
      classifyIntent: vi.fn(() =>
        Promise.reject(new Error("provider unavailable")),
      ),
    };

    await expect(
      runIntentClassification(
        target.opportunityId,
        service,
        repository,
        options,
      ),
    ).rejects.toThrow("provider unavailable");
    expect(repository.calls[0]).toEqual(
      expect.objectContaining({ status: "failed", errorClass: "Error" }),
    );
    expect(repository.released).toHaveBeenCalledOnce();
    expect(repository.completed).not.toHaveBeenCalled();
  });
});
