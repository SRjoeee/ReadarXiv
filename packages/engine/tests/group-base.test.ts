// A unit's base face read off TeX's glyphs on A (packages/engine/src/locate/group-style.ts groupStyleOf, docs/PDF-READER.md
// §18.112): its own text's glyphs, its marks and the symbols it draws as text included (a run's face is its own glyphs'); where
// it has none, each attribute outside the scopes that set it, its weight outside `\textbf{…}` and a `\bfseries` run, its slant
// outside `\textit{…}`, an `\emph` run's slant turned back, marks and symbols too; where none, all its letters'. The typesetter draws the part's style as the base and reads nothing more: its count
// of a translation's characters under the groups decided a weight from the reply's wording (2611.23651v2's kicker drawn
// regular, every glyph of its unit bold). And the unit's own text, the base size's glyphs. Words of our own.
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { StyleGlyph } from '../src/locate/facts.ts'
import { groupStyleOf } from '../src/locate/group-style.ts'

const t = (s: string): Piece => ({ t: 'text', s })
let n = 0
const el = (src: string): Piece & { t: 'el' } => ({ t: 'el', id: `e${n++}`, kind: 'zero', src })
/** a symbol the typesetter draws as text where it stands (`$\uparrow$`): its glyphs its own ink, `symbols` holds them */
const symbols = new Map<string, StyleGlyph[]>()
const sym = (src: string, glyphs: StyleGlyph[]): Piece & { t: 'el' } => {
  const e = el(src)
  symbols.set(e.id, glyphs)
  return e
}
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
const SYMBOLS = 'CMSY9'
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
    (e) => symbols.get(e.id),
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
  it('no letter of its own but its marks: the face TeX set them in, whatever its groups’ (a run’s face is its own glyphs’)', () => {
    // (`\textbf{While} $j \leq n$:` the colon regular; a cell's `\textit{Messi}; \textit{Copa del Rey};` the semicolons
    // upright: read off the letters alone, every letter a group's, the base was the groups' and the marks were drawn bold, italic)
    const bold = [group('\\textbf{', 'bold', [t('While')]), t(' '), el('$j$'), t(':\n')]
    expect(face(bold, [...set('While', BOLD), ...set(':', REGULAR)])).toEqual({ bold: false, italic: false })
    const italic = [
      group('\\textit{', 'italic', [t('Messi')]),
      t('; '),
      group('\\textit{', 'italic', [t('Copa del Rey')]),
      t(';'),
    ]
    const glyphs = [...set('Messi', ITALIC), ...set(';', REGULAR), ...set('Copa del Rey', ITALIC), ...set(';', REGULAR)]
    expect(face(italic, glyphs)).toEqual({ bold: false, italic: false })
  })
  it('a symbol it draws as text where it stands: its glyph’s weight, a math font’s too (the arrow of a table head)', () => {
    // (`\textbf{Mean tokens}~$\downarrow$`: the arrow cmsy's, regular; and inside `\multicolumn{…}{\textbf{Overall}$\uparrow$}`,
    // a group that sets no face, the face around it: regular. Read off the letters alone, the arrows were drawn bold)
    const top = [group('\\textbf{', 'bold', [t('Mean tokens')]), el('~'), sym('$\\downarrow$', set('↓', SYMBOLS))]
    expect(face(top, set('Mean tokens', BOLD))).toEqual({ bold: false, italic: false })
    const multi = [
      group('\\multicolumn{2}{c}{', 'other', [
        group('\\textbf{', 'bold', [t('Overall')]),
        sym('$\\uparrow$', set('↑', SYMBOLS)),
      ]),
    ]
    expect(face(multi, set('Overall', BOLD))).toEqual({ bold: false, italic: false })
  })
  it('a group whose glyphs stand at several sizes states no size of its own: told apart, its style’s size for the caller', () => {
    // (a link in faked small capitals, its capitals at 10 and the rest at 8: the median of them is the size of none of its runs)
    const content = [t('see the '), group('\\href{x}{', 'link', [t('Grand Tour')]), t(' for more')]
    const glyphs = [
      ...set('see the', REGULAR),
      ...set('G', BOLD, 10),
      ...set('rand', BOLD, 8),
      ...set('T', BOLD, 10),
      ...set('our', BOLD, 8),
      ...set('for more', REGULAR),
    ]
    const g = groupStyleOf(content, glyphs).face
    expect(g.groups.map(([id]) => id)).toEqual([(content[1] as { id: string }).id])
    expect(g.several).toEqual([(content[1] as { id: string }).id])
    // (one size: stated, none told apart)
    const one = groupStyleOf(content, [
      ...set('see the', REGULAR),
      ...set('Grand Tour', BOLD, 8),
      ...set('for more', REGULAR),
    ]).face
    expect(one.groups[0]?.[1].size).toBe(8)
    expect(one.several).toEqual([])
  })
  it('its own text: the positions of the letters of no group, a switch’s run at its top level its own', () => {
    const content = [t('Some words '), group('{', 'other', [el('\\small'), t(' set small')]), t(' end')]
    const glyphs = [...set('Some words', REGULAR), ...set('set small', REGULAR, 9), ...set('end', REGULAR)]
    const text = groupStyleOf(content, glyphs).text
    expect(text.map((q) => glyphs[q]!.u).join('')).toBe('Somewordsend')
  })
})
