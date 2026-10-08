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
| `lab/pdf/layer-lab/` | The layer lab: the maintainer's local bench for the instant layer, which draws a paper and a language on the layer gate's own inputs, any two of Original, the quick view and an already made final side by side (`npm run layer-lab` here, or `node lab/pdf/layer-lab/serve.mjs`; `lab/pdf/layer-lab/README.md` has the start line and the controls). It is a measurement tool like the gates: `lab/pdf/layer-lab/smoke.mjs` checks that every fixture draws. |
| `lab/pdf/records/` | What the gates recorded, kept for the next change to be held to: the instant layer's fidelity, completeness and cost, the layout marks' quality on the corpus, the layout maker on the researched papers. Counts, ids and measures only; no paper's content. |
| `lab/pdf/package.json` | PDF.js, which the Node spikes read PDFs with and whose standard fonts and cmaps they find in `lab/pdf/node_modules/`, and the layer lab's start script. |
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
| `lab/pdf/spikes/layer-gate.mjs` | After any change to `src/pdf-reader/engine/layer-proto/`, `layer/`, `layout/`, the layout rule set (`rules/`, which the gate reads: `--rules=<file>` measures another set, and the run records its version and digest) or the front end's units. `--tier=model` (the default) takes seconds and runs on every commit; `--tier=pixel` takes minutes and runs on every merge. `--check` holds the run to the last record (exit 1 on a regression); `--record` writes `records/layer-fidelity.*` and `records/layer-gate.*`, and only for a whole run. | `data/layer-fixtures/` (the 29 fixtures: each paper's `arxiv.pdf`, `units.json`, `record.json`, layout file and frozen reference), `data/fonts/`, the made layout files it caches in `out/layer-gate/`, Playwright's Chromium, and Docker where it makes the layout files itself. No network. |
| `lab/pdf/spikes/layer-gate/` | The gate's parts: the scorer and the measures (`score.mjs`, `measure.mjs`; `tests/pdf-reader/layer-gate-score.test.ts` tests their arithmetic), the frozen references (`ref.mjs`), the page in the browser (`page.mjs`), the prototype's floor (`proto.mjs`, `floor.json`). The bytes of `measure.mjs`, `score.mjs`, `page.mjs` and `proto.mjs` are hashed into every recorded run (`measures`), so their first lines still name the directory they were made in: a changed byte is a new instrument, and the record is made again. | — |
| `lab/pdf/spikes/layer-fixtures.mjs` | To make a fixture's outputs: a paper into a target, with the layout compile and the translation (staging's record where it holds one, else Microsoft's free endpoint). | `data/` for the papers and compiles it caches, Docker, the network only where `--offline` is not given. |
| `lab/pdf/spikes/layer-cut.mjs` | After the front end cuts the units anew, to carry the gate's fixed inputs to the new cut's ids. | The old and the made fixtures. |
| `lab/pdf/spikes/layer-perf.mjs` | To hold the layer to its cost budget: runs of `layer-gate.mjs --perf` against the old path's. `--record` writes `records/layer-perf.*`. | The runs' JSON files. |
| `lab/pdf/spikes/table-groups.mjs` | To measure the table groups' decision (`src/pdf-reader/engine/translate/groups.mjs`) over translations already made; `--write` makes the gate's decided records. | The fixtures' records, the corpus sample, Microsoft's kept answers; Docker for the captions. |

Records: `lab/pdf/records/layer-fidelity.md`, `lab/pdf/records/layer-gate.md`, `lab/pdf/records/layer-perf.md`.

The gate measures the drawn layer, v0 (`--engine-kind=proto`, its default; the records' mode is `--proto-tex=lines --removal=draw`; `--door` is the reader's door). The first layer (`layer/layer.mjs`, with the fit and the line breaker under `layer/`) is parked (`parked/README.md`): `--engine-kind=layer` is refused with a message that says so, for an older worktree given by `--engine=<it>` that still has the entry it measures it as it was, and the layer lab's first view reports that the entry is not there. The checker `layer/check.mjs` stays, since the gate's instrument imports it by its address.

### The rules gate in CI

A change to the layout rule set (`src/pdf-reader/engine/rules/layout-rules.json`), or to the drawing code that reads it, is
measured on the fixtures when its pull request opens, and the set is published when it merges. The papers the fixtures are
made from are under arXiv's licence, so the CI job reads them from a private bucket and shows no page and no text of any:
its comment is numbers, fixture names and links that open the layer lab on the maintainer's machine.

| File | What it is |
|---|---|
| `.github/workflows/rules-gate.yml` | On a pull request (not from a fork) that touches the drawing closure, the gate or the pack: the pack restored, then the layer gate's model tier twice on one runner, the merge base's engine with its own built-in set and the pull request's with its own, then the verdict as one comment (`<!-- rules-gate -->`, edited in place) and its numbers as an artifact. Environment `rules-gate`, 15 minutes. This is a measurement, not an end-to-end suite: Chromium runs on these paths alone. |
| `.github/workflows/rules-publish.yml` | On a push to `next` that changes `layout-rules.json`: publish to staging (environment `rules-staging`, automatic) and move its pointer; then the set measured on each live engine (below); then production (environment `rules-production`, whose required reviewer is the maintainer: one click), which stays off until the repository variable `RULES_PRODUCTION` is `on`. |
| `.github/workflows/rules-point.yml` | By hand: move a pointer to a version already published, on staging or on production (the same reviewer): the rollback. A production one first cancels the publishes that wait for the click (below). |
| `lab/pdf/spikes/rules-gate.mjs` | `run` (the gate's model tier in the production configuration, from the pack alone), `compare` (the verdict and the comment) and `engines` (the live-engines check). `tests/scripts/rules-gate.test.ts` holds its arithmetic on synthetic runs of numbers. |
| `lab/pdf/spikes/rules-publish.mjs` | The two writes of the web Worker's rules routes: publish the file (unless `--next=<ref>` holds a newer version), move the pointer. The secret goes into one request header and is never printed. |
| `lab/pdf/spikes/gate-pack.mjs`, `lab/pdf/gate-pack.json` | The fixture pack: made, restored by digest, verified. The JSON is its committed manifest. |
| `lab/pdf/live-engines.json` | The engines readers run now. |
| `lab/pdf/rulings/README.md` | How a regression that is meant is accepted. |

**The verdict.** Each target's outputs (zh five, the others four) are pooled over the model tier's measures and held to the
merge rule's thresholds (`layer-gate/score.mjs` `compare`: a share by 0.2 points, a ratio by 0.02, a count at all, a defect
as a rate per 1,000 cells at all). The run fails on a regression no ruling accepts; on a changed `layout-rules.json` whose
`version` is not the base's plus one, whose `note` is the base's, or whose bytes are not the canonical form (`writeRules`);
and on two runs that are not one instrument (the gate's inputs differ) or a run that is not whole. A run is whole when the
gate lists nothing in its `failures` (an output that threw, did not get ready or changed its inputs as it drew, or a request
that would have left the machine: the gate exits 1 for each and, before, left no trace in the file) and its outputs are the
pack's, no more and no fewer (the frozen references `gate-pack.json` lists), so that two runs that lost the same outputs
cannot pass on the ones they share, and two empty runs cannot pass at all. A completeness count that makes the gate exit 1
refuses nothing: the merge rule decides it. The comment lists the
pages that moved, each as a lab link, `http://127.0.0.1:8093/#f=<fixture>&p=<page>&rules=<head sha>` (start the lab as
`lab/pdf/layer-lab/README.md` says; the link loads the pull request's set). A target with no fixture (zh-TW, pt) is named as
unmeasured. The comparison is of two runs on the same runner, so the platform stays out of every delta; no baseline from
another machine is compared.

**The pack** is everything the model tier reads for the 29 outputs and nothing else: arXiv's PDFs, the layout files
(`layout.json`), the PIPELINE translations (`units.json`, `record.json`), the frozen reference text areas and the kept layouts
(`refs/`), the geometry, the faces (every non-CJK face of the role table, and of each CJK group the outputs' targets use its
Kai and the four weights the roles are built from), and the en and de hyphenation patterns. It is a file set laid out so that
the gate's own flags and variables read it: `--fixtures=<pack>/fixtures`, `LAYER_REFS`, `LAYER_GEOMETRY`, `AXT_DATA`
(`<pack>/data`, which holds `fonts/`) and `TEXMF_DIST`; `rules-gate.mjs run` sets them. Its manifest lists each file by path,
digest and size; its **digest** is that of the sorted listing, the same on every make (the clock is not in it, and every file
is written with its mtime at the epoch). Its outputs are its frozen references (`refs/<output>/ref.json`), the set the gate
itself requires: a make fails, naming each file, when any other file of one of them is missing, so an output cannot drop out
unseen; and the verdict holds both runs to that set.

Remaking it, on the machine that holds the data (after the fixtures are made again, a PIPELINE moves, or the faces change;
`rules-gate.mjs compare` warns when the engine's PIPELINE is not the pack's):

```
node lab/pdf/spikes/gate-pack.mjs make        # lab/pdf/out/gate-pack/, and lab/pdf/gate-pack.json (the defaults are the record's run:
                                              # the made fixtures, the PIPELINE 10 cut's translations, references and geometry)
node lab/pdf/spikes/gate-pack.mjs objects     # the objects to upload, once each: key, size, digest, local path
```

The objects are content-addressed (`gate-pack/<sha256>` in the bucket `readarxiv-ci`, which has no public access), so the
outputs of one paper share one, and an upload is each distinct digest once. In CI `gate-pack.mjs restore` reads each from
Cloudflare's REST API with the read-only token (`READARXIV_CI_TOKEN`, a Cloudflare API token with *Workers R2 Storage Bucket
Item Read* on that bucket alone), checks it against the manifest and writes it; and `verify` checks every file again before
the gate reads any. A fork's pull request has no token and runs no job.

**Where the pack is cached.** In a pull request's own cache, by the pack's digest (`rules-gate.yml`), and nowhere else. A cache
saved by a push to `next` is readable by a fork's pull request, which runs its own edited workflow and can restore the
caches of its base branch (the key is public, in `gate-pack.json`): it could then publish the papers. So no workflow that a
push runs saves the pack: `rules-publish.yml` downloads it each time, digest-checked, and keeps nothing, and
`tests/scripts/rules-workflows.test.ts` fails a workflow that caches it and is run by anything but a pull request. The price is
that each new pull request downloads the whole pack once.

**The job log is public**, and the layer gate prints exception stacks and the reasons an output failed, which can carry a unit's
text. `rules-gate.mjs run` writes the gate's whole output to a file of the runner (`--log`, in `RUNNER_TEMP`, never uploaded)
and echoes only the lines that are names and numbers (an output's `ok` line, the tier's and the completeness lines; a failure
cut after the output's name). The comment and the numbers are searched for the translations' strings before they are written
(`--records`), and a ruling's words are shown in code spans. The runner has no pnpm action of a third party's: `corepack enable`
gives the version `package.json` names.

**One pointer, one queue.** Every job that writes a pointer is in the one concurrency group of its environment,
`rules-pointer-staging` or `rules-pointer-production`: the publish job and the rollback share it, queued and never cancelled, so
two writes of a pointer never interleave. The group keeps every pending job in order (`queue: max`): GitHub's default keeps one
and cancels it for the next, which could drop a rollback that waits behind a publish. (actionlint 1.7.12 does not know the key yet.) A production rollback begins by cancelling every `rules-publish.yml` run that has not
finished, whether it is still measuring the live engines or waiting for its production approval (`gh run list` for each
unfinished status, then `gh run cancel`), in the one job
of the three workflows that holds `actions: write`, which has no secret and no environment; the rollback is not made where that
job failed. Without it a publish approved after the rollback would move the pointer back over it. A set whose run was cancelled so is published by re-running that run, or by the next merge.

**The newest set only.** A queue of publishes can run out of order, and GitHub replaces a pending job when a third arrives, so
a publish does not write what it was queued with. Before it writes, each staging and production publish fetches `origin/next`
and compares `layout-rules.json` there with its own, both the `version` and the bytes (`rules-publish.mjs publish
--next=origin/next`; the check is `supersededBy`). Where next's version is newer, the job prints `superseded by version <n>; its
own run publishes it` and exits 0 without writing. It does the same where next holds other bytes under the same version, which
happens when two pull requests raised the version from one base and both merged cleanly: the later merge's run publishes the
later bytes. If the earlier one was already published, that run meets them under the version (409) and fails, asking for a
new version. A set is a whole file, so a version skipped loses nothing; with the queue above, the pointer only ever moves
to the newest merged set, except by a rollback. A production publish read next after its click, which may be days after the
merge, so one that waited and is not the newest stands down. Where the newest set's own run fails, run that one again from its
page: the older ones have stood down for it. A job that cannot read next fails and writes nothing.

**Live engines.** Before production, `rules-gate.mjs engines` runs the model tier of head's set on each engine
`lab/pdf/live-engines.json` names (the released extension's tag and the web's production pin, each a git ref of this
repository) whose `RULES_SCHEMA` is the set's, and compares it with the set now published for that engine (production's
`/api/v1/rules/s<schema>`, else the engine's own built-in set where none is published). A regression stops the publish and
names the engine, unless a ruling accepts it, in the same way as on the pull request: the check reads the rulings of the tree at
the set's commit, each bound to the set it came in with (the set's version at the merge that added it). It honours, for an
engine, only the rulings that came in after the set published for that engine, up to the set being published, which are the
changes between the two. The layer gate's record's rulings are history and accept nothing there. Its summary
goes through the same search for the translations' strings (`--records`' lock) before it is written. Each run it holds is
whole, as on the pull request. While the file names no engine nothing is measured.

**What the repository needs**, set by the maintainer (no value is in the repository):

| Where | Name | Value |
|---|---|---|
| Environment `rules-gate` | secret `READARXIV_CI_TOKEN` | the read-only token on the bucket `readarxiv-ci`, created with an expiry and rotated before it lapses: any process of a job that references a secret can read it, and the pack is on the runner's disk for the same code, so the token is worth only its lifetime (the next pack) |
| Environment `rules-staging` | secret `RULES_PUBLISH_SECRET` | the staging Worker's publish secret |
| Environment `rules-production` | secret `RULES_PUBLISH_SECRET`; the maintainer as required reviewer | the production Worker's publish secret |
| Repository variables | `CF_ACCOUNT_ID`, `RULES_STAGING_URL`, `RULES_PRODUCTION_URL`, `RULES_PRODUCTION` | the account id; the staging and production origins (`https://…`, no path); `on` once production exists |

The two variables also switch the jobs on: the gate is skipped while `CF_ACCOUNT_ID` is unset (set it once the pack is in
the bucket and the token is made), and the publish while `RULES_STAGING_URL` is unset (set it once staging's Worker serves
the rules routes).

Locally, the same two runs and the verdict: `node lab/pdf/spikes/rules-gate.mjs run --engine=<worktree> --rules=<file> --pack=lab/pdf/out/gate-pack --out=<run.json>`
for each side, then `node lab/pdf/spikes/rules-gate.mjs compare --base=<run.json> --head=<run.json> --out=<dir>`.

### The highlight

The hover highlight lights a sentence and its translation on both sides. The Node gate holds what is found and where it
is painted; the browser gate holds the pointer, the paint and their costs.

| File | When to run it | What it needs |
|---|---|---|
| `lab/pdf/spikes/highlight-gate.mjs` | After any change to `pipeline/anchors.mjs`, `view/highlight.mjs`, `view/floats.mjs`, `view/figures.mjs` or how sentences are made. Exit 1 when a count moves from the baseline; `WRITE_BASELINE=1` records a change that was meant. | The ten papers' runs and the ground truth (`data/runs/highlight-ten`, `data/runs/highlight-gt`), their sources and arXiv's PDFs (`data/corpus`), and the Microsoft answers their sentences are made again from (`out/highlight/B3/ms-cache-zh-auto.json`, `ms-cache-zh-en.json`). A missing set fails the gate. |
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
| `lab/pdf/spikes/front-gate.mjs` | After any change to `src/pdf-reader/engine/source/latex-front.mjs`: units, letters and files per paper against a stored snapshot (`out/front-gate.json`); a paper that moves by more than 5 % is listed. `--accept` stores the current state. | The corpus and `out/c0-browser-patched-full.json` (which papers compiled cleanly). |
| `lab/pdf/spikes/front-peek.mjs` | To look at what the front end takes from one paper, by eye. | The corpus. |
| `lab/pdf/spikes/latex-front.mjs`, `paper-meta.mjs` | Shims onto the engine's modules, for the Node spikes. | — |
| `lab/pdf/spikes/corpus.mjs`, `corpus-summary.mjs` | To make the corpus (a seeded random draw of a month's submissions: each source and arXiv's PDF, one request every 3.2 s) and its summary, `out/corpus-meta.json`. | The network. |

### The reader's browser checks

These open the reader on the demo papers and need no TeX page. `pnpm build` first; each exits non-zero on a failure.

| File | What it checks |
|---|---|
| `lab/pdf/spikes/reader-ui.mjs` | The reader's interface (`docs/PDF-READER.md` §4–§8, §13): the controls, the menus, the states, the keyboard; screenshots in `out/reader-ui/`; the states a demo paper never reaches are put on screen by the events a run would send (`window.__reader.host`). |
| `lab/pdf/spikes/reader-settings.mjs` | The reader and the extension's settings (§3, §9.1): the display opened in, written back, followed from another tab. |
| `lab/pdf/spikes/reader-perf.mjs` | The performance gates of §12: the backdrop blur, dark pages, the scroll listeners, the animations. |
| `lab/pdf/spikes/pinch-overlays.mjs` | The overlays through a pinch (§10.1–§10.2): drift, cost, the redraw. |
| `lab/pdf/spikes/reader-pixels.mjs` | The reader's pixels and tokens against a recorded baseline (`--baseline` records) (§4.1): the toolbar, its menus and tooltip, the status capsule and the cards. The baseline is kept in `out/reader-pixels/`, which the repository does not hold: record it on the build before a change, compare on the build after. |
| `lab/pdf/spikes/level-on-screen.mjs`, `early-scroll.mjs` | What the sync calls level against what the screen shows, and a side read before the pair is located. |
| `lab/pdf/spikes/reader-papers.mjs` | Makes the demo papers into `lab/pdf/poc-reader/papers/`. |

The reader's checks that need the local TeX page (service faults, viewer faults, the live mode and its states) are
parked with it: `parked/README.md`.
