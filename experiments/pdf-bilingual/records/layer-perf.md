# The instant layer's cost budget

Written by `spikes/layer-perf.mjs` from 3 runs of the old path (the engine at `f267adb9`) and 3 of exp/layer (`0d666905`), each `layer-gate.mjs --perf` (one worker, the model tier), alternately. Each value is the median over the runs; a fixture's time is its pages' median, its memory their peak. The rule: a time at most 10 % over the old path's, a byte or canvas count at most the old path's, the JS heap at most 10 % over it.

## Browser, per page (all fixtures pooled)

| item | old path | exp/layer | rule |
|---|---|---|---|
| first drawing, ms (median page) | 73.6 | 78.2 | ok |
| drawing again at 2× (original + copy), ms | 25.9 (7.1 + 17.7) | 25.8 (7.1 + 17.4) | ok |
| canvases held at the peak, MB | 25.6 | 25.6 | ok |
| JS heap at the peak, MB | 42.3 | 44.7 | ok |

Where exp/layer's first drawing goes (median page, ms): render 14.8, text 20.4, ink 0, rp 0, lay 26.6, ops 3.3, compose 0, svg 1.5. The old path gives no split (its engine has none).

## Browser, per fixture

| fixture | first drawing, old / new | at 2×, old / new | canvases MB, old / new | rule |
|---|---|---|---|---|
| 1512.03385v1-de | 68.6 / 83.1 | 24.8 / 25.7 | 24.8 / 24.8 | **over** |
| 1512.03385v1-es | 74.1 / 78.5 | 25 / 23.7 | 24.8 / 24.8 | ok |
| 1512.03385v1-fr | 71.6 / 83.2 | 24.2 / 24.1 | 24.8 / 24.8 | **over** |
| 1512.03385v1-ja | 76.6 / 89.7 | 25.1 / 24 | 24.8 / 24.8 | **over** |
| 1512.03385v1-ko | 75.3 / 89.6 | 24.3 / 24.7 | 24.8 / 24.8 | **over** |
| 1512.03385v1-ru | 74.5 / 85.7 | 24.5 / 24.1 | 24.8 / 24.8 | **over** |
| 1512.03385v1-zh | 76.6 / 84.4 | 25.2 / 25.3 | 24.8 / 24.8 | **over** |
| 1706.03762v7-de | 62.2 / 66.9 | 28.1 / 28.1 | 24.5 / 24.5 | ok |
| 1706.03762v7-es | 62.6 / 69.5 | 27.8 / 28.3 | 24.5 / 24.5 | **over** |
| 1706.03762v7-fr | 63.3 / 70.6 | 27.7 / 30.8 | 24.5 / 24.5 | **over** |
| 1706.03762v7-ja | 62.5 / 64.9 | 32.4 / 28.5 | 24.5 / 24.5 | ok |
| 1706.03762v7-ko | 64.3 / 69.3 | 28.1 / 28.4 | 24.5 / 24.5 | ok |
| 1706.03762v7-ru | 63.7 / 68 | 27 / 28.9 | 24.5 / 24.5 | ok |
| 1706.03762v7-zh | 62.7 / 65.3 | 27.2 / 28.9 | 24.5 / 24.5 | ok |
| 1810.04805v2-de | 63.7 / 76.1 | 24.2 / 23.8 | 25.6 / 25.6 | **over** |
| 1810.04805v2-es | 70.6 / 74.1 | 24.2 / 23.8 | 25.6 / 25.6 | ok |
| 1810.04805v2-fr | 64.5 / 72.1 | 24.1 / 24 | 25.6 / 25.6 | **over** |
| 1810.04805v2-ja | 73.1 / 74.9 | 25.3 / 24.5 | 25.6 / 25.6 | ok |
| 1810.04805v2-ko | 72.1 / 79.1 | 25.2 / 24.1 | 25.6 / 25.6 | ok |
| 1810.04805v2-ru | 65.1 / 74.7 | 25.4 / 24.7 | 25.6 / 25.6 | **over** |
| 1810.04805v2-zh | 73.2 / 74.7 | 26.1 / 24.9 | 25.6 / 25.6 | ok |
| 2307.16209v1-zh | 40.1 / 45.1 | 17.3 / 19.1 | 24.9 / 24.9 | **over** |
| 2608.04322v1-de | 87.9 / 92.1 | 28.4 / 26.8 | 24.8 / 24.8 | ok |
| 2608.04322v1-es | 91.5 / 91.6 | 28.3 / 26.6 | 24.8 / 24.8 | ok |
| 2608.04322v1-fr | 90.2 / 92.4 | 28.3 / 26.8 | 24.8 / 24.8 | ok |
| 2608.04322v1-ja | 90.4 / 90.9 | 26.6 / 25.9 | 24.8 / 24.8 | ok |
| 2608.04322v1-ko | 95.5 / 96.4 | 26.9 / 26.3 | 24.8 / 24.8 | ok |
| 2608.04322v1-ru | 87.6 / 91.5 | 27.1 / 27 | 24.8 / 24.8 | ok |
| 2608.04322v1-zh | 87.3 / 93.3 | 28.9 / 26.2 | 24.8 / 24.8 | ok |

## Server, per paper

| paper | maker ms, old / new (its operator lists) | remover ms beyond them, new (parse + ink + plan + make) |
|---|---|---|
| 1512.03385v1 | 365 (119) / 443 (119) | 194 (36 + 49 + 82 + 27) |
| 1706.03762v7 | 469 (191) / 487 (176) | 226 (171 + 26 + 20 + 9) |
| 1810.04805v2 | 433 (174) / 490 (164) | 122 (32 + 35 + 45 + 10) |
| 2307.16209v1 | 1813 (684) / 2283 (767) | 476 (174 + 156 + 81 + 65) |
| 2608.04322v1 | 580 (229) / 624 (224) | 108 (20 + 36 + 37 + 15) |

## Reader download, per paper (bytes)

| paper | layout file gz, old / new | add-on, new | manifest gz, new | in all, old / new |
|---|---|---|---|---|
| 1512.03385v1 | 32256 / 38697 | 2174 | 999 | 32256 / 41870 |
| 1706.03762v7 | 16359 / 17921 | 2569 | 590 | 16359 / 21080 |
| 1810.04805v2 | 37470 / 43773 | 352 | 580 | 37470 / 44705 |
| 2307.16209v1 | 159672 / 157101 | 32928 | 1272 | 159672 / 191301 |
| 2608.04322v1 | 40114 / 42982 | 1769 | 703 | 40114 / 45454 |

## Over the budget (17)

- 1512.03385v1-de first drawing: 68.6 -> 83.1
- 1512.03385v1-fr first drawing: 71.6 -> 83.2
- 1512.03385v1-ja first drawing: 76.6 -> 89.7
- 1512.03385v1-ko first drawing: 75.3 -> 89.6
- 1512.03385v1-ru first drawing: 74.5 -> 85.7
- 1512.03385v1-zh first drawing: 76.6 -> 84.4
- 1706.03762v7-es first drawing: 62.6 -> 69.5
- 1706.03762v7-fr first drawing: 63.3 -> 70.6
- 1706.03762v7-fr zoom: 27.7 -> 30.8
- 1810.04805v2-de first drawing: 63.7 -> 76.1
- 1810.04805v2-fr first drawing: 64.5 -> 72.1
- 1810.04805v2-ru first drawing: 65.1 -> 74.7
- 2307.16209v1-zh first drawing: 40.1 -> 45.1
- 2307.16209v1-zh zoom: 17.3 -> 19.1
- 1512.03385v1 maker: 365 -> 443
- 1810.04805v2 maker: 433 -> 490
- 2307.16209v1 maker: 1813 -> 2283

