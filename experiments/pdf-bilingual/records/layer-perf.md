# The instant layer's cost budget

Written by `spikes/layer-perf.mjs` from 3 runs of the old path (the engine at `f267adb9`) and 3 of exp/layer (`811df8c3`), each `layer-gate.mjs --perf` (one worker, the model tier), alternately. Each value is the median over the runs; a fixture's time is its pages' median, its memory their peak. The rule: a time at most 10 % over the old path's, a byte or canvas count at most the old path's, the JS heap at most 10 % over it.

## Browser, per page (all fixtures pooled)

| item | old path | exp/layer | rule |
|---|---|---|---|
| first drawing, ms (median page) | 68 | 73.9 | ok |
| drawing again at 2× (original + copy), ms | 25.3 (7 + 16.9) | 24.3 (7 + 16.7) | ok |
| canvases held at the peak, MB | 25.6 | 25.6 | ok |
| JS heap at the peak, MB | 42.3 | 43.7 | ok |

Where exp/layer's first drawing goes (median page, ms): render 15, text 19.5, ink 0, rp 0, lay 22.7, ops 2.9, compose 0, svg 1.3. The old path gives no split (its engine has none).

## Browser, per fixture

| fixture | first drawing, old / new | at 2×, old / new | canvases MB, old / new | rule |
|---|---|---|---|---|
| 1512.03385v1-de | 64.9 / 72.9 | 23.7 / 23.5 | 24.8 / 24.8 | **over** |
| 1512.03385v1-es | 66.5 / 70.4 | 23.8 / 22.4 | 24.8 / 24.8 | ok |
| 1512.03385v1-fr | 67.4 / 75 | 23.1 / 22.7 | 24.8 / 24.8 | **over** |
| 1512.03385v1-ja | 72.1 / 73.8 | 24.2 / 22.3 | 24.8 / 24.8 | ok |
| 1512.03385v1-ko | 76.5 / 81.6 | 24 / 23.8 | 24.8 / 24.8 | ok |
| 1512.03385v1-ru | 67.7 / 77.4 | 23.6 / 23.4 | 24.8 / 24.8 | **over** |
| 1512.03385v1-zh | 68.5 / 76.6 | 23.7 / 24.1 | 24.8 / 24.8 | **over** |
| 1706.03762v7-de | 61.2 / 63.5 | 28.9 / 26.7 | 24.5 / 24.5 | ok |
| 1706.03762v7-es | 55.9 / 65.4 | 27.2 / 31.9 | 24.5 / 24.5 | **over** |
| 1706.03762v7-fr | 60.1 / 69.4 | 26.1 / 30 | 24.5 / 24.5 | **over** |
| 1706.03762v7-ja | 58.6 / 64.6 | 27.5 / 29.4 | 24.5 / 24.5 | **over** |
| 1706.03762v7-ko | 61.4 / 66.3 | 26.6 / 28.7 | 24.5 / 24.5 | ok |
| 1706.03762v7-ru | 60 / 67.3 | 26.7 / 29.8 | 24.5 / 24.5 | **over** |
| 1706.03762v7-zh | 59.5 / 60.3 | 26.8 / 29.1 | 24.5 / 24.5 | ok |
| 1810.04805v2-de | 60.9 / 72.2 | 24.5 / 23.4 | 25.6 / 25.6 | **over** |
| 1810.04805v2-es | 67.7 / 68.3 | 24.7 / 23 | 25.6 / 25.6 | ok |
| 1810.04805v2-fr | 65.1 / 70.5 | 24.4 / 23.3 | 25.6 / 25.6 | ok |
| 1810.04805v2-ja | 69.4 / 72 | 24.4 / 21.1 | 25.6 / 25.6 | ok |
| 1810.04805v2-ko | 70.1 / 76.8 | 24.4 / 22 | 25.6 / 25.6 | ok |
| 1810.04805v2-ru | 64.7 / 71.3 | 23.6 / 23.6 | 25.6 / 25.6 | **over** |
| 1810.04805v2-zh | 64.7 / 67.3 | 26 / 22.8 | 25.6 / 25.6 | ok |
| 2307.16209v1-zh | 39.3 / 42.6 | 17.4 / 17.7 | 24.9 / 24.9 | ok |
| 2608.04322v1-de | 87.4 / 85.8 | 25.9 / 25.2 | 24.8 / 24.8 | ok |
| 2608.04322v1-es | 86.6 / 87.2 | 27.5 / 26 | 24.8 / 24.8 | ok |
| 2608.04322v1-fr | 86 / 92.2 | 26.4 / 25.4 | 24.8 / 24.8 | ok |
| 2608.04322v1-ja | 85.1 / 87.8 | 25.3 / 25 | 24.8 / 24.8 | ok |
| 2608.04322v1-ko | 94.2 / 91.5 | 27.3 / 25 | 24.8 / 24.8 | ok |
| 2608.04322v1-ru | 83.7 / 88.3 | 25.7 / 25.1 | 24.8 / 24.8 | ok |
| 2608.04322v1-zh | 83.8 / 90.4 | 28.8 / 24.9 | 24.8 / 24.8 | ok |

## Server, per paper

| paper | maker ms, old / new (its operator lists) | remover ms beyond them, new (parse + ink + plan + make) |
|---|---|---|
| 1512.03385v1 | 346 (114) / 421 (110) | 183 (34 + 48 + 77 + 24) |
| 1706.03762v7 | 454 (195) / 451 (163) | 211 (158 + 26 + 18 + 9) |
| 1810.04805v2 | 406 (164) / 454 (151) | 133 (40 + 37 + 45 + 11) |
| 2307.16209v1 | 1712 (633) / 2087 (682) | 445 (160 + 154 + 72 + 59) |
| 2608.04322v1 | 554 (217) / 591 (210) | 98 (18 + 33 + 34 + 13) |

## Reader download, per paper (bytes)

| paper | layout file gz, old / new | add-on, new | manifest gz, new | in all, old / new |
|---|---|---|---|---|
| 1512.03385v1 | 32256 / 38697 | 2174 | 364 | 32256 / 41235 |
| 1706.03762v7 | 16359 / 17940 | 2569 | 359 | 16359 / 20868 |
| 1810.04805v2 | 37470 / 43796 | 352 | 197 | 37470 / 44345 |
| 2307.16209v1 | 159672 / 157032 | 32928 | 1088 | 159672 / 191048 |
| 2608.04322v1 | 40114 / 42982 | 1769 | 266 | 40114 / 45017 |

## Over the budget (16)

- 1512.03385v1-de first drawing: 64.9 -> 72.9
- 1512.03385v1-fr first drawing: 67.4 -> 75
- 1512.03385v1-ru first drawing: 67.7 -> 77.4
- 1512.03385v1-zh first drawing: 68.5 -> 76.6
- 1706.03762v7-es first drawing: 55.9 -> 65.4
- 1706.03762v7-es zoom: 27.2 -> 31.9
- 1706.03762v7-fr first drawing: 60.1 -> 69.4
- 1706.03762v7-fr zoom: 26.1 -> 30
- 1706.03762v7-ja first drawing: 58.6 -> 64.6
- 1706.03762v7-ru first drawing: 60 -> 67.3
- 1706.03762v7-ru zoom: 26.7 -> 29.8
- 1810.04805v2-de first drawing: 60.9 -> 72.2
- 1810.04805v2-ru first drawing: 64.7 -> 71.3
- 1512.03385v1 maker: 346 -> 421
- 1810.04805v2 maker: 406 -> 454
- 2307.16209v1 maker: 1712 -> 2087

