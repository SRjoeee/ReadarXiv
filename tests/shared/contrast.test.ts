// The pairs the redesign draws, measured from the tokens themselves and held to their floors (the redesign's design,
// §12; better-colors: measure the rendered pair). Text 4.5:1, icons and edges 3:1 (WCAG 1.4.3, 1.4.11)
import { describe, expect, it } from 'vitest'
import { type Mode, resolve } from '@/shared/tokens'
import { contrast, over, parseOklch, type Rgba } from './wcag'

/** a colour of the sheet, or a literal; `name@9%` is it mixed with transparent, as color-mix(in oklab, …, transparent) draws it */
const colour = (name: string, mode: Mode): Rgba => {
  const [base = name, share] = name.split('@')
  const [r, g, b, a] = parseOklch(base.startsWith('oklch(') ? base : resolve(base, mode))
  return [r, g, b, share ? (a * Number.parseFloat(share)) / 100 : a]
}
/** layers from the top down, the last one opaque */
const stack = (layers: string[], mode: Mode): Rgba =>
  layers.map(l => colour(l, mode)).reduceRight((below, top) => over(top, below))

const PAIRS: { what: string; fg: string; bg: string[]; floor: number; modes?: Mode[] }[] = [
  { what: 'words on the brand', fg: 'on-brand', bg: ['brand'], floor: 4.5 },
  { what: 'a shortcut label on the brand', fg: 'on-brand', bg: ['brand-chip', 'brand'], floor: 4.5 },
  { what: 'a shortcut label on the large neutral button', fg: 'ink', bg: ['ink@9%', 'fill'], floor: 4.5 },
  { what: 'a shortcut label on the small neutral button', fg: 'ink', bg: ['ink@9%', 'button'], floor: 4.5 },
  { what: 'a shortcut label on P0\'s search row', fg: 'ink', bg: ['ink@9%', 'group-hover'], floor: 4.5 },
  { what: 'P0\'s paper id: on-brand-2, 85 % white in light and white in dark (§5.4)', fg: 'on-brand-2', bg: ['brand'], floor: 4.5 },
  { what: 'a value in the popup\'s group, a replaced service struck in it too', fg: 'ink-2', bg: ['group'], floor: 4.5 },
  { what: 'a chevron in the popup\'s group', fg: 'ink-3', bg: ['group'], floor: 3 },
  { what: 'a hovered or open row\'s label in the popup\'s group', fg: 'ink', bg: ['group-hover'], floor: 4.5 },
  { what: 'a hovered or open row\'s value, struck or not', fg: 'ink-2', bg: ['group-hover'], floor: 4.5 },
  { what: 'a hovered or open row\'s chevron', fg: 'ink-3', bg: ['group-hover'], floor: 3 },
  { what: 'a placeholder on a field', fg: 'ink-2', bg: ['field'], floor: 4.5 },
  { what: 'a destructive confirm\'s words', fg: 'danger', bg: ['button-danger'], floor: 4.5 },
  { what: 'an alert\'s icon in a note', fg: 'danger', bg: ['group'], floor: 3 },
  { what: 'the connected icon', fg: 'success', bg: ['chrome'], floor: 3 },
  { what: 'a search hit\'s words, in a label or a description', fg: 'ink', bg: ['mark', 'chrome'], floor: 4.5 },
  { what: 'the neutral primary\'s words', fg: 'ink', bg: ['fill'], floor: 4.5 },
  { what: 'a chosen swatch\'s edge', fg: 'line-strong', bg: ['chrome'], floor: 3 },
  // a switch that is on, in the popup and on the settings page (the maintainer, 2026-09-28; round 8: 6.81 / 3.07)
  { what: 'a switch\'s on-track against the popup\'s ground', fg: 'brand', bg: ['chrome'], floor: 3 },
  { what: 'a switch\'s on-track against the settings card', fg: 'brand', bg: ['chrome'], floor: 3 },
  { what: 'a switch\'s thumb, white, against its on-track', fg: 'on-brand', bg: ['brand'], floor: 3 },
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

  it('reads round 8\'s numbers for the brand red the maintainer chose: white on it 6.81:1 light, 5.14:1 dark', () => {
    expect(contrast(colour('on-brand', 'light'), colour('brand', 'light'))).toBeCloseTo(6.81, 1)
    expect(contrast(colour('on-brand', 'dark'), colour('brand', 'dark'))).toBeCloseTo(5.14, 1)
  })
})
