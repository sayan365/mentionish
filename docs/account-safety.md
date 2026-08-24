# Account safety and community compliance

## Purpose and limit

Mentionish reduces avoidable operational and community risk. It cannot guarantee that a Reddit or X account will not be restricted, and it must never describe an unofficial access pattern as approved, allowed, undetectable, or safe.

Reddit's current User Agreement says scraping without prior written consent is prohibited. An experimental browser/session connector therefore remains accepted-risk even when it is slow, read-only, or technically successful. Rate limiting is a reliability control, not permission.

## Account Safety Center

Settings includes an Account Safety Center for every session-backed platform. It reports evidence, not a fabricated health percentage.

States are:

- Unknown: no recent live evidence or required signals are unavailable.
- Caution: incomplete rules/eligibility context, elevated recent local activity, or a recoverable platform warning.
- Paused: a cooldown, rate limit, challenge, or suspicious response requires the user to wait or inspect the native platform.
- Blocked: authentication failure, account restriction, kill switch, or explicit platform denial stops connector use.

There is intentionally no green `Safe` state. A successful live read means only that the bounded read worked at that moment.

The detail view shows:

- last native account check and live-read time;
- connector authentication state;
- recent 401, 403, 429, challenge, CAPTCHA, or unexpected-response signals;
- current cooldown or `Retry-After`, when supplied upstream;
- locally recorded scan/query volume;
- self-reported replies and insertion events, clearly distinguished from verified platform actions;
- public account age, karma, and community karma only when already returned by the connector;
- community rules and eligibility status when reliably available;
- the exact reason an action is allowed, cautioned, paused, or blocked.

Missing account metadata produces Unknown, not a favorable assumption. Mentionish does not perform extra scraping merely to fill a health widget.

## Read-side protections

Every experimental connector must:

- remain disabled until risk acknowledgement and a bounded live-read test;
- run only after a user clicks Test, Scan all, or Scan product;
- allow only one active command per authenticated platform session by default;
- reuse cached items and deduplicate product queries before making new requests;
- keep query, page, result, time, and output budgets small and explicit;
- obey upstream `Retry-After` and rate-limit signals without retrying early;
- use bounded exponential backoff only inside the active user-visible operation;
- stop immediately on authentication failure, access denial, CAPTCHA/challenge, account restriction, or repeated malformed responses;
- never rotate accounts, proxies, cookies, user agents, or backends to bypass a restriction;
- never continue through a fallback backend after a platform denial unless the error is proven to be a local tool failure rather than platform enforcement;
- provide an immediate kill switch and sanitized event history.

There is no universal documented "allowed scraping frequency" for an unofficial connector. Defaults are conservative engineering budgets and must be labeled as such. They cannot be marketed as platform-approved thresholds.

## Reply-side protections

Mentionish never submits a post, comment, reply, message, vote, follow, or join action. Local draft generation and editing do not contact Reddit and remain available before the reply preflight. Before inserting or manually posting a Reddit reply, the UI presents a preflight:

1. open and read the current post/thread in the native site;
2. review the community's current rules, especially promotion and link rules;
3. verify native posting/commenting eligibility;
4. confirm the reply is specific, useful, non-repetitive, and relevant;
5. remove unnecessary product links or calls to action;
6. disclose a product relationship when it is material;
7. edit the AI draft in the user's own voice;
8. submit manually on the native platform, if the user still chooses to reply.

The extension can insert only after an explicit click and never clicks Submit. Mentionish does not recommend a daily reply quota. Platform and community enforcement is contextual, and a numeric quota could falsely imply safety. Instead it warns on locally observed repeated drafts/replies, repeated text, repeated links/domains, or activity across many communities in a short period.

## Karma, account age, joining, and community selection

Karma, account age, verified-email state, contributor status, and community karma may affect eligibility. Reddit does not disclose every community's numeric thresholds, specifically to deter misuse. Mentionish therefore:

- displays these signals only when legitimately available;
- never recommends karma farming, artificial voting, throwaway accounts, or engagement solely to cross a threshold;
- never tells a user how long to age an account to avoid enforcement;
- never joins a community automatically;
- never recommends joining only to bypass a restriction;
- excludes or warns on communities that disallow promotion, research, bots, AI-assisted content, or the intended reply type;
- treats a native eligibility block as final and directs the user to the community's rules or moderators.

Users should participate authentically in communities they genuinely understand. A new or alternate account is not a safety mechanism and must never be used to evade an existing restriction or ban.

## Community rule intelligence

For each Reddit opportunity, Mentionish links the current thread and canonical community rules. The user records a time-stamped native review; Mentionish does not scrape or summarize rules and never claims that a saved review replaces the native rules. The review expires after 24 hours.

The rule check looks for:

- self-promotion and commercial-link restrictions;
- required disclosure or flair;
- prohibited AI-generated content;
- account/karma/verified-email eligibility surfaced by the native site;
- restricted/private community state;
- topic, formatting, megathread, and solicitation rules.

Unknown, missing, or stale evidence blocks extension insertion until a native review is recorded. A restricted promotion or AI-content policy, or an unavailable native reply action, blocks insertion. An explicit or unknown-but-reviewed policy produces Caution rather than Safe. The review can permit extension insertion only; it never authorizes submission.

## Stop conditions and recovery

The platform connector is paused immediately on:

- HTTP or tool-equivalent 401, 403, or 429;
- `Retry-After` or an upstream cooldown;
- CAPTCHA, suspicious-login, reauthentication, or verification challenge;
- account suspended/locked/restricted signals;
- explicit access denial or robots/policy denial;
- repeated timeouts or response-shape changes suggesting the connector has broken.

Recovery requires a user-visible native inspection. Mentionish never auto-solves challenges, retries with another identity, or advises ban evasion. The user may re-run one bounded live-read test after the platform-indicated cooldown and after resolving the issue natively. Repeated failures leave the connector Blocked until manually re-enabled.

## Policy sources and review

The UI links to current official policies rather than embedding permanent numeric claims:

- [Reddit User Agreement](https://redditinc.com/policies/user-agreement)
- [Reddit Spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)
- [Reddit Poster Eligibility Guide](https://support.reddithelp.com/hc/en-us/articles/33702751586836-Poster-Eligibility-Guide-Post-Check)
- [Reddit Developer Terms](https://redditinc.com/policies/developer-terms)

Policy guidance must display a last-reviewed date and be reviewed before each public release. Last documentation review: 2026-08-07.
