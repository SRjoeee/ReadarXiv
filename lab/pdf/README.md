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
| `lab/pdf/spikes/layer-gate.mjs` | After any change to `src/pdf-reader/engine/layer-proto/`, `layer/`, `layout/`, the layout rule set (`rules/`, which the gate reads: `--rules=<file>` measures another set, and the run records its version and digest) or the front end's units. `--tier=model` (the default) takes seconds and runs on every commit; `--tier=pixel` takes minutes and runs on every merge. `--check` holds the run to the last record (exit 1 on a regression); `--record` writes `records/layer-fidelity.*` and `records/layer-gate.*`, and only for a whole run. | `data/layer-fixtures/` (the 29 fixtures: each paper's `arxiv.pdf`, `units.json`, `record.json`, layout file and frozen reference; the 30th, 2608.16117v1-zh, is the pack's alone, below), `data/fonts/`, the made layout files it caches in `out/layer-gate/`, Playwright's Chromium, and Docker where it makes the layout files itself. No network. |
| `lab/pdf/spikes/layer-gate/` | The gate's parts: the scorer and the measures (`score.mjs`, `measure.mjs`, and `links.mjs` for the links; `tests/pdf-reader/layer-gate-score.test.ts` and `layer-gate-links.test.ts` test their arithmetic), the frozen references (`ref.mjs`), the page in the browser (`page.mjs`), the prototype's floor (`proto.mjs`, `floor.json`). The bytes of `measure.mjs`, `score.mjs`, `links.mjs`, `page.mjs` and `proto.mjs` are hashed into every recorded run (`measures`; the first lines of the older of them still name the directory they were made in): a changed byte is a new instrument, and the record is made again. | — |
| `lab/pdf/spikes/layer-gate/door-order.mjs`, `door-jump.mjs` | After a change to what the reader's door (`reader.mjs`, `run.mjs`) lays for an ask, or in what order (1b-D): `layer-gate.mjs --door-order=reverse\|seed:<s>\|burst:<s>` asks one open's pages in another order (bursts: concurrent asks, aborts, re-asks), `--door-jump=all\|<fixture>:<page>,…` asks each page first and alone in a fresh load (with `--perf`, the time to the page); every page is compared with the page asked in order (SVG, word table, copy pixels, records), and the jump reports the pages drawn and units laid before it was ready. With `--ink` the door's bundle carries the wrap's ink units (docs/route/orphan-text.md: their kinds on the left, their rows in the layout, an echo drawn with its unit's row), so that its pages differ from the gate's own where an echo is drawn; `--door-shots=<dir>:<fixture>:<page>,…` writes those pages' copy plane (PNG) and drawing (SVG) for the eye. Proofs, never recorded. | The inputs `--door` reads. |
| `lab/pdf/spikes/layer-gate/door-draw.mjs`, `draws.mjs` | After a change to how a page is drawn from its draw geometry (E-C: `run.mjs` openProto `drawOf`, the door's hand-off of a BUNDLE 5 left part's `draw`), or to what the prepare reads into it (`pipeline/draw-data.mjs`, `layout/pdf-lite.mjs`): `layer-gate.mjs --door-draw=inputs` reads every page of the six papers in Chromium as the run reads a page live against its draws read in Node as the container reads them (`draws.mjs`: the engine's lite worker), the characters and Link annotations field by field (a draw whose links lost their overlaid text, the lite worker's link text guard on, fails by name); `--door-draw[=pages]` draws the 30 outputs' pages from their draws against the same door reading every page live (SVG, word table, links, copy pixels, records, units left; PDF.js's text and annotation reads none on a page from data, a page's drawing only where the run read its pixels); `--door-draw=jump:all\|jump:<fixture>:<page>,…` asks each page first and alone, `--link=<rtt>:<bytes/s>` over a modelled link (the E-C handoff's sim2), `--perf` the time to the page. Proofs, never recorded. | The inputs `--door` reads, and the draws `draws.mjs` writes to `out/layer-gate/draws/`. |
| `lab/pdf/spikes/layer-gate/fill-measures.mjs` | After a change to the page fill (`run.mjs` `pageTarget`, `fillPage`): reads a model run's `--dump=<dir>` and reports, per output, the purity check (each page's target recomputed from its units' records), `fillStep` (target steps between body pages over the band), `rhythmSpread` and `rhythmDrift` (the drawn rhythm), and with `--base=<dump-dir>` the pages and units that moved. Reported, not gated, and not one of the instrument's hashed files. | Two dumps of one set of outputs. |
| `lab/pdf/spikes/layer-gate/run-speed.sh`, `speed.mjs` | The speed check every batch of engine changes carries (the owner's standing rule), in a quiet window: `run-speed.sh <head worktree> <base worktree> [3]` makes the model tier's `--perf` runs (30 outputs, one worker) of both engines interleaved three times, head's gate scripts for both; `node lab/pdf/spikes/layer-gate/speed.mjs <logs>` prints, head against base, the first page's draw time (p50, p95), the page lay time (p50, p95), the pages over 50 ms and over 100 ms, the JS heap's growth a laid page, and the **work counters** (`layer-proto/work.mjs`, in each page's `perf.work`: fit states tried, width measures, breaking passes, link-matching work units, ink-map cells, drawing operations, and what a page read live reads for its fills: integers, the same for the same input, so CI noise cannot hide a slowdown). The verdict: a time or memory metric worse than the run-to-run spread (largest max - min over the repetitions of either side), or any work counter whose total grows by more than 0.5 %, is a FAIL (exit 1); a base that predates the counters, or a counter (`fills`, E1) its pages do not hold, leaves them INCOMPARABLE (exit 2), never a growth from zero. `tests/pdf-reader/layer-gate-speed.test.ts` holds the arithmetic. Reported, never recorded, and not one of the instrument's hashed files. | Playwright's Chromium, the fixture pack, two worktrees. |
| `lab/pdf/spikes/layer-fixtures.mjs` | To make a fixture's outputs: a paper into a target, with the layout compile (a paper that ships no `.bbl` opened first with the one BibTeX makes, as the prepare does: `layout/paper.mjs madeBibliography`) and the translation (staging's record where it holds one, else Microsoft's free endpoint; a unit the gates' run hides by its class is never sent). `--layouts-only` makes the layout file and base page alone, the translation the fixture holds kept: a pack's remake over a maker that moves the layout and not the frozen units. | `data/` for the papers and compiles it caches, Docker, the network only where `--offline` is not given. |
| `lab/pdf/spikes/layer-cut.mjs` | After the front end cuts the units anew, to carry the gate's fixed inputs to the new cut's ids. | The old and the made fixtures. |
| `lab/pdf/spikes/layer-perf.mjs` | To hold the layer to its cost budget: runs of `layer-gate.mjs --perf` against the old path's. `--record` writes `records/layer-perf.*`. | The runs' JSON files. |
| `lab/pdf/spikes/text-layer-cost.mjs` | After a change to the text layer (`layer-proto/textlayer.mjs`, `view/text-layer.mjs`; docs/PDF-READER.md §11.11): the engine's step and the host's build of a laid page's text layer, its nodes and its items' bytes, on any PDF's pages (their own text content, a synthetic translation of them: `--plan=translated\|half\|kept`), in Chromium. Its record: `records/text-layer.md`. | A PDF (our final pass of the heaviest papers), Playwright's Chromium. |
| `lab/pdf/spikes/table-groups.mjs` | To measure the table groups' decision (`src/pdf-reader/engine/translate/groups.mjs`) over translations already made; `--write` makes the gate's decided records. | The fixtures' records, the corpus sample, Microsoft's kept answers; Docker for the captions. |

Records: `lab/pdf/records/layer-fidelity.md`, `lab/pdf/records/layer-gate.md`, `lab/pdf/records/layer-perf.md`, `lab/pdf/records/text-layer.md`.

**The layer draws only from the layout file (route step 2, 2026-10-22).** A unit the file does not locate whole (not held, or a
visible piece it has no position for: a placeholder LOST or with no row, but a text symbol, a macro that sets no ink, a space)
is the original's: no reading of the page's text stands in for a position the file lacks, and no proof checks one. Gone with
it: v0's own reading of such a unit (the lines from the anchors' rectangles, the placeholders' renderings found by aligning
gaps with the source, their second chance, the first line's repairs), the held lines' cover of a LOST display
(`displayCover`), the run of leftover characters that drew a LOST text piece (`textRunsOf`), the proof of v0's renderings
(`proofOf`; what stays of it is `tex.mjs cropsOf`: a rendering page text cannot be, a character no Unicode stands for or none
of the unit's in the row's segments, is the segments' crops, else the unit stays the original's), and the gate's options
`--proto-tex=ph` and `--proto-tex-only=no` (`--proto-tex=lines` is the layer, and the gate requires it). A run's `sources` is
`{ tex, why, texOnly }`: the units placed, why the others are the original's (`unanchored, <why of locatedWhole>`), how many of
the placed only the file holds. The file's coordinates are the base page's, so a layer is drawn over a base of ours only
(`format.mjs layerDraws`, asked by the door's open and the whole's alike): a head whose `base.source` is arXiv's, or a bundle
merged from one (`mergeParts` keeps the head's `source`), draws nothing, though its parts carry layouts; the door cuts of
`--door` and `--door-parts` are made over a base of ours (`doorBaseOf`). The sections below describe how those rounds were made; where they name what is removed, it is
the history of the readings the file now gives.

The gate measures the drawn layer, v0 (`--engine-kind=proto`, its default; the records' mode is `--proto-tex=lines`; `--door` is the reader's door; `--door-parts[=doubling|splits:<n>|seed:<s>]` the door in parts against the door over the same cut made whole, BUNDLE 4's equality proof, never recorded). Every mode draws over the fixture's `base.pdf` wrapped by optional content as the maker child wraps it (`layer-gate/wrap.mjs`: the engine's `wrapFinal` over the paper's source units, `--sources=<dir>` or `data/layout`, `data/corpus`; cached in `out/layer-gate/wrap/`), with the head fields a reader is given (what the wrap could not hide, each page's cell rules): there is no other way of taking a unit's ink away (`docs/PDF-READER.md` §19.9). A fixture with no source, or whose wrap is refused, is drawn over its page unwrapped, every unit the original's, and the wrap line after the completeness line names it. The first layer (`layer/layer.mjs`, with the fit and the line breaker under `layer/`) is parked (`parked/README.md`): `--engine-kind=layer` is refused with a message that says so, for an older worktree given by `--engine=<it>` that still has the entry it measures it as it was, and the layer lab's first view reports that the entry is not there. The checker `layer/check.mjs` stays, since the gate's instrument imports it by its address.

**TeX's file against the drawing** (the 2608.16117 survey and the p59 finding, 2026-10-15). Seven measures read the
drawing against TeX's own file, the layout file the fixture's drawing is given (`fixtures/<output>/layout.json`, its rows
read by the instrument itself, `measure.mjs fileIndexOf`), never against the engine's own matching of the page's ink,
which the older completeness checks trust. Not the kept layout (`refs/<output>/layout.json`): the 29 earlier fixtures'
were made by the layout maker's first version, whose segments are a glyph's font box rather than its ink and which holds
no `held` lines. So the measures are taken only from a file of the maker's version 3 or later (its own `layout` field),
which `--layouts=fixed`, v0 alone and a folder of old files given by `--fixtures` are not. A pull request that changes
what the maker writes moves these measures' ground truth with it, in its own pack:

| Measure | Tier | What is counted |
|---|---|---|
| `contentLost` | model | A placeholder of a drawn unit whose ink the file finds on the page (its segments) that is not shown exactly once. A rendering drawn elsewhere shows it only where it is that placeholder's own (its unit and piece, or a piece of the same source) and drawn from its ink or source: its crop holding a segment's centre, its rendering from its source, its characters drawn as the page's own standing in its segments. Its ink left in place shows it whoever left it (a kept rendering's characters in it, a kept line, never erased). Another placeholder's rendering drawn from its ink is no showing, nor is the drawing's putting back of ink it lost track of. Shown no time or twice or more. |
| `contentUnknown` | model | The placeholders of drawn units the content measure cannot place: LOST in the file (no segment, no ground truth for their ink), or of a unit the file does not hold on the page. Gated as the others, so that a maker that loses more ink cannot lower the content measures by it. |
| `textInDisplay` | model | A drawn line whose text's ink meets a display's segment or a display's row (a held line no text line of its unit shares a band with). Gated at 0 (below). |
| `slotsSkipped` | model | Room between two drawn lines of a unit in one frame, beyond their own pitch, that the original does not leave there itself, in slots: TeX's own room (between two of the unit's text lines of the file in that column beyond its pitch: a blank line between paragraphs, a tall line's opening) and a text line the drawing keeps as the original's are set aside. Two lines with a held line between them are no pair: the room before a display is the frame's blank lines' (`blankLines`, `fill`). A forced break of TeX's leaves its own room: the file's lines whose ink ends short of their column's measure, the next line a text line of the unit, where the unit's source sets exactly as many `\\` or `\newline` breaks as the engine counts them (one whose next line opens another page among them), a visible piece that is no display before and after each, a placeholder visible where the file holds a row of ink for it (`measure.mjs forcedBreaksIn`, `forcedBreakRoom`); its room is its gap beyond the pitch, or beyond the opening TeX's \lineskip rule set for a tall line after it (the file's boxes and `lineskip`), in pitches (the empty line of `\\ \\`, none for a lone `\\`), credited once in its frame wherever the drawing sets the break, to the pair whose room is nearest it, never by its place: a drawing that holds the text after a break on TeX's own line, under the room the text before it did not use, skips those slots (the correction of 2026-10-16). On `next` it was 0 (2026-10-15); it does not see the survey's cause 5 itself (a forced break drawn as a space, the original's blank landing mid-sentence: the page the same shape as a right drawing). |
| `lineStartPunct` | model | A drawn line that opens with a character UAX 14 keeps from a line's start (CL, CP, IS, EX, NS; LineBreak-17.0.0), unless the original's line on that baseline opens with one. Gated at 0 (below). |
| `glyphsLost` | pixel | Lost ink by the strict account (`measure.mjs glyphAccounted`): an erased glyph in a placeholder's segment counts only where that placeholder is drawn from it or from its source; one on the unit's own line in no segment is TeX's text, replaced; a leftover of a gap off the file's lines is never accounted. `lostInk` stays as it was. |
| `hiddenOutside` | pixel | The per-unit erasure's G3 (`proto.mjs hiddenOutsideOf`): render A of the wrapped page (the groups the page's drawing hides OFF) against every group ON, both by the GPU at the gate's resolution, the pixels that differ outside the rectangles of the page's `hidden` operations, each grown by 2 px. **Gated at 0** in the pixel tier (a completeness check). |
| `linesLeft` | pixel | A drawn unit's own text line of the file (not held; its kept label and the placeholders kept in place aside) left intact on the copy, as `stray` reads an item intact. |

**How a new measure is gated.** A measure that is not 0 on `next` when it is added cannot be gated at 0: every pull request
would fail. It enters as a `defect`, compared as a rate per 1,000 cells against the run it is held to (the merge base's in
CI, the record locally), so that it fails only on a regression; `next`'s value is its baseline in the record. The seven
above entered so, on 2026-10-15. The pull request that removes a measure's cause brings it to 0 and, in the same pull
request, gates it at 0: it adds the measure to the completeness checks (`layer-gate/score.mjs completenessRows`, where any count
above 0 makes the gate exit 1, and `rules-gate.mjs`'s `CHECK`, the names its public line may show). From then on any count
fails. `textInDisplay` is gated so since the displays a held run covers are read from the file (2026-10-15): 0 on the 30
outputs since the LOST round, and its cause in the hybrid, `layer-proto/tex.mjs displayCover` grouping the displays by the
translation's pieces (the p59 finding: Microsoft dropped the "with" between two displays, the groups paired nothing, and v0
laid the text over the display), removed: the groups and their runs are the file's (JOINED, the found displays' segments,
OUTSIDE) in the source's order. `lineStartPunct` is gated so since the breaker keeps every such mark with the text before
it (2026-10-17, below): 0 on the 30 outputs, 8 on `next` before it (de 1, es 3, ja 2, ru 1, zh 1).

**No line opens with a barred mark, and a mark that hangs is no overflow (2026-10-17).** The breaker (`layer2.mjs
breakLines`) never breaks before a mark UAX 14 keeps from a line's start (`layer-proto/no-start.mjs`, the table
`lineStartPunct` reads) nor before one the target's rules name (`noStart`: CJK's small kana and prolonged sound mark, the
closing quotes, the per cent sign), for every script: the mark joins the group before it across the spaces between them
too (a translation's space before its comma or bracket, a formula drawn as the page's characters with its spaces, a brace
after a crop that no rule glued), so the word or the character before it goes down with it (kinsoku's push-out). Where
that group is longer than a line by itself, the line takes the break the glue alone allows, as before; a token cut by its
characters never leaves such a mark at the head of its tail. A layout no barred start touched is the one it was
(`tests/pdf-reader/layer-proto-no-start.test.ts`, a digest of 240 seeded paragraphs in five targets). On the 30 outputs
the drawing moved in 17 units on 16 pages of 11 outputs: the 8 whose lines the measure counted, and 9 whose barred start it
did not (the original's line opening with such a mark too, a `.5:.05:.95` or a `.95]`, or a closing quote the rules name
that a translation set as an opening one); no other measure worse (1810.04805v2-ja's blank lines 0.112 to 0.102 and
paragraph gap 1.024 to 1.014). Stricter than UAX 14 in one place, so that the measure and the rule are one table: a full
stop before a digit after a space (LB15c) is kept from a line's start too. `overRight` counts a body frame past its right edge by more
than a point only where its lines are past it before the marks that end them (the geometry's `dBody`, `measure.mjs
hangFromOf`: the tokens ending a line that hold only closing marks, `noStart`'s or a final quotation mark); a frame past
it by those marks alone, by at most their own width, is `hanging` (reported, not gated: CJK's hanging punctuation, a
closing mark's blank half the breaker hangs). On `next` the old count, 432 of 3,342 frames (12.9 %), is 137 past the edge
(4.1 %) and 295 hanging (8.8 %): ja 77 to 9 and 68, zh 298 to 77 and 221.

**The gap between two paragraphs against their lines** (`paraGapTight`, model, defect; the half-leading round, 2026-10-17).
`paraGap` holds the drawn gap between two body frames one above the other in a column to the original's, foot to top,
whatever the drawn leading: a paragraph spread at 1.4 pitches from its frame's first baseline to its last stood a pitch from
the next and read 1.0 (1512.03385 page 12 in Chinese, the maintainer's report: gaps of 11.95 between lines 14.9 to 16.7
apart). `paraGapTight` counts the pairs of two units (`measure.mjs paraGapsOf`, `tight`) whose drawn baselines' gap less the
drawn leading (the mean of the two frames' own, each the lower median gap of its consecutive lines within a flow segment)
falls short of the original's room past its pitch (its gap less the pitch, the lower median of the two frames' own gaps:
a `\parskip`, capped at a pitch, so that a line borrowed into a wider room is no tight gap) by more than 0.05 of a pitch;
no pair where neither frame draws two lines. It entered as a defect, `next`'s value its baseline: 250 pairs on the 30
outputs (1512.03385-zh 52, 1706.03762-zh 27, 1810.04805-zh 33, 2608.04322-zh 43, the thesis 39, 2608.16117 10, the Korean
39, the Japanese 3, the alphabets 4). With each paragraph's first line kept on the original's and the paragraph above it
ending the larger of the two leadings and the original's own skip over it (`layer-proto/layer2.mjs footFloorAt`, `run.mjs
fillPage`) 64, the alphabets' 4 unchanged. Gaps under the larger of the two leadings are 23 there (144 on `next`): a frame
of one line above (no room to give), a paragraph above begun on an earlier page, and one whose fit fills its frame at any
leading. Since that ruling (`rulings/2026-10-17-half-leading.json`) `paraGap` is reported and no longer gated: it held a
translation spread past the original's pitch to the original's gap of a pitch, tighter than its lines, and `paraGapTight`
gates the gap in its place.

**The links** (3a-0, the first of the links' pull requests: the instrument before the engine's anchors; `layer-gate/links.mjs`, `tests/pdf-reader/layer-gate-links.test.ts`). The owner's ruling: links kept / total at least 0.95, the text drawn under each moved link equal to PDF.js's overlaid text at least 0.98, links over erased text 0. The original's links are the Link annotations PDF.js reports on arXiv's file (`getAnnotations()`) that the reader can carry (T: a rectangle with an area and a non-empty destination, or a url of http:, https: or mailto:); the rest are reported (U: a named action, JavaScript with no url, an attachment, `unsafeUrl` alone, another scheme). The engine's answer is `run.linksOf(p)` (records, plain data) and `run.linkSources(p)` (gate-only: each record's source annotations `[page, i]`, `i` the rank among the page's Link annotations, and its tier); an engine with neither has no record, and the measures read it so (kept 0). The attribution is the engine's own claim, checked and not trusted: by target, by the in-place rectangle, by uniqueness and, for a moved record, by the drawn text. What no check can tell is a right link from a wrong one that has the same target and the same rectangle; the gate accepts that.

| Measure | Class | What is counted |
|---|---|---|
| `linksTotal`, `linksUnsupported` | reported | T and U of the gate's pages. |
| `linksPlaceable` | reported | Annotations of T none of whose glyph points the drawing's operations leave erased (PDF.js's rule for overlaid text: a glyph's advance centre on its baseline, strictly inside the rectangle or a quad; the instrument cuts the page's text items into characters of equal advance, never the engine's characters): what "in place" alone could keep. |
| `linksKept` | model, share, up | Annotations of T attributed to a record with their own target (`dest` deep-equal, `url` equal), moved, or in place with boxes equal to the rectangle (or quads) within 0.01, the record in no way wrong, ÷ T. No value where T is empty. **At least 0.95 per output** (3a-2, completeness checks): an output below it fails, and the annotations no record kept are listed (`linksLost`, page:rank, in the summary). |
| `linksTrue` | model, share, up | Moved records whose drawn text under their boxes (the SVG's characters whose advance centre and baseline lie inside a box, DOM order; a crop's transparent text one string at its place) equals the reference after NFKC on letters and digits (all non-space characters where there are none), ÷ moved records measured. The reference is PDF.js's overlaid text where every glyph of the record's annotations (its letters and digits where it has any, each read at its middle, a third of its size over its baseline, within a third of its size across: the equal-advance estimate's place) lies in a placeholder's segment of TeX's file, on no unit's line, or on the line of a unit that has no link pair (only a pair's text is a link's own translated text); else the plain text of the translated pieces between the pair (the `\href` with the annotation's url, else the owner's i-th `\hyperref` or `\hyperlink`; the owner's one pair for every annotation of one target, a link text TeX broke over two lines, given once): the overlaid text is English where the link text is translated. The pairs are read in the SOURCE's order (each open's index in the unit's source, the units file's: a translation may set two pairs the other way), a `\hyperlink` by the destination it names; where two pairs could be the link's and one has no place in the source, none. Where neither is found, or no character is drawn under the record, it counts as not true and is listed (`where.linksTrue`); each annotation of a record is read against its own page's glyphs and TeX's file (a unit over a page break). What is drawn under a record is the SVG's characters (a crop's transparent copy text is none: no reader sees it) and what the page's crops show under it: a crop is the original's pixels, so its text is its source page's glyphs inside its source box (and its clip), carried by its own map to where it is drawn, read only for a crop whose source box meets the rectangle of an annotation the record claims (`cropsShown`, the drawing's own audit; nothing of the engine's links). With no TeX's file to read the reference cannot be had: the record is counted `linksUnverified`, neither true nor listed, and left out of the share; a run with none measures no record, so its true minimum is not applied. No value where there is no moved record measured. **At least 0.98 per output** (3a-2, completeness checks): an output below it fails, its records not true listed. |
| `linksWrong` | model, defect, down | Records with a defect: in place over a glyph point the drawing erased; an attribution that names no annotation of T, one of another target, or one another record claims (across a fixture's pages); an in-place record whose boxes are not its annotation's rectangle, or that claims more than one annotation or one of another page; a url outside the allow-list, or both or neither of `dest` and `url`; boxes that are not `[x0 < x1, y0 < y1]` times n; an empty `name` where there are glyphs. **Gated at 0** (completeness checks, `rules-gate.mjs` `CHECK`), `where.linksWrong` names each record's rank and reasons. |
| `linksComposed` | door | In `--door` and `--door-parts` (in Node, no page drawn): the pages 1 to N of the document a reader is given (the wrapped page) whose Link annotations differ from the page's own unwrapped in rectangle, destination, url, border width and style, colour, overlaid text or quads. **Gated at 0**: the run fails on any page. |

Kept and true can only rise: they enter as shares held to the record by the merge rule (a fall of more than 0.2 points is a regression), and since 3a-2 each is held to its minimum on every output (`completenessRows`, `rules-gate.mjs` `CHECK`). `--door`, `--door-order`, `--door-jump` and `--door-parts` compare each page's link records as they compare its SVG and its word table (a digest of `pageOf`'s `links`). Counts per output are in the record's "Links" table. On `next` (53fd41da, the 30 outputs, 523 pages) the engine answers no record: 7,362 links in the original on those pages, none kept, none moved, 1,158 placeable in place, none wrong, `linksTrue` not applicable. After 3a-1 (the engine leaves a link where it stands when the page's operations left its glyphs unerased, `layer-proto/links.mjs`; no link is moved yet): the same 7,362, 1,158 kept in place (15.7 %, equal to the placeable count on every output; that is by construction, not evidence: the engine keeps a link only if no glyph point of either the instrument's reading (equal-advance cut of the text items) or its own characters is erased, so it can only agree with the gate's check on the first. `linksWrong` 0 therefore does not test the engine's erased-text decision; a point of the engine's own characters is the real check, and on these outputs it drops none that the instrument keeps), none moved, none wrong, `linksTrue` not applicable, the 30 outputs' every other measure and page unchanged. After 3a-2 (the links moved with the text the layer redraws: at a unit's first paint the annotations it owns, the first unit of the page's growth rank whose rectangles as grown hold more than half of an annotation's points (not "most": a unit ranked later may not have grown yet), are matched to its pieces by geometry, a citation's key or a `\hyperlink`'s destination, a url, or the order of a kind in the source's order, only where certain, and placed over what is drawn of them from the layout's own numbers, a word or number found whole; `layer-proto/links.mjs` matchUnit, placeUnit): of the same 7,362, 7,361 kept (6,203 annotations in 6,079 moved records, 1,158 in place, 99.99 %; every output at least 99.9 %; the moved by geometry 6,169, url 19, order 15), the one lost a `\href` whose translation sets no text between its pair; none wrong; `linksTrue` 6,047 of 6,079 moved records (99.5 %), every output at least 0.98 (the least 1810.04805v2's, 98.0 %: four links over two `\newcite` crops whose source glyphs the instrument's equal-advance estimate places a glyph aside); `linksComposed` 0 of 579; the 30 outputs' every other measure and page, and every page's SVG markup, operations and word table, unchanged.

**2608.16117v1-zh**, the thirtieth output (CC BY 4.0; staging's own translation, the paper the maintainer reported on):
its PDF, layout file and translation are in the private bucket only, never in git, and it is not in `data/layer-fixtures`
(the gate reads every folder there). Every page of it is measured, as every page of the thesis is: the defects seen on
staging reach page 14. Its layout file was made natively, not in Docker (whose image store is unreadable on the machine
that made it): `layer-fixtures.mjs --offline --engine=<next> --only=2608.16117v1:zh`, with `LAYER_FIXTURES`, `AXT_DATA` and
`COMPILES` naming folders of its own and `lab/pdf/spikes/native-tex/` first on `PATH` and `NATIVE_TEX=1` set (no image is checked; the compile cache keys carry `native`), whose `docker` answers the one
`docker run` the maker makes with the same latexmk command run by the local TinyTeX (TeX Live 2026; `NATIVE_TEXMFLOCAL`, a
tree linking the full TeX Live 2026 tree's package directories TinyTeX lacks, with its `ls-R`; `NATIVE_TEXMFVAR`, one
holding that tree's `pdftex.map`; `GATE_PDF_CACHE` unset, which would take the place of `COMPILES`, so that no make in
Docker ever reads a native compile). Made three times so, the file is byte-equal; it is still not the Docker image's
package versions byte for byte, and the next make in Docker replaces it (a new pack object).

**The LOST survey's maker (LAYOUT 6, the file's schema 4, 2026-10-15).** All 30 layout files are made so, natively: the
same command with `--engine=<the tree> --switch --only=<all 30>`, `AXT_DATA` a folder whose `layout/<id>v<n>/` link each
paper's `source.gz` and `arxiv.pdf` and whose `layer-fixtures` links `data/layer-fixtures` (the 29 records), the 30th's
record and units copied into its output folder first, `LAYER_FIXTURES` the gate's made folder for the engine
(`out/layer-gate/fixtures/<key>`, the key `madeFixtures` computes, so that `--layouts=made` finds them), and the pack made
from it (`gate-pack.mjs make --fixtures=<that folder>`). Every placeholder the old files found has the same row; only LOST
ones moved. The measures read the new flags as TeX's file says: a `JOINED` display has no segments of its own (its ink is
in its group's first display's, which `contentLost` and `textInDisplay` read), and an `OUTSIDE` piece is LOST
(`contentUnknown`). A unit that opens with a display has its rows before its start mark's line taken off as no line of
it (as the held rows at its end), so that an `OUTSIDE` piece is outside every line of its unit. The prototype's checker
counts a placeholder shown when it is drawn or left intact where it stands (`inPlace`: an `OUTSIDE` piece, which the
drawing never erases), never `missing`. The layer's safe rule is one place (`layer-proto/tex.mjs` `cropsOf`, after `locatedWhole`): a
rendering is drawn only from what the file holds (its segments' crops or their page text, a piece the file draws as
nothing), else the unit stays the original's; its one exemption is a LaTeX text symbol (`\%`, `$\times$`), whose
source is its rendering's content: one grapheme drawn, with no `_`, `^`, `/` or `√(` (`layer2.mjs textSymbol`), so that a
formula of no letter or digit (`$\sum_{\alpha}^{\beta}$`) is proven as any formula is; with no layout file (the maker
refused, the bundle dropped it, or the head's base is arXiv's) nothing is drawn; a piece whose segments all lie past the pages the run shows (the gate's 12) is
drawn as its page text where the file has one, else as nothing, never `?`. Fix 4 (the maintainer's ruling of 2026-10-15, every script): a mark UAX 14
does not let a line start with (`layer-proto/no-start.mjs`, the table `lineStartPunct` reads too, served to the gate from
this repository) that opens the translation's text right after a displayed formula is dropped from the drawing, unless
the original's line there opens with one; the rows and the cache keep the translation. The sample's bundle is made so too, over the committed stand-in PDF (`scripts/make-sample-bundle.mjs
--keep-pdf`, the shim first on PATH: its stand-in compiled natively would differ by the packages' versions alone).

**The 2608.16117 survey's fixes 2 and 3 (2026-10-15).** A unit drawn on the file's lines keeps the file's held lines and
its found displays' rows alone: the alignment's two keep rules (a line with no source word; one of three or four words or
more under a fifth of them the source's) stay on v0's own lines, a unit the file does not locate whole (`layer2.mjs
alignUnit`). A forced break of the row (`\\`, `\newline`) between two visible pieces that are no display ends the laid
line (`layer-proto/tex.mjs forcedBreaks`): TeX's breaks are the file's lines a break's `\hfil` ended short of their
frame's measure, paired with the row's break groups in order as D4 pairs displays with held runs, only where they are as
many and every placeholder the file finds stands between the breaks its place in the row says; else the text runs
through as before. The correction of 2026-10-16: inside a frame the break leaves TeX's own room after it, read from the
unit's rows in the file (the gap to the next line beyond the unit's pitch, in pitches: 1 for `\\ \\`, 0 for a lone
`\\`), in the drawing's pitches wherever the translation sets the break, the rows on both sides of the gap one block
(`layer2.mjs blocks2`, `breakLines`), so that the unit keeps one leading and its unused room is at its end; only a break
whose next line opens another frame starts the text after it on that line. Pinned to TeX's line inside the frame, the
room the shorter translation of the text before it did not use stood as a band before it (2608.16117 page 3, unit 8: 4.4
pitches where TeX set 2). `slotsSkipped` credits each break's room once in its frame wherever the drawing sets it. Fixes 2
and 3 are the owner's ruling of 2026-10-16, `rulings/2026-10-16-fixes-2-3.json`.

**The 2609.26457 survey's fixes (2026-10-17).** A paragraph whose measure TeX changed within it (a wrapped figure
beside its first lines, `\parshape`, `\hangindent`) is laid in each line's own measure (`layer2.mjs measuresOf`): a step
is an edge more than 2 em off the line's before it that stays (the two lines before it hold the old edge and the line
after it the new, within 0.5 em; a first line's indent, and where the measure widens on the right a last line ending
short of it, break neither), each run of lines between two steps its own extent; the block keeps one grid, pitch and
flow across the change, a slot between two lines of two measures takes the narrower, and a line that is not its block's
last is erased to its own measure's edge. An isolated short line is no step, nor are a unit's kept lines. Before, every
slot took the block's widest line's edge, and 2609.26457's unit 43 (page 8) was laid over its wrapped figure's caption.
On the 30 outputs no block steps. And a placeholder v0's reading finds no rendering for (drawn from its source, or a
citation as the page wrote it before) whose row the file finds, its segments on the pages shown, is read from those
segments as the file's own reading reads a found row (`tex.mjs proofOf`, `layer2.mjs resolutionFrom`: a formula on one
line cropped at its segment, page text standing in them) where it was left unproven; a rendering v0 took that the
segments do not hold stays no proof, and a LOST row is never read. A text macro whose own characters hold one raised
over its main glyphs' baseline by a tenth of an em or more (`layer2.mjs scriptedOf`: 2609.26457's `\aidesq{}`, AIDE^2,
which page text on one baseline read "AIDE 2") is cropped from its ink, by the file's segment where it has one; where v0
read it without the script ("AIDE" alone), the proof reads it from the segment. A lowered script ("AIDE human",
"BERT BASE") reads as the same words and stays page text, which breaks across lines where a crop cannot: cropping
those too moved 1810.04805's `\bertbase` in all 7 of its outputs and made layout measures worse.

**A LOST text piece, and one table of LaTeX's text symbols (the soundness round, 2026-10-19).** A unit was left English
whenever any one of its pieces was LOST, a plain text piece too: 2609.26457's unit 24, whose second `\texttt{gemini 3
flash}` the layout's own compile broke over two lines where arXiv's sets it whole. The proof guards wrong ink and content
the source cannot give; the erase works line by line, so a text piece's ink, wherever on the unit's own lines TeX set it,
goes with them. A text piece (`tex.mjs textPieceOf`) is a placeholder whose plain text is its whole rendering: a code or
URL mark (`\texttt`, `\verb`, `\lstinline`, `\url`, `\path`) or a plain-text source, its argument literal (no command,
group, math or tie; outside the typewriter face no dash or quote ligature and none of OT1's substitutes); no citation,
reference, footnote mark, formula, display, paper's macro or `\textsuperscript` is one. `locatedWhole` passes one LOST
(not EMPTY) with the file's lines, and the proof (`textRunsOf`) draws it as the run of the unit's leftover characters
that spells it (no matched source word, no found piece's segment, no other rendering's, no held or kept line; spaces and
line breaks aside, no character no Unicode stands for, each inside its line's erase rectangles), in the run's own face
(the typewriter's for `\texttt`), the pieces taking their runs in the source's order; with no such run (its ink on no line
of the unit, before its start, on a held line; a rendering that is not its source) the unit stays the original's. The
layer reads a placeholder that is a LaTeX text symbol by one table (`rules/text-symbols.mjs`: the maker's, with the two
straight quotes): it knew none of `\textbackslash`, `\textasciicircum` and `\textbar`, which the maker's had, and
neither side `\textquotesingle` or `\textquotedbl`, so that 256 units of 2610.19159 were left English for them as a
paper's own macros. The maker reads the same table (`layout/marks.mjs` re-exports it), so that it draws the two quotes as
text symbols too: a paper that writes either gets another layout file, which wants LAYOUT 8; none of the pack's papers
writes either.

**Recording the 30 outputs.** The gate's defaults hold 29 (`data/layer-fixtures`); the record's inputs name the 30th's
folders, and a `--record` that would drop an output the record's run of its kind holds (for a model run, the pixel run's
where the record has no model run of its own) is refused (`score.mjs droppedOutputs`). The record of 2026-10-15:

```
LAYER_RECORDS=lab/pdf/out/layer-gate/cut-p10-s2608/records LAYER_REFS=lab/pdf/out/layer-gate/cut-p10-s2608/refs \
LAYER_GEOMETRY=lab/pdf/out/layer-gate/cut-p10-s2608/geometry pnpm exec tsx lab/pdf/spikes/layer-gate.mjs \
  --tier=pixel --engine-kind=proto --proto-tex=lines --record --no-progress
node lab/pdf/spikes/gate-pack.mjs make --out=lab/pdf/out/gate-pack-s2608
```

### The per-unit erasure

Our final pass's pages wrapped by optional content, each unit's ink in groups of its own (`docs/PDF-READER.md` §19.9). The
synthetic cases and the Node gates run in CI (`tests/pdf-reader/layout-own.test.ts`, `layout-wrap.test.ts`,
`layout-wrap-cases.test.ts`); the pack's papers in Chromium are the lab's.

| File | When to run it | What it needs |
|---|---|---|
| `lab/pdf/spikes/ocg-gate.mjs` | After any change to `layout/own.mjs`, `layout/wrap.mjs`, the marks or what the delta copies, and before a pull request that touches them: per paper the wrap's counts, time and growth, the delta built from the wrapped bytes and its proof; in Chromium (`--canvas=gpu`, the production canvas, and `cpu`) every page's G1 (all groups ON is our page outside split glyphs and image edges) and G2' (text and labels OFF is the remover's cut of the same ownership, image-edge pixels counted on both sides). Reported, not gated; its run is recorded in `records/ocg-gate.md`. | The gate pack's fixtures (`--pack`, `data/fixtures/<id>-zh/arxiv.pdf` and `base.pdf`), each paper's source (`--sources`, `data/corpus/<id>/source.gz`), the heavy pair by `--pair`, Playwright's Chromium. No network, no Docker. |
| `lab/pdf/spikes/figure-gate.mjs` | After any change to `layout/figure-text.mjs`, the figures' groups in `layout/wrap.mjs`, pageInk's `turned` reading, `layer-proto/figure-fit.mjs` or the pgf points of `layout/marks.mjs`: per paper the figure units `wrapFinal` cuts and what became of each (drawn, crowded, a font of no Unicode, a form shared or written again, a page past its bounds), and on every page holding a drawn one, rendered by PDF.js in Node, G1 (every group shown is the page wrapped without the figures, split shows within the ocg gate's allowance), G3f (hiding the figures changes pixels inside their own bands alone), D (every drawn band loses its ink: no double ink), O (each band then blank: nothing a translation could cover) and R (each drawn unit's room, the free line beside its box a longer translation may take, then blank too); `--check` exits 1 on any failure. Beside them, the sets (`figure-text.mjs` setsOf: a legend's column, an axis's words) and the fit rule over the drawn units, label by label as BUNDLE 10 drew them against set by set (`figure-fit.mjs` fitFigureSet): labels drawn, at full size, sets of mixed sizes, sets resized; the translations a model of zh, or Microsoft's with `--mt=<file>` (`--mt-fetch` asks for what the file lacks, as the fixture maker does). Its run is recorded in `records/figure-gate.md`. | The gate pack's fixtures (`--pack`, `data/fixtures/<id>-zh/base.pdf` and `base.json`) or bases given (`--bases`, `<dir>/<id>/base.pdf`, figure-final.mjs's), each paper's source (`--sources`). No Docker; no network but with `--mt-fetch` (Microsoft's endpoint, the labels' texts alone). |
| `lab/pdf/spikes/figure-final.mjs` | To make a paper's final pass again under this engine's layout compile (the bases of a set made before a change of LAYOUT_TEX, such as LAYOUT 21's pgf points), for figure-gate.mjs. | Each paper's `source.gz` and `arxiv.pdf` (`--sources`), Docker with the pinned image. |
| `lab/pdf/spikes/ledger.mjs` | After any change to `layout/ledger.mjs`, `rules/content-classes.mjs`, `layout/own.mjs`, the marks or the front end's units: per paper the ledger of our final pass as `wrapFinal` makes it (each content class's share of the letters, the units' share, the orphan letters), and with `--rows` invariant (o)'s orphan lines (a paper's text: printed, never recorded); `--check=<n>` exits 1 where a paper's orphan letters pass n. Reported; its run is recorded in `records/ledger.md`. | The gate pack's fixtures (`--pack`, `data/fixtures/<id>-zh/base.pdf` and `base.json`), each paper's source (`--sources`, `data/corpus/<id>/source.gz`), bases given whole by `--pair=<id>=<base.pdf>` (no units: every unit's class the body's). No network, no Docker. |
| `lab/pdf/spikes/classes-gate.mjs` | After any change to how a content class becomes units (`source/latex-front.mjs`'s bibliography or author block, `rules/content-classes.mjs`, what `rows.mjs` sends, `layout/paper.mjs madeBibliography`) or to the marks of an entry: per paper, against the merge base's engine (`--base`, its `src/`), the units gained by kind (entries, places) and whether every other unit (the author block's names and places aside, counted apart) and every mark outside a bibliography is the base's; with `--made`, the job's `.bbl` BibTeX makes (one draft and BibTeX, as the web's sandbox answers it) and the paper opened again with it, as the prepare does; with `--compile`, the layout marks and the base page as production makes them (the year's pinned image, arXiv's day), the layout file and the wrap over it: each kind's units located, those the wrap leaves the original's, and G1 (all groups ON against the unwrapped page) on the entries' pages; with `--dump` and `--against`, a run of the base engine's (`--engine`) unit by unit against this one's: units lost, gained or moved, placeholders moved. Record: `lab/pdf/records/classes-gate.md`. | Each paper's folder (`source.gz`, and `arxiv.pdf` for `--compile`), the base engine's `src/`, and for `--compile` Docker with the year's pinned image (G1 is read by PDF.js in Node). No network. |

### The rules gate in CI

A change to the layout rule set (`src/pdf-reader/engine/rules/layout-rules.json`), or to the drawing code that reads it, is
measured on the fixtures when its pull request opens, and the set is published when it merges. The papers the fixtures are
made from are under arXiv's licence, so the CI job reads them from a private bucket and shows no page and no text of any:
its comment is numbers, fixture names and links that open the layer lab on the maintainer's machine.

| File | What it is |
|---|---|
| `.github/workflows/rules-gate.yml` | On a pull request (not from a fork) that touches the drawing closure, the gate or the pack: the pack restored, then the layer gate's model tier twice on one runner, the merge base's engine with its own built-in set and the pull request's with its own, then the verdict as one comment (`<!-- rules-gate -->`, edited in place) and its numbers as an artifact. 15 minutes. This is a measurement, not an end-to-end suite: Chromium runs on these paths alone. |
| `.github/workflows/rules-publish.yml` | On a push to `next` that changes `layout-rules.json`: publish to staging (environment `rules-staging`, automatic) and move its pointer; then the set measured on each live engine (below); then production (environment `rules-production`, whose required reviewer is the maintainer: one click), which stays off until the repository variable `RULES_PRODUCTION` is `on`. |
| `.github/workflows/rules-point.yml` | By hand: move a pointer to a version already published, on staging or on production (the same reviewer): the rollback. A production one first cancels the publishes that wait for the click (below). |
| `lab/pdf/spikes/rules-gate.mjs` | `run` (the gate's model tier in the production configuration, from the pack alone), `compare` (the verdict and the comment) and `engines` (the live-engines check). `tests/scripts/rules-gate.test.ts` holds its arithmetic on synthetic runs of numbers. |
| `lab/pdf/spikes/rules-publish.mjs` | The two writes of the web Worker's rules routes: publish the file (unless `--next=<ref>` holds a newer version), move the pointer. The secret goes into one request header and is never printed. |
| `lab/pdf/spikes/gate-pack.mjs`, `lab/pdf/gate-pack.json` | The fixture pack: made, restored by digest, verified. The JSON is its committed manifest. |
| `lab/pdf/compile-images.json` | The compile images pinned by digest, one entry a TeX Live year (`images`: TeX Live, the Debian base, Node, the apt snapshot and the TeX format's versions), and the `default` year a paper is compiled on unless it is routed (TeX Live 2025; the font coverage's). One value for the gate packs' made layouts and the web container. The base, Node and the snapshot are the same in every entry (one OS refresh moves them all), and each entry's `texFormat.texlive` is its year (`gate-pack.mjs` `compileImagesOf`). `gate-pack.mjs make --year=<year>` (default: the default year) refuses to run unless the local texlive image has that year's pinned digest and writes the pin with its year into the manifest (`compileImage`); `gate-pack.json` is the default year's pack (made before the year was written: its year implicit), `gate-pack.<year>.json` each other year's. `aptSnapshot` is the dated apt snapshot the web container installs from (`null` where none is pinned). |
| `lab/pdf/spikes/compile-image.mjs` | The one place the lab's Docker compiles name their image: the default year's pinned `texlive` by default, `COMPILE_YEAR` (`2023`) for another year's pin, `COMPILE_IMAGE` (a full `name@sha256:<digest>` reference, taken over the year) to compile in another, `COMPILE_PLATFORM` (`linux/amd64` to emulate on arm64) for docker's `--platform`, `NATIVE_TEX=1` for a compile by this machine's TeX Live through `native-tex/` (identity `native`, no image checked). `layout-paper-check.mjs --image` takes a digest reference alone. Its digest (and platform) is part of every compile cache key (`layout-make.mjs`, `layer-fixtures.mjs`, `layout-paper-check.mjs`, `layout-marks-gate.mjs`), so a cache made on another TeX Live simply misses, and each of these refuses to run unless the local image is that digest. The caches made before the identity was in the key are never read again; make them anew. `tests/scripts/compile-image.test.ts` holds it. |
| `lab/pdf/spikes/face-identity.mjs` | Whether each TeX Live face of the role table (`rules/font-roles.mjs` `FACES`) is the hosted bytes (`font-coverage.mjs` `METRICS`, the default tree's files) in every pinned tree: the reader draws a layout made on any tree with the hosted faces. One container a year (local, by digest, `--network none`; never pulled): each file found by kpsewhich and hashed there. Exits 1 where a face differs or is missing in a tree. `tests/scripts/face-identity.test.ts` holds its comparison. |
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

**The pack** is everything the model tier reads for the 30 outputs and nothing else: arXiv's PDFs, the layout files
(`layout.json`), the PIPELINE translations (`units.json`, `record.json`), the frozen reference text areas and the kept layouts
(`refs/`), the geometry, the faces (every non-CJK face of the role table, and of each CJK group the outputs' targets use its
Kai and the four weights the roles are built from), and the en and de hyphenation patterns. It is a file set laid out so that
the gate's own flags and variables read it: `--fixtures=<pack>/fixtures`, `LAYER_REFS`, `LAYER_GEOMETRY`, `AXT_DATA`
(`<pack>/data`, which holds `fonts/`) and `TEXMF_DIST`; `rules-gate.mjs run` sets them. Its manifest lists each file by path,
digest and size; its **digest** is that of the sorted listing, the same on every make (the clock is not in it, and every file
is written with its mtime at the epoch). Its outputs are its frozen references (`refs/<output>/ref.json`), the set the gate
itself requires: a make fails, naming each file, when any other file of one of them is missing, so an output cannot drop out
unseen; and the verdict holds both runs to that set. The manifest also names the layout files' version (`layout`: the `schema`
and `layout` fields every `layout.json` carries; the reader refuses a file of another schema and takes `layout`, the maker's version, as a version token only): a make fails unless all of them are the
engine's own (`layout/file.mjs`, `LAYOUT_SCHEMA` and `LAYOUT`), and `tests/scripts/gate-pack.test.ts` holds the committed
`gate-pack.json` to the engine's, so a pull request that moves the layout file cannot pass `pnpm test` with the pack as it was.

Since BUNDLE 8 (the layer route's step 2, `docs/PDF-READER.md` §19.7) a layout file is made over **our base page**, the final
pass of the marked original, not over arXiv's PDF, and the pack holds that page beside it: `fixtures/<output>/base.pdf` and
its record `base.json` (`layer-fixtures.mjs` makes both as production does: the final pass on the pinned image, on arXiv's day,
checked by the page pass's own `checkOurBase`). The record names the page's digest and the layout file's, and a make checks the
three against each other (`gate-pack.mjs` `baseRecordOf`), so a layout file is never packed beside another page than the one it
was made over. The layer gate draws every output over its `base.pdf` wrapped by optional content (its draws and its bundle's base are
made over it too), arXiv's PDF where a fixture has none (no marks: never wrapped), and `arxiv.pdf` stays the left's. A paper production would refuse a base
page of ours would keep the layout file the pack held before, made over arXiv's PDF, its `base.json` saying why
(`source: 'arxiv'`, outside the version check); in the pack of 2026-10-24 (`13785c79`, LAYOUT 20: `435d19bd`'s base pages and layout files, the layout files' version aside; `435d19bd` LAYOUT 19, each base record with its marks' texts: the marks of LAYOUT 17 and the unit refusals of 18, each unit laid only where every page it is on is arXiv's page, the same words) every one of the 7 papers has ours, each made on the tree production compiles it on (`base.json`'s `image`: the year its 00README declares, else that of arXiv's build; 2307.16209, 2608.16117 and 2609.26457 on TeX Live 2023).
The pack of 2026-10-25 (`927cec93`, LAYOUT 22, stage 4's references) is `09208b43`'s (#469's figures) with each output's
`base.pdf`, `base.json` and `layout.json` made again by the engine (`layer-fixtures.mjs --offline --layouts-only`, each paper on
its base record's year; the same maker over the merge base's engine makes `09208b43` again, digest for digest), every other file
its own bytes: the instrument is the same, so the rules gate measures the two engines on their own packs
alike. A bibliography's entries are numbered after the source's other units, so every unit the frozen records name keeps its
number, and its rows in the layout file are byte for byte the ones before (the font table gains the entries' faces at its end);
the entries' units have no translation in the pack, as the gates' run hides them (`TOGGLE_DEFAULTS`).
The pack of 2026-10-28 (`690d0e19`, LAYOUT 23, the label rows the wrap's ownership gives) is `927cec93`'s with each
output's `layout.json` and `base.json` made again the same way: every base page is byte for byte the one before, and every
layout file differs from the one before in its version alone (the pack's layout files hold no ink unit, and none of its papers
sets a head's closing punctuation after a note that ends in a citation). 14 new objects.
The pack of 2026-10-28 later (`7edfbd6f`, LAYOUT 24: each entry one unit, an author block's places units of their own, the job's
`.bbl` BibTeX makes) is `690d0e19`'s with each output's `layout.json`, `base.pdf` and `base.json` made again the same way, every other
file its own bytes (the translations, references and geometry: the instrument is the same; the layout files of 23 and 24 differ, so
each side of the rules gate reads its own pack). Every unit the frozen records name keeps its number; an entry's units and an author
block's places cut apart are numbered after them, with no translation in the pack: the entries hidden by the gates' run, the
places not in the frozen references. The base pages are pixel for pixel `690d0e19`'s on 6 papers and 2 pixels apart on one page of
2609.26457v1 (its text items in the same places); 2608.16117v1 gains the 81 entries of the `.bbl` BibTeX makes. 21 new objects.
Its review round's (`0b3109a8`, LAYOUT 24 still) is `7edfbd6f`'s with 2608.04322v1's seven outputs made again: its note's e-mail,
`zhou\_qianli@nwpu.edu.cn`, is one placeholder where its `\_` had parted it, so its layout file's rows of that note and its base
page's marks change; the base page's pixels are `7edfbd6f`'s. 3 new objects.
The pack of #486 (`e8e9eeb5`, LAYOUT 24 still) is `0b3109a8`'s with 2608.16117v1's two outputs (de, zh) made again: the probe now
knows its .bbl's `\URLprefix`, so the `\url` after it in its entries is marked, and an entry's `\DOIprefix\doi{…}` is parted
(`docs/PDF-READER.md` §19.7, the look-ahead pairs): their layout files' rows of those entries and their base pages' marks change,
the base pages' pixels are `0b3109a8`'s; every other output's files are its own bytes. 3 new objects.
Like the layout files, the base pages and their records are no instrument (`instrumentOfPack`).
The wrap reads each base's units from its paper's source, so the pack holds that too: `sources/<paper>/source.gz`, one a paper
(`gate-pack.mjs make --sources=<dir of <paper>/source.gz>`, `data/corpus` by default; a make with a base of ours and no source
fails, naming it). The rules gate passes the layer gate `--sources=<pack>/sources`. In the pack of 2026-10-23 (`d65ecd41`) the 7
papers' sources are the only new objects over `c10eafbb`; the sources are an instrument of their own part (`instrumentOfPack`
`sources`). An engine from before REMOVAL 8 (the merge base of the pull request that wrapped the page) is drawn over the same
wrapped page with its own erase and put back, and without cell rules, which it reads only from the add-on this instrument no
longer makes.

Remaking it, on the machine that holds the data (after the fixtures are made again, a PIPELINE moves, the layout file moves,
or the faces change; `rules-gate.mjs compare` warns when the engine's PIPELINE is not the pack's). A pull request that moves the
layout file makes the fixtures again with its engine (the layer gate's `--layouts=made`), re-makes the pack and uploads the new
objects, before its CI can pass: the gate restores the committed `gate-pack.json`, and an object that is not in the bucket is a
404 there.

```
node lab/pdf/spikes/gate-pack.mjs make        # lab/pdf/out/gate-pack/, and lab/pdf/gate-pack.json; its inputs (the made fixtures, the
                                              # translations, references and geometry) are those `lab/pdf/records/layer-gate.json` names
node lab/pdf/spikes/gate-pack.mjs objects     # the objects to upload, once each: key, size, digest, local path
```

The objects are content-addressed (`gate-pack/<sha256>` in the bucket `readarxiv-ci`, which has no public access; the same bucket
holds the pinned test fixtures as `fixtures/<sha256>`, tests/fixtures/README.md), so the outputs of one paper share one, and an
upload is each distinct digest once. In CI `gate-pack.mjs restore` reads each from
R2's S3 API, SigV4-signed with the key derived from the read-only token (`READARXIV_CI_TOKEN`; its id, asked of Cloudflare's
token-verify endpoint, and the SHA-256 of its value), checks it against the manifest and writes it; and `verify` checks every
file again before the gate reads any. A fork's pull request has no token and runs no job.

**Each side runs on its own commit's pack.** A pack is made by an engine (its layout files are that engine's), so the gate restores
two: the pull request's, from its `gate-pack.json`, and the merge base's, from the merge base's own `gate-pack.json` with the merge
base's own script. One pack serves both sides while the layout file's schema and version (`layout` in `gate-pack.json`) are the same
in both, as before: the base's engine reads the pull request's pack, and any other change of the pack is measured on the one pack.
Where they differ the pull request that re-makes the pack uploads the new objects before its CI can pass, and the two runs are one
instrument by what their packs hold, not where they are: `rules-gate.mjs run` stamps each run's `fixtures`, `refs`, `geometry`,
`data`, `texmf` and `sources` (where the pack has them) with the digests of those parts of the listing of the `gate-pack.json` it was given (`--pack-json`, the one
`verify` checked the directory against), the made layout files excluded. Another reference, geometry, PDF, translation, face or
pattern between the two sides is then another instrument and fails; so does a different set of outputs, so a pull request that
moves the layout file does not also add an output or refresh the references: those go in their own pull request, where the layout
version is unchanged and the one pack serves both sides.

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
| Repository secrets | `READARXIV_CI_TOKEN` | an R2 API token (R2 → Manage API tokens → Create Account API token, Object Read only, this bucket only, with an expiry), rotated before it lapses: any process of a job that references a secret can read it, and the pack is on the runner's disk for the same code, so the token is worth only its lifetime (the next pack). One secret serves both readers of the bucket, `ci.yml`'s fixtures fetch and the rules gate (`rules-gate.yml`, and the live-engines check of `rules-publish.yml`): no environment holds a copy, which at a rotation would shadow the repository's and leave one reader on the lapsed token |
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
| `lab/pdf/spikes/highlight-gate.mjs` | After any change to `pipeline/anchors.mjs`, `view/highlight.mjs`, `view/shapes.mjs`, `view/floats.mjs`, `view/figures.mjs` or how sentences are made. Exit 1 when a count moves from the baseline, and when a side's layout made page by page from its parts and left parts (`highlight-pages.mjs`, in a shuffled order) differs from the one made whole in any page's geometry or sentence shape; `WRITE_BASELINE=1` records a change that was meant. | The ten papers' runs and the ground truth (`data/runs/highlight-ten`, `data/runs/highlight-gt`), their sources and arXiv's PDFs (`data/corpus`), and the Microsoft answers their sentences are made again from (`out/highlight/B3/ms-cache-zh-auto.json`, `ms-cache-zh-en.json`). A missing set fails the gate. |
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
| `lab/pdf/spikes/layout-marks-cases.mjs` | Alongside it: small documents compiled natively, each a way a mark could move a line. Exit 1 on a failure. `ONLY=lost` the LOST survey's: an inline formula first after a display, a display group, displays at a page's foot. `ONLY=runin` the run-in leads' (stream F): a heading the class runs into its paragraph, then a formula or a reference first in it, which owns its own glyphs and not the heading's (`\axt@hold`). `ONLY=dvi` the DVI cases: every document that stays and every stream case under `latex` (arXiv's DVI compiler, the DVI made a PDF by dvipdfmx, the marks its specials), judged by TeX's own DVI (dvitype, every character and rule to the sp) where dvipdfmx draws a glyph with no special before it by its own reckoning (up to 0.35 pt: a note). `NATIVE_TEX=1` compiles with this machine's TeX Live (the shim's `NATIVE_TEX_BIN`, `NATIVE_TEXMFLOCAL`, `NATIVE_TEXMFVAR`): there TinyTeX's pdfTeX gives cmex's big operators and delimiters raw codes (∑ as P), which case A (pdfLaTeX) then reports, the image's does not. | Docker, or a native TeX Live. |
| `lab/pdf/spikes/layout-marks-compare.mjs`, `layout-marks-compare.d.mts` | The gate's judgements, pure; `tests/pdf-reader/layout-marks-gate.test.ts` tests them. | — |
| `lab/pdf/spikes/unit-hash-diff.mjs` | After a change that may cut a paper's units otherwise (the front end, PIPELINE): each paper's units opened by two engines (`--old`, `--new`, two checkouts of the repository), their `sourceHash` lists compared, the units a new engine keeps carried from a stored translation and the rest asked again. `node lab/pdf/spikes/unit-hash-diff.mjs --old <engine root> --new <engine root> <paper>/source.gz…`; per paper `same` or `changed` with each changed unit's index at either engine, its kind and first words; exit 1 where a paper changed or failed to open. | The papers' `source.gz` files. No network, no Docker. |
| `lab/pdf/spikes/layout-make.mjs` | To run the layout maker on the researched papers, end to end, against the bars of `lab/pdf/records/layout-maker.md`. | The papers' sources and PDFs in `data/layout/`, Docker. |
| `lab/pdf/spikes/cm-check.mjs` | After any change to CM (`layout/paper.mjs` with `converge`) or to the compile contract's `draft`/`files`: today's layout compile against CM in one native TeX Live, the marked PDF, marks file and layout file compared byte for byte, CM's record and each compile's CPU printed; it is the reference host of `draft` and `files`. `--corpus`, `--layout`, `--runs` as its header says; exit 1 on a difference or a refusal. | The papers' sources (and arXiv's PDFs for the layout) in `data/layout/` or `data/corpus/`, a native TeX Live (`NATIVE_TEXMFLOCAL`, as its header says). No Docker, no network. |
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
