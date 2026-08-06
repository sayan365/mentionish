# AI providers and pipeline

## Principles

- AI is optional; deterministic discovery continues without it.
- Users provide and pay for their own provider credentials.
- OpenAI and Anthropic share provider-neutral domain contracts.
- OpenRouter and user-supplied OpenAI-compatible gateways share the same chat-completions boundary; native OpenAI Responses and Anthropic Messages remain available.
- Provider settings select separate classification/analysis and drafting models.
- Every AI call is explicit or part of an explicitly started scan.
- Product/source content and AI output are untrusted.
- Mentionish stores useful output and usage metadata, not provider secrets or hidden chain-of-thought.
- Provider failure must not discard retrieved source items.

## Provider contracts

### suggestPhrases

Input:

- product name and description;
- optional audience, URL summary supplied by the user, and existing phrases;
- preferred language;
- bounded suggestion count.

Output:

- grouped phrase;
- kind;
- short rationale;
- optional exclusion flag.

This function never mutates product settings.

### classifyRelevance

Input:

- product context;
- matched phrases;
- source item;
- limited parent/thread context;
- local feedback summary without unnecessary personal data.

Output:

- integer score 0 through 100;
- concise reason;
- categorical signals for audience fit, problem fit, intent, reply opportunity, recency, and noise;
- prompt/schema version.

### generateDraft

Input:

- product context and voice;
- source item and thread context;
- relevance reason;
- platform/community guidance;
- user-selected draft intent.

Output:

- reply text;
- optional caution;
- prompt/schema version.

No provider receives platform cookies or unrelated local data.

## Implemented provider settings (Phase 3)

Settings stores:

- provider ID;
- secret-store reference and masked suffix;
- classification/analysis model (also used for phrase suggestions);
- drafting model;
- discovered model catalog plus manual model-ID fallback;
- optional OpenAI-compatible base URL;
- validation status/time;
- optional spending/usage warning thresholds.

The app should provide recommended defaults but permit supported model changes. A model/provider change runs compatibility validation before becoming active.

## Keyword recommendation experience

The product form explains that phrases should resemble language customers actually use. Suggestions are grouped and editable. The UI avoids presenting broad one-word terms as high-quality defaults and offers exclusions to reduce noise.

The user can regenerate, request more for one group, or explain that a suggestion is poor. Accepted suggestions are copied into the ordinary editable phrase field and are saved only when the user completes the product form.

## Classification policy

The default qualification threshold is configurable, initially 60. High engagement cannot rescue weak product relevance. A direct question from the right audience may outrank a popular generic post.

Classification uses structured output and bounded tokens. Provider-specific reasoning controls, retention flags, and privacy identifiers remain inside adapters.

## Draft policy

Drafts lead with useful context, not a pitch. They must not fabricate product experience, metrics, customer claims, or community rules. Product names and URLs are omitted when platform/community guidance says promotion is inappropriate.

Draft generation, regeneration, and editing are explicit. No generated output enters a native editor without another user action.

## Usage transparency

Record provider, model, operation, input/output token or usage fields when returned, latency, status, and sanitized error. Dashboard analytics can show local usage estimates but must not claim authoritative provider billing.

## Evaluation

Maintain labeled fixtures for:

- phrase usefulness and diversity;
- relevance precision and recall across posts/comments;
- spam and keyword-collision rejection;
- structured-output validity;
- draft helpfulness and non-promotional tone;
- product-name/link leakage;
- provider parity;
- latency and approximate cost.

Release quality prioritizes precision: showing fewer genuinely useful conversations is better than flooding the founder.