# UX Contract

## Product context

- Audience: solo founders using a single-user local installation.
- Primary jobs: configure sources and AI, define products, run supervised scans, review evidence, and prepare manual replies.
- Target market and locale: English-language, desktop-first open-source users; source content remains in its original language.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope                        | Authoritative source                                                     | Source type                      | Reviewed date |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- | ------------- |
| Local runtime and permission boundary | `docs/requirements.md` LOC-001-006, SEC-001-005                          | Requirements                     | 2026-08-26    |
| Data lifecycle, backup, and reset     | `docs/requirements.md` SEC-006 and `docs/authentication-and-security.md` | Requirements / security contract | 2026-08-26    |
| Restore and migration behavior        | `docs/database-schema.md` and `docs/local-data-lifecycle.md`             | Data contract / recovery runbook | 2026-08-26    |
| Manual-only platform actions          | `docs/requirements.md` DRAFT-004-009                                     | Requirements                     | 2026-08-26    |
| Billing                               | `docs/requirements.md` LOC-006                                           | Explicitly out of scope          | 2026-08-26    |

## Visual contract

- Project design context: `DESIGN.md`.
- Runtime token owner: `docs/theme.css`; `apps/dashboard/src/app/styles.css` consumes it.
- Supported themes: system, light, and dark.
- Token and interaction drift gates: strict premium audit, lint, typecheck, tests, and production build.

## Canonical UI map

| Capability     | Canonical owner                                          | Allowed variants                                        | Verification                                      |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Select/Listbox | Native platform control                                  | Native only while OS popup ownership remains acceptable | Keyboard and supported-browser check              |
| Form           | Existing labeled native fields and shared action classes | Create, edit, typed destructive confirmation            | Validation, keyboard, failure recovery            |
| Scrollbar      | Global application scrollbar tokens                      | Bounded source-content and conversation-list regions    | Computed style and visual check                   |
| Dialog         | App-owned modal/alert dialog pattern                     | Setup and destructive confirmation                      | Trap, Escape, inert background, focus restoration |
| CRUD           | Loopback API plus server-confirmed dashboard state       | Inline edit, archive/restore, local reset               | Full-flow integration tests                       |

## Component behavior

- Buttons preserve geometry while busy, block duplicate activation, and expose disabled/busy state.
- Inputs retain visible labels, inline help and errors, and the global focus ring.
- Status messages use persistent inline regions for failures or consequential recovery information; they are not toast-only.
- Destructive confirmation initially focuses Cancel. Escape cancels, background content is inert, and focus returns to the trigger.

## Dataset and flow policy

- Conversation filters and selected items are route-backed where implemented; bounded lists own their scroll region.
- Create/edit product flows save only on the final explicit action and preserve entered values on recoverable errors.
- Product removal is recoverable archive. Workspace reset is high-impact: typed `RESET`, pessimistic server acknowledgement, and an integrity-checked automatic backup before clearing data.
- Backup remains on the Settings route and reports the exact downloaded filename. Restore is offline; Mentionish never replaces an open SQLite file.
- Server failures keep the relevant dialog or panel open with an actionable inline error.

## Navigation and responsive behavior

- Document titles use `{Page} - Mentionish` through route metadata.
- Settings sections are bookmarkable routes under `/dashboard/settings/*`.
- Desktop uses the persistent sidebar; narrow layouts preserve every action through the existing responsive shell.
- Important paths wrap and remain copyable; they are never available only through hover.
- Sticky UI must not obscure focused content.

## Async, validation, and security

- Mutations are pessimistic. Duplicate submissions are disabled; stale initial loads cannot overwrite an unmounted panel.
- The dashboard uses app-owned inline errors and does not call browser `alert`, `confirm`, or `prompt`.
- The local installation token stays in memory. Secrets never appear in database backups, API responses, URLs, logs, or success messages.
- Local backup downloads may contain product descriptions, public usernames/source text, and drafts, so the disclosure remains visible beside the action.
- Offline restore and uninstall behavior is maintained in `docs/local-data-lifecycle.md` rather than duplicated across screens.

## Verification

- Required: formatter, lint, typecheck, tests, production build, startup/API smoke, strict premium audit, and anti-pattern search.
- Themes: system/light/dark; representative desktop and narrow layouts; reduced motion and keyboard dialog flow.
- Canonical sibling: product archive confirmation and Settings source/provider mutations.
