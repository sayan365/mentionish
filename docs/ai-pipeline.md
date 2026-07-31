# AI Pipeline

## Principles

- Cheap classification first; stronger generation only after qualification and user intent.
- Provider-specific details stay behind an adapter.
- Prompts and outputs are versioned.
- Public platform content and AI output are untrusted.
- Cost, latency, and token use are logged per user and logical operation.
- All output is a suggestion; humans decide whether to post.

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
  summarizeThread(input: SummaryInput): Promise<AiResult<SummaryResult>>;
}
```

`AiResult` also carries provider/model identifiers, token counts, latency, provider request ID, and finish/status metadata. `summarizeThread()` remains unused pending `DEC-018`.

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

The model returns structured JSON with one integer and concise reasoning. Validate and reject out-of-range/malformed output. The qualification threshold is exactly 60 unless the PRD is revised.

## Stage 2: draft generation

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
- input/output tokens;
- status, latency, and error class.

Prompt content belongs in version-controlled code. Secrets and full user credentials never enter prompts.

## Cost controls

- Configure model roles (`CLASSIFIER_MODEL`, `DRAFT_MODEL`) rather than scattering model names.
- Enforce quota before enqueue and recheck before provider call.
- Bound title, body, description, persona, and output lengths.
- Avoid classification for duplicate product/post pairs.
- Do not generate drafts automatically unless `DEC-010` changes.
- Alert on abnormal tokens per call, pass-rate shifts, or spend per user.

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
