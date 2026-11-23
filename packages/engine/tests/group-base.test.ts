// A unit's base face read off TeX's glyphs on A (packages/engine/src/locate/group-style.ts groupStyleOf, docs/PDF-READER.md
// §18.108): its own text's, where it has text of its own; where every letter is a group's, each attribute outside the scopes
// that set it, its weight outside `\textbf{…}` and a `\bfseries` run, its slant outside `\textit{…}`, an `\emph` run's slant
// turned back; where none, all its text's. The typesetter draws the part's style as the base and reads nothing more: its count
// of a translation's characters under the groups decided a weight from the reply's wording (2611.23651v2's kicker drawn
// regular, every glyph of its unit bold). And the unit's own text, the base size's glyphs. Words of our own.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { StyleGlyph } from '../src/locate/facts.ts'
import { groupStyleOf } from '../src/locate/group-style.ts'

const t = (s: string): Piece => ({ t: 'text', s })
let n = 0
const el = (src: string): Piece & { t: 'el' } => ({ t: 'el', id: `e${n++}`, kind: 'zero', src })
const group = (open: string, style: string, content: Piece[]): Piece => ({
  t: 'span',
  id: `s${n++}`,
  style,
  open,
  close: '}',
  content,
})
/** a text as TeX sets it: a glyph for each character that is no white space, in one font at one size */
const set = (s: string, base: string, size = 10): StyleGlyph[] =>
  [...s].filter((c) => !/\s/.test(c)).map((u) => ({ u, base, size, fill: -1 }))
const SANS_BOLD = 'NimbusSanL-Bold'
const BOLD = 'NimbusRomNo9L-Medi'
const ITALIC = 'NimbusRomNo9L-ReguItal'
const REGULAR = 'NimbusRomNo9L-Regu'
/** a face switch as geometry.ts tells one: a bare command the group table names a face for, its style by the command */
const switches = new Map([
  ['\\bfseries', 'bold'],
  ['\\em', 'italic'],
])
const face = (content: Piece[], glyphs: StyleGlyph[]) =>
  groupStyleOf(
    content,
    glyphs,
    () => undefined,
    () => false,
    (e) => switches.has(e.src),
    (e) => switches.get(e.src),
  ).face.own

describe('a unit’s base face, read off TeX’s glyphs', () => {
  it('a kicker set by a paper’s macro and a title by its \\bfseries, both bold, no text of its own: bold', () => {
    const content = [
      group('\\tagline{', 'other', [t('FIELD NOTES')]),
      t('\n'),
      group('{', 'other', [el('\\bfseries'), t(' A Small Title')]),
    ]
    const glyphs = [...set('FIELD NOTES', SANS_BOLD, 9.96), ...set('A Small Title', SANS_BOLD, 29.89)]
    expect(face(content, glyphs)).toEqual({ bold: true, italic: false })
  })
  it('a bold label and an italic sentence, no text of its own: the weight the italic run shows, the slant the bold one does', () => {
    const content = [
      group('\\textbf{', 'bold', [t('Question one:')]),
      t(' '),
      group('\\textit{', 'italic', [t('which of the two holds in the long run of the experiment')]),
    ]
    const glyphs = [
      ...set('Question one:', BOLD),
      ...set('which of the two holds in the long run of the experiment', ITALIC),
    ]
    expect(face(content, glyphs)).toEqual({ bold: false, italic: false })
  })
  it('a unit wholly inside \\emph: its glyphs italic, its base upright (the toggle turned back), as TeX’s \\emph turns it', () => {
    const content = [group('\\emph{', 'italic', [t('A whole sentence set in emphasis.')])]
    expect(face(content, set('A whole sentence set in emphasis.', ITALIC))).toEqual({ bold: false, italic: false })
    // (an \em switch at the unit's start, its run the rest of it: the same)
    expect(face([el('\\em'), t('a cell of a table')], set('a cell of a table', ITALIC))).toEqual({
      bold: false,
      italic: false,
    })
  })
  it('text of its own: its own text’s face, whatever its groups hold', () => {
    const content = [group('\\textbf{', 'bold', [t('A long bold opening of the paragraph')]), t(' and words.')]
    const glyphs = [...set('A long bold opening of the paragraph', BOLD), ...set('and words.', REGULAR)]
    expect(face(content, glyphs)).toEqual({ bold: false, italic: false })
  })
  it('its own text: the positions of the letters of no group, a switch’s run at its top level its own', () => {
    const content = [t('Some words '), group('{', 'other', [el('\\small'), t(' set small')]), t(' end')]
    const glyphs = [...set('Some words', REGULAR), ...set('set small', REGULAR, 9), ...set('end', REGULAR)]
    const text = groupStyleOf(content, glyphs).text
    expect(text.map((q) => glyphs[q]!.u).join('')).toBe('Somewordsend')
  })
})
