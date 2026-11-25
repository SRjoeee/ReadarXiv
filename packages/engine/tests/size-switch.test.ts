// A unit TeX set at two sizes by a size declaration at its top level, no group around it: a title and its subtitle in one
// \title, `A Title\\[4pt] \large a subtitle`, which the class sets inside `{\huge\bfseries\@title\par}`. TeX sets the title at
// the size in force where the paragraph begins (the class's \huge) and the subtitle at \large's. The unit's base size is read
// off its own text's glyphs (packages/engine/src/locate/group-style.ts groupStyleOf's `text`, facts.ts unitSize: their upper
// median), and a declaration's run at the top level counts as the unit's own text: a subtitle longer than its title made the
// whole unit the subtitle's size, and the title was drawn at it. RED until a size declaration's run is a scope of its own, the
// base the text outside it. Words of our own.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { type StyleGlyph, unitSize } from '../src/locate/facts.ts'
import { groupStyleOf } from '../src/locate/group-style.ts'

const t = (s: string): Piece => ({ t: 'text', s })
let n = 0
const el = (src: string, kind = 'other'): Piece & { t: 'el' } => ({ t: 'el', id: `e${n++}`, kind, src })
const group = (open: string, content: Piece[]): Piece => ({
  t: 'span',
  id: `s${n++}`,
  style: 'other',
  open,
  close: '}',
  content,
})
const BOLD = 'NimbusSanL-Bold'
/** a text as TeX sets it: a glyph for each character that is no white space, in one font at one size */
const set = (s: string, size: number): StyleGlyph[] =>
  [...s].filter((c) => !/\s/.test(c)).map((u) => ({ u, base: BOLD, size, fill: -1 }))
/** the unit's base size: its own text's glyphs as groupStyleOf reads them, their size as unitSize reads it */
const baseSize = (content: Piece[], glyphs: StyleGlyph[]) => {
  const g = groupStyleOf(
    content,
    glyphs,
    () => undefined,
    () => false,
    () => false,
  )
  return unitSize(g.text.map((q) => glyphs[q] as StyleGlyph))
}
const TITLE = 'A Short Title of Ours'
const SUBTITLE = 'and its subtitle, which runs longer than the title above it'

describe('a size declaration at a unit’s top level, no group around it', () => {
  it('a title at the class’s size, a `\\large` subtitle after its forced break: the base is the title’s size', () => {
    const content = [t(TITLE), el('\\\\[4pt]', 'break'), t('\n'), el('\\large'), t(` ${SUBTITLE}`)]
    const glyphs = [...set(TITLE, 20.6625), ...set(SUBTITLE, 11.9552)]
    expect(baseSize(content, glyphs)).toBe(20.6625)
  })
  it('a declaration that opens the unit: all of its text in the run, the base the run’s size', () => {
    const content = [el('\\large'), t(` ${SUBTITLE}`)]
    expect(baseSize(content, set(SUBTITLE, 11.9552))).toBe(11.9552)
  })
  it('the same words in a `{\\large …}` group: the group is its own scope (stated apart), the base the title’s', () => {
    const content = [t(TITLE), el('\\\\[4pt]', 'break'), t('\n'), group('{', [el('\\large'), t(` ${SUBTITLE}`)])]
    const glyphs = [...set(TITLE, 20.6625), ...set(SUBTITLE, 11.9552)]
    expect(baseSize(content, glyphs)).toBe(20.6625)
  })
})
