# The instant layer against the original: the fidelity record

Written by `spikes/layer-gate.mjs --record`. Each run below: the engine at its commit, Chromium 153.0.8010.12, PDF.js 6.3.289; pages: the first 12 of each output, every page of 2307.16209v1; the planes at 2.5 device px a PDF unit, lost ink at 2x; crops drawn source-over.

- **pixel**: the engine at `cdee0a92` (exp/layer-t12-gate), the gate at `cdee0a92`, 2026-10-06; the engine's own layout files; 42.3 s.
- **pixel-fixed**: the engine at `cdee0a92` (exp/layer-t12-gate), the gate at `cdee0a92`, 2026-10-06; the fixtures' layout files, as made for the layer lab; 43.1 s.

Every measure is against arXiv's original page, whose own value is the first column. The prototype is the approved prototype's floor (the parity run, 2026-10-06, on the ten outputs it shares with the engine, pages 1-12). A defect is its count and, in brackets, its rate per 1,000 translated text cells (the model tier: per 1,000 cells of the drawn units' frames), which is what the merge rule compares.

## Against the original

| measure | Original | Prototype (floor), shared ten | pixel, shared ten | pixel, all 29 | pixel-fixed, shared ten | pixel-fixed, all 29 |
|---|---|---|---|---|---|---|
| text translated | 100.0 % | 90.7 % | 68.8 % | 66.0 % | 68.8 % | 65.9 % |
| text English | 0.0 % | 0.5 % | 20.0 % | 22.7 % | 20.0 % | 22.8 % |
| text blank | 0.0 % | 8.8 % | 11.3 % | 11.4 % | 11.2 % | 11.3 % |
| table cells translated | 100.0 % | 6.1 % | 41.5 % | 39.1 % | 41.5 % | 39.1 % |
| text units left English | 0 | 7 / 1194 | 186 / 1194 | 684 / 3979 | 186 / 1194 | 686 / 3979 |
| cells left English | 0 | 635 / 686 | 217 / 686 | 499 / 1601 | 217 / 686 | 499 / 1601 |
| fill (median) | 1 | 0.916 | 0.888 | 0.885 | 0.888 | 0.885 |
| blank lines / frame | 0 | 0.611 | 0.823 | 0.817 | 0.820 | 0.815 |
| frames with a blank line | 0.0 % | 27.0 % | 37.0 % | 36.1 % | 36.9 % | 36.0 % |
| pitch spread | 0 | 0.088 | 0.047 | 0.056 | 0.047 | 0.076 |
| size (median) | 1 | 0.978 | 0.957 | 0.941 | 0.957 | 0.941 |
| full size | 100.0 % | 64.0 % | 59.8 % | 47.1 % | 59.8 % | 46.8 % |
| size spread | 0 | 0.069 | 0.038 | 0.019 | 0.038 | 0.019 |
| frames past the right edge | 0.0 % | 14.0 % | 0.0 % | 0.9 % | 0.0 % | 0.9 % |
| overlap regions | 0 | 119 (0.90) | 324 (3.21) | 8396 (23.72) | 326 (3.23) | 8451 (23.91) |
| stray text | 0 | 62 (0.47) | 2 (0.02) | 8 (0.02) | 2 (0.02) | 8 (0.02) |
| residue regions | 0 | 587 (4.41) | 31311 (310.48) | 247098 (698.15) | 31337 (310.53) | 246592 (697.76) |
| erase bites | 0 | 168 (1.26) | 171 (1.70) | 902 (2.55) | 170 (1.69) | 893 (2.53) |
| vanished math | 0 | 13 (0.10) | 261 (2.59) | 684 (1.93) | 261 (2.59) | 752 (2.13) |
| doubled crops | 0 | 5 (0.04) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| lost-ink regions | 0 | - | 1 (0.01) | 45 (0.13) | 1 (0.01) | 43 (0.12) |
| graphics px erased | 0 | 208 (1.56) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| graphics px overdrawn | 0 | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| crops with foreign ink | 0 | 11 (0.08) | 135 (1.34) | 247 (0.70) | 135 (1.34) | 248 (0.70) |
| wrong page text | 0 | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| dropped placeholders | 0 | - | 0 (0) | 0 (0) | 0 (0) | 2 (0.01) |
| placeholders missing | 0 | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| placeholders twice | 0 | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| doubled brackets | 0 | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| duplications | 0 | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| clipped characters | 0 | 99 (0.74) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| equation numbers not shown | 0 | - | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| pitch ratio (not gated) | 1 | 1.094 | 1.076 | 1.023 | 1.076 | 1.023 |
| |top shift| (pt) (not gated) | 0 | 0.184 | 0.323 | 0.451 | 0.323 | 0.451 |
| lines on a layout baseline (not gated) | 100.0 % | 49.3 % | 53.3 % | 48.6 % | 55.0 % | 49.1 % |

**Below the prototype's floor on the shared ten** (pixel): text translated, text English, text blank, text units left English, fill (median), blank lines / frame, frames with a blank line, size (median), full size, overlap regions, residue regions, erase bites, vanished math, crops with foreign ink.

## By output (pixel)

| output | text translated | text English | text blank | table cells translated | text units left English | blank lines / frame | full size | overlap regions | residue regions | erase bites | vanished math | crops with foreign ink | lost-ink regions | wrong page text | clipped characters | why left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1512.03385v1-de | 62.8 % | 29.1 % | 8.1 % | 42.3 % | 29 / 123 | 0.685 | 0.0 % | 82 (7.75) | 3053 (288.45) | 12 (1.13) | 4 (0.38) | 34 (3.21) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-es | 65.5 % | 29.1 % | 5.4 % | 40.8 % | 29 / 123 | 0.499 | 0.0 % | 88 (7.98) | 3066 (277.89) | 12 (1.09) | 4 (0.36) | 34 (3.08) | 1 (0.09) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-fr | 63.3 % | 29.7 % | 7.0 % | 38.0 % | 31 / 123 | 0.733 | 3.1 % | 75 (7.03) | 3086 (289.11) | 12 (1.12) | 4 (0.38) | 34 (3.19) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 5, unlocated 2 |
| 1512.03385v1-ja | 66.7 % | 27.6 % | 5.7 % | 28.9 % | 29 / 123 | 0.409 | 13.6 % | 56 (4.98) | 3218 (286.12) | 10 (0.89) | 4 (0.36) | 33 (2.93) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 3, unlocated 2 |
| 1512.03385v1-ko | 61.7 % | 27.5 % | 10.8 % | 39.5 % | 27 / 123 | 0.697 | 63.2 % | 96 (9.23) | 3138 (301.88) | 12 (1.15) | 4 (0.39) | 34 (3.27) | 1 (0.10) | 0 (0) | 0 (0) | lost 24, unlocated 2, floor 1 |
| 1512.03385v1-ru | 61.0 % | 29.8 % | 9.2 % | 33.3 % | 33 / 123 | 0.838 | 0.0 % | 61 (5.94) | 3083 (300.05) | 7 (0.68) | 0 (0) | 33 (3.21) | 0 (0) | 0 (0) | 0 (0) | lost 24, floor 7, unlocated 2 |
| 1512.03385v1-zh | 58.2 % | 27.5 % | 14.4 % | 39.5 % | 27 / 123 | 1.129 | 100.0 % | 88 (8.98) | 3118 (318.16) | 12 (1.22) | 4 (0.41) | 34 (3.47) | 1 (0.10) | 0 (0) | 0 (0) | lost 24, unlocated 2, floor 1 |
| 1706.03762v7-de | 90.7 % | 6.9 % | 2.4 % | 66.7 % | 9 / 110 | 0.187 | 40.0 % | 7 (0.70) | 2614 (261.24) | 7 (0.70) | 31 (3.10) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 3 |
| 1706.03762v7-es | 91.6 % | 6.7 % | 1.6 % | 69.2 % | 8 / 110 | 0.149 | 53.9 % | 3 (0.30) | 2709 (267.98) | 7 (0.69) | 38 (3.76) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 2 |
| 1706.03762v7-fr | 91.9 % | 6.6 % | 1.4 % | 67.9 % | 7 / 110 | 0.123 | 58.5 % | 3 (0.30) | 2716 (267.85) | 7 (0.69) | 39 (3.85) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 1 |
| 1706.03762v7-ja | 88.4 % | 7.0 % | 4.6 % | 49.2 % | 10 / 110 | 0.311 | 87.5 % | 12 (1.23) | 2590 (265.64) | 7 (0.72) | 52 (5.33) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 4 |
| 1706.03762v7-ko | 78.3 % | 6.7 % | 15.1 % | 56.2 % | 7 / 110 | 0.719 | 100.0 % | 16 (1.85) | 2598 (300.97) | 7 (0.81) | 48 (5.56) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 1 |
| 1706.03762v7-ru | 90.0 % | 7.0 % | 3.0 % | 52.1 % | 10 / 110 | 0.192 | 36.9 % | 1 (0.10) | 2693 (271.28) | 7 (0.70) | 46 (4.63) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6, floor 4 |
| 1706.03762v7-zh | 79.4 % | 6.6 % | 14.0 % | 57.3 % | 6 / 110 | 0.842 | 100.0 % | 7 (0.80) | 2696 (307.76) | 7 (0.80) | 50 (5.71) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | unlocated 6 |
| 1810.04805v2-de | 61.8 % | 29.9 % | 8.3 % | 53.7 % | 29 / 128 | 0.785 | 0.0 % | 6 (0.65) | 3361 (365.64) | 6 (0.65) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 7, unlocated 4 |
| 1810.04805v2-es | 63.5 % | 30.2 % | 6.3 % | 61.2 % | 30 / 128 | 0.624 | 3.2 % | 3 (0.32) | 3411 (361.18) | 8 (0.85) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 8, unlocated 4 |
| 1810.04805v2-fr | 63.8 % | 30.1 % | 6.1 % | 51.7 % | 29 / 128 | 0.609 | 6.5 % | 5 (0.53) | 3404 (358.66) | 8 (0.84) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 7, unlocated 4 |
| 1810.04805v2-ja | 60.2 % | 33.9 % | 5.9 % | 45.3 % | 30 / 128 | 0.523 | 11.9 % | 5 (0.56) | 3386 (378.24) | 8 (0.89) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, brackets 4, unlocated 4 |
| 1810.04805v2-ko | 57.0 % | 31.3 % | 11.7 % | 57.2 % | 28 / 128 | 0.923 | 72.1 % | 9 (1.06) | 3268 (385.38) | 8 (0.94) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, unlocated 4, brackets 2 |
| 1810.04805v2-ru | 62.3 % | 29.5 % | 8.2 % | 50.7 % | 30 / 128 | 0.693 | 3.1 % | 4 (0.43) | 3563 (384.94) | 8 (0.86) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 8, unlocated 4 |
| 1810.04805v2-zh | 56.1 % | 29.1 % | 14.8 % | 45.3 % | 26 / 128 | 1.316 | 92.2 % | 4 (0.48) | 3543 (424.62) | 8 (0.96) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | 0 (0) | lost 18, floor 4, unlocated 4 |
| 2307.16209v1-zh | 52.0 % | 27.4 % | 20.6 % | 55.6 % | 122 / 514 | 1.130 | 96.6 % | 7750 (156.17) | 151498 (3052.86) | 64 (1.29) | 3 (0.06) | 4 (0.08) | 42 (0.85) | 0 (0) | 0 (0) | lost 99, unlocated 14, floor 7, missing 2 |
| 2608.04322v1-de | 71.6 % | 17.8 % | 10.6 % | 27.6 % | 13 / 134 | 0.987 | 0.0 % | 2 (0.14) | 4439 (305.88) | 94 (6.48) | 23 (1.58) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 3, unlocated 1 |
| 2608.04322v1-es | 73.4 % | 17.2 % | 9.4 % | 29.7 % | 13 / 134 | 0.976 | 0.0 % | 1 (0.07) | 4450 (299.18) | 94 (6.32) | 26 (1.75) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 3, unlocated 1 |
| 2608.04322v1-fr | 71.6 % | 17.4 % | 11.0 % | 21.8 % | 15 / 134 | 1.144 | 0.0 % | 1 (0.07) | 4470 (308.21) | 94 (6.48) | 21 (1.45) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 5, unlocated 1 |
| 2608.04322v1-ja | 74.0 % | 17.2 % | 8.8 % | 25.5 % | 15 / 134 | 0.686 | 16.5 % | 3 (0.20) | 4571 (304.94) | 94 (6.27) | 67 (4.47) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 5, unlocated 1 |
| 2608.04322v1-ko | 64.5 % | 20.4 % | 15.1 % | 23.8 % | 13 / 134 | 1.056 | 100.0 % | 6 (0.46) | 4231 (323.79) | 94 (7.19) | 71 (5.43) | 1 (0.08) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 2, brackets 1, unlocated 1 |
| 2608.04322v1-ru | 72.0 % | 18.2 % | 9.8 % | 18.2 % | 19 / 134 | 0.920 | 0.0 % | 0 (0) | 4430 (303.51) | 94 (6.44) | 71 (4.86) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, floor 9, unlocated 1 |
| 2608.04322v1-zh | 65.5 % | 13.7 % | 20.8 % | 21.8 % | 10 / 134 | 1.583 | 97.9 % | 2 (0.15) | 4695 (353.73) | 94 (7.08) | 74 (5.58) | 1 (0.07) | 0 (0) | 0 (0) | 0 (0) | lost 9, unlocated 1 |

Every measure of every output, and of every page, is in layer-fidelity.json.

