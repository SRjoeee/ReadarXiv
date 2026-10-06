# The layout maker on the researched papers (Plan 8b, Task 6, 2026-10-06)

The layout file (spec §4.2) made by `src/pdf-reader/engine/layout/make.mjs` from each paper's layout compile and arXiv's
PDF, on the four papers the layout research measured (`readarxiv-research/2026-10-06-plan8/plan8-layout/report.md`,
prototype `exp/layout-data` at `cf75cba`). The tool is `../spikes/layout-make.mjs`; the papers' sources and PDFs, the
marks files and the layout files are under `data/layout/<id>/`, outside git. Since spec §11 (2026-10-06) the layout
marks have a compile of their own: the maker reads that compile's marks file and nothing of the readings compile.

## How it was run

- The layout compile: `originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES })`, latexmk in Docker's
  `texlive/texlive:latest` (`--network none`, 2 CPUs, 3 GB), as Task 5 measured; the marks file by `layoutMarksOf`.
- The four papers' sources and PDFs were copied from this machine (the shared corpus for 2307.16209 and 2608.04322, the
  web's local fixtures for 1512.03385 and 1706.03762); the tool's fetch from arXiv was not used.
- Marks of this branch's `marks.mjs` (Task 1 at `d082fc5e`), unless stated. A second run with Task 1's fix round
  (`150faa7b`) is at the end.

## The numbers, beside the research's

| | 1512.03385v1 | 1706.03762v7 | 2307.16209v1 | 2608.04322v1 | Bar |
|---|---|---|---|---|---|
| Lines carried | 1,146/1,146 (100 %) | 600/610 (98.4 %) | 8,420/8,457 (99.6 %) | 1,349/1,355 (99.6 %) | ≥ 97.5 % |
| research | 99.4 % | 97.5 % | 99.4 % | 99.3 % | |
| Placeholders found, math cite ref code | 278/278 | 164/166 (98.8 %) | 2,486/2,523 (98.5 %) | 201/201 | ≥ 98 % |
| the same with eqref and url (the research's grouping) | 280/280 | 165/167 | 3,055/3,098 | 202/202 | |
| research | 283/283 | 176/193 | 3,184/3,206 | 196/202 | |
| Cells located | 164/164 | | | 156/156 | ≥ 95 % |
| research | 164/164 | | | 145/156 | |
| Footnotes located | | 5/5 | 24/29 (82.8 %) | | ≥ 80 % |
| research | | 5/5 | 24/29 | | |
| Heading labels | 13/13 | 22/27 | 45/45 | 20/20 | 13, 22, 45, 20 |
| Caption labels | 19/19 | 9/9 | 32/32 | 10/16 | |
| research | 19/19 | 9/9 | 34/34 | 10/16 | |
| First baselines within 0.003 pt of TeX's start mark | 264/276 (95.7 %) | 157/161 (97.5 %) | 407/427 (95.3 %) | 276/284 (97.2 %) | ≥ 98 % **not met** |
| within 0.01 pt | 276/276 | 161/161 | 427/427 | 284/284 | |
| research, within 0.01 pt | 101/101 | 75/75 | 98 % of 380 | 108/108 | |
| Last baselines within 0.01 pt | 277/277 | 157/157 | 372/374 | 275/275 | |
| research | 0.99 | 0.93 | 0.84 | 0.91 | |
| Units located (of all) | 278/280 | 167/175 | 432/449 | 286/289 | |
| Split units | 20 | 5 | 79 | 11 | |
| research | 19 | 5 | 80 | 13 | |
| TeX's line count equal | 72/72 | 54/55 | 181/184 | 80/80 | |
| research | 72/73 | 58/59 | 185/189 | 80/81 | |
| Room below, p10 / median / p90, pt | 1.52 / 3.51 / 18.49 | 1.19 / 7.48 / 20.22 | 6.05 / 18.26 / 36.25 | 2.06 / 3.05 / 16.72 | |
| research | 1.71 / 3.49 / 18.58 | 1.32 / 7.48 / 20.22 | 4.83 / 18.26 / 36.28 | 2.09 / 3.17 / 16.31 | |

- **The one bar not met, first baselines within 0.003 pt, is the marks file's resolution, not the maker's.** Every miss
  is exactly 0.01 pt: the marks file holds TeX's places to a hundredth (`marks.mjs`, Task 1) and the line's baseline is
  the hundredth most of its glyphs share. pdfTeX's destinations stand about 0.003 pt off the glyphs' origins (the
  research's median, on marks it did not round), so after rounding about one line in twenty lands a hundredth away.
  At the file's own step every first and last baseline agrees but two of 2307's last ones. The bar is left as it is,
  for the maintainer: 0.01 pt is what a file of hundredths can show.
- **Placeholders are counted over the located units, each piece the marked original marks.** The research counted
  every piece its pattern took, of every unit: 1706's 14 e-mail addresses are in its author block, which carries no
  marks, so they are here neither marked nor lost (31 of 1706's placeholders get no mark by design, `unmarked`).
- **Lines** leave out the names of draft image frames (`g<n>a/b/t`: graphicx's draft prints the file name, which arXiv's
  PDF has not: 7, 7, 37 and 10 lines of the four papers), and a line opened by a footnote's raised number now holds the
  words after it (below).

## What the file costs

| | Pages | Raw | gzip | lines | erase | ph | the rest (gzip) |
|---|---|---|---|---|---|---|---|
| 1512.03385v1 | 12 | 103.2 KB | 32.3 KB | 11.2 | 10.9 | 6.2 | 4.0 |
| 1706.03762v7 | 15 | 49.1 KB | 16.5 KB | 6.1 | 5.0 | 3.2 | 2.4 |
| 2307.16209v1 | 147 | 575.4 KB | 181.6 KB | 67.7 | 41.3 | 60.3 | 7.5 |
| 2608.04322v1 | 13 | 132.5 KB | 40.5 KB | 12.3 | 19.6 | 3.8 | 3.5 |

- Against the spec's estimate (15–30 KB gzip for a 12–15-page paper, about 160 KB for the thesis): 1706 is inside it;
  1512 and 2608 are 8–35 % over, the thesis 13 %. The research's shape (lines without their own geometry, no erase) was
  7.5–12 KB and 79 KB.
- 2608's erase is the largest part: in IEEEtran's narrow justified columns the spaces between words often exceed half
  an em, the erase's merge distance (the brief's 0.5 of the size), so 152 of its 1,015 lines have 6 to 11 rectangles.
  A merge distance of an em would about halve that part; it is the brief's value, so it stays.
- All within the parser's bounds by far: the thesis is 14 % of `LAYOUT_CAP` and holds about 70,000 numbers.

## What it takes (this laptop; one vCPU taken as 2–4 × this)

| ms | text | ops | carry | anchor | rows | all |
|---|---|---|---|---|---|---|
| 1512.03385v1 | 133 | 116 | 18 | 39 | 69 | 383 |
| 1706.03762v7 | 162 | 150 | 9 | 16 | 35 | 375 |
| 2307.16209v1 | 571 | 602 | 87 | 101 | 215 | 1,598 |
| 2608.04322v1 | 150 | 192 | 14 | 32 | 70 | 463 |

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
- **Two of the anchor's rectangles of one line** (a script's token before its base's in the content stream) are one line.
- **Ends inferred:** a piece with an opening mark and no closing mark (a paper's macro, a display that ends in `\end`, a
  footnote's call under Task 1's fix round) runs to the first glyph of the text after it, back over the stops and
  brackets before that text's first word, glyph by glyph. 14 / 0 / 222 / 0 such placeholders found.
- **Ink not whole:** a page whose operator list is capped, does not come within `OPS_MS` = 10 s (or after the paper's
  `OPS_PAPER_MS` = 60 s), fails, or is rotated has no ink; a unit with a line there is not located, so nothing is erased
  in part. 2608.18626's page 8 (102,052 operations) takes 0.92 s here once PDF.js is warm; a page given up is cancelled
  in PDF.js's own way, and the next page answered 16 ms after a cancel at 300 ms.
- **Font names** are cleaned to 1–128 printable ASCII characters; **rectangles** below a hundredth grow to one; no
  erase entry is written empty.

## Task 1's fix round (150faa7b), measured

Its marking gives an opening mark alone to 18, 5, 29 and 7 more pieces of the four papers (footnote calls, paper macros,
one display) and no mark to 0, 0, 3 and 0 more. With its marks compiled and its marking read, every bar above but the
first baselines holds, unchanged: placeholders found 312/313, 169/171, 3,282/3,471 (all kinds), 207/208; ends inferred
32, 4, 240, 5; footnote calls 6/6, 1/1, 19/24. Where an end cannot be inferred (the piece after an unmarked one, a
display past a page) the placeholder is LOST and its unit is still located.
