# The layout maker on the researched papers (Plan 8b, Task 6, 2026-10-06)

**Historical record.** Measured from 2026-10-06 to 2026-10-19 (its last change, d203f823, LAYOUT 9), of the 0.5.2-era maker,
which carried each unit's lines to arXiv's PDF. Next's maker lays the units over our own compile (`docs/route/design.md`, the
decisions of 2026-10-22), and is held by the layer gates and the rules gate (`lab/pdf/README.md`); these bars are not its.

The layout file (spec §4.2) made by `src/pdf-reader/engine/layout/make.mjs` from each paper's layout compile and arXiv's
PDF, on the four papers the layout research measured (`readarxiv-research/2026-10-06-plan8/plan8-layout/report.md`,
prototype `exp/layout-data` at `cf75cba`). The tool is `../spikes/layout-make.mjs`; the papers' sources and PDFs, the
marks files and the layout files are under `data/layout/<id>/`, outside git. Since spec §11 (2026-10-06) the layout
marks have a compile of their own: the maker reads that compile's marks file and nothing of the readings compile.

## How it was run

- The layout compile: `originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, movesPunctuation })`, latexmk in
  Docker's `texlive/texlive:latest` (`--network none`, 2 CPUs, 3 GB), as Task 5 measured; the marks file by
  `layoutMarksOf`, which records the classes and the paper's own switch it was marked with (`marking`). The switch
  (`punctuationMovers`) is read from the paper's preamble, then from the compile's log, and the paper compiled again
  where the two differ; none of the four is switched.
- The four papers' sources and PDFs were copied from this machine (the shared corpus for 2307.16209 and 2608.04322, the
  web's local fixtures for 1512.03385 and 1706.03762); the tool's fetch from arXiv was not used.
- Marks of Task 1's fix round as Task 2 merged it (`exp/layer-t2-corpus` at `aac9bc22`), with Task 4's fix round
  (`67976a1e`). The first run's numbers (Task 1 at `d082fc5e`, before this task's fix round) are in "Fix round 1" below.

## The numbers, beside the research's

| | 1512.03385v1 | 1706.03762v7 | 2307.16209v1 | 2608.04322v1 | Bar |
|---|---|---|---|---|---|
| Lines carried | 1,146/1,146 (100 %) | 600/610 (98.4 %) | 8,420/8,457 (99.6 %) | 1,349/1,355 (99.6 %) | ≥ 97.5 % |
| research | 99.4 % | 97.5 % | 99.4 % | 99.3 % | |
| Placeholders found, math cite ref code | 278/278 | 166/166 | 2,488/2,522 (98.7 %) | 201/201 | ≥ 98 % |
| every kind | 312/313 | 171/171 | 3,345/3,471 | 208/208 | |
| EMPTY, any kind (a paper's macro alone may draw nothing) | 0 | 0 | 0 | 0 | none of a kind that sets ink |
| Running-text glyphs a placeholder took | 0 | 0 | 0 | 0 | 0 |
| Visible pieces of located units with no row | 0 of 360 | 0 of 202 | 0 of 3,481 | 0 of 242 | 0 |
| the research's grouping (with eqref and url) | 280/280 | 167/167 | 3,057/3,097 | 202/202 | |
| research | 283/283 | 176/193 | 3,184/3,206 | 196/202 | |
| Displays found / EMPTY | 2/2, 0 | none | 269/350, 0 | 1/1, 0 | none EMPTY |
| Cells located | 164/164 | | | 156/156 | ≥ 95 % |
| research | 164/164 | | | 145/156 | |
| Footnotes located | | 5/5 | 24/29 (82.8 %) | | ≥ 80 % |
| research | | 5/5 | 24/29 | | |
| Heading labels | 13/13 | 22/27 | 45/45 | 20/20 | 13, 22, 45, 20 |
| Caption labels | 19/19 | 9/9 | 32/32 | 10/16 | |
| research | 19/19 | 9/9 | 34/34 | 10/16 | |
| First baselines within 0.01 pt of TeX's start mark | 276/276 | 161/161 | 427/427 | 284/284 | ≥ 98 % |
| within 0.003 pt (the brief's) | 264/276 (95.7 %) | 157/161 (97.5 %) | 407/427 (95.3 %) | 276/284 (97.2 %) | |
| research, within 0.01 pt | 101/101 | 75/75 | 98 % of 380 | 108/108 | |
| Last baselines within 0.01 pt | 277/277 | 157/157 | 372/374 | 275/275 | |
| research | 0.99 | 0.93 | 0.84 | 0.91 | |
| Units located (of all) | 278/280 | 167/175 | 432/449 | 286/289 | |
| Split units | 20 | 5 | 79 | 11 | |
| research | 19 | 5 | 80 | 13 | |
| TeX's line count equal | 72/72 | 55/55 | 181/184 | 80/80 | |
| research | 72/73 | 58/59 | 185/189 | 80/81 | |
| Room below, p10 / median / p90, pt | 1.52 / 3.51 / 18.49 | 1.19 / 7.48 / 20.22 | 9.66 / 18.26 / 36.83 | 2.06 / 3.05 / 16.72 | |
| research | 1.71 / 3.49 / 18.58 | 1.32 / 7.48 / 20.22 | 4.83 / 18.26 / 36.28 | 2.09 / 3.17 / 16.31 | |

- **First baselines: the bar is 0.01 pt** (the controller's ruling of 2026-10-06). The brief's 0.003 pt cannot be
  shown by a file of hundredths: the marks file holds TeX's places to a hundredth (`marks.mjs`, Task 1), the line's
  baseline is the hundredth most of its glyphs share, and every miss at 0.003 is exactly 0.01. pdfTeX's destinations
  stand about 0.003 pt off the glyphs' origins (the research's median, on marks it did not round).
- **Displays are a bar since fix round 1: none EMPTY** (the layer draws nothing for an EMPTY display, so one with ink
  would be lost from the page). Those not found are LOST, and their unit stays the original's in the layer.
- **Placeholders are counted over the located units, each piece the marked original marks** (by the marks file's
  `marking`). The research counted every piece its pattern took, of every unit: 1706's 14 e-mail addresses are in its
  author block, which carries no marks, so they are here neither marked nor lost (31 of 1706's placeholders get no mark
  by design, `unmarked`).
- **Lines** leave out the names of draft image frames (`g<n>a/b/t`: graphicx's draft prints the file name, which arXiv's
  PDF has not: 7, 7, 37 and 10 lines of the four papers), and a line opened by a footnote's raised number now holds the
  words after it (below).

## What the file costs

| | Pages | Raw | gzip | lines | erase | ph | the rest (gzip) |
|---|---|---|---|---|---|---|---|
| 1512.03385v1 | 12 | 103.2 KB | 32.3 KB | 11.2 | 10.9 | 6.2 | 4.0 |
| 1706.03762v7 | 15 | 48.6 KB | 16.4 KB | 6.0 | 4.9 | 3.3 | 2.2 |
| 2307.16209v1 | 147 | 501.9 KB | 159.7 KB | 50.7 | 36.2 | 61.7 | 11.1 |
| 2608.04322v1 | 13 | 131.4 KB | 40.1 KB | 12.1 | 19.5 | 3.9 | 4.6 |

- Against the spec's estimate (15–30 KB gzip for a 12–15-page paper, about 160 KB for the thesis): 1706 and the thesis
  are inside it; 1512 and 2608 are 8–34 % over. The research's shape (lines without their own geometry, no erase) was
  7.5–12 KB and 79 KB.
- 2608's erase is the largest part: in IEEEtran's narrow justified columns the spaces between words often exceed half
  an em, the erase's merge distance (the brief's 0.5 of the size), so 152 of its 1,015 lines have 6 to 11 rectangles.
  A merge distance of an em would about halve that part; it is the brief's value, so it stays.
- All within the parser's bounds by far: the thesis is 12 % of `LAYOUT_CAP`.

## What it takes (this laptop; one vCPU taken as 2–4 × this)

| ms | text | ops | carry | anchor | rows | all |
|---|---|---|---|---|---|---|
| 1512.03385v1 | 96 | 110 | 18 | 38 | 70 | 340 |
| 1706.03762v7 | 136 | 140 | 8 | 15 | 35 | 338 |
| 2307.16209v1 | 511 | 598 | 83 | 99 | 220 | 1,535 |
| 2608.04322v1 | 157 | 198 | 15 | 33 | 70 | 478 |

`text` is PDF.js's text content of every page and its tokens, `ops` the operator lists and their glyphs (the research's
operator lists alone: 99–538 ms), `rows` everything after the anchors. On one vCPU a paper takes about 0.8–6.4 s.

## The carry: what changed in it, and why (carry.mjs)

Three of Task 5's review findings, and one cause these papers showed, changed `carrierOf` and `linesOf`:

1. **Words a page repeats** (2608.04322's one-symbol display lines matched the same symbol 8.3 pt away; 2608.08350's
   line of five words an identical one 575 pt away). A line whose words occur more than once on its page, in either
   PDF, is carried only to a partner within `NEAR` = 5 pt of where its neighbours put it (the offset of the nearest line
   before it and after it on its page carried to a unique partner; no offset where none is). Words that occur once on
   each side are carried at any distance, as before. The limit is from the data: of the 3,540 such carries on the four
   papers, none that the lines around it in reading order contradict lies within 12 pt of that place (3 lie within 20,
   in 2608), and raising the limit from 5 to 40 pt adds 2 carries they confirm (on a page of 2307 set otherwise). A plain
   distance from the line's own place
   would have cost 2307 6 % of its lines (its pages that TeX Live 2026 set lower, by 16–43 pt). Against Task 5's rule:
   1512 unchanged; 1706 one line no longer carried (a lone "dk" 126 pt away); 2608 the six symbol lines no longer
   carried; 2307 291 lines carried to another copy of their words (191 of the new partners confirmed by their reading
   order, 112 of the old), 7 no longer carried, 17 more carried.
2. **The work is bounded:** a marked page may cost `PAGE_WORK` = 2,000,000 and a paper `PAPER_WORK` = 20,000,000
   (words compared with a partner's, lines looked at, cells of the longest common run); a page past either carries none
   of its lines and is listed in `over`, which the maker takes as a page with no ink. The heaviest page of the four costs
   88,874, the heaviest paper (2307) 666,069. On crafted pages: 8,000 one-word lines alike, 2,034 → 240 ms; 60 lines of
   900 words with no word shared, 10,534 → 29 ms. Where a position is looked up, the lines near it are found by baseline
   (at most 64 looked at), no longer all of its page's.
3. **A line opened by a smaller token** (a footnote's number, raised) takes the next token within half of that one's
   height, and its baseline. In 2307 the raised number opened the line and the note's words fell apart into two lines
   that arXiv's PDF has as one; with it, 2307's notes reach 24/29 (23/29 without). 2307's lone scripts in displays are
   joined with their bases the same way, so its marked lines fall from 8,991 to 8,457 (1512: 1,158 to 1,146).

## What the maker does beyond the brief's text (each from a measured cause)

- **A unit whose own marks were set but not carried, or not on the same words there, is not located** (1, 5, 10 and 1
  units). arXiv's text alone would place it (anchorUnits searches by text), sometimes on the wrong page: one of 2307's
  units was placed on page 14 with its marks on page 108. Spec §11: a reflowed line costs its unit, never a wrong place.
- **A footnote's number glued to its first word in one PDF and apart in the other** passes the anchors' word check
  (`sameWord`): on arXiv's 2307 the number is set on the line and the text layer reads "1historically"; 24 of its 29
  notes were refused on it before.
- **A mark past its line's last word in the marks file**, which the carrier does not place, goes by its partner's offset
  where the partner's line moved whole (`besideOf`): IEEEtran's small-capital section headings (the file keeps no box of
  a word's rest), a closing mark after a formula of no letters.
- **A placeholder's ink is the page's glyphs between its marks on its line**, not only those of the line's words: an
  arrow set a space after "ASR" in 2608's table heads was the line's last ink and lay outside the words' extent. Found,
  it is the line's too, so the line's extent and its erase take it in (2608: 168/201 placeholders found before, 201/201
  after).
- **A radical's sign**, whose origin TeX raises to its bar (7.7 pt above the line in 1706, past the window of scripts),
  is the formula's where it meets a rule taken with it.
- **The anchor's rectangles of one line** (a script's token before its base's in the content stream, the line's two parts
  either side of a formula) are one line (fix round 1).
- **Ends inferred:** a piece with an opening mark and no closing mark (a paper's macro, a display that ends in `\end`, a
  footnote's call under Task 1's fix round) runs to the first glyph of the text after it, back over the stops and
  brackets before that text's first word, glyph by glyph. 32 / 4 / 283 / 6 such placeholders found. A display that
  ends its unit runs down to the next line of its column (fix round 1).
- **Ink not whole:** a page whose operator list is capped, does not come within `OPS_MS` = 10 s (or after the paper's
  `OPS_PAPER_MS` = 60 s), fails, or is rotated has no ink; a unit with a line there is not located, so nothing is erased
  in part. 2608.18626's page 8 (102,052 operations) takes 0.92 s here once PDF.js is warm; a page given up is cancelled
  in PDF.js's own way, and the next page answered 16 ms after a cancel at 300 ms.
- **Font names** are cleaned to 1–128 printable ASCII characters; **rectangles** below a hundredth grow to one; no
  erase entry is written empty.

## Task 1's fix round, now merged

Its marking gives an opening mark alone to 18, 5, 29 and 7 more pieces of the four papers (footnote calls, paper macros,
one display) and no mark to 0, 0, 3 and 0 more. The table above is made with it: every bar holds. Where an end cannot be
inferred (the piece after an unmarked one, a display past a page) the placeholder is LOST and its unit is still
located. 2307's footnote calls are found 19/24 with it (23/27 before it).

## Fix round 1 (the review of 2026-10-06)

| | before | after |
|---|---|---|
| 1706 placeholders found, math cite ref code | 164/166 | 166/166 |
| 1706, every kind | 169/171, 2 EMPTY | 171/171 |
| 2307, every kind | 3,297/3,473, 58 EMPTY | 3,338/3,471, 6 EMPTY |
| 2307 displays found / EMPTY / LOST | 218/342, 50, 74 | 260/341, 0, 81 |
| 2608's display | EMPTY | found |
| 2307 lines in the file | 5,294 | 3,916 |
| 2307 gzip | 181.6 KB | 160.4 KB |
| Captions CENTRED | 2 (2608, no label) | 5 (+ 1512's 2, 1706's 1, centred with their labels); 2608's 6 numbered section headings too |
| 64,000 lines of repeated words, carried | 9.5 s | 0.17 s |

- **One line on one baseline.** The anchor's rectangles of one visual line — one page, one column, one baseline, or the
  smaller a script of the other — are one line wherever the second begins. 1706's note (unit 34) had two on one
  baseline past a gap, and its first placeholder's ink ran 106 pt past its closing mark, the two after it EMPTY; 2307 had
  such lines in 28 units. A placeholder's run to its line's end, or from its start, also stops an em past the line.
  2307's 1,378 fewer lines are the rows the display fragments of its units were set as, one a baseline now.
- **A display that ends its unit** (the unit's end mark where the display's opening mark is) runs down to the next line
  of its column, another located unit's or the next unit's start mark; with neither, it is LOST, never EMPTY (2307: 7).
- **A caption centred whole with its label** counts its label's ink when its lines are measured against its column.
- **The carry:** each line's nearest unique neighbours are found in two passes, each line's look charged to the work;
  words twice on arXiv's own page are not unique there, whatever the next page holds (2307: one line, "r r"); the fuzzy
  step leaves lines of the same words to the first step. No change on the four papers' carried lines.
- **The marks file records its `marking`** (the classes and the paper's switch), and the maker reads which pieces have
  marks from it: on a switched paper a citation without marks by design is counted `unmarked`, not `marked` and LOST.
- **Bounds:** the private PDF.js cancel is read on the pinned PDF.js by a test, and checked at run time (missing: one
  warning a paper, the bounds still hold); a unit whose faces would pass 512 names stays the original's.

## Fix round 2 (the re-review of 2026-10-06)

| 2307.16209v1 | before | after |
|---|---|---|
| Placeholders, every kind | 3,338/3,471, 6 EMPTY | 3,345/3,471, 0 EMPTY |
| Displays found | 260/341 | 269/350 (`subequations` now displays) |
| The re-review's nine (3 `subequations`, `$qQ$`, a cite, `$\ell$`, `$\Psi_0$`, `$\Psi_2^A$`, `$\ell,m,n$`) | 6 EMPTY, 3 without their base glyph | 7 found whole, 2 LOST (their marks past the line's end) |
| Running-text glyphs a placeholder took | 101: units 90 and 151, a text line each (the re-review's count) | 0 |
| A footnote's rule as a display's segment | 1 (unit 200) | 0 |

- **`subequations` is a display** (`DISPLAY`, Task 1's marks): a corpus grep of the environments that open a
  placeholder finds it the only display environment `DISPLAY` lacked (7 pieces in 3 papers; 2307's 9 more). Task 2's
  gate on those three papers (2608.30886, 2608.12255, 2608.02015): 3 clean, 11,422 lines, none lost, no unit mark moved,
  readings and files the same; their marked files are byte for byte the committed run's, so the gate took them from its
  cache.
- **The glyphs at a mark, from the data:** of 3,766 opening marks 18 lie more than 0.1 pt inside a glyph — 4 inside the
  placeholder's own first glyph by 0.12–0.36 pt, 14 inside the glyph before it, 2.35 pt from its start or more; of 3,707
  closing marks 51 — 43 inside the placeholder's last glyph, its middle before the mark, 8 inside the punctuation after,
  its middle past it (the four papers; "inside" is more than 0.1 pt from either edge). So a placeholder's glyph begins no more than 0.4 pt (`MARK_SLACK`) before its opening mark and has
  its middle before its closing mark.
- **EMPTY only where a piece draws nothing:** its marks on one line, the line's ink either side, and no glyph of any unit's
  between; else LOST. A display with no ink of its own is LOST.
- **A middle row** (in the unit's order between a placeholder's two lines) is its ink only where it lies between those
  lines on the page; and each glyph belongs to the unit's line whose baseline is nearest it (a big operator's row above a
  text line takes none of the line's: 2307's unit 439, piece 9, took its text line while this round's count was built). The rows of one
  line are merged until none is left (12 units had a script row apart).
- **Every visible piece of a located unit has its row,** a piece of a class the marked original did not mark included
  (LOST): no row is a piece that draws nothing, as the layer reads the file.
- **A row of graphics alone wider than the display's glyphs** (a footnote's rule) is not the display's; `belowOf` reads
  the rows of a page and column once, sorted, and finds the next line below by a binary search.
- The machine's load stood near 120 during this round's runs: the times of this table's runs are not comparable, and
  the table of times above is fix round 1's.


## Task 6b: each placeholder by its own ink, in content-stream order

The window-and-ownership geometry gave way to each piece's own ink: a point (`/axt-<name> ri`) beside each destination,
points around each column's body and each float's box (`marks.mjs` POINTS_TEX), the glyphs and rules between a piece's
points in the marked compile's content stream (`stream.mjs`), kept in the marks file (schema 2), and each carried and
matched glyph by glyph on arXiv's page (`match.mjs`). Found is every owned glyph and rule matched, EMPTY nothing between
the points, else LOST. Run: `layout-make.mjs` on the four papers, compiled as the corpus check compiles (the paper's own
switch from the mark probe, the date pinned), TeX Live 2026 in Docker, one compile at a time.

| | 1512.03385v1 | 1706.03762v7 | 2307.16209v1 | 2608.04322v1 |
|---|---|---|---|---|
| Visible pieces of located units | 360 | 202 | 3,481 | 242 |
| Found, fix round 2 → stream | 312 → 312 | 171 → 171 | 3,345 → **3,382** | 208 → 208 |
| EMPTY, fix round 2 → stream | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| LOST of the marked, fix round 2 → stream | 1 → 1 | 0 → 0 | 126 → **91** | 0 → 0 |
| Unmarked (no opening mark by the marking) | 47 → 47 | 31 → 31 | 10 → 8 (Task 2's fix round marks more calls) | 34 → 34 |
| Pieces LOST → found, found → LOST | 0, 0 | 0, 0 | **41**, 4 | 0, 0 |
| Fix round 2 found, lacking own glyphs: the spike's count (its debug hook); by segment rectangles | 0; 0 | 3; 2 (31.8 `√`, 33.3 `k`) | 24; 16 (151.39 `Í`, 162.13 `(i)`, 210.43 `]`, `(∞)` ×3, …) | 1; 1 (39.3 `=`) |
| Fix round 2 found, taking glyphs not its own: the spike's; by rectangles | 3; 3 (`,` `,` `)`) | 1; 1 (`.`) | 8; 8 (`,` ×3, `.`, `-sion`, …) | 1; 1 (`,`) |
| **Owned glyphs and rules of found pieces not matched** | 0 of 1,143 | 0 of 762 | 0 of 35,661 | 0 of 793 |
| **arXiv glyphs matched by two found pieces** | 0 | 0 | 0 | 0 |
| EMPTY with ink; running-text glyphs taken; visible pieces with no row | 0; 0; 0 | 0; 0; 0 | 0; 0; 0 | 0; 0; 0 |
| Matched by the same character; another Unicode at its place; a vote | 1,143; 0; 0 | 758; 1; 0 | 34,111; 324; 524 | 793; 0; 0 |
| Page texts written; equal to arXiv's glyphs inside the segments; a run of its text layer's characters | 207; 207; 207 | 78; 78; 78 | 996; 996; 996 | 101; 101; 101 |
| Marks file, bytes, fix round 2 → stream | 348,561 → 380,435 | 224,201 → 247,474 | 2,104,705 → 3,125,666 | 407,089 → 429,107 |
| Layout file raw / gzip, fix round 2 → stream | 103,203 / 32,582 → 106,142 / 33,212 | 48,561 / 16,522 → 49,686 / 16,758 | 501,887 / 160,345 → 517,831 / 164,030 | 131,355 / 40,448 → 132,851 / 40,678 |
| Maker, ms: whole (rows stage, the matching in it) | 331 (88) | 338 (45) | 1,648 (380) | 406 (72) |
| layoutMarksOf, ms (the operator lists and the ownership with it); the layout compile, ms | 408; 3,303 | 114; 1,772 | 805; 15,428 | 125; 3,568 |

Fix round 2's columns are its layout files (`9cb65b8c`, the data's `layout.json` of 12:47–12:50) and, for the spike's
counts, `stream-owner-report.md`, which measured them with a debug hook; the rectangle counts take arXiv's glyphs inside
each file's segments, for pieces found in both. The times are the last run's, at a load of 3 to 8; the matcher's work
on 2307 is 2.3 million glyph visits of its 50 million bound.

- **The named cases, all found whole:** 1706.03762 34.9 (`q·k=Σ…`, arXiv's `P`), 33.3 (`1/√d_k`), 31.8 (`√d_k`);
  2307.16209 151.39, 162.13, 240.46, 245.21, 248.17, 319.7, 429.18 (`(3.83)`), 210.43 (`[52]`), 210.33 and 379.33 (set
  on the next line on arXiv's page, found by the next-line start); 2608.04322 39.3 (with its `=`). Each a row of the spike.
- **2307's 4 found → LOST**, each a display: 64.7 and 248.15 open at a page's foot, their next mark on the next page (the
  ruling: their end is not inferred); 114.39 and 114.43, a `cases` brace arXiv's older TeX builds of other pieces at
  other heights (the spike's "partial").
- **2307's LOST, by reason (91):** an open display whose next mark is on another page 32; a display an unmarked display
  follows 14, and the 19 after them that TeX set no point for (the empty paragraph between two displays); glyphs on
  lines the carrier does not place 21 (units 106, 114, 121, 132, 240, 336) and the two `cases` braces; 88.39, opening on
  a line where the unit has no row; 132.35 and 214.59, the text after them not found. These are the spike's limits.
- **Rigid:** every found piece of 1512, 1706 and 2608 moved to arXiv's page at one offset (within 5.1 pt across, 0.6 pt
  up). On 2307 seven displays are 0.61–0.67 pt up, and two move otherwise, both real layout differences: 240.50's rows
  each rigid, its parts (3.103c) and (3.103d) 8 pt further apart on arXiv's page (the glue between them); 111.21's rows
  rigid, its number 11 pt higher on arXiv's page (an older amsmath centring the tag on its `aligned`), matched by its own
  line's carry.
- **Layout identity** (`layout-marks-cases.mjs`, the stream spike's four documents with their points and without them):
  pdfLaTeX every glyph and box within 1.1e-13 pt, every destination the same, the marks file the same to its hundredths
  but for the new fields; XeLaTeX the same but for case A's margin note's first word, 0.0013 pt, xdvipdfmx's own (TeX's
  boxes the same by `\tracingoutput`); LuaLaTeX 0.0097 pt on 38 glyphs (the ruling). The full native suite, 211
  documents with the traced ones, 214 checks: all ok.
- **Found on the way and fixed**, each with its row: MARK_DEF sets a unit's end mark before a display that ends it (such
  a display runs to the next unit's start mark, that unit's label left out, or to its column's end before a footnote's
  mark); TeX Live 2026's cmex sets a variation selector after a big operator (`∑` U+FE01), which arXiv's PDFs lack; a `fi`
  ligature running past the eight characters a text search looks for; arXiv's big left parenthesis of a blank Unicode
  (`ink.mjs` keeps every painted glyph).
- **The brackets, found by TeX's own boxes** (the corpus check's trace, on papers run before the corpus run; no glyph had
  moved in any): LaTeX 2026's `\@outputbox@removebskip` reads the column body's last glue (2608.24503's last page); a
  point at a float's top gave its first paragraph a `\parskip` (2608.01890: the float's points now wrap its finished
  box); the body's opening point, a whatsit before its first glue, made that glue a place to break, and balance.sty's
  `\vsplit` took an empty first column on 2608.06007's last page (acmart), the columns 15 pt taller. The opening point
  now has a `\penalty10000` after it, and the closing one goes after the body's last box, the glue, kerns and penalties
  after it taken off and put back: no place to break made or lost (pdfTeX's `\vsplit` of a 400 pt box to 200 pt leaves
  50 pt without the point and with point and penalty, 460 pt with the point alone). The trace takes the penalty as the
  point's, and forgives a glue's name lost in the run the closing point put back, there alone (the footnotes may follow
  that run: 2608.12333).
- **The corpus check** (`layout-marks-gate.mjs`, the 113 papers, one compile at a time, against Task 2's record of 106
  clean, 5 accepted, 2 switched, 0 failing). A first run stopped at 2608.06007 (the balance.sty finding above). The
  second ran whole: 103, 5, 2 and 3 failing — 2608.12333, a footnote after the run a closing point put back (the trace's
  fault, now forgiven there alone); 2608.28697, a piece whose ink lies off its page written with a how the table did not
  hold, so the marks file's parser refused it (`OWNED_HOW` now has it); and 2608.18090, below. The final run, after both
  fixes: **105 clean, 5 accepted, 2 switched, 1 failing** (2608.18090), none passed over; the accepted and switched
  papers Task 2's own, and every count of lost lines and moved items Task 2's but for 2608.18090's one line and nine
  items (lost strict 6, joined 4, by TeX 7; moved 22 and 7). 62,854 of the 63,797 pieces with an opening point own
  their ink; the marks files 58.5 MB in all; 86 minutes, compiles median 19 s.
- **2608.18090, a line pdfTeX packs by where its nodes sit in memory.** The third line of unit 12 on page 2 (`state at
  residual block 20 … of`) has the same nodes in v0 and v1 but for the marks' own, and the same line breaks
  (`\tracingparagraphs`: that line's badness 0 in both); v1 packs it with a glue set of 0.74948, v0 with none, and its
  words move by up to 19.3 pt. The paper loads microtype, protrusion and expansion at level 2: with either off, the two
  are the same. With both on, a box register holding five empty `\pdfliteral`s, set before the body and never shipped,
  gives v0's line a glue set of −0.01106, and one to five of them give v1's line v0's setting; five zero kerns change
  nothing. So the packing reads the layout of TeX's node memory, which any node the marks add moves; it needs the
  citations resolved and the body before it, and both kinds of points (with either kind off, it is gone). Not the
  points' doing, and not to be fixed in them: left failing for a ruling.

## The tolerant match (PR-D2, 2026-10-19): a unit mark no line carries, a text piece broken in one PDF alone

**Causes** (2609.26457, the pack's paper whose units the maker left out):
- Unit 28: its end mark is carried nowhere. Our last line reads "tasks (see section B)." and arXiv's "tasks (see appendix
  B).": `\cref{app:fml}` is named "section" by our compile and "appendix" by arXiv's. The carry moves a position with its
  line's words, the same words or a common run of 80 % of them, here two of four: the mark carries to null, the unit is not
  located, the layer reads it by v0's text and leaves it English (unproven).
- Unit 71: the same naming in the middle of the paragraph ("section C" for "appendix C"). The longer word makes TeX break
  the paragraph otherwise from its ninth line on, 13 lines in ours and 14 on arXiv's page, and our last line ("dataset. ...
  to evaluate solutions.") matches no line of arXiv's ("... GPUs to" / "evaluate solutions."): its end mark carries to null.
- Unit 24, piece 35 (`\texttt{gemini 3 flash}`): LOST, its glyphs not all matched. Our compile breaks it after "gemini",
  arXiv's sets it whole at the start of the next line; no carry puts the glyphs of either part where arXiv's stand. (The
  layer drew the unit already, by the run of its characters: PR #405; that rule stays as the backstop.)

**The rule.**
- (A) A unit's own mark that no line carries (`tolerantOf`; never one that a line carries, which never moves) is placed by
  the unit's own words beside it, where its other mark was carried, both on one page of ours. The last eight words before an
  end mark (the first eight after a start mark), four at least, as our compile sets them, are found among arXiv's words in
  order, the line breaks aside, on the page the other mark is carried to: from that mark on, up to the first start of
  another unit carried there (the last end before it, for a start mark). Each word compares by its text; one at most may
  differ, only where ours stands inside a reference's or a citation's own rendering (between the piece's two marks) and
  both words are reference words (`rules/reference-words.mjs`, the one table the link-anchor locator reads too); the mark's
  own word never differs, and where it ends its line in ours (begins it) arXiv's must end (begin) its own. The words must
  stand in one place alone: two places, and the mark stays carried to nowhere. Unit 71: its last eight words ("and
  KernelBench use NVIDIA A100 GPUs to evaluate solutions.") stand on two of arXiv's lines, in order, once, and "solutions."
  ends its line in both; had another run of the same eight words stood in the span, the mark would not be placed. arXiv's
  words are those inside the page frame (`frameOfTokens`): a running head that repeats a heading's words is no place
  (2307.16209's headings 262 and 438, whose start marks have no unit's end before them on their page).
- Where the mark then stands: beside arXiv's token as ours stands beside our own, at our compile's offset from it (as
  `besideOf` carries a mark by its partner's). A word the text layer gives in parts (its text-less tokens, as `sameWord`
  reads them: a hyphen at the line's end, a change of font inside the word, a subscript after its letter) is read by its
  parts. Where ours ends the word before an end mark (every part after the mark's own token set on the mark's line before
  it: 1706.03762's T_0, whose subscript is the rest of "t0", 1.8 pt below), the mark stands after the last part of arXiv's
  word, in as many parts or not (a word hyphenated in one PDF alone). Where ours' word runs on past the mark (its rest the
  next unit's: unit 0's "3-" and unit 1's "I" read as one word), it stands after the same part of arXiv's word, which must
  be in as many parts; a start mark whose unit begins with the rest of the word before (2005.14165's poems, whose "I" is
  the rest of the cell before's "3") stands before the same part, in as many parts. A word split otherwise around the mark
  is no place: as first written (174da293), a word of four parts in ours and five in arXiv's put the next unit's start at
  arXiv's "c", four letters early, and left the unit before without its last line. An offset past an em is a formula no token holds: 2608.20051's unit 250
  ends 77.5 pt past "for", 2307.16209's footnote 203 80.5 pt past "g". It stands only where arXiv's ink runs on the line
  from the token to the mark with no gap past an em and none on past it within an em; and no mark stands on the other side
  of the bound's own token on its line (a part past the bound would be another unit's start, which the same text excludes),
  nor outside the page's view. Placed at the word's box alone (the rule as first
  written), those two marks left the paragraph's final period out of the line and of the erase (177.5 pt against an erase
  ending at 177.52; 332.8 against 331.89), and 2203.02155's units 144 and 561 their last characters ("s)." and "l.").
- (B) A text piece (`rules/text-piece.mjs`, the layer's rule of #405, now shared) that the matcher refuses is found by its
  own characters: one run of arXiv's glyphs on the unit's lines, in each line's x order, crossing one line break at most,
  each glyph the unit's or no unit's and no piece's, after the glyphs of the unit's pieces found before it. One run alone:
  none or two leave it LOST. Its glyphs are arXiv's; nothing is drawn that is not there.
- What it never tolerates: a second place, a place past the next unit's start (before the last end), two words apart, a
  word apart that is not a reference's name or not in the table ("annex"), a mark's own word apart, marks on two pages of
  ours, a running head's or foot's words, a formula's offset where arXiv's ink does not run there, a glyph another unit or
  piece holds. LAYOUT 9 (the maker writes other files), the schema 5 still.
- Its cost: the bounds are looked for among the unit marks of the mark's page of ours and the one before, indexed by page
  at the first try (`tolerantWork` counts the marks so read) and added to as the marked original's pages are read, made
  anew with the marks (a maker's `whole()` then `byStream()`); each mark's line carry read once. 2307.16209 (8,046 marks): 32,184 marks walked for its six tries before (every mark at each
  of the four that reach the bounds), 56 now; the 34 papers' 49 tries 1,637. 2503.06072 tries none, before and now.

**Counts** (next 94309439 against this branch, the same marked compiles on the pinned image: the pack's seven papers, the
colour corpus's sixteen with 2610.19159, and thirteen more of the drift study's 25; 36 sources, 34 made, 2608.08481 refused by the
carry and 2608.12255 by its compile on both sides):
- 49 unit marks looked for, 12 placed; 11 units freed (2609.26457 28 and 71; 2201.11903 43 and 555; 2203.02155 144, 262, 561
  and 932; 2307.16209 203; 2608.03994 70; 2608.20051 250); 4 placeholders freed by their characters (2609.26457 24.35,
  2302.13971 198.2, 198.4 and 198.6). No unit lost, no placeholder found before lost.
- Every other row of the 34 files the same but two: 2608.20051's fonts table in another order (the freed unit's font comes
  first), its six units' lines the same by font name; and 2201.11903's caption 40, whose label ("Figure 4:") took the other
  column's line on its baseline while unit 43 held it not (x0 108, 235 pt wide), and now takes its own glyphs alone.
- The freed units' regions on arXiv's page against their source words (by characters, the anchor's tokens): 12 of 13 every
  character in order and nothing past their ends; the thirteenth, 2307.16209's footnote 203, begins with the number arXiv
  glues to its first word ("8For"), which the check's tokens drop: read on the page, its line is the note's, "For a general
  function f and g, {f,g} = ...". By arXiv's glyphs, every one of the 13 regions' last lines ends with the source's last
  character inside it and no glyph of the line within an em past it (the final period of 2608.20051's unit 250 and of
  2307.16209's note 203 among them).
- The rules gate (model tier, the pack of 32 outputs, these layout files in it): passed; zh text units left English 16 to
  14, placeholders the content measure cannot place 0.023 to 0.019, no measure worse; three pages moved (2609.26457 4 and 5,
  2307.16209 60); completeness and ink whole on all 32.
- The matcher's work on the pack's seven papers 1.4 % more, all of it the freed units' own pieces (2609.26457 +56,056,
  2307.16209 +556); the five others the same. The words are looked for 8 times on the pack (2307.16209 6, 2609.26457 2).
- The prepare (`lab/pdf/spikes/speed.mjs`'s child runs, next 94309439 against this branch in one configuration, next's
  rules with the marked original read whole and no draw, five runs a paper and the engines interleaved, a quiet machine):
  1706.03762 1,755 and 1,752 ms, 2609.26457 1,850 and 1,851, 2307.16209 4,990 (4,959 to 5,133) and 5,066 (4,891 to
  5,335): within next's spread on each.
