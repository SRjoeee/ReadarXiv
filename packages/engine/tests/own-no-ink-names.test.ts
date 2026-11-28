// A name of the marking's no-ink lists the paper itself defines is read by its definition, never by its spelling (PDF-READER
// §18.122). The marking reads a placeholder by its spelling (marks.ts classOf: INVISIBLE, the role table's textless): `\index`, a
// size switch, `\newblock` get no mark and no question to TeX, and the class table reads them as drawing nothing (layer1.ts phClass
// `zero`). A paper that defines one of them to print a glyph had that glyph erased under the translation and drawn by nothing.
// Such a name is asked of TeX as any paper's macro is (the ink section, inkSamples): where TeX answers it sets no ink, it is
// stated empty and everything is as before; where it answers ink, it is marked and its ink found. Whether it reads what follows
// it is the definition's, where the source reader reads it (the source reader's statement on the piece, PhPiece.own): one of no
// parameter reads nothing, as the kernel's name; one that takes a parameter may look ahead; one the reader cannot read (defined
// inside another definition's body) keeps the kernel's name's reading. Content of our own, through the source reader (openPaper)
// and the marking's and the instrument's own readings of its units.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { classesOf, elementKindOf, inklessPieces } from '../src/instrument/instrument.ts'
import { classOf, INK_BUDGET, inkSamples, looksAhead } from '../src/marks/marks.ts'
import { paperOf } from '../src/source/arg-roles.ts'
import { texFilesOf } from '../src/source/latex-front.ts'

const enc = (s: string) => new TextEncoder().encode(s)
type Ph = { t: string; s?: string; src?: string }
const WORDS = 'Our own words of a paragraph, long enough to be a unit of its own,'

/** a document's units and, for the placeholder whose source begins so (the first unit holding one), the marking's and the
 *  instrument's readings of it: its class, whether it may read what follows it, whether the ink section asks it, its class in
 *  the part, and whether it is stated empty (with TeX's answer `inkless`, the marking's) */
function read(body: string, preamble = '', files: [string, string][] = [], inkless: string[] | null = null) {
  const paper = openPaper(
    new Map([
      ['main.tex', enc(`\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)],
      ...files.map(([f, t]): [string, Uint8Array] => [f, enc(t)]),
    ]),
  )
  const units = paper.units as { kind: string; pieces: Ph[] }[]
  const asked = new Set(inkSamples(paper.units))
  const told = inkless === null ? null : new Set(inkless)
  const classes = units.map((u) => new Map(classesOf(u.pieces as never, null, null, null, told)))
  const own = paperOf(texFilesOf(paper.fsys, paper.meta.main!)).own
  const empty = new Set(
    inklessPieces(units as never, { classes: classes as never, inkless, own }).map((x) => `${x.unit}|${x.piece}`),
  )
  const at = (begins: string) => {
    for (const [i, u] of units.entries()) {
      const k = u.pieces.findIndex((p) => p.t === 'ph' && (p.src ?? '').startsWith(begins))
      if (k < 0) continue
      const p = u.pieces[k]!
      return {
        marking: classOf(p as never),
        looks: looksAhead(p as never),
        asked: asked.has(p.src!),
        cls: classes[i]!.get(String(k))?.cls,
        empty: empty.has(`${i}|${k}`),
        kind: elementKindOf(p as never),
      }
    }
    return null
  }
  return { units, at }
}

describe('a name of the no-ink lists the paper defines is asked of TeX', () => {
  it('a size switch the paper defines with no parameter: the paper’s macro, asked, reading nothing after it', () => {
    const r = read(
      `${WORDS} with a switch \\footnotesize standing in it.`,
      '\\renewcommand{\\footnotesize}{\\textsection}\n',
    )
    expect(r.at('\\footnotesize')).toMatchObject({ marking: 'macro', looks: false, asked: true, cls: 'umacro' })
  })

  it('an \\index the paper defines with a parameter: asked, and it may read what follows it', () => {
    const r = read(`${WORDS} with an entry\\index{entry} in it.`, '\\renewcommand{\\index}[1]{\\textdagger}\n')
    expect(r.at('\\index')).toMatchObject({ marking: 'macro', looks: true, asked: true, cls: 'other' })
  })

  it('a \\def with a delimited parameter text reads what follows it', () => {
    const r = read(`${WORDS} with a switch \\footnotesize standing in it.`, '\\def\\footnotesize#1.{\\textsection}\n')
    expect(r.at('\\footnotesize')).toMatchObject({ marking: 'macro', looks: true, asked: true })
  })

  it('a name defined inside another definition’s body (in a file of the paper): asked, the kernel name’s reading of what follows', () => {
    const sty = '\\ProvidesPackage{ours}\n\\newcommand{\\oursmall}{\\def\\footnotesize{\\textsection}}\n'
    const r = read(`${WORDS} with a switch \\footnotesize standing in it.`, '\\usepackage{ours}\n', [['ours.sty', sty]])
    expect(r.at('\\footnotesize')).toMatchObject({ marking: 'macro', looks: false, asked: true, cls: 'umacro' })
  })

  it('TeX answered it sets no ink: stated empty, and its class the table’s, as before', () => {
    const r = read(
      `${WORDS} with a switch \\footnotesize standing in it.`,
      '\\renewcommand{\\footnotesize}{\\small}\n',
      [],
      ['\\footnotesize'],
    )
    expect(r.at('\\footnotesize')).toMatchObject({ marking: 'macro', looks: false, cls: 'zero', empty: true })
  })

  it('TeX answered nothing of it (the marking’s answers given, its source not among the inkless): an inked class, never stated empty', () => {
    const r = read(
      `${WORDS} with a switch \\footnotesize standing in it.`,
      '\\renewcommand{\\footnotesize}{\\textsection}\n',
      [],
      [],
    )
    expect(r.at('\\footnotesize')).toMatchObject({ marking: 'macro', cls: 'umacro', empty: false })
  })

  it('past the ink section’s budget: not asked, an inked class, never stated empty (its unit held where its ink is not found)', () => {
    // (a command whose call fills the budget first: the body's samples in the paper's order)
    const long = `\\longer{${'x'.repeat(INK_BUDGET - 10)}}`
    const r = read(
      `${WORDS} with ${long} first.\n\n${WORDS} with a switch \\footnotesize standing in it.`,
      '\\renewcommand{\\footnotesize}{\\textsection}\n',
      [],
      [],
    )
    expect(r.at('\\footnotesize')).toMatchObject({ marking: 'macro', asked: false, cls: 'umacro', empty: false })
  })
})

describe('what a translator is told of such a name: its spelling’s kind, whatever TeX answers', () => {
  // (the element's kind is the translator's statement of the unit (format's askedOf hashes it) and a sentence cutter's reading of
  // it, `other` an element that sets no word; the source's units are told it before any compile (front.ts sourceUnitsOf), so it
  // cannot be TeX's answer: it stays the spelling's, as before the rule, and only the layout reads the definition)
  it('a size switch, a separator, an \\index and a \\label the paper defines are `other` to the translator, as before', () => {
    const switched = read(
      `${WORDS} with a switch \\footnotesize standing in it.`,
      '\\renewcommand{\\footnotesize}{\\textsection}\n',
    )
    expect(switched.at('\\footnotesize')).toMatchObject({ marking: 'macro', kind: 'other' })
    const indexed = read(`${WORDS} with an entry\\index{entry} in it.`, '\\renewcommand{\\index}[1]{\\textdagger}\n')
    expect(indexed.at('\\index')).toMatchObject({ marking: 'macro', kind: 'other' })
    const labelled = read(`${WORDS} with a label\\label{here} in it.`, '\\renewcommand{\\label}[1]{}\n')
    expect(labelled.at('\\label')).toMatchObject({ marking: 'macro', kind: 'other' })
    const sty = '\\ProvidesPackage{ours}\n\\newcommand{\\oursmall}{\\def\\footnotesize{\\textsection}}\n'
    const inner = read(`${WORDS} with a switch \\footnotesize standing in it.`, '\\usepackage{ours}\n', [
      ['ours.sty', sty],
    ])
    expect(inner.at('\\footnotesize')).toMatchObject({ marking: 'macro', kind: 'other' })
  })

  it('the same names the paper does not define are `other` too (the control)', () => {
    expect(read(`${WORDS} with a switch \\footnotesize standing in it.`).at('\\footnotesize')).toMatchObject({
      kind: 'other',
    })
    expect(read(`${WORDS} with an entry\\index{entry} in it.`).at('\\index')).toMatchObject({ kind: 'other' })
  })

  it('a paper’s macro of a name no list holds stays `macro` to the translator', () => {
    expect(
      read(`${WORDS} with \\ours standing in it.`, '\\newcommand{\\ours}{\\textsection}\n').at('\\ours'),
    ).toMatchObject({
      marking: 'macro',
      kind: 'macro',
    })
  })
})

describe('what keeps its reading (controls)', () => {
  it('a size switch the paper does not define: no mark, no question, drawn as nothing', () => {
    const r = read(`${WORDS} with a switch \\footnotesize standing in it.`)
    expect(r.at('\\footnotesize')).toMatchObject({ marking: null, looks: false, asked: false, cls: 'zero' })
  })

  it('an \\index the paper does not define: no mark, no question, stated empty', () => {
    const r = read(`${WORDS} with an entry\\index{entry} in it.`, '\\usepackage{makeidx}\n', [], [])
    expect(r.at('\\index')).toMatchObject({ marking: null, looks: false, asked: false, empty: true })
  })

  it('a forced break stays a forced break, whatever the paper defines', () => {
    const r = read(`${WORDS} with a break\\\\ there and more words.`, '\\let\\oldcr\\\\\n')
    expect(r.at('\\\\')).toMatchObject({ marking: null, looks: false, asked: false })
  })

  it('a name the marking gives a class keeps it: the paper’s own \\cite stays a citation', () => {
    const r = read(`${WORDS} with a citation \\cite{a} in it.`, '\\renewcommand{\\cite}[1]{\\textsuperscript{#1}}\n')
    expect(r.at('\\cite')).toMatchObject({ marking: 'cite' })
  })

  it('a prefix the paper defines (\\protect) still applies to the token after it: nothing of ours between them', () => {
    const r = read(`${WORDS} with \\protect\\ref{a} in it.`, '\\def\\protect{\\noexpand\\protect\\noexpand}\n')
    expect(r.at('\\protect')).toMatchObject({ looks: true })
  })

  it('a paper’s macro of a name no list holds keeps its reading: it may read what follows it', () => {
    const r = read(`${WORDS} with our \\sys{} in it.`, '\\newcommand{\\sys}{SysName}\n')
    expect(r.at('\\sys')).toMatchObject({ marking: 'macro', looks: true, asked: true })
  })
})
