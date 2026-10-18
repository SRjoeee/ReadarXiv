# The layer bundle's sizes

Written by `spikes/bundle-check.mjs` with the engine at `bb41cf42` on 2026-10-08: each paper's bundle made by `writeBundle` from its units (`openPaper`, `bundleUnitsOf`), the made fixtures' layout (`41795914c3c84238`), the p10 cut's left and the newest cached compact add-on of REMOVAL 4 over the same bytes, and read back by `readBundle` as it was written (the identity held on 5 of 5). A record, not an assertion (the layer-only plan §3.5's measure, again with the engine's own writer). KB are 1,024 bytes, as §3.5's; gzip at level 9, brotli at quality 11; a part's size is its JSON text as the bundle holds it; the tail is the add-on's bytes after arXiv's, which the bundle holds as base64 (a third more); values as `countValues` counts them before `JSON.parse`; the read is `readBundle` of the bytes in Node, the median of 5.

| Paper | Pages | Units | units KB raw / gz | layout | left | tail KB (base64) | manifest KB | **bundle raw** | **gzip** | **brotli** | values | read ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1512.03385v1 | 12 | 320 | 87.1 / 20.2 | 118.0 / 37.5 | 26.6 / 8.0 | 2.1 (2.8) | 2.6 | 237.5 | 69.7 | **54.2** | 42,851 | 2.5 |
| 1706.03762v7 | 15 | 176 | 45.4 / 12.4 | 50.5 / 17.4 | 13.5 / 4.7 | 2.5 (3.3) | 1.6 | 114.6 | 38.6 | **30.6** | 19,671 | 1.1 |
| 1810.04805v2 | 16 | 282 | 76.7 / 20.0 | 133.0 / 42.5 | 35.3 / 11.1 | 0.3 (0.5) | 1.4 | 247.2 | 75.1 | **58.6** | 43,720 | 2.5 |
| 2307.16209v1 | 147 | 452 | 472.4 / 111.1 | 480.3 / 152.5 | 182.4 / 59.8 | 32.2 (42.9) | 5.0 | 1,183.4 | 354.4 | **282.9** | 166,177 | 7.9 |
| 2608.04322v1 | 13 | 312 | 79.5 / 18.9 | 132.3 / 41.8 | 31.6 / 9.6 | 1.7 (2.3) | 1.6 | 247.8 | 73.6 | **56.0** | 42,799 | 2.4 |

Every corpus paper's units (`data/corpus/*/source.gz`, 124 papers, 28,085 units), in a bundle of their own, read back: 0 dropped.

## Every cached add-on manifest, read by `parseAddonManifest`

The gate's cached add-ons (`out/layer-gate/removal/`): the shipped manifest and the check's (with every set, the outline table and the crops' colours). Those of this remover (REMOVAL 4) parse; an earlier remover's are refused by their `removal`, or before it by their bytes (REMOVAL 1's check manifests are past `ADDON_MANIFEST_CAP`).

| Manifests | Read |
|---|---|
| 17 | manifest.json, REMOVAL 1: refused: its bytes, more than 262144 |
| 35 | manifest.json, REMOVAL 2: refused: removal: not '4' |
| 20 | manifest.json, REMOVAL 3: refused: removal: not '4' |
| 10 | manifest.json, REMOVAL 4: parses |
| 35 | shipped-manifest.json, REMOVAL 2: refused: removal: not '4' |
| 20 | shipped-manifest.json, REMOVAL 3: refused: removal: not '4' |
| 10 | shipped-manifest.json, REMOVAL 4: parses |
