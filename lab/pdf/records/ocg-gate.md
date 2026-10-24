# The per-unit erasure on the gate pack (feat/ocg-file, 2026-10-23)

Our final pass wrapped by optional content (`src/pdf-reader/engine/layout/wrap.mjs` `wrapFinal`, `docs/PDF-READER.md`
§19.9), measured by `../spikes/ocg-gate.mjs` on the gate pack's seven papers in Chinese (`fixtures/<id>-zh`: arXiv's PDF
and our final pass) and the heavy pair 2602.23285v2 (arXiv's PDF and our base of the delta spike; no source read, so no
spell check and no marking's text after a placeholder). Each paper's units are its source's (`openPaper` of its
`source.gz`). The engine as at `329d563e` (feat/ocg-file, after three rounds of adversarial review and the reader's pixel tier: a unit's text takes no rule, a unit opening with an unmarked macro is the original's); Node 22.23.1, pdfjs-dist 6.3.289 (the lite worker in Node, the modern
build in Chromium), Playwright's Chromium, macOS on an Apple M4 Pro. Counts only.

## How it was run

```
pnpm exec tsx lab/pdf/spikes/ocg-gate.mjs --pack=<pack>/fixtures --sources=<dir of <id>/source.gz> \
  --pair=2602.23285v2=<arxiv.pdf>,<base.pdf> --canvas=gpu|cpu \
  1512.03385v1 1706.03762v7 1810.04805v2 2307.16209v1 2608.04322v1 2608.16117v1 2609.26457v1 2602.23285v2
```

## The wrap (Node)

| Paper | Pages | Wrapped | Refused | marks | spell | Labels kept | Splits | Groups | Wrap ms | Base bytes, before → after | Delta, unwrapped → wrapped | Proof |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 1512.03385v1 | 12 | 12 | 0 | 5 | 0 | 2 | 23 | 483 | 369 | 765,460 → 884,692 | 216,663 → 272,995 | ok |
| 1706.03762v7 | 15 | 15 | 0 | 6 | 0 | 0 | 3 | 276 | 454 | 1,834,753 → 1,914,175 | 112,295 → 144,833 | ok |
| 1810.04805v2 | 16 | 16 | 0 | 14 | 0 | 3 | 17 | 452 | 276 | 711,045 → 834,509 | 98,817 → 151,615 | ok |
| 2307.16209v1 | 147 | 147 | 0 | 0 | 0 | 0 | 0 | 979 | 1,986 | 3,083,927 → 3,789,316 | 731,583 → 869,606 | ok |
| 2608.04322v1 | 13 | 13 | 0 | 2 | 1 | 0 | 5 | 450 | 443 | 1,489,185 → 1,610,145 | 167,244 → 215,027 | ok |
| 2608.16117v1 | 40 | 40 | 0 | 5 | 0 | 0 | 0 | 273 | 441 | 46,002,255 → 46,174,044 | 139,397 → 171,785 | ok |
| 2609.26457v1 | 28 | 28 | 0 | 6 | 0 | 4 | 6 | 230 | 499 | 778,565 → 935,395 | 221,649 → 246,937 | ok |
| 2602.23285v2 | 19 | 19 | 0 | 0 | 0 | 0 | 0 | 286 | 448 | 28,100,694 → 28,213,099 | 451,755 → 488,592 | ok |
| **All** | **290** | **290** | **0** | **38** | **1** | **9 (0 at `6eabd4bd`)** | **54** | | | | **2,139,403 → 2,561,390** | **8/8** |

- `across`, `page` and `bounds` were 0 on every paper. Of the 38 `marks`, 24 are the title block's authors and `\thanks` notes,
  which the marker does not mark (the engine lane's item), and 14 table cells that open with a macro the marker sets no mark
  for (1810.04805v2's model names, 1512.03385v1's `\#` columns: the record's `own.leaks`); the one `spell` is 2608.04322v1's journal header, which its
  title's range takes. No placeholder's range was lost on the pack.
- The deltas are 3.06 % of the originals' 83,666,965 bytes (2.56 % unwrapped). Optional content is matched by identity
  (review B2): 1706.03762v7's figures, whose forms name arXiv's layers, are copied either way.
- Memory (measured apart, the 46 MB pair, PDF.js's lite worker): the wrap adds about 165 MB at its peak to what the
  process holds; a page past WRAP_DECODED_PAGE or WRAP_HELD_PAGE is refused (a 2-million-operator plot: refused, heap peak 404
  MB, under a 768 MiB limit).
- Against today's geometric ownership (the design's measure, `pagePlan` over the layout file; measured before this
  spike, not by it): 1,732 of 1,806 units own the same glyphs (95.9 %; rules no longer counted in a unit's text). At
  `6eabd4bd` (a lead macro after a label split from it as `.p`, a babel name never over a placeholder's ink): 1,740 of 1,806
  (96.3 %), labels kept 0, `marks` 38 (the 14 cells unchanged), deltas 2,561,558 bytes; the Chromium tier not run again.

## Chromium

Every page of the eight, a fresh browser for each paper; a mismatch rendered again up to three times. The run at
`329d563e` was made on a loaded machine (load average 25 to 40).

| Canvas | G1 pages with px outside split glyphs and image edges | Px inside split glyphs | G2' pages | G2' pages with px outside image edges and split glyphs | Image-edge px, wrap / remover |
|---|---|---|---:|---|---|
| GPU | none | 0 | 247 | 2608.04322v1 p9: 1 px | 72 / 72 (1810.04805v2 4, 2602.23285v2 68) |
| CPU | 2609.26457v1 p2: 18 px | 0 | 247 | 2609.26457v1 p2: 27 px | 31 / 31 (2608.04322v1 24, 2602.23285v2 7) |

- The two pages are the ones Chromium renders differently from itself, seen in every earlier run: 2608.04322v1 p9 (GPU; our
  unwrapped page against itself up to 1,530 px between renders) and 2609.26457v1 p2 (CPU; a figure's text, Δ 7; 0 px from
  fresh documents). Run again on the same inputs (at `db827a2f`), each came and went. The runs on a quiet machine (at
  `c4027ed7`) showed none.

## The run at `2d0a3964` (the pixel tier's second round)

Counts as noted above (marks 38, spell 1, labels kept 0, groups 3,430, deltas 2,561,558 bytes, proof 8/8). Chromium, a fresh
browser for each paper, on a heavily loaded machine (load average 70 to 120):

| Canvas | G1 pages with px outside split glyphs and image edges | Px inside split glyphs | G2' pages | G2' pages with px outside | Image-edge px, wrap / remover |
|---|---|---|---:|---|---|
| GPU | none | 0 | 247 | none | 72 / 72 (1810.04805v2 4, 2602.23285v2 68) |
| CPU | 2609.26457v1 p2: 27 px (Chromium's own, as above) | 0 | 247 | none | 43 / 43 (1810.04805v2 18, 2608.04322v1 24, 2602.23285v2 1) |

- From REMOVAL 8 (feat/ocg-reader) on, G2' (text and labels OFF against the remover's cut of the same ownership) is no longer
  measured: the remover, its only oracle, is deleted there (docs/route/ocg-erasure.md §4.2), and the spike no longer runs it.
  The G2' columns of this record are its last runs, on the file side's branch.

## The run at `a7d0f6b5` (the coverage round: the sweep of 2026-10-24, REMOVAL 9)

The gate pack's eight papers (the scratch pack of LAYOUT 12, whose front matter has no marks: its authors' and notes' units
are the `marks` left, LAYOUT 17's marking absent there). Counts: `marks` 14 (was 18 on `next`), `spell` 1 (2608.04322v1's
title, which `986edb84` then trims to 0), `own.leaks` 0 (was 4: 1512.03385v1's `\#` cells now own their lead macro), labels
kept 7, proof 8/8, deltas 2,560,409 bytes. Chromium, GPU canvas, a fresh browser for each paper: G1 pages with px outside
split glyphs and image edges none, on every page of the eight.

On the sweep's papers (lab/pdf/data/unhidden-2026-10-24, our base's ownership read again with this tree; the heads' counts
before): 2610.19159v1 37 -> 2 (its page 3 wrapped: a soft mask's paths), 2610.20595v1 4 -> 1, 2610.20848v1 5 -> 4, 2610.21098v1
8 -> 4, 2610.20581v1 8 -> 6, 2610.20967v1 9 -> 0, 2610.21547v1 22 -> 21, 2610.22065v1 14 -> 14. What stays: the source
reader's (a wrapper macro's own words, `\nb{4}` setting "Notebook 4"; a Latin-1 source's accented letters dropped; both
branches of `\ifdefined` in a unit), foreign ink inside a range (elsarticle's e-mail note, a footnote's URL), the title
blocks' unmarked placeholders, and acmart's title, whose marks the ACM reference block sets a second time.

## The run at `497301cd` + the text-symbol lead (pack `8a74b1a2`, its base records carrying the marks' texts)

The re-packed gate pack (LAYOUT 18, the marks' `marking.texts` in each base.json), the eight papers. Counts: `marks` 4
(1810.04805v2 u67, u260, u261 and 2608.16117v1 u102: units with no mark at all), `spell` 3 (1706.03762v7's authors u3 and u5,
2608.04322v1's note u2), `own.leaks` 0, proof 8/8. Chromium, a fresh browser for each paper: G1 pages with px outside split
glyphs and image edges none on every page of the eight, on the GPU canvas and on the CPU canvas alike.

The layer gate's pixel tier on 8 outputs of the same pack (1512.03385v1-zh, -ja, 1706.03762v7-zh, 1810.04805v2-zh,
2307.16209v1-zh, 2608.04322v1-zh, 2608.16117v1-zh, 2609.26457v1-zh), next 695190d2's engine against this one's, one
instrument (this tree's): overlap regions 7 -> 7, stray text 5 -> 5, erase bites 3,929 -> 3,929, vanished math 161 -> 161,
doubled crops 0 -> 0, lost ink 33 -> 33, graphics erased 5 -> 5, glyphs lost 43 -> 43; residue 279 -> 287 (1512.03385v1 p7, zh
and ja, 4 each: the table's rules crossing the rectangles of the `\#` cells now drawn, the page's own ink, which stays); cells
left English 86 -> 62, cells translated 41.0 % -> 43.8 %, text units left English 39 -> 38. The run before the text-symbol
lead (a `\#` cell's "#" in `.p`, which the reader hides only for a found placeholder, so the original stood under the drawn
one) had overlap 7 -> 20 (1512.03385v1 p7, 1810.04805v2 p7): the lead of text symbols alone now goes with the text.
Crops of 1810.04805v2 p7 for the ruling (arXiv's own page, the old build, the new):
`~/Downloads/readarxiv-test/route-ocg-cover-evidence/1810.04805v2-zh-p7-arxiv-old-new.png`.

## The run at `abb30736` (the release sweep of 2026-10-24: LAYOUT 20, REMOVAL 10)

The release sweep's sixteen papers whose units the round reaches, in Chinese (arXiv's PDF and our final pass made offline by the
production page pass, `markedOfPaper` on TeX Live 2025 in Docker; each paper's source units and the marks' texts). Chromium, GPU
canvas: G1 pages with px outside split glyphs and image edges none on every page of the sixteen, proof ok on fifteen and the
sixteenth's delta past its bound (2610.21765v1: full, as on staging).

| Paper | Pages | Wrapped | Refused | marks | spell | Labels kept | Splits | Groups | Proof | G1 pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| 2610.10069v1 | 27 | 27 | 0 | 0 | 0 | 12 | 0 | 392 | ok | 0 |
| 2610.16663v1 | 67 | 67 | 0 | 0 | 1 | 34 | 3 | 620 | ok | 0 |
| 2610.20266v1 | 30 | 30 | 0 | 1 | 1 | 10 | 0 | 388 | ok | 0 |
| 2610.20285v1 | 36 | 36 | 0 | 4 | 0 | 10 | 0 | 561 | ok | 0 |
| 2610.20716v1 | 25 | 25 | 0 | 3 | 4 | 1 | 131 | 365 | ok | 0 |
| 2610.20848v1 | 12 | 12 | 0 | 2 | 0 | 18 | 3 | 215 | ok | 0 |
| 2610.21037v1 | 19 | 19 | 0 | 0 | 0 | 18 | 1 | 302 | ok | 0 |
| 2610.21085v1 | 35 | 35 | 0 | 15 | 0 | 5 | 4 | 654 | ok | 0 |
| 2610.21098v1 | 26 | 26 | 0 | 6 | 0 | 0 | 46 | 833 | ok | 0 |
| 2610.21176v1 | 18 | 18 | 0 | 1 | 0 | 6 | 0 | 335 | ok | 0 |
| 2610.21288v1 | 21 | 21 | 0 | 3 | 0 | 1 | 0 | 309 | ok | 0 |
| 2610.21376v1 | 23 | 23 | 0 | 4 | 3 | 9 | 36 | 610 | ok | 0 |
| 2610.21491v1 | 20 | 20 | 0 | 8 | 1 | 19 | 10 | 399 | ok | 0 |
| 2610.21765v1 | 14 | 14 | 0 | 3 | 0 | 2 | 0 | 342 | delta-bound | 0 |
| 2610.22065v1 | 7 | 7 | 0 | 13 | 0 | 1 | 1 | 181 | ok | 0 |
| 2610.22195v1 | 20 | 20 | 0 | 6 | 0 | 0 | 12 | 490 | ok | 0 |
| **All** | **400** | **400** | **0** | **69** | **10** | **146** | **247** | | | **0** |

Against `next` (c54a8702) on the 25 papers of the sweep's records, the units drawable (laid and hidden) 18 more and none fewer;
the layout files of five papers move in 8 rows, those units' placeholder and erase rows. The gate pack's papers own their ink as
on `next`, glyph for glyph: the layer gate's pixel tier on its 32 outputs is `next`'s on every total (next on `435d19bd`, this
tree on `13785c79`).

## The run at `3341ccdc` (the leads' texts as TeX sets them, a front heading marked: MARKS_SCHEMA 10)

The four papers of the release sweep whose groups the round moves, in Chinese, made as the run at `abb30736` was (offline,
`markedOfPaper` on TeX Live 2025 in Docker; each paper's source units and the marks' texts). Chromium, GPU canvas: G1 pages
with px outside split glyphs and image edges none on every page, proof ok on all four.

| Paper | Pages | Wrapped | Refused | marks | spell | Labels kept | Splits | Groups | Proof | G1 pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| 2610.21085v1 | 35 | 35 | 0 | 15 | 0 | 5 | 4 | 654 | ok | 0 |
| 2610.21098v1 | 26 | 26 | 0 | 2 | 0 | 0 | 46 | 835 | ok | 0 |
| 2610.21176v1 | 18 | 18 | 0 | 0 | 0 | 6 | 0 | 336 | ok | 0 |
| 2610.22195v1 | 20 | 20 | 0 | 3 | 0 | 0 | 14 | 491 | ok | 0 |
| **All** | **99** | **99** | **0** | **20** | **0** | **11** | **64** | | | **0** |

Against the run at `abb30736`: `marks` 6 -> 2 (2610.21098v1's four cells led by "1,024", "max_tokens" and "128,000"), 1 -> 0
(2610.21176v1's cell led by $d'$), 6 -> 3 (2610.22195v1's ICML title and its two cells led by `\texttt`); two shows more are
split in 2610.22195v1 (12 -> 14), where a new group's ink meets another's in one show. 2610.21085v1 is the same: its unit gained, led by
`\texttt{qwen3b}`, is a paragraph's, which the label rule owned before; its layout found the lead only now.
