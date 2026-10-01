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
- 2026-09-30, the owner chose Flow and set the target: the original, not FIT. Asked for: the figures and tables on the
  pages the original has them on, within LaTeX's own rules; three overflows in Japanese fixed.
  - The overflows, each in a box that does not wrap (latex-front.mjs, PIPELINE_VERSION 4): a table narrower than its
    original keeps the original's width, so that the paper's own scaling (adjustbox's max width, a \resizebox) scales
    both alike (2608.15761's Table 9 had escaped its original's 0.95 and stood 5.6 % larger); a tabular* is measured at
    its columns' width and scaled back to the width it had (2608.05876's Table 1 ran 38 pt into the next column); a
    line of names wider than the line in a table's cell (IEEEtran's and article's author blocks) is set as a centred
    paragraph of the line's width (2608.06701's Japanese names ran 126 pt past the page). IEEEtran's blocks of names
    and of places are units of their own, and an e-mail address, or a list of names in braces before its domain, a
    placeholder: a machine translation had spelled one of 06701's names in katakana.
  - Floats held (lock.mjs FLOAT_TEX): a caption notes for its float the page and column the original set it on; the
    float is reported as not fitting, wherever LaTeX places floats, until then. Alone it moved floats from 94 % to 95 %
    on their original's page and pages did not follow: a held float leaves its room to the text, which runs on. (That
    round had a fault: IEEEtran, revtex, llncs and amsart define \@floatboxreset anew, and the note was taken through
    it; now through \@currbox, which every float's group has.)
  - The drift the preview measured (flowLeads `measured`, alignment.mjs drifts): the final setting corrects where each
    unit actually started in the preview — pages, floats and forced breaks and all — carried forward by what it changes.
    After a \clearpage, where the preview stands level again, a lead ahead is built again before the next thing that
    cannot break. 2608.06233 (German) with a lead of two lines and floats held: pages +1 → 0, drift median 0.198 →
    0.015 column (FIT 0.012), 90 % of units within 0.1 column, 95 % of blocks within ±15 %.
  - The leading's room: with the take-back, Flow at a floor or ceiling did as well as one type or better (Japanese
    2608.15761: 0.165 → 0.027, pages −1 → 0) except Korean 2608.18090 (a page more). A working point clear of the ends
    is left for now: one paper, and it would move Japanese and Korean type the owner has not asked to change.
  - The measure, taken everywhere, also carried the preview's noise into the final — a paragraph that went whole to the
    next page, a column ended early: 2212.06817 measured 30 pt behind the heights' account at the median and ran 0.12
    page ahead; a lead of two lines everywhere cost every unit its lines of drift (2608.21180, Chinese: 0.26 column).
    Taken only where it parts from the heights by more than eight lines (`measured.snap`), with floats held and no
    lead, the round of 34:

    | | Pages equal (more / fewer) | Drift median / p90 | Within 0.1 column | Floats on the original's page / column | Leading step between neighbours, median / p90 |
    |---|---|---|---|---|---|
    | FIT | 29 (2 / 3) | 0.055 / 0.240 | 69 % | 93 % / 92 % | alphabets 2–8 % |
    | Flow, first (window 50, take-back) | 25 (5 / 4) | 0.059 / 0.333 | 70 % | 94 % / 92 % | 0.6 % / 3.6 % |
    | Flow: floats held, measured drift past 8 lines | 27 (5 / 2) | 0.051 / 0.297 | 74 % | 98 % / 96 % | 0.7 % / 5.5 % |
    | H-rule lock | 32 (2 / 0) | 0.019 / 0.140 | 92 % | 96 % / 96 % | — |

    German and Russian gain most (drift median 0.076 → 0.052, p90 0.289 → 0.168); CJK holds (0.049 → 0.050). The
    evaluation page shows it as Flow, the first version beside it.
  - A lead only before what the preview saw jump (`measured.local`, 30 lines): on six papers it gave 2608.24839
    (German) its last page back and cost the two Chinese papers nothing, but Korean 2608.15761 went 0.057 → 0.104
    column; Russian 2608.06233's [H] figure after its \clearpage still moves. Not yet on the round of 34.
- 2026-10-01, the owner's review of that round: Japanese and German better, Chinese a little, Korean and Russian worse on
  eight papers, and two faults. What was wrong:
  - The width a narrower table keeps went out as a bare \hbox in the float's vertical list, where \centering does not
    reach: tables sat at the left margin (2608.21180's Table 3, 80 pt off). A table on the page looked moved wherever
    its translation was narrower — a good part of what read as worse. It now starts a paragraph first.
  - \axtwide took in llncs's \and; in article \and ends the table the names are set in, which cannot happen in a box.
    Lines holding \and are left as they are.
  - Korean 2608.21180's abstract sat on its e-mail line. The title came out a line shorter, page 1 took the room by
    shrinking its glue (tracingpages: 564.6 pt set in a 549.1 pt page), and the paper's own \vspace{-2.8em} did the
    rest. Every version but the H-rule lock had it. The correction did not see it for two reasons: the first unit's
    drift, 20 pt, was under the snap threshold — now the first unit's measure is always taken, only the front matter
    stands before it — and the drift a correction reads was held within the text block, which the original's highest
    mark on the page bounds, so a start above it read as level. Unheld (alignment.mjs drifts), 21180 came out with the
    gap back (20 pt against 32) and drift median 0.162 → 0.013 column.
  - The correction took single readings for drifts: a paragraph moved from the foot of the left column to below a
    figure heading the right read 0.42 column late in Korean 2608.06701, the next paragraph level, and the final chased
    both (a page more). What the preview measured beyond its own heights' account is now read as the median of the next
    five readings; the first reading, before which stands only the front matter, stands for the rest; a later median
    within eight lines of it reads as it, one past it holds while it lasts (flowLeads `measured`). Round of 34, both
    Flows on the same engine:

    | | Pages equal (more / fewer) | Drift median / p90 | Within 0.1 column | Against the first Flow: better / worse |
    |---|---|---|---|---|
    | FIT | 29 (2 / 3) | 0.055 / 0.240 | 69 % | — |
    | Flow, first | 25 (5 / 4) | 0.060 / 0.336 | 70 % | — |
    | Floats held alone | 24 (5 / 5) | 0.059 / 0.345 | 70 % | 1 / 2 |
    | Floats held, readings past eight lines taken | 26 (6 / 2) | 0.046 / 0.295 | 76 % | 10 / 4 |
    | Floats held, medians against the front matter's | 29 (4 / 1) | 0.044 / 0.260 | 78 % | 10 / 4 |
    | H-rule lock | 32 (2 / 0) | 0.019 / 0.140 | 92 % | — |

    The last is the page's Flow now. Worse than the first Flow: Chinese 2608.05876, Japanese 2608.15761, Korean
    2608.18090 and 2608.06701 — a float that took another column, and the rest after it (06701: identical to page 4).
    Showing whichever of the two compiles lies nearer the original would give 31 papers and drift 0.038, three worse;
    the reader's previews are drafts (no rerun, references unresolved), so it would cost the last preview a full
    compile. Not taken.
- 2026-10-01, the owner's verdicts paper by paper on that round, Flow against Flow, first: Flow 12, Flow, first 9,
  level 13 (German four of five Flow, Korean four of eight Flow, first), and one fault: Russian 2608.05876's
  references, untranslated, ended sooner than the original's. What was wrong:
  - A unit's size ran before its leading, and the leading it gave back after its paragraph was the smaller size's:
    every line after the last sized unit that selected no size of its own was set 0.9 as far apart — the references
    of Russian 2608.05876, 18090, 06701 and 15761 and German 06701 and 15761 (9.9 pt against the paper's 11). The size
    now hands the leading it replaced to the unit's leading (latex-front.mjs \axt@leadbefore). CJK sets no unit size
    and was not touched; the references of every CJK paper matched the original's pitch.
  - A unit started from the size in force unless that equalled the size the last unit was set at, taken as still in
    force: the paper's own 9 pt — notes, \small — after a unit set from 10 pt to 9 stayed 9 pt and came back at 10.
    The note of whose size is in force is now the size and leading together, local, and restored with the size.
  - Where the two Flows were level on pages and floats, the owner chose the one whose paragraphs are set evenly. The
    final's correction took a jump the preview measured back within its horizon and set the paragraphs after it up to
    a quarter looser than those around them (Korean 2608.05876: 1.36 against 1.11; 06701: 1.54 against 1.20). Counted
    as units more than 8 % from the median of the three before and after: the first Flow 3 of 2,531, the Flow 53.
    The same correction took the preview's first reading — its front matter a little short — as an offset to keep,
    set the abstract looser, and pushed Korean 2608.15761's keywords off page 1: every page after it 45 pt late.
    flowLeads' `rate` bounds how far what is taken back moves a unit's leading from the window's.
  - `rate` at 3 % and 5 % on the round of 34 (German and Russian's two Flows compiled again with the size fix): 5 %
    kept Flow's places and set the text as evenly as the first Flow; 3 % cost a page (German 2608.06233).

    | | Pages equal | Drift median / p90 | Within 0.1 column | Blocks within 15 % | Floats within 30 pt of the original's | Units standing out |
    |---|---|---|---|---|---|---|
    | Flow, first | 26 | 0.059 / 0.333 | 71 % | 84 % | 78 % | 3 |
    | Flow | 30 | 0.043 / 0.259 | 78 % | 84 % | 83 % | 53 |
    | rate 3 % | 29 | 0.045 / 0.271 | 77 % | 85 % | 82 % | 12 |
    | rate 5 % | 30 | 0.044 / 0.255 | 78 % | 85 % | 84 % | 9 |

    Worse than Flow at 5 %: Korean 2608.05876 (0.025 → 0.060 column) and 2608.21180 (0.011 → 0.043, its abstract
    33 pt below the e-mail line as the original's, against Flow's 22). 05876's loss was all in its appendix, and the
    rate only showed what had been wrong before it: the correction read across the \clearpage before the appendix.
  - A forced break puts the preview and the final at the top of a page whatever came before it, but the correction's
    account ran across it: what the final's heights had parted from the preview's before the break (113 pt over
    05876's main text, the final's type a little tighter) was read as the appendix running that far early, and the
    appendix set looser — at Flow's full take-back a few paragraphs a tenth looser, at 5 % the whole appendix. The
    output routine now logs each column made at a forced break (LINES_TEX AXT-FORCED, readForced), and flowLeads
    starts the final's drift again from the preview's account there and the offset from the first reading after it
    (`measured.breaks`), the median of readings stopping at the break. 05876's appendix at 5 %: 65, 47, 66 pt off on
    its pages against the original, now 11, 14, 22 (Flow 9, 14, 22).
  - Not the rate: Korean 2608.15761's abstract, 21 lines against the original's 23, is set 1.18 against the first
    Flow's 1.16 — the window's leading, which its shorter neighbours raise, and the first reading's offset on it — and
    comes out 8 % taller than the original's; its keywords, split across the page break in the original, went whole
    to page 2 and every page after was 20–40 pt late. Open.
  - Rate 5 % with the correction started again after forced breaks, the round of 34: the page's Flow, even (key
    flow46fp8r5b).

    | | Pages equal | Drift median / p90 | Within 0.1 column | Blocks within 15 % | Floats within 30 pt | Units standing out |
    |---|---|---|---|---|---|---|
    | Flow, first | 26 | 0.059 / 0.333 | 71 % | 84 % | 78 % | 3 |
    | Flow | 30 | 0.043 / 0.259 | 78 % | 84 % | 83 % | 53 |
    | Flow, even | 30 | 0.042 / 0.253 | 78 % | 85 % | 83 % | 9 |

    Against Flow: Korean 2608.06701 better (0.054 → 0.010, its floats back in their columns), 2608.21180 worse
    (0.011 → 0.043: pages 3–10 one or two lines late, the rate taking the offset back more slowly; its abstract as far
    below the e-mail line as the original's), the other 32 level. Against the first Flow: ten better, Japanese
    2608.15761 and Korean 2608.18090 worse (the keywords above, and 18090's floor below). On the papers the owner gave
    to the first Flow: Korean 02785, 05876 and 06701 set as evenly as it (units standing out 0, 0, 1 against Flow's 4,
    3, 7), Russian 05876's page 6 back (every unit on its page, 10 pt off against Flow's 95), Russian 02785 and 15761
    level in every number, Chinese 2212.06817 even but two or three lines late on pages 14–26 (on 29–31, where the
    first Flow's float pages ran 180–230 pt off, it holds).
  - Korean and Japanese 2608.18090, a page more in every Flow: sections 7 and 8 run 0.16 page long where the leading
    already sits at its floor (Japanese and Korean at the paper's own, the type's 1.01), the references start a page
    later and run past it, and the checklist after its \newpage takes page 13. Nothing but the floor can take it
    back — the owner's call (tracking tightened, a unit's face a little smaller, or the type leaving room below).
- 2026-10-01, the owner's option A on Flow, even (CJK only, page column "Flow, even (A)", key flow46fp8r5bs95): a unit
  that runs long past the floor of the leading set at a face down to 0.95 of the type's (flowType `shrink`). Three
  rounds on the 21 CJK papers:
  - First, the face from the leading's whole want: it chased where the preview's text stood — a float moved —
    and Korean 2608.24839 came out a page short; and the preview, set at smaller faces too, was carried back to the
    full face by the line model, which reads a line saved for every 2 % even where a short paragraph keeps its lines.
  - Second, from the window's leading alone: the excess the floor left was never taken back, and Korean 2608.18090
    kept its page more.
  - Third (on the page): from the flow of the units' own heights — the window's leading, what the floor left taken
    back, started again at a forced break — never from the preview's places; only the final sets faces.

    | CJK, 21 papers | Pages equal (more / fewer) | Drift median / p90 | Within 0.1 column | Units standing out (leading × face) |
    |---|---|---|---|---|
    | Flow, even | 18 (3 / 0) | 0.042 / 0.317 | 78 % | 7 |
    | Option A | 19 (1 / 1) | 0.040 / 0.233 | 80 % | 16 |

    Better: Japanese and Korean 2608.18090 (their pages), Japanese 2608.15761 (0.086 → 0.021 column). Worse: Japanese
    and Korean 2608.06701 (0.01 → 0.04), Japanese 2608.21180 (0.028 → 0.064), Korean 2608.15761 (0.086 → 0.124),
    Japanese 2608.24839 a page short. 501 units set smaller, a third of the CJK units, most by under 3 %: Japanese and
    Korean types sit at or near their floor. And a face a little smaller saves a whole line more often than the line
    model allows — 95 lines against 75 in all, twice as often under 1 % (8 against 3.8), 1.4 times at 1–3 %, 1.1 at
    3–5 % — so the final, which counted on the model, came out early. Japanese types already at their smallest face
    (0.92) went to 0.87 in places.
