# The figures' text gate (lab/pdf/spikes/figure-gate.mjs)

Stage 5 of `docs/route/orphan-text.md`, the content class `figures` (`docs/PDF-READER.md` §19.12): each paper's final pass wrapped
as `wrapFinal` wraps it over its source units, its figure units counted by what became of them, and every page holding a drawn
one rendered by PDF.js in Node at scale 2: G1 (every group shown is the page wrapped without the figures, a split show's
antialiasing within the ocg gate's allowance), G3f (hiding the figures changes pixels inside their own bands alone), D (each drawn
band loses its ink: no double ink), O (each band then one colour: nothing a translation drawn there could cover); since
2026-10-29 R (each drawn unit's room, the free line beside its box a longer translation may take, then one colour too), the sets
(`figure-text.mjs` setsOf) and the fit rule's counts, label by label as BUNDLE 10 drew them against set by set (`figure-fit.mjs`
fitFigureSet), over a model of zh translations or Microsoft's. Counts and ids only.

## Run of 2026-11-01, the pack c9a45bd9 (engine `fix/sweep-6e0a` against `next` 8b4203856, PIPELINE 46)

A glyph set turned is cut by the clip where its own ink passes it (`layout/ink.mjs` `turnedGlyph`, `docs/PDF-READER.md` §19.12).
The pack's base pages hold no driver group since PIPELINE 44, so their forms clip by their BBox; `next`'s reading cut every
turned title at a figure's edge. The model's translations, both sides on the pack as it is (the change moves no layout file and
no base page):

| Paper | Units next → head | Drawn next → head | G1 | G3f | D | O | R |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 176 → 181 | 164 → 166 | 0 | 0 | 0 | 0 | 0 |
| 1706.03762v7 | 240 → 244 | 169 → 171 | 0 | 0 | 0 | 0 | 0 |
| 1810.04805v2 | 146 → 146 | 119 → 119 | 0 | 0 | 0 | 0 | 0 |
| 2307.16209v1 | 56 → 56 | 56 → 56 | 0 | 0 | 0 | 0 | 0 |
| 2608.04322v1 | 218 → 237 | 174 → 180 | 0 | 0 | 0 | 0 | 0 |
| 2609.26457v1 | 170 → 172 | 156 → 158 | 0 | 0 | 0 | 0 | 0 |

1512.03385v1 and 2608.04322v1 are back at the counts of the run of 2026-10-29 below (181 and 166, 237 and 180), made over the
bases with the group. 1706.03762v7 gains p13 and p14's `<pad>` labels at its attention figures' right edge, shown whole on
arXiv's page; its cropped "Input-Input Layer5" titles stay the original's. `ocg-gate.mjs` (GPU) on the four TeX Live 2025
papers: the proof passes, G1 0 but one run of 2608.04322v1 p9 at 18 px, 0 when run again on the GPU and the CPU canvas (the page
of §19.9 on which Chromium differs from itself).

## Run of 2026-10-29, the pack ad76c514 (engine `fix/figure-text-groups` merged with `next` 25b498b0, LAYOUT 25)

The owner's rule of 2026-10-29 (`docs/PDF-READER.md` §19.12, its set and its room): a figure's labels of one group at one size,
each from its original's edge, a translation into the free line beside it, a group that cannot fit shrinking as one. The wrap is
the same (every unit cut, crowded and drawn as on `next`: the base engine's gate gives the same counts, and its G1, G3f, D and O
are 0 on every paper as here); what changes is each drawn unit's anchor (its column's), its set and its room, which the rows of
BUNDLE5 11 carry.

**The fit's translations.** The pack holds no translation of a figure unit, so the fit is counted twice: over a MODEL of zh (a
CJK em for every 2.7 of a label's letters, two at least, its digits kept, 0.55 em each: a model, not a translator's answers), and
on three papers over Microsoft's answers (mt.mjs translateUnits over translateTexts, as the fixture maker asks; a label whose
translation says its source again is not drawn on either side), each translation's width by kind of character (a CJK character
or a full-width sign an em, a space 0.3, any other 0.55). "10" is BUNDLE 10's layer: each label alone in its box, to the floor
(0.6) at most, and a translation that mixes CJK with a Latin letter or a digit not drawn (its one CJK face, as the web serves
it, holds no Latin: `served`; in the model, a label with a digit); "11" this one's: set by set, rooms taken, every translation
in its runs by script.

**The gate pack's 7 bases**, the model's translations (2608.16117v1 holds no figure text):

| Paper | Units | Drawn | Sets | Units in sets | Anchors moved | With room | G1 | G3f | D | O | R | Labels drawn 10 → 11 | At full size 10 → 11 | Sets of mixed sizes 10 → 11 | Sets resized |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 181 | 166 | 24 | 178 | 11 | 162 | 0 | 0 | 0 | 0 | 0 | 25 → 166 | 21 → 150 | 0 → 0 | 15 |
| 1706.03762v7 | 240 | 169 | 5 | 240 | 72 | 165 | 0 | 0 | 0 | 0 | 0 | 124 → 158 | 60 → 158 | 4 → 0 | 4 |
| 1810.04805v2 | 146 | 119 | 30 | 120 | 6 | 115 | 0 | 0 | 0 | 0 | 0 | 108 → 118 | 80 → 100 | 2 → 0 | 7 |
| 2307.16209v1 | 56 | 56 | 20 | 40 | 0 | 54 | 0 | 0 | 0 | 0 | 0 | 56 → 56 | 4 → 52 | 0 → 0 | 20 |
| 2608.04322v1 | 237 | 180 | 37 | 225 | 31 | 180 | 0 | 0 | 0 | 0 | 0 | 135 → 180 | 119 → 174 | 8 → 0 | 19 |
| 2609.26457v1 | 170 | 156 | 36 | 141 | 18 | 154 | 0 | 0 | 0 | 0 | 0 | 141 → 152 | 134 → 132 | 2 → 0 | 7 |
| **All** | **1,030** | **846** | **152** | **944** | **138** | **830** | **0** | **0** | **0** | **0** | **0** | **589 → 830** | **418 → 766** | **16 → 0** | **72** |

**The 25-paper set** (`lab/pdf/data/layout`, made again by `figure-final.mjs` on this engine: 24 of 25, 2610.21765v1 a `latex` paper the script's host does not run; 2610.20595v1 on TeX Live 2023), the model's translations, the 16 papers with figure units:

| Paper | Units | Drawn | Sets | Units in sets | Anchors moved | With room | G1 | G3f | D | O | R | Labels drawn 10 → 11 | At full size 10 → 11 | Sets of mixed sizes 10 → 11 | Sets resized |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2602.23285v2 | 73 | 63 | 16 | 48 | 9 | 60 | 0 | 0 | 0 | 0 | 0 | 59 → 63 | 56 → 63 | 2 → 0 | 4 |
| 2610.11256v1 | 75 | 75 | 11 | 71 | 33 | 75 | 0 | 0 | 0 | 0 | 0 | 22 → 75 | 20 → 75 | 2 → 0 | 8 |
| 2610.20285v1 | 12 | 12 | 2 | 7 | 0 | 11 | 0 | 0 | 0 | 0 | 0 | 12 → 12 | 3 → 4 | 0 → 0 | 1 |
| 2610.20484v1 | 5 | 2 | 1 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 → 2 | 1 → 1 | 0 → 0 | 0 |
| 2610.20848v1 | 34 | 33 | 5 | 10 | 6 | 33 | 0 | 0 | 0 | 0 | 0 | 30 → 33 | 29 → 33 | 0 → 0 | 0 |
| 2610.21085v1 | 71 | 63 | 20 | 61 | 12 | 61 | 0 | 0 | 0 | 0 | 0 | 58 → 60 | 48 → 59 | 4 → 0 | 6 |
| 2610.21098v1 | 350 | 321 | 63 | 342 | 42 | 296 | 0 | 0 | 0 | 0 | 0 | 161 → 286 | 146 → 235 | 8 → 0 | 37 |
| 2610.21176v1 | 122 | 92 | 32 | 104 | 24 | 90 | 0 | 0 | 0 | 0 | 0 | 64 → 92 | 62 → 91 | 1 → 0 | 10 |
| 2610.21288v1 | 25 | 23 | 6 | 17 | 1 | 23 | 0 | 0 | 0 | 0 | 0 | 20 → 22 | 18 → 20 | 2 → 0 | 2 |
| 2610.21491v1 | 37 | 34 | 9 | 30 | 14 | 34 | 0 | 0 | 0 | 0 | 0 | 29 → 34 | 28 → 34 | 1 → 0 | 4 |
| 2610.21827v1 | 16 | 3 | 6 | 14 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 3 → 3 | 3 → 3 | 0 → 0 | 0 |
| 2610.21880v1 | 83 | 66 | 10 | 41 | 4 | 65 | 0 | 0 | 0 | 0 | 0 | 61 → 66 | 56 → 66 | 3 → 0 | 5 |
| 2610.21924v1 | 135 | 86 | 23 | 121 | 43 | 81 | 0 | 0 | 0 | 0 | 0 | 77 → 86 | 70 → 77 | 4 → 0 | 7 |
| 2610.22065v1 | 121 | 89 | 24 | 64 | 6 | 86 | 0 | 0 | 0 | 0 | 0 | 78 → 89 | 72 → 89 | 5 → 0 | 7 |
| 2610.22195v1 | 202 | 184 | 37 | 152 | 9 | 183 | 0 | 0 | 0 | 0 | 0 | 164 → 184 | 160 → 184 | 4 → 0 | 15 |
| 2610.22214v1 | 108 | 70 | 28 | 75 | 18 | 53 | 0 | 0 | 0 | 0 | 0 | 65 → 70 | 47 → 54 | 7 → 0 | 10 |
| **All** | **1,469** | **1,216** | **293** | **1,159** | **223** | **1,156** | **0** | **0** | **0** | **0** | **0** | **905 → 1,177** | **819 → 1,088** | **43 → 0** | **116** |

**Microsoft's translations** (three papers: two of the pack, and 2010.11929v2 made by `figure-final.mjs`; a label whose translation says its source again is not counted):

| Paper | Units | Drawn | Sets | Units in sets | Anchors moved | With room | G1 | G3f | D | O | R | Labels drawn 10 → 11 | At full size 10 → 11 | Sets of mixed sizes 10 → 11 | Sets resized |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 181 | 166 | 24 | 178 | 11 | 162 | 0 | 0 | 0 | 0 | 0 | 21 → 140 | 16 → 124 | 0 → 0 | 14 |
| 1810.04805v2 | 146 | 119 | 30 | 120 | 6 | 115 | 0 | 0 | 0 | 0 | 0 | 47 → 57 | 30 → 42 | 2 → 0 | 7 |
| 2010.11929v2 | 119 | 87 | 22 | 77 | 26 | 87 | 0 | 0 | 0 | 0 | 0 | 39 → 68 | 34 → 58 | 4 → 0 | 8 |
| **All** | **446** | **372** | **76** | **375** | **43** | **364** | **0** | **0** | **0** | **0** | **0** | **107 → 265** | **80 → 224** | **6 → 0** | **29** |

The two R failures of the first run on the 25-paper set, and the four of a second, were the room's own: a caption laid over a
screenshot in 2602.23285v2 (an image behind its band, taken as its ground: its pixels beside the box are no ground, so an image's
or a shading's ground now leaves no room), 2610.21924v1's "ARCHIVE" node (a rounded node past the page's shapes, its box taken as
its ground's edge: a ground of unknown lines now ends the free line a band's height inside its edges), and three bars of
2610.21924v1 whose rectangles' edges, single floats, fell a hair past their own clipped boxes and were dropped by the clip's
clamp (now within 0.05). One unit of 2602.23285v2 had turned crowded on the first run, a clipped line's unclipped segment
reaching it once the scan went past the reach: crowding and the anchor read alone are read within the reach again, and on every
paper of both sets the wrap's counts (units, drawn, crowded, forms) are `next`'s. After the review of #490 (a clipped ground's
edge, and a room stopping short of a unit of another direction's) every count above is as before but 2610.21924v1's labels at
their full size, 84 to 77: its turned and level labels round its scatter plots now leave each other's line. A turned label's
room then ends where its band leaves its figure or its page (the review's third finding): 2610.22214v1's labels with room
55 to 53, every other count as before. The numbers above are of the final engine, merged with `next` 25b498b0 (#487) and
measured on the pack ad76c514 (its base pages and sources the bytes of e8e9eeb5's, its layout files LAYOUT 25's), where the pack
gives every count of e8e9eeb5; `next` 25b498b0's own engine gives the same wrap counts on both sets, and G1, G3f, D and O 0.

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
