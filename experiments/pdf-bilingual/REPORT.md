# Bilingual reading of arXiv PDFs: research for issue #290

2026-09-22. Working files: `spikes/` (scripts), `out/` (results), `data/` (downloaded PDFs, excluded from git).
Grades: **MEASURED** (by a script here), **READ** (in a primary source, by a research agent or by me), **REPORTED** (a third party's claim), **INFERRED**.

> **Revised the same day — read the addendum at the end first.** The maintainer corrected four of the arguments this section and §4 make against the source-first path (the lazy model, the page counts, tables and figures, the cache); they are withdrawn. Two further spikes showed that a translated PDF can be linked to the original by text anchoring alone, and that BusyTeX compiles a real paper, with Chinese, in a real Chromium. What stands: a full TeX runtime does not belong in the extension *package*; the reader shell and the link layer below are common to both routes. **A second addendum** records a colleague's review checked against the primary sources: the store's policy exempts iframes and sandboxed pages from the remote-code rule, arXiv answers cross-origin reads of its PDFs, and two statements in §3 and §4 were wrong and are struck through.

## Recommendation (as first written)

**Do not build a second translation pipeline. Build a second view of the one we have.**

Take the geometry from the PDF and the meaning from arXiv's HTML of the same version: the original PDF in PDF.js on the left, the existing HTML translation pipeline in a pane on the right, and between them a link layer that locates every HTML block as line rectangles on the PDF pages from the PDF.js text layer alone. No TeX, no server, no model, no new permission; the package grows by about 0.5 MB zipped at the minimum, 1.2–1.4 MB with fonts and image decoders.

Source-first translation with recompilation — the path the issue leans towards — is not recommended for the extension. It buys about one paper in a hundred of extra coverage and costs a compile backend, a second extractor and protector, the viewport-lazy model, sentence alignment, 177 of the 179 target languages, and a permanent triage duty. What it alone can give, a typeset translated PDF to take away, belongs to the Web App stage as an export.

## The evidence

### 1. Coverage: HTML and TeX source are nearly the same set of papers — MEASURED

84 papers submitted 2026-09-02…12, six from each of 14 categories (`spikes/coverage.mjs`, `coverage2.mjs`):

| | papers |
|---|---|
| arXiv HTML served (200) | 79 (94 %) |
| … of which a usable conversion (≥ 20 paragraphs, titled) | 79 |
| … of which without any `ltx_ERROR` | 70 (nine papers carry 1, 1, 1, 2, 2, 2, 2, 2 and 18) |
| TeX source served | 80 (95 %) |
| PDF-only submissions | 4 (three of six in cond-mat.mes-hall) |
| **TeX source but no HTML** | **1** |
| HTML but no TeX source | 0 |

arXiv now serves HTML for old papers too (`hep-th/9901001`: 88 paragraphs; `1706.03762`: 155) — the premise "no HTML → ar5iv" from 2026-09-17 needs revisiting. A failed conversion is served with HTTP 200, so availability must be judged by content. arXiv's own figures: ~97 % of submissions produce some HTML, ~75 % convert without LaTeXML errors, ~90 % of submissions are TeX (READ, arXiv 2605.16562).

### 2. HTML blocks can be located on the PDF from the text layer — MEASURED

Six CC-licensed fixture papers, same-version PDFs, PDF.js 6.3.289 text layer, 3-gram anchors chained in order, formulas never bridged, bounded fill between anchors (`spikes/align.mjs`). "Located" means ≥ 85 % of a block's non-math words found in order.

| Paper | Pages | Paragraphs located | Short blocks (< 6 words) | Same order in both | Text layer / matching |
|---|---|---|---|---|---|
| 2312.17141 (dense inline math) | 53 | 471 / 473 | 172 / 219 | 456 / 470 | 302 ms / 34 ms |
| 2410.00260 | 22 | 62 / 62 | 14 / 22 | 61 / 61 | 138 / 35 |
| 2507.00150 (two columns) | 11 | 51 / 53 | 8 / 9 | 50 / 50 | 136 / 23 |
| 2609.00246 (code, tables) | 49 | 243 / 247 | 49 / 73 | 229 / 242 | 260 / 40 |
| 2609.03768 | 27 | 83 / 83 | 24 / 27 | 81 / 82 | 286 / 17 |
| 2609.04056 (theorems, math) | 35 | 368 / 387 | 177 / 239 | 349 / 367 | 252 / 17 |

Captions 75–100 %, table cells 100 % where present, located blocks fall in one region (a few in two, across a column or page; none in three). Drawn over the rendered pages the regions tile the columns cleanly (`out/page-*.png`). Timing is Node, whole document. A research agent measured the same question independently on seven other papers with a simpler method: 100 % on prose papers, ~90 % on two math.PR papers, the misses being short connectives between displayed equations — which order-respecting alignment recovers.

A first, greedy matcher scored 45 % on the two-column paper; the text layer was never the problem, the matcher was. Not yet handled: footnotes (they sit elsewhere on the page), blocks starting mid-line (need line rectangles, not one bounding box), tables as regions. Not tested: PDFs without ToUnicode maps, author-uploaded PDFs that differ from the HTML build, right-to-left papers, timing and memory in Chrome.

### 3. A full TeX runtime should not be bundled into the extension package — READ / REPORTED (corrected, see the second addendum)

- BusyTeX is the active full-TeX browser implementation found (a third party's survey of npm says every maintained one wraps it; not checked beyond npm): engine wasm 27–32 MB; XeTeX needs a 22 MB ICU file; one CJK font 15–25 MB. All-in about 80–95 MB raw, and `revtex`, `IEEEtran`, `acmart`, `elsarticle` are in no bundle. Broad coverage needs a per-file TeX Live server; SwiftLaTeX's is gone (domain probed dead today).
- MV3: in a context that has extension APIs, WASM must be in the package and the policy lists "building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data" as a violation. **This was written as if it covered every context; it does not** — the same policy exempts code run in contexts isolated from extension APIs, "such as iframes and sandboxed pages" (second addendum).
- 440 MB–1.2 GB of memory and 3–60 s per cold compile (one third-party log, template documents, not arXiv papers).

### 4. Source-first translation in practice — READ / REPORTED, plus our own service H teardown (VERIFIED_RUNTIME, 2026-09-17)

- Compile success, "a PDF was produced": naive ctex injection 60–80 % for Chinese; with masking, a validator and an engine fallback ~90–95 %; Japanese ~75–85 % (LaTeXTrans v3 of 2026-03-11, Table 1, 100 papers: CSR 97 / 85 / 90 % for zh / ja / ko, 94 / 76 / 86 % on the 50 CS papers; v1 and v2 had 50 CS papers and no CSR; "success" in its code is a PDF existing after `latexmk -f` in nonstop mode); faithful-and-complete about ten points lower (59/70 rated A). Silent damage is the characteristic failure: a PDF with the Chinese glyphs dropped, or two columns turned into one and three sections gone.
- service H reached ~5 % failures after 5 000 papers, 20 000+ lines of TypeScript and 500+ tests, and still repairs cases by hand daily.
- ~~No existing tool compiles any target outside Chinese, Japanese and Korean.~~ **Wrong as written** (second addendum): LaTeXTrans's authors publish French, German, Italian and Portuguese PDFs made with it. What holds: the explicit compile adaptations of existing tools are for CJK, and nothing measures other scripts on arXiv papers. We offer 179 languages; the TeX path needs a script-by-script support matrix.
- The whole paper is translated before the first page appears (1–10 minutes at service H): no viewport-lazy translation, a whole paper's requests at once against free providers, a whole paper's tokens on the reader's own key.
- The result is two unrelated PDFs: 87 pages against 96 at service H, kept together by pixel deltas that drift; no paragraph or sentence correspondence. Table cells, running heads and figure text stay untranslated — all of which the HTML pipeline translates today.
- A server may compile for one reader and keep nothing; it may not cache. arXiv's API terms forbid storing and serving e-prints "unless … permitted to do so by the license", and most papers carry arXiv's non-exclusive licence (INFERRED as to legal effect; not legal advice). Per-user fetching of `/src/<id>vN` from the browser is fine: `Access-Control-Allow-Origin: *`, and the terms allow personal storage.
- A service needs a ~5 GB TeX Live image (arXiv's base image is private; its `submission-tools` are BSD-3 and portable), one network-less container per job, quotas per install. Hosting is cheap (~$0.002 a compile, INFERRED); the failure rate and the duty are the cost.

### 5. PDF-native translation (BabelDOC class) — READ

AGPL-3.0; a 75 MB layout model; formulas detected by font heuristics; cross-column and cross-page paragraphs and tables still on its roadmap. Ruled out for the extension by size alone (the maintainer, 2026-09-22). It is the right family for PDFs with no source and no HTML — the Web App stage, as the issue says.

### 6. The viewer — MEASURED / READ

`pdfjs-dist` 6.3.289: `pdf.min.mjs` 459 KB (132 KB gzip), `pdf.worker.min.mjs` 1 265 KB (375 KB gzip); `cmaps/` 1.6 MB, `standard_fonts/` 0.8 MB, `wasm/` 1.5 MB are optional for pdfTeX output. No eval path in v6; `wasm-unsafe-eval` is already in our CSP for the recogniser. arXiv PDFs are untagged (no structure tree to lean on) but carry 100–180 link annotations each. arXiv sends no `X-Frame-Options` or CSP on `/html/` or `/pdf/`, and both honour byte ranges — pages can be streamed rather than the file fetched whole. Opening: `tabs.update` to our page from the floating button already on `/pdf/` pages, as Hypothesis does; no `declarativeNetRequest`, no new permission. About 13 MB per rendered page canvas at 2×, ~130 MB for a ten-page cache: one PDF beside an HTML pane costs half of what two PDFs would.

## The options side by side

| | Coverage | Added to the package | Backend | Lazy translation | Paragraph / sentence link | Target languages | Tables, figure text | Standing duty |
|---|---|---|---|---|---|---|---|---|
| **PDF + HTML pane, anchored** | ~94 % | 0.5–1.4 MB | none | yes | yes / yes | 179 | yes | the matcher's benchmark |
| Source → compile in the extension | ~95 % × compile rate | 80–95 MB, classes still missing | package server | no | no | 3 | no | high, plus store risk |
| Source → compile on our server | ~95 % × compile rate | ~0.5 MB | TeX farm, sandbox, quotas | no | no (SyncTeX unproven) | 3 | no | daily triage |
| PDF-native in the browser | all PDFs | 75 MB+ | none | per page | heuristic | many | partly | high |
| Translation drawn into the page | ~94 % | 0.5–1.4 MB | none | yes | yes | fits badly when text grows | yes | fitting, white-out, refit on zoom |

## Shape of the recommended design

1. **Reader page** (an extension page, `?id=<id>vN`): PDF.js on the left; on the right the same version's arXiv HTML, fetched, parsed inert, mounted, with the existing core running on it unchanged — extractor, protector, providers, cache, renderer, sentence alignment, figure translation. The platform boundary (DESIGN §4.2) is what makes this cheap. Whether the HTML is mounted in the page or framed with the content script inside is a prototype question.
2. **Anchors** (`core/anchors`, pure: text-layer items + blocks → line rectangles per block, with a confidence): unit-tested against fixtures like the rules are. A whole-document coverage score; below a threshold the panes fall back to proportional scrolling and say nothing false.
3. **What the link layer drives**: scrolling synchronised by anchors in both directions (no drift — there is one pagination); hovering a sentence on either side lights its counterpart, on the PDF as line rectangles (word-level anchors make this possible; no product found does it); translation triggered by what either pane shows.
4. **No usable HTML** (PDF-only submissions, the rare conversion failure): the reader says so and shows the original. That 5–6 % is the same set a source-first path would miss.
5. **Later, if wanted**: the translation drawn into the page geometry, per paragraph and on demand, as an experiment on top of the same anchors — not as the first release. A typeset translated PDF as a Web App export.

## The issue's open questions

1 — 95 % have source; 94 % have usable HTML; the difference is one paper in 84. 2, 3, 4, 5, 7, 8, 14 — moot if nothing is compiled; findings above if that changes. 6 — reused whole, because the input is still the HTML. 9 — original PDF, plainly labelled. 10 — the original layout is kept by showing the original; the translation is reflowed for reading. 11 — paragraph and sentence correspondence in the first version: it is the cheap part here. 12 — not needed; text anchoring measured at 95–100 %. 13 — 0.5 MB zipped minimum, measured. 15 — existing cache keys stand; anchors are recomputed in ~0.3 s and need no cache. 16 — nothing new leaves the machine: the PDF and HTML come from arXiv to the reader's browser, text goes to the provider the reader chose, as today.

## Next steps proposed

1. Prototype the reader page: PDF.js + mounted HTML + the pipeline running; measure package delta, memory, time to first translation in Chrome.
2. Turn `spikes/align.mjs` into a benchmark over all twelve fixtures and ~20 more papers (footnotes, line rectangles, tables by caption, a coverage threshold).
3. Then a DESIGN section and an ADR, and the work split into PRs: reader shell, anchors, synchronisation, highlighting.

---

## Addendum, 2026-09-22 (later): four corrections from the maintainer, and two more spikes

The maintainer corrected four arguments made above against the source-first path. All four stand, and the arguments are withdrawn:

1. *"It breaks the viewport-lazy model."* The PDF mode is a new mode; translating the whole paper and then showing it is acceptable there.
2. *"Two unrelated PDFs, 87 pages against 96."* A different page count is expected and fine; what service H lacks is a correspondence layer, not equal pagination.
3. *"Table cells and figure text stay untranslated."* A limit of service H's implementation, not of the route; what the HTML pipeline learnt is to be applied to the source.
4. *"A cache is a legal exposure."* Only a server cache is. Everything here runs and is kept on the reader's machine.

What is left of the case is one question — **where TeX runs** — and the compile success rate. Two spikes were run to put first-hand numbers on both halves of the maintainer's position.

### Spike A — a translated unit can be located in the translated PDF — MEASURED

service H's translated LaTeX project and compiled Chinese PDF of 2503.06072 (captured 2026-09-17), `spikes/align-tex.mjs`: CJK matched per character, the same anchor-chain matcher. **291 of 295 translated paragraphs located** (≥ 85 % of their characters in order), 4 partly, none lost; 259 in one region, 32 in two; 79 ms. With the 95–100 % measured on the original side, a paragraph- and sentence-level link between two PDFs of different pagination needs neither SyncTeX nor markers in the source. **The translated PDF needs PDF.js's `cmaps/` (1.2–1.6 MB)**: without them its CID fonts yield no text (0 of 295).

### Spike B — BusyTeX compiles a real arXiv paper in a real Chromium — MEASURED, one paper

`spikes/busytex.mjs`, `texlyre-busytex` 1.4.0 (TeX Live 2026), headless Chromium, the source of 2609.03768v1 (CC BY; `elsarticle`, one file, eight PDF figures, inline bibliography — a favourable case):

| Run | Result | Time |
|---|---|---|
| unchanged, pdfLaTeX | 27 pages, as arXiv's own PDF | 2.0 s to start, 1.7 s to compile (two passes) |
| `ctex` (Fandol) put in, Chinese in the abstract, XeLaTeX | 32 pages, Fandol embedded, the Chinese extractable | 2.1 s, 7.0 s |

What it took: the engine is 31 MB of wasm; the three local package tiers are 88, 192 and 326 MB (689 MB with biber) **and hold neither `elsarticle`, `revtex`, `acmart`, `xeCJK` nor the Fandol fonts (33 MB)** — those exist only in the index of a remote per-file repository. The class was generated from CTAN and `ctex`, `xeCJK`, `zhnumber` and the fonts were taken from a local TinyTeX and handed in as files, which is what such a repository would do. The first Chinese run failed with "`fontspec.sty` not found" and the identical second run succeeded; cause not found. Not measured: memory of the wasm heap, a paper with `\input` files, a `.bbl`, EPS figures, a conference class, Japanese, any repair loop, and any success *rate*.

### What this changes

- The engine is good enough: fast and correct on this paper, in the browser, on the reader's machine. The third-party figures on compile rates (60–95 % Chinese, lower Japanese) remain unverified here.
- It cannot live inside the extension under the maintainer's own size rule (31 MB of engine before any package or font), and broad coverage needs a per-file TeX Live repository fetched at run time — which for an extension also meets MV3's clause on interpreting remotely fetched commands.
- **One arrangement that meets every constraint** (written as "the one"; the second addendum adds two more): the compiler on a static page of ours (the Web App's domain) — engine, a per-file TeX Live tree, fonts, all static files; every computation in the reader's browser; nothing computed or kept on a server. The extension stays as light as it is and remains the entry point and the translation engine (providers and keys never leave it; the page talks to it through `externally_connectable`). ~~and fetches arXiv's PDF for the page~~ — withdrawn, the page can fetch it itself (second addendum). INFERRED: the store's rules on remote code do not reach a web page the extension opens, and the feature is auxiliary to an extension that already works by itself; not confirmed with the store.
- The reader shell and the link layer are common to both kinds of right-hand pane — the HTML-derived translation and the compiled translated PDF — and spike A shows the same matcher serves both. The HTML-derived pane needs no infrastructure and is the fallback whenever a compile fails or the target script has no TeX path yet; the compiled PDF is the second pane, arriving with the static site.
- New work the source path needs that nothing above removes: a LaTeX front end to the pipeline (paragraph ranges patched in place, math and references masked — the shape service H and LaTeXTrans converged on, and the shape of our protector), a validator and a repair loop, table cells with their alignment characters, figures (labels of PDF figures read exactly from their text layer, bitmaps through the recogniser; EPS cannot be rendered in a browser), and a list of target scripts the TeX path supports, starting with Chinese, Japanese, Korean and the Latin-script languages.

---

## Second addendum, 2026-09-22: a colleague's review, checked against the primary sources

The review (`read_arxiv_report_review_v2.md`) was checked claim by claim. **Right, and new to this report:**

1. **The store's policy exempts isolated contexts.** Verbatim from the MV3 requirements page: code run in contexts isolated from extension APIs "(such as iframes and sandboxed pages) are exempt from the restriction on loading code from remote sources", treated like communication with external servers, the extension's full functionality still having to be determinable. The migration guide says the same ("Remotely hosted code is supported in sandboxed iframes"). So §3's interpreter-clause argument, and the first addendum's "the one arrangement found", were too strong. There are three boundaries to try, not one:
   - a **sandboxed extension page** loading the compiler remotely. Its CSP must carry `sandbox` and may not carry `allow-same-origin` (READ, manifest reference): an opaque origin, so **no IndexedDB or Cache API inside it** — the engine, fonts and TeX files would be cached by the embedding extension page and handed in by `postMessage`;
   - an **iframe of our static site inside the extension's reader page**: a real origin with its own storage, the same exemption, and the reader shell, PDF.js, anchors and translation pipeline all stay in the extension with no `externally_connectable`. Whether BusyTeX needs cross-origin isolation there (every run here was isolated) is unmeasured;
   - the **hosted top-level page** of the first addendum.
2. **arXiv answers cross-origin reads.** With an `Origin` header, `/pdf/`, `/src/`, `/html/` and `export.arxiv.org/pdf/` all send `Access-Control-Allow-Origin: *` (MEASURED; the header is absent without `Origin`, which is how §6's check missed it). A hosted page fetches the original PDF itself; the first addendum's "the extension fetches arXiv's PDF for the page" is withdrawn, and no PDF needs to cross the extension's messaging boundary in either direction.
3. **Targets beyond CJK exist**: NiuTrans publishes Chinese, Japanese, French, German, Italian and Portuguese PDFs of two books made with LaTeXTrans (READ, the repository's README). They are the authors' own projects, not arXiv papers, so they show the route is open, not what it covers. The support matrix by script family (Latin; Cyrillic and Greek; CJK; right-to-left; Indic) is the right frame.
4. **Three success rates, not one**: C0, the unchanged source compiling in the browser; C1, the translated source compiling, among C0's successes; F, faithful and complete. C0 separates the engine and its package coverage from the translation front end, which a single "success rate" does not.
5. **Follow arXiv's own engine and TeX Live version before changing either**: the source package's `00README.json` names both (seen here: `pdflatex`, TeX Live 2025), BusyTeX ships 2026 only, and pdfLaTeX → XeLaTeX is not free. Spike B switched engines without measuring what that costs.
6. A smaller initial TeX profile than the published 93 MB `basic` tier is worth building. A third party's log already in hand measured 21.8–23.4 MB brotli for a first load with a per-file endpoint (REPORTED); `texlyre-busytex-build` documents the package server and a font index for fetching single fonts (READ).

**Not right:** the review says LaTeXTrans's paper reports no compile rate and that 76 % has no primary source. It is in v3, Table 1 (quoted in §4 now); the review describes v1/v2. Its request stands all the same — the figure needed its version, test set and definition of success beside it, and has them now.

**Already in the first addendum:** one reader shell with two right-hand panes; TeX out of the package; LaTeXTrans (MIT, so portable into a GPL tree with attribution) as a reference for invariants and the repair loop rather than a parser to port; generic PDFs later.

**One thing the review's plan leaves out:** its corpus spike (C0 on 100 papers) cannot run on the published tiers — they lack `elsarticle`, `revtex`, `acmart` (spike B) — and should not run against someone else's endpoint. A local full-TeX-Live package server comes first; the download-size spike and the corpus spike share that groundwork.

---

## Third addendum, 2026-09-22 (night): C0 on a random corpus, and the extension boundary

The owner chose to measure before deciding: compile rate of unchanged sources in the browser (C0), then translated sources (C1) and faithfulness (F), with the colleague's three-level split. This addendum covers C0 and the boundary. Everything below is **MEASURED** unless graded otherwise. Scripts in `spikes/`, results in `out/`, PDFs to look at in `compare/` (open `compare/index.html`: for each paper arXiv's PDF, the native compile and the browser compile side by side).

### Setup

- **Corpus** (`spikes/corpus.mjs`): 130 ids drawn uniformly from 2608.00001–2608.31132 (August 2026), seeded, so the rate is unbiased. 11 PDF-only (8.5 %), 119 with TeX source, **every one carrying arXiv's `00README.json`** (main file, compiler, TeX Live version). Compilers: pdfLaTeX 115, XeLaTeX 3, LaTeX (DVI) 1; arXiv's TeX Live 2025 for 117, 2023 for 2. Classes: article 52, IEEEtran 15, revtex 12, amsart 8, acmart 6, llncs 4, elsarticle 4 and 18 others. 48 multi-file; 24 ship a `.bbl`, 74 only a `.bib` (arXiv runs BibTeX for them — the "arXiv never runs BibTeX" premise is out of date); 2 use biblatex; 4 have EPS figures.
- **Native control** (`spikes/c0-native.mjs`): `texlive/texlive:latest` (TeX Live 2026, updated to September) in Docker, latexmk with arXiv's compiler and main file, `.bbl` kept when shipped, no network, 300 s.
- **Browser** (`spikes/c0-browser.mjs`): `texlyre-busytex` 1.4.0 (TeX Live 2026) in headless Chromium, the `basic` tier (88 MB) preloaded, every other file fetched on demand from a TeX Live file server (TeXlyre's `texlive-server`, AGPL, used unmodified for the experiment with the owner's agreement) serving the Docker image's tree. Same main file, engine and `.bbl` rule; one fresh page per paper; 300 s.
- **Pass**: a PDF whose page count is within one of arXiv's. **Checked besides** (`spikes/c0-compare.mjs`): the share of arXiv's words the compile also has, unresolved references (`??`), embedded images.

### Results

| | Pass | Clean pass (no lost words, references or images) |
|---|---|---|
| Native, TeX Live 2026 | 118 / 119 | 117 (one native run left 24 `??` from too few passes; its browser compile is clean) |
| Browser, BusyTeX as published | 106 / 119 | **103 (86.6 %)** — three "passes" had lost their whole bibliography |
| Browser, BusyTeX with four small patches | 113 / 119, no paper made worse | **113 (95.0 %)** |

Browser cost, patched run: compile median 3.5 s, p90 13.1 s, max 101 s; renderer peak memory median 546 MB, p90 711 MB, max 1.07 GB; files fetched on demand median 134 (0.3 MB), p90 296 (2.2 MB), max 529 (5.9 MB). Native compile median 6 s, p90 20 s.

### Why papers failed in the browser, and what fixed them

| Cause | Papers | Fixed by | Status |
|---|---|---|---|
| `\bibliography{x.bib}`: bibtex8 appends `.bib` again and finds nothing — three of these still produced a PDF within one page of arXiv's, i.e. **silent damage** | 4 | rewriting `\bibdata`/`\bibstyle` in the `.aux` without the extension before bibtex8 runs (standard BibTeX accepts the extension; BusyTeX ships only bibtex8) | measured |
| Bibliography backend guessed from raw text: a commented-out `backend=biber` chose biber for a natbib paper (a second case, biblatex with its default backend choosing bibtex8, was found while writing the reproduction; none in the sample) | 1 | comments stripped; biblatex without an explicit other backend means biber | measured |
| BusyTeX's biber writes an accent macro (`Br\'ezis`) as a double-encoded combining character (`BreÌ` + U+0081; U+0088 for `\"`) | 2 | biber run with `--output-safechars` (a workaround; the bug is in the wasm biber) | measured |
| Main file in a subdirectory: BusyTeX compiles from the main file's directory, arXiv from the package root | 1 | compile from the root | measured |
| METAFONT-only fonts (`bbm`): TeX calls mktexpk, which cannot fork in wasm; the on-demand fetch is not wired into bitmap-font lookup | 2 | bitmap fonts generated natively beforehand and given to the compile | measured |
| `nicematrix` of September 2026 needs LaTeX 2026-06-01; BusyTeX's format has LaTeX 2025-11-01 — **our server's tree is newer than BusyTeX's snapshot** | 2 | serve the same snapshot BusyTeX was built from (in progress) | diagnosed from the log |
| EPS figures need Ghostscript (xdvipdfmx `rungs`, `epstopdf`) | 3 | not addressed: needs a Ghostscript build for wasm (AGPL, 15–20 MB, REPORTED size) | open |
| Fails natively too (`revtex4` under XeLaTeX on TeX Live 2026) | 1 | — | not the browser's |

The patches are in `data/busytex-patched/busytex/busytex_pipeline.js` and `busytex_biber.js` (marked `[research patch]`).

### The boundary, measured (`poc-ext/`, `poc-site/`, `spikes/poc-run.mjs`)

A minimal MV3 extension whose reader page frames our "static site" (a second origin serving the compiler page and BusyTeX's files), hands it a paper's source by `postMessage`, receives the PDF (transferred, not copied) and renders it with the PDF.js the extension carries.

- **It works, and needs no cross-origin isolation**: inside the frame `crossOriginIsolated` is false and there is no `SharedArrayBuffer`; BusyTeX compiled all the same.
- **The frame has storage**: IndexedDB and the Cache API work (partitioned under the extension), quota 10 GB. First visit fetched 122 MB, initialisation 1.1 s, compile 3.6 s; the second visit fetched 33 MB (the basic tier cached; the 31 MB engine refetched because the test server sent no cache headers), initialisation 0.7 s. A 15 MB PDF came back and page 1 rendered in 91 ms.
- **A sandboxed extension page is not a workable host**: IndexedDB, the Cache API and `localStorage` are all refused, and a worker cannot be created even from the extension's own file — only from a blob, which may `importScripts` remote code. Every visit would download everything again. Chrome accepts remote sources in the sandbox's CSP.

### What C0 says

- The engine is not the limit: 113 of 119 unchanged papers compile in the browser with nothing lost, against 118 natively; of the six left, two are our set-up, three are EPS, one fails everywhere.
- **"A PDF came out" is not success**: three papers passed on page count with their whole bibliography gone. The word, reference and image checks caught them; any later rate must carry them.
- Most failures sat in BusyTeX's JavaScript around the engine, not in TeX: four small patches, each a candidate for upstream.
- **Latency on a real network is unmeasured.** Each file fetched on demand is a synchronous request from the worker: 134 at the median, 296 at p90. At 50 ms a round trip that is 7 and 15 s on top of the compile (INFERRED). A per-paper prefetch or a better initial set of files is the next thing to measure, with a real remote server.

### Next, as agreed with the owner

1. Align the file server with BusyTeX's snapshot (the TeX Live 2026 ISO BusyTeX's build installs from) and rerun C0 — expected 115 / 119.
2. Keep the 119 papers as a regression gate for every change to the compile layer.
3. Draft issues for BusyTeX upstream (the five problems above), for the owner to review; nothing is posted without approval.
4. Then C1 and F: the translation front end on a subset of C0's passes, in Chinese, Japanese and one Latin-script language.

### Upstream drafts (for the owner; nothing posted)

`upstream/` holds five issue drafts for TeXlyre/texlyre-busytex-build (A and B come from busytex/busytex unchanged), each with a self-made minimal reproduction in `upstream/repro/` — the arXiv papers themselves cannot be put in an issue — and a patch in `upstream/patches/` where the fix is clean. Every reproduction was run three ways: TeX Live 2026 natively (all build), BusyTeX as published (all fail or lose the bibliography), BusyTeX patched (all build, except the METAFONT one, which needs pre-generated fonts). Patches A, C and D were applied to TeXlyre's original files and retested as they stand.

---

## Fourth addendum, 2026-09-23: C1 — translated sources, compiled

Everything MEASURED unless graded otherwise. Front end `spikes/latex-front.mjs`; preparation `spikes/c1-prepare.mjs`; native runs `spikes/c1-native.mjs`; real translation `spikes/c1-mt.mjs`; PDFs to look at: `compare/mt.html`.

### The front end

A scanner, not a parser: it knows which constructs carry prose (paragraphs, headings, captions, footnotes, abstract, theorem bodies, list items) and treats everything else as opaque. Each unit keeps its byte range; math, citations, references, labels, unknown commands with their arguments, accents with their letter, TeX assignments (`\looseness=-1`) and shorthand math environments (`\be … \ee`, collected from the package's `.tex` and `.sty`) become placeholders; formatting groups (`\emph{…}`, `{\bf …}`) become pairs; a footnote is a unit of its own rendered inside its paragraph. The translation replaces each range in place; every other byte is kept. Latin-1 sources are transcoded to UTF-8. Tables, bibliographies, code and verbatim environments are skipped in this version (table cells: not yet).

Every defect found on the corpus was fixed and guarded by `spikes/front-gate.mjs` (units, letters and files of all 113 papers against a snapshot; two seconds). The defects, for the record, because each is a class a production front end must handle: an accent's letter translated away (pdfTeX then accents a CJK character); an argument on the next line (`\title[…]` ⏎ `{…}`); a command at the head of a paragraph outside the unit (XeTeX reads `\approach本文` as one control word — a `{}` is written after a control word followed by translated text); shorthand math macros; `\looseness=-1`; a first version of that fix that swallowed `\maketitle` ⏎⏎ `\begin{abstract}` and an `\input`; `\begin{biblist}*{…}`; a tcolorbox listing written to `\jobname.listing`; TeX specials (`# % & _ { } ~ ^ \`) in machine-translated text.

### Compile strategies and adaptation rules

Chinese and Japanese need a CJK set-up: **pdfLaTeX + CJKutf8** (the paper's own engine) or **XeLaTeX + xeCJK** (a switch of engine; ctex with `scheme=plain` behaved like xeCJK and added nothing). Three adaptation rules for the switch and for templates (R1: pdfTeX primitives and `\DeclareUnicodeCharacter` shimmed, a template's `\RequirePDFTeX` disarmed; R2: `pdftex` driver options removed; R3: a template's "package X is forbidden" errors turned into warnings).

**Whole** = a PDF with ≥ 90 % of the inserted target text found in it, no leaked placeholder, no new `??`, no lost image, **and no error the unchanged paper's compile did not have** (TeX writes a PDF through errors; counting only PDFs overstated every rate by 10–20 points in a first pass).

### Results, native TeX Live 2026, pseudo-translation, the 113 papers that are C0-clean in the browser

| | before rules (91 papers) | after (113) |
|---|---|---|
| German (paper's engine, nothing added) | 91 % | **98.2 %** |
| Chinese, XeLaTeX + xeCJK | 70 % | 86.7 % |
| Chinese, pdfLaTeX + CJKutf8 | 67 % | 78.8 % |
| **Chinese, xeCJK then CJKutf8** | 81 % | **93.8 %** |
| Japanese, xeCJK | 69 % | 80.5 % |
| Japanese, CJKutf8 | 66 % | 73.5 % |
| **Japanese, xeCJK then CJKutf8** | 79 % | **90.3 %** |
| Control: XeLaTeX + xeCJK, nothing translated | 75 % | 86.7 % |

- **The front end is no longer where papers are lost; the CJK set-up is.** Chinese through xeCJK passes exactly as often as the untranslated control (98 papers each). The switch of engine alone costs 13 % of papers even with the rules; pdfLaTeX + CJKutf8 fails differently (revtex, acmart and similar classes: an `Extra \else` from uppercased headings, or a hang under Japanese — 11 of 12 Japanese CJKutf8 "damaged" runs were 300 s hangs), which is why the two in sequence reach 94 / 90 %.
- Left for Chinese (7): two papers with a parameter-stack overflow not yet diagnosed (they fail in German too), two revtex, one acmart, one amsart (math families under XeTeX, title outside the CJK environment under CJKutf8), one custom template.
- The translated PDFs keep their length: pages translated / original, median 1.00 (0.85–1.35), no more overfull lines at the median.

### Real translation (Microsoft's free endpoint, the extension's default; 12 papers stratified by class)

| | units | markers intact (strict) | recovered by a tolerant parse | runs fallback | untranslated | compiles with no new errors |
|---|---|---|---|---|---|---|
| zh | 1 615 | 1 485 | 124 | 6 | 0 | 10 / 12 |
| ja | 1 615 | 1 423 | 179 | 13 | 0 | 10 / 12 |
| de | 1 615 | 1 597 | 17 | 1 | 0 | 12 / 12 |

- **The engine drops a marker's closing `#` before CJK text** (`@b形`, `@g。`): 10.7 % (zh) and 15.7 % (ja) of units with markers fail a strict parse, against 1.5 % (de). A tolerant parse — a lone `@` and letters, never inside a word, which the `@@` escape makes unambiguous — recovers 93–95 % of them. The same parse applies to the extension's HTML pipeline: filed as SRjoeee/ReadarXiv#291 (to be measured there).
- The two papers with errors in zh and ja are the engine-switch cases (acmart's fonts; `\textnormal` in a superscript under xeCJK), not the translation. Formatting pairs came back out of order 2–4 times per language, and were caught.
- `compare/mt.html`: the twelve papers, arXiv's PDF and the three translations side by side. Figures are not translated in this run; table cells neither.

### What C1 says

- A source-first translation compiles, natively, for about 94 % of papers in Chinese, 90 % in Japanese and 98 % in German — before a single paper-specific fix, with seven small rules. The residue is a long tail of class and package interactions under CJK, the same tail service H works through by hand; the difference is that a fallback to the HTML-derived translation pane is always there.
- Unknown in the browser, next: the same variants compiled by BusyTeX against the aligned server (CJK fonts fetched on demand), and the cost in time and bytes.

### C1 in the browser (BusyTeX, the aligned server, the patched pipeline; `spikes/c1-browser.mjs`)

The same prepared Chinese variants, compiled by BusyTeX in Chromium against the file server now built from the TeX Live 2026 release ISO — the snapshot BusyTeX's own build installs from (verified: the two `nicematrix` papers now pass C0; the gate baseline is 115 / 119 clean, `out/gate/baseline.json`).

| | browser | native |
|---|---|---|
| zh, XeLaTeX + xeCJK | 98 / 113 | 98 / 113 |
| zh, pdfLaTeX + CJKutf8 | 89 / 113 | 89 / 113 (the same papers) |
| **zh, xeCJK then CJKutf8** | **106 / 113 (93.8 %)** | **106 / 113** |

- **The browser loses nothing to native TeX Live on translated sources.** Where they differ it is in both directions: two papers fail natively and pass in the browser (a `\textnormal` in a superscript breaks under the newer LaTeX kernel of the September TeX Live, not under the release snapshot), two pass natively and fail in the browser — **xdvipdfmx runs out of wasm memory on large images** (`asked for 219206476 bytes`), a real browser limit to raise in the build or to work around by scaling images.
- Cost per paper, browser: compile median 11 s, p90 31 s (both strategies). Fetched on demand: **xeCJK 7.5 MB at the median** (the Fandol fonts, whole files; cached after the first paper), **CJKutf8 0.1 MB** (sub-fonts of 256 glyphs, fetched as used). Renderer peak memory: xeCJK median 826 MB, max 1.1 GB; CJKutf8 median 552 MB.

### Table cells (MEASURED, native, `spikes/c1-native.mjs` with the `+t` variants)

Cells of `tabular`, `tabularx`, `longtable` and their kin become units of their own (`&` and `\\` end one; only the text argument of `\multicolumn`, `\multirow`, `\makecell` is prose; numbers and formulas stay as they are). One defect found and fixed on the way: booktabs' `\cmidrule(lr){2-5}` — the trim argument in parentheses was taken for text (19 papers use it).

| | cells translated | cells kept |
|---|---|---|
| German | 111 / 113 | 111 / 113 |
| Chinese, xeCJK | 98 / 113 | 98 / 113 |
| Chinese, CJKutf8 | 88 / 113 | 89 / 113 |
| **Chinese chain** | **106 / 113** | **106 / 113** |

About 5 500 cells more are translated (units 14 659 → 20 144) at no cost in compile rate. Table translation is on from here.

### An LLM in the `tags` wire format (the owner's OpenAI-compatible endpoint, `agnes-3.0-flash`; 6 of the 12 papers, zh)

The extension sends `tags` to LLMs (`<x id="n"/>` void, `<t id="n">…</t>` paired). Same six papers, same units:

| | placeholders intact | runs fallback | untranslated | compiles, no new errors | time per paper |
|---|---|---|---|---|---|
| LLM, `tags` | 772 / 811 (95.2 %) | 39 | 0 | 5 / 6 | 6.5–15 min |
| Microsoft, `markers` | 748 strict (92.2 %) + 61 tolerant | 2 | 0 | 5 / 6 | 8–13 s |

- Both keep the placeholders well enough that no paragraph is left in English and the compile rate is the engine's, not the translator's (the one paper with errors is the `\textnormal` under xeCJK case in both).
- The LLM's terms read better on the page checked (`引言` against `简介`, `大语言模型`, "aligned LLMs" as `已对齐 LLM`) — a spot check, not a quality study.
- Time is the endpoint's rate limit: sustained load returned hundreds of 429 (a burst of twelve did not); one unit per request cost ~49k prompt tokens a paper, mostly the repeated system prompt — batching units per request, as the extension does, would cut both.

### Where this leaves the decision

Measured end to end, in the reader's browser, with no server doing any computing: an unchanged arXiv source compiles for 96.6 % of papers (115 / 119), a translated one for 93.8 % in Chinese (106 / 113, both CJK set-ups in turn), 90.3 % in Japanese and 98.2 % in German natively; the browser matches native on the translated sources it was run on. Table cells are translated at no cost. Two translators keep the placeholders well enough to leave nothing untranslated. The architecture that measured: the extension's reader page, a frame of our static site running BusyTeX (no cross-origin isolation), a TeX Live file tree built from the release ISO BusyTeX's formats come from, the extension's own providers.

Open, in the order they would matter to a first version:

1. **The reader itself**: original and translated PDF side by side, linked by text anchoring (spike A: 291 / 295 translated paragraphs located in a compiled PDF; the original side measured at 95–100 %).
2. **First-use cost on a real network**: 122 MB on the first visit (engine 31 MB, basic tier 88 MB), then 0.1–7.5 MB per paper, and 112–221 synchronous file requests per compile whose round trips were not measured. A smaller initial profile and a per-paper prefetch list are the levers. The file server must also become static (a precomputed `/<format>/<name>` layout) for "nothing computed on a server" to hold.
3. **Figures**: text in the paper's own figure files (PDF and bitmap) is not translated yet; the extension's bitmap recogniser and the PDF text layer are the two inputs.
4. **The long tail**: EPS (a Ghostscript build for wasm, AGPL), xdvipdfmx out of memory on large images, revtex/acmart/amsart under CJK, two parameter-stack overflows not yet diagnosed; the fallback for all of them is the HTML-derived pane.
5. **Upstream and the extension**: TeXlyre/texlyre-busytex-build #33–#37 (filed 2026-09-23); SRjoeee/ReadarXiv#291 (the marker `#` Microsoft drops before CJK text, to be measured in the HTML pipeline).

> Correction to the memory figures above: "renderer peak" there is the RSS of every renderer process of the test browser, which is about 180 MB for a blank page in that set-up (measured). The compile itself added about 360 MB at the median for C0, 640 MB for Chinese through xeCJK, 370 MB through CJKutf8.

---

## Fifth addendum, 2026-09-23: the reader prototype

`poc-reader/` (an MV3 extension: load it unpacked, its toolbar button opens the reader), `spikes/reader-test.mjs`, `spikes/reader-mem.mjs`.

### The choice of viewer: PDF.js's own viewer components, no wrapper

`pdfjs-dist` 6.3.289 — `build/pdf.min.mjs`, its worker, and `web/pdf_viewer.mjs` (`PDFViewer`, `EventBus`, `PDFLinkService`) — under a few hundred lines of our own. service H uses PDFSlick; looked at (`@pdfslick/core` 4.0.2, MIT, maintained): it builds exactly these components and adds a zustand store, a print service and bindings, and exposes `viewer`, `eventBus`, `linkService`. Not taken, because (1) what the reader needs — two viewers linked by anchors, highlight rectangles in page coordinates — lives on `PDFViewer` itself, which a wrapper only passes through; (2) **it ships its own worker, 6.2.108, and sets `GlobalWorkerOptions.workerSrc` to it when imported, while depending on `pdfjs-dist ^6.0.227`**, which resolves to 6.3.289 — PDF.js refuses a worker of another version; (3) every layer between us and PDF.js is one more to wait for at a major version (6.0 was May 2026). The choice is reversible: both sit on the same components.

### What it does

Original on the left, translation on the right, each in its own `PDFViewer`. On load the reader reads both text layers, locates every unit on both sides with `anchors.mjs` (the spikes' matcher, pure, the same file the Node tests run), then: scrolling either side brings the paragraph a quarter of the way down the view to the same height on the other; hovering a paragraph lights its lines on both sides; a click scrolls the other side to it; one zoom for both.

### Measured (headless Chromium, 1600 × 1000)

| | 2608.04322 (IEEEtran, two columns) | 2608.00055 (article) |
|---|---|---|
| pages original / translation | 13 / 11 | 27 / 21 |
| first page drawn, left / right | 251 / 604 ms | 216 / 324 ms |
| both text layers read | 865 ms | 335 ms |
| anchors computed | 115 ms | 76 ms |
| units linked on both sides | 114 / 131 | 87 / 92 |
| sync: the reference paragraph's height, left / right | 323 / 323 px | 405 / 405 px |

- Memory, above the test browser's baseline (571 MB with the extension loaded, no document): +112 MB with the original alone, +209 MB with both, +505 MB after scrolling every page of both into view. To bring down before a release: the viewers' page buffer, the canvas size cap, releasing the worker's caches of pages far from view.
- Size: the reader's own code and PDF.js's core, worker and viewer, zipped **0.58 MB**; with character maps (needed for the text of CJK PDFs), standard fonts and image decoders **2.23 MB**.
- Not handled yet: the reference paragraph is the geometrically first below a quarter of the view, not the first in reading order (two-column pages can pick the wrong column); highlights are per paragraph, not per sentence; units shorter than three tokens (some headings) are not anchored; LaTeX's own fixed names are not translated (`Fig.`, `Corollary`, `Abstract`, `References` — `\figurename`, `\newtheorem` names and the like), so they appear in English in the translation.

## Sixth addendum, 2026-09-22: exact anchors, scroll sync, and progressive rendering (#292)

The owner tried the reader: scrolling did not follow the hand and sometimes snapped back; highlights were roughly right but off in detail; and could the translation appear page by page or block by block instead of all at once (#292)?

### Scrolling (`poc-reader/reader.js`, `spikes/reader-test.mjs`) — FIXED, MEASURED
- Cause of the snapping back: both panes drove each other, and the echo of a programmatic scroll was suppressed by a flag cleared two frames later, which momentum scrolling outlasts; the passive pane's echo then pulled the active one back. Every scroll event also measured every unit with `getBoundingClientRect`.
- Now only the pane under scroll intent (wheel, touch, keys, a press on its scrollbar) drives, once per frame, through a table of the linked units' tops measured once per layout (load, zoom, resize), kept where it rises on both sides and interpolated between neighbours. Wheel test, 60 steps on each paper: the follower never moved backwards.
- Two columns: no single map keeps every paragraph level, since the columns break differently on the two sides. When scrolling stops (160 ms), the paragraph at the reading line, in the column under the pointer, is brought level on the other side line for line. After that settle, 57 of 57 and 43 of 43 sampled paragraphs stood within 2 px of each other.

### Highlights — FIXED, MEASURED
- The drift toward the bottom right of each page was ours: the reader's stylesheet set `box-sizing: border-box` on every element, PDF.js sizes its page boxes as content boxes, so each page's canvas was squeezed by its 18 px of border (about a line off at the foot of a page). The hit test also ignored the 9 px page border.
- Text matching alone had real limits, found against ground truth (below): a paragraph whose words repeat elsewhere (research questions restated as headings; two table captions differing in one word) could anchor to the other copy; a paragraph running around a full-width table lost one of its parts; a theorem's last line of formula was dropped.

### Marks: exact positions from our own compiles — MEASURED
- `patch` can insert `\leavevmode\axtmark{<unit>s}` before each unit's first word and `\axtmark{<unit>e}` after its last text; `\axtmark` (`MARK_DEF`) makes a named PDF destination in pdfTeX, XeTeX and LuaTeX and is protected, so it survives moving arguments. Headings and table cells are not marked (heading text is also set in running heads and tables of contents).
- Gate (`spikes/marks-gate.mjs`): marks must not move a word. The same patched source compiled natively with and without marks, all 113 papers: **112 identical to the word, no new TeX error in any**. The residual: two list-item lines in 2608.08350 shifted 2 pt sideways (cause not isolated; the mark there still stands on the same word, so carrying marks over is unaffected). Two papers set a unit twice (a `restatable` theorem, restated later); PDF keeps the first destination, the original place. Five placement rules came out of it, each a real layout change it caught: after a display (`\]`) a mark opens a line of its own; in the vertical list it hides the preceding skip from `\addvspace`; between a word and its comma it costs a kern and respaces the line; `\leavevmode` ahead of a setup command (`\noindent`, `\pagestyle`, a run-in heading macro) indents the paragraph; and one author comments a passage out with `\if` followed by words, which a leading mark makes true. It also exposed two front-end bugs, fixed: `\hrule height 0.9pt` read as prose, and units extracted inside `\iffalse … \fi` and such `\if` blocks.
- The translation's compile carries its own marks. arXiv's PDF has none, but our compile of the original is laid out like it (`spikes/layout-same.mjs`, the 113 papers): browser build (BusyTeX, TeX Live 2026 ISO) 112/113 papers with ≥ 99 % of words at the same place, 113/113 ≥ 95 %; native Docker (TeX Live of September 2026) 95/113 ≥ 99 %. So each mark is recorded in our compile with the word it stands before or after (`original-marks.json`, 7–11 KB per paper) and used on arXiv's PDF only where arXiv's PDF has that word there: 109/109 and 73/73 on the two papers.
- Anchoring with marks (`anchors.mjs`): the marks bound each unit; text matching inside the bounds finds its lines; a unit's words count only on a line where they are most of it, or next to such a line; a gap between its words is filled when it is on the same page, owned by no other unit and between them on the page (formulas, displayed equations); a unit without marks (a heading) is searched only between its marked neighbours.
- Against the marks (`spikes/gt-eval.mjs`, units of 40 characters or more), highlight starting and ending on the right line:

| | 04322 original | 04322 translation | 00055 original | 00055 translation |
|---|---|---|---|---|
| text alone | 98 / 107 | 64 / 83 | 63 / 72 | 60 / 64 |
| with marks | 107 / 107 | 83 / 83 | 72 / 72 | 64 / 64 |

  (The metric's own truth — every body-size word between a unit's two marks — still counts a float the stream passes through as part of the paragraph, so its "missing lines" on 04322's original side are not all misses; the screenshots `out/reader-*-u*.png` were checked by eye.)

### Progressive rendering (#292) — MEASURED, then a recommendation
`spikes/prefix-browser.mjs`: one page, one warm BusyTeX runner, the local package server; the Chinese translations from the C1 runs. "One pass" borrows the original compile's `.aux` for labels and citations.

| paper | pages | today (every pass) | one pass | first 10 %, one pass | one pass, images as frames |
|---|---|---|---|---|---|
| 2608.04322 | 11 | 7.4–9.6 s | 1.9–2.9 s | 1.2–1.8 s | 1.7 s |
| 2608.00055 | 21 | 5.5 s | 1.4 s | 1.2 s | |
| 2608.00812 | 29 | 8.0 s | 1.9 s | 1.4 s | |
| 2608.01890 | 13 | 6.3 s | 1.5 s | 1.2 s | |
| 2608.06701 | 11 | 7.6 s | 1.9 s | 1.3 s | |
| 2608.12425 | 12 | 6.3 s | 1.6 s | 1.0 s | |
| 2608.02163 (3 MB of images) | 24 | 9.6 s | 6.5–7.6 s | 1.6 s | |
| 2608.10091 (9 MB of images) | 12 | 15.1–15.4 s | 11.6–12.5 s | 0.9–1.1 s | 1.4 s |
| 2608.02055 (10 MB of images) | 56 | 18.4–27.1 s | 10.9–13.7 s | 1.3–1.6 s | 2.4 s |

(2608.03063 does not compile under XeLaTeX with its Times setup — a C1 failure class, where the chain falls back to CJKutf8.)

- One pass is enough for a preview, and costs a quarter of today's compile: median 1.9 s against 7.6 s.
- The cost of a pass follows the images, not the pages: xdvipdfmx decodes and re-encodes every PNG. With `graphicx` in draft mode (a frame of the same size for each image) the heavy papers come down to 1.4–2.4 s.
- A prefix (the document cut at a top-level paragraph boundary and closed with `\end{document}`) costs 0.9–1.6 s at 10 % — worth it only for image-heavy papers; elsewhere the fixed cost of a pass dominates.
- Replacing the right side in the reader (`?progressive=1`, `spikes/reader-progressive.mjs`): the newer PDF is loaded into a second viewer out of sight, anchored by its marks, scrolled so the paragraph at the reading line stays put, its pages in view drawn, then shown in one step. Four stages each (English, 30 %, 60 %, all translated): 0.3 s per replacement on 00055, 0.7–1.1 s on 04322 (reading every page's text for the anchors dominates, all of it out of sight), and 0 px movement of the paragraph at the reading line in all six.
- The translation itself: Microsoft 3–4 s per paper; the LLM endpoint 391–919 s per paper at concurrency 3 with 429 cool-downs. That is where progressive display matters most.

Recommendation (inferred from the above, not yet built end to end): keep the compiled PDF as the translated side and rebuild it progressively; an HTML surface's advantage — no compile wait — is about two seconds, while its costs (a second layout of equations, figures and pagination, and a second representation to keep in step with the export) remain.
- The unit list is the canonical data: stable ids (the mark names), source text, translation, state. Translation is scheduled from the reader's position outward; untranslated units stay in English in each preview (a mixed-language document compiles like the translation does).
- One compile in flight at a time; when it ends and new units have arrived, compile again: one pass, the `.aux` of the previous pass, images as frames while previews are coming (or a prefix to a few pages past the reading position); the final compile with images and every pass.
- The first preview is the untranslated document itself, marked: it gives the original's marks and `.aux` for everything after.
- Each result swaps in out of sight, anchored by marks, keeping the paragraph at the reading line.
- Open: the first-use cost of BusyTeX on a real network (engine and TeX tree downloads; arXiv's HTML translation, which the extension already has, could stand in meanwhile); frames against figures in previews; CPU cost of repeated compiles on slow machines; cancelling and reprioritising when the reader jumps.

## Seventh addendum, 2026-09-22 (evening): float placement, tables, fonts; the owner agreed to the #292 recommendation

The owner agreed to the recommendation above, frames for images in previews included.

### Why a figure composition came apart in some translations — EXPLAINED, a fix TRIED
2608.04322's page 3 shows Fig. 2 across both columns with Fig. 3 and Fig. 4 side by side under it. That is not one figure: Fig. 2 is a `figure*[t]` (only at the top of a page, and never on the page where it is defined), Fig. 3 and Fig. 4 are two single-column `figure[t]`, each going to the top of a column. They met on one page because of where the text put their definitions. A translation changes the text's length, so the definitions fall elsewhere and LaTeX places each float anew — as designed, not a fault of the engine or of the patch (which does not touch float environments):

| | pages | Fig. 2 | Fig. 3 | Fig. 4 |
|---|---|---|---|---|
| original | 13 | p. 3, top | p. 3, left column | p. 3, right column |
| Japanese | 13 | p. 3, top | p. 3, left | p. 3, right |
| Chinese | 11 | p. 2, top | p. 3, left | p. 3, left, under Fig. 3 |
| German | 15 | p. 3, top | p. 4, left | p. 4, left, under Fig. 3 |

Japanese kept it by coincidence (same page count, the definitions in the same columns). Tried by hand on Chinese and German: Fig. 3 and Fig. 4 made one full-width float of two `\columnwidth` minipages, defined right after Fig. 2 — the three stand together again (Chinese p. 2, German p. 3), no new error. Made automatic, it would take the groups from the original compile (captions' marks give each float's page and column) and regroup only those. It restructures the author's floats, so it waits for the owner's decision.

### Tables were off in the translation runs — FIXED
Table cells are units since C1 (no cost in compile rate), but `c1-mt.mjs` and the mark compiles loaded projects without them, so every translated PDF shown so far had its tables in English. On now. Two defects surfaced at once, both fixed in the run:
- A cell that is only a name, translated alone, comes back as a word (HellaSwag → 地狱之战, Magicoder → 魔法师). A cell of at most three name-like words (capitalised, with a digit or an inner capital) that also stands as it is in the paper's prose keeps its source — the prose's translation keeps such names; a capitalised plain word the prose also uses in lower case (Dataset, Task) is translated. 2608.04322: 19 cells kept.
- Under XeLaTeX, xeCJK loads fontspec, whose default text face is Latin Modern: a paper set in Times came out in a wider face (`TU/ptm/m/n undefined` in the log), and a fixed-width column (`p{0.18\columnwidth}`) overflowed. The Chinese and Japanese runs now map Times, Palatino and Helvetica to their TeX Gyre clones (Termes, Pagella, Heros). **To verify on the corpus** before it goes into the chain: compile rate and fetch size of the xeCJK strategy.

### Figures — PLANNED, NOT STARTED
Item 3 of the list in "Where this leaves the decision", and in the owner's requirements from the first day. Inputs: the PDF text layer for the vector figures (most arXiv figures are PDF files, which arXiv's HTML shows as SVG), the extension's in-browser recogniser for bitmaps (#281), TeX source for TikZ (the front end skips `tikzpicture` today). Output: overlays in the reader, as the HTML mode draws them, rather than rewriting the figure files.

## Eighth addendum, 2026-09-22 (night): the translation as it comes in, live in the browser (#292 step 1) — BUILT, MEASURED

The owner's rule for what follows: general methods only, whatever the input; a change that works for one kind of paper is dropped (so the float regrouping of the seventh addendum is not done — LaTeX places floats, the reader's paragraph link keeps text and figures together).

### What runs
`poc-reader/?live=1` (spikes/reader-live.mjs drives it): arXiv's PDF on both sides at once; the source fetched from `/src/<id>` and unpacked in the page (`tar.mjs`); units cut (`latex-front.mjs`, `paper-meta.mjs`, now one implementation for Node and the browser — the Node scripts import them, and both gates give the same results through them); translation from Microsoft's free endpoint (`mt.mjs`); compiles on our site's TeX page in an iframe (`poc-site/tex.js`: the package sent once, each compile only its changed files); the order of work in `live.mjs`:
1. the preamble alone in the paper's own engine: its font families (1 s);
2. translation nearest the reader first — by distance from the reading line on the page, not in source order, since a float's units sit where it was written — the first batch small;
3. whenever the compiler is free and units have come in: the whole document, one pass, images as frames, the previous pass's `.aux` and `.bbl`, untranslated units in English; shown out of sight and swapped in at the same paragraph;
4. the original with marks when the compiler would otherwise wait (or after the final): exact places on arXiv's PDF;
5. every unit in: the final compile, every pass, images.

### Measured (headless Chromium, local package server, Microsoft over the network)
| paper | pages, units | first translation shown | all units shown (frames) | final shown | per preview | swap, movement |
|---|---|---|---|---|---|---|
| 2608.04322 | 13, 167 | 3.7–4.6 s | 6.7–7.7 s | 12.7–14.0 s | 1.4–1.9 s | 0.2–0.5 s, 0–2 px |
| 2608.00055 | 27, 92 | 2.3–3.5 s | 7.9 s | 11.1 s | 0.9–1.3 s | 0.2 s, 0 px |
| 2608.02055 (10 MB of images) | 56, 407 | 5.5 s | 20.3 s | 35.2 s | 1.9–2.0 s | 0.3–0.8 s, 0 px |

Ranges are over a first and a returning visit in one profile. Final state on 2608.04322: 119 of 167 units linked on both sides (the same as the precompiled demo), 29 of 29 sampled paragraphs level within 2 px once scrolling stops. Started with the reader halfway through the paper, the first preview translated the page in view (its paragraphs and the table's caption) and nothing else.

### Found on the way
- XeLaTeX finds a font by name through fontconfig, which the browser's TeX has not: every font must be named by file (the CJK fonts already were). The TeX Gyre mapping now is (`latinFontsFor`), and covers the Times, Palatino, Helvetica and Courier families of newtx, txfonts, mathpazo and newpx too. The probe over the 113 papers: Computer Modern 44, Times 40 (+8 newtx, +2 txfonts), Latin Modern 10, Libertine 5, Palatino 2, Charter 1.
- The first preview has `[?]` for citations and references (no `.aux` yet); the second has them.
- A title set through an author's own macro (`\heading{…}{…}{…}` in 2608.02055) is not translated: unknown commands keep their arguments by design. A general rule — an argument that reads as prose (several words, no assignment, no command) is a unit — would widen coverage; it needs the C1 gate first.
- Not measured: the first-use download on a real network (engine 31 MB, basic tier 88 MB); here a local server.

## Ninth addendum, 2026-09-22 (night): figure text (#290 step 2) and the Latin faces under XeLaTeX (step 4)

### Figure text — BUILT
The corpus's figures: 471 bitmaps in 51 papers, 464 included PDFs of which 407 carry text (62 papers), 86 TikZ pictures in 18 papers.
- **Included figures (vector and bitmap), in the reader** (`poc-reader/figures.mjs`, `ocr.mjs`): where each figure sits comes from the page's content stream — an included figure is a form XObject (vector) or an image XObject (bitmap), whatever class or package placed it (PDF.js's operator list, the current transformation followed through saves, restores and forms). A vector figure's labels are the page's text items inside its rectangle, runs on one baseline joined, at their angle (30° tick names and 90° axis titles came out right). A bitmap's are read from its own pixels (PDF.js's decoded image, copied) by the extension's recogniser — PP-OCRv6 tiny on ONNX Runtime's wasm, in a worker, lines cut from the original, tall lines read both ways (src/core/ocr ported to plain JS). Translations are laid over the translation's pages at the labels' places and angles, in the HTML mode's label material; a "Figure text" switch in the header. In the live mode they follow each replaced PDF (115 labels drawn in view at the end on 2608.04322).
- **Context**: a figure's labels go to the engine together, in reading order, one text with a marker between labels, and come back to their own places. Alone, a box's "Score" came back as 配乐 (a musical score); with the figure around it, 评分.
- **Names** (`mt.mjs`, `isName`, one rule for table cells and figure labels): at most three words, each with a digit or an inner capital, in capitals, or capitalised and used by the prose as a proper noun (in mid-sentence, or as the start of a longer name: Beaver for BeaverTails) and never in lower case. A doubtful word stays a name only on both kinds of evidence, because translating a name misleads (Aegis → 宙斯盾) where leaving a word does not. Title-case words the prose also writes in lower case (Average, Score, Safety Dataset) are translated.
- **TikZ, in the source** (`latex-front.mjs`, `tikzText`): a picture's texts are TeX, and the translation is ours to compile, so they are units: each node's brace group (`\node … {…}`, `node[…] (name) at (…) {…}`, in TikZ's own syntax), pgfplots legend entries and braced axis labels. TeX sets them in the translation's fonts and nodes grow to fit (2608.13416's method figure: KV 缓存, TTT 分支, 层输入 x). Not marked (a destination's place does not follow the picture's transformation).
- **Found on the way, all general**: box commands whose last argument is typeset content (`\resizebox`, `\scalebox`, `\adjustbox`, `\rotatebox`, `\raisebox`, `\fbox`, `\mbox`, `\makebox`, `\framebox`, `\parbox`, `\colorbox`, `\fcolorbox`, `\textcolor`) were opaque with everything inside — a scaled table, a coloured phrase, an `\input` of a table file, a TikZ picture fitted to the column; their content is walked now. Sub-figure captions (`\subcaption`, `\subcaptionbox`, `\subfloat[…]`). A comparison after a command (`\ifdim\lastskip>0pt`) belongs to the command, as an assignment does.
- **Gates**: identity (marks add nothing else) 113/113; every paper whose units changed (19 + 2) compiled natively in Chinese and German against C1's results: the same outcome for all of them after the `\ifdim` rule (before it, one regression, 2608.15016).
- Open: short TikZ node texts translated without context ("TTT state" → TTT 州); TikZ labels drawn outside a picture's braces (`label=`, `pin=`); the measure of figure-text coverage and accuracy over the corpus.

### The Latin faces under XeLaTeX — MEASURED on the corpus
The font probe (the original's own compile says which families its roles use) and the TeX Gyre mapping by file name (`latinFontsFor`) over the 113 papers, native, against the same strategies without it:

| | without the mapping | with it |
|---|---|---|
| Chinese (xeCJK, tables on) | 98 whole | 99 whole |
| Japanese (xeCJK, tables on) | 91 whole | 92 whole |
| untranslated under xeCJK (control) | 98 whole | 99 whole |
| arXiv's words at the same place, untranslated under xeCJK, the 52 papers with a Times, Palatino or Helvetica family (median) | 1 % | 37 % |

Better in every row and worse in none: the one paper it changed (2608.03063, Times) failed under XeLaTeX before (`Cannot use XeTeXglyph with ptmr8c`) and compiles now in all three. The layout cannot come to 100 % under XeLaTeX (pdfTeX's font expansion, which microtype uses, has no XeTeX counterpart, and a translation reflows everything anyway); what the mapping restores is the typeface and its widths.

## Tenth addendum, 2026-09-22 (night): any arXiv paper from a link, and figure text through the extension's own modules

### Any paper — BUILT, tried on papers outside the corpus
The reader takes an arXiv link or id (abs, pdf, html or src link, with or without its version, new and old ids) and a target language, and runs the live mode on it: the source and the PDF from arXiv itself, the translation from Microsoft's endpoint, the compiles on our TeX page (`node spikes/serve-live.mjs` starts it on this machine; the TeX Live file server is the local container). A compile that gives no PDF moves on to the next strategy of C1's chain (XeLaTeX + xeCJK, then pdfLaTeX + CJKutf8), and what fails — no source, a fetch, no TeX page, a compile — says so in the status line.
- 1706.03762 (the Transformer, 2017): first translation shown 3.3–4.7 s, final 10–13 s, 29 of 29 paragraphs level after scrolling, 20 labels drawn on Figure 1 (a bitmap).
- 2607.24653 (683 units): xeCJK stops on the paper's own CJKutf8 (`Package CJKutf8 can not be loaded with xeCJK`); the chain went on to CJKutf8 by itself, first translation at 19.6–21.5 s, final at 80 s — a pass is 13–14 s there.

### Figure text through the extension's own modules — DONE (the owner's review)
The owner compared the reader's figure text with the HTML mode's and found it worse; the reason was that the reader had its own merge and overlay. It now has none: `spikes/build-shared.mjs` compiles, from the extension's source with the extension's esbuild, `src/core/image/boxes.ts` (lines → boxes, the §15.1 filters and merging), `src/core/renderer/image.ts` with `src/styles/image.css` (the overlay, its material, one masked blur a figure, turned labels) and `src/core/ocr` (the recogniser, in the reader's worker) into `poc-reader/lib/axt/`. What the PDF supplies is only its input: where each figure sits (figures.mjs, the page's XObjects) and its lines — a vector figure's from the text layer, as normalised lines in the recogniser's own shape (`vectorLines`), a bitmap's from the recogniser. Each figure's overlay hangs on an empty `<img>` laid over it, the anchor the style sheet positions an overlay by.

Two findings to take back into the shared module, so that the HTML mode gets them too (screenshot of 2608.04322 Fig. 2 in HTML mode, from the owner):
1. **Names**: the HTML mode translated the tick names HellaSwag → 地狱之战, Magicoder → 魔法师, MedQA → 医学质量保证, and "Llama3-8B-Instruct" → "Llama3-8B-指示"; merged into one box, a legend's DirectHarm4 came back as 直接伤害 4. A line that is only a name (`isName`, the rule the table cells use) should join no box and keep its text.
2. **Context for engines without a context parameter**: the HTML mode sends a figure's boxes in one batch, but to Microsoft each is a separate text ("Score" → 配乐); a figure's boxes as one text with a marker between them, split back, gives each the figure's context.

## Eleventh addendum, 2026-09-22 (night): typesetting by writing system, and the multi-language gate (#32)

The owner's direction: one design that lifts every target language together, never one at another's expense; the first batch is what our technique sets most directly and with the most certain quality. It is CJK (Simplified and Traditional Chinese, Japanese, Korean), the Latin-script languages whose letters T1 holds (German, Spanish, French, Portuguese, and so on), and Cyrillic. Later: Vietnamese (below), the right-to-left scripts and the Indic ones. Those two typeset — LuaLaTeX with babel's `bidi=basic` set Arabic, XeLaTeX with FreeSerif set Hindi, no error either — but the text their PDFs give back is in visual order (Arabic as presentation forms, reversed; Devanagari's pre-base vowel sign before its consonant), and the reader anchors on that text; TeX Live's only Devanagari text face is FreeSerif.

### The gate — BUILT (`spikes/lang-gate.mjs`)

24 of the 113 papers that compile in the browser, by document class (article 8, IEEEtran 3, revtex4-2 3, acmart 2, amsart 2, one each of llncs, elsarticle, achemso, ieeeconf, sn-jnl, aastex631), each in every first-batch language: the live pipeline's final compile — `strategiesFor`, moving on as the reader does, `translationFiles`, latexmk to the end — with the pseudo-translation in place of an engine's, and the paper's own marked compile beside it. A result counts as compiled when it has a PDF and every letter set. Per result: the target script's letters found in the PDF's text against those put in (the reader anchors on that text), "Missing character" lines, TeX errors, overfull boxes and pages against the original's. `--check` compares with a stored baseline and exits 1 on a loss. About twelve minutes for nine languages, five compiles at a time.

The pseudo-translation is measured, not guessed (`spikes/lang-ratio.mjs`): 48 prose units of four papers of four classes through Microsoft's free endpoint, the translation's grapheme clusters per English letter — zh 0.344, zh-Hant 0.348, ja 0.494, ko 0.578, de 1.403, es 1.378, fr 1.422, pt 1.297, ru 1.273, vi 1.205 (each language's quartiles within 10 % of its ratio). A language's sample text is one English sentence as the same engine translates it, filled in by grapheme cluster. The first ratios, guessed, were a third too long for Chinese and a sixth too short for German.

The baseline, the pipeline before this work with the same pseudo-translation, compiled Chinese, Japanese and German on 24 of 24 papers and Traditional Chinese, Korean, Russian and Vietnamese on none. One of its Japanese "successes" had lost 18 000 characters (item 3 below): a PDF is not a translation, hence the gate's letter count.

### Typesetting by writing system — BUILT (`poc-reader/scripts.mjs`)

What a translation needs besides its text follows from the script its language is written in (`Intl.Locale(lang).maximize().script`). The language names only the locale babel loads by its tag (`\babelprovide[import=<tag>,main]`), which brings the captions (图, 圖, 図, 그림, Abbildung, Figura, Рис.), the hyphenation patterns and the direction for every language babel has an ini file for.

- **CJK**: XeLaTeX with xeCJK. The script gets a family of its own (Fandol, AR PL Mingti and Kaiti, IPAex, UnBatang), the paper's Latin faces in their OpenType form set the rest, and Hangul's word spaces are kept; CJKutf8 under the paper's own pdfLaTeX when XeLaTeX cannot take the paper. Line spacing ×1.3 (ctex's Chinese scheme), multiplying the paper's own; since the owner's review (below), for Chinese only. Measured on the PDFs (`spikes/typo-metrics.mjs`): 1.10× → 1.43× of the CJK size on an AAAI paper, 1.20× → 1.56× on an IEEEtran one. Service H sets ctex's factor as a fixed value at load time: its Chinese PDFs measured 1.43× where the class's own spacing is 1.10×, and 1.14× on an ICASSP paper whose `\ninept` resets the spacing in the body (2026-09-22; its PDFs are kept outside this repository). That is the density the owner saw in ours.
- **Alphabets** stay with the paper's own pdfLaTeX, their letters' font encoding made the document's default: none for Latin, T2A for Cyrillic. The paper's families fall back to the encoding's own where they have none (Times has no T2A: Russian came out in Computer Modern's Cyrillic, and since the owner's review in a face of Times' design, below), as a Russian author's pdfLaTeX paper does; babel's Russian patterns hyphenate it. T2A also sets the Latin letters of the paper's own names: a reference's Mądry, its ogonek in place.
- **A letter an engine cannot set** makes the chain move on (`unsettable`: pdfLaTeX's "Unicode character … not set up"), to XeLaTeX with faces that have it.
- A paper the author set with XeLaTeX or LuaLaTeX keeps its engine (not measured: the corpus has none).

**Vietnamese is not in the first batch.** Its encoding, T5, holds its letters, but made the default it lacks T1's ogonek: the same reference's Mądry lost it, with an error. Loading T1 beside T5 does not help, since LaTeX switches encodings for letters and not for accent commands. Under XeLaTeX it meets the problems of item 4. It waits for a Unicode engine that can take a pdfLaTeX paper's fonts, which the right-to-left and Indic scripts need too.

### What the gate found — each fixed where it arises, for every paper

1. **An empty `\baselinestretch`**, the standard classes' own in the preamble, is 1 to LaTeX and an unfinished expression to `\fpeval`: the spacing factor reads it as 1.
2. **babel loaded after the cite package** takes cite's `\@citex` for the kernel's and breaks every citation ("Paragraph ended before \org@@citex was complete", on an IEEEtran paper). We load babel only when the paper does not, and then with `safe=none`: a language imported from its ini file makes no character active, which is all that rewriting guards against.
3. **newtxtext sets fontspec's global defaults** under XeTeX (`Extension=.otf`, `Scale`, stylistic sets), and every font declared after it inherits them. A `.ttf` face was looked for as `.otf`: Japanese, Traditional Chinese and Korean lost 12 000–18 000 characters on an AAAI paper, Japanese already in the baseline. Now `\defaultfontfeatures{}` comes before our faces; fontspec's own per-family defaults (TeX ligatures) stay, and the dashes in page ranges are still dashes.
4. **XeLaTeX for an alphabet fights the paper's font setup.** newtxtext sets its faces at the end of the preamble, after ours (Russian, 40 000 characters missing); acmart's T1 put Vietnamese into an 8-bit face (10 000); only the serif role had Cyrillic, so sans and mono headings lost theirs; and one paper lost its math fonts in every language. The alphabets' pdfLaTeX set all of these without an error or a missing letter.
5. **babel 26.12 with siunitx and Chinese**: siunitx's `translations` asks babel for the locale at `\begin{document}`, and babel builds a file name with an empty region (`babel-zh-Hans-.ini`) — one error in each of four papers, zh and zh-Hant. Harmless: the PDFs with and without babel differ, character by character, only in the captions. It is for babel upstream; nothing here works around it.

Open, and older than this work, all three on XeLaTeX, which a pdfLaTeX paper reaches only for CJK. A paper that loads CJKutf8 itself conflicts with xeCJK: nine errors in every CJK language, the baseline's too, plus one from microtype meeting a TS1 fallback face at `\maketitle`; its own pdfLaTeX would suit it better. One paper's math fonts fail under XeLaTeX (24 errors in every CJK language), as in the baseline. Hangul breaks between syllables, as xeCJK and browsers do; breaking between words (kotex) would be closer to Korean book typesetting.

### Results

The final run, the first batch, as archived on 2026-09-23. Since the owner's review (below), Japanese and Korean are at the paper's own spacing, and Russian is set in faces of the paper's design:

| | zh | zh-Hant | ja | ko | de | es | fr | pt | ru |
|---|---|---|---|---|---|---|---|---|---|
| compiled, every letter set (of 24) | 24 | 24 | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| before this work | 24 | 0 | 24 | 0 | 24 | – | – | – | 0 |
| letters found / put in, median | 1.002 | 1.001 | 1.001 | 1.002 | 1.012 | 1.018 | 1.009 | 1.014 | 1.002 |
| papers with a missing character | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| papers with a TeX error | 6 | 6 | 2 | 2 | 0 | 0 | 1 | 0 | 0 |
| pages against the original's, median | 1.00 | 1.04 | 1.00 | 1.00 | 1.10 | 1.07 | 1.07 | 1.05 | 1.10 |
| moved on to XeLaTeX | – | – | – | – | 0 | 0 | 2 | 0 | 0 |

(A found/put-in ratio above 1 is the original's own non-ASCII letters, names and references, counted with the translation's.) The errors are the ones named above: in zh and zh-Hant, the four papers of item 5, the paper that loads CJKutf8 and the paper whose math fonts fail under XeLaTeX; in ja and ko, those last two; in fr, that same paper. The gate's six "losses" against the baseline are item 5's four and the paper that loads CJKutf8 (nine errors to ten). Vietnamese, still with T5 in this run, also compiled 24 of 24: the ogonek's error on one paper, the math-font paper on another, three moved on to XeLaTeX.

One more, open: amsart's `\uppercasenonmath` (titles, running heads) uses TeX's primitive `\uppercase`, which under pdfLaTeX changes the bytes of a UTF-8 character outside Latin-1 — a French apostrophe (’) became an invalid byte. The chain moved on to XeLaTeX, which upper-cases Unicode itself: clean on one paper, the math-font paper's 24 errors on the other. amsart switches to a Unicode-safe upper-casing when textcase's `\MakeTextUppercase` exists; defining it as the kernel's `\MakeUppercase` before the class recursed without end, so that was not pursued.

### In the browser — MEASURED, and the gate made faithful to it

A native gate passed what the browser failed. In Chromium with BusyTeX and Microsoft (`spikes/reader-live.mjs`, `TARGET=ru`, 2608.02163), Russian's final compile stopped at `Font T2A/ptm/m/n/14.4=larm1440 … Metric (TFM) file not found`. Its previews came back as empty PDFs, which the TeX page reported as successes, and the chain moved on to XeLaTeX. TeX Live ships the LH fonts' metrics for 37 of the 350 sizes and families the T2A definitions name; natively, mktextfm made the rest on the way with METAFONT, which BusyTeX cannot run (issue E).

- **The gate now compiles as BusyTeX can** (`spikes/faithful.mjs`: `MKTEXTFM`, `MKTEXPK`, `MKTEXMF` off; `spikes/live-node.mjs` too). Run that way, CJK and the Latin-script languages came out exactly as natively, so neither has a hidden METAFONT dependency. Russian had missing characters on 15 papers of 24, and 8 moved on to XeLaTeX.
- **The METAFONT outputs the file server adds to TeX Live** (`spikes/make-metafont.mjs`): the 307 LH metrics TeX Live lacks, made natively once (11 minutes, 1.2 MB; 6 sizes have no METAFONT source). They go into the served tree, which the server indexes at start, and onto the gate's font path. The outlines stay cm-super's, and the bitmaps METAFONT also draws are dropped, so that no bitmap can stand in for an outline. With them, Russian compiled 24 of 24 as BusyTeX runs it, with no missing character, no error and none moving on. Its one "loss", overfull boxes 8 → 11 on one paper, is the native count with every letter set. Every other number of the table above came out the same run this way, so the table holds for the browser.
- **The chain's rules**: a compile succeeds only with a PDF that has something in it, and a font that cannot be loaded (`! Font … not loadable`) makes the chain move on, like a letter with no definition. The reader's notes say `ok` for what it will show (Devin on #294).
- **End to end** on 2608.02163, first visit: Russian on the paper's own pdfLaTeX, previews in 0.7–0.9 s each, the final at 19 s; Korean on XeLaTeX with xeCJK, previews in about 1.6 s, the final at 18.7 s. Paragraph by paragraph, with the reader level at its reading line: Russian 25 of 25 sampled units within 4 px (at most 3 px), 162 of 350 units linked; Korean 26 of 26 within 4 px (at most 2 px), 136 of 350 linked. The spike's check had read a constant the reader no longer has (`READING_LINE`, now the `readingLine` that follows clicks), and so measured nothing before.

The review of #294 also made the gate judge references that stop resolving and overfull boxes beyond max(2, 10 %) of the baseline's (pages are reported, not judged), and key its cache of originals by what their compiles are made of. LuaLaTeX papers are left as they are, since none of the corpus's 123 is one. Its second round:
- A translation with a letter missing is never shown, not even from the chain's last strategy; the reader keeps what it has.
- Classic LaTeX, which an EPS-only paper gets, is an 8-bit engine like pdfLaTeX: fontspec, which refuses both, was loaded under it for Cyrillic.
- babel is not loaded into a polyglossia document, where it stopped the compile (`! Font \__xpg_add_font_feature_language:ee= not loadable`, emergency stop); the paper's captions stay its own there.

The corpus has neither kind of paper, so both were checked on minimal documents: a Times article under classic LaTeX in Russian (Tempora, PT Sans, PT Mono) and Chinese (CJKutf8), and a polyglossia article in Russian, German and Chinese.

Its third and fourth rounds (Devin, Codex): a character the compile could not set. TeX logs a glyph its font lacks (`Missing character: There is no …`) and goes on, and the PDF has a gap where the letter was. LaTeX reports a letter no encoding holds (`Unicode character … not set up`), and pdfTeX goes on without it. Either now makes a compile unsettable, counted by code point where the log gives one, and only for a character the paper's own compile set: what the original cannot set, its PDF lacks as well. Otherwise every strategy would fail on such a paper and no translation would ever be shown. The characters the original loses come from its full compile. The font probe, which the third round read them from, has no body (`probeFiles` replaces it), so that scope was empty until the fourth round. The reader asks for the original's compile ahead of its turn only when a translation loses a character at all, so a clean translation waits for nothing more. Checked:
- On the log lines of each kind (XeTeX, LaTeX, pdfTeX) and on a real XeLaTeX log, where Fandol lacks two Extension B characters.
- With a scripted compile, which compiles run and what is shown, in three cases:
  - a clean translation: probe, preview, final, then the original, as before;
  - a loss the original has too: the original moves ahead of the final, and the final is shown;
  - a loss of its own: the chain moves on, and at its end nothing is shown.

None of the gate's 216 compiles and none of the compiles of real Microsoft Chinese translations of 2608.02163 and 2608.02785 logged a missing character, so nothing shown before is held back now. The scripts' header had promised an HTML fallback for a language with no typesetting; there is none. The reader now says it cannot translate the paper, naming the language, where the rejection had gone nowhere.

### The owner's review of real translations — FIXED, and the rest deferred (#295)

The owner reviewed Microsoft's translations of 2608.02163 (25 pages) and 2608.02785 as the reader compiles them (2026-09-23):

- **Russian tables were wider than the original's, and code was no longer monospaced.** With T2A the default, every role whose face lacks T2A fell back to LaTeX's one default, Computer Modern's roman. A Times paper came out in CM roman throughout, and CM is wider than Times. Now each role keeps its face where the face has T2A, which TeX checks at compile time (`\IfFileExists{t2a<family>.fd}`). Otherwise it takes a face of the same design (Times → Tempora, Helvetica → PT Sans, Courier → PT Mono, Latin Modern → Computer Modern), or at least of the same role. Table 1 of 2608.02163 has the original's width again.

  Only the shapes the face declares are mapped. The kernel's `\DeclareFontFamilySubstitution` maps every shape, and on the gate it stopped at the first shape a face lacked. Russian lost letters on nine papers of 24: eight to small capitals, which Tempora has none of, and one to a bold series that Computer Modern's sans has only as `bx`. A missing shape now falls back as it does within any family, to the upright with a warning, and the gate is back to 24 of 24 with no missing letter and no error.

  One loss stands: 2608.06007 has 9 overfull boxes, where the previous Russian had 6 and the English original 5. The lines that overflow hold inline code. The paper sets its code in Bera Mono at full size, and PT Mono's letters are as wide (0.600 em against 0.602). The Computer Modern typewriter face before was narrower (0.525 em).
- **The CJK versions were long**: Chinese 29 pages, Korean 31, Japanese 32. The ×1.3 was measured for Chinese alone, and Japanese and Korean translations are longer than Chinese ones: 0.494 and 0.578 grapheme clusters per English letter against 0.344. Each script now has its own factor (`CJK.leading`, `--tune` on the gate). At the paper's own spacing, 2608.02163 came out at 26 pages in Japanese and 25 in Korean.

  | Pages against the original's, median (papers within 10 %, of 24) | zh | zh-Hant | ja | ko |
  |---|---|---|---|---|
  | spacing ×1.3 | **1.00** (19) | **1.04** (19) | 1.20 (1) | 1.17 (1) |
  | ×1.2 | 0.95 (19) | 1.00 (20) | | |
  | ×1.15 | 0.93 (20) | 0.95 (21) | | |
  | the paper's own | | | **1.00** (22) | **1.00** (22) |
  | ×1.15, CJK face at 0.925 | | | 1.07 (17) | 1.03 (20) |
  | ×1.2, CJK face at 0.925 | | | 1.09 (14) | 1.07 (16) |

  Bold is what is kept. 2608.02163's Chinese is long at every spacing (29, 28 and 26 pages), so its excess is in its translation.
- **Korean reads large.** CJK faces fill about 0.91–0.96 of their em, while Times' capitals reach 0.66. A smaller CJK face with more spacing came out longer (table) and was not taken.

**Deferred** (the maintainer, 2026-09-23): the single-language reader comes first. What is left for more than one language is #295, with the candidates TeX Live has and these numbers. Above all it records the maintainer's direction: before changing a language's size or spacing, look for the face that suits the language and a paper and corresponds to the paper's Latin face.

## Twelfth addendum, 2026-09-23: the reader as a page of the extension, with LLM translation

The maintainer's decision: the single-language reader comes first. Of the engines, the minimal prototype has Microsoft, which was there, and an LLM, which was to be added; no others yet. The maintainer chose to make the reader a page of the extension itself on this branch, translating through its background as the HTML page does, over a second LLM client inside the prototype.

### BUILT

- **The build.** It copies `poc-reader/` in as `pdf-reader/`, once setup has filled its `lib/` (`wxt.config.ts`). The output check counts only the extension's own files. On this branch `arxiv.org` is a host permission: the reader fetches a paper's source and PDF.
- **`engine.mjs`: the extension's chain, reached through the message transport the HTML session uses** (`src/shared/transport.ts`, built through `shared/`).
  - The chain's status gives the service, the target language and the wire format (`renderPath`): tags for an LLM, markers for Microsoft.
  - One scope per paper, withdrawn when the page goes.
  - The paper's title and abstract go with every batch, the abstract cut where the HTML page cuts it.
  - A batch the engine cannot take is split in halves, as the HTML session splits one.
  - A permanent error (no key, a key refused) stops the reader, which shows the reason.
- **`mt.mjs`.** It has the tags format beside markers; that is the spike `c1-mt`'s, now shared rather than copied. `translateUnits` works by format, and figure text goes in the chain's format too.
- **The background** (`src/shared/messages.ts`, with a test). An extension page opened in a tab is no longer taken for a content script's tab. A scope bound to such a tab would be withdrawn at the tab's first status change: the check behind that asks the tab's content script, which the page does not have.
- **The language is the settings'.** The extension names Traditional Chinese `zh-TW`, and babel has no ini file for that tag: the captions stayed English, with three errors. The locale imported is now the first one babel has a file for, which TeX checks at compile time: the tag, then its language and script, then its language alone. So `zh-TW` becomes `zh-Hant`, and every tag babel has a file for stays as it was. Checked on a sample in seven languages, each with its own caption names, and on three papers of the gate in all nine languages: nothing lost.
- **The page opens on its form.** Opened without a paper, it used to go to the precompiled demo, whose papers are made locally and were missing. So the owner's first try showed an error.
- **What went.**
  - The reader's language menu: the language is the settings'.
  - The prototype's own manifest and worker.
  - The five spikes that drive the reader now load the extension's build (`spikes/extension.mjs`).

### MEASURED (Chromium, the build, 2608.02163)

- **Microsoft, the default service (markers).**
  - First visit: 330 of 350 units translated (20 kept as names), 4 previews, and the final at 15.8 s.
  - 26 of 26 sampled units stood within 4 px of each other.
  - The returning visit's translations came from the extension's cache.
- **An LLM service**, added on the settings page. It is backed by an OpenAI-compatible endpoint on this machine that gives every segment back marked (`LLM_MOCK=1 node spikes/reader-live.mjs`).
  - It worked in tags, and every unit came back whole: 6 previews, then the final, with every citation resolved.
  - The endpoint answers at once, yet the extension's queue spread its 109 requests for 321 segments over 52 s: the LLM batching and rate the settings give.
  - What a real model's translation reads like is for the maintainer to try with a real service.
- **Found on the way: a mock's own mistake.**
  - Its mark had gone before a unit's first placeholder. That put text before a table's `\toprule`, which broke the table and the bibliography after it: `\bibdata` never reached the aux, and every citation was undefined.
  - The mark now goes before the first letter, as a translation's words do.
  - `live-node.mjs` has the same echo (`ECHO=1`), and the final's note now lists undefined citations.
