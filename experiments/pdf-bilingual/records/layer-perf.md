# The instant layer's cost budget

Written by `spikes/layer-perf.mjs` from 3 runs of the old path (the engine at `f267adb9`) and 3 of exp/layer (`957ca142`), each `layer-gate.mjs --perf` (one worker, the model tier), alternately. Each value is the median over the runs; a fixture's time is its pages' median, its memory their peak. The rule: a time at most 10 % over the old path's, a byte or canvas count at most the old path's, the JS heap at most 10 % over it.

## Browser, per page (all fixtures pooled)

| item | old path | exp/layer | rule |
|---|---|---|---|
| first drawing, ms (median page) | 65.2 | 67.6 | ok |
| drawing again at 2× (original + copy), ms | 24.9 (6.6 + 17.6) | 24.8 (6.8 + 17.3) | ok |
| canvases held at the peak, MB | 25.6 | 25.6 | ok |
| JS heap at the peak, MB | 127.7 | 99.3 | ok |

Where exp/layer's first drawing goes (median page, ms): render 12, text 19.6, ink 0, rp 0, lay 20.3, ops 2.4, compose 0, svg 1.2. The old path gives no split (its engine has none).

## Browser, per fixture

| fixture | first drawing, old / new | at 2×, old / new | canvases MB, old / new | rule |
|---|---|---|---|---|
| 1512.03385v1-de | 59.6 / 67.6 | 22.7 / 22.2 | 24.8 / 24.8 | **over** |
| 1512.03385v1-es | 61.9 / 65.9 | 23.8 / 22 | 24.8 / 24.8 | ok |
| 1512.03385v1-fr | 64.8 / 68.1 | 23.3 / 22 | 24.8 / 24.8 | ok |
| 1512.03385v1-ja | 65.2 / 77.6 | 25.5 / 21.6 | 24.8 / 24.8 | **over** |
| 1512.03385v1-ko | 71.3 / 73.7 | 23.6 / 21.2 | 24.8 / 24.8 | ok |
| 1512.03385v1-ru | 64.2 / 64.9 | 23.6 / 22.4 | 24.8 / 24.8 | ok |
| 1512.03385v1-zh | 67.3 / 72.1 | 24.4 / 23.2 | 24.8 / 24.8 | ok |
| 1706.03762v7-de | 58 / 52.1 | 29.3 / 26.4 | 24.5 / 24.5 | ok |
| 1706.03762v7-es | 50.7 / 51.3 | 27.2 / 25.5 | 24.5 / 24.5 | ok |
| 1706.03762v7-fr | 52.3 / 53 | 27 / 25.2 | 24.5 / 24.5 | ok |
| 1706.03762v7-ja | 59.5 / 61.7 | 26 / 26.5 | 24.5 / 24.5 | ok |
| 1706.03762v7-ko | 56.8 / 59.7 | 28.5 / 28.8 | 24.5 / 24.5 | ok |
| 1706.03762v7-ru | 54.9 / 53.7 | 27.6 / 25.2 | 24.5 / 24.5 | ok |
| 1706.03762v7-zh | 58.7 / 56.3 | 26.4 / 25 | 24.5 / 24.5 | ok |
| 1810.04805v2-de | 63.9 / 59.9 | 23.8 / 23.4 | 25.6 / 25.6 | ok |
| 1810.04805v2-es | 71.1 / 62.7 | 29.4 / 22.8 | 25.6 / 25.6 | ok |
| 1810.04805v2-fr | 67.3 / 60.7 | 29.5 / 22.6 | 25.6 / 25.6 | ok |
| 1810.04805v2-ja | 60.8 / 65.4 | 23.8 / 24.5 | 25.6 / 25.6 | ok |
| 1810.04805v2-ko | 62.9 / 69.1 | 24.8 / 23.1 | 25.6 / 25.6 | ok |
| 1810.04805v2-ru | 59.7 / 59.7 | 24.1 / 25.8 | 25.6 / 25.6 | ok |
| 1810.04805v2-zh | 59.8 / 63.3 | 23.9 / 24.3 | 25.6 / 25.6 | ok |
| 2307.16209v1-zh | 34 / 38.4 | 18.1 / 17.6 | 24.9 / 24.9 | **over** |
| 2608.04322v1-de | 78.2 / 94.9 | 24.7 / 31.4 | 24.8 / 24.8 | **over** |
| 2608.04322v1-es | 78.8 / 95.7 | 25 / 28.4 | 24.8 / 24.8 | **over** |
| 2608.04322v1-fr | 79.7 / 80.4 | 24.9 / 29.1 | 24.8 / 24.8 | **over** |
| 2608.04322v1-ja | 80.6 / 85.1 | 24.2 / 27.2 | 24.8 / 24.8 | **over** |
| 2608.04322v1-ko | 86.5 / 101.9 | 24.6 / 26.4 | 24.8 / 24.8 | **over** |
| 2608.04322v1-ru | 80 / 94.3 | 24.5 / 28.5 | 24.8 / 24.8 | **over** |
| 2608.04322v1-zh | 78.6 / 97.2 | 26.2 / 31.9 | 24.8 / 24.8 | **over** |

## Server, per paper

| paper | maker ms, old / new (its operator lists) | remover ms beyond them, new (parse + ink + plan + make) |
|---|---|---|
| 1512.03385v1 | 385 (130) / 465 (132) | 195 (38 + 48 + 83 + 26) |
| 1706.03762v7 | 554 (204) / 521 (192) | 234 (177 + 27 + 21 + 9) |
| 1810.04805v2 | 464 (185) / 525 (175) | 134 (36 + 40 + 48 + 10) |
| 2307.16209v1 | 1762 (665) / 2205 (711) | 484 (168 + 149 + 106 + 61) |
| 2608.04322v1 | 617 (249) / 693 (244) | 126 (22 + 51 + 38 + 15) |

## Reader download, per paper (bytes)

| paper | layout file gz, old / new | add-on, new | manifest gz, new | in all, old / new |
|---|---|---|---|---|
| 1512.03385v1 | 32256 / 34425 | 2174 | 364 | 32256 / 36963 |
| 1706.03762v7 | 16401 / 17912 | 2569 | 356 | 16401 / 20837 |
| 1810.04805v2 | 37470 / 41443 | 352 | 197 | 37470 / 41992 |
| 2307.16209v1 | 160421 / 156672 | 32928 | 1086 | 160421 / 190686 |
| 2608.04322v1 | 40145 / 41671 | 1769 | 266 | 40145 / 43706 |

## Over the budget (18)

- 1512.03385v1-de first drawing: 59.6 -> 67.6
- 1512.03385v1-ja first drawing: 65.2 -> 77.6
- 2307.16209v1-zh first drawing: 34 -> 38.4
- 2608.04322v1-de first drawing: 78.2 -> 94.9
- 2608.04322v1-de zoom: 24.7 -> 31.4
- 2608.04322v1-es first drawing: 78.8 -> 95.7
- 2608.04322v1-es zoom: 25 -> 28.4
- 2608.04322v1-fr zoom: 24.9 -> 29.1
- 2608.04322v1-ja zoom: 24.2 -> 27.2
- 2608.04322v1-ko first drawing: 86.5 -> 101.9
- 2608.04322v1-ru first drawing: 80 -> 94.3
- 2608.04322v1-ru zoom: 24.5 -> 28.5
- 2608.04322v1-zh first drawing: 78.6 -> 97.2
- 2608.04322v1-zh zoom: 26.2 -> 31.9
- 1512.03385v1 maker: 385 -> 465
- 1810.04805v2 maker: 464 -> 525
- 2307.16209v1 maker: 1762 -> 2205
- 2608.04322v1 maker: 617 -> 693

