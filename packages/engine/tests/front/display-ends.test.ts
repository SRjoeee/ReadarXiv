// @vitest-environment node
// Where a display a paper sets through a macro of its own ends in its source (docs/PDF-READER.md §18.95): the source reader states it
// on the placeholder it makes (`closes`, not enumerable: no unit's hash, mark or JSON moves), from what it already reads of the
// paper's definitions: a macro that begins a display environment, the block it bounds ending where its partner that ends the
// environment begins (`\be … \ee`); a macro whose body holds a display environment ending with one of its parameters
// (`\newcommand{\al}[1]{\begin{align}{#1}\end{align}}`), the display ending where that argument ends. The instrument reads a stated
// display's stop there, as it reads a spelled one's before its `\end{…}` (stateDisplays, displayStop). Each with a full stop, a
// comma and none; a spelled display, and a paper's closing macro that closes no display, as before. Read through the source reader's
// public reading (loadProject), on sources of our own
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { stateDisplays } from '../../src/instrument/instrument.ts'
import { inMemory, loadProject } from '../../src/source/latex-front.ts'

type SrcPiece = { t: string; s?: string; src?: string; closes?: number }
const enc = (s: string) => new TextEncoder().encode(s)
const PREAMBLE = String.raw`\usepackage{amsmath}
\newcommand{\be}{\begin{equation}}
\newcommand{\ee}{\end{equation}}
\newcommand{\al}[1]{\begin{align}{#1}\end{align}}
\newcommand{\bq}{\begin{quote}}
\newcommand{\eq}{\end{quote}}`
const unitsOf = (body: string) =>
  loadProject(
    inMemory(new Map([['main.tex', enc(`\\documentclass{article}\n${PREAMBLE}\n\\begin{document}\n${body}\n\\end{document}\n`)]])),
    'main.tex',
  ).units as unknown as { pieces: SrcPiece[] }[]
/** the stop the instrument states for the placeholder whose source begins with `head`, stated a display by TeX */
function stopOf(body: string, head: string): string | undefined {
  for (const u of unitsOf(body)) {
    const k = u.pieces.findIndex((p) => p.t === 'ph' && p.src?.startsWith(head))
    if (k < 0) continue
    const content: Piece[] = [{ t: 'el', id: String(k), kind: 'macro', src: u.pieces[k]!.src! }]
    stateDisplays(content, new Set([String(k)]), u.pieces as never, new Map())
    return (content[0] as { stop?: string }).stop
  }
  throw new Error(`no placeholder begins ${head}`)
}
const para = (display: string) => `The weights we keep are summed as\n${display}\nwhere every weight is read once.`

describe("a display a paper's macro sets: its stop where its source ends it", () => {
  it('reads it before the paper\'s macro that ends the environment (`\\be … \\ee`): a full stop, a comma, none', () => {
    expect(stopOf(para('\\be\nw = a + b .\n\\ee'), '\\be')).toBe('.')
    expect(stopOf(para('\\be\nw = a + b,\n\\label{e1}\n\\ee'), '\\be')).toBe(',')
    expect(stopOf(para('\\be\nw = a + b\n\\ee'), '\\be')).toBe(undefined)
  })
  it("reads it before the argument's end where the macro's body ends the display with it (`\\al{…}`): a full stop, a comma, none", () => {
    expect(stopOf(para('\\al{\nx &= y + z \\\\\ny &= 2 z .\n}'), '\\al')).toBe('.')
    expect(stopOf(para('\\al{\nx &= y + z, \\\\\ny &= 2 z,\n}'), '\\al')).toBe(',')
    expect(stopOf(para('\\al{\nx &= y + z \\\\\ny &= 2 z\n}'), '\\al')).toBe(undefined)
  })
  it('reads a spelled display as before, and states nothing where a closing macro ends no display', () => {
    expect(stopOf(para('\\begin{equation}\nw = a + b,\n\\end{equation}'), '\\begin{equation}')).toBe(',')
    const us = unitsOf('A quoted line follows.\n\\bq\nThe quote ends here.\n\\eq\nThe text goes on.')
    const pieces = us.flatMap((u) => u.pieces)
    expect(pieces.filter((p) => p.t === 'ph' && p.closes !== undefined)).toEqual([])
    expect(pieces.some((p) => p.t === 'text' && /The quote ends here\./.test(p.s ?? ''))).toBe(true)
  })
  it("states the end on the placeholder alone, never in the unit's own fields", () => {
    const [u] = unitsOf(para('\\be\nw = a + b .\n\\ee'))
    const p = u!.pieces.find((q) => q.t === 'ph' && q.src?.startsWith('\\be'))!
    expect(p.src!.slice(0, p.closes)).toBe('\\be\nw = a + b .\n')
    expect(Object.keys(p)).toEqual(['t', 'src'])
  })
})
