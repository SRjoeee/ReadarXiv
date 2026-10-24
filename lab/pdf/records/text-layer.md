# The text layer's cost (docs/PDF-READER.md §11.11)

`lab/pdf/spikes/text-layer-cost.mjs`, 2026-10-24, Chromium 153.0.8010.12 (Playwright's), the repository's PDF.js 6.3.289, the
place at scale 2, seven runs a page (the median), at the review's fixes (each character of an item tested for erasure, so that
an item the drawing parts is cut). The machine was heavily loaded (a load average near 100 at the start): the numbers are an
upper side. Each page's own text content, its plan synthetic: every text line erased by an operation of its own and drawn as a
segment of its own text (`translated`), every other six-line unit so (`half`), or none (`kept`, every item the page's own: the
host's hardest case). Pages: our final pass of 2602.23285v2 (the heaviest, 28 MB; p7 the most items) and our base of 2608.16117v1.

Budgets (the route note's §4 and §7): the engine's step at most 3 ms a page, the host's build at most 5 ms of main-thread time and
2000 nodes. `host` is the view's build (PDF.js's TextLayerBuilder over the items) with its append and a forced layout, `layout`
the append and the layout alone; `bytes` what the page's compact items hold on its record.

| Paper | Page | Plan | Items read | Items out | kept / moved / translated | Merged | Engine ms | Host ms | Layout ms | Nodes | KB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2602.23285v2 | 6 | translated | 566 | 120 | 0 / 0 / 120 | 0 | 1.1 | 1.7 | 1.1 | 142 | 41.9 |
| 2602.23285v2 | 7 | translated | 977 | 81 | 0 / 0 / 81 | 0 | 0.9 | 1.3 | 0.8 | 96 | 68.5 |
| 2602.23285v2 | 8 | translated | 133 | 46 | 0 / 0 / 46 | 0 | 0.2 | 0.9 | 0.5 | 55 | 12.8 |
| 2602.23285v2 | 9 | translated | 317 | 121 | 0 / 0 / 121 | 0 | 0.5 | 1.7 | 1.1 | 143 | 27.7 |
| 2608.16117v1 | 11 | translated | 490 | 110 | 0 / 0 / 110 | 0 | 0.8 | 2.1 | 1.4 | 130 | 35.1 |
| 2608.16117v1 | 13 | translated | 469 | 228 | 0 / 0 / 228 | 0 | 0.6 | 3.2 | 2.2 | 267 | 32.6 |
| 2602.23285v2 | 6 | half | 566 | 161 | 230 / 0 / 61 | 130 | 1.2 | 2.8 | 1.8 | 202 | 41.9 |
| 2602.23285v2 | 7 | half | 977 | 122 | 481 / 0 / 42 | 401 | 1.1 | 2.2 | 1.4 | 165 | 68.5 |
| 2602.23285v2 | 8 | half | 133 | 57 | 48 / 0 / 24 | 15 | 0.2 | 1.2 | 0.8 | 83 | 12.8 |
| 2602.23285v2 | 9 | half | 317 | 124 | 146 / 0 / 61 | 83 | 1 | 2.2 | 1.5 | 194 | 27.7 |
| 2608.16117v1 | 11 | half | 490 | 214 | 297 / 0 / 56 | 139 | 0.7 | 2.8 | 1.9 | 259 | 35.1 |
| 2608.16117v1 | 13 | half | 469 | 235 | 212 / 0 / 114 | 91 | 0.7 | 3.4 | 2.4 | 315 | 32.6 |
| 2602.23285v2 | 6 | kept | 566 | 209 | 566 / 0 / 0 | 357 | 0.4 | 3.2 | 2.1 | 270 | 41.9 |
| 2602.23285v2 | 7 | kept | 977 | 169 | 977 / 0 / 0 | 808 | 0.2 | 3.1 | 2 | 242 | 68.5 |
| 2602.23285v2 | 8 | kept | 133 | 65 | 133 / 0 / 0 | 68 | 0 | 1.3 | 0.9 | 111 | 12.8 |
| 2602.23285v2 | 9 | kept | 317 | 135 | 317 / 0 / 0 | 182 | 0.1 | 2.3 | 1.7 | 255 | 27.7 |
| 2608.16117v1 | 11 | kept | 490 | 283 | 490 / 0 / 0 | 207 | 0.2 | 3.8 | 2.6 | 351 | 35.1 |
| 2608.16117v1 | 13 | kept | 469 | 256 | 469 / 0 / 0 | 213 | 0.1 | 3.4 | 2.4 | 360 | 32.6 |

Before the page's abutting items were merged into runs (`textlayer.mjs` mergeRuns), every item its own span, the `kept` plan of
2602.23285v2 p7 built 1050 nodes in 9.1 ms (6.9 of them the layout), p6 629 in 5.8: the merge is what holds the host's budget.
Before each character was tested (an item by its centre alone) the engine took at most 0.6 ms; the host as here. In the
extension on the sample (`pnpm e2e:reader`, the real door, `probe().textsRing`): 105 and 153 items, 1.4 to 1.8 ms a page.

The idle build is off the commit's path (`layer-side.mjs` textSoon, `requestIdleCallback` within 500 ms): a page appears as fast
as before; the layer follows when the main thread is idle.
