# Public media assets

These files are the public visual set for Mentionish:

- `mentionish-products.png` — real Products screen captured from the local application.
- `mentionish-conversations.png` — real Conversations screen showing ranking and match reasoning.
- `mentionish-og.png` — generated 1200 × 630 repository/social preview artwork.

The screenshots should be replaced when the corresponding interface materially changes. Do not substitute invented results or fabricated product UI.

## Open Graph artwork provenance

The Open Graph image was created with Codex's built-in image generation mode. The two real screenshots were supplied as visual references—not as literal edit targets—with this initial prompt:

> Use case: ads-marketing. Asset type: GitHub repository Open Graph and social preview image, wide 1.91:1 landscape composition. Input images: Image 1 and Image 2 are visual references only for Mentionish's real product identity, palette, typography mood, dark interface, orange accent, and search/conversation concept. Do not edit or reproduce either screenshot literally. Primary request: create a striking, premium open-source product launch graphic for Mentionish that immediately communicates finding high-intent customer conversations hidden across online communities. Scene/backdrop: near-black editorial background with restrained warm-orange search beams, subtle conversation-card fragments, and a focused signal emerging from noise; sophisticated and minimal, not futuristic sci-fi. Style/medium: polished modern developer-tool campaign graphic, crisp geometric composition, high contrast, tasteful depth, suitable for GitHub and social sharing. Composition/framing: wide canvas; bold brand message with generous breathing room; visual signal/search motif supports the copy without competing with it. Color palette: match the references—near black, charcoal, warm amber-orange, off-white, tiny restrained green status accent. Text (verbatim): "Mentionish"; "Find people already talking about the problem you solve."; "LOCAL-FIRST • OPEN SOURCE • MANUAL-ONLY". Constraints: render each text line exactly once and verbatim; Mentionish must be spelled M-e-n-t-i-o-n-i-s-h; clean readable typography; no extra UI labels; no platform logos; no Reddit or Hacker News logos; no trademarks beyond the Mentionish name; no watermark. Avoid: generic SaaS gradient, purple/blue neon, fake browser chrome, fake dashboards, tiny illegible text, crowded collage, stock photography.

The final hierarchy refinement used this prompt:

> Use case: precise-object-edit. Asset type: GitHub repository Open Graph and social preview image, 1.91:1 landscape. Input images: Image 1 is the edit target. Primary request: change only the main customer-promise headline. Reduce its type size approximately 20–25%, tighten its line height slightly, and compose it as exactly three visually balanced lines: line 1 "Find people already"; line 2 "talking about"; line 3 "the problem you solve." Keep only the words "the problem" in warm orange and keep every other headline word off-white. This headline must remain the primary focal point but should no longer crowd the visual or dominate the entire left half. Constraints: preserve the newly compact Mentionish logo-and-wordmark in the upper-left exactly as it is. Preserve the footer descriptor, divider, black/charcoal background, card field, search icon and beam, highlighted conversation card, green micro-accent, palette, framing, and all other spacing as closely as possible. Render the exact headline wording once, with no missing or additional words. Preserve "Mentionish" spelled correctly. No extra copy, logos, trademarks, or watermark. Avoid: five-line headline, oversized headline, oversized brand lockup, cramped spacing, altered visual concept.

GitHub does not automatically use the image embedded in the README as the repository social preview. A repository owner must upload `mentionish-og.png` under **Settings → General → Social preview**.
