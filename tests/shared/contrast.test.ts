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
  { what: 'P0\'s paper id: on-brand-2, 85 % white in light and white in dark (§5.4)', fg: 'on-brand-2', bg: ['brand'], floor: 4.5 },
  { what: 'a value in the popup\'s group', fg: 'ink-2', bg: ['group'], floor: 4.5 },
  { what: 'a chevron in the popup\'s group', fg: 'ink-3', bg: ['group'], floor: 3 },
  { what: 'a hovered or open row\'s label in the popup\'s group', fg: 'ink', bg: ['group-hover'], floor: 4.5 },
  { what: 'a hovered or open row\'s value', fg: 'ink-2', bg: ['group-hover'], floor: 4.5 },
  { what: 'a hovered or open row\'s chevron', fg: 'ink-3', bg: ['group-hover'], floor: 3 },
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
