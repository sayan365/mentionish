# Local-first open-source architecture

## Decision

Mentionish will become a single-user, local-first open-source application. The existing hosted implementation remains intact as a reference and possible future optional mode while the local runtime is built behind explicit adapters.

The default local experience is:

```text
git clone -> npm install -> npm start -> browser opens -> first-run setup
```

No account, hosted Supabase project, Redis instance, Docker Desktop, scheduler, subscription, or Mentionish-managed platform credential is required.

## Product contract

- One local owner; no sign-in screen.
- Unlimited local products and listening phrases.
- User-triggered scans only. There is no background scheduler.
- The dashboard shows scan progress and remains usable while a scan runs.
- AI generation occurs only after an explicit user action.
- Platform responses remain manual-only. Mentionish may copy or insert text but never submits it.
- Credentials and collected content remain on the local machine.
- Reddit and X are experimental, user-supervised connectors because their cookie/session-based upstreams can break or trigger platform enforcement.
- Hacker News is the stable, zero-credential connector.

## Runtime shape

```text
Dashboard (localhost)
        |
Local API/orchestrator
   |        |         |
Local DB   AI       Source adapters
           |        |- Hacker News public API
           |- OpenAI|- Reddit: OpenCLI -> rdt-cli
           |- Claude|- X: twitter-cli -> OpenCLI
           `- local models later
```

The local API binds to loopback only. It owns database access, provider calls, subprocess execution, input validation, timeouts, and output normalization.

## Local database

Use embedded SQLite for the default runtime. It creates one application-owned database file and runs migrations automatically. This avoids requiring users to install PostgreSQL or Docker.

The hosted PostgreSQL schema is not executed directly in local mode because it contains Supabase authentication, RLS, entitlement, and security-definer RPC assumptions. Domain repositories will gain local implementations while preserving the current hosted implementations until parity is proven.

Local data includes products, source items, opportunities, drafts, operations, settings metadata, and analytics events. Secrets must not be stored in ordinary database columns.

## Credential storage

- Prefer operating-system credential storage for AI keys and connector secrets.
- Keep only provider name, masked suffix, validation state, and update time in the database.
- Never return plaintext secrets to the dashboard after initial submission.
- Never store provider keys or platform cookies in browser local storage.
- Agent Reach and its upstream tools retain their own local credentials; Mentionish invokes them without copying cookies into its database.

## Agent Reach role

Agent Reach is an optional setup and diagnostics dependency. It selects, installs, and checks upstream tools; it is not the runtime read API.

Mentionish therefore:

1. detects `agent-reach` and presents installation guidance when absent;
2. uses bounded diagnostics for setup assistance;
3. probes and calls the selected upstream CLI directly for actual reads;
4. normalizes every result into Mentionish source-item contracts;
5. applies timeouts, result limits, deduplication, and an immediate connector kill switch;
6. never invokes upstream write/post commands.

Agent Reach is MIT licensed. Reddit currently selects OpenCLI then `rdt-cli`; X currently selects `twitter-cli`, OpenCLI, then a legacy CLI. These selections can change upstream, so Mentionish keeps its own stable adapter interface.

## Local security boundary

Removing user authentication does not remove local security requirements.

- Bind the API to `127.0.0.1`, not all network interfaces.
- Allow only the local dashboard origin through CORS.
- Pair the browser extension with a generated revocable local token.
- Reject browser requests without the expected origin and request token.
- Validate source URLs and never pass untrusted text through a shell.
- Spawn executables with argument arrays, fixed allowlists, output limits, and deadlines.
- Treat CLI and platform content as untrusted data.

## Migration sequence

1. Add local configuration, connector diagnostics, and provider interfaces.
2. Add embedded database bootstrap and local migrations.
3. Implement local product and opportunity repositories.
4. Remove sign-in from local mode and add first-run setup.
5. Replace queues/scheduler with explicit in-process scan operations.
6. Add OpenAI and Anthropic providers using user-owned keys.
7. Connect Hacker News and Reddit through the local source boundary.
8. Add X as an opt-in experimental connector after Reddit acceptance passes.
9. Add extension pairing and manual insertion.
10. Package, document, license, and publish the open-source release.

## Deferred decisions

- Final project license: MIT for adoption versus AGPL-3.0 for hosted-service reciprocity.
- OS credential-store library and encrypted fallback.
- Whether the first packaged release remains a Node application or becomes a desktop bundle.
- Ollama/local-model support timing.

