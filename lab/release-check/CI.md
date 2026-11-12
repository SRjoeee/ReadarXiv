# The CI tiers: the plan

What each tier of `pnpm release-check` (`lab/release-check/run.mjs`, the gates in `lab/release-check/gates.mjs`) must run,
where, on what inputs, in how many minutes and with which secret, written so that each job becomes one workflow file.
The workflows themselves are not written here. Times were measured on 2026-11-07 at `13216ac44` on the maintainer's
machine (Apple silicon, 14 cores, 48 GiB) unless a row says otherwise; a hosted runner (4 vCPU for a public repository)
is taken as about twice as slow on the CPU-bound steps.

| Tier | When | Runner | Command | Minutes a run | Secret |
|---|---|---|---|---|---|
| fast | every pull request and every push to `next`, `main`, `rebuild/v2` | GitHub-hosted `ubuntu-latest` | three jobs (below) | 14 wall clock, about 28 of runner time | the fixtures' read token (exists) |
| full | every merge into `rebuild/v2` (later `next`), newest first | self-hosted, the maintainer's machine, with the lab data | `pnpm release-check --tier full --work=<external disk>` | 26 (measured), and 16 for `display`, one runner | none |
| release | before a release, by hand (`workflow_dispatch`) | self-hosted, the same machine | `pnpm release-check --tier release --online --work=<external disk>` | about 80 | none here; the private repository's own |

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
| `harness` (packages/reader/e2e/run.mjs: 49 checks) | 109 s | about 4 min |
| `e2e:small-caps` (three browsers) | 46 s | about 1.5 min |
| `e2e:reader` (158 checks) | 177 s | about 6 min |
| `e2e:framing` (22) | 65 s | about 2 min |
| `e2e:a11y` (15) | 44 s | about 1.5 min |
| `e2e:viewer` (20) | 6 s | under 1 min |
| `e2e:registration` (84) | 55 s | about 2 min |
| the three jobs | 11 min in all, serial | `check` 5–8 min (measured), `reader` about 7 min, `extension` about 14 min with install and browsers: 14 min a pull request's wall clock, about 28 min of runner time |

**Not green at `13216ac44`: `e2e:small-caps`.** Its page loads today's layer modules from the tree as they are, in the
browser, and since stage 1a (29df59fff, b94bca203: `pageInk`, `wrapOf` and `planOf` moved into `packages/engine`) today's
layer imports `@readarxiv/engine` by its bare name, which a page without a bundler cannot resolve ("Failed to resolve module
specifier"): the page never reports ready and the script times out. Every other gate of the tier passes. The fix is the
script's (a bundle of what its page loads), and the `reader` job is turned on after it.

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
  `lanes/L1-papers87.tsv` and `lanes/L1-caches.txt`: the 87 papers and the cached compiles, partly on the external disk;
  `lanes/L3/replay/`: the typesetter's derived inputs; `lanes/L6/capture.jsonl`: today's readers' replies; `lanes/L1-out4/`: the harness's corpus
  bundles); today's engine at `065c1d973` checked out beside the worktree (`AXT_TODAY`); the release sweep's cache and the
  reader's served faces, which the typeset runners read (`AXT_SWEEP_CACHE`, `AXT_FACE_TABLES`, `AXT_FACE_SLICES`);
  Playwright's Chromium. No Docker (a compile no cache holds is a failed paper: exit 3).
- **Minutes**: 26 of the gates' own on this machine at `13216ac44` (below; the heavy slot's waits for other lanes' jobs left
  out), and 16 for `display` (measured at `a7a6e4097`); no hosted minute.
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
| `typeset-parts` (this run's parts) | 40 s: fail at `13216ac44`, lost 1,416 ("not laid from L1's part", the converge lane's open work); I3 79, I4 0, I5 0; a page's lay p50 7.58, p90 20.66, p99 33.51 ms over 3,213 pages |
| `sentence-cover` (this run's parts laid by the entry over the stored rows, the reading from the part: invariant I10; and I6 across the pages' lays, each unit begun on a pass page laid alike by every page's lay that holds it, the head pass's known cause counted apart) | 229 s: pass at `2d33bf467` over round 8 B5's parts, I10 0 in 4,767,634 pieces of 63,614 member-pages (123 pairs); `gate-l1.mjs --entry` under today's reading lays no entry and is refused |
| `typeset-replays` (six replays) | 134 s: fail at `13216ac44`, fit and display on one pair (2610.21026v1-zh, a crop box the tap does not record); fill, emit, names, figures equal |
| `typeset-data` (generated data, today's readings derived again, the lab's tests) | 7 s: pass |
| `harness-lab` (the harness with five corpus papers) | 340 s: fail at `13216ac44`, 75 of 79: the text layer reads out of order on one page of each of four papers |
| `display` (display ≥ today: no page worse than today's, a difference only where nearer the original; **a cut-over blocker**) | 16 min (v2's lay 15 s, the drawing 954 s for 344 pages with the machine shared, the verdict 10 s): fail at `a7a6e4097`, 326 of 344 pages worse than today's: the links (246 pages) and the highlight's sentence boxes (324) the entry does not state yet, and on 115 pages another measure (turned figure texts drawn upright 18 pages, lines across a rule or over a neighbour 16, sizes 36, anchoring 15, run-in gaps 11, translations missing 7 and figure texts 20) |

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

## release: before a release (by hand, the same machine)

- **Command**: `RELEASE_CHECK_BASE=<a worktree of the last release> pnpm release-check --tier release --online
  --work=<external disk>` (`PACK` the layer gate's fixture pack, else `lab/pdf/out/gate-pack`: the speed check's driver,
  run with zsh, measures, and its verdict is `speed.mjs`'s over the driver's logs, PASS alone a pass).
- **Adds to full**: the prepare's pixel proofs on every page of the 87 papers (poppler's `pdftoppm` and `pdftocairo`); the
  reader's canvas on spike S1c's papers (Chromium); today's engine's speed check against the last release; the online scripts (`pnpm build:staging`, then `e2e`, `e2e:pdf`, `e2e:floating`, `e2e:popup`, `e2e:layout`,
  `e2e:local-endpoint`, `e2e:image`) and the live placeholder run (`e2e:placeholders`), each under the project's
  User-Agent and never against our production server (`tests/e2e/lib/online.mjs`).
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
