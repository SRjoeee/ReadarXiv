# The layer reader measured in the extension (Stage 5 Task 11)

`lab/pdf/spikes/layer-extension.mjs` on a staging build of the extension (`AXT_READER_API=https://app-staging.readarxiv.org
pnpm build`, branch `feat/reader-view-links`), headless Chromium (Playwright's), a fresh profile (the default service,
Microsoft's web translator; target Chinese), 2026-10-17 01:08–01:10 JST, the machine's other lanes holding their heavy runs.
Load average (1 minute) 9.9 → 7.1 at the start and 4.2 at the end: the first paper's numbers are the most likely to be
contaminated. Staging answered no 5xx; one prepare was asked (2608.04322v1, the reader's own rule, once a visit).

Staging's faces' table was not served yet (`/static-fonts/index.json` answered 404): every unit was left the original's
(`served`), so these are the timings of the open, the prepare, the rows and the layer's own laying, not of drawing translated
text, whose fonts are fetched on top.

## The readings (ms from the reader's address loaded)

| Paper | Pages | Layer at the first look | Original on screen | First page laid | Every unit's row | Rows | Rows a second | JS heap (MB) |
|---|---|---|---|---|---|---|---|---|
| 1706.03762v7 | 15 | ready (catalog) | 1 441 | 1 978 | 3 101 | 164 | 98.8 | 27.8 |
| 1810.04805v2 | 16 | ready | 706 | 1 518 | 4 393 | 247 | 67.0 | 39.5 |
| 2608.16117v1 | 40 | ready | 21 383 | 30 891 | 30 893 | 123 | 12.9 | 20.2 |
| 2307.16209v1 (the thesis) | 147 | ready | 3 093 | 3 613 | 19 501 | 450 | 27.4 | 27.3 |
| 2608.04322v1 | 13 | none: prepared (GET 404, the prepare's 202s for 45 s, then the catalog) | 2 688 | 49 432 | 51 681 | 209 | 4.3 | 28.0 |

- **Arxiv's bytes were each layer's base** (no copy of ours fetched) on all five.
- **The renderers' resident memory** (every renderer process of the browser, the extension's pages and arXiv's included, by
  `ps`) stood at 0.82–1.01 GB after each paper; a rough upper bound, not the reader page's alone.
- **No long task** was observed by the page's observer after its load (installed once the controller was there; the first
  face and layout's task before it is not counted). `reader-perf` holds L7.
- **2608.16117v1's 21 s to the original** is arXiv's PDF itself: the extension opens it by URL, and its first page is shown
  once PDF.js has what it needs of the file; its 9.5 s more to the first laid page include the digest of the whole PDF (the
  base's check), the composed document's open and the first page's laying. The other papers' original came in 0.7–3.1 s.
- **The cold paper**: its prepare took about 45 s on staging (the 202s' progress), and its first page was laid 1.4 s after
  the catalog.

## Three proposals, each with its numbers

1. **Ask the layer as the PDF page opens, before the reader shows** (the floating button's page, or the reader's frame being
   made): a ready layer's look is one edge-cached GET; asked at the PDF page's load it is done before the original is on
   screen (0.7–3.1 s above), so the first laid page would follow the original by the composed open alone (0.5–0.8 s here).
   For a cold paper it starts the 45 s prepare a few seconds earlier. Cost: one GET a PDF page visited (the reader not
   opened on some), and the paper's id reaching our server where the reader is not used: a privacy policy change. Not done.
2. **The polling bounds**: keep "never sooner than our server asks, at least a second" (run.ts WAIT_MIN); the 202s here asked
   at 1 s (the stand-in's 500 ms clamped) and nothing was faster. An upper bound of 10 minutes (WAIT_MAX) is a timer's
   sanity, not a product choice; 30 s would ask sooner than a 60 s answer says, which Review Focus 1 forbids.
3. **The memory budget Task 12 holds**: the reader page's JS heap 20–40 MB after a paper, the thesis included (147 pages,
   27 MB: the window holds the near pages' layer alone). Proposed budget: the reader's JS heap within 64 MB at rest after
   any corpus paper, measured by this spike's `heapMB`; the renderers' RSS read with the web's `layer-memory` on a quiet
   machine before a number is fixed for it.

## The bind, before and after (2026-10-17 01:52–01:55 JST)

The base check no longer waits for arXiv's whole PDF (`session/run.ts` bind, `session/ranges.ts`; DESIGN §16). Measured
with this spike on two staging builds back to back, the pre-bind build and the bind's (`AXT_EXT_DIR`), alternating
before, after, before, after, a fresh profile each, the machine otherwise quiet (load average 6.3 at the start, 5.0 at the
end). ms from the reader's address loaded:

| Paper | Build | Original on screen | First page laid | Laid after the original | Composed over | JS heap (MB) |
|---|---|---|---|---|---|---|
| 2608.16117v1 (46 MB) | before | 20 963 | 42 698 | 21 735 | the left's bytes, read whole | 30.8 |
| 2608.16117v1 | after | 21 574 | 24 461 | 2 887 | our copy by ranges | 20.0 |
| 2608.16117v1 | before | 21 022 | 36 724 | 15 702 | the left's bytes, read whole | 29.7 |
| 2608.16117v1 | after | 21 552 | 25 095 | 3 543 | our copy by ranges | 20.6 |
| 1706.03762v7 (2 MB) | before | 2 415 | 2 638 | 223 | the left's bytes | 22.6 |
| 1706.03762v7 | after | 3 158 | 3 399 | 241 | the left's bytes (the proof within 100 ms) | 21.5 |
| 1706.03762v7 | before | 1 713 | 2 141 | 428 | the left's bytes | 30.5 |
| 1706.03762v7 | after | 2 624 | 2 932 | 308 | the left's bytes | 25.4 |

- The large paper's first page now follows its original by 2.9–3.5 s, against 15.7–21.7 s (9.5 s in the reading above, at
  another load: the old check's wait was the rest of arXiv's download, asked twice, and so varied with the link). The
  original's own 21 s is unchanged: arXiv's file through PDF.js's stream and ranges, to be measured on its own.
- A small paper is as before: its bytes are in within the 100 ms the proof is given, nothing is asked of anyone.
- The heap is 10 MB lower on the large paper: the composed document no longer holds a whole copy of the original.
- No long task over 51 ms in any run; the renderers' resident memory 0.91–0.98 GB in both builds.
