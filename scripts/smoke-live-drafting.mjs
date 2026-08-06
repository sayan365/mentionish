import console from "node:console";
import process from "node:process";
import { OpenAiDraftingService } from "../packages/ai/dist/index.js";
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
const service = new OpenAiDraftingService({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_DRAFT_MODEL || "gpt-5.6-terra",
  maxOutputTokens: 800,
});
const result = await service.generateDraft({
  operationId: "10000000-0000-4000-8000-000000000001",
  opportunityId: "10000000-0000-4000-8000-000000000002",
  userId: "10000000-0000-4000-8000-000000000003",
  promptVersion: "draft-v1",
  platform: "reddit",
  subreddit: "saas",
  productName: "Mentionish",
  productDescription:
    "Find high-intent public community conversations for a product.",
  voicePersona: "Helpful, plain-spoken, concise",
  classificationReason:
    "The author explicitly asks how to find relevant conversations without wasting time.",
  title: "How do you find useful customer conversations?",
  body: "I am spending hours searching communities and most posts are irrelevant. How would you narrow this down?",
});
console.log(
  JSON.stringify(
    {
      ok: true,
      requested_model: result.requestedModel,
      returned_model: result.returnedModel,
      latency_ms: result.latencyMilliseconds,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      reasoning_tokens: result.usage.reasoningTokens,
      total_tokens: result.usage.totalTokens,
      draft_text: result.value.draft_text,
    },
    null,
    2,
  ),
);
