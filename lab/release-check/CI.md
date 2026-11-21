# The CI tiers: what runs where

What each tier of `pnpm release-check` (`lab/release-check/run.mjs`, the gates in `lab/release-check/gates.mjs`) runs, where,
on what inputs, in how many minutes and with which secret. The fast tier is `.github/workflows/ci.yml`; the full and release
tiers read the lab's data and run on the maintainer's machine by hand, never from this repository's workflows (below,
"Security"). Restated on 2026-11-19 at `2ed857426` from the plan of 2026-11-07; times "here" are the maintainer's machine (Apple
silicon, 14 cores, 48 GiB, shared with other jobs) as the release check's own logs of 2026-11-13 to 2026-11-19 record them, and a
hosted runner (4 vCPU for a public repository) is taken as about twice as slow on the CPU-bound steps, until a pull request's run
measures it.

| Tier | Job | Runner | When | Commands | Needs | Minutes | What it catches that `check` alone did not |
|---|---|---|---|---|---|---|---|
| fast | `check` | GitHub's `ubuntu-latest` | every pull request; every push to `main` and `rebuild/v2` | `pnpm typecheck`, `pnpm lint`, `pnpm build`, the fixtures' fetch, `pnpm test` (the contract tests among its files), `node lab/release-check/census.mjs --no-today` | the fixtures' read token (a repository secret, one step's environment; a fork's run has none and fetches from arXiv) | 5 to 8 (five runs of 2026-11-07), the census 8 s here | the census's ratchet: a complexity or debt measure above the ledger's recorded value (new) |
| fast | `reader` | GitHub's `ubuntu-24.04` | as `check` | Playwright's Chromium (`pnpm exec playwright install --with-deps chromium`), `node packages/reader/e2e/run.mjs` (`harness`) | nothing: no secret, no lab data | here: harness 239 to 310 s; hosted: harness 4 min 38 s, the job 6 min (run 44432025091) | the reader package in a real browser on its own fixtures (93 checks, 12 of them holding nothing without the website's served faces: the stack, the composer, the panes, links, the text layer, the highlight; I1, I3, I4, I8 there); vitest's happy-dom draws nothing |
| fast | `extension` | GitHub's `ubuntu-24.04` | as `check` | Playwright's Chromium, `pnpm build`, then `pnpm e2e:reader`, `e2e:framing`, `e2e:a11y`, `e2e:viewer`, `e2e:registration` | nothing | here: 77, 64, 33, 6, 32 s; hosted about 12 with the build | the shipped build loaded in Chromium: the PDF page's entries (its button, the panel, the popup), the reader behind the extension's host on the stand-in of `/api/v2`, the framing defences, an accessibility finding the extension adds, the figure viewer under a pinned header, a laid page's drawing, overlay and links registered at every zoom; each suite behind a route table that fails the run on any request it does not answer |
| full | none | the maintainer's machine, by hand | before an integration round's merge into `rebuild/v2`, and at a release candidate | `pnpm release-check --tier full --work=<a directory on the external disk>` | the lab's data (`AXT_LAB_DATA`), the external disk, Docker for `perf-batch` | 26 at `13216ac44`; 110 at `6b91f86ff` on a shared machine | the corpus: below |
| release | none | the maintainer's machine, by hand | before a release | `pnpm release-check --tier release --online --work=<…>` | as full, and the network for the online scripts | about 80, and 100 to 130 for `perf-release` | below |

The private repository's tiers run on its own runners (below); the report names them and runs none.

## Security

This repository is public. Anyone can open a pull request, and a pull request's run takes its workflow files from the pull
request itself, so a rule about which workflow is meant to run is no boundary: what a run can reach is. The rules every workflow
obeys are readers of its text (`tests/scripts/workflow-rules.ts`), held by `tests/scripts/ci-workflows.test.ts` over every file
of `.github/workflows`. No YAML parser: the files are held to the one plain form they are written in, and every
reader fails closed on form. A spelling of YAML or of an expression it does not read is itself a violation, never a pass: a quoted
key, a flow mapping, a key at another indentation, a script in double quotes (YAML reads its escapes before GitHub reads its
expressions), an anchor, an alias, a merge, a tag, an escape, a step at another indentation (rule 0, `forms`). A line led by `#`
inside a scalar's text (a script's shell comment, a line of a value written as a block) is that text, not a YAML comment: GitHub
reads its expressions, and every rule reads it. Each rule is shown to
refuse what it is for in every spelling that could carry it (`tests/scripts/workflow-controls.ts`: 54 controls).

1. **GitHub's runners alone.** Every job has exactly one `runs-on:` naming a hosted image (`ubuntu-latest`, `ubuntu-24.04`) as a
   plain value at the job's level; a flow sequence, an expression, a block sequence, a quoted key or an alias is refused, and no
   workflow names `self-hosted` in any case. A runner registered to a public repository takes a job from any workflow that names
   its labels, a fork's pull request's own workflow file included; on a personal account there are no runner groups to restrict it
   to chosen workflows, and what would stand between a stranger's code and the maintainer's machine (the lab's data, licensed
   papers, his credentials) is one person's approval of each outside run. GitHub's own guidance is to use self-hosted runners with
   private repositories alone. So the full and release tiers stay on that machine, run by hand (below); no self-hosted job is
   written here, however its triggers are set.
2. **Events an outsider cannot turn into the repository's context.** A workflow's events are one block under `on:`, each a plain
   key, among `push`, `pull_request`, `workflow_dispatch` and `schedule`. A pull request's run, a fork's included, has no secret
   and a token that reads. No workflow names `pull_request_target`, `workflow_run`, `issue_comment` or `workflow_call`, in a line or
   a comment, in any case.
3. **A secret reaches one step.** The secrets context, in any spelling (its dot or its brackets, any case: expressions are
   case-insensitive), stands only in a step's own environment's entry of the one form `NAME: ${{ secrets.NAME }}`, never in a
   workflow's or a job's environment or an action's input, never passed on whole; the step that holds it names none of the job's
   files a step writes for the steps after it (`GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_PATH`, `GITHUB_STATE`). No expression is
   spliced into a script, whatever the script's style (no `${{` in a `run:` body: an expression's value is passed through the
   environment). `check`'s fixtures fetch is the step that holds the bucket's read token.
4. **GitHub's own actions, listed and pinned.** Every `uses:` is a plain step key naming one of the actions the rules list
   (`actions/checkout`, `actions/setup-node`, `actions/cache/restore`, `actions/cache/save`, `actions/upload-artifact`: none runs
   an input as a script) at a full commit with its version beside it, one commit an action across the workflows; pnpm comes from
   corepack at `package.json`'s version, not from a third party's action.
5. **The least token.** Every workflow's permissions begin with `contents: read`. A `permissions:` key stands only at the
   workflow's level or a job's, as a block of `<scope>: read|write|none` entries and nothing else; any other spelling or place is
   refused. And, whatever that reading sees, every `write` anywhere in a workflow is a scope its file may write: a write is held
   only where the rules' list says why, and the list names none.
6. **No credential kept.** Every checkout is a plain step with `persist-credentials: false` in its block of inputs;
   `persist-credentials` in any other spelling is refused; nothing pushes with git.
7. **The browser jobs hold nothing.** `reader` and `extension` name no secret, variable or token in any spelling or case, and hold
   no environment, cache, permission, service or container of their own: a fork's pull request runs them as they are, and nothing
   they run reaches a credential.
8. **No lab tier here.** No workflow runs the release check itself, a `--tier` in any spelling, or names the lab's data.

The alternative to the full tier by hand, if the maintainer wants it in Actions: a private mirror of this repository (pushed by
him, with no other collaborator; a private repository's forks run no workflows unless he allows it) with its own self-hosted
runner and its own copy of the full tier's workflow. It costs a second repository to keep in step and a runner to keep up, and
its result is not shown on this repository's pull requests; it is not built.

## fast: every pull request, and every push to `main` and `rebuild/v2` (GitHub's runners)

Nothing of the lab's data, no network but the install's, the browsers' download and the fixtures' fetch, no Docker. A pull
request's newer push stops its older run (`concurrency`); a push to a branch runs to its end.

**`check`**: the fixtures (`node scripts/fetch-fixtures.mjs`, with the read token and the cache keyed by the manifest, a pull
request's own) and `pnpm test`; the contract tests (`tests/contract/`) run inside `pnpm test`, and release-check runs them again
as their own line of its report. The census of this tree alone (`--no-today`): its ratchet judges the measures this tree holds
(21 at `2ed857426`) and skips, with their reason, the 27 that read the website's tree or today's engine.

**`reader` and `extension`**: Playwright's Chromium at the lockfile's Playwright version, with the system libraries it needs
(`--with-deps`, apt on the runner). The runner's browser speaks English and the maintainer's machine's Chinese: a suite that finds
the extension's controls and sentences by their Chinese words (`e2e:reader`, `e2e:a11y`) states Chinese where it launches
(`tests/e2e/lib/chromium.mjs`, `language`: Playwright's locale for every page and frame, and Chromium's `--lang`), so that its
verdict is not the machine's language's (run 44432025091 failed two of `e2e:reader`'s checks and `e2e:a11y`'s first look there); headless, Playwright's `chromium` channel, which loads an extension. `ubuntu-24.04` is
pinned: the browsers draw with its libraries and fonts. Each check step runs whatever the one before it gave, so that one
failure hides no other. The harness's checks that lay with the website's served faces (licensed files the repository may not
hold: `AXT_FACE_TABLES`, `AXT_FACE_SLICES`, `AXT_HYPH`) hold nothing there: 12 of its 93 at `2ed857426`, run as a hosted runner
meets them (no lab data, none of the three set: 93 of 93 "ok" in 3 min 52 s here), each printing its line with
`skipped: no served faces`; they hold on the maintainer's machine, in the fast tier run there and in the full tier's
`harness-lab`. `tests/scripts/ci-workflows.test.ts` holds each job's steps to `gates.mjs`: every
gate of the fast tier is run with the command `gates.mjs` gives it, the browser gates as steps named by their ids, the e2e
scripts on the job's own build.

| Gate | Here | Hosted, estimated |
|---|---|---|
| `typecheck`, `lint`, `build` | 1 to 3 s each | in `check` |
| `test` (vitest, 811 files, 12,494 tests at `2ed857426` with this tier's own test) | 113 to 165 s | in `check` |
| `contract` | 1 s | in `check` (inside `pnpm test`) |
| `census` (this tree alone) | 8 s | in `check` |
| `harness` (93 checks) | 239 to 310 s | about 8 min |
| `e2e:reader` (81 checks on the default build: `tests/e2e/reader-v2.mjs`, `reader-v2-layer.mjs`) | 77 s | about 3 min |
| `e2e:framing` (22) | 64 to 66 s | about 2 min |
| `e2e:a11y` (15) | 33 to 34 s | about 1 min |
| `e2e:viewer` (20) | 5 to 10 s | under 1 min |
| `e2e:registration` (74 on the default build) | 31 to 34 s | about 1 min |
| the three jobs, in parallel | | `check` 5 to 8 min, `reader` 6 (run 44432025091), `extension` about 12 (Chromium's system libraries alone took 8 min of it there): about 12 min of a pull request's wall clock |

**Not shown by the hosted tier.** The rebuilt reader's checks that hold a drawn run against
its layout (the harness's full-width punctuation, laid by the reader's own typesetter over the served faces) skip on the runner
for want of those faces: the rebuilt reader's drawing against its layout on Linux is not shown by the hosted tier.

**The rules gate**: today's layout rules' workflows (`rules-gate.yml`, `rules-publish.yml`, `rules-point.yml`) went with today's
engine at the cut-over.

## full: by hand on the maintainer's machine, recorded

The corpus replays need what the repository may not hold: arXiv's papers under their licence, the cached compiles, the frozen
baseline and the tap (the lab-data directory, `AXT_LAB_DATA`), some on the external disk. They run on the maintainer's machine,
started by hand, not by a runner (Security, rule 1).

- **When**: by the integration before it asks for a round's merge into `rebuild/v2` (the round's head, every gate of the tier),
  and at a release candidate. A round whose lanes touched none of a gate's inputs may run that gate with `--only`, and says so.
- **Command**: `pnpm install --frozen-lockfile && pnpm release-check --tier full --work=<a directory on the external disk>` (a
  corpus run writes about 400 MB; the corpus runners refuse a paper under 12 GiB free, and release-check reports such a gate as
  skipped, never passed). Heavy steps take the lab's heavy slot themselves.
- **Recorded**: the report (`release-check.md`, `release-check.json`: the commit, every gate's verdict and numbers) is kept in the
  lab's notes beside the round, and its verdict line and commit go into the pull request's description. A result recorded at
  another commit is not the head's.
- **Inputs**: `$AXT_LAB_DATA/refactor-2026-11/` (`baseline/`: the frozen dumps, `acceptance.json`, the tap;
  `lanes/L1-papers88.tsv` and the added pairs' papers (`baseline/added/papers.tsv`, `lab/typeset/added.mjs`), written as
  one list into the work directory (`papers.mjs`), and the compile caches, partly on the external disk: the corpus the
  integration round's stage 1a runs, with its flags (`--prove`, `--baseline` = the baseline's prepare dumps), a run and its
  twin alike. The caches are `RELEASE_CHECK_CACHES` (a list of directories, or a corpus run's `flags.txt`, whose `--caches=`
  line is the chain that run read: at a round's head, the round's own run, whose chain names the added papers' compiles
  too), else `lanes/L1-caches88.txt`: a round whose marks move fills new compiles into a directory of its own, and the list must
  name it, or every paper is "missing a compile" (exit 3); `lanes/L3/replay/`: the typesetter's derived inputs;
  `lanes/L6/capture.jsonl`: today's readers' replies, and `lanes/L6/capture-today.json`: today's typing of them, frozen
  (`lab/translate/today-typed.ts`); `lanes/cjk-punct/blast/pairs.txt`: the 90 pairs of the stored rows the rounds' reader gate
  walks; `google-rows/ef6989debed1` and `lanes/converge-7/tools-b15/google-rows.mts`: the lab's Google store and the rounds' tool
  that reads it through the tree's chain (the reader gate lays the rows it writes itself, `AXT_GATE_ROWS`; a unit the store holds
  no reply to is `unavailable`, which fails the gate: a round whose units move refills the store, keyless, before it runs); `baseline/corpora/papers.json`:
  the harness's corpus papers, opened from this run's bundles with this run's rows of them, `reader-parts`' Google rows);
  today's side of the display gates frozen (`AXT_TODAY_FROZEN`, in the lab's archive); the release sweep's cache and the
  reader's served faces, which the typeset runners read (`AXT_SWEEP_CACHE`, `AXT_FACE_TABLES`, `AXT_FACE_SLICES`); Playwright's
  Chromium; for `perf-batch`, the website's tree its reader is built in (`PERF_WEB`, a website worktree: its HEAD with this
  commit as `vendor/readarxiv`) and the round's box image (`PERF_NEW_IMAGE`). Docker for `perf-batch` alone (a compile no cache
  holds is a failed paper: exit 3).
- **Minutes**: 26 of the gates' own at `13216ac44` (the heavy slot's waits for other lanes' jobs left out), and 16 for
  `display` (at `a7a6e4097`). At `6b91f86ff` (2026-11-13, the machine shared with a round's gates, loads 4 to 146): 110 in all,
  of them `display` 51 (both modes, the added pairs apart), `reader-parts` 11, `prepare-same` 10, `harness-lab` 9, `prepare` 8,
  `sentence-cover` 6, `pnpm test` 2.5, `e2e:reader-today` 3 (gone at the cut-over).
- **Secret**: none. The tier reads no network.

| Gate | Here |
|---|---|
| the fast tier's gates | as in fast (about 11 min, serial) |
| `prepare` (87 papers from cached compiles, PDF.js proofs) | 184 s: pass, proofs (a) and (c′) 0 on every page |
| `prepare-diff` (the differential against the frozen baseline) | 1 s: pass, shown 37,793 → 38,146, lost 0 (+3 accepted), gained 356 |
| `prepare-same` (the prepare again, object by object) | 188 s: pass, 2,692 of 2,692 objects, 87 of 87 dumps |
| `translate-equivalence` (recorded replies) | 1 s; a difference of a class the package's owners accepted counts as compared (its rows `accepted`) |
| `typeset-today` (today's members, the reader's differential) | 39 s: pass, 32,035 laid as the baseline, changed 12; I3 160, I4 0, I5 0 |
| `sentence-cover` (I10 and I6 across the pages' lays) | 229 s: pass at `2d33bf467`, I10 0 in 4,767,634 pieces of 63,614 member-pages (123 pairs) |
| `typeset-data` (today's readings derived again, the lab's tests) | 7 s: pass |
| `reader-parts` (this run's parts laid by the entry over each rows store; I3 by ink, I4, I5) | 641 s: pass at `6b91f86ff`, at its record (`reader-parts.json`) |
| `harness-lab` (the harness with five corpus papers, this run's bundles and rows) | 559 s: pass over `46dd8fcdf`, 130 of 130 |
| `text-order` (I8: every page this run lays read by the composer's text module in Node, in reading order; out-of-order members held to `text-order.json`, which names none) | after `reader-parts` (its Google rows); a `run` slot |
| `display` (display ≥ today, under the default options and with every switch on; **a cut-over blocker**) | 16 min at `a7a6e4097` |
| `perf-batch` (NEW's prepare in the round's box and its reader built from this commit, against the last round recorded) | about 9 min and the waits for its slots |

**Retired.** `typeset-parts` and `typeset-replays` (2026-11-13, design 3i), and `layout-marks-gate` (the lab's corpus check of
today's layout marks, retired in `lab/pdf/README.md` on 2026-11-13, named among them since 2026-11-19): their reasons stand in
`gates.mjs` (`RETIRED`), the report lists them, and naming one to `--only` says why. The replays' tools went at the cut-over;
the records that cite them keep their sentences.

**Today's rows are production's.** Today's side of the display gates lays the release's stored rows, and each display gate first
checks, pair by pair, that production's own row path gives every stored row back (`production-rows.mjs`, its answers recorded in
the frozen folder); a pair whose rows it does not give back fails the gate, named, and the parity is still measured beside it.

**Cut-over blockers.** The maintainer's base threshold for the refactor: v2's display equal to or better than the production
site's, and performance, complexity and debt improved. `display` (`lab/typeset/parity/`, its README) is the display part. A gate
marked `cutover` in `gates.mjs` keeps the report's cut-over verdict NO-GO until it passes, whatever the tier's verdict; a tier
that does not run it says so.

**Performance, every batch: `perf-batch`** (`lab/release-check/perf.mjs` judges; the lab's `perf/tools/run.mjs --mode=batch`
measures): NEW's reader built from the commit judged (no build made before stands in), NEW's prepare in the round's compile image
(`PERF_NEW_IMAGE`, one CPU, 3 GiB, no network, the amd64 image under this machine's emulation), every measure against the last
round recorded, worse only past the two rounds' run-to-run spreads added; a repetition that measured the machine, not the
reader, is void and run again; void twice in a row, the gate is skipped, never passed. A regression understood is recorded with
`--accept`.

**Cut-over blocker: `perf-release`** (the release tier): TODAY (production's release) against NEW on every measure, the same
stored translation on both sides; about 100 to 130 minutes holding every heavy slot of the machine (`perf/tools/quiet.sh`), in a
window the coordinator gives.

## release: before a release, by hand on the same machine

- **Command**: `pnpm release-check --tier release --online --work=<external disk>` (today's engine at `065c1d973`, which
  `typeset-data` reads, as `AXT_TODAY`, else `.worktrees/refactor-read` beside this one). The performance gates measure the
  website's readers; today's engine's speed check went with that engine at the cut-over.
- **Adds to full**: `display-wide` (the display gate over every pair of the stored rows, about 2.5 hours of browser slots,
  overnight, once per candidate; **a cut-over blocker**); the prepare's pixel proofs on every page (poppler); the reader's canvas
  on spike S1c's papers (Chromium's software 2D canvas, every draw call rasterised as it is made, no stand-in for a reader
  change; each paper's split residue held to its record, `canvas.json`); `babel-names` and `csquotes-styles` (each pinned compile image's TeX
  Live, the docker slot, the images already local, never pulled); `face-files` (the lab's 83 face files, fontTools); the online
  scripts (`pnpm build:staging`, then `e2e`, `e2e:pdf`, `e2e:floating`, `e2e:popup`, `e2e:layout`, `e2e:local-endpoint`,
  `e2e:image`) and the live placeholder run, each under the project's User-Agent and never against our production server
  (`tests/e2e/lib/online.mjs`); `perf-release`.
- **The private repository's gates**, named in the report and never run here: its platform tier; the security suite of its
  compile jail on native amd64 (I9); the corpus through its prepare (I6); its website's reader e2e (I8); the staging soak and the
  release sweep. A result of theirs for the release candidate is written into the private gates' file (`--private`, `result:
  { status, commit, date, evidence }`, `commit` this repository's commit that run was made against); without it each stays
  NO-GO, and a result recorded at another commit is stale.
- **An invariant no gate holds, or one whose gap says what stands, keeps the release NO-GO** by design. I7 has had a gate
  since 2026-11-19 (`harness-lab`'s check at the reader's seam); I1's gap says what stands, held to its record
  (`canvas.json`) until the coordinator's ruling; I8 has none (`text-order` reads no member out of order, and `text-order.json`
  names none).
- **Minutes**: about 80 in all (the full tier's, the pixel proofs 25, the canvas 2 on the software canvas, its two runs' lines
  equal, the online scripts about 15), and `perf-release`'s 100 to 130.
- **Secret**: none for this repository's gates (the free engines need no key; an LLM service in the placeholder run would take
  its key from the browser's settings, never from CI).

## The private repository's tiers

Run on its own runners and named here only: its **platform tier** (its whole local gate: the Worker, the paper's object and the
Workflows under workerd, the routes' contract suite, its build; its site's reader e2e beside it) on every pull request, on
GitHub's runners; its **box tier** on native amd64 (GitHub's x86_64 runner), on a change to the box and nightly: the compile
jail's security suite, where the three cases emulation cannot hold hold as written, and the box's image held equal whether it
is built on its frozen base or in one go. The box tier can build its base from its pinned public inputs; a read-only registry
credential (the maintainer's to add) lets it test the deployed base by its digest instead and saves that build.

## Costs

GitHub Actions minutes on standard hosted runners are free for a public repository, so this repository's tiers cost no money.
The fast tier is about 35 runner minutes a run (three jobs in parallel), counted and not billed; the full and release tiers run
on the maintainer's machine. The private repository pays for its hosted minutes beyond its plan's included ones (2,000 a month
on Free, 3,000 on Pro and Team, at the time of writing): its platform tier (about 2,000 minutes in 30 days when it last ran on
GitHub's runners) and its box tier (each tree's base build, about 25 minutes, on every run without the registry credential).
That is design §9's decision 5: these minutes on hosted runners, or a self-hosted runner of the private repository's.
