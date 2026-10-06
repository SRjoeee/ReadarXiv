# The instant layer against the original: the fidelity record

Written by `spikes/layer-gate.mjs --record`. Each run below: the engine at its commit, Chromium 153.0.8010.12, PDF.js 6.3.289; pages: the first 12 of each output, every page of 2307.16209v1; the planes at 2.5 device px a PDF unit, lost ink at 2x; crops drawn source-over.

- **pixel**: the engine at `535b8a02` (exp/layer-t12-gate), the gate at `535b8a02`, 2026-10-06; the engine's own layout files; 53.4 s.
- **pixel-fixed**: the engine at `535b8a02` (exp/layer-t12-gate), the gate at `535b8a02`, 2026-10-06; the fixtures' layout files, as made for the layer lab; 67.8 s.
- **pixel-proto**: the engine at `178673a9` (exp/layer-proto), the gate at `178673a9`, 2026-10-06; v0 (the prototype in the engine), no layout file: the prototype's geometry and the fixtures' record.json, the role table's faces; 70.6 s.
- **pixel-proto-tex-lines**: the engine at `178673a9` (exp/layer-proto), the gate at `178673a9`, 2026-10-06; v0 (the prototype in the engine), no layout file: the prototype's geometry and the fixtures' record.json, the role table's faces; the hybrid: each unit the fixture's layout file locates whole takes its lines, label and placeholders from the file, with the units only the file holds (but cells); 91.5 s.

Every measure is against arXiv's original page, whose own value is the first column. The prototype's floor is the approved prototype as this gate measures it (v0, the prototype ported into the engine, under its own units and faces at the gate's text place); the parity run's floor it replaces stands beside it (measured at the prototype page's text place, 0.19 CSS px off, with coverage read from the translation's ink). Both are the ten outputs the prototype shares with the engine, pages 1-12. A defect is its count and, in brackets, its rate per 1,000 translated text cells (the model tier: per 1,000 cells of the drawn units' frames), which is what the merge rule compares.

## Against the original

| measure | Original | Prototype floor (v0, this gate), shared ten | Prototype floor (the parity run, before), shared ten | pixel, shared ten | pixel, all 29 | pixel-fixed, shared ten | pixel-fixed, all 29 | pixel-proto, shared ten | pixel-proto, all 29 | pixel-proto-tex-lines, shared ten | pixel-proto-tex-lines, all 29 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| text translated | 100.0 % | 87.5 % | 90.7 % | 65.6 % | 60.4 % | 65.6 % | 60.4 % | 87.4 % | 82.1 % | 87.5 % | 82.2 % |
| text English | 0.0 % | 0.5 % | 0.5 % | 20.0 % | 22.7 % | 20.0 % | 22.9 % | 0.5 % | 2.3 % | 0.4 % | 1.2 % |
| text blank | 0.0 % | 12.0 % | 8.8 % | 14.4 % | 16.8 % | 14.4 % | 16.8 % | 12.1 % | 15.5 % | 12.1 % | 16.7 % |
| table cells translated | 100.0 % | 5.8 % | 6.1 % | 40.6 % | 38.6 % | 40.6 % | 38.6 % | 5.8 % | 7.2 % | 5.8 % | 7.3 % |
| text units left English | 0 | 7 / 1194 | 7 / 1194 | 186 / 1194 | 684 / 3979 | 186 / 1194 | 686 / 3979 | 7 / 1194 | 97 / 3979 | 0 / 1194 | 12 / 3979 |
| cells left English | 0 | 635 / 686 | 635 / 686 | 217 / 686 | 499 / 1601 | 217 / 686 | 499 / 1601 | 635 / 686 | 1431 / 1601 | 635 / 686 | 1431 / 1601 |
| fill (median) | 1 | 0.916 | 0.916 | 0.888 | 0.885 | 0.888 | 0.885 | 0.913 | 0.911 | 0.914 | 0.918 |
| blank lines / frame | 0 | 0.611 | 0.611 | 0.823 | 0.817 | 0.820 | 0.815 | 0.618 | 0.665 | 0.616 | 0.629 |
| frames with a blank line | 0.0 % | 27.0 % | 27.0 % | 37.0 % | 36.1 % | 36.9 % | 36.0 % | 27.7 % | 27.1 % | 27.4 % | 26.6 % |
| pitch spread | 0 | 0.088 | 0.088 | 0.047 | 0.056 | 0.047 | 0.076 | 0.093 | 0.147 | 0.093 | 0.152 |
| size (median) | 1 | 0.978 | 0.978 | 0.957 | 0.941 | 0.957 | 0.941 | 0.981 | 0.972 | 0.981 | 0.972 |
| full size | 100.0 % | 64.0 % | 64.0 % | 59.8 % | 47.1 % | 59.8 % | 46.8 % | 64.3 % | 58.7 % | 63.9 % | 58.7 % |
| size spread | 0 | 0.069 | 0.069 | 0.038 | 0.019 | 0.038 | 0.019 | 0.069 | 0.070 | 0.069 | 0.070 |
| frames past the right edge | 0.0 % | 14.0 % | 14.0 % | 0.0 % | 0.9 % | 0.0 % | 0.9 % | 13.7 % | 11.7 % | 13.7 % | 11.7 % |
| overlap regions | 0 | 122 (0.95) | 119 (0.90) | 324 (3.37) | 8396 (25.90) | 326 (3.39) | 8451 (26.09) | 73 (0.57) | 861 (1.95) | 11 (0.09) | 479 (1.09) |
| stray text | 0 | 62 (0.48) | 62 (0.47) | 2 (0.02) | 8 (0.03) | 2 (0.02) | 8 (0.03) | 63 (0.49) | 310 (0.70) | 42 (0.33) | 245 (0.56) |
| residue regions | 0 | 591 (4.61) | 587 (4.41) | 31311 (325.43) | 247098 (762.14) | 31337 (325.85) | 246592 (761.43) | 567 (4.42) | 2482 (5.63) | 529 (4.12) | 1734 (3.93) |
| erase bites | 0 | 168 (1.31) | 168 (1.26) | 171 (1.78) | 902 (2.78) | 170 (1.77) | 893 (2.76) | 144 (1.12) | 7812 (17.73) | 144 (1.12) | 1130 (2.56) |
| vanished math | 0 | 13 (0.10) | 13 (0.10) | 261 (2.71) | 684 (2.11) | 261 (2.71) | 752 (2.32) | 14 (0.11) | 906 (2.06) | 11 (0.09) | 852 (1.93) |
| doubled crops | 0 | 5 (0.04) | 5 (0.04) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 5 (0.04) | 42 (0.10) | 2 (0.02) | 35 (0.08) |
| lost-ink regions | 0 | - | - | 1 (0.01) | 45 (0.14) | 1 (0.01) | 43 (0.13) | 21 (0.16) | 131 (0.30) | 21 (0.16) | 74 (0.17) |
| graphics px erased | 0 | 208 (1.62) | 208 (1.56) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 208 (1.62) | 477 (1.08) | 208 (1.62) | 403 (0.91) |
| graphics px overdrawn | 0 | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 826 (1.87) | 0 (0) | 101 (0.23) |
| crops with foreign ink | 0 | 11 (0.09) | 11 (0.08) | 135 (1.40) | 247 (0.76) | 135 (1.40) | 248 (0.77) | 11 (0.09) | 46 (0.10) | 6 (0.05) | 30 (0.07) |
| wrong page text | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| dropped placeholders | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 2 (0.01) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| placeholders missing | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 4 (0.01) | 0 (0) | 3 (0.01) |
| placeholders twice | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 22 (0.05) | 0 (0) | 17 (0.04) |
| doubled brackets | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| duplications | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| clipped characters | 0 | 99 (0.77) | 99 (0.74) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 101 (0.79) | 2302 (5.22) | 110 (0.86) | 2314 (5.25) |
| equation numbers not shown | 0 | - | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 1 (0.00) | 0 (0) | 1 (0.00) |
| pitch ratio (not gated) | 1 | 1.094 | 1.094 | 1.076 | 1.023 | 1.076 | 1.023 | 1.096 | 1.047 | 1.096 | 1.048 |
| |top shift| (pt) (not gated) | 0 | 0.186 | 0.184 | 0.323 | 0.451 | 0.323 | 0.451 | 0.164 | 0.229 | 0.168 | 0.230 |
| lines on a layout baseline (not gated) | 100.0 % | 49.3 % | 49.3 % | 53.3 % | 48.6 % | 55.0 % | 49.1 % | 50.0 % | 52.6 % | 50.3 % | 49.3 % |

**Below the prototype's floor on the shared ten** (pixel): text translated, text English, text blank, text units left English, fill (median), blank lines / frame, frames with a blank line, size (median), full size, overlap regions, residue regions, erase bites, vanished math, crops with foreign ink.

## By output (pixel)

| output | text translated | text English | text blank | table cells translated | text units left English | blank lines / frame | full size | overlap regions | residue regions | erase bites | vanished math | crops with foreign ink | lost-ink regions | wrong page text | clipped characters | why left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1512.03385v1-de | 59.1 % | 29.1 % | 11.7 % | 42.1 % | 29 / 123 | 0.685 | 0.0 % | 82 (8.23) | 3053 (306.37) | 12 (1.20) | 4 (0.40) | 34 (3.41) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-es | 62.1 % | 29.1 % | 8.7 % | 40.8 % | 29 / 123 | 0.499 | 0.0 % | 88 (8.40) | 3066 (292.84) | 12 (1.15) | 4 (0.38) | 34 (3.25) | 1 (0.10) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-fr | 59.8 % | 29.7 % | 10.5 % | 37.8 % | 31 / 123 | 0.733 | 3.1 % | 75 (7.44) | 3086 (306.12) | 12 (1.19) | 4 (0.40) | 34 (3.37) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 5, unlocated 2 |
| 1512.03385v1-ja | 66.2 % | 27.6 % | 6.2 % | 28.4 % | 29 / 123 | 0.409 | 13.6 % | 56 (5.02) | 3218 (288.35) | 10 (0.90) | 4 (0.36) | 33 (2.96) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-ko | 60.1 % | 27.5 % | 12.5 % | 38.8 % | 27 / 123 | 0.697 | 63.2 % | 96 (9.49) | 3138 (310.08) | 12 (1.19) | 4 (0.40) | 34 (3.36) | 1 (0.10) | 0 (0) | 0 (0) | lost 24, unlocated 2, floor 1 |
| 1512.03385v1-ru | 57.2 % | 29.8 % | 13.0 % | 32.7 % | 33 / 123 | 0.838 | 0.0 % | 61 (6.33) | 3083 (320.11) | 7 (0.73) | 0 (0) | 33 (3.43) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 7, unlocated 2 |
| 1512.03385v1-zh | 55.9 % | 27.5 % | 16.6 % | 38.6 % | 27 / 123 | 1.129 | 100.0 % | 88 (9.34) | 3118 (331.03) | 12 (1.27) | 4 (0.42) | 34 (3.61) | 1 (0.11) | 0 (0) | 0 (0) | lost 24, unlocated 2, floor 1 |
| 1706.03762v7-de | 88.6 % | 6.9 % | 4.5 % | 64.7 % | 9 / 110 | 0.187 | 40.0 % | 7 (0.72) | 2614 (267.53) | 7 (0.72) | 31 (3.17) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 3 |
| 1706.03762v7-es | 90.1 % | 6.7 % | 3.2 % | 69.0 % | 8 / 110 | 0.149 | 53.9 % | 3 (0.30) | 2709 (272.54) | 7 (0.70) | 38 (3.82) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 2 |
| 1706.03762v7-fr | 90.6 % | 6.6 % | 2.8 % | 67.2 % | 7 / 110 | 0.123 | 58.5 % | 3 (0.30) | 2716 (271.74) | 7 (0.70) | 39 (3.90) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 1 |
| 1706.03762v7-ja | 87.5 % | 7.0 % | 5.5 % | 48.5 % | 10 / 110 | 0.311 | 87.5 % | 12 (1.24) | 2590 (268.45) | 7 (0.73) | 52 (5.39) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 4 |
| 1706.03762v7-ko | 76.2 % | 6.7 % | 17.1 % | 53.3 % | 7 / 110 | 0.719 | 100.0 % | 16 (1.90) | 2598 (308.99) | 7 (0.83) | 48 (5.71) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 1 |
| 1706.03762v7-ru | 87.5 % | 7.0 % | 5.5 % | 51.9 % | 10 / 110 | 0.192 | 36.9 % | 1 (0.10) | 2693 (279.15) | 7 (0.73) | 46 (4.77) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 4 |
| 1706.03762v7-zh | 71.8 % | 6.6 % | 21.5 % | 55.5 % | 6 / 110 | 0.842 | 100.0 % | 7 (0.88) | 2696 (340.19) | 7 (0.88) | 50 (6.31) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6 |
| 1810.04805v2-de | 57.9 % | 29.9 % | 12.3 % | 53.2 % | 29 / 128 | 0.785 | 0.0 % | 6 (0.70) | 3361 (390.81) | 6 (0.70) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 7, unlocated 4 |
| 1810.04805v2-es | 60.0 % | 30.2 % | 9.8 % | 60.7 % | 30 / 128 | 0.624 | 3.2 % | 3 (0.34) | 3411 (382.19) | 8 (0.90) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 8, unlocated 4 |
| 1810.04805v2-fr | 59.9 % | 30.1 % | 10.0 % | 51.2 % | 29 / 128 | 0.609 | 6.5 % | 5 (0.56) | 3404 (382.13) | 8 (0.90) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 7, unlocated 4 |
| 1810.04805v2-ja | 59.3 % | 33.9 % | 6.8 % | 43.8 % | 30 / 128 | 0.523 | 11.9 % | 5 (0.57) | 3386 (384.25) | 8 (0.91) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, brackets 4, unlocated 4 |
| 1810.04805v2-ko | 54.4 % | 31.3 % | 14.4 % | 57.2 % | 28 / 128 | 0.923 | 72.1 % | 9 (1.11) | 3268 (404.45) | 8 (0.99) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, unlocated 4, brackets 2 |
| 1810.04805v2-ru | 58.1 % | 29.5 % | 12.4 % | 50.2 % | 30 / 128 | 0.693 | 3.1 % | 4 (0.46) | 3563 (412.38) | 8 (0.93) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 8, unlocated 4 |
| 1810.04805v2-zh | 53.4 % | 29.1 % | 17.6 % | 43.8 % | 26 / 128 | 1.316 | 92.2 % | 4 (0.50) | 3543 (446.56) | 8 (1.01) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, unlocated 4 |
| 2307.16209v1-zh | 34.4 % | 27.8 % | 37.8 % | 55.6 % | 122 / 514 | 1.130 | 96.6 % | 7750 (236.04) | 151498 (4614.20) | 64 (1.95) | 3 (0.09) | 4 (0.12) | 42 (1.28) | 0 (0) | 0 (0) | lost 99, unlocated 14, floor 7, missing 2 |
| 2608.04322v1-de | 67.1 % | 17.8 % | 15.1 % | 27.4 % | 13 / 134 | 0.987 | 0.0 % | 2 (0.15) | 4439 (326.37) | 94 (6.91) | 23 (1.69) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 3, unlocated 1 |
| 2608.04322v1-es | 69.6 % | 17.2 % | 13.2 % | 29.7 % | 13 / 134 | 0.976 | 0.0 % | 1 (0.07) | 4450 (315.60) | 94 (6.67) | 26 (1.84) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 3, unlocated 1 |
| 2608.04322v1-fr | 68.6 % | 17.4 % | 14.0 % | 22.0 % | 15 / 134 | 1.144 | 0.0 % | 1 (0.07) | 4470 (321.77) | 94 (6.77) | 21 (1.51) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 5, unlocated 1 |
| 2608.04322v1-ja | 73.7 % | 17.2 % | 9.1 % | 25.6 % | 15 / 134 | 0.686 | 16.5 % | 3 (0.20) | 4571 (306.06) | 94 (6.29) | 67 (4.49) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 5, unlocated 1 |
| 2608.04322v1-ko | 62.9 % | 20.4 % | 16.7 % | 23.4 % | 13 / 134 | 1.056 | 100.0 % | 6 (0.47) | 4231 (331.87) | 94 (7.37) | 71 (5.57) | 1 (0.08) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 2, brackets 1, unlocated 1 |
| 2608.04322v1-ru | 67.5 % | 18.2 % | 14.4 % | 17.9 % | 19 / 134 | 0.920 | 0.0 % | 0 (0) | 4430 (324.04) | 94 (6.88) | 71 (5.19) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 9, unlocated 1 |
| 2608.04322v1-zh | 61.0 % | 13.7 % | 25.3 % | 21.8 % | 10 / 134 | 1.583 | 97.9 % | 2 (0.16) | 4695 (380.04) | 94 (7.61) | 74 (5.99) | 1 (0.08) | 0 (0) | 0 (0) | 0 (0) | lost 9, unlocated 1 |

Every measure of every output, and of every page, is in layer-fidelity.json.

