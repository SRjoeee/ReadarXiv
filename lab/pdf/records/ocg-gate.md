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
- G2' (text and labels OFF against the remover's cut of the same ownership) is no longer measured: the remover, its only
  oracle, was deleted with REMOVAL 8 (feat/ocg-reader, docs/route/ocg-erasure.md §4.2), and the spike no longer runs it. The
  columns above are its last runs.
