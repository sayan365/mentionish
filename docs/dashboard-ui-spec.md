# Dashboard UI Specification

## Experience principles

- Lead with qualified conversations, not automation.
- Make score reasoning and community constraints visible.
- Explain quota/payment state before paid AI work.
- Never imply that copying or inserting text means it was posted.
- Preserve user edits and provide recoverable errors.

## Route map

| Route | Purpose |
|---|---|
| `/sign-in` | Supabase authentication |
| `/onboarding` | Create the first product |
| `/products` | List and switch products within plan limits |
| `/products/[id]/opportunities` | Main opportunity feed |
| `/products/[id]/settings` | Product, keywords, voice, and community settings |
| `/analytics` | 7/30-day funnel and usage |
| `/billing` | Entitlement, limits, and Founder Lifetime checkout |
| `/extension` | Setup and extension-token lifecycle |

Exact paths may change, but the capabilities must remain.

## Onboarding

Collect product name, product/problem description, initial keywords, and optional voice persona. Explain that AI scores discovery results while all drafts require review and manual posting. Show inline validation and plan limits.

After creation, use a real discovery-pending or empty state. Do not fabricate opportunities unless approved demo data is visibly labeled.

## Opportunity feed

Each card shows:

- platform and subreddit where applicable;
- title, safe excerpt, author and source time when available;
- intent score and concise reasoning;
- workflow status and promotion-safety badge;
- current draft state and source link;
- primary action: generate/review draft, Reddit “Open & Fill,” or HN “Copy Draft.”

Default to qualified opportunities ordered by score descending with deterministic secondary ordering. Provide platform/status filters and cursor-based loading.

## Detail and editing

- Show enough source context for relevance review.
- Label AI reasoning and drafts as generated guidance.
- Keep generated text separate from user edits.
- If autosave is used, show saving/saved/error states and use optimistic concurrency.
- Never discard edits on generation, navigation, or network failure.
- Show the active subreddit rule beside Reddit drafts.
- Make skip and mark-posted explicit actions.

“Open & Fill” opens the Reddit thread and explains that the extension inserts text only. “Copy Draft” copies effective HN text and offers the source thread. Neither action marks an opportunity posted.

## Usage, checkout, and analytics

Display authoritative used/limit and reset/expiry data from the API; do not reproduce plan rules in client constants. Quota exhaustion has a clear explanation and billing route.

After checkout return, show payment processing until webhook-derived access is active. Offer bounded refresh/retry behavior.

Analytics show qualified opportunities for 7/30 days, distinct drafted opportunities, user-declared posted opportunities, draft-to-post conversion, and usage. Label posting as self-reported and show no engagement metrics.

## Required states

Every data screen has loading, honest empty, not-found/permission-safe, network error, quota exhausted, and background-operation pending/failed/succeeded states. Polling stops at a terminal state and uses bounded backoff.

## Accessibility and content

- Keyboard-accessible navigation, editing, dialogs, copy, and actions.
- Visible focus, semantic labels/headings, and announced async state.
- Do not communicate score/status by color alone.
- Target WCAG 2.1 AA contrast.
- Desktop-first but usable mobile dashboard; extension remains desktop Chrome-specific.
- Use “opportunity,” “conversation,” and “draft,” not automation-first language.
- State that scores are estimates, rules can change, posting is manual, and posted state is self-reported.
- Do not claim HN comment-level coverage if `DEC-008` is accepted.
