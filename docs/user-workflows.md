# User workflows

## 1. Install and first launch

The user clones the repository, installs packages, and starts Mentionish. The application:

1. creates its application-data directory;
2. creates or opens the embedded database;
3. runs idempotent local migrations;
4. generates the local API installation secret;
5. binds the API and dashboard to loopback;
6. opens the dashboard;
7. shows first-run setup when no provider or product exists.

Startup must not require Docker, PostgreSQL, Redis, Supabase, or a Mentionish login.

## 2. First-run setup

The setup wizard uses a progress checklist:

1. AI provider;
2. platforms;
3. first product;
4. readiness review.

The user may skip the AI provider and use deterministic keyword matching, but AI keyword suggestions, relevance classification, and drafts remain disabled until a provider validates successfully.

### Provider setup

The user selects OpenAI or Anthropic, enters an API key, optionally chooses supported models, and clicks Test connection. The key is sent only to the loopback API and stored using the local secret-storage boundary. The UI later displays only provider, masked suffix, and validation time.

### Platform setup

Hacker News is available without credentials.

Reddit and X are off by default. Enabling either displays:

- experimental and accepted-risk wording;
- Account Safety Center explanation and current evidence state;
- warning that no account, karma, age, or activity level guarantees safety;
- required Agent Reach/upstream tools;
- installation state;
- login/setup state;
- explicit Run live read test action;
- kill switch.

A platform becomes Ready only after a bounded live read succeeds. Ready describes connector functionality, not account safety or platform approval.

## 3. Create a product

The user enters:

- product name;
- product description;
- ideal customer or audience, optional but recommended;
- product URL, optional and never inserted automatically;
- response voice, optional.

The user clicks Suggest search phrases. Mentionish sends only the supplied product context to the configured AI provider and returns grouped editable suggestions:

- problems and frustrations;
- questions and help requests;
- comparison and alternative language;
- category/use-case language;
- audience language;
- negative/exclusion phrases.

Every suggestion explains why it may find useful conversations. The user accepts, edits, removes, or adds phrases. A product can be saved without AI suggestions. Local mode has no product limit.

## 4. Start a scan

There are two explicit actions:

- Scan all products;
- Scan this product.

The user chooses enabled platforms and may adjust the freshness window and result budget. Starting a scan creates a visible local operation. It does not create a recurring schedule.

For each selected product, Mentionish:

1. builds bounded platform queries from approved phrases;
2. invokes each configured source adapter;
3. retrieves recent posts and supported comments/replies;
4. normalizes and deduplicates results;
5. matches deterministic phrases;
6. classifies promising candidates when an AI provider is enabled;
7. saves qualified opportunities;
8. updates progress, per-source counts, warnings, and failures.

The dashboard can be closed only after warning that an in-process scan will stop. A later release may add resumable operations, but never an implicit schedule.

## 5. Review scan results

The completion summary shows:

- platforms attempted;
- queries executed;
- posts and comments inspected;
- duplicates removed;
- opportunities qualified;
- sources requiring attention;
- elapsed time;
- estimated AI usage when available.

The Conversations screen defaults to the highest-value recent results. Filters include product, platform, content type, status, date, score, and saved state.

Each card includes source context, author/public metrics when available, match phrases, AI score and explanation, freshness, and native URL. Reddit/X metrics are optional because upstream tools may omit them.

## 6. Give feedback

The user can mark a result:

- useful;
- not relevant;
- save for later;
- skip;
- manually replied.

Not relevant asks for an optional reason such as wrong audience, weak intent, stale, duplicate, wrong language, or excluded topic. Feedback remains local and informs future phrase/query recommendations and ranking. It must not silently rewrite product settings.

## 7. Draft and reply

Draft generation is always explicit. The user selects Generate draft, reviews and edits it, then:

On successful generation, Mentionish automatically reveals the inline editor and focuses the generated text so the user can review immediately. Completion is also announced to assistive technology, and reduced-motion preferences disable smooth scrolling.

- Every source: copies the draft and opens the native conversation. The user pastes, reviews, and submits it manually.

Reddit draft generation, editing, copying, and **Open source** stay available because they are local or user-directed and do not post to Reddit. Mentionish links the current thread and community rules and offers a native-review checklist before manual posting. The user can record native reply availability and whether promotion/link or AI-content rules are allowed, restricted, or not explicit. The review expires after 24 hours and remains advisory; Mentionish does not control the native editor. Mentionish marks Replied only after the user explicitly confirms it. There is no recommended daily reply quota and no account-warming guidance.

## 8. Returning session

On later startup the Overview shows connector health, last manual scan, new opportunities, product coverage, provider status, and local database location/backup action. Nothing scans until the user clicks a scan action.
