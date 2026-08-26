# Mentionish

Mentionish is a local-first, open-source conversation discovery workspace for solo founders. It searches configured public/community sources for useful posts and comments, ranks them against each product, and helps the founder prepare a thoughtful reply. Mentionish never posts, comments, likes, follows, or messages on the user's behalf.

## Direction

The repository is a single-user local application:

- no Mentionish account or login;
- no Docker Desktop, hosted Supabase, Redis, billing, quotas, worker, or background scheduler in the local runtime;
- embedded local database with automatic migrations;
- unlimited local products;
- user-owned OpenAI, Anthropic, or future local-model credentials;
- explicit Scan all and Scan product actions;
- Hacker News as a stable connector;
- Reddit and X as optional experimental connectors configured through Agent Reach-selected local tools;
- manual-only replies through Copy draft and Open source; Mentionish never inserts or submits text on a platform.

The hosted prototype runtime has been removed. The active release plan is in [docs/roadmap.md](docs/roadmap.md).

## Target installation experience

    git clone <repository-url>
    cd Mentionish
    npm install
    npm start

The start command initializes the embedded database, runs migrations, starts only the loopback API and dashboard, and opens the browser. The legacy worker, scheduler, BullMQ, and Redis runtime have been removed.

## Documentation

Start with [docs/README.md](docs/README.md). It identifies the canonical product and engineering contracts.

Backup, offline restore, workspace reset, moving computers, and uninstall steps are in [docs/local-data-lifecycle.md](docs/local-data-lifecycle.md).

## Current development

Requirements:

- Node.js 22 or newer
- npm 11 or newer

Install dependencies:

    npm install

Run the local application:

    npm start

If port 3000 is already occupied, choose another dashboard port:

    $env:DASHBOARD_PORT=3100; npm start

Use `npm run dev` when developing the API, dashboard, and shared packages together.

Run all checks:

    npm run check

Run the isolated local-startup smoke test (it never touches your normal data):

    npm run smoke:clean-install

Inspect local connector availability:

    npm run local:doctor

Mentionish requires no Supabase, PostgreSQL, Redis, Docker, billing, or login credentials.

## Safety

Reddit and X connectors may rely on browser sessions or cookies through upstream local tools. They are experimental, can stop working, and may create account-enforcement risk. Users must explicitly enable them. No account type, age, karma level, or usage pattern guarantees safety; alternate accounts must never be used to evade enforcement. Mentionish provides read/search and manual reply assistance only.
