# The CI tiers: the plan

What each tier of `pnpm release-check` (`lab/release-check/run.mjs`, the gates in `lab/release-check/gates.mjs`) must run,
where, on what inputs, in how many minutes and with which secret, written so that each job becomes one workflow file.
The workflows themselves are not written here. Times were measured on 2026-11-07 at `13216ac44` on the maintainer's
machine (Apple silicon, 14 cores, 48 GiB) unless a row says otherwise; a hosted runner (4 vCPU for a public repository)
is taken as about twice as slow on the CPU-bound steps.

| Tier | When | Runner | Command | Minutes a run | Secret |
|---|---|---|---|---|---|
| fast | every pull request and every push to `next`, `main`, `rebuild/v2` | GitHub-hosted `ubuntu-latest` | three jobs (below) | 14 wall clock, about 28 of runner time | the fixtures' read token (exists) |
| full | every merge into `rebuild/v2` (later `next`), newest first | self-hosted, the maintainer's machine, with the lab data | `pnpm release-check --tier full --work=<external disk>` | 26 (measured), 16 for `display` and about 9 for `perf-batch`, one runner; 110 at `6b91f86ff` (2026-11-13, a shared machine, `perf-batch` skipped), `display` 51 of them in both modes | none |
| release | before a release, by hand (`workflow_dispatch`) | self-hosted, the same machine | `pnpm release-check --tier release --online --work=<external disk>` | about 80, and 100 to 130 for `perf-release` | none here; the private repository's own |

## fast: every pull request (hosted)

Nothing of the lab's data, no network but the install's and the fixtures' fetch, no Docker. On this machine at
`13216ac44` every gate of the tier passes but `e2e:small-caps` (below), so `--tier fast` says NO-GO and names it.

**Job `check`** (exists: `.github/workflows/ci.yml`, unchanged): `pnpm install --frozen-lockfile`, `pnpm typecheck`,
`pnpm lint`, `pnpm build`, the fixtures (`node scripts/fetch-fixtures.mjs`, with `READARXIV_CI_TOKEN` and the cache keyed by
the manifest), `pnpm test`. The contract tests (`tests/contract/`) run inside `pnpm test`; release-check runs them again as
their own line of the report (1 s). 5 to 8 min a run on the hosted runner (five runs of 2026-11-07).

**Jobs `reader` and `extension`** (new, beside `check`, no secret), each: `pnpm install --frozen-lockfile`; Playwright's
browsers (`pnpm exec playwright install --with-deps chromium`, and `firefox webkit` in `reader` for `e2e:small-caps`; the
browsers cached by the lockfile's Playwright version); `pnpm build`; then

```
reader:     pnpm release-check --tier fast --only=harness,e2e:small-caps
extension:  pnpm release-check --tier fast --only=e2e:reader,e2e:framing,e2e:a11y,e2e:viewer,e2e:registration
```

and the report (`lab/release-check/out/fast/`) kept as the run's artifact. With `--only` the verdict is those gates'. The
scripts run headless (Playwright's `chromium` channel, which loads an extension), so no display is needed. The heavy slot
is the maintainer's machine's alone; where it is absent the gates run directly. Times here:

| Gate | Here | Hosted, estimated |
|---|---|---|
| `typecheck`, `lint`, `build` | 3 s, 2 s, 3 s | in `check` |
| `test` (vitest, 566 files, 9,075 tests) | 146 s | in `check` |
| `contract` (tests/contract: 2 files, 98 tests) | 1 s | in `check` (inside `pnpm test`) |
| `census` (lab/release-check/census.mjs: the complexity and debt census, design §7's census rows; measured 2026-11-12 at `75602aecb`) | 6 s this tree alone; 20 s with today's engine and the website's two trees (its profile in the lab's notes) | in `check`, this tree alone: `node lab/release-check/census.mjs --no-today`; judged by its ratchet (census-ledger.json): a measure above the last integrated round's value fails, naming the entries that added to it; the measures that need the website's tree (AFTER, dead modules and exports, ported files reached) are skipped there with their reason |
| `harness` (packages/reader/e2e/run.mjs: 49 checks at `13216ac44`, 82 at `cee3bd8f9`) | 109 s | about 4 min |
| `e2e:small-caps` (three browsers) | 46 s | about 1.5 min |
| `e2e:reader` (158 checks at `13216ac44`, today's reader's; since the extension reads through the rebuilt reader by default, 81 on the default build: `tests/e2e/reader-v2.mjs` and `reader-v2-layer.mjs`; today's 159 run in the full tier, `e2e:reader-today`) | 177 s | about 6 min |
| `e2e:framing` (22) | 65 s | about 2 min |
| `e2e:a11y` (15) | 44 s | about 1.5 min |
| `e2e:viewer` (20) | 6 s | under 1 min |
| `e2e:registration` (84 at `13216ac44`, today's reader's; on the default build `tests/e2e/registration-v2.mjs`, the rebuilt reader's, 74 at `6b91f86ff`; today's in the full tier, `e2e:registration-today`) | 55 s | about 2 min |
| the three jobs | 11 min in all, serial | `check` 5–8 min (measured), `reader` about 7 min, `extension` about 14 min with install and browsers: 14 min a pull request's wall clock, about 28 min of runner time |

**Not green at `13216ac44`: `e2e:small-caps`.** Its page loads today's layer modules from the tree as they are, in the
browser, and since stage 1a (29df59fff, b94bca203: `pageInk`, `wrapOf` and `planOf` moved into `packages/engine`) today's
layer imports `@readarxiv/engine` by its bare name, which a page without a bundler cannot resolve ("Failed to resolve module
specifier"): the page never reports ready and the script times out. Every other gate of the tier passes. The fix is the
script's (a bundle of what its page loads), and the `reader` job is turned on after it. Fixed since `38c9062b8` (the page's import
map resolves the packages the engine imports by name, `lab/pdf/packages-route.mjs`).

**Rules gate** (exists: `.github/workflows/rules-gate.yml`, path-filtered on today's engine): unchanged until today's
engine is deleted at the cut-over.

## full: every merge into the rebuild branch (self-hosted, with the lab data)

The corpus replays need what the repository may not hold: arXiv's papers under their licence, the cached compiles, the
frozen baseline and the tap (the lab-data directory, `AXT_LAB_DATA`), some on the external disk. So a runner on the
maintainer's machine, registered to this repository alone, with labels `self-hosted`, `macOS`, `ARM64`, `lab-data`.

- **Trigger**: `push` to `rebuild/v2` only (a merge), never `pull_request`: a self-hosted runner on a public repository
  must not run a fork's code. `concurrency: { group: full, cancel-in-progress: true }`: a burst of merges is judged once,
  at its newest.
- **Command**: `pnpm install --frozen-lockfile && pnpm release-check --tier full --work=<a directory on the external disk>`
  (a corpus run writes about 400 MB; the corpus runners refuse a paper under 12 GiB free, and release-check reports such a
  gate as skipped, never passed). The report is the run's artifact; the run fails on NO-GO.
- **Inputs**: `$AXT_LAB_DATA/refactor-2026-11/` (`baseline/`: the frozen dumps, `acceptance.json`, the tap;
  `lanes/L1-papers88.tsv` and the added pairs' papers (`baseline/added/papers.tsv`, `lab/typeset/added.mjs`), written as
  one list into the work directory (`papers.mjs`), and the compile caches, partly on the external disk: the corpus the
  integration round's stage 1a runs, with its flags (`--prove`, `--baseline` = the baseline's prepare dumps), a run and its
  twin alike. The caches are `RELEASE_CHECK_CACHES` (a list of directories, or a corpus run's `flags.txt`, whose `--caches=`
  line is the chain that run read: at a round's head, the round's own run, whose chain names the added papers' compiles
  too, e.g. `lanes/converge-8/r23d-two/flags.txt` at `cee3bd8f9`), else `lanes/L1-caches88.txt`: a round whose marks move
  fills new compiles into a directory of its own, and the list must name it, or every paper is "missing a compile" (exit 3;
  at `75602aecb` all 87, the list predating the rounds' chain; at `cee3bd8f9` the list is round B14's, so the full tier is
  run with the round's `flags.txt`); `lanes/L3/replay/`: the typesetter's derived inputs; `lanes/L6/capture.jsonl`: today's
  readers' replies; `lanes/cjk-punct/blast/pairs.txt`: the 90 pairs of the stored rows the rounds' reader gate walks;
  `google-rows/ef6989debed1` and `lanes/converge-7/tools-b15/{google-rows.mts,rows-register.mjs}`: the lab's Google store
  and the rounds' tools that read it through the tree's chain and lay the reader gate over it; `baseline/corpora/papers.json`:
  the harness's corpus papers, opened from this run's bundles); today's engine at `065c1d973` checked out beside the
  worktree (`AXT_TODAY`); the release sweep's cache and the reader's served faces, which the typeset runners read
  (`AXT_SWEEP_CACHE`, `AXT_FACE_TABLES`, `AXT_FACE_SLICES`); Playwright's Chromium; for `perf-batch`, the website's tree its
  reader is built in (`PERF_WEB`, a website worktree: its HEAD with this commit as `vendor/readarxiv`) and the round's box
  image (`PERF_NEW_IMAGE`). Docker for `perf-batch` alone (a compile no cache holds is a failed paper: exit 3).
- **Minutes**: 26 of the gates' own on this machine at `13216ac44` (below; the heavy slot's waits for other lanes' jobs left
  out), and 16 for `display` (measured at `a7a6e4097`); no hosted minute. At `6b91f86ff` (2026-11-13, the machine shared with a
  round's gates, loads 4 to 146): 110 in all, of them `display` 51 (both modes, the added pairs apart), `reader-parts` 11,
  `prepare-same` 10, `harness-lab` 9, `prepare` 8, `sentence-cover` 6, `pnpm test` 2.5, `e2e:reader-today` 3.
- **Secret**: none. The job reads no network.

| Gate | Here |
|---|---|
| the fast tier's gates | as in fast (about 11 min) |
| `prepare` (87 papers from cached compiles, PDF.js proofs) | 184 s: pass, proofs (a) and (c′) 0 on every page |
| `prepare-diff` (the differential against the frozen baseline) | 1 s: pass, shown 37,793 → 38,146, lost 0 (+3 accepted), gained 356 |
| `prepare-same` (the prepare again, object by object) | 188 s: pass, 2,692 of 2,692 objects, 87 of 87 dumps |
| `translate-equivalence` (recorded replies) | 1 s: fail at `13216ac44`, 3 disagreements of 6,228 |

The translation equivalence counts a difference of a class the package's owners accepted as compared (its rows
`accepted`), and passes on the tool's own exit with no other disagreement: with those rows merged, its failure above is the
class they name (the `#` of its own, 3 replies) and the gate passes.
| `typeset-today` (today's members, the reader's differential) | 39 s: pass, 32,035 laid as the baseline, changed 12; I3 160, I4 0, I5 0 |
| `sentence-cover` (this run's parts laid by the entry over the stored rows, the reading from the part: invariant I10; and I6 across the pages' lays, each unit begun on a pass page laid alike by every page's lay that holds it, the head pass's known cause counted apart) | 229 s: pass at `2d33bf467` over round 8 B5's parts, I10 0 in 4,767,634 pieces of 63,614 member-pages (123 pairs); `gate-l1.mjs --entry` under today's reading lays no entry and is refused |
| `typeset-data` (generated data, today's readings derived again, the lab's tests) | 7 s: pass |
| `reader-parts` (this run's parts laid by the entry over each rows store, the door's and Google's, the 90 pairs of the stored rows and the added pairs apart, as the round's reader gate: I3 read by ink, I4, I5; the page's layout, design §7) | 641 s: pass at `6b91f86ff`, the 90 pairs' lines identical to round RB1's on both stores (door: 24,056 laid alike, 244 not; I3 3, I4 0, I5 2; I10 0 in 3,145,597 pieces; Google: I3 3, I4 0, I5 2), at its record (`reader-parts.json`); the rows 32,833 units, Google 32,247, Microsoft 569, none unavailable |
| `harness-lab` (the harness with five corpus papers, their bundles this run's) | 340 s: fail at `13216ac44`, 75 of 79 (on lane L1's bundles then); 118 of 118 at `cb10a1f7d`; 523 s: fail at `6b91f86ff`, 121 of 122, the overlay's weight check on 2609.26457v1 (its page-1 overlay measured one text, the title in its own colour, at no ink), the same on lane L1's bundles: not the bundles' |
| `build-today`, `e2e:reader-today`, `e2e:registration-today` (today's reader, the way back until the cut-over: a build of its own from this commit, `AXT_READER=today`, apart from the checkout; its own checks on it, refused where the build carries the rebuilt reader) | 6 s, 169 s, 54 s: pass at `6b91f86ff`, 159 of 159 and 84 of 84 |
| `display` (display ≥ today: no page worse than today's, a difference only where nearer the original; under the default options and with every switch on, as the round judges it; today's rows checked production's first, `lab/typeset/parity/production-rows.mjs`; **a cut-over blocker**) | 16 min (v2's lay 15 s, the drawing 954 s for 344 pages with the machine shared, the verdict 10 s): fail at `a7a6e4097`, 326 of 344 pages worse than today's: the links (246 pages) and the highlight's sentence boxes (324) the entry does not state yet, and on 115 pages another measure (turned figure texts drawn upright 18 pages, lines across a rule or over a neighbour 16, sizes 36, anchoring 15, run-in gaps 11, translations missing 7 and figure texts 20) |

**Retired (2026-11-13, design 3i).** `typeset-parts`: its runner, under today's reading, lays only units whose id is
today's, and the owner's rulings cut units otherwise on purpose: its losses counted the runner; `reader-parts` holds I3, I4
and I5 as the reader draws, and "nothing lost" is held by `prepare-diff`, `display` and `sentence-cover`. `typeset-replays`:
the replays compare internal passes with today's recorded ones, so every ruling would have to be taught to four readers the
cut-over deletes, and a pass that differs is not a difference a reader sees; `display-wide` (release tier) asks the owner's
question over every pair. Their reasons stand in `gates.mjs` (`RETIRED`), the report lists them, and naming one to `--only`
says why. Their tools stay runnable in the lab until the cut-over deletes them with today's engine.

**Today's rows are production's.** Today's side of the display gates lays the release's stored rows. Rows made by a lab
replica of production's path stood in for production's on the two added pairs until 2026-11-13 (each unit's row, no
`layerRows`: 11 rows production keeps were translated). So each display gate first checks, pair by pair, that production's
own row path (today's engine's `layerRows` over the release's units and the stored rows) gives every stored row back, a
kept row by its state (`production-rows.mjs`, about a second for 92 pairs); a pair whose rows it does not give back fails
the gate, named, and the parity is still measured beside it.

**Cut-over blockers.** The maintainer's base threshold for the refactor: v2's display equal to or better than the
production site's, and performance, complexity and debt improved. `display` (`lab/typeset/parity/`, its README) is the
display part: every page of 22 corpus papers drawn by today's reader and by v2's with the same rows, each measure a distance
from arXiv's page, and a page fails where v2 is farther from the original than today on any measure past its noise floor (a
translation today shows and v2 does not, always). A gate marked `cutover` in `gates.mjs` keeps the report's cut-over
verdict (`release-check.md`, "Cut-over") NO-GO until it passes, whatever the tier's verdict; a tier that does not run it
says so.

The private repository's platform tier (its whole local gate: the Worker, the paper's object and the Workflows under
workerd, the routes' contract suite) runs on every pull request there, on its own runners; release-check names it in this
tier's report and does not run it.

**Performance, every batch: `perf-batch`** (lab/release-check/perf.mjs judges; the lab's `perf/tools/run.mjs --mode=batch`
measures). NEW's reader is built from the commit judged, first (`perf/tools/build-new.sh`: the website's tree `PERF_WEB` at its
HEAD, this commit as its `vendor/readarxiv`, built as staging builds it, into the work directory): no build made before stands
in for the head's, and without `PERF_WEB` the gate is skipped and says so. NEW's prepare in the round's compile image
(`PERF_NEW_IMAGE`; one paper, three times, each in a container of its own sized as the box:
one CPU, 3 GiB, no network, the amd64 image under this Mac's emulation, a warm box) and its reader on that build
(three papers, three visits each after a warm-up, in Chromium, offline, every request served from stored data); every measure
against the last round recorded (`perf/rounds/`, the newest that passed or was accepted), worse only past the two rounds'
run-to-run spreads added (the speed check's rule; an exact measure such as bytes or TeX's passes past its 0.5 % tolerance); a
measure the round could not take fails it. It holds only the slots of its own kinds, each while its part runs (the docker slot
for each prepare, the only one of its kind; one e2e slot for the reader; one test slot to remake the rows), under the machine's
ordinary load: no integration round can give it the whole machine, so its spreads are that load's and its judged measures lean
on what load moves least (TeX's passes and compiles, bytes, CPU seconds, the main thread's task time) beside the wall times,
which the same rule judges only by large moves. About 9 minutes and the waits for its slots; it uses Docker (the round's box
image, PERF_NEW_IMAGE) where the rest of this tier does not. A regression understood is recorded with `--accept` so that the next
round is compared with it. A repetition that holds a visit whose longest task outlasted the rest of its own scroll (the scroll's
measured duration less that task: perf.mjs `stallOf`) measured the machine, not the reader: it is void and run again before the
round is recorded; void twice in a row, the round ends as "the machine could not measure" (the run's exit 3), which the gate
reads as skipped, never as a pass, and records nothing. A round recorded before the rule with such a repetition is marked
`void` in its record and is never a base.

**Cut-over blocker: `perf-release`** (the release tier): TODAY (production's release) against NEW on every measure, on papers
chosen by a stated rule from the 90 pairs, the same stored translation on both sides, each side measured by one instrument
(lab data `perf/README.md`): the reader (six papers, three visits a side, interleaved), the language switch (three papers), the
prepare (the same six papers, three times a side, interleaved paper by paper), a re-prepare with the stored instrument; it fails
where NEW is worse than TODAY on any judged measure past the spreads, or a measure is missing. About 100 to 130 minutes holding
every heavy slot of the machine (`perf/tools/quiet.sh`): run only in a window the coordinator gives.

## release: before a release (by hand, the same machine)

- **Command**: `pnpm release-check --tier release --online --work=<external disk>` (the speed check's base
  `RELEASE_CHECK_BASE`, else the last release's tree, today's engine at `065c1d973` as the other gates reading it take it:
  `AXT_TODAY`, else `.worktrees/refactor-read` beside this one; `PACK` the layer gate's fixture pack at the digest
  `lab/pdf/gate-pack.json` names, else `lab/pdf/out/gate-pack`: the speed check's driver, run with zsh, measures, and its
  verdict is `speed.mjs`'s over the driver's logs, PASS alone a pass). The speed check measures `src/pdf-reader/engine`,
  which the extension's reader runs until stage 5 moves it to the reader package; the performance gates measure the
  website's readers. It goes with today's engine at the cut-over.
- **Adds to full**: `display-wide`, the display gate over every pair of the stored rows (the 90, about 2,300 pages, the
  default options; today's rows checked production's first; about 2.5 hours of browser slots, an estimate from 954 s for 344
  pages, so overnight, once per candidate; **a cut-over blocker**: a page it leaves uncovered is fixed, shown to be a
  measure's artefact, or brought to the owner); the prepare's pixel proofs on every page of the 88 papers and the added pairs' (poppler's `pdftoppm` and `pdftocairo`); the
  reader's canvas on spike S1c's papers (Chromium); today's engine's speed check against the last release; the online scripts (`pnpm build:staging`, then `e2e`, `e2e:pdf`, `e2e:floating`, `e2e:popup`, `e2e:layout`,
  `e2e:local-endpoint`, `e2e:image`) and the live placeholder run (`e2e:placeholders`), each under the project's
  User-Agent and never against our production server (`tests/e2e/lib/online.mjs`); performance ≥ today (`perf-release`,
  above: a cut-over blocker).
- **The private repository's gates**, named in the report with their commands there and never run here: its platform
  tier; the security suite of its compile jail on native amd64 (invariant I9); the corpus through its prepare, byte for
  byte the lab's (I6); its website's reader e2e (I8); the staging soak's measurements (design §7's prepare times and the
  rows' reuse) and the release sweep. A result of theirs for the release candidate is written into the private gates' file
  (`--private`, `result: { status, commit, date, evidence }`, `commit` being this repository's commit that run was made
  against); without it each stays NO-GO, and a result recorded at another commit than the candidate's is stale, a NO-GO
  naming both, so the release verdict can be GO only with that repository's evidence for this very commit.
- **I7 keeps the release NO-GO until it has a gate.** An invariant no gate holds is NO-GO by design (no gate is weakened
  and none is invented here), so with every gate passing the release tier still says NO-GO and its report says why: that
  is the runner telling the truth, not a fault in it. Today I7 (a unit's boxes the same on both panes) has no gate.
- **Minutes**: about 80 in all. Measured here: the full tier's 26; the pixel proofs 25 (pass: every page of the 87 papers,
  2,328, all groups on is arXiv's page under Splash and each kind off changes only its ink under Cairo); the canvas 2 (fail
  at `13216ac44`, as lane L1's own GPU run: 9 of 12 papers over the bound in the GPU canvas, 27 pages with pixels outside the
  split glyphs). Estimated from the lanes' records: the speed check about 12, the online scripts about 15. No hosted minute.
- **Secret**: none for this repository's gates (the free engines need no key; an LLM service in the placeholder run would
  take its key from the browser's settings, never from CI). The private repository's own: the registry's read-only
  credentials to pull its frozen base image (the security job), and a read token for the staging soak's analytics.

## Costs

GitHub Actions minutes on standard hosted runners are free for a public repository, so this repository's tiers cost no
money: `fast` takes about 15,000 runner minutes a month, counted and not billed (about 180 pull requests a month into
`next` over the last 30 days, about three runs each for a pull request's pushes and fix rounds: about 540 runs at about
28 minutes, the three jobs together); `full` and `release` run on the maintainer's machine. The private repository pays for its hosted minutes beyond
its plan's included ones (2,000 a month on Free, 3,000 on Pro and Team, at the time of writing; Linux x64 billed per
minute beyond that, about $0.006 to $0.008, to be read from the billing page before deciding): its platform tier on every
pull request (its tests took 63 s on this machine, its typecheck, lint and build besides: on a hosted runner about 8 to 10
min a run, an estimate), and the native amd64 security job, nightly and on a change to the compile jail (about 30 to 40
runs a month at its 60 min bound; an estimate of 15 to 25 min a run, the image from the cached base then the suite, 105 s
of tests under emulation): about 600 to 1,000 minutes a month.
That is design §9's decision 5: these minutes on hosted runners, or a second self-hosted runner on amd64.
