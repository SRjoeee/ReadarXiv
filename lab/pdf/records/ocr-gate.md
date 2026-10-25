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
