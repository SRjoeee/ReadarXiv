# The extension's interface, redesigned: Part 3, the controls both pages add

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, once and first, every control the new popup (Part 4) and the new settings page (Part 5) are drawn
from — `Button`, `Kbd`, `Field` / `TextInput`, `Reveal`, `Radio`, `Segmented` (equal and fit), `MenuList` and the pages'
base — with the prototypes' measures, their tests, and a page to see and measure them in a real browser, while the old
popup, the old settings page and the reader keep every pixel.

**Architecture:** The controls live in `src/ui/controls/`, their looks in `src/styles/controls.css` (component rules in
`@layer components`, reduced motion and forced colours unlayered), every colour a role of `src/shared/tokens.ts`. The
reader's `ReaderMenu` moves there as `MenuList` and gains four optional things that change none of the reader's rows. The
pages' base is a `.ui` root class in `src/styles/ui.css` plus `trackModality()` in both pages' `main.tsx`; the old pages
have no `.ui` root, so nothing reaches them — a pixel probe proves it. A dev-only page, `controls.html` (built by
`wxt build --mode development`, left out of every release like the gallery), draws each control in each state, light and
dark side by side, in either language; `tests/e2e/probes/controls.mjs` measures it.

**Tech Stack:** WXT 0.21, React 19, TypeScript, Tailwind v4, Lucide 1.47, Vitest + happy-dom, Playwright (Chromium).

**Spec:** `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (the design; §n below is its).
The contract with Parts 4 and 5 is the main plan's last section, "## Part 3's interfaces"
(`experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign.md`); every name below is its. The prototypes the
measures come from are the maintainer's, local and never committed:
`/Users/cheongzhiyan/Downloads/readarxiv-test/design/extension-ui/` — `round-6/` (its `tools/build.py` chains round 5's
page, which chains rounds 1 to 4), `kbd-chip/`, `settings-2/` (`tools/extra.css` on settings-1's and round 1's styles).

## What Parts 4 and 5 use

Part 3's exported names and props, as this plan builds them; the plans of Parts 4 and 5 are aligned against this list.
Every control is in `src/ui/controls/`, every look in `src/styles/controls.css`, every colour a role of
`src/shared/tokens.ts`.

- **`Button`** (`@/ui/controls/Button`), with `type ButtonKind = 'brand' | 'neutral' | 'text' | 'raised'` and
  `type ButtonSize = 'lg' | 'md' | 'sm'`. Props: `kind = 'neutral'`, `size = 'md'`, `icon?: IconNode` (Lucide, 16 px,
  before the words), `shortcut?: string` (a `Kbd` after the words, on `brand` and `neutral` only, while enabled and not
  busy; the page decides where not to pass one), `disabled?: boolean` (`aria-disabled`, still focusable; its size's
  neutral ground — `button` at `sm` / `md`, `fill` at `lg` — with `ink-3` words; no press, no shortcut; a click and a
  form's submission refused), `busy?: boolean` (`aria-busy`; a turning loader in the icon's place, before the words when
  there is none; the words and the kind's look kept; no press, no shortcut; a click refused), and every `<button>` prop
  (`type`, `ref`, `style`, `popoverTarget`, `aria-*`, `data-*`, `className`). `raised` is the note's button, 26 px and
  10 px in whatever `size` says.
- **`Kbd`** (`@/ui/controls/Kbd`): `Kbd({ children })`, a `<kbd>` hidden from assistive technology.
- **`Field`, `TextInput`, `useField`** (`@/ui/controls/Field`): `Field({ label, hint?, error?, children? })`;
  `TextInput(props)` takes every `<input>` prop and its `id` / `aria-describedby` / `aria-invalid` from the Field
  around it; `useField(): { id: string; describedBy: string | undefined; invalid: boolean } | null` for a control of
  another kind (Part 5's combobox).
- **`Radio`, `radioKeys`** (`@/ui/controls/radio`): `Radio()`, the mark, the direct child of the element with
  `role="radio"` / `aria-checked` / `aria-disabled`; `radioKeys(values, value, can, choose, focus)` as Part 1 left it.
- **`Reveal`** (`@/ui/controls/Reveal`): `Reveal({ open, ...divProps })`; inert while closed; the focus is the caller's.
- **`Segmented`, `SegmentOption`** (`@/ui/controls/Segmented`): `Segmented<T>({ label, value, options, onChange,
  fit = false, size = 'md' | 'sm', iconsOnly = false })`; `SegmentOption<T> { value: T; label: string; icon?: ReactNode;
  title?: string; disabled?: boolean }` — `icon` is drawn as given (the popup's own display glyphs, or
  `<Icon node={…} size={14} />`).
- **`MenuList`, `MenuListItem`** (`@/ui/controls/MenuList`): `MenuList({ items, kind: 'listbox' | 'radios' | 'items',
  label, layout?: 'inline' | 'two-line', search?, noMatch?, onPick(id), onAction?(id), onClose() })`;
  `MenuListItem { id; name; hint?; checked?; disabled?; keywords?; separatorBefore?; lang?: string; action?: { label:
  string; busy?: boolean }; preview?: CSSProperties; manage?: true }`. **The action API:** a row with an `action` is
  picked for its action — a click, Enter or Space on it calls `onAction(id)`, never `onPick`, whether the row is
  `disabled` (the Chrome pack's download: disabled, still run) or not; the keys reach such a row though it is disabled;
  while `busy` a loader stands in the button's place, the row carries `aria-busy="true"` and a pick does nothing (the
  caller's `hint` carries the words, as the pack's "downloading" hint does). A disabled row with an action is operable, so it carries no
  `aria-disabled`: it is greyed by the class `unavailable` (as built in Task 19's fix round; a disabled row without an
  action keeps `aria-disabled="true"`). `onAction` is needed wherever an item has an action — a missing one is a silent
  no-op, so each page tests its action row through the DOM. On the active row the button takes the
  `lift` ground. `lang` marks the row's own words: its name, or, in a row with a `preview`, the sample (the name there is
  the interface's). `checked` is the choice (the old `MenuItem` said `selected`); `manage` is the last row, which leads
  to managing the list: a separator before it, `ink-2`, never checked, picked with `onPick`.
- **Part 1's, unchanged**: `Popover` / `usePopover` (`@/ui/controls/Popover`), `useTip` (`@/ui/controls/tip`),
  `Switch`, `Icon`, `trackModality` (`@/ui/controls/modality`), `withoutTransitions` (`@/ui/controls/transitions`).
- **The pages' base**: the class `ui` on a page's own root element (the new popup's `<main>`, the new settings page's
  root), which paints no ground — each page paints its own (`bg-chrome`, `bg-page`); `trackModality()` already runs in
  both pages' `main.tsx`.
- **Tokens and utilities**: two new roles, `group-hover` (n-3 in both themes: a hovered or open row in the popup's group)
  and `on-brand-2` (white 85 % in light, white in dark: P0's paper id), with their contrast pairs. `ui.css` maps every
  colour role as `--color-<role>` (`bg-group-hover`, `text-ink-2`, `text-on-brand-2`, `bg-page` …; the hairline is
  `chrome-line`, since `line` stays the old pages' until Part 7) and the shadows as `shadow-{page,float,pop,card,raised}`.
  A third role, `tip-shadow` (the tooltip's shadow, its value unchanged: `0 4px 12px oklch(0 0 0 / 0.2)`), is what `.tip`
  draws now, and `--axt-tip-shadow` in a shadow root (Task 21). The parallel parts add no token: a role either page
  needs later is raised with the controller.
- **`useRejected`** (`@/ui/use-rejected`, Task 21): `useRejected(): readonly string[]`, the ids of the services whose key
  the endpoint refused — subscribed with `watchRejected` first, read with `rejectedServices()` after (a read an event
  overtook is dropped; a failed read leaves `[]` and logs one fixed line), let go on unmount. For the settings page and
  the reader; the popup's state keeps its own copy of the logic.
- **Motions and classes**: `@keyframes words-in` (the reader's, moved into `controls.css`: use
  `animation: words-in 180ms ease-out`) and `@keyframes turn` with the class `.spin` (a loader turning, still under
  reduced motion). Parts 4 and 5 do not reuse for their own controls the class names `ui`, `btn`, `kbd`, `field`,
  `field-hint`, `field-error`, `input`, `radio`, `reveal`, `spin`, nor the reader's `seg`, `pop`, `tip`, `switch`,
  `swatch`.
- **For their probes**: `tests/e2e/probes/align.mjs` — `offCentre(page, { rows, items?, tolerance? })`,
  `edges(page, { items, frame, side? })`, `shootEach(page, selector, dir, name, key)`; and the controls sheet
  (`src/entrypoints/controls/`, `pnpm exec wxt build --mode development`) to add a specimen to when a page's own control
  is worth seeing alone.

## The controller's rulings this plan builds

`.superpowers/sdd/2026-09-26-extension-ui-redesign/plan-rulings.md`, rulings 1–11, and the main plan's amended "Part
3's interfaces" (5e1274c1). No question is open.

| Ruling | What | Task |
|---|---|---|
| 1 | `MenuListItem.lang`, on the name (on the sample in a style row) | 19 |
| 2 | `Button`'s `busy` | 16 |
| 3 | `words-in` moved into `controls.css`, the reader's probe 24 × `ok` | 14 |
| 4 | a disabled button on its size's neutral ground, `ink-3` words | 16 |
| 5 | the `lift` ground for a menu row's action on the active row | 19 |
| 6 | `ui` paints no ground | 14 |
| 7 | `shortcut` on `brand` and `neutral` | 16 |
| 8 | `raised` 26 px whatever the size | 16 |
| 9 | the roles `group-hover` and `on-brand-2`, and their contrast pairs | 14 |
| 10 | `Segmented`'s `icon` a `ReactNode` | 18 |
| 11 | `MenuList`'s action API, fixed and documented | 19 |
| main plan, ce960723 | the role `tip-shadow` in `.tip`; the hook `useRejected` | 21 |

**A correction to ruling 1's premise.** The first draft reported that the style menu's Chinese sample drew in another
CJK face under the English interface. Re-checked on the scratch copy, it does not: the menu's shot under the English
interface is byte-identical with and without `lang="zh-CN"` on the sample, and its glyphs match the Chinese interface's.
The draft misread the sample's first character. `lang` is built all the same, for what it does do: a screen reader reads
a language's own name in that language, and on a system whose CJK fallback face is not a Chinese one (a Japanese system)
the sample takes a Chinese face.

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
  `src/entrypoints/gallery/main.tsx`, `src/entrypoints/gallery/reader-break.tsx` or the untracked
  `experiments/pdf-bilingual/spikes/geometry-lock*.mjs` / `prompt-ablation.mjs` (another session's work).
- Every commit message is `type(scope): summary` and ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Part 3's own:

- **Part 3 changes nothing a reader can see.** The old popup and the old settings page keep every pixel
  (`node tests/e2e/probes/pages-pixels.mjs`: 12 lines of `ok`, against the baseline Task 14 records before anything
  else), and so does the reader (`reader-pixels.mjs`: 24 lines of `ok`, Part 1's count), after every task.
- **The browser check of every task from 15 on:** `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`,
  every line `ok`, exit 0. The development build lands in `.output/chrome-mv3-dev`; the release build stays
  `.output/chrome-mv3`.
- **Class names.** Each control's classes compound with its own (`.btn.brand`, `.pop .item.two`), so nothing here
  reaches an element that is not one of these controls. Parts 4 and 5 do not reuse, for their own controls, `ui`, `btn`,
  `kbd`, `field`, `field-hint`, `field-error`, `input`, `radio`, `reveal`, `spin`, nor the reader's `seg`, `pop`, `tip`,
  `switch`, `swatch`.
- **The controls are self-contained.** Nothing in `src/ui/controls/` imports an entry point, a page or a locale pack; a
  control's words are its caller's. They draw no Tailwind utility but the few `MenuList` brings from the reader:
  `reader.css` scans `src/ui/controls/` from Task 19, so a utility written there joins the reader's sheet.
- **No CJK in any file this part writes** (the plan included): the controls sheet reads its words from the packs, and
  the probes find controls by role, class and data attribute. No entry in `scripts/english-allowlist.txt` changes.
- **A dev page never reaches a release**: `wxt.config.ts` `DEV_PAGES` leaves the gallery and the controls sheet out of
  every production build, and `scripts/check-output.mjs` fails a release that holds one.

## Review Focus

- **A disabled button that submits a form.** `aria-disabled` keeps it focusable, but the browser still submits its
  form on a click; a reader pressing a greyed connect must not send anything. Pinned in Task 16 (a disabled
  `type="submit"` `Button` inside a form submits nothing; an enabled one does).
- **A segmented control given a value none of its options holds** (a stored display the page no longer offers). No
  thumb is drawn, the first segment that can be chosen is the tab stop, so the group stays reachable, and the arrows
  choose from it. Pinned in Task 18.
- **An action pressed again while it runs** — the Chrome pack's download row while it downloads, a connect button
  while it connects. Nothing happens: no second download, no second connection, no choice. Pinned in Task 16 (a busy
  `Button` refuses its click) and Task 19 (a busy row does nothing).
- **Windows' contrast themes (forced colours).** Box-shadows are dropped there, and with them the radio's ring, the
  field's edge and a grounded button's shape. Each is redrawn in system colours. Pinned in Task 16 (buttons) and
  Task 17 (radio, field).
- **English words at the popup's width.** The pair "translate again" (with its shortcut) and "show original", the two
  entries, and the display control must hold their words at 296 px, where Chinese is shorter. Pinned in Task 16 and
  Task 18 (the controls probe, in English: nothing runs over its control).

## Where the sources differ, and what this plan draws

The instruction is §2.1's roles first, then the prototypes' measures; where the interface and a prototype differ, the
choice and its reason:

1. **Neutral grounds** (§2.1): a small or medium neutral button on `button` (settings-2's `.btn-n`), a large one on
   `fill` (round 4's `.primary.neutral`), as the interface says.
2. **The menu's download button.** Round 4 calls it "a neutral button" and §2.1 names it `button`; the popup prototype
   drew it raised (n-0 and a hairline). The plan draws the `button` ground at the prototype's measure — 24 px, 9 px in,
   radius 6, 12 px / 500 — not `sm`'s 28 px: in a 40 px row the prototype leaves 8 px above and below it. On the active
   row it takes `lift` (ruling 5): in dark `button` equals the row's `fill`.
3. **The note's raised button** keeps round 4's measure whatever `size` asks: 26 px, 10 px in, radius 7,
   12.5 px / 500. The interface names no size for it.
4. **`md`'s radius is 8**, as the interface steps the sizes (36 / 9, 32 / 8, 28 / 7); settings-2's form bar inherited
   round 1's 9 without a decision.
5. **`lg` has no padding**: it always fills a width (round 6's `.primary` has none). With 16 px, the English pair would
   not fit its half of the popup (Review Focus).
6. **Text buttons**: both prototypes draw them 10 px in, radius 7, in the page's weight (400) — 32 px in a form's bar
   (settings-2 `.textbtn`), 28 px under the popup's primary (round 4 `.text-btn`). The plan draws them so at `md` and
   `sm`.
7. **Equal segments are the reader's `.seg`** (12 px in), as §2.3 and §6.4 say; settings-2's copy of round 1 had 10.
   Fit segments are 8 px in (round 3). An icon and its words 6 px apart (round 1).
8. **Menu rows are the reader's** (30 px, radius 8, 13 px, a 14 px check) in every menu; round 4's two lines (at least
   40 px, 5 px above and below, the hint 11.5 px in `ink-2`) on top. The prototypes' 16 px tick column is the reader's
   14 px check. settings-2's model list (30 px, radius 7, 12.5 px) is Part 5's combobox; it can reuse `.pop .item`.
9. **A two-line hint wraps** (round 4's English Chrome row takes two lines); the name keeps one line, cut short.
10. **A field at fault** has the danger's edge (the interface); settings-2 showed only the reason beside its button. The
    reason under the field is round 4's action-failure line: 12 px in `ink` after a 14 px `danger` icon, 6 px apart.
11. **A disabled button takes the neutral grey of its size** (ruling 4): `fill` at `lg`, the one size the prototypes
    draw disabled, and `button` at `md` and `sm` — `fill` there drew a disabled small button darker than an enabled one
    in light (n-3 against n-2, seen on the controls sheet while drafting). The prototype's one-step-darker dark ground
    for a disabled large button is not taken: no token holds it, and none is added.
12. **A shortcut label off the brand is the ink's 9 %** (the interface, round 4); round 5's search row had 8 %.
13. **A segment's title** is the family's tooltip (`useTip`) and the segment's description to a screen reader; the old
    popup's native `title` goes with the old popup.

## How the controls are seen before Parts 4 and 5 use them

A dev-only page, `src/entrypoints/controls/` (`controls.html`), draws every control in each of its states, light and
dark side by side, in the language `?lang=` names, on the pages' own sheet (`ui.css`), and
`tests/e2e/probes/controls.mjs` measures it in Chromium with the extension loaded. Why this, and not the other two:

- **The gallery** renders the popup's states from the fixtures, not controls, and carries an uncommitted local edit
  that must never be committed; a task that changed it would tangle with that edit.
- **Injecting into the built `popup.html` / `options.html`** would share the documents with the old pages' own React
  apps, and the controls need live React for their states (a thumb sliding, a reveal opening, a menu's keys). The
  controls page is a sibling extension page that imports the same `ui.css` through the same pipeline: the same context.
- It stays out of every release: `wxt.config.ts` keeps dev pages in development builds only (`wxt`, and
  `wxt build --mode development` for the probe), and `scripts/check-output.mjs` fails a release that holds one.

## Files

| File | Task | Responsibility |
|---|---|---|
| `tests/e2e/probes/pages-pixels.mjs` (new) | 14 | The old popup's and settings page's pixels, recorded before Part 3, compared after each task |
| `tests/styles/css-rules.ts` (new), `tests/styles/reader-sheet.test.ts` | 14 | A sheet read as rules, shared by the sheet tests |
| `src/styles/ui.css`, `tests/styles/ui-sheet.test.ts` | 14 | The pages' base under `.ui`; the roles as Tailwind utilities |
| `src/shared/tokens.ts`, `src/styles/tokens.css` (generated), `tests/shared/{tokens,contrast}.test.ts` | 14 | The roles `group-hover` and `on-brand-2`, and their pairs |
| `src/entrypoints/pdf-reader/reader.css` | 14, 19 | `words-in` leaves it (14); it scans `src/ui/controls/` (19) |
| `src/entrypoints/popup/main.tsx`, `src/entrypoints/options/main.tsx` | 14 | `trackModality()` before the first paint |
| `wxt.config.ts`, `scripts/check-output.mjs`, `docs/DESIGN.md` | 15 | Dev pages in development builds only; a release checked for them |
| `src/entrypoints/controls/{index.html,main.tsx,sheet.css}`, `specimens/{index.ts,base.tsx}` (new) | 15 | The controls sheet |
| `tests/e2e/probes/align.mjs` (new) | 15 | Centre lines, edges and shots, ported from the prototypes' tools, for Parts 3 to 5 |
| `tests/e2e/probes/controls.mjs` (new) | 15–19 | The controls measured in a real browser |
| `src/ui/controls/{Button,Kbd}.tsx`, `specimens/buttons.tsx`, `tests/ui/controls/button.test.ts` | 16 | Buttons and shortcut labels |
| `src/styles/controls.css`, `tests/styles/controls-sheet.test.ts` (new) | 14–19 | The controls' looks and motions, pinned |
| `src/ui/controls/{Field,Reveal}.tsx`, `src/ui/controls/radio.ts`, `specimens/forms.tsx`, `tests/ui/controls/forms.test.ts` | 17 | Fields, radios, reveals |
| `src/ui/controls/Segmented.tsx`, `specimens/segmented.tsx`, `tests/ui/controls/segmented.test.ts` | 18 | Segmented controls, equal and fit |
| `src/ui/controls/MenuList.tsx` (moved from `src/pdf-reader/ui/ReaderMenu.tsx`), `src/pdf-reader/ui/Menus.tsx`, `specimens/menus.tsx`, `tests/ui/controls/menu-list.test.ts` | 19 | The menus' rows, shared |
| `src/ui/use-rejected.ts` (new), `tests/ui/use-rejected.test.ts` (new); `src/shared/tokens.ts`, `src/styles/controls.css` | 21 | The refused-key record as a hook; the tooltip's shadow as a role |
| this plan | 20 | Part 3's record, after Task 21 |

`specimens/…` is `src/entrypoints/controls/specimens/…`.

---

### Task 14: the pages' base — its class, its utilities, two roles and a motion — with the old pages' pixels held

**Files:**
- Create: `tests/e2e/probes/pages-pixels.mjs`
- Create: `tests/styles/css-rules.ts`
- Modify: `tests/styles/reader-sheet.test.ts` (its local `rules` function goes to `css-rules.ts`)
- Modify: `src/styles/ui.css` (after the existing `@theme inline { … }` block)
- Modify: `src/shared/tokens.ts` (two roles), `src/styles/tokens.css` (regenerated by `pnpm tokens`)
- Modify: `src/entrypoints/pdf-reader/reader.css`, `src/styles/controls.css` (`words-in` moves)
- Modify: `src/entrypoints/popup/main.tsx`, `src/entrypoints/options/main.tsx`
- Test: `tests/styles/ui-sheet.test.ts`, `tests/shared/tokens.test.ts`, `tests/shared/contrast.test.ts`,
  `tests/styles/controls-sheet.test.ts` (new)

**Interfaces:**
- Consumes: `trackModality(doc?: Document): () => void` (`@/ui/controls/modality`, Part 1); the tokens of `tokens.css`.
- Produces:
  - the class `ui` for a page's own root element: the extension's font (13 px / 1.4 `--font`) in `ink`, buttons
    with the pointer cursor, `[aria-disabled="true"]` with the default one, the keyboard's ring on `:focus-visible`
    (2 px `--focus`, offset 2), a text field's ring at offset 0 and none while `html[data-axt-pointer]` stands. It paints
    no ground (ruling 6): each page paints its own;
  - the roles `group-hover` (`$n-3` in both themes, beside `group`) and `on-brand-2` (`oklch(1 0 0 / 0.85)` light,
    `oklch(1 0 0)` dark, beside `on-brand`) in `src/shared/tokens.ts` and the generated sheet (`--group-hover`,
    `--on-brand-2`), held by the contrast gate: `ink` / `ink-2` on `group-hover` ≥ 4.5, `ink-3` on it ≥ 3, `on-brand-2`
    on `brand` ≥ 4.5, both themes (ruling 9);
  - Tailwind utilities for the pages' layouts, in `ui.css`: `--color-{canvas, chrome, chrome-line, line-strong, ink,
    ink-2, ink-3, fill, well, lift, float, focus, danger, success, mark, page, group, group-hover, field, field-edge,
    button, button-danger, button-raised, brand, on-brand, on-brand-2, brand-chip}` and
    `--shadow-{page, float, pop, card, raised}`. The hairline is `chrome-line` on the pages: `line` stays the old pages'
    (`--axt-line`) until Part 7;
  - `@keyframes words-in` in `controls.css`, moved from `reader.css` unchanged with its reduced-motion twin (ruling 3):
    `animation: words-in 180ms ease-out` on any page;
  - `tests/styles/controls-sheet.test.ts` with its helper `of(selector, within?)` and the at-rule lists `C` and `RM`
    (Task 16 adds `HOVER` and `FC`), to which Tasks 16 to 19 add their tests;
  - `trackModality()` running in the popup's and the settings page's documents from before their first paint;
  - `tests/styles/css-rules.ts`: `interface Rule { selector: string; body: string; within: string[] }`,
    `sheet(...paths: string[]): string`, `rules(css: string): Rule[]`, `declarations(body: string): Record<string, string>`,
    `ruleOf(all: Rule[], selector: string, within: string[]): Record<string, string>`;
  - `node tests/e2e/probes/pages-pixels.mjs [--baseline]`: exits 1 when the build's old pages differ from the record.

- [ ] **Step 1: Write the old pages' pixel probe**

`tests/e2e/probes/pages-pixels.mjs`:

```js
// The popup's and the settings page's pixels, held while the redesign adds its shared controls (Part 3): the old pages
// have no `ui` root, and nothing Part 3 adds may reach them. `--baseline` records the build as it draws them — the
// popup's page off a paper, and each section of the settings page, in light and dark; without it, the build is compared
// with that record byte for byte, and whatever differs fails, both copies kept for a look. Build first.
//   pnpm build && node tests/e2e/probes/pages-pixels.mjs [--baseline]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/pages-pixels', import.meta.url))
const PROFILE = `${E2E}.profile-pages-pixels`
const recording = process.argv.includes('--baseline')
const base = join(OUT, 'baseline')
const dir = recording ? base : join(OUT, 'current')
if (!recording && !existsSync(base)) throw new Error('no baseline: run with --baseline on the build before Part 3')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })

/** the settings page's sections, by the hash it opens each at (entrypoints/options/App.tsx) */
const SECTIONS = ['services', 'reading', 'pdf-reader', 'prompts', 'data']
const STILL = { animations: 'disabled', caret: 'hide' }

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  viewport: { width: 1100, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
const save = (name, bytes) => writeFileSync(join(dir, name), bytes)
/** a page opened afresh: the settings page reads its section from the hash once, as it loads */
async function open(path, ready) {
  await page.goto('about:blank')
  await page.goto(`chrome-extension://${id}/${path}`)
  await page.waitForSelector(ready)
  await page.waitForTimeout(800)
  await page.mouse.move(0, 0)
}

for (const scheme of ['light', 'dark']) {
  // the theme is the system's in a fresh profile: the colour scheme picks light or dark
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 360, height: 640 })
  await open('popup.html', 'main')
  save(`${scheme}-popup.png`, await page.locator('main').screenshot(STILL))
  await page.setViewportSize({ width: 1100, height: 900 })
  for (const section of SECTIONS) {
    await open(`options.html#${section}`, 'nav')
    save(`${scheme}-options-${section}.png`, await page.screenshot({ fullPage: true, ...STILL }))
  }
}
await context.close()

let failed = errors.length
for (const e of errors) console.log(`FAIL page error — ${e}`)
if (recording) console.log(`baseline recorded: ${readdirSync(base).length} files in ${base}`)
else {
  for (const name of readdirSync(base)) {
    const same = existsSync(join(dir, name)) && readFileSync(join(base, name)).equals(readFileSync(join(dir, name)))
    console.log(`${same ? 'ok  ' : 'FAIL'} ${name}`)
    if (!same) failed++
  }
}
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Record the old pages as they are, before anything else in this part**

Run: `pnpm build && node tests/e2e/probes/pages-pixels.mjs --baseline`
Expected: `baseline recorded: 12 files in …/experiments/pdf-bilingual/out/pages-pixels/baseline`, exit 0.

Run: `node tests/e2e/probes/pages-pixels.mjs && node tests/e2e/probes/pages-pixels.mjs`
Expected: twice 12 lines of `ok`, exit 0. A `FAIL` here means the capture is not deterministic (a count still loading,
a hover left behind): find which shot moves and hold it still before going on; every later task rests on this record.
The record is not committed (`experiments/pdf-bilingual/.gitignore` holds `out/`).

- [ ] **Step 3: Share the sheet parser**

`tests/styles/css-rules.ts`:

```ts
// A style sheet read as its rules, for the tests that hold a sheet to its design (the reader's, the pages', the shared
// controls'): each rule's selector, its declarations and the at-rules it sits in. Moved out of reader-sheet.test.ts
// for the redesign's Part 3, whose sheet tests read the same way
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Rule { selector: string; body: string; within: string[] }

/** the files' text (paths relative to tests/styles), joined, comments removed */
export function sheet(...paths: string[]): string {
  return paths.map(p => readFileSync(join(import.meta.dirname, p), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** every style rule: its selector, its declarations, and the at-rules it sits in (a statement ends at `;`) */
export function rules(css: string): Rule[] {
  const out: Rule[] = []
  const stack: string[] = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === ';') start = i + 1
    else if (c === '}') { stack.pop(); start = i + 1 }
    else if (c === '{') {
      const prelude = css.slice(start, i).trim()
      if (prelude.startsWith('@')) { stack.push(prelude); start = i + 1; continue }
      const end = css.indexOf('}', i)
      out.push({ selector: prelude, body: css.slice(i + 1, end), within: [...stack] })
      i = end
      start = end + 1
    }
  }
  return out
}

/** a rule's declarations, property to value, each value's white space folded to one space */
export function declarations(body: string): Record<string, string> {
  return Object.fromEntries(body.split(';').map(d => d.trim()).filter(Boolean).map(d => {
    const at = d.indexOf(':')
    return [d.slice(0, at).trim(), d.slice(at + 1).trim().replace(/\s+/g, ' ')]
  }))
}

/** the declarations of the one rule with exactly `selector` inside exactly the at-rules `within`; throws unless there is one */
export function ruleOf(all: Rule[], selector: string, within: string[]): Record<string, string> {
  const found = all.filter(r => r.selector === selector && r.within.join(' | ') === within.join(' | '))
  if (found.length !== 1) throw new Error(`${found.length} rules "${selector}" within [${within.join(', ')}]`)
  return declarations(found[0]!.body)
}
```

In `tests/styles/reader-sheet.test.ts`: delete the block from the comment line
`/** every style rule: its selector, its declarations, and the at-rules it sits in (a statement ends at `;`) */`
through the closing `}` of `function rules(css: string) { … }` (the function returning `out`), and after the line
`import { describe, expect, it } from 'vitest'` add:

```ts
import { rules } from './css-rules'
```

Run: `pnpm vitest run tests/styles/reader-sheet.test.ts`
Expected: PASS, 5 tests, as before.

- [ ] **Step 4: Write the failing tests of the base, the roles and the motion**

In `tests/styles/ui-sheet.test.ts`, after the line `import { describe, expect, it } from 'vitest'` add:

```ts
import { ruleOf, rules } from './css-rules'
```

and at the end of the file add:

```ts
// The pages' base (Part 3's interfaces): what a root marked `ui` gives the controls inside it, and nothing to a page
// without one — the old popup and settings page have none (tests/e2e/probes/pages-pixels.mjs holds their pixels)
describe('ui.css: the pages\' base', () => {
  const all = rules(SHEET)
  const BASE = ['@layer base']

  it('reaches only what sits in a root marked ui, and paints no ground: each page paints its own', () => {
    expect(all.filter(r => r.within.join(' | ') === '@layer base').map(r => r.selector)).toEqual([
      '.ui',
      '.ui button',
      '.ui [aria-disabled="true"]',
      '.ui :focus-visible',
      '.ui :is(input, textarea):focus-visible',
      'html[data-axt-pointer] .ui :is(input, textarea):focus-visible',
    ])
    expect(Object.keys(ruleOf(all, '.ui', BASE)).some(p => p.startsWith('background'))).toBe(false)
  })

  it('draws the extension\'s font and ink, and rings the keyboard\'s focus in 2 px of the focus ink, 2 px off', () => {
    expect(ruleOf(all, '.ui', BASE)).toEqual({ color: 'var(--ink)', font: '13px/1.4 var(--font)', '-webkit-font-smoothing': 'antialiased' })
    expect(ruleOf(all, '.ui :focus-visible', BASE)).toEqual({ outline: '2px solid var(--focus)', 'outline-offset': '2px' })
  })

  it('rings a text field hugging it, and not under the pointer, whose caret and edge say where the focus is', () => {
    expect(ruleOf(all, '.ui :is(input, textarea):focus-visible', BASE)).toEqual({ 'outline-offset': '0' })
    expect(ruleOf(all, 'html[data-axt-pointer] .ui :is(input, textarea):focus-visible', BASE)).toEqual({ outline: 'none' })
  })

  it('names every role for the pages\' own layouts, and keeps the old pages\' names as they are', () => {
    const colours = ['canvas', 'chrome', 'chrome-line', 'line-strong', 'ink', 'ink-2', 'ink-3', 'fill', 'well', 'lift', 'focus', 'danger', 'success', 'mark', 'page', 'group', 'group-hover', 'field', 'field-edge', 'button', 'button-danger', 'button-raised', 'brand', 'on-brand', 'on-brand-2', 'brand-chip']
    for (const role of colours) expect(SHEET).toContain(`--color-${role}: var(--${role});`)
    expect(SHEET).toContain('--color-float: var(--float-bg);')
    for (const shadow of ['page', 'float', 'pop', 'card', 'raised']) expect(SHEET).toContain(`--shadow-${shadow}: var(--${shadow}-shadow);`)
    expect(SHEET).toContain('--color-line: var(--axt-line);')
  })
})
```

In `tests/shared/tokens.test.ts`, inside `describe('the token source', …)`, after the test that starts
`it('keeps the reader\'s ramp and roles as the reader\'s design §4.1 set them'`, add:

```ts
  it('holds the two roles the pages add (Part 3; ruling 9): a hovered or open row in the popup\'s group, and P0\'s paper id', () => {
    const both = (name: string) => [resolve(name, 'light'), resolve(name, 'dark')]
    expect(both('group-hover')).toEqual(both('n-3'))
    expect(both('on-brand-2')).toEqual(['oklch(1 0 0 / 0.85)', 'oklch(1 0 0)'])
  })
```

In `tests/shared/contrast.test.ts`, replace the pair

```ts
  { what: 'P0\'s paper id at 85 % white, light only (§5.4)', fg: 'oklch(1 0 0 / 0.85)', bg: ['brand'], floor: 4.5, modes: ['light'] },
```

with:

```ts
  { what: 'P0\'s paper id: on-brand-2, 85 % white in light and white in dark (§5.4)', fg: 'on-brand-2', bg: ['brand'], floor: 4.5 },
```

and after the pair `{ what: 'a chevron in the popup\'s group', fg: 'ink-3', bg: ['group'], floor: 3 },` add:

```ts
  { what: 'a hovered or open row\'s label in the popup\'s group', fg: 'ink', bg: ['group-hover'], floor: 4.5 },
  { what: 'a hovered or open row\'s value', fg: 'ink-2', bg: ['group-hover'], floor: 4.5 },
  { what: 'a hovered or open row\'s chevron', fg: 'ink-3', bg: ['group-hover'], floor: 3 },
```

(Measured while this plan was drafted: `on-brand-2` on `brand` 5.65 light, 5.14 dark; on `group-hover`, `ink` 13.77 /
12.25, `ink-2` 4.85 / 5.76, `ink-3` 3.01 / 3.19 — the chevron holds its floor, only just, in light.)

`tests/styles/controls-sheet.test.ts`:

```ts
// The shared controls' sheet (src/styles/controls.css): what Part 3 adds, its values as the prototypes and the design
// agreed them (the redesign's design, §2.1, §5, §6, §8; Part 3's interfaces) — a change to one is a change to the design,
// made there first
import { describe, expect, it } from 'vitest'
import { ruleOf, rules, sheet } from './css-rules'

const all = rules(sheet('../../src/styles/controls.css'))
const C = ['@layer components']
const RM = ['@media (prefers-reduced-motion: reduce)']
const of = (selector: string, within = C) => ruleOf(all, selector, within)

describe('controls.css: the motions both pages share', () => {
  it('holds the reader\'s words-in, moved here unchanged: 3 px up and in, a fade alone under reduced motion (ruling 3)', () => {
    expect(of('from', ['@keyframes words-in'])).toEqual({ opacity: '0', translate: '0 3px' })
    expect(of('from', [...RM, '@keyframes words-in'])).toEqual({ opacity: '0' })
  })

  it('leaves the reader\'s sheet without a copy of its own, its capsule still naming it', () => {
    const reader = sheet('../../src/entrypoints/pdf-reader/reader.css')
    expect(reader).not.toContain('@keyframes words-in')
    expect(reader).toMatch(/\.capsule \.words \{[^}]*animation: words-in 180ms ease-out/)
  })
})
```

- [ ] **Step 5: Run them to verify they fail**

Run: `pnpm vitest run tests/styles tests/shared`
Expected: FAIL — in `ui-sheet.test.ts` the base's selector list is empty and `ruleOf` throws
`0 rules ".ui" within [@layer base]`, and `--color-ink: var(--ink);` is not in the sheet (its three existing tests
pass); `tokens.test.ts` throws `no token named group-hover`; `contrast.test.ts` fails the six new pairs' tests (`no token
named on-brand-2`, `no token named group-hover`); `controls-sheet.test.ts` throws `0 rules "from" within
[@keyframes words-in]`.

- [ ] **Step 6: Write the base and the utilities**

In `src/styles/ui.css`, after the closing `}` of the existing `@theme inline { … }` block (the one ending with
`--font-ui: system-ui, "PingFang SC", "Noto Sans SC", sans-serif;`) and before
`@keyframes axt-spin { to { transform: rotate(360deg); } }`, add:

```css
/* the roles as Tailwind's colours and shadows, for the pages' own layouts (the redesign's design, §2.2), under the
   reader's names (reader.css) — but the hairline is `chrome-line`: `line` is the old pages' until Part 7 retires them */
@theme inline {
  --color-canvas: var(--canvas); --color-chrome: var(--chrome); --color-chrome-line: var(--chrome-line); --color-line-strong: var(--line-strong);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-fill: var(--fill); --color-well: var(--well); --color-lift: var(--lift); --color-float: var(--float-bg);
  --color-focus: var(--focus); --color-danger: var(--danger); --color-success: var(--success); --color-mark: var(--mark);
  --color-page: var(--page); --color-group: var(--group); --color-group-hover: var(--group-hover); --color-field: var(--field); --color-field-edge: var(--field-edge);
  --color-button: var(--button); --color-button-danger: var(--button-danger); --color-button-raised: var(--button-raised);
  --color-brand: var(--brand); --color-on-brand: var(--on-brand); --color-on-brand-2: var(--on-brand-2); --color-brand-chip: var(--brand-chip);
  --shadow-page: var(--page-shadow); --shadow-float: var(--float-shadow); --shadow-pop: var(--pop-shadow); --shadow-card: var(--card-shadow); --shadow-raised: var(--raised-shadow);
}

/* the pages' base (Part 3's interfaces): a root marked `ui` — the new popup's, the new settings page's — draws in the
   extension's font and ink, its buttons take the pointer, and its focus is ringed for the keyboard alone: 2 px of the
   focus ink, 2 px off; a text field's ring hugs it, and there is none under the pointer, whose caret and edge say where
   the focus is (controls/modality.ts; the reader's `.chrome` does the same). It paints no ground: each page paints its
   own (the popup `chrome`, the settings page `page`). The old pages have no such root, and nothing here reaches them */
@layer base {
  .ui { color: var(--ink); font: 13px/1.4 var(--font); -webkit-font-smoothing: antialiased; }
  .ui button { cursor: pointer; }
  .ui [aria-disabled="true"] { cursor: default; }
  .ui :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .ui :is(input, textarea):focus-visible { outline-offset: 0; }
  html[data-axt-pointer] .ui :is(input, textarea):focus-visible { outline: none; }
}
```

- [ ] **Step 7: The two roles**

In `src/shared/tokens.ts`, in `ROLES`, after the line `group: '$n-2',` add:

```ts
  /** a hovered or open row in the popup's group (§5.1; the controller's ruling 9): a step under the group, both themes */
  'group-hover': '$n-3',
```

and after the line `'on-brand': 'oklch(1 0 0)',` add:

```ts
  /** words on the brand told apart from its words by a lighter white and their weight (P0's paper id, §5.4): 85 % white
   *  in light (5.65:1), white in dark, where 85 % read 4.10:1 */
  'on-brand-2': { light: 'oklch(1 0 0 / 0.85)', dark: 'oklch(1 0 0)' },
```

Run: `pnpm tokens && git diff --stat src/styles/tokens.css`
Expected: `src/styles/tokens.css` changed, 6 lines added (`--group-hover` and `--on-brand-2` in each of the three theme
blocks) and none removed.

- [ ] **Step 8: `words-in` moves to the shared sheet**

In `src/entrypoints/pdf-reader/reader.css`, delete the line
`@keyframes words-in { from { opacity: 0; translate: 0 3px; } }` and, inside the reduced-motion block below it that
holds `@keyframes capsule-in { from { opacity: 0; } }`, the line `  @keyframes words-in { from { opacity: 0; } }`.

In `src/styles/controls.css`, after the line
`@media (prefers-reduced-motion: reduce) { @keyframes pop-in { from { opacity: 0; } } }`, add:

```css
/* a line of words that takes another's place (the reader's capsule; the settings page's description, §8): 3 px up and
   in, 180 ms where it is named; a fade alone under reduced motion. Moved from reader.css unchanged (Part 3) */
@keyframes words-in { from { opacity: 0; translate: 0 3px; } }
@media (prefers-reduced-motion: reduce) { @keyframes words-in { from { opacity: 0; } } }
```

(The reader imports `controls.css` before its own rules: its capsule's `animation: words-in 180ms ease-out` finds the
same keyframes.)

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm vitest run tests/styles tests/shared`
Expected: PASS (`ui-sheet.test.ts` 7 tests, `reader-sheet.test.ts` 5, `controls-sheet.test.ts` 2, `tokens.test.ts` 5,
`contrast.test.ts` 31, `no-has.test.ts` as before).

- [ ] **Step 10: Both pages track the pointer's and the keyboard's turns from their first paint**

In `src/entrypoints/popup/main.tsx` and in `src/entrypoints/options/main.tsx`, after the line
`import { prepareFirstPaint } from '@/ui/first-paint'` add:

```ts
import { trackModality } from '@/ui/controls/modality'
```

and after the line that starts `await prepareFirstPaint(document.documentElement,` (the pages' one read of the settings
before their first paint, `src/ui/first-paint.ts`; the popup's ends `brand => brand)`, the settings page's
``brand => `${brand} · ${O.title}`)``) add:

```ts
// the pointer's turn and the keyboard's, from the first paint (the pages' base, Part 3): the new controls' text fields
// are ringed for the keyboard alone
trackModality()
```

(The old pages hold no rule keyed on `data-axt-pointer`: the mark changes nothing they draw.)

- [ ] **Step 11: Stage the files, run the gate and the pixel checks**

The English and boundary gates read the git index (`git ls-files`): a new file is checked only once it is staged, so
every task stages its files by name before its gate.

Run: `git add tests/e2e/probes/pages-pixels.mjs tests/styles/css-rules.ts tests/styles/reader-sheet.test.ts tests/styles/ui-sheet.test.ts tests/styles/controls-sheet.test.ts tests/shared/tokens.test.ts tests/shared/contrast.test.ts src/shared/tokens.ts src/styles/tokens.css src/styles/ui.css src/styles/controls.css src/entrypoints/pdf-reader/reader.css src/entrypoints/popup/main.tsx src/entrypoints/options/main.tsx && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

Run: `node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: 12 lines of `ok`, then 24 lines of `ok`, exit 0. A difference in the old pages means a rule reached them:
every new rule must sit under `.ui`, and every new utility name must be one the old pages do not write. A difference in
the reader's is the move of `words-in` or the two roles: compare `out/reader-pixels/{baseline,current}/<theme>-tokens.json`
first.

- [ ] **Step 12: Commit**

Run: `git status --short` — nothing staged but the fourteen files above.

```bash
git commit -m "feat(ui): the pages' base, two roles and the shared words-in, the old pages' pixels held

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 15: the controls sheet and its probe

**Files:**
- Modify: `scripts/check-output.mjs` (the release's checks)
- Modify: `wxt.config.ts` (the `entrypoints:found` hook)
- Modify: `docs/DESIGN.md` (the entry points' row of "Where things live")
- Create: `src/entrypoints/controls/index.html`, `main.tsx`, `sheet.css`, `specimens/index.ts`, `specimens/base.tsx`
- Create: `tests/e2e/probes/align.mjs`
- Create: `tests/e2e/probes/controls.mjs`

**Interfaces:**
- Consumes: the `.ui` base and `trackModality` (Task 14); `setLocale` (`@/ui/strings`), `LOCALE_CODES` (`@/locales`).
- Produces:
  - `controls.html?lang=zh-CN|en` in development builds only: two `<section class="ui half" data-theme="light|dark">`,
    each holding every entry of `SPECIMENS` as `<div data-specimen="<name>" class="specimen"><h2>…</h2>…</div>`;
    a row whose items must share a centre line carries `data-row`;
  - `SPECIMENS: { name: string; Specimen: FC }[]` in `src/entrypoints/controls/specimens/index.ts`, one entry per
    control, each task adding its own;
  - `tests/e2e/probes/align.mjs`, for this probe and Parts 4 and 5's:
    `offCentre(page, { rows: string, items?: string, tolerance?: number }): Promise<{ row: string; item: string; off: number }[]>`,
    `edges(page, { items: string, frame: string, side?: 'start' | 'end' }): Promise<number[]>`,
    `shootEach(page, selector: string, dir: string, name: (key: string) => string, key: string): Promise<void>`;
  - `tests/e2e/probes/controls.mjs` with the helpers `check`, `near`, `look`, `token` and the list `CHECKS`, to which
    Tasks 16 to 19 add one function each;
  - `wxt.config.ts` `DEV_PAGES = ['gallery', 'controls']`, dropped from production builds only.

- [ ] **Step 1: A release fails when it holds a dev page**

In `scripts/check-output.mjs`, in the array of `[what, ok]` checks, after the entry that starts
`` [`${NOTICES} lists what the recogniser's worker bundles`, `` and before the line `]) {`, add:

```js
  // the dev pages (wxt.config.ts DEV_PAGES) are for development builds: a release holding one would ship a debug page
  [`${OUT} holds no dev page`, !existsSync(join(OUT, 'gallery.html')) && !existsSync(join(OUT, 'controls.html'))],
```

Run: `pnpm build`
Expected: exit 0, with the line `✓ .output/chrome-mv3 holds no dev page` (the hook drops the gallery today).

- [ ] **Step 2: Keep the dev pages in development builds, and only there**

In `wxt.config.ts`, after the closing `}` of `function pdfjsFiles()`, add:

```ts
/**
 * The pages for development alone — the popup's states (gallery) and the shared controls (controls): a release must not
 * ship a debug page anyone can open, so a production build leaves them out; `wxt` and `wxt build --mode development`
 * (tests/e2e/probes/controls.mjs) keep them. scripts/check-output.mjs checks the release
 */
const DEV_PAGES = ['gallery', 'controls']
```

and replace:

```ts
  // The gallery is for `wxt` (serve) only: a release must not ship a debug page anyone can open
  hooks: {
    'entrypoints:found': (wxt, infos) => {
      if (wxt.config.command !== 'serve') {
        const at = infos.findIndex(info => info.name === 'gallery')
        if (at >= 0) infos.splice(at, 1)
      }
    },
```

with:

```ts
  hooks: {
    'entrypoints:found': (wxt, infos) => {
      if (wxt.config.mode !== 'production') return
      for (const name of DEV_PAGES) {
        const at = infos.findIndex(info => info.name === name)
        if (at >= 0) infos.splice(at, 1)
      }
    },
```

In `docs/DESIGN.md`, in the table of "Where things live", replace
`` `gallery/` (a dev page of UI states) `` with
`` `gallery/` and `controls/` (dev pages, never in a release: the popup's states, the shared controls) ``.

- [ ] **Step 3: Port the prototypes' measures into a library the probes share**

`tests/e2e/probes/align.mjs`:

```js
// Measuring a surface as the maintainer's standard asks (the redesign's design, §12): every item of a row on the row's
// centre line within 0.5 px, only the agreed leading and trailing edges, and a screenshot of each part. Ported from the
// prototypes' settings-2/tools/align-probe.mjs (the measures) and round-6/tools/shoot.mjs (the shots), taken from their
// pages' class names to selectors, for the controls sheet's probe (Part 3) and the popup's and the settings page's
// (Parts 4 and 5). The pages are left to right in every language they have
import { join } from 'node:path'

/**
 * The items of each row whose vertical centre lies more than `tolerance` px from the row's, as `{ row, item, off }`. A
 * row with no height, or inside an `inert` (a closed reveal), is passed over, and so is an item with no height
 */
export function offCentre(page, { rows, items = ':scope > *', tolerance = 0.5 }) {
  return page.evaluate(({ rows, items, tolerance }) => {
    const out = []
    for (const row of document.querySelectorAll(rows)) {
      const r = row.getBoundingClientRect()
      if (!r.height || row.closest('[inert]')) continue
      const mid = r.top + r.height / 2
      for (const item of row.querySelectorAll(items)) {
        const b = item.getBoundingClientRect()
        if (!b.height) continue
        const off = b.top + b.height / 2 - mid
        if (Math.abs(off) > tolerance) out.push({ row: (row.dataset.row || row.textContent || '').trim().slice(0, 24), item: String(item.getAttribute('class') ?? item.tagName), off: Math.round(off * 10) / 10 })
      }
    }
    return out
  }, { rows, items, tolerance })
}

/**
 * The distinct edges of `items` from the closest ancestor matching `frame`: `start` from its left, `end` from its right;
 * rounded to 0.5 px, sorted. A surface keeps a few agreed ones (the popup's 12 and 24; 14, 42 and 70 from a settings
 * card's start, 14 from its end)
 */
export function edges(page, { items, frame, side = 'start' }) {
  return page.evaluate(({ items, frame, side }) => {
    const found = new Set()
    for (const item of document.querySelectorAll(items)) {
      const b = item.getBoundingClientRect(), f = item.closest(frame)?.getBoundingClientRect()
      if (!b.width || !f || item.closest('[inert]')) continue
      found.add(Math.round((side === 'start' ? b.left - f.left : f.right - b.right) * 2) / 2)
    }
    return [...found].sort((a, b) => a - b)
  }, { items, frame, side })
}

/** A screenshot of each element matching `selector` into `dir`, named `name(<its data-<key> attribute>)` */
export async function shootEach(page, selector, dir, name, key) {
  const elements = page.locator(selector)
  const count = await elements.count()
  for (let i = 0; i < count; i++) {
    const element = elements.nth(i)
    const id = (await element.getAttribute(`data-${key}`)) ?? String(i)
    await element.screenshot({ path: join(dir, `${name(id)}.png`), animations: 'disabled', caret: 'hide' })
  }
}
```

- [ ] **Step 4: Write the probe, the base's checks first**

`tests/e2e/probes/controls.mjs`:

```js
// The shared controls in a real browser (the redesign's Part 3): the controls sheet (src/entrypoints/controls, a dev
// page) in both interface languages, light and dark side by side. Each specimen is shot at rest per language and theme
// into experiments/pdf-bilingual/out/controls/ (at twice the pixels: the 200 % look), every row's items are held to the
// row's centre line (align.mjs), and each control is measured against the values the prototypes agreed. The popup's and
// the settings page's own documents are checked for the pointer's and the keyboard's turns. Exits 1 on a failure or a
// page error. The sheet is in development builds only (wxt.config.ts DEV_PAGES):
//   pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { offCentre, shootEach } from './align.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/controls', import.meta.url))
const PROFILE = `${E2E}.profile-controls`
const SHEET = join(EXT, 'controls.html')
// a dev server's build loads its scripts from localhost, and is no use without the server
if (!existsSync(SHEET) || readFileSync(SHEET, 'utf8').includes('localhost')) throw new Error('no controls sheet: pnpm exec wxt build --mode development first')
rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const THEMES = ['light', 'dark']
let failed = 0
const check = (what, ok, detail = '') => {
  console.log(ok ? `ok   ${what}` : `FAIL ${what} — ${detail}`)
  if (!ok) failed++
}
const near = (a, b, tolerance = 0.5) => typeof a === 'number' && Math.abs(a - b) <= tolerance

/** what the first element matching `selector` draws (or its `pseudo`): its box and the styles the checks read; null when there is none */
const look = (page, selector, pseudo) => page.evaluate(([selector, pseudo]) => {
  const el = document.querySelector(selector)
  if (!el) return null
  const c = getComputedStyle(el, pseudo), r = el.getBoundingClientRect()
  return {
    tag: el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
    radius: c.borderTopLeftRadius, pad: c.paddingInlineStart, padBlock: c.paddingTop, size: c.fontSize, lineHeight: c.lineHeight, weight: c.fontWeight,
    bg: c.backgroundColor, color: c.color, shadow: c.boxShadow, scale: c.scale, opacity: c.opacity, visibility: c.visibility, align: c.textAlign, animation: c.animationName,
    ring: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineOffset}`, ringColor: c.outlineColor,
  }
}, [selector, pseudo ?? null])

/** `value` as a half's tokens resolve it for `property` (a probe element in the half, read and removed): what a check compares with */
const token = (page, theme, property, value) => page.evaluate(([theme, property, value]) => {
  const probe = document.createElement('i')
  probe.style.setProperty(property, value)
  document.querySelector(`[data-theme="${theme}"]`).append(probe)
  const out = getComputedStyle(probe).getPropertyValue(property)
  probe.remove()
  return out
}, [theme, property, value])

/** Task 15: the pages' base — ink on the chrome in the extension's font, the keyboard's ring and not the pointer's */
async function base(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"]`, tag = `${lang} ${theme}`
    const half = await look(page, at)
    const want = { bg: await token(page, theme, 'background-color', 'var(--chrome)'), color: await token(page, theme, 'color', 'var(--ink)') }
    check(`${tag}: ink on the chrome, 13 / 1.4`, half?.bg === want.bg && half.color === want.color && half.size === '13px' && half.lineHeight === '18.2px', JSON.stringify({ half, want }))
    const focus = await token(page, theme, 'outline-color', 'var(--focus)')
    // the keyboard from the specimen's heading: the link, then the field; then the pointer on the field
    await page.click(`${at} [data-specimen="base"] > h2`)
    await page.keyboard.press('Tab')
    const link = await look(page, ':focus')
    await page.keyboard.press('Tab')
    const field = await look(page, ':focus')
    await page.click(`${at} [data-specimen="base"] input`)
    const pressed = await look(page, ':focus')
    check(`${tag}: the keyboard's ring, 2 px of the focus ink 2 px off, hugging a field; none for the pointer's field`,
      link?.tag === 'A' && link.ring === 'solid 2px 2px' && link.ringColor === focus && field?.tag === 'INPUT' && field.ring === 'solid 2px 0px' && pressed?.ring.startsWith('none'),
      JSON.stringify({ link, field, pressed }))
  }
}

// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----
const CHECKS = [base]

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  // tall enough for the whole sheet and its menus: a popover past the window's foot is cut short in its shot
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host

// the popup's and the settings page's documents mark the pointer's turn and the keyboard's from their first paint
for (const path of ['popup.html', 'options.html']) {
  const page = await context.newPage()
  page.on('pageerror', e => check(`${path}: no page error`, false, e.message))
  await page.goto(`chrome-extension://${id}/${path}`)
  await page.waitForTimeout(800)
  await page.mouse.click(4, 4)
  const pointer = await page.evaluate(() => document.documentElement.hasAttribute('data-axt-pointer'))
  await page.keyboard.press('Tab')
  const keyboard = await page.evaluate(() => !document.documentElement.hasAttribute('data-axt-pointer'))
  check(`${path}: a press marks the pointer's turn, Tab the keyboard's (trackModality)`, pointer && keyboard)
  await page.close()
}

for (const lang of ['zh-CN', 'en']) {
  const page = await context.newPage()
  page.on('pageerror', e => check(`${lang}: no page error`, false, e.message))
  await page.goto(`chrome-extension://${id}/controls.html?lang=${lang}`)
  await page.waitForSelector('[data-specimen]')
  await page.waitForTimeout(300)
  // at rest: each specimen shot, every row's items on the row's centre line
  for (const theme of THEMES) await shootEach(page, `[data-theme="${theme}"] [data-specimen]`, OUT, name => `${lang}-${theme}-${name}`, 'specimen')
  const off = await offCentre(page, { rows: '[data-row]' })
  check(`${lang}: every row's items on its centre line, within 0.5 px`, off.length === 0, JSON.stringify(off))
  for (const run of CHECKS) {
    await run(page, lang)
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.activeElement?.blur())
  }
  await page.close()
}
await context.close()
process.exit(failed ? 1 : 0)
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: FAIL — `Error: no controls sheet: pnpm exec wxt build --mode development first` (there is no page yet).

- [ ] **Step 6: Write the controls sheet**

`src/entrypoints/controls/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/icon/mark-32.png" />
    <title>Read arXiv · Controls</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/controls/main.tsx`:

```tsx
// The controls sheet (a dev page, like the gallery: wxt.config.ts DEV_PAGES keeps it out of a release): every control of
// src/ui/controls that the redesign's Part 3 adds, in each of its states, light and dark side by side on the pages' own
// sheet (ui.css), in the language `?lang=` names — to look at in a real browser before the popup and the settings page
// use them, and for tests/e2e/probes/controls.mjs to measure
import '@/styles/ui.css'
import './sheet.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LOCALE_CODES, type LocaleCode } from '@/locales'
import { trackModality } from '@/ui/controls/modality'
import { setLocale } from '@/ui/strings'
import { SPECIMENS } from './specimens'

const asked = new URLSearchParams(location.search).get('lang') as LocaleCode | null
const lang: LocaleCode = asked && LOCALE_CODES.includes(asked) ? asked : 'zh-CN'
setLocale(lang)
document.documentElement.lang = lang
trackModality()

function Half({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <section data-theme={theme} className="ui half">
      {SPECIMENS.map(({ name, Specimen }) => (
        <div key={name} data-specimen={name} className="specimen">
          <h2>{name}</h2>
          <Specimen />
        </div>
      ))}
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="halves">
      <Half theme="light" />
      <Half theme="dark" />
    </main>
  </StrictMode>,
)
```

`src/entrypoints/controls/sheet.css`:

```css
/* The controls sheet's own frame (a dev page): two halves, light and dark, each a column of specimens on the chrome.
   Nothing here is a control's look — those are src/styles/controls.css's — only the room the specimens sit in */
body { margin: 0; background: var(--page); }
.halves { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.half { display: flex; flex-direction: column; gap: 28px; min-width: 0; padding: 24px; background: var(--chrome); }
.specimen { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.specimen > h2 { margin: 0; color: var(--ink-3); font-size: 11.5px; font-weight: 500; }
[data-row] { display: flex; align-items: center; gap: 12px; }
/* the popup's width less its two 12 px edges, for what fills it: the primary, its pair, the two entries, the display */
.popup-width { width: 296px; gap: 8px; }
.popup-width > * { flex: 1; }
/* the popup's group, for what sits on it (a note's buttons) */
.on-group { padding: 10px; border-radius: 10px; background: var(--group); }
.bare { height: 30px; padding: 0 8px; border-radius: 6px; background: var(--field); }
```

`src/entrypoints/controls/specimens/base.tsx`:

```tsx
// The pages' base (Part 3, Task 14): a link and a bare field in a `ui` root — the keyboard's ring on each, and none for
// the pointer on the field
import { O, S } from '@/ui/strings'

export function Base() {
  return (
    <div data-row>
      <a href="#base">{S.settings}</a>
      <input aria-label={O.services.baseURL} placeholder="https://…/v1" className="bare" />
    </div>
  )
}
```

`src/entrypoints/controls/specimens/index.ts`:

```ts
// The controls sheet's specimens, in the order it shows them: the pages' base, then one per control of Part 3, each
// added by the task that builds the control
import type { FC } from 'react'
import { Base } from './base'

export const SPECIMENS: { name: string; Specimen: FC }[] = [
  { name: 'base', Specimen: Base },
]
```

- [ ] **Step 7: Run both builds and the probe**

Run: `pnpm build && ls .output/chrome-mv3/controls.html`
Expected: the build passes with `✓ .output/chrome-mv3 holds no dev page`, and `ls` reports no such file.

Run: `pnpm exec wxt build --mode development && ls .output/chrome-mv3-dev/controls.html && node tests/e2e/probes/controls.mjs`
Expected: the file is there, and the probe prints, every line `ok`, exit 0:

```
ok   popup.html: a press marks the pointer's turn, Tab the keyboard's (trackModality)
ok   options.html: a press marks the pointer's turn, Tab the keyboard's (trackModality)
ok   zh-CN: every row's items on its centre line, within 0.5 px
ok   zh-CN light: ink on the chrome, 13 / 1.4
ok   zh-CN light: the keyboard's ring, 2 px of the focus ink 2 px off, hugging a field; none for the pointer's field
ok   zh-CN dark: …                                     (the same two)
ok   en: …                                             (the same five)
```

and `experiments/pdf-bilingual/out/controls/` holds `zh-CN-light-base.png`, `zh-CN-dark-base.png`, `en-light-base.png`,
`en-dark-base.png`. Open one: the dark half is dark, its link and field in the dark theme's ink.

- [ ] **Step 8: Stage the files, run the gate and the pixel checks, and commit**

Run: `git add scripts/check-output.mjs wxt.config.ts docs/DESIGN.md src/entrypoints/controls/index.html src/entrypoints/controls/main.tsx src/entrypoints/controls/sheet.css src/entrypoints/controls/specimens/index.ts src/entrypoints/controls/specimens/base.tsx tests/e2e/probes/align.mjs tests/e2e/probes/controls.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build && node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0; 12 and 24 lines of `ok`; `git status --short` shows nothing else staged.

```bash
git commit -m "test(ui): a controls sheet in development builds, and its probe

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 16: `Button` and `Kbd`

**Files:**
- Create: `src/ui/controls/Kbd.tsx`, `src/ui/controls/Button.tsx`
- Modify: `src/styles/controls.css` (a second `@layer components` block; an unlayered block at the end)
- Create: `src/entrypoints/controls/specimens/buttons.tsx`; modify `specimens/index.ts`
- Modify: `tests/e2e/probes/controls.mjs` (the `buttons` checks)
- Test: `tests/ui/controls/button.test.ts`, `tests/styles/controls-sheet.test.ts`

**Interfaces:**
- Consumes: `Icon` (`@/ui/controls/Icon`); the roles `brand`, `on-brand`, `brand-chip`, `button`, `fill`,
  `button-raised`, `raised-shadow`, `ink`, `ink-2`, `ink-3`; `of`, `C`, `RM` of `controls-sheet.test.ts` (Task 14).
- Produces (`@/ui/controls/Button`, `@/ui/controls/Kbd`):
  - `type ButtonKind = 'brand' | 'neutral' | 'text' | 'raised'`, `type ButtonSize = 'lg' | 'md' | 'sm'`;
  - `Button({ kind = 'neutral', size = 'md', icon, shortcut, disabled = false, busy = false, className, onClick, children, ...buttonProps }: { kind?: ButtonKind; size?: ButtonSize; icon?: IconNode; shortcut?: string; disabled?: boolean; busy?: boolean } & Omit<ComponentProps<'button'>, 'disabled'>)`:
    a `<button type="button" class="btn <kind> <size> <className>">` holding the icon (16 px), the words in a `<span>`,
    and, on `brand` and `neutral` while enabled and not busy, a `Kbd` (ruling 7). Disabled: `aria-disabled="true"`,
    still focusable, its click and any form submission refused, no press, no shortcut, the neutral grey of its size
    (`button`; `fill` at `lg`) behind `ink-3` (ruling 4). Busy: `aria-busy="true"`, a turning loader (`.spin`) in the
    icon's place — before the words when there is none —, the words and the kind's look kept, no press, no shortcut,
    its click refused, so that the action under way is not started twice (ruling 2). `raised` is 26 px and 10 px in
    whatever `size` says (ruling 8). `ref`, `style`, `popoverTarget`, `aria-*` and `data-*` pass through;
  - `Kbd({ children }: { children: ReactNode })`: `<kbd class="kbd" aria-hidden="true">` — the control it sits in is
    named by its own words; a caller that wants the shortcut heard passes `aria-keyshortcuts` to that control;
  - the classes `.btn` (`.lg` `.md` `.sm`, `.brand` `.neutral` `.text` `.raised`), `.kbd` and `.spin` (a loader turning,
    `@keyframes turn`, still under reduced motion; the menus' rows use it too) in `controls.css`;
  - in `controls-sheet.test.ts`, the at-rule lists `HOVER` and `FC`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/controls/button.test.ts`:

```ts
// The pages' buttons and shortcut labels (Part 3's interfaces; the redesign's design, §5.1, §6, §8)
import { Globe } from 'lucide'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/ui/controls/Button'
import { Kbd } from '@/ui/controls/Kbd'
import { mountElement } from '../render-hook'

afterEach(() => { document.body.innerHTML = '' })
const button = async (props: Parameters<typeof Button>[0]) => (await mountElement(createElement(Button, props))).container.querySelector('button')!

describe('Button', () => {
  it('is a plain button of its kind and size, neutral and md by default', async () => {
    const plain = await button({ children: 'Export' })
    expect([plain.className, plain.type]).toEqual(['btn neutral md', 'button'])
    expect((await button({ kind: 'brand', size: 'lg', className: 'wide', children: 'Translate' })).className).toBe('btn brand lg wide')
  })

  it('draws a Lucide icon before its words and the shortcut after them, hidden from a screen reader', async () => {
    const brand = await button({ kind: 'brand', icon: Globe, shortcut: '⌥T', children: 'Translate' })
    expect([...brand.children].map(c => c.tagName.toLowerCase())).toEqual(['svg', 'span', 'kbd'])
    expect([brand.querySelector('span')!.textContent, brand.querySelector('kbd')!.getAttribute('aria-hidden')]).toEqual(['Translate', 'true'])
  })

  it('shows a shortcut on the brand and on a neutral one (S-P-51: show original), never on a text or a raised one (ruling 7)', async () => {
    const kbd = async (kind: 'neutral' | 'text' | 'raised') => (await button({ kind, shortcut: '⌥T', children: 'Show original' })).querySelector('kbd')?.textContent ?? null
    expect([await kbd('neutral'), await kbd('text'), await kbd('raised')]).toEqual(['⌥T', null, null])
  })

  it('calls its onClick when enabled, and passes its other props through', async () => {
    const onClick = vi.fn()
    const b = await button({ onClick, 'aria-expanded': true, children: 'Service' })
    b.click()
    expect([onClick.mock.calls.length, b.getAttribute('aria-expanded')]).toEqual([1, 'true'])
  })

  it('disabled: stays in the tab order, marked aria-disabled, and does nothing, its shortcut gone', async () => {
    const onClick = vi.fn()
    const b = await button({ kind: 'brand', shortcut: '⌥T', disabled: true, onClick, children: 'Translate again' })
    b.click()
    expect([onClick.mock.calls.length, b.getAttribute('aria-disabled'), b.hasAttribute('disabled'), b.tabIndex, b.querySelector('kbd')]).toEqual([0, 'true', false, 0, null])
  })

  it('busy: a turning loader in the icon\'s place, or before the words without one; the words kept, no shortcut, and a click refused (ruling 2; Review Focus)', async () => {
    const onClick = vi.fn()
    const withIcon = await button({ kind: 'brand', icon: Globe, busy: true, shortcut: '⌥T', onClick, children: 'Connecting' })
    withIcon.click()
    expect([withIcon.getAttribute('aria-busy'), withIcon.hasAttribute('aria-disabled'), withIcon.children.length, withIcon.firstElementChild!.getAttribute('class'), withIcon.querySelector('span')!.textContent, withIcon.querySelector('kbd'), onClick.mock.calls.length])
      .toEqual(['true', false, 2, 'spin', 'Connecting', null, 0])
    const bare = await button({ kind: 'brand', busy: true, children: 'Connecting' })
    expect([[...bare.children].map(c => c.tagName.toLowerCase()), bare.firstElementChild!.getAttribute('class')]).toEqual([['svg', 'span'], 'spin'])
  })

  it('disabled, submits no form it sits in, though its type is submit (Review Focus)', async () => {
    const submitted = vi.fn((e: { preventDefault(): void }) => e.preventDefault())
    const form = (disabled: boolean) => createElement('form', { onSubmit: submitted }, createElement(Button, { type: 'submit', disabled }, 'Connect'))
    const on = await mountElement(form(false))
    on.container.querySelector('button')!.click()
    const off = await mountElement(form(true))
    off.container.querySelector('button')!.click()
    expect(submitted).toHaveBeenCalledTimes(1)
  })
})

describe('Kbd', () => {
  it('is a kbd, hidden from assistive technology: a visible hint beside a control named by its words', async () => {
    const kbd = (await mountElement(createElement(Kbd, null, '↵'))).container.querySelector('kbd')!
    expect([kbd.className, kbd.getAttribute('aria-hidden'), kbd.textContent]).toEqual(['kbd', 'true', '↵'])
  })
})
```

In `tests/styles/controls-sheet.test.ts` (Task 14), after the line
`const RM = ['@media (prefers-reduced-motion: reduce)']` add:

```ts
const HOVER = [...C, '@media (hover: hover)']
const FC = ['@media (forced-colors: active)']
```

and at the end of the file add:

```ts
describe('controls.css: buttons and the shortcut label', () => {
  it('draws three sizes — lg 36 / 9 filling its width, md 32 / 8 and 16 in, sm 28 / 7 and 12 in — in 13 px / 500', () => {
    expect(of('.btn')).toMatchObject({ display: 'inline-flex', gap: '8px', padding: '0', font: '500 13px/1 var(--font)', 'white-space': 'nowrap' })
    expect(of('.btn.lg')).toEqual({ height: '36px', 'border-radius': '9px' })
    expect(of('.btn.md')).toEqual({ height: '32px', padding: '0 16px', 'border-radius': '8px' })
    expect(of('.btn.sm')).toEqual({ height: '28px', padding: '0 12px', 'border-radius': '7px', 'font-size': '12.5px' })
    expect(of('.btn > svg + span')).toEqual({ 'margin-inline-start': '-1px' })
  })

  it('grounds each kind in its role: the brand, the neutral grey (the fill when large), none for text, raised on a group', () => {
    expect(of('.btn.brand')).toEqual({ background: 'var(--brand)', color: 'var(--on-brand)' })
    expect(of('.btn.neutral')).toEqual({ background: 'var(--button)', color: 'var(--ink)' })
    expect(of('.btn.neutral.lg')).toEqual({ background: 'var(--fill)' })
    expect(of('.btn.text')).toEqual({ 'padding-inline': '10px', 'border-radius': '7px', color: 'var(--ink-2)', 'font-weight': '400' })
    expect(of('.btn.raised')).toEqual({ height: '26px', padding: '0 10px', 'border-radius': '7px', 'font-size': '12.5px', background: 'var(--button-raised)', color: 'var(--ink)', 'box-shadow': 'var(--raised-shadow)' })
    expect(of('.btn[aria-disabled="true"]')).toEqual({ background: 'var(--button)', color: 'var(--ink-3)', 'box-shadow': 'none' })
    expect(of('.btn.lg[aria-disabled="true"]')).toEqual({ background: 'var(--fill)' })
    expect(of('.btn.text[aria-disabled="true"]')).toEqual({ background: 'none' })
    expect(of('.btn[aria-busy="true"]')).toEqual({ cursor: 'progress' })
  })

  it('lights a text button on a hover only where a pointer hovers', () => {
    expect(of('.btn.text:not([aria-disabled="true"]):hover', HOVER)).toEqual({ background: 'var(--fill)', color: 'var(--ink)' })
  })

  it('presses an enabled button to 0.96 in 150 ms — not a disabled or a busy one, nor under reduced motion', () => {
    expect(of('.btn:not([aria-disabled="true"]):not([aria-busy="true"]):active')).toEqual({ scale: '0.96' })
    expect(of('.btn').transition).toBe('scale 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out')
    expect(of('.btn:active', RM)).toEqual({ scale: 'none' })
  })

  it('labels a shortcut 11 px / 500, 3 by 5 in, radius 5, the ink\'s 9 % behind ink-2; on the brand its chip behind white', () => {
    expect(of('.kbd')).toEqual({ padding: '3px 5px', 'border-radius': '5px', background: 'color-mix(in oklab, var(--ink) 9%, transparent)', color: 'var(--ink-2)', font: '500 11px/1 var(--font)' })
    expect(of('.btn.brand .kbd')).toEqual({ background: 'var(--brand-chip)', color: 'var(--on-brand)' })
  })

  it('turns a busy button\'s loader in 900 ms, and holds it still under reduced motion', () => {
    expect(of('.spin')).toEqual({ animation: 'turn 900ms linear infinite' })
    expect(of('to', ['@keyframes turn'])).toEqual({ rotate: '1turn' })
    expect(of('.spin', RM)).toEqual({ animation: 'none' })
  })

  it('keeps a grounded button\'s edge in forced colours, where its ground is dropped, and greys a disabled one (Review Focus)', () => {
    expect(of('.btn:not(.text):not(:focus-visible)', FC)).toEqual({ outline: '1px solid ButtonText', 'outline-offset': '-1px' })
    expect(of('.btn[aria-disabled="true"]', FC)).toEqual({ color: 'GrayText' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/ui/controls/button.test.ts tests/styles/controls-sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/controls/Button"`; the new sheet tests throw
`0 rules ".btn" within [@layer components]` (Task 14's two pass).

- [ ] **Step 3: Write `Kbd` and `Button`**

`src/ui/controls/Kbd.tsx`:

```tsx
// A shortcut label (the redesign's design, §5.1; Part 3's interfaces; the maintainer, 2026-09-26): 11 px, 3 by 5 px in,
// radius 5; the ink's 9 % behind ink-2, and on a brand button its chip behind white (controls.css .kbd). A visible
// hint: the control it sits in is named by its own words, so the label is hidden from assistive technology
import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a kbd takes no focus; the label is a visible hint beside a control named by its own words
  return <kbd aria-hidden="true" className="kbd">{children}</kbd>
}
```

`src/ui/controls/Button.tsx`:

```tsx
// The pages' buttons (the redesign's design, §2.1, §5, §6, §8; Part 3's interfaces): the one primary action of a view
// in the brand, a neutral one, a text one with no ground but its hover's, a raised one on a group (a note's). Three
// sizes: lg fills its width (the popup's primary, its pair, its two entries), md a form's bar, sm a row's. An icon goes
// before the words, a shortcut after them on the brand and a neutral one. A disabled one is aria-disabled: it stays in
// the tab order, takes the neutral grey of its size, loses its shortcut, and neither acts nor submits a form. A busy one
// keeps its look and its words, a loader turning in its icon's place, and does not act again (controls.css .btn)
import { type IconNode, Loader } from 'lucide'
import type { ComponentProps, MouseEvent } from 'react'
import { Icon } from './Icon'
import { Kbd } from './Kbd'

export type ButtonKind = 'brand' | 'neutral' | 'text' | 'raised'
export type ButtonSize = 'lg' | 'md' | 'sm'

/** a disabled or busy button's press: nothing, and no form submitted (aria-disabled leaves the browser's action in place) */
const refuse = (e: MouseEvent) => e.preventDefault()

export function Button({ kind = 'neutral', size = 'md', icon, shortcut, disabled = false, busy = false, className, onClick, children, ...rest }: {
  kind?: ButtonKind
  size?: ButtonSize
  /** a Lucide node, drawn 16 px before the words */
  icon?: IconNode
  /** a shortcut as the browser reports it (⌥T), after the words: on the brand and a neutral one, while it can act */
  shortcut?: string
  disabled?: boolean
  /** an action under way (connecting): a loader turning in the icon's place, the words kept, and no second press */
  busy?: boolean
} & Omit<ComponentProps<'button'>, 'disabled'>) {
  const still = disabled || busy
  return (
    <button type="button" {...rest} aria-disabled={disabled || undefined} aria-busy={busy || undefined} onClick={still ? refuse : onClick} className={`btn ${kind} ${size}${className ? ` ${className}` : ''}`}>
      {busy ? <Icon node={Loader} className="spin" /> : icon && <Icon node={icon} />}
      {children != null && <span>{children}</span>}
      {shortcut && (kind === 'brand' || kind === 'neutral') && !still && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}
```

- [ ] **Step 4: Write their looks**

In `src/styles/controls.css`, after the closing `}` of the `@layer components {` block (the line before
`@keyframes tip-in { from { opacity: 0; } }`), add:

```css
/* The controls the pages add (the redesign's design, §2.1, §5, §6, §8; Part 3's interfaces), every measure the
   prototypes' (the popup's round 6, the settings page's settings-2). Each class compounds with its control's own, so
   that nothing here reaches an element that is not one of these controls */
@layer components {
  /* buttons: the brand for the one primary action, a neutral one (its grey small, the fill large), a text one with no
     ground but its hover's, a raised one on a group; pressed to 0.96 (§8). lg fills its width and has no padding of
     its own (round 6's primary); a disabled one takes the neutral grey of its size, a busy one keeps its look */
  .btn { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 8px; padding: 0; font: 500 13px/1 var(--font); white-space: nowrap;
    transition: scale 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out; }
  /* the words 7 px after an icon (round 6's entries), a shortcut 8 px after the words (round 1) */
  .btn > svg + span { margin-inline-start: -1px; }
  .btn.lg { height: 36px; border-radius: 9px; }
  .btn.md { height: 32px; padding: 0 16px; border-radius: 8px; }
  .btn.sm { height: 28px; padding: 0 12px; border-radius: 7px; font-size: 12.5px; }
  .btn.brand { background: var(--brand); color: var(--on-brand); }
  .btn.neutral { background: var(--button); color: var(--ink); }
  .btn.neutral.lg { background: var(--fill); }
  /* a text button, as both prototypes draw it: 10 px in, radius 7, in the page's weight */
  .btn.text { padding-inline: 10px; border-radius: 7px; color: var(--ink-2); font-weight: 400; }
  @media (hover: hover) { .btn.text:not([aria-disabled="true"]):hover { background: var(--fill); color: var(--ink); } }
  /* a note's button (round 4), one measure whatever the size: on the group, raised by a hairline in light */
  .btn.raised { height: 26px; padding: 0 10px; border-radius: 7px; font-size: 12.5px; background: var(--button-raised); color: var(--ink); box-shadow: var(--raised-shadow); }
  /* a disabled one takes the neutral grey of its size — the small one's, the large one's fill — its words ink-3: on
     the small neutral's own fill it would read heavier than an enabled one */
  .btn[aria-disabled="true"] { background: var(--button); color: var(--ink-3); box-shadow: none; }
  .btn.lg[aria-disabled="true"] { background: var(--fill); }
  .btn.text[aria-disabled="true"] { background: none; }
  /* a busy one keeps its look: its loader says the wait, and it takes no second press */
  .btn[aria-busy="true"] { cursor: progress; }
  .btn:not([aria-disabled="true"]):not([aria-busy="true"]):active { scale: 0.96; }
  /* a shortcut label: 11 px, 3 by 5 in, radius 5, the ink's 9 % behind ink-2; on the brand its chip behind white
     (5.41:1 light, 4.59:1 dark; the maintainer, 2026-09-26) */
  .kbd { padding: 3px 5px; border-radius: 5px; background: color-mix(in oklab, var(--ink) 9%, transparent); color: var(--ink-2); font: 500 11px/1 var(--font); }
  .btn.brand .kbd { background: var(--brand-chip); color: var(--on-brand); }
  /* a wait with one subject (a busy button; the pack's download in a menu): a loader turning */
  .spin { animation: turn 900ms linear infinite; }
}
```

At the end of the file, add:

```css
@keyframes turn { to { rotate: 1turn; } }
/* the pages' controls under reduced motion (§8: each motion a fade or nothing) and in forced colours; unlayered, as the
   rules above are, so that they win over the component rules */
@media (prefers-reduced-motion: reduce) {
  .btn:active { scale: none; }
  .spin { animation: none; }
}
@media (forced-colors: active) {
  /* a grounded button keeps an edge the system draws, its ground being dropped; not while focused, whose ring it is */
  .btn:not(.text):not(:focus-visible) { outline: 1px solid ButtonText; outline-offset: -1px; }
  .btn[aria-disabled="true"] { color: GrayText; }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/ui/controls/button.test.ts tests/styles`
Expected: PASS (`button.test.ts` 8 tests, `controls-sheet.test.ts` 9, `reader-sheet.test.ts`'s hover rule holds: the
new `:hover` sits in `@media (hover: hover)`).

- [ ] **Step 6: The buttons' specimen**

`src/entrypoints/controls/specimens/buttons.tsx`:

```tsx
// Buttons and shortcut labels (Part 3, Task 16): the popup's primary with its shortcut, its neutral one with its own
// (S-P-51), P9's pair (the neutral twin without one), P17's two entries (one disabled), a form's bar with a button
// connecting, a row's small ones (one disabled), a note's raised ones on the group, and labels alone
import { FileText, Globe } from 'lucide'
import { Button } from '@/ui/controls/Button'
import { Kbd } from '@/ui/controls/Kbd'
import { O, S } from '@/ui/strings'

export function Buttons() {
  return (
    <>
      <div data-row className="popup-width">
        <Button kind="brand" size="lg" shortcut="⌥T">{S.primary.translate}</Button>
      </div>
      <div data-row className="popup-width">
        <Button size="lg" shortcut="⌥T">{S.primary.restore}</Button>
      </div>
      <div data-row className="popup-width">
        <Button kind="brand" size="lg" shortcut="⌥T">{S.primary.retranslate}</Button>
        <Button size="lg">{S.primary.restore}</Button>
      </div>
      <div data-row className="popup-width">
        <Button kind="brand" size="lg" icon={Globe}>{S.entry.html}</Button>
        <Button kind="brand" size="lg" icon={FileText} disabled>{S.entry.pdf}</Button>
      </div>
      <div data-row>
        <Button kind="brand">{O.services.connect}</Button>
        <Button kind="brand" busy>{O.services.connecting}</Button>
        <Button kind="text">{O.services.cancel}</Button>
      </div>
      <div data-row>
        <Button size="sm">{S.service.chrome_download}</Button>
        <Button kind="text" size="sm">{O.reading.reset}</Button>
        <Button size="sm" disabled>{S.service.chrome_download}</Button>
      </div>
      <div data-row className="on-group">
        <Button kind="raised" size="sm">{S.settings}</Button>
        <Button kind="raised" size="sm">{S.failed.retry}</Button>
      </div>
      <div data-row>
        <Kbd>⌥T</Kbd>
        <Kbd>↵</Kbd>
      </div>
    </>
  )
}
```

In `src/entrypoints/controls/specimens/index.ts`, after `import { Base } from './base'` add
`import { Buttons } from './buttons'`, and after `  { name: 'base', Specimen: Base },` add:

```ts
  { name: 'buttons', Specimen: Buttons },
```

- [ ] **Step 7: The buttons' browser checks**

In `tests/e2e/probes/controls.mjs`, above the line
`// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----`, add:

```js
/** Task 16: buttons and shortcut labels (Part 3's interfaces; round 6, round 4, settings-2) */
async function buttons(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="buttons"]`, tag = `${lang} ${theme}`
    for (const [selector, height, radius, pad, size, weight] of [
      ['.btn.brand.lg', 36, '9px', '0px', '13px', '500'],
      ['.btn.brand.md', 32, '8px', '16px', '13px', '500'],
      ['.btn.text.md', 32, '7px', '10px', '13px', '400'],
      ['.btn.neutral.sm', 28, '7px', '12px', '12.5px', '500'],
      ['.btn.text.sm', 28, '7px', '10px', '12.5px', '400'],
      ['.btn.raised', 26, '7px', '10px', '12.5px', '500'],
    ]) {
      const m = await look(page, `${at} ${selector}:not([aria-disabled])`)
      check(`${tag}: ${selector} ${height} px, radius ${radius}, ${pad} in, ${size} / ${weight}`, near(m?.height, height) && m.radius === radius && m.pad === pad && m.size === size && m.weight === weight, JSON.stringify(m))
    }
    for (const [selector, ground, words] of [
      ['.btn.brand.lg:not([aria-disabled])', 'var(--brand)', 'var(--on-brand)'],
      ['.btn.neutral.lg', 'var(--fill)', 'var(--ink)'],
      ['.btn.neutral.sm:not([aria-disabled])', 'var(--button)', 'var(--ink)'],
      ['.btn.raised', 'var(--button-raised)', 'var(--ink)'],
      ['.btn.brand[aria-disabled="true"]', 'var(--fill)', 'var(--ink-3)'],
      ['.btn.neutral.sm[aria-disabled="true"]', 'var(--button)', 'var(--ink-3)'],
      ['.btn.brand .kbd', 'var(--brand-chip)', 'var(--on-brand)'],
      ['.btn.neutral .kbd', 'color-mix(in oklab, var(--ink) 9%, transparent)', 'var(--ink-2)'],
      ['[data-row] > .kbd', 'color-mix(in oklab, var(--ink) 9%, transparent)', 'var(--ink-2)'],
      ['.btn[aria-busy="true"]', 'var(--brand)', 'var(--on-brand)'],
    ]) {
      const m = await look(page, `${at} ${selector}`)
      const want = { bg: await token(page, theme, 'background-color', ground), color: await token(page, theme, 'color', words) }
      check(`${tag}: ${selector} on ${ground}, in ${words}`, m?.bg === want.bg && m.color === want.color, JSON.stringify({ m, want }))
    }
    const raised = await look(page, `${at} .btn.raised`)
    check(`${tag}: a note's button raised by the raised shadow`, raised?.shadow === await token(page, theme, 'box-shadow', 'var(--raised-shadow)'), raised?.shadow)
    const kbd = await look(page, `${at} .btn.brand .kbd`)
    check(`${tag}: the shortcut label 11 px / 500, 3 by 5 in, radius 5`, kbd?.size === '11px' && kbd.weight === '500' && kbd.padBlock === '3px' && kbd.pad === '5px' && kbd.radius === '5px', JSON.stringify(kbd))
    const gaps = await page.evaluate(at => {
      const icon = document.querySelector(`${at} .btn.lg svg`), words = icon.nextElementSibling
      const label = document.querySelector(`${at} .btn.brand.lg .kbd`), before = label.previousElementSibling
      return { icon: words.getBoundingClientRect().left - icon.getBoundingClientRect().right, kbd: label.getBoundingClientRect().left - before.getBoundingClientRect().right, disabledKbd: document.querySelectorAll(`${at} .btn[aria-disabled="true"] .kbd`).length, neutralKbd: document.querySelectorAll(`${at} .btn.neutral .kbd`).length }
    }, at)
    check(`${tag}: an icon 7 px before its words, the shortcut 8 px after them, on a neutral one where it is given, none on a disabled one`, near(gaps.icon, 7) && near(gaps.kbd, 8) && gaps.disabledKbd === 0 && gaps.neutralKbd === 1, JSON.stringify(gaps))
    const busy = await page.evaluate(at => { const b = document.querySelector(`${at} .btn[aria-busy="true"]`), first = b.firstElementChild; return { spin: first.getAttribute('class'), turning: getComputedStyle(first).animationName, words: !!b.querySelector('span')?.textContent, kbd: b.querySelectorAll('.kbd').length } }, at)
    check(`${tag}: a busy button keeps its look and words, a loader turning in its icon's place`, busy.spin === 'spin' && busy.turning === 'turn' && busy.words && busy.kbd === 0, JSON.stringify(busy))
    const inside = await offCentre(page, { rows: `${at} .btn` })
    check(`${tag}: a button's icon, words and shortcut on its centre line`, inside.length === 0, JSON.stringify(inside))
    // the English words at the popup's width: nothing runs over its button (Review Focus)
    const over = await page.evaluate(at => [...document.querySelectorAll(`${at} .popup-width .btn`)].map(b => b.scrollWidth - b.clientWidth), at)
    check(`${tag}: the primary, the pair and the entries hold their words at the popup's width`, over.every(d => d <= 0), JSON.stringify(over))
    // the press: 0.96 while held, a disabled one not at all (§8); a text button lit on hover
    const press = async selector => {
      await page.hover(`${at} ${selector}`)
      await page.mouse.down()
      await page.waitForTimeout(200)
      const scale = (await look(page, `${at} ${selector}`))?.scale
      await page.mouse.up()
      return scale
    }
    const pressed = [await press('.btn.brand.md'), await press('.btn.brand[aria-disabled="true"]'), await press('.btn[aria-busy="true"]')]
    check(`${tag}: a press scales a button to 0.96, and not a disabled or a busy one`, pressed[0] === '0.96' && pressed[1] === 'none' && pressed[2] === 'none', JSON.stringify(pressed))
    await page.hover(`${at} .btn.text.md`)
    await page.waitForTimeout(200)
    const lit = await look(page, `${at} .btn.text.md`)
    check(`${tag}: a text button lit on hover, the fill behind ink`, lit?.bg === await token(page, theme, 'background-color', 'var(--fill)') && lit.color === await token(page, theme, 'color', 'var(--ink)'), JSON.stringify(lit))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const still = await press('.btn.brand.md')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: no press under reduced motion`, still === 'none', still)
  }
}
```

and change `const CHECKS = [base]` to `const CHECKS = [base, buttons]`.

- [ ] **Step 8: Run the probe**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: every line `ok`, exit 0, the buttons' 25 lines per language and theme among them; `out/controls/` holds the
`buttons` shots. Look at `zh-CN-light-buttons.png` and `en-dark-buttons.png` beside
`round-6/png/rows/s2-r1-light.png` (P9's pair) and `s3-r1-dark.png` (P17's entries): the brand's red, the white label
on its chip, the neutral pair, the grey disabled entry. A value that fails is reported with the values it read: do not
change a measure of the plan to pass, report it.

- [ ] **Step 9: Stage the files, run the gate and the pixel checks, and commit**

Run: `git add src/ui/controls/Kbd.tsx src/ui/controls/Button.tsx src/styles/controls.css src/entrypoints/controls/specimens/buttons.tsx src/entrypoints/controls/specimens/index.ts tests/e2e/probes/controls.mjs tests/ui/controls/button.test.ts tests/styles/controls-sheet.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build && node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0; 12 and 24 lines of `ok` (the reader imports `controls.css`; none of its elements is a `.btn`);
`git status --short` shows nothing else staged.

```bash
git commit -m "feat(ui): the pages' buttons and shortcut labels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 17: `Field` and `TextInput`, `Radio`, `Reveal`

**Files:**
- Create: `src/ui/controls/Field.tsx`, `src/ui/controls/Reveal.tsx`
- Modify: `src/ui/controls/radio.ts` (`Radio` joins `radioKeys`)
- Modify: `src/styles/controls.css` (the Part 3 layer block; the two unlayered blocks at the end)
- Create: `src/entrypoints/controls/specimens/forms.tsx`; modify `specimens/index.ts`, `src/entrypoints/controls/sheet.css`
- Modify: `tests/e2e/probes/controls.mjs` (the `forms` checks)
- Test: `tests/ui/controls/forms.test.ts`, `tests/styles/controls-sheet.test.ts`

**Interfaces:**
- Consumes: `Icon`, `Button` (Task 16), `radioKeys` (`@/ui/controls/radio`); `edges` (`align.mjs`, Task 15).
- Produces:
  - `@/ui/controls/Field`: `Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children?: ReactNode })`
    — `<div class="field">` with a `<label htmlFor>` naming the control, `<p class="field-hint">`, and
    `<p class="field-error">` (a 14 px `CircleAlert`, then the words); the control is described by the error first,
    then the hint, and marked `aria-invalid` while there is an error. `TextInput(props: ComponentProps<'input'>)` —
    `<input type="text" class="input …">`, taking its `id`, `aria-describedby` and `aria-invalid` from the Field around
    it (its own props win). `useField(): { id: string; describedBy: string | undefined; invalid: boolean } | null` —
    the same wiring for a control of another kind (Part 5's combobox);
  - `@/ui/controls/radio`: `Radio()` — `<span class="radio" aria-hidden="true">`, the direct child of the element that
    is the radio (`role="radio"`, `aria-checked`, `aria-disabled`); `radioKeys` as it was;
  - `@/ui/controls/Reveal`: `Reveal({ open, className, children, ...divProps }: { open: boolean } & ComponentProps<'div'>)`
    — `<div class="reveal" data-open>` around one `<div inert>`; where the focus goes as it opens or closes is the
    caller's (§9);
  - the classes `.field` (`> label`), `.field-hint`, `.field-error`, `.input`, `.radio`, `.reveal`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/controls/forms.test.ts`:

```ts
// The settings page's form pieces (Part 3's interfaces; the redesign's design, §6.2, §8, §9): a labelled field and its
// text field, a radio's mark, a reveal
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, TextInput, useField } from '@/ui/controls/Field'
import { Radio } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { mountElement } from '../render-hook'

afterEach(() => { document.body.innerHTML = '' })

describe('Field and TextInput', () => {
  it('labels its control, and describes it by its hint', async () => {
    const { container } = await mountElement(createElement(Field, { label: 'Address', hint: 'An OpenAI-compatible endpoint' }, createElement(TextInput, { placeholder: 'https://' })))
    const input = container.querySelector('input')!, label = container.querySelector('label')!
    expect([input.className, input.type, input.id !== '', label.htmlFor === input.id]).toEqual(['input', 'text', true, true])
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe('An OpenAI-compatible endpoint')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
  })

  it('at fault: invalid, described by its reason first and then its hint, the reason after a decorative icon', async () => {
    const { container } = await mountElement(createElement(Field, { label: 'Key', hint: 'Local addresses need none', error: 'Enter the API key' }, createElement(TextInput)))
    const input = container.querySelector('input')!
    const described = input.getAttribute('aria-describedby')!.split(' ').map(id => document.getElementById(id)!.textContent)
    expect([input.getAttribute('aria-invalid'), described]).toEqual(['true', ['Enter the API key', 'Local addresses need none']])
    const icon = container.querySelector('.field-error')!.firstElementChild!
    expect([icon.tagName.toLowerCase(), icon.getAttribute('aria-hidden')]).toEqual(['svg', 'true'])
  })

  it('a text field outside a field takes nothing from one, and keeps what it is given', async () => {
    const { container } = await mountElement(createElement(TextInput, { id: 'own', className: 'wide', 'aria-label': 'Search' }))
    const input = container.querySelector('input')!
    expect([input.id, input.className, input.hasAttribute('aria-describedby'), input.hasAttribute('aria-invalid')]).toEqual(['own', 'input wide', false, false])
  })

  it('hands its wiring to a control of another kind through useField (Part 5\'s combobox)', async () => {
    function Combobox() {
      const field = useField()
      return createElement('input', { role: 'combobox', id: field?.id, 'aria-describedby': field?.describedBy, 'aria-invalid': field?.invalid || undefined })
    }
    const { container } = await mountElement(createElement(Field, { label: 'Model', error: 'Choose a model' }, createElement(Combobox)))
    const input = container.querySelector('input')!
    expect([container.querySelector('label')!.htmlFor === input.id, input.getAttribute('aria-invalid')]).toEqual([true, 'true'])
  })
})

describe('Radio', () => {
  it('is a radio\'s mark alone: decorative, the direct child the sheet reads the radio\'s state through', async () => {
    const { container } = await mountElement(createElement('div', { role: 'radio', 'aria-checked': 'true' }, createElement(Radio)))
    const mark = container.querySelector('[role="radio"] > .radio')!
    expect([mark.tagName, mark.getAttribute('aria-hidden'), mark.childNodes.length]).toEqual(['SPAN', 'true', 0])
  })
})

describe('Reveal', () => {
  it('holds its contents inert while closed, and lets them be while open (§9)', async () => {
    const reveal = (open: boolean) => createElement(Reveal, { open, id: 'more' }, createElement('input'))
    const { container, rerender } = await mountElement(reveal(false))
    const outer = container.querySelector<HTMLElement>('.reveal')!
    expect([outer.id, outer.hasAttribute('data-open'), outer.firstElementChild!.hasAttribute('inert')]).toEqual(['more', false, true])
    await rerender(reveal(true))
    expect([outer.hasAttribute('data-open'), outer.firstElementChild!.hasAttribute('inert')]).toEqual([true, false])
  })
})
```

In `tests/styles/controls-sheet.test.ts`, at the end of the file, add:

```ts
describe('controls.css: fields, radios and reveals', () => {
  it('draws a field\'s label and hint 12 px in ink-2, 6 px from it; its reason in ink after a danger icon on the first line', () => {
    expect(of('.field')).toEqual({ display: 'flex', 'flex-direction': 'column', gap: '6px' })
    expect(of('.field > label')).toEqual({ color: 'var(--ink-2)', 'font-size': '12px', 'line-height': '1.4' })
    expect(of('.field-hint')).toEqual({ margin: '0', color: 'var(--ink-2)', 'font-size': '12px', 'line-height': '1.4' })
    expect(of('.field-error')).toEqual({ display: 'flex', 'align-items': 'flex-start', gap: '6px', margin: '0', color: 'var(--ink)', 'font-size': '12px', 'line-height': '1.45' })
    expect(of('.field-error > svg')).toEqual({ flex: 'none', 'margin-block-start': 'calc((1.45em - 14px) / 2)', color: 'var(--danger)' })
  })

  it('draws a text field 34 px, radius 8, on its ground with a 0.5 px edge; 1 px of ink-3 focused, the danger\'s at fault', () => {
    expect(of('.input')).toMatchObject({ height: '34px', padding: '0 10px', 'border-radius': '8px', background: 'var(--field)', 'box-shadow': 'inset 0 0 0 0.5px var(--field-edge)', font: '13px var(--font)' })
    expect(of('.input::placeholder')).toEqual({ color: 'var(--ink-2)' })
    expect(of('.input:focus')).toEqual({ 'box-shadow': 'inset 0 0 0 1px var(--ink-3)' })
    expect(of('.input[aria-invalid="true"]')).toEqual({ 'box-shadow': 'inset 0 0 0 1px var(--danger)' })
  })

  it('draws a radio 16 px, a 1.5 px ring of ink-3, ink when chosen, its dot growing from the centre in 150 ms', () => {
    expect(of('.radio')).toMatchObject({ width: '16px', height: '16px', 'border-radius': '999px', 'box-shadow': 'inset 0 0 0 1.5px var(--ink-3)' })
    expect(of('.radio::after')).toMatchObject({ inset: '4px', background: 'var(--ink)', scale: '0', transition: 'scale 150ms var(--ease)' })
    expect(of('[aria-checked="true"] > .radio')).toEqual({ 'box-shadow': 'inset 0 0 0 1.5px var(--ink)' })
    expect(of('[aria-checked="true"] > .radio::after')).toEqual({ scale: '1' })
  })

  it('reveals in 220 ms on the ease, its opacity 180 ms after 40; closes in 180 and 120; only fades under reduced motion', () => {
    expect(of('.reveal')).toEqual({ display: 'grid', 'grid-template-rows': '0fr', opacity: '0', transition: 'grid-template-rows 180ms ease-out, opacity 120ms ease-out' })
    expect(of('.reveal[data-open]')).toEqual({ 'grid-template-rows': '1fr', opacity: '1', transition: 'grid-template-rows 220ms var(--ease), opacity 180ms ease-out 40ms' })
    expect(of('.reveal > div')).toEqual({ 'min-height': '0', overflow: 'hidden' })
    expect(of('.reveal, .reveal[data-open]', RM)).toEqual({ transition: 'opacity 150ms ease-out' })
    expect(of('.radio::after', RM)).toEqual({ transition: 'none' })
  })

  it('redraws the radio\'s ring and the field\'s edge in the system\'s colours, where box-shadows are dropped (Review Focus)', () => {
    expect(of('.radio', FC)).toEqual({ 'forced-color-adjust': 'none', 'box-shadow': 'inset 0 0 0 1.5px CanvasText' })
    expect(of('[aria-checked="true"] > .radio', FC)).toEqual({ 'box-shadow': 'inset 0 0 0 1.5px Highlight' })
    expect(of('[aria-checked="true"] > .radio::after', FC)).toEqual({ background: 'Highlight' })
    expect(of('.input', FC)).toEqual({ border: '1px solid CanvasText' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/ui/controls/forms.test.ts tests/styles/controls-sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/controls/Field"`; the new sheet tests throw `0 rules ".field" …`.

- [ ] **Step 3: Write `Field` and `TextInput`, `Radio`, `Reveal`**

`src/ui/controls/Field.tsx`:

```tsx
// A labelled field (the redesign's design, §6.3, §9; Part 3's interfaces): its label above the one control it wraps, a
// hint and an error under it, and the wiring a screen reader needs — the label names the control, the error (first) and
// the hint describe it, and the control is marked invalid while there is an error. The control is a TextInput, or any
// control that reads useField() (a combobox) and puts the wiring on its own element
import { CircleAlert } from 'lucide'
import { type ComponentProps, createContext, type ReactNode, useContext, useId } from 'react'
import { Icon } from './Icon'

interface FieldWiring { id: string; describedBy: string | undefined; invalid: boolean }
const FieldContext = createContext<FieldWiring | null>(null)

/** the wiring of the Field around a control, or null outside one */
export const useField = (): FieldWiring | null => useContext(FieldContext)

/** `children`: the one control, typed optional so that a test's createElement can pass it as its third argument */
export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children?: ReactNode }) {
  const id = useId()
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <FieldContext value={{ id, describedBy, invalid: !!error }}>{children}</FieldContext>
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="field-error">
          <Icon node={CircleAlert} size={14} />
          {error}
        </p>
      )}
    </div>
  )
}

/** A text field (controls.css .input): inside a Field, named and described by it; its own props win */
export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  const field = useField()
  return <input type="text" id={field?.id} aria-describedby={field?.describedBy} aria-invalid={field?.invalid || undefined} {...rest} className={className ? `input ${className}` : 'input'} />
}
```

In `src/ui/controls/radio.ts`, replace the first two comment lines and the import line:

```ts
// A radio group's keys (the reader's design, §13), for the display switch and the appearance: the arrows move the
// choice to the next one that can be had, wrapping, and the focus goes with it; only the chosen radio is in the tab order
import type { KeyboardEvent } from 'react'
```

with:

```ts
// A radio group's keys (the reader's design, §13), for the display switch and the appearance: the arrows move the
// choice to the next one that can be had, wrapping, and the focus goes with it; only the chosen radio is in the tab order.
// And a radio's mark (the redesign's design, §6.2, §8; Part 3): 16 px, a 1.5 px ring of ink-3, ink when chosen, its dot
// growing from the centre (controls.css .radio) — the direct child of the element that is the radio (a row with
// role="radio" and aria-checked), whose state the sheet reads through it. Here, not in a Radio.tsx beside this file: on
// a case-insensitive disk `./Radio` and `./radio` are one import
import { createElement, type KeyboardEvent } from 'react'
```

and at the end of the file add:

```ts
export function Radio() {
  return createElement('span', { 'aria-hidden': 'true', className: 'radio' })
}
```

`src/ui/controls/Reveal.tsx`:

```tsx
// What appears only when it applies (the redesign's design, §8, §9; Part 3's interfaces): a sub-row, a form, an editor
// or a list, opened in place — its rows grow from 0fr to 1fr as it fades in (controls.css .reveal), and while closed its
// contents are inert: out of the tab order, hidden from assistive technology. Where the focus goes as it opens or closes
// is the caller's: a form's first field; back to the row that opened it
import type { ComponentProps } from 'react'

export function Reveal({ open, className, children, ...rest }: { open: boolean } & ComponentProps<'div'>) {
  return (
    <div {...rest} data-open={open || undefined} className={className ? `reveal ${className}` : 'reveal'}>
      <div inert={!open}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Write their looks**

In `src/styles/controls.css`, inside the `@layer components` block Task 16 added, before its closing `}` (the line
after `.btn.brand .kbd { background: var(--brand-chip); color: var(--on-brand); }`), add:

```css
  /* a field (settings-2): its label 12 px in ink-2 above it, 6 px apart; a hint under it in ink-2; an error under it in
     ink after a danger icon centred on its first line (round 4's failure line: never red words, §5.2) */
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field > label { color: var(--ink-2); font-size: 12px; line-height: 1.4; }
  .field-hint { margin: 0; color: var(--ink-2); font-size: 12px; line-height: 1.4; }
  .field-error { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--ink); font-size: 12px; line-height: 1.45; }
  .field-error > svg { flex: none; margin-block-start: calc((1.45em - 14px) / 2); color: var(--danger); }
  /* a text field (settings-2): 34 px, its ground with a 0.5 px edge, a 1 px ink-3 edge while focused, the danger's at
     fault; placeholders in ink-2 (ink-3 read 3.49:1). The keyboard's ring is the base's, hugging it (ui.css) */
  .input { width: 100%; min-width: 0; height: 34px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 0.5px var(--field-edge); color: var(--ink); font: 13px var(--font); transition: box-shadow 150ms ease-out; }
  .input::placeholder { color: var(--ink-2); }
  .input:focus { box-shadow: inset 0 0 0 1px var(--ink-3); }
  .input[aria-invalid="true"] { box-shadow: inset 0 0 0 1px var(--danger); }
  .input:disabled { opacity: 0.55; }
  /* a radio's mark (settings-2): a 16 px ring of ink-3, ink when chosen, its dot growing from the centre (§8) */
  .radio { position: relative; width: 16px; height: 16px; flex: none; border-radius: 999px; box-shadow: inset 0 0 0 1.5px var(--ink-3); transition: box-shadow 150ms ease-out; }
  .radio::after { content: ""; position: absolute; inset: 4px; border-radius: 999px; background: var(--ink); scale: 0; transition: scale 150ms var(--ease); }
  [aria-checked="true"] > .radio { box-shadow: inset 0 0 0 1.5px var(--ink); }
  [aria-checked="true"] > .radio::after { scale: 1; }
  [aria-disabled="true"] > .radio { opacity: 0.45; }
  /* what appears only when it applies (§8): its rows 0fr to 1fr in 220 ms on the ease, its opacity 180 ms after 40;
     closing softer and quicker, 180 ms and 120 ms. The inside clips while it moves; closed, it is inert (Reveal) */
  .reveal { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 180ms ease-out, opacity 120ms ease-out; }
  .reveal[data-open] { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 220ms var(--ease), opacity 180ms ease-out 40ms; }
  .reveal > div { min-height: 0; overflow: hidden; }
```

In the unlayered reduced-motion block Task 16 added at the end of the file, after `.btn:active { scale: none; }`, add:

```css
  .radio::after { transition: none; }
  .reveal, .reveal[data-open] { transition: opacity 150ms ease-out; }
```

In the unlayered forced-colours block Task 16 added at the end of the file, after
`.btn[aria-disabled="true"] { color: GrayText; }`, add:

```css
  /* rings and edges drawn by box-shadows are dropped: the system's colours draw them instead */
  .radio { forced-color-adjust: none; box-shadow: inset 0 0 0 1.5px CanvasText; }
  [aria-checked="true"] > .radio { box-shadow: inset 0 0 0 1.5px Highlight; }
  [aria-checked="true"] > .radio::after { background: Highlight; }
  .input { border: 1px solid CanvasText; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/ui/controls tests/styles tests/pdf-reader/ui`
Expected: PASS (`forms.test.ts` 6 tests, `controls-sheet.test.ts` 14; the reader's tests, which import `radioKeys`
from the same module, as before).

- [ ] **Step 6: The form pieces' specimen**

`src/entrypoints/controls/specimens/forms.tsx`:

```tsx
// Fields, radios and a reveal (Part 3, Task 17): the settings page's form pieces — a field with a hint, one at fault, a
// disabled one; a radio group of services in a card, the arrows moving the choice past the one that cannot be had; and a
// field opened in place under a text button
import { useId, useRef, useState } from 'react'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Radio, radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { O, S } from '@/ui/strings'

export function Forms() {
  const [service, setService] = useState('microsoft')
  const [open, setOpen] = useState(false)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const revealId = useId()
  const services = [
    { id: 'microsoft', name: S.service.microsoft, hint: S.service.free, disabled: false },
    { id: 'google', name: S.service.google, hint: S.service.free, disabled: false },
    { id: 'chrome', name: S.service.chrome, hint: S.service.chrome_unavailable, disabled: true },
  ]
  const can = (id: string) => !services.find(s => s.id === id)?.disabled
  return (
    <>
      <div className="form-demo">
        <Field label={O.services.baseURL} hint={O.services.baseURLHint}>
          <TextInput placeholder="https://…/v1" />
        </Field>
        <Field label={O.services.apiKey} error={O.services.permission.badURL}>
          <TextInput defaultValue="sk-or-0000" />
        </Field>
        <Field label={O.services.model}>
          <TextInput disabled placeholder={O.services.model} />
        </Field>
      </div>
      <div role="radiogroup" aria-label={S.rows.service} className="card-demo" onKeyDown={radioKeys(services.map(s => s.id), service, can, setService, i => rows.current[i]?.focus())}>
        {services.map((s, i) => (
          // biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a row of the settings page, as the reader's segments are; its keys are the group's
          <button key={s.id} ref={el => { rows.current[i] = el }} type="button" role="radio" aria-checked={s.id === service} aria-disabled={s.disabled || undefined} tabIndex={s.id === service ? 0 : -1}
            onClick={() => { if (can(s.id)) setService(s.id) }} data-row className="radio-row">
            <Radio />
            <span className="words">
              <span>{s.name}</span>
              <small>{s.hint}</small>
            </span>
          </button>
        ))}
      </div>
      <div>
        <Button kind="text" aria-expanded={open} aria-controls={revealId} onClick={() => setOpen(o => !o)}>{O.services.more}</Button>
        <Reveal id={revealId} open={open}>
          <div className="reveal-body">
            <Field label={O.services.apiKey} hint={O.services.apiKeyLocalHint}>
              <TextInput placeholder="sk-…" />
            </Field>
          </div>
        </Reveal>
      </div>
    </>
  )
}
```

At the end of `src/entrypoints/controls/sheet.css`, add:

```css
/* the settings page's grammar, as far as the form pieces need it (§6.2): a card 4 px in, its rows 8 by 10 px in, a
   radio 12 px before its words — the controls' edge at 14 from the card, the words' at 42 */
.form-demo { display: flex; flex-direction: column; gap: 14px; width: 360px; }
.card-demo { display: flex; flex-direction: column; width: 360px; padding: 4px; border-radius: 10px; background: var(--chrome); box-shadow: var(--card-shadow); }
.radio-row { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 10px; border-radius: 6px; text-align: start; }
.radio-row .words { display: flex; flex-direction: column; gap: 2px; }
.radio-row small { color: var(--ink-2); font-size: 12px; line-height: 1.4; }
.reveal-body { width: 360px; padding-top: 12px; }
```

In `src/entrypoints/controls/specimens/index.ts`, add `import { Forms } from './forms'` after the `Buttons` import,
and after `  { name: 'buttons', Specimen: Buttons },` add:

```ts
  { name: 'forms', Specimen: Forms },
```

- [ ] **Step 7: The form pieces' browser checks**

In `tests/e2e/probes/controls.mjs`, change `import { offCentre, shootEach } from './align.mjs'` to
`import { edges, offCentre, shootEach } from './align.mjs'`, and above the line
`// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----` add:

```js
/** Task 17: fields, radios and a reveal — the settings page's form pieces (settings-2) */
async function forms(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="forms"]`, tag = `${lang} ${theme}`
    const first = `${at} .field:first-child .input`
    const field = await look(page, first), label = await look(page, `${at} .field:first-child > label`), placeholder = await look(page, first, '::placeholder')
    const want = { ground: await token(page, theme, 'background-color', 'var(--field)'), edge: await token(page, theme, 'box-shadow', 'inset 0 0 0 0.5px var(--field-edge)'), ink2: await token(page, theme, 'color', 'var(--ink-2)') }
    check(`${tag}: a field 34 px, radius 8, on its ground with its 0.5 px edge; placeholder and label in ink-2, the label 12 px and 6 px above`,
      near(field?.height, 34) && field.radius === '8px' && field.bg === want.ground && field.shadow === want.edge && placeholder?.color === want.ink2 && label?.color === want.ink2 && label.size === '12px' && near(field.top - label.bottom, 6),
      JSON.stringify({ field, label, placeholder, want }))
    // the pointer's focus shows the field's edge, the keyboard's the ring hugging it (the edge moves in 150 ms: read it after)
    await page.click(first)
    await page.waitForTimeout(200)
    const pressed = await look(page, first)
    await page.click(`${at} > h2`)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    const keyed = await look(page, first)
    const edge = await token(page, theme, 'box-shadow', 'inset 0 0 0 1px var(--ink-3)'), focus = await token(page, theme, 'outline-color', 'var(--focus)')
    check(`${tag}: a field pressed shows its 1 px ink-3 edge and no ring; reached by Tab, the 2 px ring hugging it`, pressed?.shadow === edge && pressed.ring.startsWith('none') && keyed?.ring === 'solid 2px 0px' && keyed.ringColor === focus, JSON.stringify({ pressed, keyed }))
    // a field at fault
    const fault = await page.evaluate(at => {
      const input = document.querySelector(`${at} .input[aria-invalid="true"]`)
      const reason = document.getElementById(input.getAttribute('aria-describedby').split(' ')[0])
      const icon = reason.querySelector('svg'), p = reason.getBoundingClientRect(), i = icon.getBoundingClientRect()
      const line = Number.parseFloat(getComputedStyle(reason).lineHeight)
      return { edge: getComputedStyle(input).boxShadow, ink: getComputedStyle(reason).color, size: getComputedStyle(reason).fontSize, icon: getComputedStyle(icon).color, off: i.top + i.height / 2 - (p.top + line / 2) }
    }, at)
    const danger = { edge: await token(page, theme, 'box-shadow', 'inset 0 0 0 1px var(--danger)'), icon: await token(page, theme, 'color', 'var(--danger)'), ink: await token(page, theme, 'color', 'var(--ink)') }
    check(`${tag}: a field at fault: the danger's edge, its reason under it in ink, 12 px, after a danger icon centred on the first line`, fault.edge === danger.edge && fault.ink === danger.ink && fault.size === '12px' && fault.icon === danger.icon && near(fault.off, 0), JSON.stringify({ fault, danger }))
    // radios
    const marks = () => page.evaluate(at => [...document.querySelectorAll(`${at} [role="radio"]`)].map(r => {
      const m = r.querySelector('.radio'), b = m.getBoundingClientRect()
      return { checked: r.getAttribute('aria-checked'), focused: document.activeElement === r, width: b.width, height: b.height, ring: getComputedStyle(m).boxShadow, dot: getComputedStyle(m, '::after').scale }
    }), at)
    const rings = { on: await token(page, theme, 'box-shadow', 'inset 0 0 0 1.5px var(--ink)'), off: await token(page, theme, 'box-shadow', 'inset 0 0 0 1.5px var(--ink-3)') }
    const rest = await marks()
    check(`${tag}: radios 16 px, the chosen one's ring ink and its dot grown, the others' ink-3`, rest.every(m => near(m.width, 16) && near(m.height, 16) && (m.checked === 'true' ? m.ring === rings.on && m.dot === '1' : m.ring === rings.off && m.dot === '0')), JSON.stringify(rest))
    await page.click(`${at} [role="radio"][aria-checked="true"]`)
    await page.keyboard.press('ArrowDown')
    const once = await marks()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    const twice = await marks()
    check(`${tag}: the arrows move the choice, past the service that cannot be had, the focus going with it`, once[1].checked === 'true' && once[1].focused && twice[0].checked === 'true' && twice[0].focused && twice[0].dot === '1', JSON.stringify({ once, twice }))
    const lead = await edges(page, { items: `${at} .card-demo .radio, ${at} .card-demo .words`, frame: '.card-demo' })
    check(`${tag}: the radios on the controls' edge, 14 px from the card, their words on the words' edge, 42`, JSON.stringify(lead) === '[14,42]', JSON.stringify(lead))
    // the reveal: from nothing to its height in its time, and back; inert while closed; a fade alone under reduced motion
    const toggle = `${at} [aria-controls]`
    const state = () => page.evaluate(sel => { const r = document.querySelector(sel); return { height: r.getBoundingClientRect().height, inert: r.firstElementChild.inert, opacity: getComputedStyle(r).opacity } }, `${at} .reveal`)
    const closed = await state()
    await page.click(toggle)
    await page.waitForTimeout(60)
    const opening = await state()
    await page.waitForTimeout(300)
    const open = await state()
    await page.locator(at).screenshot({ path: join(OUT, `${lang}-${theme}-forms-open.png`), animations: 'disabled', caret: 'hide' })
    await page.click(toggle)
    await page.waitForTimeout(300)
    const shut = await state()
    check(`${tag}: a reveal grows from nothing to its height and back, inert while closed (§8, §9)`, near(closed.height, 0) && closed.inert && opening.height > 0.5 && opening.height < open.height - 0.5 && !open.inert && open.opacity === '1' && near(shut.height, 0) && shut.inert, JSON.stringify({ closed, opening, open, shut }))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.click(toggle)
    await page.waitForTimeout(30)
    const quick = await state()
    await page.click(toggle)
    await page.waitForTimeout(250)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: under reduced motion a reveal takes its height at once, and only fades`, near(quick.height, open.height) && Number(quick.opacity) < 1, JSON.stringify(quick))
  }
}
```

and change `const CHECKS = [base, buttons]` to `const CHECKS = [base, buttons, forms]`.

- [ ] **Step 8: Run the probe**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: every line `ok`, exit 0, the forms' 8 lines per language and theme among them. Look at
`zh-CN-light-forms-open.png` and `en-dark-forms.png` beside `settings-2/png/20-add-failed-light.png` and
`01-translate-dark.png`: the fields' grounds and edges, the reason's icon in the danger's red and its words in ink, the
radio rings.

- [ ] **Step 9: Stage the files, run the gate and the pixel checks, and commit**

Run: `git add src/ui/controls/Field.tsx src/ui/controls/Reveal.tsx src/ui/controls/radio.ts src/styles/controls.css src/entrypoints/controls/specimens/forms.tsx src/entrypoints/controls/specimens/index.ts src/entrypoints/controls/sheet.css tests/e2e/probes/controls.mjs tests/ui/controls/forms.test.ts tests/styles/controls-sheet.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build && node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0; 12 and 24 lines of `ok`; `git status --short` shows nothing else staged.

```bash
git commit -m "feat(ui): fields, radios and reveals for the pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 18: `Segmented`, equal and fit

**Files:**
- Create: `src/ui/controls/Segmented.tsx`
- Modify: `src/styles/controls.css` (the Part 3 layer block)
- Create: `src/entrypoints/controls/specimens/segmented.tsx`; modify `specimens/index.ts`
- Modify: `tests/e2e/probes/controls.mjs` (the `segmented` checks)
- Test: `tests/ui/controls/segmented.test.ts`, `tests/styles/controls-sheet.test.ts`

**Interfaces:**
- Consumes: `radioKeys` (`@/ui/controls/radio`), `useTip` (`@/ui/controls/tip`); the reader's `.seg` rules
  (`.thumb`, `.small`, `.icons`, the disabled segment's grey, forced colours' `Highlight`).
- Produces (`@/ui/controls/Segmented`):
  - `interface SegmentOption<T extends string> { value: T; label: string; icon?: ReactNode; title?: string; disabled?: boolean }`;
  - `Segmented<T extends string>({ label, value, options, onChange, fit = false, size = 'md', iconsOnly = false }: { label: string; value: T; options: readonly SegmentOption<T>[]; onChange: (value: T) => void; fit?: boolean; size?: 'md' | 'sm'; iconsOnly?: boolean })`
    — a `role="radiogroup"` `.seg` (`.fit`, `.small`, `.icons`) whose segments are `role="radio"` buttons, the chosen
    one alone in the tab order. Equal: `--i` / `--n` on the group, the reader's `translate`. Fit: the chosen segment's
    inline `anchor-name` holds `--seg-on`, which `.seg.fit` scopes to itself. A segment's `title` is its tooltip and its
    description (`aria-describedby`); with `iconsOnly` its `label` is its name and its tooltip. `icon` is drawn as given:
    Lucide's `<Icon node={…} size={14} />` in the settings page, the popup's own display glyphs in Part 4;
  - in `controls.css`: `.seg.fit` and its thumb; `.seg > button > span:not(:first-child)` (the icon-to-words gap).

- [ ] **Step 1: Write the failing tests**

`tests/ui/controls/segmented.test.ts`:

```ts
// Segmented controls (Part 3's interfaces; the redesign's design, §2.3, §5.1, §6.4, §8, §9)
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SegmentOption, Segmented } from '@/ui/controls/Segmented'
import { stubPopovers } from '../../pdf-reader/ui/popover-stub'
import { mountElement } from '../render-hook'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

type Mode = 'side' | 'stack' | 'only'
const OPTIONS: SegmentOption<Mode>[] = [
  { value: 'side', label: 'Side' },
  { value: 'stack', label: 'Stacked', disabled: true, title: 'Not in the PDF reader' },
  { value: 'only', label: 'Only' },
]
const key = (target: Element, k: string) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
async function mount(props: Partial<Parameters<typeof Segmented<Mode>>[0]> = {}) {
  const onChange = vi.fn()
  const mounted = await mountElement(createElement(Segmented<Mode>, { label: 'Display', value: 'side', options: OPTIONS, onChange, ...props }))
  const group = mounted.container.querySelector<HTMLElement>('[role="radiogroup"]')!
  return { ...mounted, onChange, group, radios: [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')] }
}

describe('Segmented', () => {
  it('is a radio group named by its label, the chosen segment checked and alone in the tab order', async () => {
    const { group, radios } = await mount()
    expect(group.getAttribute('aria-label')).toBe('Display')
    expect(radios.map(r => [r.getAttribute('aria-checked'), r.getAttribute('tabindex')])).toEqual([['true', '0'], ['false', '-1'], ['false', '-1']])
  })

  it('equal: the thumb placed by the chosen index over the count, the reader\'s way, and no anchor name', async () => {
    const { group, radios } = await mount({ value: 'only' })
    expect([group.className, group.style.getPropertyValue('--i'), group.style.getPropertyValue('--n'), !!group.querySelector('.thumb')]).toEqual(['seg', '2', '3', true])
    expect(radios.some(r => r.style.getPropertyValue('anchor-name').includes('--seg-on'))).toBe(false)
  })

  it('fit: the chosen segment carries the anchor name the control scopes, and no index is written', async () => {
    const { group, radios } = await mount({ value: 'only', fit: true })
    expect([group.className, group.style.getPropertyValue('--i')]).toEqual(['seg fit', ''])
    expect(radios.map(r => r.style.getPropertyValue('anchor-name').includes('--seg-on'))).toEqual([false, false, true])
  })

  it('moves the choice with the arrows past a disabled segment, the focus going with it', async () => {
    const { group, radios, onChange } = await mount()
    await key(group, 'ArrowRight')
    expect([onChange.mock.calls, document.activeElement === radios[2]]).toEqual([[['only']], true])
  })

  it('a disabled segment is greyed and never chosen; its title is its tooltip and its description', async () => {
    const { radios, onChange } = await mount()
    radios[1]!.click()
    radios[0]!.click()
    expect(onChange).not.toHaveBeenCalled()
    const why = document.getElementById(radios[1]!.getAttribute('aria-describedby')!)
    expect([radios[1]!.getAttribute('aria-disabled'), why?.textContent, why?.hidden, radios[1]!.nextElementSibling?.textContent]).toEqual(['true', 'Not in the PDF reader', true, 'Not in the PDF reader'])
  })

  it('icons alone: each segment named by its words, which its tooltip says; small', async () => {
    const icons = OPTIONS.map(o => ({ ...o, icon: createElement('svg') }))
    const { group, radios } = await mount({ options: icons, iconsOnly: true, size: 'sm' })
    expect(group.className).toBe('seg small icons')
    expect([radios[0]!.getAttribute('aria-label'), radios[0]!.querySelector('span'), radios[0]!.nextElementSibling?.textContent]).toEqual(['Side', null, 'Side'])
  })

  it('a value none of the options holds: no thumb, the first that can be had is the tab stop, the arrows go on from it (Review Focus)', async () => {
    const { group, radios, onChange } = await mount({ value: 'gone' as Mode })
    expect([group.querySelector('.thumb'), radios.map(r => r.getAttribute('tabindex'))]).toEqual([null, ['0', '-1', '-1']])
    await key(group, 'ArrowRight')
    expect(onChange).toHaveBeenCalledWith('only')
  })
})
```

In `tests/styles/controls-sheet.test.ts`, at the end of the file, add:

```ts
describe('controls.css: segmented controls', () => {
  it('spaces a segment\'s icon and its words 6 px, leaving the reader\'s one-child segments as they were', () => {
    expect(of('.seg > button > span:not(:first-child)')).toEqual({ 'margin-inline-start': '6px' })
  })

  it('fits segments to their words, the thumb anchored to the chosen one, its start and width moving 220 ms on the ease', () => {
    expect(of('.seg.fit')).toEqual({ display: 'flex', 'anchor-scope': '--seg-on' })
    expect(of('.seg.fit > button')).toEqual({ flex: '1 1 auto', padding: '0 8px' })
    expect(of('.seg.fit .thumb')).toEqual({ 'position-anchor': '--seg-on', 'inset-inline-start': 'anchor(start)', width: 'anchor-size(width)', translate: 'none', transition: 'inset-inline-start 220ms var(--ease), width 220ms var(--ease)' })
  })

  it('holds every thumb still under reduced motion, the fit one too: the reader\'s rule is unlayered, over every component rule', () => {
    expect(of('.seg .thumb', RM)).toEqual({ transition: 'none' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/ui/controls/segmented.test.ts tests/styles/controls-sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/controls/Segmented"`; the new sheet tests throw `0 rules …`, the
reduced-motion one passes already.

- [ ] **Step 3: Write `Segmented`**

`src/ui/controls/Segmented.tsx`:

```tsx
// Segmented controls (the redesign's design, §2.3, §5.1, §6.4, §8; Part 3's interfaces): a single choice drawn as the
// reader's `.seg` — a radio group whose arrows move the choice past a segment that cannot be had, the focus going with
// it (radioKeys). Equal segments slide their thumb by `translate` (the reader's --i and --n); `fit` segments take their
// words' widths, and the thumb follows the chosen one by anchor positioning: the chosen segment carries the anchor name
// each `.seg.fit` scopes to itself (controls.css). A segment's title is its tooltip, and its description to a screen
// reader (why a disabled one cannot be had); a segment of icons alone is named by its words, which its tooltip says
import { type CSSProperties, type ReactNode, useId, useRef } from 'react'
import { radioKeys } from './radio'
import { useTip } from './tip'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** drawn before the words as it is given: Lucide's at 14 px, or the popup's display glyphs */
  icon?: ReactNode
  /** its tooltip and its description: why a disabled segment cannot be had */
  title?: string
  disabled?: boolean
}

/** the chosen segment's anchor name, scoped by each `.seg.fit` to itself */
const CHOSEN = '--seg-on'

export function Segmented<T extends string>({ label, value, options, onChange, fit = false, size = 'md', iconsOnly = false }: {
  label: string
  value: T
  options: readonly SegmentOption<T>[]
  onChange: (value: T) => void
  fit?: boolean
  size?: 'md' | 'sm'
  iconsOnly?: boolean
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const values = options.map(o => o.value)
  const can = (v: T) => !options.find(o => o.value === v)?.disabled
  const choose = (v: T) => { if (v !== value && can(v)) onChange(v) }
  const chosen = values.indexOf(value)
  // a value none of the options holds leaves no thumb, and the first that can be had is the tab stop, the arrows going
  // on from it: the group stays reachable
  const stop = chosen >= 0 ? chosen : options.findIndex(o => !o.disabled)
  const className = ['seg', fit && 'fit', size === 'sm' && 'small', iconsOnly && 'icons'].filter(Boolean).join(' ')
  return (
    <div role="radiogroup" aria-label={label} className={className} style={fit ? undefined : ({ '--i': chosen, '--n': options.length } as CSSProperties)}
      onKeyDown={radioKeys(values, values[stop] as T, can, choose, i => buttons.current[i]?.focus())}>
      {chosen >= 0 && <span className="thumb" aria-hidden="true" />}
      {options.map((option, i) => (
        <Segment key={option.value} option={option} checked={i === chosen} stop={i === stop} anchor={fit && i === chosen} iconsOnly={iconsOnly}
          onPick={() => choose(option.value)} buttonRef={el => { buttons.current[i] = el }} />
      ))}
    </div>
  )
}

function Segment<T extends string>({ option, checked, stop, anchor, iconsOnly, onPick, buttonRef }: {
  option: SegmentOption<T>
  checked: boolean
  stop: boolean
  anchor: boolean
  iconsOnly: boolean
  onPick: () => void
  buttonRef: (el: HTMLButtonElement | null) => void
}) {
  const id = useId()
  const tipped = iconsOnly || option.title !== undefined
  const { props, tip } = useTip(iconsOnly ? option.label : (option.title ?? ''), iconsOnly ? option.title : undefined)
  // anchor-name takes a list: the tooltip's, and the thumb's on the chosen segment of a fit control
  const names = [tipped ? (props.style as { anchorName: string }).anchorName : '', anchor ? CHOSEN : ''].filter(Boolean).join(', ')
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a segment, as the reader's are; its keys are the group's */}
      <button ref={buttonRef} type="button" role="radio" aria-checked={checked} aria-disabled={option.disabled || undefined} aria-label={iconsOnly ? option.label : undefined}
        aria-describedby={option.title ? `${id}-why` : undefined} tabIndex={stop ? 0 : -1} onClick={onPick} {...(tipped ? props : {})} style={names ? ({ anchorName: names } as CSSProperties) : undefined}>
        {option.icon}
        {!iconsOnly && <span>{option.label}</span>}
        {option.title && <span id={`${id}-why`} hidden>{option.title}</span>}
      </button>
      {tipped && tip}
    </>
  )
}
```

- [ ] **Step 4: Write its looks**

In `src/styles/controls.css`, inside the Part 3 `@layer components` block, before its closing `}` (after
`.reveal > div { min-height: 0; overflow: hidden; }`), add:

```css
  /* a segment's icon and its words, 6 px apart (round 1; the settings page's appearance, the popup's display); the
     reader's segments hold one child each, and nothing of theirs moves */
  .seg > button > span:not(:first-child) { margin-inline-start: 6px; }
  /* segments that take their words' widths (§5.1, the popup's display; round 3): the thumb follows the chosen one by
     anchor positioning, its start and width moving 220 ms on the ease (§8); the control scopes the chosen one's name to
     itself, so that two on a page never share one (anchor-scope, Chrome 131). The reader's unlayered reduced-motion rule
     for `.seg .thumb` holds this one still too */
  .seg.fit { display: flex; anchor-scope: --seg-on; }
  .seg.fit > button { flex: 1 1 auto; padding: 0 8px; }
  .seg.fit .thumb { position-anchor: --seg-on; inset-inline-start: anchor(start); width: anchor-size(width); translate: none; transition: inset-inline-start 220ms var(--ease), width 220ms var(--ease); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/ui/controls tests/styles`
Expected: PASS (`segmented.test.ts` 7 tests, `controls-sheet.test.ts` 17).

- [ ] **Step 6: The segmented controls' specimen**

`src/entrypoints/controls/specimens/segmented.tsx`:

```tsx
// Segmented controls (Part 3, Task 18): equal segments — the appearance with its icons and words, the underline's five
// small ones, the appearance as icons alone — and segments that take their words' widths at the popup's width, the
// display, once more with a display the page cannot show
import { Columns2, Monitor, Moon, Rows2, Sun, Type } from 'lucide'
import { useState } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { Segmented } from '@/ui/controls/Segmented'
import { O, R, S } from '@/ui/strings'

type Theme = 'system' | 'light' | 'dark'
type Line = 'none' | 'solid' | 'dotted' | 'dashed' | 'wavy'
type Mode = 'side' | 'stack' | 'only'

export function Segments() {
  const [theme, setTheme] = useState<Theme>('system')
  const [line, setLine] = useState<Line>('none')
  const [mode, setMode] = useState<Mode>('side')
  const [readerMode, setReaderMode] = useState<Mode>('only')
  const themes = [
    { value: 'system' as const, label: R.options.system, icon: <Icon node={Monitor} size={14} /> },
    { value: 'light' as const, label: R.options.light, icon: <Icon node={Sun} size={14} /> },
    { value: 'dark' as const, label: R.options.dark, icon: <Icon node={Moon} size={14} /> },
  ]
  const lines = (['none', 'solid', 'dotted', 'dashed', 'wavy'] as const).map(value => ({ value, label: O.reading.underlines[value] }))
  const modes = (stacks: boolean) => [
    { value: 'side' as const, label: S.mode.side, icon: <Icon node={Columns2} /> },
    { value: 'stack' as const, label: S.mode.stack, icon: <Icon node={Rows2} />, ...(stacks ? {} : { disabled: true, title: S.mode.stackPdf }) },
    { value: 'only' as const, label: S.mode.only, icon: <Icon node={Type} /> },
  ]
  return (
    <>
      <div data-row data-seg="equal"><Segmented label={R.options.appearance} value={theme} options={themes} onChange={setTheme} /></div>
      <div data-row data-seg="small"><Segmented label={O.reading.underline} value={line} options={lines} onChange={setLine} size="sm" /></div>
      <div data-row data-seg="icons"><Segmented label={R.options.appearance} value={theme} options={themes} onChange={setTheme} size="sm" iconsOnly /></div>
      <div data-row data-seg="fit" className="popup-width"><Segmented label={R.display.name} value={mode} options={modes(true)} onChange={setMode} fit /></div>
      <div data-row data-seg="fit-disabled" className="popup-width"><Segmented label={R.display.name} value={readerMode} options={modes(false)} onChange={setReaderMode} fit /></div>
    </>
  )
}
```

In `src/entrypoints/controls/specimens/index.ts`, add `import { Segments } from './segmented'` after the `Forms`
import, and after `  { name: 'forms', Specimen: Forms },` add:

```ts
  { name: 'segmented', Specimen: Segments },
```

- [ ] **Step 7: The segmented controls' browser checks**

In `tests/e2e/probes/controls.mjs`, above the line
`// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----`, add:

```js
/** Task 18: segmented controls — equal ones slide by translate, fit ones follow their chosen segment by anchoring (§8) */
async function segmented(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="segmented"]`, tag = `${lang} ${theme}`
    const seg = kind => `${at} [data-seg="${kind}"] .seg`
    /** a control's thumb against its chosen segment: the offsets of its start and its width, and where it is */
    const onChosen = kind => page.evaluate(sel => {
      const s = document.querySelector(sel), t = s.querySelector('.thumb').getBoundingClientRect(), c = s.querySelector('[aria-checked="true"]').getBoundingClientRect()
      return { start: t.left - c.left, width: t.width - c.width, left: t.left }
    }, seg(kind))
    const heights = [(await look(page, seg('equal')))?.height, (await look(page, seg('small')))?.height, (await look(page, seg('fit')))?.height]
    check(`${tag}: 30 px, 26 small, 30 fit`, near(heights[0], 30) && near(heights[1], 26) && near(heights[2], 30), JSON.stringify(heights))
    const icons = await page.evaluate(sel => [...document.querySelectorAll(`${sel} > button`)].map(b => b.getBoundingClientRect().width), seg('icons'))
    check(`${tag}: segments of icons 36 px each`, icons.every(w => near(w, 36)), JSON.stringify(icons))
    for (const kind of ['equal', 'small', 'icons', 'fit', 'fit-disabled']) {
      const o = await onChosen(kind)
      check(`${tag}: ${kind}: the thumb on the chosen segment`, near(o.start, 0) && near(o.width, 0), JSON.stringify(o))
    }
    const inside = await offCentre(page, { rows: `${at} .seg > button` })
    check(`${tag}: a segment's icon and words on its centre line`, inside.length === 0, JSON.stringify(inside))
    // fit: the segments as wide as their words, and the words fit at the popup's width, in English too (Review Focus)
    const fit = await page.evaluate(sel => {
      const s = document.querySelector(sel), buttons = [...s.querySelectorAll(':scope > button')]
      return { widths: buttons.map(b => Math.round(b.getBoundingClientRect().width)), over: [s, ...buttons].map(e => e.scrollWidth - e.clientWidth) }
    }, seg('fit'))
    check(`${tag}: fit segments as wide as their words, none running over at the popup's width`, new Set(fit.widths).size > 1 && fit.over.every(d => d <= 0), JSON.stringify(fit))
    // the slide: 60 ms after a choice the thumb is on its way, 300 ms after on the new segment
    const from = (await onChosen('fit')).left
    await page.click(`${seg('fit')} > button:last-of-type`)
    await page.waitForTimeout(60)
    const mid = await page.evaluate(sel => document.querySelector(`${sel} .thumb`).getBoundingClientRect().left, seg('fit'))
    await page.waitForTimeout(300)
    const to = await onChosen('fit')
    check(`${tag}: fit: the thumb slides to the chosen segment`, mid > from + 1 && mid < to.left - 1 && near(to.start, 0) && near(to.width, 0), JSON.stringify({ from, mid, to }))
    // the arrows move the choice past the segment that cannot be had, the focus going with it
    await page.focus(`${seg('fit-disabled')} > button[aria-checked="true"]`)
    await page.keyboard.press('ArrowLeft')
    const moved = await page.evaluate(sel => { const b = [...document.querySelectorAll(`${sel} > button`)]; return { checked: b.findIndex(x => x.getAttribute('aria-checked') === 'true'), focused: b.indexOf(document.activeElement) } }, seg('fit-disabled'))
    check(`${tag}: the arrows pass over the disabled segment, the focus going with the choice`, moved.checked === 0 && moved.focused === 0, JSON.stringify(moved))
    // a disabled segment: greyed, never chosen, and its reason in its tooltip and to a screen reader
    const disabled = `${seg('fit-disabled')} > button[aria-disabled="true"]`
    await page.click(disabled, { force: true })
    // the pointer leaves and comes back: a tooltip waits for the pointer's arrival, which the press did not make
    await page.mouse.move(0, 0)
    await page.hover(disabled)
    await page.waitForTimeout(650)
    const why = await page.evaluate(sel => { const b = document.querySelector(sel); return { checked: b.getAttribute('aria-checked'), opacity: getComputedStyle(b).opacity, reason: document.getElementById(b.getAttribute('aria-describedby'))?.textContent, tip: document.querySelector('.tip:popover-open')?.textContent } }, disabled)
    check(`${tag}: a disabled segment greyed and not chosen, its reason in its tooltip and its description`, why.checked === 'false' && why.opacity === '0.55' && !!why.reason && why.tip === why.reason, JSON.stringify(why))
    await page.mouse.move(0, 0)
    // under reduced motion the thumb goes at once
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.click(`${seg('fit')} > button:first-of-type`)
    await page.waitForTimeout(40)
    const quick = await onChosen('fit')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: fit, under reduced motion: the thumb goes at once`, near(quick.start, 0) && near(quick.width, 0), JSON.stringify(quick))
  }
}
```

and change `const CHECKS = [base, buttons, forms]` to `const CHECKS = [base, buttons, forms, segmented]`.

(Playwright treats an `aria-disabled` element as disabled and waits for it to be enabled: the click on the disabled
segment is forced, to prove it does nothing.)

- [ ] **Step 8: Run the probe**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: every line `ok`, exit 0, the segmented checks' 13 lines per language and theme among them. If the slide's
line fails with `mid` equal to `to.left`, the thumb jumps: stop and report it — §8 promises a slide, and the anchoring
must not be replaced by a script without the controller. Look at `en-light-segmented.png` beside
`round-6/png/rows/s2-r2-light.png` (the display under the pair).

- [ ] **Step 9: Stage the files, run the gate and the pixel checks, and commit**

Run: `git add src/ui/controls/Segmented.tsx src/styles/controls.css src/entrypoints/controls/specimens/segmented.tsx src/entrypoints/controls/specimens/index.ts tests/e2e/probes/controls.mjs tests/ui/controls/segmented.test.ts tests/styles/controls-sheet.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build && node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0; 12 and 24 lines of `ok` (the reader's segments hold no `span`, and none is `.fit`); `git status --short`
shows nothing else staged.

```bash
git commit -m "feat(ui): segmented controls, equal and fitted to their words

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 19: `MenuList`, the reader's menu rows shared

**Files:**
- Move: `src/pdf-reader/ui/ReaderMenu.tsx` → `src/ui/controls/MenuList.tsx` (renamed, extended)
- Modify: `src/pdf-reader/ui/Menus.tsx` (its import and its four uses)
- Modify: `src/entrypoints/pdf-reader/reader.css` (an `@source` for `src/ui/controls/`)
- Modify: `src/styles/controls.css` (the Part 3 layer block)
- Create: `src/entrypoints/controls/specimens/menus.tsx`; modify `specimens/index.ts`, `src/entrypoints/controls/sheet.css`
- Modify: `tests/e2e/probes/controls.mjs` (the `menus` checks)
- Test: `tests/ui/controls/menu-list.test.ts`, `tests/styles/controls-sheet.test.ts`

**Interfaces:**
- Consumes: `useMenuNav` (`@/ui/menu-nav`), `Icon`, `Popover` / `usePopover` (`@/ui/controls/Popover`), `Button`
  and `.spin` (Task 16).
- Produces (`@/ui/controls/MenuList`) — the names Parts 4 and 5 use exactly:
  - `interface MenuListItem`:
    - `id: string`, `name: string` — the row's key and its words;
    - `hint?: string` — at the row's end (`inline`), or under the name (`two-line`);
    - `checked?: boolean` — the current choice (the old `src/ui/Menu`'s `MenuItem` says `selected`: Part 4 maps
      `serviceItems`' items);
    - `disabled?: boolean` — the row cannot be chosen: greyed, passed over by the keys unless it has an `action`;
    - `keywords?: string` — more words the search matches;
    - `separatorBefore?: boolean` — a hairline before the row;
    - `lang?: string` — the language of the row's own words (ruling 1): on the name, or, in a row with a `preview`, on
      the sample (the name there is in the interface's language);
    - `action?: { label: string; busy?: boolean }` — a neutral button in the row (24 px, `button` ground, `lift` on the
      active row: ruling 5); `busy` puts a turning loader (`svg.spin`) in its place;
    - `preview?: CSSProperties` — the hint drawn as a sample in this style at the row's end (`.preview`, `aria-hidden`),
      after the name (`.nm`);
    - `manage?: true` — the last row, which leads to managing the list: a separator before it, `ink-2`, never checked;
  - `MenuList({ items, kind, label, layout = 'inline', search, noMatch, onPick, onAction, onClose }: { items: MenuListItem[]; kind: 'listbox' | 'radios' | 'items'; label: string; layout?: 'inline' | 'two-line'; search?: string; noMatch?: string; onPick: (id: string) => void; onAction?: (id: string) => void; onClose: () => void })`;
  - **the action API** (ruling 11): a row with an `action` is picked for its action. A click on the row, or Enter or
    Space on it, calls `onAction(id)` and never `onPick` — whether the row is `disabled` (the Chrome pack's download:
    it cannot be chosen, and still runs) or not. The keys reach such a row though it is disabled. While `busy`, a pick
    does nothing: the action under way is not started twice. The button is drawn, not a `<button>` of its own: the row
    is one option (the listbox holds options alone), and its name carries the button's words. `onAction` is needed
    wherever an item has an `action`;
  - the reader's rows are unchanged with the defaults (`layout: 'inline'`, no `action`, `preview`, `manage` or `lang`).

- [ ] **Step 1: Write the failing tests**

`tests/ui/controls/menu-list.test.ts`:

```ts
// The menus' rows (the reader's design, §6.7; the redesign's design, §5.3; Part 3's interfaces): the reader's, moved,
// with the pages' four additions
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuList, type MenuListItem } from '@/ui/controls/MenuList'
import { mountElement } from '../render-hook'

afterEach(() => { document.body.innerHTML = '' })
const key = (target: Element, k: string) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
async function mount(items: MenuListItem[], props: Partial<Parameters<typeof MenuList>[0]> = {}) {
  const onPick = vi.fn(), onAction = vi.fn(), onClose = vi.fn()
  const mounted = await mountElement(createElement(MenuList, { items, kind: 'listbox', label: 'Service', onPick, onAction, onClose, ...props }))
  return { ...mounted, onPick, onAction, list: mounted.container.querySelector<HTMLElement>('[role="listbox"]')!, rows: [...mounted.container.querySelectorAll<HTMLElement>('[role="option"]')] }
}
const SERVICES: MenuListItem[] = [
  { id: 'microsoft', name: 'Microsoft', hint: 'Free', checked: true },
  { id: 'google', name: 'Google', hint: 'Free' },
  { id: 'chrome', name: 'Chrome', hint: 'Built in', disabled: true, action: { label: 'Download' } },
  { id: 'chrome-busy', name: 'Chrome', hint: 'Downloading', disabled: true, action: { label: 'Download', busy: true } },
  { id: 'manage', name: 'Manage services', manage: true },
]

describe('MenuList', () => {
  it('draws the reader\'s rows by default, as they were: the check, the name, the hint at the end', async () => {
    const { rows } = await mount([{ id: 'a', name: 'A', hint: '100%', checked: true }, { id: 'b', name: 'B' }])
    expect(rows.map(r => r.className)).toEqual(['item', 'item'])
    expect([...rows[0]!.children].map(c => c.getAttribute('class'))).toEqual(['check', 'min-w-0 flex-1 truncate', 'hint'])
    expect([...rows[1]!.children].map(c => c.getAttribute('class'))).toEqual(['check invisible', 'min-w-0 flex-1 truncate'])
  })

  it('two lines: each hint under its name; a row without one keeps one line', async () => {
    const { rows } = await mount(SERVICES, { layout: 'two-line' })
    expect(rows.map(r => r.className)).toEqual(['item two', 'item two', 'item two', 'item two', 'item manage'])
    expect([...rows[0]!.querySelector('.t')!.children].map(c => [c.getAttribute('class'), c.textContent])).toEqual([[null, 'Microsoft'], ['sub', 'Free']])
    expect(rows[0]!.querySelector('.hint')).toBeNull()
  })

  it('reaches a disabled row with an action by the arrows; picked by Enter or a click, it runs the action, never a choice (ruling 11)', async () => {
    const { list, rows, onPick, onAction } = await mount(SERVICES, { layout: 'two-line' })
    await key(list, 'ArrowDown')
    await key(list, 'ArrowDown')
    expect(list.getAttribute('aria-activedescendant')).toBe(rows[2]!.id)
    await key(list, 'Enter')
    rows[2]!.click()
    expect([onAction.mock.calls, onPick.mock.calls]).toEqual([[['chrome'], ['chrome']], []])
    expect(rows[2]!.querySelector('.act')!.textContent).toBe('Download')
  })

  it('does nothing on a row whose action is running, which turns a loader instead of its button (Review Focus)', async () => {
    const { list, rows, onPick, onAction } = await mount(SERVICES, { layout: 'two-line' })
    expect([rows[3]!.querySelector('svg.spin') !== null, rows[3]!.querySelector('.act')]).toEqual([true, null])
    rows[3]!.click()
    for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) await key(list, k)
    expect([onAction.mock.calls.length, onPick.mock.calls.length]).toEqual([0, 0])
  })

  it('picks an enabled row with an action for its action too: onAction, not onPick', async () => {
    const { rows, onPick, onAction } = await mount([{ id: 'pack', name: 'Chrome', action: { label: 'Download' } }])
    rows[0]!.click()
    expect([onAction.mock.calls, onPick.mock.calls]).toEqual([[['pack']], []])
  })

  it('marks a row\'s own words with their language: the name, or in a style\'s row the sample (ruling 1)', async () => {
    const { rows } = await mount([
      { id: 'deu', name: 'Deutsch', lang: 'de' },
      { id: 'muted', name: 'Muted', hint: 'Sample', preview: { opacity: 0.7 }, lang: 'zh-CN' },
      { id: 'plain', name: 'Plain' },
    ])
    expect(rows.map(r => [...r.querySelectorAll('[lang]')].map(e => [e.getAttribute('class'), e.getAttribute('lang')]))).toEqual([
      [['min-w-0 flex-1 truncate', 'de']],
      [['preview', 'zh-CN']],
      [],
    ])
  })

  it('draws a style\'s sample at the row\'s end, hidden from assistive technology, after the name', async () => {
    const { rows } = await mount([{ id: 'muted', name: 'Muted', hint: 'Sample', preview: { opacity: 0.7 } }])
    const sample = rows[0]!.querySelector<HTMLElement>('.preview')!
    expect([rows[0]!.querySelector('.nm')?.textContent, sample.textContent, sample.getAttribute('aria-hidden'), sample.style.opacity, rows[0]!.querySelector('.hint')]).toEqual(['Muted', 'Sample', 'true', '0.7', null])
  })

  it('ends with the way to manage the list: a separator before it, never chosen, picked like any row', async () => {
    const { rows, onPick } = await mount([{ id: 'a', name: 'A', checked: true }, { id: 'manage', name: 'Manage', manage: true, checked: true }])
    expect(rows[1]!.previousElementSibling?.matches('hr.sep')).toBe(true)
    expect([rows[1]!.getAttribute('aria-selected'), rows[1]!.querySelector('.check')!.getAttribute('class')]).toEqual(['false', 'check invisible'])
    rows[1]!.click()
    expect(onPick).toHaveBeenCalledWith('manage')
  })
})
```

In `tests/styles/controls-sheet.test.ts`, at the end of the file, add:

```ts
describe('controls.css: the menus\' rows for the pages', () => {
  it('draws two lines in at least 40 px, 5 px above and below, the hint 11.5 px in ink-2 under the name', () => {
    expect(of('.pop .item.two')).toEqual({ height: 'auto', 'min-height': '40px', 'padding-block': '5px' })
    expect(of('.pop .item .t')).toEqual({ display: 'flex', flex: '1', 'flex-direction': 'column', gap: '1px', 'min-width': '0' })
    expect(of('.pop .item .sub')).toEqual({ color: 'var(--ink-2)', 'font-size': '11.5px' })
  })

  it('puts a neutral button in a row: 24 px, 9 in, radius 6, 12 px / 500, on the neutral ground (§2.1)', () => {
    expect(of('.pop .item .act')).toEqual({ display: 'inline-flex', flex: 'none', 'align-items': 'center', height: '24px', padding: '0 9px', 'border-radius': '6px', background: 'var(--button)', color: 'var(--ink)', 'font-size': '12px', 'font-weight': '500' })
  })

  it('draws a style\'s sample at its row\'s end, 12.5 px, cut off rather than wrapped; the manage row in ink-2', () => {
    expect(of('.pop .item .preview')).toEqual({ flex: '1', 'min-width': '0', overflow: 'hidden', 'white-space': 'nowrap', 'text-overflow': 'clip', 'text-align': 'end', 'font-size': '12.5px' })
    expect(of('.pop .item.manage')).toEqual({ color: 'var(--ink-2)' })
  })

  it('grounds the button of the active row in the lift: in dark the neutral\'s equals the row\'s fill (ruling 5)', () => {
    expect(of('.pop .item[data-active] .act')).toEqual({ background: 'var(--lift)' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/ui/controls/menu-list.test.ts tests/styles/controls-sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/controls/MenuList"`; the new sheet tests throw `0 rules …`.

- [ ] **Step 3: Move the reader's menu rows**

Run: `git mv src/pdf-reader/ui/ReaderMenu.tsx src/ui/controls/MenuList.tsx`

Replace the whole of `src/ui/controls/MenuList.tsx` with:

```tsx
// A menu's rows (the reader's design, §6.7; the redesign's design, §5.3): 30 px, an 8 px radius, the chosen one checked
// at its start, a hint at its end; the list's behaviour is the shared one (ui/menu-nav.ts). A listbox of options (a
// choice among values), or a menu of radios (the zoom) or of plain items (the download). Moved from the reader
// (pdf-reader/ui/ReaderMenu.tsx) for the extension's pages, which add these and change no row the reader draws: two
// lines, each hint under its name (the service menu); a neutral button in a row, which picking the row presses (the
// Chrome pack's download), a loader turning while it runs; a sample drawn in a style at a row's end (the style menu);
// the last row, which leads to managing the list, never chosen, a separator before it; and the language of a row's
// own words, so that a language's own name or a sample in another script is read and drawn as that language
import { Check, Loader } from 'lucide'
import { type CSSProperties, Fragment, useId, useState } from 'react'
import { useMenuNav } from '@/ui/menu-nav'
import { Icon } from './Icon'

export interface MenuListItem {
  id: string
  name: string
  hint?: string
  checked?: boolean
  disabled?: boolean
  keywords?: string
  separatorBefore?: boolean
  /** the language of the row's own words: its name, or the sample in a row with a `preview` (whose name is the interface's) */
  lang?: string
  /** a button in the row (the Chrome pack's download): picking the row presses it, disabled or not; `busy`, a loader instead, and nothing to press */
  action?: { label: string; busy?: boolean }
  /** the hint drawn as a sample in this style at the row's end (the style menu): a picture of the style, hidden from assistive technology */
  preview?: CSSProperties
  /** the last row, which leads to managing the list: never chosen, a separator before it */
  manage?: true
}

export function MenuList({ items, kind, label, layout = 'inline', search, noMatch, onPick, onAction, onClose }: {
  items: MenuListItem[]
  kind: 'listbox' | 'radios' | 'items'
  label: string
  /** `two-line`: each hint under its name, the row at least 40 px; a row with no hint keeps one line */
  layout?: 'inline' | 'two-line'
  /** a search field's placeholder, when the list has one */
  search?: string
  noMatch?: string
  onPick: (id: string) => void
  /** a row with an action picked: its button's press (never a choice); needed wherever an item has an `action` */
  onAction?: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter(i => `${i.name} ${i.keywords ?? ''}`.toLowerCase().includes(q)) : items
  /** a row with an action is picked for its action, disabled or not, unless the action is already running; any other
   *  row is chosen, if it can be */
  const pick = (item: MenuListItem | undefined) => {
    if (!item) return
    if (item.action) {
      if (!item.action.busy) onAction?.(item.id)
      return
    }
    if (!item.disabled) onPick(item.id)
  }
  const nav = useMenuNav({ count: shown.length, initial: shown.findIndex(i => i.checked), isDisabled: i => !!shown[i]?.disabled && !shown[i]?.action, labelOf: i => shown[i]?.name ?? '', onPick: i => pick(shown[i]), onClose, typeahead: !search })
  const role = kind === 'listbox' ? 'option' : kind === 'radios' ? 'menuitemradio' : 'menuitem'
  const listId = `${useId()}-list`
  // the element with the focus takes the keys and names the active item (aria-activedescendant): the search field, a
  // combobox that controls the list, when there is one; else the list itself. Only that element handles them, or a
  // key would be handled twice as it bubbles (the final review: the arrows skipped every other language)
  const keys = { 'aria-activedescendant': nav.activeId, onKeyDown: nav.onKeyDown }
  return (
    <div className="outline-none">
      {search && (
        // the search takes the focus when the menu opens (Popover's data-autofocus)
        <input data-autofocus role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" {...keys} value={query} placeholder={search} aria-label={search} onChange={e => { setQuery(e.target.value); nav.setActive(0) }} onInput={e => { setQuery((e.target as HTMLInputElement).value); nav.setActive(0) }} className="search" />
      )}
      {shown.length === 0 && noMatch && <p className="px-2.5 py-2 text-[12px] text-ink-2">{noMatch}</p>}
      {/* a listbox of options or a menu of items, named, holding its items alone: a separator is drawn, not an item */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a listbox or a menu, named by its label */}
      <div id={listId} role={kind === 'listbox' ? 'listbox' : 'menu'} aria-label={label} tabIndex={search ? undefined : 0} {...(search ? {} : keys)} className="outline-none" data-autofocus={search ? undefined : ''}>
        {shown.map((item, index) => {
          const checked = !!item.checked && !item.manage
          const two = layout === 'two-line' && !!item.hint && !item.preview
          return (
            <Fragment key={item.id}>
              {(item.separatorBefore || item.manage) && <hr role="none" className="sep" />}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the list's keys choose it (ui/menu-nav.ts) */}
              {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: an option, a menu radio or a menu item, by the list's kind */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: an option or a menu item, by the list's kind */}
              <div id={nav.idOf(index)} tabIndex={-1} role={role} aria-selected={kind === 'listbox' ? checked : undefined} aria-checked={kind === 'radios' ? checked : undefined} aria-disabled={item.disabled || undefined}
                data-active={index === nav.active || undefined} onMouseEnter={() => nav.setActive(index)} onClick={() => pick(item)} className={`item${two ? ' two' : ''}${item.manage ? ' manage' : ''}`}>
                {kind !== 'items' && <Icon node={Check} size={14} className={checked ? 'check' : 'check invisible'} />}
                {two ? (
                  <span className="t">
                    <span lang={item.lang}>{item.name}</span>
                    <span className="sub">{item.hint}</span>
                  </span>
                ) : (
                  <span className={item.preview ? 'nm' : 'min-w-0 flex-1 truncate'} lang={item.preview ? undefined : item.lang}>{item.name}</span>
                )}
                {item.preview ? <span className="preview" aria-hidden="true" lang={item.lang} style={item.preview}>{item.hint}</span> : !two && item.hint && <span className="hint">{item.hint}</span>}
                {item.action && (item.action.busy ? <Icon node={Loader} size={14} className="spin" /> : <span className="act">{item.action.label}</span>)}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
```

In `src/pdf-reader/ui/Menus.tsx`, replace the line `import { ReaderMenu } from './ReaderMenu'` with:

```ts
import { MenuList } from '@/ui/controls/MenuList'
```

and each of the four `<ReaderMenu ` with `<MenuList `:

Run: `sed -i '' 's/<ReaderMenu /<MenuList /g' src/pdf-reader/ui/Menus.tsx && grep -rln "ReaderMenu\|ReaderItem" src tests`
Expected: `src/ui/controls/MenuList.tsx` alone (its first comment names the file it came from).

In `src/entrypoints/pdf-reader/reader.css`, after the line `@source "../../pdf-reader/";` add:

```css
/* the shared controls' own sources: the menu rows moved there (src/ui/controls/MenuList.tsx) draw the utilities they
   drew here (the redesign's Part 3) */
@source "../../ui/controls/";
```

- [ ] **Step 4: Write the rows' looks**

In `src/styles/controls.css`, inside the Part 3 `@layer components` block, before its closing `}` (after the
`.seg.fit .thumb { … }` line), add:

```css
  /* a menu's rows for the pages (§5.3): a name over its hint, the row at least 40 px (the service menu, round 4); a
     neutral button in a row (the pack's download: 24 px, 9 in, radius 6, 12 px), on the active row the lift's ground,
     since in dark the neutral's equals the row's fill (ruling 5); a sample drawn in a style at a row's end (the style
     menu); the last row, which leads to managing the list, in ink-2. The reader's rows are untouched */
  .pop .item.two { height: auto; min-height: 40px; padding-block: 5px; }
  .pop .item .t { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
  .pop .item .t > :first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pop .item .sub { color: var(--ink-2); font-size: 11.5px; }
  .pop .item .act { display: inline-flex; flex: none; align-items: center; height: 24px; padding: 0 9px; border-radius: 6px; background: var(--button); color: var(--ink); font-size: 12px; font-weight: 500; }
  .pop .item[data-active] .act { background: var(--lift); }
  .pop .item .spin { flex: none; color: var(--ink-2); }
  .pop .item .nm { flex: none; }
  .pop .item .preview { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: clip; text-align: end; font-size: 12.5px; }
  .pop .item.manage { color: var(--ink-2); }
```

(The loader, `.spin`, is Task 16's.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/ui/controls tests/styles tests/pdf-reader/ui`
Expected: PASS (`menu-list.test.ts` 8 tests, `controls-sheet.test.ts` 21; the reader's `menus.test.ts` as before; the
reader's utilities check in `no-has.test.ts` now reads `src/ui/controls/` too, and none uses a `has-` variant).

- [ ] **Step 6: Check the reader is unchanged**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs`
Expected: 24 lines of `ok`, then every line of `reader-ui.mjs` `ok` (71 today), exit 0. Its check "the appearance's
thumb slides …" samples the thumb 60 ms after a click and failed once in three runs while this plan was drafted, with
nothing of the reader changed: run the spike again once before counting that line, and report it if it fails twice. A
difference in a menu's shot means the
reader's rows changed: compare the item's DOM with the first test above, and the utilities `reader.css` generates now
with before (a utility used in `MenuList.tsx` must still be generated there: the new `@source`).

- [ ] **Step 7: The menus' specimen**

`src/entrypoints/controls/specimens/menus.tsx`:

```tsx
// Menus (Part 3, Task 19): the service menu on two lines, with a pack to download, one downloading and the way to manage
// the services; the style menu, each style's sample drawn in it and marked as Chinese; the language menu with its
// search, in the reader's rows, each name marked as its language. The last pick or action is written under them, for
// the probe
import { type CSSProperties, useState } from 'react'
import { BUILT_IN_STYLES } from '@/config/appearance'
import { toBcp47 } from '@/config/languages'
import { languageItems } from '@/pdf-reader/ui/languages'
import { styleTile } from '@/ui/appearance/tiles'
import { Button } from '@/ui/controls/Button'
import { MenuList, type MenuListItem } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { PREVIEW_TARGET, S, profileName } from '@/ui/strings'

function Menu({ name, label, items, layout, search, noMatch, onEvent }: { name: string; label: string; items: MenuListItem[]; layout?: 'inline' | 'two-line'; search?: string; noMatch?: string; onEvent: (event: string) => void }) {
  const pop = usePopover('listbox')
  const shut = () => document.getElementById(pop.popover.id)?.hidePopover()
  return (
    <>
      <Button data-menu={name} {...pop.trigger} style={{ anchorName: pop.anchor } as CSSProperties}>{label}</Button>
      <Popover {...pop.popover} role="listbox" label={label}>
        <MenuList key={pop.generation} kind="listbox" label={label} layout={layout} search={search} noMatch={noMatch} items={items} onClose={shut}
          onPick={id => { onEvent(`pick:${id}`); shut() }} onAction={id => onEvent(`action:${id}`)} />
      </Popover>
    </>
  )
}

export function Menus() {
  const [last, setLast] = useState('')
  const services: MenuListItem[] = [
    { id: 'microsoft', name: S.service.microsoft, hint: S.service.free, checked: true },
    { id: 'google', name: S.service.google, hint: S.service.free },
    { id: 'chrome', name: S.service.chrome, hint: S.service.chrome_ready, disabled: true, action: { label: S.service.chrome_download } },
    { id: 'chrome-busy', name: S.service.chrome, hint: S.service.chrome_downloading, disabled: true, action: { label: S.service.chrome_download, busy: true } },
    { id: 'manage', name: S.service.manage, manage: true },
  ]
  const styles: MenuListItem[] = [
    // the sample is the Chinese preview sentence whatever the interface (locales/preview.ts): marked as such
    ...BUILT_IN_STYLES.map((style, i) => ({ id: style.id, name: profileName(style), hint: PREVIEW_TARGET, preview: styleTile(style), lang: 'zh-CN', checked: i === 0 })),
    { id: 'manage', name: S.rows.manageStyles, manage: true },
  ]
  // each language written in its own name, and marked as that language
  const languages: MenuListItem[] = languageItems('cmn').map(({ selected, ...item }) => ({ ...item, checked: selected, lang: toBcp47(item.id) }))
  return (
    <>
      <div data-row>
        <Menu name="services" label={S.rows.service} items={services} layout="two-line" onEvent={setLast} />
        <Menu name="styles" label={S.rows.style} items={styles} onEvent={setLast} />
        <Menu name="languages" label={S.rows.language} items={languages} search={S.menu.searchLanguages} noMatch={S.menu.noMatch} onEvent={setLast} />
      </div>
      <output data-last>{last}</output>
    </>
  )
}
```

At the end of `src/entrypoints/controls/sheet.css`, add:

```css
/* the menus' last pick or action, for the probe to read */
output { color: var(--ink-2); font-size: 12px; }
```

In `src/entrypoints/controls/specimens/index.ts`, add `import { Menus } from './menus'` after the `Forms` import (the
imports sorted by name), and after `  { name: 'segmented', Specimen: Segments },` add:

```ts
  { name: 'menus', Specimen: Menus },
```

- [ ] **Step 8: The menus' browser checks**

In `tests/e2e/probes/controls.mjs`, above the line
`// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----`, add:

```js
/** Task 19: the menus' rows — two lines, a button in a row, a sample in a style, the way to manage the list (round 4) */
async function menus(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="menus"]`, tag = `${lang} ${theme}`, pop = `${at} .pop:popover-open`
    const ink2 = await token(page, theme, 'color', 'var(--ink-2)'), button = await token(page, theme, 'background-color', 'var(--button)')
    // the services, on two lines
    await page.click(`${at} [data-menu="services"]`)
    await page.waitForSelector(pop)
    // the menu grows in over 150 ms (pop-in): measured and shot at rest
    await page.waitForTimeout(250)
    const rows = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .item`)].map(i => {
      const style = s => i.querySelector(s) && getComputedStyle(i.querySelector(s))
      const act = i.querySelector('.act')
      return {
        cls: i.className, height: i.getBoundingClientRect().height, color: getComputedStyle(i).color, selected: i.getAttribute('aria-selected'),
        sub: style('.sub') && [style('.sub').fontSize, style('.sub').color], check: style('.check')?.visibility, spin: style('svg.spin')?.animationName ?? null,
        act: act && [act.getBoundingClientRect().height, style('.act').paddingInlineStart, style('.act').borderTopLeftRadius, style('.act').fontSize, style('.act').fontWeight, style('.act').backgroundColor],
        separated: !!i.previousElementSibling?.matches('hr.sep'),
      }
    }), pop)
    const two = rows.filter(r => r.cls === 'item two')
    check(`${tag}: the services on two lines, each at least 40 px, the hint 11.5 px in ink-2`, two.length === 4 && two.every(r => r.height >= 39.5 && r.sub?.[0] === '11.5px' && r.sub?.[1] === ink2), JSON.stringify(two))
    const act = rows.find(r => r.act)?.act
    check(`${tag}: the pack's download, a neutral button in its row: 24 px, 9 in, radius 6, 12 px / 500`, !!act && near(act[0], 24) && act[1] === '9px' && act[2] === '6px' && act[3] === '12px' && act[4] === '500' && act[5] === button, JSON.stringify(act))
    check(`${tag}: a download under way turns a loader instead`, rows.some(r => r.spin === 'turn'), JSON.stringify(rows.map(r => r.spin)))
    const manage = rows.at(-1)
    check(`${tag}: the last row manages the list: after a separator, in ink-2, never chosen`, manage?.cls === 'item manage' && manage.separated && manage.color === ink2 && manage.selected === 'false' && manage.check === 'hidden', JSON.stringify(manage))
    const off = await offCentre(page, { rows: `${pop} .item` })
    check(`${tag}: each menu row's parts on its centre line`, off.length === 0, JSON.stringify(off))
    await page.locator(pop).screenshot({ path: join(OUT, `${lang}-${theme}-menu-services.png`), animations: 'disabled', caret: 'hide' })
    // the keys reach the pack's row though it cannot be chosen, its button on the lift there; Enter runs its action,
    // and on the busy one nothing
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    const lifted = await look(page, `${pop} .item[data-active] .act`)
    check(`${tag}: the active row's button on the lift's ground (ruling 5)`, lifted?.bg === await token(page, theme, 'background-color', 'var(--lift)'), JSON.stringify(lifted))
    await page.keyboard.press('Enter')
    const ran = await page.textContent(`${at} output`)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    const again = await page.textContent(`${at} output`)
    check(`${tag}: Enter on the pack's row runs its action, and on the busy one does nothing`, ran === 'action:chrome' && again === 'action:chrome', JSON.stringify({ ran, again }))
    await page.keyboard.press('Escape')
    // the styles, each sample at its row's end in its style
    await page.click(`${at} [data-menu="styles"]`)
    await page.waitForSelector(pop)
    // the menu grows in over 150 ms (pop-in): measured and shot at rest
    await page.waitForTimeout(250)
    const samples = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .preview`)].map(p => ({ align: getComputedStyle(p).textAlign, size: getComputedStyle(p).fontSize, hidden: p.getAttribute('aria-hidden'), styled: !!p.getAttribute('style'), lang: p.getAttribute('lang'), end: Math.round(p.closest('.item').getBoundingClientRect().right - p.getBoundingClientRect().right) })), pop)
    check(`${tag}: each style's sample at its row's end, 12.5 px, drawn in its style and its language, hidden from a screen reader`, samples.length > 0 && samples.every(s => s.align === 'end' && s.size === '12.5px' && s.hidden === 'true' && s.styled && s.lang === 'zh-CN' && s.end === 10), JSON.stringify(samples))
    await page.locator(pop).screenshot({ path: join(OUT, `${lang}-${theme}-menu-styles.png`), animations: 'disabled', caret: 'hide' })
    await page.keyboard.press('Escape')
    // the languages: the reader's rows, and the search
    await page.click(`${at} [data-menu="languages"]`)
    await page.waitForSelector(pop)
    // the menu grows in over 150 ms (pop-in): measured and shot at rest
    await page.waitForTimeout(250)
    const heights = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .item`)].map(i => i.getBoundingClientRect().height), pop)
    const langs = await page.evaluate(pop => [...document.querySelectorAll(`${pop} .item`)].map(i => i.querySelector('[lang]')?.getAttribute('lang') ?? null), pop)
    await page.keyboard.type('deu')
    const found = await page.evaluate(pop => document.querySelectorAll(`${pop} .item`).length, pop)
    check(`${tag}: the language menu keeps the reader's 30 px rows, each name marked as its language, and its search narrows them`, heights.length === 9 && heights.every(h => near(h, 30)) && langs.every(l => !!l) && found === 1, JSON.stringify({ heights, langs, found }))
    await page.keyboard.press('Escape')
  }
}
```

and change `const CHECKS = [base, buttons, forms, segmented]` to `const CHECKS = [base, buttons, forms, segmented, menus]`.

(`s.end === 10`: a row's end padding is the reader's 10 px, so the sample ends there.)

- [ ] **Step 9: Run the probe**

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: every line `ok`, exit 0, the menus' 9 lines per language and theme among them. Look at
`en-light-menu-services.png` beside `round-4/png/states/P2-light.png` and `zh-CN-dark-menu-services.png` beside
`P2-dark.png`: the two lines, the download's neutral ground, the manage row after its separator.

- [ ] **Step 10: Stage the files, run the gate and the pixel checks, and commit**

`git mv` in Step 3 staged the move (the old path's deletion with it); the rest is staged by name.

Run: `git add src/ui/controls/MenuList.tsx src/pdf-reader/ui/Menus.tsx src/entrypoints/pdf-reader/reader.css src/styles/controls.css src/entrypoints/controls/specimens/menus.tsx src/entrypoints/controls/specimens/index.ts src/entrypoints/controls/sheet.css tests/e2e/probes/controls.mjs tests/ui/controls/menu-list.test.ts tests/styles/controls-sheet.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build && node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0; 12 and 24 lines of `ok`; `git status --short` shows the rename
`src/pdf-reader/ui/ReaderMenu.tsx -> src/ui/controls/MenuList.tsx` and the files above, nothing else.

```bash
git commit -m "refactor(ui): the reader's menu rows become the pages', with two lines, actions, samples and a manage row

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 21: the tooltip's shadow as a role, and the refused-key record as a hook

**Runs after Task 19 and before Task 20** (Part 3's record, which stays last in this file). Added on Part 6's draft:
the main plan's amended "Part 3's interfaces" (ce960723). Its anchors are the files at the branch's head once Task 19 is
committed.

**Files:**
- Modify: `src/shared/tokens.ts` (the role `tip-shadow`), `src/styles/tokens.css` (regenerated by `pnpm tokens`)
- Modify: `src/styles/controls.css` (`.tip` names the role)
- Create: `src/ui/use-rejected.ts`
- Test: `tests/shared/tokens.test.ts`, `tests/styles/controls-sheet.test.ts`, `tests/ui/use-rejected.test.ts` (new)

**Interfaces:**
- Consumes: `rejectedServices(): Promise<Set<string>>` and
  `watchRejected(callback: (ids: Set<string>, previous: Set<string>) => void): () => void` (`@/shared/service-health`);
  `mountHook` (`tests/ui/render-hook.ts`).
- Produces:
  - the role `tip-shadow` in `src/shared/tokens.ts`, one value for both themes, exactly the tooltip's shadow until now:
    `0 4px 12px oklch(0 0 0 / 0.2)` — `--tip-shadow` in the pages' sheet, `--axt-tip-shadow` in a shadow root's (Part 6's
    floating button draws the family's tooltips there); `.tip` draws `box-shadow: var(--tip-shadow)`;
  - `useRejected(): readonly string[]` (`@/ui/use-rejected`): the ids of the services whose key the endpoint refused, for
    the settings page (Part 5) and the reader (Part 6). It subscribes with `watchRejected` first and reads
    `rejectedServices()` after, dropping the read if an event arrived first; a read that fails leaves `[]`, logs one fixed
    line with no id and no key, and the subscription still brings the next change; it unsubscribes on unmount. The
    popup's state keeps its own copy of this logic (`entrypoints/popup/state.ts`), outside React.

- [ ] **Step 1: Write the failing tests**

In `tests/shared/tokens.test.ts`, after the test that starts
`it('holds the two roles the pages add (Part 3; ruling 9)`, add:

```ts
  it('holds the tooltip\'s shadow as a role, its value the one the tooltip drew, the same in both themes (Task 21)', () => {
    expect([resolve('tip-shadow', 'light'), resolve('tip-shadow', 'dark')]).toEqual(['0 4px 12px oklch(0 0 0 / 0.2)', '0 4px 12px oklch(0 0 0 / 0.2)'])
  })
```

At the end of `tests/styles/controls-sheet.test.ts`, add:

```ts
describe('controls.css: the tooltip\'s shadow, a role now (Task 21)', () => {
  it('draws the tooltip\'s shadow from its role', () => {
    expect(of('.tip')['box-shadow']).toBe('var(--tip-shadow)')
  })
})
```

`tests/ui/use-rejected.test.ts`:

```ts
// The refused-key record as a React hook (the redesign's design, §4; Part 3, Task 21): read at mount and followed, the
// read dropped when an event overtook it, a failed read said once without a key, the subscription let go on unmount
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { clearRejected, markRejected, rejectedServices, watchRejected } from '@/shared/service-health'
import { useRejected } from '@/ui/use-rejected'
import { mountHook } from './render-hook'

// the record's own functions, spied on: each test may hold a read back, fail it, or wrap the subscription
vi.mock('@/shared/service-health', async importOriginal => {
  const real = await importOriginal<typeof import('@/shared/service-health')>()
  return { ...real, rejectedServices: vi.fn(real.rejectedServices), watchRejected: vi.fn(real.watchRejected) }
})

describe('useRejected', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('reads the record at mount, then follows it as it changes', async () => {
    await markRejected('svc-a')
    const hook = await mountHook(useRejected)
    await hook.until(() => hook.current().length === 1)
    expect(hook.current()).toEqual(['svc-a'])
    await hook.run(() => markRejected('svc-b'))
    await hook.until(() => hook.current().length === 2)
    await hook.run(async () => { await clearRejected('svc-a') })
    await hook.until(() => hook.current().length === 1)
    expect(hook.current()).toEqual(['svc-b'])
    await hook.unmount()
  })

  it('drops a read an event overtook: subscribed first, read after, the event is the newer', async () => {
    let answer: (ids: Set<string>) => void = () => {}
    vi.mocked(rejectedServices).mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
    const hook = await mountHook(useRejected)
    await hook.run(() => markRejected('svc-new'))
    await hook.until(() => hook.current().length === 1)
    await hook.run(() => answer(new Set(['svc-stale'])))
    expect(hook.current()).toEqual(['svc-new'])
    await hook.unmount()
  })

  it('says once, with no id and no key, that a read failed; the subscription still brings the next change', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(rejectedServices).mockRejectedValueOnce(new Error('Extension context invalidated.'))
    const hook = await mountHook(useRejected)
    await hook.flush()
    expect([hook.current(), warn.mock.calls]).toEqual([[], [['[axt] the refused-key record could not be read']]])
    await hook.run(() => markRejected('svc-a'))
    await hook.until(() => hook.current().length === 1)
    await hook.unmount()
  })

  it('lets the subscription go on unmount', async () => {
    const real = await vi.importActual<typeof import('@/shared/service-health')>('@/shared/service-health')
    const stopped = vi.fn()
    vi.mocked(watchRejected).mockImplementationOnce(callback => {
      const stop = real.watchRejected(callback)
      return () => { stopped(); stop() }
    })
    const hook = await mountHook(useRejected)
    expect(stopped).not.toHaveBeenCalled()
    await hook.unmount()
    expect(stopped).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/shared/tokens.test.ts tests/styles/controls-sheet.test.ts tests/ui/use-rejected.test.ts`
Expected: FAIL — `no token named tip-shadow`; the sheet test reads `0 4px 12px oklch(0 0 0 / 0.2)` for `.tip`'s
`box-shadow`; `Failed to resolve import "@/ui/use-rejected"`.

- [ ] **Step 3: The role, and the tooltip on it**

In `src/shared/tokens.ts`, in `ROLES`, after the line `'tip-ink-2': 'oklch(0.74 0.01 255)',` add:

```ts
  /** the tooltip's shadow, one in both themes as its ground is (Part 3, Task 21; the floating button's tooltips take it
   *  from the shadow root's sheet in Part 6) */
  'tip-shadow': '0 4px 12px oklch(0 0 0 / 0.2)',
```

Run: `pnpm tokens && git diff --stat src/styles/tokens.css`
Expected: `src/styles/tokens.css` changed, 3 lines added (`--tip-shadow`, once in each theme block) and none removed.

In `src/styles/controls.css`, in the `.tip { … }` rule (the first rule of the first `@layer components` block), replace
`box-shadow: 0 4px 12px oklch(0 0 0 / 0.2);` with `box-shadow: var(--tip-shadow);`.

- [ ] **Step 4: The hook**

`src/ui/use-rejected.ts`:

```ts
// The service health record (the redesign's design, §4) as a React hook: the ids of the reader's services whose key the
// endpoint refused, for the settings page and the reader; the popup's state holds the same logic outside React
// (entrypoints/popup/state.ts). Subscribed first, read after: an event heard while the read is still out means the read
// answers a moment already superseded, and applying it would overwrite what the event gave (Codex review, round 3). A
// read that fails leaves no mark shown and says so once, with no id and no key (hard rule 5); the subscription still
// brings the next change
import { useEffect, useState } from 'react'
import { rejectedServices, watchRejected } from '@/shared/service-health'

const NONE: readonly string[] = []

export function useRejected(): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>(NONE)
  useEffect(() => {
    let heard = false
    let live = true
    const stop = watchRejected(now => {
      heard = true
      setIds([...now])
    })
    rejectedServices()
      .then(now => { if (live && !heard) setIds([...now]) })
      .catch(() => console.warn('[axt] the refused-key record could not be read'))
    return () => {
      live = false
      stop()
    }
  }, [])
  return ids
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/shared/tokens.test.ts tests/styles/controls-sheet.test.ts tests/ui/use-rejected.test.ts`
Expected: PASS (`tokens.test.ts` 6 tests, `controls-sheet.test.ts` 22, `use-rejected.test.ts` 4).

- [ ] **Step 6: Stage the files, run the gate and the pixel checks, and commit**

Run: `git add src/shared/tokens.ts src/styles/tokens.css src/styles/controls.css src/ui/use-rejected.ts tests/shared/tokens.test.ts tests/styles/controls-sheet.test.ts tests/ui/use-rejected.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build && node tests/e2e/probes/pages-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0; 12 and 24 lines of `ok` (the tooltip's shadow is the same value, now through its role; the reader's
tooltip shots hold it); `git status --short` shows nothing else staged.

Run: `pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs`
Expected: every line `ok`, exit 0 (232 lines; Task 21 adds no specimen).

```bash
git commit -m "feat(ui): the tooltip's shadow as a role, the refused-key record as a hook

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 20: Part 3's record

Runs last, after Task 21.

- [ ] **Step 1: Every check, on both builds**

Run, each judged by its exit code:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
node experiments/pdf-bilingual/spikes/reader-pixels.mjs     # 24 lines of ok
node experiments/pdf-bilingual/spikes/reader-ui.mjs         # every line ok
node tests/e2e/probes/pages-pixels.mjs                      # 12 lines of ok
pnpm e2e && pnpm e2e:floating                               # the old pages behave as before; the panel frames the popup
pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs   # every line ok, both languages
```

Expected: each exits 0. (`pnpm e2e` reaches arXiv and the free translator: it needs the network.)

- [ ] **Step 2: Look at every shot**

Open each file of `experiments/pdf-bilingual/out/controls/` at full size (they are at twice the pixels: the 200 %
look), both themes and both languages, beside the prototypes' (`round-6/png/rows/`, `round-4/png/states/P2-*.png`,
`kbd-chip/png/compare.png`, `settings-2/png/01`, `08`, `12`, `20`, `zoom-services-hover.png`). Write down anything that
reads wrong — a colour, a measure, a clipped word — for the record below; do not change a value of this plan without the
controller.

- [ ] **Step 3: A local review of the part**

Ask for a local Codex review of Part 3's commits (`/codex:review --base <the commit before Task 14>`). Check each point
against the code, a test or the probe before adopting it; adopt in a commit of its own; write down what was declined
and why in the record.

- [ ] **Step 4: Write the record**

Append to the end of this plan, under a heading `## Part 3: done`: the commits; the probe's measured values (a line
each for the buttons, the field, the radio, the reveal's times, the fit thumb's slide, the menus' rows); and any name or
prop that came out otherwise than "What Parts 4 and 5 use" says — that section is what Parts 4 and 5 are aligned
against, so a difference is also written there, and told to the controller before either part starts. Then what the
parts after it need:

- Parts 4 and 5: "What Parts 4 and 5 use", as built; the controls sheet to add a specimen to when a page's own control
  is worth seeing alone.
- Part 7: `docs/DESIGN.md`'s entry-point row names the controls sheet; the sheet imports `styleTile` from
  `src/ui/appearance/tiles.ts`, which Part 7 moves rather than deletes (ruling 23), this import with it; the pages'
  hairline utility becomes `line` once the old pages' `--axt-line` goes; `tests/e2e/probes/pages-pixels.mjs` holds only
  until Parts 4 and 5 replace the pages it records (it does not apply in their worktrees) and retires here; the old
  `src/ui/{Button,Field,Segmented,Menu,MenuField,Spinner,Switch,LucideIcon}.tsx` and
  `tests/ui/{menu,segmented,lucide-icon}.test.ts` go once both pages have left them.

- [ ] **Step 5: Commit the record**

```bash
git add experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part3-controls.md
git commit -m "docs(ui): Part 3's record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add by name any file the review's fixes touched, in their own commit before this one.)

## Part 3: done

Executed task by task (subagent-driven: an implementer and a reviewer per task, the controller's look at every shot),
2026-09-27. The order ran 14–19, 21, 20.

**Commits** (`14b97082..`, in order): ade09446 the pages' base, two roles and `words-in` (Task 14) · ce960723 plan: Part 6 in
parallel, `tip-shadow` and `useRejected` in Part 3 · 83cfb018 the controls sheet and its probe (15) · a928e171 plans: Task
21, Part 5's shared `useRejected`, the Part 6 plan · fcf0470b `Button`, `Kbd` (16) · 20e2d45f `Field`, `Radio`, `Reveal`
(17) · 2abecc06 `Segmented` (18) · 498e4480 the reader's menu rows move to `src/ui/controls/MenuList.tsx`, a pure move
(git records it as a rename, R100) · 61fddd98 `MenuList` extended (19) · dac067a1 menu rows that act and are busy, the
reader's single-file source (19's review) · 620cf134 Task 17's two parked minors · 716aa2c0 the reader's `@source` says
why · cb1bf42e "What Parts 4 and 5 use" as built · b076406d `tip-shadow`, `useRejected` (21) · and this record.

**Checks at b076406d**, each exit 0: the gate (typecheck, lint, 2 588 tests, build); `reader-pixels.mjs` 24 × ok;
`reader-ui.mjs` 71 × ok; `pages-pixels.mjs` 12 × ok; `pnpm e2e` 71/71; `pnpm e2e:floating` 20/20; the development build
and `tests/e2e/probes/controls.mjs` 232 × ok (both languages, both themes).

**The probe's measured values** (zh-CN light; the other three runs read the same):

- Buttons: `lg` 36 px, radius 9 · `md` 32 px, radius 8, 16 px in (brand) / 10 px (text) · `sm` 28 px, radius 7, 12 px in,
  12.5 px / 500 · `raised` 26 px, radius 7, 10 px in; an icon 7 px before the words, the shortcut 8 px after them; the
  shortcut label 11 px / 500, 3 by 5 in, radius 5, on `brand-chip` in `on-brand` (measured on the shot: 5.42:1 light,
  4.61:1 dark, the agreed light-white label's 5.41 / 4.59).
- Field: 34 px, radius 8, its ground with a 0.5 px edge; label 12 px in `ink-2`, 6 px above; pressed, a 1 px `ink-3` edge
  and no ring; by Tab, the 2 px ring hugging it; at fault, the `danger` edge and its reason in `ink` after a danger icon.
- Radio: 16 px; chosen, an `ink` ring and its dot; the others `ink-3`; on the controls' edge 14 px from the card, the
  words at 42.
- Reveal: grows from nothing to its height and back, `inert` while closed; under reduced motion it takes its height at
  once and only fades.
- Segmented: 30 px (26 small, 30 fit), icon segments 36 px; the fit thumb slides to the chosen segment (not a jump), and
  goes at once under reduced motion.
- Menus: the services on two lines, each at least 40 px (45 in the shots), the hint 11.5 px in `ink-2`; the pack's
  download 24 px, 9 in, radius 6, 12 px / 500, on `lift` on the active row; each row's parts on its centre line; the
  language menu keeps the reader's 30 px rows.

**The look** (every shot beside the prototypes, at twice the pixels): buttons against round 6's P9 / P17, the chip against
`kbd-chip/png/compare.png`, forms against settings-2 20 / 01 / 03, segmented against P13 and settings-2 08, the small
neutral button against `zoom-services-hover.png` and 12, menus against round 4's P2 — all match. Two differences settled
by the design, not by the prototype: the menus' download is neutral (round 4 drew it raised white; popup-decisions and the
design's §5.3 say neutral), and a menu name starts 31 px from its row's edge (round 4: 33 with a 16 px check; the design's
§2.3 moves the reader's rows as they are, with its 14 px check). One value is derived rather than drawn: the 1 px
`danger` edge on a field at fault (the design's §9 names `aria-invalid` only; the words stay `ink`) — for the maintainer's
look in Part 7.

**The local review** (Codex, `--base 14b97082 --scope branch`): one comment, declined — it read the working tree's
uncommitted gallery harness (`gallery/main.tsx` importing the untracked `reader-break.tsx`), which no commit of the branch
touches.

**Otherwise than planned** (already written into "What Parts 4 and 5 use" at cb1bf42e):

- `MenuList`: a disabled row with an `action` is operable, so it carries no `aria-disabled`; it is greyed by the class
  `unavailable` (the disabled row's `ink-3`, the row's own cursor). A busy action's row carries `aria-busy="true"`; its
  hint carries the words. The active row at the start never falls on the manage row. A missing `onAction` is a silent
  no-op: each page tests its action row through the DOM.
- The reader's sheet `@source`s only `src/ui/controls/MenuList.tsx` of the shared controls (Tailwind reads comments; the
  directory had brought in `.grow`); a shared control the reader uses that brings utilities needs its own line.
  `tests/styles/no-has.test.ts` walks a file source as well as a directory.
- The test counts the tasks predicted grew with the review rounds' tests (the sheet test holds 23, not 22).

**Parked minors** (none blocks Parts 4 and 5; for the final review or Part 7): `Button` draws an empty `<span>` for the
children `''` (no caller passes it); no rule for a disabled `raised` button (no caller); `iconsOnly` with a disabled
segment's `title` untested (no plan uses `iconsOnly`); the reader's own `@source "../../pdf-reader/"` reads the engine's
`.mjs` comments, which put `.table { display: table }` in the reader's sheet — inert today (neither PDF.js nor the
reader uses a class `table`), to be closed with the other sources in Part 7.

**What the parts after it need:**

- Parts 4 and 5: "What Parts 4 and 5 use", as built; the controls sheet (`src/entrypoints/controls/`, development builds
  only) to add a specimen to when a page's own control is worth seeing alone. Their worktrees are created from this
  record's commit.
- Part 6: `useRejected` (`@/ui/use-rejected`), the role `tip-shadow` (`--axt-tip-shadow` in a shadow root), `MenuList`'s
  contract above for the reader's service menu.
- Part 7: `docs/DESIGN.md`'s entry-point row names the controls sheet; the sheet imports `styleTile` from
  `src/ui/appearance/tiles.ts`, which Part 7 moves rather than deletes (ruling 23), this import with it; the pages'
  hairline utility becomes `line` once the old pages' `--axt-line` goes; `tests/e2e/probes/pages-pixels.mjs` holds only
  until Parts 4 and 5 replace the pages it records (it does not apply in their worktrees) and retires here; the old
  `src/ui/{Button,Field,Segmented,Menu,MenuField,Spinner,Switch,LucideIcon}.tsx` and
  `tests/ui/{menu,segmented,lucide-icon}.test.ts` go once both pages have left them; the parked minors above.
