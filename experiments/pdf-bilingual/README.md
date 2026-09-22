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
| `poc-reader/` | The reader: a page of the extension on this branch (`wxt.config.ts` copies it in as `pdf-reader/`), with two PDF.js viewers. `live.mjs` is the translation pipeline (viewport-first translation, progressive previews, final compile); `latex-front.mjs` reads and patches the LaTeX source (units, marks, engine shims); `scripts.mjs` is how each writing system is typeset (engine, encoding or faces, line spacing, babel's locale); `anchors.mjs` locates every unit on both PDFs; `engine.mjs` reaches the extension's translation chain; `mt.mjs` puts units into its wire formats and back (and holds the Microsoft client the Node spikes use); `figures.mjs` finds figure text in a PDF; `reader.js` is the viewer, the sync and the click alignment. |
| `poc-site/` | "Our site": the TeX page the reader frames, running BusyTeX. |
| `shared/` | Entry points that compile the extension's own modules (figure boxes, overlay, recogniser, the message transport to its translation chain, its settings and look, the wire grammar its background reads answers by) into `poc-reader/lib/axt` — no copies of product code. |
| `spikes/` | Measurement and verification scripts; each file's header says what it measures and how to run it. `lang-gate.mjs` is the multi-language gate: run it before and after any change to how a translation is typeset. |
| `busytex/research.diff` | Our patches to BusyTeX's pipeline and biber drivers. |
| `upstream/` | The same fixes as filed upstream, with self-made reproductions. |

## Setup

1. At the repository root: `pnpm install` (the extension's own dependencies: the shared modules and the recogniser come from there).
2. Here: `npm install` (pdf.js, texlyre-busytex, linkedom).
3. Here: `node setup.mjs` — fills `poc-reader/lib` (pdf.js, the recogniser's runtime and models, the shared modules built
   from `src/`) and makes `data/busytex-patched` (BusyTeX's published assets, about 685 MB, with `busytex/research.diff`
   applied). `BUSYTEX_FROM=<dir>` reuses a directory that already holds `busytex/`.
4. A TeX Live 2026 file server on `http://localhost:8070`: TeXlyre's `texlive-server`
   (<https://github.com/TeXlyre/texlyre-busytex-build>, AGPL-3.0) over a TeX Live 2026 tree built from the release ISO,
   the snapshot BusyTeX's formats come from. It is not vendored here. Into that tree, the METAFONT outputs TeX Live
   does not ship and BusyTeX cannot make (the metrics Cyrillic needs under pdfLaTeX): `node spikes/make-metafont.mjs`,
   then copy `data/metafont/tfm` to `texmf-dist/fonts/tfm/axt-metafont/` and restart the server, which indexes at start.
5. Optional: 600 dpi PK files for METAFONT-only fonts (for example `bbm10`, `bbm7`) generated natively with `mktexpk`,
   in `data/pk-flat` — without them, papers that use such fonts do not compile in the browser (`upstream/`, issue E).

Run:
1. `node spikes/serve-live.mjs` here, for our site's TeX page, with the file server of Setup's step 4 running.
2. At the repository root, `pnpm dev` (or `pnpm build`). The extension's build then holds the reader, once Setup's step 3 has filled `poc-reader/lib`.
3. Load `.output/chrome-mv3-dev` (or `.output/chrome-mv3`) unpacked in Chrome.
4. Open any arXiv PDF (`arxiv.org/pdf/<id>`). The reader is laid over it, on the original; choose Translation or Side by side to translate it, and the display is kept. A button in its bar goes back to the browser's viewer. Its own page, `chrome-extension://<its id>/pdf-reader/reader.html`, takes a pasted link or id.

The service, the target language and the highlight's band are the extension's settings, as for the HTML page; the reader's bar changes the language and the band there too. An LLM service is added on the settings page.

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
