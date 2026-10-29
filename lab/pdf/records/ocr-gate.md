# The bitmap figures' gate (lab/pdf/spikes/ocr-gate.mjs)

Stage 6 of `docs/route/orphan-text.md`, the content class `ocr` (`docs/PDF-READER.md` §19.15): each paper's base page read by the
bitmap figures' pass (`pipeline/ocr-pass.mjs`) with the extension's recogniser run as the web's box runs it (onnxruntime-web's
Node build, one thread, `@napi-rs/canvas`, the package's model files), its images and labels counted by what became of each, and
every page holding a drawn label rendered by PDF.js in Node at scale 2 with the labels' patches painted as the reader paints them:
P (every patch inside an image the page paints), L (no two labels' lines overlap), C (no patch over ink of another colour than its
label's), D (no stroke across a patch's edge), A (every image and label accounted for). Counts and ids only.

## Run of 2026-10-25 (engine `feat/bitmap-figure-text` on `next` e95ed180)

**The gate pack's 7 bases** (the pack's `<id>-zh/base.pdf`, our final pass of each), on this machine (Apple M4 Pro, Node 22, the
machine shared with other runs: times are readings, not bounds):

| Paper | Images painted | Read | Small | Again | Lines | Labels | Drawn | Left (why) | Pass s | Recogniser s | P | L | C | D | A |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0.2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 1706.03762v7 | 3 | 3 | 0 | 0 | 48 | 31 | 25 | 6 busy | 2.6 | 2.0 | 0 | 0 | 0 | 0 | 0 |
| 1810.04805v2 | 38 | 1 | 32 | 5 | 0 | 0 | 0 | — | 0.4 | 0.2 | 0 | 0 | 0 | 0 | 0 |
| 2307.16209v1 | 8 | 8 | 0 | 0 | 47 | 9 | 2 | 5 busy, 1 crowded, 1 overlap | 2.2 | 1.5 | 0 | 0 | 0 | 0 | 0 |
| 2608.04322v1 | 6 | 5 | 1 | 0 | 87 | 40 | 18 | 21 busy, 1 overlap | 2.4 | 1.9 | 0 | 0 | 0 | 0 | 0 |
| 2608.16117v1 | 41 | 41 | 0 | 0 | 636 | 98 | 42 | 36 busy, 20 overlap | 23.2 | 15.8 | 0 | 0 | 0 | 0 | 0 |
| 2609.26457v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0.1 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Pack** | **96** | **58** | **33** | **5** | **818** | **178** | **87** | **68 busy, 22 overlap, 1 crowded** | | | **0** | **0** | **0** | **0** | **0** |

1512.03385v1 and 2609.26457v1 paint no bitmap (their figures are vector: §19.12's); 1810.04805v2's 38 images are 32 icons under
the pages' bounds and one image painted six times, which holds no line. Of 2608.16117v1's 23.2 s, the recogniser took 15.8, the
labels' reading 2.8, PDF.js's decoding 3.0 and the digests 1.2. A label is left `busy` most where a plot's line, a node's border or
a coloured highlight stands within its ring (the Transformer's "Add & Norm" boxes, 2608.16117v1's axis titles over grid lines),
and `overlap` where its box meets another line's ink (a label over its count, "Geography" over "(13)", whose descenders reach into
the count's box). Before the patch's edge band read every pixel at its edge (a glyph's faint tip within NEAR_EDGE), two labels of
1706.03762v7's embeddings left a descender's speck between two lines' patches; a label of several lines is now one patch over its
block.

## Run of 2026-10-29 (engine `feat/bitmap-figure-text` merged with `next` 8ecf231a; the box's runtime, `--ort-node`)

The same 7 bases (pack e8e9eeb5's), the recogniser on onnxruntime-node 1.30.0's CPU build (one thread), as the web's box runs it,
with this run's drawing rules (a set at one size, runs by script) and bounds (OCR_PAGE_PIXELS_MAX 64 million pixels a page):

| Paper | Images painted | Read | Small | Big | Again | Lines | Labels | Drawn | Left (why) | Sets (labels) | Recogniser s | P | L | C | D | A |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 1706.03762v7 | 3 | 3 | 0 | 0 | 0 | 48 | 31 | 25 | 6 busy | 4 (13) | 1.0 | 0 | 0 | 0 | 0 | 0 |
| 1810.04805v2 | 38 | 1 | 32 | 0 | 5 | 0 | 0 | 0 | — | 0 | 0.0 | 0 | 0 | 0 | 0 | 0 |
| 2307.16209v1 | 8 | 8 | 0 | 0 | 0 | 47 | 9 | 2 | 5 busy, 1 crowded, 1 overlap | 0 | 1.0 | 0 | 0 | 0 | 0 | 0 |
| 2608.04322v1 | 6 | 5 | 1 | 0 | 0 | 87 | 40 | 18 | 21 busy, 1 overlap | 4 (8) | 0.8 | 0 | 0 | 0 | 0 | 0 |
| 2608.16117v1 | 41 | 40 | 0 | 1 | 0 | 624 | 97 | 42 | 36 busy, 19 overlap | 1 (2) | 11.3 | 0 | 0 | 0 | 0 | 0 |
| 2609.26457v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

2608.16117v1's page of 64.7 million pixels holds the one image past OCR_PAGE_PIXELS_MAX (`big`), and its other 40 images give 624
lines (636 with all 41). Of the sets' 23 labels, 10 took their column's edge as their anchor and 20 their set's median size. The WebAssembly
build and the native one read the same text on all 818 lines of the 57 images both read (DESIGN §15.4).

## Run of 2026-10-29, later (the caps at 16 million pixels; a label's lines laid as one block)

The same 7 bases and runtime. OCR_PIXELS_MAX and OCR_PAGE_PIXELS_MAX at 16 million pixels each (from 40 and 64 million): the box's
pass holds some 46 to 50 bytes a pixel of the page it reads (natively, 2610.16663v1's page of 20.6 million pixels 950 MiB over the
pass at rest; in the website's box, 2610.19274v1's page of 14.7 million its OCR child's data size 1,364 MiB of its 1,472), so that
a page past 16 million took the child past 70 % of its limit, and 2610.16663v1's of 55.5 million to the limit itself, where the
child held until its clock and the paper had none of its labels. A label's lines that run one way are laid as one block
(`ocr-fit.mjs blockOf`); the counts below do not move with it, the places of the drawn text do.

| Paper | Images painted | Read | Small | Big | Again | Lines | Labels | Drawn | Left (why) | Sets (labels) | Recogniser s | P | L | C | D | A |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 1706.03762v7 | 3 | 3 | 0 | 0 | 0 | 48 | 31 | 25 | 6 busy | 4 (13) | 1.1 | 0 | 0 | 0 | 0 | 0 |
| 1810.04805v2 | 38 | 1 | 32 | 0 | 5 | 0 | 0 | 0 | — | 0 | 0.0 | 0 | 0 | 0 | 0 | 0 |
| 2307.16209v1 | 8 | 8 | 0 | 0 | 0 | 47 | 9 | 2 | 5 busy, 1 crowded, 1 overlap | 0 | 1.2 | 0 | 0 | 0 | 0 | 0 |
| 2608.04322v1 | 6 | 5 | 1 | 0 | 0 | 87 | 40 | 18 | 21 busy, 1 overlap | 4 (8) | 0.8 | 0 | 0 | 0 | 0 | 0 |
| 2608.16117v1 | 41 | 22 | 0 | 19 | 0 | 303 | 36 | 11 | 16 busy, 9 overlap | 0 | 6.2 | 0 | 0 | 0 | 0 | 0 |
| 2609.26457v1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

2608.16117v1 is the cost: 19 of its 41 images are past the caps (18 of them over 8 million pixels, its pages up to 64.7 million), and
11 of its 42 labels drawn before are drawn now. In the box it drew none before: its pages hold four times what the OCR child's
limit leaves. Of the 1,615 images the 183 surveyed papers paint, 65 (in 14 papers) are past 16 million. The caps rise when the pass
holds less a pixel (a page's images decoded one at a time, fewer copies of each: the website's record, its OCR measurement).

## Run of 2026-10-29, round 2 (each image read from its own object at 16 million pixels at most, keyed by its bytes)

The caps of 16 million pixels an image and a page are gone. Each image is read from its own object in the PDF, keyed by its stream's
bytes (a cached image is placed with nothing decoded), and its pixels are read at OCR_READ_PIXELS at most: a Flate stream inflated a
row at a time, scaled down as it comes, so that what a read holds is the pixels it reads. A line read under OCR_LINE_MIN_PX pixels
across is read again in its window at the image's own pixels, and each label of a scaled image is judged again there.

The pack's 7 bases: P, L, C, D, A 0 on all 7. The images within 16 million pixels read as before, the same lines and the same labels
(1706.03762v7 25, 2307.16209v1 2, 2608.04322v1 18). 2608.16117v1 reads all 41 of its images and draws 40 labels, against 11 under
the caps and 42 under the 64 million of before.

The 14 papers of the survey whose images pass 16 million pixels (their arXiv PDFs), `--bases`, before (the engine at 4ba61239, the
caps) and after:

| Paper | Images read, before → after (of painted) | Labels drawn, before → after |
|---|---|---|
| 2608.05876v1 | 3 → 4 (4) | 50 → 81 |
| 2608.07584v1 | 3 → 4 (4) | 24 → 34 |
| 2608.08880v1 | 6 → 7 (15) | 13 → 39 |
| 2608.11761v1 | 21 → 22 (22) | 101 → 111 |
| 2608.12255v1 | 10 → 12 (12) | 26 → 27 |
| 2608.12333v1 | 7 → 8 (9) | 47 → 51 |
| 2608.16117v1 | 22 → 41 (41) | 11 → 40 |
| 2608.20990v1 | 0 → 3 (3) | 0 → 2 |
| 2608.25928v1 | 16 → 24 (24) | 96 → 147 |
| 2608.29778v1 | 1 → 4 (4) | 8 → 23 |
| 2610.16663v1 | 0 → 29 (29) | 0 → 49 |
| 2610.20595v1 | 5 → 6 (66) | 0 → 3 |
| 2610.21084v1 | 17 → 18 (20) | 79 → 79 |
| 2610.21770v1 | 1 → 5 (5) | 16 → 18 |
| all | 112 → 187, none past a bound | 471 → 704 |

The gate's failures on them are the same before and after on the images both read: 2608.08880v1 p3, 2608.11761v1 p5, p19 (its
legend over its own plot's lines), p31, 2608.12255v1 one D each. One more is on an image only the bounded read reaches:
2608.25928v1 p18 "Batch Q (Sample 1)", D, whose patch cuts a stroke. It is the same at the image's own pixels
(`--read-pixels=100000000`: 146 labels, that one D), so it is the label rule's, not the read's. These are papers outside the pack;
the gate holds the pack.
