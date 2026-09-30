# The PDF reader's highlight: sentence level, a clean wash, the pin, whole floats — plan

Branch `exp/pdf-highlight` (from `exp/pdf-bilingual` at `a7a2a056`), worktree `.worktrees/exp-pdf`. The work's ledger,
the two investigations and the anchoring task's brief and report are in
`.superpowers/sdd/2026-09-30-pdf-highlight/` (`report-A.md`, `report-B.md`, `a1-*.md`); the look was decided on a draft
round, `~/Downloads/readarxiv-test/design/pdf-highlight/round-1/` (`README.md`, `index.html`, and its prototype:
`tools/hl-proto.mjs`, `tools/scratch.patch`, a reference for the geometry, not code to paste).

## The maintainer's decisions (2026-10-01)

1. **Sentence level**, falling back to the paragraph where a unit's sentences are not verified on both sides.
   Microsoft's own sentence lengths (`sentLen`) first; the LLM path once it is measured with a key.
2. **Hover lights as today; a click lights the clicked sentence (or unit) on both sides and holds it** until the
   pointer lights another; a tap does the same on touch; **a click on empty space lets go**. The held wash looks the same
   as the hovered one.
3. **Tables and figures light whole**: a table (and an algorithm) as one wash over it to its rules, with its caption; a
   figure outlined, its caption washed; hovering the float or its caption lights both, on both sides.
4. **The look** (round 1, as recommended): the sentence shape (first row from its start, the rows between across the
   run, the last row to its end with its punctuation); units without verified sentences as one block per page-and-column
   run; over formulas one block per page and column, displays inside; one outline per shape, 3 px radius, half the
   leading above and below, 3 px beside the column's text.
5. **Performance and the reader's experience are not to be compromised**: every task measures what it adds on the
   heaviest paper (2608.02459, 88 pages) and a two-column one, against the base, interleaved; nothing on the pointer path
   reads layout; geometry is built per page as the page is first drawn, not all at open.

## Done before this plan

- The investigations (reports A and B), the draft round, and **A1** — the anchoring fixes that change no look:
  `039961ca`, `1322a934`, `726b9b85`, `54b0570d`, `15be0c86`, `27a39d04`, `d6cd5807`, `7027af26`, `87f75832`
  (headings 333/333 on both sides, displays outside the marks reached, the full-stop marker; the numbers in
  `a1-report.md`). Its review is the first gate of Phase B.

## Global constraints

- The DOM and prefix rules (CLAUDE.md 1, 2); no `:has()` in injected sheets (9); the platform boundary (8).
- No new or moved TeX mark; anything that touches what `latex-front.mjs` typesets runs `spikes/marks-gate.mjs`.
- The reader's pixel baseline is never re-recorded; `reader-pixels.mjs` 24 × ok after every task.
- A cached copy made before this work keeps working: new record fields are additive and optional, an old copy shows
  paragraph blocks until it is translated again; no `PIPELINE_VERSION` bump unless a task proves one is needed and says
  why.
- The pointer path: one hit test and one paint per animation frame, the pointer read before the washes are written, no
  layout read (page offsets kept on pagesinit, zoom and resize; the pane's scroll as the sync reads it); a miss held
  120 ms (the HTML page's value).
- Tests first for every behaviour; one commit per task step that reads apart; the chained gate before each commit;
  files added by name; English; no push without the maintainer.

## Tasks (sequential, one implementer in the worktree at a time; each reviewed before the next)

### B1 — geometry, the block, the hit test, the paint (paragraph level)

Replace `blocksOf` and the rectangle hit test (report-A causes 1, 2) with the round's geometry at the paragraph level:
page lines → a unit's runs (one page, one column) → rows (vertically overlapping lines merged: a display's zig-zag is
one row) → a run's block inside the **document's** column text edges (per page parity and column, from every page's
long lines; round 1 README "What the proposal draws"); one outline per block (3 px radius, half the leading above and
below, 3 px beside); the hit test is exactly the painted shape (no holes); geometry per page on its first drawing;
the pointer path per frame in `requestAnimationFrame`, no layout read; the 120 ms miss hold. Carry punctuation and
closing delimiters' widths beside the tokens (a CJK closing mark half an em) so shapes end after them. Add A1's fills'
two limits (running text only; stop at a line holding another unit's words) and fill an inline formula `between`
refuses (round 1 README, "needs" 6). Acceptance: report-A's hole measure 0 inside painted shapes on the ten papers;
fragmented display units 0 (one block per page-and-column run); per-light script and style+layout within round 1's
measured 0.2–0.3 / 0.3–0.5 ms; open time on 02459 not above the base beyond noise; a probe kept in the repository that
measures these (per-kind lit counts, holes, blocks per run, per-light cost) — the regression gate for B2–B5.

### B2 — the pin

A click (press and release within 4 px and 600 ms, no selection) lights its target on both sides and holds it; the
hover lights over it and the hold goes when the pointer lights another; a click on nothing lets go; a tap the same;
the held wash survives the click's own alignment and PDF.js's redraws (`pagerendered` repaints it); the same look as the
hover. Keyboard: none asked — say what exists. Acceptance: a browser test of hover, click, click-on-nothing, tap, and
the held wash after `alignClick`, both sides.

### B3 — sentence level

Keep Microsoft's `alignment` in `engine.mjs` (today dropped at :90); clean the boundaries (out of markers, a trailing
`#` dropped — report-B §2(a)); store per-unit sentence starts in the record (additive; old copies fall back); find each
sentence's first word inside the unit's paragraph bounds on both sides (report-B option X); **decide sentence or
paragraph per unit for both sides together**; the sentence shape (the boundary mid-row halfway through the space; the
first sentence from where the unit's first line starts, over the words before the start mark); headings, captions and
cells stay whole. The LLM path stays paragraph until measured with a key (then `sentenceCuts` + `<x id>` markers as the
HTML page's tags path — a later task). Acceptance: report-B's numbers held on the product path (aligned units per paper,
same line as ground truth 97–100 %, sentence edges through ink ≤ round 1's 3 of 72); per-light cost unchanged; the
record's size growth stated.

### B4 — tables and figures whole

Float regions per page on its first drawing: figures from `regionsOf`, each to its nearest caption only; tables and
algorithms as the caption's column's lines on the side away from it that belong to no running-text unit and lie in no
figure, widened and lengthened to their rules (PDF.js 6 `constructPath` args `[op, data, minMax]`, the tracked CTM,
outside forms), bounded by their own rules (round 1's table I reached into the next column's algorithm title — must
not); a cancelled drawing retries on the next. Tables: one wash with the caption (T1); figures: an outline, the caption
washed (T3); hover or click on either lights both, both sides. Acceptance: per-kind counts for tables, figures,
algorithms lit on both sides; the table-I case bounded; cost per page stated.

### B5 — documents, the gate, the record

The reader's design document and `docs/DESIGN.md` sections for the highlight (what lights, when, how it looks, the
fallbacks, the costs measured); CHANGELOG's Unreleased; the probe from B1 documented as a command; the plan's record.
Then the whole-branch review (local), the maintainer's hand check on a build, and the pull request into
`exp/pdf-bilingual` with the maintainer's yes (one Codex round; after it only real defects are fixed — the rest to #299).

## Later (not in this plan)

- The LLM path's sentences, measured with a key first.
- Today's end marks shift some Chinese last lines 2–14 pt (report-B side finding): for the Flow rules' check when they
  arrive from the other session.
