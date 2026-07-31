# Chrome Extension Specification

## Scope

The extension assists only on Reddit. It finds an already-discovered opportunity belonging to the authenticated Mentionish user, shows the draft in a sidebar, and inserts user-approved text into Reddit's native editor. It never submits a comment, scrapes in the background, or calls a Reddit write API.

## Manifest V3 components

- `content_scripts` matching only required Reddit HTTPS origins;
- service worker for backend requests/auth coordination where appropriate;
- `storage` permission for extension settings and scoped token;
- minimal host permissions for Reddit and the Mentionish API;
- no broad browsing-history, cookies, or unrelated-site permissions.

The final manifest should use the narrowest URL patterns that support current and old Reddit variants. Chrome Web Store policy must be verified before release.

## First-time connection

1. User creates an extension token in the authenticated dashboard.
2. Dashboard displays plaintext once.
3. User enters/pastes it into extension onboarding, or uses an approved secure linking flow.
4. Extension validates it against a lightweight authenticated endpoint.
5. Token is stored in `chrome.storage.local`, never page DOM/localStorage.
6. Dashboard lets the user view last use and revoke the token.

Use least-privilege scopes such as `opportunities:read` and `drafts:write`. Token lifetime is subject to the security decision; revocation is mandatory.

## Thread detection

Support known Reddit thread URL patterns through a tested parser. Extract the Reddit submission ID, normalize it, and call:

```text
GET /api/opportunity-by-post?platform=reddit&external_id={id}
```

Debounce SPA navigation and rerun detection on relevant history/DOM changes. Do not trust arbitrary IDs from query parameters. If no owned opportunity exists, render nothing or a small neutral unavailable state.

## Sidebar

Render inside a shadow root to isolate styles. Show:

- product display name when multiple matches are possible;
- intent score and reasoning;
- active subreddit safety rule;
- editable draft textarea;
- save state;
- “Insert into Reddit” button;
- explicit text that Reddit submission remains manual.

All platform and AI text is inserted/rendered as text, never `innerHTML`.

## Editor insertion

Reddit may expose a textarea, contenteditable rich-text editor, or different DOM across versions. The adapter should:

1. locate only a visible native comment editor for the current thread;
2. ask the user to open/focus the reply composer if no safe target is found;
3. preserve existing user text unless the user explicitly confirms replacement;
4. set text using the editor-compatible DOM/value mechanism;
5. dispatch `input` and, if required, `change` events with bubbling;
6. focus the editor so the user reviews it;
7. stop—never find or activate the submit button.

Selectors belong in versioned adapter modules with DOM fixture tests and graceful unsupported-state messaging.

## Draft editing

The sidebar autosaves edited text with a short debounce and optimistic concurrency. Disable insertion while a save is pending or failed; enable it only when the visible text is confirmed persisted. Copy remains available as a failure fallback. Insertion does not mark posted. The user must mark posted in Mentionish because v1 cannot verify native submission.

## Security boundaries

- Never expose the extension token to the Reddit page context.
- Keep privileged messaging between content script and service worker validated by message shape and sender.
- Permit API requests only to configured HTTPS origins.
- Redact tokens from logs and errors.
- Apply a restrictive extension content security policy; no remote executable code.
- Do not access Reddit cookies, read unrelated page content, or collect browsing history.
- API always rechecks user ownership; an external post ID is not authorization.

## Failure states

- Invalid/revoked Mentionish extension token: request re-authentication or issue a replacement extension token.
- No opportunity/current draft: do not invent or generate content implicitly.
- Multiple matches: let the user choose if supported; never expose another user's data.
- Unsupported Reddit layout/editor: provide copy-to-clipboard fallback without submission automation.
- API unavailable: show retry/copy options and keep page behavior untouched.
- Policy validation failure: block insertion until the draft is corrected.

## Release checklist

- Manifest contains no unused permission.
- Current Reddit SPA navigation and supported legacy layout are tested.
- No code path clicks submit or sends a platform write request.
- Token revocation takes effect promptly.
- Shadow DOM styles do not alter Reddit.
- User-entered Reddit text is not overwritten without explicit confirmation.
- Store listing accurately describes data access and manual posting boundary.
