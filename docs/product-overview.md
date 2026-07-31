# Product Overview

## Product

Mentionish is the working repository name for an **AI Customer Discovery Engine**. It finds relevant Reddit and Hacker News conversations, scores buying intent, drafts a contextual response in a founder's voice, and keeps the human in control of editing and posting.

The public product name remains undecided. It must not be adjacent to “Reddgrow.”

## Positioning

Sell discovery and customer insight, not posting automation:

> Here are people talking about the problem your product solves today.

The differentiators stated in the PRD are:

- Reddit and Hacker News support from v1.
- Subreddit-specific promotion and karma gating.
- A founder lifetime offer alongside a later recurring plan.
- Transparent founder-led building and marketing.

## Primary user

An indie founder or small SaaS operator who:

- can describe a product, its customer problem, and useful keywords;
- wants to discover high-intent conversations without manually searching continuously;
- wants help writing a useful, context-aware reply;
- accepts responsibility for reviewing and manually posting every response.

Team accounts and multi-user workspaces are not v1 personas.

## Core jobs to be done

1. When people discuss a problem my product solves, show me the most promising conversations.
2. Explain why each conversation appears commercially relevant.
3. Help me write a useful reply that matches my voice and the community's promotion rules.
4. Make it easy to take the draft to the native platform without posting on my behalf.
5. Show my usage and simple opportunity-to-post funnel.

## Happy-path journey

1. User signs up through Supabase Auth.
2. User creates a product/campaign with a name, description, keywords, and voice persona.
3. Scheduled discovery scans Reddit and Hacker News.
4. New platform items are deduplicated and matched to products.
5. A cheap AI classifier assigns an intent score and reasoning.
6. Items scoring at least 60 become visible opportunities; lower-scoring matches are skipped.
7. User requests or reviews a stronger-model draft.
8. Promotion rules constrain the draft based on the tracked subreddit's state.
9. For Reddit, the user opens the thread and uses the extension to insert text into the native editor, then manually submits.
10. For Hacker News, the user copies the draft, opens the thread, pastes, and manually submits.
11. User marks the opportunity posted, or skips it.

## V1 success indicators

The PRD does not specify numeric business targets. The product should at minimum make these measurable:

- qualified opportunities found over 7 and 30 days;
- drafts generated;
- opportunities marked posted;
- draft-to-post conversion rate;
- scan and draft usage versus plan caps;
- AI token use and estimated cost per user.

Numeric launch targets require a product decision.

## V1 scope

- Reddit and Hacker News discovery.
- Keyword filtering and two-stage AI intent/draft pipeline.
- Human review, editing, and posting.
- Reddit Chrome extension that inserts a draft but never submits it.
- Hacker News copy-to-clipboard flow.
- Supabase authentication and Postgres persistence.
- Founder lifetime checkout and entitlement activation through Dodo Payments.
- Backend-enforced usage caps.
- Minimal analytics.
- Manually seeded rules for 20–30 launch subreddits.

## Explicitly excluded from v1

- X/Twitter.
- Any automatic posting or platform write API.
- Multi-account or Chrome-profile switching.
- Team seats and multi-user workspaces.
- Competitor monitoring and AI visibility/GEO tracking.
- Vector or semantic search.
- Automatic subreddit-rule detection.
- Engagement synchronization such as upvotes or views.
- Monthly-plan user interface until the lifetime offer validates demand.

Subscription webhook handling may be made structurally ready, but it must not expand into unapproved monthly-plan UI.
