# Embedded database schema

## Storage contract

The default database is an embedded SQLite file inside the user's application-data directory. Startup creates the directory, enables foreign keys and WAL mode, and runs ordered idempotent migrations.

The repository root must not contain user data. Tests use temporary databases and delete them after completion.


The current local schema is migration version 9. Version 2 introduced `scanned_posts`, `opportunities`, and `scan_runs`; version 3 added the aggregate scan funnel; version 4 added per-source counters and bounded classification audits; version 5 separates overall fit from audience fit, problem fit, solution seeking, buying intent, reply appropriateness, and the final qualification label; version 6 adds adaptive query-run memory and scan-plan summaries; version 7 adds direct, helpful, market-signal, and irrelevant discovery tiers plus source-query lineage; version 8 adds tier-specific scan counters; version 9 adds the user-approved structured discovery profile. Drafts, explicit user feedback, connector checks, safety events, and extension pairings listed below remain forward schema targets unless explicitly marked implemented.
## Core tables

### app_meta

- schema_version
- installation_id
- created_at
- updated_at

Contains no credentials.

### settings

- key
- non_secret_value_json
- updated_at

Stores platform enablement, model choices, scan defaults, thresholds, and UI preferences. Secret values are references to the local secret store, never plaintext.

### products

- id
- name
- description
- discovery_profile_json (approved audiences, pains, situations, outcomes, alternatives, intent signals, exclusions, and community hints)
- audience
- url
- voice_persona
- is_active
- created_at
- updated_at
- deleted_at

There is no plan-derived product limit.

### product_phrases

- id
- product_id
- phrase
- normalized_phrase
- kind: problem, question, alternative, category, audience, exclusion
- source: manual, ai_suggested
- rationale
- is_active
- created_at
- updated_at

Unique active normalized phrase per product and kind.

### scan_runs

- id
- scope: all, product
- status: pending, running, cancelling, cancelled, succeeded, failed
- product_ids_json
- queries_total and queries_completed
- items_fetched plus Reddit/Hacker News source totals
- candidates_matched, candidates_rejected, candidates_qualified
- candidates_direct, candidates_helpful, candidates_market_signals
- Reddit/Hacker News matched, rejected, and qualified totals
- opportunities_found
- current_message
- sanitized error_code and error_message
- started_at
- completed_at
- created_at and updated_at

No recurrence or next-run field exists.

### scan_run_products and scan_run_platforms

Join/detail tables record selected products, per-platform backend, queries attempted, items inspected, items accepted, rate-limit/auth state, duration, and sanitized error.

### scan_candidate_evaluations

- id
- scan_id
- product_id
- scanned_post_id
- matched_phrases_json
- intent_score (legacy column name; now the deterministic overall-fit ranking score)
- qualification_label: rejected, worth_helping, potential_buyer
- discovery_tier: direct_opportunity, helpful_conversation, market_signal, irrelevant
- need_scope: core, adjacent, unrelated
- author_state: asking, comparing, sharing, promoting
- market_research_value
- source_query
- audience_fit, problem_fit, solution_seeking, buying_intent, reply_appropriateness
- concise reasoning
- decision: rejected, qualified (aggregate funnel compatibility)
- created_at

Lexical and bounded conceptual candidates evaluated by AI are retained. Audit rows outside the ten most recent scans are pruned, and source rows with no opportunity or retained audit are removed.

### discovery_query_runs (implemented adaptive memory)

Records every executed source query with product, platform, strategy (`explore`, `proven`, `rotate`, or `fallback`), fetched-item count, AI-reviewed candidate count, qualified count, and execution time. Aggregating these rows gives later scans bounded local memory without changing approved product phrases.

### scanned_posts (implemented source-item table)

- id
- platform
- external_id
- content_type: post, comment, reply
- parent_external_id
- thread_external_id
- community
- title
- body
- author
- url
- source_created_at
- source_updated_at
- source_checked_at
- deleted_at
- public_metrics_json
- metadata_json
- content_hash

Unique on platform and external_id. Raw credentials and private browser data are forbidden.

### opportunities

- id
- product_id
- source_item_id
- scan_run_id
- matched_phrase_ids_json
- deterministic_score
- ai_score
- final_score
- reasoning
- status: new, saved, drafted, replied, skipped
- skipped_reason
- qualified_at
- replied_at
- created_at
- updated_at

Unique on product_id and source_item_id.

### drafts and draft_versions

Draft stores the current version and provider metadata. Draft versions preserve generated/edited text, version number, prompt version, and timestamps. No draft can cause a platform write.

### feedback_events

- id
- product_id
- opportunity_id
- action: useful, not_relevant, save, skip, replied
- reason
- created_at

Append-only local learning evidence.

### ai_calls

Stores provider, model, operation type, prompt version, token/usage metadata when returned, latency, status, and sanitized error category. It stores neither provider key nor hidden provider reasoning.

### connector_checks

Stores platform, backend, check type, status, checked_at, latency, and sanitized message. A live-read success is required for Ready.

### account_safety_events

Append-only evidence for experimental platforms: platform, signal type, severity, HTTP/tool category, sanitized reason, optional cooldown-until, source operation, observed_at, and acknowledged_at. It stores no cookies and does not claim to mirror the platform's internal account status.

Derived states are Unknown, Caution, Paused, or Blocked. State is computed from current evidence and kill-switch/auth state rather than saved as a permanent health score.

### community_rule_snapshots

Stores platform, community, canonical rules URL, retrieved_at, expires_at, rule hash, structured flags, and a bounded source excerpt or summary. Flags include promotion/link policy, disclosure/flair requirements, AI-content policy, eligibility visibility, restricted/private state, and megathread/solicitation constraints. Stale or missing data must be shown as unknown.

### local_activity_events

Records user-visible scan starts, bounded queries, draft generations, extension insertions, and self-reported replies. Platform submissions are never inferred. These events support repetition and activity warnings, not a purported safe quota.

### extension_pairings

Stores hashed token, label, scopes, created_at, last_used_at, and revoked_at. Plaintext is returned once.

## Indexes

Required indexes cover:

- active products;
- phrases by product and normalized phrase;
- scan runs by created_at/status;
- source platform/external identity;
- source freshness and content type;
- opportunities by product/status/final score/qualified time;
- drafts by opportunity/current version;
- feedback by product/action/time;
- connector check by platform/time;
- account safety events by platform/severity/time;
- community rules by platform/community/expiry;
- local activity by platform/type/time.

## Migrations and backup

Migrations run inside transactions where supported and are recorded in a schema_migrations table. Startup never silently destroys an incompatible database.

Before a destructive migration, Mentionish creates a timestamped backup. Settings provides Create backup and Open data folder. Restore is initially a documented offline operation.

## Removed hosted concepts

Local schema has no user profiles, RLS policies, plan entitlements, usage quotas, payment customers, webhook events, hosted JWTs, scheduler locks, or global cross-user deduplication.
