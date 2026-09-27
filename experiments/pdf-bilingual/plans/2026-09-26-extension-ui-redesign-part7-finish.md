# The extension's interface, redesigned — Part 7: the merges, the verification, the documents, the retirements, the pull request

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each task says whether the **controller** runs it (merges, what the maintainer is shown, reviews dispatched, the pull
> request) or a **subagent** does, with a reviewer after it.

**Goal:** Bring the three parallel parts back into one tree, clear what the stage parked, retire what the new surfaces
left behind, prove the whole against the design's §12, write the documents of §13, and open the stage's one pull
request — nothing lost from a part, nothing parked dropped in silence, nothing pushed without the maintainer.

**Architecture:** Three merge commits on `exp/extension-ui-redesign` (the popup, then the settings page, then the
floating button), each gated; then small, separately reviewed commits that retire the old `src/ui` components, the old
`--axt-*` page tokens, the image run's dead gate and the old pages' pixel probe, and fix the parked minors; two probes
for what the parts' probes do not reach (the arXiv-page surfaces at 200 % and 400 % zoom; axe on the extension's own
pages); one verification run of every gate, suite and probe §12 names on the merged tree, and the popup's first paint
measured back to back against Part 3's build; the documents; a local Codex pass and a final review of the whole branch;
the record; the pull request into `exp/pdf-bilingual`.

**Tech Stack:** WXT 0.21, React 19, TypeScript, Tailwind v4.3, Vitest + happy-dom, Playwright (Chromium),
`@axe-core/playwright`, `gh`.

**Spec:** `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (the design; §n below is its):
§12 (verification), §13 (documents), §14 (order), §15, and every section a document of §13 describes. **Main plan:**
`2026-09-26-extension-ui-redesign.md` beside this file (its "# Parts 3–7, as re-cut on 2026-09-26" gives Part 7's row
and the merge order). **The parts' records:** "## Part 3: done" (`…-part3-controls.md`), "## Part 4: done"
(`…-part4-popup.md` on `exp/ui-popup`), "## Part 5: done" (`…-part5-settings.md` on `exp/ui-settings`), "## Part 6:
done" (`…-part6-floating.md` on `exp/ui-floating`). **Ledgers:** `.superpowers/sdd/2026-09-26-extension-ui-redesign*/progress.md`.
**Rulings:** `.superpowers/sdd/2026-09-26-extension-ui-redesign/plan-rulings.md`.

**Branch facts (read 2026-09-27 with `git merge-base`):** `exp/extension-ui-redesign` was cut from `exp/pdf-bilingual` at
`cc781213` (the merge of #301), which is also `origin/exp/pdf-bilingual`'s tip: the pull request's base is
`exp/pdf-bilingual` and its merge base `cc781213`. The three part branches start at `56d02f2d`; since then
`exp/extension-ui-redesign` holds plan commits (`73cd18a1`, `623da6a2`, `6a4c9758`, this plan's `7e336511`, Part 5's
plan amended at `b907ce43`), Part 4's merge `93763c58` (Task 91, run early: no conflict, the gate green, 2704 tests)
and Task 90's amendment of this plan. A trial of the next two merges, read with `git merge-tree --write-tree` on
2026-09-27 (objects only, no branch moved): `exp/ui-settings` meets this branch in `scripts/english-allowlist.txt` and
`tests/ui/locales.test.ts` alone, and `exp/ui-floating` merges on that result without a conflict.

## Global Constraints

The main plan's, verbatim where the stage has not changed them:

- Chrome 131 is the floor (`minimum_chrome_version`); no polyfills, no cross-browser branches.
- No `:has()` in any style sheet (DESIGN §7.2; `tests/styles/no-has.test.ts`).
- Every colour, shadow and ease a surface draws names a token of `src/shared/tokens.ts`; no raw colour in new code.
- Everything injected into arXiv's pages is prefixed `axt-` / `data-axt-` / `--axt-` (hard rule 2).
- The reader renders pixel for pixel as before (§2.4): `experiments/pdf-bilingual/spikes/reader-pixels.mjs` against the
  baseline Task 3 recorded (`experiments/pdf-bilingual/out/reader-pixels/baseline/`, 24 files — never re-recorded),
  after every task that touches its sheet, its controls or its settings: 24 lines of `ok`.
- Developer-visible text is English; reader-facing words come from the locale packs (`src/locales/zh-CN.ts`, `en.ts`),
  never hard-coded. No reader-facing string names a technical path (§1). `pnpm lint` runs the English gate. **Its counts
  are exact:** a task that changes a file's lines holding Chinese — or deletes a file that had an entry — sets that
  file's entry in `scripts/english-allowlist.txt` to the count `node scripts/check-english.mjs` reports (or removes the
  entry), with a one-line English reason, in the same commit. New files are `git add`ed before `pnpm lint`: the English
  and the boundary gates read git's index.
- API keys never enter the service health record, a log line, a cache key, a fixture or git (hard rule 5).
- The gate before each commit that ends a task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, judged by the
  exit code.
- Commits are local on `exp/extension-ui-redesign`; the stage goes out as one pull request, which this part opens
  (Task 110) — never into `main`; merge commits. Files are added by name, never `git add -A`. Never commit the untracked
  `experiments/pdf-bilingual/spikes/geometry-lock*.mjs` / `prompt-ablation.mjs` (another session's work). The gallery's
  break harness is gone (2026-09-27): a task that changes `src/entrypoints/gallery/main.tsx` commits it with its own
  files. Never run `git reset --hard`, `git checkout -- <path>`, `git restore`, `git clean` or `git stash`: rewind with
  `--mixed` / `--soft`, and put back only files named, by their content.
- Every commit message is `type(scope): summary` (a local merge: `Merge <branch>: <what it brings>`, as
  `exp/pdf-bilingual`'s history writes them) and ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Part 7's own:

- **Where:** this worktree, `/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/exp-pdf`, branch
  `exp/extension-ui-redesign`. The part worktrees (`.worktrees/redesign-popup`, `-settings`, `-floating`) are read
  through git (`git show <branch>:<path>`) and, where a step names one, by copying an ignored output out of them
  (Part 3's kept build, Part 6's `before` shots); nothing in them is written, and nothing is read from one while a part
  still runs there.
- **Merges** are the controller's: `git merge --no-ff`, never `--squash`, never a rebase of a pushed branch, nothing
  into `main`, and nothing pushed without the maintainer's explicit go-ahead (Task 110).
- **A retirement proves itself first.** Every deletion is preceded, in its step, by a `grep` whose expected output is
  given (usually empty); a non-empty result stops the step and is reported — nothing is deleted "because the plan says".
- **No CJK in any code line this part writes**: probes find controls by class, role and data attribute. Chinese enters
  only `docs/UI.md`'s copy (product copy, quoted from the packs), the id comments beside strings in
  `src/locales/zh-CN.ts` (outside the English gate), and this plan.
- **Documents describe what was built.** Where the build and the design differ, the document says what was built and
  the record (Task 109) names the difference; the design is not rewritten after the fact.
- **The ledger:** the controller keeps Part 7's ledger at
  `.superpowers/sdd/2026-09-26-extension-ui-redesign-part7-finish/progress.md` (dispatches, reviews, rulings, each
  parked item's outcome), as Parts 3–6 did.

## Review Focus

- **The second merge's hand-joined files keep both parts.** A lost locale key fails the typecheck, but a lost test case,
  a lost allowlist entry or half of `tests/ui/locales.test.ts`'s `allowed` expression fails nothing. Pinned in Task 92:
  the `allowed` line is given exactly, the `it(` counts of the two shared test files are compared with both sides', and
  every allowlist count is re-derived by the gate on the merged index.
- **A retirement that takes what is still read.** A type (`MenuItem`, in the old `Menu.tsx`), a locale key, a test's
  specifier — and above all a Tailwind utility: once `--color-fg-2` goes, `text-fg-2` silently draws nothing, with no
  error anywhere. Pinned in Tasks 96–98: a `grep` with its expected output before each deletion, the typecheck for keys
  and types, and the built sheet searched for the utilities the gallery moves to.
- **The text run's gate outlives the image run's.** The image run's `parked` set, its `isEnabled` and its `resume()`
  are dead since configuration v20 (a round exists only while figures are translated); the text run's `admit` and
  `resume()` are not: a figure's labels held while figures are off are asked for when figures are switched on
  mid-session. Pinned in Task 95: the page session's and the pipeline's gate tests stay, unchanged and green.
- **The popup's first paint, measured fairly.** The comparison is Part 3's build, re-recorded in the same window as the
  merged build, on a machine running nothing else, three rounds; Part 4's Task 30 baseline was recorded under three
  parallel worktrees and is not the comparison. Pinned in Task 102.
- **The documents say what was built.** UI.md's ids and copy against the packs, DESIGN §9's version and shape against
  `src/config/schema.ts`, the changelog naming every capability §11 removed — each held by a command in Tasks 104–106,
  not by reading.
- **The key's cue decides once, for every door.** Task 99 Step 11 moves the retranslate cue (P6b) into
  `shared/page-action.ts`: the popup, the keyboard command, the context menu and the floating button must reach the
  same answer from the same three facts (the session's own hand-overs, the refused-key record, the chain in force), and
  a page not running, or running on a service nobody refused, must decide exactly as before. Pinned by the decision's
  own tests and the toggle's.
- **A retired export takes nothing still read.** `configFallbackReason()` and `withItem` (Task 99 Steps 9, 10) go
  after a `grep` with its expected output; the tests that read `getConfig`'s verdict through the first read
  `readConfig()`'s instead, and a case whose stored value changes between its read and its look reads the verdict where
  the value was read.

## Files, Part 7

| File | Task | What happens to it |
|---|---|---|
| this plan, `scripts/english-allowlist.txt` | 90 | Committed with its allowlist entry, amended from the Part 4 and Part 5 records |
| (the three merges) | 91–93 | Merge commits; the shared files of Parts 4 and 5 re-joined by hand; every mock of `@/config/storage` holding `readConfig` |
| `tests/protector/fixtures.test.ts`, `tests/config/storage.test.ts` | 94 | A timeout sized to the heaviest fixture; the migration's missing cases |
| `src/core/image/run.ts`, `src/core/session/index.ts`, `src/core/run/ledger.ts`, `tests/image/run.test.ts`, `tests/image/svg-targets.test.ts` | 95 | The image run's dead gate and its comments go |
| `src/ui/style-sample.ts` (new), `src/ui/appearance/tiles.ts` (deleted), its callers, `src/entrypoints/controls/specimens/{forms,buttons}.tsx`, `src/locales/{zh-CN,en}.ts`, `tests/ui/locales.test.ts` | 96 | `styleTile` moved as `styleSample`; the controls sheet on the pages' words; two keys go |
| `src/ui/{Button,Confirm,Drawer,Field,LucideIcon,Menu,MenuField,Segmented,Spinner,Switch}.tsx`, `src/ui/appearance/*` (deleted), `src/ui/menu-item.ts` (new), `src/ui/service-items.ts`, `src/pdf-reader/ui/languages.ts`, `tests/ui/{menu,segmented,lucide-icon,advanced-css,profile-editor}.test.ts` (deleted), `tests/scripts/boundary.test.ts`, `src/entrypoints/options/ui/ColourPick.tsx`, `src/entrypoints/options/sections/StyleEditor.tsx` (comments), `src/locales/{zh-CN,en}.ts`, `src/ui/strings.ts` | 97 | The old components, their tests and their words retired |
| `src/styles/ui.css`, `tests/styles/ui-sheet.test.ts`, `src/entrypoints/gallery/main.tsx`, `tests/e2e/probes/pages-pixels.mjs` (deleted) | 98 | The old page tokens go; the gallery on the roles; the hairline named `line` |
| `src/ui/controls/{tip.tsx,modality.ts,Popover.tsx,radio.ts,Switch.tsx,Button.tsx}`, `tests/ui/controls/button.test.ts`, `src/entrypoints/pdf-reader/reader.css`, `src/shared/service-health.ts`, `src/ui/service-items.ts` and its callers | 99 | The parked minors fixed |
| `tests/e2e/probes/align.mjs`; `src/config/storage.ts`, `src/shared/surface-config.ts`, `src/entrypoints/options/sections/Translate.tsx`, `tests/config/storage.test.ts`, `tests/options/translate-section.test.ts`, `docs/DESIGN.md` (§9's one line); `src/entrypoints/options/ui/lists.ts`, `tests/options/controls.test.ts`; `src/shared/page-action.ts`, `src/entrypoints/popup/view-model.ts`, `src/entrypoints/background/{context-menu,index}.ts`, `tests/shared/page-action.test.ts`, `tests/entry/context-menu.test.ts`, `tests/popup/{view-model,view}.test.ts` | 99 | What Parts 4 and 5 left: the vacuous alignment pass, `configFallbackReason()`, `withItem`, the key's cue |
| `tests/e2e/probes/reflow-shots.mjs`, `tests/e2e/probes/pages-a11y.mjs` (new) | 100 | What the parts' probes leave: zoom on arXiv's pages; axe on the extension's pages |
| — (outputs under `experiments/pdf-bilingual/out/`, the ledger) | 101–103 | Verification, the first paint, the maintainer's look |
| `docs/UI.md`, `src/locales/zh-CN.ts` (id comments only) | 104 | §2, §3.1–3.3, §4, §5, §6, §8 |
| `docs/DESIGN.md` | 105 | §3, §4, §4.0b, §4.0c, §4.2, §4.4, §9, §10, §11, §15.2, §15.6, §16 |
| `experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/THIRD_PARTY.md`, `docs/RELEASE.md` | 106 | The reader's §4.1 and the notes it needs; the reader-facing log; the commands |
| this plan (the record) | 109 | "## Part 7: done" |

## What the ledgers parked, and what Part 7 does with each

Every line of the five ledgers and the four records that says "parked", "Minor", "for the final review", "Part 7" or
names a stale comment, a stale document, an unused key, a retired component or a timeout. **Fixed** = in the task
named; **carried** = to issue #299 (the technical-debt pass before the next version, the maintainer's rule of
2026-09-24) or to the issue named, by Task 110's comment on #299, with the reason given here; **closed** = settled
before Part 7, with the evidence. Task 90 (2026-09-27) settled rows 11, 73, 74 and 84 and added rows 96–130: what the
Part 4 and Part 5 records, their ledgers to their last line, and the main ledger's tail (its lines 186–195) bring.
Beside the three outcomes, a row may go to **the maintainer's look** (Task 103, where an approval closes it and a
change asked for becomes a task of its own), to **Task 101's checks** (a watch: run on the merged tree, a recurrence
not rerun away), or to **the final review's focus** (Task 108).

### From the main ledger (Parts 1–2, the pre-flight scans, the final review of Parts 1–2)

| # | Item | Source | Part 7 |
|---|---|---|---|
| 1 | `resolve()` has no cycle guard | Task 1 minor | Carried: no cycle in the data; a cycle would throw at the tokens test, loudly |
| 2 | The contrast anchor's `toBeCloseTo(7.38, 1)` is loose; `over` returns through a cast | Task 2 minor | Carried: the floors are the gate; the anchor only checks the arithmetic against the prototypes' figure |
| 3 | A report said "1 physical pixel" for a CSS-pixel clip | Task 3 minor | Closed: words in a report, nothing in the tree |
| 4 | `reader-pixels.mjs`: band clips unguarded under 2r; the radius read from the shorthand's first value | Task 3 minor | Carried: every shot is larger than 2r and every radius uniform today |
| 5 | Moved modules' comments point at `reader.css` or call themselves the reader's (`tip.tsx`, `modality.ts`, `Popover.tsx`, `radio.ts`, `Switch.tsx`) | Task 5 minor; Part 1's record; ruling of line 142 (sent to Part 3, not done there) | **Fixed, Task 99** |
| 6 | A duplicate forced-colour rule for `.tbtn[aria-pressed]` | Task 5 minor | Closed: merged in `61b3c007` (one rule, `reader.css`, line 214 today) |
| 7 | Alias and relative imports interleaved in `src/pdf-reader/ui/*.tsx` after the move | Task 5 minor | Carried: order only; a reorder of every reader file is a diff of its own |
| 8 | `reader.css` does not `@source` `src/ui/controls/` | Task 5 minor | Closed: `716aa2c0`, a single-file `@source` of `MenuList.tsx` |
| 9 | The old `src/ui/LucideIcon.tsx` and `src/ui/Switch.tsx` beside the shared ones | Task 5 minor; Part 1's record | **Fixed, Task 97** |
| 10 | Rules moved verbatim keep literal colours (the switch knob's white, the segmented thumb's shadow; the tooltip's became `tip-shadow` in Part 3) | Pre-flight ruling, line 30 | Carried: a role of the same value changes no pixel; the design adds no role for them |
| 11 | The old PDF reader section's test nulls `theme` in every patch | Task 7 minor | Closed: the test went with its section in `83046e07` (Part 5, Task 57; Task 90 Step 2's last command printed nothing) |
| 12 | No v20 case for a light appearance, nor for a value no theme can hold | Task 7 minor | **Fixed, Task 94** |
| 13 | Migration 20's parameter type is inert (a cast is needed) | Task 7 minor | Carried: a migration takes an unknown shape by nature; type only |
| 14 | DESIGN §9 (v19, its list, the volatile list) and UI.md S-O-55 stale | Task 7 | **Fixed, Tasks 104, 105** |
| 15 | No round trip of `'whole'` through `setConfig` / `getConfig` | Task 8 minor | **Fixed, Task 94** |
| 16 | The v14 / v18 / v19 fixtures spread today's `DEFAULT_CONFIG` for the fields v20 did not touch | Task 8 minor; final minor | Carried: the fields v20 changed are literal since `61b3c007` |
| 17 | The two preload choices spelled out in several places (no `PRELOAD_CHOICES`) | Task 8 minor | Carried: two places left after the settings page's rewrite (the schema's enum, `preloadOf`) |
| 18 | `page-session.test.ts`'s title said "range" | Task 8 minor | Closed: `61b3c007` |
| 19 | The image run's `release()` on whole is not asserted | Task 8 minor (pre-existing) | Carried: pre-existing, and the whole-paper release is held by the text run's test |
| 20 | DESIGN.md (the preload's words) and UI.md S-O-50 / S-O-51, §2's two rows stale | Task 8 | **Fixed, Tasks 104, 105** |
| 21 | A `NaN` margin would map to on demand | Task 8 minor | Closed: unreachable, JSON storage holds no `NaN` |
| 22 | Stale per-mode "park" comments; the image run's `parked` mechanism and `enterSide`'s two `resume()` calls dead | Task 9 minor; ruling of line 142 ("Part 7's clean-up, a careful removal of its own") | **Fixed, Task 95** |
| 23 | `tests/e2e/image.mjs`'s stale words and a pointless `bringToFront` | Task 9 minor | Closed: `61b3c007` |
| 24 | UI.md's `image.modes` rows, DESIGN's `e2e:image` count, §15's per-mode words stale | Task 9 | **Fixed, Tasks 104, 105** |
| 25 | `withoutTransitions` also runs on the first, pre-paint `applyTheme` | Task 10 minor | Carried: harmless, nothing has a transition to hold before the first paint |
| 26 | The refused-read spy is not restored | Task 10 minor | Carried: the last test of its file; nothing leaks |
| 27 | Mark and clear read-modify-write could erase each other | Task 11 minor; Codex | Closed: `aafb11cf` (one queue) |
| 28 | A failed record write answers a successful connection test as failed | Task 11 minor; final minor | Carried: needs a storage failure; the answer then errs on the safe side |
| 29 | `void markRejected` / `rejectedServices().then` without `.catch` | Tasks 11, 13 | Closed: `61b3c007`; the one read left (`src/entrypoints/popup/state.ts`) has its `.catch` |
| 30 | Any change of the refused set rebuilds the chain, a spare service's too | Task 11 minor | Carried: a rebuild per refusal, measured cost none |
| 31 | Pages translating stay on the fallback after a clear, until restarted | Task 11 minor | Closed by Part 4's retranslate cue (P6b) |
| 32 | No test of `background/index.ts`'s wiring (a mark → `chain.activate()`) | Task 11 minor | Carried: held end to end by `pnpm e2e`'s wrong-key section |
| 33 | Network and rate-limit answers leaving the record alone, untested | Task 11 minor | Closed: health-guard tests (`61b3c007`, `e0901916`) |
| 34 | A key update did not clear the record | Task 11 design gap | Closed: `e0901916` |
| 35 | `launchWithReader` never removed its temp copy; it still leaks if the worker never registers or the caller never closes | Task 11 minor; final minor | First half closed (`1de87141`); second half carried (an experiments spike; a failing run leaves one copy) |
| 36 | Fallback off: a page call can succeed on a marked service and the mark stays | Task 11 minor | Carried: a connection from the settings page clears it (§4) |
| 37 | The main plan's Task 11 text still says `onDemoted` / `known` | Task 11 minor | Closed: the plan is the record of how Parts 1–2 were planned (the fix wave's report) |
| 38 | P7b's configuration duplicates the `llm` fixture constant | Task 12 minor | Carried: fixture tidiness |
| 39 | A refused service drawn runnable on the first paint; no P8b fixture | Task 12 minor | Closed by Part 4 (Tasks 32, 33) |
| 40 | The interleaved-clear test would pass on the old code | Task 13 minor | Carried: the queue's own tests hold the order |
| 41 | The settings page's delete-time clear is not serialised with the queue | Task 13 minor | Closed: ruling 17, `e0901916` — the page writes no record |
| 42 | The guard compared only the key | Task 13 minor | Closed: `61b3c007`, the address too |
| 43 | `handlers.ts` marks a named call's refusal outside the queue's decision (two settings tabs) | Task 13 minor; final minor | Carried: needs two settings tabs racing |
| 44 | A stale e2e comment on the wrong-key sections | Task 13 minor | Closed: `61b3c007` |
| 45 | `Popover`'s hard-coded `chrome` class | Ruling of line 142 (sent to Part 3, not done) | Carried: the reader needs it; Task 99 proves it names no rule on the pages (`grep` in its Step 7) |
| 46 | `serviceItems`' default `rejected = []` can hide a caller that forgets the record (the reader's `onPick` call does) | Ruling of line 142 (sent to Part 6; half done) | **Fixed, Task 99** (the parameter required) |
| 47 | `watchRejected` rebuilding eagerly | Ruling of line 142 ("can wait") | Carried |
| 48 | The reader's pixel probe shoots no capsule and no card, which §2.4 names | Ruling of line 142 ("recorded in Part 7's record") | Recorded by Task 109; carried (a probe extension) |
| 49 | The documents, and `pnpm tokens` in CLAUDE.md | Ruling of line 142 | **Fixed, Tasks 104–106** |
| 50 | `markRejected`'s `still` must not call a mutation of the record: say so | Final minor | **Fixed, Task 99** |
| 51 | `e2e:image` and the full e2e not re-run after the fix wave's last two changes | Final minor | **Fixed, Task 101** (every suite on the merged tree) |
| 52 | `tests/protector/fixtures.test.ts > 2609.04056.html` times out at 30 s under load | Line 179 | **Fixed, Task 94** |
| 53 | A development profile that ran an intermediate v20 build reads as S-O-02; resetting it drops its keys | Note, line 143 | Carried into the pull request's testing notes (Task 110) |
| 54 | Part 1's local Codex review did not run | Part 1's record | Closed: it ran at line 82 (`05a528e6..4faf1145`) |
| 55 | A tall figure's viewer control under arXiv's header | Part 6's run | Carried: issue #303 |
| 56 | `lastDemoted` never cleared when an engine recovers | Part 4 Task 33; Part 6 | Carried: issue #304 |

### From Part 3's ledger and record

| # | Item | Source | Part 7 |
|---|---|---|---|
| 57 | `Button` draws an empty `<span>` for the children `''` | Task 16; record | **Fixed, Task 99** |
| 58 | No rule for a disabled `raised` button | Task 16; record | Carried: no caller; the design gives a note's button no disabled look |
| 59 | The loader is held still under reduced motion | Task 16 | Closed: as §8 asks (a motion is a fade or nothing); the words and `aria-busy` carry the state |
| 60 | The forms shot under the pointer's hover; a `TextInput`'s own props untested | Task 17 | Closed: `620cf134` |
| 61 | Forced colours: `.input` keeps its shadow edge | Task 17 | Closed: Chrome drops box-shadows there; the 1 px `CanvasText` border draws the edge |
| 62 | `iconsOnly` with a disabled segment's title untested | Task 18; record | Carried: no caller |
| 63 | The reader's `@source "../../pdf-reader/"` reads the engine's comments, putting `.table { display: table }` in its sheet | Task 19; record | **Fixed, Task 99** |
| 64 | The 1 px `danger` edge on a field at fault is derived, not drawn in a prototype | Task 17; record | **The maintainer's look, Task 103** |
| 65 | Codex's comment on the gallery's harness | Task 20 | Closed: declined then; the harness is gone (2026-09-27) |
| 66 | DESIGN's entry-point row names the controls sheet | Record, "Part 7" | Closed: `83cfb018` wrote it; Task 105 checks it stands |
| 67 | `styleTile` moves, the controls sheet's import with it | Record; ruling 23 | **Fixed, Task 96** |
| 68 | The pages' hairline utility becomes `line` once `--axt-line` goes | Record | **Fixed, Task 98** |
| 69 | `tests/e2e/probes/pages-pixels.mjs` retires | Record | **Fixed, Task 98** |
| 70 | The old `src/ui/{Button,Field,Segmented,Menu,MenuField,Spinner,Switch,LucideIcon}.tsx` and `tests/ui/{menu,segmented,lucide-icon}.test.ts` | Record | **Fixed, Task 97** |

### From Part 4's ledger and plan (its record is read by Task 90)

| # | Item | Source | Part 7 |
|---|---|---|---|
| 71 | The first-paint probe's profiles leaked | Task 30 | Closed: `545427bb` |
| 72 | `ENTRY_CHECK_MS` unused | Task 31 | Closed: Task 32 applies it |
| 73 | Task 32's batched minors: the "never in between" test, a check held open while the field moves, the `ENTRY_CHECK_MS` race untested, `tabUrl`'s comments, writes after dispose, stale comments | Task 32 | Closed: `80e8df56` (all five, each with its test where it changes behaviour), `047d3129` (a late entry answer kept, the shortcut's write guarded after stop) |
| 74 | `tests/e2e/pdf-entry.mjs` names the retired S-P-03 in comments | Task 33 | Closed: `80e8df56` (the comments and the check's label say P0; the regex unchanged) |
| 75 | A false retranslate cue after a 403 once the chain is rebuilt | Task 33 (parked 3) | Carried: recoverable, the cue's button does what it says |
| 76 | No re-fit of an open menu across a resize or a theme change | Task 34 | Closed: the popup is 320 px fixed and the panel's frame follows its body by `ResizeObserver` |
| 77 | UI.md's rows (S-P-03 → P0, the new states, S-P-48 / S-P-83 and 管理提示词…, S-P-53, S-P-90, P0's focus and its polite status) | Plan, Task 39; record | **Fixed, Task 104** |
| 78 | The popup off the old `src/ui` while its view model reads `styleTile` | Plan, Task 39 | **Fixed, Tasks 96, 97** |
| 79 | The gallery's `transform-gpu` comment no longer holds (the menus are in the top layer) | Plan, Task 39 | **Fixed, Task 98** |

### From Part 5's ledger and plan (its record is read by Task 90)

| # | Item | Source | Part 7 |
|---|---|---|---|
| 80 | `Card`'s label only with a role | Task 50 | Closed: declined with its reason (ARIA forbids naming a generic) |
| 81 | `useLinger`, `shut`, `segmentWidth` untested | Task 51 | Carried: `shut` cannot run in happy-dom; the others are held by the browser checks |
| 82 | No Escape on an armed confirm | Task 51 | Carried, as a question for the maintainer: §6.6 names only the 3 s return |
| 83 | Several `<h1>` while a search runs | Task 52 ("for Part 7's a11y pass") | **Task 100's axe probe decides** (Task 101 runs it): fixed in Task 101's fix step if axe calls it serious or critical, else carried |
| 84 | `O.search.keywords` inert until the sections pass `words`; the dimming sub-row has none | Tasks 52, 55 | Closed: Part 5's record — `settings-align.mjs` finds the glossary's row by a word only `O.search.keywords` holds, in both languages; the dimming row's keywords `9a4bf905`. Task 101 Step 5 searches two words once more on the merged tree |
| 85 | `src/ui/Menu.tsx`'s comment quotes the old words | Task 53 | **Fixed, Task 97** (the file goes) |
| 86 | UI.md S-O-71 / 72 / 73 describe the old cancel and "0" | Task 54 | **Fixed, Task 104** |
| 87 | The PDF cache row shares the cache's keywords | Task 54 | Closed: the plan's reuse; a search for either finds both rows |
| 88 | "Kept for Part 7": the `O` keys only `src/ui/appearance/*` reads, `O.services.cancel`, `deleteConfirm`, `O.close`, `O.services.baseURLHint`, `O.services.more` | Plan, rulings 20 and F6 | **Fixed, Tasks 96, 97** |

### From Part 6's ledger and record

| # | Item | Source | Part 7 |
|---|---|---|---|
| 89 | The shots script's fixed profile | Task 70 | Closed: declined with its reason (the probes' convention) |
| 90 | The host sheet's cascade proven by its text only | Task 71 | Closed: Task 72's browser check |
| 91 | The browser block leaves `ar5iv_theme` at dark | Task 72 | Carried: the last block, its context closes |
| 92 | `ground === chrome` proves only the role | Task 72 | Carried: the check pairs it with dark ≠ light |
| 93 | The tooltip dark in both themes stands out less on arXiv's dark page | Record | **The maintainer's look, Task 103** |
| 94 | DESIGN §4.0c: the button's material, the mark inside the shadow root, the retry and hint line by the page | Record, "For Part 7" | **Fixed, Task 105** |
| 95 | `floating-shots.mjs` stays as the button's probe | Record | Closed: kept; Task 93 runs it |

### Added by Task 90: the Part 4 and Part 5 records, their ledgers, and the main ledger's tail

| # | Item | Source | Part 7 |
|---|---|---|---|
| 96 | `Entries.tsx`'s `press()` guard unreachable (`Button` refuses a disabled press itself) | Part 4, Task 35 minor | Closed: `80e8df56` |
| 97 | The style option's locator rested on a premise the brief got wrong (its name leaves out the `aria-hidden` sample) | Part 4, Task 37 minor | Closed: the locator is still strict (the review's own check) |
| 98 | P16's style menu is not among the menus `popup-align.mjs` opens | Part 4, Task 38 minor | Closed: the same menu is opened from P1 and measured (`['P1', '.style-btn', 'styles']`); a fixture that starts with a menu open is closed by StrictMode's double effect, so the probe opens every menu by clicking (Part 4's record) |
| 99 | `align.mjs`'s `offCentre` / `edges` pass when a selector draws nothing, so a probe passes over a missing state | Part 4, Task 38 minor; main ledger, line 187 | **Fixed, Task 99** (Step 8) |
| 100 | The popup awaits the refused-key record before its first render, an unbounded read | Part 4's local Codex review; record | Carried: declined for the part — `prepareFirstPaint`'s `getConfig()` is the same unbounded storage read, so the record's adds no failure mode; bounding the pages' first-paint reads is a question for the pages' design |
| 101 | ⌥T — and the context menu and the floating button, which decide with it — still restores where the popup offers P6b's retranslate cue, so its chip sits on 显示原文 | Part 4's plan and record ("Part 7 takes it") | **Fixed, Task 99** (Step 11) |
| 102 | P0's field takes the focus as P0 opens; P0 draws its no-entry sentence as P17 does (a note in the alert tone) — two decisions of Part 4's controller | Part 4's record | **The maintainer's look, Task 103** |
| 103 | The first paint: a FAIL by 0.4 ms against a baseline recorded under load; the interleaved A/B within the noise | Part 4, Task 39; record | **Fixed, Task 102** (the definitive measurement; Part 4's medians in its Step 1) |
| 104 | Part 5's 13 batched minors: a candidate checked before the chain, `connect.ts`'s read guarded, the no-Authorization assertion, `PREVIEW_LANG` as `zh-CN`, the address chips' own name, the dimming row's keywords, `reader-a11y.mjs` / `reader-ui-live.mjs` on `seedService`, `addService`'s refused reason, `o-gloss-retry` without a rule, the precision prompt's quotes, `KeyForm`'s placeholder, the glossary's empty row, the diagnostics line's term | Part 5, Tasks 56–64 | Closed: `9a4bf905` |
| 105 | The model field's placeholder while it waits for a press kept (no pack words fit) | Part 5, Task 59, fix round 1, item 6 | Closed: accepted at the re-review |
| 106 | `settings-align.mjs`'s `service(name)` times out rather than printing an off line | Part 5, Task 64 minor | Closed: accepted — it fails loudly, it never passes |
| 107 | The minors batch's review: the `aria-describedby` join assumes no hint beside an error on the add form; the keyless ids not compared across spikes | Part 5, the minors batch | Closed: accepted — true today; each spike runs its own profile |
| 108 | `withItem` (`src/entrypoints/options/ui/lists.ts`) without a production caller | Part 5, Tasks 56, 63; record | **Fixed, Task 99** (Step 10) |
| 109 | `configFallbackReason()` without a caller in `src` since `a9e97a3f`: a module-wide verdict of whichever read finished last — the hazard round 5 took away from its callers | Part 5, Task 65; record; main ledger, line 194 | **Fixed, Task 99** (Step 9) |
| 110 | `src/ui/appearance/*` but `tiles.ts`, with `tests/ui/{advanced-css,profile-editor}.test.ts`, and the two comments that name them (`ColourPick.tsx:6`, today's ColorField's; `StyleEditor.tsx:115`, the drawer's AdvancedCss) | Part 5's record | **Fixed, Task 97** (the files as rows 70 and 88; the two comments in Step 4) |
| 111 | `O.reading.reset` (重置, a word §10.2 retires) still read by the controls sheet's `specimens/buttons.tsx` alone | Task 90's reading of the merged tree | **Fixed, Task 96** (Step 3) |
| 112 | UI.md S-O-49b, S-O-49c, S-O-55 stale | Part 5, Task 57 | **Fixed, Task 104** (Step 3's rows) |
| 113 | UI.md §3.2's ids that §10.2 renames or retires, §10.2's list the authority: the retired sentence lacked S-O-10's and S-O-12's list names, the prompt manager's words (S-O-61) and the glossary's text-box hint (S-O-62) | Part 5's record | **Fixed, Task 104** (Step 3's retired sentence) |
| 114 | The new words in UI.md: 常用地址, 添加原文, 保存失败，请再试一次 with 重试, a refused deletion's line, the narrow theme control, the floating switch held until its state is known | Part 5's record | **Fixed, Task 104** (Step 3's rows) |
| 115 | DESIGN §9 does not say that an undone deletion brings the service back without its refused mark | Part 5, Task 60 minor 2; main ledger, line 153; record | **Fixed, Task 105** (Step 3) |
| 116 | A page closed while a deletion's undo is open may keep an origin granted | Part 5, Task 60 minor 3 | Carried: best effort — a permission kept, never one taken from a service that needs it |
| 117 | Several undo rows keep the shared helper's order, not the deletions' | Part 5, Task 60 minor 4 | Carried: cosmetic |
| 118 | A variable inserted into a prompt is outside the browser's undo stack | Part 5, Task 63; main ledger, line 190 | Carried: only the deprecated `execCommand` would put it there |
| 119 | A tab closed between a service's deletion and its write leaves open pages on that service until they reload | Part 5, Task 65; main ledger, line 191 | Carried: the background could move sessions off a service that left the configuration by itself — a change of its own |
| 120 | A service deleted while the stored settings cannot be read keeps its origin granted for good | Part 5, Task 65, round 4; main ledger, line 193 | Carried: given back never rather than wrongly — the page cannot know which stored services share the origin |
| 121 | The deep link's focus ring beside its flash (a programmatic focus on a load with no pointer yet) | Part 5, Task 64; record | **The maintainer's look, Task 103** |
| 122 | The pencil chooses the style it opens (looking restyles open pages); a deletion falls back to `styles[0]`, not the choice before the editor opened | Part 5, Task 56; record | **The maintainer's look, Task 103** |
| 123 | The new words as a reader meets them: 常用地址 (heard, not drawn), 添加原文, 重试, the precision prompt's description unquoted | Part 5's record | **The maintainer's look, Task 103** |
| 124 | The reader spikes Part 5 edited but could not run without the TeX server: `cache-faults.mjs`, `cache-revisit.mjs`, `viewer-faults.mjs`, `reader-a11y.mjs`, `reader-ui-live.mjs` | Part 5, Task 61 and the minors batch; record | **Fixed, Task 101** (Step 3 runs them) |
| 125 | `e2e:pdf` failed 4 checks once — the popup's page state on hep-th/9711200's PDF and on the abstract page — and passed 26/26 on the rerun | Part 5, Task 65; record | **Task 101's checks** (Step 4) |
| 126 | `reader-pixels.mjs` mismatched once on `dark-toolbar.png` under the parallel load, not reproduced | Part 5, Task 56's fix round; main ledger, line 186 | **Task 101's checks** (Step 3) |
| 127 | A ref an effect's cleanup sets that its setup does not reset: `<StrictMode>`'s development double run leaves it set (the service forms, Task 65, round 3) | Main ledger, line 192 | **The final review's focus, Task 108** |
| 128 | The merge notes: every mock of `@/config/storage` provides `readConfig`; `tests/popup/data.test.ts` changed on both sides; DESIGN §9's line from `a9e97a3f`; `Segmented.tsx` changed on the settings branch alone | Part 5's ledger, line 53; main ledger, lines 194–195; record | **Fixed, Task 92** (Step 5) |
| 129 | An orphan comment in `zh-CN.ts` claims S-O-30…36 for a guided install whose keys are gone — ids §3.2 gives to deep thinking, the appearance and the dimming | Task 90's reading of the merged pack | **Fixed, Task 104** (Step 2) |
| 130 | `tests/ui/locales.test.ts`'s `allowed` names `S.setup.step1` and `S.setup.step1Hint`, keys neither pack holds | Task 90's reading of the merged tree | **Fixed, Task 96** (Step 4) |

---

# Part 7

### Task 90: before the merges — this plan committed, the Part 4 and Part 5 records read into it (controller)

**Files:**
- Modify: this plan
- Modify: `scripts/english-allowlist.txt` (this plan's entry)

- [ ] **Step 1: The parts are done and idle**

Run:

```bash
cd /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/exp-pdf
for b in exp/ui-popup exp/ui-settings exp/ui-floating; do git log --format="$b %h %s" -1 $b; done
for w in redesign-popup redesign-settings redesign-floating; do git -C ../$w status --short | grep -v '^??' ; done
ps -Ao pid,command | grep -E 'redesign-(popup|settings|floating)' | grep -v grep
```

Expected: each branch's last commit is its record (`docs(plan): Part 4's record`, `docs(ui): Part 5's record`,
`docs(ui): Part 6's record`); no tracked change in any part worktree; no process running in one. Otherwise wait.

- [ ] **Step 2: Read the two records and the ledgers' tails**

```bash
git show exp/ui-popup:experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part4-popup.md | sed -n '/^## Part 4: done/,$p'
git show exp/ui-settings:experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part5-settings.md | sed -n '/^## Part 5: done/,$p'
sed -n '/^Task 35/,$p' .superpowers/sdd/2026-09-26-extension-ui-redesign-part4-popup/progress.md
sed -n '/^Task 56/,$p' .superpowers/sdd/2026-09-26-extension-ui-redesign-part5-settings/progress.md
git show exp/ui-settings:tests/options/pdf-reader-section.test.ts >/dev/null 2>&1 && echo "pdf-reader-section test still there"
```

Expected: both records print (a record that does not print means the part is not done: wait); the last command prints
nothing (row 11 closed).

- [ ] **Step 3: Amend this plan from them**

For every line of the two records and the ledgers' tails that says "for Part 7", "parked", "Minor", "otherwise than
planned", names a stale comment or document, an unused key, a retired component or a timeout, and that this plan does
not already hold:

- a fix that fits one of Tasks 96–99 or 104 goes into that task as a step of its own (files, the exact change, its
  check) and into the table above as **Fixed, Task n**; anything else goes into the table as **Carried** with its
  reason;
- rows 73, 74, 83 and 84 above are settled: what Part 4's batch fixed is **Closed** with its commit; what is left
  becomes a step of Task 99;
- Part 5's record names "UI.md §3.2's ids that §10.2 renames or retires": where it, or an id comment in the merged
  packs, differs from the id table of Task 104 Step 3, Task 104's table takes the record's id;
- Part 4's record gives the first paint's two medians before and after: copy them into Task 102's Step 1 as the
  numbers to compare against;
- a name that came out otherwise than this plan says (a class, a key, a file) is corrected wherever this plan uses it.

- [ ] **Step 4: Commit this plan with its allowlist entry**

```bash
git add experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part7-finish.md
node scripts/check-english.mjs
```

Expected: it names this plan and the number of its lines holding Chinese (the copy it quotes for UI.md and the
design's words), and nothing else. In `scripts/english-allowlist.txt`, after the line that starts
`experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (a line no part branch changes, so the
merges meet no conflict there), add:

```
experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part7-finish.md <n>  # 2026-09-27: Part 7's plan: the popup's and the settings page's words it writes into docs/UI.md, quoted from the design and the packs
```

with `<n>` the count the gate named. Then:

```bash
git add scripts/english-allowlist.txt && node scripts/check-english.mjs && pnpm lint
git commit -m "docs(plan): Part 7 — the merges, the verification, the documents, the retirements, the pull request

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Expected: the gate exits 0 before the commit.

### Task 91: merge `exp/ui-popup` (controller)

Run early, on 2026-09-27, before Task 90's amendment: `93763c58`, no conflict, the gate on the merged tree exit 0 (2704
tests; the main ledger, line 189). The steps stay as the record of how it ran.

- [ ] **Step 1: A clean start**

Run: `git status --short`
Expected: only `?? experiments/pdf-bilingual/spikes/geometry-lock.mjs`, `?? …/geometry-lock2.mjs`,
`?? …/prompt-ablation.mjs`. Anything else: stop.

- [ ] **Step 2: Merge without committing**

```bash
git merge --no-ff --no-commit exp/ui-popup
git status --short | grep -E '^(UU|AA|DU|UD|AU|UA) ' || echo "no conflict"
```

Expected: `no conflict` (since `56d02f2d` this branch changed only plan files the popup branch meets in other lines).
A conflict can only be in a plan file: keep both sides' text; where both rewrote one sentence, keep the side whose last
commit on that file is later (`git log -1 --format='%h %cI' <side> -- <file>`). Then `git add` the file by name.

- [ ] **Step 3: The gate on the merged tree**

Run: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. A failure: find its cause before committing; a fix to a hand-resolved hunk belongs in the merge; a
failure the popup branch had on its own is reported to the maintainer and the merge is not committed.

- [ ] **Step 4: Commit the merge**

```bash
git commit -m "Merge exp/ui-popup: the popup redrawn (the redesign's Part 4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git log --oneline --graph -3
```

Expected: a merge commit with two parents.

### Task 92: merge `exp/ui-settings`, the shared files re-joined by hand (controller)

**Files meeting Part 4's** (the plans' "Files outside the settings page", ruling 20): `src/locales/zh-CN.ts`,
`src/locales/en.ts`, `tests/ui/locales.test.ts`, `tests/ui/strings.test.ts`, `scripts/english-allowlist.txt`,
`tests/e2e/extension.mjs`, `experiments/pdf-bilingual/spikes/entries.mjs`; and, from the records (Task 90),
`tests/popup/data.test.ts` (Part 4 added the `ENTRY_CHECK_MS` case, Part 5 its mock's `readConfig`), every test that
mocks `@/config/storage` (Part 5's `surface-config.ts` reads through the new `readConfig()`, `a9e97a3f`),
`docs/DESIGN.md` (§9's one line, changed on the settings branch alone) and `src/ui/controls/Segmented.tsx` with
`tests/ui/controls/segmented.test.ts` (Part 5's optional `describedBy`, changed on the settings branch alone).

- [ ] **Step 1: Count what each side holds**

Before merging, so that nothing a side added can go missing without a number saying so:

```bash
for f in tests/ui/locales.test.ts tests/ui/strings.test.ts tests/popup/data.test.ts; do
  for r in 56d02f2d HEAD exp/ui-settings; do echo "$f $r $(git show "${r}:$f" | grep -c "^\s*it(")"; done
done
```

Expected: nine lines (`"${r}:$f"` braced: zsh reads `$r:t` as a modifier). The merged file must hold `HEAD`'s count
plus `exp/ui-settings`'s minus `56d02f2d`'s (each side's cases added and removed), per file; write the three expected
numbers down (`tests/popup/data.test.ts`: 1, 2, 1 → 2 on 2026-09-27).

- [ ] **Step 2: Merge without committing**

```bash
git merge --no-ff --no-commit exp/ui-settings
git status --short | grep -E '^(UU|AA|DU|UD|AU|UA) '
```

Expected: exactly `UU scripts/english-allowlist.txt` and `UU tests/ui/locales.test.ts` (Task 90's trial with
`git merge-tree`); every other shared file, `tests/popup/data.test.ts` and the packs among them, merges by itself and is
checked in Steps 4 and 5. Another conflict: re-join it as Step 3 says for its kind, and name it in the ledger.

- [ ] **Step 3: Re-join each conflicting file**

- **The locale packs**: every key of both sides. Part 4 edits `S` only and Part 5 `O` only: take `S` (and `R`,
  `REASON`) from `HEAD`'s side and `O` from `exp/ui-settings`'s. A key both sides changed is a lane broken: stop and
  report it with both values.
- **`tests/ui/locales.test.ts`**: every case of both sides. The `allowed` expression is exactly:

  ```ts
      const allowed = /^(S\.brand|S\.service\.(llm|microsoft|google|chrome)|S\.find\.paper|O\.services\.(apiKey|namePlaceholder|baseURLHint)|O\.reading\.previewSource|O\.reading\.pdf$|S\.setup\.step1|S\.setup\.step1Hint|O\.fallbackWhy\.invalid)/
  ```

  (Part 4 added `S\.find\.paper|`; Part 5 added `|O\.reading\.pdf$`.)
- **`tests/ui/strings.test.ts`**: every case of both sides (Part 5 removed the drawer issue sentence's case with its
  key; that removal stands).
- **`tests/e2e/extension.mjs`** and **`experiments/pdf-bilingual/spikes/entries.mjs`**: Part 4's blocks (the popup's,
  its mode buttons, `popupOver`) and Part 5's (the settings sections' helpers and waits), each as its side wrote it.
- **`scripts/english-allowlist.txt`**: every entry of both sides; an entry both sides changed gets the count the gate
  reports in Step 4 and both reasons joined with `; `. The trial met two hunks, each entry changed on one side only:
  the plans' lines — `…-part4-popup.md` from `HEAD` (81), `…-part5-settings.md` from `exp/ui-settings` (311),
  `…-part7-finish.md` from `HEAD` (this plan's count as Task 90 set it) — and the suites' lines —
  `tests/e2e/popup.mjs` from `HEAD` (20), `tests/e2e/options-page.mjs` from `exp/ui-settings` (15, with its reason).
- **A plan file**: as in Task 91 Step 2.

`git add` each file by name.

- [ ] **Step 4: Check the re-join**

```bash
node scripts/check-english.mjs
for f in tests/ui/locales.test.ts tests/ui/strings.test.ts tests/popup/data.test.ts; do echo "$f $(grep -c "^\s*it(" $f)"; done
grep -cF 'S\.find\.paper|O\.services\.(apiKey|namePlaceholder|baseURLHint)|O\.reading\.previewSource|O\.reading\.pdf$' tests/ui/locales.test.ts
pnpm vitest run tests/ui/locales.test.ts tests/ui/strings.test.ts tests/popup/data.test.ts
```

Expected: the English gate names nothing, or only entries whose count moved: set each to the count named, reason
joined, `git add scripts/english-allowlist.txt`, and run it again to exit 0; the three `it(` counts equal Step 1's
expected numbers; the `allowed` line found once; the three test files pass.

- [ ] **Step 5: What Part 5 changed under Part 4's code (the merge notes)**

Part 5's `a9e97a3f` made `src/shared/surface-config.ts` read the store through `readConfig()`, which returns a read's
verdict with its value; a test that mocks `@/config/storage` without it fails once its subject reaches that module:

```bash
for f in $(grep -rln "vi.mock('@/config/storage'" tests); do echo "$f $(grep -c 'readConfig' $f)"; done
grep -c "configFallbackReason:" tests/popup/data.test.ts tests/options/data.test.ts
git diff MERGE_HEAD -- src/ui/controls/Segmented.tsx tests/ui/controls/segmented.test.ts
grep -c "a read returns why beside the value it read" docs/DESIGN.md
```

Expected: four files — `tests/options/connect.test.ts 0` (its subject, `connect.ts`, reads `getConfig` alone),
`tests/options/data.test.ts`, `tests/options/translate-section.test.ts` and `tests/popup/data.test.ts` each at least 1;
`0` for both data tests (the settings side replaced that mock line with `readConfig`); the `git diff` prints nothing
(the merged files are the settings side's: Parts 4 and 6 do not edit them); `1` (§9's line from `a9e97a3f`). A file
at 0 other than `connect.test.ts`, or a new one whose subject reaches `surface-config.ts` or `readConfig`: add
`readConfig` to its mock beside its `getConfig`, answering `{ config, fallbackReason: null }` from the same store, as
`tests/popup/data.test.ts`'s does, in the merge, and `git add` it by name.

- [ ] **Step 6: The gate, and the suites both parts changed**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm e2e
node experiments/pdf-bilingual/spikes/entries.mjs
```

Expected: exit 0 each (`pnpm e2e` and `entries.mjs` need the network; a failure is re-run once before it counts).

- [ ] **Step 7: Commit the merge**

```bash
git commit -m "Merge exp/ui-settings: the settings page rebuilt (the redesign's Part 5)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 93: merge `exp/ui-floating`, and the panel shot again with the new popup (controller)

The maintainer approved Part 6's look on 2026-09-27 (the main ledger, line 181), in this order: 4, 5, then 6.

- [ ] **Step 1: Merge without committing**

```bash
git merge --no-ff --no-commit exp/ui-floating
git status --short | grep -E '^(UU|AA|DU|UD|AU|UA) ' || echo "no conflict"
```

Expected: `no conflict`. Part 6 meets Part 5 in `src/entrypoints/background/handlers.ts` and
`tests/background/handlers.test.ts` (Part 5's `axt:translate` candidate, Part 6's `axt:entry-settings` theme),
`src/pdf-reader/ui/Menus.tsx` (Part 5's settings link, Part 6's first lines of `ServiceMenu`) and the design document
(Part 5's §6.2, Part 6's §2.2 and §3), each in other hunks; and its plan file meets this branch's two amendments
(`623da6a2`, `6a4c9758`) in other lines than its record. Task 90's trial (`git merge-tree` of `exp/ui-floating` on a
trial of the settings merge) met no conflict. A conflict: keep both hunks; stop and report if the same line was changed
on both sides.

- [ ] **Step 2: Both sides are in the merged files**

```bash
grep -n "useRejected()\|openOptions('translate/services')" src/pdf-reader/ui/Menus.tsx
grep -n "theme" src/entrypoints/background/handlers.ts | head -5; grep -n "candidate" src/entrypoints/background/handlers.ts | head -3
grep -c 'data-axt-theme' experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md
grep -c "ink-3\` words read under 4.5:1" experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md
grep -c "^## Part 6: done" experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part6-floating.md
grep -c "the light appearance under a dark system too" experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part6-floating.md
```

Expected: two lines from `Menus.tsx` (the hook in `ServiceMenu`, the new hash in its `onPick`); `theme` in the entry
settings' answer and `candidate` in the translate handler; the design's counts at least 2 and 1; the plan's record once;
the amendment twice.

- [ ] **Step 3: The gate, then commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git commit -m "Merge exp/ui-floating: the floating button and the controls on arXiv's pages (the redesign's Part 6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: The panel shot again, the new popup in its frame**

Part 6's two shot sets framed the old popup; its `before` set is the comparison and stays in Part 6's worktree:

```bash
mkdir -p experiments/pdf-bilingual/out/floating
cp -R ../redesign-floating/experiments/pdf-bilingual/out/floating/before experiments/pdf-bilingual/out/floating/
pnpm build && node tests/e2e/probes/floating-shots.mjs after
pnpm e2e:floating
```

Expected: `18 shots in …/out/floating/after`, no `MISSING`; `same` for every part of every shot but these, which
`differs`: the tooltip `.axt-fb-main .axt-fb-tip` and the close menu `.axt-fb-menu` / `.axt-fb-menu button` by the
measures Part 6's record gives (the shared `.tip` and `.pop`), and `.axt-fb-panel-box` in `light-panel` and
`dark-panel` **in its top and its height only** (its left and its width the same: the frame is centred on the main
button and the new popup is 320 px wide as the old one was). Any other `differs` is a finding: report it with the two
boxes. `pnpm e2e:floating`: every line `PASS` (22 at Part 6's end), exit 0.

The shots show an arXiv paper: they are shown to the maintainer locally (Task 103), never published.

### Task 94: two test gaps — the fixture round trip's timeout, and the migration's cases (subagent)

**Files:**
- Modify: `tests/protector/fixtures.test.ts`
- Modify: `tests/config/storage.test.ts`

- [ ] **Step 1: Measure the heaviest fixture alone**

Run: `pnpm vitest run tests/protector/fixtures.test.ts --reporter=verbose 2>&1 | grep -E "\[protector\]|\.html"`
Expected: one `[protector] <file>: … ms` line per fixture and one line per case with its duration. The slowest is
`2609.04056.html`, about 4.8 s (the ledger measured 4.76 s alone, and more than 30 s once while three worktrees ran their
suites at once). Write down the slowest case's duration, `T` seconds.

- [ ] **Step 2: A timeout sized to it**

The timeout is twenty times the slowest case alone, rounded up to ten seconds — room for a machine loaded several
times over, and still a failure for a case that hangs. With `T` = 4.76 that is 100 s. In
`tests/protector/fixtures.test.ts`, after the `FIXTURE_DIR` line, add (with the measured `T` and the number it gives):

```ts
/**
 * A case walks every block of a paper of up to 1.8 MB through the whole protector. The heaviest, 2609.04056.html, took
 * 4.76 s alone (2026-09-27, the `[protector]` line below) and once ran past the suite's 30 s while three worktrees ran
 * their suites at once — the machine's load, not the code (the redesign's ledger). Twenty times the heaviest case
 * alone, so that load never fails it and a hang still does
 */
const TIMEOUT = 100_000
```

and give each case the timeout: `it(f, () => {` … `})` becomes `it(f, () => {` … `}, TIMEOUT)` (the closing `})` of the
`it` on the line before the loop's closing brace).

Run: `pnpm vitest run tests/protector/fixtures.test.ts`
Expected: PASS, one case per fixture.

- [ ] **Step 3: The v20 cases §12 names that are missing**

§12's migration cases: each preload value (held by "a stored margin, whatever it was…"), both appearances (only `dark`
is held), image modes present and absent (held), and a configuration the migration cannot read (held for
`pdfReader`, the margin and `image`, not for the appearance). In `tests/config/storage.test.ts`, after the case
`'v20 leaves a hand-edited pdfReader that is not an object to the schema, which names it'`, add:

```ts
  it('v20 carries a light or a system appearance to the theme as well, and leaves one no theme holds for the schema to name', async () => {
    for (const appearance of ['light', 'system'] as const) {
      await fakeBrowser.storage.local.set({ config: v19Stored({ pdfReader: { ...DEFAULT_CONFIG.pdfReader, appearance } }), config$: { v: 19 } })
      vi.resetModules()
      const fresh = await import('@/config/storage')
      const reading = await fresh.readConfig()
      expect(reading.config.theme).toBe(appearance)
      expect(reading.fallbackReason).toBeNull()
    }
    await fakeBrowser.storage.local.set({ config: v19Stored({ pdfReader: { ...DEFAULT_CONFIG.pdfReader, appearance: 'sepia' } }), config$: { v: 19 } })
    vi.resetModules()
    const fresh = await import('@/config/storage')
    // no throw: the defaults in use, and the reason names the field (S-O-02 shows it)
    const reading = await fresh.readConfig()
    expect(reading.config).toEqual(DEFAULT_CONFIG)
    expect(reading.fallbackReason).toMatchObject({ kind: 'invalid', where: 'theme' })
  })
```

and inside `describe('the preload, v15 to v20', …)`, after its first case, add:

```ts
  it('the whole paper is written and read back as it is', async () => {
    vi.resetModules()
    const fresh = await import('@/config/storage')
    await fresh.setConfig({ ...DEFAULT_CONFIG, preload: 'whole' })
    expect((await fresh.getConfig()).preload).toBe('whole')
    expect((await fresh.readConfig()).fallbackReason).toBeNull()
  })
```

(Each reads the verdict from `readConfig()`, the read's own, not from `configFallbackReason()`, which Task 99 Step 9
retires; `readConfig` is in the tree since the settings merge, Task 92.)

Run: `pnpm vitest run tests/config/storage.test.ts`
Expected: PASS, two cases more than before. A failure of the appearance case is a finding about migration 20 (report
the value it produced), not a test to adjust.

- [ ] **Step 4: The gate and two commits**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add tests/protector/fixtures.test.ts
git commit -m "test(protector): the fixture round trip's timeout sized to its heaviest paper

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git add tests/config/storage.test.ts
git commit -m "test(config): v20 for every appearance and one it cannot hold, and the whole paper read back

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 95: the image run's dead gate, and its stale comments (subagent)

Since configuration v20 an image round exists only while `image.enabled` (the session replaces the round whole when the
switch changes, `src/core/session/index.ts`), so the round's `isEnabled` is always true inside it: nothing ever parks,
`resume()` has nothing to release, and `enterSide`'s two `resume()` calls react to a mode that no longer gates anything.
**The text run's gate stays**: `admit` (`block => !isFigureText(block.el) || started.config.image.enabled`) holds a
figure's labels while figures are off, and the switch's handler calls `live.run.resume()` when they come on.

**Files:**
- Modify: `src/core/image/run.ts`, `src/core/session/index.ts`, `src/core/run/ledger.ts`
- Test: `tests/image/run.test.ts`, `tests/image/svg-targets.test.ts`

**Interfaces:**
- Produces: `ImageRunOptions` without `isEnabled`; `ImageRun` without `resume()`, and `waiting(): ImageTarget[]`.

- [ ] **Step 1: Nothing else uses what goes**

Run: `grep -rnE "isEnabled|\.resume\(\)|\.waiting\(\)|parked" src experiments/pdf-bilingual/spikes tests/e2e | grep -v "^src/core/image/run.ts"`
Expected only these, by file:
- `src/core/session/index.ts`: `waitingNote`'s comment (`… and whether it was parked`), its `w.parked` and
  `run?.waiting()`; `isEnabled: () => config.image.enabled,`; `enterSide`'s `live?.images?.run.resume()` and
  `live?.run?.resume()`; the switch handler's `live.run.resume()`;
- `src/core/run/ledger.ts`: the comment `(pending nodes, a parked set, a queue)` and `scheduler?.waiting()` (the
  scheduler's own count, which stays);
- `tests/e2e/extension.mjs`: the comment `… this paper's bitmaps parked for good in a profile without the macOS helper …`
  (history, which stays).
- `tests/e2e/probes/settings-align.mjs` (`… the pointer parked, before the shot`) and `tests/e2e/probes/controls.mjs`
  (`… (Task 17, parked): move away first`): the mouse pointer parked, another sense of the word — they stay (the
  pre-flight scan on the merged tree, 2026-09-28).

Anything else: stop and report.

- [ ] **Step 2: The tests first**

In `tests/image/run.test.ts`:
- replace the case `'waiting() names the targets never requested, and whether each is parked behind the gate'` whole
  with:

  ```ts
    it('waiting() names the targets never requested, and none once each has been', async () => {
      const { targets, run } = setup()
      expect(run.waiting().map(t => t.id)).toEqual(targets.map(t => t.id))
      await run.translate(targets)
      await vi.waitFor(() => expect(run.progress().done).toBe(targets.length))
      expect(run.waiting()).toEqual([])
    })
  ```
- delete the case `'the mode gate closed: targets entering wait without a request; released on resume'` whole.

Then drop the option from every set of options in both test files:

```bash
sed -i '' 's/isEnabled: () => true, //; /^ *isEnabled: () => true,$/d' tests/image/run.test.ts tests/image/svg-targets.test.ts
grep -n "isEnabled\|resume\|parked" tests/image/run.test.ts tests/image/svg-targets.test.ts
```

Expected: the `grep` prints nothing.

Run: `pnpm vitest run tests/image/run.test.ts -t "waiting"`
Expected: FAIL — `waiting()` still returns `{ target, parked }` records, whose `id` is `undefined`.

- [ ] **Step 3: The image run**

In `src/core/image/run.ts`:
- in `ImageRunOptions`, delete the two comments and the member (from
  `/** The mode in effect is among the ones the reader ticked; …` through `isEnabled: () => boolean`);
- in `ImageRun`, delete `/** The mode gate opened: release the parked targets */` and `resume(): void`; replace the
  `waiting` member and its comment with:

  ```ts
    /**
     * The targets never requested so far. A diagnostic for the idle trace: `images idle: 5/5 of 6` says one target never
     * entered the viewport, and only this says which
     */
    waiting(): ImageTarget[]
  ```

  and the `release` member's comment with
  `/** Every target still waiting for the viewport is taken now (the whole-paper choice made mid-session, §10) */`;
- delete `/** Targets that entered the viewport while the mode gate was shut */` and `const parked = new Set<ImageTarget>()`,
  and the two `parked.clear()` lines (in the ledger's `onStop`, and in the permanent error's branch);
- `translate` begins:

  ```ts
    const translate = async (picked: ImageTarget[]): Promise<void> => {
      const { taken: ready } = ledger.intake(picked)
      options.onTrace?.(`images entered: ${picked.map(t => t.id || t.kind).join(', ')} → taken ${ready.length}, unknown ${picked.length - ready.length}`)
      if (ready.length === 0) return
      ledger.request(ready)
  ```

  (the gate's comment, `held`, `parked.add` and `parked.delete` go; the rest of `translate` as it is);
- in the returned object, delete the `resume() { … }` method whole, and `waiting` becomes
  `waiting: () => ledger.inState('waiting'),`.

- [ ] **Step 4: The session**

In `src/core/session/index.ts`:
- `startImages`' comment becomes:

  ```ts
  /**
   * Image translation (§15): images are taken by viewport like text blocks, and the page's translation does not wait
   * for them. A round exists only while image translation is on, and every display shows its overlays (the redesign's
   * design, §4: configuration v20)
   */
  ```
- in `waitingNote`'s comment, `needs to say which image and whether it was parked` becomes `needs to say which image`;
  its map becomes `const shown = left.slice(0, 8).map(t => t.id || t.kind)`;
- delete `// The mode gate, the same for both kinds of image` and `isEnabled: () => config.image.enabled,`;
- `enterSide` and its comment become:

  ```ts
  /**
   * The mode in effect moved, or a session started in it: the tidy layer enters or leaves side — what that takes is its
   * own to know (renderer/prep.ts `side`)
   */
  function enterSide(effective: Mode): void {
    prep.side(effective === 'side')
  }
  ```
- the switch's handler (`live.run.resume()` after `live.images = startImages(live, config)`) stays as it is.

In `src/core/run/ledger.ts`: `render, batch, fetch, park — stays in the run` becomes
`render, batch, fetch, hold — stays in the run`; `(pending nodes, a parked set, a queue)` becomes
`(pending nodes, a queue)`; `for the run to park` becomes `for the run to hold (the text run holds a figure's labels
while figures are off)`.

- [ ] **Step 5: Nothing of the gate left**

```bash
grep -rn "park" src
grep -rnE "isEnabled|\.resume\(\)" src/core/image src/core/session
```

Expected: the first prints exactly one line, `src/core/renderer/highlight.ts:43` ("a pointer genuinely parked outside
the text", another sense of the word); the second exactly one, the switch handler's `live.run.resume()`.

- [ ] **Step 6: The tests**

Run: `pnpm vitest run tests/image tests/session tests/pipeline tests/run`
Expected: PASS. The page session's figures cases (`'figures on: a label is asked for with the text around it…'` and the
switch's) and `tests/pipeline/run.test.ts`'s `'the gate: a block refused is not asked for…'` pass unchanged: the text
run's gate stays (Review Focus).

- [ ] **Step 7: The gate and the commit**

Run: `git add src/core/image/run.ts src/core/session/index.ts src/core/run/ledger.ts tests/image/run.test.ts tests/image/svg-targets.test.ts && node scripts/check-english.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0 (the two test files' Chinese lines are unchanged: their entries stand).

```bash
git commit -m "refactor(image): the image run's mode gate goes, dead since figure text shows in every display

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 96: `styleTile` moved; the controls sheet on the pages' own words (subagent)

Ruling 23: `styleTile` is moved, not deleted — the popup's style menu, the settings page's style rows and the controls
sheet draw their samples with it. It moves to `src/ui/style-sample.ts` as `styleSample`: there are no tiles any more
(§6.4). Then the controls sheet's forms specimen reads words the settings page uses, and the two keys only it read go
(Part 5's "Kept for Part 7").

**Files:**
- Create: `src/ui/style-sample.ts`
- Delete: `src/ui/appearance/tiles.ts`
- Modify: every file that imports `@/ui/appearance/tiles` (Step 1 lists them)
- Modify: `src/entrypoints/controls/specimens/forms.tsx`, `src/entrypoints/controls/specimens/buttons.tsx`, `src/locales/zh-CN.ts`, `src/locales/en.ts`, `tests/ui/locales.test.ts`

**Interfaces:**
- Produces: `styleSample(profile: StyleProfile): CSSProperties` (`@/ui/style-sample`), `styleTile`'s body unchanged.

- [ ] **Step 1: Who reads the module**

Run: `grep -rn "appearance/tiles\|styleTile\|bandTile" src tests experiments/pdf-bilingual/spikes`
Expected: `styleTile` imported by `src/entrypoints/popup/view-model.ts`, the settings page's style rows and editor
(`src/entrypoints/options/sections/…`), `src/entrypoints/controls/specimens/menus.tsx` and `tests/ui/locales.test.ts`
(and any of `tests/popup`, `tests/options` that use it); `bandTile` by nothing outside `src/ui/appearance/`. A
`bandTile` reader outside that directory: stop and report.

- [ ] **Step 2: The module moved**

`src/ui/style-sample.ts` holds, unchanged, `styleTile` (renamed `styleSample`), `TEXT_ONLY`, `CLAMP` and `declarations`
with their comments, from `src/ui/appearance/tiles.ts`; `bandTile` is not moved. Its first comment is:

```ts
// What a translation style looks like on its sample sentence — the popup's style menu, the settings page's style rows
// and editor, the controls sheet (the redesign's design, §5.3, §6.4): the values the page uses, as inline style, so a
// sample needs no frame of its own. Moved from src/ui/appearance/tiles.ts, whose grid of tiles is gone (ruling 23)
```

Then:

```bash
git rm src/ui/appearance/tiles.ts
perl -pi -e 's#\@/ui/appearance/tiles#\@/ui/style-sample#g; s#\bstyleTile\b#styleSample#g' $(grep -rl "appearance/tiles\|styleTile" src tests)
grep -rn "appearance/tiles\|styleTile\|bandTile" src tests experiments/pdf-bilingual/spikes
```

Expected: the last `grep` prints nothing.

- [ ] **Step 3: The forms specimen on the pages' words**

In `src/entrypoints/controls/specimens/forms.tsx`:
- `<Field label={O.services.baseURL} hint={O.services.baseURLHint}>` becomes `<Field label={O.services.baseURL}>` (the
  settings page's address field has suggestions under it, not a hint);
- `<Field label={O.services.model}>` becomes `<Field label={O.services.model} hint={O.services.modelNoList}>` (the one
  hint the page's service form draws under a field);
- `{O.services.more}` becomes `{O.more}` (the page's fold, Part 5's Task 56).

In `src/entrypoints/controls/specimens/buttons.tsx`, the small text button's `{O.reading.reset}` becomes
`{O.appearance.restore}` — the settings page's text button on the styles' heading (S-O-41); 重置 is one of the words
§10.2 retires, and after the settings merge this specimen is its only reader (row 111). Task 97 Step 5 then finds
`O.reading.reset` unread and deletes it.

- [ ] **Step 4: The two keys go**

```bash
grep -rn "baseURLHint" src tests | grep -v "^src/locales/"
grep -rn "services\.more" src tests | grep -v "services\.moreFor" | grep -v "^src/locales/"
```

Expected: the first prints only `tests/ui/locales.test.ts`'s `allowed` line; the second nothing. Delete `baseURLHint`
and `more` from `O.services` in `src/locales/zh-CN.ts` and `src/locales/en.ts` (with any comment that belongs to them
alone), and in `tests/ui/locales.test.ts`'s `allowed` expression `O\.services\.(apiKey|namePlaceholder|baseURLHint)`
becomes `O\.services\.(apiKey|namePlaceholder)` and `|S\.setup\.step1|S\.setup\.step1Hint` goes (neither pack has held
an `S.setup` since before the redesign: `grep -n "setup" src/locales/*.ts` prints nothing; row 130).

- [ ] **Step 5: The controls sheet still measures right**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: every line `ok`, exit 0 (the forms' checks measure the first field, which keeps its label and placeholder;
the buttons' checks measure a button's parts on its centre line, whatever its words).

- [ ] **Step 6: The gate and the commit**

Run: `git add src/ui/style-sample.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/ui/style-sample.ts src/entrypoints/controls/specimens/forms.tsx src/entrypoints/controls/specimens/buttons.tsx src/locales/zh-CN.ts src/locales/en.ts tests/ui/locales.test.ts $(grep -rl "@/ui/style-sample" src tests)
git status --short
git commit -m "refactor(ui): a style's sample moves out of the tiles, and the controls sheet reads the pages' words

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git status --short` before the commit shows only this task's files staged, and the three untracked spikes.)

### Task 97: the old components of `src/ui` retired, with their tests and their words (subagent)

The design's §2.3 retires `Menu`, `MenuField`, `Segmented`, `Switch`, `Button`, `Field`, `Confirm`, `Drawer` and
`src/ui/appearance/*`; Part 3's record adds `Spinner` and `LucideIcon`. They stay: `BrandMark.tsx` (the settings
sidebar), `menu-nav.ts` (`MenuList`'s and the settings page's combobox's keys), `service-items.ts`, `strings.ts` and
the rest of `src/ui`. One thing the old `Menu.tsx` holds is still read: the `MenuItem` type, the shape the service list
and the reader's language list are built in before a menu draws them.

**Files:**
- Delete: `src/ui/{Button,Confirm,Drawer,Field,LucideIcon,Menu,MenuField,Segmented,Spinner,Switch}.tsx`, every file left
  in `src/ui/appearance/`, `tests/ui/{menu,segmented,lucide-icon,advanced-css,profile-editor}.test.ts`
- Create: `src/ui/menu-item.ts`
- Modify: `src/ui/service-items.ts`, `src/pdf-reader/ui/languages.ts`, `tests/scripts/boundary.test.ts`,
  `src/entrypoints/options/ui/ColourPick.tsx`, `src/entrypoints/options/sections/StyleEditor.tsx` (a comment each),
  `src/locales/zh-CN.ts`, `src/locales/en.ts`, `src/ui/strings.ts`, `scripts/english-allowlist.txt`

**Interfaces:**
- Produces: `MenuItem` at `@/ui/menu-item` (moved verbatim from `src/ui/Menu.tsx`).

- [ ] **Step 1: Nothing outside the retired files imports them**

```bash
OLD='Button|Confirm|Drawer|Field|LucideIcon|Menu|MenuField|Segmented|Spinner|Switch'
grep -rnE "from '(@/ui|(\.\./)+ui)/($OLD)'|@/ui/appearance/" src tests experiments/pdf-bilingual/spikes \
  | grep -vE "^src/ui/($OLD)\.tsx:|^src/ui/appearance/|^tests/ui/(menu|segmented|lucide-icon|advanced-css|profile-editor)\.test\.ts:"
grep -nE "from '\./($OLD)'" src/ui/*.ts src/ui/*.tsx | grep -vE "^src/ui/($OLD)\.tsx:"
```

Expected exactly three lines: from the first, `src/pdf-reader/ui/languages.ts: import type { MenuItem } from
'@/ui/Menu'` and `tests/scripts/boundary.test.ts`'s specifier `'@/ui/appearance/Preview.tsx'` (a string the test
resolves, repointed in Step 4); from the second, `src/ui/service-items.ts: import type { MenuItem } from './Menu'`.
(The second `grep` reads only the files directly in `src/ui/`: a `./Button` inside `src/ui/controls/` is a shared
control of the same name.) Any other line: stop and report — a page still draws an old control.

- [ ] **Step 2: `MenuItem` moved**

`src/ui/menu-item.ts`:

```ts
// A menu's item as the surfaces' data layers build it — the service list (service-items.ts) and the reader's language
// list — before a menu draws it: the popup's view model and the reader's menus map it onto the shared MenuList's rows
// (@/ui/controls/MenuList). Moved from the old src/ui/Menu.tsx, retired with the redesign (its design, §2.3)
import type { CSSProperties } from 'react'
```

followed by `export interface MenuItem { … }` moved verbatim, its members' comments with it. Then
`src/ui/service-items.ts`: `import type { MenuItem } from './Menu'` becomes `import type { MenuItem } from './menu-item'`;
`src/pdf-reader/ui/languages.ts`: `import type { MenuItem } from '@/ui/Menu'` becomes
`import type { MenuItem } from '@/ui/menu-item'`.

- [ ] **Step 3: The words only the retired files read**

Before anything is deleted, list the keys they read:

```bash
FILES="$(ls src/ui/{Button,Confirm,Drawer,Field,LucideIcon,Menu,MenuField,Segmented,Spinner,Switch}.tsx src/ui/appearance/* 2>/dev/null)"
grep -ohE "\b(S|O|R)\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*" $FILES | sort -u > "$TMPDIR/axt-old-keys.txt"
wc -l < "$TMPDIR/axt-old-keys.txt"
```

Expected: a list of key paths (`O.reading.add`, `O.close`, …). Write it into the task's report.

- [ ] **Step 4: Delete the files**

```bash
git rm src/ui/{Button,Confirm,Drawer,Field,LucideIcon,Menu,MenuField,Segmented,Spinner,Switch}.tsx
git rm -r src/ui/appearance
git rm tests/ui/{menu,segmented,lucide-icon,advanced-css,profile-editor}.test.ts
```

In `tests/scripts/boundary.test.ts`, `expect(resolveSpecifier(FROM, '@/ui/appearance/Preview.tsx')).toBe('src/ui/appearance/Preview')`
becomes `expect(resolveSpecifier(FROM, '@/ui/controls/Button.tsx')).toBe('src/ui/controls/Button')` (the case reads a
file extension; its example file is gone).

The two comments on the settings page that name what goes (Part 5's record, row 110):
- `src/entrypoints/options/ui/ColourPick.tsx`, the one-line comment on `START`: `is held: today's ColorField's;`
  becomes `is held — the one the old style drawer's colour field started from;`;
- `src/entrypoints/options/sections/StyleEditor.tsx`, `CustomCss`'s comment, its last line: `(the reasoning of the
  drawer's AdvancedCss, which this replaces)` becomes `(as the old style drawer's box did, retired with the redesign)`.

- [ ] **Step 5: The keys nobody reads now go**

```bash
while read k; do grep -rqF "$k" src tests experiments/pdf-bilingual/spikes --exclude-dir=locales || echo "$k"; done < "$TMPDIR/axt-old-keys.txt"
```

Expected: the keys that only the deleted files named. Task 90 ran the loop on a trial of the merged tree (the settings
merge, with Task 96's move of `tiles.ts` and its `buttons.tsx` change assumed): `O.close`, `O.services.deleteConfirm`,
and `O.reading.{add, advancedHint, bandColor, color, custom, delete, done, editAria, editTitle, followText, name,
opacity, reset, resetHint}` — and two lines that are no key: `O.reading.previewSource.replace` and
`O.reading.previewTarget.replace`, a string method the old `Preview.tsx` called on two keys the settings page's style
rows and editor still read; skip them. Part 5's "Kept for Part 7" named more — `O.services.cancel`, `O.reading.duplicate`, `advanced`,
`preview` — which the new page reads (the service form's 取消, the style editor's 复制一份, 更多's content and
preview): they print nothing and stay. A prefix that is still read (`O.reading`) prints nothing and stays. Delete each
printed key from `src/locales/zh-CN.ts` and `src/locales/en.ts` (a key both packs hold; an object left empty goes with
its last key). Then:

Run: `pnpm typecheck`
Expected: exit 0. An error naming a deleted key is a reader the `grep` missed (a destructured object): put that key
back in both packs.

- [ ] **Step 6: What `strings.ts` exported for them alone**

Run: `for n in $(grep -oE "^export (function|const|let) [A-Za-z_]+" src/ui/strings.ts | awk '{print $3}'); do c=$(grep -rlw "$n" src --include='*.ts' --include='*.tsx' | grep -v "^src/ui/strings.ts$" | wc -l); echo "$n $c"; done`
Expected: every export with a count of at least 1. An export at 0 was read by the deleted files alone
(`git grep -lw <name> HEAD -- src` lists only deleted files): delete it, with the tests of it alone.

- [ ] **Step 7: The allowlist**

Run: `node scripts/check-english.mjs`
Expected: it names `src/ui/appearance/Preview.tsx` (an entry naming a file that is gone) and any deleted test file with
an entry: remove those lines from `scripts/english-allowlist.txt`, `git add scripts/english-allowlist.txt`, and run it
again: exit 0.

- [ ] **Step 8: Nothing of them left**

```bash
grep -rnE "from '(@/ui|(\.\./)+ui)/($OLD)'|@/ui/appearance/" src tests experiments/pdf-bilingual/spikes
grep -nE "from '\./($OLD)'" src/ui/*.ts src/ui/*.tsx
test -d src/ui/appearance && echo "appearance still there"
grep -rnE "ColorField|AdvancedCss|ProfileEditor|ProfileGrid" src tests
```

Expected: nothing from any of the four.

- [ ] **Step 9: The pages and the reader unchanged**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs && pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: 24 lines of `ok`; every controls line `ok`.

- [ ] **Step 10: The gate and the commit**

Run: `git add src/ui/menu-item.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/ui/menu-item.ts src/ui/service-items.ts src/pdf-reader/ui/languages.ts tests/scripts/boundary.test.ts src/entrypoints/options/ui/ColourPick.tsx src/entrypoints/options/sections/StyleEditor.tsx src/locales/zh-CN.ts src/locales/en.ts src/ui/strings.ts scripts/english-allowlist.txt
git status --short
git commit -m "refactor(ui): the old pages' components, their tests and their words retired

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(The `git rm`s of Step 4 are staged already; add by name any test file Step 6 changed.)

### Task 98: `ui.css`'s old tokens retired; the gallery on the roles; the hairline named `line`; `pages-pixels.mjs` retired (subagent)

**Files:**
- Modify: `src/styles/ui.css`, `tests/styles/ui-sheet.test.ts`, `src/entrypoints/gallery/main.tsx`
- Delete: `tests/e2e/probes/pages-pixels.mjs`

- [ ] **Step 1: Who still reads the old tokens and names**

```bash
grep -rnE "var\(--axt-(bg|card|fg|fg-2|line|control|accent|accent-soft|accent-fg)\)" src
grep -rnE "(^|[^a-z-])(bg|text|border|ring|outline|divide|fill|stroke|placeholder|decoration|from|to|via)-(bg|card|fg|fg-2|control|accent|accent-soft)([^a-z0-9-]|$)|rounded-(card|control)|font-ui|axt-spin|(bg|text|border|divide)-chrome-line" src --include='*.tsx' --include='*.ts' --include='*.css' --include='*.html'
grep -rnE "(^|[^a-z-])(bg|text|border|divide)-line([^a-z0-9-]|$)" src --include='*.tsx' --include='*.ts' --include='*.html'
```

Expected: the first prints only `src/styles/ui.css`'s own `@theme` lines; the second only
`src/entrypoints/gallery/main.tsx` (its root `bg-bg`, `font-ui`, `text-fg`; its heading's `text-fg-2`, `bg-control`,
`text-fg`) and `src/styles/ui.css`'s definitions; the third nothing but `src/core/ocr/recognise.ts:9`'s comment ("a text-line
orientation model": the words, not a class), or a new page's `*-line` that meant the old token (report it: it changes
colour below). Anything else in the first two: stop and report.

- [ ] **Step 2: The gallery on the roles**

In `src/entrypoints/gallery/main.tsx`:
- the root `<div className="min-h-screen bg-bg p-8 font-ui text-fg">` becomes `<div className="ui min-h-screen bg-page p-8">`
  (the pages' base gives the font and the ink);
- in each fixture's heading, `text-fg-2` becomes `text-ink-2`, `bg-control` becomes `bg-fill` and `text-fg` becomes
  `text-ink`;
- delete the comment `{/* transform-gpu makes each frame the containing block of the popup's fixed menu, as the popup window is */}`,
  and in the two frames' `className`s delete `transform-gpu ` and replace `shadow-[0_8px_24px_rgba(0,0,0,0.08)]` and
  `shadow-[0_8px_24px_rgba(0,0,0,0.3)]` each with `shadow-pop` (the menus are popovers in the top layer, which a
  transformed ancestor does not contain; the frame's own `data-theme` resolves the shadow's light or dark value).

- [ ] **Step 3: `ui.css` without the old pages**

In `src/styles/ui.css`:
- the first comment becomes:

  ```css
  /* The Tailwind entry for the extension's own pages — the popup, the settings page, the gallery and the controls sheet
     (the redesign's design, §2.2): the tokens generated from src/shared/tokens.ts, the controls the pages share, the
     roles as Tailwind's colours and shadows, and the pages' base. @theme must sit at the top level, never inside a media
     query (Tailwind v4), so the utilities name the variables through @theme inline and only the variables change with
     the theme */
  ```
- delete the comment `/* the extension's tokens (…): … the --axt- tokens below serve the old pages until then */`
  above the two imports (the imports stay);
- delete the three blocks that define `--axt-bg` … `--axt-accent-soft` (`:root, [data-theme="light"] { … }`, the
  `@media (prefers-color-scheme: dark) { … }` block and `[data-theme="dark"] { … }`), and the first
  `@theme inline { … }` block whole (`--color-bg` … `--font-ui` and its comment);
- in the remaining `@theme inline`, `--color-chrome-line: var(--chrome-line);` becomes `--color-line: var(--chrome-line);`,
  and its comment's `— but the hairline is \`chrome-line\`: \`line\` is the old pages' until Part 7 retires them` becomes
  `, the hairline \`line\` as the reader's sheet names it`;
- in the base's comment, `The old pages have no such root, and nothing here reaches them` goes (with its full stop);
- delete `@keyframes axt-spin { to { transform: rotate(360deg); } }` (Step 1 found no reader).

- [ ] **Step 4: Its test**

In `tests/styles/ui-sheet.test.ts`:
- delete the cases `'scopes the system\'s dark to a root where light was not chosen'` and `'places the top-level dark
  block after the light one, …'`: their subject has left the sheet — the generated `tokens.css` carries the same
  selectors, held by `tests/shared/tokens.test.ts` (`'writes the pages\' sheet with the reader\'s selectors: …'`);
- change the file's first comment to `// The extension pages' own sheet (the redesign's design, §2.2): the tokens and
  the shared controls imported, the roles named for Tailwind, and the pages' base`;
- add to the first `describe`:

  ```ts
    it('holds no token of the old pages: every colour a role of the generated sheet', () => {
      expect(SHEET).not.toMatch(/--axt-|--color-(bg|card|fg|fg-2|control|accent|accent-soft):|--radius-(card|control)|--font-ui/)
    })
  ```
- in `'names every role for the pages\' own layouts, and keeps the old pages\' names as they are'`: the title becomes
  `'names every role for the pages\' own layouts, the hairline as the reader names it'`; `'chrome-line'` leaves the
  `colours` list; `expect(SHEET).toContain('--color-line: var(--axt-line);')` becomes
  `expect(SHEET).toContain('--color-line: var(--chrome-line);')`;
- the second `describe`'s comment: `and nothing to a page without one — the old popup and settings page have none
  (tests/e2e/probes/pages-pixels.mjs holds their pixels)` becomes `and nothing to a page without one`.

Run: `pnpm vitest run tests/styles tests/shared`
Expected: PASS.

- [ ] **Step 5: `pages-pixels.mjs` retired**

```bash
git grep -n "pages-pixels" -- src tests scripts docs experiments/pdf-bilingual/spikes CLAUDE.md
git rm tests/e2e/probes/pages-pixels.mjs
```

Expected: the `git grep` prints only the probe's own lines (after Step 4, the sheet test names it no more). It reads
tracked files only: a plain `grep -rn` also finds the ignored Chromium profile `tests/e2e/.profile-pages-pixels/`,
whose logs hold the probe's name — not a reader of it.

- [ ] **Step 6: The built sheets**

```bash
pnpm build && pnpm exec wxt build --mode development
grep -lE -- "--axt-(bg|card|fg|fg-2|control|accent|accent-soft):" .output/chrome-mv3/chunks/*.css .output/chrome-mv3/assets/*.css .output/chrome-mv3-dev/chunks/*.css .output/chrome-mv3-dev/assets/*.css 2>/dev/null
for c in bg-page text-ink-2 bg-fill text-ink shadow-pop; do printf "%s " $c; cat .output/chrome-mv3-dev/chunks/*.css .output/chrome-mv3-dev/assets/*.css 2>/dev/null | grep -cE "\.$c ?\{"; done
```

Expected: the first `grep` prints nothing; each of the five gallery utilities is found (a count of at least 1) — a
count of 0 means the utility draws nothing (its role is not mapped): stop and report.

- [ ] **Step 7: The pages as they were, and the reader**

Run: `node tests/e2e/probes/popup-align.mjs && node tests/e2e/probes/controls.mjs && node tests/e2e/probes/settings-align.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: every line `ok` (popup-align and controls on the development build of Step 6, settings-align on the release
build); the reader 24 × `ok`. Look at `experiments/pdf-bilingual/out/popup/*-P1*.png`: the gallery's frames with their
shadow, the headings readable, both themes.

- [ ] **Step 8: The gate and the commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/styles/ui.css tests/styles/ui-sheet.test.ts src/entrypoints/gallery/main.tsx
git status --short
git commit -m "refactor(ui): the old pages' tokens retired, the gallery on the roles, the hairline named line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 99: the small fixes the ledgers parked (subagent)

Rows 5, 45, 46, 50, 57, 63 of the parked table, and what Task 90 wrote in from Parts 4 and 5 (Steps 8–11: rows 99,
109, 108, 101). One commit a step, each with the gate. Steps 8–11 run after Step 7, in their order; Step 8 comes before
any probe of Task 101 reads `align.mjs`.

**Files:**
- Modify: `src/ui/controls/{tip.tsx,modality.ts,Popover.tsx,radio.ts,Switch.tsx}`, `src/entrypoints/pdf-reader/reader.css`
- Modify: `src/ui/controls/Button.tsx`, `tests/ui/controls/button.test.ts`
- Modify: `src/shared/service-health.ts`
- Modify: `src/ui/service-items.ts` and the callers the compiler names
- Modify: `tests/e2e/probes/align.mjs` (Step 8)
- Modify: `src/config/storage.ts`, `src/shared/surface-config.ts`, `src/entrypoints/options/sections/Translate.tsx`,
  `tests/config/storage.test.ts`, `tests/options/translate-section.test.ts`, `docs/DESIGN.md` (Step 9)
- Modify: `src/entrypoints/options/ui/lists.ts`, `tests/options/controls.test.ts` (Step 10)
- Modify: `src/shared/page-action.ts`, `src/entrypoints/popup/view-model.ts`, `src/entrypoints/background/context-menu.ts`,
  `src/entrypoints/background/index.ts`, `tests/shared/page-action.test.ts`, `tests/entry/context-menu.test.ts`,
  `tests/popup/view-model.test.ts`, `tests/popup/view.test.ts` (Step 11)

**Interfaces** (Step 11):
- Produces: `keyMadeGood(session, rejected, saved): boolean` in `@/shared/page-action`; `pageAction(page,
  savedRevision, madeGood = false)` and `pageDecision(page, saved, madeGood = false)` (a third, optional parameter);
  `ToggleDeps.madeGood?(scope: string): Promise<boolean>` in `src/entrypoints/background/context-menu.ts`.

- [ ] **Step 1: The moved controls' comments (row 5)**

- `src/ui/controls/tip.tsx`: `(reader.css .tip)` becomes `(controls.css .tip)`, and the first line's `Tooltips (the
  reader's design, §6.1, §13)` becomes `Tooltips (the reader's design, §6.1, §13; shared by every surface since the
  redesign's §2.3)`.
- `src/ui/controls/modality.ts`: `reader.css takes those rings off while it is there` becomes `the sheets take those
  rings off while it is there (reader.css under .chrome, ui.css under .ui, controls.css in a menu's search)`.
- `src/ui/controls/Popover.tsx`: `// The reader's popovers (the reader's design, §6.7):` becomes `// Popovers (the
  reader's design, §6.7; every surface's since the redesign's §2.3):`.
- `src/ui/controls/radio.ts`: `for the display switch and the appearance:` becomes `for every radio group — the
  reader's display switch and appearance, the pages' segmented controls and lists:`.
- `src/ui/controls/Switch.tsx`: `// The reader's switch (the reader's design, §4.1):` becomes `// The switch (the
  reader's design, §4.1; every surface's since the redesign's §2.3):`.
- `src/entrypoints/pdf-reader/reader.css`'s first comment: `its own tokens, not the extension's ui.css,` becomes `the
  extension's tokens and shared controls (tokens.css, controls.css) and not the pages' ui.css,`.

Run: `grep -rn "reader.css" src/ui/controls`
Expected: nothing. Gate; commit `docs(ui): the shared controls' comments say where they live now`.

- [ ] **Step 2: The reader's sheet without the engine's comments (row 63)**

```bash
pnpm build && cp "$(ls .output/chrome-mv3/assets/pdf-reader-*.css | head -1)" "$TMPDIR/reader-before.css"
grep -oE "\.[A-Za-z_][A-Za-z0-9_-]*" "$TMPDIR/reader-before.css" | sort -u > "$TMPDIR/reader-before.sel"
grep -c "\.table{display:table}" "$TMPDIR/reader-before.css"
```

Expected: `1`. In `src/entrypoints/pdf-reader/reader.css`, after the line `@source "../../pdf-reader/";` add:

```css
/* not the engine's modules: they draw no utility, and Tailwind reads comments, which had put `.table { display: table }`
   into this sheet from one of theirs (the redesign's Part 3) */
@source not "../../pdf-reader/engine/";
```

```bash
pnpm build && grep -oE "\.[A-Za-z_][A-Za-z0-9_-]*" "$(ls .output/chrome-mv3/assets/pdf-reader-*.css | head -1)" | sort -u > "$TMPDIR/reader-after.sel"
comm -23 "$TMPDIR/reader-before.sel" "$TMPDIR/reader-after.sel"
comm -13 "$TMPDIR/reader-before.sel" "$TMPDIR/reader-after.sel"
```

Expected: the first `comm` prints the class names that left — `.table` and any other made from the engine's comments —
and the second nothing. For each one that left, `grep -rnw "<name without its dot>" src/pdf-reader/engine/*.mjs | grep -iE "class(Name|List)?"`
prints nothing (no engine code sets it). A name some engine code does set: stop and report. Then:

Run: `node experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs && pnpm vitest run tests/styles`
Expected: 24 × `ok`; every line `ok`; PASS (`no-has.test.ts` walks the reader's sources). Gate; commit
`fix(pdf-reader): the reader's sheet no longer reads the engine's comments`.

- [ ] **Step 3: No empty span for empty words (row 57)**

In `tests/ui/controls/button.test.ts`, after the case `'draws a Lucide icon before its words and the shortcut after
them, …'`, add:

```ts
  it('draws no span for empty words: an icon alone is the icon alone', async () => {
    const b = await button({ icon: Globe, 'aria-label': 'Globe', children: '' })
    expect([...b.children].map(c => c.tagName.toLowerCase())).toEqual(['svg'])
  })
```

Run: `pnpm vitest run tests/ui/controls/button.test.ts`
Expected: FAIL — `['svg', 'span']`.

In `src/ui/controls/Button.tsx`, `{children != null && <span>{children}</span>}` becomes
`{children != null && children !== '' && <span>{children}</span>}`.

Run it again: PASS. Gate; commit `fix(ui): a button draws no span for empty words`.

- [ ] **Step 4: `still`'s rule said (row 50)**

In `src/shared/service-health.ts`, the comment above `export async function markRejected` ends
`… it rejecting rejects this mark only`; append to that line a full stop and the sentence
`` `still` must itself ask for no mutation of this record: it runs inside the queue's turn, and a mutation it awaited
would wait for that turn to end, for ever `` (wrapped at 120 columns, the comment's ` */` after it). Gate; commit
`docs(background): the refusal check may not mutate the record it runs inside`.

- [ ] **Step 5: `serviceItems` without a default for the record (row 46)**

In `src/ui/service-items.ts`, `rejected: readonly string[] = []` becomes `rejected: readonly string[]`.

Run: `pnpm typecheck`
Expected: an error at every call that passed no record: the reader's `ServiceMenu` `onPick` (`serviceItems(config,
state.pack)`), and any test. Pass the record in hand at each: in `src/pdf-reader/ui/Menus.tsx`
`serviceItems(config, state.pack, rejected)`; in a test, the record it sets up, or `[]` where it sets up none. Run
`pnpm typecheck` again: exit 0. Gate; commit `refactor(ui): every service list is built with the record of refused keys`.

- [ ] **Step 6: The reader after Steps 1–5**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: 24 × `ok`.

- [ ] **Step 7: `Popover`'s `chrome` class is inert on the pages (row 45, carried)**

Run: `grep -nE "(^|[ ,{}>])\.chrome([ .:,{\[]|$)" src/styles/ui.css src/styles/controls.css src/entrypoints/popup/*.css src/entrypoints/options/ui/*.css src/entrypoints/controls/*.css 2>/dev/null`
Expected: nothing — the class the reader's popovers need names no rule on the pages. Write the result into the task's
report (it is row 45's evidence); no commit.

- [ ] **Step 8: An alignment check over nothing drawn fails (row 99)**

`offCentre` and `edges` (`tests/e2e/probes/align.mjs`) return nothing to report when their selector matches nothing
drawn, so `popup-align.mjs` and `controls.mjs` pass over a state that never drew (Part 4, Task 38's review; the main
ledger, line 187). Before Task 101's verification reads them:
- `offCentre` becomes `async`; its `page.evaluate` counts the rows it measures (`let measured = 0`, and `measured++`
  after the `if (!r.height || row.closest('[inert]')) continue` line) and returns `{ out, measured }`; after it:
  `if (!measured) throw new Error(\`offCentre: nothing drawn matches ${rows}\`)`, then `return out`;
- `edges` becomes `async`; its `page.evaluate` returns `{ found: [...found].sort((a, b) => a - b), measured: found.size }`;
  after it: `if (!measured) throw new Error(\`edges: nothing drawn matches ${items}\`)`, then `return found`;
- each doc comment gains a last sentence: `Throws when nothing drawn matches: a state that drew nothing is not aligned`.

The callers already `await` both. Run:

```bash
node --input-type=module -e "
import { edges, offCentre } from './tests/e2e/probes/align.mjs'
const page = { evaluate: async () => ({ out: [], found: [], measured: 0 }) }
for (const [name, run] of [['offCentre', () => offCentre(page, { rows: '.none' })], ['edges', () => edges(page, { items: '.none', frame: 'body' })]])
  await run().then(() => console.log(name, 'passed over nothing'), e => console.log(name, 'refused:', e.message))
"
pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs && node tests/e2e/probes/popup-align.mjs
```

Expected: `offCentre refused: offCentre: nothing drawn matches .none` and `edges refused: edges: nothing drawn matches
.none`; then every line of both probes `ok`, exit 0. A throw from a probe names a state or a menu that drew nothing: a
finding, reported with its line — the selector is not loosened. Gate; commit
`test(e2e): an alignment check over nothing drawn fails instead of passing`.

- [ ] **Step 9: `configFallbackReason()` retired (row 109)**

Since Part 5's `a9e97a3f` nothing in `src` calls it: a caller that acts on the verdict takes `readConfig()`, which
returns its own read's verdict with its value; the module-wide one — the latest read's to finish, whoever made it — is
the hazard round 5 took away (Part 5's ledger, lines 149–152).

```bash
grep -rn "configFallbackReason" src tests docs | grep -vE "^tests/config/storage\.test\.ts:|^tests/options/translate-section\.test\.ts:"
```

Expected exactly: `src/config/storage.ts` (the function, and `getConfig`'s comment), a comment in
`src/entrypoints/options/sections/Translate.tsx`, and §9's line in `docs/DESIGN.md`. A caller anywhere else: stop and
report.

In `src/config/storage.ts`:
- delete the comment `/** Why the latest \`getConfig()\` fell back; … */` with `let fallbackReason: FallbackReason | null = null`,
  and the comment `/** For the UI: did the configuration fall back to the defaults. … */` with
  `export function configFallbackReason(): FallbackReason | null { … }`;
- in `readConfig`'s comment, `in one answer, and the module's \`fallbackReason\` is left` / `as it was: a caller that
  acts on the verdict — the settings page gives an origin back only on a list it could read —` / `must not be handed
  another read's` become `in one answer: a caller that acts on the verdict — the settings page gives an origin back only
  on a list it could read — is never handed another read's (a module-wide verdict, the latest read's to finish, once
  was: the redesign's Part 5)`, wrapped at 120 columns;
- `getConfig` becomes:

  ```ts
  /** `readConfig()`'s value, for a caller that does not act on the verdict */
  export async function getConfig(): Promise<Config> {
    return (await readConfig()).config
  }
  ```
- in `setConfig`, the block `if (!readable.success) { fallbackReason = describeFallback(stored, readable.error.issues);
  throw new ConfigUnreadableError(fallbackReason) }` becomes the one line
  `if (!readable.success) throw new ConfigUnreadableError(describeFallback(stored, readable.error.issues))`;
- in `resetConfig`, the line `fallbackReason = null` goes.

In `src/shared/surface-config.ts`, `(storage.ts \`readConfig\`), not the module's latest:` becomes
`(storage.ts \`readConfig\`), never another read's:`. In `src/entrypoints/options/sections/Translate.tsx`,
`and not the module's latest (storage.ts \`configFallbackReason\`)` becomes `and never another read's`, the rest of the
comment as it is. In `docs/DESIGN.md` §9, `a read returns why beside the value it read (\`readConfig()\`; \`getConfig()\`
keeps its latest for \`configFallbackReason()\`)` becomes `a read returns why beside the value it read (\`readConfig()\`)`.

The tests read the verdict of the read itself:

```bash
perl -pi -e 's/\b(\w+)\.configFallbackReason\(\)/(await $1.readConfig()).fallbackReason/g' tests/config/storage.test.ts
```

then, by hand, in `tests/config/storage.test.ts`: the import drops `configFallbackReason, `; in
`describe('a read and its verdict (readConfig)', …)`, delete `pair` with its comment, and in each of the two round-5
cases the premise that used it (its comment where it has one, `const [paired] = await interleaved(…, pair)`,
`expect(paired)…` and the `vi.restoreAllMocks()` after it: the cases keep their `readConfig` interleaving); the third
case becomes:

```ts
  it('getConfig is readConfig\'s value', async () => {
    await fakeBrowser.storage.local.set({ config: BROKEN, config$: { v: CONFIG_VERSION } })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await getConfig()).toEqual(DEFAULT_CONFIG)
    await fakeBrowser.storage.local.set({ config: SOUND })
    expect(await getConfig()).toEqual(SOUND)
  })
```

In `tests/options/translate-section.test.ts`: the mock's comment becomes `// as storage.ts: a value it cannot read is
answered with the defaults, and \`readConfig\` with its read's verdict`; the mock loses `let reason …`, `reason =
reading.fallbackReason; ` in its `getConfig` and the member `configFallbackReason: () => reason,`; the import
`{ configFallbackReason, getConfig }` becomes `{ getConfig }`; in the round-5 case, `// the premise: the other read ran
inside the commit's, and the latest verdict is its own, readable` becomes `// the premise: the other read ran inside the
commit's, finding the value readable`, and `expect(configFallbackReason()).toBeNull()` goes.

```bash
grep -rn "configFallbackReason" src tests docs
pnpm vitest run tests/config tests/options tests/popup tests/shared
```

Expected: the `grep` prints nothing; PASS, with as many cases as before in both test files (none deleted, one
retitled). A case that fails after the `perl` is one whose stored value changed between its `getConfig()` and its look:
read the verdict where the value was read (`const { config, fallbackReason } = await fresh.readConfig()`); never
loosen an expectation. Gate (the English gate's counts unchanged); commit
`refactor(config): the module-wide fallback verdict retired; a read's own is readConfig's`.

- [ ] **Step 10: `withItem` retired (row 108)**

```bash
grep -rn "withItem\|withProfile" src tests
```

Expected: `src/entrypoints/options/ui/lists.ts` (the export, and its comment naming the old drawer's `withProfile`) and
`tests/options/controls.test.ts` (its import and two `expect` lines). Anything else: stop and report.

In `src/entrypoints/options/ui/lists.ts`, delete the comment `/** A list with an edited item written into it — … */`
and `export const withItem = …` (two lines). In `tests/options/controls.test.ts`, `import { insertAt, withItem, withUndo }`
becomes `import { insertAt, withUndo }`, and the two `expect(withItem(…))` lines go.

Run: `grep -rn "withItem" src tests && echo left; pnpm vitest run tests/options`
Expected: no `left`; PASS. Gate; commit `refactor(options): withItem retired, without a caller since the prompts' fix round`.

- [ ] **Step 11: The key does the retranslate cue too (row 101)**

Part 4's popup offers P6b's way back — a page on the free service since its service's key was refused, the key made
good since — as P13's pair, 重新翻译 first; but ⌥T, the context menu and the floating button's main button, which decide
with the popup in `shared/page-action.ts` ("the key does what the button shows", the maintainer, 2026-09-11), still
restore there, so the popup put the key's chip on 显示原文. Part 4's plan left "the key doing the cue too" to
`shared/page-action.ts`, for every door; Part 6 did not take it; Part 4's record gives it to Part 7. After this step
P6b's faces are P13's: the key retranslates, its chip on 重新翻译.

Tests first. In `tests/shared/page-action.test.ts`, `keyMadeGood` joins the import, and inside `describe('pageDecision', …)`
after its last case:

```ts
  it('the retranslate cue: a running page whose refused key was made good re-translates, only on settings that run on their own; any other page decides as before', () => {
    const on = { progress: progress('on'), running: running('r1') }
    expect(pageDecision(on, saved(), true)).toEqual({ action: 'retranslate', behind: false, enabled: true })
    expect(pageDecision(on, saved({ canRun: false, fallback: true }), true)).toEqual({ action: 'retranslate', behind: false, enabled: false })
    expect(pageDecision(on, saved())).toEqual({ action: 'restore', behind: false, enabled: true })
    expect(pageDecision({ progress: progress('idle') }, saved({ canRun: false, fallback: true }), true)).toEqual({ action: 'translate', behind: false, enabled: true })
  })
```

and after that `describe`:

```ts
describe('keyMadeGood', () => {
  const session = { providerId: 'svc-a', demotions: [{ id: 'svc-a', kind: 'auth' as const }] }
  const back = { engine: { id: 'svc-a' } }

  it('the session left its own service for a refused key, the record no longer holds it, and the chain a start would run on runs it again', () => {
    expect(keyMadeGood(session, [], back)).toBe(true)
    expect(keyMadeGood({ ...session, demotions: [{ id: 'svc-a', kind: 'auth' as const }, { id: 'microsoft', kind: 'rate-limit' as const }] }, new Set<string>(), back)).toBe(true)
  })

  it('no cue while the record holds the service, while the chain in force still passes it over, for a hand-over that was not the key\'s, or without a session', () => {
    expect(keyMadeGood(session, ['svc-a'], back)).toBe(false)
    expect(keyMadeGood(session, [], { engine: { id: 'google-web', demoted: { id: 'svc-a', kind: 'auth' as const, message: '403' } } })).toBe(false)
    expect(keyMadeGood({ ...session, demotions: [{ id: 'svc-a', kind: 'rate-limit' as const }] }, [], back)).toBe(false)
    expect(keyMadeGood(null, [], back)).toBe(false)
  })
})
```

In `tests/entry/context-menu.test.ts`, inside `describe('the toggle tells whether it acted …')`, after its last case:

```ts
  it('the retranslate cue: where the popup offers the way back to a key made good, the toggle re-translates too (UI.md P6b)', async () => {
    const page = { ...progress('on'), session: 's1' }
    const cued = { ...deps(page, { revision: null, canRun: true, fallback: false }), madeGood: vi.fn(async () => true) }
    expect(await toggleTranslation(cued as never, 7)).toBe(true)
    expect(cued.madeGood).toHaveBeenCalledWith('s1')
    expect(cued.send).toHaveBeenLastCalledWith(7, { type: 'axt:translate-page', restart: true })
    const plain = { ...deps(page, { revision: null, canRun: true, fallback: false }), madeGood: vi.fn(async () => false) }
    expect(await toggleTranslation(plain as never, 7)).toBe(true)
    expect(plain.sent).toEqual(['axt:page-status', 'axt:restore-page'])
  })
```

In `tests/popup/view-model.test.ts`, the case `'P6b the key made good …, the key\'s chip on showing the original (the
retranslate cue)'` is retitled `'P6b the key made good while the page runs on the free service: P13\'s pair offers the
way back, with the key, which retranslates too (the retranslate cue)'`, and in it and in the case `'two hand-overs — …'`
the two expectations become:

```ts
    expect(v.primary).toEqual({ label: '重新翻译', action: 'retranslate', disabled: false, shortcut: '⌥T' })
    expect(v.secondary).toEqual({ label: '显示原文', action: 'restore' })
```

In `tests/popup/view.test.ts`, the P6b case's title ends `— Translate again with the key, and Show original (the
retranslate cue)` and its chip line becomes `expect(pair.map(b => b.querySelector('kbd')?.textContent ?? null)).toEqual(['⌥T', null])`.

Run: `pnpm vitest run tests/shared/page-action.test.ts tests/entry/context-menu.test.ts tests/popup/view-model.test.ts tests/popup/view.test.ts`
Expected: FAIL — `keyMadeGood` is not exported, the toggle restores the cued page, and the chip is on 显示原文.

Then the code:
- `src/shared/page-action.ts` gains, after `behindSettings`:

  ```ts
  /**
   * The retranslate cue (UI.md P6b), asked by the popup's view model and by the toggle: the page's session left its own
   * service for a refused key (`auth` among its hand-overs — `demotions`, since `engine.demoted` names only the most
   * recent), and that key has been made good since: the record holds the service no more, and the chain a start would
   * run on runs it again. The saved chain is the test: a 403 is `auth` too and never recorded
   * (background/health-guard.ts marks a 401 alone), and while the chain in force still passes the service over, a start
   * would meet the same refusal
   */
  export function keyMadeGood(
    session: Pick<ProviderStatus, 'providerId' | 'demotions'> | null | undefined,
    rejected: Iterable<string>,
    saved: Pick<ProviderStatus, 'engine'> | null | undefined,
  ): boolean {
    const refused = session?.demotions.find(d => d.kind === 'auth' && d.id === session.providerId)
    return !!refused && !new Set(rejected).has(refused.id) && saved?.engine.id === refused.id && !saved.engine.demoted
  }
  ```

  `pageAction` takes a third parameter `madeGood = false` and its running branch becomes
  `if (state === 'on') return behindSettings(page, savedRevision) || madeGood ? 'retranslate' : 'restore'`; its comment
  gains `A running page the retranslate cue holds (keyMadeGood) re-translates too: the key does what the popup's button
  offers there (P6b).` `pageDecision` takes `madeGood = false` too, passes it to `pageAction`, and decides `enabled`
  with `const cued = madeGood && page.progress.state === 'on'` as
  `action === 'restore' ? true : behind || cued ? saved.canRun : saved.canRun || saved.fallback`; its comment gains
  `So does the cue: the way back is the reader's own service, never a fallback.`
- `src/entrypoints/popup/view-model.ts`: the import becomes `import { keyMadeGood, pageDecision } from '@/shared/page-action'`;
  the cue's comment and its two lines (`const refused = …`, `const madeGood = …`) move above `const decision`, the
  comment's sentence `The key still restores (shared/page-action.ts decides for every door), so its chip goes on Show
  original.` becoming `The toggle asks the same (shared/page-action.ts keyMadeGood): the key, the context menu and the
  floating button retranslate there as this button does.`, and the two lines becoming
  `const madeGood = keyMadeGood(on ? session : null, rejected, saved)`; `pageDecision(page, { … })` gains `, madeGood`
  as its third argument; the faces lose the cue's branch — `let primary` / `let secondary`, the comment `// behind the
  settings as well …`, `if (madeGood && !behind) { … } else {` and its closing `}` go, and what the `else` held stays,
  with `secondary = behind || paused ? …` becoming `secondary = behind || paused || madeGood ? …` (declare both with
  `const`).
- `src/entrypoints/background/context-menu.ts`: `ToggleDeps` gains

  ```ts
    /**
     * Whether the page's session (its `session` id) runs on another engine for a refused key made good since: the
     * retranslate cue (UI.md P6b, shared/page-action.ts keyMadeGood). Absent, never
     */
    madeGood?(scope: string): Promise<boolean>
  ```

  and `toggleTranslation` asks the page for `Pick<PageStatus, 'progress' | 'running' | 'epoch' | 'session'>`, then,
  before its decision:

  ```ts
      // The retranslate cue: where the popup offers the way back to a key made good, the key re-translates as its button
      // does (UI.md P6b). Asked of a running page only; a failed ask is no cue
      const madeGood = status?.progress.state === 'on' && status.session && deps.madeGood ? await deps.madeGood(status.session).catch(() => false) : false
  ```

  and passes `madeGood` as `pageDecision`'s third argument.
- `src/entrypoints/background/index.ts`: `keyMadeGood` joins the import of `savedFromStatus`; after `saved`:

  ```ts
    /**
     * The retranslate cue for the toggle (UI.md P6b, shared/page-action.ts keyMadeGood): the page's session's own chain,
     * the refused-key record and the chain in force, read as the popup reads them
     */
    const madeGood = async (scope: string): Promise<boolean> => {
      const own = router.transportFor(scope)
      if (!own) return false
      const [session, rejected, inForce] = await Promise.all([own.status(), rejectedServices(), statusInForce(chain)])
      return keyMadeGood(session, rejected, inForce.status)
    }
  ```

  and every door takes it: `menuDeps` and `installToggleCommand`'s deps gain `madeGood,` after `saved,`, and the
  floating button's `toggle: tabId => toggleTranslation({ send: sendToTab, saved }, tabId)` becomes
  `toggle: tabId => toggleTranslation({ send: sendToTab, saved, madeGood }, tabId)`.

```bash
pnpm vitest run tests/shared/page-action.test.ts tests/entry/context-menu.test.ts tests/popup tests/background
grep -n "still restores" src/entrypoints/popup/view-model.ts
pnpm build && pnpm e2e:floating
```

Expected: PASS; nothing from the `grep`; `pnpm e2e:floating` every line PASS (the floating button's main button is the
toggle's door a browser suite drives — its translate and its restore must decide as before; the native menu and the
keyboard command are held by `tests/entry/context-menu.test.ts`; a failure is re-run once before it counts). Gate;
commit
`feat(ui): the key retranslates where the popup offers a refused key's way back, on every door`. Task 104 writes P6b's
faces into UI.md (S-P-52, S-P-53).

### Task 100: two probes for what the parts' probes leave (subagent)

`settings-align.mjs` shoots the settings page at 320 px and at 640 px (a 1280 px window at 200 %); `popup-align.mjs`
shoots every popup state at twice the pixels. Left: the popup's own window at 200 % zoom, and the surfaces on arXiv's
pages — the floating button, its menu, its panel with the popup in it, the figure viewer — at 200 % and 400 % zoom
(640 and 320 CSS px of a 1280 px window: WCAG's reflow width). And nothing audits the extension's own pages with axe
(`e2e:a11y` audits arXiv's pages, A against B), which Part 5's parked `<h1>` question needs.

**Files:**
- Create: `tests/e2e/probes/reflow-shots.mjs`, `tests/e2e/probes/pages-a11y.mjs`

**Interfaces:**
- Produces: `pnpm build && node tests/e2e/probes/reflow-shots.mjs` → `experiments/pdf-bilingual/out/reflow/*.png`, exit 1
  on a part outside the window, a popup scrolling sideways, a viewer bar outside its dialog or buttons overlapping;
  `pnpm exec wxt build --mode development && node tests/e2e/probes/pages-a11y.mjs` → exit 1 on a serious or critical axe
  violation inside the popup (the gallery) or on the settings page.

- [ ] **Step 1: `tests/e2e/probes/reflow-shots.mjs`**

```js
// The redesign's surfaces at 200 % and 400 % zoom (its design, §9, §12: every surface reflows at 200 % zoom and at 320 px
// of width). The settings page and the popup's states have their own probes at those widths and at twice the pixels
// (settings-align.mjs, popup-align.mjs); this one takes what they leave. The toolbar popup at 200 %: its window grows with
// the zoom, so it is its own 320 px at twice the pixels, and nothing may scroll sideways. On an arXiv paper at 200 % and
// 400 % — a 1280 px window is 640 and 320 CSS px wide there — the floating button at rest and open, its close menu, its
// panel with the popup inside, and the figure viewer's control, dialog and bar, in both themes: every part inside the
// window, the popup in the panel not scrolling sideways, the bar inside its dialog and its buttons apart. The shots, in
// experiments/pdf-bilingual/out/reflow/, are for reading at full size. Needs the network (arXiv).
//   pnpm build && node tests/e2e/probes/reflow-shots.mjs
// Environment: AXT_EXT_DIR another build; AXT_PAPER another paper; AXT_CHROME another Chrome.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/reflow/', import.meta.url))
const PROFILE = `${E2E}.profile-reflow-shots`
const PAPER = process.env.AXT_PAPER ?? '1706.03762'
const [WIDTH, HEIGHT] = [1280, 860]
const STILL = { animations: 'disabled', caret: 'hide' }
/** where a press closes what is open without reaching a link: the page's own margin */
const ASIDE = { x: 1, y: Math.round(HEIGHT / 2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: WIDTH, height: HEIGHT },
})
context.setDefaultNavigationTimeout(90_000)
const page = context.pages()[0] ?? (await context.newPage())
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extensionId = new URL(worker.url()).host

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
/** The extension's appearance, written into its configuration once the extension has written one */
const setTheme = theme => worker.evaluate(async theme => {
  for (let i = 0; i < 100; i++) {
    const { config } = await chrome.storage.local.get('config')
    if (config) return chrome.storage.local.set({ config: { ...config, theme } })
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('no configuration after 10 s')
}, theme)
/** The active tab's zoom, as a reader's ⌘+ sets it */
const zoomTo = factor => worker.evaluate(async zoom => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  await chrome.tabs.setZoom(tab.id, zoom)
}, factor)
/** The centre of a part of the floating button, or null while it is not drawn */
const partAt = selector => page.evaluate(selector => {
  const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector(selector)?.getBoundingClientRect()
  return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
}, selector)
/** Every part of the floating button that is drawn, in the page's CSS pixels, and the window's size in the same */
const dockBoxes = () => page.evaluate(() => {
  const root = document.querySelector('.axt-floating')?.shadowRoot
  if (!root) return null
  const parts = {}
  for (const selector of ['.axt-fb-main', '.axt-fb-panel', '.axt-fb-settings', '.axt-fb-options', '.axt-fb-lock', '.axt-fb-menu', '.axt-fb-panel-box']) {
    const el = root.querySelector(selector)
    if (!el || el.hidden) continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0) parts[selector] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
  return { parts, width: innerWidth, height: innerHeight }
})
const round = box => Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]))
const within = (a, b) => !!a && !!b && a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5
const apart = boxes => boxes.every((a, i) => boxes.every((b, j) => j <= i || a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5))

for (const theme of ['light', 'dark']) {
  await setTheme(theme)

  // The toolbar popup at 200 %: popup.html in a tab of 640 × 600 zoomed twice is the popup's 320 CSS px
  {
    const popup = await context.newPage()
    await popup.setViewportSize({ width: 640, height: 600 })
    await popup.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.bringToFront()
    await zoomTo(2)
    await sleep(1200)
    const fit = await popup.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
    check(`${theme}: the toolbar popup at 200 % scrolls nothing sideways`, fit.content <= fit.width, JSON.stringify(fit))
    await popup.screenshot({ path: join(OUT, `${theme}-popup-200.png`), ...STILL })
    await zoomTo(1)
    await popup.close()
  }

  for (const zoom of [2, 4]) {
    const tag = `${theme}-${zoom * 100}`
    await page.bringToFront()
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
    await page.evaluate(value => localStorage.setItem('ar5iv_theme', value), theme)
    await page.reload({ waitUntil: 'load' })
    await sleep(4000)
    await zoomTo(zoom)
    await sleep(1500)
    const shot = async name => {
      await sleep(300)
      await page.screenshot({ path: join(OUT, `${tag}-${name}.png`), ...STILL })
    }
    const inside = async name => {
      const boxes = await dockBoxes()
      if (!boxes) return check(`${tag} ${name}: the floating button is drawn`, false, 'no .axt-floating')
      const out = Object.entries(boxes.parts).filter(([, r]) => !within(r, { left: 0, top: 0, right: boxes.width, bottom: boxes.height }))
      check(`${tag} ${name}: every part of the floating button inside the window`, out.length === 0, out.map(([s, r]) => `${s} ${JSON.stringify(round(r))} in ${boxes.width} × ${boxes.height}`).join('; '))
    }

    await page.mouse.move(ASIDE.x, ASIDE.y)
    await sleep(600)
    await inside('rest')
    await shot('rest')
    const main = await partAt('.axt-fb-main')
    if (!main) { check(`${tag}: the floating button's main button`, false); continue }
    await page.mouse.move(main.x, main.y, { steps: 3 })
    await sleep(800)
    await inside('open')
    await shot('open')

    const close = await partAt('.axt-fb-options')
    if (close) {
      await page.mouse.click(close.x, close.y)
      await sleep(300)
      await inside('menu')
      await shot('menu')
      await page.mouse.click(ASIDE.x, ASIDE.y)
    } else check(`${tag}: the close control`, false)

    await page.mouse.move(main.x, main.y, { steps: 3 })
    await sleep(800)
    const panel = await partAt('.axt-fb-panel')
    if (panel) {
      await page.mouse.click(panel.x, panel.y)
      await sleep(2500)
      await inside('panel')
      const frame = page.frames().find(f => f.url().includes('/popup.html'))
      const fit = frame ? await frame.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })) : null
      check(`${tag} panel: the popup in its frame scrolls nothing sideways`, !!fit && fit.content <= fit.width, JSON.stringify(fit))
      await shot('panel')
      await page.mouse.click(ASIDE.x, ASIDE.y)
    } else check(`${tag}: the panel button`, false)

    await page.mouse.move(ASIDE.x, ASIDE.y)
    await sleep(600)
    // The figure viewer over the paper's first figure wide enough, its top just below what the page pins at the top
    const figure = await page.evaluate(() => {
      const image = [...document.querySelectorAll('.ltx_figure img')].find(i => i.getBoundingClientRect().width >= 100)
      if (!image) return null
      image.scrollIntoView({ block: 'start' })
      const pinned = [...document.querySelectorAll('body *')].filter(e => /^(fixed|sticky)$/.test(getComputedStyle(e).position))
        .map(e => e.getBoundingClientRect()).filter(r => r.top <= 1 && r.bottom > 0 && r.bottom < innerHeight / 2)
      window.scrollBy(0, -(Math.max(0, ...pinned.map(r => r.bottom)) + 24))
      const r = image.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) }
    })
    if (!figure) { check(`${tag}: a figure for the viewer`, false); continue }
    await page.mouse.move(figure.x, figure.y, { steps: 4 })
    await sleep(500)
    const control = await page.evaluate(() => {
      const r = document.querySelector('.axt-viewer-spot')?.shadowRoot?.querySelector('.axt-viewer-open')?.getBoundingClientRect()
      return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, width: innerWidth, height: innerHeight } : null
    })
    if (!control) { check(`${tag}: the viewer's control over a figure`, false); continue }
    check(`${tag}: the viewer's control inside the window`, within(control.box, { left: 0, top: 0, right: control.width, bottom: control.height }), JSON.stringify(round(control.box)))
    await shot('viewer-control')
    await page.mouse.click(control.x, control.y)
    await sleep(700)
    const viewer = await page.evaluate(() => {
      const root = document.querySelector('.axt-viewer')?.shadowRoot
      const box = el => { const r = el?.getBoundingClientRect(); return r && r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
      return { dialog: box(root?.querySelector('dialog')), bar: box(root?.querySelector('.axt-viewer-bar')), buttons: [...(root?.querySelectorAll('.axt-viewer-bar button') ?? [])].map(box).filter(Boolean), width: innerWidth, height: innerHeight }
    })
    check(`${tag}: the viewer's dialog inside the window, its bar inside it, the bar's three buttons apart`,
      within(viewer.dialog, { left: 0, top: 0, right: viewer.width, bottom: viewer.height }) && within(viewer.bar, viewer.dialog) && viewer.buttons.length >= 3 && viewer.buttons.every(b => within(b, viewer.bar)) && apart(viewer.buttons),
      JSON.stringify({ dialog: viewer.dialog && round(viewer.dialog), bar: viewer.bar && round(viewer.bar), buttons: viewer.buttons.map(round) }))
    await shot('viewer')
    await page.keyboard.press('Escape')
    await zoomTo(1)
  }
}
await context.close()
console.log(`shots in ${OUT}`)
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: `tests/e2e/probes/pages-a11y.mjs`**

```js
// Axe on the extension's own pages after the redesign (its design, §9): the popup in every state the gallery draws —
// light and dark side by side — and the settings page's four sections, a search, the service form and the style editor
// open, in both themes and both languages. `e2e:a11y` audits arXiv's pages, A against B; nothing else audits these. The
// gate is no serious or critical violation inside the popup or on the settings page; the rest are printed for the record.
// The gallery is a development page:
//   pnpm exec wxt build --mode development && node tests/e2e/probes/pages-a11y.mjs
// Environment: AXT_EXT_DIR another build; AXT_CHROME another Chrome.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const PROFILE = `${E2E}.profile-pages-a11y`
rmSync(PROFILE, { recursive: true, force: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1300, height: 1100 },
})
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extensionId = new URL(worker.url()).host
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let failed = 0

/** A patch on the configuration the extension wrote at install */
const patch = change => worker.evaluate(async change => {
  for (let i = 0; i < 100 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, ...change } })
}, change)

/** Axe on the page as it is; `scope` keeps the nodes inside it (the gallery's own frame is not the product) */
async function audit(name, scope) {
  await page.mouse.move(2, 2)
  await sleep(300)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const ours = []
  for (const v of violations) {
    const kept = await Promise.all(v.nodes.map(n => page.evaluate(([selector, scope]) => !scope || !!document.querySelector(selector)?.closest(scope), [n.target.join(' '), scope]).catch(() => true)))
    const nodes = v.nodes.filter((_, i) => kept[i])
    if (nodes.length) ours.push({ id: v.id, impact: v.impact, n: nodes.length, first: nodes[0].target.join(' ') })
  }
  const serious = ours.filter(v => v.impact === 'serious' || v.impact === 'critical')
  const rest = ours.filter(v => !serious.includes(v))
  console.log(`${serious.length ? 'FAIL' : 'ok  '} ${name}${serious.length ? ` — ${serious.map(v => `${v.id}×${v.n} ${v.first}`).join('; ')}` : ''}${rest.length ? ` (also ${rest.map(v => `${v.impact}:${v.id}×${v.n}`).join(', ')})` : ''}`)
  failed += serious.length
}
const open = async hash => {
  await page.goto(`chrome-extension://${extensionId}/options.html#${hash}`)
  await page.waitForSelector('main [data-card]')
  await sleep(500)
}

for (const lang of ['zh-CN', 'en']) {
  await patch({ uiLanguage: lang })
  await page.goto(`chrome-extension://${extensionId}/gallery.html`)
  await page.waitForSelector('main.popup')
  await sleep(800)
  await audit(`${lang}: the popup, every state, light and dark (the gallery)`, 'main.popup')
  for (const theme of ['light', 'dark']) {
    await patch({ theme })
    for (const section of ['translate', 'appearance', 'reading', 'data']) {
      await open(section)
      await audit(`${lang}, ${theme}: settings, ${section}`)
    }
    await open('translate')
    await page.locator('[data-row="translate/services"] > button[data-srow]').last().click()
    await page.waitForSelector('form[data-form="service"]')
    await audit(`${lang}, ${theme}: settings, the service form open`)
    await open('appearance')
    const style = page.locator('[data-row="appearance/styles"] > [data-srow]').nth(1)
    await style.hover()
    await style.locator('[data-icon-button]').click()
    await sleep(400)
    await audit(`${lang}, ${theme}: settings, a style's editor open`)
    await page.locator('.o-search input').fill('PDF')
    await sleep(400)
    await audit(`${lang}, ${theme}: settings, a search`)
  }
}
await context.close()
for (const e of errors) console.log(`FAIL page error — ${e}`)
process.exit(failed || errors.length ? 1 : 0)
```

The settings page's selectors are those Part 5's `settings-align.mjs` uses (`main [data-card]`, `[data-srow]`,
`[data-icon-button]`, `form[data-form="service"]`, `.o-search input`); if the merged page names them otherwise, take the
ones `tests/e2e/probes/settings-align.mjs` uses on the merged tree.

- [ ] **Step 3: Run both**

```bash
git add tests/e2e/probes/reflow-shots.mjs tests/e2e/probes/pages-a11y.mjs && node scripts/check-english.mjs
pnpm build && node tests/e2e/probes/reflow-shots.mjs
pnpm exec wxt build --mode development && node tests/e2e/probes/pages-a11y.mjs
```

Expected: the English gate names neither file (they hold no Chinese); both probes run to the end. A `FAIL` is a finding,
not a probe to loosen: look at its shot, and report it with its line — a geometry that is right and a check that is
wrong (a bar drawn outside its dialog's box by design) goes to the controller before the check changes. Task 101 fixes
or reports what they find.

- [ ] **Step 4: The gate and the commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git commit -m "test(e2e): the arXiv-page surfaces at 200 and 400 per cent zoom, and axe on the extension's own pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 101: verification on the merged tree (subagent)

§12, every item, on the tree after Tasks 91–100. Each command judged by its exit code; a browser suite that fails is
run once more before the failure counts (they reach arXiv and a free translator), and reported with its line if it
fails twice. Every number goes into the report: the counts are the documents' (Task 105) and the pull request's.

- [ ] **Step 1: The gates**

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm vitest run tests/shared/contrast.test.ts tests/shared/tokens.test.ts tests/styles --reporter=verbose | tail -5
```

Expected: exit 0; the unit count (for the record); the contrast gate's every pair at or above its floor (§12's table),
the token sheet in sync, `no-has` over the injected sheets.

- [ ] **Step 2: The migration's cases (§12)**

Run: `pnpm vitest run tests/config/storage.test.ts --reporter=verbose | grep -E "v20|preload|margin|image translation is one switch|unticked|hand-edited|whole"`
Expected, each passing, written into the report against §12's list: each preload value (`'a stored margin, whatever it
was, reads as on demand; …'`, `'the whole paper is written and read back as it is'`); both appearances and one no theme
holds (`'v20 makes the reader's appearance the extension's theme …'`, `'v20 carries a light or a system appearance …'`);
image modes present and absent (`'image translation is one switch …'`, `'a reader who had unticked every display keeps
figure translation off …'`); a configuration the migration cannot read (`'v20 leaves a hand-edited pdfReader …'`, `'a
hand-edited margin …'`, `'a hand-edited image that is not an object …'`).

- [ ] **Step 3: The reader**

```bash
node experiments/pdf-bilingual/spikes/reader-pixels.mjs
node experiments/pdf-bilingual/spikes/reader-ui.mjs
node experiments/pdf-bilingual/spikes/entries.mjs
```

Expected: 24 × `ok`; every line `ok`; every line `ok`. `reader-pixels.mjs` mismatched once on `dark-toolbar.png` under
Part 5's parallel load and never again (row 126): a mismatch here is not rerun away — it goes to Step 7 with the
probe's diff image and the load average.

Then the five reader spikes Part 5 edited but could not run (row 124): they read the local corpus
(`experiments/pdf-bilingual/data/corpus/`, in this worktree) and compile through the TeX Live file server on :8070.

```bash
open -a Docker
docker info >/dev/null 2>&1 && echo "engine up"
docker start texlive-server && docker ps --filter name=texlive-server --format '{{.Names}} {{.Status}}'
pnpm build
node experiments/pdf-bilingual/spikes/cache-faults.mjs
node experiments/pdf-bilingual/spikes/cache-revisit.mjs
node experiments/pdf-bilingual/spikes/viewer-faults.mjs
node experiments/pdf-bilingual/spikes/reader-a11y.mjs
node experiments/pdf-bilingual/spikes/reader-ui-live.mjs
```

Expected: `engine up` (until it prints, Docker is still starting: run that line again); `texlive-server` and
`texlive-server Up …`; the build exit 0; each spike's last line `all passed`, exit 0. A spike that fails on a service
it seeds (`seedService`, which Part 5 put in place of the form the page no longer offers) is Part 5's edit: fixed in
Step 7, test first where a unit test can hold it.

- [ ] **Step 4: The browser suites**

```bash
pnpm e2e && pnpm e2e:popup && pnpm e2e:pdf && pnpm e2e:floating && pnpm e2e:a11y
pnpm e2e:layout && pnpm e2e:image && pnpm e2e:local-endpoint
```

Expected: every suite's lines `PASS`, exit 0; each suite's count in the report.

`pnpm e2e:pdf` is watched (row 125): in Part 5 it failed 4 checks once — the popup's page state missing on
hep-th/9711200's PDF and on the abstract page (the label `null`, the no-paper screen drawn) — and passed 26/26 on the
rerun. Run it a second time whatever the first run said, and write both runs' counts into the report. A failure of
those checks in either run is not rerun away: it goes to Step 7 as a finding about the popup's first answer on an entry
page (`src/entrypoints/popup/state.ts`'s entry status, `ENTRY_CHECK_MS` in `data.ts`), with the failing lines.

- [ ] **Step 5: The alignment and the looks, both themes and both languages**

```bash
node tests/e2e/probes/settings-align.mjs
node tests/e2e/probes/reflow-shots.mjs
pnpm exec wxt build --mode development
node tests/e2e/probes/popup-align.mjs
node tests/e2e/probes/controls.mjs
node tests/e2e/probes/pages-a11y.mjs
```

Expected: `every row on its lines, in both themes and both languages`; every reflow line `ok`; every popup-align line
`ok` (the centre lines within 0.5 px, the edges at 12 and 24, at rest, hovered and each menu open — and, since Task 99
Step 8, nothing measured over a state that drew nothing); every controls line `ok`; no pages-a11y `FAIL` (its `also`
lines in the report).

Then the search's own words (row 84), on the release build, in the Chinese interface — `language` can match only the
interface language's keyword (§6.1's example), and `图中译文` only the dimming sub-row's description:

```bash
pnpm build && node --input-type=module -e '
import { chromium } from "playwright"
const EXT = `${process.cwd()}/.output/chrome-mv3`
const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent("serviceworker")]
await worker.evaluate(async () => {
  for (let i = 0; i < 100 && !(await chrome.storage.local.get("config")).config; i++) await new Promise(r => setTimeout(r, 100))
  const { config } = await chrome.storage.local.get("config")
  await chrome.storage.local.set({ config: { ...config, uiLanguage: "zh-CN" } })
})
const page = await context.newPage()
await page.goto(`chrome-extension://${new URL(worker.url()).host}/options.html#translate`)
await page.waitForSelector("main [data-card]")
for (const q of ["language", "图中译文"]) {
  await page.locator(".o-search input").fill(q)
  await page.waitForTimeout(400)
  const rows = await page.locator("[data-row]").evaluateAll(els => els.filter(e => e.getClientRects().length).map(e => e.dataset.row))
  console.log(q, "->", rows.join(" ") || "(none)")
}
await context.close()
'
```

Expected: `language ->` names the interface language's row **and** the target language's row (`translate/language`'s
words hold `language` too, and a search shows every section's matches: two rows is right, not a defect); `图中译文 ->`
names the dimming sub-row of 外观. A `(none)` is a defect of the search's words: fixed in Step 7.

- [ ] **Step 6: Read every shot at full size**

`experiments/pdf-bilingual/out/{popup,settings,reflow,controls,floating/after}/*.png`, both themes and both languages:
nothing clipped or overlapping, the English words fitting their rows, the dark theme's edges visible, every menu inside
its frame. Write down each defect with its file.

- [ ] **Step 7: Fix what Steps 1–6 found**

A defect in this stage's code is fixed test first (a failing unit test, or the probe's check that caught it), in a
commit of its own with the gate, and the step that found it is run again. A finding that asks for a design decision (a
colour, a measure, the `<h1>` question of row 83 when axe does not call it serious) is reported to the controller, not
decided here. Row 83 settles here: an axe `serious` or `critical` finding about the headings is fixed; otherwise the
row is carried with axe's words.

- [ ] **Step 8: The report**

Every command's result and count; each fix's commit; each open finding. No commit of its own.

### Task 102: the popup's first paint, back to back on a quiet machine (subagent)

§12: "the popup opens as fast as it does now". The rule is the probe's: a median more than 10 % **and** 4 ms slower
fails. The comparison is Part 3's build, kept by Part 4's Task 30 in its worktree, re-recorded in the same window as
the merged build.

- [ ] **Step 1: Nothing else runs**

Run: `ps -Ao pid,command | grep -E "vitest|wxt|playwright|chrome-headless|Chromium|node tests/e2e|node experiments" | grep -v grep; uptime`
Expected: no line from the first command (the controller dispatches this task only when no other worktree builds or
tests); the load average, for the report. Part 4's record's medians (written here by Task 90) are what the part
measured on a loaded machine, the numbers to compare against:

| Measured (Part 4, 2026-09-27) | Toolbar | Panel |
|---|---|---|
| Task 30's baseline (Part 3's build, three worktrees running) | 36 ms | 52 ms |
| Part 4's build against it, under the same load (Task 39) | 44.0 ms (FAIL: 0.4 ms over the 43.6 threshold) | 58.0 ms (ok) |
| Interleaved A/B, the other parts idle, before (Part 3's build), three rounds | 36 / 38 / 42 ms | 52 / 52 / 46 ms |
| … after (Part 4's build), three rounds | 68 / 36 / 40 ms (68: the build's first launch) | 54 / 44 / 48 ms |
| Median of the rounds, before → after | 38 → 40 ms | 52 → 48 ms |

Part 4 read the A/B as within the noise and no regression confirmed; its menus draw their rows after the first frame
(`usePainted`), so the language list is not in it. This task's three rounds decide.

- [ ] **Step 2: Part 3's build beside this one**

```bash
mkdir -p experiments/pdf-bilingual/out/popup-first-paint
test -d experiments/pdf-bilingual/out/popup-first-paint/build-before || cp -R ../redesign-popup/experiments/pdf-bilingual/out/popup-first-paint/build-before experiments/pdf-bilingual/out/popup-first-paint/
test -f experiments/pdf-bilingual/out/popup-first-paint/build-before/manifest.json && echo kept
pnpm build
```

Expected: `kept`; the build exits 0.

- [ ] **Step 3: Three rounds, each the baseline and then the build**

```bash
BEFORE="$PWD/experiments/pdf-bilingual/out/popup-first-paint/build-before"
for round in 1 2 3; do
  echo "round $round"
  AXT_EXT_DIR="$BEFORE" node tests/e2e/probes/popup-first-paint.mjs --baseline
  node tests/e2e/probes/popup-first-paint.mjs
done 2>&1 | tee "$TMPDIR/first-paint.log"
```

Expected: per round, `baseline recorded: toolbar … ms, panel … ms (medians of 10)` and two `ok` lines (toolbar,
panel). The task passes when all six are `ok`.

- [ ] **Step 4: A `FAIL`**

Report the three rounds' six medians before and after, and the load average, to the controller, who decides with the
maintainer; the threshold is not changed. The suspect Part 4's plan named — the view model drawing every menu's data
before the first frame (the language list's 179 rows among them) — Part 4 answered by drawing the menus' rows after it
(`usePainted`, its record); a `FAIL` now looks elsewhere first (a trace of the two builds' first frames: script, style,
layout). No commit.

### Task 103: what the maintainer must see (controller)

The shots of arXiv's pages are shown locally, never published (they show a paper); the others may be published as a
private artifact if the maintainer asks.

- [ ] **Step 1: The looks**

Show the maintainer, at full size:

1. **200 % zoom and 320 px** (§9, §12): `experiments/pdf-bilingual/out/settings/*-{narrow,narrow-appearance,zoom,zoom-appearance}.png`
   (both languages, both themes), `experiments/pdf-bilingual/out/reflow/*.png` (the popup at 200 %, the floating
   button, its menu and panel, the viewer, at 200 % and 400 %), and a selection of
   `experiments/pdf-bilingual/out/popup/*.png` (at twice the pixels: P0 and its findings, P1, P9, P17, the menus open).
2. **The field at fault's `danger` edge** (row 64: derived, not drawn in a prototype): the controls sheet's forms shots
   (`experiments/pdf-bilingual/out/controls/*forms*.png`, the API Key field at fault), light and dark.
3. **The tooltip, dark in both themes** (row 93): `experiments/pdf-bilingual/out/floating/after/{light,dark}-{lit,open}.png`
   beside the reader's own (`experiments/pdf-bilingual/out/reader-pixels/current/{light,dark}-tip*.png`): on arXiv's
   dark theme it stands out less than the white pill it replaced.
4. **The panel with the new popup** (Task 93 Step 4): `experiments/pdf-bilingual/out/floating/index.html`, the two
   panel pairs.
5. **P0, two decisions of Part 4's controller** (row 102): P0's field takes the focus as P0 opens (the design does not
   say; P0's one purpose is the field, as in the launchers the maintainer names as benchmarks), and P0 draws its
   no-entry sentence as P17 does, a note in the alert tone — `experiments/pdf-bilingual/out/popup/*-P0*.png`, and the
   popup opened on a page that is not a paper, live.
6. **The deep link's focus ring beside its flash** (row 121): a link such as `options.html#translate/prompts` lights
   its row once and puts the focus on it; with no pointer yet on the load, the keyboard's ring shows beside the flash —
   `experiments/pdf-bilingual/out/settings/*-deeplink.png`.
7. **What a style's pencil and a deletion choose** (row 122): the pencil chooses the style it opens, so opening one to
   look restyles the open pages; deleting the chosen style falls back to the first in the list (`styles[0]`), not to
   the one chosen before the editor opened (both as Part 5's plan and its tests 2 and 6 ask) — shown live on the
   release build's settings page, 外观.
8. **The words Part 5 added** (row 123): 常用地址 (the address suggestions' group, heard by a screen reader, not drawn),
   添加原文 (the glossary's empty row), 重试 beside 保存失败，请再试一次 (a glossary write refused), and the precision
   prompt's description without quotes, 翻译即改写：… as settings-2 draws it — from the pack, with
   `experiments/pdf-bilingual/out/settings/*-translate-{add,glossary,prompts}.png`.

- [ ] **Step 2: The answer**

Write the maintainer's answer, in their words, into the ledger. An approval closes rows 64, 93, 102, 121, 122 and 123.
A change asked for is written into this plan as a task of its own (after this one, before Task 104), built, and shown
again.

### Task 104: `docs/UI.md` (subagent)

The design's §13: §2, §3.1–3.3 (§10's copy, ids kept where the element persists), §4 (P0's search, P9 / P13's buttons,
P17, the rejected key), §5 rewritten as the roles of §2.1 with a pointer to `src/shared/tokens.ts`, §8's feature rows;
and what the records add (Part 4's list, Part 5's ids, rows 14, 20, 24, 77, 86, 112–114, 129). **The packs are the truth for copy:**
every Chinese word written here is copied from `src/locales/zh-CN.ts` on the merged tree; where the pack and the table
below differ, the pack's words go in and the difference is reported.

**Files:**
- Modify: `docs/UI.md`
- Modify: `src/locales/zh-CN.ts` (comments only: the ids beside the strings this task numbers, and the orphan comment
  Step 2 removes)
- Modify: `scripts/english-allowlist.txt` (`docs/UI.md`'s count)

- [ ] **Step 1: The header and §2**

- The status line: `the copy of §3, the tokens of §5 and the language of §6 are in src/ui/strings.ts, src/locales/ and
  src/styles/ui.css` becomes `… are in src/ui/strings.ts, src/locales/ and src/shared/tokens.ts (§5)`, and it gains
  `; the popup, the settings page and the controls on arXiv's pages were redrawn on 2026-09-27 (the redesign:
  experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md)`.
- §2: the rows `preload margin` and `preload threshold` become one row: `preload` (`'on-demand' | 'whole'`, v20) →
  **翻译方式**: **按需翻译** / **整篇翻译**; notes: the one-to-three-screen steps and the later starts went with v20 (the
  redesign's §4, §11: R2, R3, 2026-09-26); on demand is the old default, 1 000 px ahead and a threshold of 0. The row
  `image.modes` goes (figure text shows in every display since v20). New rows: `theme` → **外观**: 跟随系统 / 浅色 / 深色
  (one setting for the whole extension since v20, the reader's before; set on the settings page's 外观 and in the
  reader's reading options); the service health record (`local:serviceHealth`) → **API Key 已失效** (a key the service
  answered 401; cleared by a connection that succeeds, a new key or address, or the service's deletion; DESIGN §9).
  The `test connection` row's note becomes `= verify one sentence, then save: a service is added or re-keyed only once
  it connects (the redesign's §6.3, §11)`.

- [ ] **Step 2: §3.1, the popup**

Its intro gains `Redrawn 2026-09-27 (the redesign's §5, §10.1).` Rows, by id (copy from the pack):

| Id | Change |
|---|---|
| S-P-03 | Copy `打开 arXiv 论文（HTML 或 PDF）即可翻译` (`S.find.lead`); where: not a paper's page (P0); notes: the search field under it (S-P-04…08); an arXiv page still loading is not P0 (S-P-03d); everything P0 opens, it opens in a new tab whatever S-O-49b says, and the popup closes once it has; pasting never navigates by itself |
| S-P-03b | Notes: the entry pages show 翻译服务, 目标语言 (and 提示词) and S-P-50b's two entries only — the display, the two switches and the style belong to a translated page (§5.5) |
| S-P-03c | Notes: 上下 greyed with S-P-75; no 译文样式; the display and the two switches stay, and the reader follows them |
| S-P-03d (new) | An arXiv page still loading (PL) · `页面加载中` (`S.loading`) · no field |
| S-P-04 (new) | P0's field · `按标题、作者、摘要或链接搜索论文` (`S.find.field`) · what it takes is decided as it is typed; nothing happens until Enter; two checks of a paper run once per id after 300 ms of stillness; it takes the focus as P0 opens (P0's one purpose), and what it understood is said in a hidden polite status (`role="status"`), one short line, the entries and the note out of it |
| S-P-05 (new) | Under the field · `按回车搜索 · 高级搜索` (`S.find.enter`, `S.find.advanced`) · 高级搜索 links to arXiv's advanced search |
| S-P-06 (new) | Words typed (P0a) · `在 arXiv 搜索「{q}」` (`S.find.search`) · Enter opens `arxiv.org/search/?query={q}&searchtype=all&source=header` in a new tab; the popup lists no results |
| S-P-07 (new) | An arXiv PDF or HTML address (P0b, P0c) · `PDF 翻译 · arXiv {id}` / `HTML 翻译 · arXiv {id}` (S-P-50b's words and `S.find.paper`) · one brand row with the ↵ label; Enter opens the page with `#readarxiv`; the id at 400 after the words at 500, 85 % white in light, white in dark (§5.4) |
| S-P-08 (new) | A link elsewhere (P0g) · `只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。` (`S.find.elsewhere`) · Enter does nothing |
| S-P-32a | Notes gain: a service whose key the service refused says S-P-32e instead; one stored with no key keeps these words |
| S-P-32d (new row; the pack names it) | `选中的翻译服务已被删除，请重新选择` (`S.note.serviceGone`) · as the pack's comment and the view model use it |
| S-P-32e (new) | {为何不能用} · a refused key · `API Key 已失效` (`S.note.llmRejected`) · the service health record (DESIGN §9): P7 / P8 follow as for any service that cannot run; the chain passes over it; a connection from the settings page clears it |
| S-P-33b (was the first of two rows both numbered S-P-33) | `arXiv 没有这篇论文的 HTML 版本，无法翻译` (`S.note.noHtml`) · the second S-P-33 row (paused) keeps S-P-33, as the pack's comment says. Every mention of the no-HTML note becomes S-P-33b: S-P-03b's notes (`with S-P-33 below it`), S-P-33a's (`S-P-33 without its last clause`), S-P-50b's (`disabled with S-P-33`) and S-I-06's (`S-P-33's sentence`); the paused note's mentions (§3.4's `S-P-30/33`, §4's P9, the notes' order) stay S-P-33 |
| S-P-45 | Copy `{模型名} / 尚未配置 API Key / API Key 已失效` (`S.service.llm_rejected` added); an item of two lines, the name and its hint (§5.3) |
| S-P-47 | Notes gain: its menu ends with S-P-49 |
| S-P-48 (new row; the pack names it) | The service menu's last row · `管理翻译服务…` (`S.service.manage`) · opens `options.html#translate/services` (S-O-06) |
| S-P-49 (new) | The prompt menu's last row · `管理提示词…` (`S.rows.managePrompts`) · opens `options.html#translate/prompts` |
| S-P-50 | Notes gain: the brand's fill with `on-brand` words; its shortcut label on `brand-chip` (§5.1) |
| S-P-50b | Notes gain: brand buttons with icons, side by side, equal widths — HTML 翻译 with Lucide `globe`, PDF 翻译 with `file-text`; the one that cannot be used greyed; also P0's entries (P0d–P0f) |
| S-P-52, S-P-53 | P9, P13 and P6b: 重新翻译 (brand) and 显示原文 (neutral) side by side, equal widths, the brand first; the shortcut label only on the brand one — in P6b too, where the key, the context menu and the floating button retranslate as the button does (`shared/page-action.ts`, `keyMadeGood`); a disabled button neutral grey, without a shortcut. S-P-53's where becomes `the pair's second button` |
| S-P-70 | Notes gain: a fitted segmented control (`.seg.fit`), the thumb following the chosen segment, with the reader's family of icons |
| S-P-82 | Notes: the menu's rows are one line a style, its name leading and the sample sentence trailing, drawn in that style |
| S-P-83 | Notes: opens `options.html#appearance/styles` (the settings page's 外观); the sentence about styles living under 阅读 and `openOptionsPage` passing no hash goes |
| S-P-90 | Notes: a line under the primary, said politely (`role="status"`), not an alert (ruling 14) |

After the table's closing sentence (`Removed 2026-09-10: …`) add: `Retired 2026-09-27 (the redesign): S-P-03's old
sentence (P0 finds a paper now, S-P-03…08).`

Write each new id as a comment beside its string in `src/locales/zh-CN.ts` (`// S-P-04`), as the pack's other strings
carry theirs; `S.note.noHtml` gains `// S-P-33b`. The orphan comment `/** The guided install on the settings page
(S-O-30…36). The popup keeps the one-line version above */` (above `entry`) goes: the keys it described are gone, and
it claims ids §3.2 gives to deep thinking, the appearance and the dimming (row 129).

- [ ] **Step 3: §3.2, the settings page**

Its intro becomes: `Rebuilt 2026-09-27 (the redesign's §6, §10.2): four sections behind a sidebar with a search;
every control writes as it changes; forms and editors open in place, under the row that opened them.` The table,
in the page's order (copy from the pack's `O`; ids kept where the element persists):

| Id | Where | Copy | Notes |
|---|---|---|---|
| S-O-01 | Sidebar · sections | 翻译 · 外观 · 阅读 · 数据 | Lucide `languages`, `palette`, `book-open`, `database`; the current one a raised row, the others `ink-2`; the hash keeps the place (`#<section>`, S-O-06); `#services`, `#prompts`, `#pdf-reader` lead to their new places |
| S-O-02 | (copy unchanged) | (unchanged) | Drawn as a card at the top of the main column, its reset the confirm pattern of S-O-72; while it shows only 数据 is drawn, and the search finds only what is drawn |
| S-O-03 | Sidebar · the page's name, the search | 设置 · 搜索设置 · 清空搜索 | Rows filtered by their label, their description and a few keywords of their own; each section's matches under its name, the matched words on `mark`; no current section meanwhile; Escape clears |
| S-O-04 | Search · the count / nothing found | 找到 {n} 项设置 / 没有与「{q}」匹配的设置 | The count a polite status |
| S-O-05 | Sidebar's foot · interface language | 界面语言 · Interface language / 跟随浏览器 · 也在左下角 | A globe on the icons' edge; a menu opening upward, each language in its own name (`lang`); 「Interface language」 added where the interface's word is not English; 也在左下角 describes the row only a search shows; a change reloads the page |
| S-O-06 | A deep link | (no text) | `options.html#<section>/<row>` opens the section, scrolls the row into view and lights it once (`ink` 9 %, 1.4 s); used by S-P-48, S-P-49, S-P-83 and the reader's settings link (`#reading/pdf`) |
| S-O-10 | 翻译 · the services' card | 翻译服务 · Microsoft 翻译 · Google 翻译 · 免费 · Chrome 翻译 · 浏览器内置，无需联网 | One radio group; the arrows move the choice |
| S-O-11 | The Chrome row | · 需要先下载语言包 · 下载 · 语言包下载中 · 当前不可用 | 下载 a neutral button while the pack can be fetched; not choosable until it is there; greyed when Chrome has none |
| S-O-12 | The reader's own services | {名称} / {模型} · {主机} · 「{名称}」的更多操作 · 编辑… · 删除 | Nothing trailing while it works, the status and 「…」 otherwise; 「…」 on the row's hover or the keyboard's focus |
| S-O-14 | Add | 添加服务… | The last row; the form opens under it |
| S-O-15 | The service form | 接口地址 · 常用地址 · OpenRouter · DeepSeek · 本机 Ollama · API Key · 模型 · 名称（选填） · 默认使用模型名 · 更多 · 连接 · 取消 · 连接成功后才会添加 | The suggestions fill the address, nothing else (T4); their group is named 常用地址 for a screen reader (heard, not drawn), so that 接口地址 names one control; an origin is asked for on a gesture (a suggestion, opening the model list, 连接) |
| S-O-15a | The model field | 填好接口地址和 API Key 后列出 · 正在获取模型… · 搜索 {n} 个模型 · 没有匹配的模型，可以直接填写 · 没能列出模型，可以直接填写 | A combobox over the endpoint's list, `aria-busy` while it loads; a name can be typed |
| S-O-15b | The form's checks | 填写接口地址，例如 https://openrouter.ai/api/v1 · 填写 API Key · 选择或填写一个模型 | Checked on submit: each field at fault `aria-invalid` with its reason, the first focused |
| S-O-17 | Editing · the key | 已保存 · 留空则不改 · 清除 | The saved key kept unless one is typed; 清除 under it (ruling 18) |
| S-O-18 | API Key · a local address | · 本机地址可以不填 | In the key's label, for localhost and 127.0.0.1 |
| S-O-19 | Connect | 连接 / 连接中… | Tests the service as it would be saved, then adds or saves it, chooses it and closes the form (§11: nothing is added without a connection) |
| S-O-20 | Its result | 已连接 · {ms} ms / 连接失败：{原因} | Success on the row with the icon's arrival; a failure beside the button, the form kept, the focus on the field at fault; a polite status |
| S-O-21 | Delete | 已删除「{名称}」 · 撤销 · 保存失败，请再试一次 | The row replaced for 5 s; a chosen service deleted falls back to Microsoft 翻译 and comes back chosen if undone, without its refused mark until its next refusal; a deletion the store refuses leaves the row, the focus on it, and says 保存失败，请再试一次 (`O.saveFailed`, the page's one sentence for a failed save) at the list's foot — the prompts' and the styles' lists too |
| S-O-21a | A refused key | API Key 已失效 · 服务拒绝了这个 API Key，它可能无效或已过期。换一个新的，其他设置不变。 · 新的 API Key · 更新并连接 · 连接成功后才会保存 | The row's status with the alert icon while the health record holds the service; choosing it opens the form; one stored with no key says 尚未配置 API Key, the same form without the first sentence |
| S-O-22 | Automatic switch | (copy unchanged) | A sub-row card, only while an LLM service is chosen |
| S-O-23 | Target language | 目标语言 | The popup's searchable menu (S-P-22 / 23) |
| S-O-30 | Deep thinking | 深度思考 | Under the form's 更多, folded |
| S-O-60 | The LLM group | LLM · 提示词与术语表只对 LLM 服务生效 / 添加 LLM 服务后可设置提示词与术语表 | The aside on the heading (`ink-2`); with no LLM service, the one line |
| S-O-61 | Prompts | 提示词 · 我的 · 复制后修改 · 内置提示词不能直接改 · 完成 · 删除 · 新建提示词… · 导入… · 导出… · 新提示词 | A radio list in place, each with its description; the chosen one's text read as words; 导出… once there is one of one's own |
| S-O-61a | A prompt's two parts, its variables | 指令 · 翻译时始终遵守的要求 · 消息 · 每次随原文一起发送 · 目标语言 · 原文 · 论文标题 · 摘要 · 章节标题 · 术语表 | Never `{{…}}`; nothing names the protocol the extension appends |
| S-O-61b | Import failed; an empty message | 无法读取这个文件 · 这个文件里没有可用的提示词 · 消息不能为空 | The last derived (ruling 18) |
| S-O-62 | Glossary | 术语表 / 让同一篇里的译法一致 · {n} 条 · 原文 · 译文 · 添加原文 · 删除第 {n} 行 · 可以直接粘贴多行「原文, 译文」，会自动拆成多行 · 保存失败，请再试一次 · 重试 | A table in place, an empty row at the end to add one, its source cell saying 添加原文; pasted lines split into rows; a write the store refuses keeps the rows and says so at the table's foot, with 重试 |
| S-O-63 | Glossary · a row with a problem | 原文为空 / 译文为空 (and today's reasons) | At its row, without line numbers; the table saves what parses, within `GLOSSARY_LIMITS` |
| S-O-35 | 外观 · appearance | 外观 · 跟随系统 · 浅色 · 深色 | The reader's equal segments with a monitor, a sun, a moon; one setting for the extension (`theme`, v20); a card too narrow for them (below 312 px of content) drops the icons and keeps the words |
| S-O-36 | Dimming | 深色时调暗 PDF 页面 / 深色外观下把 PDF 页面调暗；高亮与图中译文保持原色 | A sub-row for 跟随系统 and 深色 (`pdfReader.dimPages`) |
| S-O-40 | Translation style | 译文样式 · 编辑「{名称}」 · 新建样式… · 新样式 | One radio group: a row a style, its name over the sample written in it, a pencil trailing |
| S-O-41 | Restore | 恢复内置样式 | On the group's heading: the built-ins as shipped, the reader's own kept |
| S-O-42 | Built-in styles | (names unchanged) | Ordinary entries: editable and deletable |
| S-O-43 | The style editor | 名称 · 浓淡 · 原样 · 淡一些 · 更淡 · 更多 · 完成 | In place under the row, for every style; the preview; 浓淡 1 · 0.7 · 0.5, a value between them showing no step chosen |
| S-O-44 | Colour | 颜色 · 跟随原文 · 自选颜色 | Swatches: 跟随原文, the palette, one's own |
| S-O-45 | Underline | 下划线 · 无 · 实线 · 点线 · 虚线 · 波浪 · 线宽 · 1px · 2px | 线宽 a sub-line once a line is chosen |
| S-O-46 | Blur | 悬停前模糊 / 译文先糊着，鼠标停上去才清晰 | Under 更多 |
| S-O-47 | Custom declarations | 自定义 CSS（只写声明，例如 letter-spacing: 0.02em） | Under 更多; checked in place |
| S-O-48 | The editor's bar | 完成 · 复制一份 · 删除样式 | 删除样式 with the undo row; 复制一份 kept (ruling 18) |
| S-O-49 | Hover highlight and its colours | 对照高亮 / 悬停时高亮对应的句子；仅译文时停留可查看原文 · 颜色 | The switch is S-P-80's setting; while on, the sub-row 颜色: the profiles as swatches, as in the reader, last a colour of one's own |
| S-O-50 | 阅读 · how to translate | 翻译方式 · 按需翻译 · 整篇翻译 / 只翻译正在阅读和即将读到的段落，用量最少 / 打开论文时就请求整篇译文，滚到哪里都已翻好，用量较多 | `preload` (v20); the description follows the choice; 整篇翻译 reaches an open paper at once |
| S-O-24 | Figure text | 图片翻译 / 图里的文字也翻，译文叠在图上，悬停查看原文 | The popup's switch (S-P-85) |
| S-O-49b | Where translations open | 译文在哪里打开 / 从摘要页或 PDF 页打开译文时 · 新标签页 · 当前标签页 | A small segmented control; the old row's notes on the default and its reach stand |
| S-O-49c | The floating button | 显示悬浮按钮 / 在 arXiv 的摘要页、PDF 和全文页贴在窗口边缘 | The old row's notes stand; the switch is held out of sight, its place kept, until the background says its state (it used to say on, then flip) |
| S-O-55 | The PDF group | PDF · 在 arXiv 的 PDF 上使用对照阅读器 / 关掉后，PDF 用浏览器自带的查看器打开 · 同步滚动 / 原文和译文一起滚 | `#reading/pdf`; 同步滚动 a sub-row while the reader is on; the appearance and the dimming are S-O-35 and S-O-36 now |
| S-O-70 | Cache | 已缓存的译文 / {n} 段 · {size} MB · 换了服务、模型或提示词会自动分开存，通常不用清 | |
| S-O-71 | Read failed | 没能读取缓存 | Never shown as a count of 0 |
| S-O-72 | Clear | 清空… → 确认清空 → 已清空 | A neutral button; a press arms it with a trash icon, its words `danger` on `button-danger`; back after 3 s untouched, not while the pointer rests on it; done, 已清空 with the success icon |
| S-O-73 | PDF translations | 已缓存的 PDF 译文 / {n} 篇 · {size} MB | Cleared as S-O-72, reported as S-O-71 |
| S-O-74 | Diagnostics | 诊断日志 · 导出 | Issue #156; the words as the pack has them (its description says API Key, the pack's one term for it) |

After the table: `Retired 2026-09-27 (the redesign's §10, §11): S-O-13 (the empty list), S-O-16 (the address hint),
S-O-26 (the image modes), S-O-51 (when translation starts); S-O-01's five old section names, S-O-10's 内置服务 and
S-O-12's 我的服务, S-O-14's and S-O-15's drawer titles, S-O-41's 添加配置 and 重置, S-O-43's 编辑配置, S-O-46's 适合自测,
S-O-49's 背景高亮 and its editor, S-O-50's 提前翻译的范围, the prompt manager's 查看, 复制并自定义, System prompt …,
用户提示词, 插入变量 and 导出自定义 (S-O-61), and S-O-62's text-box hint.` Task 90 read §10.2's list of the words that
go (Part 5's record names it the authority) against this table and sentence: every id §10.2 names keeps its row here
with the new copy (S-O-01, S-O-10, S-O-12, S-O-14, S-O-15, S-O-40 … 46, S-O-49, S-O-50, S-O-61, S-O-62) or is retired
above (S-O-13, S-O-16, S-O-26, S-O-51); the merged `O` carries four id comments (S-O-02, S-O-05, S-O-30, S-O-73), none
naming an id otherwise.

- [ ] **Step 4: §3.3, §4, §5, §6, §8**

- **§3.3**: S-I-02's notes gain `its retry and its line in danger, light or dark by the paper's colour scheme (DESIGN
  §4.0c)`; S-I-06's `drawn in the family's material and following the extension's appearance (DESIGN §4.0c)`; S-I-06c's
  `the shared menu's look`; S-I-07's `the control and the bar in the family's floating material, light or dark by the
  paper`.
- **§4**: the heading's date becomes `[decided, 2026-09-10; redrawn 2026-09-27]`. P0's row, and new rows, each from its
  fixture in `src/entrypoints/popup/fixtures.ts` — its `name` as the State, its `when` verbatim as the Condition, the
  other columns as `derivePopupView` draws it (the gallery shows each): P0 (the note column: S-P-03 and the field), PW,
  PL, P0a–P0g, P6b, P7b, P8b, P17a–P17c, PR, PE. P9 and
  P13's buttons: 重新翻译 (brand) · 显示原文 (neutral), side by side. The rules: `One note at a time …` stays; `Every note
  carries the 设置 button` becomes `A note carries 设置 or 重试; an alert's icon in danger, an information's in ink-2, the
  words ink (§5.2)`; `A menu is fixed-positioned …` becomes `A menu is the shared popover under its row; the popup takes a
  minimum height while it is open, so that its window or the panel's frame holds it, cleared as it closes; the style
  menu opens upward (§5.3)`; the `Layout:` rule becomes §5.1's order — the brand row, the group (翻译服务, 目标语言, 提示词),
  a note, the primary, the display, the foot (对照高亮, 图片翻译, 译文样式).
- **§5**: the heading becomes `## 5. Tokens [implemented; the redesign, 2026-09-27]`; the text before the table:

  `One source, src/shared/tokens.ts, holds every token as data — the reader's neutral ramp (n-0 … n-10, one cool neutral
  at hue 255), the roles named for what they are for, the brand and status colours, the shadows, the font and the ease —
  in light and dark (the redesign's design, §2.1). Nothing else in the tree writes a colour: a surface names a role. The
  extension's own pages (the popup, the settings page, the PDF reader, the gallery, the controls sheet) read the
  generated src/styles/tokens.css, unprefixed (pnpm tokens writes it; tests/shared/tokens.test.ts fails while it and the
  source differ); the shadow roots on arXiv's pages take the same roles as --axt- variables from tokenSheet('host'),
  marked light or dark inside the root (DESIGN §4.0c). tests/shared/contrast.test.ts holds every pair a surface draws to
  its floor.`

  (with the names in code quotes). The table: the design's §2.1 table as it stands, then the rows Part 3 added —
  `group-hover` (n-3 / n-3: a hovered or open row of the popup's group), `on-brand-2` (white 85 % / white: P0's paper
  id), `tip-shadow` (the tooltip's shadow, the same in both themes), `raised-shadow` (a note's raised button's hairline;
  none in dark) — each value read from `src/shared/tokens.ts`. The old `--axt-bg` … table and the paragraph under it go;
  in their place: `The extension's own controls follow the extension's appearance (theme); the controls on the paper —
  the figure viewer's control and bar, the failed block's retry — follow the paper's colour scheme (the redesign's §3,
  §15).`
- **§5.1**: the row of `public/icon/mark.svg` names what draws the mark on each page now, as
  `grep -rn "BrandMark\|mark.svg\|mark-" src/entrypoints/popup src/entrypoints/options --include='*.tsx'` shows it: on
  the merged tree (Task 90's trial), the popup's brand row draws the file itself (`<img src="/icon/mark.svg">`,
  `src/entrypoints/popup/PopupView.tsx`), and the settings sidebar through `src/ui/BrandMark.tsx`.
- **§6**: `the interface language under the navigation (S-O-05)` becomes `the interface language at the settings
  sidebar's foot (S-O-05)`.
- **§8**: the Where / Ids columns follow the new page — prompts and glossary `Settings · 翻译 · LLM`; styles and the hover
  highlight `Settings · 外观`; the preload `翻译方式, Settings · 阅读, S-O-50` (S-O-51 gone); the cache `S-O-70…73`; the
  thinking switch `the service form's 更多, S-O-30`; image translation `a switch (the per-display list went with v20)`,
  `Settings · 阅读, S-O-24`; the reader's services `Settings · 翻译, S-O-12…22`. New rows: one appearance for the
  extension (`theme`, the redesign's §3; S-O-35, S-R-08); finding a paper from the popup (the redesign's §5.4; S-P-03…08,
  P0a–P0g); a refused key remembered (the redesign's §4; S-P-32e, S-O-21a); the settings search and deep links (the
  redesign's §6.1; S-O-03, S-O-04, S-O-06).

- [ ] **Step 5: The ids against the pack**

```bash
grep -oE "S-[PORI]-[0-9]+[a-z]?" src/locales/zh-CN.ts | grep -vE "[0-9]x$" | sort -u > "$TMPDIR/pack-ids.txt"
grep -oE "^\| S-[PORI]-[0-9]+[a-z]?" docs/UI.md | sed 's/^| //' | sort -u > "$TMPDIR/doc-ids.txt"
comm -23 "$TMPDIR/pack-ids.txt" "$TMPDIR/doc-ids.txt"
grep -oE "^\| S-[PORI]-[0-9]+[a-z]?" docs/UI.md | sort | uniq -d
```

Expected: the first `comm` prints nothing (every id the pack names has its row; `S-O-6x`, a range a comment writes, is
left out); the last prints nothing (no id twice — the two S-P-33 rows of before are S-P-33 and S-P-33b).

- [ ] **Step 6: The allowlist and the commit**

```bash
git add docs/UI.md src/locales/zh-CN.ts && node scripts/check-english.mjs
```

Expected: it names `docs/UI.md` with its new count: set the entry to it, its reason gaining `; 2026-09-27: the redesign
— the popup's and the settings page's rows redrawn, §4's new states, §5 the roles`; `git add scripts/english-allowlist.txt`;
run it again: exit 0. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, exit 0.

```bash
git commit -m "docs(ui): the interface contract as the redesign built it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 105: `docs/DESIGN.md` (subagent)

The design's §13 (§9, §10, §15, §4.0c, the platform note on `src/shared/tokens.ts`) and what the records and the
ledger add (§3, §4's directory table and entry-point row, §4.0b, §4.4, §11, §16). No Chinese enters: ids stand for
words.

**Files:**
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: §3 and §4**

- §3's table gains two rows: **Role** — `A token named for what it is for (chrome, ink-2, brand, field-edge …), held with
  its light and dark values in src/shared/tokens.ts; a surface names a role, never a colour (UI.md §5)`; **Refused key**
  — `A service whose key the endpoint answered 401, remembered in the service health record until a connection succeeds
  or the key, the address or the service changes (§9)`.
- §4's directory table: the `src/entrypoints` row names `gallery/` and `controls/` already (`83cfb018`, row 66) — leave
  it; `src/shared` gains `the design tokens (tokens.ts), the service health record`; the row `src/ui, src/locales,
  src/styles` becomes `React components — the controls every page shares in src/ui/controls/ — the locale packs, and the
  style sheets: the injected ones, and the pages' tokens.css (generated), controls.css and ui.css`.
- §4.0b's **The popup** bullet gains, after its first sentence: `On a page that is not a paper it finds one (UI.md P0):
  an arXiv PDF or HTML address opens that page with #readarxiv; an abstract address, an id or an arXiv DOI offers the
  two entries once the paper's two checks have answered — run once per id, after 300 ms of stillness, never on a
  keystroke; anything else searches arXiv in a new tab on Enter. Its menus end with a row that opens the settings page at
  the list they draw (UI.md S-P-48, S-P-49, S-P-83).`
- §4.2 gains, after its first sentence: `The design tokens live in src/shared/tokens.ts for this reason: the floating
  button and the figure viewer are in src/core, whose shadow sheets begin with tokenSheet('host'); the extension's pages
  import the generated src/styles/tokens.css (pnpm tokens; a test fails while it and the source differ).`
- §4.4: `the rest as held (the image run parks them behind its mode gate)` becomes `the rest as held (the text run holds
  a figure's labels there while figures are off, §15.6)`.

- [ ] **Step 2: §4.0c, the floating button's material**

After the paragraph that begins `**The icons are Lucide's**`, add a paragraph:

`**Its material is the family's** (the redesign's design, §7; the maintainer approved it on 2026-09-27): the surfaces
chrome with a 1 px chrome-line hairline and the float shadow, the close menu the shared popover's rows, the tooltips the
shared tooltip — dark in both themes, with tip-shadow —, the tick success, the focus ring 2 px of focus, the panel's
frame a 12 px radius with the pop shadow; every shape, place and timing as before (floating-shots.mjs measured every
part the same, but the tooltip's and the menu's own measures). The roles come from tokenSheet('host') at the head of the
shadow sheet (5.9 KB); the only literals left are the mark's own, the disc's shadow and the tick's white. It follows the
extension's appearance, which the background answers with the rest of a page's settings (axt:entry-settings, theme), by
data-axt-theme on the dock inside the shadow root — not data-theme on the host: arXiv's theme sheet styles any
[data-theme=dark], and restoring a page strips every data-axt-* of the document's own elements. The controls that sit on
the paper follow the paper instead: the figure viewer's control and bar take the float material light or dark by the
page's ground, as the viewer reads it (§15.7), and the failed block's retry and its hint line take danger through
light-dark() over the colour scheme arXiv's sheet sets — modes.css, which has no token sheet beside it, writes danger's
two values, held to tokens.ts by a test.`

(with the names in code quotes). In **The pages ask the background for their settings** paragraph, `the interface
language, where a translation opens, the tab's zoom, the button's state` becomes `the interface language, the
extension's appearance, where a translation opens, the tab's zoom, the button's state`.

- [ ] **Step 3: §9, the configuration, and the health record**

- `(CONFIG_VERSION = 19)` becomes `(CONFIG_VERSION = 20)`.
- **The shape** (its code quotes as the line has them: `` `preload` (margin, threshold) ``): `preload` (margin,
  threshold) becomes `preload` (`'on-demand' | 'whole'`); `image` (enabled, modes) becomes `image` (enabled); between
  `uiLanguage` and `pdfReader` (the PDF reader's own, v19) comes `theme` (the extension's appearance, v20); `Microsoft,
  side mode, fallback on, every image mode on, the interface language following the browser` becomes `Microsoft, side
  mode, fallback on, figure translation on, on-demand translation, the system's appearance, the interface language
  following the browser`.
- **One mechanism**: after `… with their defaults.` add `v20, the extension's redesign: the reader's appearance becomes
  the extension's theme; the preload's numbers become the two ways to translate (all → whole, any number → on demand, the
  threshold dropped); the image's per-display list goes, and a switch left on over an empty list — off in effect —
  becomes off. A field that is not an object passes through for the schema to name, as in every migration here.`
- **Chain fields and volatile fields**: `theme` joins the volatile list (after `uiLanguage`).
- After the configuration's last bullet, a subsection:

  `### The service health record`

  `A key the endpoint refused is remembered outside the configuration (local:serviceHealth, shared/service-health.ts): a
  map from a service's id to when its key was refused, nothing of the request and never a key. It is a fact the extension
  observed, not a choice, and a configuration that fails to parse must not take it with it. The background writes it
  alone, one mutation after another through one queue: it marks a service when a request is answered 401 — a 403 is a
  moderation refusal or a disallowed origin, not the key — and only while the key and the address that request used are
  still the service's (background/health-guard.ts: isRefusal, shouldMarkRefusal); it clears the mark on a connection that
  succeeds with the stored key and address (testsStoredKey), on any change of the key or the address, and on the
  service's deletion (idsToClear, from the configuration's watcher) — so a deletion undone brings the service back
  unmarked until its next refusal, which costs one refused request (a ruling of the redesign). The chain passes over a
  marked service as the popup
  says it will (it counts as one that cannot run, UI.md §4's runnable, S-P-32e); the settings page and the reader's
  service menu say the key is no longer valid (S-O-21a).`

  (with the names in code quotes).

- [ ] **Step 4: §10, §15.2, §15.6, §16**

- §10: `the preload range's last stop, **whole paper** (preload.margin: 'all', v15), hands every block to the run as it
  starts` becomes `the second of the two ways to translate, **whole paper** (preload: 'whole', configuration v20; margin
  'all' from v15), hands every block to the run as it starts`; `any other change of the range applies from the next
  session` becomes `on demand, chosen mid-session, applies from the next session`. The bullet `Defaults: rootMargin 1 000
  px, threshold 0 (DEFAULT_PRELOAD), exposed on the settings page as steps …` becomes `**On demand** is DEFAULT_PRELOAD —
  rootMargin 1 000 px, threshold 0 — and the only other choice is the whole paper (preloadOf, scheduler/lazy.ts): the
  one-to-three-screen stops and the later starts went at configuration v20 (the redesign's §4; the maintainer, R2 and R3),
  every stored margin becoming on demand and all becoming whole. Seeding uses the same threshold as the observer …`
  (the rest of that bullet from `Seeding` on as it is).
- §15.2's image-run bullet: `targets parked behind the mode gate until a selected mode is in effect;` becomes `a round
  exists only while image translation is on, and every display shows its overlays (configuration v20);`.
- §15.6: `outside the ticked modes the label shows and its translation does not` becomes `with figures off the label
  shows and its translation does not, and with them on every display shows the translation (v20 gives the gate every
  display)`; `a label reached while figures are off in the mode in force is **held, unasked**, and offered again when the
  mode or the setting changes (resume())` becomes `a label reached while figures are off is **held, unasked**, and
  offered again when the setting changes (resume())`; `the translation where figures are translated in side **and the
  translation is there**` becomes `the translation where figures are translated **and the translation is there**`.
- §16: `pdfReader (v19) holds the reader's own` becomes `pdfReader (v19) holds the reader's own; its appearance became
  the extension's theme at v20`.

- [ ] **Step 5: §11**

- The Surfaces row: `The popup through POPUP_FIXTURES (P0–P16) and derivePopupView; the settings and popup data layers;
  the appearance editors` becomes `The popup through POPUP_FIXTURES (P0–P17 with PW, PL, P0a–P0g, P6b, P7b, P8b, PR,
  PE) and derivePopupView; the settings page's sections, forms and search; the shared controls (tests/ui/controls); the
  token source and the contrast gate (tests/shared)`.
- The browser suites' table: each count from Task 101's report; new rows `pnpm e2e:pdf` (arXiv's PDF page: the button
  drawn there, it and the popup opening the bilingual version), `pnpm e2e:floating` (the floating button on the abstract,
  PDF and full-text pages: rest, hover, drag, hide, toggle, tick, the appearance), `pnpm e2e:popup` (the popup: finding a
  paper, its checks counted, the menus under their rows, the manage rows' deep links, the entries, the panel growing).
  The table's lead sentence gains `(… 1 774 unit tests and these on 2026-09-17; <the unit count> and the counts below on
  2026-09-27, at the redesign's end)` with the count Task 101 reported.
- The Probes paragraph gains: `the redesign's (2026-09-27): align.mjs (centre lines and edges, shared), controls.mjs (the
  shared controls on the development build's controls sheet), popup-align.mjs and settings-align.mjs (every state's
  alignment and shots, both themes and languages), popup-first-paint.mjs (the popup's first paint against a kept build),
  floating-shots.mjs (the floating button before and after), reflow-shots.mjs (the arXiv-page surfaces at 200 % and
  400 %), pages-a11y.mjs (axe on the extension's pages); and the reader's pixels, experiments/pdf-bilingual/spikes/reader-pixels.mjs`.

- [ ] **Step 6: Checks and the commit**

```bash
grep -nE "CONFIG_VERSION = [0-9]+" docs/DESIGN.md src/config/schema.ts
grep -nE "\(enabled, modes\)|\(margin, threshold\)|parks them|parked behind|ticked modes|in the mode in force|every image mode on|configFallbackReason" docs/DESIGN.md
grep -c "a deletion undone brings the service back" docs/DESIGN.md
git add docs/DESIGN.md && node scripts/check-english.mjs
```

Expected: `20` in both; the second `grep` prints nothing (§9's fallback line lost `configFallbackReason()` in Task 99
Step 9); `1`; the English gate exits 0 (DESIGN.md's entry unchanged: no Chinese added). Gate: exit 0.

```bash
git commit -m "docs(design): configuration v20, the service health record, the floating button's material, the tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 106: the reader's design, CHANGELOG, CLAUDE.md, THIRD_PARTY.md, RELEASE.md (subagent)

**Files:**
- Modify: `experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md`, `CHANGELOG.md`, `CLAUDE.md`,
  `docs/THIRD_PARTY.md`, `docs/RELEASE.md`

- [ ] **Step 1: The reader's design**

- §4.1, after its first paragraph (`One cool neutral ramp … is dark.`), a paragraph: `**Shared since 2026-09-27** (the
  extension's redesign, its design §2.1): these tokens are the extension's now, held as data in src/shared/tokens.ts,
  from which pnpm tokens writes src/styles/tokens.css; the reader's sheet imports it, with the controls it shares
  (src/styles/controls.css, src/ui/controls/). The values below are unchanged, and the reader was held to its pixels
  before and after the move (experiments/pdf-bilingual/spikes/reader-pixels.mjs). The extension adds roles the reader
  has no use for — the brand, success, the search mark, the page's and the popup's grounds — in the redesign's §2.1.`
  (names in code quotes).
- §9.1's table, the `pdfReader.appearance` row's What gains `— moved to the extension's theme at configuration v20
  (the redesign's §3): one appearance for every surface, set here or on the settings page`; the sentence on
  `image.enabled with image.modes` gains `(since v20 the switch alone: figure text in every display)`.
- §9.3's first bullet gains `(since the redesign: the PDF group of the Reading section at #reading/pdf, the appearance
  and the dimming under Appearance; #pdf-reader still leads there)` — English, so that the document's Chinese lines stay
  as its allowlist entry counts them.
- §9.4 gains `(Retired with the redesign: the reader's menus are MenuList, src/ui/controls/, and src/ui/Menu.tsx is
  gone.)`
- §11.5: `the reader's own token sheet (§4.1, @theme inline), not ui.css` becomes `the extension's token sheet
  (src/styles/tokens.css since the redesign; §4.1) through @theme inline, not ui.css`.

Run: `git add experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md && node scripts/check-english.mjs`
Expected: exit 0 (no Chinese added; the entry stands).

- [ ] **Step 2: CHANGELOG**

At the top, after `Reader-facing changes, newest first. The design is docs/DESIGN.md.`, add:

```markdown
## Unreleased

- A new look for the popup, the settings page and the floating button, drawn from the PDF reader's: the same greys, type, controls and motion, with the logo's red kept for the one main action on each screen. Every row of the popup and the settings page is measured so that its parts stand on one line.
- One appearance for the whole extension — follow the system, light or dark — set on the settings page, under Appearance, or in the PDF reader's reading options. The reader used to have its own and the popup and the settings page followed the system; what you had chosen in the reader is now the extension's.
- The popup finds papers. On a page that is not an arXiv paper, type or paste into its search field: a paper's PDF or HTML link opens its translation, an abstract link, a paper's id or its arXiv DOI offers the HTML and PDF translations, and anything else searches arXiv in a new tab when you press Enter.
- The popup's menus open under their rows, and each list you can change ends with a way to manage it — services, prompts, styles — that opens the settings page at that place. A paused page offers "Translate again" and "Show original" side by side. On an abstract page or a PDF the popup shows the two ways in, HTML and PDF, with the service and the language, and nothing only a translated page uses.
- The settings page, rebuilt: four sections — Translation, Appearance, Reading, Data — a search that finds a setting by its name or what it does, and links that open a setting in place. The interface language sits at the foot of the sidebar, beside a globe.
- A service you add is added once it connects. Enter its address (OpenRouter, DeepSeek and a local Ollama are one click away), its key and its model — picked from the service's own list when it offers one — and Connect. A service that cannot translate a sentence is no longer saved. Editing one works the same way, in place.
- A key the service refuses is remembered. The popup, the settings page and the PDF reader say "API key no longer valid" for that service; with the automatic switch on, pages go to a free service instead of trying the refused key again; and connecting with a new key — or the same one, once your account is fixed — clears it.
- Deleting a service, a prompt or a style is undone rather than confirmed: its row says it was deleted, with Undo, for five seconds. Clearing a cache, which cannot be undone, asks once more in place.
- The glossary is a table, one term a row; paste lines of "source, translation" to add several at once. The translation styles are a list, each written in its own style, and every one — built in or yours — is edited in place; "Restore built-in styles" brings the shipped ones back. The hover highlight's colours are swatches, one of them yours to pick.
- Two ways to translate: As you read, the default — the paragraphs you reach and those just below — and Whole paper. If you had chosen two or three screens ahead, or to start only when half or all of a paragraph shows, you now have As you read.
- The words in figures show in every display — split, stacked and translation only — whenever figure translation is on; the per-display ticks are gone. If you had unticked every display, figure translation stays off.
- The floating button and the figure viewer take the new look. The button follows the extension's appearance; the viewer's controls and a failed paragraph's retry follow the paper's own theme on arXiv.
```

- [ ] **Step 3: CLAUDE.md, THIRD_PARTY.md, RELEASE.md**

- `CLAUDE.md`, Commands (the code block; each comment aligned with its neighbours'): after the `pnpm build` line add
  `pnpm exec wxt build --mode development   # the dev pages too: the gallery (every popup state) and the controls sheet`;
  after the `pnpm e2e:floating` line add
  `pnpm e2e:popup           # the popup: finding a paper, the menus under their rows, the entries, the panel growing`;
  after the `pnpm zip` line add
  `pnpm tokens              # src/styles/tokens.css from src/shared/tokens.ts; a test fails while the two differ`.
- `docs/THIRD_PARTY.md`, the Lucide row: its files become `src/ui/controls/Icon.tsx` (the one icon component of the
  popup, the settings page and the PDF reader) and `src/core/floating/button.ts` (the floating button's own), and its
  list of icons the ones the build uses — `grep -rhoE "import \{[^}]+\} from 'lucide'" src | tr ',{}' '\n\n\n' | grep -oE "[A-Z][A-Za-z0-9]+" | grep -v '^IconNode$' | sort -u`
  (an import spread over several lines is read by hand), each written in Lucide's kebab-case name (`FileText` →
  `file-text`); `src/ui/LucideIcon.tsx` leaves the row.
- `docs/RELEASE.md`, step 1's browser suites: `pnpm e2e:floating` is followed by `pnpm e2e:popup`.

- [ ] **Step 4: Checks and the commit**

```bash
grep -rn "LucideIcon\|src/ui/Menu\b\|pages-pixels\|--axt-bg" docs CLAUDE.md CHANGELOG.md
git add CHANGELOG.md CLAUDE.md docs/THIRD_PARTY.md docs/RELEASE.md experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md && node scripts/check-english.mjs
```

Expected: the `grep` prints nothing; the English gate exits 0. Gate: exit 0.

```bash
git commit -m "docs: the reader's tokens shared, the changelog, the commands, the icons and the release suites after the redesign

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 107: the local Codex review of the whole branch (controller)

- [ ] **Step 1: Run it**

The branch's start on the pull request's base is `cc781213` (`git merge-base exp/extension-ui-redesign
exp/pdf-bilingual`). Run `/codex:review --base cc781213 --scope branch` (a normal review: the contracts — configuration
v20, the health record — had their adversarial pass in Part 2; this pass is the whole stage together), its output
kept at `.superpowers/sdd/2026-09-26-extension-ui-redesign-part7-finish/codex-part7.md`. Should Codex refuse the size,
say so and run it by part instead, with the merge commits' first parents as the bases; no other workaround.

- [ ] **Step 2: Each point checked**

Each point is checked against the code, a test or a probe before it is adopted. An adopted point is fixed test first by
a subagent, in a commit of its own, with the gate and the suites the fix touches (the reader's pixels if the reader's
files change). A declined point is written into the ledger with its reason — and, for the pull request, into Task 109's
record.

### Task 108: the final whole-branch review, and its fixes in one batch (controller)

- [ ] **Step 1: The package**

```bash
H=$(git rev-parse --short HEAD)
git diff cc781213..HEAD -- . ':!experiments/pdf-bilingual/plans' > .superpowers/sdd/2026-09-26-extension-ui-redesign-part7-finish/review-cc781213..$H.diff
git diff --stat cc781213..HEAD | tail -1
```

- [ ] **Step 2: The review**

Dispatch the most capable model available to review the package against the design, the main plan's Review Focus and
every part's, this plan's Review Focus, and CLAUDE.md's hard rules: correctness first, then the contracts
(configuration v20, the health record, `axt:entry-settings`, the host token sheet), then what a reader sees. Findings
are graded Critical / Important / Minor, each with its file and line.

One named focus besides (row 127; the main ledger, line 192): **StrictMode's double run.** The pages mount under
`<StrictMode>` (`src/entrypoints/{popup,options,pdf-reader,gallery,controls}/main.tsx`), so in a development build every effect
runs setup, cleanup, setup. A ref or a closure flag an effect's cleanup sets — `cancelled`, `stopped`, `live = false`,
a timer id, a granted set emptied — that its setup does not set back leaves the second run dead: Part 5 found it in the
service forms (Task 65, round 3: Connect never handed over in development builds, a grant released at once). The
reviewer sweeps the whole branch for the pattern — the popup (Part 4: `state.ts`'s start and stop, the menus), the
shared controls (Part 3), the settings page, the reader's and the floating button's React parts — starting from
`git grep -nE "(cancelled|stopped|live|alive|mounted|disposed)(\.current)? = (true|false)" -- 'src/**/*.ts' 'src/**/*.tsx'`,
and names each cleanup whose setup leaves its flag as the cleanup left it. Each is a finding, graded by what it breaks
(a development build only is Minor unless it hides a production path, as a probe run on the development build does).

- [ ] **Step 3: One batch of fixes, and a re-review**

Every Critical and Important finding is checked, then fixed in one dispatch (test first, a commit each, the gate, and
every suite and probe the fixes touch); a Minor is fixed in the same batch when cheap, or carried with its reason
(the table above, and #299). Then the same reviewer re-reviews the fix batch's diff alone; a new Critical or Important
starts another round. Declined findings go into the ledger with the reason.

### Task 109: Part 7's record (controller)

- [ ] **Step 1: Write it**

Append to the end of this plan, under `## Part 7: done`: the commits (the three merges and every task's); the checks at
the last commit with their counts (Task 101); the first paint's six medians and the load (Task 102); the maintainer's
answer (Task 103); the Codex points and the final review's findings, each adopted with its commit or declined with its
reason; the parked table's final state (each row's outcome, and the count fixed / carried / closed); what came out
otherwise than planned — among them **the reader's pixel probe narrowed §2.4's list** (it shoots the toolbar, the four
popovers and a tooltip, not the capsule and the card: row 48) and **the preload's constants** (§4 names
`ON_DEMAND_MARGIN` and `ENTER_THRESHOLD`; the code keeps `DEFAULT_PRELOAD` and `preloadOf`, which DESIGN §10 names).

- [ ] **Step 2: Commit it**

```bash
git add experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part7-finish.md && node scripts/check-english.mjs
```

Where the gate names another count for this plan, set its entry to it (the reason gaining `; Part 7's record`) and add
the allowlist. Gate: `pnpm lint`, exit 0.

```bash
git commit -m "docs(plan): Part 7's record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 110: the pull request (controller, with the maintainer's explicit go-ahead)

- [ ] **Step 1: The go-ahead**

Tell the maintainer the stage is done (the record's summary) and ask whether to push and open the pull request. Nothing
below runs without an explicit yes.

- [ ] **Step 2: The base has not moved**

```bash
git fetch origin
git rev-parse --short origin/exp/pdf-bilingual
git merge-base --is-ancestor origin/exp/pdf-bilingual HEAD && echo "base in"
```

Expected: `cc781213` (or a later tip) and `base in`. If `exp/pdf-bilingual` has moved and is not in: stop and ask the
maintainer; with their yes, `git merge --no-ff origin/exp/pdf-bilingual` into this branch (a merge commit), the gate and
the suites of Task 101 Step 4 again.

- [ ] **Step 3: Push and open it**

The body, written to `$TMPDIR/pr-body.md`, in English, in this order:

1. What the stage is: the extension's interface redrawn from the PDF reader's design system — one token source and the
   shared controls, one appearance, configuration v20 and the service health record, the popup, the settings page, the
   floating button and the controls on arXiv's pages — with the design's path and the plans'.
2. What a reader sees: the changelog's `Unreleased` section, in its words.
3. What goes and who agreed: the design's §11, row by row.
4. Checks at the last commit: every count of Task 101, the first paint's medians (Task 102), the reader's pixels
   24 × ok.
5. Reviews: the local Codex pass and the final review — what was adopted, what was declined and why.
6. Follow-ups: the carried rows (now on #299), #303, #304.
7. Testing notes: a browser profile that ran a build of this branch from before 2026-09-26's final configuration v20
   may show "settings cannot be read" — an unreleased intermediate shape; resetting it drops its saved keys, so copy them
   first (row 53).

and ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. No `@codex review` in it:
Devin reviews this repository.

```bash
git push -u origin exp/extension-ui-redesign
gh pr create --base exp/pdf-bilingual --head exp/extension-ui-redesign \
  --title "feat(ui): the extension's interface, redesigned — tokens, one appearance, the popup, the settings page, the floating button" \
  --body-file "$TMPDIR/pr-body.md"
gh pr comment <number> --body "/devin review"
```

(`/devin review` as a comment of its own: with other words beside it, Devin does not answer.)

- [ ] **Step 4: The carried rows on #299**

`gh issue comment 299 --body-file "$TMPDIR/debt.md"`, the file headed `## Deferred at the extension's redesign
(#<number>)`, one checkbox line a carried row: the item, where it was found, the reason it waits.

- [ ] **Step 5: CI and the terminal signal**

```bash
gh pr checks <number> --watch
gh api repos/SRjoeee/ReadarXiv/pulls/<number>/reviews --paginate --jq '.[] | {user: .user.login, state, submitted_at}'
gh api repos/SRjoeee/ReadarXiv/issues/<number>/comments --paginate --jq '.[] | {user: .user.login, created_at, body: .body[0:120]}'
gh api repos/SRjoeee/ReadarXiv/pulls/<number>/comments --paginate --jq '.[] | {id, user: .user.login, path, line, body: .body[0:160]}'
gh api repos/SRjoeee/ReadarXiv/issues/<number>/reactions --jq '.[] | {user: .user.login, content}'
```

Expected before any merge: CI green; Devin's review in (its review or its comment saying it found nothing); and, where
Codex reacted to the push, its terminal signal — `+1` (nothing to say), a review with line comments, or its quota
notice — not `eyes`, which means it is still reviewing.

- [ ] **Step 6: Every comment answered**

Each comment is checked against a fixture, a probe or the code; one that reads true is fixed test first on this branch
(a commit each, the gate, the suites it touches), pushed, and answered by id
(`gh api repos/SRjoeee/ReadarXiv/pulls/<number>/comments/<id>/replies -f body=…`); one declined is answered with the
reason and, when it names a real but deferred problem, a line on #299. After fixes, `/devin review` again, as a comment
of its own, and Step 5 again.

- [ ] **Step 7: The merge**

When CI is green, the terminal signals are in, every comment is answered and the fixes' re-review found nothing new:
tell the maintainer, and merge unless they asked to hold — `gh pr merge <number> --merge` (a merge commit; never
`--squash`, never `--rebase`). Then `git fetch origin && git log --oneline -1 origin/exp/pdf-bilingual`: the merge is
the tip.
