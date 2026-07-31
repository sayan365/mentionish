# Testing Strategy

## Quality goals

Tests must prove tenant isolation, cost/quota correctness, safe retries, payment idempotency, useful AI behavior, and the no-auto-post boundary. A visually complete dashboard is not releasable if these fail.

## Test levels

### Unit tests

- keyword normalization and matching;
- Reddit/HN payload normalization and URL/post-ID parsing;
- score/output schema validation;
- karma effective-policy calculation and forbidden-content checks;
- opportunity status transitions;
- plan/usage calculations;
- webhook event mapping after signature-library verification;
- API input schemas and error mapping.

### Database tests

- migrations from an empty database;
- unique constraints and foreign keys;
- opportunity/draft ownership invariants;
- RLS with User A, User B, anonymous, and service-role contexts;
- concurrent quota reservation;
- duplicate webhook/AI operation prevention;
- status/check constraints and cascade/soft-delete behavior.

### Integration tests

Use recorded/synthetic fixtures and mock servers for Reddit, HN, OpenAI, and Dodo:

- pagination, timeout, 401 refresh, 429 backoff, 5xx retry;
- shared post matching multiple products/users;
- classifier pass/fail threshold at 59/60;
- draft enqueue, retry, quota release/consume;
- Responses requests pin Luna/none for classification and Terra/low for drafting, set `store: false`, apply strict schemas/output caps, and record detailed usage;
- checkout allowlisting and redirect validation;
- raw-body webhook signature, duplicates, order, and failure recovery;
- extension-token create/use/revoke.

Never hit production payment or posting endpoints in automated tests.

### API contract tests

Cover authentication, ownership, validation, cursors, idempotency keys, error shapes, and every status transition. Verify non-owned resources return no identifying data.

### Frontend end-to-end tests

- sign up/sign in and profile provisioning;
- product onboarding and validation;
- opportunity filters/feed and empty/loading/error states;
- draft generation progress, editing, conflict, and quota exhaustion;
- HN copy/open flow;
- Reddit open flow;
- usage and analytics display;
- checkout pending state until webhook;
- Reddit app-token acquisition/refresh success and failure, secret redaction, credential revocation, and global scheduler stop;
- global polling budget, keyword batching, jitter, returned rate-limit headers, 429 backoff, kill switch, and deduplication;
- extension-token lifecycle.

### Extension tests

- manifest validation and minimum permissions;
- URL parsing across supported Reddit forms;
- SPA navigation;
- shadow DOM isolation;
- textarea and contenteditable fixtures;
- input event registration;
- existing-text preservation;
- invalid/revoked token;
- no-match, multiple-match, API-down, and unsupported-editor fallback;
- static/dynamic assertion that no submit click/form submission/write API exists.

Run a manual smoke pass against current Reddit layouts before publishing because DOM fixtures can drift.

## AI evaluation

Maintain a versioned fixture dataset with expected score bands and policy constraints. It should cover strong/weak intent, keyword collision, sarcasm, competitors, prompt injection, missing bodies, HN tone, and every karma stage.

Release criteria:

- output parses to the declared schema;
- scores remain within 0–100;
- no newcomer sample contains product name/link;
- no gated contributor sample violates its conditions;
- drafts do not invent product capabilities supplied nowhere in context;
- token/output length remains within budget.
- the classifier and draft model roles each meet their labeled quality target before a configured model change ships;
- a fully consumed free trial stays below the current $0.20 AI-cost alert threshold under representative token distributions.

Statistical quality targets require an initial labeled dataset and owner approval. Avoid claiming deterministic semantic accuracy from a generative model.

## Security tests

- expired/wrong-audience JWT;
- cross-user resource enumeration and mutations;
- RLS bypass attempts;
- forged/replayed webhooks;
- extension-token brute force/rate limiting and revocation;
- stored/reflected XSS in post, reasoning, persona, and draft fields;
- prompt injection;
- redirect/SSRF allowlist;
- secrets absent from client bundles and logs.

## Performance and resilience

- opportunity feed query at expected launch data size;
- scan batch under rate limits;
- queue backpressure and worker restart;
- concurrent duplicate scheduler runs;
- concurrent draft requests at last quota unit;
- API latency under ordinary dashboard load;
- database recovery from failed transaction.

## MVP acceptance scenario

1. Two users create separate products, including a shared keyword.
2. Synthetic Reddit/HN items are discovered once globally.
3. Each user receives only their matching opportunity and usage charge.
4. Score 59 is skipped; score 60 is qualified.
5. A newcomer draft contains no product or link and records tokens.
6. A second concurrent draft cannot double-charge.
7. User edits through dashboard/extension without overwriting conflicts.
8. Reddit insertion fills but never submits; HN only copies.
9. Forged Dodo webhook changes nothing; a verified duplicate changes entitlement once.
10. Analytics reflect user-declared workflow and no engagement sync.

## Release gates

- All hard constraints (`SAFE-*`) pass.
- No critical/high security issue remains.
- Required RLS and webhook idempotency tests pass.
- AI policy evaluation passes.
- External contract verification is documented.
- Staging smoke test and backup/restore check succeed.
- Open decisions that block implementation are approved.
