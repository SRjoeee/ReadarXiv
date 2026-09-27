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
  /** a hovered or open row in the popup's group (§5.1; the controller's ruling 9): a step under the group, both themes */
  'group-hover': '$n-3',
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
  /** words on the brand told apart from its words by a lighter white and their weight (P0's paper id, §5.4): 85 % white
   *  in light (5.65:1), white in dark, where 85 % read 4.10:1 */
  'on-brand-2': { light: 'oklch(1 0 0 / 0.85)', dark: 'oklch(1 0 0)' },
  /** a shortcut label on the brand (the maintainer, 2026-09-26: round 2's light label) */
  'brand-chip': { light: 'oklch(1 0 0 / 0.18)', dark: 'oklch(1 0 0 / 0.08)' },
  success: { light: 'oklch(0.62 0.14 150)', dark: 'oklch(0.72 0.14 150)' },
  /** a search hit, behind the words */
  mark: { light: 'oklch(0.85 0.12 95 / 0.7)', dark: 'oklch(0.55 0.1 95 / 0.55)' },
  /** tooltips are dark in both themes */
  'tip-bg': 'oklch(0.22 0.01 255)',
  'tip-ink': 'oklch(0.96 0 0)',
  'tip-ink-2': 'oklch(0.74 0.01 255)',
  /** the tooltip's shadow, one in both themes as its ground is (Part 3, Task 21; the floating button's tooltips take it
   *  from the shadow root's sheet in Part 6) */
  'tip-shadow': '0 4px 12px oklch(0 0 0 / 0.2)',
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
