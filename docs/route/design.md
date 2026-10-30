# Layer route, step 2: our compile is the base page — design

Status: phase 1 result, 2026-10-22. Implementation starts from this note; there is no separate spec or plan. Inputs, all in
`docs/route/`: the pipeline lane's raw findings `pipeline-design.md` (tools and data in `pipeline/`), the engine
lane's `layer-side.md` (merged as §3.6) and the web lane's `host-side.md` (merged as §3.7). Engine read at v0.5.2
(a7bc7c0f), web at main. All compiles ran on the pinned TL2025 image 7056390e…, one docker job at a time, under a machine
load of about 45, so times are relative only. Scope is point to point: only what lies on the path to "our compile is the
base page".

## 1. What phase 1 decided

| Question | Answer | Evidence (§2) |
|---|---|---|
| Can today's marked original be the base page? | **No. Its final-mode twin can.** Today's marked compile is a graphicx **draft**, so its figures are empty frames (live.mjs DRAFT). The base page is the same files without DRAFT's draft line (`B`), made by **one pdflatex pass** over the draft's converged aux. | B keeps every mark where the draft put it: 6,560/6,560 `axt-` destinations equal (page, x, y < 0.01 pt) on 6 papers. One pass gives a PDF pixel-identical to a full final latexmk (3/3 papers), in 6 s, 7 s and 99 s |
| Do the marks change the page? | **Not visibly, with one defect class to refuse.** | B vs the paper's own unmarked compile (C): 328/368 pages pixel-identical on 26 papers. Of the differing pages, all but one show line-level changes no reader would notice. 1 paper (2610.19860) prints a mark as text (`\axt@pma{p176.4a}` before a URL), and §3.3 refuses that |
| Ours vs arXiv's PDF on the same TeX Live year: would a reader notice? | **No. Outside figures the two are pixel-identical; inside figures they differ by sub-pixel shifts only** (≤ 1 px at 100 dpi, nothing visible at 150 dpi). The stamp is the visible difference, plus `\today` in 1 of 20 papers. | 20 sweep papers built on TL2025 by both: the paper's own compile matches arXiv's on 192/244 pages; every other page differs inside figure frames only; page counts and page boxes equal 20/20 |
| Erasure in the compile (text render mode 3) | **No, not in step 2.** The remover stays and runs over our PDF. | 2-paper probe (§2.5): geometry and the text layer stay exactly as they were, but erasure switched by the marks erased only 305/310 and 244/278 units whole, and made a 3-page bibliography invisible |
| SyncTeX instead of marks | **Deferred** until marks keep breaking compiles. Marks stay. | Partial run on 5 papers, then stopped: exact (0.00–0.01 pt) where it applies, but it reproduces the marks' lines and ends for only 276/347 own-line paragraphs and 1/870 other units (headings, captions, cells, footnotes, authors). Raw data in `pipeline-design.md` |
| Left pane | **Decided by the owner: arXiv's PDF** | §4 |

## 2. Measurements (headlines; detail in `pipeline-design.md`)

### 2.1 Marked vs unmarked: is our marked compile the paper?
The harness `pipeline/tools/q1prep.mjs` runs `markedOfPaper` as the prepare does (CONVERGE off, latexmk, the guard told
arXiv's page count) and makes four PDFs: A (marked, draft), B (A's files without the draft line), C (the paper's files
untouched) and D (the guard's `unmarkedFiles`, draft). They are compared with `pdftoppm -r 100 -gray` (a pixel differs
when |Δ| > 24/255; one paper was also checked at tol 0 and 150 dpi, with the same result), `pdftotext` (text and -bbox),
`pdffonts`, and PDF.js for links, outline, images and destinations.

| Set | Papers | Pages pixel-identical | Papers identical on every page |
|---|---:|---:|---:|
| A vs D (draft) | 6 pack | 112/124 | 3/6 (the same pages as B vs C: the marks, not the figures) |
| B vs C (final) | 6 pack + 20 sweep | 112/124 + 216/244 = **328/368** | 3/6 + 9/20 |

Kinds, with the papers they occur in:
- **IEEEtran run-in label gains one space** ("Abstract— Task…", "Index Terms— …"): 6 papers (all 6 IEEEtran papers;
  2610.21880 re-breaks its first line because of it). **FIXED in PR 1 (2026-10-22)**: the cause was ours: LaTeX's `\begin`
  ends in `\ignorespaces` and the marked original's `\axtlines` stopped that skip, so the newline's space was set after the
  run-in label; the line probe now goes past the spaces `\begin` skips (latex-front.mjs `pastBegin`, marked originals only).
  2608.19431 (xelatex) went from 0.694 to 1.000 lines in place; this kind no longer occurs.
- **One paragraph re-broken**: 5 papers (2608.16117 on pp. 18–19, 2610.19860, 2610.20848, 2610.21504, 2610.22065).
- **First lines shifted, same text**: 5 papers (1706.03762 on 4 lines, 2610.21037 on 11 pages, 2610.20484, 2610.21176,
  2610.21312). The shift measured 0.2–0.4 pt on the first two.
- **A mark printed as text**: 1 paper (2610.19860 p. 16, inside `\url`). Harmless today, since nobody sees the marked
  compile; visible on a base page.

### 2.2 Ours vs arXiv's PDF: would a reader notice?
20 papers of the release-052b sweep (cs, physics, math, stat, eess, q-bio; classes article, revtex4-2, IEEEtran,
amsart, acmart, elsarticle, llncs, ieeecolor; arXiv's banner says TL2025 for all 20). arXiv's PDF is the sweep cache's copy;
e-prints were downloaded once each. arXiv's identifier stamp was masked using its `pdftotext -bbox`.

| Compared with arXiv's PDF | Pages pixel-identical | Papers identical on every page | Where the other pages differ |
|---|---:|---:|---|
| C, the paper's own compile | 192/244 (78.7 %) | 6/20 | Only inside, or straddling, our figure frames (`axt-g` marks): vector strokes and antialiasing shifted by at most 1 px at 100 dpi, identical to the eye at 150 dpi (checked on 2610.20507's largest). Text area: 0 px, except `\today` ("Dated: October 22" vs "15", 2610.20507, 71 px) |
| B, our base page | 168/244 (68.9 %) | 3/20 | C's figure differences plus the marks' kinds (§2.1) |

| Also compared (B vs arXiv's) | Result |
|---|---|
| Page count, every page's MediaBox/CropBox/TrimBox | equal in 20/20 (0 pages differ); pack 6/6 |
| Outline entries, images per page | equal in 20/20 |
| Fonts | only one extra in arXiv's: its stamp font (NimbusRoman CID); the pack's older stamps add 12 unembedded base-14 fonts |
| Link annotations | ours = arXiv's − 1 (the stamp's link) in 20/20 (2,500 vs 2,520); colours and borders equal |
| Bibliography | 15/20 ship no `.bbl`; our BibTeX/biber on TL2025 sets the same text |
| Size, B / arXiv's | median 1.035 (0.83–1.13, 26 papers). A, the draft, is 0.012–0.66 |

Across TeX Live years the picture changes: on the pack's TL2023 and TL2016 builds most pages differ (2609.26457: 0/28;
1810.04805: 2/16, one paragraph moved column), so the TL2023 route stays a precondition (§6).

### 2.3 The maker over our compile vs over arXiv's (pack, 6 papers)
`makeLayout` was run twice on the same marks: once with `arxiv` = arXiv's PDF (today) and once with `arxiv` = B (step 2).
Lines carried: 7,860/7,908 (99.39 %) over arXiv's, 7,869/7,908 (99.51 %) over ours. Units located: 1,338/1,347 in both.
Placeholders found: 1,911/1,911 in both, LOST 0. The 39 lines not carried even over our own compile are misses of the
line check itself, not compile differences. Step 2's gain lies in the sweep's `unproven` units, which the engine lane counts.

### 2.4 Cost, storage, serving
- **Compile time**, full latexmk, final vs draft: within ±10 % for 15/26 papers and within ±25 % for 23/26 (medians 25 s
  vs 25 s). The exception is the figure-heavy 2608.16117: 57 s draft, 424 s final (46 MB of figures). The one-pass contract
  (§3.1) costs 99 s there and 6–7 s elsewhere, against a prepare compile budget of 600 s.
- **R2 at list price** ($0.015/GB-month, Class A $4.50/M, Class B $0.36/M, egress free; Cloudflare's pricing page,
  2026-10-01): one base per paper is about 1.035 × 3.68 MB (the mean arXiv PDF). That is **$0.057 per 1,000 papers per
  month, $0.57 a month at 10,000 papers**, plus $0.0045 of writes per 1,000. With left = arXiv's and right = ours the reader
  reads two documents: up to +57 ranges per fully read open (mean), $0.038 per 1,000 opens, about +3.7 MB per visitor.
  Cost decides nothing.

### 2.5 Erasure-in-the-compile probe (2 papers; verdict: No for step 2)
`pipeline/q6/erase.tex` sets up a page colour stack (`\pdfcolorstackinit page direct{0 Tr}`), pushes `3 Tr` at each unit's
start mark and pops it at its end mark, pushes `0 Tr` (and pops it) around each placeholder's marks, and keeps floats and
the running head and foot visible.

| | 2608.04322 (IEEEtran) | 1810.04805 (article) |
|---|---:|---:|
| Word boxes, E vs B | 11,546/11,546 identical | 10,403/10,403 identical |
| PDF.js text content, E vs B | 13/13 pages equal | 16/16 pages equal |
| Links, outline, images, fonts | 113/113, 21, 6, same | 290/290, 0, 38, same |
| Units erased whole (< 2 % ink left) | 305/310 (not: title, author, 3 captions) | 244/278 (15 in part, 19 not: list items, a paragraph continued over a page) |
| Formula and citation ink kept | 99.8 % | 99.7 % |
| Non-unit ink erased | 0.9 % (a drop cap) | 66 % (the 3-page bibliography went invisible) |

Mode 3 keeps the page and its text layer exactly. But a switch driven by marks does not nest in shipout order (floats,
footnotes, page breaks, units without marks). The text that stays selectable under it is no problem: a laid page has no
PDF.js text layer, because the layer replaces the page view with a canvas copy and SVG text. So an erased rendition can
only ever be used inside drawn units, as the remover's rendition is today. Revisit when the remover is the bottleneck,
with a per-unit check read from E's operator list. Known risks: XeTeX has no colour-stack primitive, Type 3 glyphs were
not tested, and rules inside text (`\underline`, OT1 `\_`) are not text.

## 3. Contracts

### 3.1 Box: the base compile (pipeline lane; engine `layout/paper.mjs`, web `container/src/run/prep.ts`)
- The guard runs on **draft** compiles as today. Once it accepts, the box makes **one pdflatex pass** in final mode: the
  accepted files with DRAFT's `\PassOptionsToPackage{draft}{graphicx}` line replaced by an empty line (so no line moves),
  over the aux, bbl, lists and index the accepted compile wrote. No BibTeX, no rerun. Under `latex`, xelatex and lualatex
  the pass is that engine's (plus dvipdfmx for `latex`); these were not measured here.
- **Exact check**: the pass's `axt-` destinations equal the draft's by name, page and position (< 0.01 pt), and its page
  count and page boxes equal the draft's. If it fails, or runs past the compile budget, there is no base of ours and the
  paper falls back with why `final` (§3.5).
- Compile environment: `SOURCE_DATE_EPOCH` = arXiv's PDF's date, with `FORCE_SOURCE_DATE=1`, so that `\today`
  equals arXiv's (the one text difference in §2.2). The date is read from Info `/CreationDate`, else XMP `CreateDate`, else
  XMP `MetadataDate` (the 2026 GenPDF/pikepdf PDFs carry only the last; amended by PR 1, 2609.26457's `\today` now reads
  2026-09-23 like arXiv's). Byte-for-byte reproducibility is not required.
- The marks are read from the draft as today (`readMarked`). The maker opens **the final PDF as its `arxiv` document**, so
  every coordinate in the layout file is our base page's.

### 3.2 Storage, head, catalog, versions
- R2 key `base/<id>v<n>/<sha256>.pdf`, immutable. The Worker pulls the box's file with the existing checked put
  (`putContentAddressed`) **before** the head commit, and the commit binds the layer to it by length and sha256, with no
  `base-etag` rebind. `orig/<id>v<n>.pdf` and `/api/v1/original` stay exactly as they are: the left pane, the check, the
  fallback, the extension and the sweep use them.
- Head: `base: { source: 'ours'|'arxiv', bytes, sha256, pages, xref, tree: '2025'|'2023', check: { pages: [ours, arXiv],
  boxes: 'equal', carried: <share> }, why? }`, plus `orig: { bytes, sha256 }` for arXiv's PDF. `xref` stays because the
  remover's tails are appended to our base. The layer reads `source`, `bytes`, `sha256`, `xref`; the rest is the record.
- Catalog: names the base object (key, sha256, bytes) and `source`. `base-etag` appears only on arXiv-base layers.
- Routes: `/base/<id>v<n>/<sha256>.pdf` (web) and `/api/v1/base/<id>v<n>/<sha256>` (extension, any origin). Both use the
  same `serve()`: Range, 206, `immutable`, nosniff.
- Versions: BUNDLE5 `7`→`8`, LAYOUT `11`→`12` (the coordinates are ours), REMOVAL `6`→`7` (it runs over our bytes), and the
  box image version (a new artefact). PIPELINE stays unless the units change; the engine lane proposed a bump, so PR 1
  confirms. Amended (coordinator, 2026-10-22): old bundles are NOT read by the new reader; they re-prepare, since BUNDLE 8
  moves the catalog key. BUNDLE 7 and every head whose base is arXiv's draw nothing (`layerDraws`, decision 3).

### 3.3 The page-and-line check
A paper passes only if all of the following hold; otherwise it falls back (§3.5) with the first failing reason:
1. The guard, as today: the compile ran through, has arXiv's page count, holds no mark in an aux, and has no more errors
   than the paper's own.
2. **No mark text in our PDF**: its text holds no `axt@`, `\axt` or mark name. A hit is handled like the guard's "mark
   out of place": the unit is unmarked and the paper compiled again, within GUARD_EXTRA; else the paper falls back with why
   `marks`. Measured: 1 of 26 papers.
3. §3.1's exact check (final pass = draft).
4. **Every page box equals arXiv's** (MediaBox and CropBox, to 0.01 pt), because the identity map needs it while the left
   is arXiv's (host-side §1.5). Measured: 26/26 papers equal.
5. **Drawable per page (amended by #437, LAYOUT 16, 2026-10-23; replaces the strict in-place line check of PR 1):** a page
   is drawable when it is not past its work bound, its words match arXiv's page (in-order overlap 2 x LCS / (our words +
   arXiv's words) >= 0.98, or exactly the same words in another order; each word after NFKC and the one known substitute
   U+01EB -> U+03B5, lower-cased, letters and digits only; arXiv's margin stamp is no word of the page) and none of its lines
   is partnered on another page. A unit is laid only if EVERY page it is on is drawable; a unit on an undrawable page gets
   no layout row, and a paper in which no unit is laid falls back to arXiv's PDF untranslated (`carry`). There is no per-part
   share (the old CARRY_MIN 0.9), no per-paper share and no per-line test for drawing: whether the two panes align per line
   is information only (`lineAt`, `inPlace`, per-page counts). The standard behind it (owner, 2026-10-23): judge per block and
   per page, not per line. The tree is chosen first (declared year, else arXiv's PTEX banner), so that our TeX Live year is
   arXiv's.

The thresholds are today's. The sweep reports a count for each reason.

### 3.4 What the maker writes: crop boxes from marks (pipeline lane, `layout/make.mjs`)
- A placeholder's crop box is its own glyphs and rules between its two marks, read from our base page's operator list
  (`marks.owned`), one segment per line, with **no matching**. EMPTY where nothing lies between the marks; LOST only where our
  compile gives the piece no ink of its own; TEXT, JOINED and OUTSIDE as today.
- Erase shapes: the lines' `erase` rectangles and the add-on as today, computed over our base page. The remover's plans come
  from exact ownership, with no glyph search across two PDFs.
- **Deleted** (group A, `pipeline-design.md` Q4): `match.mjs` (267), `tolerant.mjs` (47), the link-anchor locator and text
  runs in make.mjs (~595 lines exact, ~245 estimated), carry's point mapping (~93) and the page-pass two-document drive
  (~60). That is **~1,304 lines, 3.0 % of the engine's 43,357**, and ~790 test lines. Group B (~344 lines, the left's
  anchoring on arXiv's text) **stays**, because the left is arXiv's. Group C (the remover, ~2,467 + 288 web) stays, because
  the erasure does not move into the compile.

### 3.5 Fallback
A paper that fails §3.3 or §3.1's check gets `base: { source: 'arxiv', why }` in its head, with why one of `compile`,
`carry`, `engine`, `texlive`, `marks` (LAYOUT_REFUSED's codes), `final` (§3.1) or `boxes` (§3.3.4), and `layout: { refused,
why }` in every part. The reader shows arXiv's PDF untranslated through the existing no-layer state: no 重试 when the why
is final, and the capsule names no technical path. The layer draws nothing on it: no v0, no proof. In the release-052b
cache this rule costs 1 refused part of 210 (1 page of 1,457), which v0 draws today.

### 3.6 Layer (engine lane's `layer-side.md`, kept as written; conflicts noted)
- **Rule**: a unit is drawn only from the layout file. A unit the file does not hold stays the original's, as does a unit
  with a visible piece that has no position (LOST or no row, other than a text symbol, a macro that sets no ink, or a
  space).
- **Reads**: the head's base (our PDF); the door opens base + tails as today. The layout file keeps schema 5's fields,
  with our base page's coordinates. Left parts keep their shape; their tokens, spans and pairs stay arXiv's (the left's), but
  their `draw` (the layer's input for the right pane) is OUR base page's (amended by PR 1; the first text was a slip). The
  `erase` rows and the add-on are read as today. On a fallback (base arXiv's, `layout: {refused}`) the layer draws nothing.
  - *Conflict 1*: layer-side.md calls the base "our marked compile's PDF". It must be the **final pass** (§3.1), not the
    draft the maker reads today.
  - *Conflict 2*: layer-side.md keeps `base {bytes, sha256, xref}` in the same shape. This note adds `source`, `pages`,
    `tree`, `check`, `why` and `orig` (§3.2); the layer still needs only `source` and the old three.
  - *Conflict 3*: layer-side.md says the left parts are "read from the base page". With left = arXiv's the left's tokens
    stay anchored on arXiv's page, as today; only `draw` is ours (see above).
- **Deleted** (~800 lines, 5.4 % of layer-proto; owner decision 3): in tex.mjs, `proofOf` (126), `textRunsOf` (71) and
  `displayCover`/`heldRendering` (~150); v0's own reading in layer2.mjs (~400); the hybrid v0 placement in run.mjs (~45);
  the `proof` switch in reader.mjs (~6).
- **Unchanged**: the fitting rules (`fillPage`, `breakLines`, slots, `layoutUnit2`), the B′ start rule (no-start.mjs,
  break-room.mjs), the page-break cuts (`pageCutsOf`; since 2026-10-30 by the paragraph's height, at a line end of the fit's
  lay, PDF-READER §18.9), colour, weight and slant (now read from our glyphs;
  the file's TeX `colours` win), CJK italic at 13°, the highlight word table, and links.mjs (it reads our base's
  annotations: equal to arXiv's but the stamp's link, §2.2).

### 3.7 Host (web lane's `host-side.md`)
- Reader: the composed document is our base (`/base/…`) + tails; the left is `orig/…`, as today. Ranges are bound by the
  base's length and sha256 (`transport.ts`, `ranges.ts`), which removes the etag race. The identity map is unchanged:
  §3.3.4 guarantees equal pages and boxes.
- Extension: today it proves that the layer's document is the tab's PDF with `endsAlike` + `sha256Of`, and that proof
  fails by design for our base. It is replaced by the head's `base.source = 'ours'` + `check` (the box has already proved
  pages, boxes and lines).
- Job state: a new "base stored" fact gates the right pane only. The left's gate (`original`) is unchanged.
- The title path is unchanged (relay first; ours has no stamp-shaped Info Title).

### 3.8 Tests that prove each contract

| Contract | Test |
|---|---|
| 3.1 final pass = draft | Engine unit test: destinations equal by name, page and position on a fixture's draft and final PDFs. Gate pack check: 6,560/6,560 marks equal (`pipeline/tools/destcmp.mjs` becomes the check) |
| 3.1 / 3.3.2 marks invisible | Gate pack: B vs C pixel test per page (tol 24/255 at 100 dpi), with the known kinds of §2.1 listed and counted; no mark text in any base (the 2610.19860 case as a fixture) |
| 3.2 storage and binding | Worker tests: put and bind on `base/…` (sha256, length); head refused on a mismatch; read route 206/416; extension route answers any origin |
| 3.2 versions | Bundle reader tests: a BUNDLE 8 head with `source` reads; BUNDLE 7 heads still read with arXiv's base |
| 3.3 check | Engine unit tests: each failing reason gives a fallback record with its code; a page-box mismatch; a page whose words differ from arXiv's (below 0.98) is not drawable and a unit on it gets no row |
| 3.4 crop boxes | layout-make tests: placeholder segments equal the owned glyph boxes (no match calls); EMPTY, JOINED and OUTSIDE unchanged on the gate pack; LOST 0 on the pack |
| 3.5 fallback | Web e2e (`layer-states.mjs`): `source: 'arxiv'` shows the original alone, with no 重试 for final whys; the layer draws nothing |
| 3.6 layer | layer-proto tests: a unit with no file rows is not drawn. Gate pack outputs: drawn units ≥ today's, invariants (a)–(m) no worse |
| 3.7 host | e2e `page-boxes.mjs`: our bytes differ from arXiv's, the boxes are equal; extension run test with `source: 'ours'` |
| All | **Release sweep** (50 papers), the acceptance: ready count = today's; (a) "prose left English" and `unproven` down; no new (c), (d) or (e) violations; a fallback count for each why |

## 4. Owner decisions: all three decided (2026-10-22)

1. **Left pane = arXiv's PDF** (原版). Consequences: the right pane is ours and the left keeps its seconds-fast first paint
   (left = ours would wait for the prepare: median 33 s, max 263 s). Group B (~344 lines) stays. The check requires equal
   page count **and** every page box (§3.3.4; 26/26 measured equal). Each full open reads up to +57 ranges, +3.7 MB (mean).
2. **No stamp on the right** (不要). Option (a), zero work. arXiv's identifier stamp (page 1, left margin, an
   18 × ~350 pt strip with one link) is on 20/20 sweep PDFs and 6/6 pack PDFs, and on none of ours. On page 1 the left
   shows it and the right does not.
3. **Units without TeX positions stay untranslated, and a paper that fails the check shows arXiv's PDF untranslated**
   (接受). Consequence: v0 and the proof are deleted (§3.6, ~800 layer lines). This covers ≤ 90 of 8,198 units (1.1 %) on
   26 sweep papers, and 1 page in 1,457 in the 052b cache, which v0 draws today.

## 5. PR split (in dependency order), one staging pin, the release sweep as acceptance

| # | PR | Lane / repo | Scope | Size | Review | Bumps |
|---|---|---|---|---:|---|---|
| 1 | Base compile and maker over ours | pipeline lane / engine | §3.1 final pass and exact check (paper.mjs); §3.3 check (mark text, boxes, codes); §3.4 maker over our base; group A deletion; head and catalog fields written (format.mjs, page-pass); tests for 3.1, 3.3, 3.4 | 3–4 agent-days | adversarial (core contract, deletions) | LAYOUT 12, REMOVAL 7, BUNDLE 8 (PIPELINE if confirmed) |
| 2 | Layer draws only from the file | engine lane / engine | §3.6 deletions and fallback rule; reader `source` | 2 agent-days | standard, plus the gate pack | rides PR 1's BUNDLE 8 |
| 3 | Box keeps and stores the base | web lane / web | container prep keeps the final PDF as a run file and sets SOURCE_DATE_EPOCH; Worker pulls to `base/…` and binds the head | 1.5 agent-days | adversarial (storage, binding) | box image |
| 4 | Reader and extension on our base | web lane / web + shared engine view | §3.7: routes, transport and ranges by sha256, extension check by `source`, job state, fixtures re-exported | 2 agent-days | standard, plus e2e | — |
| 5 | One pin and staging | web lane | engine pin to PRs 1–2 merged; staging deploy; **release sweep** (50 papers) as acceptance; fix forward only real defects | 1 agent-day | — | — |

Order: PR 1 → PR 2 (one engine release) → PRs 3 and 4 in parallel (web, against that engine commit) → PR 5. This plan
includes no production deploy.

## 6. Risks
1. **Compile budget.** The final pass includes the figures: 99 s for 2608.16117 under load (424 s as a full latexmk),
   against a budget of 600 s across the prepare. Past the budget the paper falls back with why `final`; measure on staging
   before the sweep.
2. **TeX Live year.** A paper must be compiled on the year arXiv used. Across years most pages differ (§2.2), and such a
   paper fails the carry or the boxes, or worse, passes with re-broken lines. The TL2023 route (feat/tl2023) is a
   precondition.
3. **Engines not measured here**: the final pass under `latex` (dvipdfmx), xelatex and lualatex. Every paper in the
   26-paper sample was pdflatex.
4. **Mark side effects** (§2.1) are now on the page a reader sees. All but the mark-as-text kind are invisible; the
   IEEEtran run-in space (6/6 IEEEtran papers) is FIXED in PR 1 (`pastBegin`, §2.1).
