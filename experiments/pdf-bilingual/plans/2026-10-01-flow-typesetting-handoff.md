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
| **The rule, in the engine (`typeset-check.mjs`, 2026-10-01)** | **30 (3 / 1)** | **0.040** (mean of medians) | **80 %** | — | — |

Same page count in 30 of 34 papers, and a unit typically starts within a twenty-fifth of a column of where the
original starts it. The engine's run differs from the record on one paper, 2608.15761 (below, Acceptance).

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
| `live.mjs` | `probeFiles(paper, { width })`, `originalFiles(paper, { lines })`, `translationFiles(…, { typeset })`. Defaults unchanged: nothing calls the rule yet. |
| `tests/pdf-reader/typeset-*.test.ts` | The experiment's cases, in vitest. |
| `experiments/pdf-bilingual/spikes/typeset-tex-cases.mjs` | The rule's TeX under native TeX in Docker: one case per fault a paper of the round hit. The reference for BusyTeX. |
| `experiments/pdf-bilingual/spikes/typeset-check.mjs` | The equivalence check: the engine's modules on the round, compiled natively, against `round-34.json`. |

## The compile sequence the rule needs

```
font probe   probeFiles(paper, { width: true })                     → fontLog (readFontProbe(fontLog) → fonts)
original     originalFiles(paper, { lines: true }), full compile   → original = { log, marks: await marksOf(pdfjsDoc) }
             (translation runs meanwhile)
measure      plan = previewTypesetting({ paper, translated, lang, fonts, fontLog, original })
             translationFiles(paper, translated, { strategy, fonts, draft, aux, bbl, typeset: plan.typeset })
                                                                    → preview = { log, marks }
final        fin = finalTypesetting(plan.state, preview)
             translationFiles(…, { typeset: fin.typeset }), full compile → shown
```

1. **Font probe**: pass `{ width: true }`. It adds the width and size probes to the same compile; no extra compile.
2. **The original moves forward.** Today `runLive` compiles the marked original after the previews, and skips it when
   a cached record has marks. The rule needs the original's log (lines, leading, forced breaks) and marks before the
   measuring compile. Compile it with `{ lines: true }` (the experiment's marks came from this compile) right after the
   font probe, alongside translation.
3. **The measuring compile** must hold the whole translation: `previewTypesetting` and `finalTypesetting` correct
   where this compile put the text, so units it lacks are left uncorrected. Today's progressive previews can stay as
   they are, or use `previewTypesetting(…).typeset` on the snapshot (pure, milliseconds) so they look closer to the
   final. The last preview, once every unit is translated, can be the measuring compile, and is worth showing: it is
   already much nearer the original than today's final.
4. **The final** takes `finalTypesetting(plan.state, preview)`. `plan.state` holds the original's readings and the
   measured units; keep it from the measuring compile to the final.
5. **Strategy fallback**: `typeset.strategy(s)` wraps whichever strategy is current, so a move to the next strategy
   needs nothing new. Under the pdfLaTeX fallback (CJKutf8), CJK takes the leading only; the face scale and glue are
   xeCJK's.
6. **`PIPELINE_VERSION` 4 → 5** when the rule is wired: it changes every compile's output.

The experiment compiled the measuring and final compiles in full (`latexmk`, every pass, images in), as
`typeset-check.mjs` does. Draft mode (images as frames) should change no place on the page, and one pass changes only
reference widths; both are worth checking with `typeset-check.mjs` before relying on them.

## Cost

Natively (Docker, two CPUs), the four compiles of a paper — font probe, original, measuring compile, final — took
46 s at the median and 191 s at most (Chinese 2608.06007) on the round. The rule's own computation took 12–31 ms
for the preview's plan and 1–4 ms for the final's (German 2608.02785, 96 units).

One compile more than today: font probe, original, measuring compile, final, plus whatever progressive previews the
reader shows. The original was already compiled once per paper. The rule's own computation is pure JavaScript, a few
milliseconds (above). A third compile when the final still has more pages than the original would recover Korean 2608.18090;
the owner declined it for now (performance).

What to cache with a paper's record, so that a revisit or a new language compiles nothing extra:
- the original's line readings (`readLines`), forced breaks (`readForced`) and marks (`marksOf`). They depend on the
  source and the pipeline version, not the language, so one per paper.
- the font probe's log (or `fonts`, `readWidthProbe` and `readSizeProbe` of it), likewise per paper.

## BusyTeX

The rule was measured under native TeX Live. In the reader, before relying on it:
1. Run `typeset-tex-cases.mjs`'s documents through BusyTeX (they use `pdflatex` and `xelatex`, `lipsum`, `booktabs`,
   `adjustbox`, `caption`, `hyperref`, `xeCJK` with FandolSong) and compare the logged values. Every case states the
   value native TeX gives.
2. Check that the log lines the rule reads reach the reader: `AXT-LINES`, `AXT-FORCED` (written with `\message`, not
   `\typeout`: `\typeout` reads `\prevgraf` as 0), `AXT-WIDTH`, `AXT-SIZE`.
3. `\AddToHookNext` (LaTeX 2020-10 and later) is required by the unit leading and size macros; they do nothing without it.
4. Russian under pdfLaTeX needs the LH fonts' metrics, which TeX Live does not ship and BusyTeX cannot make
   (`spikes/make-metafont.mjs`, `data/metafont/`).

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- `pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-tex-cases.mjs`: all passed (native).
- `AXT_DATA=<data folder> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-check.mjs <lang> <paper>…`, then
  `--summary`: every paper as the experiment (pages equal to the experiment's, drift median within 0.02 column). The
  data folder is the experiment's, kept outside git: each paper's source (`corpus/<id>/source.gz`), its translation
  (`runs/visual-eval/<lang>/<id>/translation.json`), `runs/visual-eval/round.json` and `metafont/`.
  On 2026-10-01 32 of 34 papers were as the experiment. The two that were not, German and Korean 2608.15761 (German
  one page fewer, drift 0.061 against 0.085; Korean drift 0.108 against 0.086), are the experiment's own code's
  result today too: on the same inputs the original, the preview's plan, the preview's TeX (but for the fallback
  leading's printed precision, which no unit with its own factor uses), and the final's plan are identical unit by
  unit, and the experiment's TeX compiled today sets exactly what the engine's does. `round-34.json`'s two numbers
  are not reproduced by the code they were recorded with; the engine's run, in `data/runs/typeset-check/`, is the
  baseline from now on.
- Once wired, the same papers in the reader: the round's numbers within noise of the table above, and no compile
  slower than today's by more than the one measuring compile.

## Limits known

- Three papers keep a page more: Chinese 2608.09038 (+2) and Russian 2608.06233 (+1), each a few lines before
  something that cannot break (a `\clearpage`, an `[H]` figure); Korean 2608.18090 (+1), a paragraph that moved whole
  in the final alone.
- German 2608.15761 comes out one page short.
- A short abstract can be set too tall (Japanese and Korean 2608.15761): the front matter takes its neighbours' leading.
- The macros go on translated units only. A unit left in English keeps the paper's own setting; the flow counts it
  at its original's height.
- The density predictor's worst CJK error is 5.2–5.8 % on a paper; the measuring compile corrects it.
- The rule was tuned on 34 papers in five languages. Other writing systems need their row of the design table
  (`type.mjs DESIGN`) and their gate.
