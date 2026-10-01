# The PDF reader's highlight: sentence level, a clean wash, whole floats — plan

Branch `exp/pdf-highlight` (from `exp/pdf-bilingual` at `a7a2a056`), worktree `.worktrees/exp-pdf`. The work's ledger,
the two investigations and the anchoring task's brief and report are in
`.superpowers/sdd/2026-09-30-pdf-highlight/` (`report-A.md`, `report-B.md`, `a1-*.md`); the look was decided on a draft
round, `~/Downloads/readarxiv-test/design/pdf-highlight/round-1/` (`README.md`, `index.html`, and its prototype:
`tools/hl-proto.mjs`, `tools/scratch.patch`, a reference for the geometry, not code to paste).

## The maintainer's decisions (2026-10-01)

1. **Sentence level**, falling back to the paragraph where a unit's sentences are not verified on both sides.
   Microsoft's own sentence lengths (`sentLen`) first; the LLM path once it is measured with a key.
2. **Hover lights, as today.** (Round 1 also drew a pin — a click lighting and holding its target, a click on empty
   space letting go; the maintainer dropped it on 2026-10-01 after B1's build: no pin. A click only levels the panes, as
   today.)
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
measures these (per-kind lit counts, holes, blocks per run, per-light cost) — the regression gate for B3–B5.

### B2 — the pin (dropped)

Dropped by the maintainer on 2026-10-01, before any code: hover alone lights; a click levels the panes as today.

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

## Record

Branch `exp/pdf-highlight` from `a7a2a056`; every number measured 2026-10-01 on the ten papers of the investigation
(`data/runs/highlight-ten`), investigator B's four ground-truth papers (`data/runs/highlight-gt`) and the demo papers
(`spikes/highlight-papers.mjs`), by `spikes/highlight-gate.mjs` and `spikes/highlight-gate-browser.mjs`. The work's
ledger, briefs, reports and reviews: `.superpowers/sdd/2026-09-30-pdf-highlight/`.

### What was done

- **A1 — anchoring that changes no look**: `039961ca`, `1322a934`, `726b9b85`, `54b0570d`, `15be0c86`, `27a39d04`,
  `d6cd5807`, `7027af26`, `87f75832`; review rounds `018b7067`, `8374fc47`, `cdba354f`, `2b135a55`, `14b9b805`,
  `a260974a`, `3e628673`, `824fb35b`, `b0db539c`, `e644c7f1`, `3af08e89`, `5957a4be`, `49077969`, `6a135e0d`.
  Headings found 331 → 333 of 333 on arXiv's PDF and 260 → 333 on ours; cells on both sides 155 → 158; a drawing's text
  10 → 13; displays outside a unit's marks reached (56/59 → 135/136 on the left); English words glued to a marker at a
  full stop 295 → 42; anchoring on 02459 +7–9 % (about 2 ms an open), accepted.
- **B1 — geometry, the block, the hit test, the paint**: `010b277f`, `f7f2df86`, `119ec57f`, `f2521e81`, `72362750`,
  `5a941afb`, `0b7e279e`, `133ae1d1`; review round `77bbb2f6`, `5ffa4728`, `a5235251`, `6b537119`, `4155212c`,
  `af20ff36`, `f155ddbb`, `477f308c`, `ed2eb24a`, `f5009001`, `c1a87bf5`. Points inside a painted shape lighting
  nothing or a neighbour 7–16 % → 0 (0 of 37.5 M); fragmented displays → one block per page-and-column run; every
  anchored unit lit (1 829 of 2 553 on both sides); per light p50 script 0.15–0.17 ms against 0.14–0.19, no layout on
  the pointer's path; words lighting nothing or a neighbour 22 → 6.
- **The batch before B2**: `6ae2008c` (a short line on the gutter is the page's), `8f4dcb05`, `555d7f7a` (lead walks'
  gaps measured: no 16 pt bound), `b0c7949e` (the Node gate fails on a unit painted where nothing lights it and on any
  move of what the geometry takes).
- **B2 — the pin**: dropped before any code (`174b5896`).
- **B3 — sentence level**: `3d0ed44f`, `5110d375`, `d4d83892`, `c1fef197`, `225856ac`, `851487eb`, `9d449c59`,
  `244f37e8`, `64f3f167`, `945058b4`, `0496a10d`, `b39e64f7`, `32bb84bf`, `89a731b0`, `ef5d2709`, `6e6bffd6`,
  `af6fce33`, `173e2013`; review round `9afe85d6`, `b38dc708`, `23f00046`, `3981c638`, `2bf624f6`, `755b5691`,
  `70ee4313`, `b76d9f18`. Running-text units lit by sentence on both sides 0 → 965 on the ten papers (707 of more than one
  sentence); starts on the ground truth's line 98.9–100 % (original), 100 % (translation), 98.9–100 % (arXiv's PDF);
  English sentence boundaries through a letter on the canvas 61 of 166 → 3 (proportional widths); the record +20.7 KB on
  02459 (2.7 %).
- **B4 — tables and figures whole** (on `exp/pdf-highlight-floats`, merged `61619404`): `87213ef4`, `14c5ec12`,
  `5c1db708`, `bf04b9e7`, `95f0e5dd`, `ad6036f7`; review round `98c6ce63`, `1da5ef2a`, `46952db0`, `aa3602a5`,
  `031dc701`, `17e5bd22`, `1a5de30b`, `991d0d64`, `b7ef80da`, `046c5643`, `42cc2af9`; `d2b2b3af`, `75784f58`,
  `ae8efd7d`, `27a3f8c6`. Figures 0 → 46 of 47, tables 0 → 52 of 52, algorithms 0 → 2 of 2; table I bounded by its own
  rule; the floats read from the operator list the page was drawn by (asking the worker again had made pages 7–8 of
  06701 take 326–387 ms to draw against the base's 198–224; now p50/p95 106.2/217.7 against 107.8/224.1).
- **After the merge**: `8b0d8742` (a resting pointer lights the sentence, never the paragraph first: 4 of 6 opens → 0
  of 8), `09878659` (a row reaches past its ink only where no float is painted: 0 points of sentences lit as a float).
- **B3b — Google and an LLM**: `6a2cab89`, `6c13014d`, `2d6ce8f5`. Google (zh) 1 239 of 1 239 markers back in order,
  507 of 507 units of more than one sentence aligned on the four papers.
- **The shared splitter**: `a1331b63` — 16 of 8 015 cuts removed, each false ("Oregon v.", "Mt.", "Tab." before its
  number …), none added.
- **B3c — sentences from the first preview**: `2ec2ddca`. The first sentence lit after the first preview, live with
  Microsoft: 12.6 s → 155 ms (02785), 20.1 s → 173 ms (06701); text-only starts 1 702, all on the marks' token.
- **B5 — the documents**: `944087c5` (the reader's design §17), `c277343a` (DESIGN §16), `683dc20f` (CHANGELOG),
  `57fe8ce4` (the gates as commands, the demo papers' maker), and this record.
- **The final review's fix round** (two lanes over `a7a2a056..346c26fc`; 2026-10-02): `0d62a8b6` (a pointer resting on
  the right pane follows it through a swap), `9041f4a4` (a lit sentence waits for its sentences, never drawn as its
  paragraph — through a swap and the left anchored again), `31a557fe` (a side's layout keeps none of its tokens:
  2608.02459's heap 31.8 → 10.5 MB), `f02a0860` (the splitter: a sentence ending on a formula, a month or a label word
  keeps its boundary — on the HTML page 148 cuts added in 116 of 1 566 blocks with cuts, each after a formula),
  `78cb2752` (a run again keeps its sentences), `42806b7d` (a click in a sentence's rows is its unit's), `61b33e04`
  (the wheel check needs something under the pointer), and the documents' numbers from one run of each gate.

### Declined or dropped, and why

- **The pin** (round 1's click that held its target): dropped by the maintainer on 2026-10-01 after B1's test build —
  hover alone lights; a click levels the panes.
- **Google by paragraph** (`69506d95`, reverted in `d6fc7b02`): with markers Google translates each sentence apart, and
  its wording changed in 77 of 83 units; of eight pairs read two were better, three worse. The maintainer judged it about
  even and kept Google by sentence (2026-10-01).
- **Sentence marks in TeX**: they moved 1.9–6.6 % of the Chinese translation's words (xeCJK's glue) — the starts are
  found by text inside the unit marks instead. **Finer than a sentence**: no signal from the free engine.
- **A rule for the lone equation number** (2608.09746 #27) and **a 16 pt bound on lead walks** (the n-f-g table): no
  general rule tells them apart (the maintainer's rule: general methods only); recorded as known limits.
- **Merging a small row into the row above** to hold a hanging glyph: measured, fixed neither case and put 31 more
  boundaries through a word; the unit is lit whole instead (13 units then; 12 on the gate of 2026-10-02).
- **Real glyph widths** from PDF.js's font data: not worth it now; the proportional estimate holds 3 of 166.
- **06701's per-light cost** (a sweep lights three times as many shapes): left, near its limit.

### Later (for #299 or a plan of its own)

- The LLM path measured with a key in a test build (`spikes/highlight-sentences-tags.mjs`, ENGINE=llm); 6.3 % of units
  over its batch cap go unmarked.
- A1's protector half of the full-stop space (`128a0d30` on `a1/protector-stop-space`, from `next`): a small pull
  request into `next` with the maintainer's yes.
- The live run's order (our original right after the first preview) and one progress line over the whole run: the Flow
  integration (F2); the highlight works either way.
- Today's end marks shift some Chinese last lines 2–14 pt (report-B): for the Flow rules' check.
- A quiet-machine run of the open's costs (the loaded runs' paired rounds differ by −395 to +336 ms).
- The known limits of the reader's design §17.7: grids with subcaptions over their panels, one-sided floats, the lone
  equation number, the table after a page-ending display, units matched under 80 % before the marks, older copies.
- The HTML page sends Google the same markers; its wording cost was raised with the maintainer, who kept it.
