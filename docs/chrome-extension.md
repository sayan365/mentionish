# Browser extension specification

## Purpose

The optional Manifest V3 extension provides:

- pairing with the local Mentionish API;
- browser-session readiness for supported experimental connectors;
- explicitly requested read-only browser tasks when the selected backend requires them;
- opportunity lookup for the current native URL;
- draft display/editing;
- user-clicked insertion into a supported native reply editor.

It never submits content.

## Pairing

1. User opens Settings > Extension and clicks Pair extension.
2. Dashboard displays a short-lived code/request.
3. Extension connects to loopback and shows the same request.
4. User confirms in the dashboard.
5. Extension receives a scoped random token once and stores it in extension storage.
6. Dashboard lists the pairing with revoke action.

No dashboard login is required, but arbitrary websites must not access the local API.

## Permissions

Use the smallest permissions possible:

- storage;
- activeTab;
- scripting only when required;
- explicit host permissions for enabled supported platforms;
- loopback API origin.

Avoid broad browsing-history, cookie, tabs, or all-sites permissions. Cookie access is not granted to the Mentionish extension unless a separately reviewed connector absolutely requires it; prefer Agent Reach/OpenCLI handling its own session.

## Scan bridge

If a connector uses the extension:

1. Dashboard explicitly starts a scan.
2. Local API creates a bounded task.
3. Extension's service worker retrieves the task over its paired loopback channel.
4. Content scripts operate only on the target supported origin and return public normalized content.
5. Progress and errors return to the local scan operation.
6. Work stops at completion, cancellation, auth failure, or budget.

The extension does not initiate periodic work.

## Source detection

Content scripts parse stable native identifiers and canonical URLs for Reddit and X. Single-page navigation is observed only on allowed origins. Unsupported layouts return a recoverable error instead of guessing.

## Reply assistance

The sidebar shows source context, score/reason, editable draft, Copy, Insert, and Open dashboard.

Insert:

1. requires a visible user click;
2. confirms the native URL and displays the Account Safety/community-rule preflight;
3. locates the current native reply editor;
4. refuses if the editor is ambiguous;
5. preserves existing text and asks before replacement;
6. dispatches expected input events;
7. stops before any submit control.

The extension never clicks or programmatically triggers submit, comment, reply, post, vote, like, follow, or message actions. Insertion does not mark Replied.

## Security

- Validate every message schema and source origin.
- Escape all rendered source/AI text.
- Use Shadow DOM or strict style isolation.
- Never expose local tokens to page scripts.
- Never log draft text, credentials, or connector cookies unnecessarily.
- Pairing tokens are scoped and revocable.
- The local API can disable all extension tasks immediately.

## Required tests

- pairing/revocation;
- unsupported origin rejection;
- Reddit/X URL parsing fixtures;
- SPA navigation;
- textarea and contenteditable insertion;
- existing-text preservation;
- no-submit invariant;
- no vote/like/follow/message commands;
- expired/revoked token;
- local API unavailable;
- DOM-layout failure with copy fallback.