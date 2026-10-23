# The per-unit erasure on the gate pack (feat/ocg-file, 2026-10-23)

Our final pass wrapped by optional content (`src/pdf-reader/engine/layout/wrap.mjs` `wrapFinal`, `docs/PDF-READER.md`
§19.9), measured by `../spikes/ocg-gate.mjs` on the gate pack's seven papers in Chinese (`fixtures/<id>-zh`: arXiv's PDF
and our final pass) and the heavy pair 2602.23285v2 (arXiv's PDF and our base of the delta spike; no source read, so no
spell check and no marking's text after a placeholder). Each paper's units are its source's (`openPaper` of its
`source.gz`). The engine as at `85fdc442` (feat/ocg-file); Node 22.23.1, pdfjs-dist 6.3.289 (the lite worker in Node, the modern
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
| 1512.03385v1 | 12 | 12 | 0 | 1 | 0 | 8 | 23 | 483 | 369 | 765,460 → 884,723 | 216,663 → 273,026 | ok |
| 1706.03762v7 | 15 | 15 | 0 | 6 | 0 | 0 | 3 | 277 | 420 | 1,834,753 → 1,914,287 | 50,930 → 83,593 | ok |
| 1810.04805v2 | 16 | 16 | 0 | 4 | 0 | 16 | 17 | 452 | 316 | 711,045 → 834,519 | 98,817 → 151,625 | ok |
| 2307.16209v1 | 147 | 147 | 0 | 0 | 0 | 0 | 0 | 981 | 1,883 | 3,083,927 → 3,789,533 | 731,583 → 869,841 | ok |
| 2608.04322v1 | 13 | 13 | 0 | 2 | 1 | 0 | 5 | 450 | 452 | 1,489,185 → 1,610,145 | 167,244 → 215,027 | ok |
| 2608.16117v1 | 40 | 40 | 0 | 5 | 0 | 0 | 0 | 273 | 370 | 46,002,255 → 46,174,044 | 139,397 → 171,785 | ok |
| 2609.26457v1 | 28 | 28 | 0 | 6 | 0 | 4 | 6 | 230 | 406 | 778,565 → 935,395 | 221,649 → 246,937 | ok |
| 2602.23285v2 | 19 | 19 | 0 | 0 | 0 | 4 | 0 | 286 | 434 | 28,100,694 → 28,213,114 | 451,755 → 488,607 | ok |
| **All** | **290** | **290** | **0** | **24** | **1** | **32** | **54** | | | | **2,078,038 → 2,500,441** | **8/8** |

- `across`, `page` and `bounds` were 0 on every paper. The 24 `marks` are the title block's authors and `\thanks` notes,
  which the marker does not mark (the engine lane's item); the one `spell` is 2608.04322v1's journal header, which its
  title's range takes.
- The deltas are 2.99 % of the originals' 83,666,965 bytes (2.48 % unwrapped).
- Memory (measured apart, the 46 MB pair): the wrap adds about 165 MB at its peak to what the process holds.
- Against today's geometric ownership (the design's measure, `pagePlan` over the layout file; measured before this
  spike, not by it): 1,729 of 1,806 units own the same glyphs (95.7 %).

## Chromium

Every page of the eight; a mismatch rendered again up to three times.

| Canvas | G1 pages with px outside split glyphs and image edges | Px inside split glyphs | G2' pages | G2' pages with px outside image edges and split glyphs | Image-edge px, wrap / remover |
|---|---|---|---:|---|---|
| GPU | none | 0 | 247 | none | 72 / 72 (1810.04805v2 4, 2602.23285v2 68) |
| CPU | none | 0 | 247 | 2609.26457v1 p2: 27 px | 31 / 31 (2608.04322v1 24, 2602.23285v2 7) |

- 2609.26457v1 p2 on the CPU canvas: the difference lies in a figure's text, max channel Δ 7, and is Chromium's: the same
  page compared from fresh documents is 0 px, and our unwrapped page rendered several times in one document differs from
  itself there. An earlier run of the same gate in one long-lived browser also saw 2608.04322v1 p9 on the GPU canvas
  (our unwrapped page against itself: 1,530 px between renders; 0 once warm).
