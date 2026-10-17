// The layer's link focus ring reads on the page in every appearance (engine/view/engine.css):
// the ring is the page's colours, not the interface's, so that the dark theme's near-white --focus never lies on white
// paper. Its tones are read from the sheet and measured as WCAG contrast against the paper they lie on: white, and white
// dimmed by the layer's own filter (invert(88.8%)), each at least 3:1 (WCAG 2.2 SC 1.4.11, a focus indicator's contrast)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SHEET = readFileSync(join(process.cwd(), 'src/pdf-reader/engine/view/engine.css'), 'utf8')

/** an oklch colour's relative luminance (sRGB, WCAG), by OKLab's matrices (Ottosson) */
function luminanceOf(l: number, c: number, h: number): number {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map(x => Math.min(1, Math.max(0, x)))
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
/** the sheet's value of a custom property in the rule whose selector is `selector`, as an oklch's luminance */
function toneOf(selector: string, property: string): number {
  const rule = SHEET.split('\n').find(line => line.startsWith(`${selector} {`) && line.includes(`${property}:`))
  const m = rule && new RegExp(`${property}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`).exec(rule)
  if (!m) throw new Error(`no ${property} in ${selector}`)
  return luminanceOf(Number(m[1]), Number(m[2]), Number(m[3]))
}
/** white paper, and white through the layer's dimming filter: invert(88.8%) leaves 0.112 of each channel (the hue turn
 *  changes no grey) */
const PAPER = 1
const DIMMED = ((0.112 + 0.055) / 1.055) ** 2.4

describe('the link focus ring reads on the page in every appearance', () => {
  it('the focused link\'s ring is drawn in the page\'s tones, never the interface\'s --focus', () => {
    const focused = SHEET.split('\n').find(line => line.startsWith('.axt-link:focus-visible > .axt-link-box {')) ?? ''
    expect(focused).toContain('var(--axt-ring)')
    expect(focused).toContain('var(--axt-ring-halo)')
    expect(focused).not.toContain('--focus')
  })

  it('an undimmed page (white paper, in either theme): the ring 3:1 at least on the paper and on its halo', () => {
    const ring = toneOf('.axt-link', '--axt-ring'), halo = toneOf('.axt-link', '--axt-ring-halo')
    expect(contrast(ring, PAPER)).toBeGreaterThanOrEqual(3)
    expect(contrast(ring, halo)).toBeGreaterThanOrEqual(3)
  })

  it('a dimmed page (the dark theme\'s dimming): the ring 3:1 at least on the dimmed paper and on its halo', () => {
    const ring = toneOf('html[data-axt-dim] .axt-link', '--axt-ring'), halo = toneOf('html[data-axt-dim] .axt-link', '--axt-ring-halo')
    expect(contrast(ring, DIMMED)).toBeGreaterThanOrEqual(3)
    expect(contrast(ring, halo)).toBeGreaterThanOrEqual(3)
  })
})
