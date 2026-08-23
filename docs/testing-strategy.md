# Testing strategy

## Release goals

Tests prove local startup, data durability, discovery quality, connector isolation, secret safety, and the no-posting invariant.

## Unit tests

- phrase normalization, grouping, exclusions, and query planning;
- context-preserving query compilation, including audience/domain terms in generic pains;
- balanced demand-lane query selection so one outcome family cannot consume the whole source budget;
- phrase kind/source/rationale persistence through product save and restart;
- source normalization for posts/comments/replies;
- deduplication and thread relationships;
- deterministic relevance and ranking;
- AI structured-output validation;
- feedback aggregation;
- sparse-feedback ranking guardrails and bounded calibration;
- scan state transitions and cancellation;
- connector command allowlists, arguments, deadlines, and output limits;
- secret redaction;
- extension URL/editor adapters.

Offline tier-policy tests are necessary but do not validate retrieval quality. Before a discovery release, review at least one real configured scan's exact queries, per-query source yield, top rejected candidates, and known high-intent searches against manual source search. A release fails this check when relevant source conversations exist but the generated queries omit the core outcome or return predominantly unrelated domains.

## Embedded database tests

Each test uses a unique temporary database. Cover:

- clean bootstrap;
- ordered migrations and idempotent restart;
- upgrade from every supported schema version;
- foreign keys and uniqueness;
- product/source/opportunity lifecycle;
- draft version conflicts;
- feedback append-only behavior;
- latest-feedback projection and reversible feedback-driven skip status;
- candidate-review append-only corrections, latest-label metrics, and privacy-minimized export;
- partial scan persistence;
- backup creation and restore verification;
- migration failure without data loss.

No test may write user data into the repository.

## API tests

- loopback status and first-run state;
- request-token/origin enforcement;
- secret endpoints never return plaintext;
- provider and connector validation;
- unlimited product CRUD;
- phrase suggestion does not mutate;
- Scan all/Scan product idempotency;
- progress, partial failure, cancellation, and retry;
- opportunity filtering and lifecycle;
- extension pairing/revocation;
- absence of platform write endpoints.

## Connector tests

CI uses recorded sanitized fixtures and fake executable runners. It never uses real cookies.

For each adapter:

- command and argument contract;
- timeout/output overflow/nonzero exit;
- authentication/rate-limit classification;
- post and comment/reply parsing;
- one-thread-per-query comment expansion before repeated-query depth;
- missing optional metrics;
- malformed/untrusted output;
- pagination/result budget;
- deletion/tombstone;
- fallback selection;
- kill switch;
- Unknown/Caution/Paused/Blocked Account Safety derivation;
- Retry-After and cooldown enforcement;
- stop on 401/403/429, challenge/CAPTCHA, restriction, and explicit denial;
- assertions that account/session/proxy/user-agent rotation and enforcement-bypassing fallback are absent;
- stale/missing community rules and eligibility context.

Release smoke tests for Reddit/X require explicit owner approval, an authentic account in good standing, and read-only queries. Alternate accounts must never be used to evade a restriction. Installed/configured is insufficient; verify a real current item.

## AI evaluation

Run `npm run quality:benchmark` for the offline deterministic tier-policy gate. The versioned set requires balanced tier coverage, at least 90% actionable precision, at least 85% actionable recall, and zero non-actionable reply-queue leakage. This gate uses frozen classifier dimensions and therefore does not replace live provider or retrieval evaluation.

Maintain provider-neutral labeled sets for:

- phrase suggestion usefulness and breadth;
- opportunity precision/recall;
- comments requiring thread context;
- exclusions and keyword collisions;
- spam/promotion rejection;
- provider structured-output parity;
- draft usefulness, honesty, and non-promotional tone;
- product/link leakage;
- latency and approximate usage.

The initial target is precision-first: at least 80 percent of the top ten results in the curated acceptance set should be judged useful, with no automatic platform action.

## Dashboard end-to-end tests

- first launch without login;
- provider setup/skip;
- platform enablement and risk acknowledgement;
- Account Safety Center evidence, cooldown, block, and recovery states;
- community-rule/eligibility preflight before assisted replies;
- product creation with and without AI suggestions;
- Scan product and Scan all;
- partial source failure while HN succeeds;
- review/feedback/draft/edit/manual reply;
- restart and data persistence;
- backup;
- keyboard and screen-reader status behavior.

## Extension tests

- pairing/revocation;
- origin and scope enforcement;
- SPA URL changes;
- supported editor discovery;
- insertion with existing text;
- copy fallback;
- revoked/local API unavailable;
- explicit assertions that submit/vote/like/follow/message actions are absent.

## Dependency and supply-chain tests

- lockfile required;
- license inventory before public release;
- audit direct dependencies;
- pin sensitive connector versions where possible;
- no install scripts added without review;
- build on clean Windows, macOS, and Linux machines.

## Acceptance journey

On a clean supported machine:

1. clone, install, start;
2. browser opens without login;
3. local DB is created;
4. configure one AI provider or skip;
5. HN is Ready; optionally configure Reddit;
6. create a product and accept/edit suggested phrases;
7. manually scan that product;
8. receive recent post/comment opportunities with reasons;
9. mark feedback, generate/edit a draft;
10. copy/insert without submission;
11. mark replied manually;
12. restart and confirm persistence;
13. create a usable backup.

No Docker, hosted database, Redis, scheduler, payment, or Mentionish account participates.

## Release gates

- full checks pass;
- clean-machine acceptance on all supported OSes;
- no secret leakage;
- no shell injection;
- no automatic scan;
- no platform write path;
- documented connector risk and current official policy links;
- fail-closed enforcement signals with no identity/control bypass;
- database migration/backup recovery verified;
- top-result relevance quality meets the labeled threshold.
