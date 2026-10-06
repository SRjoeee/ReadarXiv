# The instant layer against the original: the fidelity record

Written by `spikes/layer-gate.mjs --record`. Each run below: the engine at its commit, Chromium 153.0.8010.12, PDF.js 6.3.289; pages: the first 12 of each output, every page of 2307.16209v1; the planes at 2.5 device px a PDF unit, lost ink at 2x; crops drawn darken.

- **pixel**: the engine at `b3f68afc` (exp/layer-t12-gate), the gate at `b3f68afc`, 2026-10-06; the engine's own layout files; 68.2 s.
- **pixel-fixed**: the engine at `b3f68afc` (exp/layer-t12-gate), the gate at `b3f68afc`, 2026-10-06; the fixtures' layout files, as made for the layer lab; 73.5 s.
- **pixel-proto-tex-lines**: the engine at `51e5ee49` (exp/layer-s3), the gate at `51e5ee49`, 2026-10-06; v0 (the prototype in the engine), no layout file: the prototype's geometry and the fixtures' record.json, the role table's faces; the hybrid: each unit the fixture's layout file locates whole takes its lines, label and placeholders from the file, with the units only the file holds (but cells); 67.3 s.

Every measure is against arXiv's original page, whose own value is the first column. The prototype's floor is the approved prototype as this gate measures it (v0, the prototype ported into the engine, under its own units and faces at the gate's text place); the floors it replaces stand beside it: the one before it, and the parity run's (measured at the prototype page's text place, 0.19 CSS px off, with coverage read from the translation's ink). Both are the ten outputs the prototype shares with the engine, pages 1-12. A defect is its count and, in brackets, its rate per 1,000 translated text cells (the model tier: per 1,000 cells of the drawn units' frames), which is what the merge rule compares.

## Against the original

| measure | Original | Prototype floor (v0, this gate), shared ten | The floor before it, shared ten | The parity run's floor, shared ten | pixel, shared ten | pixel, all 29 | pixel-fixed, shared ten | pixel-fixed, all 29 | pixel-proto-tex-lines, shared ten | pixel-proto-tex-lines, all 29 |
|---|---|---|---|---|---|---|---|---|---|---|
| text translated | 100.0 % | 87.8 % | 87.5 % | 90.7 % | 65.8 % | 60.8 % | 65.8 % | 60.7 % | 88.0 % | 82.9 % |
| text English | 0.0 % | 0.4 % | 0.5 % | 0.5 % | 20.0 % | 22.7 % | 20.0 % | 22.8 % | 0.3 % | 0.9 % |
| text blank | 0.0 % | 11.9 % | 12.0 % | 8.8 % | 14.2 % | 16.6 % | 14.2 % | 16.5 % | 11.7 % | 16.2 % |
| table cells translated | 100.0 % | 5.8 % | 5.8 % | 6.1 % | 40.5 % | 38.1 % | 40.5 % | 38.1 % | 6.0 % | 7.3 % |
| text units left English | 0 | 7 / 1194 | 7 / 1194 | 7 / 1194 | 186 / 1194 | 684 / 3979 | 186 / 1194 | 686 / 3979 | 0 / 1194 | 10 / 3979 |
| cells left English | 0 | 635 / 686 | 635 / 686 | 635 / 686 | 217 / 686 | 499 / 1601 | 217 / 686 | 499 / 1601 | 635 / 686 | 1440 / 1601 |
| fill (median) | 1 | 0.927 | 0.916 | 0.916 | 0.892 | 0.893 | 0.892 | 0.894 | 0.928 | 0.940 |
| blank lines / frame | 0 | 0.535 | 0.611 | 0.611 | 0.755 | 0.723 | 0.753 | 0.721 | 0.532 | 0.494 |
| frames with a blank line | 0.0 % | 24.1 % | 27.0 % | 27.0 % | 34.6 % | 33.0 % | 34.5 % | 32.9 % | 24.3 % | 21.6 % |
| pitch spread | 0 | 0.071 | 0.088 | 0.088 | 0.044 | 0.057 | 0.044 | 0.071 | 0.070 | 0.147 |
| size (median) | 1 | 0.978 | 0.978 | 0.978 | 0.957 | 0.941 | 0.957 | 0.941 | 0.981 | 0.972 |
| full size | 100.0 % | 64.4 % | 64.0 % | 64.0 % | 59.8 % | 47.6 % | 59.8 % | 47.3 % | 64.5 % | 61.0 % |
| size spread | 0 | 0.067 | 0.069 | 0.069 | 0.038 | 0.019 | 0.038 | 0.019 | 0.068 | 0.068 |
| frames past the right edge | 0.0 % | 13.2 % | 14.0 % | 14.0 % | 0.0 % | 1.0 % | 0.0 % | 1.0 % | 13.0 % | 11.9 % |
| overlap regions | 0 | 122 (0.95) | 122 (0.95) | 119 (0.90) | 324 (3.35) | 8391 (25.71) | 326 (3.37) | 8446 (25.91) | 11 (0.09) | 441 (0.99) |
| stray text | 0 | 49 (0.38) | 62 (0.48) | 62 (0.47) | 2 (0.02) | 8 (0.03) | 2 (0.02) | 8 (0.03) | 28 (0.22) | 141 (0.32) |
| residue regions | 0 | 589 (4.57) | 591 (4.61) | 587 (4.41) | 31335 (324.14) | 247183 (757.43) | 31361 (324.55) | 246677 (756.68) | 474 (3.67) | 1474 (3.31) |
| erase bites | 0 | 61 (0.47) | 168 (1.31) | 168 (1.26) | 1880 (19.45) | 5331 (16.34) | 1879 (19.45) | 5447 (16.71) | 149 (1.15) | 833 (1.87) |
| vanished math | 0 | 13 (0.10) | 13 (0.10) | 13 (0.10) | 261 (2.70) | 684 (2.10) | 261 (2.70) | 752 (2.31) | 9 (0.07) | 707 (1.59) |
| doubled crops | 0 | 5 (0.04) | 5 (0.04) | 5 (0.04) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 2 (0.01) | 26 (0.06) |
| lost-ink regions | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 20 (0.15) | 65 (0.15) |
| graphics px erased | 0 | 7 (0.05) | 208 (1.62) | 208 (1.56) | 2822 (29.19) | 11483 (35.19) | 2693 (27.87) | 10580 (32.45) | 4 (0.03) | 240 (0.54) |
| graphics px overdrawn | 0 | 0 (0) | 0 (0) | 0 (0) | 14 (0.14) | 14 (0.04) | 14 (0.14) | 14 (0.04) | 0 (0) | 99 (0.22) |
| crops with foreign ink | 0 | 11 (0.09) | 11 (0.09) | 11 (0.08) | 135 (1.40) | 247 (0.76) | 135 (1.40) | 248 (0.76) | 6 (0.05) | 26 (0.06) |
| wrong page text | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| dropped placeholders | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 2 (0.01) | 0 (0) | 0 (0) |
| placeholders missing | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 2 (0.00) |
| placeholders twice | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 15 (0.03) |
| doubled brackets | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| duplications | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| clipped characters | 0 | 99 (0.77) | 99 (0.77) | 99 (0.74) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| equation numbers not shown | 0 | - | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| pitch ratio (not gated) | 1 | 1.094 | 1.094 | 1.094 | 1.076 | 1.025 | 1.076 | 1.025 | 1.096 | 1.050 |
| |top shift| (pt) (not gated) | 0 | 0.185 | 0.186 | 0.184 | 0.322 | 0.454 | 0.322 | 0.454 | 0.167 | 0.227 |
| lines on a layout baseline (not gated) | 100.0 % | 49.3 % | 49.3 % | 49.3 % | 53.3 % | 48.0 % | 54.9 % | 48.5 % | 49.8 % | 48.8 % |

**Below the prototype's floor on the shared ten** (pixel): text translated, text English, text blank, text units left English, fill (median), blank lines / frame, frames with a blank line, size (median), full size, overlap regions, residue regions, erase bites, vanished math, graphics px erased, graphics px overdrawn, crops with foreign ink.

## By output (pixel)

| output | text translated | text English | text blank | table cells translated | text units left English | blank lines / frame | full size | overlap regions | residue regions | erase bites | vanished math | crops with foreign ink | lost-ink regions | wrong page text | clipped characters | why left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1512.03385v1-de | 59.1 % | 29.1 % | 11.7 % | 42.1 % | 29 / 123 | 0.685 | 0.0 % | 83 (8.33) | 3053 (306.37) | 12 (1.20) | 4 (0.40) | 34 (3.41) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-es | 62.1 % | 29.1 % | 8.7 % | 40.9 % | 29 / 123 | 0.499 | 0.0 % | 88 (8.40) | 3066 (292.84) | 12 (1.15) | 4 (0.38) | 34 (3.25) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-fr | 59.8 % | 29.7 % | 10.5 % | 37.9 % | 31 / 123 | 0.733 | 3.1 % | 74 (7.34) | 3086 (306.12) | 12 (1.19) | 4 (0.40) | 34 (3.37) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 5, unlocated 2 |
| 1512.03385v1-ja | 66.2 % | 27.6 % | 6.2 % | 28.4 % | 29 / 123 | 0.409 | 13.6 % | 56 (5.02) | 3218 (288.35) | 10 (0.90) | 4 (0.36) | 33 (2.96) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-ko | 60.1 % | 27.5 % | 12.5 % | 38.8 % | 27 / 123 | 0.697 | 63.2 % | 92 (9.09) | 3138 (310.08) | 12 (1.19) | 4 (0.40) | 34 (3.36) | 0 (0) | 0 (0) | 0 (0) | lost 24, unlocated 2, floor 1 |
| 1512.03385v1-ru | 57.2 % | 29.8 % | 13.0 % | 32.8 % | 33 / 123 | 0.838 | 0.0 % | 61 (6.33) | 3083 (320.11) | 7 (0.73) | 0 (0) | 33 (3.43) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 7, unlocated 2 |
| 1512.03385v1-zh | 55.9 % | 27.5 % | 16.6 % | 38.7 % | 27 / 123 | 1.129 | 100.0 % | 87 (9.24) | 3118 (331.03) | 12 (1.27) | 4 (0.42) | 34 (3.61) | 0 (0) | 0 (0) | 0 (0) | lost 24, unlocated 2, floor 1 |
| 1706.03762v7-de | 89.0 % | 7.1 % | 3.9 % | 64.7 % | 9 / 110 | 0.148 | 40.0 % | 7 (0.71) | 2618 (265.60) | 365 (37.03) | 31 (3.15) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 3 |
| 1706.03762v7-es | 90.6 % | 6.9 % | 2.5 % | 69.0 % | 8 / 110 | 0.115 | 53.9 % | 3 (0.30) | 2713 (270.27) | 366 (36.46) | 38 (3.79) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 2 |
| 1706.03762v7-fr | 91.1 % | 6.8 % | 2.1 % | 67.2 % | 7 / 110 | 0.089 | 58.5 % | 3 (0.30) | 2720 (269.52) | 366 (36.27) | 39 (3.86) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 1 |
| 1706.03762v7-ja | 88.0 % | 7.2 % | 4.8 % | 48.5 % | 10 / 110 | 0.174 | 87.5 % | 12 (1.23) | 2594 (266.11) | 366 (37.55) | 52 (5.33) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 4 |
| 1706.03762v7-ko | 76.8 % | 6.8 % | 16.3 % | 53.3 % | 7 / 110 | 0.538 | 100.0 % | 16 (1.88) | 2602 (305.79) | 366 (43.01) | 48 (5.64) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 1 |
| 1706.03762v7-ru | 87.9 % | 7.2 % | 4.9 % | 51.9 % | 10 / 110 | 0.153 | 36.9 % | 1 (0.10) | 2697 (276.99) | 365 (37.49) | 46 (4.72) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 4 |
| 1706.03762v7-zh | 72.0 % | 6.8 % | 21.2 % | 55.5 % | 6 / 110 | 0.677 | 100.0 % | 7 (0.88) | 2700 (338.52) | 366 (45.89) | 50 (6.27) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6 |
| 1810.04805v2-de | 58.0 % | 29.6 % | 12.4 % | 47.4 % | 29 / 128 | 0.771 | 1.6 % | 6 (0.69) | 3361 (384.82) | 5 (0.57) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 7, unlocated 4 |
| 1810.04805v2-es | 60.4 % | 29.8 % | 9.8 % | 54.0 % | 30 / 128 | 0.613 | 4.8 % | 3 (0.33) | 3411 (374.92) | 5 (0.55) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 8, unlocated 4 |
| 1810.04805v2-fr | 60.1 % | 29.7 % | 10.2 % | 45.6 % | 29 / 128 | 0.598 | 7.9 % | 5 (0.55) | 3404 (376.38) | 5 (0.55) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 7, unlocated 4 |
| 1810.04805v2-ja | 59.1 % | 33.5 % | 7.4 % | 38.9 % | 30 / 128 | 0.513 | 13.3 % | 5 (0.56) | 3386 (380.36) | 5 (0.56) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, brackets 4, unlocated 4 |
| 1810.04805v2-ko | 54.4 % | 30.9 % | 14.7 % | 50.9 % | 28 / 128 | 0.907 | 72.6 % | 9 (1.10) | 3268 (398.83) | 5 (0.61) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, unlocated 4, brackets 2 |
| 1810.04805v2-ru | 58.1 % | 29.1 % | 12.8 % | 44.7 % | 30 / 128 | 0.681 | 4.6 % | 4 (0.46) | 3563 (407.20) | 5 (0.57) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 8, unlocated 4 |
| 1810.04805v2-zh | 53.4 % | 28.7 % | 17.9 % | 38.9 % | 26 / 128 | 1.294 | 92.3 % | 4 (0.50) | 3543 (440.62) | 5 (0.62) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, unlocated 4 |
| 2307.16209v1-zh | 35.0 % | 27.5 % | 37.5 % | 55.6 % | 122 / 514 | 0.958 | 97.0 % | 7750 (232.65) | 151499 (4547.88) | 55 (1.65) | 3 (0.09) | 4 (0.12) | 0 (0) | 0 (0) | 0 (0) | lost 99, unlocated 14, floor 7, missing 2 |
| 2608.04322v1-de | 67.7 % | 17.8 % | 14.5 % | 27.4 % | 13 / 134 | 0.805 | 0.0 % | 2 (0.15) | 4447 (326.36) | 372 (27.30) | 23 (1.69) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 3, unlocated 1 |
| 2608.04322v1-es | 70.2 % | 17.2 % | 12.7 % | 29.7 % | 13 / 134 | 0.804 | 0.0 % | 1 (0.07) | 4458 (315.63) | 372 (26.34) | 26 (1.84) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 3, unlocated 1 |
| 2608.04322v1-fr | 69.1 % | 17.4 % | 13.5 % | 22.0 % | 15 / 134 | 0.967 | 0.0 % | 1 (0.07) | 4478 (321.81) | 372 (26.73) | 21 (1.51) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 5, unlocated 1 |
| 2608.04322v1-ja | 74.3 % | 17.2 % | 8.5 % | 25.6 % | 15 / 134 | 0.516 | 16.5 % | 3 (0.20) | 4579 (306.12) | 372 (24.87) | 67 (4.48) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 5, unlocated 1 |
| 2608.04322v1-ko | 63.4 % | 20.4 % | 16.2 % | 23.4 % | 13 / 134 | 0.856 | 100.0 % | 6 (0.47) | 4239 (331.87) | 372 (29.12) | 71 (5.56) | 1 (0.08) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 2, brackets 1, unlocated 1 |
| 2608.04322v1-ru | 68.0 % | 18.2 % | 13.8 % | 17.9 % | 19 / 134 | 0.745 | 0.0 % | 0 (0) | 4438 (324.13) | 372 (27.17) | 71 (5.19) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 9, unlocated 1 |
| 2608.04322v1-zh | 61.5 % | 13.7 % | 24.9 % | 21.8 % | 10 / 134 | 1.397 | 97.9 % | 2 (0.16) | 4703 (379.98) | 372 (30.06) | 74 (5.98) | 1 (0.08) | 0 (0) | 0 (0) | 0 (0) | lost 9, unlocated 1 |

Every measure of every output, and of every page, is in layer-fidelity.json.

