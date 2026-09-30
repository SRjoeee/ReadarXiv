# Generic typography: one design per writing system, one density number per paper

2026-09-30, the owner's direction. Supersedes the per-block ideas for the FIT default (`2026-09-30-fit-default-roadmap.md`
keeps its gates). Original stays the objective; FIT stays the baseline to beat.

## The objective, as the owner corrected it

"Local blocks" does not mean pixel positions or exact block heights. It means that, through one holistic and generic
design — size, weight, spacing, leading, face — each translated block comes out about the size of its English block,
and the whole paper about the layout of the original. Positions may differ a little where that serves the whole.
What to avoid: fine per-block rules that make the logic heavy, do not carry to other document styles or languages,
and cost time. Per-block line targeting (`\looseness` per unit, per-unit leading nudges) is out.

## What the data says (34 papers with base-typography line probes, 2026-09-30)

Density = the translation's lines over the original's at base typography (the paper's size, no fitting).

| Language | Papers | Density per paper | Spread | Language mean alone: error median / max | From the translation's text: median / max |
|---|---|---|---|---|---|
| zh | 5 | 0.67–0.75 (mean 0.72) | ±4.0 % | 3.8 % / 9.5 % | 2.9 % / 6.3 % |
| ja | 8 | 0.87–1.14 (mean 1.03) | ±8.9 % | 9.0 % / 17.2 % | 4.3 % / 5.3 % |
| ko | 8 | 0.83–1.00 (mean 0.94) | ±6.2 % | 7.3 % / 13.2 % | 4.0 % / 5.4 % |
| de | 5 | 1.11–1.23 (mean 1.17) | ±3.5 % | 1.9 % / 7.2 % | 1.3 % / 4.2 % |
| ru | 8 | 1.12–1.27 (mean 1.20) | ±4.1 % | 3.8 % / 8.1 % | 2.2 % / 3.4 % |

Errors are leave-one-paper-out. The text predictor was crude (every non-CJK character 0.5 em, math ignored).

- A language label is not enough: Japanese ranges 0.87–1.14 by paper (katakana loanwords lengthen term-heavy papers).
  This is why the fixed-profile ablation lost local alignment (Korean 92 → 63 % on page).
- One number per paper, computed from the translation's text, halves the error. No compile, milliseconds.
- What no generic design removes: at the right density, blocks of three lines or more fall within ±7 % of their
  original's size for half of them (p25–p75) and ±12 % for four in five (p10–p90). Captions, theorems and list items
  follow the body (0.97–1.01 of the paper's density); only Chinese one-line captions stay 1.13 (a line is a line).

## The rule system

1. **A design table per writing system (data, no logic).** Faces and weights; for each knob — size, tracking,
   leading — a natural range and a share of the adjustment. Refined per language later, by the owner's eye.
2. **A line predictor from text.** For each unit, its width in em from its characters (per class: CJK, Latin lower,
   upper, digits, punctuation, spaces, Cyrillic) and its atoms (inline math, citations, references), against the
   capacity of the original's own lines. The original is the ruler: no font file, no compile.
3. **One allocation function for every script.** It finds the type, within the design's ranges, at which the
   predicted translated height equals the original's, the knobs sharing the change as the design says.
4. **Applied to every translated role alike** — body, captions, table cells, headings, boxed text, footnotes — with
   no per-block correction.
5. **Optionally, a free correction:** the reader compiles previews anyway; the final compile may use a preview's
   measured lines instead of the prediction. No compile is added for it.

## Steps and gates

1. **The predictor.** Refine the width model one factor at a time, keeping only what lowers the error on held-out
   papers. Gate: leave-one-out median ≤ 2 %, max ≤ 4 % per language, on the 34 papers and on new held-out papers
   (at least ten per language, translated and compiled for this; never tuned on).
2. **A "generic" column in the evaluation, one compile per paper.** Compared with FIT (two or three trial compiles)
   and Original on the owner's five-paper rounds. Gate: no worse than FIT on pages and drift, block sizes within the
   natural spread, uniform type; then the owner's visual review.
3. **Every role.** The type reaches table cells, headings and boxed text; the segment shifts they caused (German
   2608.06701 pages 3–4) are gone.
4. **The reader.** The predictor and allocation in `live.mjs`, the original's lines from arXiv's text layer; compile
   count, first preview, final and memory measured against the current reader. Only then the default.

## Metrics

- Pages: translated minus original.
- Drift: each unit start's place in the document — page, column, height on the page, as a fraction of a column —
  against the original's; median and p90 of the absolute difference, in columns.
- Block size: a unit's height over its original's where both lie within one column; median and p10–p90, against the
  natural spread above.
- Uniformity: the spread of body leading and size across units (zero by construction for a generic design; FIT's
  per-unit nudges show here).
- Cost: compiles, TeX passes, milliseconds.

## Progress

- 2026-09-30: direction set; density measured on 34 papers (above).
- 2026-09-30, step 1, the predictor (`spikes/density.mjs`, checked by `density-check.mjs`):
  - Widths as TeX sets them, measured once per face (`density-faces.json`: CM, Times, Libertine; Cyrillic in cmr and
    Tempora), xeCJK's rules measured (an em a character, a mark closed up beside another, a quarter em beside Latin
    letters and digits, spaces dropped between CJK characters and kept in Korean), atoms by kind, citations by the
    paper's style (natbib's super or numbers, Nature's classes, the \bibliographystyle, else the .bbl's items).
  - The ruler is the original's own lines, unit by unit; the font probe (compiled anyway) sets a sample of English in
    the body face at the body size, which scales the tables to the face the paper has (optical sizes, other faces).
  - Development set (34 papers), no fitting: median error 0.4–1.5 %, max 1.2–5.2 %. Held out (12 papers per
    language, 14 drawn evenly from the unused corpus, two too small to score): median 1.2–1.7 %, max 2.9–5.8 %,
    against a language's mean alone 2.2–6.5 % / 5.4–14.4 %. Gate: median met; max met for German and Russian,
    not for CJK (5.2–5.8 %, short formula-dense papers). The reader's previews can replace the prediction by
    measured lines for its final compile, at no cost.
  - Tried and dropped: the text block's width from the probe as the CJK ruler (the probe's \columnwidth is the page's
    in classes that switch to two columns later: errors to 14 %); half an em of CJK line-end waste (no better).
- 2026-09-30, step 2, the generic column (`generic-type.mjs`, `visual-eval.mjs --generic`): one compile, the solve in
  about 20 ms.
- 2026-09-30, step 3, roles: the size compensates text that flows — paragraphs, captions, notes, a figure's passage.
  A line that does not flow (a table cell, a heading) is as tall as its type whatever its length: set smaller it came
  out shorter than the original's and pulled the pages after it ahead (2608.06701). Tables are held to their
  original's height, never below 0.85 of their width (FIT_DEF's \axt@fitmin).
- 2026-09-30, step 2, two faults found by measuring the first compile against its prediction:
  - `measureUnits` still applied the dropped CJK ruler by default; zh 2608.06007's first compile measured 9 % long
    against a prediction density-check put at 1 %. Removed; now 0.7 %.
  - Fixed sizes. Computer Modern (OT1, T1, T2A) has 9, 10, 10.95 and 12 pt and nothing between; a size between comes
    out at the nearest, so 0.96 of an 11 pt body came out at 10.95 pt and 2608.02785 ran 7 % long, and a correction
    that crossed the step jumped from 0.97 to 1.07. The size probe (`density.mjs SIZE_PROBE`, in the font probe and in
    every translation's compile) measures how wide the body face sets at each size of the range; the solver chooses
    among those, the leading taking up the rest. A face's em is no measure of its size (Latin Modern's 9 pt design has
    an em of 9.25 pt); the sample's width is. An alphabet's size floor is now 0.9, a 10 pt class's \small.
  - After both, the first compile lands at 0.985–1.02 of the original's height (CJK) and 0.987–1.015 (alphabets),
    except papers at the design's floors: four Japanese papers at scale 0.92 and leading 1.0 stay 2–6 % long, and a
    face whose sizes from 9.1 pt use a narrower design (2608.06701) 5.7 %. The second compile, corrected by the first's
    measurement, lands within ±0.5 %.
- 2026-09-30, the round of 34 (zh 5, ja 8, ko 8, de 5, ru 8), every variant two compiles (the reader's preview and its
  final), against FIT (three trial compiles) and the H-rule lock:

  | | Pages equal (more / fewer) | Drift median / p90, columns | Within 0.1 column | Blocks within ±15 % | Leading, p10–p90 / step between neighbours (median) |
  |---|---|---|---|---|---|
  | FIT | 29 (2 / 3) | 0.056 / 0.236 | 69 % | 86 % | alphabets 13–17 % / 2–8 %; CJK one type |
  | Generic: one type | 26 (4 / 4) | 0.077 / 0.382 | 63 % | 84 % | 0 |
  | Flow: a window of 50 lines | 25 (5 / 4) | 0.058 / 0.328 | 71 % | 84 % | 7 % / 0.6 % |
  | Flow, each block (window 0) | 26 (5 / 3) | 0.063 / 0.331 | 70 % | 88 % | 15 % / 0.7 % (p90 13 %) |
  | H-rule lock | 32 (2 / 0) | 0.019 / 0.140 | 92 % | 73 % | — |

  By script: CJK's best is Flow (drift 0.047 against FIT's 0.063, 76 % within 0.1 against 66 %); FIT's CJK is one
  type, like Generic, and the two land within 0.004 of each other. The alphabets' best is each block a little ahead
  (window 0, two lines ahead: drift 0.053 against FIT's 0.045, pages 9 of 13 against 11).
- What one type cannot do, and why the rest is fragile:
  - One type keeps the paper's height, not its places: a translation's density changes along a paper and each
    stretch keeps what the one before it lost (German 2608.24839: 0.20 column ahead by page 4 at a whole-paper ratio
    of 0.994). Flow takes a quarter of it off on average (drift median 0.077 → 0.058), not everywhere: on 24839 it
    stood 0.29 ahead, and what moves it there is still to find.
  - Pages change at what cannot break. 2608.06233's [H] figure fitted its column exactly in the original; ten points
    more before it moved it a column on, `\flushbottom` spread the column it left, and every page after stood half a
    column late (FIT's six points more fitted). 2608.09038's main text ran a third of a column long before a
    `\clearpage`: its references took a page of their own, two pages added. 2608.24839's last page holds nine lines,
    and a translation a few lines short loses it. A lead of two lines ahead did not save 06233: the `\clearpage`
    before its appendix starts both on a fresh page, and the height-based drift does not see that.
  - The leading needs room both ways. At a floor (Japanese and Korean set no tighter than the paper's leading) or a
    ceiling (Chinese at 1.45), per-block leading can only move one way and shortens or lengthens the whole: the
    take-back (`horizon`) limits it, and zh 2608.21180 at 1.448 still came out 0.17 column ahead with each block.
    Next: the type solved with the leading's working point clear of its ends, the other knobs taking up the rest.
