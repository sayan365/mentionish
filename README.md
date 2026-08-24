# Mentionish

Mentionish is a local-first, open-source conversation discovery workspace for solo founders. It searches configured public/community sources for useful posts and comments, ranks them against each product, and helps the founder prepare a thoughtful reply. Mentionish never posts, comments, likes, follows, or messages on the user's behalf.

## Direction

The repository is migrating from a hosted SaaS prototype to a single-user local application:

- no Mentionish account or login;
- no Docker Desktop, hosted Supabase, Redis, billing, quotas, or background scheduler in the final local runtime;
- embedded local database with automatic migrations;
- unlimited local products;
- user-owned OpenAI, Anthropic, or future local-model credentials;
- explicit Scan all and Scan product actions;
- Hacker News as a stable connector;
- Reddit and X as optional experimental connectors configured through Agent Reach-selected local tools;
- manual-only replies through Copy draft and Open source; Mentionish never inserts or submits text on a platform.

The current code still contains the completed hosted prototype while the local runtime is implemented phase by phase. The active plan is in [docs/roadmap.md](docs/roadmap.md).

## Target installation experience

    git clone <repository-url>
    cd Mentionish
    npm install
    npm start

The start command initializes the embedded database, runs migrations, starts only the loopback API and dashboard, and opens the browser. It does not start Docker, Supabase, Redis, the worker, or the scheduler.

## Documentation

Start with [docs/README.md](docs/README.md). It identifies the canonical product and engineering contracts.

## Current development

Requirements:

- Node.js 22 or newer
- npm 11 or newer

Install dependencies:

    npm install

Run the local application:

    npm start

Use `npm run dev` only when intentionally working on every transitional workspace.

Run all checks:

    npm run check

Inspect local connector availability:

    npm run local:doctor

Local mode requires no Supabase or Redis credentials. Hosted Supabase and Redis configuration remains temporarily available only for the transitional hosted mode.

## Safety

Reddit and X connectors may rely on browser sessions or cookies through upstream local tools. They are experimental, can stop working, and may create account-enforcement risk. Users must explicitly enable them. No account type, age, karma level, or usage pattern guarantees safety; alternate accounts must never be used to evade enforcement. Mentionish provides read/search and manual reply assistance only.
