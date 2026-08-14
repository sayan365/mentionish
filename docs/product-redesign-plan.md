# Mentionish product redesign plan

Status: first complete implementation shipped locally on 2026-08-14  
Scope: local-first desktop web application, responsive down to mobile review  
Primary user: a solo founder trying to find and respond to relevant public conversations

## 1. Product experience goal

Mentionish should feel like a focused discovery workspace, not a generic admin dashboard.

The interface must answer three questions immediately:

1. Is Mentionish ready to search?
2. What should I do next?
3. Which conversations deserve my attention?

The primary loop is:

> Add product context → approve listening phrases → run a supervised scan → review ranked conversations → prepare a manual reply → record the outcome.

Every prominent action and screen should advance or explain this loop.

## 2. Problems in the current experience

- The sidebar, top bar, metrics, banners, panels, and cards compete at nearly equal visual weight.
- Letter tiles are placeholders rather than recognizable navigation.
- Overview, Products, and Conversations repeat information without establishing a clear next action.
- Scan progress and classification audit appear globally even when the user is doing another task.
- Product rows hide the quality and readiness of product configuration.
- Conversation cards are vertically heavy, which makes comparison slow.
- Settings exposes provider and source implementation details before communicating readiness.
- The product wizard has sensible fields but weak explanation of how each field affects results.
- Empty, loading, error, success, partial-source, and stale-result states do not share one consistent language.
- The main dashboard file owns too many unrelated components and states, making visual iteration risky.

## 3. Design principles

### The work surface wins

Navigation and status should recede after orientation. The selected task and its content receive the strongest contrast.

### One primary action per view

The top-right action changes with context: Add product, Start scan, or Review next. Secondary actions remain quiet.

### Progressive disclosure

Show readiness and plain-language summaries first. Provider IDs, detailed score dimensions, scan audits, and account-risk details remain one click away.

### Explain every result

Ranking is never a magic number. Each result names the matched phrase, detected need, confidence tier, source, freshness, and reason.

### Dense, not cramped

Use compact rows and predictable columns for scanning. Reserve large cards for onboarding, blocking states, and the selected conversation.

### Local-first is a benefit

Use a small “Local workspace” status in the shell and settings. Do not repeat infrastructure language throughout ordinary tasks.

### Honest source behavior

Reddit is experimental and supervised. Hacker News is the stable fallback. Ready means the connector passed a read test, not that an account is safe or approved.

## 4. Information architecture

### Primary navigation

1. **Home** — readiness, last scan, new opportunities, and the next recommended action.
2. **Products** — product context, listening coverage, and product-specific scan action.
3. **Conversations** — ranked review queue and reply workflow.
4. **Activity** — scan history, source funnel, classification audit, and failures.
5. **Settings** — AI, Sources, Data, and Appearance sections.

“Analytics” becomes Activity until real outcome history makes a standalone analytics product valuable.

### Persistent shell

- Compact 232 px desktop sidebar with real SVG icons.
- Brand and local-workspace indicator at the top.
- Navigation in the middle.
- Source readiness summarized near the bottom.
- Account/device menu at the bottom.
- Mobile: 64 px header plus bottom navigation for Home, Products, Conversations, and More.

### Page header

- Breadcrumb or short section label.
- Clear page title and one sentence of context.
- One primary action plus at most two quiet secondary actions.
- No large decorative hero on returning-user screens.

## 5. Core user flows

### First launch

Use a four-step readiness checklist on Home:

1. Connect an AI provider.
2. Verify at least one source.
3. Add the first product.
4. Run the first scan.

The user can move between steps without losing data. Hacker News provides a visible “continue without Reddit” path. Completion transitions Home from setup checklist to the returning dashboard.

### Create or edit product

Use a large centered dialog on desktop and a full screen on mobile.

1. **Product** — name, problem/outcome, ideal customer, optional URL.
2. **Discovery** — AI suggestions grouped by direct pain, help request, tool search, and workflow; editable and individually removable.
3. **Reply style** — optional voice guidance plus a final readiness summary.

The footer always shows Back and one explicit next action. Saving happens only on the final step. Closing with edits requires confirmation.

### Run a scan

From Home: “Scan all products.”  
From a product: “Scan this product.”

The scan opens a compact progress drawer containing:

- current product and source;
- reviewed, matched, and qualified counts;
- elapsed time;
- cancel action;
- expandable technical details.

The rest of the application remains usable. Completion offers “Review new conversations.”

### Review conversations

Use a two-pane desktop layout:

- left: compact ranked queue;
- right: selected conversation detail, evidence, and actions.

Mobile uses a list followed by a detail page/sheet.

Queue groups:

1. **Best opportunities** — direct need and solution/category intent.
2. **Possible matches** — relevant and reply-appropriate, but weaker commercial intent.
3. **Other keyword matches** — deterministic phrase matches rejected by AI, clearly marked as manual review.

Filters live in one toolbar: Product, Source, Tier, Status, and Search. Advanced score filters appear in a popover.

The detail area shows:

- source, community, author, age, and content type;
- title and readable source excerpt;
- “Why this matched” with human labels before numeric dimensions;
- matched phrases;
- Open source, Save, Not relevant, and Generate draft;
- draft editor only after an explicit generation action;
- manual-posting reminder adjacent to the final source action.

Low-confidence results never receive generated drafts until the user explicitly promotes them to Possible match.

### Settings

Settings uses a secondary tab rail:

- **AI models** — provider, connection status, classification model, drafting model.
- **Sources** — Reddit and Hacker News cards with readiness, last verified time, and test action.
- **Data** — database location, backup/export, retention, and reset controls.
- **Appearance** — system/light/dark theme and density.

Dangerous or experimental controls use contextual warnings, not permanent red styling.

## 6. Visual system

### Tone

Calm, precise, and technical without looking developer-only. Warm amber remains the signature accent but is reserved for primary actions, active states, and meaningful highlights.

### Color roles

- Canvas: warm neutral gray.
- Surface: near-white.
- Raised surface: white with a soft shadow.
- Text: charcoal, not pure black.
- Muted text: accessible cool gray.
- Accent: amber/orange.
- Success: green.
- Warning: amber.
- Danger: red.
- Reddit and Hacker News receive restrained source-specific tints only on badges.

Dark mode follows the same semantic roles rather than inverting arbitrary colors.

### Typography

- UI and content: Inter-compatible system sans stack.
- Monospace only for IDs, model names, and commands.
- Remove serif headings from the application shell.
- Page title: 24–28 px, semibold.
- Section title: 16–18 px, semibold.
- Body: 14 px with 1.5 line height.
- Metadata: 12–13 px.

### Geometry and spacing

- 4 px base unit.
- Page spacing: 24–32 px desktop, 16 px mobile.
- Controls: 36–40 px high.
- Radius: 8 px controls, 12 px cards/dialogs, full pills only for statuses.
- Borders are low contrast and used to express grouping, not decorate every element.
- Shadows only distinguish overlays and raised interactive surfaces.

### Components

- Icon, Button, IconButton, Badge, StatusDot.
- PageHeader, SectionHeader, EmptyState, InlineNotice.
- Metric, DataTable, FilterBar, SegmentedControl.
- ProductCard/Row, ConversationQueueItem, ConversationDetail.
- ScanProgressDrawer, ConfirmDialog, ProductWizard.
- FormField, SelectField, SecretField, ModelSelector.
- Skeletons for initial page and result loading.

All interactive components require hover, focus-visible, active, disabled, loading, error, and success states.

## 7. Content language

- Prefer “listening phrases” over switching between keywords, searches, and phrases.
- Prefer “Start scan” over “Trigger.”
- Prefer “Best opportunity,” “Possible match,” and “Other keyword match” over internal classifier labels.
- Say why an action is unavailable and what fixes it.
- Avoid repeating “Mentionish never posts for you” on every card; show it at the draft/reply decision point.
- Source readiness uses “Ready,” “Needs setup,” “Reading,” “Limited,” or “Stopped.”

## 8. Responsive and accessibility requirements

- Supported widths: 360, 768, 1024, 1440, and 1920 px.
- No horizontal page scrolling at 360 px.
- Dialogs become full-screen sheets below 720 px.
- Conversation queue/detail becomes single-pane below 960 px.
- Minimum target size is 40 × 40 px; destructive text actions receive an accessible target even when visually quiet.
- Maintain WCAG AA contrast for text and interactive states.
- Keyboard access for navigation, dialogs, filters, wizard, queue selection, and drafts.
- Focus is trapped and restored for dialogs.
- Status is never communicated by color alone.
- Respect `prefers-reduced-motion`.

## 9. State model

Every primary screen must deliberately design:

- initial loading;
- first-use empty;
- no results for current filter;
- partial source success;
- recoverable error;
- blocking configuration error;
- in-progress action;
- success with clear next action;
- stale data;
- offline/local API unavailable.

Scan feedback should be one persistent progress surface plus transient completion notification, not duplicated banners and audit panels.

## 10. Implementation sequence

### Phase A — foundation and shell

- Extract icons and shell primitives.
- Replace typography, tokens, sidebar, top bar, buttons, form controls, and responsive shell.
- Introduce a single page-header pattern.
- Preserve all existing behavior.

### Phase B — primary discovery loop

- Redesign Products as responsive cards/rows with readiness and clear actions.
- Redesign the product wizard and phrase recommendation review.
- Move scan progress into a dedicated drawer/surface.
- Redesign Conversations into ranked queue and detail views.

### Phase C — readiness and settings

- Replace Overview with action-oriented Home.
- Consolidate AI and source readiness.
- Add settings tabs and plain-language diagnostics.

### Phase D — activity and refinement

- Convert scan audit and existing analytics into Activity.
- Add skeletons, filter empty states, keyboard flows, mobile navigation, dark mode, and density preference.
- Conduct content, contrast, responsive, and motion review.

### Phase E — maintainability

- Split the monolithic dashboard into feature components and hooks.
- Add component/state tests for critical flows.
- Add screenshots or visual regression coverage for the supported widths.

## 11. Acceptance criteria

- A new user can understand the next setup action within five seconds.
- A returning user can start a product scan in two clicks or fewer.
- A user can distinguish Best, Possible, and Other matches without reading score rules.
- Product, source, and scan readiness are visible without entering Settings.
- No duplicated scan completion messages appear.
- The selected conversation and its primary action dominate the review screen.
- All current product, scan, classification, draft, archive, and connector behavior remains functional.
- Typecheck, lint, unit tests, production build, keyboard review, and responsive review pass.

## 12. Inspiration, not imitation

- [Linear](https://linear.app/now/behind-the-latest-design-refresh): subdued navigation, compact controls, and hierarchy where secondary chrome does not compete with the work surface.
- [Plausible](https://plausible.io/docs/guided-tour): immediate access to essential information with low training cost and progressive drill-down.
- [PostHog](https://github.com/PostHog/posthog): open-source product breadth and explicit setup/readiness patterns, while avoiding its complexity for this single-user scope.
- [Dub](https://dub.co/blog/introducing-dub): polished open-source SaaS presentation and concise, action-oriented data surfaces.

Mentionish will use these principles without copying their brand, layouts, or proprietary assets.

## 13. Implementation record

The first complete redesign pass now includes:

- a quieter responsive shell with semantic SVG navigation and mobile bottom navigation;
- an action-oriented Home with setup guidance, latest-discovery context, and local-data reassurance;
- product cards with readiness, product-specific scan actions, result shortcuts, and collapsed archives;
- a compact scan-progress surface with plain-language counts and expandable technical details;
- a two-pane ranked conversation workspace with tier groups, search, filters, evidence, and focused actions;
- grouped AI phrase recommendations, an ideal-customer field, final readiness review, unsaved-change protection, and keyboard-contained dialogs;
- Settings sections for sources, AI models, local data, theme, and density;
- Activity funnel metrics, source breakdown, and recent scan outcomes;
- responsive layouts, visible focus states, reduced-motion support, dark mode, and compact density.

The current repository test suite, lint, typecheck, formatting check, and production build pass after this implementation. Visual regression screenshots remain a future testing enhancement rather than a product blocker.
