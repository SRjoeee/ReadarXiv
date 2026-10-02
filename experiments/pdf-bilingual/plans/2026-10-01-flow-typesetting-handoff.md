# Flow typesetting: handing the chosen rule to the reader

The owner chose a typesetting rule on 2026-10-01 to replace the reader's default (one `\linespread`-like factor for
the whole paper). This branch, `exp/flow-typesetting`, holds the rule as pure engine modules, tested, and checked
against the experiment's numbers. Wiring it into the reader's compile sequence (`live.mjs runLive`, `session.mjs`)
and re-verifying it under BusyTeX is the engineering team's part. This note says what is here, what to wire, and how
to tell it works.

Background, reasons and numbers: `experiments/pdf-bilingual/records/typesetting.md` (the rule, the rules tried, what
we learnt, the metrics, open problems). Baseline numbers: `experiments/pdf-bilingual/records/round-34.json`.

## What the rule gives

On the evaluation round of 34 papers (Chinese 5, German 5, Japanese 8, Korean 8, Russian 8), against the original:

| | Pages equal (more / fewer) | Drift median / p90, columns | Within 0.1 column | Blocks within 15 % | Floats within 30 pt |
|---|---|---|---|---|---|
| Today, the reader's default | 11 (14 / 9) | 0.763 / 1.456 | 16 % | 47 % | 27 % |
| The rule, as the experiment recorded it | 31 (3 / 0) | 0.040 / 0.220 | 80 % | 85 % | 84 % |
| The rule, in the engine as handed over (2026-10-01) | 30 (3 / 1) | 0.040 (mean of medians) | 80 % | 85 % | 84 % |
| **The rule, corrected (`typeset-gate.mjs`, 2026-10-01, below)** | **32 (1 / 1)** | **0.041** | **81 %** | **84 %** | **84 %** |

Same page count in 32 of 34 papers, and a unit typically starts within a twenty-fifth of a column of where the
original starts it. On papers the rule was not tuned on (13 Chinese papers it never saw, 9 of the round's papers in a
language they were not evaluated in): 12 of 13 and 8 of 9 pages equal, start drift 0.100 and 0.043 (today's: 5 and 2,
0.703 and 0.679).

**Corrected before wiring (`exp/flow-integration`, after an independent evaluation):** each page's columns read from
TeX and both documents' places read on the original's; no plan from a missing or partial input (the translation set as
today); one type design per strategy (CJKutf8's a size and a leading); the rule's log lines read in the last TeX pass;
the final keeps the preview's type and moves the leading alone; a unit the flow cannot measure takes the leading set
where it stands. Reasons and numbers: `records/typesetting.md`, "The engine's corrections".

## What is on this branch

| Commit / path | What |
|---|---|
| `feat(pdf-reader): the engine fixes of the typesetting experiment` | TeX faults found on the way, independent of the rule: unit leading and size restore, tables fitted to their original's width and height, wide name lines, CJK and Cyrillic setting. `PIPELINE_VERSION` 2 → 4. These change today's output, and stand alone. |
| `src/pdf-reader/engine/typeset/` | The rule, pure: no compile, no file, no clock. |
| `typeset/plan.mjs` | `previewTypesetting`, `finalTypesetting`, and `FLOW`, the parameters as chosen. The two entry points. |
| `typeset/type.mjs` | The design table per writing system and the solver: one type for the paper. |
| `typeset/flow.mjs` | Each unit's leading along the paper; the correction from a measured compile; CJK's smaller face (option A). |
| `typeset/density.mjs`, `faces.mjs` | The translation's width as TeX sets it, from the font probe's width and size probes. |
| `typeset/places.mjs` | Unit marks from a PDF.js document (`marksOf`); drift and alignment against the original. |
| `typeset/tex.mjs` | The TeX: line probes and forced breaks (`LINES_TEX`), units set smaller (`SIZE_TEX`), floats held to their original's page (`FLOAT_TEX`), the log readers, and `typesetting()`, what a plan adds to a compile. |
| `live.mjs` | `probeFiles(paper, { width })`, `originalFiles(paper, { lines })`, `translationFiles(…, { typeset })`; `runLive` calls them where its caller reads a PDF's marks (`readMarks`; the reader since 2026-10-02, F2). |
| `tests/pdf-reader/typeset-*.test.ts` | The experiment's cases, in vitest. |
| `experiments/pdf-bilingual/spikes/typeset-tex-cases.mjs` | The rule's TeX under native TeX in Docker: one case per fault a paper of the round hit. The reference for BusyTeX. |
| `experiments/pdf-bilingual/spikes/typeset-gate.mjs`, `records/typeset-gate.json` | The rule's gate: the three goals, today against the rule, on the round and the holdouts, natively; fails where any paper falls behind its record. `typeset-translate.mjs` makes a paper's translation for it (Microsoft's free engine). |

## The compile sequence the rule needs

```
font probe   probeFiles(paper, { width: true })                     → fontLog (readFontProbe(fontLog) → fonts)
original     originalFiles(paper, { lines: true }), full compile   → original = { log, marks: await marksOf(pdfjsDoc) }
             (translation runs meanwhile)
measure      plan = previewTypesetting({ paper, translated, lang, strategy, fonts, fontLog, original })
             translationFiles(paper, translated, { strategy, fonts, draft, aux, bbl, typeset: plan.typeset })
                                                                    → preview = { log, marks }
final        fin = finalTypesetting(plan.state, preview, translated)
             translationFiles(…, { typeset: fin.typeset }), full compile → shown
```

1. **Font probe**: pass `{ width: true }`. It adds the width and size probes to the same compile; no extra compile.
2. **The original moves forward, a full compile.** Today `runLive` compiles the marked original after the previews,
   and skips it when a cached record has marks. The rule needs the original's log (lines, leading, forced breaks) and
   marks before the measuring compile. Compile it with `{ lines: true }` right after the font probe, alongside
   translation — in full, every pass: one pass sets references, citations and the pages they move unsettled, and its
   readings are another paper's (the review of 2026-10-01, M3); `previewTypesetting` cannot tell.
3. **The measuring compile must hold the whole translation.** `previewTypesetting` solves the type and the flow for the
   units it is given, and `finalTypesetting` corrects where this compile put them; it refuses (no typeset, `missing`:
   "a plan of the whole translation") a plan made on another translation than the one it is given to set. **The same
   translation** is the same units, each with the same pieces in the same order, field for field — a note's piece by
   its own unit, not by that unit's text — whether in the same arrays or made again: `runLive` replaces the array of
   every unit a batch answers whole, changed or not, and a seeded run sends every unit again, so arrays made anew with
   equal pieces are the same translation. A unit more or less, a text changed (in a new array or in place: the plan
   keeps its own copy of every piece), a placeholder moved, is another, and the final is set as today. Today's
   progressive previews can stay as they are, or use `previewTypesetting(…).typeset` on the snapshot (pure,
   milliseconds) so they look closer to the final — but plan again once every unit is in, and measure that. The last
   preview, once every unit is translated, can be the measuring compile, and is worth showing.
4. **The final** takes `finalTypesetting(plan.state, preview, translated)`, `translated` the whole translation it sets.
   `plan.state` holds the original's readings, the measured units and its own copy of the translation it was made on;
   keep it from the measuring compile to the final. It keeps the preview's type and moves the leading alone; where the
   preview's measurement is missing or partial it returns the preview's own plan (`missing` says why).
5. **No plan**: `previewTypesetting` returns `typeset: null` and what was `missing` where an input it needs is missing
   or partial (no design for the script, the original's log not whole or its marks or a page's columns unread, no width
   probe, an alphabet without its size probe, no translated unit the original measured): compile the translation as
   today, without `typeset`. Note it; it is not an error.
6. **Strategy fallback**: a plan is made for one strategy (`previewTypesetting`'s `strategy`) — under CJKutf8 CJK is
   solved with a size and a leading, under xeCJK with leading, glue and face — and given another, `translationFiles`
   sets the translation as today and calls `note('typeset refused', …)`. When the chain moves on, make the plan again
   for the new strategy (pure, milliseconds); its final cannot use a preview measured under the old one: take the new
   plan's `typeset` uncorrected, or measure again.
7. **`PIPELINE_VERSION` 4 → 5** when the rule is wired: it changes every compile's output. `MARK_DEF` now also names
   each page's columns (`axt-c<n>-<k>`), which the rule reads from the original's marks; a record of version 4 lacks
   them, and the rule would make no plan from it.

The experiment compiled the measuring and final compiles in full (`latexmk`, every pass, images in), as
`typeset-gate.mjs` does. **The measuring compile can be a draft**: one pass, images as frames, with the references
(`aux`, `bbl`) of an earlier compile of the translation — the gate gave it today's final's (the reader's would be its
last preview's, not measured). On the fresh holdout (`DRAFT=1`, 40 paper-languages) the final measured from such
a compile was the final measured from a full one on all 40: the same leading on every unit, the same PDF. (The run
found that `translationFiles` put those references beside a main file in a folder, where TeX does not read them; fixed.)
Showing the nearer of the measuring compile and the final (fewer pages off, then the smaller start drift) added about
a point on F1's gate (round 33 pages equal, start 0.039; unseen 0.085), at the cost of a full measuring compile, or of
a further full compile whenever a draft one is the nearer; not done.

## Cost

Natively (Docker, two CPUs), the four compiles of a paper — font probe, original, measuring compile, final — took
46 s at the median and 191 s at most (Chinese 2608.06007) on the round. The rule's own computation took 12–31 ms
for the preview's plan and 1–4 ms for the final's (German 2608.02785, 96 units).

One compile more than today: font probe, original, measuring compile, final, plus whatever progressive previews the
reader shows — and the measuring compile can be the last preview, a draft (above). The original was already compiled
once per paper. The rule's own computation is pure JavaScript, a few milliseconds (above). A third compile when the
final still has more pages than the original would recover Korean 2608.18090; the owner declined it for now
(performance).

What to cache with a paper's record, so that a revisit or a new language compiles nothing extra:
- the original's line readings (`readLines`), forced breaks (`readForced`), whether its log is whole (`completeLog`)
  and marks with each page's columns (`marksOf`). They depend on the source and the pipeline version, not the language,
  so one per paper.
- the font probe's log (or `fonts`, `readWidthProbe` and `readSizeProbe` of it), likewise per paper.

## BusyTeX

The rule was measured under native TeX Live. In the reader, before relying on it:
1. Run `typeset-tex-cases.mjs`'s documents through BusyTeX (they use `pdflatex` and `xelatex`, `lipsum`, `booktabs`,
   `adjustbox`, `caption`, `hyperref`, `xeCJK` with FandolSong) and compare the logged values. Every case states the
   value native TeX gives. `typeset-busytex-cases.mjs` does so already for the page columns at the end of a revtex
   paper, under BusyTeX's pdfTeX and XeTeX in Chromium (with the package server): they agree with native TeX.
2. Check that the log lines the rule reads reach the reader: `AXT-LINES`, `AXT-FORCED` (written with `\message`, not
   `\typeout`: `\typeout` reads `\prevgraf` as 0), `AXT-END`, `AXT-WIDTH`, `AXT-SIZE` — the readers take the last TeX
   pass of the browser compiler's joined log (`lastTexLog`; read whole, the terminal's echo invented forced breaks) —
   and that the page destinations `axt-c<n>-<k>` reach the PDF under xdvipdfmx (`MARK_DEF` keeps unreferenced ones).
3. `\AddToHookNext` (LaTeX 2020-10 and later) is required by the unit leading and size macros; they do nothing without it.
4. Russian under pdfLaTeX needs the LH fonts' metrics, which TeX Live does not ship and BusyTeX cannot make
   (`spikes/make-metafont.mjs`, `data/metafont/`).

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- `pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-tex-cases.mjs`: all passed (native);
  `typeset-busytex-cases.mjs`: all passed (BusyTeX).
- `ASIDE=1 DRAFT=1 AXT_DATA=<data folder> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-gate.mjs`: every
  paper and every set holds its record (`records/typeset-gate.json`), the final measured from a draft included; the
  header says when the record may be rewritten. The data folder is the experiment's, kept outside git: each paper's
  source (`corpus/<id>/source.gz`), its translation (`runs/visual-eval/<lang>/<id>/translation.json`) and `metafont/`.
  The gate's header says how to run part of it, a parameter (`VARY`) or a change (`TAG`) against the record. (The
  handed-over equivalence check against `round-34.json`, `typeset-check.mjs`, is superseded by it: 32 of 34 papers
  matched the experiment's record then; German and Korean 2608.15761 were the experiment's own code's result too.)
- Once wired, the same papers in the reader: the gate's numbers within noise, and no compile slower than today's by
  more than the one measuring compile.

## Limits known

- Three papers end a page further from their original's count than today — Chinese 2608.09038 (+1, today 0), Korean
  2608.15016 (+1, today 0; and a page long in Japanese, German and Russian), Japanese 2608.09746 (+1, today 0) — each
  the untranslated bibliography spilling from a page the original left nearly full (about 6 pt of room in 15016, 45
  pt in 09038 and 09746). In 09038 and 09746 the main text ends about 190 pt late; the CJK face step set 25 and 19
  units at 0.95 and still left it late, reaching only the units the flow measures (39 and 50 % of the translated
  units). In Korean and Japanese 15016 the main text ends 27–30 pt late, under the face step's three lines; in German
  and Russian a table goes a page late in the measuring compile and the final alike. (Korean 2608.18090 and Russian
  2608.06233 are level since the final keeps the preview's type.)
- **Not done; a research item after F2: a segment's end held to the room its original left.** At a forced break or
  the document's end, take the room the original left on that page as the tolerance, and aim the segment's text and
  floats to arrive within it from the measuring compile, with every translated unit of the late stretch, display
  units included (lateness before the boundary costs a page; earliness, blank space at a page's foot). Its two cheaper
  pieces, measured by the re-review of 2026-10-02 on the gate: **the face where it stands** — a unit the flow does not
  measure takes the face the flow set where it stands, as it takes the leading (three lines in `typesettingOf`) —
  changes only the 24 CJK finals that set a face: 2608.09038 +1 → 0 pages, start drift 0.199 → 0.027; Japanese
  2608.09746 +1 → 0, 0.244 → 0.164; the other 22 level in pages; mean start drift over the 24 0.086 → 0.076; but it
  fails the gate on 2608.20847, display-heavy (Chinese end drift 0.294 → 0.344, Korean 0.027 → 0.058, Japanese and
  Korean floats within 30 pt 5 → 3). And **a face-step threshold set by that room** rather than three lines (Korean
  and Japanese 2608.15016). A float sent a page late (German and Russian 2608.15016) needs a trigger of its own: the
  hold only keeps floats from going early.
- One page short: German 2608.15761; and, as today, Chinese 2608.12606 and 2608.24839.
- Under CJKutf8 the density model is xeCJK's (its glue beside Latin, its punctuation); the final, keeping the preview's
  type, no longer re-solves it from the measured density, and Japanese 2608.06701 there ends at start drift 0.223
  (today 0.436; solved again, 0.040). A width model for CJKutf8 would close it.
- A page whose layout changes mid-page (revtex's and aastex's grids) is read in the most columns any of its marks, its
  shipout or the document's end saw: a one-column stretch on a two-column page reads as two. A last page whose grid
  closed before the document's end with no unit mark on it still reads one: aastex631's two-column references end
  their grid themselves, and 2608.12606's page 20 reads one column (no unit is set there; it would matter only to a
  translation that ran a page past it).
- A short abstract can be set too tall (Japanese and Korean 2608.15761): the front matter takes its neighbours' leading.
- The macros go on translated units only. A unit left in English keeps the paper's own setting; the flow counts it
  at its original's height.
- The density predictor's worst CJK error is 5.2–5.8 % on a paper; the measuring compile corrects it.
- The rule was tuned on 34 papers in five languages. Other writing systems need their row of the design table
  (`type.mjs DESIGN`) and their gate.
