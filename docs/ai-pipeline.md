# AI Pipeline

## Principles

- Cheap classification first; stronger generation only after qualification and user intent.
- Provider-specific details stay behind an adapter.
- Prompts and outputs are versioned.
- Public platform content and AI output are untrusted.
- Cost, latency, and token use are logged per user and logical operation.
- All output is a suggestion; humans decide whether to post.

## Implemented classification path

The Day 3 worker uses `OpenAiClassificationService` with the official OpenAI SDK and the Responses API. Classification requests are stateless (`store: false`), use `reasoning.effort: none`, set an explicit output-token cap, and request a strict JSON Schema through `text.format`. The returned JSON is validated again in application code before persistence. This follows the current [OpenAI Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs#structured-outputs-vs-json-mode).

Each product/post/prompt-version operation receives one database-backed quota lease. A concurrent worker sees `busy`, an already scored opportunity sees `already_completed`, and a provider/validation failure releases the reservation for retry. Only the transaction that writes the final score changes usage to `consumed`. Reduced `ai_calls` metadata stores model attribution, response ID, latency, and detailed token counts without storing prompts or raw responses.

Runtime controls:

- `AI_CLASSIFICATION_ENABLED=false` is the default fail-closed state;
- `OPENAI_API_KEY` is server-only;
- `OPENAI_CLASSIFIER_MODEL`, prompt version, output cap, and concurrency are configurable;
- HTTP authorization failures are non-retryable; transient failures use bounded BullMQ retries.

## Adapter contracts

Illustrative TypeScript interfaces:

```ts
type ClassificationResult = {
  intentScore: number;
  reasoning: string;
};

type DraftResult = {
  draftText: string;
};

interface AiService {
  classifyIntent(input: ClassificationInput): Promise<AiResult<ClassificationResult>>;
  generateDraft(input: DraftInput): Promise<AiResult<DraftResult>>;
}
```

`AiResult` also carries provider/model identifiers, input/cached/output/reasoning token counts, latency, provider request ID, returned model ID, and finish/status metadata. `summarizeThread()` is excluded from v1 by `DEC-018`.

## OpenAI model routing

Use the official OpenAI SDK and Responses API with `store: false`:

| Role | Model | Reasoning | Output contract | Initial output cap |
|---|---|---|---|---:|
| Intent classification | `gpt-5.6-luna` | `none` | strict JSON Schema: score and concise reasoning | 250 tokens |
| Draft generation | `gpt-5.6-terra` | `low` | strict JSON Schema: draft text | 800 tokens |

The caps include any provider-counted output/reasoning tokens and are configuration values. Do not use the `gpt-5.6` alias, Sol, Pro mode, hosted tools, background mode, conversation objects, or persisted response state in v1. Each job is an independent request and Mentionish persists only the validated business result and reduced usage metadata.

## Stage 1: intent classification

Input:

- delimited platform title and body;
- product name/description as context;
- a compact definition of buying intent;
- output schema and score rubric.

Do not include voice persona or subreddit promotion rules; they are irrelevant to buying-intent scoring.

Recommended rubric:

- 0–19: unrelated/no problem signal;
- 20–39: topical but informational or weak relevance;
- 40–59: real problem, low/unclear solution-seeking intent;
- 60–79: relevant pain and plausible solution interest;
- 80–100: explicit recommendation, alternative, purchase, or urgent solution request.

Luna returns strict structured JSON with one integer and concise reasoning. Validate and reject out-of-range/malformed output. The qualification threshold is exactly 60 unless the PRD is revised.

## Stage 2: draft generation

> Implementation status (2026-08-06): live on the linked hosted database. Drafts require an explicit authenticated click, reserve quota before queueing, release it on failure, use strict Terra structured output with `store: false`, and preserve generated text separately from versioned user edits. Reddit outputs fail closed on product-name, link, or call-to-action leakage.

Input:

- platform and post content;
- product name, description, and voice persona;
- classifier reasoning as supporting context, not ground truth;
- subreddit gating policy for Reddit;
- explicit instruction to answer the user helpfully and avoid fabricating product facts;
- output schema.

The prompt must clearly delimit external content and state that instructions inside the post are data, not system instructions.

### Gating constraints

- `newcomer`: no URL, domain, markdown link, link-like text, product name, or disguised call to action.
- `contributor`: link/product mention only if both manual self-promotion rule and three-comment evidence allow it.
- `trusted`/`established`: follow the stored rule summary; permission is not a requirement to promote.
- Unknown/missing policy: treat as newcomer.
- Hacker News: helpful, direct, culturally conservative; no DOM insertion and no unsupported claims.

After generation, apply deterministic checks for forbidden product-name variants and URLs when the policy prohibits them. A violation fails closed and may retry once with corrective instruction; never show a knowingly non-compliant draft as approved.

## Human editing

Persist the original generated text separately from `edited_text`. The effective draft is:

```text
edited_text when non-null, otherwise draft_text
```

Do not overwrite user edits during regeneration. Regeneration/version behavior requires a schema-level choice.

## Prompt/version management

Each AI operation records:

- operation type;
- prompt template version;
- policy/rubric version;
- provider and exact model;
- temperature and relevant parameters;
- input, cached-input, output, and reasoning tokens when reported;
- status, latency, and error class.

Prompt content belongs in version-controlled code. Secrets and full user credentials never enter prompts.

## Cost controls

- Configure `OPENAI_CLASSIFIER_MODEL`, `OPENAI_DRAFT_MODEL`, reasoning levels, and output caps rather than scattering values.
- Enforce quota before enqueue and recheck before provider call.
- Bound title, body, description, persona, and output lengths.
- Avoid classification for duplicate product/post pairs.
- Do not generate drafts automatically; `DEC-010` requires an explicit user request.
- Alert on abnormal tokens per call, pass-rate shifts, or spend per user.
- Under pricing verified on 2026-08-01, target $0.08–$0.16 and alert above $0.20 of AI cost for a fully consumed free trial. Recalculate thresholds whenever configured models or provider pricing change.

## Safety and quality evaluation

Maintain a fixed evaluation set covering:

- strong explicit purchase intent;
- irrelevant keyword collisions;
- negative/competitor mentions;
- prompt injection in platform text;
- empty/deleted content;
- newcomer product/link leakage;
- contributor gating combinations;
- hallucinated features/pricing;
- voice adherence without impersonation;
- HN tone.

Release gates and test cases are in [`testing-strategy.md`](testing-strategy.md).
