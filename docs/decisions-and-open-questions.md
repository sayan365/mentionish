# Approved Product and Engineering Decisions

The owner delegated the MVP decisions in this register on 2026-08-01. These decisions are authoritative implementation requirements unless the owner records a later replacement here. There are no unresolved product decisions blocking the initial scaffold.

## Product priority

Mentionish is Reddit-first. Reddit discovery, scoring, karma safety, drafting, and the extension define the core product. Hacker News is secondary, not a substitute. `DEC-021` records the owner’s accepted operating risk for live Reddit access.

## Approved decisions

| ID | Topic | Approved decision |
|---|---|---|
| DEC-001 | Classification quota unit | One unit is consumed for one Stage 1 AI classification of a unique product/post pair. Fetching, keyword filtering, deduplication, retries, and already-classified pairs consume no additional unit. Product copy says “AI classifications,” not “scans.” |
| DEC-002 | Usage periods | Use an append-only reservation/consumption ledger. Renewable allowances use explicit UTC entitlement periods. One-time allowances never reset. Never erase counters at a reset boundary. |
| DEC-003 | Free plan | A verified user gets one 14-day discovery trial starting when their first product activates: 1 active product, 5 keywords, 5 tracked subreddits, 50 one-time classifications, and 5 one-time drafts. Scanning stops after 14 days or quota exhaustion; results remain readable. No card is required. |
| DEC-004 | Paid plans and price | Founder Lifetime launches at USD 49 for at most the first 100 purchases: lifetime product access, 1 active product, 10 keywords, 20 tracked subreddits, 3,600 total classifications, and 100 total drafts. These AI credits do not replenish; after exhaustion the founder may buy a future credit pack or move to a recurring plan. Growth Monthly is modeled but its UI is deferred: USD 19/month, 3 active products, 25 keywords and 50 tracked subreddits per product, 1,500 classifications/month, and 100 drafts/month. Prices, limits, and provider IDs live in versioned server configuration; existing buyers retain their purchased plan version. |
| DEC-005 | Contributor evidence | Store user-attested contribution entries keyed by Mentionish user and subreddit, with optional comment URL, occurrence time, note, and audit timestamps. Derive the qualifying count from entries; do not use an unaudited editable counter. Promotion at contributor stage requires three qualifying entries. |
| DEC-006 | Karma ownership | Community standing is keyed by Mentionish user and subreddit, not product. A user may optionally record one self-reported Reddit username for their own reference, but Mentionish does not OAuth-verify it. Multiple Reddit identities and switching remain out of scope. |
| DEC-007 | Subreddit rules | Use a curated shared rule record with `rules_summary`, `rules_source_url`, `rules_verified_at`, `self_promo_allowed`, and any threshold. Drafts use versioned policy snapshots. Rules older than 90 days are stale and force newcomer-safe output until reviewed. |
| DEC-008 | HN coverage | HN remains secondary. V1 indexes top-level `newstories` and `askstories` items and does not claim comment-level monitoring. Product copy calls them “HN items.” |
| DEC-009 | Unknown subreddit policy | A missing, stale, or conflicting rule resolves to newcomer-safe behavior: no product name, link, or promotional call to action. |
| DEC-010 | Draft initiation | Stage 2 is user-triggered. Qualified opportunities enter `new`; a successful requested draft moves them to `drafted`. Never generate drafts speculatively. |
| DEC-011 | Extension lookup | Extract a normalized Reddit post ID and call the current-user-scoped lookup. Never trust an opportunity ID from a page URL. If multiple products match, return a list for user selection. |
| DEC-012 | Extension persistence | Sidebar edits autosave through PATCH with optimistic concurrency. Enable “Insert into Reddit” only after the current text saves; copy is the failure fallback. Insertion never marks an item posted. |
| DEC-013 | Funnel metrics | Count distinct opportunities with a successful draft versus distinct drafted opportunities later marked posted. Regenerations do not inflate the denominator. “Posted” is always labeled user-reported. |
| DEC-014 | Product deletion | Use a 30-day recoverable soft delete that immediately stops scans and hides the product. Then purge its private opportunities, drafts, and configuration, retaining only reduced records needed for reconciliation. |
| DEC-015 | Limits | Apply DEC-003/004 plan limits. Product name: 80 characters; description: 2,000; voice persona: 1,000; keyword: 2–80. Normalize case/whitespace and reject duplicates. |
| DEC-016 | AI retention | Use OpenAI Responses with `store: false`. Send only the necessary source excerpt and minimum product/policy context. Do not log raw prompts/responses; retain structured results, hashes, token/cost metadata, and prompt version. Disclose OpenAI’s default abuse-monitoring retention of up to 30 days; claim Zero Data Retention only after explicit approval. OpenAI API data is not used for training by default, and Mentionish never trains models on customer data. |
| DEC-017 | Notifications | Show billing, refund, cancellation, and security-sensitive events in-app and email them through Resend. Record and retry notification delivery; email failure never changes entitlement truth. |
| DEC-018 | Thread summaries | Remove `summarizeThread()` from the v1 public interface and do not call or bill it. Add it only with a later approved workflow and quota model. |
| DEC-019 | Hosting | Deploy Next.js to Cloudflare Workers using OpenNext. Deploy Express API, singleton scheduler, and persistent BullMQ worker as separate Railway processes. Use hosted Supabase and Upstash. Cloudflare Pages is acceptable only for a fully static build; SSR targets Workers. |
| DEC-020 | Retention | Revalidate Reddit content before reuse/display; update or delete it as soon as a source change is detected. Honor Reddit/User deletion requests within 10 days and purge all Reddit-derived content if access ends. HN source text expires 90 days after last active match; logs after 30 days; AI metadata after 12 months; revoked/expired extension credentials after 90 days. Extension tokens expire after 90 days. Account deletion revokes access immediately and purges private product data within 30 days. Reduced financial records are retained 7 years, subject to law. |
| DEC-021 | Reddit operating-risk acceptance | Use one server-side Reddit application credential and app-level read token for discovery. Users do not connect Reddit to Mentionish. Poll conservatively with global query budgets and jitter, obey returned rate-limit/retry headers, cache/deduplicate globally, and stop promptly on credential or authorization failure. The owner accepts that app-level versus per-user OAuth does not change the underlying commercial-policy/enforcement risk and does not require a separate commercial agreement as a launch gate. Never scrape, evade limits, rotate credentials to bypass enforcement, use Reddit write APIs, or auto-post. Keep discovery kill-switchable and preserve HN as a secondary fallback. |
| DEC-022 | Dashboard sign-in | Use Supabase email magic-link authentication for v1. Require verified email before the trial starts. Password auth, social login, and user-facing Reddit OAuth are out of scope. The Chrome extension relies on the user’s existing Reddit browser session only for user-initiated DOM insertion; it never reads or transmits Reddit credentials. |
| DEC-023 | AI provider and routing | Use the OpenAI Responses API behind the existing role-based adapter. Pin `gpt-5.6-luna` with `reasoning.effort: none` for intent classification and `gpt-5.6-terra` with `reasoning.effort: low` for user-requested drafting. Use strict structured outputs and explicit output-token caps. Model IDs, reasoning, token caps, and price metadata remain versioned server configuration. Do not silently route all work to Sol or enable Pro, hosted tools, persisted state, or multi-agent features. A labeled evaluation set must pass before changing either model role. |

## Decision rationale

- The trial is large enough to show a real opportunity while bounding abuse and unattended AI spend.
- Lifetime discovery renews, but expensive drafts are finite, protecting long-term unit economics.
- Monthly UI waits for evidence from activation, qualified-opportunity rate, draft-to-post rate, and paid conversion.
- Conservative promotion defaults protect the user’s reputation; a missed mention costs less than a ban.
- Community standing belongs to the Mentionish user, preventing contradictory karma state across products without requiring Reddit OAuth.
- Cloudflare hosts the dashboard as requested; persistent Node/BullMQ processes use Railway.

## Verified external constraints

- [Cloudflare supports Next.js on Workers through OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/); use `nodejs_compat` and test in the Workers preview runtime.
- [Reddit’s published policy requires explicit API approval](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy), and its [Data API Terms](https://redditinc.com/policies/data-api-terms) require a separate agreement/express approval for commercial use. `DEC-021` is an explicit owner risk acceptance; it does not claim that app-level credentials change those terms.
- [Reddit Developer Terms](https://redditinc.com/policies/developer-terms) require removed or modified content to be updated or deleted as soon as possible.
- [OpenAI’s data controls](https://developers.openai.com/api/docs/guides/your-data) state that API data is not used for training by default, abuse-monitoring logs may be retained up to 30 days, and Zero Data Retention requires approval. Responses requests use `store: false` for Mentionish.
- [OpenAI GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6) identifies Luna for efficient high-volume work and Terra for strong lower-cost performance. [Current pricing](https://developers.openai.com/api/docs/pricing) must be reflected in cost metadata and alerts.
- Use the current [Dodo webhook event guide](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide) and official SDK verification rather than assumptions in the original PRD.

## Implementation-time contract verification

Before integration, verify against current official documentation:

- Granted Reddit scopes, approved use case, search behavior, rate limits, deletion mechanism, and required user agent.
- Hacker News item fields and deleted/dead item handling.
- OpenAI model identifiers, Responses API usage fields, structured-output schema behavior, retention controls, rate limits, and pricing.
- Dodo checkout request/response shapes, exact webhook event names, signature verification algorithm/library, timestamp tolerance, and retry behavior.
- Chrome Web Store Manifest V3 policies and Reddit DOM variants.

The PRD currently states HMAC SHA-256 headers and specific Dodo event names. Treat those as desired behavior but validate the exact wire contract before writing production code.

## Confirmed decisions from the PRD

- DEC-C01: Node.js/Express backend; no Python service.
- DEC-C02: Next.js, Tailwind, and shadcn/ui dashboard.
- DEC-C03: Supabase Postgres/Auth with RLS.
- DEC-C04: `node-cron` scheduling and BullMQ over Upstash Redis.
- DEC-C05: OpenAI Responses API behind a role-based adapter; Luna classifies and Terra drafts.
- DEC-C06: Manifest V3 Reddit extension.
- DEC-C07: Humans edit and submit all platform responses.
- DEC-C08: Keyword plus LLM classification; no vector search in v1.
- DEC-C09: Manually seed subreddit rules; no automatic detection.
- DEC-C10: Founder lifetime UI precedes monthly-plan UI.
- DEC-C11: Reddit is the primary product channel; HN is secondary.
- DEC-C12: Live discovery uses one server-side Reddit app read token and conservative polling; users do not connect Reddit, and the owner accepts commercial-policy/enforcement risk without making a commercial agreement a launch gate.
- DEC-C13: The dashboard deploys to Cloudflare Workers, not Vercel.
- DEC-C14: Supabase email magic links are the v1 dashboard authentication method.
- DEC-C15: AI provider/model changes require role-specific quality and cost evaluation rather than a global model-string replacement.
