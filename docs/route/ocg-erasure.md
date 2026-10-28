# Per-unit optional-content erasure: contract and tests (design v3, 2026-10-23)

Subject: architecture audit items 5(a) and 5(b). Read-only design, no code. Engine refs are to `.worktrees/route-delta`
(feat/delta-base, d50f78c1), `src/pdf-reader/engine/`. Inputs: `route/architecture-audit.md` §5, `route/ocg-spike.md`,
`route/delta.md` §2, §8, §13–15, the text layer (then `route/text-layer.md`, now `PDF-READER.md` §11.11), `layout/stream.mjs`, `layout/marks.mjs`, `layout/ink.mjs`,
`layout/remove.mjs`, `layer-proto/removal.mjs`, the coordinator's ruling R1–R6 (binding). The measurements behind §11 are
in `route/ocgrev/` (scripts `own.mjs`, `cmp2.mjs`, `paths.mjs`, `fetch.sh`; outputs `*.L2.json`, `api/`). v1 and v2 are kept as
`route/ocg-erasure.v1.md` and `route/ocg-erasure.v2.md`. v3 applies the coordinator's conditions C1–C4. C1's re-measure is
`ocgrev/cmp3.mjs` (outputs `*.CL3.json`, `dL2.txt`, `dL3.txt`); C2's delta pairs are `ocgrev/pairs/` and `ocgrev/runDelta.mjs`.

**Is erasing needed at all?** Yes. The translation is set in other words and in other places, so the original's ink under it
has to go. What changes is how: today by rectangles with pads, which leaves slivers; here by each unit's own operators, so no
sliver can be left.

## What changed from v2 (conditions C1–C4)

- **C1:** the 29 "original" units of §11 A are no longer a permanent class.
  - The 17 unmarked title-block units are a marker-coverage dependency on the engine lane's next LAYOUT bump (§1.6).
  - The page-spanning footnote gets a stream-order continuation rule (MR 2a). It is measured and fixes that unit.
  - `.l` is derived from stream order (MR 5, re-measured: it fixes 2 of the 11 label cases, 1 more turns out to be a babel name,
    and 8 remain).
  - The spell check stays as the safety net, and its hits are a build stat (§1.3).
- **C2:** `kind:'full'` stays. Wrapping is a property of our pages: the maker child appends one wrap section to our final PDF,
  and the delta and the full base are both written from those same wrapped bytes. The delta contract keeps one small amendment
  (§2.1). The full-fallback class is measured in §11 C.
- **C3:** the build starts after #440 merges and the pin is cut. File ownership between the lanes is in §10b.
- **C4:** E1/E3/E4/E5/E6/E8 are green under the coordinator's rulings (§10). Their numbers are now in §3.2, §4.1, §7.1 and §8.
  There is one final estimate (§10a).

## What changed from v1

- **Wrappers are in the delta's page streams (R1), not in W pages in tails.** Ownership comes from the marks, in stream order,
  in the maker child. Every replaced page is wrapped whatever the layout later decides: all groups ON shows the page as it is,
  so a page the draw rule later refuses costs nothing.
- **Gone with that:** the p/W(p) pair, W4's (n,k) renumbering, duplicate stream bytes, lever S4, E7, and the remover's tails
  altogether. Today the tails carry only the R pages (`SETS = ['R']`), so the add-on, the chain and TAIL_CAP go too. The head
  binds the wrapped delta as soon as the maker child ends, parts stream as they do today, and the proof runs once.
- **One build, no dual path (R2).** Slices S1–S3 and the per-paper switch are gone. Swap, paper fills, R pages, the old way
  and scale capture are deleted in this project. A page or unit that cannot be wrapped or hidden shows the original. A paper
  on an arXiv base shows the original. (v2 also retired `kind:'full'`; v3 keeps it, per C2.)
- **Ownership is measured (§11 A):** 1,752 of 1,802 units (97.2%) own exactly what they own today. Classes 1–5 of §11 A,
  29 units (1.6%, 0.38% of glyphs), cannot be delimited by marks alone or are delimited wrongly. Their contract is to show the
  original, enforced by a spell check (§1.4).
- **Q2 → R3:** a TJ split keeps its adjustments and the text position. Under marks ownership splits are rare by construction
  (§2.3). Residue inside split glyphs is counted and bounded, never a reason to leave a unit untranslated. Q3 is moot. Q4 is
  one line in §12. Q1 and Q5 are settled by R2.
- **Download (R5):** the composed document, with drawn units' groups OFF and the layer appended, is the future download.
  `/OCProperties` is laid out so that export needs no content-stream change (§3.3).
- **Experiments (R6):** E1, E3 (adding 10,000 and 20,000), E4, E5, E6 and E8 were run (all green, §10); E7 is dropped.

## Headline decisions
- D1. The maker child computes each unit's ownership classes from the marks of our final pass, in stream order (§1). Its inputs
  are the marks and the units' own source text. No layout file and no geometry, except one baseline test for labels.
- D2. The maker child wraps our final pass's page streams once, as one appended incremental section (the wrap section):
  `/OC /axt<group> BDC … EMC` around each owned run, `/Properties` in each page's resources, and `/OCProperties` in our catalog
  (§2). `deltaOf` and the full base are both made from these wrapped bytes. The proof runs once, on whichever form is shipped.
- D3. One group per ownership class: text `u<id>`, its placeholders `u<id>.p`, its label `u<id>.l`, a babel name `n<occ>`.
  Groups are flat and ON by default.
- D4. The reader draws the composed page with PDF.js's optionalContentConfig. Render A hides the drawn units. Render B is the
  crop source (all text OFF, placeholders ON). Render C supplies keep characters (§4).
- D5. Anything that cannot be wrapped, delimited or hidden shows the original, at the smallest granularity that is exact: the
  unit, then the page, then the paper (§6).
- D6. `kind:'full'` stays as the delta's fallback (delta.md §7), carrying the same wrapped streams. An arXiv base, and with it
  the original, remains only for a compile that fails its checks (boxes, marks, carry) or a wrap section that fails its proof.

---

## 1–3. Ownership, the wrap and /OCProperties: settled (the file side, feat/ocg-file)

Folded into `docs/PDF-READER.md` §19.9 (ownership by marks, the spell check and `labelKept`, the wrap and its refusals and
bounds, `/OCProperties`, the proof, both forms, the host's contract, the head's fields, the pack's numbers) and §19.8 (the
delta's catalog carrying `/OCProperties`). What stays open here:

#### 1.6 Marker-coverage dependency (C1; engine lane, assigned)
- The 14 title-block author units and 3 `\thanks` footnotes carry no marks because the marker does not mark them: LAYOUT_TEX
  never reaches `\maketitle`'s moved arguments.
- This rides the engine lane's next LAYOUT bump, together with the revtex4-2 and cite.sty items.
- Acceptance: on the pack, 0 units `unhidden: marks` and 0 spell-check hits for these units once the marks land, and the native
  mark cases hold every text item in place.
- Until the bump, those units show the original. That is a state of the build, not a class of the design.


#### 3.3 Laid out for the later export (R5; nothing of it is built now)
- Content streams name properties (`/axtu12`), never OCG objects. The page's `/Properties` maps the names.
- The export is one more incremental update. It appends the layer (SVG text set with our font subsets) wrapped in a plain
  OCG `axt:layer`, ON in `/D`. It re-points each drawn unit's property names, in `/Properties`, to a second plain OCG,
  `axt:original`, OFF in `/D`. The two stand in one radio group, `/RBGroups [[axt:layer axt:original]]`, so that a viewer's
  layers panel turns one off as it turns the other on. No OCMD.
- `/Order [[(ReadarXiv) axt:layer axt:original]]`: a label is the first element of a nested array, never of `/Order`
  itself, and both groups are listed, since a radio group turns the others off but turns none on.
- One viewer toggle then flips between the original and the translation, with no content stream rewritten.
- Invariant: no content stream of ours references an OCG directly: the re-pointing is in `/Properties`.
- Why no OCMD (the plan before 2026-10-29 re-pointed the names to `<< /OCGs [axt:layer] /P /AllOff >>` and set
  `/Order [(ReadarXiv) [axt:layer]]`): PDFKit ignores an OCMD's `/P` and paints the original under the translation.
  Measured on one page holding "ORIGINAL" under a property name, "TRANSLATED" under `axt:layer` and "CONTROL" with no
  optional content, A the OCMD and B the two plain OCGs above (the maintainer's research, outside git:
  `research/babeldoc/runs/pdf-output/`, scripts `probe_ocg_export.py`, `probe_ocg_variant2.py`, `pdfkit_probe.swift`, files
  and renders in `out/ocg/`):

  | Engine (what ships it) | A: original painted? | B: original painted? |
  |---|---|---|
  | MuPDF 1.28.5 (SumatraPDF, mutool) | no | no |
  | poppler 26.03.0 (Evince, Okular) | no | no |
  | PDFium 156 (Chrome, Edge) | no | no |
  | PDFKit, macOS 27.0 (Preview, Safari) | **yes**, under the translation | no |
  | pdf.js 6.3.289 (our reader, Firefox, Zotero) | not rendered by the probe | not rendered by the probe |

  The nested `/Order` showed its label in MuPDF's layers panel. Only macOS 27.0's PDFKit was tested; Acrobat and Foxit were
  not. A viewer's toggle of the radio group was not measured, only the state `/D` opens in. The export's gate, when it is
  scheduled: the exported file rendered in each engine above, no double ink, and what copy and find return in each.
- **Open, the maintainer's: cut or hide.** Hidden is not gone. In every file of the probe and under both encodings, PDFium,
  PDFKit and pdf.js return the hidden original's text to copy and find; MuPDF and poppler do not:

  | Engine | The hidden original's text in copy and find |
  |---|---|
  | MuPDF | no |
  | poppler | no |
  | PDFium (Chrome, Edge) | yes |
  | PDFKit (Preview, Safari) | yes |
  | pdf.js (Firefox, Zotero, our reader) | yes |

  An export that only hides the original mixes it into copy and find in the viewers most readers use. Removing the drawn
  units' runs instead keeps copy and find clean, but rewrites page streams: the remover's cut mode, deleted on next, would
  be rebuilt, and "no content stream rewritten" would not hold for that file. Nothing is decided until the maintainer rules.


## 4. The reader hides exactly the units it draws: settled (the reader side, feat/ocg-reader)

Folded into `docs/PDF-READER.md` §11.8 ("What a copy hides": one configuration a document and the serialized renders, renders
A, B and C, what a unit hides on a page, `unhidden` and `labelKept`, the cell rules a part carries, the failures, the lab
gate's numbers) and §19.4, §19.6, §18.2 (the bundle's and the parts' `rules`, no add-on, no tails, REMOVAL 8). Deleted as
§4.2 listed: `layer/swap.mjs`, `layer-proto/removal.mjs`, `layout/addon.mjs`, `addon-manifest.mjs`, `chain.mjs`,
`chain-wire.mjs`, the remover child (`remove.mjs` keeps `lex`, `alignOf` and `openRemover`, which the wrap reads), `tailLinks`,
part tails and `TAIL_CAP`, paper fills and the old way, `drawnSource`, `K_SLACK`, the capture of a page view's scale and the
left-canvas copies (`drawn.mjs` keeps `pageBox`). What stays open here:
- T4.2 is `tests/pdf-reader/layer-visibility-pixels.test.ts` (render A against a per-unit oracle and PDF.js's own path, no
  operator list asked again); the production path's one parse a page is `layer-proto-parts.test.ts` (WARM_PAGES).

## 5. Hosts

| | Web | Extension |
|---|---|---|
| Composed document | delta: the original's rangeSource + the delta in memory (`composedRange`); full: `/base/` by ranges; no tails in either | full as today; delta once delta heads are bound (delta.md §15.4c) |
| Container / Worker | the maker child calls `wrapOf`, then `deltaOf(orig, wrapped)`; the full base stored is `wrapped`; no remover child; parts carry no tails | — |
| Shared view | `createLayerSide`: all of §4, once | same module |
| PDF.js | the vendor pin, = PDFJS (X1: the view checks `lib.version`) | the bundled pdfjs-dist, = PDFJS |

## 6. Showing the original (R2: one rule, smallest exact granularity)
- **Unit:** `unhidden` (marks, across, spell, bounds, page) → not drawn. Its ink stays, and the status line counts it untranslated.
- **Page:** refused in §2.4 → unwrapped. With every unit on it `unhidden`, the page is the original's ink: our compile, which
  equals arXiv's on the pixel for 99 of 302 pages and closely elsewhere (delta.md §15).
- **Paper:** with no delta, the paper falls to `full` (wrapped, laid as normal). Only when the base is arXiv's (boxes, marks,
  carry, or `wrap-<code>`) is there no layer. The reader shows arXiv's PDF (the owner's
  2026-10-22 ruling 3). arXiv-base pages are never laid by geometric ownership.
- Tests: T6.1, a unit with ink on a wrapped and a refused page is drawn nowhere (O3). T6.2, an arXiv-base head gives the
  original with no layer request.
- **Amendment (coordinator, GO of 2026-10-28), the `.l` class only:** a unit whose label (`.l`) cannot be owned is NOT shown
  original whole. O3 is relaxed for that class alone: when the unit's TEXT class is owned and the label's ink is disjoint from
  the body's drawing area, the text is hidden, the label stays as the original's ink and only the body is drawn (the layer's
  existing "label kept" reading); the prepare record counts these as `labelKept` (beside `own`, spell hits and `unhidden`).
  Only a unit whose text class is unowned shows the original. The label rule improvement (stream order, §1.1) stays on the
  list, measured per build. T6.3: a unit with an unowned label whose ink is disjoint from the body draws the body only and counts
  `labelKept`; a unit whose label ink overlaps the body's drawing area shows the original.

## 7. The glyph-exact gate (tolerance 0)

### 7.1 Compared
PDF.js 6.3.289 with `isImageDecoderSupported:false`, re-rendered once on a mismatch.

| Gate | Compared | Must be |
|---|---|---|
| G0 structure | §2.2, §2.5 (b)–(d), O1, bounds, no owned run with Tr ≥ 4 | all hold |
| G1 identity | all ON vs our final page | 0 px outside split glyphs' boxes (+1 px) and image edges; inside split boxes ≤ 0.1% of their pixels and max channel Δ ≤ 16 per page (E4 variant a; worst seen 0.07%, Δ13, Node only, 0 in Chromium) |
| G2 exact hiding | one unit's groups OFF vs an oracle of the page without that unit's ink | 0 px under G1's two allowances |
| G3 containment | diff(all ON, unit OFF) vs the unit's ink mask | 0 px outside the mask under G1's allowances; formulas 0 changed |
| G4 toggle | setVisibility on an existing config vs a fresh config | 0 px; no new operator list |
| G5 crop source | B vs "placeholders + non-unit ink" | 0 px |
| G6 pastes | `pastedKeep` per page | counted; 0 on synthetic, reported on the pack |
| G7 ownership | §11 A rerun: identical, `unhidden` by reason, spell refusals | spell refusals ≤ 2% of units; no unit drawn whose spell check failed |

- **Image edges** (E6 ruling): pixels within 1 device px of an image XObject's boundary. They are counted per page and the count
  must EQUAL the one today's removal (the remover's cut, or `3 Tr`) gives on that page, in the same environment. In Node they
  are 0; on H2 in Chromium they are 70 px (GPU) or 60 px (CPU), and equal to the remover's.

Oracles: on synthetic pages, the generator emits the page without unit u's operators, positioned by absolute `Tm`, plus a
`3 Tr` variant. On real pages, u's codes are cut with the kept chunker in cut mode: exact advances, paints → `n`.

### 7.2 CI with no network: the synthetic generator
- Built with @cantoo/pdf-lib, sample-1's Computer Modern Type 1 fonts and a generated Type 3 font. Rendered with pdfjs-dist
  legacy and @napi-rs/canvas at scale 2. The output digest is pinned.
- Cases, with the marks written as `ri` literals so that §1 runs on them:

| Case | Content |
|---|---|
| S1 | 50 units, boundaries at TJ ends |
| S2 | 300 groups |
| S3 | ladder |
| S4 | 5001 doc groups |
| S5 | a form inside a unit range |
| S6 | foreign tagged BDC |
| S7 | an opening alone ending mid-TJ |
| S8 | Type 3 |
| S9 | Tr 7 and vertical (refusals) |
| S10 | foreign OCProperties |
| S11 | owned rules and a clip |
| S12 | a /Contents array, a unit over two streams, q/Q |

- Under 3 MB generated and under 60 s in Vitest. sample-1 runs G0–G5 end to end.

### 7.3 Lab gate (not CI)
- The pack's 7 papers (2602.23285v2 once a layout exists) and the sweep sample. It runs G0–G2 on every replaced page, G3 on up
  to 20 units a page, and G6 and G7, on CPU and GPU canvases.
- G7 answers what v1's §6.4 left open: ownership correctness now has its own gate.

## 8. Browser render-time measurement (staging, before merge)
- Pages:
  - H1 2312.17141v1 p8: most sequences.
  - H2 2602.23285v2 p8: heavy images.
  - H3 2307.16209v1: most groups; its densest page and a 10-page scroll.
  - Control: 2608.16117.
- Harness: Playwright Chromium, production PDF_OPTIONS, dpr 1 and 2, HWA on and off.
- A/B: today's build (swap path) against the new build on the same papers. This is two deployments, not a flag, since there is
  no dual path.
- Go/no-go:
  - cold A ≤ 1.5x page p's;
  - warm and toggled ≤ 1.1x;
  - asked → committed not slower than today at p50 and p95;
  - no new long task on H3;
  - first config ≤ 30 ms per document (E3: 14–24 ms at 5,000–10,000 groups in Chromium);
  - JS heap + canvas ≤ +10 MiB per document on the 147-page thesis in the real reader (E8 ruling, absolute; the harness measured
    +6.0 MiB for 5,263 groups), with no new long task.

## 9. Interactions

| With | Contract |
|---|---|
| Delta | Wrapping is upstream of `deltaOf` (§2.1); the one amendment is the catalog's `/OCProperties` (delta.md §2.5). `base.replaced` = every page our compile changes. Both `delta` and `full` carry wrapped streams |
| Audit 1 (unmarked compile as the reader's page) | Would remove the `ri` literals that make MR boundaries TJ boundaries. It conflicts with §1–2 and is not taken while ownership comes from the marks |
| PDF.js pin | X1. A version move passes G0–G7 in CI and the lab, and §8 on staging, both hosts on one pin |
| Highlight, sync, links, contents | They read the layout file, the parts and the left document. Their (n,k) is the composed page's, the only one there is |
| Text layer (`PDF-READER.md` §11.11) | Invariant: no `getTextContent` on a wrapped page, because it ignores visibility. The text layer's kept items on a wrapped page come from the layout file and units (`textOf` in the run) for units not in D(p), and from the original's (left) document for ink no unit owns. Hidden units contribute only translated items. As built (2026-10-24, before the wrap) `textOf` reads the composed page's text content as the lay reads it, split by the drawing's operations: the wrap's PR changes that input for a wrapped page |
| Download (R5) | Today: the compiled final and arXiv's link. Future (owner's 10-08 decision, download = the instant layer exported): the composed document with drawn units' names re-pointed to `axt:original` (OFF) and the layer appended in `axt:layer` (ON), one radio group, as one incremental update with our font subsets (§3.3; cut or hide still open). Now: `/D` all ON and `/Order []` |
| Printing | The DOM is printed (canvas A + SVG). The PDF.js `print` intent is unused; if it is ever used, configs are made with that intent |
| Prefetch (delta.md §16) | Unchanged: one byte source, and the delta is in memory |

## 10. Experiments (slice 0; R6): all GREEN (report `route/ocgx/experiments.md`, coordinator's rulings applied)

The build may start (C4). Each experiment's go/no-go and what it set:

| # | Risk | Result | Go/no-go | Set in the design |
|---|---|---|---|---|
| E1 | browser font path, GPU | S2 and H1 in Node, Chromium GPU and CPU: G1/G2/G3 0 px. Cold, new worker: 1.00–1.15x; shared worker S2 1.43x (frame-quantized), H1 0.97x. Operator list H1 +4%; 800 groups / 2000 sequences +37%, render A 0.99x | **GO** | §3.2 GROUPS_PAGE / SEQUENCES_PAGE kept |
| E2 | nested and foreign OC | S6, S10: G1/G2/G3 0 px in all three environments; ours stays hidden under a foreign OFF group; BaseState OFF does not hide ours listed in `/ON` | **GO** | §3.1 as written |
| E3 | group counts | first config 14 / 24 / 44 / 85 ms (Chromium) at 5,000 / 10,000 / 20,000 / 40,000 groups; later calls 1.4–12.7 ms; about 0.85 KB a group. PDF.js builds a new config per render unless one is passed | **GO** | GROUPS_DOC = 8000; one config per document, kept, unchanged during a render (§4.1) |
| E4 | split drift | variant (a), the remover's chunked split: 0 px outside everywhere; inside 0 in Chromium, ≤ 0.07% and Δ ≤ 13 in Node. (b)/(d) 28–30 px outside in Node; (c) wrong by the spec | **GO** with (a) | G1: 0 px outside, ≤ 0.1% of the box pixels and Δ ≤ 16 inside (§7.1); §2.3 uses (a) only, no re-anchor |
| E5 | Type 3, vertical, CMap | whole TJs 0 px; splits in Type 3, Identity-H and an embedded CMap 0 px outside; a vertical split refused; hiding the only clip run removes the clip (the remover has the same defect) | **GO** | §2.4 refusals kept; G0 checks Tr ≥ 4 |
| E6 | A/B/C paste seam | H1 0 px. H2 (images): 70 px (GPU) / 60 px (CPU) on one image's edges, the same with `3 Tr` or the remover's cut. A CPU canvas is no better and is nondeterministic with the ImageDecoder | **GO** under the ruling | G1–G3 exclude image-edge pixels, counted per page and equal to the remover's (§7.1); the CPU fallback is dropped (H2 invariant) |
| E8 | memory | thesis, 147 pages, every page wrapped, 5,263 groups: +6.0 MiB after GC; render 15.1 → 15.7 ms; main-thread peak 34–36 MiB without config reuse, 17 MiB with it | **GO** under the ruling (absolute budget) | §8: ≤ +10 MiB heap + canvas per document in the real reader, no new long task |
| — | E7 tail growth | dropped: no tails (R1) | — | — |

Two measurements remain for the reader on staging (§8), not blocking the build: E8's budget in the real reader, and the E6
image-edge equality on the pack's image pages.

## 10a. Final estimate (days, one engineer per lane; at least 0.5 d of review per PR not counted)

| Work | Engine | Web | Ext. |
|---|---|---|---|
| §1 ownership by marks in the maker child (MR 1–8 with 2a and the stream-order `.l`), spell check and its record stat, I1 | 3 | — | — |
| §2 `wrapOf`: lexer and chunker reuse, W1–W6, split variant (a), refusals with Tr ≥ 4, deterministic deflate, `appendSection`, proof (b)–(e) on both forms | 4 | — | — |
| §2.7 the forms: full base = `wrapped`, delta carries `/OCProperties` and the (d) check | 0.5 | — | — |
| §3 `/OCProperties`, ladder (GROUPS_DOC 8000), head stats | 1 | — | — |
| §4 reader: OFF(p), one config per document with a serialized render queue, renders A/B/C, pastes, commit and redraw, X1 | 3 | — | — |
| View: sourceOf over the composed page; drop drawnSource/K_SLACK/capture | 1 | — | — |
| §4.2 deletions: remover, add-on, chain, tails, swap, fills, old way, capture (`full` kept) | 2.5 | 1 | 0.5 |
| §7 generator S1–S12, G0–G7 (with the E4 bound and image-edge counting) in Vitest, sample-1 end to end, lab pack run | 3 | — | — |
| Hosts: container wiring (maker child → `wrapOf` → `deltaOf`/full store, no remover child), Worker (no tails), reader (`composedRange` without tails; full by ranges), e2e rows (wrapped delta, wrapped full, unhidden unit, refused page, arXiv base), regenerated sample bundle | — | 2.5 | 1 |
| Extension: pin, delta heads bound (delta.md §15.4c), e2e rows for both forms | — | — | 1.5 |
| §8 staging measurement (E8 budget and E6 image edges in the real reader) | 1 | 0.5 | — |
| **Total** | **19** | **4** | **3** |

- **Prerequisites (not counted):** #440 merged and the pin cut (C3); experiments green (done, §10). The §1.6 marker coverage is
  on the engine lane's next LAYOUT bump. It is a dependency for the "0 spell hits on the pack" acceptance, not for merge.
- **Critical path (about 20 working days from the pin):**
  1. §1 ownership and the spell check (3 d);
  2. §2 `wrapOf`, the forms and the proof (4.5 d);
  3. §3 (1 d);
  4. §4 reader (3 d; the view and the generator alongside, same engineer: +4 d);
  5. lab gate G7 (1 d);
  6. deletions (2.5 d);
  7. engine pin → web hosts (2.5 d) and the extension (2.5 d) in parallel, on stacked branches (§10b);
  8. staging §8 (1 d).
- The deletions are on the path because R2 forbids a dual-path period: the build that ships is the one without the old
  machinery. The calendar total is about 22 working days, with the web and extension lanes starting their own parts (fixtures,
  e2e scaffolding) before the engine pin.

## 10b. Sequencing and file ownership (C3)

**Sequencing.**
1. The build starts after #440 merges and the engine pin is cut.
2. Each lane works on a stacked branch off `next` and rebases at each merge.
3. Order of merge: the pipeline lane's erasure branch first, since it is the larger and the reader's base, then the web lane's
   prefetch and text-layer branches rebased on it. The two lanes do not edit the same function in one PR window.

**Pipeline lane owns** (erasure: swap, paper fills, drawnSource, K_SLACK, capture, removal; and everything §1–§4 adds). Files
found by grep in the route-delta engine and the web repo's delta-web worktree:
- **engine/layout/:** `own.mjs` (new), `wrap.mjs` (new), `delta.mjs`, `remove.mjs`, `addon.mjs`, `addon-manifest.mjs`,
  `chain.mjs`, `chain-wire.mjs`, `tail.mjs`, `make.mjs` (the call), `stream.mjs`.
- **engine/layer/:** `swap.mjs`, `check.mjs`.
- **engine/layer-proto/:** `removal.mjs`, `cut.mjs`, `format.mjs` (part tails), `reader.mjs`, `layer2.mjs`, `links.mjs`,
  `check.mjs`, `tex.mjs`, `bundle.mjs`, `facade.mjs` (removal and erase uses), and `run.mjs`: renders A/B/C, erase-and-restore,
  the commit.
- **engine/view/:** `drawn.mjs` (capture), `layer-side.mjs` (drawnSource, K_SLACK, the copy path), `lighting.mjs`
  (scaleOf/drawing uses).
- **pipeline:** `pipeline/page-pass.mjs` (tails out, wrapped bytes in).
- **web:** `container/` (maker child → `wrapOf`/`deltaOf`; no remover child), `worker/src/layer/*` (no tails, TAIL_CAP gone),
  `web/src/layer/index.ts` (the removal and erase uses), `web/src/layer/transport.ts` and `web/src/ranges.ts` (`composedRange`
  without tails).
- **extension:** `session/run.ts` (renders), `session/base.ts` (delta binding).

**Web lane owns** (prefetch and the unified text layer):
- **prefetch:** `web/src/ranges.ts` (priority gate, prefetch wrapper), `web/src/session/run.mjs` (idle hooks); extension
  `session/ranges.ts` and `session/run.ts`.
- **text layer:** `web/src/layer/door.ts` (host DOM from `textOf`); `engine/view/places.mjs` and `view/reader-view.mjs` (the
  page's DOM slot, `textLayerMode`); `engine/layer-proto/run.mjs` `textOf` (built 2026-10-24, `PDF-READER.md` §11.11: the
  engine's `textOf` and the shared view's host, both hosts passing PDF.js's `TextLayerBuilder`).

**Known overlaps** (each change goes through the lane named first; the other reviews):

| File | Pipeline lane's part | Web lane's part | Rule |
|---|---|---|---|
| `engine/view/layer-side.mjs` | drawnSource, K_SLACK, copy path deleted; renders wired | `noLayoutPage` / `originalPageOf` (prefetch's idle test and text-layer "original" pages read them) | pipeline first; `noLayoutPage` keeps its signature |
| `engine/layer-proto/run.mjs` | renders A/B/C, commit, deleted erase-and-restore | `textOf`; the `prefetched` pixel-task path (~2458) | pipeline first; `textOf` reads the layout file (§9) and never `getTextContent` on a wrapped page |
| `engine/view/places.mjs`, `view/reader-view.mjs` | place content as laid (A + SVG) | text-layer DOM slot | `swap(n, …)` in places.mjs is the place's content swap, not the erasure swap, and stays |
| `web/src/ranges.ts` (+ extension `session/ranges.ts`) | `composedRange` without tails | priority gate and prefetch wrapper | web lane first (prefetch is planned before); pipeline rebases |
| `session/run.ts` (extension), `web/src/session/run.mjs` | renders and host wiring | idle hooks, text-layer hosting | split by function; one PR per lane per merge window |

Name collisions that are not erasure: the panes' "swapped" preference (`session/host.ts`, `web/src/session/run.mjs`) and
`web/src/session/swaps.ts` (layer states).

## 11. The two numbers

### A. Marks-only ownership vs today's: settled, the numbers in `docs/PDF-READER.md` §19.9

### B. Laid pages on an arXiv base

- **Staging now (2026-10-23, the 53 sweep papers, both CTAGs, at most 1 request per 3 s, project UA; log
  `route/ocgrev/api/log.txt`):** 3 catalogs are served, all under `b8-j6.3.289` and all of **image set 4**. All 3 have an ours
  base (`kind` absent, so full; no delta head yet):

| Paper | Pages | Base |
|---|---:|---|
| 2610.11256v1 | 42 | ours |
| 2610.19860v1 | 19 | ours (was arXiv, `marks`, on 10-22: fixed) |
| 2610.21765v1 | 14 | ours |

  So on staging today, 75 pages are laid on ours and **0 on arXiv**. The other 50 papers answer `b8` 404 `not-prepared`. All
  53 answer `b7` (the sweep's CTAG) 404 `unknown-versions`: no image-set-3 catalog is served any more.
- **The sweep's own catalogs** (2026-10-22, read by the sweep under CTAG b7-j6.3.289 and cached in
  `readarxiv-web-wt/sweep/sweep-data/cache/papers/*/catalog.json`; all of image set 3, catalog bundle 8, `versions.image = '3'`):

| Base source | Papers | Pages laid |
|---|---:|---:|
| ours (kind absent = full) | 50 | 1,367 (95.5%) |
| arXiv | 3 | 64 (4.5%) |

- The arXiv-base three:

| Paper | Pages | Why |
|---|---:|---|
| 2610.20030v1 | 12 | boxes |
| 2610.20581v1 | 33 | boxes |
| 2610.19860v1 | 19 | marks |

  They match the previous summary and are said to be fixed since; staging could not confirm this today.
- **Reading:** today's staging state shows 0 arXiv-base pages, and one of the three earlier cases is confirmed fixed. The
  other two (2610.20030, 2610.20581: `boxes`) are not prepared on staging, so their fix cannot be confirmed there.
  The sweep's 4.5% is the last full measurement.
- Under R2 any arXiv-base page shows the original, so this share is lost to the layer outright. The next sweep reports it per
  `why`.

### C. The full-fallback class: delta refused or over 35% (C2, for the record)
- **Sweep originals' engines** (53 papers; 2 range reads each, at most 1 request per 3 s, project UA; `ocgrev/orig/`). Every
  arXiv PDF is rewritten by arXiv (Producer `pikepdf 8.15.1`, Creator `arXiv GenPDF`), so the engine was read from the bytes:
  51 show pdfTeX (`PTEX.Fullbanner`), and 2 show none (1810.04805v2, whose range held no Info; 2610.21765v1).
- **TL banner survey** (a one-off survey of this session (not kept), 187 papers): 171 TL 2025, 2 TL 2023, 14 no banner (7.5%). The
  no-banner papers are the latex (dvips/dvipdfmx), xelatex and lualatex candidates.
- **deltaOf on real non-pack pairs** (staging's only three catalogs, image set 4; the original and the base fetched, base sha256
  verified; `ocgrev/runDelta.mjs`):

| Paper | Engine (arXiv's) | Original | Our base | Delta | Share of base | Result |
|---|---|---:|---:|---:|---:|---|
| 2610.19860v1 | pdfTeX | 616,661 | 637,368 | 147,887 | 23.2% | delta |
| 2610.11256v1 | pdfTeX | 635,541 | 677,808 | (349,515) | 51.6% | refused `delta-bound`: full |
| 2610.21765v1 | dvips + Ghostscript (36 FontFile3, no pdfTeX trace) | 588,602 | 513,786 | (508,984) | 99.1% | refused: full |

- **Reading:**
  - A dvips paper shares nothing with our compile, as delta.md §3 predicted (fonts differ in kind), so every latex, xelatex
    and lualatex paper will be `full`. The survey puts that class at about 7.5% of papers.
  - A pdfTeX paper can also fall to `full` when arXiv's subsets differ from ours; 2610.11256 is light (0.6 MB), so it falls
    under the 35% rule.
  - Over the 8 pack pairs plus these 3, 2 of 11 are `full` (18%).
  - Estimate: `full` ≈ 7.5% (non-pdfTeX) + a pdfTeX share that this sample cannot size, between 0 and 1 in 3 light papers;
    plausibly 10–20% of papers. That is why C2 keeps `full`.
- Not done: 4–6 non-pdfTeX pairs. Staging serves bases only for prepared papers, and only these three are prepared now.
  Preparing more would need a POST, which this read-only task does not make. The next sweep (after redeploy) should report
  `base.kind` per paper.

## 12. For the owner
- Q4 (option, a UI change, not in this project): a per-unit "show original" (press or hover). It becomes nearly free: groups
  ON plus the SVG removed. Cleaner formula crops come anyway, since B holds no text.
- Visible changes from R2:
  - the author block and `\thanks` notes stay English (class 1);
  - a paper whose delta or marks fail shows arXiv's PDF;
  - no slivers anywhere.
- The later options of §1.4 would win back class 1 and class 2 with TeX marks (`\maketitle`, footnote area).
