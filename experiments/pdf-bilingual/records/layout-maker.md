# The layout maker on the researched papers (Plan 8b, Task 6, 2026-10-06)

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
| Placeholders found, math cite ref code | 278/278 | 166/166 | 2,487/2,522 (98.6 %) | 201/201 | ≥ 98 % |
| every kind | 312/313 | 171/171 | 3,338/3,471 | 208/208 | |
| the research's grouping (with eqref and url) | 280/280 | 167/167 | 3,056/3,097 | 202/202 | |
| research | 283/283 | 176/193 | 3,184/3,206 | 196/202 | |
| Displays found / EMPTY | 2/2, 0 | none | 260/341, 0 | 1/1, 0 | none EMPTY |
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
| TeX's line count equal | 72/72 | 54/55 | 181/184 | 80/80 | |
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
| 2307.16209v1 | 147 | 503.8 KB | 160.4 KB | 50.7 | 36.2 | 61.7 | 11.8 |
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

