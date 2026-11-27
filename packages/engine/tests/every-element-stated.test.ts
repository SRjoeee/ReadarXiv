// An element TeX sets no ink for, by the marking's own reading, is stated empty by the instrument too. The marking (marks.ts
// classOf) gives no mark to a placeholder it reads as setting no ink by TeX's own tables: one of TeX's and LaTeX's control words
// that set none (INVISIBLE: `\index`, `\label`, `\color`, the phantoms, a skip, a kern…) or one the role table proves can set no
// letters (source/arg-roles.ts textless: a register's or a length's setting, a definition). Such a piece has no point, so no
// compile states its places. Where the element's class is one the reading draws from its ink (an `\index{…}` or a
// `\color[HTML]{…}` the class table reads as `other`), the instrument stated it nothing: its element was neither found nor
// stated empty, and the typesetter left its unit unproven, the original's (lay/read.ts: an inked element whose ink was not
// found may have been erased with the text and drawn by nothing). The instrument read only a text macro of the marking's null
// so (inklessPieces). One classification for both readers now: what the marking reads as setting no ink is stated empty,
// whatever class the element carries. What `unproven` protects is untouched: a paper's own macro, a formula, a rule the
// probe asks about, an alignment's tab (a table's rows read as prose, laid as prose over a table) keep their statements.
// Content of our own, through the source reader (openPaper) and the instrument's own reading of its units (classesOf,
// inklessPieces), as instrumentOf calls them.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { classesOf, elementKindOf, inklessPieces } from '../src/instrument/instrument.ts'
import { classOf } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
type Ph = { t: string; s?: string; src?: string }
/** a document's units, each unit's classes as the instrument reads them, and the pieces it states empty (by `unit|piece`) */
function stated(body: string, preamble = '') {
  const units = openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)]]),
  ).units as { kind: string; pieces: Ph[] }[]
  const classes = units.map((u) => new Map(classesOf(u.pieces as never)))
  const empty = new Set(inklessPieces(units as never, { classes: classes as never }).map((x) => `${x.unit}|${x.piece}`))
  /** the placeholder whose source begins so, in the first unit holding one: its class, kind and whether it is stated empty */
  const at = (begins: string) => {
    for (const [i, u] of units.entries()) {
      const k = u.pieces.findIndex((p) => p.t === 'ph' && (p.src ?? '').startsWith(begins))
      if (k < 0) continue
      const p = u.pieces[k]!
      return {
        marking: classOf(p as never),
        cls: classes[i]!.get(String(k))?.cls,
        kind: elementKindOf(p as never),
        empty: empty.has(`${i}|${k}`),
      }
    }
    return null
  }
  return { units, at }
}
const WORDS = 'Our own words of a paragraph, long enough to be a unit of its own,'

describe('an element the marking reads as setting no ink is stated empty by the instrument', () => {
  it('an \\index in a paragraph is stated empty', () => {
    const r = stated(
      `${WORDS} with an entry\\index{entry!of ours} in it and more words after it.`,
      '\\usepackage{makeidx}\n',
    )
    expect(r.at('\\index')).toMatchObject({ marking: null, cls: 'other', empty: true })
  })

  it('a \\color declaration with a model in a paragraph is stated empty', () => {
    const r = stated(
      `${WORDS} {\\color[HTML]{3366AA} red words of ours} and more words after it.`,
      '\\usepackage{xcolor}\n',
    )
    expect(r.at('\\color')).toMatchObject({ marking: null, cls: 'other', empty: true })
  })

  it('a \\color declaration the class table reads as setting nothing is stated empty too (no other reading moves)', () => {
    const r = stated(`${WORDS} {\\color{red} red words of ours} and more words after it.`, '\\usepackage{xcolor}\n')
    expect(r.at('\\color')).toMatchObject({ marking: null, cls: 'zero' })
  })
})

describe('what keeps its statement (controls)', () => {
  it('a paper’s macro of no found ink is not stated empty: TeX may set glyphs for it, which only its probe tells', () => {
    const r = stated(`${WORDS} with our \\sys{} in it and more words after it.`, '\\newcommand{\\sys}{SysName}\n')
    expect(r.at('\\sys')).toMatchObject({ marking: 'macro', empty: false })
  })

  it('an alignment tab is not stated empty: a table read as prose would be laid as prose over a table', () => {
    const r = stated(
      '\\begin{deluxetable}{lc}\n\\startdata\nOur own words in a row & 12 \\\\\nMore words in a row & 13\n\\enddata\n\\end{deluxetable}',
      '\\newenvironment{deluxetable}[1]{}{}\\newcommand{\\startdata}{}\\newcommand{\\enddata}{}\n',
    )
    expect(r.at('&')).toMatchObject({ marking: null, cls: 'other', empty: false })
  })

  it('a \\rule in a box stays asked: TeX’s ink section says whether it is a strut or a bar', () => {
    const r = stated(`${WORDS} with a square \\mbox{\\rule{1ex}{1ex}} of ours and more words after it.`)
    expect(r.at('\\rule')).toMatchObject({ marking: 'macro', empty: false })
  })

  it('a tie and a forced break keep their kinds', () => {
    const r = stated(`${WORDS} with a tie~here and a break\\\\ there and more words after it.`)
    expect(r.at('~')).toMatchObject({ kind: 'space', cls: 'space', empty: false })
    expect(r.at('\\\\')).toMatchObject({ kind: 'break', empty: false })
  })

  it('a paper’s own \\index that sets its argument is no placeholder: its words are the unit’s text', () => {
    const r = stated(
      `${WORDS} with an entry\\index{shown} in it and more words after it.`,
      '\\renewcommand{\\index}[1]{#1}\n',
    )
    expect(r.at('\\index')).toBeNull()
  })

  it('a register’s setting the marking reads as a paper’s macro (a skip read with it) is not stated empty', () => {
    // (the source reader keeps `\looseness=-1 \vspace` one placeholder: the marking reads it as a macro, asked, not as textless)
    const r = stated(
      `${WORDS} and more words after it.\\looseness=-1 \\vspace{1pt}\n\nAnother paragraph of ours, long enough.`,
    )
    expect(r.at('\\looseness')).toMatchObject({ marking: 'macro', empty: false })
  })
})
