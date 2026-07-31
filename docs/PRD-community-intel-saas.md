# PRD — AI Customer Discovery Engine (Reddit + Hacker News)
**Codename:** (pick a name later — not Reddgrow-adjacent)
**Owner:** Sayan
**Status:** v1 MVP spec, ready for build
**Target build time:** 2 weeks (Week 1 backend + dashboard, Week 2 extension + payments + polish)

---

## 1. Product summary

A tool that finds Reddit and Hacker News conversations where a founder's potential customers are actively asking for a solution, scores them by buying intent, drafts a contextual reply in the founder's voice, and lets the founder review and post it themselves — via a Chrome extension that fills the native reply box on Reddit, or a copy button for Hacker News.

**Positioning:** "AI Customer Discovery Engine" — not a Reddit automation tool. Sell the insight ("here are the people currently talking about your problem today"), not the posting.

**Why this works / why now:** demand is proven (multiple competitors already charging $9–79/mo for a subset of this). Differentiation is: (a) multi-platform from day one at the same price, (b) subreddit-specific karma-gating done properly instead of a static ratio, (c) a lifetime-priced founder offer instead of only subscriptions, (d) built and marketed transparently by an actual indie founder using it on himself.

---

## 2. Goals / Non-goals

**V1 Goals**
- Reddit + Hacker News discovery and scoring
- AI-drafted replies, human-approved, human-posted
- Chrome extension for Reddit (fills native compose box)
- Simple copy-to-clipboard flow for Hacker News (no extension needed there — HN has no compose box to inject into safely, and its culture punishes anything that smells automated even more than Reddit)
- Dodo Payments checkout: one lifetime-deal product + one monthly product
- Usage caps (scans/drafts), not automation of the post action itself

**V1 Non-goals (explicitly cut, do not build)**
- X/Twitter integration
- Auto-posting via any API
- Multi-account / Chrome-profile switching
- Team seats / multi-user workspaces
- Competitor monitoring, AI-visibility/GEO tracking
- Vector/semantic search (pgvector) — keyword + LLM classification is enough at this scale
- Auto-detecting each subreddit's self-promo rules — seed manually for launch subreddits

---

## 3. Tech stack (final)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Matches existing stack (Deplozen), no new language to context-switch into |
| Frontend dashboard | Next.js + Tailwind + shadcn/ui | Fast to build, good defaults, works well with Codex |
| DB + Auth | Supabase (Postgres + Supabase Auth) | Already decided, handles auth/RLS/DB in one |
| Background jobs | node-cron for scheduled scans + BullMQ (Redis via Upstash free tier) for retryable async jobs (AI scoring calls, draft generation) | Stays in Node ecosystem, avoids Celery/Python entirely |
| Payments | Dodo Payments | Merchant of record, handles India + international, hosted checkout, supports mixed one-time + subscription products |
| AI | OpenAI Responses API behind a model-role wrapper (`classifyIntent()`, `generateDraft()`) | `gpt-5.6-luna` with no reasoning for high-volume classification; `gpt-5.6-terra` with low reasoning for user-requested drafts |
| Chrome extension | Manifest V3, content script + service worker | Standard, required for MV3 compliance on Chrome Web Store |
| Hosting | Cloudflare Workers with OpenNext for Next.js; Railway for Express API, scheduler, and BullMQ workers | Cloudflare is the approved dashboard target; Railway supplies the persistent Node runtime required by workers |

---

## 4. Data model (Supabase/Postgres)

```sql
-- Users are Supabase Auth users by default (auth.users)

users_profile (
  id uuid references auth.users primary key,
  plan text default 'free',            -- 'free' | 'lifetime' | 'monthly'
  scan_cap int default 100,
  scan_used int default 0,
  draft_cap int default 30,
  draft_used int default 0,
  created_at timestamptz default now()
)

products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id),
  name text,
  description text,
  keywords text[],
  voice_persona text,                  -- tone/style instructions for drafts
  created_at timestamptz default now()
)

tracked_subreddits (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  subreddit text,
  karma_stage text default 'newcomer', -- 'newcomer' | 'contributor' | 'trusted' | 'established'
  self_promo_allowed boolean default false,
  karma_threshold int default 0,
  last_scanned_at timestamptz
)

scanned_posts (
  id uuid primary key default gen_random_uuid(),
  platform text,                        -- 'reddit' | 'hackernews'
  external_id text,                     -- reddit post id / HN item id
  subreddit text,                       -- null for HN
  title text,
  body text,
  author text,
  url text,
  created_at timestamptz,
  scanned_at timestamptz default now(),
  unique(platform, external_id)
)

opportunities (
  id uuid primary key default gen_random_uuid(),
  scanned_post_id uuid references scanned_posts(id),
  product_id uuid references products(id),
  intent_score int,                     -- 0-100 from Stage 1 classifier
  reasoning text,
  status text default 'new',            -- 'new' | 'drafted' | 'posted' | 'skipped'
  created_at timestamptz default now()
)

drafts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id),
  draft_text text,
  edited_text text,
  model_used text,
  created_at timestamptz default now()
)

payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users_profile(id),
  dodo_payment_id text,
  dodo_subscription_id text,
  plan text,
  status text,
  raw_event jsonb,
  created_at timestamptz default now()
)
```

RLS: every table except `scanned_posts` scoped to `user_id`/`product_id` ownership. `scanned_posts` can be shared across users (same post might match multiple users' keywords) — don't duplicate scanning per user.

---

## 5. Core engines

### 5.1 Discovery (scanning)

**Reddit:**
- Use one server-side Reddit application credential/app-level read token for discovery; users do not connect Reddit accounts
- Poll `https://oauth.reddit.com/search?q={keyword}&sort=new&limit=100` per active keyword set every 20–30 minutes — global search covers many subreddits per call, avoids per-subreddit polling and rate-limit burn
- Use a conservative global request budget, schedule jitter, batching, cache/deduplication, and current returned rate-limit/retry headers rather than assuming a fixed limit
- Dedupe against `scanned_posts` on `(platform, external_id)` before processing

**Hacker News:**
- Use the free, unauthenticated Firebase HN API (`https://hacker-news.firebaseio.com/v0/`)
- Poll `/newstories.json` and `/askstories.json` every 15 min, fetch item details, filter by keyword match in title/text before storing

### 5.2 Intent scoring (two-stage, this controls your AI cost)

**Stage 1 — `gpt-5.6-luna` classifier with `reasoning.effort: none`, runs on every new scanned post:**
- Input: post title + body + product description
- Output: `intent_score` (0–100) + one-line `reasoning`
- Discard/mark `skipped` anything under 60
- This is the high-volume stage — must stay cheap per call

**Stage 2 — `gpt-5.6-terra` draft generation with `reasoning.effort: low`, runs only on user-requested qualified posts:**
- Input: post content, product context, `voice_persona`, subreddit `karma_stage` + `self_promo_allowed`
- Output: a draft reply. If `karma_stage = newcomer`, the prompt must forbid any link or product name — pure value-add only.
- This only touches ~5–10% of scanned volume, keeping cost predictable per user

### 5.3 Karma-gating state machine

```
newcomer     -> draft never includes link/product mention
contributor  -> link allowed only if self_promo_allowed = true
                AND user has 3+ prior non-promotional comments in that subreddit
trusted      -> link allowed per subreddit's stated rules
established  -> same as trusted, higher trust weighting in draft tone
```
Manually seed `self_promo_allowed` and `karma_threshold` for the first 20–30 target subreddits at launch. Do not attempt auto-detection of subreddit rules in v1.

### 5.4 Approval + posting

- Dashboard opportunity feed: card per opportunity with score, reasoning, draft, edit box, and a platform-specific action button
- **Reddit → "Open & Fill"**: opens the Reddit thread in a new tab; Chrome extension content script detects the matching `opportunity_id` via URL, injects a sidebar panel with the draft, and on click writes the text into Reddit's native comment textarea (DOM manipulation only, never calls Reddit's write API). User clicks Reddit's own submit button manually.
- **Hacker News → "Copy Draft"**: no extension logic needed; copy button + link to the HN thread, user pastes and posts manually. (HN's culture makes even DOM-injection assistance feel wrong here — keep it manual end-to-end.)

### 5.5 Analytics (minimal v1)

- Opportunities found (7-day, 30-day)
- Drafts generated vs posted (conversion rate — useful for the user to see their own funnel)
- Do NOT build platform engagement tracking (upvotes/views sync) in v1 — needs extra API scope and isn't core to the value prop yet

---

## 6. Chrome extension spec

- Manifest V3
- `content_scripts` matching `*://*.reddit.com/*`
- On page load, extract post ID from URL, call `GET /api/opportunity-by-post?external_id=X`
- If found and `status IN ('new','drafted')`, render an injected sidebar (shadow DOM to avoid CSS collisions) showing score, reasoning, and editable draft textarea
- "Insert into Reddit" button locates the native comment `textarea`/rich-text editor and sets its value programmatically (dispatch `input` event so React-based Reddit UI registers the change)
- Extension authenticates to your backend via a token generated in the web dashboard (user pastes/links it once, standard pattern — do not try to share Supabase session cookies across origins)
- No background scraping, no auto-submit, no access to Reddit's own cookies/session beyond what the content script naturally sees on the page

---

## 7. Payments (Dodo Payments)

**Products to create in Dodo dashboard:**
1. **Founder Lifetime Deal** — one-time USD 49 launch product, limited to 100 purchases, with 300 AI classifications per calendar month and 100 AI drafts lifetime
2. **Growth Monthly** — USD 19/month with 1,500 classifications and 100 drafts per month (model now; expose UI only after the lifetime deal validates demand)

**Integration:**
- Use Dodo's Checkout Sessions API — pass the product in `product_cart`, redirect user to the returned `checkout_url` (works for both one-time and subscription, and supports mixed carts if you ever bundle)
- Webhook endpoint (`POST /webhooks/dodopayments`) verifies HMAC SHA256 signature using the `webhook-id`, `webhook-signature`, `webhook-timestamp` headers and your webhook secret
- Handle at minimum: `payment.succeeded` (activate plan, set caps on `users_profile`), `payment.failed` (notify), `subscription.renewed` / `subscription.canceled` (for the later monthly tier), `refund.succeeded` (revoke access)
- Webhook state is the source of truth — do not gate access purely on the client-side checkout redirect

---

## 8. API endpoints (backend)

```
POST   /api/products                    create product/campaign
GET    /api/products/:id/opportunities  list opportunities (paginated, sorted by score)
POST   /api/opportunities/:id/draft     trigger Stage 2 draft generation
PATCH  /api/drafts/:id                  save user's edited draft
POST   /api/opportunities/:id/mark-posted
GET    /api/opportunity-by-post?external_id=  used by Chrome extension
GET    /api/usage                       current scan/draft usage vs cap
POST   /api/checkout                    create Dodo checkout session
POST   /webhooks/dodopayments           Dodo webhook receiver
```

---

## 9. Non-functional requirements

- **Cost control is a hard requirement, not a nice-to-have**: Stage 1 classifier must run on a cheap model; enforce `scan_cap`/`draft_cap` server-side on every relevant call, not just in the UI
- Respect Reddit's rate limits server-side (queue + backoff, not naive parallel calls)
- No auto-posting anywhere in the codebase — this is a compliance boundary, not just a feature choice
- Log every AI call's token usage per user for cost monitoring from day one

---

## 10. Build plan (2 weeks)

**Week 1 — backend + dashboard**
- Supabase schema + auth
- Reddit + HN discovery jobs
- Two-stage scoring pipeline
- Opportunity feed dashboard (Next.js)
- Manual draft editing

**Week 2 — extension + payments + launch prep**
- Chrome extension (content script + sidebar + insert-into-textarea)
- Dodo Payments checkout + webhook + plan gating
- Seed karma-gating data for 20–30 launch subreddits
- Write the "I built this because I got banned manually" launch post for your own Reddit/HN/Indie Hackers distribution

**Explicitly out of scope until there are paying users:** X integration, team seats, analytics sync, subreddit rule auto-detection, monthly-plan UI.
