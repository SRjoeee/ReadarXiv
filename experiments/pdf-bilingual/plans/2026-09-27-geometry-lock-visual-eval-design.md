# Geometry lock: a visual evaluation — design

2026-09-27. Branch `exp/geometry-lock` (from `exp/pdf-bilingual` at cc781213), worktree `.worktrees/geometry-lock`.

## Purpose

### Active review, 2026-09-30

The owner made FIT the primary experimental layout and retired Today, Today before 09-28 and the original Locked
from the review page. The active columns are Original, FIT, Locked (H rules), and H where its output is available.
The catalog, page counts, sorting and keyboard controls use those columns alone. Existing PDFs and flags keep their
source keys; old outputs remain available as research evidence. This changes the experimental review surface, not
the extension reader's production default (DESIGN §16).

FIT currently shares one measured fitting algorithm per writing-system family, not one tuned policy per language:
CJK uses whole-paper leading, tracking and face scale; alphabetic scripts use size and bounded local leading.
Fonts and language data are already script/language-specific. Refine common content/float/overflow mechanisms first,
then review Chinese, Korean, Japanese and Russian in that order, with German as the control. Review five papers per
language before widening the corpus. Evaluate readability, content preservation and local alignment together with
page counts; page counts alone cannot accept a layout.

### Performance constraint, 2026-09-30

The owner requires real-time block replacement and rejects a quality improvement obtained by sacrificing performance.
The current FIT generator is an offline visual experiment: 2–3 complete translation compilation jobs, in addition
to the font probe and original probe. Each job uses latexmk and may run TeX more than once. The H-rule experiment
also retries complete compilations. Neither algorithm has passed a runtime performance acceptance gate.

The current reader receives translations by unit but `runLive` recompiles the document for a preview; `replaceRight`
then loads its PDF. This is progressive whole-document recompilation, not local PDF block replacement. Calling it
block translation does not establish an incremental typesetting implementation. This distinction must remain visible
in engineering decisions under DESIGN §16.

Runtime acceptance constraints:

- A block update must not trigger whole-document fitting trials or wait for a whole-paper translation to fit.
- Offline experiments may learn language/font profiles; runtime work must be local and bounded, using the actual
  block, font metrics and available rectangle rather than assuming one language ratio fits every paper.
- Unchanged blocks and original graphics must not be reprocessed solely because another block's translation arrived.
- Compare first translated block latency, translation-return-to-display p50/p95, CPU, peak memory and redraw work on
  identical cached text and hardware, with cold and warm resources separately. Language/profile refinements need
  both visual acceptance and no measurable performance regression beyond benchmark noise.

A local PDF replacement architecture is a candidate to prototype and benchmark, not implemented by this document.
Faster code, caching or language defaults do not by themselves establish that whole-document recompilation meets
the owner's requirement. The visual outputs remain references, not a license to ship their trial loop.

The sections below describe the original 2026-09-27 experiment and its historical columns.

The owner decided on 2026-09-26 that the geometry lock is worth trying on a branch and is adopted only if every
language is fine. The numbers so far (pseudo text, 24-paper gate: pages equal 10→22, unit starts on their original page
69→87 %) say where things land, not whether the pages look better. This evaluation puts the reader's output today and
the locked output side by side with the original, page by page, so the owner can judge by eye, per language, whether
the lock is an improvement and what it breaks.

Decided with the owner:

- Layout rules only. The protocol fixes (escaped tags, invisible edge commands, lost numbers) are a separate round;
  fonts, first-line indent and compression for growing languages get sample sheets later.
- Versions labelled; the owner judges, no blind voting.
- Chinese on 25 papers; Japanese, Korean, German and Russian on the same 8 papers each.
- Microsoft's free engine for every language, so the only difference between languages is the language.
- For Chinese, a fourth column with service H's output, since the question that started this was why its pages look
  closer to the original.
- Page images in a local page (approach A below); nothing is published: the papers and their translations mostly may
  not be redistributed.

## What is compared

| Column | What it is | How it is made |
|---|---|---|
| Original | arXiv's PDF | as the reader shows it on the left |
| Today | the reader's typesetting today | `scripts.mjs` strategies as they are (global CJK `\linespread`), no lock, one full compile |
| Locked | the rules under test | unit-local leading, sync points, tightened leading for units that grew; two compiles |
| H (Chinese only) | service H's output | produced outside this repository with its own defaults, fed by the same engine; dropped into the data directory |

Rules under test in **Locked**, as in `spikes/geometry-lock2.mjs`:

1. **Unit-local leading.** The extra CJK leading applies inside translated units only (a `para/after` hook restores
   the paper's `\baselineskip`); tables, references and algorithms keep the paper's spacing.
2. **Sync points.** The original's compile logs, at each unit start in outer vertical mode and before every sectioning
   command, theorem-like environment, `\item` and float (`\@float`, `\@dblfloat`), the page (shipouts), the column
   (`\if@firstcolumn`) and `\pagetotal`. The translation ends the column while it is behind that point, then
   `\vspace*`s up to the same `\pagetotal`. Skipped while `\if@noskipsec`, `\if@inlabel` or `\if@nobreak` holds.
3. **Leading floor.** The first compile measures every unit; a unit taller than its original is set again in the second
   compile with its baselines drawn closer, down to the floor.

Parameters, one row per writing system:

| Language | Unit leading (× font size) | Floor |
|---|---|---|
| zh | 1.3 | 1.1 |
| ja, ko | 1.2 | 1.05 |
| de, ru | 1.05 | 1.0 |

Not in Locked this round: height pads after units (they oscillate with sync points) and the float-height lock (no
measured gain, and it can scale figures down).

## Corpus

- **zh**: RT-1 (2212.06817) and the 24 papers of `lang-gate.mjs`'s SAMPLE — 25 papers, 11 document classes.
- **ja, ko, de, ru**: 2608.05876 (article, two columns), 2608.18090 (article, one column), 2608.06701 (IEEEtran),
  2608.24839 (acmart), 2608.02785 (amsart), 2608.21180 (llncs), 2608.15761 (elsarticle), 2608.06233 (revtex4-2).

57 translations in all.

## Generation

For each paper and language:

1. **Translate once.** The paper's units through the reader's own wire (`mt.mjs` `translateUnits`, markers format,
   tolerant reading, runs for what fails) to Microsoft's free endpoint; the result is stored and both Today and Locked
   read it, so the two columns differ only in typesetting.
2. **Compile.** Native TeX Live 2026 in Docker, in the gate's faithful mode (`spikes/faithful.mjs`): the original with
   unit marks and sync probes (the lock's target), Today once, Locked twice.
3. **Render.** Every page of every column to JPEG at 144 dpi (`pdftoppm`), and a small thumbnail per page.
4. **Check** (below) and write the paper's index: columns, page counts, the numbers, the suspicious pages.

Layout: `experiments/pdf-bilingual/data/runs/visual-eval/<lang>/<paper>/` — `original.pdf`, `today.pdf`, `locked.pdf`,
`h.pdf`, `pages/<column>-<n>.jpg`, `thumbs/<column>-<n>.jpg`, `index.json`; the directory is outside git. Expected
size 1–2 GB. Run time about two hours in the background; no paid API.

The generator is `spikes/visual-eval.mjs`, built from `geometry-lock2.mjs` (the lock stays in the spike this round; it
moves into `live.mjs` only if adopted). Service H's column is made by tools kept outside the repository and copied in
as `h.pdf`.

## Checks before the owner looks

1. **Compiles.** Each column compiled; a failed one shows "compile failed" and the first TeX error.
2. **Missing characters.** Locked may not lose a character Today set (`lostIn` of `live.mjs`).
3. **Our original against arXiv's.** The lock aims at our own compile of the original; where its page count differs
   from arXiv's PDF, the paper is flagged, since Locked may then look off against the Original column for a reason
   that is not the lock.
4. **Suspicious pages in Locked**, each listed with a link to the page:
   - a forced break: a sync point ended the column or page (logged by the sync macros) and the page's text stops well
     above where the original's does;
   - a large gap: a sync point inserted more than two lines of space (the amount is logged);
   - a tightened unit: leading at or near the floor;
   - drift: a unit still off its original page;
   - overflow: an overfull `\vbox` in the log.
5. **Per-language table**: per paper and in total, pages equal, unit starts and captions on their original page,
   Today → Locked.

## The page

A static page served from localhost (`node spikes/serve-eval.mjs`, which only serves files), opened in Chrome. One
HTML file with its script inline, no framework; nothing in the extension changes. Labels are English (the repository's
language rule): Original, Today, Locked, H.

- **Top**: language switch. **Left**: the papers, each with its page counts per column, unit starts on their page and
  captions on their page (Today → Locked); sortable by paper or by how much Locked gained.
- **Whole-paper view** (the default): one row of thumbnails per column, aligned by page number, so a column with an
  extra page runs longer; hovering a page lights the same page number in the other rows; the paper's suspicious pages
  are listed under the rows.
- **Page view** (click a page): the columns side by side at the same page number, fitted to the window height;
  ←/→ turn pages, 1–4 hide or show a column, Z toggles 2× zoom, each column links to its PDF at that page for vector
  detail.
- **Flags** (optional): "Flag this page" with a short note, kept in the browser; "Export flags" saves a JSON file I read
  to find each flagged page and the note. The page works the same without them.

## Review and decision

Suggested order: the whole-paper view of each Chinese paper (about ten minutes for 25), then the suspicious pages; then
the four other languages the same way.

Proposed rule, per language: the lock can be adopted for a language when (1) on most papers the owner judges Locked no
worse than Today, and (2) no paper shows a defect the owner will not accept — half an empty page, a paragraph too
tight to read, a figure pushed far from its place. By the earlier numbers German and Russian may fail (2) (about 70 %
of unit starts on their page). Then three ways are open, to be chosen after seeing the pages: wait until they are fixed
and adopt together; adopt per writing system, the others keeping today's typesetting; or add font scaling for growing
languages.

Loop: the owner flags, I find the cause and fix it, only the affected papers are generated again, the owner looks at
those pages again.

## Limits

- Native TeX Live, not the browser's BusyTeX, whose line breaks can differ; a few papers are to be checked in the
  browser once the lock looks right.
- Microsoft's translations only; an LLM's may be longer or shorter.
- Known unsolved: papers dense in floats with float pages (RT-1: a forced break lets LaTeX emit a float page and
  overshoot); the page shows it as it is.
