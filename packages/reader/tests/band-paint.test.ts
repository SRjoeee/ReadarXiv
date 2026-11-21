// The highlight's paint (prefs.ts bandPaint): the band the visitor chose in the reading options, its colour at its strength, as
// the wash's two variables the reader's sheet reads (styles.ts `.axt-hl`). The choice was stored and never painted: every band
// was the sheet's green at 22 % (the feature list's E2, 2026-11-12); today's look sheet wrote both (style-preset.ts).
import { describe, expect, test } from 'vitest'
import { bandPaint, DEFAULTS, type Prefs } from '../src/index.ts'

const BANDS: Prefs['bands'] = [
  { id: 'soft-green', colour: 'oklch(0.693 0.17 162.48)', opacity: 0.22, name: null },
  { id: 'sand', colour: 'oklch(0.85 0.12 85)', opacity: 0.3, name: null },
  { id: 'sky', colour: 'oklch(0.75 0.12 240)', opacity: 0.25, name: null },
]
const at = (band: string, bands = BANDS) => bandPaint({ bands, highlight: { on: true, band } })

describe('the highlight painted in the band chosen', () => {
  test('the band chosen, its colour and its strength as a whole percentage', () => {
    expect(at('sand')).toEqual({ '--axt-hl-color': 'oklch(0.85 0.12 85)', '--axt-hl-mix': '30%' })
    expect(at('sky')).toEqual({ '--axt-hl-color': 'oklch(0.75 0.12 240)', '--axt-hl-mix': '25%' })
    expect(at('soft-green')).toEqual({ '--axt-hl-color': 'oklch(0.693 0.17 162.48)', '--axt-hl-mix': '22%' })
  })
  test("a choice that names no band given: the first, as today's activeHighlight; none given: the sheet's own", () => {
    expect(at('gone')).toEqual(at('soft-green'))
    expect(at('sand', [])).toBeNull()
    expect(bandPaint(DEFAULTS)).toBeNull()
  })
  test('the strength clamped as the settings clamp it, 5 % to 60 %; one that is no number, 22 %', () => {
    const one = (opacity: number) => at('x', [{ id: 'x', colour: '#abcdef', opacity, name: 'mine' }])?.['--axt-hl-mix']
    expect([one(0), one(0.9), one(0.333), one(Number.NaN)]).toEqual(['5%', '60%', '33%', '22%'])
  })
  test("a band of no colour (the extension's default green) is the sheet's green at the band's strength", () => {
    expect(at('x', [{ id: 'x', colour: '', opacity: 0.3, name: null }])).toEqual({ '--axt-hl-mix': '30%' })
  })
})
