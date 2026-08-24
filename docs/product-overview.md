# Product overview

## Product

Mentionish is a local conversation discovery and reply-assistance workspace for solo founders. It helps a founder find the few public posts and comments where a useful, human response could create a customer conversation.

The product is not a social-media automation bot. Its value is selection quality: less noise, better context, and a clear explanation of why each conversation matters.

## Positioning

Primary promise:

> Describe your product once. Mentionish searches the sources you enable, finds people with relevant problems or buying intent, and helps you respond manually.

Differentiators:

- local-first ownership of data and credentials;
- no Mentionish account, subscription, platform credential pool, or hosted tracking;
- product-aware query and keyword recommendations;
- post and comment discovery rather than title-only keyword alerts;
- AI relevance scoring with visible reasons;
- feedback that improves local ranking and query suggestions;
- user-triggered scans rather than hidden automation;
- manual-only replies with native-source context.

## Primary user

A solo founder or very small team that:

- has an early product and needs customer conversations;
- cannot monitor several communities every day;
- does not know which search phrases indicate real pain or intent;
- wants assistance without handing posting authority to a cloud service;
- accepts the risk of optional session-based Reddit and X connectors.

The first release is single-user. Shared workspaces, cloud synchronization, and multi-user authorization are out of scope.

## Core jobs

1. Turn a product description into useful editable discovery phrases.
2. Enable and validate local source connectors.
3. Run a scan for all products or one selected product.
4. retrieve recent posts and comments with enough thread context;
5. rank conversations by relevance, urgency, fit, and reply opportunity;
6. explain each recommendation and suppress duplicates/noise;
7. generate an optional provider-backed reply draft;
8. copy the draft and open the native source for manual pasting, review, and submission;
9. record skipped, saved, drafted, and manually replied outcomes;
10. use local feedback to improve future searches.

## Quality bar

Mentionish should become a solo founder's first choice because the first page is useful, not because it collects the most data.

A high-quality opportunity:

- is recent enough to respond to;
- matches the product's customer, problem, use case, alternative, or category;
- contains a question, frustration, comparison, request, or credible buying signal;
- includes enough context for a helpful reply;
- is not a duplicate, deleted item, spam, or irrelevant keyword collision;
- can be answered without pretending, astroturfing, or auto-posting.

The dashboard must distinguish retrieval confidence from AI relevance confidence. Users can inspect the source before using a draft.

## Scope

Initial stable source:

- Hacker News posts and comments through public endpoints.

Initial experimental sources:

- Reddit posts and comments through Agent Reach-selected OpenCLI or rdt-cli backends.
- X posts, replies, and threads through twitter-cli or OpenCLI after Reddit is stable.

AI providers:

- OpenAI;
- Anthropic;
- a provider interface for later local models such as Ollama.

## Explicit exclusions

- automatic or scheduled background scanning;
- automatic posting, voting, liking, following, or direct messaging;
- platform engagement synchronization;
- hosted accounts, subscriptions, quotas, or payments;
- selling or sharing collected user data;
- team collaboration in the first release;
- claims that cookie/session-based connectors are officially approved or guaranteed.
