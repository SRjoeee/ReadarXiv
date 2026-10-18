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
6. **Final**: the preview's type kept (until the corrections below, the type was solved again from the preview's
   measured height); the flow again from the preview's lines, each unit at its measured height, now correcting where
   the preview's text stood:
   - a reading is the median of the next five; it is taken only where it parts from the heights' account by more
     than eight lines; the first reading, before which stands only the front matter, stands for the rest;
   - after a forced break the correction starts again from where the preview put the text there;
   - what is taken back moves a unit's leading at most 5 % from the window's (`rate`);
   - CJK: where a segment (up to a forced break, or the paper's end) runs late by itself by more than three lines,
     its leading at the floor, its late stretch is set at one face — 97.5 % over as few of its last units as take
     the lateness back, else 95 % — and the flow runs again (`shrink`);
   - a unit the flow cannot measure (a display inside it) takes the leading of the last measured unit before it.
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

In the engine (`exp/flow-typesetting`, `spikes/typeset-check.mjs`, since replaced by the gate, 2026-10-01), the same
rule on the same translations: 32 of 34 papers as above; German and Korean 2608.15761 not (German one page fewer, drift
0.061 against 0.085; Korean 0.108 against 0.086), and the experiment's own code, run again, gives what the engine gives,
plan and TeX alike. Those two cells of `round-34.json` are not reproducible; the engine's run is the baseline: pages
equal 30 (3 more / 1 fewer), drift 0.040, within 0.1 column 80 %.

Option A set a face in five papers, each over a run of whole pages: Japanese 2608.18090 (33 units at 95 % or
97.5 %, its page back), 2608.24839 (40 at 97.5 %), 2608.05876 (24, its appendix), 2608.15761 (16), Chinese
2608.09038 (17 at 95 %); against Flow, even, three papers better and none worse. The pages still off: Chinese
2608.09038 (+2), Korean 2608.18090 (+1) and Russian 2608.06233 (+1), each at something that cannot break (below).

## The engine's corrections (2026-10-01, before the rule is wired)

An independent evaluation of the engine modules (round of 34, and a holdout of 22 the rule was not tuned on: 13
Chinese papers it never saw, 9 of the round's papers in a language they were not evaluated in) found six problems;
the engine modules were corrected before wiring, each measured on the gate (`spikes/typeset-gate.mjs`, natively in
Docker, the holdout judging):

- **Columns, page by page, from TeX, on the original's grid.** `marksOf` decided two columns once per document, from a
  fifth of the starts in the right half; Chinese 2608.02163 (a two-column body, a one-column appendix) fell under it in
  its original and over it in the rule's compiles, and every place after the body read 18.75 columns apart. Each page
  now carries its columns as its compile set it (`MARK_DEF`'s `axt-c<n>-<k>`: LaTeX's `\if@twocolumn`, multicol's and
  the kernel's `\col@number`, revtex's grid `\pagegrid@col`), and both documents are read on the original's, page by
  page — a unit on its original's page at its height is level, whatever the translation's compile set that page in
  (aastex's 2608.12606 began its one-column appendix a page early, mid-page). Judging columns from the marks fails both
  ways on these papers: run-in labels and centred captions put starts in the right half of one-column pages (2608.02991,
  seven pages), a right column of floats or of one paragraph puts none there.
- **No plan from a missing or partial input**: the translation is then set as today. With no line readings,
  `solveType([])` had given the smallest type. Guarded: a design for the script under the strategy, the original's log
  whole (`AXT-END` after the last page), its marks and every page's columns, the width probe, an alphabet's size probe,
  a translated unit the original measured. A final without a whole measurement keeps the preview's plan.
- **One design per strategy**: under the pdfLaTeX fallback (CJKutf8), which has neither xeCJK's glue nor a face scale of
  its own, CJK is solved as an alphabet is — a size on every unit (the CJK face follows it) and the leading.
- **The last TeX pass** of the browser compiler's joined log is read: the terminal's echo invented forced breaks.
- **The final keeps the preview's type**: re-solved from the preview's measured density, a type a few per cent
  different in size, glue or face broke lines no prediction followed (Korean 2608.18090 a page more in the final alone,
  Chinese 2608.23586 a page fewer). Only the leading moves now, which breaks no line again.

The gate's numbers, the rule as it stands (the final compile; start and end drift the mean of the papers' medians):

| | Pages equal (more / fewer) | Start drift | End drift | Within 0.1 column | Blocks within 15 % | Floats on their page / within 30 pt |
|---|---|---|---|---|---|---|
| Round of 34, today | 11 (14 / 9) | 0.731 | 0.746 | 20 % | 54 % | 55 % / 34 % |
| Round of 34, the rule as handed over | 30 (3 / 1) | 0.040 | 0.044 | 80 % | 85 % | 98 % / 84 % |
| **Round of 34, the rule corrected** | **32 (1 / 1)** | **0.041** | **0.045** | **81 %** | **84 %** | **98 % / 84 %** |
| 13 unseen Chinese papers, today | 5 (0 / 8) | 0.703 | 0.720 | 11 % | 48 % | 33 % / 20 % |
| 13 unseen, as handed over | 11 (0 / 2) | 0.136 | 0.136 | 55 % | 64 % | 97 % / 84 % |
| **13 unseen, corrected** | **12 (0 / 1)** | **0.100** | **0.101** | **64 %** | **65 %** | **97 % / 86 %** |
| 9 in a new language, today | 2 (4 / 3) | 0.679 | 0.696 | 15 % | 49 % | 49 % / 24 % |
| 9 in a new language, as handed over | 8 (0 / 1) | 0.052 | 0.060 | 77 % | 79 % | 97 % / 94 % |
| **9 in a new language, corrected** | **8 (0 / 1)** | **0.043** | **0.049** | **76 %** | **80 %** | **97 % / 94 %** |
| Chinese 2608.02163: today / as handed over / corrected | 0 / 0 / 0 | 0.266 / 18.75 / 0.215 | 0.271 / — / 0.218 | 12 / — / 44 % | 63 / — / 74 % | 82 / — / 94 % on page |

("As handed over" for 2608.02163 is the evaluation's: the per-document column flag read every place after the body 18.75
columns off. The other "as handed over" rows are the gate's own run of items one to four, which left the rule's choices
as they were.) Units standing out — leading parted by more than 8 % from the six around it, measured in the final's log
over all 57 papers — 93 before the last correction, 48 after. One paper is further from its original's page count than
today: Chinese 2608.09038, +1 (today 0; +2 as handed over). Under CJKutf8 (`STRATEGY=1`): Japanese 2608.06701 today +1
page, drift 0.436, the rule 0 and 0.223 (as handed over +1, 0.412); Chinese 2608.21180 today −1, 0.641, the rule 0,
0.272 (as handed over the same); Japanese 2608.18090 today +1, 0.753, the rule +1, 0.040 (0.584).

Tried and not taken, on the same gate:

- **The CJK knobs in turn, the leading first** (instead of equal shares in log terms; twenty lines fewer): unseen 11 →
  10 pages equal, start 0.136 → 0.159; new language 8 → 7, 0.052 → 0.062. The equal shares stay.
- **Option A off**: no change on the holdout, which has no Japanese or Korean paper; on the round 30 → 29 pages equal
  (Japanese 2608.18090), 0.040 → 0.043, three papers worse and none better. Kept: its effect is on scripts the holdout
  cannot judge.
- **The nearer of the measuring compile and the final** (fewer pages off, then the smaller drift): about a point
  (round 33 pages equal, 0.039; unseen 0.085), for a full measuring compile or a further one whenever a draft is the
  nearer. Left to the wiring.
- The window and the take-back as one constant (50 lines both): tried in the fix round, below.

### The review's fix round (2026-10-02)

A second review found the corrections sound and asked for three things: paragraphs holding a display modelled in
general, a holdout in the languages the rule serves, and a gate that checks each paper rather than the sets' means.

- **A fresh holdout.** Ten of the thirteen unseen papers translated once into Japanese, Korean, German and Russian with
  Microsoft's free engine on the reader's markers wire (`spikes/typeset-translate.mjs`; no model asked): 40
  paper-languages (`fresh`) that judge every change from here on. The other three papers in the same languages (12,
  `aside`) were run once, at the end. A paper is display-heavy when a quarter or more of its prose units hold a
  display; such papers drift further (unseen Chinese 0.142 against 0.051 column, fresh 0.077 against 0.046) and are
  counted apart.
- **The gate checks each paper against its record** (`papers` in `typeset-gate.json`): no page further from the
  original's; start and end drift at most 0.03 column past the record; no float off its page that was on it, at most
  one more beyond 30 pt; blocks within 15 % at most 5 points fewer; the measuring compile's pages and drift likewise.
  Set means alone had let one paper's drift triple and the float hold be switched off; both fail now (Japanese
  2608.24839's drift 0.089 → 0.267; with no float held, Chinese 2608.25750's start drift 0.026 → 0.065 and floats
  within 30 pt 20 → 18). Results of another TeX image or of other rule files are refused as stale. `DRAFT=1` makes the
  measuring compile as the reader may (one pass, images as frames, today's references) and the final from it: on the
  fresh holdout the same final as a full measuring compile gives, on all 40, once the references went where TeX reads
  them (a main file in a folder, 2608.12333's, had none in any one-pass compile). A second review (2026-10-02) found
  the per-paper check blind to a shift of every paper by less than its slack (0.029 column passed): each whole set is
  held to the record's baseline again (pages equal, drift +0.005, shares −1 point, units standing out +0.25 % of the
  measured units), the draft-measured final is checked as the final (equal on all 109), and a page count that crosses
  (−1 → +1) fails. The record is rewritten only with an adopted change (the gate's header).
- **A page's columns are read where its units were set**, not only as the page goes out: revtex's and aastex's grid
  closes at `\end{document}` before the last page goes out, and every such last page read one column. A page now reads
  the most columns of any mark on it and of the page as it went out (a native revtex case). Today's drift moved (round
  0.731 → 0.738, new language 0.679 → 0.685); the rule's did not. A last page of references alone, after the grid
  closed, still read one (2608.20847's page 9): the columns are sampled as `\end{document}` begins too, natively and
  under BusyTeX (`spikes/typeset-busytex-cases.mjs`). aastex631's references close their own grid before the
  document's end, and 2608.12606's page 20 still reads one; no unit is set there.
- **A plan sets only what it was made for.** `finalTypesetting` refuses a plan made on another translation than the
  one it sets (the measuring compile must hold the whole translation); a plan given another strategy sets the
  translation as today, and the wiring is told (`note('typeset refused')`). Neither throws. The same translation is
  the same pieces in content, not the same arrays: the reader replaces a unit's array whenever a batch answers it, and
  a seeded run sends every unit again, so a check by identity would have refused the measuring preview's plan.
- **A forced break before a unit the flow does not measure** (a paragraph holding a display) is taken at the next unit
  it does: 2608.09038's `\clearpage` before one had left its whole paper one segment (its final changed, not its
  numbers).

Tried and not taken:

- **Units holding a display measured by their text**, in the type, the flow and the final. `\prevgraf` counts a display
  as three lines, so the line probe's reading less three a display is the unit's text, which the type and the flow can
  balance with the rest, the display falling out of every sum. On the fresh holdout under a point (pages equal 34 and
  34, start drift 0.062 → 0.058, display-heavy 0.077 → 0.072), with units standing out 29 → 43; on the Chinese unseen a
  page and 0.037 column lost (12 → 11 pages equal, 0.100 → 0.137, display-heavy 0.142 → 0.208); on the round a page (32
  → 31). Short Chinese sits at its leading's ceiling, and set tight to their own text the display units left it
  short; a unit that opens with a display, or holds two paragraphs, reads its lines too loosely to correct by. In the
  final alone: 31 of 40 pages equal.
- **The final's type solved again** from the measured density (as handed over), on the fresh holdout: 35 of 40 pages
  equal, start drift 0.062 → 0.076. The final keeps the preview's type.
- **No xeCJK glue in the width model under CJKutf8**: Japanese 2608.18090 0.040 → 0.144, 2608.06701 0.223 → 0.232,
  Chinese 2608.21180 level. The translation's own spaces beside Latin, which CJKutf8 sets as spaces, are about what
  the glue stood for.
- **The window and the take-back as one length, 50 lines** (46 and 50): on the fresh holdout level (pages equal 34 and
  34, start drift 0.062 → 0.066, floats on their page 88.8 → 90.4 % and within 30 pt 77.9 → 80.2 %), on the round
  Chinese 2608.09038 a page further (+1 → +2, today 0). Kept at 46 and 50.

The gate after the fix round (the final; drift the mean of the papers' medians):

| | Pages equal (more / fewer) | Start drift | display-heavy / the rest | End drift | Within 0.1 column | Floats on their page / within 30 pt |
|---|---|---|---|---|---|---|
| Round of 34, today | 11 (14 / 9) | 0.738 | 1.074 / 0.680 | 0.760 | 20 % | 55 % / 34 % |
| Round of 34, the rule | 32 (1 / 1) | 0.041 | 0.062 / 0.038 | 0.045 | 81 % | 98 % / 84 % |
| 13 unseen Chinese, today | 5 (0 / 8) | 0.703 | 0.708 / 0.697 | 0.720 | 11 % | 33 % / 20 % |
| 13 unseen Chinese, the rule | 12 (0 / 1) | 0.100 | 0.142 / 0.051 | 0.101 | 64 % | 97 % / 86 % |
| Fresh 40, today | 9 (20 / 11) | 0.771 | 0.891 / 0.652 | 0.791 | 16 % | 25 % / 15 % |
| Fresh 40, as handed over | 36 (2 / 2) | 0.066 | 0.093 / 0.038 | 0.070 | 68 % | 90 % / 81 % |
| **Fresh 40, the rule** | **34 (6 / 0)** | **0.062** | **0.077 / 0.046** | **0.064** | **69 %** | **89 % / 78 %** |
| Aside 12, today | 5 (7 / 0) | 0.736 | 0.486 / 1.236 | 0.790 | 12 % | 46 % / 19 % |
| Aside 12, as handed over | 9 (3 / 0) | 0.157 | 0.174 / 0.122 | 0.156 | 53 % | 87 % / 70 % |
| **Aside 12, the rule** | **10 (1 / 1)** | **0.148** | **0.194 / 0.054** | **0.145** | **57 %** | **90 % / 73 %** |

Papers further from their original's page count than today: Chinese 2608.09038 (+1, today 0), Korean 2608.15016 (+1,
today 0), Japanese 2608.09746 (+1, today 0; +1 as handed over). In each the page is the bibliography spilling: it is
neither translated nor measured nor flowed, and follows the main text onto a page the original left nearly full
(the room left there, the original's lowest text line against the document's: about 6 pt in 2608.15016, 45 pt in
2608.09038 and 2608.09746; the re-review of 2026-10-02). 2608.15016 is a page long in all four fresh languages (level
as handed over), two ways. In Korean and Japanese its tables keep their pages, and the main text ends 27–30 pt late at
that full page — under the face step's three lines, and the flow's account even had Korean 79 pt early — so one
reference spills onto page 7. In German and Russian the main text ends early (49 and 36 pt), but the table at the top
of the original's page 5 goes to page 6 in the measuring compile and the final alike, and takes the room on the last
page. Its bibliography is the original's length in all four (85 lines). The type solved again in the final brought
the Japanese back. In 2608.09038 and 2608.09746 the main text ends about 190 pt late against 45 pt of room: the face
step set 25 and 19 units at 0.95 and still left it late, for it reaches only the units the flow measures (39 and 50 %
of the translated units; the paragraphs holding a display are 61 and 47 % of the prose).

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

`spikes/round-metrics.mjs` computed them for the experiment; the engine's gate, `spikes/typeset-gate.mjs`, computes
them from the PDFs with `places.mjs` — each unit's start and end marks against the original's, both documents read on
the original's columns page by page — and writes numbers only (`records/typeset-gate.json`).

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

- **Pages after a `\clearpage`** (Chinese 2608.09038, one page more where today has none): the main text ends about a
  third of a column late, at the floor of its leading with the take-back held to 5 %, and the references before a
  `\clearpage` spill onto a page of their own. A lead kept ahead only before such a point (`measured.local`) helped on
  six papers in the experiment, not tried on the gate. (Korean 2608.18090 and Russian 2608.06233 are level since the
  final keeps the preview's type.)
- **CJKutf8's widths**: the density model is xeCJK's; under the pdfLaTeX fallback, with the type no longer solved
  again from the measured density, Japanese 2608.06701 ends at 0.223 (0.040 solved again). Taking xeCJK's glue out of
  the model made it worse (fix round); a width model of CJKutf8's own.
- **Pages whose layout changes mid-page** (revtex's and aastex's grids) read in the most columns any of their marks
  or their shipout saw: a one-column stretch on a two-column page reads as two.
- **A short abstract set too tall** (Korean and Japanese 2608.15761): the window's leading, raised by shorter
  neighbours, set the 21-line abstract 8 % taller than the original's 23 lines and pushed the keywords off page 1.
  The front matter may want its own ratio rather than the window's.
- **The line model for small changes**: calibrate how lines change with a unit's width (the 1.4×–2× above) from
  the round's own data; the final's foresight of a face, a tracking change or a type re-solve would improve with it.
- **Parameters tuned before later fixes**: the eight-line threshold and the median of five were set before floats
  were held and before the restart at forced breaks; the window of 46 and the 5 % rate were picked from two or three
  values (a window of 50, the take-back's own length, was level on the fresh holdout and cost 2608.09038 a page);
  option A's three lines from one. Each is cheap to try again on the gate (`VARY`), the holdout judging.
- **Paragraphs holding a display**: display-heavy papers drift further (fresh 0.077 against 0.046 column, aside 0.194
  against 0.054, unseen Chinese 0.142 against 0.051). Measuring such units by their text (fix round) did not close it.
- **A segment's end held to the room its original left** (2608.15016, 2608.09038, 2608.09746; above): at a forced
  break or the document's end, the room the original left on that page as the tolerance, every translated unit of the
  late stretch acting, display units included, and floats kept from going early. Two cheaper pieces: a unit the flow
  does not measure takes the face the flow set where it stands (measured by the re-review on the gate's 24 CJK finals
  that set a face: 2608.09038 +1 → 0 pages, start 0.199 → 0.027; Japanese 2608.09746 +1 → 0, 0.244 → 0.164; the other
  22 unchanged in pages; mean start 0.086 → 0.076; but 2608.20847, display-heavy, past its record: Chinese end drift
  0.294 → 0.344, Korean 0.027 → 0.058, Japanese and Korean floats within 30 pt 5 → 3); and the face step's threshold set
  by that room rather than three lines (Korean and Japanese 2608.15016). A float sent a page late (German and Russian
  2608.15016) is a separate trigger.
- **The density predictor's worst cases**: CJK's maximum error 5.2–5.8 % against a 5 % gate.

## Where things are

- In the engine (branch `exp/flow-typesetting`): `src/pdf-reader/engine/pipeline/typeset/` — the rule as pure modules
  (`plan.mjs`, `type.mjs`, `flow.mjs`, `density.mjs`, `places.mjs`, `tex.mjs`); its cases in
  `tests/pdf-reader/typeset-*.test.ts` and `spikes/typeset-tex-cases.mjs`; the gate on the round and the holdouts in
  `spikes/typeset-gate.mjs`, its papers and each one's record in `typeset-gate.json`, the holdouts' translations made
  by `spikes/typeset-translate.mjs`; the engineers' notes in
  `../plans/2026-10-01-flow-typesetting-handoff.md`. The paths below are the experiment's, on the local branch
  `exp/geometry-lock`.
- Rules: `spikes/generic-type.mjs` (design table, type, flow, option A), `spikes/lock.mjs` (TeX of the unit
  macros, floats held, probes, readers), `spikes/density.mjs` (width and size probes, density),
  `spikes/alignment.mjs` (places), `src/pdf-reader/engine/source/latex-front.mjs` (unit leading, marks).
- Cases: `spikes/generic-type-cases.mjs` (flow, type, option A), `spikes/lock-cases.mjs` (TeX, in Docker),
  `spikes/alignment-cases.mjs`.
- Evaluation: `spikes/visual-eval.mjs` (a column per rule; `--flow=46 --floats --phys=8 --rate=5 --breaks
  --shrink=95` is the chosen one), the page in `../visual-eval/`, `spikes/round-metrics.mjs`,
  `spikes/inspect-places.mjs` (where a paper's units landed), `spikes/inspect-flow.mjs` (a final's flow replayed).
- Numbers: `round-34.json` — 34 papers (Chinese 5, German 5, Japanese 8, Korean 8, Russian 8) × the columns
  Today, FIT, Locked (H rules), Generic, Flow, first, Flow, Flow, even, Flow, even (A).
- Kept outside git (`../data/`, 144 MB after the 2026-10-01 clean-up of 12.9 GB): every paper's translation (a
  model's tokens to make again), each evaluated paper's index (its numbers and the owner's flagged pages), the round's
  `round.json`, service H's output PDFs, translation stores and request log (`runs/visual-eval-h/`), and `metafont/`
  (1.2 MB: the LH fonts' metrics TeX Live does not ship, which every Russian compile under pdfLaTeX needs; deleted by
  mistake in the clean-up and made again with `spikes/make-metafont.mjs`, which takes about a quarter of an hour).
  Compiles, PDFs and page images went: `visual-eval.mjs` makes them again from the translations, with no model call.
