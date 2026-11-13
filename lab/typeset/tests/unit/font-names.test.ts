// The font names' readings moved into packages/typeset (breaker/font-names.mjs) held to today's own (engine 065c1d973:
// rules/font-roles.mjs classifyFont and familyOfFonts; fonts.mjs classifyFont, which builds a canvas as it loads: its function
// read off its source and compared on the same names), on the corpus's font names (each part's Part.paper.faces) and by hand.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyFont, familyOfFonts } from '../../../../packages/typeset/src/breaker/font-names.ts'
import { L1_BUNDLES, hasL1 } from '../../../../packages/typeset/tests/replay/l1.ts'
import { hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'

const roles = hasToday ? await import(todayFile('rules/font-roles.mjs')) : null
const corpusNames = (): [string[], number[]][] =>
  !hasL1
    ? []
    : readdirSync(L1_BUNDLES).flatMap((p) => {
        const head = JSON.parse(readFileSync(join(L1_BUNDLES, p, 'head.json'), 'utf8')) as { parts: (string | null)[] }
        const d = head.parts.find(Boolean)
        if (!d) return []
        const fonts = (JSON.parse(readFileSync(join(L1_BUNDLES, p, `${d}.part`), 'utf8')) as { paper: { faces: { fonts: [string, number][] } } }).paper.faces.fonts
        return [[fonts.map((f) => f[0]), fonts.map((f) => f[1])] as [string[], number[]]]
      })
describe.skipIf(!roles)('the font names read as today reads them', () => {
  const hand = ['ABCDEF+NimbusRomNo9L-Regu', 'CMR10', 'CMBX12', 'CMTT10', 'CMSS10', 'LMRoman10-Bold', 'LMRomanCaps10-Regular', 'SFRM1000', 'LinLibertineTB', 'Times-Italic', 'Helvetica-Bold', 'XCharter-Roman', 'URWPalladioL-Roma', 'CMMI10', 'Inconsolata-zi4r', 'T3Font_1', 'CMCSC10']
  it('reads each name’s family as font-roles.mjs does, and the paper’s English family', () => {
    for (const [names, weights] of [...corpusNames(), [hand, hand.map((_, i) => i + 1)] as [string[], number[]]]) {
      expect(familyOfFonts(names, weights)).toBe(roles!.familyOfFonts(names, weights))
    }
  })
  it('reads a glyph’s style as fonts.mjs classifyFont does (its source run as it is)', () => {
    const src = readFileSync(todayFile('layer-proto/fonts.mjs'), 'utf8')
    const body = src.slice(src.indexOf('const bare = '), src.indexOf('\n}\n', src.indexOf('export function classifyFont')) + 2)
    const today = new Function(`${body.replace('export function classifyFont', 'function classifyFont')}; return classifyFont`)() as typeof classifyFont
    const names = [...hand, ...corpusNames().flatMap(([n]) => n)]
    for (const n of names) expect(classifyFont(n)).toEqual(today(n))
  })
})
