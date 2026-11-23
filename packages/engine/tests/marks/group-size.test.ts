// A group's own text set at another size than the text around it states that size (packages/engine/src/marks/faces.ts
// groupFacts, read off the unit's text glyphs on B, TeX's own output). The face a group is compared by (facts.ts faceKeyOf:
// role, weight, slant) holds no size, so a paper's macro that sets its argument `{\small\bfseries #1}` beside a title set
// `\fontsize{30}{35}\selectfont\bfseries` (both bold, both sans) stated nothing, and its translation was drawn at the title's
// size; and `{\small …}` or `{\Large\bfseries …}` inside a line likewise. RED until a group's size is a fact the reading states.
// Words of our own.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { StyleGlyph } from '../../src/locate/facts.ts'
import { groupFacts } from '../../src/marks/faces.ts'

const t = (s: string): Piece => ({ t: 'text', s })
let n = 0
const el = (src: string, kind = 'other'): Piece => ({ t: 'el', id: `e${n++}`, kind, src })
const group = (open: string, content: Piece[]): Piece & { t: 'span' } => ({
  t: 'span',
  id: `s${n++}`,
  style: 'other',
  open,
  close: '}',
  content,
})
const SANS_BOLD = 'NimbusSanL-Bold'
const SANS = 'NimbusSanL-Regu'
/** a text as TeX sets it: a glyph for each character that is no white space, in one font at one size */
const set = (s: string, base: string, size: number): StyleGlyph[] =>
  [...s].filter((c) => !/\s/.test(c)).map((u) => ({ u, base, size, fill: -1 }))

describe('a group TeX set at another size than the text around it states its size', () => {
  it('a kicker set small and bold above a title set large and bold, one unit: the kicker’s size stated', () => {
    const kicker = group('\\tagline{', [t('FIELD NOTES')])
    const title = group('{', [el('\\fontsize{30}{35}'), el('\\selectfont'), el('\\bfseries'), t(' A Small Title')])
    const content = [kicker, t('\n'), el('\\vspace{6mm}'), t('\n'), title]
    const glyphs = [...set('FIELD NOTES', SANS_BOLD, 9.9626), ...set('A Small Title', SANS_BOLD, 29.8879)]
    expect(groupFacts(content, glyphs).get(kicker)?.style?.size).toBe(9.9626)
  })
  it('a {\\small …} group inside a line of text: its size stated, the face unchanged', () => {
    const small = group('{', [el('\\small'), t(' a remark set smaller')])
    const content = [t('The words of a sentence with '), small, t(' and the words after it.')]
    const glyphs = [
      ...set('The words of a sentence with', SANS, 9.9626),
      ...set('a remark set smaller', SANS, 8.9664),
      ...set('and the words after it.', SANS, 9.9626),
    ]
    expect(groupFacts(content, glyphs).get(small)?.style?.size).toBe(8.9664)
  })
  it('a group at the size around it states none (nothing to draw apart)', () => {
    const same = group('\\tagline{', [t('the same size')])
    const content = [t('Words before '), same, t(' and after.')]
    const glyphs = [...set('Words before the same size and after.', SANS, 9.9626)]
    expect(groupFacts(content, glyphs).get(same)?.style).toBeUndefined()
  })
})
