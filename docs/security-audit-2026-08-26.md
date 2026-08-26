# Release security, privacy, dependency, and license audit

Audit date: 2026-08-26

## Scope

This audit covers the tracked monorepo, npm dependency tree, loopback API boundary, local installation token, encrypted AI-secret storage, browser persistence, connector subprocesses, source-link handling, backup exclusions, and the manual-posting invariant.

It does not claim that upstream platforms, unofficial connector tools, AI providers, or another process running as the same operating-system user are secure.

## Automated evidence

- `npm audit --json`: zero known vulnerabilities across 395 production, development, optional, and peer dependency entries reported by npm.
- `npm audit signatures`: 300 installed packages had verified registry signatures and 73 had verified attestations.
- `npm run audit:licenses`: every lockfile license identifier matched the reviewed inventory; new or missing unreviewed metadata fails the command.
- tracked-secret filename-only scan: no private-key, OpenAI-like, Anthropic, GitHub, AWS, Reddit-session, or generic hard-coded-secret patterns were found.
- tracked environment files: only the two placeholder `.env.example` files are committed.
- platform-write search: no connector command or API route posts, comments, votes, likes, follows, messages, or inserts text into a native editor. `mark-posted` records a user-reported local workflow state only.
- browser persistence search: local storage contains only theme and density preferences. The installation bearer token stays in module memory.

## Findings fixed

### SEC-01 — connector environment inheritance

Connector processes inherited the complete parent environment, which could unnecessarily expose unrelated API keys or process configuration to an upstream executable. Connector diagnostics and OpenCLI Reddit reads now receive an explicit operating-system path/configuration allowlist. `NODE_OPTIONS`, AI keys, cookies, and unrelated variables are not forwarded. A regression test enforces this boundary.

### SEC-02 — local vault artifacts not ignored

The normal data directory is outside the repository, but a custom in-repository `MENTIONISH_DATA_DIR` could leave `.secret-key`, `secrets.enc`, or its temporary file visible to Git. All three are now ignored in addition to installation tokens and SQLite files.

### SEC-03 — unsafe URL schemes

Shared source schemas accepted any syntactically valid URL, including executable or local-file schemes. Source links, community-rule links, dashboard origins, and custom AI base URLs now accept only HTTP or HTTPS. Remote custom AI endpoints additionally require HTTPS, while loopback HTTP remains available for local models. Reddit ingestion keeps only native Reddit hosts and replaces any non-native value with a canonical Reddit thread URL. Regression tests reject `javascript:`, `file:`, deceptive hosts, and remote plaintext AI endpoints.

## Boundary review

- API host configuration accepts only `127.0.0.1`.
- bootstrap requires the exact configured dashboard Origin and a loopback remote address.
- protected routes require a bearer token compared with `timingSafeEqual`.
- bootstrap, settings, local-data status, and backup responses use no-store handling where sensitive metadata is involved.
- AI keys are encrypted with AES-256-GCM using a separate random 256-bit key and are absent from SQLite backups and API read responses.
- connector execution uses fixed executable resolution, argument arrays, `shell: false`, bounded output, deadlines, cancellation, and a minimized environment.
- Reddit commands are limited to `search`, `read`, and `whoami` and stop on authentication, rate-limit, challenge, CAPTCHA, restriction, or access-denial signals.
- external post content and AI output render as text through React; arbitrary HTML is not injected.

## Third-party licenses

The dependency tree includes permissive MIT, Apache-2.0, ISC, BSD, 0BSD, BlueOak, and alternative-license packages, plus transitive MPL-2.0, LGPL-3.0-or-later, and CC-BY-4.0 components used by Next.js build/image tooling and browser-compatibility data. They remain third-party works under their own terms and are not relicensed as Mentionish code.

The current release path distributes source and installs these dependencies from npm. Before distributing bundled installers or prebuilt binaries, regenerate the inventory and add any notices/source-offer material required by the exact shipped artifacts.

Expected install scripts are limited to `better-sqlite3`, `esbuild`, optional `fsevents`, and `sharp`; changes to this set require review.

## Residual risks and release follow-up

- npm advisories and registry signatures reduce supply-chain risk but do not prove dependency safety.
- The encrypted file vault does not protect against malware or another process already running as the same OS user. Windows file confidentiality relies on the data directory's inherited user ACL.
- Product and source text sent during explicit AI operations leaves the device for the user-selected provider.
- Reddit/OpenCLI remains experimental and accepted-risk; platform enforcement or upstream behavior can change independently.
- macOS and Linux release evidence remains pending until their GitHub Actions jobs pass.
- A future packaged-binary release needs a fresh artifact-level license and code-signing review.
