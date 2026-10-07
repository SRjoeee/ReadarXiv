# The extension's interface, redesigned: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the popup, the settings page, the floating button and the controls on arXiv's pages from the PDF
reader's design system, with one appearance for the whole extension and configuration v20, as the design specifies.

**Architecture:** One token source (`src/shared/tokens.ts`) writes the extension pages' sheet (`src/styles/tokens.css`)
and, at run time, the shadow roots' sheet; the reader's controls move to `src/ui/controls/` and `src/styles/controls.css`
and the reader is moved onto both without a pixel changing. Configuration v20 replaces the reader's appearance with the
extension's `theme`, reduces the preload to two choices and the figure gate to on and off; a record outside the
configuration (`local:serviceHealth`) remembers a refused key. The surfaces are then rebuilt on these, one part each.

**Tech Stack:** WXT 0.21, React 19, TypeScript, Tailwind v4, zod, Vitest + happy-dom, Playwright (Chromium) for the
browser checks, tsx for scripts.

**Spec:** `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (the design). Section references
below (§n) are the design's.

## Global Constraints

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

## Review Focus

- **Light chosen while the system is dark**: the popup and the settings page must draw light. Today `ui.css`'s dark
  block answers the system alone, so an explicit light is overruled. Pinned in Task 10.
- **A hand-edited v19 configuration whose `pdfReader` is not an object**: the migration must not throw; the schema
  names the field and the settings page shows S-O-02. Pinned in Task 7.
- **A key refused, then made good at the vendor and entered again unchanged**: the connection test must reach the
  endpoint (the record must not short-circuit it), and its success clears the record. Pinned in Task 11.
- **Whole chosen while a paper translates on demand**: everything still waiting is requested at once, as 整篇 does
  today; chosen again, nothing is requested twice. Pinned in Task 8.
- **A figure's text on a page whose stored modes left out the display in use**: after v20 it is asked for and shown
  (the gate is on and off only). Pinned in Task 9.

## The parts

Six pieces of work that each end in software that runs. This document holds **Parts 1 and 2 in full**; each later part
is written as its own plan, appended here, once the part before it is done: its code depends on the shape the shared
controls and the configuration actually take.

1. **Tokens and shared controls** (Tasks 1–6). The token source and its sheets; the contrast gate; the reader's pixel
   baseline; the reader moved onto the tokens and its controls moved to `src/ui/controls/`, pixel-identical.
2. **One appearance, configuration v20, the service health record** (Tasks 7–13). `theme`; the two preload choices;
   figure text in every display; the extension pages following `theme`; a refused key remembered, passed over by the
   chain and told by the popup.
3. **The popup** (§5): the structure and measures of round 6; notes; P9 / P13; the menus and their 管理… rows; P0's
   search and open; P17's two entries; the reader open; the ⌥T label.
4. **The settings page** (§6): the frame, search and deep links; the row grammar; 翻译 (services, adding in place, the
   refused key, edit and delete with undo, the LLM group, prompts, glossary); 外观; 阅读; 数据; S-O-02.
5. **The floating button and the controls on arXiv's pages** (§7), with the before-and-after screenshots shown to the
   maintainer before it merges.
6. **Verification and documents** (§12, §13): the alignment probe, 200 % and 320 px, the accessibility audit, the popup's
   first paint, UI.md / DESIGN.md / the reader's design / CHANGELOG, the pull request.

## Files, Parts 1 and 2

| File | Part | Responsibility |
|---|---|---|
| `src/shared/tokens.ts` (new) | 1 | The ramp, the roles and the constants, in light and dark; `tokenSheet(scope)`; `resolve(name, mode)` |
| `scripts/tokens.ts` (new) | 1 | Writes `src/styles/tokens.css` from the source (`pnpm tokens`) |
| `src/styles/tokens.css` (new, generated) | 1 | The tokens for the extension's pages |
| `src/styles/controls.css` (new) | 1 | The shared controls' rules, moved from `reader.css` |
| `src/ui/controls/{Switch,Popover,tip,modality,radio,transitions,Icon}` (moved / new) | 1 | The shared controls' code |
| `src/entrypoints/pdf-reader/reader.css` | 1 | Imports the two sheets; keeps the reader's own rules |
| `experiments/pdf-bilingual/spikes/reader-pixels.mjs` (new) | 1 | The reader's pixels and computed tokens, against a recorded baseline |
| `tests/shared/tokens.test.ts`, `tests/shared/contrast.test.ts`, `tests/shared/wcag.ts` (new) | 1 | The sheet in sync; the reader's values; the pairs of §12 |
| `src/config/schema.ts`, `src/config/storage.ts` | 2 | v20: `theme`, `preload`, `image` |
| `src/core/scheduler/lazy.ts`, `src/core/session/index.ts` | 2 | `preloadOf`; the figure gate on and off |
| `src/pdf-reader/settings.ts`, `src/pdf-reader/ui/ReadingOptions.tsx`, `src/entrypoints/pdf-reader/App.tsx` | 2 | The reader reads and writes `theme`; figure text by the switch |
| `src/entrypoints/options/sections/{Reading,Services,PdfReader}.tsx` | 2 | The old settings page on the v20 shape until Part 4 replaces it |
| `src/ui/theme.ts` (new), `src/styles/ui.css`, `src/entrypoints/{popup,options}/main.tsx` | 2 | The extension pages follow `theme` |
| `src/shared/service-health.ts` (new) | 2 | The refused-key record |
| `src/providers/fallback.ts`, `src/providers/transport.ts`, `src/entrypoints/background/{index,handlers}.ts` | 2 | The record written, seeded into the chain, cleared by a connection |
| `src/entrypoints/popup/{view-model,state}.ts`, `src/ui/service-items.ts` | 2 | The popup counts a refused service as one that cannot run |

---

# Part 1: tokens and shared controls

Part 1 changes nothing a reader can see. Its test is that the reader looks exactly as it did.

### Task 1: the token source and the pages' sheet

**Files:**
- Create: `src/shared/tokens.ts`
- Create: `scripts/tokens.ts`
- Create: `src/styles/tokens.css` (generated by `pnpm tokens`)
- Modify: `package.json` (the `tokens` script)
- Test: `tests/shared/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RAMP`, `ROLES`, `CONSTANTS` (records of token values); `type Mode = 'light' | 'dark'`;
  `tokenSheet(scope: 'page' | 'host'): string`; `resolve(name: string, mode: Mode): string` (a token's value with every
  `$name` reference replaced by that token's value, for the contrast gate). `src/styles/tokens.css` defines, unprefixed:
  the ramp `--n-0` … `--n-10`, every role of §2.1 (`--canvas`, `--chrome`, `--chrome-line`, `--ink`, `--ink-2`,
  `--ink-3`, `--line-strong`, `--well`, `--lift`, `--fill`, `--float-bg`, `--focus`, `--danger`, `--page-shadow`,
  `--float-shadow`, `--pop-shadow`, `--page`, `--group`, `--button`, `--button-danger`, `--button-raised`,
  `--raised-shadow`, `--field`, `--field-edge`, `--card-shadow`, `--brand`, `--on-brand`, `--brand-chip`, `--success`,
  `--mark`, `--tip-bg`, `--tip-ink`, `--tip-ink-2`) and the constants `--font`, `--ease`.

- [ ] **Step 1: Write the failing test**

`tests/shared/tokens.test.ts`:

```ts
// The token source (the redesign's design, §2.1, §2.2): the committed sheet is the source's, the reader's values are
// kept exactly, and a shadow root's sheet names nothing without the extension's prefix
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RAMP, resolve, tokenSheet } from '@/shared/tokens'

const SHEET = join(import.meta.dirname, '../../src/styles/tokens.css')

describe('the token source', () => {
  it('is what the committed sheet holds: `pnpm tokens` rewrites it', () => {
    expect(readFileSync(SHEET, 'utf8')).toBe(tokenSheet('page'))
  })

  it('keeps the reader\'s ramp and roles as the reader\'s design §4.1 set them', () => {
    expect(RAMP).toEqual({
      'n-0': { light: 'oklch(1 0 0)', dark: 'oklch(0.255 0.006 255)' },
      'n-1': { light: 'oklch(0.985 0.002 255)', dark: 'oklch(0.215 0.006 255)' },
      'n-2': { light: 'oklch(0.962 0.004 255)', dark: 'oklch(0.185 0.006 255)' },
      'n-3': { light: 'oklch(0.935 0.006 255)', dark: 'oklch(0.275 0.007 255)' },
      'n-4': { light: 'oklch(0.905 0.007 255)', dark: 'oklch(0.31 0.008 255)' },
      'n-5': { light: 'oklch(0.86 0.008 255)', dark: 'oklch(0.36 0.009 255)' },
      'n-7': { light: 'oklch(0.62 0.012 255)', dark: 'oklch(0.56 0.01 255)' },
      'n-8': { light: 'oklch(0.505 0.014 255)', dark: 'oklch(0.71 0.01 255)' },
      'n-10': { light: 'oklch(0.235 0.012 255)', dark: 'oklch(0.935 0.005 255)' },
    })
    const both = (name: string) => [resolve(name, 'light'), resolve(name, 'dark')]
    expect(both('canvas')).toEqual(['oklch(0.935 0.006 255)', 'oklch(0.275 0.007 255)'])
    expect(both('well')).toEqual(['oklch(0.935 0.006 255)', 'oklch(0.185 0.006 255)'])
    expect(both('lift')).toEqual(['oklch(1 0 0)', 'oklch(0.36 0.009 255)'])
    expect(both('fill')).toEqual(['oklch(0.935 0.006 255)', 'oklch(0.31 0.008 255)'])
    expect(both('focus')).toEqual(both('ink'))
    expect(both('danger')).toEqual(['oklch(0.545 0.17 28)', 'oklch(0.69 0.15 28)'])
    expect(both('pop-shadow')).toEqual([
      '0 0 0 0.5px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.14)',
      '0 0 0 0.5px oklch(1 0 0 / 0.1), 0 14px 36px oklch(0 0 0 / 0.5)',
    ])
  })

  it('writes the pages\' sheet with the reader\'s selectors: light, the system\'s dark unless light is chosen, dark chosen', () => {
    const css = tokenSheet('page')
    expect(css).toContain(':root,\n[data-theme="light"] {\n  color-scheme: light;')
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;')
    expect(css).toContain('\n[data-theme="dark"] {\n  color-scheme: dark;')
    expect(css).toContain('  --fill: var(--n-4);')
    expect(css).toContain('  --float-bg: color-mix(in oklab, var(--n-0) 90%, transparent);')
  })

  it('writes a shadow root\'s sheet on :host, every variable it defines or names prefixed --axt- (hard rule 2)', () => {
    const css = tokenSheet('host')
    expect(css).toContain(':host,\n:host([data-theme="light"]) {')
    expect(css).toContain(':host(:not([data-theme="light"]))')
    expect(css).toContain(':host([data-theme="dark"]) {')
    const defined = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]!)
    expect(defined.length).toBeGreaterThan(40)
    expect(defined.filter(n => !n.startsWith('--axt-'))).toEqual([])
    expect(css).not.toMatch(/var\(--(?!axt-)/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/shared/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "@/shared/tokens"`.

- [ ] **Step 3: Write the token source**

`src/shared/tokens.ts`:

```ts
// The extension's design tokens (the redesign's design, §2.1): one source for every surface — the reader, the popup,
// the settings page, and the shadow roots the content script puts on arXiv's pages. Here because the floating button
// and the figure viewer live in src/core, which may not import src/ui (hard rule 8). A surface names a role; nothing
// else in the tree writes a colour.
//
// A value is one string for both themes, or one per theme. `$name` names another token of the same sheet; the writer
// turns it into `var(<prefix>name)` and `resolve` into the value it names.

export type Mode = 'light' | 'dark'
export interface Themed { light: string; dark: string }
type Value = string | Themed

/** The reader's neutral ramp (the reader's design, §4.1): one cool neutral at hue 255, and the dark theme's own */
export const RAMP = {
  'n-0': { light: 'oklch(1 0 0)', dark: 'oklch(0.255 0.006 255)' },
  'n-1': { light: 'oklch(0.985 0.002 255)', dark: 'oklch(0.215 0.006 255)' },
  'n-2': { light: 'oklch(0.962 0.004 255)', dark: 'oklch(0.185 0.006 255)' },
  'n-3': { light: 'oklch(0.935 0.006 255)', dark: 'oklch(0.275 0.007 255)' },
  'n-4': { light: 'oklch(0.905 0.007 255)', dark: 'oklch(0.31 0.008 255)' },
  'n-5': { light: 'oklch(0.86 0.008 255)', dark: 'oklch(0.36 0.009 255)' },
  'n-7': { light: 'oklch(0.62 0.012 255)', dark: 'oklch(0.56 0.01 255)' },
  'n-8': { light: 'oklch(0.505 0.014 255)', dark: 'oklch(0.71 0.01 255)' },
  'n-10': { light: 'oklch(0.235 0.012 255)', dark: 'oklch(0.935 0.005 255)' },
} as const satisfies Record<string, Themed>

/** The roles, by what they are for (the redesign's design, §2.1). The reader's come first, with its values */
export const ROLES = {
  canvas: '$n-3',
  chrome: '$n-0',
  'chrome-line': '$n-4',
  ink: '$n-10',
  'ink-2': '$n-8',
  'ink-3': '$n-7',
  /** an edge that marks a choice, a step lighter than the focus's ink so that the two read apart */
  'line-strong': '$n-7',
  /** dark: the well sunk below the chrome and the thumb raised above it, and a stronger fill (Part 6 of the reader) */
  well: { light: '$n-3', dark: '$n-2' },
  lift: { light: '$n-0', dark: '$n-5' },
  fill: { light: '$n-3', dark: '$n-4' },
  'float-bg': 'color-mix(in oklab, $n-0 90%, transparent)',
  /** the keyboard's ring in the ink: the chrome has no hue but danger's and the brand's */
  focus: '$n-10',
  danger: { light: 'oklch(0.545 0.17 28)', dark: 'oklch(0.69 0.15 28)' },
  'page-shadow': {
    light: '0 0 0 0.5px oklch(0 0 0 / 0.05), 0 1px 2px oklch(0 0 0 / 0.04)',
    dark: '0 0 0 0.5px oklch(0 0 0 / 0.4), 0 4px 16px oklch(0 0 0 / 0.35)',
  },
  'float-shadow': {
    light: '0 0 0 0.5px oklch(0 0 0 / 0.08), 0 4px 16px oklch(0 0 0 / 0.08)',
    dark: '0 0 0 0.5px oklch(1 0 0 / 0.08), 0 6px 20px oklch(0 0 0 / 0.4)',
  },
  'pop-shadow': {
    light: '0 0 0 0.5px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.14)',
    dark: '0 0 0 0.5px oklch(1 0 0 / 0.1), 0 14px 36px oklch(0 0 0 / 0.5)',
  },
  // the extension's other surfaces (the popup, the settings page, the floating button)
  page: '$n-1',
  /** the popup's grouped rows and its notes */
  group: '$n-2',
  button: { light: '$n-2', dark: '$n-4' },
  /** the small button asking to confirm a destructive action: its words in danger read 4.83:1 and 5.01:1 on it */
  'button-danger': { light: '$n-2', dark: '$n-3' },
  'button-raised': { light: '$n-0', dark: '$n-4' },
  'raised-shadow': { light: '0 0 0 0.5px $n-4, 0 1px 1px oklch(0 0 0 / 0.04)', dark: 'none' },
  field: { light: '$n-1', dark: '$n-2' },
  'field-edge': '$n-5',
  'card-shadow': { light: '0 0 0 0.5px $n-4, 0 1px 2px oklch(0 0 0 / 0.03)', dark: '0 0 0 0.5px oklch(1 0 0 / 0.06)' },
  /** the logo's red, #AA142D; the one primary action's fill */
  brand: { light: 'oklch(0.474 0.18 20.5)', dark: 'oklch(0.56 0.19 20.5)' },
  'on-brand': 'oklch(1 0 0)',
  /** a shortcut label on the brand (the maintainer, 2026-09-26: round 2's light label) */
  'brand-chip': { light: 'oklch(1 0 0 / 0.18)', dark: 'oklch(1 0 0 / 0.08)' },
  success: { light: 'oklch(0.62 0.14 150)', dark: 'oklch(0.72 0.14 150)' },
  /** a search hit, behind the words */
  mark: { light: 'oklch(0.85 0.12 95 / 0.7)', dark: 'oklch(0.55 0.1 95 / 0.55)' },
  /** tooltips are dark in both themes */
  'tip-bg': 'oklch(0.22 0.01 255)',
  'tip-ink': 'oklch(0.96 0 0)',
  'tip-ink-2': 'oklch(0.74 0.01 255)',
} as const satisfies Record<string, Value>

/** What does not change with the theme */
export const CONSTANTS = {
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "PingFang SC", "Noto Sans SC", sans-serif',
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
} as const

const at = (value: Value, mode: Mode): string => (typeof value === 'string' ? value : value[mode])
const REF = /\$([a-z0-9-]+)/g

/** A token's value in a theme, every `$name` in it replaced by what that token holds (the contrast gate reads colours so) */
export function resolve(name: string, mode: Mode): string {
  const ramp = (RAMP as Record<string, Themed>)[name]
  if (ramp) return ramp[mode]
  const role = (ROLES as Record<string, Value>)[name]
  if (role === undefined) throw new Error(`no token named ${name}`)
  return at(role, mode).replace(REF, (_, ref: string) => resolve(ref, mode))
}

function declarations(mode: Mode, prefix: string, indent: string): string {
  const lines = [`color-scheme: ${mode};`]
  for (const [name, value] of Object.entries(RAMP)) lines.push(`${prefix}${name}: ${value[mode]};`)
  for (const [name, value] of Object.entries(ROLES)) lines.push(`${prefix}${name}: ${at(value, mode).replace(REF, (_, ref: string) => `var(${prefix}${ref})`)};`)
  return lines.map(line => `${indent}${line}`).join('\n')
}

/** Where each block goes: the extension's pages on their root, a shadow root on its host. Roles sit in each theme's
 *  block, beside the ramp, so that an element that sets `data-theme` (the gallery's dark half) resolves them anew */
const SELECTORS = {
  page: { light: ':root,\n[data-theme="light"]', system: ':root:not([data-theme="light"])', dark: '[data-theme="dark"]', constants: ':root' },
  host: { light: ':host,\n:host([data-theme="light"])', system: ':host(:not([data-theme="light"]))', dark: ':host([data-theme="dark"])', constants: ':host' },
} as const

/** The sheet: `page` unprefixed for the extension's own documents, `host` prefixed `--axt-` for a shadow root on arXiv's pages */
export function tokenSheet(scope: 'page' | 'host'): string {
  const s = SELECTORS[scope]
  const prefix = scope === 'page' ? '--' : '--axt-'
  const constants = Object.entries(CONSTANTS).map(([name, value]) => `  ${prefix}${name}: ${value};`).join('\n')
  return [
    scope === 'page' ? '/* Generated from src/shared/tokens.ts by `pnpm tokens`: edit the source, not this file */\n' : '',
    `${s.light} {\n${declarations('light', prefix, '  ')}\n}\n`,
    `@media (prefers-color-scheme: dark) {\n  ${s.system} {\n${declarations('dark', prefix, '    ')}\n  }\n}\n`,
    `${s.dark} {\n${declarations('dark', prefix, '  ')}\n}\n`,
    `${s.constants} {\n${constants}\n}\n`,
  ].join('')
}
```

- [ ] **Step 4: Write the generator and its script**

`scripts/tokens.ts`:

```ts
// Writes src/styles/tokens.css from src/shared/tokens.ts: `pnpm tokens`. tests/shared/tokens.test.ts fails while the
// committed sheet and the source differ
import { writeFileSync } from 'node:fs'
import { tokenSheet } from '../src/shared/tokens'

writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), tokenSheet('page'))
```

In `package.json` `scripts`, after `"icons": "node scripts/icons.mjs",` add:

```json
    "tokens": "tsx scripts/tokens.ts",
```

Run: `pnpm tokens`
Expected: `src/styles/tokens.css` exists and starts with the generated-file comment.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run tests/shared/tokens.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. (`tests/styles/no-has.test.ts` now reads `tokens.css` too, and passes.)

```bash
git add src/shared/tokens.ts scripts/tokens.ts src/styles/tokens.css package.json tests/shared/tokens.test.ts
git commit -m "feat(ui): one token source and the pages' generated sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: the contrast gate

**Files:**
- Create: `tests/shared/wcag.ts`
- Test: `tests/shared/contrast.test.ts`

**Interfaces:**
- Consumes: `resolve(name, mode)` (Task 1).
- Produces: `parseOklch(css: string): Rgba`, `over(top: Rgba, below: Rgba): Rgba`, `contrast(a: Rgba, b: Rgba): number`
  in `tests/shared/wcag.ts`, for any later test that measures a pair.

- [ ] **Step 1: Write the colour arithmetic**

`tests/shared/wcag.ts`:

```ts
// WCAG contrast from oklch() colours, as the browser paints them: oklch → OKLab → linear sRGB (Ottosson's matrices),
// clamped and encoded to sRGB, an alpha composited in sRGB over what lies below, then WCAG 2's relative luminance.
// The same arithmetic as the prototypes' brand.py, whose numbers the design quotes (§12)

/** r, g, b in encoded sRGB 0–1, and alpha */
export type Rgba = [number, number, number, number]

export function parseOklch(css: string): Rgba {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(css.trim())
  if (!m) throw new Error(`not an oklch() colour: ${css}`)
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const alpha = m[4] === undefined ? 1 : Number(m[4])
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ]
  const encode = (x: number) => {
    const c = Math.min(1, Math.max(0, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  return [encode(linear[0]!), encode(linear[1]!), encode(linear[2]!), alpha]
}

/** `top` painted over `below`, which is opaque */
export const over = (top: Rgba, below: Rgba): Rgba =>
  [0, 1, 2].map(i => top[i]! * top[3] + below[i]! * (1 - top[3])).concat(1) as Rgba

const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
```

- [ ] **Step 2: Write the test of §12's pairs**

`tests/shared/contrast.test.ts`:

```ts
// The pairs the redesign draws, measured from the tokens themselves and held to their floors (the redesign's design,
// §12; better-colors: measure the rendered pair). Text 4.5:1, icons and edges 3:1 (WCAG 1.4.3, 1.4.11)
import { describe, expect, it } from 'vitest'
import { type Mode, resolve } from '@/shared/tokens'
import { contrast, over, parseOklch, type Rgba } from './wcag'

/** a colour of the sheet, or a literal */
const colour = (name: string, mode: Mode): Rgba => parseOklch(name.startsWith('oklch(') ? name : resolve(name, mode))
/** layers from the top down, the last one opaque */
const stack = (layers: string[], mode: Mode): Rgba =>
  layers.map(l => colour(l, mode)).reduceRight((below, top) => over(top, below))

const PAIRS: { what: string; fg: string; bg: string[]; floor: number; modes?: Mode[] }[] = [
  { what: 'words on the brand', fg: 'on-brand', bg: ['brand'], floor: 4.5 },
  { what: 'a shortcut label on the brand', fg: 'on-brand', bg: ['brand-chip', 'brand'], floor: 4.5 },
  { what: 'P0\'s paper id at 85 % white, light only (§5.4)', fg: 'oklch(1 0 0 / 0.85)', bg: ['brand'], floor: 4.5, modes: ['light'] },
  { what: 'a value in the popup\'s group', fg: 'ink-2', bg: ['group'], floor: 4.5 },
  { what: 'a chevron in the popup\'s group', fg: 'ink-3', bg: ['group'], floor: 3 },
  { what: 'a placeholder on a field', fg: 'ink-2', bg: ['field'], floor: 4.5 },
  { what: 'a destructive confirm\'s words', fg: 'danger', bg: ['button-danger'], floor: 4.5 },
  { what: 'an alert\'s icon in a note', fg: 'danger', bg: ['group'], floor: 3 },
  { what: 'the connected icon', fg: 'success', bg: ['chrome'], floor: 3 },
  { what: 'a search hit\'s words', fg: 'ink', bg: ['mark', 'chrome'], floor: 4.5 },
  { what: 'the neutral primary\'s words', fg: 'ink', bg: ['fill'], floor: 4.5 },
  { what: 'a chosen swatch\'s edge', fg: 'line-strong', bg: ['chrome'], floor: 3 },
]

describe('the redesign\'s colour pairs', () => {
  for (const pair of PAIRS) {
    for (const mode of pair.modes ?? (['light', 'dark'] as const)) {
      it(`${pair.what}, ${mode}: at least ${pair.floor}:1`, () => {
        const fg = stack([pair.fg, ...pair.bg], mode)
        const bg = stack(pair.bg, mode)
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(pair.floor)
      })
    }
  }

  it('reads the prototypes\' numbers: white on the light brand is 7.38:1 (brand.py)', () => {
    expect(contrast(colour('on-brand', 'light'), colour('brand', 'light'))).toBeCloseTo(7.38, 1)
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm vitest run tests/shared/contrast.test.ts`
Expected: PASS, 24 tests. A failure here is a token that does not do its job: report the pair and its ratio; do not
change a colour without the maintainer.

- [ ] **Step 4: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add tests/shared/wcag.ts tests/shared/contrast.test.ts
git commit -m "test(ui): hold the redesign's colour pairs to their contrast floors

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: the reader's pixel baseline

**Files:**
- Create: `experiments/pdf-bilingual/spikes/reader-pixels.mjs`
- Modify: `scripts/english-allowlist.txt`

**Interfaces:**
- Consumes: `launchWithReader` (`experiments/pdf-bilingual/spikes/extension.mjs`), the demo paper `2608.02163`
  (`node experiments/pdf-bilingual/spikes/reader-papers.mjs` makes it once).
- Produces: `out/reader-pixels/baseline/` (never committed: `experiments/pdf-bilingual/.gitignore` holds `out/`);
  `node experiments/pdf-bilingual/spikes/reader-pixels.mjs` exits 1 when the build's reader differs from it.

- [ ] **Step 1: Write the probe**

`experiments/pdf-bilingual/spikes/reader-pixels.mjs`:

```js
// The reader's pixels, before and after its tokens and controls move to the shared ones (the redesign's design, §2.4).
// `--baseline` records the reader as the build draws it now: the chrome's screenshots and the root's computed tokens,
// in light and dark. Without it, the build is compared with that record — screenshots byte for byte, tokens value for
// value — and anything that differs fails, both copies kept in out/reader-pixels/ for a look. Build first; the demo
// papers made (spikes/reader-papers.mjs).
//   node experiments/pdf-bilingual/spikes/reader-pixels.mjs [--baseline]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'

const root = new URL('..', import.meta.url).pathname
const recording = process.argv.includes('--baseline')
const base = join(root, 'out/reader-pixels/baseline')
const dir = recording ? base : join(root, 'out/reader-pixels/current')
mkdirSync(dir, { recursive: true })
if (!recording && !existsSync(base)) throw new Error('no baseline: run with --baseline on the build before the change')

/** the reader's own tokens before the redesign (reader.css), read off the root */
const TOKENS = ['--n-0', '--n-1', '--n-2', '--n-3', '--n-4', '--n-5', '--n-7', '--n-8', '--n-10', '--danger', '--focus', '--page-shadow', '--float-shadow', '--pop-shadow', '--font', '--bar', '--side', '--canvas', '--chrome', '--chrome-line', '--ink', '--ink-2', '--ink-3', '--line-strong', '--fill', '--well', '--lift', '--float-bg', '--ease']
/** the toolbar's popovers, by their buttons' names */
const MENUS = { language: '目标语言', service: '翻译服务', zoom: '缩放比例', options: '阅读选项' }
const ZOOM_IN = '放大'

const { context, readerUrl } = await launchWithReader({ profile: 'reader-pixels', demos: true, viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(readerUrl({ paper: '2608.02163', mode: 'bilingual' }))
await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
/** the appearance, wherever this build keeps it: `theme` from the redesign's Part 2, the reader's own before it */
const appear = value => page.evaluate(v => window.__reader.controller.patchSettings(c => ('theme' in c ? { ...c, theme: v } : { ...c, pdfReader: { ...c.pdfReader, appearance: v } })), value)
const save = (name, bytes) => writeFileSync(join(dir, name), bytes)
const shot = async (name, locator) => {
  await page.waitForTimeout(400)
  save(`${name}.png`, await locator.screenshot({ animations: 'disabled', caret: 'hide' }))
}

for (const theme of ['light', 'dark']) {
  await appear(theme)
  await page.mouse.move(700, 600)
  await page.waitForTimeout(600)
  save(`${theme}-tokens.json`, JSON.stringify(await page.evaluate(names => Object.fromEntries(names.map(n => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), TOKENS), null, 1))
  // the toolbar without its last 2 px: the progress line along its foot moves with the translation, not with the tokens
  save(`${theme}-toolbar.png`, await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 42 }, animations: 'disabled', caret: 'hide' }))
  for (const [key, name] of Object.entries(MENUS)) {
    await page.locator('header').getByRole('button', { name }).first().click()
    await shot(`${theme}-${key}`, page.locator('.pop:popover-open').first())
    await page.keyboard.press('Escape')
    // the focus the menu gave back to its button would ring it in the next shot: let it go
    await page.evaluate(() => document.activeElement?.blur())
  }
  await page.locator('header').getByRole('button', { name: ZOOM_IN, exact: true }).hover()
  await page.waitForTimeout(700)
  await shot(`${theme}-tip`, page.locator('.tip:popover-open').first())
  await page.mouse.move(700, 600)
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

- [ ] **Step 2: Allow its Chinese names**

In `scripts/english-allowlist.txt`, after the line that starts `experiments/pdf-bilingual/spikes/reader-ui-live.mjs`,
add:

```
experiments/pdf-bilingual/spikes/reader-pixels.mjs 2  # 2026-09-26: the reader's toolbar buttons found by their Chinese names, as reader-ui.mjs finds them (the redesign's pixel check, §2.4)
```

- [ ] **Step 3: Record the baseline from the reader as it is**

Run: `pnpm build && git add experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs --baseline`
Expected: `baseline recorded: 14 files in …/out/reader-pixels/baseline`, exit 0.

- [ ] **Step 4: Check the probe against itself**

Run: `node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: 14 lines of `ok`, exit 0. A `FAIL` here means the capture is not deterministic: find which shot moves
(a hover left behind, a popover mid-animation) and hold it still before going on; the whole part rests on this.

- [ ] **Step 5: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add experiments/pdf-bilingual/spikes/reader-pixels.mjs scripts/english-allowlist.txt
git commit -m "test(pdf-reader): record the reader's pixels before the shared tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: the reader on the token sheet

**Files:**
- Modify: `src/entrypoints/pdf-reader/reader.css:13-68`
- Modify: `tests/styles/reader-sheet.test.ts:8`

**Interfaces:**
- Consumes: `src/styles/tokens.css` (Task 1).
- Produces: `reader.css` defines no token but `--bar` and `--side`; it imports `tokens.css`.

- [ ] **Step 1: Make the sheet test read the reader's sheets together**

In `tests/styles/reader-sheet.test.ts`, replace the `SHEET` line:

```ts
const SHEET = readFileSync(join(import.meta.dirname, '../../src/entrypoints/pdf-reader/reader.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
```

with:

```ts
/** the reader's sheet and the shared sheets it imports: the tokens (the redesign's design, §2.2) and, from Task 5, the controls */
const SHEET = ['../../src/entrypoints/pdf-reader/reader.css', '../../src/styles/tokens.css', '../../src/styles/controls.css']
  .map(p => join(import.meta.dirname, p))
  .filter(p => existsSync(p))
  .map(p => readFileSync(p, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
```

and change the first import to `import { existsSync, readFileSync } from 'node:fs'`.

Run: `pnpm vitest run tests/styles/reader-sheet.test.ts`
Expected: PASS (the tokens are defined twice for now; the tests still hold).

- [ ] **Step 2: Replace the reader's own tokens with the import**

Work from the bottom up, so that the line numbers below hold. In `src/entrypoints/pdf-reader/reader.css`: delete lines
64–68 (the dark `--well` / `--lift` / `--fill` overrides and their comment: `tokens.css` holds them); replace the
`:root { … }` block of lines 51–63 with the block below; delete lines 13–50 (the comment `/* §4.1: one cool neutral ramp
…` through the closing brace of `[data-theme="dark"] {…}`); then, after line 9 (`@import "tailwindcss/utilities.css"
layer(utilities) source(none);`), add the import, so that the sheet's imports stay together before any rule (CSS asks
it of `@import`):

```css
/* the extension's tokens (the redesign's design, §2.1): the ramp, the roles and their dark values, generated from
   src/shared/tokens.ts; the reader's own layout values stay below */
@import "../../styles/tokens.css";
```

The block that replaces lines 51–63:

```css
/* the reader's own layout (§5); every colour, shadow, the font and the ease come from tokens.css */
:root {
  --bar: 44px;
  --side: 236px;
}
```

Leave `@theme inline { … }` as it is: it names the same variables.

- [ ] **Step 3: Check the reader is unchanged**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: 14 lines of `ok`, exit 0. A difference means a token's value or its cascade changed: compare
`out/reader-pixels/{baseline,current}/<theme>-tokens.json` first.

- [ ] **Step 4: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/entrypoints/pdf-reader/reader.css tests/styles/reader-sheet.test.ts
git commit -m "refactor(pdf-reader): take the tokens from the shared sheet, pixel for pixel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: the reader's controls shared

**Files:**
- Move: `src/pdf-reader/ui/{Switch.tsx,Popover.tsx,tip.tsx,modality.ts,radio.ts}` → `src/ui/controls/`
- Create: `src/ui/controls/transitions.ts`, `src/ui/controls/Icon.tsx`
- Modify: `src/pdf-reader/ui/appearance.ts`, `src/pdf-reader/ui/icons.tsx`, every importer below
- Create: `src/styles/controls.css`
- Modify: `src/entrypoints/pdf-reader/reader.css` (the rules that move)
- Modify: `tests/pdf-reader/ui/{popover,modality,tip,icons,appearance}.test.ts` (import paths)

**Interfaces:**
- Consumes: the tokens (Task 1).
- Produces, for Parts 3–5: `Switch` (`@/ui/controls/Switch`), `Popover` and `usePopover` (`@/ui/controls/Popover`),
  `useTip` (`@/ui/controls/tip`), `trackModality` (`@/ui/controls/modality`), `radioKeys` (`@/ui/controls/radio`),
  `withoutTransitions(doc: Document, change: () => void): void` (`@/ui/controls/transitions`), `Icon`
  (`@/ui/controls/Icon`), all with their signatures unchanged; and the classes `.tip`, `.seg` (`.thumb`, `.small`,
  `.icons`), `.pop` (`.row`, `.sep`, `.search`, `.item`, `.hint`, `.check`), `.switch`, `.swatch` in
  `src/styles/controls.css`.

- [ ] **Step 1: Move the modules**

```bash
mkdir -p src/ui/controls
git mv src/pdf-reader/ui/Switch.tsx src/ui/controls/Switch.tsx
git mv src/pdf-reader/ui/Popover.tsx src/ui/controls/Popover.tsx
git mv src/pdf-reader/ui/tip.tsx src/ui/controls/tip.tsx
git mv src/pdf-reader/ui/modality.ts src/ui/controls/modality.ts
git mv src/pdf-reader/ui/radio.ts src/ui/controls/radio.ts
```

- [ ] **Step 2: Split `withoutTransitions` and `Icon` out**

`src/ui/controls/transitions.ts` — the function moved verbatim from `src/pdf-reader/ui/appearance.ts`, with its comment:

```ts
// A change of theme without its colours fading one by one (better-ui: suppress transitions on a theme switch): every
// transition but a motion's is off while `change` runs, the new colours resolved under it, and on again two frames later.
// Only `translate` may transition: a thumb's slide is the one motion a change of appearance asks for

/** every transition but `translate` off while `change` runs, the style flushed under the override, restored two frames later */
export function withoutTransitions(doc: Document, change: () => void): void {
  const off = doc.createElement('style')
  off.textContent = '*,*::before,*::after{transition-property:translate !important}'
  doc.head.append(off)
  change()
  // read for its side effect: the style is flushed while the override stands, so no transition starts
  void doc.body.offsetHeight
  requestAnimationFrame(() => requestAnimationFrame(() => off.remove()))
}
```

In `src/pdf-reader/ui/appearance.ts`, delete `withoutTransitions` and its doc comment, and add at the top of the imports:

```ts
import { withoutTransitions } from '@/ui/controls/transitions'
```

and at the end of the file:

```ts
export { withoutTransitions }
```

(so that `App.tsx`'s existing import from `@/pdf-reader/ui/appearance` stands).

`src/ui/controls/Icon.tsx` — `Icon` moved verbatim from `src/pdf-reader/ui/icons.tsx`:

```ts
// Lucide's icons (ISC, docs/THIRD_PARTY.md) at 16 px with a 1.5 stroke on the 24 grid, one CSS pixel (the reader's
// design, §4.2): the one icon component of every surface
import type { IconNode } from 'lucide'
import { createElement } from 'react'

export function Icon({ node, size = 16, className }: { node: IconNode; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}
```

In `src/pdf-reader/ui/icons.tsx`, delete `Icon`, its `IconNode` and `createElement` imports, and change the file's
first comment line to say it holds the display switch's own three icons (Lucide's `Icon` is in `@/ui/controls/Icon`).

- [ ] **Step 3: Point every importer at the new places**

```bash
sed -i '' "s#from './Switch'#from '@/ui/controls/Switch'#; s#from './Popover'#from '@/ui/controls/Popover'#; s#from './tip'#from '@/ui/controls/tip'#; s#from './radio'#from '@/ui/controls/radio'#" src/pdf-reader/ui/*.tsx
sed -i '' "s#import { Icon } from './icons'#import { Icon } from '@/ui/controls/Icon'#" src/pdf-reader/ui/*.tsx
sed -i '' "s#'@/pdf-reader/ui/modality'#'@/ui/controls/modality'#" src/entrypoints/pdf-reader/main.tsx tests/pdf-reader/ui/modality.test.ts
sed -i '' "s#'@/pdf-reader/ui/Popover'#'@/ui/controls/Popover'#" tests/pdf-reader/ui/popover.test.ts
```

In `tests/pdf-reader/ui/icons.test.ts` replace
`import { DisplayIcon, Icon, WEN_GAIN } from '@/pdf-reader/ui/icons'` with:

```ts
import { DisplayIcon, WEN_GAIN } from '@/pdf-reader/ui/icons'
import { Icon } from '@/ui/controls/Icon'
```

Run: `pnpm typecheck`
Expected: exit 0. An error names an importer the commands missed: point it at `@/ui/controls/…` the same way.

- [ ] **Step 4: Move the controls' rules to `controls.css`**

Create `src/styles/controls.css` with the rules below, cut from `reader.css` and changed only where noted (the tooltip's
three literal colours become the tokens that hold the same values; `.pop`'s height names `--bar` with a fallback, for
the pages that have no bar). The component rules sit in `@layer components`, as they did in `reader.css`; the
reduced-motion and forced-colour rules stay unlayered, as they were:

```css
/* The controls the extension's pages share (the redesign's design, §2.3): the reader's segmented control, popover,
   tooltip, switch and swatch, moved here unchanged so that the popup and the settings page draw the same ones. The
   component rules join the page's `components` layer; the tokens they name are tokens.css's */
@layer components {
  /* tooltips: below their control, centred on it, kept inside the window; one line always */
  .tip { position: fixed; inset: auto; margin: 8px 0 0; position-area: bottom; position-try-fallbacks: bottom span-right, bottom span-left;
    padding: 5px 8px; border: 0; border-radius: 6px; background: var(--tip-bg); color: var(--tip-ink); font: 12px/1.2 var(--font);
    white-space: nowrap; display: none; gap: 10px; box-shadow: 0 4px 12px oklch(0 0 0 / 0.2); pointer-events: none; overflow: visible; }
  .tip:popover-open { display: flex; animation: tip-in 120ms ease-out; }
  .tip[data-side="right"] { margin: 0 0 0 8px; position-area: right; position-try-fallbacks: none; }
  .tip kbd { color: var(--tip-ink-2); }
  /* a segmented control: equal segments in a well, the chosen one on a lifted thumb that slides */
  .seg { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; height: 30px; padding: 2px; border-radius: 9px; background: var(--well); --i: 0; }
  .seg .thumb { position: absolute; inset-block: 2px; inset-inline-start: 2px; width: calc((100% - 4px) / var(--n, 3)); border-radius: 7px; background: var(--lift);
    box-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.08); translate: calc(var(--i) * 100%) 0; transition: translate 220ms var(--ease); pointer-events: none; }
  .seg > button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; height: 100%; padding: 0 12px; border-radius: 7px; color: var(--ink-2); font: 500 12.5px/1 var(--font); white-space: nowrap; transition: color 150ms ease-out; }
  .seg > button[aria-checked="true"], .seg > button[aria-pressed="true"] { color: var(--ink); }
  @media (hover: hover) { .seg > button:not([aria-checked="true"]):not([aria-disabled="true"]):hover { color: var(--ink); } }
  .seg > button[aria-disabled="true"] { color: var(--ink-3); opacity: 0.55; }
  .seg.small { height: 26px; }
  .seg.small > button { padding: 0 10px; font-size: 12px; }
  /* a segment of icons: equal whatever the language, its icon at the centre of its thumb */
  .seg.icons > button { width: 36px; padding: 0; }
  /* popovers: under their button, 6 px below, kept inside the window; they grow from it */
  .pop { position: fixed; inset: auto; margin: 6px 0 0; position-area: bottom span-right; position-try-fallbacks: bottom span-left, bottom;
    min-width: 220px; width: max-content; max-width: calc(100vw - 16px); max-height: calc(100vh - var(--bar, 0px) - 16px); overflow: auto; padding: 4px; border: 0; border-radius: 12px;
    background: var(--chrome); color: var(--ink); box-shadow: var(--pop-shadow); font-size: 13px; transform-origin: top left; }
  .pop:popover-open { animation: pop-in 150ms var(--ease); }
  .pop .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 34px; padding: 0 10px; }
  .pop .sep { height: 0.5px; margin: 4px 8px; border: 0; background: var(--chrome-line); }
  .pop .search { display: block; width: 100%; height: 30px; margin: 0 0 4px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--fill); color: var(--ink); }
  .pop .search::placeholder { color: var(--ink-2); }
  .pop .item { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px 0 8px; border-radius: 8px; cursor: pointer; }
  .pop .item[data-active] { background: var(--fill); }
  /* the item the keyboard moves is the focus (aria-activedescendant), and carries the ring a focused control does */
  .pop :is([role="menu"], [role="listbox"]):focus-visible .item[data-active],
  html:not([data-axt-pointer]) .pop .search:focus-visible ~ [role="listbox"] .item[data-active] { outline: 2px solid var(--focus); outline-offset: -2px; }
  .pop .item[aria-disabled="true"] { color: var(--ink-3); cursor: default; }
  .pop .item .hint { margin-inline-start: auto; color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; }
  .pop .item .check { color: var(--ink); }
  .switch { position: relative; width: 28px; height: 17px; flex: none; border-radius: 999px; background: var(--ink-3); transition: background-color 150ms; }
  .switch::after { content: ""; position: absolute; inset-block-start: 2px; inset-inline-start: 2px; width: 13px; height: 13px; border-radius: 999px; background: oklch(1 0 0); box-shadow: 0 1px 2px oklch(0 0 0 / 0.25); transition: translate 150ms ease-out; }
  .switch[aria-checked="true"] { background: var(--ink); }
  .switch[aria-checked="true"]::after { translate: 11px 0; background: var(--chrome); }
  .swatch { width: 16px; height: 16px; border-radius: 999px; box-shadow: inset 0 0 0 0.5px oklch(0 0 0 / 0.15); }
  .swatch[aria-pressed="true"]:not(:focus-visible) { outline: 1.5px solid var(--line-strong); outline-offset: 2px; }
}
@keyframes tip-in { from { opacity: 0; } }
@keyframes pop-in { from { opacity: 0; scale: 0.97; translate: 0 -4px; } }
@media (prefers-reduced-motion: reduce) { @keyframes pop-in { from { opacity: 0; } } }
@media (prefers-reduced-motion: reduce) { .seg .thumb { transition: none; } .switch::after { transition: none; } }
/* forced colours (Windows' contrast themes) drop the fills and the rings: the chosen segment and a switch that is on
   take the system's Highlight, as a selection does */
@media (forced-colors: active) {
  .seg .thumb, .switch[aria-checked="true"] { forced-color-adjust: none; background: Highlight; }
  .seg > button[aria-checked="true"] { forced-color-adjust: none; color: HighlightText; }
  /* an outline, which takes no room: a border would push the knob to the track's edge */
  .switch { outline: 1px solid ButtonText; outline-offset: -1px; }
  .switch::after { forced-color-adjust: none; background: ButtonText; }
  .switch[aria-checked="true"]::after { background: HighlightText; }
  .seg > button[aria-disabled="true"] { color: GrayText; }
}
```

In `reader.css`:
- right after the `@import "../../styles/tokens.css";` line of Task 4, add `@import "../../styles/controls.css";`;
- inside `@layer components { … }`, delete every rule now in `controls.css`: the `.tip` rules (the tooltip comment and
  the four `.tip` rules), the `.seg` rules **except** `.seg.display > button { width: 40px; padding: 0; }`, which stays,
  the `.pop` rules from the popovers comment through `.pop .item .check`, and the `.switch` and `.swatch` rules;
- outside the layer, delete `@keyframes tip-in`, both `@keyframes pop-in`, the reduced-motion rule for `.seg .thumb`,
  and `.switch::after { transition: none; }` from the last reduced-motion block;
- in the forced-colours block, keep only what names `.tbtn`: `.tbtn[aria-pressed="true"]:not([aria-disabled="true"])
  { forced-color-adjust: none; background: Highlight; }`, the same selector's `color: HighlightText` rule, and
  `.tbtn[aria-disabled="true"] { color: GrayText; }`.

`.menu-btn`, `.tbtn`, `.divider`, the narrow-window rules (`.pop .narrow-only` and the `@media (width < 900px)` /
`(width < 500px)` blocks) and the `.chrome` base rules stay in `reader.css`: they are the reader's, and each must come
after the shared rule it overrides.

- [ ] **Step 5: Run the reader's tests**

Run: `pnpm vitest run tests/pdf-reader tests/styles`
Expected: PASS. (`reader-sheet.test.ts` reads `controls.css` beside `reader.css`: the hover gate, the focus ink, the
swatch's strong line and the pointer's rings are found there.)

- [ ] **Step 6: Check the reader is unchanged**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: 14 lines of `ok`, exit 0. A difference is the cascade: a moved rule now loses to a reader rule it used to
come after, or wins over one it used to come before — find the pair in the shot that differs and restore its order.

- [ ] **Step 7: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/ui/controls src/pdf-reader/ui src/styles/controls.css src/entrypoints/pdf-reader/reader.css src/entrypoints/pdf-reader/main.tsx tests/pdf-reader/ui/modality.test.ts tests/pdf-reader/ui/popover.test.ts tests/pdf-reader/ui/icons.test.ts
git commit -m "refactor(ui): the reader's controls become the extension's, pixel for pixel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git add src/pdf-reader/ui` records the moves' deletions and the edited importers; check `git status` shows nothing
else staged before committing.)

### Task 6: Part 1's record

- [ ] **Step 1: The reader's own browser checks**

Run: `node experiments/pdf-bilingual/spikes/reader-ui.mjs`
Expected: every line `ok`, exit 0 — the moved controls still behave (menus open and close, tooltips, radios' arrows).

- [ ] **Step 2: A local review of the part**

Ask for a local Codex review of Part 1's commits (`/codex:review --base <the commit before Task 1>`). Check each point
against the code or the probe before adopting it; write down what was declined and why in the commit that adopts the
rest, or in this task's note below.

- [ ] **Step 3: Note what Part 1 left for the parts after it**

Append to the end of this plan, under a heading `## Part 1: done`, one paragraph: the commits, what the probe
measured, and any name that changed from this plan (Parts 3–5 are written against the names here).

## Part 1: done

2026-09-26, commits 350c416e..0b942175 on `exp/extension-ui-redesign` (Tasks 1–5), each with its own spec and quality
review. What the parts after it should know:

- **The pixel probe writes 24 files, not 14**: a review of Task 3 found that a 1 px inset round every popover left its
  straight edges uncompared, so each popover and tooltip is now saved as two bands that leave out only its r × r
  corners (the corners' anti-aliasing varies run to run, measured; `r` read from `border-radius`). Every later "14
  lines of `ok`" in this plan means 24.
- `reader.css` imports `tokens.css` and then `controls.css` after its `@source` lines; it keeps `--bar` and `--side`.
- The names are as planned: `@/ui/controls/{Switch,Popover,tip,modality,radio,transitions,Icon}`,
  `src/styles/controls.css`. `src/pdf-reader/ui/appearance.ts` re-exports `withoutTransitions`.
- Left for the final review (minor): comments in the moved modules still point at `reader.css` or call themselves the
  reader's; `reader.css` does not `@source` `src/ui/controls/` (no utilities there today); the old `src/ui/LucideIcon.tsx`
  and `src/ui/Switch.tsx` stand beside the shared ones until Parts 3–4 retire them.
- Task 6's local Codex review did not run: Codex's sign-in had lapsed.

---

# Part 2: one appearance, configuration v20, the service health record

## Part 2 Review Focus

The global Review Focus's first five lines are Part 2's: each is pinned in the task named beside it.

### Task 7: configuration v20 — the extension's theme

**Files:**
- Modify: `src/config/schema.ts:10,49,110-127,131-149`
- Modify: `src/config/storage.ts` (the migration table)
- Modify: `src/pdf-reader/ui/ReadingOptions.tsx:30-31`, `src/entrypoints/pdf-reader/App.tsx:23`
- Modify: `src/entrypoints/options/sections/PdfReader.tsx`
- Modify: `experiments/pdf-bilingual/spikes/{reader-ui,reader-perf,reader-a11y}.mjs` (the appearance patches)
- Test: `tests/config/storage.test.ts`, `tests/pdf-reader/ui/reading-options.test.ts`, `tests/options/pdf-reader-section.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Config['theme']: 'system' | 'light' | 'dark'` (default `'system'`); `Config['pdfReader']` without
  `appearance`; `CONFIG_VERSION = 20`. The migration table's entry `20` is written here and extended by Tasks 8 and 9.

- [ ] **Step 1: Write the failing migration tests**

In `tests/config/storage.test.ts`, replace the test `'v19 adds the PDF reader\'s settings with their defaults, and
touches nothing else'` with:

```ts
  it('v19 adds the PDF reader\'s settings with their defaults, and touches nothing else', async () => {
    const v18: Record<string, unknown> = { ...DEFAULT_CONFIG, version: 18, mode: 'only', reading: { sentenceHighlight: false, openIn: 'same-tab' } }
    delete v18.pdfReader
    delete v18.theme
    await fakeBrowser.storage.local.set({ config: v18, config$: { v: 18 } })
    vi.resetModules()
    const fresh = await import('@/config/storage')
    const config = await fresh.getConfig()
    expect(fresh.configFallbackReason()).toBeNull()
    expect(config.version).toBe(CONFIG_VERSION)
    // v19's appearance went on to v20's theme
    expect(config.pdfReader).toEqual({ enabled: true, original: false, sync: true, swapped: false, dimPages: true })
    expect(config.theme).toBe('system')
    expect(config.mode).toBe('only')
    expect(config.reading).toEqual({ sentenceHighlight: false, openIn: 'same-tab' })
  })

  it('v20 makes the reader\'s appearance the extension\'s theme (the redesign\'s design, §3), and touches nothing else', async () => {
    const v19: Record<string, unknown> = {
      ...DEFAULT_CONFIG, version: 19, mode: 'only',
      pdfReader: { enabled: false, original: true, sync: false, swapped: true, appearance: 'dark', dimPages: false },
    }
    delete v19.theme
    await fakeBrowser.storage.local.set({ config: v19, config$: { v: 19 } })
    vi.resetModules()
    const fresh = await import('@/config/storage')
    const config = await fresh.getConfig()
    expect(fresh.configFallbackReason()).toBeNull()
    expect(config.theme).toBe('dark')
    expect(config.pdfReader).toEqual({ enabled: false, original: true, sync: false, swapped: true, dimPages: false })
    expect(config.mode).toBe('only')
  })

  it('v20 leaves a hand-edited pdfReader that is not an object to the schema, which names it', async () => {
    const v19: Record<string, unknown> = { ...DEFAULT_CONFIG, version: 19, pdfReader: 'broken' }
    delete v19.theme
    await fakeBrowser.storage.local.set({ config: v19, config$: { v: 19 } })
    vi.resetModules()
    const fresh = await import('@/config/storage')
    // no throw: the defaults in use, and the reason names the field (S-O-02 shows it)
    expect(await fresh.getConfig()).toEqual(DEFAULT_CONFIG)
    expect(fresh.configFallbackReason()).toMatchObject({ kind: 'invalid', where: 'pdfReader' })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run tests/config/storage.test.ts`
Expected: FAIL — the new tests find `theme` undefined and `pdfReader.appearance` still there.

- [ ] **Step 3: The schema**

In `src/config/schema.ts`:
- `export const CONFIG_VERSION = 20`;
- `DEFAULT_PDF_READER` becomes `{ enabled: true, original: false, sync: true, swapped: false, dimPages: true } as const`;
- in `configSchema`, delete `appearance: z.enum(['light', 'dark', 'system']),` from `pdfReader`, and after the
  `pdfReader` field add:

```ts
  /**
   * The appearance of every surface the extension draws (v20; the redesign's design, §3): the popup, the settings page,
   * the reader and the floating button. `system` follows the browser's colour scheme. Until v20 the reader alone had one
   * (`pdfReader.appearance`), which the migration carries here
   */
  theme: z.enum(['system', 'light', 'dark']),
```

- in `DEFAULT_CONFIG`, after `pdfReader: { ...DEFAULT_PDF_READER },` add `theme: 'system',`.

- [ ] **Step 4: The migration**

In `src/config/storage.ts`, after the entry `19: …`, add:

```ts
    // v19 -> v20: the redesign (its design, §3, §4). The reader's appearance becomes the extension's theme. A pdfReader
    // that is not an object (a hand edit) is passed through for the schema to name, as every migration here does
    20: (v19: (Omit<Config, 'version' | 'theme'> & { version: 19; pdfReader?: unknown }) | null) => {
      if (typeof v19 !== 'object' || v19 === null) return v19
      const reader = v19.pdfReader
      if (reader === null || typeof reader !== 'object' || Array.isArray(reader)) return { ...v19, version: 20 as const, theme: 'system' as const }
      const { appearance, ...rest } = reader as Record<string, unknown>
      return { ...v19, version: 20 as const, theme: appearance ?? 'system', pdfReader: rest }
    },
```

Run: `pnpm vitest run tests/config/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: The reader reads and writes `theme`**

In `src/pdf-reader/ui/ReadingOptions.tsx` replace:

```ts
  const appearance = config.pdfReader.appearance
  const setAppearance = (a: (typeof APPEARANCES)[number]) => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, appearance: a } }))
```

with:

```ts
  // the extension's appearance (the redesign's design, §3): chosen here, the popup and the settings page follow
  const appearance = config.theme
  const setAppearance = (a: (typeof APPEARANCES)[number]) => controller.patchSettings(c => ({ ...c, theme: a }))
```

In `src/entrypoints/pdf-reader/App.tsx:23` replace `appearance: s.settings?.pdfReader.appearance` with
`appearance: s.settings?.theme`.

In `tests/pdf-reader/ui/reading-options.test.ts` replace each `written().pdfReader.appearance` with `written().theme`
(three places).

- [ ] **Step 6: The old settings page's reader section writes `theme`**

In `src/entrypoints/options/sections/PdfReader.tsx` replace the `Segmented`'s two props:

```tsx
            value={config.theme}
            options={APPEARANCES.map(value => ({ value, label: R.options[value], title: R.options[value] }))}
            onChange={theme => void patch(latest => ({ ...latest, theme }))}
```

In `tests/options/pdf-reader-section.test.ts`, in `'each row writes its setting at once, and nothing else'`, replace the
expectation's last line `{ ...DEFAULT_CONFIG.pdfReader, appearance: 'dark' },` with `DEFAULT_CONFIG.pdfReader,`, and
after the `expect(patches.map(p => p.pdfReader))…` statement add:

```ts
    expect(patches.at(-1)?.theme).toBe('dark')
```

and change the last assertion to compare without `theme` too:

```ts
    expect(patches.every(p => JSON.stringify({ ...p, pdfReader: null, theme: null }) === JSON.stringify({ ...DEFAULT_CONFIG, pdfReader: null, theme: null }))).toBe(true)
```

- [ ] **Step 7: The browser checks set `theme`**

In `experiments/pdf-bilingual/spikes/reader-ui.mjs`, `reader-perf.mjs` and `reader-a11y.mjs`, every
`patch(…, { pdfReader: { …, appearance: X, … } })` becomes `patch(…, { theme: X, pdfReader: { … } })` with the other
keys kept, and a `pdfReader` left empty dropped; `reader-ui.mjs:644`'s
`({ ...c, pdfReader: { ...c.pdfReader, appearance: t } })` becomes `({ ...c, theme: t })`. List them first:

Run: `grep -n "appearance" experiments/pdf-bilingual/spikes/reader-ui.mjs experiments/pdf-bilingual/spikes/reader-perf.mjs experiments/pdf-bilingual/spikes/reader-a11y.mjs`
Expected after the edit: only comments and `check(` words mention `appearance`.

- [ ] **Step 8: Check the reader is unchanged**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs`
Expected: both exit 0.

- [ ] **Step 9: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/config/schema.ts src/config/storage.ts src/pdf-reader/ui/ReadingOptions.tsx src/entrypoints/pdf-reader/App.tsx src/entrypoints/options/sections/PdfReader.tsx experiments/pdf-bilingual/spikes/reader-ui.mjs experiments/pdf-bilingual/spikes/reader-perf.mjs experiments/pdf-bilingual/spikes/reader-a11y.mjs tests/config/storage.test.ts tests/pdf-reader/ui/reading-options.test.ts tests/options/pdf-reader-section.test.ts
git commit -m "feat(config): v20, one appearance for the whole extension

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: configuration v20 — two ways to translate

**Files:**
- Modify: `src/config/schema.ts` (`preload`), `src/config/storage.ts` (the entry `20`)
- Modify: `src/core/scheduler/lazy.ts:65`, `src/core/session/index.ts:337,429,557-564`
- Modify: `src/entrypoints/options/sections/Reading.tsx:19-31,136-152`
- Modify: `src/locales/zh-CN.ts:216-218,224-226`, `src/locales/en.ts:202-204,210-212`
- Test: `tests/config/storage.test.ts`, `tests/scheduler/lazy.test.ts`, `tests/session/page-session.test.ts:370-388`,
  `tests/options/reading-section.test.ts:130-146`, `tests/pipeline/session-guard.test.ts:32,185`,
  `tests/providers/transport.test.ts:695`, `tests/e2e/extension.mjs:263`

**Interfaces:**
- Consumes: the entry `20` (Task 7).
- Produces: `Config['preload']: 'on-demand' | 'whole'` (default `'on-demand'`);
  `preloadOf(choice: 'on-demand' | 'whole'): PreloadOptions` in `@/core/scheduler/lazy`; the locale keys
  `O.reading.translateWay: string`, `O.reading.translateWays: [string, string]`, `O.reading.translateWayHints: [string, string]`.

- [ ] **Step 1: Write the failing tests**

In `tests/scheduler/lazy.test.ts`, add `preloadOf` to the import from `@/core/scheduler/lazy` (line 3), and inside the
top `describe`:

```ts
  it('reads the reader\'s two choices as the observer\'s numbers: on demand is today\'s default, whole the paper at once (the redesign\'s design, §4)', () => {
    expect(preloadOf('on-demand')).toEqual({ margin: 1000, threshold: 0 })
    expect(preloadOf('whole')).toEqual({ margin: 'all', threshold: 0 })
  })
```

In `tests/config/storage.test.ts`, replace the whole `describe('the v14 → v15 migration: the preload range', …)` with:

```ts
describe('the preload, v15 to v20', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('a stored margin, whatever it was, reads as on demand; the whole paper as whole (the redesign\'s design, §4)', async () => {
    for (const [margin, expected] of [[450, 'on-demand'], [1800, 'on-demand'], ['all', 'whole']] as const) {
      const v14 = { ...DEFAULT_CONFIG, version: 14, preload: { margin, threshold: 0.5 } }
      await fakeBrowser.storage.local.set({ config: v14, config$: { v: 14 } })
      vi.resetModules()
      const fresh = await import('@/config/storage')
      const c = await fresh.getConfig()
      expect(fresh.configFallbackReason()).toBeNull()
      expect(c.preload).toBe(expected)
      expect(c.mode).toBe(DEFAULT_CONFIG.mode)
    }
  })
})
```

Then, in the same file, each remaining `expect(c.preload).toEqual({ margin: …, threshold: … })` becomes
`expect(c.preload).toBe('on-demand')` (the v1, v2 and v12 climbs and the language-code cases), and the test
`'an out-of-range preload range is refused by the schema'` becomes:

```ts
  it('a preload that is neither of the two choices is refused by the schema', async () => {
    await expect(setConfig({ ...DEFAULT_CONFIG, preload: 'some' as never })).rejects.toThrow()
    await expect(setConfig({ ...DEFAULT_CONFIG, preload: { margin: 1000, threshold: 0 } as never })).rejects.toThrow()
  })
```

In `tests/session/page-session.test.ts`, in `'the whole-paper range chosen mid-session releases everything …'`, the three
`onConfig` calls pass `preload: 'on-demand'`, `preload: 'whole'`, `preload: 'whole'` in their order.

Run: `pnpm vitest run tests/scheduler/lazy.test.ts tests/config/storage.test.ts tests/session/page-session.test.ts`
Expected: FAIL — `preloadOf` is not exported; the stored preload is still an object.

- [ ] **Step 2: The core reads the choice**

In `src/core/scheduler/lazy.ts`, after `DEFAULT_PRELOAD`, add:

```ts
/**
 * The observer's numbers for the reader's choice (the redesign's design, §4): on demand is today's default, a screen
 * below the window and a paragraph counting as entered as it first shows; whole is every block at once. The settings
 * page offers nothing between them
 */
export const preloadOf = (choice: 'on-demand' | 'whole'): PreloadOptions => (choice === 'whole' ? { margin: 'all', threshold: 0 } : DEFAULT_PRELOAD)
```

In `src/core/session/index.ts`: add `preloadOf` to the existing import from `@/core/scheduler/lazy` (or add
`import { preloadOf } from '@/core/scheduler/lazy'` if there is none); lines 337 and 429 become
`preload: preloadOf(config.preload),`; lines 557–564 become:

```ts
    // The way to translate (the redesign's design, §6.5): whole reaches an open paper at once — everything still
    // waiting for the viewport is handed to both runs now. On demand applies from the next session: a running
    // observer's distance cannot be moved, and what was requested cannot be taken back (Devin on #222)
    if (live?.run && config.preload === 'whole' && live.config.preload !== 'whole') {
      live.run.release()
      live.images?.run.release()
    }
    if (live) live.config = { ...live.config, preload: config.preload }
```

- [ ] **Step 3: The schema and the migration**

In `src/config/schema.ts`, the `preload` field and its comment become:

```ts
  /**
   * How a paper is translated (v20; the redesign's design, §4): `on-demand`, what is being read and what comes next (a
   * screen below the window, a paragraph entered as it first shows), or `whole`, the whole paper requested as it opens.
   * The observer's numbers are the core's (`preloadOf`); until v20 they were stored, one to three screens and three
   * starting points
   */
  preload: z.enum(['on-demand', 'whole']),
```

and in `DEFAULT_CONFIG`, `preload: { ...DEFAULT_PRELOAD },` becomes `preload: 'on-demand',` (drop the
`DEFAULT_PRELOAD` import from `schema.ts` if nothing else uses it).

In `src/config/storage.ts`, the entry `20` becomes:

```ts
    // v19 -> v20: the redesign (its design, §3, §4). The reader's appearance becomes the extension's theme; the stored
    // preload numbers become the two ways to translate — `all` is whole, any number on demand. A field that is not an
    // object (a hand edit) is passed through for the schema to name, as every migration here does
    20: (v19: (Omit<Config, 'version' | 'theme' | 'preload'> & { version: 19; pdfReader?: unknown; preload?: unknown }) | null) => {
      if (typeof v19 !== 'object' || v19 === null) return v19
      const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
      const out: Record<string, unknown> = { ...v19, version: 20 as const, theme: 'system' }
      if (isObject(v19.pdfReader)) {
        const { appearance, ...rest } = v19.pdfReader
        out.theme = appearance ?? 'system'
        out.pdfReader = rest
      }
      if (isObject(v19.preload)) out.preload = v19.preload.margin === 'all' ? 'whole' : 'on-demand'
      return out
    },
```

Run: `pnpm vitest run tests/scheduler/lazy.test.ts tests/config/storage.test.ts tests/session/page-session.test.ts`
Expected: PASS.

- [ ] **Step 4: The old settings page offers the two choices**

In `src/locales/zh-CN.ts`, in `reading`, replace `preloadRange`, `preloadRangeHint`, `preloadStops` with:

```ts
    translateWay: '翻译方式',
    translateWays: ['按需翻译', '整篇翻译'],
    translateWayHints: ['只翻译正在阅读和即将读到的段落，用量最少', '打开论文时就请求整篇译文，滚到哪里都已翻好，用量较多'],
```

and delete `threshold`, `thresholdHint`, `thresholdStops`. In `src/locales/en.ts`, the same keys:

```ts
    translateWay: 'Translate',
    translateWays: ['As you read', 'Whole paper'],
    translateWayHints: ['Only what you are reading and what comes next; uses the least', 'The whole paper is requested as it opens, so every part is ready; uses more'],
```

and delete the three `threshold*` keys.

In `src/entrypoints/options/sections/Reading.tsx`, delete `MARGINS`, `marginStop`, `THRESHOLDS` and `nearest`
(nothing else uses them), and replace the two blocks from `<h3 …>{O.reading.preloadRange}</h3>` through the threshold's
`<Segmented … />` with:

```tsx
      <h3 className="mb-1 text-[14px] font-bold">{O.reading.translateWay}</h3>
      <p className="mb-2 text-[11px] text-fg-2">{O.reading.translateWayHints[config.preload === 'whole' ? 1 : 0]}</p>
      <div className="mb-6">
        <Segmented
          value={config.preload}
          options={(['on-demand', 'whole'] as const).map((value, i) => ({ value, label: O.reading.translateWays[i]!, title: O.reading.translateWays[i]! }))}
          onChange={preload => void patch(latest => ({ ...latest, preload }))}
        />
      </div>
```

In `tests/options/reading-section.test.ts`, replace `describe('Reading: the preload range', …)` with:

```ts
describe('Reading: the way to translate', () => {
  beforeEach(() => { setLocale('en') })
  const stops = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')).filter(b => (O.reading.translateWays as readonly string[]).includes(b.textContent?.trim() ?? ''))

  it('offers as you read and the whole paper (the redesign\'s design, §6.5), and writes the choice', async () => {
    const patches: Config[] = []
    const mounted = await mountElement(createElement(Reading, { data: data({ ...DEFAULT_CONFIG, preload: 'on-demand' }, patches) }))
    const before = stops(mounted.container)
    expect(before.map(b => b.textContent?.trim())).toEqual(['As you read', 'Whole paper'])
    expect(before.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    before[1]!.click()
    await mounted.flush()
    expect(patches.at(-1)?.preload).toBe('whole')
    await mounted.unmount()
  })
})
```

- [ ] **Step 5: The other fixtures**

`tests/pipeline/session-guard.test.ts:32,185`: `preload: { margin: 1000, threshold: 0 },` becomes `preload: 'on-demand',`.
`tests/providers/transport.test.ts:695`: the preload case becomes `{ ...base, preload: 'whole' }`.
`tests/e2e/options-page.mjs:125-130`: `setPreload(options, { range })` keeps `range` alone (the `threshold` line goes).
`tests/e2e/extension.mjs`: line 259 `setPreload(options, { range: '整篇翻译' })`; line 262 reads
`getByRole('button', { name: '整篇翻译', exact: true })`; line 263's words become `'the settings page: the whole paper
chosen is still chosen after a reload'`; lines 278 and 541 `{ range: '按需翻译' }`; line 535 `{ range: '整篇翻译' }`.

Run: `pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: exit 0. Where the English gate says a file now holds fewer Chinese lines than it is allowed, lower that
entry of `scripts/english-allowlist.txt` to the count it names. A type error names a fixture still carrying `{ margin, threshold }` as the configuration's preload:
it becomes `'on-demand'` (or `'whole'` where it was `'all'`). The core's own `PreloadOptions` (`run.ts`, `image/run.ts`,
`ledger.ts` tests) keeps its numbers.

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/config/schema.ts src/config/storage.ts src/core/scheduler/lazy.ts src/core/session/index.ts src/entrypoints/options/sections/Reading.tsx src/locales/zh-CN.ts src/locales/en.ts tests/config/storage.test.ts tests/scheduler/lazy.test.ts tests/session/page-session.test.ts tests/options/reading-section.test.ts tests/pipeline/session-guard.test.ts tests/providers/transport.test.ts tests/e2e/extension.mjs tests/e2e/options-page.mjs scripts/english-allowlist.txt
git commit -m "feat(config): two ways to translate, the observer's numbers the core's

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: configuration v20 — figure text in every display

The design's §4 says the display gate goes. The gate's attribute (`data-axt-img-modes`) and its style rules stay: their
specificity is measured and argued in `image.css` and `modes.css`, and rewriting them buys nothing. What goes is the
per-display choice: while `image.enabled`, the session gives the gate every display. Amend the design's §4 bullet to say
so in this task's commit.

**Files:**
- Modify: `src/config/schema.ts` (`image`), `src/config/storage.ts` (entries `8`, `11`, `20`)
- Modify: `src/core/session/index.ts:340,402-404,436,449,570`
- Modify: `src/pdf-reader/settings.ts:26-30`
- Modify: `src/entrypoints/options/sections/Services.tsx:110-133`, `src/entrypoints/popup/state.ts:377`
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`services.imageModes`, `services.imageModesHint`)
- Modify: `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (§4's figure bullet)
- Modify: `tests/e2e/options-page.mjs:97`, `tests/e2e/extension.mjs:283-300,722`, `tests/e2e/image.mjs:145,286-309,319`
- Test: `tests/config/storage.test.ts`, `tests/session/page-session.test.ts:650-728`, `tests/pdf-reader/settings.test.ts:40-46`,
  `tests/popup/state.test.ts:377-388`, `tests/providers/transport.test.ts:698`

**Interfaces:**
- Consumes: the entry `20` (Task 8).
- Produces: `Config['image']: { enabled: boolean }`.

- [ ] **Step 1: Write the failing tests**

In `tests/session/page-session.test.ts`, replace the test `'the modes the reader ticked, not the switch alone: …'`
with:

```ts
    it('figures on show in every display (the redesign\'s design, §4): a label reached in stacked is asked for there', async () => {
      const h = harness({ page: PAGE + PICTURE, config: { mode: 'stack', image: { enabled: true } } })
      live = h.session
      await h.session.start()
      await settle()
      expect(document.documentElement.getAttribute(IMG_MODES_ATTR)).toBe('stack side only')
      await h.session.translate(h.blocks)
      expect(asked(h)).toContain('label')
    })
```

(`MODE_VALUES` is `['stack', 'side', 'only']`; the attribute lists them in that order.) In the same file, every other
`image: { enabled: true, modes: ['side', 'stack', 'only'] }` becomes `image: { enabled: true }`, every
`image: { enabled: false, modes: [] }` becomes `image: { enabled: false }`, and the two expectations
`.toBe('side stack only')` become `.toBe('stack side only')`.

In `tests/pdf-reader/settings.test.ts`, replace the body of `'follows the switch and the modes ticked, …'` and its name:

```ts
  it('follows the switch alone: figure text shows in every translated display (the redesign\'s design, §4)', () => {
    expect(figuresShown(with_({}), 'bilingual')).toBe(true)
    expect(figuresShown(with_({}), 'translation')).toBe(true)
    expect(figuresShown(with_({ image: { enabled: false } }), 'bilingual')).toBe(false)
  })
```

In `tests/config/storage.test.ts`: the expectations `toEqual({ enabled: true, modes: [...] })` become
`toEqual({ enabled: true })`, `{ enabled: false, modes: [] }` becomes `{ enabled: false }`, and
`expect(c.image).toEqual({ enabled, modes })` becomes `expect(c.image).toEqual({ enabled })`; replace the test
`'the image translation modes accept the three only, an empty array is valid (= off)'` with:

```ts
  it('image translation is one switch: v20 drops the per-display list (the redesign\'s design, §4)', async () => {
    const v19 = { ...DEFAULT_CONFIG, version: 19, image: { enabled: true, modes: ['only'] }, pdfReader: { ...DEFAULT_CONFIG.pdfReader, appearance: 'system' } } as Record<string, unknown>
    delete v19.theme
    await fakeBrowser.storage.local.set({ config: v19, config$: { v: 19 } })
    vi.resetModules()
    const fresh = await import('@/config/storage')
    expect((await fresh.getConfig()).image).toEqual({ enabled: true })
    expect(fresh.configFallbackReason()).toBeNull()
  })
```

In `tests/popup/state.test.ts`, replace the test `'switching images back on with every mode unticked ticks them all:
…'` with:

```ts
  it('the image switch writes the switch alone', async () => {
    await setConfig({ ...BASE, image: { enabled: false } })
    const p = await opened(w => { w.page = page('stopped', null) })
    p.popup.actions.setImages(true)
    await until(() => p.input().config?.image.enabled === true)
    expect(p.input().config?.image).toEqual({ enabled: true })
    p.stop()
  })
```

In `tests/providers/transport.test.ts:698`: `{ ...base, image: { enabled: false } }`.

Run: `pnpm vitest run tests/session/page-session.test.ts tests/pdf-reader/settings.test.ts tests/config/storage.test.ts tests/popup/state.test.ts`
Expected: FAIL — the stored image keeps `modes`; the stacked label waits.

- [ ] **Step 2: The schema, the migrations**

In `src/config/schema.ts`: the `image` field becomes

```ts
  /**
   * Image translation (§15): one switch, the popup's and the settings page's. Figure text shows in every display
   * (v20; the redesign's design, §4): until v20 a list of displays gated it, a choice nobody needed
   */
  image: z.object({ enabled: z.boolean() }),
```

and `DEFAULT_CONFIG.image` becomes `{ enabled: true }`.

In `src/config/storage.ts`, the migrations `8` and `11` stop naming `Config['image']['modes']` (a type v20 no longer
has): write the shapes they came from in full —

```ts
    8: (v7: Omit<Config, 'version' | 'image'> & { version: 7 }) => ({ ...v7, version: 8 as const, image: { modes: [...MODE_VALUES] } }),
```

stays as it is, and `11` becomes:

```ts
    11: (v10: Omit<Config, 'version' | 'image'> & { version: 10; image: { modes: (typeof MODE_VALUES)[number][] } }) =>
      ({ ...v10, version: 11 as const, image: { enabled: v10.image.modes.length > 0, modes: v10.image.modes } }),
```

In the entry `20`, after the `preload` line, add:

```ts
      // figure text shows in every display: the per-display list goes, the switch stays
      if (isObject(v19.image)) out.image = { enabled: v19.image.enabled }
```

and add `'image'` to the `Omit` and `image?: unknown` to the parameter type.

- [ ] **Step 3: The session and the reader**

In `src/core/session/index.ts` (import `MODE_VALUES` from `@/config/schema` beside `Config`):

- line 340: `admit: block => !isFigureText(block.el) || started.config.image.enabled,`
- lines 402–404:

```ts
    if (!config.image.enabled) return null
    // The display gate is on while figures are translated, in every display (the redesign's design, §4), and a figure's
    // text needs it too (§15.6): a paper may hold pictures and not one image
    setImageModes(doc, MODE_VALUES)
```

- line 436: `isEnabled: () => config.image.enabled,`
- line 449: drop `, modes ${config.image.modes.join('/')}` from the trace line.
- line 570: `if (live?.run && config.image.enabled !== live.config.image.enabled) {`, and the comment above it loses its
  sentence about the per-mode list.

In `src/pdf-reader/settings.ts`, `figuresShown` and its comment become:

```ts
/** figure text in a display: every translated display, while the switch is on (the redesign's design, §4) */
export function figuresShown(config: Config, display: EngineDisplay): boolean {
  return display !== 'original' && config.image.enabled
}
```

- [ ] **Step 4: The two writers of the switch**

`src/entrypoints/popup/state.ts:377` becomes:

```ts
      await patchConfig(latest => ({ ...latest, image: { enabled } }))
```

In `src/entrypoints/options/sections/Services.tsx`, the switch's `onChange` becomes
`on => void patch(latest => ({ ...latest, image: { enabled: on } }))`, its comment above goes, and the `<fieldset>`
of the per-display boxes with its hint line (lines 113–133) is deleted; drop `MODE_VALUES` from the imports if nothing
else uses it. In both locale packs, delete `services.imageModes` and `services.imageModesHint`.

The browser checks lose what tested the per-display choice, which no longer exists:
- `tests/e2e/options-page.mjs:97`: delete `setImageMode`, and drop it from the imports of `extension.mjs` and `image.mjs`;
- `tests/e2e/extension.mjs`: delete the block at lines 283–300 (the per-display boxes ticked, and read back after a
  reload) and the `setImageMode` call at line 722;
- `tests/e2e/image.mjs`: delete the loops at lines 145 and 319, and the section `// ── The mode gate: …` (lines 286
  through `await popup2.close()`): the unit test of Step 1 now pins what a display shows.

Run: `pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: exit 0. A type error names a fixture with `image: { …, modes }`: drop `modes`. Where the English gate asks
for an entry to be lowered (the e2e scripts lost Chinese lines), lower it to the count it names.

- [ ] **Step 5: Amend the design**

In `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` §4, replace the bullet that starts
`**Figure text in every display**` with:

```markdown
- **Figure text in every display**: while `image.enabled`, the session gives the overlays' display gate every display
  (`setImageModes(doc, MODE_VALUES)`), and the session's and the reader's `modes.includes(...)` checks become
  `image.enabled`. The gate's attribute and its style rules stay: their specificity is measured and argued in
  `image.css` and `modes.css`, and rewriting them buys nothing (the plan's Task 9). `image.enabled` stays the one switch.
```

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0.

```bash
git add src/config/schema.ts src/config/storage.ts src/core/session/index.ts src/pdf-reader/settings.ts src/entrypoints/popup/state.ts src/entrypoints/options/sections/Services.tsx src/locales/zh-CN.ts src/locales/en.ts experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md tests/session/page-session.test.ts tests/pdf-reader/settings.test.ts tests/config/storage.test.ts tests/popup/state.test.ts tests/providers/transport.test.ts tests/e2e/options-page.mjs tests/e2e/extension.mjs tests/e2e/image.mjs scripts/english-allowlist.txt
git commit -m "feat(config): figure text in every display, image translation one switch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: the extension's pages follow the theme

**Files:**
- Create: `src/ui/theme.ts`
- Modify: `src/styles/ui.css:26`
- Modify: `src/entrypoints/popup/main.tsx`, `src/entrypoints/options/main.tsx`
- Test: `tests/ui/theme.test.ts`, `tests/styles/ui-sheet.test.ts`

**Interfaces:**
- Consumes: `withoutTransitions` (Task 5), `Config['theme']` (Task 7), `getConfig`, `watchConfig` (`@/config/storage`).
- Produces: `applyTheme(root: HTMLElement, theme: Config['theme']): void`; `followTheme(root: HTMLElement): Promise<() => void>`
  (applies the stored theme, then follows changes; returns the unwatch).

- [ ] **Step 1: Write the failing tests**

`tests/ui/theme.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { DEFAULT_CONFIG } from '@/config/schema'
import { setConfig } from '@/config/storage'
import { applyTheme, followTheme } from '@/ui/theme'

describe('the extension\'s pages follow the theme (the redesign\'s design, §3)', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    delete document.documentElement.dataset.theme
  })

  it('marks the root for light and dark, and leaves it unmarked for the system\'s', () => {
    const root = document.documentElement
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    applyTheme(root, 'system')
    expect(root.dataset.theme).toBeUndefined()
  })

  it('applies the stored theme before it returns, and follows a change', async () => {
    await setConfig({ ...DEFAULT_CONFIG, theme: 'dark' })
    const stop = await followTheme(document.documentElement)
    expect(document.documentElement.dataset.theme).toBe('dark')
    await setConfig({ ...DEFAULT_CONFIG, theme: 'light' })
    await new Promise(r => setTimeout(r, 0))
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
  })
})
```

`tests/styles/ui-sheet.test.ts`:

```ts
// The extension pages' own sheet: the system's dark answers only where light was not chosen, or a reader who chose
// light on a dark system gets a dark popup (the redesign's design, §3; the Review Focus's first line)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SHEET = readFileSync(join(import.meta.dirname, '../../src/styles/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('ui.css', () => {
  it('scopes the system\'s dark to a root where light was not chosen', () => {
    const media = SHEET.slice(SHEET.indexOf('@media (prefers-color-scheme: dark)'))
    expect(media).toMatch(/^@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/)
  })

  it('imports the generated tokens, so that the controls the pages share find them', () => {
    expect(SHEET).toContain('@import "./tokens.css";')
  })
})
```

Run: `pnpm vitest run tests/ui/theme.test.ts tests/styles/ui-sheet.test.ts`
Expected: FAIL — no `@/ui/theme`; `ui.css`'s dark block is `:root`.

- [ ] **Step 2: Write `theme.ts`**

`src/ui/theme.ts`:

```ts
// The extension's appearance on its own pages (the redesign's design, §3): `data-theme` on the root, absent for the
// system's, set before the first paint and again as the setting changes, every colour transition held off for the flip
// (better-ui). The reader applies it its own way (pdf-reader/ui/appearance.ts): it crossfades and dims its pages
import type { Config } from '@/config/schema'
import { getConfig, watchConfig } from '@/config/storage'
import { withoutTransitions } from './controls/transitions'

export function applyTheme(root: HTMLElement, theme: Config['theme']): void {
  if ((root.dataset.theme ?? 'system') === theme) return
  withoutTransitions(root.ownerDocument, () => {
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  })
}

/** The stored theme applied now, then followed; the returned function stops following */
export async function followTheme(root: HTMLElement): Promise<() => void> {
  applyTheme(root, (await getConfig()).theme)
  return watchConfig(config => applyTheme(root, config.theme))
}
```

- [ ] **Step 3: `ui.css` answers an explicit light, and carries the tokens**

In `src/styles/ui.css`, after `@import "tailwindcss";` add:

```css
/* the extension's tokens (the redesign's design, §2.2): the popup and the settings page draw the shared controls
   (controls.css) from Part 3 on; the --axt- tokens below serve the old pages until then */
@import "./tokens.css";
@import "./controls.css";
```

and change the dark media block's selector (line 26) from `:root {` to `:root:not([data-theme="light"]) {`.

- [ ] **Step 4: The two pages follow it before their first paint**

In `src/entrypoints/popup/main.tsx` and `src/entrypoints/options/main.tsx`, after the `await applyLocale(…)` line, add:

```ts
// the extension's appearance before the first paint, then followed (the redesign's design, §3)
await followTheme(document.documentElement)
```

and the import `import { followTheme } from '@/ui/theme'`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/ui/theme.test.ts tests/styles/ui-sheet.test.ts tests/styles/no-has.test.ts`
Expected: PASS.

- [ ] **Step 6: Check in a real browser**

Run `pnpm build`, load `.output/chrome-mv3` in Chromium with the system in dark mode (`--force-dark-mode` or the
system setting), set 外观 to 浅色 in the reader's reading options, then open the popup and the settings page.
Expected: both light. Then 跟随系统: both dark. Screenshot both states into `out/` (not committed) for Part 6.

- [ ] **Step 7: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/ui/theme.ts src/styles/ui.css src/entrypoints/popup/main.tsx src/entrypoints/options/main.tsx tests/ui/theme.test.ts tests/styles/ui-sheet.test.ts
git commit -m "feat(ui): the popup and the settings page follow the extension's theme

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 11: the service health record, in the background

**Files:**
- Create: `src/shared/service-health.ts`
- Modify: `src/providers/fallback.ts` (`opts.demoted`, `opts.onDemoted`)
- Modify: `src/providers/transport.ts` (`LocalTransportDeps.rejected`, `LocalTransportDeps.onDemoted`; `status().available`)
- Modify: `src/entrypoints/background/index.ts` (load, watch), `src/entrypoints/background/handlers.ts` (`axt:translate`)
- Test: `tests/shared/service-health.test.ts`, `tests/providers/fallback.test.ts`, `tests/providers/transport.test.ts`,
  `tests/background/handlers.test.ts`

**Interfaces:**
- Consumes: `SERVICE_ID_RE` (`@/config/services`), `DemotedInfo` (`@/providers/fallback`).
- Produces:
  - `src/shared/service-health.ts`: `rejectedServices(): Promise<Set<string>>`, `markRejected(id: string): Promise<void>`,
    `clearRejected(id: string): Promise<boolean>` (true when a mark was there), `watchRejected(cb: (ids: Set<string>) => void): () => void`;
    the storage key `local:serviceHealth`, value `Record<string, { rejected: number }>`.
  - `createFallbackService(steps, { demoted?: readonly DemotedInfo[]; onDemoted?: (info: DemotedInfo) => void; … })`:
    `demoted` seeds permanent demotions; `onDemoted` is called on every demotion.
  - `LocalTransportDeps.rejected?: ReadonlySet<string>`; `LocalTransportDeps.onDemoted?: (info: DemotedInfo) => void`;
    `ProviderStatus.available` is false for a rejected primary.
  - `HandlerDeps.health: { reject(id: string): Promise<void>; clear(id: string): Promise<boolean> }`.

- [ ] **Step 1: The record, test first**

`tests/shared/service-health.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { clearRejected, markRejected, rejectedServices, watchRejected } from '@/shared/service-health'

describe('the service health record (the redesign\'s design, §4)', () => {
  beforeEach(() => { fakeBrowser.reset() })

  it('remembers a refused service by its id, and forgets it once cleared', async () => {
    expect(await rejectedServices()).toEqual(new Set())
    await markRejected('svc-abcd1234')
    expect(await rejectedServices()).toEqual(new Set(['svc-abcd1234']))
    expect(await clearRejected('svc-abcd1234')).toBe(true)
    expect(await clearRejected('svc-abcd1234')).toBe(false)
    expect(await rejectedServices()).toEqual(new Set())
  })

  it('holds the id and the time, and nothing of the request (hard rule 5)', async () => {
    await markRejected('svc-abcd1234')
    const stored = (await fakeBrowser.storage.local.get('serviceHealth')).serviceHealth as Record<string, Record<string, unknown>>
    expect(Object.keys(stored)).toEqual(['svc-abcd1234'])
    expect(Object.keys(stored['svc-abcd1234']!)).toEqual(['rejected'])
  })

  it('tells a watcher the ids as they change', async () => {
    const seen: string[][] = []
    const stop = watchRejected(ids => seen.push([...ids]))
    await markRejected('svc-abcd1234')
    await clearRejected('svc-abcd1234')
    await new Promise(r => setTimeout(r, 0))
    expect(seen).toEqual([['svc-abcd1234'], []])
    stop()
  })
})
```

`src/shared/service-health.ts`:

```ts
// The service health record (the redesign's design, §4): the reader's services whose key the endpoint refused. Not
// configuration — a fact the extension observed, not a choice — so a configuration that cannot be read never takes it
// with it. Written by the background when a request ends in `auth`, cleared by a connection that succeeds, a key
// update or the service's deletion; read by the background's chain, the popup and the settings page. It carries the id
// and when, nothing of the request, and never a key (hard rule 5)
import { storage } from 'wxt/utils/storage'

type Record_ = Record<string, { rejected: number }>
const item = storage.defineItem<Record_>('local:serviceHealth', { fallback: {} })

export async function rejectedServices(): Promise<Set<string>> {
  return new Set(Object.keys(await item.getValue()))
}

export async function markRejected(id: string): Promise<void> {
  const now = await item.getValue()
  if (now[id]) return
  await item.setValue({ ...now, [id]: { rejected: Date.now() } })
}

/** Says whether a mark was there to clear */
export async function clearRejected(id: string): Promise<boolean> {
  const now = await item.getValue()
  if (!now[id]) return false
  const { [id]: _gone, ...rest } = now
  await item.setValue(rest)
  return true
}

export function watchRejected(callback: (ids: Set<string>) => void): () => void {
  return item.watch(value => callback(new Set(Object.keys(value ?? {}))))
}
```

Run: `pnpm vitest run tests/shared/service-health.test.ts`
Expected: PASS (write the test first and see it fail on the missing module, then add the module).

- [ ] **Step 2: The chain takes seeded demotions and reports each one, test first**

In `tests/providers/fallback.test.ts`, inside `describe('createFallbackService', …)`, add (with the file's own
`step`, `ok`, `fail` and `call`):

```ts
  it('starts with the demotions it is given, for good: a service whose key was refused is passed over from the first call (the redesign\'s design, §4)', async () => {
    const first = step('svc-abcd1234', [ok('svc-abcd1234')])
    const second = step('microsoft', [ok('microsoft')])
    const service = createFallbackService([first, second], { demoted: [{ id: 'svc-abcd1234', kind: 'auth', message: 'refused before' }] })
    const res = await service.translate(call)
    expect(res.ok && res.result.provider).toBe('microsoft')
    expect(first.calls).toBe(0)
    expect(service.status().demotions.map(d => d.id)).toEqual(['svc-abcd1234'])
  })

  it('tells whoever asked of every demotion, with its kind', async () => {
    const seen: string[] = []
    const service = createFallbackService([step('svc-abcd1234', [fail('auth', 'bad key')]), step('microsoft', [ok('microsoft')])], { onDemoted: info => seen.push(`${info.id}:${info.kind}`) })
    await service.translate(call)
    expect(seen).toEqual(['svc-abcd1234:auth'])
  })
```

Run: `pnpm vitest run tests/providers/fallback.test.ts`
Expected: FAIL — the options are not read.

In `src/providers/fallback.ts`, the options' type becomes
`{ cooldownMs?: number; now?: () => number; warn?: (line: string) => void; demoted?: readonly DemotedInfo[]; onDemoted?: (info: DemotedInfo) => void }`,
and after `let lastDemoted: DemotedInfo | undefined` add:

```ts
  // Demotions known before the first call (the redesign's design, §4): a service whose key the endpoint refused, which
  // the background remembers across sessions. For good, as any permanent kind is; a connection that succeeds clears
  // the record and rebuilds the chain
  for (const info of opts.demoted ?? []) demotions.set(info.id, { info })
```

and at the end of `demote`, after the `opts.warn?.(…)` line:

```ts
    opts.onDemoted?.(info)
```

Run: `pnpm vitest run tests/providers/fallback.test.ts`
Expected: PASS.

- [ ] **Step 3: The transport passes them through and reports the primary unavailable**

In `tests/providers/transport.test.ts`, add (with the file's own `withChain`, `mockProvider`, `SVC` and `req`):

```ts
describe('createLocalTransport: a refused key (the redesign\'s design, §4)', () => {
  const engine = (id: string, calls: string[]) => mockProvider(async r => { calls.push(id); return { segments: r.segments, provider: id } }, { id })

  it('passes a refused service over from the first call, and reports it unable to run, the free one taking over', async () => {
    const calls: string[] = []
    const t = await withChain([engine(SVC.id, calls), engine('microsoft', calls)], { rejected: new Set([SVC.id]) })
    expect((await t.translate({ request: req })).ok).toBe(true)
    expect(calls).toEqual(['microsoft'])
    const status = await t.status()
    expect(status.available).toBe(false)
    expect(status.fallback).toEqual({ id: 'microsoft' })
  })

  it('still reaches it for a call that names it: the settings page asking whether the key works now', async () => {
    const calls: string[] = []
    const t = await withChain([engine(SVC.id, calls), engine('microsoft', calls)], { rejected: new Set([SVC.id]) })
    expect((await t.translate({ request: req, providerId: SVC.id })).ok).toBe(true)
    expect(calls).toEqual([SVC.id])
  })
})
```

Run: `pnpm vitest run tests/providers/transport.test.ts`
Expected: FAIL — `rejected` is not read.

In `src/providers/transport.ts`: `LocalTransportDeps` gains

```ts
  /** The reader's services whose key the endpoint refused (the service health record): demoted from the start */
  rejected?: ReadonlySet<string>
  /** Told of every demotion: the background remembers a refused key */
  onDemoted?: (info: DemotedInfo) => void
```

(import `DemotedInfo` from `./fallback`); the chain is built with:

```ts
  const seeded = chain.filter(engine => deps.rejected?.has(engine.id)).map(engine => ({ id: engine.id, kind: 'auth' as const, message: 'the endpoint refused this key before' }))
  const service = createFallbackService(steps, {
    ...(deps.warn ? { warn: deps.warn } : {}),
    ...(seeded.length ? { demoted: seeded } : {}),
    ...(deps.onDemoted ? { onDemoted: deps.onDemoted } : {}),
  })
```

and in `status()`, `const available = await primary.isAvailable()` becomes:

```ts
    const available = !deps.rejected?.has(primary.id) && await primary.isAvailable()
```

A named call (`call.providerId`, the settings page's connection test) does not go through `service`, so a refused
service is still reached when the reader tests it: the Review Focus's third line.

Run: `pnpm vitest run tests/providers/transport.test.ts`
Expected: PASS.

- [ ] **Step 4: The background writes and clears it**

In `tests/background/handlers.test.ts`, the `harness` defaults gain
`health: { reject: vi.fn(async () => undefined), clear: vi.fn(async () => false) },`, and inside
`describe('axt:translate', …)` add:

```ts
    it('a call naming one of the reader\'s services writes the health record: success clears it, a refused key marks it; a call naming none, or a free engine, writes nothing (the redesign\'s design, §4)', async () => {
      const answering = (answer: unknown) => ({ router: { forCall: vi.fn(async () => ({ translate: vi.fn(async () => answer) })) } as unknown as HandlerDeps['router'] })
      const health = () => ({ reject: vi.fn(async () => undefined), clear: vi.fn(async () => true) })
      const named = { ...CALL, type: 'axt:translate' as const, providerId: 'svc-abcd1234' }
      const good = { ok: true, result: { segments: [], provider: 'svc-abcd1234' }, cached: 0 }

      const cleared = health()
      await harness({ ...answering(good), health: cleared }).send(named)
      expect(cleared.clear).toHaveBeenCalledWith('svc-abcd1234')
      expect(cleared.reject).not.toHaveBeenCalled()

      const refused = health()
      await harness({ ...answering({ ok: false, error: { kind: 'auth', message: 'bad key', isolatable: false } }), health: refused }).send(named)
      expect(refused.reject).toHaveBeenCalledWith('svc-abcd1234')

      const plain = health()
      await harness({ ...answering(good), health: plain }).send({ ...CALL, type: 'axt:translate' })
      await harness({ ...answering(good), health: plain }).send({ ...named, providerId: 'google-web' })
      expect(plain.clear).not.toHaveBeenCalled()
      expect(plain.reject).not.toHaveBeenCalled()
    })
```

Run: `pnpm vitest run tests/background/handlers.test.ts`
Expected: FAIL — the record is not written.

In `src/entrypoints/background/handlers.ts`: `HandlerDeps` gains

```ts
  /** The service health record (the redesign's design, §4) */
  health: { reject(id: string): Promise<void>; clear(id: string): Promise<boolean> }
```

and the `'axt:translate'` entry becomes:

```ts
    'axt:translate': (message, sender) => deps.router.forCall(message.scope, sender.tabId)
      .then(transport => transport.translate(message))
      .then(async response => {
        // A call naming one of the reader's services is the settings page asking whether it answers: its answer is the
        // record's (the redesign's design, §4). A refused key marks it; any success clears it
        if (message.providerId && SERVICE_ID_RE.test(message.providerId)) {
          if (response.ok) await deps.health.clear(message.providerId)
          else if (response.error.kind === 'auth') await deps.health.reject(message.providerId)
        }
        return response
      })
      .catch((e: unknown) => {
        const error = toErrorInfo(e)
        diag(`[axt] translate call failed before any request: ${failureLine(error.kind, error.message)}`)
        return { ok: false as const, error }
      }),
```

with `import { SERVICE_ID_RE } from '@/config/services'`.

In `src/entrypoints/background/index.ts`:

```ts
import { clearRejected, markRejected, rejectedServices, watchRejected } from '@/shared/service-health'
import { SERVICE_ID_RE } from '@/config/services'
```

the chain's `load` becomes:

```ts
    load: async config => {
      const resolved = config ?? await getConfig()
      const rejected = await rejectedServices()
      return {
        config: resolved,
        transport: await createLocalTransport(resolved, {
          cache, cancelled, warn: diag, rejected,
          // a refused key is remembered across sessions (the redesign's design, §4); a free engine's failure is not ours to record
          onDemoted: info => { if (info.kind === 'auth' && SERVICE_ID_RE.test(info.id)) void markRejected(info.id) },
        }),
      }
    },
```

after the chain holder is created:

```ts
  // A mark cleared (a connection that succeeded) rebuilds the chain, so that the service comes back; a mark added
  // needs nothing, the chain in force having demoted it already. `defineBackground`'s callback is synchronous: the
  // first read lands before any connection a reader could make
  let known = new Set<string>()
  void rejectedServices().then(ids => { known = ids })
  watchRejected(ids => {
    const cleared = [...known].some(id => !ids.has(id))
    known = ids
    if (cleared) void chain.activate()
  })
```

and the handlers are given `health: { reject: markRejected, clear: clearRejected }`. In the settings page's service
deletion (`src/entrypoints/options/sections/ServiceDrawer.tsx`, `remove()`), after the `patch`, add
`await clearRejected(gone)` (imported from `@/shared/service-health`): a deleted service leaves no mark behind.

Run: `pnpm vitest run tests/background tests/providers tests/shared`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/shared/service-health.ts src/providers/fallback.ts src/providers/transport.ts src/entrypoints/background/index.ts src/entrypoints/background/handlers.ts src/entrypoints/options/sections/ServiceDrawer.tsx tests/shared/service-health.test.ts tests/providers/fallback.test.ts tests/providers/transport.test.ts tests/background/handlers.test.ts
git commit -m "feat(background): remember a refused key, pass it over until a connection clears it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 12: the popup counts a refused service as one that cannot run

**Files:**
- Modify: `src/entrypoints/popup/view-model.ts:36-60,114-140,155-162,178,236,260,281,296-299`
- Modify: `src/entrypoints/popup/state.ts:110,254-256,395-421`
- Modify: `src/ui/service-items.ts:14,41`
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`note.llmRejected`, `service.llm_rejected`)
- Modify: `src/entrypoints/popup/fixtures.ts` (`base.rejected`, the case P7b)
- Test: `tests/popup/view-model.test.ts`

**Interfaces:**
- Consumes: `rejectedServices`, `watchRejected` (Task 11).
- Produces: `PopupInput.rejected: readonly string[]`;
  `runnable(config: Config, pack: PackState | null, rejected: readonly string[] = []): boolean`;
  `serviceItems(config: Config, pack: PackState | null, rejected: readonly string[] = []): MenuItem[]`; the pack keys
  `S.note.llmRejected` and `S.service.llm_rejected` (「API Key 已失效」 / “API key no longer valid”). The PDF reader's
  service menu calls `serviceItems` without the record and so shows a refused service as the popup did before; Part 5
  gives it the record.

- [ ] **Step 1: A fixture and the failing test**

In `src/entrypoints/popup/fixtures.ts`, the shared `base` input gains `rejected: []`, and after the case `P7` add:

```ts
  { id: 'P7b', name: 'A refused key, a fallback available', when: 'idle ∧ rejected ∧ fallback', input: { ...base, config: { ...DEFAULT_CONFIG, provider: SVC.id, services: [SVC] }, rejected: [SVC.id], saved: llmProvider({ available: false, fallback: { id: 'microsoft' } }) } },
```

In `tests/popup/view-model.test.ts`, inside `describe('derivePopupView (UI.md §4)', …)`, add:

```ts
  it('P7b a chosen service whose key was refused cannot run: the note says so and who takes over (the redesign\'s design, §5.2)', () => {
    const i = input('P7b')
    expect(runnable(i.config!, null, i.rejected)).toBe(false)
    expect(runnable(i.config!, null, [])).toBe(true)
    expect(view('P7b').note?.text).toBe(S.note.willFallback(S.note.llmRejected, 'Microsoft 翻译'))
    expect(view('P7b').primary.disabled).toBe(false)
  })
```

Run: `pnpm vitest run tests/popup/view-model.test.ts`
Expected: FAIL — `rejected` is not a field of the input; `S.note.llmRejected` is undefined.

- [ ] **Step 2: The words**

In `src/locales/zh-CN.ts`: in `note`, after `llmNoKey`, add `llmRejected: 'API Key 已失效', // the redesign's §5.2: a key the endpoint refused`;
in `service`, after `llm_noKey`, add `llm_rejected: 'API Key 已失效',`. In `src/locales/en.ts`, the same keys:
`llmRejected: 'API key no longer valid',` and `llm_rejected: 'API key no longer valid',`.

- [ ] **Step 3: The view model**

In `src/entrypoints/popup/view-model.ts`, `PopupInput` gains, after `shortcut`:

```ts
  /** The reader's services whose key the endpoint refused (the service health record, the redesign's design, §4) */
  rejected: readonly string[]
```

`runnable` and `cannotRunWhy` become:

```ts
export function runnable(config: Config, pack: PackState | null, rejected: readonly string[] = []): boolean {
  const own = chosenService(config)
  if (own) return serviceRuns(own) && !rejected.includes(own.id)
```

(the rest of `runnable` unchanged) and

```ts
function cannotRunWhy(config: Config, pack: PackState | null, rejected: readonly string[]): string {
  const own = chosenService(config)
  if (own) return rejected.includes(own.id) ? S.note.llmRejected : S.note.llmNoKey
```

(the rest unchanged). `menuOf` gains the parameter and passes it on:

```ts
function menuOf(kind: MenuKind, config: Config, pack: PackState | null, rejected: readonly string[]): NonNullable<PopupView['menu']> {
  switch (kind) {
    case 'service':
      return { kind, label: S.rows.service, search: false, items: serviceItems(config, pack, rejected) }
```

Then every call in the file passes the input's `rejected`: `runnable(config, pack)` at lines 155, 162 and 236 becomes
`runnable(config, pack, rejected)`; `cannotRunWhy(config, pack)` at lines 156 and 260 (twice) becomes
`cannotRunWhy(config, pack, rejected)`; `menuOf(menu, config, pack)` at lines 178 and 281 becomes
`menuOf(menu, config, pack, rejected)`. Each of those functions receives the `PopupInput`: add `rejected` to its
destructuring (`const { pack, menu, saved, rejected } = input`, or `{ pack, saved, rejected }: PopupInput` in
`serviceNote`'s parameter list).

In `src/ui/service-items.ts`, `serviceItems` gains `rejected: readonly string[] = []` and the reader's own services'
hint becomes:

```ts
    ...config.services.map(s => ({ id: s.id, name: s.name, hint: rejected.includes(s.id) ? S.service.llm_rejected : serviceRuns(s) ? s.model : S.service.llm_noKey, selected: config.provider === s.id })),
```

- [ ] **Step 4: The state loads and follows the record**

In `src/entrypoints/popup/state.ts`, import `rejectedServices` and `watchRejected` from `@/shared/service-health`.
After `let shortcut: string | null = null` (line 110) add:

```ts
  /** The reader's services whose key was refused (the service health record): read as the popup starts, then followed */
  let rejected: readonly string[] = []
```

In `start()`, after the `host.shortcut()…` line, add:

```ts
      void rejectedServices().then(ids => { rejected = [...ids]; changed() })
      const stopRejected = watchRejected(ids => { rejected = [...ids]; changed() })
```

and in the function it returns, after `stopPoll()`, call `stopRejected()`. In `state()`, the input gains the field:

```ts
      snapshot ??= { input: { page, entry, saved, session: on() ? session : null, config, pack, menu, shortcut, savedRevision, rejected }, error }
```

In `restartIfOn` (line 256), `runnable(next, packState)` becomes `runnable(next, packState, rejected)`.

Run: `pnpm typecheck`
Expected: exit 0. An error names another place that builds a `PopupInput` (a test's literal): give it `rejected: []`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/popup tests/ui`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/entrypoints/popup/view-model.ts src/entrypoints/popup/state.ts src/entrypoints/popup/fixtures.ts src/ui/service-items.ts src/locales/zh-CN.ts src/locales/en.ts tests/popup/view-model.test.ts
git commit -m "feat(popup): a refused key is a service that cannot run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add by name any test file the compiler sent you to in Step 4.)

### Task 13: Part 2's record, and Part 3's plan

- [ ] **Step 1: The browser checks**

Run: `pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs && pnpm e2e && pnpm e2e:pdf && pnpm e2e:floating`
Expected: each exits 0. A refused key checked by hand: a service with a wrong key, a page translated (the service
demoted, the record written), the popup showing 「API Key 已失效，本次将使用 Microsoft 翻译」; the right key entered and
connected, the record cleared, the popup ready.

- [ ] **Step 2: A local review of the part**

A local Codex review of Part 2's commits (`/codex:adversarial-review --base <the commit before Task 7>`: the
configuration and the chain are contracts). Check each point before adopting it.

- [ ] **Step 3: Write Part 3's plan**

Append `# Part 3: the popup` to this document, written as Parts 1 and 2 are, against the names Parts 1 and 2 left
(Task 6's and this task's notes), from the design's §5, §8, §9 and §10.1 and `popup-decisions.md`. Show it to the
maintainer before building it.

---

# Parts 3–7, as re-cut on 2026-09-26

The maintainer asked for the work to go faster with its quality unchanged (2026-09-26): the plan of the next part is
written while the checks of the last one run; the controls both pages add are built once, first; then the popup and
the settings page are built **in parallel**, each in its own worktree with its own task-by-task reviews, and merged
back; small same-shape edits go out as one task. Each part below has its own plan file beside this one, and the
maintainer reviews the plans of Parts 4 and 5 together before either is built.

| Part | What | Where | Plan |
|---|---|---|---|
| 3 | The controls both pages add | this worktree, `exp/extension-ui-redesign` | `2026-09-26-extension-ui-redesign-part3-controls.md` |
| 4 | The popup (§5) | `.worktrees/redesign-popup`, branch `exp/ui-popup` from Part 3's end | `2026-09-26-extension-ui-redesign-part4-popup.md` |
| 5 | The settings page (§6) | `.worktrees/redesign-settings`, branch `exp/ui-settings` from Part 3's end | `2026-09-26-extension-ui-redesign-part5-settings.md` |
| 6 | The floating button and the controls on arXiv's pages (§7), and the reader's service menu reading the record | `.worktrees/redesign-floating`, branch `exp/ui-floating` from Part 3's end, in parallel with 4 and 5; merged after them, once the maintainer has seen its before-and-after shots | `2026-09-26-extension-ui-redesign-part6-floating.md` |
| 7 | Verification and documents (§12, §13), the pull request | this worktree | written when 6 is done |

**How the parallel parts stay apart.** Parts 4 and 5 are merged back into `exp/extension-ui-redesign` with a merge commit
each, the popup first. They share only the locale packs, where each adds its keys in its own section (`S` the popup's,
`O` the settings page's): the second merge keeps both sides. Neither part deletes a file the other still reads: the old
components of `src/ui` (`Menu`, `MenuField`, `Segmented`, `Switch`, `Button`, `Field`, `Confirm`, `Drawer`,
`appearance/*`) and `ui.css`'s `--axt-*` tokens go in Part 7, once both pages have left them. A control one page needs and
the other does not stays with that page (`src/entrypoints/popup/ui/`, `src/entrypoints/options/ui/`).

## Part 3's interfaces (what Parts 4 and 5 build on)

In `src/ui/controls/` and `src/styles/controls.css`, every value a role of `src/shared/tokens.ts`:

- **`Button`** — `Button({ kind = 'neutral', size = 'md', icon, shortcut, className, ...buttonProps })`.
  - `kind`: `'brand'` (the one primary: `brand`, words `on-brand`), `'neutral'` (`button`; at `size="lg"`, `fill`),
    `'text'` (no ground, `ink-2`, `fill` and `ink` on hover), `'raised'` (`button-raised` with `raised-shadow`: a note's
    button).
  - `size`: `'lg'` 36 px, radius 9, 13 px / 500 (the popup's primary and its twin entries); `'md'` 32 px, radius 8,
    padding 0 16 (a form's bar); `'sm'` 28 px, radius 7, padding 0 12, 12.5 px / 500 (a row's button).
  - `icon`: a Lucide node drawn 16 px before the words. `shortcut`: a `Kbd` after them, shown on `brand` and `neutral`
    while enabled; `raised` keeps its own measure (26 px, padding 0 10) whatever `size` says.
  - A disabled button is `aria-disabled="true"` (it stays focusable) and keeps its size's neutral ground (`button` at
    `sm` / `md`, `fill` at `lg`) with `ink-3` words, not pressed, no shortcut. `busy` puts a spinner in place of the
    leading icon (before the words when there is none) with `aria-busy`, not pressed. Every enabled button scales to
    0.96 on press, 150 ms (§8).
- **`Kbd`** — `Kbd({ children })`: 11 px / 500, padding 3 × 5, radius 5; on a brand button `brand-chip` behind
  `on-brand`, elsewhere `ink` at 9 % behind `ink-2`.
- **`Field`** — `Field({ label, hint, error, children })` wraps one control and wires `aria-describedby` / `aria-invalid`;
  **`TextInput`** — the input itself (`.input`): 34 px, radius 8, `field` ground with a 0.5 px `field-edge`, a 1 px `ink-3`
  edge on focus, the keyboard's 2 px `focus` ring at offset 0 (none under the pointer: `data-axt-pointer`), placeholder
  `ink-2`. An error is a 12 px line in `ink` after a 14 px `danger` alert icon, the field's edge `danger`.
- **`Reveal`** — `Reveal({ open, children })`: §8's reveal (`grid-template-rows` 0fr → 1fr 220 ms on `--ease`, opacity 180 ms
  after 40 ms; closing 180 ms and 120 ms), `inert` while closed; under reduced motion a 150 ms fade.
- **`Radio`** — the 16 px mark (`.radio`: a 1.5 px `ink-3` ring, `ink` when chosen, its dot growing from the centre in
  150 ms) inside any element that carries `role="radio"` and `aria-checked`; the group's arrows are `radioKeys`.
- **`Segmented`** — `Segmented({ label, value, options, onChange, fit = false, size = 'md', iconsOnly = false })`, options
  `{ value, label, icon?: ReactNode, title?, disabled? }`. Equal segments slide their thumb by `translate` (`--i` / `--n`, the
  reader's `.seg`); `fit` segments take their words' widths and the thumb follows the chosen one by anchor positioning
  (`anchor-name` on it, `anchor-scope` on the control), its left edge and width moving 220 ms on `--ease`. A radio group:
  the arrows move the choice (`radioKeys`); a disabled segment is passed over and greyed with its `title`.
- **`MenuList`** — the reader's `ReaderMenu` moved to `src/ui/controls/MenuList.tsx`, the reader's rows unchanged pixel
  for pixel (its probe), extended for the pages without changing its defaults:
  - `layout: 'inline' | 'two-line'` (the hint under the name, 11.5 px `ink-2`, the item at least 40 px);
  - `item.action?: { label, busy? }` — a neutral `sm` button inside the row (the Chrome pack's 下载), a spinner while busy;
  - `item.preview?: CSSProperties` — a sample drawn in that style at the row's trailing end (the style menu);
  - `item.manage?: true` — the 管理… last row: `ink-2`, no check, a separator before it, never chosen;
  - `item.lang?: string` — set on the item's name (a language's own name, a sample in another script);
  - an action button on the active row takes the `lift` ground; the prop that answers it is Part 3's plan's.
- **The pages' base** — the class `ui` on the popup's and the settings page's root: the font, `ink` on the page's ground,
  the keyboard's focus ring (`:focus-visible` 2 px `focus`, offset 2), text fields ringed only for the keyboard; both
  pages call `trackModality()` before their first paint. The class paints no ground: each page paints its own. The old
  pages, which lack the class, are untouched until they are replaced.
- **Tokens and motions Part 3 adds for both pages**: the roles `group-hover` (`$n-3`), `on-brand-2` (white 85 % in
  light, white in dark) and `tip-shadow` (the tooltip's shadow, its value unchanged), with their contrast pairs; the
  reader's `words-in` moved into `controls.css`.
- **`useRejected`** (`src/ui/use-rejected.ts`): the refused-key record as a React hook (`rejectedServices` then
  `watchRejected`, subscribed first), for the settings page and the reader. The parallel
  parts add no tokens: a role either needs later is raised with the controller.
- **The worktrees**: `.worktrees/redesign-popup` (branch `exp/ui-popup`) and `.worktrees/redesign-settings` (branch
  `exp/ui-settings`), created by the controller from Part 3's last commit.

Each part's plan cites these names exactly; a need the interfaces do not meet is raised with the controller, not
worked around in a page.
