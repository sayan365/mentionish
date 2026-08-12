# Dashboard UI specification

## Experience

Mentionish should feel like a finished local product, not an infrastructure console. It leads with useful conversations, explains setup problems in plain language, and keeps advanced connector details in Settings.

The interface must never imply that scanning or posting happens automatically.

## Navigation

- Overview
- Products
- Conversations
- Scans
- Analytics
- Settings

The persistent sidebar shows compact connector readiness, Account Safety state, and the currently validated AI provider. There is no account avatar, plan label, billing link, quota meter, or sign-out action.

## First-run setup

A full-page guided setup replaces authentication:

1. Welcome — local/privacy promise and what will be created.
2. AI — choose OpenAI, Anthropic, or Skip for now; test key.
3. Platforms — HN available, Reddit/X optional with risk/readiness details.
4. Product — product context and phrase suggestions.
5. Ready — summary and Start first scan.

Progress is saved locally. Users can leave and resume. Skipping optional configuration must not trap the user.

## Overview

Overview answers:

- Is Mentionish ready?
- What needs setup?
- When was the last manual scan?
- How many new useful conversations exist?
- Which products and platforms need attention?
- What should I do next?

Primary actions:

- Scan all products;
- Add product;
- Review conversations.

Connector/provider problems appear as actionable cards, not raw errors.

## Products

Product list shows active state, phrase count, enabled platforms, last scan, and new opportunities. Each product has Scan product, Edit, Pause, and Delete.

Product editor sections:

- Product: name, description, audience, optional URL.
- Search phrases: grouped editable chips/list with inclusion/exclusion.
- Suggest with AI: explicit button, loading state, grouped recommendations and rationales.
- Voice: optional drafting guidance.
- Platforms: per-product selection constrained by globally enabled sources.

AI suggestions are a review step. Nothing is silently accepted.

## Scans

Scans screen contains:

- Scan all button;
- product and platform selectors;
- freshness and Advanced limits;
- active operation panel;
- recent history.

Active progress displays stages: planning, reading sources, deduplicating, matching, AI ranking, saving. Show per-platform items inspected/accepted and partial errors. Cancel remains visible.

Use Start scan, not Trigger, Run job, Poll, Worker, or Scheduler.

## Conversations

Default tab: New. Other tabs: Saved, Drafted, Replied, Skipped.

Filters:

- product;
- platform;
- post/comment/reply;
- score;
- date;
- feedback/status.

Cards show content type, community/thread, author, age, optional public metrics, matched phrases, relevance score/reason, excerpt, and source link. Actions are Useful, Save, Generate draft, Open source, Skip, and Mark replied when appropriate.

Active results are presented in three review tiers. Best opportunities contain direct product needs with clear category or solution interest. Possible matches contain useful adjacent conversations that merit human judgment. Other keyword matches contains every retained candidate from the product's latest scan that matched an approved phrase but failed the qualification rules; these cards expose the scores, reason, matched phrases, and source link but do not offer AI drafting. Cross-post duplicates are collapsed before display.

The detail drawer/page shows parent/thread context, community-rule freshness, known eligibility, and repeated-text/link warnings before drafting. User edits are never discarded on navigation or generation failure.

## Analytics

Local 7/30-day metrics:

- items inspected;
- qualified;
- marked useful;
- drafted;
- skipped;
- manually replied;
- draft-to-reply conversion;
- product/platform/content-type breakdown.

Label Replied as self-reported and show no platform engagement claims.

## Settings

Sections:

### AI providers

Provider cards show configured/not configured, masked key, models, last validation, Test, Replace, and Remove. Explain that calls and billing go directly to the provider account.

### Platforms

HN card is stable. Reddit/X cards show Experimental, enabled toggle, accepted-risk state, Agent Reach status, selected upstream backend, login state, live-read state, Test read, setup instructions, and kill switch.

### Account Safety

Per-platform evidence states are Unknown, Caution, Paused, and Blocked—never Safe. Show last native/live check, authentication and enforcement signals, Retry-After/cooldown, local scan volume, self-reported replies, optional public age/karma context, community-rule freshness, and the exact stop/recovery action. Link current official policies and show their last review date.

### Extension

Pair/revoke extension, permission explanation, supported sites, last seen, and no-submit guarantee.

### Data and privacy

Database location, Create backup, Open data folder, retention settings, Delete local data, and external-data disclosure.

### Diagnostics

App version, database migration version, connector executable versions, provider health, and Copy sanitized diagnostics.

## Required states

Every async screen supports initial loading, progress, success, honest empty, partial success, setup required, authentication expired, rate limited, cancelled, failed, and retry.

Errors contain a user action. Technical details are expandable and sanitized.

## Accessibility and responsive behavior

- semantic headings, navigation, forms, progress, dialogs, and status regions;
- complete keyboard operation and visible focus;
- labels not color alone;
- reduced-motion support;
- readable contrast;
- responsive single-column cards and filters;
- destructive actions confirm exact local consequences.
