# Experiment: bilingual PDF reading

Issues #290 and #292. Read an arXiv paper as two PDFs side by side — arXiv's own PDF and a translation compiled from the
paper's LaTeX source — kept in step paragraph by paragraph. Everything runs in the reader's browser: the source is
fetched from arXiv, translated through the extension's own chain (the service and the language set on its settings
page: Microsoft by default, or an LLM), and compiled by BusyTeX (TeX Live in WebAssembly).

**Status: experimental.** This lives on the long-lived branch `exp/pdf-bilingual` and is never merged into `main`.
Rules and techniques here are expected to change; what settles is to be refactored into the extension later.
`REPORT.md` is the running record of what was measured and decided.

## Layout

| Path | What it is |
|---|---|
| `../../src/pdf-reader/engine/` | The reader's engine, in the extension's source since 2026-09-25 (the extension's page `pdf-reader.html`, `src/entrypoints/pdf-reader/`, hosts it). `live.mjs` is the translation pipeline (viewport-first translation, progressive previews, final compile); `latex-front.mjs` reads and patches the LaTeX source (units, marks, engine shims); `scripts.mjs` is how each writing system is typeset (engine, encoding or faces, line spacing, babel's locale); `anchors.mjs` locates every unit on both PDFs; `engine.mjs` reaches the extension's translation chain; `mt.mjs` puts units into its wire formats and back (and holds the Microsoft client the Node spikes use); `figures.mjs` finds figure text in a PDF; `session.mjs` is the viewers, the sync and the click alignment. |
| `poc-reader/papers/` | The demo papers, made locally by `spikes/reader-papers.mjs` and never committed; the probes stage them into a copy of the build. |
| `poc-site/` | "Our site": the TeX page the reader frames, running BusyTeX. `tex-page.mjs` is its protocol (version 2, and version 1 still answered), `tex-tree.mjs` the TeX Live tree's file index, `tex-worker.js` its additions to BusyTeX's worker; `tex.js` wires them. |
| `tex-page/` | The TeX page made fast to load (stage 3): `build.mjs` builds the site (out/tex-site) — the page, BusyTeX with our patches and its preloaded tier split by engine, the tree's index, the manifest of files fetched ahead — from `measured.json`, which `measure.mjs --mode=record` and `derive.mjs` measure on the corpus; `serve.mjs` serves it as a CDN would (or through a slow link); `measure.mjs --mode=identity`, `speed.mjs`, `fd-check.mjs`, `network-check.mjs`, `reader-check.mjs` and `xext-check.mjs` (another extension cannot plant files in the page's cache: build.json's hashes) are its checks. Each file's header says how to run it. |
| `spikes/` | Measurement and verification scripts; each file's header says what it measures and how to run it. A spike that imports the engine runs with tsx from the repository root (`pnpm exec tsx experiments/pdf-bilingual/spikes/<name>.mjs`), since the engine imports the extension's source by `@/`; the case spikes (`*-cases.mjs`) exit non-zero on a failure. `lang-gate.mjs` is the multi-language gate: run it before and after any change to how a translation is typeset. |
| `busytex/research.diff` | Our patches to BusyTeX's pipeline and biber drivers. |
| `busytex/tree.diff` | Our patch to BusyTeX's remote file fetch: the TeX page's index and tree answer it. |
| `busytex/tex-log.diff` | Our patch to the logs a compile returns: biber is no TeX pass, so the pass before it keeps its log (the TeX page's build applies it after `research.diff`). |
| `busytex/xdvipdfmx.diff` | Our patch to how a XeLaTeX compile's PDF is written: xdvipdfmx at zlib level 6, not its 9 — the same decoded PDF, 0.3–2.5 % larger, and a paper of large PNGs with alpha converted far faster (2608.16117's Chinese final: xdvipdfmx 67 s → 26 s, the whole compile in Chromium 75 s → 37 s). The build applies it last. |
| `upstream/` | The same fixes as filed upstream, with self-made reproductions. |

## Setup

1. At the repository root: `pnpm install` (the extension and the reader's page, PDF.js among its dependencies).
2. Here: `npm install` (texlyre-busytex, linkedom, and the PDF.js the Node spikes read PDFs with).
3. Here: `node setup.mjs` — makes `data/busytex-patched` (BusyTeX's published assets, about 685 MB, with
   `busytex/research.diff` applied). `BUSYTEX_FROM=<dir>` reuses a directory that already holds `busytex/`.
4. A TeX Live 2026 file server on `http://localhost:8070`: TeXlyre's `texlive-server`
   (<https://github.com/TeXlyre/texlyre-busytex-build>, AGPL-3.0) over a TeX Live 2026 tree built from the release ISO,
   the snapshot BusyTeX's formats come from. It is not vendored here. Into that tree, the METAFONT outputs TeX Live
   does not ship and BusyTeX cannot make (the metrics Cyrillic needs under pdfLaTeX): `node spikes/make-metafont.mjs`,
   then copy `data/metafont/tfm` to `texmf-dist/fonts/tfm/axt-metafont/` and restart the server, which indexes at start.
5. Optional: 600 dpi PK files for METAFONT-only fonts (for example `bbm10`, `bbm7`) generated natively with `mktexpk`,
   in `data/pk-flat` — without them, papers that use such fonts do not compile in the browser (`upstream/`, issue E).
6. Here: `node tex-page/build.mjs` — the TeX page's site in `out/tex-site`, from the tree of step 4 (`TEXLIVE_TREE`,
   by default the one beside the corpus), and its upload list in `out/tex-upload/<cv>.tsv` (every object, the file to
   store and its headers; `tex-page/verify.mjs` checks a bucket against it through the CDN). Needs Python 3 and git (it
   fetches Emscripten's file packager once) and takes about half an hour the first time (the brotli copy of every file
   of the tree, kept by content in `out/tex-br`), under a minute after. For a build to publish: `REHASH=1` (the tree
   hashed again) and `FRAMERS=<origins>` (the extension and web app origins that may drive the page).

Run:
1. `node spikes/serve-live.mjs` here, for our site's TeX page and its tree (Setup's step 6; the file server of step 4
   is not needed by the page, only by the spikes that run BusyTeX themselves).
2. At the repository root, `pnpm dev` (or `pnpm build`). Every build of the extension holds the reader.
3. Load `.output/chrome-mv3-dev` (or `.output/chrome-mv3`) unpacked in Chrome.
4. Open any arXiv PDF (`arxiv.org/pdf/<id>`). The reader is laid over it, in the display last chosen; a button goes back to the browser's viewer. Its own page is `chrome-extension://<its id>/pdf-reader.html?live=1&paper=<id>`. Until the interface's part of the plan (`plans/2026-09-25-reader-interface.md`, Part 3) the page has no bar: the probes drive it through `window.__reader.controller`.

The service, the target language and the highlight's band are the extension's settings, as for the HTML page. An LLM service is added on the settings page.

## What is not here, and why

- **arXiv papers and anything made from them** — sources, PDFs, translations, compiled outputs, the demo papers the
  reader's precompiled mode reads (`poc-reader/papers/`). Most papers are under arXiv's non-exclusive licence, which does
  not allow redistribution. They are made locally (`data/`, `out/` are ignored).
- **Third-party binaries and trees** — pdf.js (Apache-2.0), ONNX Runtime, the OCR models, BusyTeX (`texlyre-busytex`,
  AGPL-3.0-or-later), TeX Live — fetched or built by the setup above.
- **Comparisons with other services** are kept out of this repository; `REPORT.md` refers to one as "service H".

## Gates

`pnpm lint` covers this directory: Biome, with an override in `biome.json` that switches off the rules against idioms the
research code uses (`while ((m = re.exec(s)))`, `??=` inside an expression, a callback's unused positional parameters),
and the English gate, whose allow-list names the lines here that hold CJK text as data. Nothing here is part of the
extension's type check, tests or build.
