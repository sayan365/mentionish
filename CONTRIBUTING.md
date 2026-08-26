# Contributing to Mentionish

Thank you for helping improve Mentionish. It is a local-first conversation-discovery workspace, so changes should preserve user control, local data ownership, and manual-only platform interaction.

## Before you start

- Use Node.js 22 or newer and npm 11 or newer.
- Search existing issues before opening a new one.
- Keep changes focused and explain the user problem they solve.
- Never include API keys, browser cookies, local databases, backups, public usernames from real scans, or private conversation data in commits, fixtures, screenshots, or logs.

## Local development

Install dependencies from the repository root:

    npm install

Start the application:

    npm start

Run the development workspaces:

    npm run dev

Run the complete quality gate before submitting a change:

    npm run check

For launcher, database, backup, or packaging changes, also run:

    npm run smoke:clean-install

The smoke command uses temporary data and does not touch the normal Mentionish workspace.

## Product invariants

Contributions must preserve these boundaries unless the project explicitly changes its published direction:

- no Mentionish account, hosted runtime, payment, quota, Redis, worker, or background scheduler;
- scans start only through an explicit user action;
- no automatic posting, commenting, liking, following, messaging, or native-editor insertion;
- generated replies remain editable text that the user copies and submits manually;
- experimental connectors fail closed on authentication, rate-limit, challenge, or enforcement signals;
- no account rotation, identity rotation, challenge bypass, or ban-evasion behavior;
- secrets stay out of SQLite, browser storage, API reads, logs, errors, and fixtures;
- the API remains loopback-bound with origin and installation-token enforcement.

## Pull requests

A pull request should include:

1. a concise description of the problem and solution;
2. tests covering changed behavior;
3. documentation updates when a workflow, API, schema, risk boundary, or user-visible behavior changes;
4. screenshots for meaningful visual changes in both light and dark themes;
5. confirmation that `npm run check` passes.

GitHub Actions runs the full quality gate and isolated startup smoke on Windows, macOS, and Linux. Connector tests in CI must use sanitized fixtures and must never require personal credentials or browser sessions.

## License

By contributing, you agree that your contributions will be licensed under the repository's [MIT License](LICENSE).
