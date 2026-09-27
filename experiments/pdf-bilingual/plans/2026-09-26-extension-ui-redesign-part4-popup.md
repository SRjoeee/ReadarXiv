# The extension's interface, redesigned — Part 4: the popup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the popup — in the toolbar and in the floating button's panel — from round 6 of the prototypes: the
brand row, the group, notes, the primary and its paused pair, the display, the foot, the menus with their 管理… rows,
P0's search and open, P17's two entries, the reader open, all on Part 3's shared controls.

**Architecture:** The layers stay three and pure where they are pure. `find.ts` reads P0's field (a pure function with a
table of cases). `state.ts` learns the tab's address, holds P0's query and runs the two checks of a paper once per id
after 300 ms of stillness, closes menus by kind and opens the settings page at a row; it starts from the record of refused
keys `main.tsx` read beside the configuration, so the first render never counts a refused service as runnable.
`view-model.ts` gives every state a `kind`, draws every menu whether open or not (a popover's contents must exist before
it opens), gives notes their tone, P0 its findings, and a page on the free service its way back once its key is made good; `fixtures.ts` holds one input per state and stays the single source of them (the gallery draws
them, the tests read them). The component, `PopupView.tsx` and its parts under `popup/ui/`, renders the view on Part 3's
`Button`, `Kbd`, `Segmented`, `MenuList`, `Reveal` and Part 1's `Popover`, `Switch`, `useTip`, `Icon`, with one sheet of
its own, `popup.css`, every measure round 6's and every colour a role. A menu is the browser's popover kept in step with
the view model; one that opens downward grows the popup by a `min-height` that is cleared as it closes, so that the
toolbar's window and the panel's frame (which measures the body, `embedded.ts`) hold it. The motions are §8's as they
apply here: a press 0.96, the segmented thumb, the menu's `pop-in`, the reveal of P0's entries.

**Tech Stack:** WXT 0.21, React 19, TypeScript, Tailwind v4 (only `sr-only` from it here), Vitest + happy-dom,
Playwright (Chromium) for the browser checks.

**Spec:** `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (the design): §5, §8, §9, §10.1.
Section references below (§n) are the design's. **Main plan:** `2026-09-26-extension-ui-redesign.md` beside this file;
its "## Part 3's interfaces" is the contract this plan builds on.

**Prototypes (read, never edit):** `/Users/cheongzhiyan/Downloads/readarxiv-test/design/extension-ui/` —
`popup-decisions.md`; `round-6/` (`tools/body.html`, `tools/build.py`, `index.html`'s resolved `<style>` holds rounds
1–6's rules in order, `png/rows/`); `round-4/png/states/` (every state, the menus); `kbd-chip/`.

## The controller's rulings this plan builds

`.superpowers/sdd/2026-09-26-extension-ui-redesign/plan-rulings.md` (rulings 1–14, 22), the main plan's amended
"## Part 3's interfaces" (5e1274c1), and Part 3's plan's "What Parts 4 and 5 use"
(`2026-09-26-extension-ui-redesign-part3-controls.md`), whose names this plan uses exactly. No question is open.

| Ruling | What this plan does with it | Task |
|---|---|---|
| 1 | `MenuListItem.lang`: on the reader's nine languages (their own names, `toBcp47`) and on the style rows' Chinese sample; the popup's full language list names each in the interface's language with its own after it, one string, so it carries none | 33 |
| 4, 7, 8 | the primary's key on the brand and on the neutral face by `shortcut`, none on P9 / P13's neutral twin; a greyed button on its size's neutral ground; the note's `raised` button as Part 3 draws it (26 px) | 35 |
| 5, 11 | the service menu's Chrome row (disabled, with 下载) answers through `onAction`, never `onPick`; the 管理… rows through `onPick` | 34 |
| 6 | the popup paints its own ground (`chrome`) | 34 |
| 9, 13 | `--group-hover` and `--on-brand-2` are Part 3's (its Task 14, with their contrast pairs); this part adds no token. The chevron keeps `ink-3` on `group-hover` (3.01:1 light, 3.19:1 dark, over 3:1: measured from the tokens while drafting) | 34, 36 |
| 10 | the display's icons passed to `Segmented` as elements | 35 |
| 12 | the worktree `.worktrees/redesign-popup` on `exp/ui-popup`, made by the controller | 30 |
| 14 | the readings where the design and the prototypes disagree stand (P0's order, the edges 12 / 24, the field's edge-only focus with `ink-2` placeholders, the note's icon on its first line, S-P-90 polite, P0's greyed entry with S-P-50b's reason) | 33, 35, 36 |
| 22 | the reader's service menu reading the record is Part 6's: `src/pdf-reader/ui/Menus.tsx` is not touched here | — |

Two items of the branch's final review land here too: **the first paint reads the record of refused keys with the
configuration**, so that a refused service is never drawn runnable and then flipped (Task 32), with the fixture P8b (a
refused key, nothing to take over; Task 33); and **the retranslate cue**: a page still translating on the free service
after its chosen service's key was refused is offered 重新翻译 once that key is made good (Task 33). The design gives the
cue no words of its own, so it has P13's pair as it is — 重新翻译 · 显示原文 — and no note.

From Part 3's plan, also: `trackModality()` already runs in the popup's `main.tsx`; the gallery is in every development
build (`pnpm exec wxt build --mode development`, into `.output/chrome-mv3-dev`; `wxt.config.ts`'s `DEV_PAGES`); the probes'
helpers are `tests/e2e/probes/align.mjs`'s `offCentre`, `edges`, `shootEach`; and the class names `ui`, `btn`, `kbd`,
`field`, `field-hint`, `field-error`, `input`, `radio`, `reveal`, `spin`, `seg`, `pop`, `tip`, `switch`, `swatch` are
not the popup's to reuse. `Button` carries its kind and size as classes (`btn brand lg`), so the popup's own class names
stay off `brand`, `neutral`, `text`, `raised`, `lg`, `md`, `sm` unless compounded with one of its own (`.go.brand`).

## Global Constraints

The main plan's, verbatim:

- Chrome 131 is the floor (`minimum_chrome_version`); no polyfills, no cross-browser branches.
- No `:has()` in any style sheet (DESIGN §7.2; `tests/styles/no-has.test.ts`).
- Every colour, shadow and ease a surface draws names a token of `src/shared/tokens.ts`; no raw colour in new code.
- Everything injected into arXiv's pages is prefixed `axt-` / `data-axt-` / `--axt-` (hard rule 2).
- The reader renders pixel for pixel as before (§2.4): `experiments/pdf-bilingual/spikes/reader-pixels.mjs` against the
  baseline Task 3 records, after every task that touches its sheet, its controls or its settings.
- Developer-visible text is English; reader-facing words come from the locale packs (`src/locales/zh-CN.ts`, `en.ts`),
  never hard-coded. No reader-facing string names a technical path (§1). `pnpm lint` runs the English gate; a file that
  must hold Chinese (a test finding a control by its Chinese name) gets an exact entry in `scripts/english-allowlist.txt`.
- API keys never enter the service health record, a log line, a cache key, a fixture or git (hard rule 5).
- The gate before each commit that ends a task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, judged by the
  exit code.
- Commits are local (Part 4: on `exp/ui-popup`, merged into `exp/extension-ui-redesign` by the controller); the stage goes out as one pull request when the last part is done
  (never `main`; merge commits). Files are added by name, never `git add -A`. Never commit
  the untracked `experiments/pdf-bilingual/spikes/geometry-lock*.mjs` / `prompt-ablation.mjs` (another session's
  work). The gallery's break harness that stood beside them was removed on 2026-09-27: a task that changes
  `src/entrypoints/gallery/main.tsx` commits it with its own files. Never run `git reset --hard`,
  `git checkout -- <path>`, `git restore`, `git clean` or `git stash`: rewind with `--mixed` / `--soft`, and put back
  only files named, by their content.
- Every commit message is `type(scope): summary` and ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Part 4's own:

- **Where:** the worktree `.worktrees/redesign-popup` on `exp/ui-popup`, which the controller makes from Part 3's last
  commit (ruling 12). Its commits stay there; the controller merges the branch into `exp/extension-ui-redesign` with a
  merge commit, before Part 5's.
- **The lane:** the popup's files (`src/entrypoints/popup/**`, its own controls in `src/entrypoints/popup/ui/`), the
  popup's part of the locale packs (`S`), `tests/popup/**`, the popup's lines of the e2e suites and spikes, and the files
  this plan names. A file Part 5 also touches (a locale pack, `package.json`, `tests/ui/locales.test.ts`,
  `scripts/english-allowlist.txt`) is changed additively, in its own place. No token is added (ruling 13), nothing of
  `src/ui` is deleted (Part 7), and nothing reads `ui.css`'s `--axt-*` tokens that did not before.
- **Part 3's names exactly** ("## Part 3's interfaces"); a need they do not meet goes to the controller, not around them.
- **The floating button's panel** frames `popup.html` (`embedded.ts` reports the body's height): it keeps working, and a
  menu opened there grows the frame.
- **The view model and its fixtures are the single source of the popup's states:** every state of UI.md §4, with the
  design's changes, is a fixture; the gallery draws them all.
- **P0's two checks never run on a keystroke:** once per paper id, after the field has been still for 300 ms.
- **New files are `git add`ed before `pnpm lint`:** the English and the boundary gates read git's index. The English
  gate's counts are exact: a task that changes a file's lines holding Chinese sets that file's entry to the count
  `pnpm check:english` reports, with the reason the task gives.
- **`src/entrypoints/gallery/main.tsx`:** a task that changes it says so, edits only the lines it names, and commits it
  with its own files (the break harness that once sat in this file is gone).
- **Documents:** UI.md and DESIGN.md are Part 7's (§13). This part changes no document but this plan's "Part 4: done".

## Review Focus

- **A paper id typed key by key** (`2`, `25`, … `2501.0720`, `2501.07202`): `2501.0720` is itself an id's shape. Only
  the id the field holds after 300 ms of stillness is checked, once, and never again for that id. Pinned in Task 32 (the
  state, on a fake clock) and Task 38 (the real HEADs counted).
- **The first frames**: before the first answer about the tab the popup must not draw P0's field (it would flash on
  every open of an arXiv page), a paper's page still silent is loading and not P0, and a refused service is never drawn
  runnable and then flipped (the record is read with the configuration, before the first render). Tasks 32 (the tab
  unknown until the first answer settles; the state seeded with the record) and 33 (the kinds).
- **The retranslate cue, and a refusal that stands**: a page on the free service after its chosen service's key was
  refused is offered 重新翻译 once the record no longer holds the service and the chain a start would run on runs it
  again; while the record holds it, or while that chain still passes it over (a 403 is `auth` too, and `background/health-guard.ts` marks a 401 only),
  the page shows P6 as before. Tasks 32 (the chain asked again as the record changes) and 33 (the view, P6 and P6b).
- **Enter that ends an input method's composition** (a Chinese title typed in Pinyin) must not open arXiv's search.
  Task 36.
- **A menu taller than the popup, or than the room above the foot**: the popup grows by `min-height` and gives it back
  on close; the style menu is held to the room above its button; the anchors the row carries (its menu's and its
  tooltip's) are one declaration. Tasks 34 (`fitMenu`, `anchors`) and 38 (the real window, the panel).

(Ids that read as host names — `math.GT/0309136`, `2501.07202` — are tried before links; Task 31's table pins each.)

## Files, Part 4

| File | Task | Responsibility |
|---|---|---|
| `tests/e2e/probes/popup-first-paint.mjs` (new) | 30 | The popup's first paint in the toolbar's place and the panel's, against a baseline |
| `src/entrypoints/popup/find.ts` (new) | 31 | `readQuery`, `searchUrl`, `ADVANCED_SEARCH`, `isPaperAddress` |
| `src/core/pdf/entry.ts` | 31 | `htmlVersionOf`, `bilingualPdfOf`, `ENTRY_CHECK_MS`: the entry pages' two HEADs, shared |
| `src/entrypoints/pdf.content.ts` | 31 | The PDF page's HEADs through the shared functions (unchanged behaviour) |
| `src/entrypoints/popup/state.ts` | 32 | The tab, P0's field and its checks, `closeMenu(kind)`, `openLink`, the settings' deep links; seeded with the record; the chain asked again as the record changes |
| `src/entrypoints/popup/{data.ts,App.tsx,main.tsx}` | 32 | The host's `tabUrl` and `entriesOf`; the record read with the configuration before the first render and handed to the state |
| `src/entrypoints/popup/view-model.ts` | 32, 33 | `tab` and `find` in; `kind`, `menus`, `menu`, a note's `tone`, P0's findings, the retranslate cue out |
| `src/entrypoints/popup/fixtures.ts` | 32, 33 | Every state: P0 and its findings, loading, before the first answer, the reader, a failure, P6b, P8b |
| `src/locales/zh-CN.ts`, `src/locales/en.ts` | 32, 33 | `S.rows.managePrompts`, `S.find`, `S.loading`; `S.notArxiv` goes |
| `src/entrypoints/popup/ui/{menu-fit.ts,painted.ts,menu.tsx}` (new) | 34 | The menus: the popover in step with the view, the popup growing, the rows drawn after the first paint |
| `src/entrypoints/popup/popup.css` (new) | 34–36 | The popup's sheet |
| `src/entrypoints/popup/PopupView.tsx` | 33, 35, 36 | Adapted to the new view (33), redrawn (35), P0 (36) |
| `src/entrypoints/popup/ui/{Note,ModeIcon,Entries,Find}.tsx` (new) | 35, 36 | A note, the display's icons, the two entries, P0 |
| `tests/e2e/{extension,image,layout,a11y,pdf-entry}.mjs`, `tests/e2e/probes/{highlight-lag,reading-position}.mjs`, `experiments/pdf-bilingual/spikes/entries.mjs` | 37 | The display found as radios, greyed buttons by `aria-disabled`, P0's words |
| `tests/e2e/popup.mjs` (new), `tests/e2e/probes/popup-align.mjs` (new), `package.json` | 38 | The popup in a real browser; the alignment probe on the development build's gallery |
| `src/entrypoints/gallery/main.tsx` | 32, 33 | Two new actions; a fixture's error |
| tests: `tests/popup/{find,state,view-model,menu-fit,menu,sheet,view,find-view}.test.ts`, `tests/popup/draw.ts`, `tests/entry/pdf-entry.test.ts`, `tests/ui/locales.test.ts` | 31–36 | |

---

# Part 4: the popup

### Task 30: the worktree, and the baselines the part is judged against

**Files:**
- Create: `tests/e2e/probes/popup-first-paint.mjs`

**Interfaces:**
- Consumes: the build (`.output/chrome-mv3`); the network (an arXiv abstract page).
- Produces: `experiments/pdf-bilingual/out/popup-first-paint/baseline.json` and `experiments/pdf-bilingual/out/reader-pixels/baseline/`
  (never committed: `experiments/pdf-bilingual/.gitignore` holds `out/`), recorded from the popup and the reader as
  Part 3 left them. `node tests/e2e/probes/popup-first-paint.mjs` exits 1 when a median first paint is more than 10 % and
  4 ms slower than the baseline's.

- [ ] **Step 1: Check the worktree**

The controller made it from Part 3's last commit (ruling 12). Every command of this part runs in it.

Run: `cd /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/redesign-popup && git branch --show-current && git log --oneline -1 && git status --short`
Expected: `exp/ui-popup`; the commit is Part 3's last (the dispatch names it); no changes. Otherwise stop and report.

- [ ] **Step 2: Install, and bring the reader's demo papers in**

The reader's pixel probe opens a precompiled demo paper that the repository may not hold (it is made on this machine
and ignored); the main worktree has it.

```bash
pnpm install
mkdir -p experiments/pdf-bilingual/poc-reader
cp -R ../exp-pdf/experiments/pdf-bilingual/poc-reader/papers experiments/pdf-bilingual/poc-reader/
```

Expected: `pnpm install` exits 0 (it runs `wxt prepare`); `experiments/pdf-bilingual/poc-reader/papers/2608.02163` exists.

- [ ] **Step 3: Write the first-paint probe**

`tests/e2e/probes/popup-first-paint.mjs`:

```js
// How fast the popup paints (the redesign's design, §12: the popup opens as fast as it did), in the toolbar's place and
// in the floating button's panel: popup.html opened in a tab the toolbar popup's size, and the panel's frame opened by
// the floating button's main button on an abstract page — ten times each, the median of the first contentful paint.
// `--baseline` records the build as it is (Part 4's Task 30: the popup as Part 3 left it); without it the build is
// measured against that record, and a median more than 10 % and 4 ms slower fails. Build first; the panel needs the
// network (arXiv).
//   node tests/e2e/probes/popup-first-paint.mjs [--baseline]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/popup-first-paint/', import.meta.url))
const BASELINE = join(OUT, 'baseline.json')
const RUNS = 10
/** an abstract page, where the floating button's main button opens the panel */
const ABSTRACT = `https://arxiv.org/abs/${process.env.AXT_PAPER ?? '1706.03762'}`
const recording = process.argv.includes('--baseline')
mkdirSync(OUT, { recursive: true })
if (!recording && !existsSync(BASELINE)) throw new Error('no baseline: run with --baseline on the build before the change')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const median = values => {
  if (values.length < RUNS / 2) throw new Error(`only ${values.length} of ${RUNS} runs painted`)
  const s = [...values].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
/** the first contentful paint of a page or a frame, from its own time origin; null if none came within 5 s */
const firstPaint = target => target.evaluate(() => new Promise(resolve => {
  const read = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime
  const wait = (n = 0) => (read() !== undefined || n > 100 ? resolve(read() ?? null) : setTimeout(() => wait(n + 1), 50))
  wait()
}))

const profile = mkdtempSync(join(tmpdir(), 'popup-first-paint-'))
// the profile goes when the process ends, a failure's throw included (a profile a run once filled the disk)
process.on('exit', () => rmSync(profile, { recursive: true, force: true }))
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
context.setDefaultNavigationTimeout(90_000)
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host

const toolbar = []
for (let i = 0; i < RUNS; i++) {
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 320, height: 600 })
  await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' })
  toolbar.push(await firstPaint(popup))
  await popup.close()
}
const panel = []
const page = await context.newPage()
for (let i = 0; i < RUNS; i++) {
  await page.goto(ABSTRACT, { waitUntil: 'load' })
  await sleep(1500)
  // a real click, pressed and released: the press puts up the button's drag shield (pdf-entry.mjs)
  const at = await page.evaluate(() => {
    const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (!at) throw new Error('no floating button on the abstract page')
  await page.mouse.click(at.x, at.y)
  await sleep(2500)
  const frame = page.frames().find(f => f.url().includes('/popup.html'))
  panel.push(frame ? await firstPaint(frame) : null)
}
await context.close()

const now = { toolbar: median(toolbar.filter(Number.isFinite)), panel: median(panel.filter(Number.isFinite)) }
if (recording) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 1))
  console.log(`baseline recorded: toolbar ${now.toolbar.toFixed(1)} ms, panel ${now.panel.toFixed(1)} ms (medians of ${RUNS})`)
  process.exit(0)
}
const before = JSON.parse(readFileSync(BASELINE, 'utf8'))
let failed = 0
for (const where of ['toolbar', 'panel']) {
  const slower = now[where] > before[where] * 1.1 + 4
  console.log(`${slower ? 'FAIL' : 'ok  '} ${where}: first contentful paint ${before[where].toFixed(1)} → ${now[where].toFixed(1)} ms (median of ${RUNS})`)
  if (slower) failed++
}
process.exit(failed ? 1 : 0)
```

- [ ] **Step 4: Record both baselines from the build as Part 3 left it**

Run: `pnpm build && node tests/e2e/probes/popup-first-paint.mjs --baseline && node experiments/pdf-bilingual/spikes/reader-pixels.mjs --baseline`
Expected: `baseline recorded: toolbar … ms, panel … ms (medians of 10)`, then `baseline recorded: 24 files in …`; exit 0.

- [ ] **Step 5: Check both probes against themselves**

Run: `node tests/e2e/probes/popup-first-paint.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: two `ok` lines, then 24 lines of `ok`; exit 0. A first-paint `FAIL` on an unchanged build means the machine
is too noisy for the threshold: record again with nothing else running, and say so in the task's report.

- [ ] **Step 6: Run the gate and commit**

Run: `git add tests/e2e/probes/popup-first-paint.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git commit -m "test(popup): record the popup's first paint before the redesign

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 31: P0's reading of a line, and the entry pages' two checks shared

**Files:**
- Create: `src/entrypoints/popup/find.ts`
- Modify: `src/core/pdf/entry.ts` (append), `src/entrypoints/pdf.content.ts` (the two HEADs, the import)
- Modify: `scripts/english-allowlist.txt`
- Test: `tests/popup/find.test.ts`, `tests/entry/pdf-entry.test.ts`

**Interfaces:**
- Consumes: `paperIdFrom(pathname, section)` (`@/core/paper-id`), `pdfUrlOf`, `translatedHtmlUrlOf`, `htmlUrlOf`, `sourceKindOf` (`@/core/pdf/entry`).
- Produces:
  - `@/entrypoints/popup/find`: `type Query = { kind: 'empty' } | { kind: 'open'; format: 'pdf' | 'html'; id: string; href: string } | { kind: 'paper'; id: string } | { kind: 'search'; query: string; href: string } | { kind: 'elsewhere' }`;
    `readQuery(text: string): Query`; `searchUrl(query: string): string`; `ADVANCED_SEARCH: string`; `isPaperAddress(url: string): boolean`.
  - `@/core/pdf/entry`: `ENTRY_CHECK_MS = 3000`; `htmlVersionOf(id: string, fetchFn: typeof fetch, origin?: string): Promise<string | null>`;
    `bilingualPdfOf(id: string, fetchFn: typeof fetch, origin?: string): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

`tests/popup/find.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ADVANCED_SEARCH, isPaperAddress, readQuery, searchUrl } from '@/entrypoints/popup/find'

// P0's field (the redesign's design, §5.4): every way a paper is written, and what is not one. An id is tried before a
// link: `math.GT/0309136` reads as a host name with a path, and `2501.07202` as one without
const open = (format: 'pdf' | 'html', id: string) => ({ kind: 'open', format, id, href: `https://arxiv.org/${format}/${id}#readarxiv` })
const paper = (id: string) => ({ kind: 'paper', id })
const search = (query: string) => ({ kind: 'search', query, href: searchUrl(query) })
const ELSEWHERE = { kind: 'elsewhere' }

const CASES: [string, unknown][] = [
  // nothing yet
  ['', { kind: 'empty' }],
  ['   ', { kind: 'empty' }],
  // an arXiv PDF address, in every version and spelling: that page, translating
  ['https://arxiv.org/pdf/2501.07202', open('pdf', '2501.07202')],
  ['https://arxiv.org/pdf/2501.07202v1', open('pdf', '2501.07202v1')],
  ['https://arxiv.org/pdf/2501.07202v1.pdf', open('pdf', '2501.07202v1')],
  ['http://arxiv.org/pdf/hep-th/9901001v2', open('pdf', 'hep-th/9901001v2')],
  ['arxiv.org/pdf/1706.03762', open('pdf', '1706.03762')],
  ['https://www.arxiv.org/pdf/cond-mat.mes-hall/0601001', open('pdf', 'cond-mat.mes-hall/0601001')],
  // an arXiv HTML address, likewise
  ['https://arxiv.org/html/2501.07202v1', open('html', '2501.07202v1')],
  ['https://arxiv.org/html/2501.07202v1/', open('html', '2501.07202v1')],
  ['https://arxiv.org/html/2501.07202v1#S3', open('html', '2501.07202v1')],
  ['https://export.arxiv.org/html/2501.07202', open('html', '2501.07202')],
  // an abstract address, a bare id, a cited id, an arXiv DOI: a paper, its two entries offered
  ['https://arxiv.org/abs/2501.07202v1', paper('2501.07202v1')],
  ['https://arxiv.org/abs/2501.07202?context=cs.CL', paper('2501.07202')],
  ['https://export.arxiv.org/abs/math.GT/0309136', paper('math.GT/0309136')],
  ['2501.07202', paper('2501.07202')],
  ['2501.07202v1', paper('2501.07202v1')],
  [' 0704.0001 ', paper('0704.0001')],
  ['hep-th/9901001', paper('hep-th/9901001')],
  ['math.GT/0309136', paper('math.GT/0309136')],
  ['cond-mat.mes-hall/0601001v1', paper('cond-mat.mes-hall/0601001v1')],
  ['arXiv:2501.07202', paper('2501.07202')],
  ['arxiv: 2501.07202v2', paper('2501.07202v2')],
  ['arXiv:2501.07202 [cs.CL]', paper('2501.07202')],
  ['ARXIV:hep-th/9901001', paper('hep-th/9901001')],
  ['10.48550/arXiv.2501.07202', paper('2501.07202')],
  ['doi:10.48550/ARXIV.2501.07202', paper('2501.07202')],
  ['10.48550/arXiv.hep-th/9901001', paper('hep-th/9901001')],
  ['https://doi.org/10.48550/arXiv.2501.07202', paper('2501.07202')],
  // a link that is not an arXiv paper's: said, and Enter does nothing
  ['https://doi.org/10.1038/s41586-021-03819-2', ELSEWHERE],
  ['https://doi.org/%ZZ', ELSEWHERE],
  ['https://www.nature.com/articles/s41586-021-03819-2', ELSEWHERE],
  ['nature.com/articles/s41586-021-03819-2', ELSEWHERE],
  ['www.semanticscholar.org', ELSEWHERE],
  ['https://arxiv.org/list/cs.CL/recent', ELSEWHERE],
  ['https://arxiv.org/abs/not-an-id', ELSEWHERE],
  // anything else: words for arXiv's own search
  ['attention is all you need', search('attention is all you need')],
  ['Vaswani', search('Vaswani')],
  ['node.js', search('node.js')],
  ['10.1038/s41586-021-03819-2', search('10.1038/s41586-021-03819-2')],
  ['量子纠错', search('量子纠错')],
]

describe('what P0\'s field reads (the redesign\'s design, §5.4)', () => {
  for (const [text, expected] of CASES) it(`${JSON.stringify(text)}`, () => expect(readQuery(text)).toEqual(expected))

  it('searches as arXiv\'s own header does, and links its advanced search', () => {
    expect(searchUrl('attention is all you need')).toBe('https://arxiv.org/search/?query=attention+is+all+you+need&searchtype=all&source=header')
    expect(ADVANCED_SEARCH).toBe('https://arxiv.org/search/advanced')
  })

  it('knows a paper\'s page on arxiv.org, where the extension answers, from any other address', () => {
    for (const url of ['https://arxiv.org/html/2501.07202v1', 'https://arxiv.org/abs/hep-th/9711200', 'https://arxiv.org/pdf/2501.07202']) expect([url, isPaperAddress(url)]).toEqual([url, true])
    for (const url of ['https://arxiv.org/list/cs.CL/recent', 'https://export.arxiv.org/abs/2501.07202', 'https://example.com/html/2501.07202', 'chrome-extension://abc/popup.html', 'not an address']) expect([url, isPaperAddress(url)]).toEqual([url, false])
  })
})
```

In `tests/entry/pdf-entry.test.ts`, change the import from `@/core/pdf/entry` to

```ts
import { bilingualPdfOf, htmlUrlOf, htmlVersionOf, paperIdFromPdfPath, pdfUrlOf, readerWanted, sourceKindOf, translatedHtmlUrlOf } from '@/core/pdf/entry'
```

add `vi` to the import from `vitest`, and append:

```ts
describe('a paper\'s two entries, checked (the PDF page\'s HEADs, and the popup\'s search: the redesign\'s design, §5.4)', () => {
  const answering = (status: number, type?: string) => vi.fn(async () => new Response(null, { status, headers: type ? { 'content-type': type } : {} }))
  const failing = () => vi.fn(async () => { throw new TypeError('Failed to fetch') })

  it('offers the HTML version unless arXiv says there is none: only a 404 or a 410 does', async () => {
    const fetchFn = answering(200)
    expect(await htmlVersionOf('2501.07202', fetchFn)).toBe('https://arxiv.org/html/2501.07202#readarxiv')
    expect(fetchFn).toHaveBeenCalledWith('https://arxiv.org/html/2501.07202', { method: 'HEAD', credentials: 'omit' })
    for (const status of [404, 410]) expect(await htmlVersionOf('2501.07202', answering(status))).toBeNull()
    for (const said of [answering(429), answering(503), failing()]) expect(await htmlVersionOf('2501.07202', said)).toBe('https://arxiv.org/html/2501.07202#readarxiv')
    expect(await htmlVersionOf('hep-th/9711200', answering(200), 'https://export.arxiv.org')).toBe('https://export.arxiv.org/html/hep-th/9711200#readarxiv')
  })

  it('offers the bilingual PDF unless the source is a PDF-only submission; anything else says nothing', async () => {
    const fetchFn = answering(200, 'application/gzip')
    expect(await bilingualPdfOf('2501.07202', fetchFn)).toBe('https://arxiv.org/pdf/2501.07202#readarxiv')
    expect(fetchFn).toHaveBeenCalledWith('https://arxiv.org/src/2501.07202', { method: 'HEAD', credentials: 'omit' })
    expect(await bilingualPdfOf('2501.07202', answering(200, 'application/pdf'))).toBeNull()
    for (const said of [answering(200, 'text/html'), answering(404), answering(503), failing()]) expect(await bilingualPdfOf('2501.07202', said)).toBe('https://arxiv.org/pdf/2501.07202#readarxiv')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/popup/find.test.ts tests/entry/pdf-entry.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/popup/find"`; `htmlVersionOf` is not exported.

- [ ] **Step 3: The two checks, shared**

Append to `src/core/pdf/entry.ts`:

```ts
/**
 * How long a check of a paper's entries waits for arXiv (the redesign's design, §5.4): an answer not back by then says
 * nothing about the paper, and the entry is offered, as the reader's own check of the HTML version does (its session, 3 s)
 */
export const ENTRY_CHECK_MS = 3000

/**
 * The paper's HTML version with the hash that starts its translation, or null where arXiv says it has none: one HEAD.
 * **Only arXiv saying so means there is none** (404, or 410): a request that failed, a 429 or a 5xx say nothing about
 * the paper, and the link is offered — at worst it leads to arXiv's own answer (Devin on #247). `fetchFn` is the
 * caller's: the PDF page asks its own origin, the popup arXiv's by its host permission
 */
export function htmlVersionOf(id: string, fetchFn: typeof fetch, origin = 'https://arxiv.org'): Promise<string | null> {
  return fetchFn(htmlUrlOf(id, origin), { method: 'HEAD', credentials: 'omit' })
    .then(res => res.status, () => null)
    .then(status => (status === 404 || status === 410 ? null : translatedHtmlUrlOf(id, origin)))
}

/**
 * The paper's PDF asking for the reader, or null where it cannot be had as a bilingual PDF (the reader's design, §2):
 * one HEAD on its source, where a PDF-only submission answers application/pdf; anything else leaves the entry offered.
 * Whether this browser runs the reader at all is the caller's to ask first (pdf-reader/support.ts)
 */
export function bilingualPdfOf(id: string, fetchFn: typeof fetch, origin = 'https://arxiv.org'): Promise<string | null> {
  return fetchFn(`${origin}/src/${id}`, { method: 'HEAD', credentials: 'omit' })
    .then(res => (res.ok ? sourceKindOf(res.headers.get('content-type')) : ('unknown' as const)), () => 'unknown' as const)
    .then(source => (source === 'pdf-only' ? null : pdfUrlOf(id, origin)))
}
```

In `src/entrypoints/pdf.content.ts`, replace the import from `@/core/pdf/entry` with

```ts
import { bilingualPdfOf, htmlVersionOf, paperIdFromPdfPath, pdfUrlOf, readerWanted, translatedHtmlUrlOf } from '@/core/pdf/entry'
```

and replace the block from the comment `// Only the head: the HTML full text is hundreds of kilobytes, …` through
`.then(source => (heard.pdf = source === null || source === 'pdf-only' ? null : pdfUrlOf(id, location.origin)))` (the
`href` and `pdf` constants and their comments) with:

```ts
    // Only the head: the HTML full text is hundreds of kilobytes, and all that is asked is whether it exists. What a HEAD
    // says is htmlVersionOf's rule (core/pdf/entry.ts), which the popup's search follows too
    const href = htmlVersionOf(id, fetch, location.origin).then(html => (heard.html = html))
    // Whether the paper can be had as a bilingual PDF (the reader's design, §2): one HEAD on its source, same-origin as
    // the HTML one and at the same time. A browser that cannot run the reader offers none
    const pdf = (readerRuns() ? bilingualPdfOf(id, fetch, location.origin) : Promise.resolve(null)).then(bilingual => (heard.pdf = bilingual))
```

(`offeredHtml` stays: the page answers with it while the HEAD is out.)

- [ ] **Step 4: P0's reading**

`src/entrypoints/popup/find.ts`:

```ts
// P0's field (the redesign's design, §5.4): what a line typed or pasted asks for, decided as it is typed and acted on at
// Enter only. A pure function of the text. An arXiv PDF or HTML address opens that page translating; an abstract
// address, a bare id — new style or old, with its version or without, after `arXiv:` or not — or an arXiv DOI names a
// paper, whose two entries the popup then offers (P17's); any other link is not the popup's to open; anything else is
// words for arXiv's own search. An id is tried before a link: `math.GT/0309136` reads as a host name with a path
import { paperIdFrom } from '@/core/paper-id'
import { pdfUrlOf, translatedHtmlUrlOf } from '@/core/pdf/entry'

export type Query =
  | { kind: 'empty' }
  | { kind: 'open'; format: 'pdf' | 'html'; id: string; href: string }
  | { kind: 'paper'; id: string }
  | { kind: 'search'; query: string; href: string }
  | { kind: 'elsewhere' }

/** arXiv's advanced search, the link under the field */
export const ADVANCED_SEARCH = 'https://arxiv.org/search/advanced'

/** arXiv's search for words, as the field in its own header sends them */
export const searchUrl = (query: string): string => `https://arxiv.org/search/?${new URLSearchParams({ query, searchtype: 'all', source: 'header' })}`

/** The hosts that serve arXiv's papers at the same paths; what the popup opens is always arxiv.org's */
const ARXIV_HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'])
/** arXiv's DOIs, 10.48550/arXiv.<id>, the id in either style; `doi:` before it as citations write it */
const DOI = /^(?:doi:\s*)?10\.48550\/arxiv\.(\S+)$/i
/** `arXiv:` before an id, as papers cite one another, the category after it or not */
const CITED = /^arxiv:\s*(\S+)(?:\s+\[[^\]]+\])?$/i
/** What reads as an address: a scheme, `www.`, or a host name with a path after it — words with a dot in them do not */
const LINK = /^(?:[a-z][a-z\d+.-]*:\/\/\S+|www\.\S+|(?:[a-z\d-]+\.)+[a-z]{2,}[/?#]\S*)$/i
const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i

/** An id as arXiv writes one, or null: the shapes are core/paper-id.ts's, which the entry pages read */
const idOf = (text: string | undefined): string | null => (text ? paperIdFrom(`/abs/${text}`, 'abs') : null)

export function readQuery(text: string): Query {
  const q = text.trim()
  if (!q) return { kind: 'empty' }
  const id = idOf(q) ?? idOf(CITED.exec(q)?.[1]) ?? idOf(DOI.exec(q)?.[1])
  if (id) return { kind: 'paper', id }
  if (LINK.test(q)) return linkOf(q)
  return { kind: 'search', query: q, href: searchUrl(q) }
}

function linkOf(text: string): Query {
  let url: URL
  try {
    url = new URL(SCHEME.test(text) ? text : `https://${text}`)
  } catch {
    return { kind: 'elsewhere' }
  }
  const host = url.hostname.toLowerCase()
  // a DOI's own resolver, an arXiv DOI after it
  if (host === 'doi.org' || host === 'dx.doi.org') {
    let path = url.pathname.slice(1)
    try {
      path = decodeURIComponent(path)
    } catch {} // a malformed escape is not an arXiv DOI either
    const id = idOf(DOI.exec(path)?.[1])
    return id ? { kind: 'paper', id } : { kind: 'elsewhere' }
  }
  if (!ARXIV_HOSTS.has(host)) return { kind: 'elsewhere' }
  const pdf = paperIdFrom(url.pathname, 'pdf')
  if (pdf) return { kind: 'open', format: 'pdf', id: pdf, href: pdfUrlOf(pdf) }
  const html = paperIdFrom(url.pathname, 'html')
  if (html) return { kind: 'open', format: 'html', id: html, href: translatedHtmlUrlOf(html) }
  const abs = paperIdFrom(url.pathname, 'abs')
  return abs ? { kind: 'paper', id: abs } : { kind: 'elsewhere' }
}

/**
 * Whether an address is an arXiv paper's page the extension answers on — its full text, its abstract, its PDF — so that
 * a tab there not answering yet is a page still loading, not P0 (§5.4). arxiv.org's alone: the content scripts match it
 */
export function isPaperAddress(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' && parsed.hostname === 'arxiv.org' && (['html', 'abs', 'pdf'] as const).some(section => paperIdFrom(parsed.pathname, section) !== null)
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/popup/find.test.ts tests/entry/pdf-entry.test.ts`
Expected: PASS. A case that fails names the text: the regular expression or the order of the tries is wrong, not the case.

- [ ] **Step 6: Allow the Chinese search**

In `scripts/english-allowlist.txt`, before the line that starts `tests/popup/view-model.test.ts`, add:

```
tests/popup/find.test.ts 1  # 2026-09-26: a search typed in Chinese goes to arXiv's search as it is (the redesign's P0, §5.4)
```

- [ ] **Step 7: Run the gate and commit**

Run: `git add src/entrypoints/popup/find.ts tests/popup/find.test.ts src/core/pdf/entry.ts src/entrypoints/pdf.content.ts scripts/english-allowlist.txt tests/entry/pdf-entry.test.ts && node scripts/check-english.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0; the English gate names no file (`tests/popup/find.test.ts 1`, Step 6: its one line holding Chinese
is a search typed in Chinese, test data; the other files hold none).

```bash
git commit -m "feat(popup): read P0's field, and share the entry pages' two checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 32: the state — the tab, P0's field and its checks, the record from the first render, the settings' deep links

**Files:**
- Modify: `src/entrypoints/popup/state.ts`, `src/entrypoints/popup/data.ts`, `src/entrypoints/popup/App.tsx`, `src/entrypoints/popup/main.tsx`
- Modify: `src/entrypoints/popup/view-model.ts` (`PopupInput`, `MANAGE_PROMPTS`, the prompt menu's last row)
- Modify: `src/entrypoints/popup/fixtures.ts` (`base`)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`S.rows.managePrompts`)
- Modify: `src/entrypoints/gallery/main.tsx` (its `actions` constant only)
- Test: `tests/popup/state.test.ts`, `tests/ui/locales.test.ts` (two literals)

**Interfaces:**
- Consumes: `readQuery` (Task 31), `htmlVersionOf`, `bilingualPdfOf`, `ENTRY_CHECK_MS` (Task 31), `readerRuns` (`@/pdf-reader/support`),
  `rejectedServices`, `watchRejected` (`@/shared/service-health`, unchanged by the fix wave at 1de87141, which added
  `markRejected(id, still?)` and `clearRejectedAmong`); `main.tsx` as that wave left it, reading the configuration once
  through `await prepareFirstPaint(…)` (`@/ui/first-paint`); `state.ts`'s startup read of the record, which that wave
  gave a `.catch(() => undefined)` (kept as it is).
- Produces:
  - `createPopupState(host: PopupHost, seed?: { rejected?: readonly string[] }): PopupState` — the record of refused
    keys as `main.tsx` read it, so that the first input already counts it; `usePopupData(seed?)` (`data.ts`) and
    `App({ rejected }: { rejected?: readonly string[] })` carry it there;
  - the saved settings' chain asked again whenever the record changes (the retranslate cue, Task 33, reads it);
  - `PopupHost.tabUrl(): Promise<string | null>`; `PopupHost.entriesOf(id: string): Promise<{ html: string | null; pdf: string | null }>`.
  - `PopupActions.setQuery(text: string): void`; `PopupActions.openLink(url: string): void`;
    `PopupActions.closeMenu(kind?: MenuKind): void` (closes that menu only if it is the one open);
    `PopupActions.openOptions(link?: OptionsLink): void` with `type OptionsLink = 'translate/services' | 'translate/prompts' | 'appearance/styles'`
    (replacing `OptionsSection`; `data.ts` re-exports it).
  - `STILL_MS = 300` (`@/entrypoints/popup/state`).
  - `PopupInput.tab: { url: string | null; asking: boolean } | null` (null until the first ask about the tab's page has
    settled); `PopupInput.find: { query: string; entries: { id: string; html: string | null; pdf: string | null } | null }`.
  - `MANAGE_PROMPTS = '__manage-prompts'` (`@/entrypoints/popup/view-model`); `S.rows.managePrompts`.

- [ ] **Step 1: Write the failing tests**

In `tests/popup/state.test.ts`:

- the import from `@/entrypoints/popup/state` becomes `import { type PopupHost, STILL_MS, createPopupState } from '@/entrypoints/popup/state'`,
  and the one from `@/entrypoints/popup/view-model` becomes `import { MANAGE_PROMPTS, MANAGE_SERVICES, MANAGE_STYLES } from '@/entrypoints/popup/view-model'`;
- in `world()`, the object `w` gains, after `embedded: false,`:

```ts
    /** The active tab's address as the extension may read it: arXiv's, or null */
    url: null as string | null,
    /** Every paper P0's field had checked, in order, and what the checks answer for an id */
    checks: [] as string[],
    entries: {} as Record<string, { html: string | null; pdf: string | null }>,
```

  and `host` gains, after `downloadPack: …,`:

```ts
    tabUrl: async () => w.url,
    entriesOf: async id => { w.checks.push(id); return w.entries[id] ?? { html: `https://arxiv.org/html/${id}#readarxiv`, pdf: `https://arxiv.org/pdf/${id}#readarxiv` } },
```

- `function world() {` becomes `function world(seed: Parameters<typeof createPopupState>[1] = {}) {`, and in it
  `const popup = createPopupState(host)` becomes `const popup = createPopupState(host, seed)` (`markRejected`, which
  the new tests call, is already imported, line 11: a second import is a redeclaration);
- replace the test `'“Manage services” brings the settings page to the front; “Manage styles” opens its Reading section; framed beside the floating button the popup asks to go'` with:

```ts
  it('each menu\'s Manage… row opens the settings page at its row, in a tab of its own; the gear brings the page to the front; framed, the popup asks to go (the redesign\'s design, §5.3, §6.1)', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    p.popup.actions.chooseService(MANAGE_SERVICES)
    await flush()
    p.popup.actions.choosePrompt(MANAGE_PROMPTS)
    await flush()
    expect(p.w.closed).toBe(0)
    p.w.embedded = true
    p.popup.actions.chooseStyle(MANAGE_STYLES)
    await flush()
    expect(p.w.opened).toEqual(['ext:///options.html#translate/services', 'ext:///options.html#translate/prompts', 'ext:///options.html#appearance/styles'])
    expect(p.w.closed).toBe(1)
    p.popup.actions.openOptions()
    expect(p.w.optionsPages).toBe(1)
    expect((await getConfig()).provider).toBe(BASE.provider)
    p.stop()
  })

  it('P0 opens what it opens in a new tab, and the popup goes (§5.4)', async () => {
    const p = await opened()
    p.popup.actions.openLink('https://arxiv.org/search/advanced')
    await until(() => p.w.closed === 1)
    expect(p.w.opened).toEqual(['https://arxiv.org/search/advanced'])
    p.stop()
  })

  it('closing a menu closes that menu alone: two popovers\' toggles may arrive in either order', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    p.popup.actions.openMenu('language')
    p.popup.actions.closeMenu('service')
    expect(p.input().menu).toBe('language')
    p.popup.actions.closeMenu('language')
    expect(p.input().menu).toBeNull()
    p.popup.actions.openMenu('style')
    p.popup.actions.closeMenu()
    expect(p.input().menu).toBeNull()
    p.stop()
  })
```

- append, at the end of the file:

```ts
describe('the record of refused keys (the branch\'s final review)', () => {
  it('seeded with the record read before the first render, no state with the settings read shows a refused service as runnable', async () => {
    await setConfig({ ...BASE, provider: SVC.id })
    await markRejected(SVC.id)
    const made = world({ rejected: [SVC.id] })
    made.w.page = page('stopped', null)
    expect(made.input().rejected).toEqual([SVC.id])
    const seen: boolean[] = []
    const unsubscribe = made.popup.subscribe(() => { const i = made.input(); if (i.config !== null) seen.push(i.rejected.includes(SVC.id)) })
    const stop = made.popup.start()
    await until(() => made.input().config !== null && made.input().saved !== null)
    await flush()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(Boolean)).toBe(true)
    unsubscribe()
    stop()
  })

  it('a change of the record asks the saved settings\' chain again: a key made good shows the way back while the popup is open', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    const before = p.asked().length
    await markRejected(SVC.id)
    await until(() => p.input().rejected.includes(SVC.id) && p.asked().length > before)
    p.stop()
  })
})

describe('what the popup knows of the tab (the redesign\'s design, §5.4)', () => {
  it('nothing until the first ask about its page settles; then its address, and whether the popup still asks', async () => {
    const made = world()
    made.w.page = null
    made.w.url = 'https://arxiv.org/html/2501.07202v1'
    const stop = made.popup.start()
    expect(made.input().tab).toBeNull()
    await until(() => made.input().tab !== null)
    expect(made.input().tab).toEqual({ url: 'https://arxiv.org/html/2501.07202v1', asking: true })
    // six more asks 500 ms apart, then the popup gives up asking
    for (let i = 0; i < 8; i++) { vi.advanceTimersByTime(500); await flush() }
    expect(made.input().tab).toEqual({ url: 'https://arxiv.org/html/2501.07202v1', asking: false })
    stop()
  })

  it('an entry page is known once it has answered, never in between: its moment without a page is not P0', async () => {
    const made = world()
    made.w.page = undefined
    made.w.entry = { paper: '2501.07202', html: 'https://arxiv.org/html/2501.07202#readarxiv' }
    made.w.url = 'https://arxiv.org/abs/2501.07202'
    const stop = made.popup.start()
    await until(() => made.input().tab !== null)
    expect(made.input().entry).not.toBeNull()
    stop()
  })

  it('a page that answers: known, and no longer asked while silent', async () => {
    const p = await opened(w => { w.page = page('stopped', null); w.url = 'https://arxiv.org/html/2401.00001' })
    expect(p.input().tab).toEqual({ url: 'https://arxiv.org/html/2401.00001', asking: false })
    p.stop()
  })
})

describe('P0: the field and its checks (the redesign\'s design, §5.4)', () => {
  // the stillness is a timeout: faked here with the intervals, and the popup opened and settled on the fake clock
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] }) })
  const settle = async () => { for (let i = 0; i < 25; i++) await vi.advanceTimersByTimeAsync(0) }
  async function onP0() {
    const made = world()
    made.w.page = null
    const stop = made.popup.start()
    await settle()
    return { ...made, stop }
  }

  it('a paper is checked once the field has been still for 300 ms, once per id, never per keystroke', async () => {
    const p = await onP0()
    // typed key by key, 50 ms apart: `2501.0720` has an id's shape too, and is passed over
    for (const text of ['2', '25', '2501', '2501.', '2501.0720', '2501.07202']) { p.popup.actions.setQuery(text); await vi.advanceTimersByTimeAsync(50) }
    expect(p.w.checks).toEqual([])
    await vi.advanceTimersByTimeAsync(STILL_MS - 51)
    expect(p.w.checks).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(p.w.checks).toEqual(['2501.07202'])
    expect(p.input().find).toEqual({ query: '2501.07202', entries: { id: '2501.07202', html: 'https://arxiv.org/html/2501.07202#readarxiv', pdf: 'https://arxiv.org/pdf/2501.07202#readarxiv' } })
    // the same paper by its abstract address: answered already, not asked again
    p.popup.actions.setQuery('https://arxiv.org/abs/2501.07202')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await settle()
    expect(p.w.checks).toEqual(['2501.07202'])
    expect(p.input().find.entries?.id).toBe('2501.07202')
    // another paper: its own check
    p.w.entries['hep-th/9711200'] = { html: null, pdf: 'https://arxiv.org/pdf/hep-th/9711200#readarxiv' }
    p.popup.actions.setQuery('hep-th/9711200')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await settle()
    expect(p.w.checks).toEqual(['2501.07202', 'hep-th/9711200'])
    expect(p.input().find.entries).toEqual({ id: 'hep-th/9711200', html: null, pdf: 'https://arxiv.org/pdf/hep-th/9711200#readarxiv' })
    p.stop()
  })

  it('an address that opens a page, words and a link elsewhere are never checked', async () => {
    const p = await onP0()
    for (const text of ['https://arxiv.org/pdf/2501.07202', 'attention is all you need', 'https://www.nature.com/articles/x']) {
      p.popup.actions.setQuery(text)
      await vi.advanceTimersByTimeAsync(1000)
    }
    await settle()
    expect(p.w.checks).toEqual([])
    expect(p.input().find).toEqual({ query: 'https://www.nature.com/articles/x', entries: null })
    p.stop()
  })

  it('stopped, a check still waiting for stillness is not made', async () => {
    const p = await onP0()
    p.popup.actions.setQuery('2501.07202')
    p.stop()
    await vi.advanceTimersByTimeAsync(STILL_MS * 2)
    expect(p.w.checks).toEqual([])
  })
})
```

In `tests/ui/locales.test.ts`, in the test `'the empty state is computed at call time: …'`, both literals passed to
`derivePopupView` end `…, savedRevision: null, rejected: [] }`; make each end
`…, savedRevision: null, rejected: [], tab: null, find: { query: '', entries: null } }`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/popup/state.test.ts`
Expected: FAIL — `STILL_MS` and `MANAGE_PROMPTS` are not exported; `tab` is undefined.

- [ ] **Step 3: The words**

In `src/locales/zh-CN.ts`, in `S.rows`, after `manageStyles: …,` add:

```ts
    managePrompts: '管理提示词…', // the redesign's §5.3: the prompt menu's last row, opening the settings at the prompts
```

In `src/locales/en.ts`, in `S.rows`, after `manageStyles: 'Manage styles…',` add `managePrompts: 'Manage prompts…',`.

- [ ] **Step 4: The view model's inputs, and the prompt menu's last row**

In `src/entrypoints/popup/view-model.ts`:

- after `export const MANAGE_STYLES = '__manage-styles'` add:

```ts
/** The same for the prompt menu (the redesign's design, §5.3): every menu whose list the reader can change ends so */
export const MANAGE_PROMPTS = '__manage-prompts'
```

- in `PopupInput`, after the `rejected` field, add:

```ts
  /**
   * The active tab as far as the popup may know it, once the first ask about its page has settled (null before): its
   * address where the extension may read it — arXiv's pages, by the host permission; null on any other — and whether the
   * popup is still asking a page that has not answered (the content script comes at document_idle). An arXiv paper's
   * page still asked is loading, not P0 (the redesign's design, §5.4)
   */
  tab: { url: string | null; asking: boolean } | null
  /** P0's field (§5.4): what it holds, and the two checks' answer for the paper it names, once both are back */
  find: { query: string; entries: { id: string; html: string | null; pdf: string | null } | null }
```

- in `menuOf`, the `case 'prompt':` return becomes:

```ts
      return {
        kind,
        label: S.rows.prompt,
        search: false,
        items: [
          ...[...Object.values(BUILT_IN_PROMPTS), ...config.prompts.patterns].map(p => ({ id: p.id, name: p.name, selected: p.id === config.prompts.promptId })),
          // the way to where prompts are managed, as the service and style menus end (the redesign's design, §5.3)
          { id: MANAGE_PROMPTS, name: S.rows.managePrompts, selected: false },
        ],
      }
```

In `src/entrypoints/popup/fixtures.ts`, the `base` input gains, after `rejected: [],`:

```ts
  // The tab is a paper's, heard from; P0's field is empty (the redesign's design, §5.4)
  tab: { url: 'https://arxiv.org/html/2409.01234', asking: false },
  find: { query: '', entries: null },
```

- [ ] **Step 5: The state**

In `src/entrypoints/popup/state.ts`:

- after `import { S } from '@/ui/strings'` add `import { readQuery } from './find'`; in the import from `./view-model`,
  add `MANAGE_PROMPTS` beside `MANAGE_SERVICES`;
- in `PopupActions`, replace `  closeMenu(): void` with:

```ts
  /** Closes that menu if it is the one open — two popovers' toggles may arrive in either order — or, with none, whichever is */
  closeMenu(kind?: MenuKind): void
```

  after `  downloadPack(): void` add:

```ts
  /** P0's field (the redesign's design, §5.4): what it holds now; a paper it names is checked once it has been still */
  setQuery(text: string): void
  /** An address of P0's — a paper translating, arXiv's search — opened in a new tab, the popup closing after it */
  openLink(url: string): void
```

  and replace the `openOptions` member and its comment with:

```ts
  /** With `link` omitted, the settings page on its own default section; with it, straight to that row (§6.1's deep links) */
  openOptions(link?: OptionsLink): void
```

- replace the `OptionsSection` type and its comment with:

```ts
/** The settings page's rows the popup's Manage… rows open (the redesign's design, §6.1): it opens the section and lights the row */
export type OptionsLink = 'translate/services' | 'translate/prompts' | 'appearance/styles'
```

- in `PopupHost`, after the `config` member add:

```ts
  /** The active tab's address, where the extension may read it — arXiv's pages, by its host permission — or null */
  tabUrl(): Promise<string | null>
  /**
   * P0's two checks of a paper (the redesign's design, §5.4): its HTML version and its bilingual PDF, the address each
   * opens or null for one ruled out, by the PDF page's own rule (core/pdf/entry.ts)
   */
  entriesOf(id: string): Promise<{ html: string | null; pdf: string | null }>
```

- after `const ASKS_WHILE_SILENT = 6` add:

```ts
/** How long P0's field must be still before the paper it names is checked (the redesign's design, §5.4): never a keystroke */
export const STILL_MS = 300
```

- after `let running = false` add:

```ts
  /** The active tab's address (host.tabUrl): undefined until it answers */
  let tabUrl: string | null | undefined
  /** The first ask about the tab's page has settled: until then nothing is known, and the popup draws its brand row alone */
  let settled = false
  /** P0's field, and its checks: each paper's answer by id, each id asked once, and the timer that waits for stillness */
  let query = ''
  const checked = new Map<string, { html: string | null; pdf: string | null }>()
  const checking = new Set<string>()
  let stillTimer: ReturnType<typeof setTimeout> | null = null
```

- replace `const stopSilent = () => { … }` (the one-line arrow) and the `askWhileSilent` arrow (its doc comment stays)
  with:

```ts
  const stopSilent = () => {
    if (silentTimer === null) return
    clearInterval(silentTimer)
    silentTimer = null
    // whether the popup still asks is part of what it shows: an arXiv page still silent is loading, not P0 (§5.4)
    changed()
  }
```

```ts
  const askWhileSilent = () => {
    stopSilent()
    let attempts = 0
    silentTimer = setInterval(() => {
      if (++attempts > ASKS_WHILE_SILENT) return stopSilent()
      refresh()
    }, ASK_EVERY_MS)
    changed()
  }
```

- in `refresh`, replace the body from `const askEntry = () => {` to the end of the `host.toTab({ type: 'axt:page-status' })` chain with:

```ts
    const askEntry = () => {
      setPage(null)
      // settled with the entry's answer, not before: the moment between would be drawn as P0 (the redesign's design, §5.4)
      host.toTab({ type: 'axt:entry-status' }).then(answer => { entry = answer ?? null; settled = true; changed() }).catch(() => { entry = null; settled = true; changed() })
    }
    host.toTab({ type: 'axt:page-status' })
      .then(status => { if (!status) { askEntry(); return } entry = null; settled = true; setPage(status) })
      .catch(askEntry)
```

- replace `const openOptions = (section?: OptionsSection): void => {` and its first two lines of body with:

```ts
  const openOptions = (link?: OptionsLink): void => {
    if (!link) host.openOptionsPage()
    else void host.openTab(host.url(`/options.html#${link}`))
```

  (the embedded close after them stays; in the comment above, "With a section" becomes "With a row").
- before `const actions: PopupActions = {` add:

```ts
  /** P0's two checks of a paper, once per id (§5.4): the answer kept, the view told */
  const check = (id: string) => {
    checking.add(id)
    void host.entriesOf(id).then(found => { checked.set(id, found) }, () => undefined).finally(() => { checking.delete(id); changed() })
  }
```

- in `actions`: `closeMenu: () => { menu = null; changed() },` becomes

```ts
    closeMenu: kind => {
      if (kind !== undefined && menu !== kind) return
      menu = null
      changed()
    },
```

  in `chooseService`, `if (id === MANAGE_SERVICES) return void openOptions()` becomes
  `if (id === MANAGE_SERVICES) return void openOptions('translate/services')`; in `choosePrompt`, after its
  `changed()` add `if (id === MANAGE_PROMPTS) return void openOptions('translate/prompts')`; in `chooseStyle`,
  `if (id === MANAGE_STYLES) return void openOptions('reading')` becomes
  `if (id === MANAGE_STYLES) return void openOptions('appearance/styles')` (and its comment "Styles live in the
  “Reading” section" becomes "styles are in the Appearance section, their own row": the comment stays English, and
  `state.ts` holds no CJK line, as the English gate needs); and after `openOptions,` add:

```ts
    setQuery: text => {
      query = text
      if (stillTimer !== null) clearTimeout(stillTimer)
      stillTimer = null
      const named = readQuery(text)
      if (named.kind === 'paper' && !checked.has(named.id) && !checking.has(named.id)) {
        stillTimer = setTimeout(() => { stillTimer = null; check(named.id) }, STILL_MS)
      }
      changed()
    },
    // Everything P0 opens, it opens in a new tab, whatever `reading.openIn` says: that setting is about leaving a
    // paper's page, and the page under this popup is not one (§5.4). The popup goes once the tab is open
    openLink: url => void guard(async () => {
      await host.openTab(url)
      host.close()
    }),
```

- in `start()`, after the `host.shortcut()…` line add:

```ts
      // the tab's address, where the extension may read it: an arXiv paper's page not answering yet is loading (§5.4)
      host.tabUrl().then(url => { tabUrl = url; changed() }, () => { tabUrl = null; changed() })
```

  the watcher of the record a few lines below,
  `const stopRejected = watchRejected(ids => { heardRejected = true; rejected = [...ids]; changed() })`, becomes

```ts
      // A change of the record asks again what a start would run on: the chain in force is rebuilt by the background on
      // any such change, and the retranslate cue (view-model.ts) reads it (the branch's final review)
      const stopRejected = watchRejected(ids => { heardRejected = true; rejected = [...ids]; changed(); void asks.saved() })
```

  and in the function it returns, after `stopRejected()` add `if (stillTimer !== null) clearTimeout(stillTimer)`;
- the state is seeded with the record `main.tsx` read before the first render: `export function createPopupState(host: PopupHost): PopupState {`
  becomes

```ts
/**
 * `seed.rejected`: the record of refused keys as it was read before the first render, beside the configuration
 * (main.tsx), so that no state counts a refused service as runnable and then flips (the branch's final review). The
 * read and the watch below keep it current from there
 */
export function createPopupState(host: PopupHost, seed: { rejected?: readonly string[] } = {}): PopupState {
```

  and `  let rejected: readonly string[] = []` becomes `  let rejected: readonly string[] = seed.rejected ?? []`;
- replace the `state()` method (with its comment) by:

```ts
    state() {
      snapshot ??= { input: inputNow(), error }
      return snapshot
    },
```

  and before `return {` (the object with `start()`) add:

```ts
  /**
   * What the view is given. The session's chain only while the page is on — unknown until it answers, never the saved
   * chain in its place (Codex on #185) — and the saved settings' chain for what a start would run on; the tab once its
   * page has been heard from; P0's field with the checks' answer for the paper it names (the redesign's design, §5.4)
   */
  const inputNow = (): PopupInput => {
    const { config, revision: savedRevision, pack } = surface.state()
    const named = readQuery(query)
    const answer = named.kind === 'paper' ? checked.get(named.id) : undefined
    return {
      page, entry, saved, session: on() ? session : null, config, pack, menu, shortcut, savedRevision, rejected,
      tab: settled && tabUrl !== undefined ? { url: tabUrl, asking: silentTimer !== null } : null,
      find: { query, entries: named.kind === 'paper' && answer ? { id: named.id, ...answer } : null },
    }
  }
```

- [ ] **Step 6: The host**

In `src/entrypoints/popup/data.ts`:

- add the imports

```ts
import { bilingualPdfOf, ENTRY_CHECK_MS, htmlVersionOf, pdfUrlOf, translatedHtmlUrlOf } from '@/core/pdf/entry'
import { readerRuns } from '@/pdf-reader/support'
```

- `export type { OptionsSection, PopupActions } from './state'` becomes `export type { OptionsLink, PopupActions } from './state'`;
- before `const browserHost` add:

```ts
/**
 * P0's two checks of a paper (the redesign's design, §5.4): the PDF page's own HEADs (core/pdf/entry.ts), sent from the
 * extension's origin to arXiv by its host permission, each given ENTRY_CHECK_MS before its entry is offered anyway
 */
function paperEntries(id: string): Promise<{ html: string | null; pdf: string | null }> {
  const send: typeof fetch = (url, init) => fetch(url, init)
  const within = <T>(check: Promise<T>, offered: T) => Promise.race([check, new Promise<T>(resolve => setTimeout(resolve, ENTRY_CHECK_MS, offered))])
  return Promise.all([
    within(htmlVersionOf(id, send), translatedHtmlUrlOf(id)),
    readerRuns() ? within(bilingualPdfOf(id, send), pdfUrlOf(id)) : Promise.resolve(null),
  ]).then(([html, pdf]) => ({ html, pdf }))
}
```

- in `browserHost`, after `config: { … },` add:

```ts
  // arXiv's pages alone show their address to the extension (its host permission): any other tab's is null here
  tabUrl: async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? null,
  entriesOf: paperEntries,
```

- `usePopupData` takes the seed and hands it to the state:

```ts
export function usePopupData(seed: { rejected?: readonly string[] } = {}): { input: PopupInput; error: string | null; actions: PopupActions } {
  const [popup] = useState(() => createPopupState(browserHost(), seed))
```

  (the rest of the function as it is).

In `src/entrypoints/popup/App.tsx`, `export function App() {` and its first line become:

```tsx
/** `rejected`: the record of refused keys, read before the first render (main.tsx) */
export function App({ rejected }: { rejected?: readonly string[] }) {
  const { input, error, actions } = usePopupData({ rejected })
```

In `src/entrypoints/popup/main.tsx`, the configuration is read once before the first paint by
`await prepareFirstPaint(document.documentElement, brand => brand)` (`src/ui/first-paint.ts`, shared with the settings
page, which Part 5 owns: it is left as it is). The record's read starts **before** that line and is awaited after it, so
the two storage reads run at once and the first paint still waits on one round of them, not two in series:

- add `import { rejectedServices } from '@/shared/service-health'`;
- replace

```ts
// The pack and the extension's appearance before the first paint, from one read of the settings: see ui/first-paint.ts
await prepareFirstPaint(document.documentElement, brand => brand)
```

  with

```ts
// The pack and the extension's appearance before the first paint, from one read of the settings: see ui/first-paint.ts.
// Beside it, not after it, the record of refused keys: the first render counts a refused service as one that cannot
// run, rather than drawing it runnable and flipping (the branch's final review). Unreadable, it holds nothing
const refused = rejectedServices().catch(() => new Set<string>())
await prepareFirstPaint(document.documentElement, brand => brand)
const rejected = [...(await refused)]
```

- `    <App />` becomes `    <App rejected={rejected} />`.

- [ ] **Step 7: The gallery's two new actions**

In `src/entrypoints/gallery/main.tsx`, after the line
`  setHighlight: log('setHighlight'), setImages: log('setImages'), downloadPack: log('downloadPack'),` add:

```ts
  setQuery: log('setQuery'), openLink: log('openLink'),
```

This file is committed by the controller, not in this task's commit.

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run tests/popup tests/ui`
Expected: PASS. `pnpm typecheck` then exits 0; an error naming another literal `PopupInput` or `PopupHost` (a test's)
gets `tab: null, find: { query: '', entries: null }` or the two host members above.

- [ ] **Step 9: Run the gate and commit**

Run: `git add src/entrypoints/popup/state.ts src/entrypoints/popup/data.ts src/entrypoints/popup/App.tsx src/entrypoints/popup/main.tsx src/entrypoints/popup/view-model.ts src/entrypoints/popup/fixtures.ts src/entrypoints/gallery/main.tsx src/locales/zh-CN.ts src/locales/en.ts tests/popup/state.test.ts tests/ui/locales.test.ts && node scripts/check-english.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0; the English gate names no file: `tests/ui/locales.test.ts` keeps its 3 (the literals edited hold no
Chinese), `state.ts` and the other code hold none, and the packs are outside the gate. So the allow-list is not part of
this commit.

```bash
git commit -m "feat(popup): the tab, P0's field and its checks, the record from the first render, the settings' deep links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 33: the view model — a kind for every state, every menu drawn, notes with their tone, P0's findings, the retranslate cue

**Files:**
- Modify: `src/entrypoints/popup/view-model.ts` (replaced whole)
- Modify: `src/entrypoints/popup/fixtures.ts` (replaced whole)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`S.find`, `S.loading`; `S.notArxiv` goes)
- Modify: `src/entrypoints/popup/PopupView.tsx` (adapted to the new view; redrawn in Task 35)
- Modify: `src/entrypoints/gallery/main.tsx` (a fixture's `error`)
- Modify: `scripts/english-allowlist.txt`
- Test: `tests/popup/view-model.test.ts`, `tests/ui/locales.test.ts`

**Interfaces:**
- Consumes: `PopupInput.tab`, `.find`, `MANAGE_PROMPTS` (Task 32); `readQuery`, `isPaperAddress` (Task 31);
  `type MenuListItem` (`@/ui/controls/MenuList`, Part 3); `toBcp47` (`@/config/languages`).
- Produces, in `@/entrypoints/popup/view-model`:
  - `PopupView.kind: 'pending' | 'loading' | 'find' | 'paper' | 'entry' | 'reader'` (replacing `empty`);
  - `PopupView.menus: { service: MenuView; language: MenuView; prompt: MenuView | null; style: MenuView | null } | null` —
    every menu the view offers, open or not; `PopupView.menu: MenuKind | null` — which is open (replacing the object);
  - `interface MenuView { label: string; search: boolean; items: MenuListItem[] }` — Part 3's items exactly: `checked`
    (the old `selected`), the Chrome row `disabled` with its `action` (Part 3's `MenuList` answers it through
    `onAction`), `manage: true` on the 管理… rows, `lang` on the reader's languages and on the style rows' sample;
  - `Note.tone: 'alert' | 'info'`;
  - `PopupView.secondary: { label: string; action: 'restore'; shortcut?: string } | null` — the key's chip rides on
    显示原文 where the key restores while 重新翻译 is offered (the retranslate cue);
  - `PopupView.find: { query: string; found: Found | null } | null`, with
    `type Found = { kind: 'open'; format: 'pdf' | 'html'; label: string; paper: string; href: string } | { kind: 'search'; label: string; href: string } | { kind: 'paper'; paper: string; entries: { html: FoundEntry; pdf: FoundEntry } | null; note: string | null } | { kind: 'elsewhere'; text: string }`
    and `interface FoundEntry { label: string; href: string | null }`.
- In `@/entrypoints/popup/fixtures`: `interface PopupFixture { id; name; when; input; error?: string }`; the new states
  `P0a`–`P0g`, `PL`, `PW`, `PR`, `PE`, `P6b` (the key made good, the page still on the free service), `P8b` (a refused
  key, nothing to take over); `P6` now holds the refusal as the record and the chain in force do (`rejected`, the saved
  chain passing the service over).
- **The retranslate cue** (the branch's final review): on a page that runs on, after a demotion of `auth`, when the
  record no longer holds the service put aside and the saved settings' chain runs it again (its engine that service, not
  demoted), the primary is P13's 重新翻译 (enabled, without the key: the key still restores, `shared/page-action.ts`
  deciding for every door) with 显示原文 beside it carrying the key, and P6's note goes (its reason no longer holds). The
  saved chain's engine is the test that tells a key made good from a refusal that stands: a 403 is `auth` too but never
  recorded, and the chain in force still passes the service over. The design gives the cue no words of its own: P13's
  pair, as it is, and no note.
- In the packs: `S.find.{lead, field, enter, advanced, search(q), elsewhere, paper(id)}`, `S.loading`.

- [ ] **Step 1: Write the failing tests**

In `tests/popup/view-model.test.ts`:

- the import from `@/entrypoints/popup/view-model` becomes
  `import { MANAGE_PROMPTS, MANAGE_SERVICES, MANAGE_STYLES, derivePopupView, runnable } from '@/entrypoints/popup/view-model'`,
  and add `import { searchUrl } from '@/entrypoints/popup/find'`;
- delete the test `'P0 is one sentence'`;
- in the test `'a page that answered with nothing is no page: …'`, `expect(derivePopupView(undefinedPage).empty).toBe(true)`
  becomes `expect(derivePopupView(undefinedPage).kind).toBe('find')`;
- in `'P17 an abstract or PDF page: …'`, `expect(v.empty).toBe(false)` becomes `expect(v.kind).toBe('entry')`;
- in `'P1 ready: …'`, after `const v = view('P1')` add `expect(v.kind).toBe('paper')`;
- every note compared whole gains its tone: in the tests of P6 and P7, `expect(v.note).toEqual({ text: …, settings: true })`
  becomes `expect(v.note).toEqual({ text: …, tone: 'info', settings: true })` (the text as it is); in those of P8, P9 and
  P13, `tone: 'alert'` likewise;
- in `'P4 translating: …'`, `expect(JSON.stringify(v)).not.toMatch(/24|31/)` becomes
  `expect(JSON.stringify({ ...v, menus: null })).not.toMatch(/24|31/)` (the menus hold the language list, whose words are
  no count);
- replace the test `'P2 service menu: …'` with:

```ts
  it('P2 service menu: the three built-ins, the reader\'s own, then the way to the settings page', () => {
    const v = view('P2')
    expect(v.menu).toBe('service')
    const m = v.menus!.service
    expect(m.search).toBe(false)
    expect(m.items.map(i => i.id)).toEqual(['microsoft', 'google-web', 'chrome-builtin', MANAGE_SERVICES])
    expect(m.items.map(i => i.checked)).toEqual([true, false, false, false])
    expect(m.items[2]).toMatchObject({ name: 'Chrome 翻译', disabled: true, action: { label: '下载' } })
    expect(m.items[3]).toMatchObject({ name: '管理翻译服务…', manage: true })
    const ready = derivePopupView({ ...input('P2'), pack: 'available' }).menus!.service
    expect(ready.items[2]).toMatchObject({ hint: '浏览器内置，无需联网' })
    expect(ready.items[2]!.disabled).toBeFalsy()
    expect(ready.items[2]!.action).toBeUndefined()
    const busy = derivePopupView({ ...input('P2'), pack: 'downloading' }).menus!.service
    expect(busy.items[2]).toMatchObject({ disabled: true, hint: '语言包下载中', action: { busy: true } })
  })
```

- in `"a reader's services sit where the contract puts the LLM — …"`, the two `derivePopupView(…).menu!` become
  `derivePopupView(…).menus!.service`, and `selected: true` becomes `checked: true`;
- replace `'P3 language menu: …'` with:

```ts
  it('P3 language menu: every language, searchable by any of its names or its code', () => {
    const v = view('P3')
    expect(v.menu).toBe('language')
    const m = v.menus!.language
    expect(m.search).toBe(true)
    expect(m.items.length).toBeGreaterThan(150)
    const cmn = m.items.find(i => i.id === 'cmn')!
    expect(cmn.checked).toBe(true)
    expect(cmn.keywords).toMatch(/Mandarin/)
    expect(cmn.keywords).toMatch(/cmn/)
  })
```

- replace `'P16 the style menu is …'` and `'P15 prompt menu …'` with:

```ts
  it('P16 the style menu is what the settings page holds, in its order, with the chosen one marked', () => {
    const v = view('P16')
    const c = input('P16').config!
    expect(v.style?.value).toBe('与原文相同')
    expect(v.menu).toBe('style')
    const m = v.menus!.style!
    expect(m.search).toBe(false)
    // The last row is not a style but the way in to managing them on the settings page (S-P-83)
    expect(m.items.map(i => i.id)).toEqual([...c.appearance.styles.map(p => p.id), MANAGE_STYLES])
    expect(m.items.at(-1)).toMatchObject({ id: MANAGE_STYLES, checked: false, manage: true })
    expect(m.items.filter(i => i.checked).map(i => i.id)).toEqual([c.appearance.activeStyle])
    // The entry has no preview: it is not a style
    expect(m.items.at(-1)!.preview).toBeUndefined()
  })
  it('P15 prompt menu lists the built-ins and the reader\'s own, and ends with the way to where they are managed (§5.3)', () => {
    const v = view('P15')
    expect(v.menu).toBe('prompt')
    const m = v.menus!.prompt!
    expect(m.items[0]).toMatchObject({ id: 'default', name: 'Default', checked: true })
    expect(m.items.at(-1)).toMatchObject({ id: MANAGE_PROMPTS, name: '管理提示词…', checked: false, manage: true })
  })
```

- in `'lists the nine languages the reader typesets, alone'`, `v.menu?.items.map(i => i.id)` becomes
  `v.menus?.language.items.map(i => i.id)`;
- append, at the end of the file:

```ts
describe('the redesign\'s popup (its design, §5)', () => {
  it('every menu the view offers is drawn, open or not; a menu asked for that the view has not is not open', () => {
    const v = view('P1')
    expect(v.menus?.service.items.length).toBeGreaterThan(3)
    expect(v.menus?.language.items.length).toBeGreaterThan(150)
    expect([v.menus?.prompt, v.menus?.style?.items.at(-1)?.id]).toEqual([null, MANAGE_STYLES])
    expect(derivePopupView({ ...input('P1'), menu: 'prompt' }).menu).toBeNull()
    expect(derivePopupView({ ...input('PR'), menu: 'style' }).menu).toBeNull()
  })

  it('a note carries the alert for something blocked or stopped, the information for something that goes on (§5.2)', () => {
    const tones = Object.fromEntries(['P6', 'P7', 'P7b', 'P8', 'P8b', 'P9', 'P10', 'P11', 'P13', 'P17a', 'P17b', 'P17c'].map(id => [id, view(id).note?.tone]))
    expect(tones).toEqual({ P6: 'info', P7: 'info', P7b: 'info', P8: 'alert', P8b: 'alert', P9: 'alert', P10: 'info', P11: 'alert', P13: 'alert', P17a: 'info', P17b: 'alert', P17c: 'info' })
    // no HTML version and no PDF entry either: nothing to translate, blocked
    expect(derivePopupView({ ...input('P17a'), entry: { ...input('P17a').entry!, pdf: null } }).note?.tone).toBe('alert')
  })

  it('P8b a refused key with nothing to take over: said as the service\'s reason, the button greyed (§5.2)', () => {
    expect(view('P8b').note).toEqual({ text: 'API Key 已失效', tone: 'alert', settings: true })
    expect(view('P8b').primary.disabled).toBe(true)
  })

  it('P6b the key made good while the page runs on the free service: P13\'s pair offers the way back, the key\'s chip on showing the original (the retranslate cue)', () => {
    const v = view('P6b')
    expect(v.note).toBeNull()
    expect(v.service).toEqual({ value: 'Google 翻译', replaced: 'deepseek-v4-flash' })
    expect(v.primary).toEqual({ label: '重新翻译', action: 'retranslate', disabled: false })
    expect(v.secondary).toEqual({ label: '显示原文', action: 'restore', shortcut: '⌥T' })
    const id = input('P6b').config!.services[0]!.id
    // the refusal still recorded, or the chain a start would run on still passing the service over (a 403: `auth`,
    // never recorded): P6 as it was
    expect(derivePopupView({ ...input('P6b'), rejected: [id] }).primary.action).toBe('restore')
    expect(derivePopupView({ ...input('P6b'), saved: input('P6').saved }).primary.action).toBe('restore')
    // a demotion that was not the key's (a limit, the network) is no cue
    const limited = { ...input('P6b').session!, engine: { id: 'google-web', demoted: { id, kind: 'rate-limit' as const, message: '429' } } }
    expect(derivePopupView({ ...input('P6b'), session: limited }).primary.action).toBe('restore')
  })

  it('lang: the reader\'s languages in their own, and the style rows\' sample in its; the full list names each in the interface\'s language first', () => {
    expect(derivePopupView({ ...input('PR'), menu: 'language' }).menus!.language.items.map(i => [i.id, i.lang])).toContainEqual(['jpn', 'ja'])
    expect(view('P16').menus!.style!.items.filter(i => !i.manage).every(i => i.lang === 'zh-CN')).toBe(true)
    expect(view('P3').menus!.language.items.every(i => i.lang === undefined)).toBe(true)
  })

  it('an entry page shows nothing of a translated page; the reader keeps the display and the switches, not the styles', () => {
    expect([view('P17').style, view('P17').menus?.style]).toEqual([null, null])
    expect([view('PR').kind, view('PR').style, view('PR').menus?.style]).toEqual(['reader', null, null])
  })
})

describe('P0 and the moments before it (the redesign\'s design, §5.4)', () => {
  it('before the first answer the brand row alone; an arXiv paper\'s page still silent is loading; anything else is P0', () => {
    expect(view('PW').kind).toBe('pending')
    expect(view('PL').kind).toBe('loading')
    expect(view('P0').kind).toBe('find')
    // a paper's page asked no more (it never answered), and another page while asking: both P0
    expect(derivePopupView({ ...input('PL'), tab: { url: input('PL').tab!.url, asking: false } }).kind).toBe('find')
    expect(derivePopupView({ ...input('PL'), tab: { url: 'https://arxiv.org/list/cs.CL/recent', asking: true } }).kind).toBe('find')
  })

  it('an empty field has nothing under it but the help line; what is typed says what Enter will do', () => {
    expect(view('P0').find).toEqual({ query: '', found: null })
    expect(view('P0a').find?.found).toEqual({ kind: 'search', label: '在 arXiv 搜索「attention is all you need」', href: searchUrl('attention is all you need') })
    expect(view('P0b').find?.found).toEqual({ kind: 'open', format: 'pdf', label: 'PDF 翻译', paper: 'arXiv 2501.07202v1', href: 'https://arxiv.org/pdf/2501.07202v1#readarxiv' })
    expect(view('P0c').find?.found).toMatchObject({ kind: 'open', format: 'html', label: 'HTML 翻译', href: 'https://arxiv.org/html/2501.07202v1#readarxiv' })
    expect(view('P0g').find?.found).toEqual({ kind: 'elsewhere', text: '只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。' })
  })

  it('a paper named: its line at once, its two entries once both checks are back, a greyed one said as P17 says it', () => {
    expect(view('P0d').find?.found).toEqual({ kind: 'paper', paper: 'arXiv 2501.07202v1', entries: null, note: null })
    expect(view('P0e').find?.found).toMatchObject({ entries: { html: { label: 'HTML 翻译', href: 'https://arxiv.org/html/2501.07202v1#readarxiv' }, pdf: { label: 'PDF 翻译', href: 'https://arxiv.org/pdf/2501.07202v1#readarxiv' } }, note: null })
    expect(view('P0f').find?.found).toMatchObject({ entries: { html: { href: null } }, note: 'arXiv 没有这篇论文的 HTML 版本' })
    // an answer about another paper is not this one's
    expect(derivePopupView({ ...input('P0e'), find: { ...input('P0e').find, query: 'hep-th/9711200' } }).find?.found).toMatchObject({ entries: null })
  })
})
```

In `tests/ui/locales.test.ts`:

- in `'no placeholder English sentences left in the Chinese pack …'`, in the `allowed` expression, after
  `S\.service\.(llm|microsoft|google|chrome)|` add `S\.find\.paper|` (「arXiv {id}」 is a name and an id in both languages);
- in `'after setLocale every state of the popup changes language …'`, `path.startsWith('menu.items')` becomes
  `path.startsWith('menus.')` (the menus hold the languages' own names, which are in their own scripts).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/popup/view-model.test.ts tests/ui/locales.test.ts`
Expected: FAIL — `kind` is undefined; `menus` is undefined; the fixtures `P0a`… are missing.

- [ ] **Step 3: The words**

In `src/locales/zh-CN.ts`, in `S`, delete the line `  notArxiv: '打开 arXiv 论文的 HTML 页面后即可翻译', // S-P-03`
and, after `  settings: '设置', …` add:

```ts
  /** P0, no paper in the tab (the redesign's §5.4, §10.1): find one. Replaces S-P-03's sentence */
  find: {
    lead: '打开 arXiv 论文（HTML 或 PDF）即可翻译',
    field: '按标题、作者、摘要或链接搜索论文',
    enter: '按回车搜索',
    advanced: '高级搜索',
    search: (q: string) => `在 arXiv 搜索「${q}」`,
    elsewhere: '只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。',
    /** the paper a link or an id names: a name and an id, the same in every language */
    paper: (id: string) => `arXiv ${id}`,
  },
  /** An arXiv paper's page that has not answered yet (the redesign's §5.4): not P0, and no field */
  loading: '页面加载中',
```

In `src/locales/en.ts`, delete `  notArxiv: 'Open the HTML version of an arXiv paper to translate it',` and, after
`  settings: 'Settings',` add:

```ts
  find: {
    lead: 'Open an arXiv paper, HTML or PDF, to translate it',
    field: 'Search by title, author, abstract or link',
    enter: 'Press Enter to search',
    advanced: 'Advanced search',
    search: q => `Search arXiv for “${q}”`,
    elsewhere: 'Only arXiv paper links open here. You can search by title or author instead.',
    paper: id => `arXiv ${id}`,
  },
  loading: 'Loading the page',
```

- [ ] **Step 4: The view model**

Replace `src/entrypoints/popup/view-model.ts` with:

```ts
// The popup's state model: the inputs are what a few messages return plus the popup's own state (which menu is open,
// what P0's field holds), the output is "what every element shows right now": the state table of docs/UI.md §4 with the
// redesign's changes (its design, §5). A pure function with no side effects; the gallery and the tests feed it the
// inputs in fixtures.ts.
//
// Rules in one place: no state pill, the page being translated is said by the primary button; one note at a time
// (paused > replaced > images paused > the chosen service cannot run), its icon the alert for something blocked or
// stopped and the information for something that goes on; every menu the view offers is drawn whether open or not (a
// popover's contents exist before it opens), they open at any time, a change while the page is on restarts it in place
// (data.ts), and only a choice that cannot run leaves the page behind the settings.
import { languageItems, READER_LANGUAGES } from '@/pdf-reader/ui/languages'
import { activeStyle } from '@/config/appearance'
import { LANG_CODES, LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, toBcp47 } from '@/config/languages'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { CONFIG_UNREADABLE } from '@/config/storage'
import { chosenService, isBuiltInService, isLlmChosen, serviceRuns } from '@/config/services'
import type { Mode } from '@/core/renderer'
import { supportsTarget } from '@/providers/microsoft'
import { BUILT_IN_PROMPTS } from '@/providers/prompt-library'
import type { ProviderStatus } from '@/providers/transport'
import type { EntryStatus, PageStatus } from '@/shared/messages'
import type { StartResult } from '@/core/session'
import { pageDecision } from '@/shared/page-action'
import type { PackState } from '@/shared/pack'
import { MANAGE_SERVICES, serviceItems } from '@/ui/service-items'
import { styleTile } from '@/ui/appearance/tiles'
import { NoActiveTabError } from '@/shared/messages'
import type { MenuListItem } from '@/ui/controls/MenuList'
import { PREVIEW_TARGET, S, languageLabel, languageName, parseFatal, profileName, reasonText, serviceName } from '@/ui/strings'
import { isPaperAddress, readQuery } from './find'

export type { PackState }
export { MANAGE_SERVICES }
/** The same for the style menu: not a profile, it opens the settings page at the row that holds them */
export const MANAGE_STYLES = '__manage-styles'
/** The same for the prompt menu (the redesign's design, §5.3): every menu whose list the reader can change ends so */
export const MANAGE_PROMPTS = '__manage-prompts'
export type MenuKind = 'service' | 'language' | 'prompt' | 'style'

export interface PopupInput {
  page: PageStatus | null
  /** The saved settings' chain: what a translation started now would run on; null until asked or when the ask failed */
  saved: ProviderStatus | null
  /**
   * The running session's own chain — its engine, its hand-overs — while the page is on; null when the page is off
   * or its status has not come back. Never stood in for by `saved`: the two can describe different chains after a
   * change saved elsewhere, and an unknown session shows as unknown (Codex on #185)
   */
  session: ProviderStatus | null
  config: Config | null
  /** The offline service's language pack; null until asked */
  pack: PackState | null
  /** `chainRevision` of the saved configuration; null until computed. A page whose `running.revision` differs is behind */
  savedRevision: string | null
  /** Which menu is open (the popup's own state) */
  menu: MenuKind | null
  /**
   * What an abstract or PDF page answered (§4.0b): null on the HTML full text, where `page` speaks instead, and on
   * any other page, where nothing answers at all
   */
  entry: EntryStatus | null
  /** The translate shortcut as Chrome reports it; null when unbound or unknown */
  shortcut: string | null
  /** The reader's services whose key the endpoint refused (the service health record, the redesign's design, §4) */
  rejected: readonly string[]
  /**
   * The active tab as far as the popup may know it, once the first ask about its page has settled (null before): its
   * address where the extension may read it — arXiv's pages, by the host permission; null on any other — and whether the
   * popup is still asking a page that has not answered (the content script comes at document_idle). An arXiv paper's
   * page still asked is loading, not P0 (the redesign's design, §5.4)
   */
  tab: { url: string | null; asking: boolean } | null
  /** P0's field (§5.4): what it holds, and the two checks' answer for the paper it names, once both are back */
  find: { query: string; entries: { id: string; html: string | null; pdf: string | null } | null }
}

export interface Row { value: string; replaced?: string }
export interface Entry { label: string; disabled: boolean }
/**
 * A note (§5.2): its words; its icon, the alert for something blocked or stopped and the information for something that
 * goes on; `settings` adds the button that opens the options page
 */
export interface Note { text: string; tone: 'alert' | 'info'; settings: boolean }
/** A menu as the shared menu list draws it (@/ui/controls/MenuList, Part 3): its name, whether it searches, its rows */
export interface MenuView { label: string; search: boolean; items: MenuListItem[] }
/** One of P0's entries for a paper it names: the address it opens, or null where the checks ruled it out */
export interface FoundEntry { label: string; href: string | null }
/** What P0's field recognised (§5.4), drawn under it; null for an empty field, under which the help line stands */
export type Found =
  /** an arXiv PDF or HTML address: one brand row, the way it opens and the paper */
  | { kind: 'open'; format: 'pdf' | 'html'; label: string; paper: string; href: string }
  /** words: arXiv's own search */
  | { kind: 'search'; label: string; href: string }
  /** a paper named by its abstract address, its id or its DOI: its line, and its two entries once both checks are back */
  | { kind: 'paper'; paper: string; entries: { html: FoundEntry; pdf: FoundEntry } | null; note: string | null }
  /** a link that is not an arXiv paper's: said, and Enter does nothing */
  | { kind: 'elsewhere'; text: string }

export interface PopupView {
  /**
   * What the popup is for (the redesign's design, §5): `pending`, nothing heard about the tab yet (the brand row alone);
   * `loading`, an arXiv paper's page that has not answered yet; `find`, no paper (P0); `paper`, the full text (P1–P16);
   * `entry`, an abstract or PDF page (P17); `reader`, the PDF reader open over a PDF (S-P-03c)
   */
  kind: 'pending' | 'loading' | 'find' | 'paper' | 'entry' | 'reader'
  service: Row
  language: Row
  /** Only while the LLM is the chosen service */
  prompt: Row | null
  /** The chosen translation style (S-P-82). Null where styles do nothing or are not shown: the reader, an entry page */
  style: Row | null
  highlight: boolean
  images: boolean
  /** Every menu the view offers, drawn whether open or not; null before the settings are read */
  menus: { service: MenuView; language: MenuView; prompt: MenuView | null; style: MenuView | null } | null
  /** Which of them is open: the popup's own state, where the view has that menu */
  menu: MenuKind | null
  note: Note | null
  failed: string | null
  primary: { label: string; action: 'translate' | 'restore' | 'retranslate' | 'openHtml' | 'readerTranslate' | 'readerOriginal'; disabled: boolean; shortcut?: string }
  /**
   * The primary's other face beside it (P9 / P13, §5.2; the retranslate cue): showing the original. `shortcut` where the
   * key restores while Translate again is offered beside it (the cue): the chip goes on the face the key acts on
   */
  secondary: { label: string; action: 'restore'; shortcut?: string } | null
  /**
   * An abstract or PDF page's two entries, drawn in the primary button's place (the reader's design, §2): the HTML
   * version or the bilingual PDF, the reader's to choose. Null elsewhere
   */
  entries: { html: Entry; pdf: Entry } | null
  /** `disabled`: the modes this page cannot show, greyed with S-P-75 (the PDF reader cannot stack) */
  mode: { value: Mode; note: string | null; disabled?: readonly Mode[] }
  /** P0's field and what it recognised (§5.4); null on every other kind */
  find: { query: string; found: Found | null } | null
}

/**
 * A view of a kind with nothing in it yet. **Computed at call time, not at module load**: this module is imported before
 * `applyLocale`, a constant would freeze the fallback language into it, and a Chinese interface would show one English
 * button (Codex on #161)
 */
const blank = (kind: PopupView['kind']): PopupView => ({
  kind,
  service: { value: '' },
  language: { value: '' },
  prompt: null,
  style: null,
  highlight: true,
  images: true,
  menus: null,
  menu: null,
  note: null,
  failed: null,
  primary: { label: S.primary.translate, action: 'translate', disabled: true },
  secondary: null,
  entries: null,
  mode: { value: DEFAULT_CONFIG.mode, note: null },
  find: null,
})

/** Whether the chosen service can run on its own, decided from the settings (no round trip, no stale chain) */
export function runnable(config: Config, pack: PackState | null, rejected: readonly string[] = []): boolean {
  const own = chosenService(config)
  if (own) return serviceRuns(own) && !rejected.includes(own.id)
  // A service id naming nothing: a popup left open while another tab deleted it. `getProvider`
  // falls back to a built-in, so saying "usable" here would have the reader believe their LLM is
  // translating while something else is (Codex on #157)
  if (!isBuiltInService(config.provider)) return false
  switch (config.provider) {
    case 'chrome-builtin':
      return pack === 'available'
    case 'microsoft':
      return supportsTarget(config.targetLanguage)
    default:
      return true
  }
}

/** Why it cannot (S-P-31 / S-P-32) */
function cannotRunWhy(config: Config, pack: PackState | null, rejected: readonly string[]): string {
  const own = chosenService(config)
  if (own) return rejected.includes(own.id) ? S.note.llmRejected : S.note.llmNoKey
  if (!isBuiltInService(config.provider)) return S.note.serviceGone
  switch (config.provider) {
    case 'chrome-builtin':
      return pack === 'downloading' ? S.note.chromeDownloading : S.note.chromeNoPack
    case 'microsoft':
      return S.note.microsoftUnsupported
    default:
      return ''
  }
}

/** Why the chosen service cannot run, and who takes over if one does; null when it can run (the entry pages' views) */
function serviceNote(config: Config, { pack, saved, rejected }: PopupInput): Note | null {
  if (runnable(config, pack, rejected)) return null
  const why = cannotRunWhy(config, pack, rejected)
  return saved?.fallback
    ? { text: S.note.willFallback(why, serviceName(saved.fallback.id, config.services)), tone: 'info', settings: true }
    : { text: S.note.cannotRun(why), tone: 'alert', settings: true }
}

/**
 * Every menu of a view, built from the settings (§5.3): the reader open lists the nine languages it typesets and has no
 * styles; an entry page shows no styles either
 */
function menusOf(config: Config, { pack, rejected }: PopupInput, { reader = false, style = !reader }: { reader?: boolean; style?: boolean } = {}): NonNullable<PopupView['menus']> {
  return {
    service: {
      label: S.rows.service,
      search: false,
      items: serviceItems(config, pack, rejected).map(({ selected, ...item }) => ({ ...item, checked: selected, ...(item.id === MANAGE_SERVICES ? { manage: true as const } : {}) })),
    },
    language: {
      label: S.rows.language,
      search: true,
      // the reader's nine are named in their own languages, and say so (`lang`, round 3); the full list names each in the
      // interface's language with its own after it, one string of two languages, which no single `lang` fits
      items: reader
        ? languageItems(config.targetLanguage).map(({ selected, ...item }) => ({ ...item, checked: selected, lang: toBcp47(item.id) }))
        : LANG_CODES.map(code => ({
            id: code,
            name: languageLabel(code),
            keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_LOCALE_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
            checked: code === config.targetLanguage,
          })),
    },
    prompt: isLlmChosen(config)
      ? {
          label: S.rows.prompt,
          search: false,
          items: [
            ...[...Object.values(BUILT_IN_PROMPTS), ...config.prompts.patterns].map(p => ({ id: p.id, name: p.name, checked: p.id === config.prompts.promptId })),
            // the way to where prompts are managed, as the service and style menus end (§5.3)
            { id: MANAGE_PROMPTS, name: S.rows.managePrompts, checked: false, manage: true as const },
          ],
        }
      : null,
    // Whatever the settings page holds, in its order: the reader's own profiles sit among the built-in ones there, and a
    // second order here would make the same list read as two lists. Each name carries the sample sentence drawn in that
    // style — the names alone ("Muted", "Blurred") do not show what they do. The sample is Chinese (locales/preview.ts)
    // under every interface, and says so on the sample (`lang`, Part 3's MenuList)
    style: style
      ? {
          label: S.rows.style,
          search: false,
          items: [
            ...config.appearance.styles.map(p => ({ id: p.id, name: profileName(p), hint: PREVIEW_TARGET, preview: styleTile(p), lang: 'zh-CN', checked: p.id === config.appearance.activeStyle })),
            // The same position and role as in the service menu: the way in to managing them (S-P-83)
            { id: MANAGE_STYLES, name: S.rows.manageStyles, checked: false, manage: true as const },
          ],
        }
      : null,
  }
}

/** The open menu, where the view has it: a style menu asked for on the reader, a prompt menu once the service is no LLM, are not */
const openOf = (menu: MenuKind | null, menus: NonNullable<PopupView['menus']>): MenuKind | null => (menu !== null && menus[menu] !== null ? menu : null)

/**
 * Why a paper's HTML entry is greyed (S-P-33, S-P-33a), one rule for an entry page and for the paper P0 names: arXiv has
 * no HTML version of it; with no PDF entry either there is nothing to translate, which blocks, else the PDF entry beside
 * it goes on
 */
const noHtmlNote = (pdf: string | null): Pick<Note, 'text' | 'tone'> => (pdf === null ? { text: S.note.noHtml, tone: 'alert' } : { text: S.note.noHtmlVersion, tone: 'info' })

/**
 * The popup on the two pages that are not the full text (UI.md S-P-03b, the maintainer 2026-09-18: “whatever the
 * reader opened — abs, PDF or HTML — the popup is something they can click”): the group, a note, and the two entries
 * (§5.5). **The entries are disabled, not hidden, when they cannot act**: a reader who came for the translation is told
 * the answer instead of finding a control that does nothing. The display, the switches and the style belong to a
 * translated page, and are hidden here
 */
function entryView(entry: EntryStatus, config: Config, input: PopupInput): PopupView {
  const { pack, saved, rejected } = input
  const canRun = runnable(config, pack, rejected)
  // The rule that starts a translation on the full text (`pageDecision`): the chosen service, or the free one that
  // takes over from it. The page this button opens starts by that rule, so the button must not refuse what the page
  // would do (Devin on #247: with a fallback the full text's button was enabled and this one was not)
  const canStart = canRun || !!saved?.fallback
  const named = (id: string) => serviceName(id, config.services)
  const noHtml = entry.html === null
  const menus = menusOf(config, input, { style: false })
  return {
    kind: 'entry',
    service: { value: named(config.provider) },
    language: { value: languageName(config.targetLanguage) },
    prompt: isLlmChosen(config) ? { value: promptName(config) } : null,
    style: null,
    highlight: config.reading.sentenceHighlight,
    images: config.image.enabled,
    menus,
    menu: openOf(input.menu, menus),
    // The service's note first: it is why both entries are greyed, or who takes over. Then the HTML version's, which
    // says "nothing to translate" only when the PDF entry is not offered either (Part 5's final review)
    note: serviceNote(config, input) ?? (noHtml ? { ...noHtmlNote(entry.pdf), settings: false } : null),
    failed: null,
    // not drawn: the entries below are (S-P-50b); kept as the HTML entry, the action a page's own button would take
    primary: { label: S.entry.html, action: 'openHtml', disabled: noHtml || !canStart },
    secondary: null,
    // a paper that cannot be had as a bilingual PDF greys its entry without words (§1's rule); either entry opens a page
    // that translates by the same rule as the full text's button (Devin on #247)
    entries: { html: { label: S.entry.html, disabled: noHtml || !canStart }, pdf: { label: S.entry.pdf, disabled: entry.pdf === null || !canStart } },
    mode: { value: config.mode, note: null },
    find: null,
  }
}

/**
 * The popup while the PDF reader is laid over a PDF page (the reader's design, §9.2): it acts on the reader through the
 * settings alone, which the reader follows. The rows are the ordinary ones, the language menu holds the nine the reader
 * typesets, stacked is greyed (a stored stacked shows as side by side, what the reader shows), the primary shows the
 * original or the translation, and there is no style: styles do nothing on a typeset PDF
 */
function readerView(entry: EntryStatus, config: Config, input: PopupInput): PopupView {
  const base = entryView(entry, config, input)
  const original = config.pdfReader.original
  const held = entry.pdf === null || !READER_LANGUAGES.includes(config.targetLanguage)
  const menus = menusOf(config, input, { reader: true })
  return {
    ...base,
    kind: 'reader',
    menus,
    menu: openOf(input.menu, menus),
    // the note of a service that cannot run; the HTML version's is not this page's matter
    note: serviceNote(config, input),
    // the reader holds the original for a paper with no source and a language it does not typeset: the switch would
    // change nothing on screen, so it is greyed, without words, as the PDF entry is (Codex on #301)
    primary: original
      ? { label: S.primary.translate, action: 'readerTranslate', disabled: held }
      : { label: S.primary.restore, action: 'readerOriginal', disabled: held },
    entries: null,
    mode: { value: config.mode === 'stack' ? 'side' : config.mode, note: null, disabled: ['stack'] },
  }
}

/** P0's field and what it recognises (§5.4): the words of the row under it, and a paper's entries once both checks are back */
function findView({ query, entries }: PopupInput['find']): NonNullable<PopupView['find']> {
  const read = readQuery(query)
  switch (read.kind) {
    case 'empty':
      return { query, found: null }
    case 'open':
      return { query, found: { kind: 'open', format: read.format, label: S.entry[read.format], paper: S.find.paper(read.id), href: read.href } }
    case 'search':
      return { query, found: { kind: 'search', label: S.find.search(read.query), href: read.href } }
    case 'elsewhere':
      return { query, found: { kind: 'elsewhere', text: S.find.elsewhere } }
    case 'paper': {
      const answer = entries?.id === read.id ? entries : null
      return {
        query,
        found: {
          kind: 'paper',
          paper: S.find.paper(read.id),
          entries: answer && { html: { label: S.entry.html, href: answer.html }, pdf: { label: S.entry.pdf, href: answer.pdf } },
          // a greyed entry says why as P17's does (S-P-50b): the HTML version's absence, in full when there is no PDF either
          note: answer?.html === null ? noHtmlNote(answer.pdf).text : null,
        },
      }
    }
  }
}

/** No full text and no entry page (§5.4): nothing heard yet; an arXiv paper's page not answering while the popup asks; or P0 */
function noPaper(input: PopupInput): PopupView {
  const { tab } = input
  if (tab === null) return blank('pending')
  if (tab.asking && tab.url !== null && isPaperAddress(tab.url)) return blank('loading')
  return { ...blank('find'), find: findView(input.find) }
}

export function derivePopupView(input: PopupInput): PopupView {
  const { page, saved, session, config, pack, shortcut, savedRevision, entry, rejected } = input
  if (page == null && entry?.readerOpen && config !== null) return readerView(entry, config, input)
  // An abstract or PDF page: the popup works there too, and its entries take the reader to the paper's versions.
  // `== null` on purpose: a tab whose content script ignores `axt:page-status` resolves `undefined` rather than
  // rejecting, and an undefined page is no page (it once rendered an empty popup on every PDF page)
  if (page == null && entry != null && config !== null) return entryView(entry, config, input)
  if (page == null) return noPaper(input)
  if (config === null) return { ...blank('paper'), mode: { value: page.preference, note: null } }

  const progress = page.progress
  const on = progress.state === 'on'
  const paused = progress.state === 'stopped' && progress.fatal !== undefined
  const canRun = runnable(config, pack, rejected)
  const demoted = on ? session?.engine.demoted : undefined
  // The page runs on settings other than the saved ones. A change made here restarts the page at
  // once (data.ts), so this is what is left: a choice that cannot start, and a change made from
  // another tab, which leaves this page pinned to the session it began (Codex on #157). Either way
  // the reader is offered “Translate again” — enabled when the saved settings can actually run. The rule is
  // the toggle's too (shared/page-action.ts): the page's revision against the saved settings' digest
  const decision = pageDecision(page, { revision: savedRevision, canRun, fallback: !!saved?.fallback }) ?? { action: 'translate' as const, behind: false, enabled: canRun || !!saved?.fallback }
  const { action, behind } = decision
  const named = (id: string) => serviceName(id, config.services)
  // The retranslate cue (the branch's final review): the page runs on the free service since its chosen one's key was
  // refused, and that key has been made good — the record holds the service no more, and the chain a start would run on
  // runs it again. The saved chain is the test: a 403 is `auth` too and never recorded (background/health-guard.ts marks
  // a 401 alone), and while the chain in force
  // still passes the service over, a start would meet the same refusal. The page is offered its way back as P13 offers
  // it (the design gives the cue no words of its own: P13's pair, as it is), and P6's note, whose reason no longer
  // holds, goes. The key still restores (shared/page-action.ts decides for every door), so its chip goes on Show original
  const madeGood = !!demoted && !!session && demoted.kind === 'auth' && !rejected.includes(demoted.id) && saved?.engine.id === demoted.id && !saved.engine.demoted

  const service: Row = demoted && session
    ? { value: named(session.engine.id), replaced: named(demoted.id) }
    : { value: named(config.provider) }
  const language: Row = { value: languageName(config.targetLanguage) }
  // The prompt decides how an LLM translates; the free services do not read it
  const prompt: Row | null = isLlmChosen(config) ? { value: promptName(config) } : null
  // How the translation looks. The page applies a change straight away, so this needs no restart
  const style: Row = { value: profileName(activeStyle(config.appearance)) }

  const note: Note | null = paused ? { text: S.note.paused(reasonText(parseFatal(progress.fatal ?? '').kind)), tone: 'alert', settings: true }
    : demoted && session && !madeGood ? { text: S.note.replaced(named(demoted.id), reasonText(demoted.kind), named(session.engine.id)), tone: 'info', settings: true }
    : page.images?.fatal ? { text: S.note.imagesPaused(reasonText(parseFatal(page.images.fatal).kind)), tone: 'alert', settings: true }
    : !canRun && (!on || behind)
      ? !on && saved?.fallback
        ? { text: S.note.willFallback(cannotRunWhy(config, pack, rejected), named(saved.fallback.id)), tone: 'info', settings: true }
        : { text: S.note.cannotRun(cannotRunWhy(config, pack, rejected)), tone: 'alert', settings: true }
      : null

  const failedCount = progress.failed + (page.images?.failed ?? 0)
  const failed = failedCount > 0 && progress.state !== 'idle' && !progress.fatal && !page.images?.fatal ? S.failed.text(failedCount) : null

  // On every action the key actually performs, “Show original” included: ⌥T translates a page that is not
  // translated and restores one that is, so the badge belongs on both faces of the same button
  // (user 2026-09-11). A paused session retries rather than restores, which is what its label says
  const key = shortcut ?? undefined
  let primary: PopupView['primary']
  let secondary: PopupView['secondary']
  // behind the settings as well (the key changed, say), the ordinary faces already offer Translate again, and the key does it
  if (madeGood && !behind) {
    primary = { label: S.primary.retranslate, action: 'retranslate', disabled: !canRun }
    secondary = { label: S.primary.restore, action: 'restore', ...(key ? { shortcut: key } : {}) }
  } else {
    primary = { label: action === 'restore' ? S.primary.restore : action === 'retranslate' ? S.primary.retranslate : S.primary.translate, action, disabled: !decision.enabled }
    if (!primary.disabled && key) primary.shortcut = key
    secondary = behind || paused ? { label: S.primary.restore, action: 'restore' } : null
  }
  const menus = menusOf(config, input)

  return {
    kind: 'paper',
    service,
    language,
    prompt,
    style,
    highlight: config.reading.sentenceHighlight,
    images: config.image.enabled,
    menus,
    menu: openOf(input.menu, menus),
    note,
    failed,
    primary,
    secondary,
    entries: null,
    mode: { value: page.preference, note: page.mode !== page.preference ? S.mode.narrow : null },
    find: null,
  }
}

function promptName(config: Config): string {
  const id = config.prompts.promptId
  return BUILT_IN_PROMPTS[id]?.name ?? config.prompts.patterns.find(p => p.id === id)?.name ?? id
}

/** What a failed popup action says (S-P-90): a known failure in the interface language, anything else as it was thrown */
export function actionErrorText(e: unknown): string {
  if (e instanceof NoActiveTabError) return S.noActiveTab
  // By name: thrown here by a write of the popup's own, or in the page by the mode's save and carried back as a failure reply
  if (e instanceof Error && e.name === CONFIG_UNREADABLE) return S.settingsUnreadable
  return e instanceof Error ? e.message : String(e)
}

/** A refused start, in the interface's language: the session answers with a code (core/session StartRefusal), the popup with the sentence */
export function startRefusalText(result: Extract<StartResult, { started: false }>): string {
  switch (result.reason) {
    case 'already-on': return S.page.alreadyOn
    case 'session-over': return S.page.sessionOver
    case 'not-paper': return S.page.notPaper
    case 'nothing-to-translate': return S.page.nothingToTranslate
    case 'backend-silent': return S.page.backendSilentWith(result.detail ?? '')
    case 'no-service': return S.page.noService
  }
}
```

- [ ] **Step 5: Every state a fixture**

Replace `src/entrypoints/popup/fixtures.ts` with:

```ts
// One input per state of the popup: UI.md §4's rows with the redesign's (its design, §5). Shared by the tests and the
// gallery; a change to the state table starts here.
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import type { ProviderStatus } from '@/providers/transport'
import type { PageStatus } from '@/shared/messages'
import type { PopupInput } from './view-model'

export interface PopupFixture {
  id: string
  name: string
  when: string
  input: PopupInput
  /** What a failed action left on the error line (S-P-90), for the one state that shows it */
  error?: string
}

const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'deepseek-v4-flash', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'set', model: 'deepseek/deepseek-v4-flash', thinking: 'disabled' as const }
const config: Config = DEFAULT_CONFIG
const llm: Config = { ...DEFAULT_CONFIG, provider: SVC.id, services: [SVC] }
const llmNoKey: Config = { ...DEFAULT_CONFIG, provider: SVC.id, services: [{ ...SVC, apiKey: '' }] }

function page(over: Partial<PageStatus['progress']> = {}, extra: Partial<PageStatus> = {}): PageStatus {
  const state = over.state ?? 'idle'
  return {
    paper: '2409.01234',
    mode: 'stack',
    preference: 'stack',
    progress: { state, total: 120, requested: 0, done: 0, failed: 0, cached: 0, inFlight: 0, ...over },
    epoch: 'doc#1',
    ...(state === 'on' ? { running: { provider: 'microsoft', target: 'cmn', engine: 'microsoft', revision: 'r1' } } : {}),
    ...extra,
  }
}

function provider(over: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    providerId: 'microsoft',
    chosen: 'microsoft',
    revision: 'r1',
    available: true,
    maxBatchChars: 4000,
    maxBatchItems: 20,
    renderPath: 'markers',
    targetLanguage: 'cmn',
    promptId: 'default',
    engine: { id: 'microsoft' },
    chain: ['microsoft', 'google-web'],
    demotions: [], identity: '',
    ...over,
  }
}
const llmProvider = (over: Partial<ProviderStatus> = {}) => provider({ providerId: SVC.id, chosen: SVC.id, model: SVC.model, renderPath: 'tags', engine: { id: SVC.id }, chain: [SVC.id, 'microsoft', 'google-web'], ...over })

const base: PopupInput = {
  page: page(), entry: null, saved: provider(), session: null, config, pack: 'available', menu: null, shortcut: '⌥T',
  // The saved settings' digest equals the running page's revision: nothing is behind unless a fixture says so
  savedRevision: 'r1',
  // No service is refused unless a fixture says so (the service health record, the redesign's design, §4)
  rejected: [],
  // The tab is a paper's, heard from; P0's field is empty (the redesign's design, §5.4)
  tab: { url: 'https://arxiv.org/html/2409.01234', asking: false },
  find: { query: '', entries: null },
}
/** No paper in the tab, and the page heard from: P0 (§5.4) */
const p0: PopupInput = { ...base, page: null, tab: { url: null, asking: false } }
const abs = (paper: string, over: Partial<NonNullable<PopupInput['entry']>> = {}) => ({ paper, html: `https://arxiv.org/html/${paper}#readarxiv`, kind: 'abs' as const, pdf: `https://arxiv.org/pdf/${paper}#readarxiv`, readerOpen: false, ...over })
/** The reader's service put aside for a refused key, and a page running on the free service since (P6, P6b) */
const REFUSED = { id: SVC.id, kind: 'auth' as const, message: 'User not found.' }
const p6: PopupInput = { ...base, config: llm, page: page({ state: 'on', requested: 20, done: 11 }, { running: { provider: SVC.id, target: 'cmn', engine: 'google-web', revision: 'r1' } }), saved: llmProvider(), session: llmProvider({ engine: { id: 'google-web', demoted: REFUSED } }) }

export const POPUP_FIXTURES: PopupFixture[] = [
  { id: 'PW', name: 'Before the first answer', when: 'tab === null', input: { ...base, page: null, tab: null } },
  { id: 'PL', name: 'An arXiv paper still loading', when: 'page = entry = null ∧ tab = a paper ∧ asking', input: { ...base, page: null, tab: { url: 'https://arxiv.org/html/2409.01234', asking: true } } },
  { id: 'P0', name: 'Not on a paper: search and open', when: 'page = entry = null ∧ tab not a paper still asked', input: p0 },
  { id: 'P0a', name: 'P0, words typed', when: 'find.query = words', input: { ...p0, find: { query: 'attention is all you need', entries: null } } },
  { id: 'P0b', name: 'P0, an arXiv PDF address', when: 'find.query = arxiv.org/pdf/…', input: { ...p0, find: { query: 'https://arxiv.org/pdf/2501.07202v1', entries: null } } },
  { id: 'P0c', name: 'P0, an arXiv HTML address', when: 'find.query = arxiv.org/html/…', input: { ...p0, find: { query: 'https://arxiv.org/html/2501.07202v1', entries: null } } },
  { id: 'P0d', name: 'P0, a paper named, its checks out', when: 'find.query names a paper ∧ !entries', input: { ...p0, find: { query: 'https://arxiv.org/abs/2501.07202v1', entries: null } } },
  { id: 'P0e', name: 'P0, a paper named, both entries', when: 'entries.html ∧ entries.pdf', input: { ...p0, find: { query: 'https://arxiv.org/abs/2501.07202v1', entries: { id: '2501.07202v1', html: 'https://arxiv.org/html/2501.07202v1#readarxiv', pdf: 'https://arxiv.org/pdf/2501.07202v1#readarxiv' } } } },
  { id: 'P0f', name: 'P0, a paper with no HTML version', when: 'entries.html = null', input: { ...p0, find: { query: 'hep-th/9711200', entries: { id: 'hep-th/9711200', html: null, pdf: 'https://arxiv.org/pdf/hep-th/9711200#readarxiv' } } } },
  { id: 'P0g', name: 'P0, a link elsewhere', when: 'find.query = another site\'s link', input: { ...p0, find: { query: 'https://www.nature.com/articles/s41586-021-03819-2', entries: null } } },
  { id: 'P1', name: 'Ready', when: 'idle ∧ runnable', input: base },
  { id: 'P2', name: 'Service menu', when: 'menu = service', input: { ...base, menu: 'service', pack: 'downloadable' } },
  { id: 'P3', name: 'Language menu', when: 'menu = language', input: { ...base, menu: 'language' } },
  { id: 'P4', name: 'Translating', when: 'on', input: { ...base, session: provider(), page: page({ state: 'on', requested: 31, done: 24, inFlight: 3 }, { preference: 'side', mode: 'side' }) } },
  { id: 'P5', name: 'Translating, with failures', when: 'on ∧ failed > 0 ∧ !fatal', input: { ...base, session: provider(), page: page({ state: 'on', requested: 31, done: 24, failed: 2 }, { images: { total: 6, requested: 3, done: 2, failed: 1 } }) } },
  // the key refused: the record holds the service, and the chain in force passes it over as the page's did
  { id: 'P6', name: 'Switched to another service', when: 'on ∧ engine.demoted', input: { ...p6, rejected: [SVC.id], saved: llmProvider({ available: false, engine: { id: 'google-web', demoted: REFUSED } }) } },
  // the key made good since (a connection that succeeded cleared the record): a start would run on the service again
  { id: 'P6b', name: 'The key made good, the page still on the free service', when: 'on ∧ engine.demoted(auth) ∧ !rejected ∧ saved.engine = demoted', input: p6 },
  { id: 'P7', name: 'LLM not configured, a fallback available', when: 'idle ∧ !runnable ∧ fallback', input: { ...base, config: llmNoKey, saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }) } },
  { id: 'P7b', name: 'A refused key, a fallback available', when: 'idle ∧ rejected ∧ fallback', input: { ...base, config: llm, rejected: [SVC.id], saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }) } },
  { id: 'P8', name: 'LLM not configured, no fallback', when: 'idle ∧ !runnable ∧ !fallback', input: { ...base, config: { ...llmNoKey, fallback: { enabled: false } }, saved: llmProvider({ available: false, chain: ['openai-compat'] }) } },
  { id: 'P8b', name: 'A refused key, no fallback', when: 'idle ∧ rejected ∧ !fallback', input: { ...base, config: { ...llm, fallback: { enabled: false } }, rejected: [SVC.id], saved: llmProvider({ available: false, chain: [SVC.id] }) } },
  { id: 'P9', name: 'Paused', when: 'stopped ∧ fatal', input: { ...base, config: llm, saved: llmProvider(), page: page({ state: 'stopped', requested: 8, done: 0, fatal: 'auth: User not found.' }) } },
  { id: 'P10', name: 'Chrome language pack downloading', when: 'chrome ∧ pack = downloading', input: { ...base, config: { ...config, provider: 'chrome-builtin' }, saved: provider({ providerId: 'chrome-builtin', available: false, fallback: { id: 'google-web' }, engine: { id: 'chrome-builtin' } }), pack: 'downloading' } },
  { id: 'P11', name: 'Image translation paused', when: 'images.fatal', input: { ...base, config: llm, saved: llmProvider(), session: llmProvider(), page: page({ state: 'on', requested: 20, done: 12 }, { running: { provider: SVC.id, target: 'cmn', engine: SVC.id, revision: 'r1' }, images: { total: 6, requested: 2, done: 0, failed: 0, fatal: 'auth: User not found.' } }) } },
  { id: 'P12', name: 'Narrow window shown stacked', when: 'mode !== preference', input: { ...base, session: provider(), page: page({ state: 'on', requested: 10, done: 10 }, { preference: 'side', mode: 'stack' }) } },
  { id: 'P13', name: 'Switched to a service that cannot run', when: 'on ∧ running.revision ≠ savedRevision ∧ !runnable', input: { ...base, savedRevision: 'r2', config: llmNoKey, saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }), session: provider(), page: page({ state: 'on', requested: 31, done: 24 }) } },
  { id: 'P15', name: 'Prompt menu', when: 'llm ∧ menu = prompt', input: { ...base, config: llm, saved: llmProvider(), menu: 'prompt' } },
  { id: 'P16', name: 'Style menu', when: 'menu = style', input: { ...base, menu: 'style' } },
  { id: 'PE', name: 'An action failed', when: 'the last action threw (S-P-90)', input: base, error: 'Could not establish connection. Receiving end does not exist.' },
  // The two pages that are not the full text (§4.0b): the popup works there, and its entries open the paper's versions
  { id: 'P17', name: 'Abstract or PDF page', when: 'page === null ∧ entry.html', input: { ...base, page: null, entry: abs('2501.07202v1') } },
  { id: 'P17a', name: 'Abstract or PDF page, no HTML version', when: 'page === null ∧ entry.html === null', input: { ...base, page: null, entry: abs('hep-th/9711200', { html: null }) } },
  { id: 'P17b', name: 'Abstract or PDF page, service cannot run, no fallback', when: 'page === null ∧ entry.html ∧ !runnable ∧ !fallback', input: { ...base, page: null, config: { ...llmNoKey, fallback: { enabled: false } }, saved: llmProvider({ available: false, chain: ['openai-compat'] }), entry: abs('2501.07202v1') } },
  { id: 'P17c', name: 'Abstract or PDF page, service cannot run, a fallback available', when: 'page === null ∧ entry.html ∧ !runnable ∧ fallback', input: { ...base, page: null, config: llmNoKey, saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }), entry: abs('2501.07202v1') } },
  { id: 'PR', name: 'The PDF reader open', when: 'page === null ∧ entry.readerOpen', input: { ...base, page: null, entry: abs('2501.07202v1', { kind: 'pdf', readerOpen: true }) } },
]
```

(The P7b input's config was `{ ...DEFAULT_CONFIG, provider: SVC.id, services: [SVC] }`, which is `llm`: the same value.)

- [ ] **Step 6: The old component reads the new view until Task 35 redraws it**

In `src/entrypoints/popup/PopupView.tsx`:

- the import from `./view-model` becomes `import type { MenuKind, MenuView, PopupView as View } from './view-model'`;
- replace

```tsx
      {view.empty ? (
        <p className={`${CARD} p-3.5 leading-relaxed text-fg-2`}>{S.notArxiv}</p>
      ) : (
```

  with

```tsx
      {view.kind === 'pending' || view.kind === 'loading' || view.kind === 'find' ? (
        view.kind !== 'pending' && <p className={`${CARD} p-3.5 leading-relaxed text-fg-2`}>{view.kind === 'loading' ? S.loading : S.find.lead}</p>
      ) : (
```

- in `MenuRow`, `const open = view.menu?.kind === kind` becomes

```tsx
  const open = view.menu === kind
  const menu = view.menus?.[kind] ?? null
```

  `{open && view.menu && (` becomes `{open && menu && (`, `items={view.menu.items}` becomes `items={oldItems(menu.items)}`,
  `label={view.menu.label}` becomes `label={menu.label}` and `search={view.menu.search}` becomes `search={menu.search}`;
- in `ReadingRow`, `const open = view.menu?.kind === 'style'` becomes

```tsx
  const open = view.menu === 'style'
  const menu = view.menus?.style ?? null
```

  `{open && view.menu && (` becomes `{open && menu && (`, `items={view.menu.items}` becomes `items={oldItems(menu.items)}`
  and `label={view.menu.label}` becomes `label={menu.label}`;
- at the end of the file add:

```tsx
/** The old menu's rows (`@/ui/Menu`), until Task 35 draws the shared menu list */
const oldItems = (items: MenuView['items']) => items.map(({ checked, ...item }) => ({ ...item, selected: !!checked }))
```

- [ ] **Step 7: The gallery shows a fixture's error**

In `src/entrypoints/gallery/main.tsx`, the two `<PopupView view={view} error={null} actions={actions} />` become
`<PopupView view={view} error={f.error ?? null} actions={actions} />`. This file is committed by the controller.

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run tests/popup tests/ui`
Expected: PASS. Then `node scripts/check-english.mjs`: it names `tests/popup/view-model.test.ts` alone, with 50 lines
holding Chinese (39 before: the tests replaced and added expect the pack's copy), whose entry grants 39. Set its entry
in `scripts/english-allowlist.txt` to 50 (the count the gate reported, should it differ), prefixing the reason with
`2026-09-26: the redesign's popup (Part 4): P0's words, the prompt menu's Manage row and a refused key's note, expected as UI.md's copy; `
(the allow-list itself is checked: its reasons stay English). `tests/ui/locales.test.ts` keeps 3 and
`src/entrypoints/popup/PopupView.tsx` keeps 1 (Task 35, which redraws it without Chinese, removes its entry).

- [ ] **Step 9: Run the gate and commit**

Run: `git add src/entrypoints/popup/view-model.ts src/entrypoints/popup/fixtures.ts src/entrypoints/popup/PopupView.tsx src/entrypoints/gallery/main.tsx src/locales/zh-CN.ts src/locales/en.ts scripts/english-allowlist.txt tests/popup/view-model.test.ts tests/ui/locales.test.ts && node scripts/check-english.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git commit -m "feat(popup): a view of every kind, every menu drawn, notes with their tone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 34: the menus — under their rows, the popup growing to hold them

**Files:**
- Create: `src/entrypoints/popup/ui/menu-fit.ts`, `src/entrypoints/popup/ui/painted.ts`, `src/entrypoints/popup/ui/menu.tsx`
- Create: `src/entrypoints/popup/popup.css` (its first part)
- Test: `tests/popup/menu-fit.test.ts`, `tests/popup/menu.test.ts`, `tests/popup/sheet.test.ts`

**Interfaces:**
- Consumes: `Popover`, `usePopover` (`@/ui/controls/Popover`); `MenuList` and its action API (`@/ui/controls/MenuList`,
  Part 3: a row with an `action` calls `onAction(id)`, never `onPick`, disabled or not; the 管理… rows `onPick`);
  `useTip` (`@/ui/controls/tip`), `Icon`; the roles `--group-hover`, `--chrome`, `--chrome-line`, `--ink-2`, `--ink-3`
  (Part 3 added `group-hover`, its Task 14, with its contrast pairs: the chevron keeps `ink-3` there, 3.01:1 in light and
  3.19:1 in dark); `MenuKind`, `MenuView`, `Row` (Task 33); `PopupActions['openMenu' | 'closeMenu']` (Task 32).
- Produces:
  - `fitMenu(root: HTMLElement, trigger: HTMLElement, menu: HTMLElement, up: boolean): () => void`, `MENU_GAP`, `MENU_EDGE`;
  - `usePainted(): boolean`;
  - `MenuRow({ kind, label, row, menu, open, actions, onPick, onAction? })`,
    `StyleButton({ value, menu, open, actions, onPick })`, `anchors(...names: string[]): CSSProperties`;
  - the classes `.ui.popup`, `.group`, `.group-row` (`.k`, `.v`), `.rule`, `.pop.menu` (`.up`, `.searching`) in `popup.css`.

- [ ] **Step 1: The roles this part draws are there**

Run: `grep -c -e '--group-hover:' -e '--on-brand-2:' src/styles/tokens.css`
Expected: `6` (each in the three theme blocks: Part 3's Task 14). Otherwise stop: this part adds no token (ruling 13).

- [ ] **Step 2: Write the failing tests**

`tests/popup/menu-fit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitMenu } from '@/entrypoints/popup/ui/menu-fit'

// A menu the popup holds (the redesign's design, §5.3): the popup grows under one below its row and gives the room back
// as it shuts; the style menu, above the foot, is held to the room above its button
const at = (el: HTMLElement, rect: Partial<DOMRect>) => { el.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect }
function parts(rootTop: number, trigger: Partial<DOMRect>, tall: number) {
  const root = document.createElement('main'), button = document.createElement('button'), menu = document.createElement('div')
  at(root, { top: rootTop })
  at(button, trigger)
  Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: tall })
  return { root, button, menu }
}

describe('fitMenu (the redesign\'s design, §5.3)', () => {
  it('below its row: the popup grows to hold the menu, 4 px under the row and 8 px to spare, and gives it back', () => {
    const { root, button, menu } = parts(0, { top: 84, bottom: 120 }, 200)
    const done = fitMenu(root, button, menu, false)
    expect(root.style.minHeight).toBe('332px')
    done()
    expect(root.style.minHeight).toBe('')
  })

  it('a menu taller than its cap asks for the cap alone', () => {
    const { root, button, menu } = parts(0, { top: 84, bottom: 120 }, 900)
    // in the document: happy-dom computes no style for a detached element, and the cap would go unread
    document.body.append(menu)
    menu.style.maxHeight = '400px'
    fitMenu(root, button, menu, false)
    expect(root.style.minHeight).toBe('532px')
  })

  it('measures from the popup\'s own top: in the gallery, frames stand down the page', () => {
    const { root, button, menu } = parts(1000, { top: 1084, bottom: 1120 }, 200)
    fitMenu(root, button, menu, false)
    expect(root.style.minHeight).toBe('332px')
  })

  it('above its button: held to the room there, 6 px from the button and 8 from the popup\'s top; the popup untouched', () => {
    const { root, button, menu } = parts(0, { top: 250, bottom: 280 }, 600)
    const done = fitMenu(root, button, menu, true)
    expect([menu.style.maxHeight, root.style.minHeight]).toEqual(['236px', ''])
    done()
    expect(menu.style.maxHeight).toBe('')
  })
})
```

`tests/popup/menu.test.ts`:

```ts
import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { MenuRow, StyleButton, anchors } from '@/entrypoints/popup/ui/menu'
import { MANAGE_SERVICES, derivePopupView } from '@/entrypoints/popup/view-model'
import { S, setLocale } from '@/ui/strings'
import { isOpen, stubPopovers } from '../pdf-reader/ui/popover-stub'
import { mountElement } from '../ui/render-hook'

// The popup's menus (the redesign's design, §5.3): the browser's popover and the view model kept in step, the rows drawn
// after the first paint, the popup growing to hold a menu, a value cut short whole in its tooltip
let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); vi.useRealTimers(); document.body.innerHTML = '' })

const view = derivePopupView(POPUP_FIXTURES.find(f => f.id === 'P1')!.input)
const nextFrame = () => act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) })
const menuOf = (root: Element) => root.querySelector<HTMLElement>('[popover="auto"]')!
function service() {
  const actions = { openMenu: vi.fn(), closeMenu: vi.fn() }
  const onPick = vi.fn()
  const row = (open: boolean) => createElement('main', { className: 'ui popup' }, createElement(MenuRow, { kind: 'service', label: S.rows.service, row: view.service, menu: view.menus!.service, open, actions, onPick, onAction: vi.fn() }))
  return { actions, onPick, row }
}

describe('a row of the group and its menu (the redesign\'s design, §5.3)', () => {
  it('the browser opening or shutting the menu reaches the popup\'s state, for that menu alone', async () => {
    const { actions, row } = service()
    const { container } = await mountElement(row(false))
    await act(async () => { menuOf(container).showPopover() })
    expect(actions.openMenu).toHaveBeenLastCalledWith('service')
    await act(async () => { menuOf(container).hidePopover() })
    expect(actions.closeMenu).toHaveBeenLastCalledWith('service')
  })

  it('the view model opening or shutting it reaches the browser, once the popup has painted', async () => {
    const { row } = service()
    const mounted = await mountElement(row(true))
    await nextFrame()
    expect(isOpen(menuOf(mounted.container))).toBe(true)
    await mounted.rerender(row(false))
    expect(isOpen(menuOf(mounted.container))).toBe(false)
  })

  it('draws its rows once the popup has painted; a pick goes to its handler, the last row the way to the settings', async () => {
    const { row, onPick } = service()
    const { container } = await mountElement(row(false))
    await nextFrame()
    const options = [...container.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options.length).toBe(view.menus!.service.items.length)
    await act(async () => { options.at(-1)!.click() })
    expect(onPick).toHaveBeenCalledWith(MANAGE_SERVICES)
  })

  it('opening below its row, the popup grows to hold the menu, and gives the room back as it shuts', async () => {
    const { row } = service()
    const { container } = await mountElement(row(false))
    const main = container.querySelector('main')!, button = container.querySelector('button.group-row')!, menu = menuOf(container)
    main.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    button.getBoundingClientRect = () => ({ top: 48, bottom: 84 }) as DOMRect
    Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: 210 })
    await act(async () => { menu.showPopover() })
    expect(main.style.minHeight).toBe('306px')
    await act(async () => { menu.hidePopover() })
    expect(main.style.minHeight).toBe('')
  })

  it('a value cut short shows whole in its tooltip after 500 ms; a value that fits shows none', async () => {
    const { row } = service()
    const { container } = await mountElement(row(false))
    const button = container.querySelector('button.group-row')!, value = button.querySelector('.v > span')!, tip = container.querySelector('.tip')
    const pointer = (type: 'pointerover' | 'pointerout') => act(async () => { button.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: type === 'pointerout' ? document.body : null })) })
    vi.useFakeTimers()
    await pointer('pointerover')
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(isOpen(tip)).toBe(false)
    await pointer('pointerout')
    Object.defineProperty(value, 'scrollWidth', { configurable: true, value: 300 })
    Object.defineProperty(value, 'clientWidth', { configurable: true, value: 120 })
    await pointer('pointerover')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(isOpen(tip)).toBe(true)
    expect(tip!.textContent).toBe(view.service.value)
  })

  it('a row carries its menu\'s anchor and its tooltip\'s in one declaration: a second would replace the first', async () => {
    expect(anchors('--pop-a', '--tip-b')).toEqual({ anchorName: '--pop-a, --tip-b' })
    // and the row drawn carries both names
    const { row } = service()
    const { container } = await mountElement(row(false))
    const style = container.querySelector<HTMLElement>('button.group-row')!.style as CSSStyleDeclaration & { anchorName?: string }
    expect((style.anchorName ?? '').split(', ').map(name => name.slice(0, 6))).toEqual(['--pop-', '--tip-'])
  })
})

describe('the style button and its menu (§5.3)', () => {
  it('opens above the foot, held to the room above the button; the popup does not grow for it', async () => {
    const actions = { openMenu: vi.fn(), closeMenu: vi.fn() }
    const { container } = await mountElement(createElement('main', { className: 'ui popup' }, createElement(StyleButton, { value: view.style!.value, menu: view.menus!.style!, open: false, actions, onPick: vi.fn() })))
    const main = container.querySelector('main')!, button = container.querySelector('.style-btn')!, menu = menuOf(container)
    expect(menu.classList.contains('up')).toBe(true)
    main.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    button.getBoundingClientRect = () => ({ top: 241, bottom: 271 }) as DOMRect
    await act(async () => { menu.showPopover() })
    expect([menu.style.maxHeight, main.style.minHeight]).toEqual(['227px', ''])
    expect(actions.openMenu).toHaveBeenLastCalledWith('style')
  })
})
```

`tests/popup/sheet.test.ts`:

```ts
// The popup's own sheet (the redesign's design, §5): no :has() (DESIGN §7.2), and every colour a role of the token
// sheet — named, never written (the Global Constraints)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(import.meta.dirname, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const SHEET = read('../../src/entrypoints/popup/popup.css')
const TOKENS = read('../../src/styles/tokens.css')

describe('popup.css', () => {
  it('carries no :has()', () => {
    expect(SHEET).not.toContain(':has(')
  })

  it('writes no colour: every one is a token\'s', () => {
    expect(SHEET).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?)\(/i)
  })

  it('names only tokens the token sheet defines', () => {
    const named = [...new Set([...SHEET.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]!))]
    expect(named.filter(name => !TOKENS.includes(`${name}:`))).toEqual([])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/popup/menu-fit.test.ts tests/popup/menu.test.ts tests/popup/sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/popup/ui/menu-fit"`; no `popup.css`.

- [ ] **Step 4: The fit, and the first paint**

`src/entrypoints/popup/ui/menu-fit.ts`:

```ts
// A menu the popup holds (the redesign's design, §5.3). One that opens downward makes the popup tall enough to hold it:
// the root's min-height, set as it opens and cleared as it closes, so that the window — the toolbar's popup, or the
// floating button's panel, which measures the body (embedded.ts) — measures itself anew each time (round 4's lesson: a
// height kept across a flip of theme cut the English service menu short). One that opens upward, the style menu over the
// foot, is held to the room above its button. The rects are read first and written after: nothing reads what it wrote

/** Under its row, and above the style button (round 4) */
export const MENU_GAP = { down: 4, up: 6 }
/** From the popup's edges */
export const MENU_EDGE = 8

/** Fit an open menu; returns what gives the room back */
export function fitMenu(root: HTMLElement, trigger: HTMLElement, menu: HTMLElement, up: boolean): () => void {
  const top = root.getBoundingClientRect().top
  const row = trigger.getBoundingClientRect()
  if (up) {
    menu.style.maxHeight = `${Math.max(0, Math.floor(row.top - top - MENU_GAP.up - MENU_EDGE))}px`
    return () => { menu.style.maxHeight = '' }
  }
  // what the menu will draw: its rows, up to its cap (popup.css), past which it scrolls
  const tall = Math.min(menu.scrollHeight, Number.parseFloat(getComputedStyle(menu).maxHeight) || Number.POSITIVE_INFINITY)
  root.style.minHeight = `${Math.ceil(row.bottom - top + MENU_GAP.down + tall + MENU_EDGE)}px`
  return () => { root.style.minHeight = '' }
}
```

`src/entrypoints/popup/ui/painted.ts`:

```ts
// The frame after the popup's first: what waits for it is what the reader cannot reach before it — the menus' rows, the
// language list's 179 among them — so that the popup paints as fast as it did (the redesign's design, §12)
import { useEffect, useState } from 'react'

export function usePainted(): boolean {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPainted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return painted
}
```

- [ ] **Step 5: The menus**

`src/entrypoints/popup/ui/menu.tsx`:

```tsx
// The popup's menus (the redesign's design, §5.3): the shared popover and menu list, opened by a row of the group or by
// the style button of the foot. The browser's popover opens and shuts them, gives the focus back and dismisses them on a
// press elsewhere; the view model says which is open (the popup's state), so that a pick, the gallery and the tests can
// open or shut one too, and the two are kept in step here. A menu below its row makes the popup tall enough to hold it,
// the style menu opens above the foot (menu-fit.ts); the rows inside are drawn from the frame after the first
import { ChevronDown } from 'lucide'
import { type CSSProperties, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { useTip } from '@/ui/controls/tip'
import { S } from '@/ui/strings'
import type { PopupActions } from '../data'
import type { MenuKind, MenuView, Row } from '../view-model'
import { fitMenu } from './menu-fit'
import { usePainted } from './painted'

type MenuActions = Pick<PopupActions, 'openMenu' | 'closeMenu'>

/** Two anchor names on one element take one declaration: a second would replace the first (its menu's and its tooltip's) */
export const anchors = (...names: string[]): CSSProperties => ({ anchorName: names.join(', ') }) as CSSProperties
const tipAnchor = (tip: ReturnType<typeof useTip>) => String((tip.props.style as { anchorName?: string }).anchorName)

function useMenu(kind: MenuKind, open: boolean, actions: MenuActions, up: boolean) {
  const pop = usePopover('listbox')
  const trigger = useRef<HTMLButtonElement>(null)
  /** whether the browser has it open, as its last toggle said */
  const shown = useRef(false)
  const unfit = useRef<(() => void) | null>(null)
  const painted = usePainted()
  const { id, onOpenChange: own } = pop.popover
  const onOpenChange = useCallback((now: boolean) => {
    own(now)
    shown.current = now
    unfit.current?.()
    unfit.current = null
    const menu = document.getElementById(id)
    const button = trigger.current
    const root = button?.closest<HTMLElement>('.popup')
    if (now && menu && button && root) unfit.current = fitMenu(root, button, menu, up)
    if (now) actions.openMenu(kind)
    else actions.closeMenu(kind)
  }, [own, id, up, kind, actions])
  // the view model's word, as it changes: a pick shuts the menu, a fixture opens one. A press, Escape and a light dismiss
  // are the browser's, and reach the view model through onOpenChange, after which there is nothing here to do
  useEffect(() => {
    if (!painted || open === shown.current) return
    const menu = document.getElementById(id)
    try {
      if (open) menu?.showPopover()
      else menu?.hidePopover()
    } catch {} // shown or hidden already, its toggle not yet heard
  }, [open, painted, id])
  return { pop: { ...pop, popover: { ...pop.popover, onOpenChange } }, trigger, painted }
}

function MenuPopover({ kind, menu, up, pop, painted, onPick, onAction, onClose }: {
  kind: MenuKind
  menu: MenuView
  up: boolean
  pop: ReturnType<typeof useMenu>['pop']
  painted: boolean
  onPick: (id: string) => void
  onAction?: (id: string) => void
  onClose: () => void
}) {
  return (
    <Popover {...pop.popover} role="listbox" label={menu.label} className={['menu', up && 'up', menu.search && 'searching'].filter(Boolean).join(' ')}>
      {painted && (
        <MenuList
          key={pop.generation}
          kind="listbox"
          label={menu.label}
          items={menu.items}
          // the services: a name over its hint (§5.3)
          layout={kind === 'service' ? 'two-line' : 'inline'}
          search={menu.search ? S.menu.searchLanguages : undefined}
          noMatch={menu.search ? S.menu.noMatch : undefined}
          onPick={onPick}
          onAction={onAction}
          onClose={onClose}
        />
      )}
    </Popover>
  )
}

/** A row of the group (§5.1): its label leading, its value trailing with a chevron; a value cut short shows whole in its tooltip */
export function MenuRow({ kind, label, row, menu, open, actions, onPick, onAction }: {
  kind: MenuKind
  label: string
  row: Row
  /** null before the settings are read: a row with nothing to open */
  menu: MenuView | null
  open: boolean
  actions: MenuActions
  onPick: (id: string) => void
  onAction?: (id: string) => void
}) {
  const { pop, trigger, painted } = useMenu(kind, open, actions, false)
  const tip = useTip(row.replaced ? `${row.value} · ${row.replaced}` : row.value)
  const value = useRef<HTMLSpanElement>(null)
  /** the value cut short: its tooltip only then, or it would repeat what shows */
  const cut = () => { const el = value.current; return el !== null && el.scrollWidth > el.clientWidth }
  const words = (
    <>
      <span className="k">{label}</span>
      <span className="v">
        <span ref={value}>{row.value}{row.replaced && <> <s>{row.replaced}</s></>}</span>
        <Icon node={ChevronDown} size={14} />
      </span>
    </>
  )
  if (!menu) return <div className="group-row">{words}</div>
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="group-row"
        {...pop.trigger}
        style={anchors(pop.anchor, tipAnchor(tip))}
        onPointerEnter={() => { if (cut()) tip.props.onPointerEnter() }}
        onPointerLeave={tip.props.onPointerLeave}
        onPointerDown={tip.props.onPointerDown}
        onFocus={e => { if (cut()) tip.props.onFocus(e) }}
        onBlur={tip.props.onBlur}
      >
        {words}
      </button>
      {tip.tip}
      <MenuPopover kind={kind} menu={menu} up={false} pop={pop} painted={painted} onPick={onPick} onAction={onAction} onClose={() => actions.closeMenu(kind)} />
    </>
  )
}

/** The foot's way to the styles (§5.1): its words and a chevron, the chosen style in its tooltip; its menu opens upward */
export function StyleButton({ value, menu, open, actions, onPick }: { value: string; menu: MenuView; open: boolean; actions: MenuActions; onPick: (id: string) => void }) {
  const { pop, trigger, painted } = useMenu('style', open, actions, true)
  const tip = useTip(value)
  return (
    <>
      <button ref={trigger} type="button" className="tbtn style-btn" {...pop.trigger} {...tip.props} style={anchors(pop.anchor, tipAnchor(tip))}>
        {S.rows.style}
        <Icon node={ChevronDown} size={14} />
      </button>
      {tip.tip}
      <MenuPopover kind="style" menu={menu} up pop={pop} painted={painted} onPick={onPick} onClose={() => actions.closeMenu('style')} />
    </>
  )
}
```

- [ ] **Step 6: The sheet's first part**

`src/entrypoints/popup/popup.css`:

```css
/* The popup (the redesign's design, §5; round 6 of its prototypes, and the rounds it builds on): 320 px on the chrome.
   Every measure is the prototype's, every colour a role of src/shared/tokens.ts. Two leading edges, the controls at 12
   px and the group's words at 24; two trailing, the controls at 12 and the group's values at 24 (§12's probe measures
   them: tests/e2e/probes/popup-align.mjs). No :has() (tests/popup/sheet.test.ts) */
.ui.popup { display: flex; flex-direction: column; width: 320px; background: var(--chrome); color: var(--ink); font: 13px/1.4 var(--font); -webkit-font-smoothing: antialiased; anchor-name: --popup; anchor-scope: --popup; }

/* the group (§5.1): 12 px from the edges, 4 px in, radius 10; rows of 36 inset 4 with a radius of 6 (concentric),
   separated by a hairline on the words' edge */
.popup .group { margin: 0 12px; padding: 4px; border-radius: 10px; background: var(--group); }
.popup .group-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 36px; padding: 0 8px; border-radius: 6px; text-align: start; font-size: 13px; transition: background-color 150ms ease-out; }
@media (hover: hover) { .popup button.group-row:hover { background: var(--group-hover); } }
.popup .group-row[aria-expanded="true"] { background: var(--group-hover); }
/* the label never shrinks; the value gives way, whole in its tooltip */
.popup .group-row > .k { flex: none; white-space: nowrap; color: var(--ink); }
.popup .group-row > .v { display: inline-flex; align-items: center; gap: 4px; min-width: 0; color: var(--ink-2); }
.popup .group-row > .v > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.popup .group-row > .v s { color: var(--ink-3); }
.popup .group-row > .v > svg { flex: none; color: var(--ink-3); }
.popup .group > .rule { height: 0.5px; margin: 0 8px; border: 0; background: var(--chrome-line); }

/* the menus (§5.3, round 4): under their row, 4 px below it and 8 px from the popup's edges; the style menu above its
   button, 6 px from it. One below makes the popup tall enough to hold it, one above is held to the room there
   (ui/menu-fit.ts); past 400 px a menu scrolls */
.popup .pop.menu { position-area: none; position-try-fallbacks: none; inset: auto; margin: 0; top: calc(anchor(bottom) + 4px); left: calc(anchor(--popup left) + 8px); right: calc(anchor(--popup right) + 8px); width: auto; min-width: 0; max-width: none; max-height: 400px; }
.popup .pop.menu.up { top: auto; bottom: calc(anchor(top) + 6px); transform-origin: bottom left; }
/* the language list: five rows and a half, the half saying there is more (round 1) */
.popup .pop.menu.searching [role="listbox"] { max-height: 165px; overflow: auto; scrollbar-width: none; }
@media (prefers-reduced-motion: reduce) { .popup .group-row { transition: none; } }
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run tests/popup tests/styles`
Expected: PASS. Every row of Part 3's `MenuList` is a `[role="option"]` (the Chrome row's 下载 is drawn inside its
option, not a button of its own), and a pick of the 管理… row reaches `onPick`.

- [ ] **Step 8: Run the gate and commit**

Run: `git add src/entrypoints/popup/ui/menu-fit.ts src/entrypoints/popup/ui/painted.ts src/entrypoints/popup/ui/menu.tsx src/entrypoints/popup/popup.css tests/popup/menu-fit.test.ts tests/popup/menu.test.ts tests/popup/sheet.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git commit -m "feat(popup): the menus under their rows, the popup growing to hold them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 35: the popup redrawn from round 6

**Files:**
- Modify: `src/entrypoints/popup/PopupView.tsx` (replaced whole)
- Create: `src/entrypoints/popup/ui/Note.tsx`, `src/entrypoints/popup/ui/ModeIcon.tsx`, `src/entrypoints/popup/ui/Entries.tsx`
- Modify: `src/entrypoints/popup/popup.css` (append)
- Modify: `scripts/english-allowlist.txt` (the entry of `PopupView.tsx`)
- Test: `tests/popup/draw.ts` (new helper), `tests/popup/view.test.ts`

**Interfaces:**
- Consumes: `Button` (`kind`, `size`, `icon`, `shortcut` — shown on `brand` and `neutral` while enabled —, `disabled`
  on its size's neutral ground; `raised` the note's 26 px button whatever `size` says) and `Segmented` (`icon` a
  `ReactNode`) (Part 3); `Switch`, `useTip`, `Icon` (Part 1; `trackModality()` already runs in `main.tsx`, Part 3's Task
  14); `MenuRow`, `StyleButton` (Task 34); `PopupView` (Task 33); `GLYPH_WEN` (`@/pdf-reader/ui/display-glyphs`),
  `WEN_GAIN` (`@/pdf-reader/ui/icons`).
- Produces: `PopupView({ view, error, actions })` (its props unchanged); `Note({ tone, text, action? })`;
  `ModeIcon({ mode })`; `Entries({ html, pdf })` with `interface EntryButton { label: string; disabled: boolean; run: () => void }`;
  the classes `.brand-row`, `.wordmark` (the mark and the name: not `.brand`, which is `Button`'s kind), `.tbtn`,
  `.stack`, `.note`, `.pair`, `.twin`, `.reading`, `.foot` (`.short`), `.toggle`, `.style-btn`, `.line` (`.solo`,
  `.mark`, `.alert`); `tests/popup/draw.ts`:
  `draw(id): Promise<{ container, main, actions, rerender, unmount, flush }>`, `fixture(id)`, `nameOf(button)`,
  `wordsOf(segment)` (a segment's visible words: Part 3's `Segmented` keeps its title in a hidden span inside the button).

- [ ] **Step 1: Write the failing tests**

`tests/popup/draw.ts`:

```ts
// The popup drawn from a fixture, as the gallery draws it, every action a spy (tests/popup/view.test.ts, find-view.test.ts)
import { createElement } from 'react'
import { type Mock, vi } from 'vitest'
import type { PopupActions } from '@/entrypoints/popup/data'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { PopupView } from '@/entrypoints/popup/PopupView'
import { derivePopupView } from '@/entrypoints/popup/view-model'
import { mountElement } from '../ui/render-hook'

const ACTIONS = ['translate', 'openHtml', 'openPdf', 'readerTranslate', 'readerOriginal', 'retranslate', 'restore', 'chooseMode', 'retryFailed', 'openMenu', 'closeMenu', 'chooseService', 'chooseLanguage', 'choosePrompt', 'chooseStyle', 'setHighlight', 'setImages', 'downloadPack', 'openOptions', 'setQuery', 'openLink'] as const satisfies readonly (keyof PopupActions)[]

export const fixture = (id: string) => POPUP_FIXTURES.find(f => f.id === id)!

export async function draw(id: string) {
  const actions = Object.fromEntries(ACTIONS.map(name => [name, vi.fn()])) as Record<(typeof ACTIONS)[number], Mock>
  const f = fixture(id)
  const mounted = await mountElement(createElement(PopupView, { view: derivePopupView(f.input), error: f.error ?? null, actions: actions as unknown as PopupActions }))
  return { ...mounted, actions, main: mounted.container.querySelector('main')! }
}

/** A button's name as assistive technology reads it here: its label, or its words */
export const nameOf = (button: Element) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''

/** A segment's words: its visible span, not the hidden one that holds its title (Part 3's Segmented) */
export const wordsOf = (segment: Element) => segment.querySelector('span:not([hidden])')?.textContent ?? ''
```

`tests/popup/view.test.ts`:

```ts
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { derivePopupView } from '@/entrypoints/popup/view-model'
import { S, setLocale } from '@/ui/strings'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { draw, fixture, nameOf, wordsOf } from './draw'

// The popup as it draws each state (the redesign's design, §5; round 6): found by role and by the pack's words, from the
// fixtures the gallery draws. Where things stand is the browser's to measure (tests/e2e/probes/popup-align.mjs)
let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

describe('the popup drawn (the redesign\'s design, §5)', () => {
  it('draws every state in the kind its view model says, each kind with its parts: the group where there are controls, the finder on P0 alone', async () => {
    const parts: Record<string, [group: boolean, finder: boolean]> = { pending: [false, false], loading: [false, false], find: [false, true], paper: [true, false], entry: [true, false], reader: [true, false] }
    for (const f of POPUP_FIXTURES) {
      const { main, unmount } = await draw(f.id)
      const kind = derivePopupView(f.input).kind
      expect([f.id, main.dataset.kind, !!main.querySelector('.group'), !!main.querySelector('.find')]).toEqual([f.id, kind, ...parts[kind]!])
      await unmount()
    }
  })

  it('P1: the brand row, the group of two rows, the primary with its key, the display, the foot (§5.1)', async () => {
    const { main, actions } = await draw('P1')
    const brand = main.querySelector('.brand-row')!
    expect(brand.querySelector('.wordmark')!.textContent).toBe(S.brand)
    const gear = brand.querySelector('button')!
    expect(gear.getAttribute('aria-label')).toBe(S.settings)
    await act(async () => { gear.click() })
    expect(actions.openOptions).toHaveBeenCalledWith()
    expect([...main.querySelectorAll('.group .group-row .k')].map(k => k.textContent)).toEqual([S.rows.service, S.rows.language])
    expect(main.querySelector(`button[aria-label="${S.primary.translate}"] kbd`)?.textContent).toBe('⌥T')
    const radios = [...main.querySelectorAll('[role="radiogroup"] [role="radio"]')]
    // the stored preference is stacked. A segment's words are its visible span: its title rides in a hidden one
    // (Part 3's Segmented, its description), which textContent would read too
    expect(radios.map(r => [wordsOf(r), r.getAttribute('aria-checked'), !!r.querySelector('svg')])).toEqual([[S.mode.side, 'false', true], [S.mode.stack, 'true', true], [S.mode.only, 'false', true]])
    expect([...main.querySelectorAll('.foot [role="switch"]')].map(s => s.getAttribute('aria-label'))).toEqual([S.rows.highlight, S.rows.images])
    expect(main.querySelector('.foot .style-btn')!.textContent).toBe(S.rows.style)
  })

  it('P4: showing the original is the neutral face, and keeps its key (S-P-51)', async () => {
    const { main } = await draw('P4')
    expect(main.querySelector(`button[aria-label="${S.primary.restore}"] kbd`)?.textContent).toBe('⌥T')
  })

  it('P9: the note with its alert and its settings, then Translate again with its key before Show original without one (§5.2)', async () => {
    const { main, actions } = await draw('P9')
    const note = main.querySelector('.note')!
    expect(note.getAttribute('data-tone')).toBe('alert')
    expect(note.querySelector('button')!.textContent).toBe(S.settings)
    const pair = [...main.querySelectorAll('.pair > button')]
    expect(pair.map(nameOf)).toEqual([S.primary.retranslate, S.primary.restore])
    expect(pair.map(b => !!b.querySelector('kbd'))).toEqual([true, false])
    await act(async () => { (pair[1] as HTMLElement).click() })
    expect(actions.restore).toHaveBeenCalled()
  })

  it('P13: Translate again greyed and without its key, Show original beside it', async () => {
    const pair = [...(await draw('P13')).main.querySelectorAll('.pair > button')]
    expect(pair.map(nameOf)).toEqual([S.primary.retranslate, S.primary.restore])
    expect([pair[0]!.getAttribute('aria-disabled'), pair[0]!.querySelector('kbd')]).toEqual(['true', null])
  })

  it('P6b: the key made good, the page on the free service offered its way back — Translate again, and Show original with the key (the retranslate cue)', async () => {
    const { main, actions } = await draw('P6b')
    expect(main.querySelector('.note')).toBeNull()
    const pair = [...main.querySelectorAll<HTMLElement>('.pair > button')]
    expect(pair.map(nameOf)).toEqual([S.primary.retranslate, S.primary.restore])
    expect(pair.map(b => b.querySelector('kbd')?.textContent ?? null)).toEqual([null, '⌥T'])
    await act(async () => { pair[0]!.click() })
    expect(actions.retranslate).toHaveBeenCalled()
  })

  it('P5: a failure is a note of its own, with its alert and Retry', async () => {
    const { main, actions } = await draw('P5')
    const note = [...main.querySelectorAll('.note')].find(n => n.textContent?.includes(S.failed.text(3)))!
    expect(note.getAttribute('data-tone')).toBe('alert')
    await act(async () => { note.querySelector('button')!.click() })
    expect(actions.retryFailed).toHaveBeenCalled()
  })

  it('P6: the service in use, the one put aside struck through beside it; the note carries the information icon', async () => {
    const { main } = await draw('P6')
    expect(main.querySelector('.group-row s')!.textContent).toBe('deepseek-v4-flash')
    expect(main.querySelector('.note')!.getAttribute('data-tone')).toBe('info')
  })

  it('P12: the display says the window is narrow, under it', async () => {
    expect((await draw('P12')).main.querySelector('.reading .line')!.textContent).toBe(S.mode.narrow)
  })

  it('P17: the group and the two entries with their icons, nothing of a translated page (§5.5)', async () => {
    const { main, actions } = await draw('P17')
    const entries = [...main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(entries.map(nameOf)).toEqual([S.entry.html, S.entry.pdf])
    expect(entries.every(b => b.querySelector('svg'))).toBe(true)
    expect([main.querySelector('[role="radiogroup"]'), main.querySelector('.foot')]).toEqual([null, null])
    await act(async () => { entries[1]!.click() })
    expect(actions.openPdf).toHaveBeenCalled()
  })

  it('P17a: the HTML entry greyed, the reason in a note with the information icon and no button', async () => {
    const { main, actions } = await draw('P17a')
    const [html] = [...main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(html!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { html!.click() })
    expect(actions.openHtml).not.toHaveBeenCalled()
    const note = main.querySelector('.note')!
    expect([note.getAttribute('data-tone'), note.querySelector('button')]).toEqual(['info', null])
  })

  it('P2: the Chrome row with its download runs it through onAction, never as a choice (Part 3\'s action API: a missing onAction is a silent no-op)', async () => {
    const { main, actions, flush } = await draw('P2')
    // the menus' rows are drawn from the frame after the first
    await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) })
    await flush()
    const row = [...main.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(S.service.chrome))!
    // greyed, yet operable: no aria-disabled, the class `unavailable` (Part 3)
    expect([row.getAttribute('aria-disabled'), row.classList.contains('unavailable')]).toEqual([null, true])
    await act(async () => { row.click() })
    expect([actions.downloadPack.mock.calls.length, actions.chooseService.mock.calls.length]).toEqual([1, 0])
    // Enter on the row, as the keyboard picks it, does the same
    const list = row.closest<HTMLElement>('[role="listbox"]')!
    await act(async () => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null })) })
    await act(async () => { list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect([actions.downloadPack.mock.calls.length, actions.chooseService.mock.calls.length]).toEqual([2, 0])
  })

  it('PR: stacked greyed, the switches kept, no style button (§5.2)', async () => {
    const { main } = await draw('PR')
    const stack = [...main.querySelectorAll('[role="radio"]')].find(r => wordsOf(r) === S.mode.stack)!
    expect(stack.getAttribute('aria-disabled')).toBe('true')
    expect(main.querySelectorAll('.foot [role="switch"]').length).toBe(2)
    expect(main.querySelector('.foot .style-btn')).toBeNull()
  })

  it('PL says the page is loading and draws nothing else; PW is the brand row alone (§5.4)', async () => {
    const loading = await draw('PL')
    expect(loading.main.querySelector('.line.solo')!.textContent).toBe(S.loading)
    expect([loading.main.querySelector('.group'), loading.main.querySelector('input')]).toEqual([null, null])
    await loading.unmount()
    const pending = await draw('PW')
    expect([...pending.main.children].filter(c => c.getAttribute('role') !== 'status').map(c => c.className)).toEqual(['brand-row'])
  })

  it('PE: the failure line under the primary, with its alert; said to screen readers politely (§9)', async () => {
    const { main } = await draw('PE')
    const said = fixture('PE').error!
    expect(main.querySelector('.stack > .line.alert')!.textContent).toBe(said)
    expect(main.querySelector('[role="status"]')!.textContent).toBe(said)
    expect(main.querySelector('[role="alert"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/popup/view.test.ts`
Expected: FAIL — the old component has no `.brand-row`, no `data-kind`.

- [ ] **Step 3: A note, the display's icons, the two entries**

`src/entrypoints/popup/ui/Note.tsx`:

```tsx
// A note (the redesign's design, §5.2; round 4, and A of round 6): a row on the group, its icon on its first line — the
// alert in danger for something blocked or stopped, the information in ink-2 for something that goes on — its words in
// ink, never red, and a raised button at its trailing edge (Settings or Retry)
import { CircleAlert, Info } from 'lucide'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'

export function Note({ tone, text, action }: { tone: 'alert' | 'info'; text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="note" data-tone={tone}>
      <p>
        <Icon node={tone === 'alert' ? CircleAlert : Info} />
        {text}
      </p>
      {/* the note's raised button: 26 px and 10 px in, Part 3's measure for it (rounds 4–6) */}
      {action && <Button kind="raised" onClick={action.run}>{action.label}</Button>}
    </div>
  )
}
```

`src/entrypoints/popup/ui/ModeIcon.tsx`:

```tsx
// The display's three icons, the reader's family (its design, §6.2): the reader's pane of 24 × 18, split down the middle
// for side by side, across for stacked, its wen glyph for the translation alone
import type { Mode } from '@/core/renderer'
import { GLYPH_WEN } from '@/pdf-reader/ui/display-glyphs'
import { WEN_GAIN } from '@/pdf-reader/ui/icons'

export function ModeIcon({ mode }: { mode: Mode }) {
  return (
    <svg aria-hidden="true" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" overflow="visible">
      <rect x="2.5" y="2.5" width="19" height="13" rx="3" />
      {mode === 'side' && <path d="M12 2.5v13" shapeRendering="crispEdges" />}
      {mode === 'stack' && <path d="M2.5 9h19" shapeRendering="crispEdges" />}
      {mode === 'only' && <path d={GLYPH_WEN} fill="currentColor" strokeWidth={WEN_GAIN} />}
    </svg>
  )
}
```

`src/entrypoints/popup/ui/Entries.tsx`:

```tsx
// A paper's two ways in (the redesign's design, §5.5; S-P-50b): the HTML entry with a globe, the PDF entry with a document, brand
// buttons side by side, equal widths; the one that cannot be used greyed. An entry page draws them, and P0 for a paper
// it names
import { FileText, Globe } from 'lucide'
import { Button } from '@/ui/controls/Button'

export interface EntryButton { label: string; disabled: boolean; run: () => void }

export function Entries({ html, pdf }: { html: EntryButton; pdf: EntryButton }) {
  const press = (entry: EntryButton) => () => { if (!entry.disabled) entry.run() }
  return (
    <div className="twin">
      <Button kind="brand" size="lg" icon={Globe} disabled={html.disabled} onClick={press(html)}>{html.label}</Button>
      <Button kind="brand" size="lg" icon={FileText} disabled={pdf.disabled} onClick={press(pdf)}>{pdf.label}</Button>
    </div>
  )
}
```

- [ ] **Step 4: The popup**

Replace `src/entrypoints/popup/PopupView.tsx` with:

```tsx
// Renders the view model's output and nothing else; every action goes through props, so the gallery can feed the same
// component the fixtures. The redesign's popup (its design, §5; round 6 of its prototypes), from the top: the brand row;
// the group of the service, the target language and, for an LLM, the prompt; a note; the primary — both of its faces when the page is paused
// or behind its settings — or an entry page's two entries; the display; the foot. P0 is the brand row over the field that
// finds a paper. Every measure is popup.css's
import './popup.css'
import { CircleAlert, Info, Settings } from 'lucide'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { useTip } from '@/ui/controls/tip'
import { MODE_ORDER, R, S } from '@/ui/strings'
import type { PopupActions } from './data'
import { Entries } from './ui/Entries'
import { MenuRow, StyleButton } from './ui/menu'
import { ModeIcon } from './ui/ModeIcon'
import { Note } from './ui/Note'
import type { PopupView as View } from './view-model'

export function PopupView({ view, error, actions }: { view: View; error: string | null; actions: PopupActions }) {
  const failure = error === null ? null : S.actionFailed(error)
  return (
    <main className="ui popup" data-kind={view.kind}>
      <BrandRow onSettings={() => actions.openOptions()} />
      {view.kind === 'loading' && <p className="line solo">{S.loading}</p>}
      {view.kind === 'find' && <div className="find"><p className="line">{S.find.lead}</p></div>}
      {(view.kind === 'paper' || view.kind === 'entry' || view.kind === 'reader') && <Controls view={view} failure={failure} actions={actions} />}
      {/* a failed action said to screen readers, politely (§9: nothing is assertive); its line is drawn in place */}
      <div role="status" className="sr-only">{failure}</div>
    </main>
  )
}

/** The brand row (§5.1): the mark and the name leading, the settings' gear trailing */
function BrandRow({ onSettings }: { onSettings: () => void }) {
  const tip = useTip(S.settings)
  return (
    <header className="brand-row">
      <span className="wordmark">
        <img src="/icon/mark.svg" alt="" width={20} height={17} />
        {S.brand}
      </span>
      <button type="button" className="tbtn" aria-label={S.settings} onClick={onSettings} {...tip.props}>
        <Icon node={Settings} />
      </button>
      {tip.tip}
    </header>
  )
}

function Controls({ view, failure, actions }: { view: View; failure: string | null; actions: PopupActions }) {
  return (
    <>
      <div className="group">
        <MenuRow kind="service" label={S.rows.service} row={view.service} menu={view.menus?.service ?? null} open={view.menu === 'service'} actions={actions} onPick={actions.chooseService} onAction={() => actions.downloadPack()} />
        <hr className="rule" />
        <MenuRow kind="language" label={S.rows.language} row={view.language} menu={view.menus?.language ?? null} open={view.menu === 'language'} actions={actions} onPick={id => actions.chooseLanguage(id as Parameters<PopupActions['chooseLanguage']>[0])} />
        {view.prompt && (
          <>
            <hr className="rule" />
            <MenuRow kind="prompt" label={S.rows.prompt} row={view.prompt} menu={view.menus?.prompt ?? null} open={view.menu === 'prompt'} actions={actions} onPick={actions.choosePrompt} />
          </>
        )}
      </div>
      <div className="stack">
        {view.note && <Note tone={view.note.tone} text={view.note.text} action={view.note.settings ? { label: S.settings, run: () => actions.openOptions() } : undefined} />}
        {view.failed && <Note tone="alert" text={view.failed} action={{ label: S.failed.retry, run: actions.retryFailed }} />}
        {view.entries
          ? <Entries html={{ ...view.entries.html, run: actions.openHtml }} pdf={{ ...view.entries.pdf, run: actions.openPdf }} />
          : <Primary view={view} actions={actions} />}
        {failure && <p className="line mark alert"><Icon node={CircleAlert} size={14} />{failure}</p>}
        {view.kind !== 'entry' && (
          <div className="reading">
            <Segmented
              label={R.display.name}
              value={view.mode.value}
              fit
              // The bar follows MODE_ORDER, the one place the order is decided (UI.md S-P-70). A mode the page cannot show
              // (the PDF reader cannot stack: its design, §9.2) stays in place, greyed, its title the reason (S-P-75)
              options={MODE_ORDER.map(value => ({
                value,
                label: S.mode[value],
                icon: <ModeIcon mode={value} />,
                title: view.mode.disabled?.includes(value) ? S.mode.stackPdf : S.mode[`${value}Title` as const],
                disabled: view.mode.disabled?.includes(value),
              }))}
              onChange={actions.chooseMode}
            />
            {view.mode.note && <p className="line mark"><Icon node={Info} size={14} />{view.mode.note}</p>}
          </div>
        )}
      </div>
      {view.kind !== 'entry' && <Foot view={view} actions={actions} />}
    </>
  )
}

/**
 * The primary (§5.1, §5.2): the brand's for translating, the neutral's for showing the original, neutral grey and without
 * its key when it cannot act (Part 3's `Button`). The key rides on the face it acts on (S-P-50 / 51), brand or neutral:
 * the view model says which. Paused or behind its settings — or offered its way back, the retranslate cue — both faces
 * side by side, the brand's first
 */
function Primary({ view, actions }: { view: View; actions: PopupActions }) {
  const { primary, secondary } = view
  const brand = !primary.disabled && primary.action !== 'restore' && primary.action !== 'readerOriginal'
  // aria-label keeps the accessible name at the words alone, key or not (the e2e suites find the buttons by name)
  const main = (
    <Button kind={brand ? 'brand' : 'neutral'} size="lg" disabled={primary.disabled} aria-label={primary.label} shortcut={primary.shortcut} onClick={actions[primary.action]}>
      {primary.label}
    </Button>
  )
  if (!secondary) return main
  return (
    <div className="pair">
      {main}
      <Button kind="neutral" size="lg" aria-label={secondary.label} shortcut={secondary.shortcut} onClick={actions[secondary.action]}>{secondary.label}</Button>
    </div>
  )
}

/** The foot (§5.1): the two switches with their words, their whole row their label (§9); the styles trailing */
function Foot({ view, actions }: { view: View; actions: PopupActions }) {
  return (
    <div className={view.style ? 'foot' : 'foot short'}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through */}
      <label className="toggle" title={S.rows.highlightTitle}>
        <Switch label={S.rows.highlight} checked={view.highlight} onChange={actions.setHighlight} />
        {S.rows.highlight}
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through */}
      <label className="toggle">
        <Switch label={S.rows.images} checked={view.images} onChange={actions.setImages} />
        {S.rows.images}
      </label>
      {view.style && view.menus?.style && <StyleButton value={view.style.value} menu={view.menus.style} open={view.menu === 'style'} actions={actions} onPick={actions.chooseStyle} />}
    </div>
  )
}
```

- [ ] **Step 5: The sheet's second part**

Append to `src/entrypoints/popup/popup.css`:

```css
/* the brand row (§5.1): 44 px; the mark and the name at 12, the gear's glyph ending 12 from the trailing edge */
.popup .brand-row { display: flex; flex: none; align-items: center; justify-content: space-between; height: 44px; padding: 0 5px 0 12px; }
/* the mark and the name: not `.brand`, which is Part 3's `Button` kind */
.popup .wordmark { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; letter-spacing: -0.005em; }
.popup .wordmark > img { display: block; width: 20px; height: 17px; }
/* a small button of the chrome, as the reader's toolbar draws one: 30 px, radius 7, a hit area 44 px tall */
.popup .tbtn { position: relative; display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 4px; height: 30px; min-width: 30px; border-radius: 7px; color: var(--ink-2); transition: background-color 150ms ease-out, color 150ms ease-out, scale 150ms ease-out; }
.popup .tbtn::before { content: ""; position: absolute; inset: -7px -2px; }
.popup .tbtn[aria-expanded="true"] { background: var(--fill); color: var(--ink); }
@media (hover: hover) { .popup .tbtn:hover { background: var(--fill); color: var(--ink); } }
.popup .tbtn:active { scale: 0.96; }

/* under the group: a note, the primary or the entries, the display — 16 px apart, twice the 8 within a group (§5.1) */
.popup .stack { display: flex; flex-direction: column; gap: 16px; padding: 16px 12px 0; }
.popup[data-kind="entry"] .stack { padding-bottom: 14px; }

/* a note (§5.2): a row on the group; its icon on its first line, its words in ink, a raised button trailing */
.popup .note { display: flex; align-items: center; gap: 8px; padding: 9px 8px 9px 10px; border-radius: 10px; background: var(--group); }
.popup .note > p { position: relative; flex: 1; min-width: 0; margin: 0; padding-inline-start: 24px; font-size: 12.5px; line-height: 1.45; text-wrap: pretty; }
.popup .note > p > svg { position: absolute; inset-inline-start: 0; top: calc((1lh - 16px) / 2); color: var(--ink-2); }
.popup .note[data-tone="alert"] > p > svg { color: var(--danger); }

/* two buttons side by side, equal widths: the primary's two faces (P9 / P13), a paper's two entries (icon 7 px from its words) */
.popup .pair, .popup .twin { display: flex; gap: 8px; }
.popup .pair > *, .popup .twin > * { flex: 1 1 0; min-width: 0; }
.popup .twin > * { gap: 7px; }

/* the display and the line under it (S-P-74): 8 px within */
.popup .reading { display: flex; flex-direction: column; gap: 8px; }

/* the foot (§5.1): the two switches with their words, the style button trailing; the reader's, without it, together */
.popup .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px 14px; }
.popup .foot.short { justify-content: flex-start; gap: 20px; }
.popup .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.popup .style-btn { padding-inline: 8px 6px; font-size: 12.5px; }
.popup .style-btn > svg { color: var(--ink-3); }

/* a line of words: 12 px, ink-2, on the controls' edge; one with a mark carries its icon on its first line */
.popup .line { margin: 0; color: var(--ink-2); font-size: 12px; line-height: 1.45; }
.popup .line.solo { padding: 0 12px 14px; }
.popup .line.mark { display: flex; align-items: flex-start; gap: 6px; }
.popup .line.mark > svg { flex: none; margin-top: calc((1lh - 14px) / 2); }
/* an action that failed (S-P-90): ink words after the alert, never red words; 8 px under the button it follows */
.popup .line.alert { color: var(--ink); }
.popup .line.alert > svg { color: var(--danger); }
.popup .stack > .line.alert { margin-top: -8px; }
@media (prefers-reduced-motion: reduce) { .popup .tbtn { transition: none; } }
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run tests/popup tests/ui`
Expected: PASS. Then `git add tests/popup/draw.ts tests/popup/view.test.ts && node scripts/check-english.mjs`: it names
`src/entrypoints/popup/PopupView.tsx` alone, which now holds no Chinese (0 lines, its entry granting 1): delete its line
from `scripts/english-allowlist.txt`. The new files hold none (`view.test.ts` reads every word from the pack; its test
names are English), so they get no entry.

- [ ] **Step 7: Check it in a real browser**

Run: `pnpm build`, load `.output/chrome-mv3` unpacked in Chromium, open `https://arxiv.org/html/1706.03762` and the
toolbar popup over it. Expected, against `round-6/png/rows/s2-r1-light.png` and `round-4/png/states/P1-light.png`: the
brand row, the group 12 px from the edges with its two rows, the red 翻译本页 with ⌥T in its light chip, the display with
its thumb on the stored mode, the foot. Open 翻译服务: the menu 8 px from the popup's edges and 4 px under the row, the
popup taller by it; Escape, and the popup is its own height again. Open 译文样式: the menu above the button, inside the
window. Switch the system to dark: the same, in the dark roles. A difference goes into the task's report with a
screenshot; the automated check of all this is Task 38's.

- [ ] **Step 8: Run the gate and commit**

Run: `git add src/entrypoints/popup/ui/Note.tsx src/entrypoints/popup/ui/ModeIcon.tsx src/entrypoints/popup/ui/Entries.tsx tests/popup/draw.ts tests/popup/view.test.ts src/entrypoints/popup/PopupView.tsx src/entrypoints/popup/popup.css scripts/english-allowlist.txt && node scripts/check-english.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git commit -m "feat(popup): draw the popup from round 6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 36: P0 — the field, and what Enter does

**Files:**
- Create: `src/entrypoints/popup/ui/Find.tsx`
- Modify: `src/entrypoints/popup/PopupView.tsx` (the `find` kind), `src/entrypoints/popup/popup.css` (append)
- Test: `tests/popup/find-view.test.ts`

**Interfaces:**
- Consumes: `PopupView['find']` (Task 33); `ADVANCED_SEARCH` (Task 31); `setQuery`, `openLink` (Task 32); `Entries`
  (Task 35); `Reveal`, `Kbd` (Part 3).
- Produces: `Find({ find, failure, actions })`; the classes `.find`, `.find-field`, `.found`, `.go` (`.brand`),
  `.go-label`, `.go-id`, `.go-words`, `.paper`.

- [ ] **Step 1: Write the failing tests**

`tests/popup/find-view.test.ts`:

```ts
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ADVANCED_SEARCH, searchUrl } from '@/entrypoints/popup/find'
import { S, setLocale } from '@/ui/strings'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { draw } from './draw'

// P0 (the redesign's design, §5.4; round 6): the sentence, the field, and what Enter does under it. Nothing opens until
// Enter; everything opens in a new tab (the state's openLink)
let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const enter = (input: HTMLInputElement, isComposing = false) => act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing })) })

describe('P0: the field and what Enter does (the redesign\'s design, §5.4)', () => {
  it('an empty field: the sentence over it, the help line under it, the advanced search a link opening in a new tab', async () => {
    const { main, actions } = await draw('P0')
    const find = main.querySelector('.find')!
    expect([...find.children].map(c => c.className)).toEqual(['line', 'find-field', 'found'])
    expect(find.querySelector('.line')!.textContent).toBe(S.find.lead)
    const input = find.querySelector('input')!
    expect([input.placeholder, input.getAttribute('aria-label'), input.value]).toEqual([S.find.field, S.find.field, ''])
    const link = find.querySelector<HTMLAnchorElement>('.found a')!
    expect([link.textContent, link.href, link.target]).toEqual([S.find.advanced, ADVANCED_SEARCH, '_blank'])
    expect(find.querySelector('.found .line')!.textContent).toBe(`${S.find.enter} · ${S.find.advanced}`)
    await act(async () => { link.click() })
    expect(actions.openLink).toHaveBeenCalledWith(ADVANCED_SEARCH)
  })

  it('an arXiv PDF address: one brand row, its words, the paper and the key; Enter and a click open it', async () => {
    const { main, actions } = await draw('P0b')
    const row = main.querySelector<HTMLElement>('.go.brand')!
    expect([row.querySelector('.go-label')!.textContent, row.querySelector('.go-id')!.textContent, row.querySelector('kbd')!.textContent]).toEqual([S.entry.pdf, S.find.paper('2501.07202v1'), '↵'])
    await enter(main.querySelector('input')!)
    expect(actions.openLink).toHaveBeenLastCalledWith('https://arxiv.org/pdf/2501.07202v1#readarxiv')
    await act(async () => { row.click() })
    expect(actions.openLink).toHaveBeenCalledTimes(2)
  })

  it('words: the neutral row of arXiv\'s own search, which Enter opens', async () => {
    const { main, actions } = await draw('P0a')
    expect(main.querySelector('.go:not(.brand) .go-words')!.textContent).toBe(S.find.search('attention is all you need'))
    await enter(main.querySelector('input')!)
    expect(actions.openLink).toHaveBeenCalledWith(searchUrl('attention is all you need'))
  })

  it('Enter that ends an input method\'s composition opens nothing: a title typed in Pinyin ends so', async () => {
    const { main, actions } = await draw('P0a')
    await enter(main.querySelector('input')!, true)
    expect(actions.openLink).not.toHaveBeenCalled()
  })

  it('what is typed goes to the state, and a paste is only that: nothing opens', async () => {
    const { main, actions } = await draw('P0')
    const input = main.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://arxiv.org/pdf/2501.07202')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(actions.setQuery).toHaveBeenCalledWith('https://arxiv.org/pdf/2501.07202')
    expect(actions.openLink).not.toHaveBeenCalled()
  })

  it('a paper named: its line at once, its entries revealed when both checks are back; a greyed entry opens nothing and says why', async () => {
    const pending = await draw('P0d')
    expect(pending.main.querySelector('.paper b')!.textContent).toBe(S.find.paper('2501.07202v1'))
    // Enter has nothing to open: the reader chooses an entry
    await enter(pending.main.querySelector('input')!)
    expect(pending.actions.openLink).not.toHaveBeenCalled()
    // the reveal closed, its contents inert (§8, §9)
    expect(pending.main.querySelector('.found [inert]')).not.toBeNull()
    await pending.unmount()
    const both = await draw('P0e')
    const entries = [...both.main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(entries.map(b => b.getAttribute('aria-disabled') === 'true')).toEqual([false, false])
    await act(async () => { entries[0]!.click() })
    expect(both.actions.openLink).toHaveBeenCalledWith('https://arxiv.org/html/2501.07202v1#readarxiv')
    await both.unmount()
    const none = await draw('P0f')
    const [html] = [...none.main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(html!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { html!.click() })
    expect(none.actions.openLink).not.toHaveBeenCalled()
    expect(none.main.querySelector('.found .line.mark')!.textContent).toBe(S.note.noHtmlVersion)
  })

  it('a link elsewhere: said, and Enter opens nothing', async () => {
    const { main, actions } = await draw('P0g')
    expect(main.querySelector('.found .line.mark')!.textContent).toBe(S.find.elsewhere)
    await enter(main.querySelector('input')!)
    expect(actions.openLink).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/popup/find-view.test.ts`
Expected: FAIL — no `input` in `.find`.

- [ ] **Step 3: P0**

`src/entrypoints/popup/ui/Find.tsx`:

```tsx
// P0, no paper in the tab (the redesign's design, §5.4; round 6): a sentence, a field that takes a link, an id or words,
// and under it what Enter will do — open a paper's page, search arXiv, offer a paper's two entries, or say that only
// arXiv's papers open here. Nothing happens until Enter, and a paste is a paste. Everything it opens, it opens in a new
// tab (openLink), whatever S-O-49b says: that setting is about leaving a paper's page, and this page is not one
import { BookOpen, CircleAlert, FileText, Globe, Info, Search } from 'lucide'
import { useId } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { Kbd } from '@/ui/controls/Kbd'
import { Reveal } from '@/ui/controls/Reveal'
import { S } from '@/ui/strings'
import type { PopupActions } from '../data'
import { ADVANCED_SEARCH } from '../find'
import type { FoundEntry, PopupView } from '../view-model'
import { Entries } from './Entries'

export function Find({ find, failure, actions }: { find: NonNullable<PopupView['find']>; failure: string | null; actions: PopupActions }) {
  const under = useId()
  const found = find.found
  const go = found?.kind === 'open' || found?.kind === 'search' ? found : null
  const paper = found?.kind === 'paper' ? found : null
  const entry = (e: FoundEntry) => ({ label: e.label, disabled: e.href === null, run: () => { if (e.href) actions.openLink(e.href) } })
  return (
    <div className="find">
      <p className="line">{S.find.lead}</p>
      <label className="find-field">
        <Icon node={Search} size={14} />
        <input
          value={find.query}
          placeholder={S.find.field}
          aria-label={S.find.field}
          aria-describedby={under}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          onChange={e => actions.setQuery(e.target.value)}
          // Enter acts; the Enter that ends an input method's composition (a title typed in Pinyin) is the method's
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && go) { e.preventDefault(); actions.openLink(go.href) } }}
        />
      </label>
      <div id={under} className="found">
        {found === null && (
          <p className="line">
            {S.find.enter} · <a href={ADVANCED_SEARCH} target="_blank" rel="noopener" onClick={e => { e.preventDefault(); actions.openLink(ADVANCED_SEARCH) }}>{S.find.advanced}</a>
          </p>
        )}
        {go?.kind === 'open' && (
          <button type="button" className="go brand" aria-label={`${go.label} ${go.paper}`} onClick={() => actions.openLink(go.href)}>
            <Icon node={go.format === 'pdf' ? FileText : Globe} size={14} />
            <span className="go-label">{go.label}</span>
            <span className="go-id">{go.paper}</span>
            <Kbd>↵</Kbd>
          </button>
        )}
        {go?.kind === 'search' && (
          <button type="button" className="go" aria-label={go.label} onClick={() => actions.openLink(go.href)}>
            <Icon node={Search} size={14} />
            <span className="go-words">{go.label}</span>
            <Kbd>↵</Kbd>
          </button>
        )}
        {paper && (
          <>
            <p className="paper"><Icon node={BookOpen} size={14} /><b>{paper.paper}</b></p>
            {/* the two entries appear when both checks have answered (§5.4), with §8's reveal */}
            <Reveal open={paper.entries !== null}>
              <div className="found">
                {paper.entries && <Entries html={entry(paper.entries.html)} pdf={entry(paper.entries.pdf)} />}
                {paper.note && <p className="line mark"><Icon node={Info} size={14} />{paper.note}</p>}
              </div>
            </Reveal>
          </>
        )}
        {found?.kind === 'elsewhere' && <p className="line mark"><Icon node={Info} size={14} />{found.text}</p>}
        {failure && <p className="line mark alert"><Icon node={CircleAlert} size={14} />{failure}</p>}
      </div>
    </div>
  )
}
```

In `src/entrypoints/popup/PopupView.tsx`, add `import { Find } from './ui/Find'` and replace
`{view.kind === 'find' && <div className="find"><p className="line">{S.find.lead}</p></div>}` with
`{view.kind === 'find' && view.find && <Find find={view.find} failure={failure} actions={actions} />}`.

- [ ] **Step 4: The sheet's third part**

Append to `src/entrypoints/popup/popup.css`:

```css
/* P0 (§5.4, round 6): the sentence, the field, what Enter will do — on the controls' edge, 8 px apart, 14 px from the foot */
.popup .find { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 14px; }
.popup .find-field { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; border-radius: 9px; background: var(--group); color: var(--ink-2); box-shadow: inset 0 0 0 0.5px var(--chrome-line); cursor: text; }
/* focused, its edge; the ring the keyboard's alone (§9, controls/modality.ts): a field clicked shows its edge, not a ring */
.popup .find-field:focus-within { background: var(--field); box-shadow: inset 0 0 0 1px var(--ink-3); color: var(--ink); }
html:not([data-axt-pointer]) .popup .find-field:focus-within { outline: 2px solid var(--focus); outline-offset: 0; }
.popup .find-field > svg { flex: none; }
.popup .find-field > input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: none; color: var(--ink); font: 13px var(--font); }
.popup .find-field > input:focus-visible { outline: none; }
.popup .find-field > input::placeholder { color: var(--ink-2); }
.popup .found { display: flex; flex-direction: column; gap: 8px; }
.popup .found a { color: var(--ink); text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--ink) 30%, transparent); text-underline-offset: 2px; }
/* what Enter does: a row of the field's height; the brand's for a paper's page, its id told apart by weight (§5.4) */
.popup .go { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 0 10px; border-radius: 9px; background: var(--group-hover); color: var(--ink); text-align: start; font-size: 12.5px; transition: scale 150ms ease-out; }
.popup .go:active { scale: 0.96; }
.popup .go > svg { flex: none; }
.popup .go.brand { background: var(--brand); color: var(--on-brand); }
.popup .go-label { flex: none; font-weight: 500; }
.popup .go-id, .popup .go-words { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.popup .go-id { font-weight: 400; font-variant-numeric: tabular-nums; }
.popup .go.brand .go-id { color: var(--on-brand-2); }
.popup .go.brand kbd { background: var(--brand-chip); color: var(--on-brand); }
.popup .paper { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--ink-2); font-size: 12.5px; }
.popup .paper > b { color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .popup .go { transition: none; } }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/popup`
Expected: PASS (the test `'draws every state in the kind its view model says, …'` of Task 35 draws P0's states through
`Find` now).

- [ ] **Step 6: Check it in a real browser**

Run `pnpm build`, load the build, open `about:blank` and the toolbar popup over it. Expected, against
`round-6/png/rows/s1-r*-light.png` (with the design's order: the sentence over the field): paste
`https://arxiv.org/pdf/2501.07202v1` — the red row, nothing opens; Enter — a new tab at arXiv's PDF, the popup gone.
Type `attention` in Chinese Pinyin with the system's input method and press Enter to pick a candidate: nothing opens.
Type `1706.03762`: the paper's line at once, the two entries sliding in a moment later. A difference goes into the
report.

- [ ] **Step 7: Run the gate and commit**

Run: `git add src/entrypoints/popup/ui/Find.tsx tests/popup/find-view.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/entrypoints/popup/PopupView.tsx src/entrypoints/popup/popup.css
git commit -m "feat(popup): P0 searches arXiv and opens a paper

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 37: the browser suites on the popup's new controls

**Files:**
- Modify: `tests/e2e/extension.mjs`, `tests/e2e/image.mjs`, `tests/e2e/layout.mjs`, `tests/e2e/a11y.mjs`, `tests/e2e/pdf-entry.mjs`
- Modify: `tests/e2e/probes/highlight-lag.mjs`, `tests/e2e/probes/reading-position.mjs`
- Modify: `experiments/pdf-bilingual/spikes/entries.mjs`
- (`scripts/english-allowlist.txt` is not changed: every count stays, Step 4)

**Interfaces:**
- Consumes: the popup of Tasks 35–36: the display is a radio group (`Segmented`), a disabled button is
  `aria-disabled="true"` and focusable (Part 3's `Button`), P0's sentence is `S.find.lead`, a style's option carries
  its sample after its name (`MenuList`'s preview).
- Produces: every suite finds the popup's controls where they are now; no check is loosened.

- [ ] **Step 1: The display's segments are radios**

```bash
sed -i '' -E "s/getByRole\('button', \{ name: '(左右|上下|仅译文)', exact: true \}\)/getByRole('radio', { name: '\1', exact: true })/g" tests/e2e/extension.mjs tests/e2e/image.mjs tests/e2e/layout.mjs
```

Then by hand, where the name is a variable:

- `tests/e2e/image.mjs`, in `switchMode`: both `popup.getByRole('button', { name, exact: true })` become
  `popup.getByRole('radio', { name, exact: true })`;
- `tests/e2e/a11y.mjs`: `const control = popup.getByRole('button', { name: button, exact: true })` becomes
  `const control = popup.getByRole('radio', { name: button, exact: true })`;
- `tests/e2e/probes/highlight-lag.mjs`, in `setMode`: `popup.getByRole('button', { name, exact: true })` becomes
  `popup.getByRole('radio', { name, exact: true })` (its callers pass 上下, 仅译文, 左右 only: check with
  `grep -n "setMode(" tests/e2e/probes/highlight-lag.mjs`);
- `tests/e2e/probes/reading-position.mjs`: `const mode = name => async () => { await popup.getByRole('button', { name, exact: true }).click() }`
  becomes `const mode = name => async () => { await popup.getByRole('radio', { name, exact: true }).click() }`;
- `tests/e2e/layout.mjs` (its `sideButton` line is the sed's already): the reader's-place check's

```js
  const press = name => () => popup.getByRole('button', { name, exact: true }).click()
  const steps = [['translate', press('翻译本页'), 6000], ['stacked', press('上下'), 2500], ['translation only', press('仅译文'), 2500], ['side by side', press('左右'), 3500], ['restore', press('显示原文'), 3000]]
```

  becomes

```js
  /** a button of the popup's, or one of its display's segments, which are radios */
  const press = (name, role = 'button') => () => popup.getByRole(role, { name, exact: true }).click()
  const steps = [['translate', press('翻译本页'), 6000], ['stacked', press('上下', 'radio'), 2500], ['translation only', press('仅译文', 'radio'), 2500], ['side by side', press('左右', 'radio'), 3500], ['restore', press('显示原文'), 3000]]
```

Run: `grep -rnE "getByRole\('button', \{ name: '(左右|上下|仅译文)'" tests/e2e`
Expected: no output.

- [ ] **Step 2: A greyed button is aria-disabled, and stays focusable**

- `tests/e2e/pdf-entry.mjs`, in `popupOn`: `disabled: button?.disabled ?? null,` becomes
  `disabled: button ? button.getAttribute('aria-disabled') === 'true' : null,`; in the panel's check,
  `.map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }))` becomes
  `.map(b => ({ text: b.textContent?.trim(), disabled: b.getAttribute('aria-disabled') === 'true' }))`; on the abstract
  page, `return b ? { disabled: b.disabled } : null` becomes `return b ? { disabled: b.getAttribute('aria-disabled') === 'true' } : null`;
- `tests/e2e/extension.mjs`, in the block of a wrong key remembered with the fallback off (the `primaryDisabled`
  check): `    return button ? button.disabled : null` becomes
  `    return button ? button.getAttribute('aria-disabled') === 'true' : null` (the greyed primary is aria-disabled, its
  `disabled` property false; Part 5 leaves this block alone);
- `experiments/pdf-bilingual/spikes/entries.mjs`, in `popupOver`:
  `const named = re => buttons.filter(b => re.test(b.textContent ?? '')).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }))`
  becomes `const named = re => buttons.filter(b => re.test(b.textContent ?? '')).map(b => ({ text: b.textContent?.trim(), disabled: b.getAttribute('aria-disabled') === 'true' }))`.
  Its `stack` reads `b.title` for the greyed segment's reason; Part 3's `Segmented` gives a segment's title as its
  tooltip and its description (`aria-describedby`), so
  `.map(b => ({ disabled: b.getAttribute('aria-disabled') === 'true', title: b.title }))` becomes
  `.map(b => ({ disabled: b.getAttribute('aria-disabled') === 'true', title: document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent ?? '' }))`.
  The same line's filter reads a segment's words, not its `textContent`: the hidden title rides inside the button, and
  side by side's (「…窗口较窄时按上下显示」) matches 上下 before the stacked segment does (MODE_ORDER), so the check of the
  reader's popup would read an enabled segment.
  `stack: buttons.filter(b => /上下|Stacked/.test(b.textContent ?? ''))` becomes
  `stack: buttons.filter(b => b.getAttribute('role') === 'radio' && /^(上下|Stacked)$/.test(b.querySelector('span:not([hidden])')?.textContent ?? ''))`.

- [ ] **Step 3: P0's sentence, and a style's option by its name**

In `tests/e2e/extension.mjs`:

- `await popup.getByRole('option', { name: '绿色', exact: true }).click()` becomes
  `await popup.getByRole('option', { name: /^绿色/ }).click()` (the option's sample sentence follows its name);
- in `'the popup follows the interface language into English'`, `/Open the HTML version|Translate this page/` becomes
  `/Open an arXiv paper|Translate this page/` (P0's sentence, §10.1).

- [ ] **Step 4: The English gate**

Run: `node scripts/check-english.mjs`
Expected: exit 0, naming no file: every edited line keeps its Chinese labels on the same line, and the one line added
(layout.mjs's comment) is English, so the entries stand as they are — `tests/e2e/extension.mjs 76`, `image.mjs 11`,
`layout.mjs 11`, `a11y.mjs 2`, `pdf-entry.mjs 9`, `probes/highlight-lag.mjs 8`, `probes/reading-position.mjs 5`,
`experiments/pdf-bilingual/spikes/entries.mjs 14`. A file named is a step that went wrong: fix the step, not the count.

- [ ] **Step 5: Run the suites**

Run: `pnpm build && pnpm e2e && pnpm e2e:image && pnpm e2e:layout && pnpm e2e:a11y && pnpm e2e:pdf && pnpm e2e:floating && node experiments/pdf-bilingual/spikes/entries.mjs`
Expected: each exits 0. `pnpm e2e:a11y` may report something the new popup introduced on the page: it audits arXiv's
page, not the popup, so a new finding there is a regression of this part's to fix, not to excuse.

- [ ] **Step 6: Run the gate and commit**

Run: `git add tests/e2e/extension.mjs tests/e2e/image.mjs tests/e2e/layout.mjs tests/e2e/a11y.mjs tests/e2e/pdf-entry.mjs tests/e2e/probes/highlight-lag.mjs tests/e2e/probes/reading-position.mjs experiments/pdf-bilingual/spikes/entries.mjs && node scripts/check-english.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0; the English gate names no file (Step 4's counts), so the allow-list is not part of this commit.

```bash
git commit -m "test(e2e): find the popup's display as radios, its greyed buttons by aria-disabled

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 38: the popup in a real browser, and the probe of its alignment

**Files:**
- Create: `tests/e2e/popup.mjs`, `tests/e2e/probes/popup-align.mjs`
- Modify: `package.json` (`e2e:popup`)
- Modify: `scripts/english-allowlist.txt`

**Interfaces:**
- Consumes: the popup of Tasks 32–36; the gallery (every fixture, light and dark, `section > h2 span` its id), which every
  development build holds (`pnpm exec wxt build --mode development`, into `.output/chrome-mv3-dev`: Part 3's
  `DEV_PAGES`); `offCentre`, `edges`, `shootEach` (`tests/e2e/probes/align.mjs`, Part 3's Task 15).
- Produces: `pnpm e2e:popup`; `pnpm exec wxt build --mode development && node tests/e2e/probes/popup-align.mjs`, which
  writes `experiments/pdf-bilingual/out/popup/*.png` and exits 1 on any item off its row's centre line by more than
  0.5 px, or any edge off 12 / 24 by more than 0.5 px.

- [ ] **Step 1: The suite's script**

In `package.json`, after `"e2e:floating": "node tests/e2e/floating-button.mjs",` add `"e2e:popup": "node tests/e2e/popup.mjs",`.

- [ ] **Step 2: The popup suite**

`tests/e2e/popup.mjs`:

```js
// The popup in a real browser (the redesign's design, §5): P0's search and open over a page that is not arXiv's, the
// checks of a paper counted, the group's menus under their rows with the popup growing to hold them, the Manage… rows'
// deep links, the style menu over the foot, a switch's words flipping it, an abstract page's two entries alone, and the
// floating button's panel growing with a menu. The alignment of every state is the probe's
// (tests/e2e/probes/popup-align.mjs). Needs the network: arXiv.
//   pnpm build && pnpm e2e:popup
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const SHOTS = fileURLToPath(new URL('./.shots/popup/', import.meta.url))
const PAPER = process.env.AXT_PAPER ?? '1706.03762'
/** a paper old enough to have no HTML version (pdf-entry.mjs's) */
const WITHOUT_HTML = 'hep-th/9711200'
/** an LLM service for the prompt row; its key is a placeholder no request is sent with */
const SVC = { id: 'svc-e2e00001', kind: 'openai-compat', name: 'e2e', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-e2e-placeholder', model: 'x/y', thinking: 'disabled' }
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const near = (a, b) => Math.abs(a - b) <= 0.5

const profile = mkdtempSync(join(tmpdir(), 'popup-e2e-'))
// the profile goes when the process ends, a failure's throw included (a profile a run once filled the disk)
process.on('exit', () => rmSync(profile, { recursive: true, force: true }))
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 800 },
})
context.setDefaultNavigationTimeout(90_000)
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const extId = new URL(worker.url()).host

/** The stored configuration patched, once the extension has written its own at install */
async function patchConfig(patch) {
  await worker.evaluate(async patch => {
    for (let i = 0; i < 50 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
    const { config } = await chrome.storage.local.get('config')
    if (!config) throw new Error('the extension wrote no configuration at install')
    await chrome.storage.local.set({ config: { ...config, ...patch } })
  }, patch)
}
/** The popup as the toolbar opens it over `tab`: its own page at the toolbar popup's width, the tab then in front */
async function popupOver(tab, settle = 2000) {
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 320, height: 600 })
  await popup.goto(`chrome-extension://${extId}/popup.html`)
  await tab.bringToFront()
  await sleep(settle)
  return popup
}
/** The next tab the popup opens, and its address as it commits */
async function nextTab(act) {
  const opened = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
  // the popup closes itself once it has opened the tab (openLink): a press still resolving then meets a closed page,
  // which is the popup doing its job (measured in the pre-flight: one run in three)
  await act().catch(e => { if (!/has been closed/.test(String(e))) throw e })
  const tab = await opened
  await tab?.waitForURL(url => url.protocol !== 'about:', { timeout: 30_000 }).catch(() => undefined)
  const url = tab?.url() ?? null
  await tab?.close()
  return url
}
/**
 * The open menu of a popup page against its row (or button) and the popup. The trigger is a button: the language menu's
 * search field is a combobox with aria-expanded too, in the page whether its menu is open or not (Part 3's MenuList)
 */
const menuPlace = popup => popup.evaluate(() => {
  const main = document.querySelector('main'), pop = document.querySelector('.pop.menu:popover-open'), row = document.querySelector('main button[aria-expanded="true"]')
  if (!pop || !row) return null
  const m = main.getBoundingClientRect(), p = pop.getBoundingClientRect(), r = row.getBoundingClientRect()
  return { left: p.left - m.left, right: m.right - p.right, below: p.top - r.bottom, above: r.top - p.bottom, top: p.top - m.top, room: m.bottom - p.bottom, up: pop.classList.contains('up'), minHeight: main.style.minHeight }
})

// the words this suite finds the controls by
await patchConfig({ uiLanguage: 'zh-CN' })

// ── P0 over a page that is not arXiv's (§5.4) ──────────────────────────────────────────────────────────────────────
const other = await context.newPage()
await other.goto('data:text/html,<title>elsewhere</title><p>not a paper</p>')
{
  const popup = await popupOver(other)
  const text = (await popup.locator('main').innerText()).replace(/\n+/g, ' | ')
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  check('P0: the sentence, the field and the help line, and no group', /打开 arXiv 论文（HTML 或 PDF）即可翻译/.test(text) && (await field.count()) === 1 && /按回车搜索 · 高级搜索/.test(text) && (await popup.locator('.group').count()) === 0, text.slice(0, 120))
  await popup.screenshot({ path: `${SHOTS}/p0.png` })

  // a paste is a paste: nothing opens until Enter
  let opened = 0
  const counting = () => { opened++ }
  context.on('page', counting)
  await field.fill(`https://arxiv.org/pdf/${PAPER}`)
  await sleep(1200)
  context.off('page', counting)
  const row = (await popup.locator('.go.brand').innerText().catch(() => '')).replace(/\s+/g, ' ')
  check('an arXiv PDF address: one brand row, its words and the paper, and the paste opens nothing by itself', /PDF 翻译/.test(row) && row.includes(`arXiv ${PAPER}`) && opened === 0, `“${row}”, ${opened} tab(s) opened`)
  const pdf = await nextTab(() => field.press('Enter'))
  check('Enter opens that PDF in a new tab', (pdf ?? '').startsWith(`https://arxiv.org/pdf/${PAPER}`), pdf ?? 'no tab')
}
{
  const popup = await popupOver(other)
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  await field.fill('attention is all you need')
  await sleep(300)
  const row = await popup.locator('.go:not(.brand)').innerText().catch(() => '')
  const found = await nextTab(() => field.press('Enter'))
  check('words: arXiv\'s own search, in a new tab', /在 arXiv 搜索「attention is all you need」/.test(row) && found === 'https://arxiv.org/search/?query=attention+is+all+you+need&searchtype=all&source=header', `“${row.trim()}” → ${found}`)
}
{
  const popup = await popupOver(other)
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  const heads = []
  context.on('request', r => { if (r.method() === 'HEAD' && /^https:\/\/arxiv\.org\/(html|src)\//.test(r.url())) heads.push(r.url()) })
  // typed key by key, 40 ms apart: the checks wait for the field to be still, and run once per paper
  await field.pressSequentially(`https://arxiv.org/abs/${PAPER}`, { delay: 40 })
  const line = await popup.locator('.paper').innerText().catch(() => '')
  await popup.waitForFunction(() => document.querySelectorAll('.found .twin > button').length === 2, null, { timeout: 8000 }).catch(() => undefined)
  const both = await popup.evaluate(() => [...document.querySelectorAll('.found .twin > button')].map(b => b.getAttribute('aria-disabled') === 'true'))
  check('a paper named: its line at once, both entries once its two checks are back, each check made once', line.includes(`arXiv ${PAPER}`) && JSON.stringify(both) === '[false,false]' && heads.length === 2, `line “${line}”, entries greyed ${JSON.stringify(both)}, HEADs ${heads.join(' ')}`)
  await field.fill('')
  await field.pressSequentially(PAPER, { delay: 40 })
  await sleep(1500)
  check('the same paper again: answered already, not checked again', heads.length === 2, `${heads.length} HEADs`)
  await field.fill(WITHOUT_HTML)
  await popup.waitForFunction(() => document.querySelectorAll('.found .twin > button').length === 2, null, { timeout: 8000 }).catch(() => undefined)
  await sleep(500)
  const none = await popup.evaluate(() => ({ greyed: [...document.querySelectorAll('.found .twin > button')].map(b => b.getAttribute('aria-disabled') === 'true'), said: document.querySelector('.found .line.mark')?.textContent ?? '' }))
  check('a paper with no HTML version: its HTML entry greyed, and why', JSON.stringify(none.greyed) === '[true,false]' && /没有这篇论文的 HTML 版本/.test(none.said), JSON.stringify(none))
  const html = await nextTab(() => popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' }).fill(`https://arxiv.org/abs/${PAPER}`).then(() => sleep(400)).then(() => popup.locator('.found .twin > button').first().click()))
  check('an entry opens the paper\'s HTML version, translating, in a new tab', (html ?? '').startsWith(`https://arxiv.org/html/${PAPER}`), html ?? 'no tab')
}
{
  const popup = await popupOver(other)
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  await field.fill('https://www.nature.com/articles/s41586-021-03819-2')
  await sleep(300)
  const said = await popup.locator('.found .line.mark').innerText().catch(() => '')
  let opened = 0
  const counting = () => { opened++ }
  context.on('page', counting)
  await field.press('Enter')
  await sleep(1500)
  context.off('page', counting)
  check('a link elsewhere: said, and Enter opens nothing', /只能打开 arXiv 的论文链接/.test(said) && opened === 0, `“${said}”, ${opened} tab(s)`)
  const advanced = await nextTab(() => popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' }).fill('').then(() => popup.getByRole('link', { name: '高级搜索' }).click()))
  check('the advanced search is arXiv\'s, in a new tab', advanced === 'https://arxiv.org/search/advanced', advanced ?? 'no tab')
}

// ── P1 over a paper's full text: the group, its menus, the foot (§5.1, §5.3) ────────────────────────────────────────
const paper = await context.newPage()
await paper.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
{
  const popup = await popupOver(paper, 2500)
  const g = await popup.evaluate(() => {
    const m = document.querySelector('main').getBoundingClientRect()
    const box = sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: r.left - m.left, right: m.right - r.right, height: r.height } : null }
    return { width: m.width, brand: box('.brand-row'), group: box('.group'), row: box('.group-row'), primary: box('.stack button[aria-label]'), display: box('[role="radiogroup"]') }
  })
  check('P1: 320 wide, the brand row 44, the group 12 from both edges, its rows 36, the primary 36, the display 30',
    g.width === 320 && g.brand?.height === 44 && near(g.group?.left, 12) && near(g.group?.right, 12) && g.row?.height === 36 && g.primary?.height === 36 && g.display?.height === 30, JSON.stringify(g))
  await popup.screenshot({ path: `${SHOTS}/p1.png` })

  await popup.getByRole('button', { name: /翻译服务/ }).click()
  await sleep(500)
  const service = await menuPlace(popup)
  check('the service menu under its row: 8 px from the popup\'s edges, 4 px below the row, the popup grown to hold it with 8 to spare',
    service && !service.up && near(service.left, 8) && near(service.right, 8) && near(service.below, 4) && service.room >= 7.5 && service.minHeight !== '', JSON.stringify(service))
  await popup.screenshot({ path: `${SHOTS}/p1-services.png` })
  const manage = await nextTab(() => popup.getByRole('option', { name: /管理翻译服务…/ }).click())
  check('Manage services… opens the settings page at the services', manage === `chrome-extension://${extId}/options.html#translate/services`, manage ?? 'no tab')
}
{
  const popup = await popupOver(paper, 2500)
  await popup.getByRole('button', { name: /目标语言/ }).click()
  await sleep(500)
  await popup.keyboard.press('Escape')
  await sleep(400)
  const after = await popup.evaluate(() => ({ open: !!document.querySelector('.pop.menu:popover-open'), minHeight: document.querySelector('main').style.minHeight, focus: document.activeElement?.className ?? '' }))
  check('Escape shuts the menu, gives the popup its own height back and the focus back to its row', !after.open && after.minHeight === '' && /group-row/.test(after.focus), JSON.stringify(after))

  await popup.getByRole('button', { name: '译文样式' }).click()
  await sleep(500)
  const style = await menuPlace(popup)
  check('the style menu above its button, 6 px from it, 8 px from the popup\'s edges, inside the popup', style?.up && near(style.above, 6) && near(style.left, 8) && near(style.right, 8) && style.top >= 7.5, JSON.stringify(style))
  await popup.screenshot({ path: `${SHOTS}/p1-styles.png` })
  const styles = await nextTab(() => popup.getByRole('option', { name: /管理译文样式…/ }).click())
  check('Manage styles… opens the settings page at the styles', styles === `chrome-extension://${extId}/options.html#appearance/styles`, styles ?? 'no tab')
}
{
  const popup = await popupOver(paper, 2500)
  const switchOf = () => popup.getByRole('switch', { name: '对照高亮' })
  const before = await switchOf().getAttribute('aria-checked')
  // the words, not the track: a switch's whole row is its label (§9)
  const words = await popup.locator('.foot .toggle').first().boundingBox()
  await popup.mouse.click(words.x + words.width - 8, words.y + words.height / 2)
  await sleep(400)
  const after = await switchOf().getAttribute('aria-checked')
  await popup.mouse.click(words.x + words.width - 8, words.y + words.height / 2)
  // this popup's own write of the switch lands before the configuration is patched below: a write still out would
  // replace the patch with the configuration this popup holds
  await sleep(400)
  check('a click on a switch\'s words flips it', before !== after, `${before} → ${after}`)
}
await patchConfig({ services: [SVC], provider: SVC.id })
{
  const popup = await popupOver(paper, 2500)
  await popup.getByRole('button', { name: /提示词/ }).click()
  await sleep(500)
  const prompts = await nextTab(() => popup.getByRole('option', { name: /管理提示词…/ }).click())
  check('with an LLM service, the prompt menu ends with Manage prompts…, which opens the settings page at the prompts', prompts === `chrome-extension://${extId}/options.html#translate/prompts`, prompts ?? 'no tab')
}
await patchConfig({ services: [], provider: 'microsoft' })

// ── P17: an abstract page, and the panel on it (§5.5; the floating button's panel, embedded.ts) ────────────────────
const abs = await context.newPage()
await abs.goto(`https://arxiv.org/abs/${PAPER}`, { waitUntil: 'load' })
await sleep(2000)
{
  const popup = await popupOver(abs)
  const seen = await popup.evaluate(() => ({
    entries: [...document.querySelectorAll('.twin > button')].map(b => ({ words: b.textContent?.trim(), icon: !!b.querySelector('svg') })),
    display: !!document.querySelector('[role="radiogroup"]'),
    foot: !!document.querySelector('.foot'),
  }))
  check('P17: the two entries with their icons, and nothing of a translated page', JSON.stringify(seen.entries) === JSON.stringify([{ words: 'HTML 翻译', icon: true }, { words: 'PDF 翻译', icon: true }]) && !seen.display && !seen.foot, JSON.stringify(seen))
  await popup.screenshot({ path: `${SHOTS}/p17.png` })
  await popup.close()
}
{
  // A tab of its own: once popupOver has sized a popup's page (setViewportSize, a device-metrics emulation), the frames
  // of the tab under it hear no pointer in Playwright's Chromium (measured in the pre-flight: no pointerdown reached the
  // panel's popup; entries.mjs meets the same with the reader's frame)
  const tab = await context.newPage()
  await tab.goto(`https://arxiv.org/abs/${PAPER}`, { waitUntil: 'load' })
  await sleep(2000)
  const at = await tab.evaluate(() => { const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
  await tab.mouse.click(at.x, at.y)
  await sleep(2500)
  const panelHeight = () => tab.evaluate(() => Math.round(document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-panel-box').getBoundingClientRect().height))
  const frame = tab.frames().find(f => f.url().includes('/popup.html'))
  const before = await panelHeight()
  await frame.locator('button.group-row').first().click()
  await sleep(800)
  const grown = await panelHeight()
  const inside = await frame.evaluate(() => { const p = document.querySelector('.pop.menu:popover-open')?.getBoundingClientRect(); return p ? p.bottom <= innerHeight : false })
  await tab.screenshot({ path: `${SHOTS}/panel-menu.png` })
  // Escape where the focus is, the menu's list: the menu takes it, and the panel stays (embedded.ts hands over only an
  // Escape nothing took)
  await tab.keyboard.press('Escape')
  await sleep(500)
  const stillOpen = await tab.evaluate(() => !document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-panel-box').hidden)
  check('in the floating button\'s panel a menu grows the frame to hold it, and Escape shuts the menu, not the panel', grown > before && inside && stillOpen, `panel ${before} → ${grown} px, menu inside ${inside}, panel open after Escape ${stillOpen}`)
}

await context.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(failed.length ? 1 : 0)
```

- [ ] **Step 3: The alignment probe**

`tests/e2e/probes/popup-align.mjs`:

```js
// The popup's alignment, and its pictures (the redesign's design, §12; the prototypes' align-probe.mjs and shoot.mjs,
// through Part 3's tests/e2e/probes/align.mjs): every state of the gallery — the popup's fixtures, light and dark side by
// side — in both languages. Each row's items on the row's centre line within 0.5 px; the popup's blocks at 12 px from
// both edges, the group's words at 24 and its values ending 24 from the trailing edge, the gear's glyph ending at 12;
// then the rows hovered and measured again, and each menu opened and measured against its row and its popup. Every
// fixture is shot at 2x (200 %) into experiments/pdf-bilingual/out/popup/, the menus open too. Prints what is off and
// exits 1 if anything is. The gallery is in development builds only (wxt.config.ts DEV_PAGES):
//   pnpm exec wxt build --mode development && node tests/e2e/probes/popup-align.mjs
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { edges, offCentre, shootEach } from './align.mjs'

const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/popup/', import.meta.url))
const GALLERY = join(EXT, 'gallery.html')
// a dev server's build loads its scripts from localhost, and is no use without the server
if (!existsSync(GALLERY) || readFileSync(GALLERY, 'utf8').includes('localhost')) throw new Error('no gallery: pnpm exec wxt build --mode development first')
mkdirSync(OUT, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'popup-align-'))
// the profile goes when the process ends, a failure's throw included (a profile a run once filled the disk)
process.on('exit', () => rmSync(profile, { recursive: true, force: true }))
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, deviceScaleFactor: 2, reducedMotion: 'reduce', viewport: { width: 1200, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let failed = 0
const report = (what, off) => {
  console.log(`${off.length ? 'FAIL' : 'ok  '} ${what}${off.length ? `: ${off.length} off` : ''}`)
  for (const line of off.slice(0, 40)) console.log(`       ${typeof line === 'string' ? line : JSON.stringify(line)}`)
  failed += off.length
}
/** the distinct edges `items` stand at from their popup, and whether they are only `want` */
const edgesAt = async (what, items, want, side = 'start') => {
  const found = await edges(page, { items, frame: '.popup', side })
  report(`${what} at ${want} px`, found.filter(e => e !== want).map(e => `${side} edge at ${e} px`))
}
/** every row's items on its centre line (align.mjs), the rows whose padding is even and whose items are elements */
const ROWS = ['.popup .brand-row', '.popup .group-row', '.popup .stack button', '.popup .twin > button', '.popup .go', '.popup .find-field', '.popup .paper', '.popup [role="radiogroup"]', '.popup [role="radio"]', '.popup .toggle'].join(', ')

/**
 * What align.mjs does not take: the foot's items against its content box (8 px above it, 14 below), a switch's words
 * (a text node) against the switch, and a note's icon on its note's first line (and, on one line, the note's three on
 * its centre line)
 */
const rest = () => page.evaluate(() => {
  const off = []
  const rect = el => el.getBoundingClientRect()
  const mid = r => r.top + r.height / 2
  for (const popup of document.querySelectorAll('.popup')) {
    const where = `${popup.closest('section')?.querySelector('h2 span')?.textContent ?? '?'} ${popup.closest('[data-theme]')?.dataset.theme ?? ''}`
    const foot = popup.querySelector('.foot')
    if (foot) {
      const s = getComputedStyle(foot), r = rect(foot), centre = (r.top + parseFloat(s.paddingTop) + r.bottom - parseFloat(s.paddingBottom)) / 2
      for (const item of foot.querySelectorAll(':scope > .toggle, :scope > .style-btn')) {
        const d = mid(rect(item)) - centre
        if (Math.abs(d) > 0.5) off.push(`${where}: the foot's ${item.className} ${d.toFixed(1)} px off its centre line`)
      }
      for (const toggle of foot.querySelectorAll('.toggle')) {
        const words = document.createRange()
        words.selectNodeContents(toggle.lastChild)
        const d = mid(words.getBoundingClientRect()) - mid(rect(toggle.querySelector('[role="switch"]')))
        if (Math.abs(d) > 0.5) off.push(`${where}: a switch's words ${d.toFixed(1)} px off the switch's centre line`)
      }
    }
    for (const note of popup.querySelectorAll('.note')) {
      const words = note.querySelector('p'), line = parseFloat(getComputedStyle(words).lineHeight), icon = rect(words.querySelector('svg'))
      const d = mid(icon) - (rect(words).top + line / 2)
      if (Math.abs(d) > 0.5) off.push(`${where}: a note's icon ${d.toFixed(1)} px off its first line`)
      if (rect(words).height < line * 1.5) {
        const button = note.querySelector('button')
        const e = button ? mid(rect(button)) - mid(rect(words)) : 0
        if (Math.abs(e) > 0.5) off.push(`${where}: a one-line note's button ${e.toFixed(1)} px off its words' centre line`)
      }
    }
  }
  return off
})

/** The one open menu: its place against its row and its popup */
const menuPlace = () => page.evaluate(() => {
  const pop = document.querySelector('.pop.menu:popover-open')
  if (!pop) return ['no menu open']
  const off = []
  const popup = pop.closest('.popup'), p = popup.getBoundingClientRect(), m = pop.getBoundingClientRect()
  // the trigger is a button: the language menu's search field carries aria-expanded too (Part 3's MenuList)
  const trigger = popup.querySelector('button[aria-expanded="true"]').getBoundingClientRect()
  const near = (what, got, want) => { if (Math.abs(got - want) > 0.5) off.push(`${what} ${got.toFixed(1)} px, not ${want}`) }
  near('the menu from the popup\'s leading edge', m.left - p.left, 8)
  near('the menu from the popup\'s trailing edge', p.right - m.right, 8)
  if (pop.classList.contains('up')) {
    near('the style menu above its button', trigger.top - m.bottom, 6)
    if (m.top - p.top < 7.5) off.push(`the style menu ${(m.top - p.top).toFixed(1)} px from the popup's top, under 8`)
  } else {
    near('the menu under its row', m.top - trigger.bottom, 4)
    if (p.bottom - m.bottom < 7.5) off.push(`the popup ${(p.bottom - m.bottom).toFixed(1)} px below the menu, under 8: it did not grow to hold it`)
  }
  return off
})

async function measureAll(what) {
  report(`${what}: rows on their centre lines`, await offCentre(page, { rows: ROWS }))
  report(`${what}: the foot, the switches' words, the notes`, await rest())
  await edgesAt(`${what}: the brand, the group, the blocks under it`, '.popup .brand-row .wordmark, .popup .group, .popup .stack > *, .popup .reading > *, .popup .find > *, .popup .found > *, .popup .twin, .popup .foot > .toggle:first-child', 12)
  await edgesAt(`${what}: the group, the blocks under it, the gear's glyph, the foot's end`, '.popup .group, .popup .stack > *, .popup .reading > *, .popup .find > *, .popup .found > *, .popup .twin, .popup .brand-row .tbtn svg, .popup .foot:not(.short) > .style-btn', 12, 'end')
  await edgesAt(`${what}: the group's words`, '.popup .group-row > .k', 24)
  await edgesAt(`${what}: the group's values`, '.popup .group-row > .v', 24, 'end')
}

for (const lang of ['zh-CN', 'en']) {
  await worker.evaluate(async lang => {
    for (let i = 0; i < 50 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
    const { config } = await chrome.storage.local.get('config')
    await chrome.storage.local.set({ config: { ...config, uiLanguage: lang } })
  }, lang)
  await page.goto(`chrome-extension://${id}/gallery.html`)
  await page.waitForSelector('.popup')
  await sleep(800)
  // one menu can be open at a time (popover="auto": P2, P3, P15 and P16 each shut the one before), so the menus are shot
  // below, one by one; the measures are taken with none open
  await page.evaluate(() => { for (const [i, section] of document.querySelectorAll('section').entries()) section.dataset.shot = section.querySelector('h2 span')?.textContent ?? String(i) })
  await shootEach(page, 'section', OUT, state => `${lang}-${state}`, 'shot')
  await page.keyboard.press('Escape')
  await sleep(300)
  await measureAll(`${lang}, every state at rest`)
  for (const row of (await page.locator('.popup button.group-row').all()).slice(0, 4)) { await row.hover(); await sleep(150) }
  await measureAll(`${lang}, the rows hovered`)
  const frameOf = state => page.locator('section', { has: page.locator('h2 span', { hasText: new RegExp(`^${state}$`) }) }).locator('[data-theme="light"] .popup')
  // P2's services too: its Chrome row carries the pack's download, the one row of the popup with an action in it
  for (const [state, trigger, name] of [['P1', 'button.group-row >> nth=0', 'services'], ['P2', 'button.group-row >> nth=0', 'services-download'], ['P1', 'button.group-row >> nth=1', 'languages'], ['P15', 'button.group-row >> nth=2', 'prompts'], ['P1', '.style-btn', 'styles']]) {
    await page.keyboard.press('Escape')
    await sleep(200)
    const frame = frameOf(state)
    await frame.locator(trigger).click()
    await sleep(400)
    report(`${lang}, ${state}'s ${name} menu: its place`, await menuPlace())
    report(`${lang}, ${state}'s ${name} menu: its rows`, await offCentre(page, { rows: '.pop.menu:popover-open [role="option"]' }))
    await frame.screenshot({ path: join(OUT, `${lang}-${state}-${name}.png`) })
  }
}
await context.close()
for (const e of errors) console.log(`FAIL page error — ${e}`)
console.log(`\nshots in ${OUT}`)
process.exit(failed || errors.length ? 1 : 0)
```

- [ ] **Step 4: Allow the suite's Chinese**

Run: `git add tests/e2e/popup.mjs tests/e2e/probes/popup-align.mjs && node scripts/check-english.mjs`
Expected: it names `tests/e2e/popup.mjs` with 20 lines holding Chinese (the controls and the copy it finds by their
Chinese words; every comment and check name is English), and nothing else (`popup-align.mjs` holds none). In
`scripts/english-allowlist.txt`, after the line of `tests/e2e/pdf-entry.mjs`, add
`tests/e2e/popup.mjs 20  # 2026-09-26: the popup's controls and words found by their Chinese names, as the other suites find them (the redesign's Part 4)`
(the count the gate reported, should it differ). Run `git add scripts/english-allowlist.txt && node scripts/check-english.mjs`: exit 0.

- [ ] **Step 5: Run the two**

Run: `pnpm build && pnpm e2e:popup`
Expected: every line `PASS`, exit 0.

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/popup-align.mjs`
Expected: every line `ok`, exit 0, and the pictures in `experiments/pdf-bilingual/out/popup/`. An item off its centre
line or an edge off 12 / 24 is fixed in `popup.css` (or reported, when it is inside Part 3's control) before this task
ends; a rule changed here is a measure the prototype did not give, and goes into the report with its reason. (The
development build goes into `.output/chrome-mv3-dev`; the release build in `.output/chrome-mv3` is untouched.)

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add tests/e2e/popup.mjs tests/e2e/probes/popup-align.mjs package.json scripts/english-allowlist.txt
git commit -m "test(popup): the popup in a real browser, and the probe of its alignment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add `src/entrypoints/popup/popup.css` by name if Step 5 changed it.)

### Task 39: Part 4's record

**Files:**
- Modify: `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part4-popup.md` (`## Part 4: done`)
- Modify: `scripts/english-allowlist.txt` (this plan's entry: the count the English gate names, Step 6)

- [ ] **Step 1: The probes**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/popup-align.mjs && pnpm build && node tests/e2e/probes/popup-first-paint.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: the alignment all `ok`; both first paints `ok` against Task 30's baseline; the reader's 24 files `ok`.

The first paint's margin is narrow. The pre-flight measured it in headless Chromium, ten runs a median: the toolbar's
median at 36, 36 and 40 ms for the popup as Part 3 left it, and at 44, 42 and 40 ms for this plan's, against a threshold
of 43.6 ms on a 36 ms baseline; the panel's at 48–54 ms either way. A `FAIL` is run twice more with nothing else
running, and the three medians go into Step 5's note for the controller, who decides; the threshold stays as Task 30
set it. Should the regression hold, the suspect is the view model drawing every menu's data before the first frame
(the language list's 179 rows among them).

- [ ] **Step 2: Look at every picture**

Open each file of `experiments/pdf-bilingual/out/popup/` at full size (they are 2x: the popup at 200 %), both themes and
both languages, beside round 6's `png/rows/` and round 4's `png/states/`. Look for: nothing clipped or overlapping; the
English foot on one row; a long value cut short with its chevron kept; a note's icon on its first line; the P0 id
readable on the brand row in both themes; the paused pair of equal widths, the brand first; every menu inside its
frame, the style menu above the foot. Write what differs from the prototype into the note of Step 5, with its reason.

- [ ] **Step 3: The browser suites**

Run: `pnpm e2e:popup && pnpm e2e && pnpm e2e:pdf && pnpm e2e:floating && pnpm e2e:a11y && pnpm e2e:layout && pnpm e2e:image && node experiments/pdf-bilingual/spikes/entries.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs`
Expected: each exits 0.

- [ ] **Step 4: A local review of the part**

A local Codex review of Part 4's commits: `/codex:adversarial-review --base <Part 3's last commit>` (the popover kept in
step with the state, and the checks' timing, are the part's contracts). Check each point against the code, a fixture or
a probe before adopting it; the adopted ones are commits of their own, and the declined ones are written down in the
note below with the reason.

- [ ] **Step 5: Note what Part 4 left**

Append to the end of this plan, under a heading `## Part 4: done`, one paragraph: the commits; what the alignment probe
and the first-paint probe measured (the two medians before and after); any name of Part 3's that differed from this
plan, and how the tasks met it; and what the parts after it must carry. Part 6: the retranslate cue offers 重新翻译
while ⌥T still restores (the popup puts the key's chip on 显示原文); the key doing the cue too is `shared/page-action.ts`'s,
for every door, and the reader's service menu reading the record (ruling 22). Part 7: UI.md's rows (S-P-03 replaced by
P0's words, §4's new states PW / PL / P0a–g / P6b / P8b / PR / PE, the cue's use of P13's pair without words of its own,
S-P-48 and S-P-83's deep links and 管理提示词…, S-P-53 as the pair's second button, S-P-90 said politely), that the popup
no longer uses `src/ui/{Menu,Segmented,Switch,Button,LucideIcon,BrandMark}` while the view model still reads
`styleTile` from `src/ui/appearance/tiles` (ruling 23: to be moved, not deleted), and that the gallery's `transform-gpu`
comment no longer holds (the menus are in the top layer).

- [ ] **Step 6: Commit the note**

Run: `git add experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part4-popup.md && node scripts/check-english.mjs`
Expected: it names this plan's file, since the record quotes the words the parts after it carry (重新翻译, 显示原文,
管理提示词…), with the count of its lines holding Chinese. In `scripts/english-allowlist.txt`, set this plan's entry to
that count, keeping its reason and adding `; +<the lines the record added>, Part 4's record quotes the popup's words the
parts after it carry`. Run `git add scripts/english-allowlist.txt && node scripts/check-english.mjs` again: exit 0.

```bash
git commit -m "docs(plan): Part 4's record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Part 4: done

Executed task by task (an implementer and a reviewer per task, fix rounds where a review asked, the controller's look at
the shots), 2026-09-27, in `.worktrees/redesign-popup` on `exp/ui-popup`, branched from 56d02f2d.

**Commits** (`56d02f2d..`): 2c9da571 the first-paint probe (30) · 545427bb it removes its profile (30's fix) · 91ebc041
P0's reading of a line, the entry checks shared (31) · 1d606fa9 the popup's state (32) · 87c64942 the view model (33) ·
df868560 the retranslate cue reads every hand-over, P0's entries greyed as P17's (33's fix) · 5e0af389 the menus (34) ·
0a922e28 a menu closed by Escape closes once, through its popover (34's fix) · 8e631e1d the popup drawn from round 6 (35)
· 55dfc5c9 P0 (36) · 0438c0c8 P0 says what it understood in a polite status, and takes the focus (36's fix) · 627cfda3
the browser suites on the new controls (37) · d2347a69 the placeholders probe too (37, the controller) · a42fb4ff the
popup suite and the alignment probe (38) · 80e8df56 and 047d3129 the reviews' parked minors · and this record.

**Checks** at 80e8df56 (and the fix at 047d3129 is a runtime guard only): the gate; the alignment probe all `ok` in both
themes and languages, at rest and hovered, and with the service, download, language, prompt and style menus open — no
item off its row's centre by more than 0.5 px, no edge but 12 and 24; `reader-pixels` 24 × ok; `reader-ui` 71 × ok;
`entries.mjs` ok; `pnpm e2e:popup` 20/20, `pnpm e2e` 71/71, `e2e:pdf` 26/26, `e2e:floating` 20/20, `e2e:a11y` 5/5,
`e2e:layout` 31/31, `e2e:image` 18/18, `e2e:placeholders` 14/14 shapes (Google, its default engine).

**The first paint.** Against Task 30's recorded baseline (toolbar 36, panel 52 ms) under the parallel parts' load, the
toolbar read 44.0 ms (a FAIL by 0.4 ms of the 43.6 threshold) and the panel 58.0 (ok). Interleaved A/B, the two builds
back to back with the other parts idle (ten-run medians per round): toolbar before 36 / 38 / 42, after 68 / 36 / 40
(68 the new build's first launch); panel before 52 / 52 / 46, after 54 / 44 / 48 — medians of the rounds 38 against 40
and 52 against 48, within the noise. No regression is confirmed; the definitive quiet measurement is Part 7's Task 102.
The menus' rows are drawn after the first frame (`usePainted`), so the language list is not in it.

**The look** (the shots in `experiments/pdf-bilingual/out/popup/`, 2x, beside round 6 and round 4): P0 with its lead
above the field (the design's order and popup-decisions, over round 6's shot, ruling 14), the PDF address's brand row
with its id readable in both themes; P9 / P13's pair of equal widths, the brand first, the key's chip on 重新翻译 only;
P17's two entries; the English foot on one row; long values cut with their chevron kept; the note's icon on its first
line; every menu inside its frame, the style menu above the foot — as the prototypes. Two decisions of the controller's,
for the maintainer's look in Part 7: P0's field takes the focus when P0 opens (the design does not say; P0's one purpose
is the field, as in the launchers the maintainer names as benchmarks); P0 draws the no-entry sentence as P17 does (a
note in the alert tone).

**Otherwise than planned:** the retranslate cue reads every hand-over in `demotions`, not the last (33's review); P0's
entries are greyed by `canStart` as P17's; a menu's `onClose` goes through its popover (the reader's `shut()` pattern);
P0's understanding is echoed in a hidden polite status, not a status role on its buttons; the probes open the gallery's
menus by clicking (StrictMode closes a menu a fixture starts open, in development only).

**The local review** (Codex, adversarial, `--base 56d02f2d`): one finding, declined — the popup awaits the refused-key
record before its first render (an unbounded read); the read is caught and runs beside `prepareFirstPaint`, whose
`getConfig()` is the same unbounded storage read, so it adds no failure mode; bounding the pages' first-paint reads is a
question for the pages' design, not this part.

**What the parts after it carry.** Part 6 finished before this record: the key ⌥T doing the retranslate cue too
(`shared/page-action.ts`, for every door) was not in its plan — Part 7 takes it; the reader's service menu reading the
record was Part 6's Task 74. Part 7: UI.md's rows (S-P-03 replaced by P0's words; §4's new states PW / PL / P0a–g / P6b /
P8b / PR / PE; the cue using P13's pair without words of its own; S-P-48 and S-P-83's deep links and 管理提示词…; S-P-53
as the pair's second button, 显示原文; S-P-90 said politely; P0's focus and its status); the popup no longer uses
`src/ui/{Menu,Segmented,Switch,Button,LucideIcon,BrandMark}` while the view model still reads `styleTile` from
`src/ui/appearance/tiles` (ruling 23: moved, not deleted); the gallery's `transform-gpu` comment no longer holds (the
menus are in the top layer); `tests/e2e/probes/align.mjs` reports nothing for a selector that matches nothing — make that
a failure before Part 7's verification; the first paint's definitive measurement (Task 102).
