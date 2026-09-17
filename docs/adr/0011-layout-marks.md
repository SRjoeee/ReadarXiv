# ADR-0011: No `:has()` in the injected style sheets — structure is marked by the code that makes it

- Status: accepted (2026-09-17); implemented in the same PR.
- Evidence: the measurements below (`tests/e2e/probes/highlight-lag.mjs`, `tests/e2e/probes/insert-recalc.mjs`, run on Playwright's Chromium, 1440 × 900); the owner's report of 2026-09-17 that the hover highlight "sometimes lags behind the pointer", observed on 2609.00080v1.

## Context

Side mode's layout was declarative to the last condition: a pairing container was any element that `:has(.axt-t, [data-axt-id])`, the left column any element that `:has(+ .axt-t)`, a frontmatter note left arXiv's gutter when it `:has(.axt-t:not(.axt-pending, …))`, a multi-panel figure was `.ltx_flex_figure:has(> .ltx_flex_cell:not(.ltx_flex_size_1))`, an image overlay's anchor was `img:has(+ .axt-img)`. Eighteen `:has()` selectors in `modes.css`, two in `image.css`. The MVP's rule (CLAUDE.md, 2026-09) was that layout must be written in the style sheet and never rely on marks the runtime writes, "or the layout and the JavaScript lifecycle would be coupled".

The hover highlight paints its bands as `<div>`s inside one layer on `<body>` (DESIGN §7.7). Its own work per pointer frame is small — one `caretPositionFromPoint` at 0.1–0.25 ms, two binary searches, a rewrite of the layer only when the sentence changes; the pointer event reaches the DOM update in 8–13 ms at the median, the frame alignment of `requestAnimationFrame`. Yet on long papers every sentence change stalled the page. Measured with the pointer swept down a column at 125 Hz:

| Page, settled, side mode | Elements | Style recalculation per band rewrite | Long tasks per 4 s sweep | Highlight off |
|---|---|---|---|---|
| 2410.00260 | 4 531 | 14–20 ms | 0 | 0 recalculations |
| 2609.00080v1 (the owner's) | 55 976 | 141–146 ms | — | — |
| 2312.17141 | 59 035 | 180–197 ms | 9–10, longest 197 ms | 0 recalculations, 2 ms total |

The trace's `UpdateLayoutTree.elementCount` was the whole document each time (58 832 of 59 035). The same recalculation followed **any** element insertion — a `<div>` into the band layer, into a plain host on `<body>`, into `<head>` — and a text node cost nothing. A translation node landing after a paragraph cost the same 164 ms; while a paper translates, 13–20 long tasks of 130–300 ms per sweep window were almost entirely style recalculation (`RecalcStyleDuration` 2.2–3.1 s against `ScriptDuration` 20–35 ms).

Chrome's invalidation tracking named the cause: on an insertion, the siblings and ancestors of the insertion point are "Affected by :has()" and each gets "Invalidation set invalidates subtree". With the `:has()` rules deleted from the sheet through the CSSOM, the band insertion cost 0.2 ms on the light paper and 1.4 ms on the heavy one, the translation insertion 0.3 and 2.4 ms. Restricting the `:has()` subjects to a class or tag bucket did not help (124–146 ms); replacing only some of the rules did not help (52–90 ms); only a sheet without `:has()` reached the floor.

## Decision

1. **The injected style sheets carry no `:has()`.** `tests/styles/no-has.test.ts` fails the build on the first one, outside comments. Selectors with `:has()` may still be used from TypeScript — `querySelectorAll`, `matches`, `closest` — because a query sets no invalidation state; `SIDE_CONTAINER`, `MULTI_PANEL_FLEX` and the rules module's `bibitem` selector stay as they are.
2. **Every structural condition the layout needs is a `data-axt-*` mark written by the code that creates the structure, at the moment it does**, and removed by the code that takes the structure away. §7.1 already allows an original to gain `data-axt-*` attributes; `restore()` sweeps them all.

   | Mark | On | Replaces | Written by | Removed by |
   |---|---|---|---|---|
   | `data-axt-pairs` | every element between a block and the translation root | `:has(.axt-t, [data-axt-id])` | `markBlocks` (extractor), with the block marks | `restore()` |
   | `data-axt-mirrored` | the original a mirror follows | `:has(+ .axt-t)` | `createMirrors` | `dropMirror` (an overlay or a split taking the mirror's place), `restore()` |
   | `data-axt-split` (existing) | the figure with a split copy | `:has(+ .axt-t)` | `splitFigures` | `dropStaleSplits`, `restore()` |
   | `data-axt-tail` | the original whose translation-side node is its container's last child | `:nth-last-child(2):has(+ .axt-t)` | `markTail`, after every insertion of an `axt-t` sibling (translation, skeleton, widget, mirror, split copy) | `markTail`, after every removal of one |
   | `data-axt-panels` | a multi-panel flex figure | `.ltx_flex_figure:has(> .ltx_flex_cell:not(.ltx_flex_size_1))` | `markStructure`, once per session after the block marks | `restore()` |
   | `data-axt-tagged` | a list item whose marker is its child | `.ltx_item:has(> .ltx_tag)` | `markStructure` | `restore()` |
   | `data-axt-translated` | a frontmatter note holding a real translation, and the box the translation is a direct child of | `:has(.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split))` | `markTranslatedNote`, after `renderText` / `renderTable` | `markTranslatedNote`, after `clearTranslation` (a retry, a failure, a retranslation) |
   | `data-axt-note-translated` | a footnote's margin copy once its translation is placed inside | `.ltx_note_content:has(> .axt-note-t)` | `localizeNotes` | `delocalizeNotes` |
   | `data-axt-anchor`, `data-axt-anchors` | an image an overlay follows, and its parent | `img:has(+ .axt-img)`, `:has(> .axt-img)` | `renderImage`; `splitFigures` for the copy's overlays (the clone loses every `data-axt-*`) | `clearImage`, `clearImageEverywhere` |

3. **The marks and the structural queries must agree.** `tests/renderer/side-layout.test.ts` checks on every fixture that the elements carrying `data-axt-pairs` are exactly those matching `:has(.axt-t, [data-axt-id])` once the page is translated; `tests/renderer/layout-marks.test.ts` follows each other mark through insertion, replacement and removal.

## Consequences

- Measured after the change, same probe, same papers: a band rewrite recalculates **one element** (0.1–0.2 ms) instead of the document; a translation insertion 1.1 ms on 2410.00260, 3.3 ms on 2312.17141, 3.0 ms on 2609.00080v1. The whole-tree recalculation itself (a custom property changed on `<html>`) fell from 182 to 82 ms on 2312.17141: evaluating `:has()` for every element was part of every recalculation, not only of the invalidation.
- The MVP rule "no runtime marks for layout" is withdrawn for this reason and this reason alone. The coupling it feared is real and is paid for by tests: a mark's writer and remover are named above, and a mark that lies fails a unit test. What the rule protected — the layout stays declarative in one sheet, readable without running the code — still holds: the sheet reads marks, it does not compute them.
- Nothing else in §7.7's strategy changes: the hit test, the coalescing, the observers and the 120 ms holds were measured at the floor and stay.
