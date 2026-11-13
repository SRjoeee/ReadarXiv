// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/front.types.ts'

// The author block decided by the source (the owner's ruling of 2026-11-13: text the paper's code ties to the author block
// follows the names option both ways; a region of its own is body text). A note's unit is the block's (`of: 'author'`) where it
// is written inside an author command's argument, or written on its own where the paper's LaTeXML bindings attach it to an
// author; a note of the title or of the document is body. And a stored argument of an author command keeps its role's kind.

type Unit = { kind: string; pieces: { t: string; s?: string }[]; of?: string; held?: boolean; front?: boolean }
const enc = (s: string) => new TextEncoder().encode(s)
const units = (tex: string, files: [string, string][] = []) =>
  openPaper(new Map([['main.tex', enc(tex)], ...files.map(([f, t]) => [f, enc(t)] as [string, Uint8Array])])).units as unknown as Unit[]
const textOf = (u: Unit) =>
  u.pieces
    .filter((x) => x.t === 'text')
    .map((x) => x.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
/** each note's text and the block it is tied to ('-' none) */
const notes = (us: Unit[]) => us.filter((u) => u.kind === 'footnote').map((u) => [textOf(u), u.of ?? '-'])
const doc = (cls: string, pre: string, body = '\\maketitle\nWords of the body here.') =>
  `\\documentclass{${cls}}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`

describe('a note written inside an author command’s argument is the author block’s', () => {
  it('\\author{A\\thanks{n}}, in the preamble and in the body; a \\footnote there too', () => {
    const pre = '\\title{A Paper}\n\\author{Ann Lee\\thanks{Supported by a grant of ours.} \\and Bo Writer\\footnote{Work done elsewhere.}}'
    expect(notes(units(doc('article', pre)))).toEqual([
      ['Supported by a grant of ours.', 'author'],
      ['Work done elsewhere.', 'author'],
    ])
    expect(notes(units(doc('article', '', `${pre}\n\\maketitle\nWords of the body here.`)))).toEqual([
      ['Supported by a grant of ours.', 'author'],
      ['Work done elsewhere.', 'author'],
    ])
  })
  it('in a place’s argument as in a name’s (\\affil: the role table’s author command), but never in the title’s', () => {
    const us = units(doc('article', '\\title{A Paper\\thanks{A note of the title.}}\n\\author{Ann Lee}\n\\affil{Some Institute\\thanks{Now at another one.}}'))
    expect(notes(us).sort()).toEqual([
      ['A note of the title.', '-'],
      ['Now at another one.', 'author'],
    ])
    // (the block's own units are not notes: their kind is their toggle's)
    expect(us.filter((u) => u.kind === 'author' || u.kind === 'affiliation').every((u) => u.of === undefined)).toBe(true)
  })
  it('a \\footnote of the body is the body’s', () => {
    expect(notes(units(doc('article', '\\author{Ann Lee}', '\\maketitle\nWords\\footnote{A note of the body.} here.')))).toEqual([['A note of the body.', '-']])
  })
})

describe('a note written on its own is the block’s where the paper’s bindings attach it to an author', () => {
  it('REVTeX’s \\thanks after \\author{…} annotates the author before it (revtex4_support.sty.ltxml)', () => {
    expect(notes(units(doc('revtex4-2', '\\title{A Paper}\n\\author{Ann Lee}\n\\thanks{Supported by a grant of ours.}')))).toEqual([
      ['Supported by a grant of ours.', 'author'],
    ])
  })
  it('with no author before it, a creator’s note attaches to none: body', () => {
    expect(notes(units(doc('revtex4-2', '\\title{A Paper}\n\\thanks{Supported by a grant of ours.}\n\\author{Ann Lee}')))).toEqual([
      ['Supported by a grant of ours.', '-'],
    ])
  })
  it('amsart’s \\thanks, and the kernel’s, are the document’s (ams_support.sty.ltxml, latex_constructs.pool.ltxml): body', () => {
    for (const cls of ['amsart', 'article', 'acmart'])
      expect(notes(units(doc(cls, '\\title{A Paper}\n\\author{Ann Lee}\n\\thanks{Supported by a grant of ours.}'))), cls).toEqual([
        ['Supported by a grant of ours.', '-'],
      ])
  })
  it('acmart’s \\authornote annotates the author before it (acmart.cls.ltxml)', () => {
    expect(notes(units(doc('acmart', '\\title{A Paper}\n\\author{Ann Lee}\n\\authornote{Both authors contributed equally.}')))).toEqual([
      ['Both authors contributed equally.', 'author'],
    ])
  })
  it('elsarticle’s \\cortext[key]{…} is the block’s where an author’s text requests its label (\\corref{key}), else body', () => {
    expect(notes(units(doc('elsarticle', '\\title{A Paper}\n\\author{Ann Lee\\corref{cor1}}\n\\cortext[cor1]{Corresponding author.}')))).toEqual([
      ['Corresponding author.', 'author'],
    ])
    // (asked for in a line commented out alone: an orphan LaTeXML drops, Base_Utility.pool.ltxml:904-907)
    expect(notes(units(doc('elsarticle', '\\title{A Paper}\n%\\author{Ann Lee\\corref{cor1}}\n\\author{Ann Lee}\n\\cortext[cor1]{Corresponding author.}')))).toEqual([
      ['Corresponding author.', '-'],
    ])
    // (requested after it is written: the whole source is read first)
    expect(notes(units(doc('elsarticle', '\\title{A Paper}\n\\cortext[cor1]{Corresponding author.}\n\\author{Ann Lee\\corref{cor1}}')))).toEqual([
      ['Corresponding author.', 'author'],
    ])
  })
})

describe('an author command’s argument a macro stores keeps its role’s kind', () => {
  it('a class that stores \\icmlaffiliation’s place with \\gdef and sets it once inside a \\footnotetext: an affiliation unit, held, front', () => {
    const sty = [
      '\\newcommand{\\icmlaffiliation}[2]{\\gdef\\@placeone{#2}}',
      '\\newcommand{\\printnotice}{\\footnotetext{\\@placeone. Correspondence to: Ann Lee.}}',
    ].join('\n')
    const us = units(
      doc('article', '\\usepackage{ourconf}\n\\title{A Paper}', '\\author{Ann Lee}\n\\icmlaffiliation{one}{Some Institute of Testing}\n\\maketitle\n\\printnotice\nWords of the body here.'),
      [['ourconf.sty', sty]],
    )
    const stored = us.filter((u) => /Some Institute/.test(textOf(u)))
    expect(stored.map((u) => [u.kind, !!u.held, !!u.front])).toEqual([['affiliation', true, true]])
    // (a command no role table names stores prose as a paragraph's, as before: elsarticle's \biboptions{semicolon})
    const other = units(doc('article', '\\usepackage{ourconf}', '\\ourkeep{Some words kept}\nWords of the body here.'), [['ourconf.sty', '\\newcommand{\\ourkeep}[1]{\\gdef\\@kept{#1}}']])
    expect(other.filter((u) => /Some words/.test(textOf(u))).map((u) => [u.kind, !!u.held])).toEqual([['para', true]])
  })
})
