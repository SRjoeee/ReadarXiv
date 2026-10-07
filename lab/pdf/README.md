# lab/pdf — the PDF engine's lab

The gates and measurements of the bilingual PDF reader's engine (`src/pdf-reader/engine/`), kept in the repository so
that a change to the engine can be held to what it was measured at. Nothing here ships: the extension imports nothing
from `lab/` (`tests/scripts/doc-paths.test.ts` checks it), and the lab is not part of the type check, the unit tests or
the build.

The reader's design is `docs/PDF-READER.md`; the engine's place in the extension is DESIGN §16. The experiment these
files came out of — its running record `REPORT.md` and its plans — is no longer in the tree; it is read from the
freeze's tag: `git show exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md`, and
`git show exp-freeze-2026-10-07:experiments/pdf-bilingual/plans/<file>` (a header here that cites `plans/<file>` means that plan). What the product no longer uses (the TeX page
program, the typesetting gates and the checks that need a TeX page) is in `parked/README.md`.

## Layout

| Path | What it is |
|---|---|
| `lab/pdf/spikes/` | The gates and their makers. Each file's header says what it measures, how to run it and what it reads. A spike that imports the engine runs with tsx from the repository root (`pnpm exec tsx lab/pdf/spikes/<name>.mjs`), since the engine imports the extension's source by `@/`; the others run with node. |
| `lab/pdf/records/` | What the gates recorded, kept for the next change to be held to: the instant layer's fidelity, completeness and cost, the layout marks' quality on the corpus, the layout maker on the researched papers. Counts, ids and measures only; no paper's content. |
| `lab/pdf/package.json` | PDF.js, which the Node spikes read PDFs with and whose standard fonts and cmaps they find in `lab/pdf/node_modules/`. |
| `lab/pdf/data/`, `lab/pdf/out/` | Made on a machine, git-ignored (`lab/pdf/.gitignore`): the corpus, the runs and the fixtures (`data/`), and what the gates write (`out/`). The gates read `lab/pdf/data` and `lab/pdf/out`. On the maintainer's machine both are assembled by per-entry links into the maintainer's data checkouts (one holds `data/corpus` and `out/corpus-meta.json`, the other the run outputs), never by a link to a whole directory, because some gates write their verdict files into `out/` and a whole-directory link would overwrite the checkout's. Nothing in them is ever committed. |
| `lab/pdf/poc-reader/papers/` | The demo papers the reader's browser checks open, made by `lab/pdf/spikes/reader-papers.mjs`; git-ignored. The directory keeps the name of the proof of concept it was made for. |

The launch helper of the browser checks, `launchWithReader`, is `tests/e2e/lib/extension.mjs`: Chromium with the build
loaded, and the demo papers staged into a temporary copy of the build. The probes in `tests/e2e/probes/` use it too.

## What is not here, and why

- **arXiv papers and anything made from them** — sources, PDFs, translations, compiled outputs, the demo papers. Most
  papers are under arXiv's non-exclusive licence, which does not allow redistribution. They are made locally and kept in
  `data/` and `out/`.
- **Third-party binaries and trees** — PDF.js, ONNX Runtime, the OCR models, TeX Live: fetched or installed.
- **Comparisons with other services** — kept out of this repository.

## Setup

1. At the repository root: `pnpm install`.
2. In `lab/pdf/`: `npm install` (PDF.js, for the standard fonts and cmaps the Node spikes load by path).
3. Docker with `texlive/texlive:latest`, for the gates that compile natively (the layout maker, the unit-marks checks,
   `live-node.mjs`); Playwright's Chromium for the browser checks (`npx playwright install chromium` once).
4. The machine's data in `lab/pdf/data/` and `lab/pdf/out/`, as each gate below needs it. A gate whose data is missing
   fails by naming what it could not read; none makes up a substitute.

The gates import the engine as it stands in `src/pdf-reader/engine/`. The later stages of the reader's rebuild change
that engine, and the gates that read a module that was ported or parked go stale with it: a gate is revived against the
commit its record names, not against `HEAD`.

## The gates

### The instant layer

The layer draws the translation over arXiv's own PDF. Its gate holds it to the original: no lost ink, no placeholder
missing or drawn twice, and the fidelity measures against the original page, no worse than the last record on any fixture.

| File | When to run it | What it needs |
|---|---|---|
| `lab/pdf/spikes/layer-gate.mjs` | After any change to `src/pdf-reader/engine/layer/`, `layout/`, `layer-rules.mjs` or the front end's units. `--tier=model` (the default) takes seconds and runs on every commit; `--tier=pixel` takes minutes and runs on every merge. `--check` holds the run to the last record (exit 1 on a regression); `--record` writes `records/layer-fidelity.*` and `records/layer-gate.*`, and only for a whole run. | `data/layer-fixtures/` (the 29 fixtures: each paper's `arxiv.pdf`, `units.json`, `record.json`, layout file and frozen reference), `data/fonts/`, the made layout files it caches in `out/layer-gate/`, Playwright's Chromium, and Docker where it makes the layout files itself. No network. |
| `lab/pdf/spikes/layer-gate/` | The gate's parts: the scorer and the measures (`score.mjs`, `measure.mjs`; `tests/pdf-reader/layer-gate-score.test.ts` tests their arithmetic), the frozen references (`ref.mjs`), the page in the browser (`page.mjs`), the prototype's floor (`proto.mjs`, `floor.json`). The bytes of `measure.mjs`, `score.mjs`, `page.mjs` and `proto.mjs` are hashed into every recorded run (`measures`), so their first lines still name the directory they were made in: a changed byte is a new instrument, and the record is made again. | — |
| `lab/pdf/spikes/layer-fixtures.mjs` | To make a fixture's outputs: a paper into a target, with the layout compile and the translation (staging's record where it holds one, else Microsoft's free endpoint). | `data/` for the papers and compiles it caches, Docker, the network only where `--offline` is not given. |
| `lab/pdf/spikes/layer-cut.mjs` | After the front end cuts the units anew, to carry the gate's fixed inputs to the new cut's ids. | The old and the made fixtures. |
| `lab/pdf/spikes/layer-perf.mjs` | To hold the layer to its cost budget: runs of `layer-gate.mjs --perf` against the old path's. `--record` writes `records/layer-perf.*`. | The runs' JSON files. |
| `lab/pdf/spikes/table-groups.mjs` | To measure the table groups' decision (`src/pdf-reader/engine/groups.mjs`) over translations already made; `--write` makes the gate's decided records. | The fixtures' records, the corpus sample, Microsoft's kept answers; Docker for the captions. |

Records: `lab/pdf/records/layer-fidelity.md`, `lab/pdf/records/layer-gate.md`, `lab/pdf/records/layer-perf.md`.

### The highlight

The hover highlight lights a sentence and its translation on both sides. The Node gate holds what is found and where it
is painted; the browser gate holds the pointer, the paint and their costs.

| File | When to run it | What it needs |
|---|---|---|
| `lab/pdf/spikes/highlight-gate.mjs` | After any change to `anchors.mjs`, `highlight.mjs`, `floats.mjs`, `figures.mjs` or how sentences are made. Exit 1 when a count moves from the baseline; `WRITE_BASELINE=1` records a change that was meant. | The ten papers' runs and the ground truth (`data/runs/highlight-ten`, `data/runs/highlight-gt`), their sources and arXiv's PDFs (`data/corpus`), and the Microsoft answers their sentences are made again from (`out/highlight/B3/ms-cache-zh-auto.json`, `ms-cache-zh-en.json`). A missing set fails the gate. |
| `lab/pdf/spikes/highlight-gate-floats.mjs` | Run by the gate above: the floats (figures, tables, algorithms) and their captions. | The same. |
| `lab/pdf/spikes/highlight-gate.baseline.json`, `lab/pdf/spikes/highlight-gate-floats.baseline.json` | The counts the two hold the engine to. | — |
| `lab/pdf/spikes/highlight-gate-browser.mjs` | After any change to the highlight's drawing or the pointer's path: `node lab/pdf/spikes/highlight-gate-browser.mjs checks` (`pnpm build` first). `floats`, `resting`, `tokens` run those checks alone; `costs` compares with `BASE_BUILD=<a build>`. | The demo papers, made by `pnpm exec tsx lab/pdf/spikes/highlight-papers.mjs lab/pdf/out/highlight/papers`, their units carrying the sentences. |
| `lab/pdf/spikes/highlight-papers.mjs`, `highlight-runs.mjs`, `highlight-runs.units.json`, `highlight-sentences.mjs`, `highlight-sentences-tags.mjs`, `sentences-path.mjs` | The makers and the helpers of the two gates: the demo papers; the runs' cutting by source span; the sentences from Microsoft's kept answers; the sentences on the tags path (Google, an LLM) in a real browser; the sentences as the reader comes by them. | See each header. `highlight-sentences-tags.mjs` needs a service chosen in a profile, and an LLM's key never leaves the extension. |
| `lab/pdf/spikes/live-node.mjs`, `faithful.mjs` | The maker of the runs the gate reads: the live pipeline end to end in Node, Microsoft's endpoint for the translation and native TeX Live in Docker for the compiles. | Docker, the network. It imports the reader's compile client, so it goes stale when that is parked. |

### The layout marks and the unit marks

The marks are the destinations the engine asks TeX to write at each unit, and the layout marks it asks for the layout
file. They must move no word of the paper.

| File | When to run it | What it needs |
|---|---|---|
| `lab/pdf/spikes/layout-marks-gate.mjs` | After any change to `src/pdf-reader/engine/layout/marks.mjs`: the marks' quality on the corpus (what v0, the marked original as the run makes it, and v1, the same with the layout marks, carry and lose). `--bisect`, `--write` and `--classes` as its header says; exit 1 on a failing paper, a class to switch off or a regression. | The corpus, `out/corpus-meta.json`, Docker. |
| `lab/pdf/spikes/layout-marks-cases.mjs` | Alongside it: small documents compiled natively, each a way a mark could move a line. Exit 1 on a failure. | Docker. |
| `lab/pdf/spikes/layout-marks-compare.mjs`, `layout-marks-compare.d.mts` | The gate's judgements, pure; `tests/pdf-reader/layout-marks-gate.test.ts` tests them. | — |
| `lab/pdf/spikes/layout-make.mjs` | To run the layout maker on the researched papers, end to end, against the bars of `lab/pdf/records/layout-maker.md`. | The papers' sources and PDFs in `data/layout/`, Docker. |
| `lab/pdf/spikes/gt-orig.mjs`, `marks-gate.mjs`, `layout-same.mjs` | Unit marks must not move a single word: the original compiled natively with marks and without (`PLAIN=1`), then compared. | The corpus, `out/corpus-meta.json`, `out/c0-browser-patched-full.json`, Docker. |
| `lab/pdf/spikes/patch-identity.mjs` | Without compiling: patching with unit marks and taking them out again gives exactly what patching without marks gives. | The corpus. |

Records: `lab/pdf/records/layout-marks.md`, `lab/pdf/records/layout-maker.md`.

### The front end

| File | When to run it | What it needs |
|---|---|---|
| `lab/pdf/spikes/front-gate.mjs` | After any change to `src/pdf-reader/engine/latex-front.mjs`: units, letters and files per paper against a stored snapshot (`out/front-gate.json`); a paper that moves by more than 5 % is listed. `--accept` stores the current state. | The corpus and `out/c0-browser-patched-full.json` (which papers compiled cleanly). |
| `lab/pdf/spikes/front-peek.mjs` | To look at what the front end takes from one paper, by eye. | The corpus. |
| `lab/pdf/spikes/latex-front.mjs`, `paper-meta.mjs` | Shims onto the engine's modules, for the Node spikes. | — |
| `lab/pdf/spikes/corpus.mjs`, `corpus-summary.mjs` | To make the corpus (a seeded random draw of a month's submissions: each source and arXiv's PDF, one request every 3.2 s) and its summary, `out/corpus-meta.json`. | The network. |

### The reader's browser checks

These open the reader on the demo papers and need no TeX page. `pnpm build` first; each exits non-zero on a failure.

| File | What it checks |
|---|---|
| `lab/pdf/spikes/reader-ui.mjs` | The reader's interface (`docs/PDF-READER.md` §4–§8, §13): the controls, the menus, the states, the keyboard; screenshots in `out/reader-ui/`. |
| `lab/pdf/spikes/reader-settings.mjs` | The reader and the extension's settings (§3, §9.1): the display opened in, written back, followed from another tab. |
| `lab/pdf/spikes/reader-perf.mjs` | The performance gates of §12: the backdrop blur, dark pages, the scroll listeners, the animations. |
| `lab/pdf/spikes/pinch-overlays.mjs` | The overlays through a pinch (§10.1–§10.2): drift, cost, the redraw. |
| `lab/pdf/spikes/reader-pixels.mjs` | The reader's pixels and tokens against a recorded baseline (`--baseline` records) (§4.1). |
| `lab/pdf/spikes/level-on-screen.mjs`, `early-scroll.mjs` | What the sync calls level against what the screen shows, and a side read before the pair is located. |
| `lab/pdf/spikes/reader-papers.mjs` | Makes the demo papers into `lab/pdf/poc-reader/papers/`. |

The reader's checks that need the local TeX page (service faults, viewer faults, the live mode and its states) are
parked with it: `parked/README.md`.
