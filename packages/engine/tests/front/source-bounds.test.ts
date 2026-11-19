// @vitest-environment node
// The source reader's four bounds on its own work, each fed the input that reaches it, on sources of our own: a display's
// stop read past at most 64 things at its end (instrument/mt.ts displayStop); a kept argument followed at most four calls down
// (source/latex-front.ts resolveKeeps); a macro's body's groups taken off at most 20 levels deep (setsWords); a macro's call
// walked as the command its body ends in at most four macros in a row (the walk's goOn). Each bound's other side is an input TeX
// takes (no limit of TeX's is met at these depths); what each bound states past it is what the reader does there, held here
import { describe, expect, it } from 'vitest'
import { displayStop } from '../../src/instrument/mt.ts'
import { inMemory, loadProject } from '../../src/source/latex-front.ts'

type SrcPiece = { t: string; s?: string; src?: string }
type SrcUnit = { kind: string; pieces: SrcPiece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const unitsOf = (files: Record<string, string>) =>
  loadProject(inMemory(new Map(Object.entries(files).map(([f, t]) => [f, enc(t)]))), 'main.tex')
    .units as unknown as SrcUnit[]
const paper = (preamble: string, body: string, cls = 'article') =>
  `\\documentclass{${cls}}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`
const textOf = (u: SrcUnit) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

describe("a display's stop: read past at most 64 things at its end (displayStop)", () => {
  const ending = (n: number) => `\\begin{equation}\nx = y.${'\\label{e}'.repeat(n - 1)}\\end{equation}`
  it('reads it past 64, and not past 65 (labels and the display\'s own end)', () => {
    expect(displayStop(ending(64))).toBe('.')
    expect(displayStop(ending(65))).toBe(null)
  })
})

describe('a kept argument: followed at most four calls down (resolveKeeps)', () => {
  /** a package that stores \\name's text as LaTeX's \\author does, through `depth` calls of helpers that each hand it on, the
   *  last storing it in the macro its second argument names; its title command sets \\@name in the author block's tabular */
  const sty = (depth: number) => {
    const helpers = Array.from({ length: depth }, (_, k) => `keep${String.fromCharCode(97 + k)}`)
    return [
      '\\def\\maketitle{\\par\\begingroup\\@maketitle\\endgroup}',
      '\\def\\@maketitle{\\begin{center}{\\large \\begin{tabular}[t]{c}\\@name \\\\ \\@address\\end{tabular}\\par}\\end{center}}',
      `\\def\\name#1{\\${helpers[0]}{#1}{\\@name}}`,
      ...helpers.slice(0, -1).map((h, k) => `\\def\\${h}#1#2{\\${helpers[k + 1]}{#1}{#2}}`),
      `\\def\\${helpers.at(-1)}#1#2{\\xdef#2{#1}}`,
      '\\def\\address#1{\\gdef\\@address{#1}}',
    ].join('\n')
  }
  const names = (depth: number) =>
    unitsOf({
      'main.tex': paper('\\usepackage{own}\n\\name{Alice Smith}\n\\address{University of Somewhere}', '\\maketitle\nWords of the body.'),
      'own.sty': sty(depth),
    })
      .filter((u) => u.kind === 'author')
      .map(textOf)
  it('an author block\'s command whose text a helper stores four calls down is of the block; five calls down, it is not', () => {
    expect(names(4)).toEqual(['Alice Smith'])
    expect(names(5)).toEqual([])
  })
})

describe("a macro's body's groups: taken off at most 20 levels deep (setsWords)", () => {
  /** a macro whose body's words stand in a group that holds `inner` more levels of groups, beside its argument */
  const call = (inner: number) =>
    unitsOf({
      'main.tex': paper(
        `\\newcommand{\\nb}[1]{{Note ${'{'.repeat(inner)}${'}'.repeat(inner)}}#1}`,
        'We read \\nb{the words of it} here.',
      ),
    })
  it('a word in a group 20 deep is no word of the body; one in a group 21 deep is', () => {
    const at20 = call(19)
    const at21 = call(20)
    expect(at20.map(textOf)).toEqual(['We read the words of it here.'])
    expect(at21.map(textOf)).toEqual(['We read here.'])
    expect(at21[0]!.pieces.filter((p) => p.t === 'ph').map((p) => p.src)).toEqual([
      `\\nb{the words of it}`,
    ])
  })
})

describe('a call walked as the command its body ends in: at most four macros in a row (goOn)', () => {
  /** `n` macros of the paper's, each taking a number and ending in the next, the last in \\chapter */
  const chain = (n: number) => {
    const names = Array.from({ length: n }, (_, k) => `step${String.fromCharCode(97 + k)}`)
    return names
      .map((m, k) => `\\newcommand{\\${m}}[1]{\\setcounter{chapter}{#1}\\${names[k + 1] ?? 'chapter'}}`)
      .join('\n')
  }
  const kinds = (n: number) =>
    unitsOf({
      'main.tex': paper(chain(n), `Words before it.\n\n\\stepa${'{1}'.repeat(n)}{The Title}\n\nWords after it.`, 'book'),
    }).map((u) => [u.kind, textOf(u)])
  it('four in a row: the group after the calls is the chapter\'s title; five: it is read as it stands, a paragraph', () => {
    expect(kinds(4)).toEqual([
      ['para', 'Words before it.'],
      ['heading', 'The Title'],
      ['para', 'Words after it.'],
    ])
    expect(kinds(5)).toEqual([
      ['para', 'Words before it.'],
      ['para', 'The Title'],
      ['para', 'Words after it.'],
    ])
  })
})
