---
version: alpha
name: "Mentionish"
description: "A focused local discovery workspace with restrained editorial hierarchy and evidence-first operational states."
colors:
  primary: "#F59E0B"
  background: "#FBFBFC"
  foreground: "#202124"
  card: "#FFFFFF"
  muted: "#F5F6F8"
  border: "#E2E4E9"
  danger: "#EF4444"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  serif:
    fontFamily: "Source Serif 4, serif"
  mono:
    fontFamily: "JetBrains Mono, monospace"
rounded:
  DEFAULT: "0.5rem"
  sm: "0.4rem"
  md: "0.65rem"
  lg: "0.8rem"
spacing:
  base: "0.25rem"
  page-max: "none; the application shell owns the available viewport"
components:
  button: {}
  card: {}
  dialog: {}
  navigation: {}
  input: {}
  status: {}
---

# Mentionish Design System

## Overview

### Creative North Star

A quiet analyst's workbench: dense enough to compare evidence quickly, calm enough to support deliberate decisions, and explicit about uncertainty. Amber behaves like a physical highlighter—used for the current action or evidence requiring attention, never as general decoration.

### Product context and register

- **Audience and primary job:** Solo founders reviewing public conversations and deciding where a genuinely useful manual reply is appropriate.
- **Target market and evidence:** English-speaking open-source users running the product on their own device; this follows the local-first product roadmap and current English interface.
- **Locale and language policy:** English UI with plain-language labels. Dynamic source content remains in its original language. No locale is inferred from the machine.
- **Usage scene:** Desktop-first, repeated scanning and review sessions, with a compact sidebar and information-dense evidence panels. Responsive layouts must preserve every action on smaller screens.
- **Register:** Product workspace. Marketing-page scale and decorative hero treatments do not belong inside authenticated/local routes.
- **Memorable signature:** An amber evidence rail and compact serif workspace headings.
- **Restraint:** Forms, settings, safety states, tables, and destructive actions use familiar patterns and literal labels.
- **Anti-references:** Generic admin templates with oversized headings, gradients, floating glass panels, excessive pills, or status colors that imply certainty unsupported by evidence.
- **Token ownership/runtime mapping:** This document mirrors the canonical runtime tokens in `docs/theme.css`; `apps/dashboard/src/app/styles.css` consumes those variables. Token changes begin in the theme file and must remain valid in light and dark themes.

## Colors

Amber `#F59E0B` is the primary action and attention color. Neutral backgrounds, cards, borders, and text carry most hierarchy. Red is reserved for blocked/error/destructive states. Unknown and paused states use neutral text; caution uses amber. Dark mode maps the same semantic roles through `docs/theme.css`. Focus always uses the ring token, and no color-only state may omit a text label.

## Typography

Inter is the interface family. Source Serif 4 is limited to important page and content headings; it must not enlarge routine dashboard chrome. JetBrains Mono is reserved for commands, identifiers, and diagnostic values. Body copy should stay readable at compact desktop sizes with roughly 1.4–1.6 line height. Uppercase kickers are short and never substitute for a heading.

## Layout

The desktop shell uses a fixed compact sidebar and a fluid workspace. Primary page headers remain shallow. Settings use a stable local section navigation and one readable content column. Comparison evidence may use grids, but collapses without horizontal scrolling. Long source content receives its own bounded scroll region; actions remain visible without forcing the entire page to jump.

## Elevation & Depth

Hierarchy comes from tonal surfaces, one-pixel borders, spacing, and occasional offset shadows. Sticky action bars use an opaque card surface and a top border. Nested cards should not accumulate shadows. Dark mode must distinguish layers by borders and subtle tonal steps rather than glow.

Overlay order is owned by `docs/theme.css`: backdrop `500`, dialog `600`, and toast `900`. Components consume the semantic `--z-*` variables; raw high z-index values are not allowed.

## Shapes

Controls use the shared 0.5rem radius. Larger cards may reach 0.8rem. Pills are reserved for compact status, count, or source labels. Square icon containers align to the control grid; arbitrary blobs and decorative rounded rectangles are forbidden.

## Components

### Foundational visual states

Every interactive element needs default, hover, focus-visible, pressed, disabled, and busy treatment. Async regions provide loading, success, honest empty, partial success, and actionable failure states. Safety status uses only Unknown, Caution, Paused, and Blocked—never Safe.

### Buttons and actions

One primary button is preferred per action region. Secondary actions use a neutral border. Destructive actions remain spatially separated and require explicit wording. Busy labels preserve control width where practical and disable duplicate submission.

### Navigation and data display

The sidebar uses icons plus persistent text labels. Active navigation receives a quiet surface and amber cue. Tables and queues favor alignment, concise metadata, and scan-friendly titles. Badges report state; they do not act as unlabeled buttons.

### Forms and overlays

Labels remain visible above inputs. Help text explains consequences, not field names. Validation stays near the field and preserves entered data. Dialogs keep their header and action footer stable while only necessary long content scrolls.

### Iconography

Use the repository's `AppIcon` outline family at consistent optical sizes. Icons support text labels and do not replace them for navigation, safety, or destructive actions.

### Motion

Transitions are brief, approximately 140ms, and communicate focus, selection, or disclosure. Avoid ornamental motion. Respect reduced-motion preferences and never animate layout in a way that interrupts reading.

### Content and data visualization

Copy is direct, specific, and honest about local execution and unofficial connectors. Counts always identify their unit and time window. Evidence panels distinguish observations from recommendations. Charts and summaries retain accessible text equivalents.

## Do's and Don'ts

- **Do:** Reuse server-derived state across Settings, sidebar, and scan controls.
- **Do:** Keep the next safe action visible beside the evidence that explains it.
- **Don't:** Call an account, connector, or activity level safe.
- **Don't:** use oversized headings, excessive pills, or nested shadows to manufacture hierarchy.
