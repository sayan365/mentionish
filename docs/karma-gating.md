# Karma-Gating and Promotion Policy

## Purpose

Karma gating reduces the chance that drafts violate community norms. It constrains AI output; it does not grant permission to post, verify a Reddit identity, or replace human judgment.

## State behavior

| Stage | Product mention | Link | Required evidence |
|---|---|---|---|
| `newcomer` | Forbidden | Forbidden | Default for unknown/new community |
| `contributor` | Only when policy permits | Only when `self_promo_allowed` and at least 3 prior non-promotional comments | Three user-attested contribution entries |
| `trusted` | Allowed only within recorded rules | Allowed only within recorded rules | Manually assigned stage and current rules |
| `established` | Same permission boundary as trusted | Same permission boundary as trusted | Manually assigned stage; tone may assume greater familiarity |

The table resolves the PRD's contributor link condition conservatively. When contributor conditions fail, both product mention and link are forbidden.

## Effective policy calculation

```text
if platform != reddit:
  use platform-specific conservative guidance
else if no current rule (missing or older than 90 days):
  newcomer policy
else if stage == newcomer:
  forbid product and link
else if stage == contributor:
  allow promotion only when self_promo_allowed
  AND qualifying contribution entry count >= 3
else:
  follow manually stored current rules
```

“Allowed” means the generator may use a relevant mention when helpful; it must not force promotional content into every draft.

## State transitions

The PRD names stages but does not define numeric automatic transitions. V1 should use explicit user/admin changes:

```text
newcomer -> contributor -> trusted -> established
```

Allow downgrade to any safer stage when rules or standing change. Record who changed the stage, when, and the prior/new values. V1 never auto-promotes based solely on `karma_threshold`.

## Launch seed record

Each of 20–30 launch subreddits should include:

- normalized subreddit name;
- self-promotion allowed flag;
- plain-language rules summary;
- source URL;
- minimum karma/account conditions when known;
- verification date;
- conservative default stage for new users.

Rules change. Display `rules_verified_at`, provide a manual review process, and fail to newcomer constraints when data is missing or stale according to an approved staleness window.

## Deterministic enforcement

For policies forbidding links/product names, check generated text after the model returns:

- `http://`, `https://`, `www.`, markdown links, and known product domains;
- normalized product name and configured aliases;
- obvious formatting variations where feasible.

This is a safety net, not a complete moderation engine. The UI must show the active policy and remind the user to verify current community rules before posting.

## Approved supporting data

`DEC-005`–`DEC-007` approve identity-level community standing, auditable contribution entries, and shared detailed rule records with source and verification time. Rules older than 90 days are stale and drafting falls back to newcomer constraints.
