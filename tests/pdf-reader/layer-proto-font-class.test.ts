import { describe, expect, it } from 'vitest'
import { classifyFont } from '@/pdf-reader/engine/layer-proto/fonts.mjs'

// A PDF font's family from its name (layer-proto/fonts.mjs classifyFont), which the ledger's math lines, the ink units' kept
// runs and the figure runs' word test read: a math face's glyphs are a formula's, kept as the original's ink. Euler's and
// MathTime's math faces read as serif text, and the text face XITS-Regular as math, by a math pattern one family short
// twice and one prefix too broad.

describe('classifyFont: the math faces', () => {
  for (const name of ['EUEX10', 'EURM10', 'EURB10', 'EURM7', 'ABCDEF+EUEX10', 'MTMI', 'MTSY', 'MTEX', 'MTMIB', 'MTSYB', 'QWERTY+MTMI'])
    it(`${name} is a math face`, () => expect(classifyFont(name).fam).toBe('math'))
  for (const name of ['XITSMath', 'XITSMath-Regular', 'XITSMath-Bold', 'CMMI10', 'CMSY10', 'EUFM10', 'STIXTwoMath-Regular', 'LatinModernMath-Regular'])
    it(`${name} is a math face, as it was`, () => expect(classifyFont(name).fam).toBe('math'))
})

describe('classifyFont: the text faces', () => {
  for (const [name, bold, italic] of [['XITS-Regular', false, false], ['XITS-Bold', true, false], ['XITS-Italic', false, true], ['ABCDEF+XITS-BoldItalic', true, true]] as const)
    it(`${name} is a serif text face`, () => expect(classifyFont(name)).toMatchObject({ fam: 'serif', bold, italic, known: true }))
  for (const name of ['CMR10', 'NimbusRomNo9L-Regu', 'Times-Roman', 'EUROSTILE', 'MTPro2Text'])
    it(`${name} is no math face`, () => expect(classifyFont(name).fam).not.toBe('math'))
})
