# The extension's interface, redesigned — Part 6: the floating button and the controls on arXiv's pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the floating button, the figure viewer's control and bar, and the failed block's retry the family's
material — the roles of `src/shared/tokens.ts`, the shared menu's and tooltip's looks — with the button following the
extension's appearance and the two controls on the paper following the page; keep every shape, place and timing the
button has; make the PDF reader's service menu say a refused key as the popup does; and shoot the button and the viewer
before and after, in both themes, for the maintainer.

**Architecture:** The content scripts already build their shadow sheets as strings; each now begins with
`tokenSheet('host')`, the roles as `--axt-` variables on `:host`, light or dark by a mark on an element **inside** the
shadow root (`data-axt-theme`). The floating button's dock carries the extension's `theme`, which reaches arXiv's pages
through the entry settings the background already answers (`axt:entry-settings`, now with `theme`) and is followed
live; the viewer marks its control and its dialog from the page's own ground, as it reads it today; the retry needs one
role and takes it by `light-dark()` over the colour scheme it inherits from arXiv's page. The reader's service menu
reads the refused-key record through Part 3's `useRejected` and hands it to `serviceItems`. A probe shoots the button and the
viewer from a build of Part 3's last commit and from this part's, and measures that no part of the button moved.

**Tech Stack:** WXT 0.21, React 19 (the reader only), TypeScript, Vitest + happy-dom, Playwright (Chromium).

**Spec:** `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (the design): §3, §7, §2.2, and
§4 / §5.2 for the refused key. Section references below (§n) are the design's. **Main plan:**
`2026-09-26-extension-ui-redesign.md` beside this file. **Rulings:**
`.superpowers/sdd/2026-09-26-extension-ui-redesign/plan-rulings.md` (22: the reader's service menu is this part's).
**Part 3's names:** "## What Parts 4 and 5 use" in `2026-09-26-extension-ui-redesign-part3-controls.md` — this part
uses `tests/styles/css-rules.ts` (`sheet`, `rules`, `declarations`, `ruleOf`), the role `tip-shadow` (Part 3's Task 21:
the tooltip's shadow, its value unchanged, which `.tip` names), `useRejected(): readonly string[]`
(`src/ui/use-rejected.ts`, Part 3: subscribed first, then read) and the shared rules of `src/styles/controls.css`
(`.tip`, `.pop`, `.pop .item`, `.pop .item[data-active]`). No prototype: the reference is today's button (`src/core/floating/button.ts`'s sheet) for every geometry and
timing, `controls.css` for the tooltip and the menu, and the tokens for every colour.

## The controller's rulings this plan builds

The five questions of the draft, ruled (the main plan, ce960723):

| Ruling | What | Task |
|---|---|---|
| 1 | The theme's mark is `data-axt-theme` on an element **inside** the shadow root, not `data-theme` on the host: hard rule 2 (and `tests/entry/floating-button.test.ts` fails a sheet naming `[data-theme`); arXiv's theme sheet (`/static/browse/0.3.4/css/arxiv-html-papers-theme-20260807.css`, read 2026-09-27) styles **any** element with `[data-theme=dark]`; and `restore()` (`src/core/renderer/page.ts`) strips every `data-axt-*` of every element of the document, our hosts' among them. The host sheet's selectors change (nothing uses them yet), and the design's §2.2 and §3 are amended | 71 |
| 2 | The failed block's hint line (`src/styles/modes.css`) takes `danger` too, by the page as the retry | 73 |
| 3 | The tooltip's shadow is a role, `tip-shadow`, added by Part 3 (its Task 21), which `.tip` names; the button's tooltip names `--axt-tip-shadow`: no raw colour | 72 |
| 4 | `useRejected` is Part 3's, written once at `src/ui/use-rejected.ts`; the reader imports it | 74 |
| 5 | The viewer's dialog frame (its 12 px radius, its shadow, the 50 % scrim with its blur, the paper's ground) stays as it is: §7 names the control and the bar only | 73 |

### Files this part touches outside `src/core/floating/`, `src/core/viewer/`, `src/core/renderer/failed.ts`, the content scripts and the reader

| File | Task | Also touched by |
|---|---|---|
| `src/shared/tokens.ts`, `tests/shared/tokens.test.ts` (the host sheet's selectors; `tokens.css` does not change) | 71 | — (Part 3 before) |
| `src/shared/entry-settings.ts`, `src/shared/messages.ts` (a comment), `src/shared/floating.ts` | 71, 72 | — |
| `src/entrypoints/background/handlers.ts` (the `axt:entry-settings` answer), `tests/background/handlers.test.ts` (its describe) | 71 | Part 5: the `axt:translate` entry and its tests — other hunks |
| `tests/shared/entry-settings.test.ts`, `tests/shared/floating.test.ts`, `tests/entry/floating-button.test.ts` | 71, 72 | — |
| `src/styles/modes.css` (the failed block's hint line), `tests/viewer/viewer.test.ts`, `tests/renderer/failed.test.ts`, `tests/styles/no-has.test.ts` | 73 | — |
| `tests/pdf-reader/ui/menus.test.ts` | 74 | — |
| `tests/e2e/probes/floating-shots.mjs` (new) | 70 | — |
| `tests/e2e/floating-button.mjs` (a new block before its end) | 72, 73 | — |
| `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (§2.2, §3 wording) | 71 | Part 5 amends §6.2 |
| `src/pdf-reader/ui/Menus.tsx` (`ServiceMenu`'s first lines, an import) | 74 | Part 5: line 77, `openOptions('services')` — ten lines below this part's hunk |
| this plan (the record) | 75 | — |

None of Part 4's files (the popup, `src/entrypoints/popup/**`, `S`, `tests/popup`) or Part 5's (the settings page,
`src/entrypoints/options/**`, `O`, `tests/options`) is touched. No token is added; no locale pack changes (no word is
new); no allowlist entry changes.

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
- Commits are local on `exp/extension-ui-redesign`; the stage goes out as one pull request when the last part is done
  (never `main`; merge commits). Files are added by name, never `git add -A`. Never commit
  the untracked `experiments/pdf-bilingual/spikes/geometry-lock*.mjs` / `prompt-ablation.mjs` (another session's
  work). The gallery's break harness that stood beside them was removed on 2026-09-27: a task that changes
  `src/entrypoints/gallery/main.tsx` commits it with its own files. Never run `git reset --hard`,
  `git checkout -- <path>`, `git restore`, `git clean` or `git stash`: rewind with `--mixed` / `--soft`, and put back
  only files named, by their content.
- Every commit message is `type(scope): summary` and ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Part 6's own:

- **Where:** the worktree `.worktrees/redesign-floating` on `exp/ui-floating`, which the controller makes from Part 3's
  last commit. Every command of this part runs in it. Its commits stay there; the controller merges the branch into
  `exp/extension-ui-redesign` with a merge commit, after Parts 4 and 5, **once the maintainer has looked at the before
  and after shots** (§7).
- **The lane:** the table above. A file Part 5 also touches is changed in its own hunk only, so the merge keeps both.
  The abstract page's line (`src/core/abstract/link.ts`) is not touched: it keeps arXiv's own look, being one of
  arXiv's links (§7).
- **The button keeps its shape, its place, its behaviour and its timings** (§7): no length, delay, duration or curve of
  its sheet or its script changes, but the menu's and the tooltips' own looks, which are the shared ones. The probe
  measures every other part's box before and after, and they must be the same.
- **Every colour a role** of the host token sheet, but the mark's own (the disc's shadow and the tick's white,
  `mark.ts`); a test lists the literals left in the button's sheet. `modes.css`, a static sheet injected into arXiv's
  pages with no token sheet beside it, writes `danger`'s two values for the hint line, held to `tokens.ts` by a test.
- **No token is added.** A role this part needs is raised with the controller.
- **No CJK in any line this part writes:** controls are found by class, role and data attribute; words come from the
  packs (`S.service.llm_rejected`). No entry of `scripts/english-allowlist.txt` changes. Each commit whose files hold
  lines with CJK (the design, `floating-button.mjs`, `failed.ts`, `failed.test.ts`, `menus.test.ts`) runs
  `node scripts/check-english.mjs` after its `git add`; an entry the gate names goes into the same commit, with a
  one-line English reason.
- **New files are `git add`ed before `pnpm lint`:** the English and the boundary gates read git's index.
- **Documents:** UI.md and DESIGN.md are Part 7's (§13; DESIGN §4.0c, the button's material). This part amends the
  design's §2.2 and §3 (Task 71) and appends its record to this plan.

## Review Focus

- **arXiv's own theme attribute.** arXiv's theme sheet styles any element carrying `[data-theme=dark]`, and a host
  marked so would take the page's variables while its own sheet answered arXiv's attribute. The mark is
  `data-axt-theme`, inside the shadow root. Pinned in Task 71 (the host sheet names no `data-theme` and no mark on
  `:host`) and Task 72 (the host carries its class alone; every attribute the button's sheet names is `data-axt-`).
- **The original shown again under a dark button.** Restoring the page strips every `data-axt-*` of the document's own
  elements; a mark on a host would drop the button to the system's light or dark until the settings next changed, and
  the viewer's control to its sheet's default until the next figure. Pinned in Task 72 and Task 73: each mark survives `restore(document)`.
- **The extension dark over a light paper, and the reverse.** The button follows the extension; the viewer's control and
  the retry follow the paper. Each must keep to its own source when the two disagree. Pinned in Task 72 (a real browser:
  the button dark on arXiv's light theme, light on its dark one, the system's when the appearance is) and Task 73 (a
  real browser: the viewer's control the other way; the retry's two colours chosen by the page's colour scheme).
- **A page answered by an earlier build's background.** For a moment after an update the worker answering
  `axt:entry-settings` may be the old one, with no `theme`: the button must follow the system, never carry
  `data-axt-theme="undefined"`. Pinned in Task 71 (an answer without a theme, or with an unknown one, is the system's)
  and Task 72 (`retheme` of anything but light or dark removes the mark).
- **A key refused or made good while the reader is open.** The reader is often the one tab left open while the
  settings page connects a service again: its service menu must follow the record as it changes, not only as it was
  when the reader opened (the hook's own ordering — a refusal heard before its first read — is Part 3's to pin). Pinned
  in Task 74 (the menu, open, says the refusal and then the model once the mark is cleared).

## Where the sources differ, and what this plan draws

1. **The mark and its place** (§3's wording): ruling 1. The host sheet's blocks become `:host, [data-axt-theme="light"]`
   (light), `@media (prefers-color-scheme: dark) { :host }` (the system's dark reaches the host alone, so an element
   marked light inside stays light) and `[data-axt-theme="dark"]`. The pages' sheet (`tokens.css`) does not change.
2. **The host sheet's size** (§2.2: "a few hundred bytes"): `tokenSheet('host')` is 5.9 KB (5 905 bytes: the ramp and the roles
   in three blocks). Three shadow roots carry it (the button's, and the viewer's dialog's and control's, which share one
   text). **The retry does not**: there is a shadow root per failed block, and it needs one role. **Nor does the hint
   line** (ruling 2): `modes.css` is a static sheet on arXiv's page, where no token sheet stands; it writes `danger`'s
   two values, and a test holds them to `tokens.ts`.
3. **The retry by the page** is `light-dark()` over the colour scheme the widget inherits: arXiv's `ar5iv.0.9.1.min.css`
   sets `:root { color-scheme: light dark }`, `:root[data-theme=dark] { color-scheme: dark only }` and `light only` for
   light and sepia (read 2026-09-27). No script, no read of the page's style while a translation is written (the
   viewer's way would be a style read per failed block in the renderer's hot path), and arXiv's own switch is followed
   at once. Checked in Chromium 153 while drafting: `light only` and `normal` give `oklch(0.545 0.17 28)`, `dark only`
   `oklch(0.69 0.15 28)`, and `color-mix()` inside `light-dark()` resolves (Task 73 runs the check again). The block's
   hint line is the same construct at 60 %, on the block itself, which is the page's element.
4. **The viewer by the page** keeps today's way (the page's ground, read when its control first shows over a figure):
   it needs the paper's colour for the dialog anyway (§3: "as they do today").
5. **The hairline keeps today's width**, 1 px, in `chrome-line`: the button's shape rests on it (the disc sits 3 px in
   from the edge through it). `float-shadow`'s own 0.5 px ring lies outside it, as §7 asks for both.
6. **The glyphs' roles**, the family's nearest to Read Frog's greys: the round buttons' glyphs `ink-2`, lit by `fill`
   (the reader's toolbar buttons: `ink-2`, `fill` on hover); the two corner controls `ink-3`, `ink` on hover (the
   reader's hover goes to `ink`).
7. **The menu and the tooltips take the shared looks, not their places or motion.** From `.pop` / `.item`: padding 4,
   radius 12, `chrome`, `ink`, `pop-shadow`, 13 px, rows of 30 px at 0 10 0 8, gap 8, radius 8, `fill` under the
   pointer and the keyboard's row ringed inside (`-2`, as the reader's keyboard row); the width stays the words' (not
   `.pop`'s 220 px minimum: two short items beside the button). From `.tip`: 5 × 8 in, radius 6, `tip-bg` / `tip-ink`,
   `12px/1.2 var(--font)`, `tip-shadow` (ruling 3). The places (beside the button) and the one motion (`--axt-fade-in`,
   `--axt-grow-in`, `--axt-exit`, `axt-pop-in`) stay the button's (§7: "its timings stay").
8. **The font** of the dock becomes the family's (`--axt-font`) instead of `ui-sans-serif, system-ui`: it is the
   tooltips' and the menu's type.
9. **The literals kept:** the disc's shadow (`rgb(0 0 0 / 0.06)`, lit `0.16`: the logo's export) and the tick's ring and
   glyph (`#fff`: the disc's white, `mark.ts`) are the mark's, white in both themes as the logo is.
10. **The viewer's focus ring keeps its place** (2 px, inside, `-2`: it sits on the figure's corner and in a bar 2 px in)
    in `focus`; the button's keeps its (2 px, outside, `2`) in `focus`.
11. **The reader's menu:** `ServiceMenu`'s second `serviceItems(config, state.pack)` call, in `onPick`, only asks whether
    a row has an action, which the record does not change; it is left as it is, also because Part 5 changes the line
    after it.
12. **The panel's contents** are the old popup in both shot sets (this worktree has no Part 4); what changes here is the
    frame. The record says so, and how to shoot again after the merge.

## Files

| File | Task | Responsibility |
|---|---|---|
| `tests/e2e/probes/floating-shots.mjs` (new) | 70 | The before and after shots, the boxes measured and compared, a page pairing them |
| `src/shared/tokens.ts`, `tests/shared/tokens.test.ts` | 71 | The host sheet marked inside its shadow root |
| `src/shared/entry-settings.ts`, `src/shared/messages.ts`, `src/entrypoints/background/handlers.ts`, `tests/shared/entry-settings.test.ts`, `tests/background/handlers.test.ts` | 71 | `theme` reaches arXiv's pages |
| `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` | 71 | §2.2 and §3 as built |
| `src/core/floating/button.ts`, `src/shared/floating.ts`, `tests/entry/floating-button.test.ts`, `tests/shared/floating.test.ts`, `tests/e2e/floating-button.mjs` | 72 | The button's material and appearance |
| `src/core/viewer/index.ts`, `src/core/renderer/failed.ts`, `src/styles/modes.css`, `tests/viewer/viewer.test.ts`, `tests/renderer/failed.test.ts`, `tests/styles/no-has.test.ts`, `tests/e2e/floating-button.mjs` | 73 | The two controls on the paper, and the failed block's line |
| `src/pdf-reader/ui/Menus.tsx`, `tests/pdf-reader/ui/menus.test.ts` | 74 | The reader's service menu says a refused key |
| this plan | 75 | Part 6's record |

---

# Part 6: the floating button and the controls on arXiv's pages

### Task 70: the worktree, the reader's baseline, and the shots from before

**Files:**
- Create: `tests/e2e/probes/floating-shots.mjs`

**Interfaces:**
- Consumes: the build (`.output/chrome-mv3`, or `AXT_EXT_DIR`); the network (arXiv's full text of `1706.03762`).
- Produces: `node tests/e2e/probes/floating-shots.mjs <before|after>` → `experiments/pdf-bilingual/out/floating/<label>/`
  with 18 shots (`{light,dark}-{rest,tick,lit,open,menu,panel,viewer-control,viewer-dialog,viewer-bar}.png`, at twice
  the pixels) and `measures.json`; with both sets there, it prints `same` / `differs` for every part of the button in
  every shot and writes `experiments/pdf-bilingual/out/floating/index.html`, the pairs side by side. Also
  `experiments/pdf-bilingual/out/floating/build-before/` (Part 3's build, kept) and
  `experiments/pdf-bilingual/out/reader-pixels/baseline/`. Nothing under `out/` is committed
  (`experiments/pdf-bilingual/.gitignore` holds `out/`).

- [ ] **Step 1: Check the worktree**

Run: `cd /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/redesign-floating && git branch --show-current && git log --oneline -1 && git status --short`
Expected: `exp/ui-floating`; the commit is Part 3's last (`docs(ui): Part 3's record`, or the one the dispatch names);
no changes. Otherwise stop and report.

- [ ] **Step 2: Install, and bring the reader's demo papers in**

The reader's pixel probe opens a demo paper made on this machine and not in the repository; the main worktree has it.

```bash
cd /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/redesign-floating
pnpm install
mkdir -p experiments/pdf-bilingual/poc-reader
cp -R /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/exp-pdf/experiments/pdf-bilingual/poc-reader/papers experiments/pdf-bilingual/poc-reader/
```

Expected: `pnpm install` exits 0; `experiments/pdf-bilingual/poc-reader/papers/2608.02163` exists.

- [ ] **Step 3: Write the probe**

`tests/e2e/probes/floating-shots.mjs`:

```js
// The floating button and the figure viewer, shot for the maintainer before and after the redesign's Part 6 (its design,
// §7): the button at rest, with the tick of a translated page, lit, open, with its close menu and with its control
// panel; the viewer's control over a figure, its dialog and the dialog's bar — each in light and in dark, at twice the
// pixels (the 200 % look). A theme is set three ways at once, so that a build from before the part (the button following
// the system's colour scheme) and one from after it (following the extension's appearance) are shot in the same one:
// the system's scheme, the extension's `theme`, and arXiv's own theme for the paper under them. Where each part of the
// button stands is written beside the shots (measures.json); with both sets there, the two are compared part by part,
// and a page shows them side by side (index.html). The setup is floating-button.mjs's. Needs the network (arXiv).
//   pnpm build && node tests/e2e/probes/floating-shots.mjs <before|after>
// Environment: AXT_EXT_DIR points at another build (Part 6 keeps Part 3's in out/floating/build-before); AXT_PAPER
// another paper; AXT_CHROME another Chrome.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const label = process.argv[2]
if (label !== 'before' && label !== 'after') throw new Error('usage: node tests/e2e/probes/floating-shots.mjs <before|after>')
const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/floating/', import.meta.url))
const PROFILE = `${E2E}.profile-floating-shots`
const PAPER = process.env.AXT_PAPER ?? '1706.03762'
const [WIDTH, HEIGHT] = [1280, 860]
const STILL = { animations: 'disabled', caret: 'hide' }
const dir = join(OUT, label)
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
})
context.setDefaultNavigationTimeout(90_000)
const page = context.pages()[0] ?? (await context.newPage())
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]

/** The extension's appearance, written into its configuration once the extension has written one */
const setTheme = theme => worker.evaluate(async theme => {
  for (let i = 0; i < 100; i++) {
    const { config } = await chrome.storage.local.get('config')
    if (config) return chrome.storage.local.set({ config: { ...config, theme } })
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('no configuration after 10 s')
}, theme)
/** The centre of a part of the button, from inside its shadow root; null while it is not there or has no box */
const partAt = selector => page.evaluate(selector => {
  const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector(selector)?.getBoundingClientRect()
  return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
}, selector)
/** Every part of the button, in CSS pixels to a tenth, and whether it is lit and open: what must not move (§7) */
const measure = () => page.evaluate(() => {
  const root = document.querySelector('.axt-floating').shadowRoot
  const dock = root.querySelector('.axt-fb-dock')
  const box = element => { const r = element.getBoundingClientRect(); return r.width > 0 ? [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10) : null }
  const PARTS = ['.axt-fb-main', '.axt-fb-disc', '.axt-fb-panel', '.axt-fb-settings', '.axt-fb-options', '.axt-fb-lock', '.axt-fb-panel-box', '.axt-fb-menu', '.axt-fb-menu button', '.axt-fb-main .axt-fb-tip']
  return { state: [dock.dataset.axtLit, dock.dataset.axtExpanded], ...Object.fromEntries(PARTS.map(selector => [selector, [...root.querySelectorAll(selector)].map(box)])) }
})

const measures = {}
const missing = []
let shots = 0
for (const theme of ['light', 'dark']) {
  await setTheme(theme)
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
  await page.evaluate(value => localStorage.setItem('ar5iv_theme', value), theme)
  await page.reload({ waitUntil: 'load' })
  await sleep(5000)
  const main = await partAt('.axt-fb-main')
  if (!main) { missing.push(`${theme}: no floating button`); continue }
  /** the button and everything that comes out of it, beside the window's right edge */
  const near = { x: WIDTH - 360, y: Math.max(0, Math.round(main.y - 150)), width: 360, height: 300 }
  /** the control panel, the right of the window */
  const side = { x: WIDTH - 460, y: 0, width: 460, height: HEIGHT }
  const shot = async (name, clip, settle = 300, measured = true) => {
    await sleep(settle)
    // Measured before the capture: in `lit` the 400 ms dwell may end while the screenshot is taken
    if (measured) measures[`${theme}-${name}`] = await measure()
    await page.screenshot({ path: join(dir, `${theme}-${name}.png`), ...(clip ? { clip } : {}), ...STILL })
    shots++
  }
  /** The tick of a translated page, set on the dock for a shot: a translation is the network's, the tick is what is looked at */
  const tick = value => page.evaluate(value => { document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-dock').dataset.axtActive = value }, value)
  await page.mouse.move(640, 10)
  await sleep(700)
  await shot('rest', near)
  await tick('yes')
  await shot('tick', near)
  await tick('no')
  // Lit: the pointer on it, shot before the 400 ms dwell opens it (reduced motion: the light-up is instant)
  await page.mouse.move(main.x, main.y, { steps: 3 })
  await shot('lit', near, 0)
  await sleep(700)
  await shot('open', near)
  // Each of the two closed by a press on the paper, as a reader closes it: a key would leave the keyboard's focus in the
  // dock, which holds it open
  const close = await partAt('.axt-fb-options')
  if (close) {
    await page.mouse.click(close.x, close.y)
    await shot('menu', near)
    await page.mouse.click(640, 430)
  } else missing.push(`${theme}: no close control`)
  await page.mouse.move(main.x, main.y, { steps: 3 })
  await sleep(700)
  const panel = await partAt('.axt-fb-panel')
  if (panel) {
    await page.mouse.click(panel.x, panel.y)
    await shot('panel', side, 2500)
    await page.mouse.click(640, 430)
  } else missing.push(`${theme}: no panel button`)
  await page.mouse.move(640, 10)
  await sleep(700)
  // The figure viewer over the paper's first figure large enough for it
  const figure = await page.evaluate(() => {
    const image = [...document.querySelectorAll('.ltx_figure img')].find(i => i.getBoundingClientRect().width >= 160)
    if (!image) return null
    image.scrollIntoView({ block: 'center' })
    const r = image.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.right, top: r.top }
  })
  if (!figure) { missing.push(`${theme}: no figure`); continue }
  await page.mouse.move(figure.x, figure.y, { steps: 4 })
  await shot('viewer-control', { x: Math.max(0, Math.round(figure.right - 220)), y: Math.max(0, Math.round(figure.top - 20)), width: 240, height: 120 }, 500, false)
  const control = await page.evaluate(() => {
    const r = document.querySelector('.axt-viewer-spot')?.shadowRoot?.querySelector('.axt-viewer-open')?.getBoundingClientRect()
    return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (!control) { missing.push(`${theme}: no viewer control`); continue }
  await page.mouse.click(control.x, control.y)
  await shot('viewer-dialog', null, 700, false)
  const bar = await page.evaluate(() => {
    const r = document.querySelector('.axt-viewer')?.shadowRoot?.querySelector('.axt-viewer-bar')?.getBoundingClientRect()
    return r && r.width > 0 ? { x: Math.max(0, Math.round(r.left - 24)), y: Math.max(0, Math.round(r.top - 24)), width: Math.round(r.width + 48), height: Math.round(r.height + 48) } : null
  })
  if (bar) await shot('viewer-bar', bar, 0, false)
  else missing.push(`${theme}: no viewer bar`)
  await page.keyboard.press('Escape')
}
await context.close()
writeFileSync(join(dir, 'measures.json'), JSON.stringify(measures, null, 1))
console.log(`${shots} shots in ${dir}`)
for (const line of missing) console.log(`MISSING ${line}`)

// With both sets there: every part of the button compared, shot by shot, and a page pairing the shots
const other = join(OUT, label === 'before' ? 'after' : 'before', 'measures.json')
if (existsSync(other)) {
  const [was, is] = label === 'before' ? [measures, JSON.parse(readFileSync(other, 'utf8'))] : [JSON.parse(readFileSync(other, 'utf8')), measures]
  for (const [name, parts] of Object.entries(was)) {
    for (const [part, boxes] of Object.entries(parts)) {
      const now = is[name]?.[part]
      const same = JSON.stringify(boxes) === JSON.stringify(now)
      console.log(`${same ? 'same   ' : 'differs'} ${name} ${part}${same ? '' : ` — ${JSON.stringify(boxes)} → ${JSON.stringify(now)}`}`)
    }
  }
  const names = readdirSync(join(OUT, 'before')).filter(n => n.endsWith('.png')).sort()
  writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Floating button, before and after</title>
<style>body{font:13px system-ui;margin:24px;background:#8a8a8a}figure{margin:0 0 32px}figcaption{margin:0 0 8px;font-weight:600}div{display:flex;gap:16px;align-items:flex-start}img{max-width:46vw}</style>
${names.map(n => `<figure><figcaption>${n}: before, after</figcaption><div><img src="before/${n}" alt="before"><img src="after/${n}" alt="after"></div></figure>`).join('\n')}\n`)
  console.log(`side by side: ${join(OUT, 'index.html')}`)
}
process.exit(missing.length ? 1 : 0)
```

- [ ] **Step 4: Record the reader's baseline, and keep Part 3's build**

Run:

```bash
git add tests/e2e/probes/floating-shots.mjs
pnpm build
node experiments/pdf-bilingual/spikes/reader-pixels.mjs --baseline && node experiments/pdf-bilingual/spikes/reader-pixels.mjs
rm -rf experiments/pdf-bilingual/out/floating && mkdir -p experiments/pdf-bilingual/out/floating
cp -R .output/chrome-mv3 experiments/pdf-bilingual/out/floating/build-before
```

Expected: `baseline recorded: 24 files in …`, then 24 lines of `ok`; exit 0; `out/floating/build-before/manifest.json`
exists.

- [ ] **Step 5: Shoot the button and the viewer as Part 3 left them**

Run: `AXT_EXT_DIR="$PWD/experiments/pdf-bilingual/out/floating/build-before" node tests/e2e/probes/floating-shots.mjs before`
Expected: `18 shots in …/out/floating/before`, no `MISSING` line, exit 0 (no comparison yet: there is no `after`).
Open the 18 files: the dark set shows the button dark (the old build follows the emulated system) on arXiv's dark
page, the `lit` shot has the main button lit and nothing else out, the `menu` shot the two items, the `panel` shot the
popup framed beside the button. A shot that shows something else (the dwell already open in `lit`, a menu still
growing) is a capture to fix before going on: every comparison of the part rests on these.

- [ ] **Step 6: The suites the part must keep passing, on the build as it is**

Run: `pnpm e2e:floating && pnpm e2e:pdf`
Expected: every line `PASS`, exit 0. They reach arXiv: a failure here is the network's or arXiv's, not this part's —
run once more, and note in the task's report what failed and whether it passed the second time.

- [ ] **Step 7: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add tests/e2e/probes/floating-shots.mjs
git commit -m "test(e2e): shoot the floating button and the figure viewer, light and dark, before and after

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 71: the host sheet marked inside its shadow root, and the extension's appearance on arXiv's pages

**Files:**
- Modify: `src/shared/tokens.ts` (`SELECTORS` and its comment)
- Modify: `src/shared/entry-settings.ts` (`EntrySettings.theme`, the default, the answer's reading)
- Modify: `src/shared/messages.ts` (the comment of `'axt:entry-settings'`)
- Modify: `src/entrypoints/background/handlers.ts` (the `'axt:entry-settings'` answer)
- Modify: `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (§2.2, §3)
- Test: `tests/shared/tokens.test.ts`, `tests/shared/entry-settings.test.ts`, `tests/background/handlers.test.ts`

**Interfaces:**
- Consumes: `Config['theme']: 'system' | 'light' | 'dark'` (Part 2).
- Produces:
  - `tokenSheet('host')`: light on `:host, [data-axt-theme="light"]`; the system's dark on `:host` inside
    `@media (prefers-color-scheme: dark)`; dark on `[data-axt-theme="dark"]`; the constants on `:host`. An element inside
    a shadow root marked `data-axt-theme="light" | "dark"` resolves every role in that theme; unmarked, it follows the
    system's. `tokenSheet('page')` and `src/styles/tokens.css` are unchanged.
  - `EntrySettings.theme: 'system' | 'light' | 'dark'` (`DEFAULT_ENTRY_SETTINGS.theme = 'system'`); an answer without
    it, or with any other value, is read as `'system'`. The background answers `theme: config.theme`.

- [ ] **Step 1: Write the failing tests**

In `tests/shared/tokens.test.ts`, replace the whole test that starts
`it('writes a shadow root\'s sheet on :host, every variable it defines or names prefixed --axt- (hard rule 2)'` with:

```ts
  it('writes a shadow root\'s sheet on :host, light or dark by a mark inside the shadow root, every variable and mark prefixed (hard rule 2)', () => {
    const css = tokenSheet('host')
    expect(css).toContain(':host,\n[data-axt-theme="light"] {\n  color-scheme: light;')
    // the system's dark reaches the host alone, so that an element marked light inside it stays light
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :host {\n    color-scheme: dark;')
    expect(css).toContain('\n[data-axt-theme="dark"] {\n  color-scheme: dark;')
    // arXiv's own sheet styles any [data-theme=dark], and a restore of the page strips every data-axt-* of the
    // document's elements, a host's among them: the sheet answers its own mark, and never one on the host
    expect(css).not.toContain('[data-theme')
    expect(css).not.toContain(':host([')
    const defined = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]!)
    expect(defined.length).toBeGreaterThan(40)
    expect(defined.filter(n => !n.startsWith('--axt-'))).toEqual([])
    expect(css).not.toMatch(/var\(--(?!axt-)/)
  })
```

In `tests/shared/entry-settings.test.ts`, replace the line that starts `const SETTINGS: EntrySettings = {` with:

```ts
const SETTINGS: EntrySettings = { uiLanguage: 'en', openIn: 'same-tab', zoom: 1.25, pdfReader: false, theme: 'dark', floating: { enabled: false, side: 'left', position: 0.3, locked: true } }
```

and after the test that starts `it('an answer without the PDF reader\'s switch, from a background of an earlier build`
add:

```ts
  it('an answer without the extension\'s appearance, from a background of an earlier build, or with one this build does not know, follows the system\'s (the redesign\'s design, §3)', async () => {
    const { theme: _, ...earlier } = SETTINGS
    for (const answer of [earlier, { ...SETTINGS, theme: 'sepia' }]) {
      wire.answers = [answer]
      const { watchEntrySettings } = await fresh()
      expect(await watchEntrySettings(() => undefined)).toEqual({ ...SETTINGS, theme: 'system' })
    }
  })
```

In `tests/background/handlers.test.ts`, inside `describe('axt:entry-settings', …)`, in the test that starts
`it('answers what a page needs of the configuration, the floating button\'s state and the tab\'s zoom'`, replace

```ts
      await expect(send({ type: 'axt:entry-settings' })).resolves.toEqual({ uiLanguage: 'ja', openIn: 'new-tab', zoom: 1.25, pdfReader: true, floating })
```

with

```ts
      await expect(send({ type: 'axt:entry-settings' })).resolves.toEqual({ uiLanguage: 'ja', openIn: 'new-tab', zoom: 1.25, pdfReader: true, theme: 'system', floating })
```

and after the test that starts `it('answers the PDF reader\'s switch, for the PDF page` add:

```ts
    it('answers the extension\'s appearance, for the floating button (the redesign\'s design, §3)', async () => {
      const dark = { ...config, theme: 'dark' as const }
      const { send } = harness({ getConfig: async () => dark, getFloatingEntry: async () => floating, zoomOf: vi.fn(async () => 1) })
      await expect(send({ type: 'axt:entry-settings' })).resolves.toMatchObject({ theme: 'dark' })
    })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/shared/tokens.test.ts tests/shared/entry-settings.test.ts tests/background/handlers.test.ts`
Expected: FAIL — the host sheet still holds `:host([data-theme="light"])`; the earlier build's answer keeps no theme
(`theme: undefined`, not `'system'`); the handler's answer has no `theme`.

- [ ] **Step 3: The host sheet's mark**

In `src/shared/tokens.ts`, replace

```ts
/** Where each block goes: the extension's pages on their root, a shadow root on its host. Roles sit in each theme's
 *  block, beside the ramp, so that an element that sets `data-theme` (the gallery's dark half) resolves them anew */
const SELECTORS = {
  page: { light: ':root,\n[data-theme="light"]', system: ':root:not([data-theme="light"])', dark: '[data-theme="dark"]', constants: ':root' },
  host: { light: ':host,\n:host([data-theme="light"])', system: ':host(:not([data-theme="light"]))', dark: ':host([data-theme="dark"])', constants: ':host' },
} as const
```

with

```ts
/** Where each block goes: an extension page on its root, marked light or dark there (`data-theme`); a shadow root on
 *  arXiv's pages on its host, marked on an element inside it (`data-axt-theme`). Not on the host: the prefix is ours on
 *  arXiv's pages (hard rule 2), arXiv's own sheet styles any `[data-theme=dark]` it meets, and restoring a translated
 *  page strips every `data-axt-*` of the document's own elements, a host's among them, while a shadow root's are out of
 *  its reach. The system's dark reaches the host alone, so that an element marked light inside it stays light. Roles
 *  sit in each theme's block, beside the ramp, so that the element carrying the mark (the gallery's dark half, a shadow
 *  root's marked element) resolves them anew */
const SELECTORS = {
  page: { light: ':root,\n[data-theme="light"]', system: ':root:not([data-theme="light"])', dark: '[data-theme="dark"]', constants: ':root' },
  host: { light: ':host,\n[data-axt-theme="light"]', system: ':host', dark: '[data-axt-theme="dark"]', constants: ':host' },
} as const
```

Run: `pnpm tokens && git diff --stat src/styles/tokens.css`
Expected: no change to `tokens.css` (the pages' selectors are the same).

- [ ] **Step 4: The extension's appearance in the entry settings**

In `src/shared/entry-settings.ts`, in `interface EntrySettings`, after the `pdfReader: boolean` line add:

```ts
  /** The extension's appearance (config `theme`, the redesign's design, §3): the floating button draws in it */
  theme: 'system' | 'light' | 'dark'
```

replace the line `export const DEFAULT_ENTRY_SETTINGS: EntrySettings = { uiLanguage: 'auto', openIn: 'new-tab', zoom: 1, pdfReader: true, floating: DEFAULT_FLOATING_ENTRY }` with:

```ts
export const DEFAULT_ENTRY_SETTINGS: EntrySettings = { uiLanguage: 'auto', openIn: 'new-tab', zoom: 1, pdfReader: true, theme: 'system', floating: DEFAULT_FLOATING_ENTRY }
/** The appearances this build knows: any other answer is the system's */
const THEMES: readonly unknown[] = ['system', 'light', 'dark']
```

and in `ask`, replace

```ts
      // a background of an earlier build answers no PDF reader's switch: the reader stays on, its default
      const full = { ...answer, pdfReader: typeof answer.pdfReader === 'boolean' ? answer.pdfReader : true }
```

with

```ts
      // a background of an earlier build answers no PDF reader's switch and no appearance: the reader stays on, and
      // the button follows the system's, their defaults
      const full = { ...answer, pdfReader: typeof answer.pdfReader === 'boolean' ? answer.pdfReader : true, theme: THEMES.includes(answer.theme) ? answer.theme : 'system' as const }
```

In `src/shared/messages.ts`, replace the comment above `'axt:entry-settings'`

```ts
  /**
   * content / options → background: what a page needs of the settings, read once and validated by the background
   * (shared/entry-settings.ts): the interface language, where a translation opens, this tab's zoom, the floating
   * button's state
   */
```

with

```ts
  /**
   * content / options → background: what a page needs of the settings, read once and validated by the background
   * (shared/entry-settings.ts): the interface language, where a translation opens, this tab's zoom, the PDF reader's
   * switch, the extension's appearance, the floating button's state
   */
```

In `src/entrypoints/background/handlers.ts`, in the `'axt:entry-settings'` entry, replace

```ts
    ]).then(([config, floating, zoom]) => ({ uiLanguage: config.uiLanguage, openIn: config.reading.openIn, zoom, pdfReader: config.pdfReader.enabled, floating })),
```

with

```ts
    ]).then(([config, floating, zoom]) => ({ uiLanguage: config.uiLanguage, openIn: config.reading.openIn, zoom, pdfReader: config.pdfReader.enabled, theme: config.theme, floating })),
```

(The pages already ask again on every change of `config` (`WATCHED_KEYS` in `src/shared/entry-settings.ts` holds it),
and the background answers with the new `theme`, so a change of the appearance reaches every open arXiv page.)

- [ ] **Step 5: The design as built**

In `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md`, §2.2, replace

```
  roles as `--axt-` variables (hard rule 2), written into each shadow sheet by one function of the source at run time
  (a few hundred bytes), scoped to `:host`. No generated file: the content script already builds these sheets as strings.
```

with

```
  roles as `--axt-` variables (hard rule 2), written into each shadow sheet by one function of the source at run time
  (5.9 KB, 5 905 bytes: the ramp and the roles in three blocks), scoped to `:host` and marked light or dark on an element inside the
  shadow root (`data-axt-theme`, §3). No generated file: the content script already builds these sheets as strings.
```

and in §3 replace

```
    settings page, the reader, and the floating button with its menus (its shadow host carries `data-theme`);
```

with

```
    settings page, the reader, and the floating button with its menus (its dock, inside the shadow root, carries
    `data-axt-theme`: not the host, which arXiv's own sheet would style as any `[data-theme=dark]`, and whose every
    `data-axt-*` a restore of the page strips; Part 6's plan);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run tests/shared tests/background tests/entry tests/styles`
Expected: PASS (`tokens.test.ts`'s host test, `entry-settings.test.ts` one more, `handlers.test.ts` one more; the
floating button's sheet does not use the host sheet yet).

- [ ] **Step 7: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/shared/tokens.ts src/shared/entry-settings.ts src/shared/messages.ts src/entrypoints/background/handlers.ts experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md tests/shared/tokens.test.ts tests/shared/entry-settings.test.ts tests/background/handlers.test.ts
node scripts/check-english.mjs
git commit -m "feat(ui): a shadow root's theme marked inside it, and the extension's appearance on arXiv's pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`node scripts/check-english.mjs` exits 0 with the allowlist as it is: the design holds 175 lines with CJK, as its entry
grants, and no line this task writes holds any. If it names a file, add the exact entry it names to
`scripts/english-allowlist.txt` with a one-line English reason beside it, `git add scripts/english-allowlist.txt`, run
it again, and commit it with this task.

### Task 72: the floating button in the family's material, in the extension's appearance

**Files:**
- Modify: `src/core/floating/button.ts` (the header comment, `STYLE`, `FloatingTheme`, `theme` / `retheme`)
- Modify: `src/shared/floating.ts` (`theme` on mount and on every change)
- Modify: `tests/e2e/floating-button.mjs` (a block before its end)
- Test: `tests/entry/floating-button.test.ts`, `tests/shared/floating.test.ts`

**Interfaces:**
- Consumes: `tokenSheet('host')` and the mark (Task 71); `EntrySettings.theme` (Task 71); the role `tip-shadow` (Part 3,
  its Task 21; in the host sheet `--axt-tip-shadow`); `rules`, `ruleOf`, `sheet` (`tests/styles/css-rules.ts`, Part 3);
  `restore` (`@/core/renderer/page`).
- Produces: `type FloatingTheme = 'system' | 'light' | 'dark'`; `FloatingButtonOptions.theme?: FloatingTheme` (the
  system's when absent); `FloatingButton.retheme(theme: FloatingTheme): void`; the dock marked `data-axt-theme="light"` or
  `"dark"`, unmarked for the system's.

- [ ] **Step 1: Write the failing tests**

In `tests/entry/floating-button.test.ts`, after the line `import { Settings as LucideSettings } from 'lucide'` add:

```ts
import { restore } from '@/core/renderer/page'
import { tokenSheet } from '@/shared/tokens'
import { ruleOf, rules, sheet } from '../styles/css-rules'
```

and at the end of the file add:

```ts
describe('the floating button: its material (the redesign\'s design, §7)', () => {
  /** the button's sheet as its shadow root holds it, comments out */
  const own = () => mount().root.querySelector('style')!.textContent!.replace(/\/\*[\s\S]*?\*\//g, '')
  /** the shared controls' rules, each role named as a shadow root on arXiv's pages names it */
  const shared = rules(sheet('../../src/styles/controls.css'))
  const C = ['@layer components']
  const axt = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.replaceAll('var(--', 'var(--axt-')]))
  const pick = (d: Record<string, string>, keys: string[]) => Object.fromEntries(keys.map(k => [k, d[k]]))

  it('draws in the extension\'s appearance: its dock marked light or dark, unmarked for the system\'s, a change followed', () => {
    const { host, dock, entry } = mount({ theme: 'dark' })
    expect(dock.dataset.axtTheme).toBe('dark')
    entry.retheme('light')
    expect(dock.dataset.axtTheme).toBe('light')
    entry.retheme('system')
    expect(dock.dataset.axtTheme).toBeUndefined()
    // anything else a page might be told is the system's, never a mark of its own (Review Focus)
    entry.retheme('dark')
    entry.retheme(undefined as unknown as 'system')
    expect(dock.dataset.axtTheme).toBeUndefined()
    // the host carries its class alone: arXiv's own sheet styles any [data-theme=dark] (Review Focus)
    expect(host.getAttributeNames()).toEqual(['class'])
  })

  it('keeps its appearance through a restore of the page, which strips every data-axt-* of the document\'s own elements (Review Focus)', () => {
    const { dock } = mount({ theme: 'dark' })
    // restore walks the document's own tree, never a shadow root's: this holds that, should restore ever reach into ours
    restore(document)
    expect(dock.dataset.axtTheme).toBe('dark')
  })

  it('takes every colour from the host token sheet, written after the host\'s reset; no colour of its own but the mark\'s', () => {
    const css = own()
    const tokens = tokenSheet('host')
    expect(css.trimStart().startsWith(`:host { all: initial }\n${tokens}`)).toBe(true)
    const rest = css.slice(css.indexOf(tokens) + tokens.length)
    // a named colour counts too, but not a property's name (`white-space`)
    expect([...rest.matchAll(/oklch\([^)]*\)|rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b|(?<![\w-])(?:white|black)(?![\w-])/gi)].map(m => m[0]).sort()).toEqual([
      // the tick's ring and glyph: the disc's white (mark.ts)
      '#fff', '#fff',
      // the disc's shadow at rest and lit: the logo's export
      'rgb(0 0 0 / 0.06)', 'rgb(0 0 0 / 0.16)',
    ])
  })

  it('rests on the chrome with a hairline under the floating shadow; the tick in success; the keyboard\'s ring 2 px of the focus ink; the panel\'s frame the popover\'s', () => {
    const all = rules(own())
    for (const selector of ['.axt-fb-main', '.axt-fb-hidden-button']) {
      expect(pick(ruleOf(all, selector, []), ['background', 'border', 'box-shadow'])).toEqual({ background: 'var(--axt-chrome)', border: '1px solid var(--axt-chrome-line)', 'box-shadow': 'var(--axt-float-shadow)' })
    }
    expect(ruleOf(all, '.axt-fb-tick', []).background).toBe('var(--axt-success)')
    expect(ruleOf(all, '.axt-fb-main:focus-visible, .axt-fb-hidden-button:focus-visible, .axt-fb-control:focus-visible', [])).toEqual({ outline: '2px solid var(--axt-focus)', 'outline-offset': '2px' })
    expect(pick(ruleOf(all, '.axt-fb-panel-box', []), ['border-radius', 'background', 'box-shadow'])).toEqual({ 'border-radius': '12px', background: 'var(--axt-chrome)', 'box-shadow': 'var(--axt-pop-shadow)' })
  })

  it('opens its close menu as the shared menu and shows its tooltips as the shared tooltip, value for value (controls.css)', () => {
    const all = rules(own())
    const MENU = ['padding', 'border-radius', 'background', 'color', 'box-shadow', 'font-size']
    const ITEM = ['display', 'align-items', 'gap', 'height', 'padding', 'border-radius', 'cursor']
    const TIP = ['padding', 'border-radius', 'background', 'color', 'font', 'box-shadow']
    expect(pick(ruleOf(all, '.axt-fb-menu', []), MENU)).toEqual(pick(axt(ruleOf(shared, '.pop', C)), MENU))
    expect(pick(ruleOf(all, '.axt-fb-menu button', []), ITEM)).toEqual(pick(axt(ruleOf(shared, '.pop .item', C)), ITEM))
    expect(ruleOf(all, '.axt-fb-menu button:hover, .axt-fb-menu button:focus-visible', [])).toEqual(axt(ruleOf(shared, '.pop .item[data-active]', C)))
    expect(ruleOf(all, '.axt-fb-menu button:focus-visible', [])).toEqual({ outline: '2px solid var(--axt-focus)', 'outline-offset': '-2px' })
    expect(pick(ruleOf(all, '.axt-fb-tip', []), TIP)).toEqual(pick(axt(ruleOf(shared, '.tip', C)), TIP))
  })
})
```

In `tests/shared/floating.test.ts`, inside `describe('installFloatingButton', …)`, after its first test add:

```ts
  it('draws in the extension\'s appearance, from the first paint and through a change of it while the page stays open (the redesign\'s design, §3)', async () => {
    await install()
    expect(inside('.axt-fb-dock').dataset.axtTheme).toBeUndefined()
    wire.follow!({ ...DEFAULT_ENTRY_SETTINGS, theme: 'dark' })
    expect(inside('.axt-fb-dock').dataset.axtTheme).toBe('dark')
    // taken off and put back: mounted afresh in the appearance in force
    wire.follow!({ ...settings({ enabled: false }), theme: 'dark' })
    wire.follow!({ ...DEFAULT_ENTRY_SETTINGS, theme: 'light' })
    expect([hosts(), inside('.axt-fb-dock').dataset.axtTheme]).toEqual([1, 'light'])
    wire.follow!({ ...DEFAULT_ENTRY_SETTINGS, theme: 'system' })
    expect(inside('.axt-fb-dock').dataset.axtTheme).toBeUndefined()
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/entry/floating-button.test.ts tests/shared/floating.test.ts`
Expected: FAIL — `entry.retheme is not a function`; the dock has no mark; the sheet does not begin with the host token
sheet; `ruleOf` finds `.axt-fb-main`'s background `var(--axt-surface)`. (`.tip`'s shadow is `var(--tip-shadow)` from
Part 3's Task 21: if `controls.css` still writes the literal there, stop and report — this part builds on that task.)

- [ ] **Step 3: The appearance, marked on the dock**

In `src/core/floating/button.ts`:

After `import { MARK_DISC } from './mark'` add:

```ts
import { tokenSheet } from '@/shared/tokens'
```

After the line `export type DockSide = 'left' | 'right'` add:

```ts
/** The extension's appearance (its configuration's `theme`) */
export type FloatingTheme = 'system' | 'light' | 'dark'
```

In `interface FloatingButtonOptions`, after the `zoom?: number` member and its comment, add:

```ts
  /** The extension's appearance (the redesign's design, §3); the system's when absent */
  theme?: FloatingTheme
```

In `interface FloatingButton`, after `rescale: (zoom: number) => void` and its comment, add:

```ts
  /** The extension's appearance changed: the dock is marked again */
  retheme: (theme: FloatingTheme) => void
```

In `mountFloatingButton`, after the line `const dock = make('div', 'axt-fb-dock')` add:

```ts
  /**
   * The extension's appearance, marked on the dock inside the shadow root (the redesign's design, §3): the host token
   * sheet answers the mark, or the system when there is none. Not on the host, which is an element of the page:
   * restoring a translated page strips every data-axt-* of the document's own elements, and the button would fall back
   * to the system's until the settings next changed
   */
  const setTheme = (theme: FloatingTheme | undefined) => {
    if (theme === 'light' || theme === 'dark') dock.dataset.axtTheme = theme
    else delete dock.dataset.axtTheme
  }
  setTheme(options.theme)
```

and in the object `const button: FloatingButton = { … }`, after the `rescale` member add:

```ts
    retheme: next => setTheme(next),
```

- [ ] **Step 4: The material**

In the header comment of `src/core/floating/button.ts`, replace

```
// **Read Frog's is the frame** (the maintainer, 2026-09-18): the column around a main button, the corner controls, the
// tooltips, the sizes and surfaces, and the whole drag — the long press, the threshold, docking to the nearer edge,
// the height kept as a fraction with its clearances, the lock, cancelling on fullscreen.
```

with

```
// **Read Frog's is the frame** (the maintainer, 2026-09-18): the column around a main button, the corner controls, the
// tooltips' places, the sizes, and the whole drag — the long press, the threshold, docking to the nearer edge,
// the height kept as a fraction with its clearances, the lock, cancelling on fullscreen. **The material is the
// extension's** (the redesign's design, §7; the style sheet below says what that is).
```

Above `const STYLE`, replace the two lines

```
// Read Frog's surfaces and sizes as the CSS Tailwind v4 generates for their classes (their theme's `--rf-*` colours
// and Tailwind's neutral scale, light and dark); the mark's disc, the tick, the motion and the panel are ours.
```

with

```
// Read Frog's sizes, as the CSS Tailwind v4 generates for their classes. **The material is the extension's** (the
// redesign's design, §7): every colour a role of the host token sheet (src/shared/tokens.ts), light or dark as the
// extension's appearance marks the dock — the surfaces `chrome` with a hairline under the floating shadow, the close
// menu and the tooltips the shared menu's and tooltip's looks (src/styles/controls.css `.pop`, `.item`, `.tip`) in the
// dock's own places and motion, the tick `success`, the keyboard's ring the focus ink. The disc, its shadow and the
// tick's white are the mark's (mark.ts); the motion and the panel are ours.
```

Then, inside `STYLE`, make these replacements, each exactly once and nothing else:

1. The sheet's start — replace

```
:host { all: initial }
.axt-fb-dock {
  --axt-border: oklch(0.92 0.004 286.32); --axt-surface: #fff; --axt-hidden-fg: oklch(0.439 0 0); --axt-hidden-hover: oklch(0.97 0 0);
  --axt-control: oklch(0.708 0 0); --axt-control-hover: oklch(0.439 0 0);
  --axt-tip-bg: oklch(0.141 0.005 285.823); --axt-tip-fg: #fff;
  --axt-popover: #fff; --axt-popover-fg: oklch(0.141 0.005 285.823); --axt-accent: oklch(0.967 0.001 286.375); --axt-accent-fg: oklch(0.21 0.006 285.885);
  --axt-active: #2fa84f;
  --axt-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

with

```
:host { all: initial }
${tokenSheet('host')}
.axt-fb-dock {
```

2. `  font-family: ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased;` becomes
   `  font-family: var(--axt-font); -webkit-font-smoothing: antialiased;`.

3. Delete the whole system-dark block (the host token sheet holds the dark roles):

```
@media (prefers-color-scheme: dark) {
  .axt-fb-dock {
    --axt-border: oklch(1 0 0 / 10%); --axt-surface: oklch(0.205 0 0); --axt-hidden-fg: oklch(0.708 0 0); --axt-hidden-hover: oklch(0.269 0 0);
    --axt-control: oklch(0.556 0 0); --axt-control-hover: oklch(0.87 0 0); --axt-tip-bg: oklch(0.985 0 0); --axt-tip-fg: oklch(0.141 0.005 285.823);
    --axt-popover: oklch(0.21 0.006 285.885); --axt-popover-fg: oklch(0.985 0 0); --axt-accent: oklch(0.274 0.006 286.033); --axt-accent-fg: oklch(0.985 0 0);
  }
}
```

4. In `.axt-fb-hidden-button { … }`, replace

```
  border: 1px solid var(--axt-border); border-radius: 9999px; background: var(--axt-surface); color: var(--axt-hidden-fg);
  box-shadow: var(--axt-shadow-lg);
```

with

```
  border: 1px solid var(--axt-chrome-line); border-radius: 9999px; background: var(--axt-chrome); color: var(--axt-ink-2);
  box-shadow: var(--axt-float-shadow);
```

5. In `.axt-fb-hidden-button::before { … }`, `background: var(--axt-hidden-hover);` becomes `background: var(--axt-fill);`.

6. Replace the tooltip's rule and its comment

```
/* FloatingButtonTooltip: beside the button, on the side away from the edge */
.axt-fb-tip {
  position: absolute; top: 50%; pointer-events: none; white-space: nowrap; max-width: 320px; box-sizing: border-box;
  padding: 6px 12px; border-radius: 8px; background: var(--axt-tip-bg); color: var(--axt-tip-fg); font-size: 12px; line-height: 16px;
  font-weight: 400;
}
```

with

```
/* FloatingButtonTooltip: beside the button, on the side away from the edge; drawn as the shared tooltip (controls.css
   .tip: its padding, radius, ground, words and shadow), dark in both themes */
.axt-fb-tip {
  position: absolute; top: 50%; pointer-events: none; white-space: nowrap; max-width: 320px; box-sizing: border-box;
  padding: 5px 8px; border-radius: 6px; background: var(--axt-tip-bg); color: var(--axt-tip-ink); font: 12px/1.2 var(--axt-font);
  box-shadow: var(--axt-tip-shadow);
}
```

7. In `.axt-fb-main { … }`, the line
   `  border: 1px solid var(--axt-border); background: var(--axt-surface); box-shadow: var(--axt-shadow-lg); cursor: pointer;`
   becomes
   `  border: 1px solid var(--axt-chrome-line); background: var(--axt-chrome); box-shadow: var(--axt-float-shadow); cursor: pointer;`.

8. In `.axt-fb-tick { … }`, `background: var(--axt-active);` becomes `background: var(--axt-success);` (its `#fff` ring
   and glyph stay: the disc's white).

9. In `.axt-fb-dock[data-axt-dragging="yes"] .axt-fb-main { … }`, `border: 1px solid var(--axt-border);` becomes
   `border: 1px solid var(--axt-chrome-line);`.

10. The focus rule
    `.axt-fb-main:focus-visible, .axt-fb-hidden-button:focus-visible, .axt-fb-control:focus-visible { outline: 2px solid oklch(0.705 0.015 286.067); outline-offset: 2px }`
    becomes
    `.axt-fb-main:focus-visible, .axt-fb-hidden-button:focus-visible, .axt-fb-control:focus-visible { outline: 2px solid var(--axt-focus); outline-offset: 2px }`.

11. In `.axt-fb-control { … }`, `color: var(--axt-control);` becomes `color: var(--axt-ink-3);`; in
    `.axt-fb-control:hover > svg, .axt-fb-control[aria-expanded="true"] > svg { … }`, `color: var(--axt-control-hover);`
    becomes `color: var(--axt-ink);`.

12. Replace the close menu's rules, from its comment through the hover rule:

```
/* DropdownMenuContent, opened from the close trigger: beside it, away from the edge, aligned to its top */
.axt-fb-menu {
  position: absolute; top: 4px; z-index: 1; box-sizing: border-box; padding: 4px; min-width: 0; white-space: nowrap;
  border-radius: 10px; background: var(--axt-popover); color: var(--axt-popover-fg);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1), 0 0 0 1px color-mix(in oklab, var(--axt-popover-fg) 10%, transparent);
  animation: axt-pop-in var(--axt-grow-in);
}
.axt-fb-menu[hidden] { display: none }
.axt-fb-dock[data-axt-side="right"] .axt-fb-menu { right: calc(100% + 28px); transform-origin: right top }
.axt-fb-dock[data-axt-side="left"] .axt-fb-menu { left: calc(100% + 28px); transform-origin: left top }
.axt-fb-menu button {
  display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; padding: 4px 6px;
  border-radius: 8px; font-size: 14px; line-height: 20px; cursor: default; user-select: none; outline: none; text-align: start;
}
.axt-fb-menu button:hover, .axt-fb-menu button:focus-visible { background: var(--axt-accent); color: var(--axt-accent-fg) }
```

with

```
/* The close menu, opened from the close trigger: beside it, away from the edge, aligned to its top, coming out as the
   dock's parts do. Drawn as the shared menu (controls.css .pop and .item): its ground, words, shadow and radius, rows of
   30 px lit by the fill, the keyboard's row ringed inside as the reader's is; its width its words' */
.axt-fb-menu {
  position: absolute; top: 4px; z-index: 1; box-sizing: border-box; min-width: 0; white-space: nowrap;
  padding: 4px; border-radius: 12px; background: var(--axt-chrome); color: var(--axt-ink); box-shadow: var(--axt-pop-shadow); font-size: 13px;
  animation: axt-pop-in var(--axt-grow-in);
}
.axt-fb-menu[hidden] { display: none }
.axt-fb-dock[data-axt-side="right"] .axt-fb-menu { right: calc(100% + 28px); transform-origin: right top }
.axt-fb-dock[data-axt-side="left"] .axt-fb-menu { left: calc(100% + 28px); transform-origin: left top }
.axt-fb-menu button {
  display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; height: 30px; padding: 0 10px 0 8px;
  border-radius: 8px; cursor: pointer; user-select: none; text-align: start;
}
.axt-fb-menu button:hover, .axt-fb-menu button:focus-visible { background: var(--axt-fill) }
.axt-fb-menu button:focus-visible { outline: 2px solid var(--axt-focus); outline-offset: -2px }
```

13. Replace the panel's comment and the first three lines of its rule

```
/* The control panel: the extension's popup in a frame, beside the dock, grown out of it like the menu */
.axt-fb-panel-box {
  position: fixed; z-index: 1; width: 320px; overflow: hidden; zoom: var(--axt-unzoom, 1); border-radius: 16px; background: var(--axt-popover);
  box-shadow: 0 20px 40px -8px rgb(0 0 0 / 0.22), 0 4px 12px -4px rgb(0 0 0 / 0.12), 0 0 0 1px color-mix(in oklab, var(--axt-popover-fg) 10%, transparent);
```

with

```
/* The control panel: the extension's popup in a frame, beside the dock, grown out of it like the menu; the frame the
   shared popover's radius and shadow, on the popup's own ground */
.axt-fb-panel-box {
  position: fixed; z-index: 1; width: 320px; overflow: hidden; zoom: var(--axt-unzoom, 1); border-radius: 12px; background: var(--axt-chrome);
  box-shadow: var(--axt-pop-shadow);
```

Run: `grep -nE "var\(--axt-(border|surface|hidden-fg|hidden-hover|control|control-hover|tip-fg|popover|popover-fg|accent|accent-fg|active|shadow-lg)\)" src/core/floating/button.ts`
Expected: no output — every old variable is gone.

(A change of the appearance needs no transitions held off, as the pages' does: the sheet transitions no colour but the
corner controls' glyphs, which are out of sight unless the dock is open, and the dock is open only while the pointer or
the keyboard is on it, where no change of the appearance can be made — the panel's popup has no appearance control.)

- [ ] **Step 5: The page gives the button the appearance, and follows it**

In `src/shared/floating.ts`, in `mount`, in the options passed to `mountFloatingButton`, after the line
`zoom: zoomed ? from.zoom : 1,` add:

```ts
      theme: from.theme,
```

and in `apply`, after the line `button.rescale(zoomed ? next.zoom : 1)` add:

```ts
    // The extension's appearance, changed on the settings page or in the reader (the redesign's design, §3)
    button.retheme(next.theme)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run tests/entry/floating-button.test.ts tests/shared tests/styles`
Expected: PASS — the new five in `floating-button.test.ts` and the new one in `floating.test.ts`, and every earlier test
of both files as before (among them the prefix test, which now reads the host token sheet too, and the `:has()` test).

- [ ] **Step 7: The button's appearance in a real browser**

In `tests/e2e/floating-button.mjs`, before the line `await context.close()`, add:

```js
// ————— Whose light and dark (the redesign's design, §3, §7) —————
// The button is the extension's own control: it draws in the extension's appearance, whatever the paper's under it
// and whatever the system's. Set against the paper — the extension dark on arXiv's light theme, then light on its dark
// one — and then left to the system's (light, headless)
{
  const setTheme = theme => worker.evaluate(async theme => {
    const { config } = await chrome.storage.local.get('config')
    await chrome.storage.local.set({ config: { ...config, theme } })
  }, theme)
  /** The extension's appearance and arXiv's own theme set, and the paper loaded again under them */
  const underThemes = async (extension, arxiv) => {
    await setTheme(extension)
    await page.evaluate(theme => localStorage.setItem('ar5iv_theme', theme), arxiv)
    await page.reload({ waitUntil: 'load' })
    await sleep(4000)
  }
  /** The dock's mark, the main button's ground, and the chrome as the dock resolves it (a probe given it as its colour) */
  const buttonLook = () => page.evaluate(() => {
    const root = document.querySelector('.axt-floating').shadowRoot
    const dock = root.querySelector('.axt-fb-dock')
    const probe = document.createElement('i')
    probe.style.color = 'var(--axt-chrome)'
    dock.append(probe)
    const chrome = getComputedStyle(probe).color
    probe.remove()
    return { mark: dock.dataset.axtTheme ?? 'system', ground: getComputedStyle(root.querySelector('.axt-fb-main')).backgroundColor, chrome }
  })
  await underThemes('dark', 'light')
  const dark = await buttonLook()
  // the light appearance under a dark system too: the dock's light mark must win over the host's system-dark block
  await page.emulateMedia({ colorScheme: 'dark' })
  await underThemes('light', 'dark')
  const light = await buttonLook()
  await page.emulateMedia({ colorScheme: 'light' })
  await setTheme('system')
  await sleep(1500)
  const system = await buttonLook()
  check('the button draws in the extension\'s appearance, not the paper\'s nor the system\'s: dark on arXiv\'s light theme, light on its dark one, the system\'s when the appearance is',
    dark.mark === 'dark' && dark.ground === dark.chrome && light.mark === 'light' && light.ground === light.chrome && dark.ground !== light.ground
      && system.mark === 'system' && system.ground === light.ground,
    JSON.stringify({ dark, light, system }))
}
```

Run: `git add tests/e2e/floating-button.mjs && pnpm build && pnpm e2e:floating && pnpm e2e:pdf`
Expected: every line `PASS`, the new one among them (one check more than Task 70's run), exit 0. No earlier check asserts a
colour (checked while drafting: `floating-button.mjs` and `pdf-entry.mjs` assert places, states and words only), so none
changes.

- [ ] **Step 8: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/core/floating/button.ts src/shared/floating.ts tests/entry/floating-button.test.ts tests/shared/floating.test.ts tests/e2e/floating-button.mjs
node scripts/check-english.mjs
git commit -m "feat(floating): the floating button in the family's material, following the extension's appearance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`node scripts/check-english.mjs` exits 0 with the allowlist as it is: `tests/e2e/floating-button.mjs` holds 6 lines with
CJK, as its entry grants, and no line this task writes holds any. If it names a file, add the exact entry it names to
`scripts/english-allowlist.txt` with a one-line English reason beside it, `git add scripts/english-allowlist.txt`, run
it again, and commit it with this task.

### Task 73: the figure viewer's control and bar, and the failed block's retry, by the page

**Files:**
- Modify: `src/core/viewer/index.ts` (`SHEET` and a comment above it, `dress`)
- Modify: `src/core/renderer/failed.ts` (`STYLE` and a comment above it)
- Modify: `src/styles/modes.css` (the failed block's hint line)
- Modify: `tests/e2e/floating-button.mjs` (the block Task 72 added)
- Test: `tests/viewer/viewer.test.ts`, `tests/renderer/failed.test.ts`, `tests/styles/no-has.test.ts`

**Interfaces:**
- Consumes: `tokenSheet('host')` and its mark (Task 71); `resolve(name, mode)` (`@/shared/tokens`, Part 1).
- Produces: the viewer's control (`.axt-viewer-open`) and dialog each marked `data-axt-theme="light" | "dark"` from the
  page's ground when the control first shows over a figure; the control `float-bg`, `float-shadow`, radius 8, `ink`; the
  bar `float-bg`, `float-shadow`, radius 8; the buttons' keyboard ring `focus`. The retry's widget defines, on its host,
  `--axt-danger: light-dark(<danger light>, <danger dark>)` and `--axt-danger-edge` (the same at 60 %), its button's edge
  and its mark drawn in them. The failed block's hint line (`modes.css`) is `inset 3px 0 0` of the same 60 % construct;
  `--axt-failed-color`, a variable nothing set, goes.

- [ ] **Step 1: Write the failing tests**

In `tests/viewer/viewer.test.ts`, after the line `import { installFigureViewer, SPOT_CLASS, type FigureViewer, VIEWER_CLASS } from '@/core/viewer'` add:

```ts
import { restore } from '@/core/renderer/page'
import { tokenSheet } from '@/shared/tokens'
import { ruleOf, rules } from '../styles/css-rules'
```

and at the end of the file add:

```ts
describe('the control and the dialog\'s bar: the family\'s floating material, light or dark by the page (the redesign\'s design, §3, §7)', () => {
  const TWO = '<figure class="ltx_figure" id="A"><img class="ltx_graphics" src="a.png"></figure><figure class="ltx_figure" id="B"><img class="ltx_graphics" src="b.png"></figure>'
  const pick = (d: Record<string, string>, keys: string[]) => Object.fromEntries(keys.map(k => [k, d[k]]))
  afterEach(() => { document.body.removeAttribute('style') })

  it('takes light or dark from the paper it stands on, whatever the system\'s, marked inside its two shadow roots — which a restore of the page does not reach (Review Focus)', () => {
    const { control, dialog } = page(TWO)
    const [a, b] = [...document.querySelectorAll('img')]
    place(a!, rect(100, 100, 400, 300))
    place(b!, rect(100, 500, 400, 300))
    // arXiv's dark paper, #282623
    document.body.style.backgroundColor = 'rgb(40, 38, 35)'
    over(a!)
    expect([control.dataset.axtTheme, dialog.dataset.axtTheme]).toEqual(['dark', 'dark'])
    // restore walks the document's own tree, never a shadow root's: this holds that, should restore ever reach into ours
    restore(document)
    expect([control.dataset.axtTheme, dialog.dataset.axtTheme]).toEqual(['dark', 'dark'])
    document.body.style.backgroundColor = 'rgb(255, 255, 255)'
    over(b!)
    expect([control.dataset.axtTheme, dialog.dataset.axtTheme]).toEqual(['light', 'light'])
  })

  it('draws the control and the bar on the floating ground under the floating shadow, the control at a radius of 8, the keyboard\'s ring in the focus ink, every colour of the control and the bar from the host token sheet', () => {
    const { root, spot } = page(PICTURE)
    for (const shadow of [root, spot.shadowRoot!]) {
      const css = shadow.querySelector('style')!.textContent!
      expect(css).toContain(tokenSheet('host'))
      expect(css).not.toContain('data-axt-dark')
      const all = rules(css.replace(/\/\*[\s\S]*?\*\//g, ''))
      expect(pick(ruleOf(all, '.axt-viewer-open', []), ['border-radius', 'color', 'background', 'box-shadow'])).toEqual({ 'border-radius': '8px', color: 'var(--axt-ink)', background: 'var(--axt-float-bg)', 'box-shadow': 'var(--axt-float-shadow)' })
      expect(pick(ruleOf(all, '.axt-viewer-bar', []), ['border-radius', 'background', 'box-shadow'])).toEqual({ 'border-radius': '8px', background: 'var(--axt-float-bg)', 'box-shadow': 'var(--axt-float-shadow)' })
      expect(ruleOf(all, 'button:focus-visible', [])).toEqual({ outline: '2px solid var(--axt-focus)', 'outline-offset': '-2px' })
      expect(ruleOf(all, 'dialog', []).color).toBe('var(--axt-ink)')
    }
  })
})
```

In `tests/renderer/failed.test.ts`, after the line `import { renderPending } from '@/core/renderer/pending'` add:

```ts
import { resolve } from '@/shared/tokens'
import { ruleOf, rules, sheet } from '../styles/css-rules'
```

after the line `const page = '<p class="ltx_p" id="p1">Text.</p>'` add:

```ts
/** The family's danger in each theme, and the 60 % of it the retry's edge and the block's hint line draw (§3, §7) */
const [light, dark] = [resolve('danger', 'light'), resolve('danger', 'dark')]
const edge = (colour: string) => `color-mix(in oklab, ${colour} 60%, transparent)`
```

and inside `describe('renderFailed', …)`, after the test that starts
`it('removes pending, marks failed, inserts the widget with a shadow root: button + reason'`, add:

```ts
  it('draws the retry\'s edge and its mark in the family\'s danger, light or dark by the colour scheme of the page it stands in (the redesign\'s design, §3, §7)', () => {
    const doc = docOf(page)
    const host = renderFailed(extract(doc)[0] as TextBlock, 'network: offline', () => undefined)
    const css = host.shadowRoot!.querySelector('style')!.textContent!
    expect(css).toContain(`--axt-danger: light-dark(${light}, ${dark});`)
    expect(css).toContain(`--axt-danger-edge: light-dark(${edge(light)}, ${edge(dark)});`)
    expect(css).toContain('border: 1px solid var(--axt-danger-edge);')
    expect(css).toMatch(/\.mark \{[^}]*color: var\(--axt-danger\);/)
    expect(css).not.toMatch(/rgba?\(|--axt-failed-color/)
  })

  it('draws the failed block\'s hint line in the same danger at 60 %, by the page: modes.css writes the two values, held here to the tokens (the controller\'s ruling 2)', () => {
    const line = ruleOf(rules(sheet('../../src/styles/modes.css')), '[data-axt-state="failed"],\n[data-axt-partial],\n[data-axt-partial] + .axt-t', [])
    expect(line).toEqual({ 'box-shadow': `inset 3px 0 0 light-dark(${edge(light)}, ${edge(dark)})` })
  })
```

In `tests/styles/no-has.test.ts`, after the line `import { appearanceSheet } from '@/core/renderer/page'` add:

```ts
import { installFigureViewer, SPOT_CLASS, VIEWER_CLASS } from '@/core/viewer'
```

and inside `describe('the style sheets built in TypeScript', …)`, after the test that starts
`it('the failure widget\'s sheet, inside its shadow root'`, add:

```ts
  it('the figure viewer\'s sheet, inside its two shadow roots', () => {
    const viewer = installFigureViewer(document, { figures: 'img', overlay: '.axt-img', around: 'figure', ours: '.axt-t', strings: () => ({ open: 'Open', zoomIn: 'In', zoomOut: 'Out', close: 'Close' }) })
    for (const name of [VIEWER_CLASS, SPOT_CLASS]) {
      const sheet = document.querySelector(`.${name}`)?.shadowRoot?.querySelector('style')?.textContent ?? ''
      expect(sheet.length).toBeGreaterThan(1000)
      expect(withoutComments(sheet), `${name} uses :has()`).not.toContain(':has(')
    }
    viewer.remove()
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/viewer/viewer.test.ts tests/renderer/failed.test.ts tests/styles/no-has.test.ts`
Expected: FAIL — the viewer marks nothing (`undefined`), its sheet lacks the host token sheet and still names
`data-axt-dark`; the retry's sheet holds `rgba(` and `--axt-failed-color`, and so does the hint line's rule. The new
`no-has.test.ts` test passes
already (the viewer's sheet has no `:has()` today): it guards the sheet from here on, as the failure widget's does.

- [ ] **Step 3: The viewer's control and bar**

In `src/core/viewer/index.ts`, after the line `import { AXT_ATTR_PREFIX, stripAttributes, VIEWED_ATTR, VIEWED_FRAME_ATTR } from '@/core/marks'` add:

```ts
import { tokenSheet } from '@/shared/tokens'
```

Replace the whole `const SHEET = \`…\`` (from `const SHEET = \`` through its closing backtick) with:

```ts
/**
 * One sheet for both shadow roots. The control and the dialog's bar are the family's floating things (the redesign's
 * design, §7): the floating ground under the floating shadow, the control at a radius of 8, the keyboard's ring in the
 * focus ink — light or dark by the page they stand on, as the paper is (`dress` marks them), from the host token sheet.
 * The dialog's frame keeps its own: its ground is the page's paper, its shadow and its scrim the viewer's
 */
const SHEET = `
:host { all: initial; }
${tokenSheet('host')}
button { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; color: inherit; opacity: 0.7; transition: opacity 0.15s; }
button:hover, button:focus-visible { opacity: 1; }
button:focus-visible { outline: 2px solid var(--axt-focus); outline-offset: -2px; }
.axt-viewer-open { border-radius: 8px; color: var(--axt-ink); background: var(--axt-float-bg); box-shadow: var(--axt-float-shadow); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.15s; }
.axt-viewer-open[data-axt-shown] { opacity: 0.85; visibility: visible; pointer-events: auto; transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s; }
.axt-viewer-open[data-axt-shown]:hover, .axt-viewer-open[data-axt-shown]:focus-visible { opacity: 1; }
dialog { box-sizing: border-box; width: 90vw; height: 90vh; max-width: none; max-height: none; margin: auto; padding: 0; border: 0; border-radius: 12px; overflow: hidden; color: var(--axt-ink); background: var(--axt-viewer-paper, #f4f3f2); box-shadow: 0 24px 64px rgb(0 0 0 / 0.35); }
dialog[open] { animation: enter 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
dialog::backdrop { background: rgb(0 0 0 / 0.5); backdrop-filter: blur(4px); animation: fade 0.15s; }
.axt-viewer-stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; }
.axt-viewer-stage[data-axt-dragging] { cursor: grabbing; }
.axt-viewer-bar { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; padding: 2px; border-radius: 8px; background: var(--axt-float-bg); box-shadow: var(--axt-float-shadow); }
@keyframes enter { from { opacity: 0; transform: scale(0.95); } }
@keyframes fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { dialog[open], dialog::backdrop { animation: none; } .axt-viewer-open { transition: none; } }
`
```

(What changed from today's sheet: the host token sheet after the reset; the focus ring's colour; the control's radius
6 → 8, its colours and shadow; the dialog's ink; the bar's ground and shadow; the `[data-axt-dark]` rule gone. Every
length, opacity and timing is today's.)

Replace `dress`:

```ts
  const dress = (): void => {
    const { paper, dark } = ground()
    host.style.setProperty('--axt-viewer-paper', paper)
    host.style.setProperty('--axt-viewer-ink', dark ? '#f5f5f4' : '#1c1c1e')
    open.toggleAttribute('data-axt-dark', dark)
  }
```

with

```ts
  const dress = (): void => {
    const { paper, dark } = ground()
    host.style.setProperty('--axt-viewer-paper', paper)
    // The control and the bar stand on the paper and take its light or dark (the redesign's design, §3, §7): a mark
    // inside each shadow root, where restoring the page — which strips every data-axt-* of the document's own
    // elements, our hosts' among them — does not reach
    const theme = dark ? 'dark' : 'light'
    open.dataset.axtTheme = theme
    dialog.dataset.axtTheme = theme
  }
```

- [ ] **Step 4: The retry**

In `src/core/renderer/failed.ts`, after the line `import { coreStrings } from '@/core/strings'` add:

```ts
import { resolve } from '@/shared/tokens'
```

and replace the whole `const STYLE = \`…\`` (four rules) with:

```ts
/**
 * The retry's edge and its mark in the family's danger (the redesign's design, §3, §7), light or dark **by the page**:
 * the widget stands in the paper, and `light-dark()` answers the colour scheme it inherits from the page — arXiv's root
 * is `light dark`, `dark only` under its dark theme, `light only` under light and sepia — so it follows arXiv's own
 * switch at once, with no script and no read of the page's style while a translation is being written. The edge keeps
 * the 60 % of the block's hint line beside it (modes.css)
 */
const [DANGER_LIGHT, DANGER_DARK] = [resolve('danger', 'light'), resolve('danger', 'dark')]
const edge = (colour: string) => `color-mix(in oklab, ${colour} 60%, transparent)`

const STYLE = `
:host { --axt-danger: light-dark(${DANGER_LIGHT}, ${DANGER_DARK}); --axt-danger-edge: light-dark(${edge(DANGER_LIGHT)}, ${edge(DANGER_DARK)}); display: inline-flex; align-items: center; gap: 4px; font: 12px system-ui, sans-serif; vertical-align: middle; }
button { font: inherit; padding: 0 6px; border: 1px solid var(--axt-danger-edge); border-radius: 3px; background: transparent; color: inherit; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.mark { color: var(--axt-danger); font-weight: 700; cursor: help; }
`
```

In `src/styles/modes.css`, replace

```css
/* A block whose translation failed: a thin hint line on the left, the original readable as before (§7.4).
   A half-translated table (data-axt-partial) draws the line too, but stays translated, and only mode shows the clone as usual */
[data-axt-state="failed"],
[data-axt-partial],
[data-axt-partial] + .axt-t {
  box-shadow: inset 3px 0 0 var(--axt-failed-color, rgba(220, 38, 38, 0.6));
}
```

with

```css
/* A block whose translation failed: a thin hint line on the left, the original readable as before (§7.4), in the
   family's danger at 60 %, light or dark by the colour scheme the block has from the page, as the retry beside it (the
   redesign's design, §7). This sheet is static and no token sheet stands on arXiv's page: the two values are
   src/shared/tokens.ts's `danger`, held to it by tests/renderer/failed.test.ts.
   A half-translated table (data-axt-partial) draws the line too, but stays translated, and only mode shows the clone as usual */
[data-axt-state="failed"],
[data-axt-partial],
[data-axt-partial] + .axt-t {
  box-shadow: inset 3px 0 0 light-dark(color-mix(in oklab, oklch(0.545 0.17 28) 60%, transparent), color-mix(in oklab, oklch(0.69 0.15 28) 60%, transparent));
}
```

Run: `grep -rn "axt-failed-color" src tests`
Expected: no output.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/viewer tests/renderer tests/styles`
Expected: PASS — the new tests and every earlier one of the three directories.

- [ ] **Step 6: Check the platform's answer to the retry's sheet once**

The sheet's text is pinned above; what the browser makes of it is checked here, in Chromium, with the two values the
tokens hold. This checks the construct, not the build: the sheet below is typed from Step 4's `STYLE`, and the tests of
Step 1 hold `failed.ts` to the same text.

```bash
node --input-type=module -e "
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
const L = 'oklch(0.545 0.17 28)', D = 'oklch(0.69 0.15 28)', edge = c => 'color-mix(in oklab, ' + c + ' 60%, transparent)'
const sheet = ':host { --axt-danger: light-dark(' + L + ', ' + D + '); --axt-danger-edge: light-dark(' + edge(L) + ', ' + edge(D) + '); display: inline-flex } button { border: 1px solid var(--axt-danger-edge) } .mark { color: var(--axt-danger) }'
for (const scheme of ['light only', 'dark only', 'normal', 'light dark']) {
  await page.setContent('<p><span id=h></span></p>')
  console.log(scheme, JSON.stringify(await page.evaluate(([sheet, scheme]) => { document.documentElement.style.colorScheme = scheme; const root = document.getElementById('h').attachShadow({ mode: 'open' }); root.innerHTML = '<style>' + sheet + '</style><button>x</button><span class=mark>!</span>'; return [getComputedStyle(root.querySelector('button')).borderTopColor, getComputedStyle(root.querySelector('.mark')).color] }, [sheet, scheme])))
}
await browser.close()
"
```

Expected (as measured while drafting, Chromium 153):

```
light only ["oklab(0.545 0.150101 0.0798102 / 0.6)","oklch(0.545 0.17 28)"]
dark only ["oklab(0.69 0.132442 0.0704207 / 0.6)","oklch(0.69 0.15 28)"]
normal ["oklab(0.545 0.150101 0.0798102 / 0.6)","oklch(0.545 0.17 28)"]
light dark ["oklab(0.545 0.150101 0.0798102 / 0.6)","oklch(0.545 0.17 28)"]
```

The dark scheme gives the dark pair and every other the light one; the edge is never `rgb(0, 0, 0)` (which would mean
the browser dropped the construct and drew the ink). The hint line is the same 60 % construct on the block itself, an
element of the page, which inherits the page's scheme as the widget's host does. Anything else: stop and report.

- [ ] **Step 7: The viewer's light and dark in a real browser**

In `tests/e2e/floating-button.mjs`, replace the whole block Task 72 added — from the line
`// ————— Whose light and dark (the redesign's design, §3, §7) —————` through the closing `}` of its `{ … }` — with:

```js
// ————— Whose light and dark (the redesign's design, §3, §7) —————
// The button is the extension's own control: it draws in the extension's appearance, whatever the paper's under it
// and whatever the system's. The figure viewer's control stands on the paper: it takes the paper's light or dark,
// whatever the extension's. Set against each other — the extension dark on arXiv's light theme, then light on its dark
// one — and then the extension left to the system's (light, headless)
{
  const setTheme = theme => worker.evaluate(async theme => {
    const { config } = await chrome.storage.local.get('config')
    await chrome.storage.local.set({ config: { ...config, theme } })
  }, theme)
  /** The extension's appearance and arXiv's own theme set, the paper loaded again under them, the pointer on its first figure */
  const underThemes = async (extension, arxiv) => {
    await setTheme(extension)
    await page.evaluate(theme => localStorage.setItem('ar5iv_theme', theme), arxiv)
    await page.reload({ waitUntil: 'load' })
    await sleep(4000)
    const figure = await page.evaluate(() => {
      const image = [...document.querySelectorAll('.ltx_figure img')].find(i => i.getBoundingClientRect().width >= 160)
      // A paper with no such figure (AXT_PAPER): the control is never shown, and the check below says so
      if (!image) return null
      image.scrollIntoView({ block: 'center' })
      const r = image.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await page.mouse.move(3, 3)
    if (figure) await page.mouse.move(figure.x, figure.y, { steps: 4 })
    await sleep(500)
  }
  /** The dock's mark, the main button's ground, and the chrome as the dock resolves it (a probe given it as its colour) */
  const buttonLook = () => page.evaluate(() => {
    const root = document.querySelector('.axt-floating').shadowRoot
    const dock = root.querySelector('.axt-fb-dock')
    const probe = document.createElement('i')
    probe.style.color = 'var(--axt-chrome)'
    dock.append(probe)
    const chrome = getComputedStyle(probe).color
    probe.remove()
    return { mark: dock.dataset.axtTheme ?? 'system', ground: getComputedStyle(root.querySelector('.axt-fb-main')).backgroundColor, chrome }
  })
  /** The viewer's control over the figure: shown, its mark, its ground, and the floating ground as it resolves it */
  const viewerLook = () => page.evaluate(() => {
    const open = document.querySelector('.axt-viewer-spot').shadowRoot.querySelector('.axt-viewer-open')
    const probe = document.createElement('i')
    probe.style.color = 'var(--axt-float-bg)'
    open.append(probe)
    const floating = getComputedStyle(probe).color
    probe.remove()
    return { shown: open.hasAttribute('data-axt-shown'), mark: open.dataset.axtTheme ?? null, ground: getComputedStyle(open).backgroundColor, floating }
  })
  await underThemes('dark', 'light')
  const dark = await buttonLook()
  const onLightPaper = await viewerLook()
  // the light appearance under a dark system too: the dock's light mark must win over the host's system-dark block
  await page.emulateMedia({ colorScheme: 'dark' })
  await underThemes('light', 'dark')
  const light = await buttonLook()
  await page.emulateMedia({ colorScheme: 'light' })
  const onDarkPaper = await viewerLook()
  await setTheme('system')
  await sleep(1500)
  const system = await buttonLook()
  check('the button draws in the extension\'s appearance, not the paper\'s nor the system\'s: dark on arXiv\'s light theme, light on its dark one, the system\'s when the appearance is',
    dark.mark === 'dark' && dark.ground === dark.chrome && light.mark === 'light' && light.ground === light.chrome && dark.ground !== light.ground
      && system.mark === 'system' && system.ground === light.ground,
    JSON.stringify({ dark, light, system }))
  check('the figure viewer\'s control takes the paper\'s light or dark, not the extension\'s: light on arXiv\'s light theme under a dark extension, dark on its dark one under a light extension',
    onLightPaper.shown && onLightPaper.mark === 'light' && onLightPaper.ground === onLightPaper.floating
      && onDarkPaper.shown && onDarkPaper.mark === 'dark' && onDarkPaper.ground === onDarkPaper.floating && onLightPaper.ground !== onDarkPaper.ground,
    JSON.stringify({ onLightPaper, onDarkPaper }))
}
```

Run: `pnpm build && pnpm e2e:floating && pnpm e2e:layout`
Expected: every line `PASS` in `e2e:floating` (two checks more than Task 70's run); `e2e:layout`'s viewer checks (the control shown and named,
the dialog open with the copy, the bar's zoom, the restore under the dialog) as before; exit 0.

- [ ] **Step 8: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/core/viewer/index.ts src/core/renderer/failed.ts src/styles/modes.css tests/viewer/viewer.test.ts tests/renderer/failed.test.ts tests/styles/no-has.test.ts tests/e2e/floating-button.mjs
node scripts/check-english.mjs
git commit -m "feat(viewer): the figure viewer's control and bar, and the failed block's retry and line, in the family's colours by the page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`node scripts/check-english.mjs` exits 0 with the allowlist as it is: `tests/e2e/floating-button.mjs` (6),
`src/core/renderer/failed.ts` (1) and `tests/renderer/failed.test.ts` (3) hold the lines with CJK their entries grant,
and no line this task writes holds any. If it names a file, add the exact entry it names to
`scripts/english-allowlist.txt` with a one-line English reason beside it, `git add scripts/english-allowlist.txt`, run
it again, and commit it with this task.

### Task 74: the reader's service menu says a refused key

**Files:**
- Modify: `src/pdf-reader/ui/Menus.tsx` (an import; `ServiceMenu`'s first lines)
- Test: `tests/pdf-reader/ui/menus.test.ts`

**Interfaces:**
- Consumes: `useRejected(): readonly string[]` (`@/ui/use-rejected`, Part 3: the ids of the reader's services whose key
  was refused, subscribed first and then read, followed while mounted; its ordering pinned by Part 3's tests);
  `serviceItems(config, pack, rejected: readonly string[] = [])` (`@/ui/service-items`, Part 2);
  `markRejected`, `clearRejected` (`@/shared/service-health`, Part 2); `S.service.llm_rejected` (Part 2).
- Produces: `ServiceMenu` passes the record to `serviceItems`, so a refused service's hint is `S.service.llm_rejected`
  ("API key no longer valid"), as in the popup (§5.2), and follows the record while the reader is open.

- [ ] **Step 1: Write the failing test**

In `tests/pdf-reader/ui/menus.test.ts`, replace the line `import { setLocale } from '@/ui/strings'` with
`import { S, setLocale } from '@/ui/strings'`; after the line
`import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'` add:

```ts
import { fakeBrowser } from 'wxt/testing/fake-browser'
import type { Service } from '@/config/services'
import { clearRejected, markRejected } from '@/shared/service-health'
```

and after the test that starts `it('service: a service another tab has deleted meanwhile is not written` add:

```ts
  it('service: a service whose key the endpoint refused says so, as the popup\'s menu does, and follows the record while the menu is open (the redesign\'s design, §5.2; the controller\'s ruling 22)', async () => {
    fakeBrowser.reset()
    const mine: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'My model', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'test', model: 'vendor/model', thinking: 'disabled' }
    await markRejected(mine.id)
    const { container, flush } = await openMenu(ServiceMenu, { settings: { ...DEFAULT_CONFIG, services: [mine] } })
    const row = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(mine.name))!
    const settled = async (ready: () => boolean) => { for (let i = 0; i < 20 && !ready(); i++) await flush() }
    await settled(() => row().textContent!.includes(S.service.llm_rejected))
    expect(row().textContent).toContain(S.service.llm_rejected)
    // the record's change reaches the menu through a state update: inside act, as a test's updates are
    await act(async () => { await clearRejected(mine.id) })
    await settled(() => row().textContent!.includes(mine.model))
    expect([row().textContent!.includes(mine.model), row().textContent!.includes(S.service.llm_rejected)]).toEqual([true, false])
  })
```

(`S` is the live binding `setLocale('zh-CN')` in the file's `beforeAll` fills: the hint is the Chinese pack's refusal, found by its
key and not by a Chinese literal, so the file's allowlist count stays.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/pdf-reader/ui/menus.test.ts`
Expected: FAIL — the menu's row shows the model, not the refusal.

- [ ] **Step 3: The menu reads the record**

In `src/pdf-reader/ui/Menus.tsx`, after the line `import { useReader } from './use-reader'` add:

```ts
import { useRejected } from '@/ui/use-rejected'
```

In `ServiceMenu`, replace

```tsx
  const state = useReader(controller, s => ({ settings: s.settings, pack: s.pack }))
  const pop = usePopover('listbox')
  const config = state.settings
  if (!config) return null
  const items = serviceItems(config, state.pack).map(i => ({ id: i.id, name: i.name, hint: i.hint, checked: i.selected, disabled: i.disabled && !i.action }))
```

with

```tsx
  const state = useReader(controller, s => ({ settings: s.settings, pack: s.pack }))
  // a refused key says so in the list, as in the popup (the redesign's design, §5.2; the controller's ruling 22)
  const rejected = useRejected()
  const pop = usePopover('listbox')
  const config = state.settings
  if (!config) return null
  const items = serviceItems(config, state.pack, rejected).map(i => ({ id: i.id, name: i.name, hint: i.hint, checked: i.selected, disabled: i.disabled && !i.action }))
```

The call in `onPick`, `serviceItems(config, state.pack).find(i => i.id === id)`, stays: it asks only whether the row has
an action, which the record does not change (and Part 5 changes the line after it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run tests/pdf-reader tests/ui`
Expected: PASS — the new test of `menus.test.ts`, and every earlier test.

- [ ] **Step 5: Check the reader is unchanged**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs`
Expected: 24 lines of `ok` (the probe's fresh profile holds no refused service, so the service menu's shot is today's),
then every line of `reader-ui.mjs` `ok`; exit 0. Its check "the appearance's thumb slides …" has failed once in three
runs with nothing changed (Part 3's plan): run the spike again once before counting that line, and report it if it
fails twice.

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/pdf-reader/ui/Menus.tsx tests/pdf-reader/ui/menus.test.ts
node scripts/check-english.mjs
git commit -m "feat(pdf-reader): the service menu says a refused key, as the popup does

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`node scripts/check-english.mjs` exits 0 with the allowlist as it is: `tests/pdf-reader/ui/menus.test.ts` holds 2 lines
with CJK, as its entry grants, and no line this task writes holds any (the refusal is found by `S.service.llm_rejected`).
If it names a file, add the exact entry it names to `scripts/english-allowlist.txt` with a one-line English reason
beside it, `git add scripts/english-allowlist.txt`, run it again, and commit it with this task.

### Task 75: Part 6's record, and the shots for the maintainer

- [ ] **Step 1: Every check, on this part's build**

Run, each judged by its exit code:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
node experiments/pdf-bilingual/spikes/reader-pixels.mjs     # 24 lines of ok
node experiments/pdf-bilingual/spikes/reader-ui.mjs         # every line ok
pnpm e2e:floating && pnpm e2e:pdf                           # the button on its three pages; two checks more than Task 70's run
pnpm e2e:layout && pnpm e2e:image                           # the figure viewer's behaviour in side mode and with overlays
pnpm e2e:a11y && pnpm e2e                                   # the A/B audit (the button's new contrasts), the main suite
```

Expected: each exits 0. They reach arXiv and a free translator: a failure is re-run once before it is counted, and
reported with its line if it fails twice. `e2e:a11y` reports only what the extension adds against the page without
it: a colour-contrast finding on the button or the viewer is a finding of this part — report it with its pair and
ratio; do not change a colour without the controller.

- [ ] **Step 2: The shots from after, beside the ones from before**

Run: `pnpm build && node tests/e2e/probes/floating-shots.mjs after`
Expected: `18 shots in …/out/floating/after`, no `MISSING`; then one line per part of the button per shot: `same` for
`state`, `.axt-fb-main`, `.axt-fb-disc`, `.axt-fb-panel`, `.axt-fb-settings`, `.axt-fb-options`, `.axt-fb-lock` and
`.axt-fb-panel-box` in every shot (its shape, place and states unchanged, §7); `differs` only for `.axt-fb-menu`, `.axt-fb-menu
button` and `.axt-fb-main .axt-fb-tip` (the shared menu's rows and the shared tooltip's measures); and
`side by side: …/out/floating/index.html`. A `differs` anywhere else is a geometry this part moved: find it in the
sheet's diff (`git diff <Part 3's last commit> -- src/core/floating/button.ts`) and put it back.

- [ ] **Step 3: Look at every pair**

Open `experiments/pdf-bilingual/out/floating/index.html` and each pair at full size (they are at twice the pixels), both
themes: the surfaces in the family's greys with their hairline, the tooltips dark in both themes, the menu as the
reader's menus, the tick's green, the panel's frame; the viewer's control and bar light on arXiv's light paper and
dark on its dark one. Write down anything that reads wrong for the record; do not change a value of this plan without
the controller.

- [ ] **Step 4: A local review of the part**

Ask for a local Codex review of Part 6's commits (`/codex:review --base <Part 3's last commit>`). Check each point
against the code, a test or the probe before adopting it; adopt in a commit of its own; write down what was declined
and why in the record.

- [ ] **Step 5: Write the record**

Append to the end of this plan, under a heading `## Part 6: done`: the commits; the probe's comparison (the parts
`same`, the parts `differs` and by how much); what the look of Step 3 found; the review's points and what became of
them; and any name that came out otherwise than this plan says. Then:

- **For the controller:** the shots are at `experiments/pdf-bilingual/out/floating/index.html` (18 pairs), and the
  branch waits for the maintainer's look before it merges (§7). The merge meets Part 5 in three files, each in another
  hunk: `src/entrypoints/background/handlers.ts` and `tests/background/handlers.test.ts` (Part 5's `axt:translate`,
  this part's `axt:entry-settings`) and `src/pdf-reader/ui/Menus.tsx` (Part 5's settings link at the old line 77, this
  part's first lines of `ServiceMenu`), and the design document (Part 5's §6.2, this part's §2.2 and §3). The panel in
  both shot sets frames the old popup; after the merge, `pnpm build && node tests/e2e/probes/floating-shots.mjs after`
  shoots it again with Part 4's popup in the frame, against the same `before` (the panel box then differs by the new
  popup's height, and nothing else should), and `pnpm e2e:floating` checks the panel with it.
- **For Part 7:** DESIGN §4.0c (the button's material, the mark inside the shadow root, the retry and the hint line by
  the page's colour scheme, `modes.css`'s two values held to the tokens by a test);
  `tests/e2e/probes/floating-shots.mjs` stays as the button's probe.

- [ ] **Step 6: Commit the record**

```bash
git add experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part6-floating.md
git commit -m "docs(ui): Part 6's record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add by name any file the review's fixes touched, in their own commit before this one.)

## Part 6: done

Executed task by task (an implementer and a reviewer per task, the controller's look at the shots), 2026-09-27, in
`.worktrees/redesign-floating` on `exp/ui-floating`, branched from 56d02f2d.

**Commits** (`56d02f2d..`): 0321bc78 the shots script, the "before" set (70) · cfb34e50 the figure placed below arXiv's
pinned header, so the viewer's control is not under it (70's fix: a centred tall figure had put it there, and the click
reached the header's link) · b2465587 the host sheet marked inside its shadow root, `EntrySettings.theme` (71) ·
0c9ca0d5 the floating button in the family's material, following the extension's appearance (72) · 10199000 the viewer's
control and bar, the failed block's retry and hint line, by the page's colour scheme (73) · b7107dfa the light
appearance checked under a dark system again (73's fix: its rewrite of 72's browser block had dropped the check) ·
de7af2ec the reader's service menu says a refused key (74) · and this record.

**Checks at de7af2ec**, each exit 0: the gate; `reader-pixels.mjs` 24 × ok (against the baseline Parts 1–3 were judged
against, copied in, never re-recorded); `reader-ui.mjs` 71 × ok; `e2e:floating` 22/22; `e2e:pdf` 26/26; `e2e:layout`
31/31; `e2e:image` 18/18; `e2e` 71/71; `e2e:a11y` 5/5 on its second run (the first stopped at "the whole paper
translated": the free translator had not settled under the machine's load; no finding either time — the extension adds
no accessibility problem in side, stack or only mode, and no contrast pair).

**The probe's comparison** (`floating-shots.mjs after`, 18 shots, no `MISSING`): 116 parts `same` — `state`,
`.axt-fb-main`, `.axt-fb-disc`, `.axt-fb-panel`, `.axt-fb-settings`, `.axt-fb-options`, `.axt-fb-lock`,
`.axt-fb-panel-box` in every shot: the button's shape, place and states unchanged (§7). `differs` only where the plan
allows: the tooltip `.axt-fb-main .axt-fb-tip` 69.1 × 26.9 → 61.4 × 23.4 (72 × 28 → 64 × 24.4 while opening; the
shared `.tip`'s measures), in all 12 shots that hold it; the close menu `.axt-fb-menu` 76 × 64 → 78 × 68 and its rows
68 × 28 → 70 × 30 (the reader's `.pop` rows), in the two menu shots.

**The look** (every pair at twice the pixels, both themes): the surfaces in the family's greys with their hairline;
the small discs gain a hairline ring; the menu reads as the reader's menus; the tick's green and the panel's frame as
before. The viewer's control is now lifted by the float shadow instead of an outline, and its bar a floating pill with
a shadow instead of a slab against the dialog's edge — light on arXiv's light paper, dark on its dark one. One change
for the maintainer to judge: the tooltip is dark in both themes (the shared `.tip`, as in the reader), so on arXiv's
dark theme it stands out less against the page than the white pill it replaces.

**The local review** (Codex, `--base 56d02f2d --scope branch`): no actionable finding.

**Otherwise than planned:** the reader's pixel baseline was not re-recorded in this worktree (the controller's ruling:
the copy Parts 1–3 were judged against, verified 24 × ok); the shots script places the figure below arXiv's pinned
header; the browser block checks the light appearance under an emulated dark system (both amended in the plan on the
main branch too).

**For the controller:** the shots are at `experiments/pdf-bilingual/out/floating/index.html` (18 pairs, git-ignored),
and the branch waits for the maintainer's look before it merges (§7). The merge meets Part 5 in three files, each in
another hunk: `src/entrypoints/background/handlers.ts` and `tests/background/handlers.test.ts` (Part 5's
`axt:translate`, this part's `axt:entry-settings`) and `src/pdf-reader/ui/Menus.tsx` (Part 5's settings link near the old
line 77, this part's first lines of `ServiceMenu`), and the design document (Part 5's §6.2, this part's §2.2 and §3). The
panel in both shot sets frames the old popup; after the merge, `pnpm build && node tests/e2e/probes/floating-shots.mjs
after` shoots it again with Part 4's popup in the frame, against the same `before` (the panel box then differs by the
new popup's height, and nothing else should), and `pnpm e2e:floating` checks the panel with it.

**For Part 7:** DESIGN §4.0c (the button's material, the mark inside the shadow root, the retry and the hint line by
the page's colour scheme, `modes.css`'s two values held to the tokens by a test); `tests/e2e/probes/floating-shots.mjs`
stays as the button's probe. Two faults seen on the way, outside this part, proposed to the maintainer as issues: a tall
figure whose top is scrolled under arXiv's header hides its viewer control (anchored to the figure's top corner since
#285); `lastDemoted` is never cleared when an engine recovers (the status can read an engine replaced by itself).
