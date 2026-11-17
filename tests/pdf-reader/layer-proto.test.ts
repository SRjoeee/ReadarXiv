import { describe, expect, it } from 'vitest'
import { patternsOfTex } from '../../packages/engine/src/fonts/hyph.ts'

// The layer's v0: the approved prototype ported into the engine (layer-proto/, from readarxiv-web's exp/instant-layer
// at 9e56fca). Its drawing is measured by the layer gate against the prototype's own floor (--engine-kind=proto); these
// are its pure parts: the order the prototype's page laid units in, the hyphenation patterns it read from TeX's files,
// and how it reads a placeholder's source

describe("v0's hyphenation: TeX's pattern files read as the prototype's host read them", () => {
  it('reads the patterns and exceptions, comments out first', () => {
    const tex = '% \\patterns{not these}\n\\patterns{ % the real ones\n.ach4 a1b\n2bc }\n\\hyphenation{ ta-ble pro-ject }\n'
    expect(patternsOfTex(tex)).toEqual({ patterns: ['.ach4', 'a1b', '2bc'], exceptions: ['ta-ble', 'pro-ject'] })
  })
  it("reads dehyphn.tex's T1 umlauts and its \\3, and leaves out the OT1 repeats", () => {
    const tex = '\\patterns{\n\\n{"a1b} 1\\3e \\c{x1y}\n}\n'
    expect(patternsOfTex(tex).patterns).toEqual(['\u00E41b', '1\u00DFe'])
  })
  it("reads hyph-utf8's files as UTF-8, its letters as they are (French's \u00FF too), never TeX's 8-bit escapes", () => {
    const tex = '% hyph-fr\n\\patterns{\n.\u00E9l1ec \u00E83 1\u00FF \'a4 % a comment\n}\n'
    expect(patternsOfTex(tex, 'utf8').patterns).toEqual(['.\u00E9l1ec', '\u00E83', '1\u00FF', "'a4"])
    // (a Latin-1 file's 0xFF is dehyphn.tex's \u00DF)
    expect(patternsOfTex(tex).patterns).toContain('1\u00DF')
  })
})

