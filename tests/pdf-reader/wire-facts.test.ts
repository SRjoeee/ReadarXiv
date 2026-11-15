// What the instrument states of a bibliography for the wires (format's Unit.entry, el `newblock`; the wire move, F39): a unit the
// source reader makes of a `\bibitem` is a bibliography's entry, and each `\newblock` in it is an element stated `newblock`,
// where a new block of the entry begins; never `silent` (its classes define it as a skip: natbib's, article's and IEEEtran's
// `\hskip .11em plus .33em minus .07em`). A paragraph is no entry, and an element of no `\newblock` states none
import { describe, expect, it } from 'vitest'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { elementKindOf, entryOf, piecesOf } from '../../packages/engine/src/instrument/instrument.ts'

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; file: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))
const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
type El = { t: 'el'; id: string; src: string; newblock?: 1; silent?: 1 }
const elsOf = (ps: readonly { t: string; content?: unknown[] }[]): El[] =>
  ps.flatMap((p) => (p.t === 'el' ? [p as unknown as El] : p.t === 'span' ? elsOf((p.content ?? []) as never) : []))

const BIB = String.raw`We cite \cite{a} here.

\begin{thebibliography}{9}
\bibitem{a} A.~Author and B.~Writer.
\newblock A study of things.
\newblock In \emph{Proc. of a Venue}, pages 1--10, 2020.

\bibitem{b} C.~Writer.
\newblock One part alone, 2021.
\end{thebibliography}`

describe('a bibliography entry and its blocks, as the instrument states them', () => {
  const p = open({ 'main.tex': doc(BIB) })
  const entries = units(p).filter((u) => entryOf(u as never))
  it('states each unit the source reader makes of a \\bibitem an entry, and a paragraph none', () => {
    expect(entries.length).toBe(2)
    expect(entries.every((u) => u.kind === 'reference')).toBe(true)
    expect(units(p).filter((u) => u.kind === 'para').some((u) => entryOf(u as never))).toBe(false)
  })
  it('states each \\newblock of an entry `newblock`, never `silent`, and no other element so', () => {
    const [a] = entries
    const els = elsOf(piecesOf(a!.pieces as never, { kindOf: elementKindOf }) as never)
    const blocks = els.filter((e) => e.newblock)
    expect(blocks.map((e) => e.src)).toEqual(['\\newblock', '\\newblock'])
    expect(blocks.every((e) => e.newblock === 1 && !e.silent)).toBe(true)
    expect(els.filter((e) => !/^\\newblock/.test(e.src)).some((e) => e.newblock)).toBe(false)
  })
})
