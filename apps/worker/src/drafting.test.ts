import type { AiResult, DraftResult, DraftingService } from "@mentionish/ai";
import { describe, expect, it, vi } from "vitest";
import {
  runDraftGeneration,
  type DraftAiCallInput,
  type DraftClaim,
  type DraftRepository,
} from "./drafting.js";

const target = {
  operationId: "00000000-0000-4000-8000-000000000010",
  opportunityId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  productId: "00000000-0000-4000-8000-000000000003",
  promptVersion: "draft-v1",
  platform: "hackernews" as const,
  subreddit: null,
  productName: "Mentionish",
  productDescription: "Discovery",
  voicePersona: null,
  classificationReason: "Recommendation request",
  title: "Need a tool",
  body: "Any suggestions?",
};
const result: AiResult<DraftResult> = {
  value: {
    draft_text:
      "Start with a narrow set of high-intent phrases and review false positives weekly.",
  },
  provider: "openai",
  requestedModel: "gpt-5.6-terra",
  returnedModel: "gpt-5.6-terra",
  providerResponseId: "resp_draft",
  status: "completed",
  latencyMilliseconds: 20,
  usage: {
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 30,
    reasoningTokens: 5,
    totalTokens: 130,
  },
};
class FakeRepository implements DraftRepository {
  calls: DraftAiCallInput[] = [];
  failed = vi.fn(() => Promise.resolve(true));
  completed = vi.fn(() =>
    Promise.resolve("00000000-0000-4000-8000-000000000099"),
  );
  constructor(
    readonly claimValue: DraftClaim = {
      status: "claimed",
      operationId: target.operationId,
      usageEventId: "00000000-0000-4000-8000-000000000004",
      leaseToken: "00000000-0000-4000-8000-000000000005",
      attemptNumber: 1,
      target,
    },
  ) {}
  claim(): Promise<DraftClaim> {
    return Promise.resolve(this.claimValue);
  }
  recordAiCall(input: DraftAiCallInput): Promise<string> {
    this.calls.push(input);
    return Promise.resolve("00000000-0000-4000-8000-000000000006");
  }
  complete = this.completed;
  fail = this.failed;
}
const options = { requestedModel: "gpt-5.6-terra", outputTokenCap: 800 };
describe("runDraftGeneration", () => {
  it("persists one successful draft and consumes the reservation", async () => {
    const repository = new FakeRepository();
    const service: DraftingService = {
      generateDraft: vi.fn(() => Promise.resolve(result)),
    };
    await expect(
      runDraftGeneration(target.operationId, service, repository, options),
    ).resolves.toEqual({
      status: "succeeded",
      draftId: "00000000-0000-4000-8000-000000000099",
    });
    expect(repository.calls[0]?.status).toBe("succeeded");
    expect(repository.completed).toHaveBeenCalledOnce();
    expect(repository.failed).not.toHaveBeenCalled();
  });
  it("does not call the model for an inactive operation", async () => {
    const generateDraft = vi.fn(() => Promise.resolve(result));
    const repository = new FakeRepository({ status: "already_completed" });
    await expect(
      runDraftGeneration(
        target.operationId,
        { generateDraft },
        repository,
        options,
      ),
    ).resolves.toEqual({ status: "already_completed" });
    expect(generateDraft).not.toHaveBeenCalled();
  });
  it("records failure and releases the reservation", async () => {
    const repository = new FakeRepository();
    const service: DraftingService = {
      generateDraft: vi.fn(() =>
        Promise.reject(new Error("provider unavailable")),
      ),
    };
    await expect(
      runDraftGeneration(target.operationId, service, repository, options),
    ).rejects.toThrow("provider unavailable");
    expect(repository.calls[0]).toMatchObject({
      status: "failed",
      errorClass: "Error",
    });
    expect(repository.failed).toHaveBeenCalledOnce();
    expect(repository.completed).not.toHaveBeenCalled();
  });
});
