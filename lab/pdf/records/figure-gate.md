# The figures' text gate (lab/pdf/spikes/figure-gate.mjs)

Stage 5 of `docs/route/orphan-text.md`, the content class `figures` (`docs/PDF-READER.md` §19.12): each paper's final pass wrapped
as `wrapFinal` wraps it over its source units, its figure units counted by what became of them, and every page holding a drawn
one rendered by PDF.js in Node at scale 2: G1 (every group shown is the page wrapped without the figures, a split show's
antialiasing within the ocg gate's allowance), G3f (hiding the figures changes pixels inside their own bands alone), D (each drawn
band loses its ink: no double ink), O (each band then one colour: nothing a translation drawn there could cover). Counts and ids
only.

## Run of 2026-10-25, the pack 09208b43 (engine `feat/figure-text` on `next` 1cdca756)

**The gate pack's 7 bases** (the pack `09208b43`, LAYOUT 21: #473's `093304a2` with 1810.04805v2's seven base pages and records
made again by this engine, `layer-fixtures.mjs --offline`, its pgfplots axis now between its points; its layout files and
translations byte for byte the same; their sources, the marking's texts):

| Paper | Units | Drawn | Crowded | Forms written again | Letters | G1 | G3f | D | O |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 181 | 166 | 15 | 7 | 968 | 0 | 0 | 0 | 0 |
| 1706.03762v7 | 240 | 169 | 71 | 5 | 1,006 | 0 | 0 | 0 | 0 |
| 1810.04805v2 | 146 | 119 | 27 | 4 | 729 | 0 | 0 | 0 | 0 |
| 2307.16209v1 | 56 | 56 | 0 | 26 | 116 | 0 | 0 | 0 | 0 |
| 2608.04322v1 | 237 | 180 | 57 | 8 | 1,861 | 0 | 0 | 0 | 0 |
| 2608.16117v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2609.26457v1 | 170 | 156 | 14 | 10 | 1,826 | 0 | 0 | 0 | 0 |
| **Pack** | **1,030** | **846** | **184** | **60** | **6,506** | **0** | **0** | **0** | **0** |

No unit of a font of no Unicode, of a form shared or past a page's bounds. (A unit's room is read against what may meet its band
on the page alone: a box apart from it there is no ink of its room, so a turned label is no longer crowded by a long rule a page
box's extent in its frame reached over, 2609.26457v1's "AIRA*" at 30 degrees.) 13 pixels of G1 lie in split shows (1512.03385v1 p4,
2609.26457v1), each within Δ 16. Before the clip rule two titles of 1706.03762v7's cropped attention figures (its viewport cuts
them off: nothing is shown there) were cut into units and failed D; they are now left out (`clipped`). On the bases before
(LAYOUT 20, no points in a TikZ picture) the pack held 1,022 units, 842 drawn: the 8 units, 4 drawn, it gains are
1810.04805v2's TikZ text. The ink units of #471 are the same with the figure units and without them on every paper (the
figures' glyphs are the ledger's `figures`, never an ink unit's), and the ocg gate's proofs are as before.

**The 25-paper set** (the release sweep's papers with sources in `lab/pdf/data/layout`), made again under LAYOUT 21 by
`figure-final.mjs` (the pinned TL2025 image; 23 of 25: 2610.20595v1 needs TeX Live 2023, 2610.21765v1 is a `latex` paper the
script's host does not run):

| Set | Papers with figure units | Units | Drawn | Crowded | Forms written again | Letters | G1 | G3f | D | O |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 23 papers | 16 | 1,469 | 1,216 | 253 | 99 | 17,621 | 0 | 0 | 0 | 0 |

The TikZ and pgfplots papers among them: 2610.20285v1 (12 units, all drawn), 2610.21085v1 (63 of 71), 2610.21491v1 (34 of 37),
2610.21880v1 (66 of 83, nine pgfplots axes), 2610.22214v1 (70 of 108, eight axes, its tick labels turned 30 degrees).

**Chromium** (`ocg-gate.mjs --canvas=gpu` on the pack, every page): G1 against our unwrapped page 0 px but 2608.04322v1 p9 and
2609.26457v1 p2, the two pages §19.9 records Chromium differing from itself on in a long-lived browser; the delta proof passes
where a delta is made.

**The delta** (the wrap with and without the figures, `deltaOf` over arXiv's PDF): a form written again is copied into the delta
and appended to the full base whole, its children reused. On the 25-paper set no paper's delta passes its bound for the figures
(2610.11256v1 and 2610.21924v1 are past it without them too); the full bases grow by 0 to 20 % (2610.21924v1's two scatter plots, 4.1 MB of their 4.5). On the pack
two deltas pass their bound with the figures (2307.16209v1: 0.87 MB to 1.82 MB, 26 forms; 2609.26457v1: 0.25 MB to 0.40 MB),
so those two papers are held whole (`full`), as about one paper in six already is; the others' deltas grow by 7 % to 66 %.
