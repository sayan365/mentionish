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
- optional user-approved structured discovery profile covering pains, situations, outcomes, alternatives, buying/helpful/market signals, exclusions, and community hints;
- preferred language;
- bounded suggestion count.

Output:

- grouped phrase;
- kind;
- short rationale;
- optional exclusion flag.

The generator targets a precision-oriented 20-phrase set: seven direct pain statements, six help-seeking questions, four comparison/tool-seeking phrases, two category-aligned workflow phrases, and one audience-with-a-specific-problem phrase. Most are two to six meaningful words and express one search intent. Generic founder, growth, marketing, or acquisition language is excluded unless it is the product's direct problem. The user can add suggestions individually or explicitly replace the phrase editor with the reviewed set; generation never silently mutates product settings.

The product-context enhancer produces both clearer prose and a structured discovery profile. Nothing is applied automatically. The user reviews the description, audience options, positive discovery signals, likely false positives, and community hints, then explicitly applies the complete profile. The approved profile is reused by phrase generation, query planning, lexical evidence, and classification so those stages do not interpret the same raw description independently.

## Adaptive scan planning

An explicitly started scan asks the classification model for sixteen ephemeral search hypotheses spanning pain, help, workflow, alternatives, audience situations, and buying intent. The prompt includes bounded product context, approved phrases, and recent query outcome summaries. It tells the model to avoid recently exhausted wording and explore directly related language rather than repeat the approved phrases.

The local planner combines those hypotheses with deterministic phrase expansions and persisted query-run memory. It favors unseen exploration, reuses previously productive searches only after a cooldown, rotates older searches, and falls back to deterministic queries if the AI plan is unavailable or malformed. Generated hypotheses never modify the product automatically.

### classifyRelevance

Input:

- product context;
- matched phrases;
- source item;
- limited parent/thread context;
- local feedback summary without unnecessary personal data.

Output:

- independent 0-through-100 scores for audience fit, problem fit, solution seeking, buying intent, and reply appropriateness;
- explicit checks that the author has a current need the product directly solves and is not primarily promoting a competing solution;
- concise reason;
- an application-computed overall ranking score and deterministic direct-opportunity, helpful-conversation, market-signal, or irrelevant tier; the legacy qualification label remains for feed compatibility;
- prompt/schema version.

Application-owned rules reserve Best opportunities for a direct product need plus an explicit request, comparison, or budget for the same product category. Requests for adjacent software can enter Possible matches but cannot become Best opportunities. Strong adjacent customer-acquisition questions may also enter Possible matches for human review; unrelated needs and competing-solution promotions are rejected. Same-author cross-posts with the same normalized title are treated as one conversation.

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

The product form captures the ideal customer separately from the product problem and supplies both to phrase generation and classification. It explains that phrases should resemble language customers actually use. Suggestions are grouped and editable. The UI avoids presenting broad one-word terms as high-quality defaults and offers exclusions to reduce noise.

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
