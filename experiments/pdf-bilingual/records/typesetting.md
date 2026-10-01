# Typesetting the translation: the rules tried, the rule chosen, what we learnt

The record of how the bilingual PDF sets its translated text, from the first per-script leading (2026-09-22) to the
rule chosen on 2026-10-01, for whoever revises the rules next. It keeps the rules, the numbers they reached, the
owner's judgements and the reasons behind each decision; the day-by-day work is in `../plans/` (2026-09-27 to
2026-09-30), the last round's numbers paper by paper in `round-34.json`, the tools in `../spikes/`.

## What the owner asked for

- **Generic methods only** (2026-09-22): a rule must hold for any paper; one that helps some papers and is not
  general is not taken, unless nothing general does better.
- **Two modes** (2026-09-28): naturalness first (Today) and the original first, for comparison, a choice the user will
  be given later. Today stays.
- **Align with the original** (2026-09-30, the target since): each block near its original's size, through one
  generic design of weight, spacing, leading and face — places may differ a little; over the paper the same pages
  and layout. FIT is no longer the target. The simplest method that is best. Performance comes first: no trial
  loops, no fitting the whole paper again for a block.
- **Evenness** (2026-10-01): where two versions are level on pages and floats, the one whose paragraphs are set
  evenly wins over one nearer the original's places. A paragraph visibly looser than its neighbours reads worse.
- **Option A** (2026-10-01): where the leading's floor stops a stretch that runs long, a slightly smaller face;
  then in steps, only where a stretch is clearly long. No third compile, for now.

## The rule chosen (2026-10-01): Flow, even, with option A in steps for CJK

On the evaluation page: "Flow, even" (key `flow46fp8r5b`) for German and Russian, "Flow, even (A)"
(`flow46fp8r5bs95`) for Chinese, Japanese and Korean — the same rule; option A acts on CJK only.

1. **Measure the original** once per paper (cacheable): compiled with probes, it gives each unit's lines and
   leading at its paragraph's end (`LINES_TEX`, `readLines`), its start and end as PDF destinations (`marksOf`), and
   each forced break (`AXT-FORCED`, `readForced`).
2. **Measure the translation's density** without compiling it: each unit's width in em from the width probe
   (`density.mjs measureUnits`), the original's own lines as the ruler.
3. **One type for the paper** (`generic-type.mjs solveType`): the knobs of its script's design table, solved so
   that the predicted height equals the original's; running long costs twice running short (`LONG`).
4. **Preview compile**: each unit's leading from the flow (`flowType`): the leading that makes the translation as
   tall as the original over a window of 46 of the original's lines around the unit, within the design range; what
   the range stops is taken back over the next 50 lines. Floats wait for their original's page and column
   (`FLOAT_TEX`, never more than two pages, not at a forced break).
5. **Measure the preview**: its lines, marks and forced breaks.
6. **Final**: the type solved again from the preview's measured height (`correctUnits`); the flow again from the
   preview's lines, now correcting where the preview's text stood:
   - a reading is the median of the next five; it is taken only where it parts from the heights' account by more
     than eight lines; the first reading, before which stands only the front matter, stands for the rest;
   - after a forced break the correction starts again from where the preview put the text there;
   - what is taken back moves a unit's leading at most 5 % from the window's (`rate`);
   - CJK: where a segment (up to a forced break, or the paper's end) runs late by itself by more than three lines,
     its leading at the floor, its late stretch is set at one face — 97.5 % over as few of its last units as take
     the lateness back, else 95 % — and the flow runs again (`shrink`).
7. **Final compile.**

| Knob | Chinese | Japanese, Korean | German, Russian |
|---|---|---|---|
| Leading, × the paper's | base 1.3, 1.2–1.45 | base 1, 1–1.45 | 0.95–1.1 |
| Tracking between CJK characters | 0–0.05 em | 0–0.05 em | — |
| Face | CJK face 0.92–1; a late stretch 97.5 % or 95 % of it | same | size 0.9–1, among the face's real sizes |
| Flow | window 46 lines, take-back 50 lines, rate 5 % | same | same |
| Correction | median of 5, past 8 lines, first reading, restart after forced breaks | same | same |
| Tables | no taller than the original, never below 0.85 of its width | same | same |

The round of 34 (`round-34.json`; the rule chosen is Flow, even (A) for CJK and Flow, even for German and Russian;
units standing out are counted over 2,531 units):

| | Pages equal (more / fewer) | Drift median / p90, columns | Within 0.1 column | Blocks within 15 % | Floats within 30 pt | Units standing out |
|---|---|---|---|---|---|---|
| Today, the reader's default | 11 (14 / 9) | 0.763 / 1.456 | 16 % | 47 % | 27 % | — |
| FIT | 29 (2 / 3) | 0.056 / 0.240 | 69 % | 86 % | 75 % | — |
| Locked (H rules) | 32 (2 / 0) | 0.019 / 0.140 | 92 % | 73 % | 92 % | — |
| Generic | 25 (4 / 5) | 0.078 / 0.389 | 62 % | 84 % | 71 % | — |
| Flow, first | 26 (5 / 3) | 0.059 / 0.333 | 71 % | 84 % | 78 % | 3 |
| Flow | 30 (4 / 0) | 0.043 / 0.259 | 78 % | 84 % | 83 % | 53 |
| **The rule chosen** | **31 (3 / 0)** | **0.040 / 0.220** | **80 %** | **85 %** | **84 %** | **10** |

Option A set a face in five papers, each over a run of whole pages: Japanese 2608.18090 (33 units at 95 % or
97.5 %, its page back), 2608.24839 (40 at 97.5 %), 2608.05876 (24, its appendix), 2608.15761 (16), Chinese
2608.09038 (17 at 95 %); against Flow, even, three papers better and none worse. The pages still off: Chinese
2608.09038 (+2), Korean 2608.18090 (+1) and Russian 2608.06233 (+1), each at something that cannot break (below).

## The rules tried

| Rule | Dates | What it set | Its best on the round | Why it is not the rule |
|---|---|---|---|---|
| Today before | 09-22 | one `\linespread` per script for the whole document | — | spread references, tables and code too; no hyphenation in English |
| Today | 09-28 | unit-local leading per script (Chinese 1.3 × the paper's), hyphenated English | the reader's default: pages equal 11 of 34, drift 0.76 column | places run free: a fifth of the units within 0.1 column |
| Locked | 09-27 | sync points: the translation ends a column while it is behind the original's and pads to its height; leading tightened to a floor | zh 25 papers: 459 pages for 458, 95 % of starts on their page | a sync point can add space, never take it; growing languages kept running over |
| Locked, smaller type | 09-28 | Locked, and units still taller set down to 0.9 of the size | de and ru pages equal 8 of 8 | lost zh 2608.09038 and ko 2608.15761: a few smaller units moved displays between columns |
| FIT | 09-28 – 09-30 | one leading for the paper, each unit within 8 % of it; alphabets set smaller first (0.93 at most); CJK one type of leading, tracking and face | pages 29, drift 0.056, within 0.1 column 69 % | three trial compiles; places not aligned; the owner: "set it by common rules, as natural as the English" |
| Locked (H rules) | 09-28 | service H's rules: each block in its original's box, a block too long set smaller down to 0.6 | pages 32, drift 0.019, within 92 % | blocks 73 % within 15 % — type down to 0.6 to hold places; up to four compiles |
| Fixed-profile FIT | 09-30 | FIT's typography predicted per script, one compile | page counts kept | places lost (Korean 92 → 63 % on their page): a script's label does not tell a paper's density (Japanese 0.87–1.14) |
| Local blocks | 09-30 | each block re-set in its own PDF region by the browser, no TeX | fit in 0.1–2 ms | five of nine sampled regions fit at a 0.90 floor; coverage and overflow failed |
| Generic | 09-30 | one type for the paper from the density prediction, two compiles | pages 25, drift 0.078 | one type keeps the paper's height, not its places |
| Flow, first | 09-30 | Generic, and each unit's leading from the window, take-back | pages 26, drift 0.059, units standing out 3 | pages and places behind the corrected Flow |
| Flow | 10-01 | Flow, first, floats held, the preview's places corrected (median, 8 lines, first reading) | pages 30, drift 0.043, standing out 53 | paragraphs set a quarter looser than their neighbours where it took a jump back |
| Option A per unit | 10-01 | a CJK unit at the floor set smaller as far as it wanted, down to 0.95 | CJK pages 19 of 21 | a third of CJK units touched, most by under 3 %; five papers worse |

Chosen: Flow, even (10-01: rate 5 %, restart after forced breaks), with option A in steps (10-01) for CJK.

## What we learnt

### Beliefs the numbers overturned

- **Nearer places make a better page.** The owner judged evenness first wherever pages and floats were level: Flow
  held the places better than Flow, first, yet lost nine papers to it, each with a few paragraphs set up to a
  quarter looser to take a jump back (Korean 2608.05876 at 1.36 beside 1.11; 06701 at 1.54 beside 1.20). Places
  may differ a little; a block's leading may not stand out.
- **What the preview measured is what the final will get.** A float that moved, a paragraph that went whole to the
  next page, are where the preview stood once; the final sets them again its own way. Correcting every reading
  imported the noise (2212.06817 ran 0.12 page ahead); faces chasing a preview late where a float had moved left
  Korean 2608.24839 a page short. Only what persists — the units' own heights — is safe to correct in full.
- **Drift runs on across a forced break.** A `\clearpage` puts both compiles at the top of a page whatever came
  before: read across it, what the final's heights had parted from the preview's (113 pt over Korean 2608.05876's
  main text) was read as the appendix running early, and the appendix was set looser.
- **A segment late at its end is late of itself.** Past a forced break the text starts level or a whole page or
  column late — the segment before ran over the break — and that one answers for it: Japanese 2608.18090's checklist
  was set at 95 % for a page the faces before the break had already taken back.
- **The line model predicts small changes of width.** Over a whole paper it does (the type's tracking and face: 71
  lines changed against 96 foreseen, over 21 papers). Unit by unit it does not: a face 1 % smaller saved a whole line
  twice as often as the model allows, 1.4 times at 1–3 %, 1.1 at 3–5 % (501 units). Small nudges on many units add
  up to text running early.
- **A page more comes from the type re-solve.** Korean 2608.18090's preview stood level at its forced break (−3 pt)
  and the final flow foresaw 16 pt; the final came out 98 pt late because a paragraph moved whole to the next page
  where the preview's had not. With two compiles nothing foresees that.
- **What stays English is safe.** The references are untranslated, yet came out at 0.9 of the paper's leading in six
  German and Russian papers: a unit's leading, put back after its paragraph, was the smaller size's. Every change to
  the unit macros needs a check of what follows a translated unit.
- **A size equal to another is rare.** 0.9 of a 10 pt body is 9 pt, the size most classes give `\small` and notes:
  a unit in `\small` after a unit set at 0.9 was taken as still scaled and kept 9 pt.

### Patterns that hold

- **Change the coarsest thing that does the job**: the type for the paper, then one face over a whole stretch, then
  a unit's leading — never a nudge per unit where a stretch will do. Coarse changes keep the page even and their
  effect on line breaks foreseeable.
- **Forced breaks cut the paper into independent segments.** Each starts where the preview put it, answers for what
  it runs late itself, and inherits nothing but a whole page or column.
- **Correct what persists, not where the preview stood.** Readings are noisy: take the median, take them only past a
  threshold, and let the units' own heights — not floats or page breaks — drive anything a reader would see, such as
  a face.
- **Floors decide where a rule fails.** Japanese and Korean sit at the paper's own leading, Chinese at 1.45 at most,
  alphabets at 0.9 of the size; a stretch that needs past the floor stays long, and only another knob (a face, the
  type's working point) takes it back. Papers often sit at their type's floor (Japanese at face 0.92 and leading 1).
- **Pages change at what cannot break**: an [H] figure, a `\clearpage`, a float taking another column. A few points
  before one move everything after it (2608.06233 half a column late after an [H] figure; 2608.09038's references a
  page of their own).
- **The owner judges in this order**: pages and floats on their original's pages, then even paragraphs, then places.
  A round's report should give all three, and the units standing out.

### Faults in the TeX engine found on the way

Each fixed, most with a case in `lock-cases.mjs` or `tests/pdf-reader/`; worth checking whenever the unit macros
change.

- A unit's leading inside a run-in label, the paper's leading inside a display, a `para/after` hook closing groups
  inside boxes (2608.21180), a model card's leading growing from 13 pt to 43 pt inside `\vbox` (RT-1).
- A unit's size put back before its leading (references at 0.9 apart); a size equal to the paper's `\small` taken for
  a unit's own; smaller type compounding inside lists down to 7 pt.
- Computer Modern's fixed sizes: 0.96 of 11 pt came out at 10.95 — the size probe and a solver choosing among real
  sizes.
- Tables: wider than the line, a tabular* past its column, a narrower table at the left margin (a bare `\hbox`),
  cells set smaller pulling pages ahead; author lines past the page; llncs's `\and`.
- Float holds through `\@floatboxreset`, which IEEEtran, revtex, llncs and amsart define anew — `\@currbox` instead.
- The page builder: a probe logged before the page is decided, `\vspace*` kept at a page's top, `\flushbottom`
  spreading a lost line into paragraph spacing, page 1 shrinking its glue onto a paper's negative `\vspace`.

## Metrics

`spikes/round-metrics.mjs` computes them from the PDFs — each unit's start and end marks against the original's —
and writes numbers only.

- **Pages**: the translation's pages less the original's. Equal pages are necessary, not sufficient.
- **Drift**: each unit's start against its original's, in columns (page, column, height in the column): median, p90,
  and the share within 0.1 column — about the owner's "near".
- **Blocks**: a unit's height against its original's where both lie in one column: the share within 15 % (the
  natural spread of block heights is ±7 % at p25–p75, ±12 % at p10–p90).
- **Floats**: each caption on its original's page and column, in the same slot (top, bottom, amid the text, a page
  of floats), and within 30 pt of its original's place.
- **Units standing out**: units whose leading, × their face, parts by more than 8 % from the median of the three
  before and the three after — what the owner saw as a paragraph set looser. Flow columns only.
- **Faces**: units set smaller than the type, and the smallest.

## Open problems, and experiments worth running again

- **A page more that only the final shows** (Korean 2608.18090): a paragraph moved whole in the final alone. A third
  compile when the final has more pages than the original would catch it; not taken for now (performance).
- **Pages after a `\clearpage` or an [H] figure** (Chinese 2608.09038 two pages more, Russian 2608.06233 one): a few
  lines before what cannot break. A lead kept ahead only before such a point (`measured.local`) helped on six papers,
  not tried on the round of 34.
- **A short abstract set too tall** (Korean and Japanese 2608.15761): the window's leading, raised by shorter
  neighbours, set the 21-line abstract 8 % taller than the original's 23 lines and pushed the keywords off page 1.
  The front matter may want its own ratio rather than the window's.
- **The line model for small changes**: calibrate how lines change with a unit's width (the 1.4×–2× above) from
  the round's own data; the final's foresight of a face, a tracking change or a type re-solve would improve with it.
- **Parameters tuned before later fixes**: the eight-line threshold and the median of five were set before floats
  were held and before the restart at forced breaks; the window of 46 and the 5 % rate were picked from two or three
  values; option A's three lines from one. Each is cheap to try again on the round of 34.
- **The density predictor's worst cases**: CJK's maximum error 5.2–5.8 % against a 5 % gate.

## Where things are

- Rules: `spikes/generic-type.mjs` (design table, type, flow, option A), `spikes/lock.mjs` (TeX of the unit
  macros, floats held, probes, readers), `spikes/density.mjs` (width and size probes, density),
  `spikes/alignment.mjs` (places), `src/pdf-reader/engine/latex-front.mjs` (unit leading, marks).
- Cases: `spikes/generic-type-cases.mjs` (flow, type, option A), `spikes/lock-cases.mjs` (TeX, in Docker),
  `spikes/alignment-cases.mjs`.
- Evaluation: `spikes/visual-eval.mjs` (a column per rule; `--flow=46 --floats --phys=8 --rate=5 --breaks
  --shrink=95` is the chosen one), the page in `../visual-eval/`, `spikes/round-metrics.mjs`,
  `spikes/inspect-places.mjs` (where a paper's units landed), `spikes/inspect-flow.mjs` (a final's flow replayed).
- Numbers: `round-34.json` — 34 papers (Chinese 5, German 5, Japanese 8, Korean 8, Russian 8) × the columns
  Today, FIT, Locked (H rules), Generic, Flow, first, Flow, Flow, even, Flow, even (A).
- Kept outside git (`../data/`, 144 MB after the 2026-10-01 clean-up of 12.9 GB): every paper's translation (a
  model's tokens to make again), each evaluated paper's index (its numbers and the owner's flagged pages), the round's
  `round.json`, and service H's output PDFs, translation stores and request log (`runs/visual-eval-h/`). Compiles,
  PDFs and page images went: `visual-eval.mjs` makes them again from the translations, with no model call.
