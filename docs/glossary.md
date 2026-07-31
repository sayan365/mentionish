# Glossary

| Term | Canonical meaning |
|---|---|
| Product | A user's tracked business/product campaign, including description, keywords, and voice persona |
| Platform item | A Reddit submission or Hacker News item fetched from an external API |
| Scanned post | The shared, deduplicated stored representation of a platform item |
| Keyword match | A platform item that passes deterministic keyword filtering for a product |
| Scan usage | A billable unit whose exact definition is unresolved in `DEC-001` |
| Opportunity | The relationship between one scanned post and one product, with intent score and lifecycle status |
| Qualified opportunity | An opportunity with `intent_score >= 60` |
| Draft | AI-generated reply text and the user's optional edited version |
| Posted | A user-declared state; v1 does not verify the platform submission |
| Karma stage | A product/subreddit promotion-safety state: newcomer, contributor, trusted, or established |
| Self-promotion allowed | A manually seeded rule indicating whether the subreddit permits relevant promotion, subject to its rules |
| Extension token | A revocable backend credential created for the Chrome extension; it is not a Supabase browser session cookie |
| Entitlement | Server-side plan state and limits derived from verified payment events |
| Auto-posting | Any code that invokes a platform write API, clicks/submits a native post action, or otherwise publishes without the user's deliberate native-platform submit action |

## Opportunity statuses

| Status | Meaning |
|---|---|
| `new` | Qualified opportunity is available and no draft has been persisted |
| `drafted` | At least one draft has been generated |
| `posted` | User explicitly marked the opportunity as posted |
| `skipped` | Classifier score was below threshold or user intentionally dismissed it |

Status transition rules are defined in [`api-specification.md`](api-specification.md).

## Plan names

| Value | Meaning |
|---|---|
| `free` | Default account with launch limits still to be decided |
| `lifetime` | One-time founder offer |
| `monthly` | Recurring growth plan, with v1 UI explicitly deferred |
