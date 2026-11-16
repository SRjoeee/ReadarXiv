// @vitest-environment node
// What the instrument states of a bibliography for the wires (format's Unit.entry, el `newblock`; the wire move, F39): a unit the
// source reader makes of a `\bibitem` is a bibliography's entry, and each `\newblock` in it is an element stated `newblock`,
// where a new block of the entry begins; never `silent` (its classes define it as a skip: natbib's, article's and IEEEtran's
// `\hskip .11em plus .33em minus .07em`). A paragraph is no entry, and an element of no `\newblock` states none
import * as PL from '@cantoo/pdf-lib'
import type { Unit as BundleUnit } from '@readarxiv/format'
import { google, unitInOf } from '@readarxiv/translate'
import { scriptedFetch } from '@readarxiv/translate/testing'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { sourceUnitsOf } from '../../packages/engine/src/front.ts'
import { elementKindOf, entryOf, instrumentOf, piecesOf } from '../../packages/engine/src/instrument/instrument.ts'
import { bySentence } from '../../packages/engine/src/locate/words.ts'

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

// (the units the prepare hands out before the compile, front.ts sourceUnitsOf, so that translation starts early, and their final
// twins, the instrument's, share an id: what the source alone tells of a unit is stated on both, so that a translator is sent one
// wire for the two. The instrument here states the paper's units over a blank final pass: no TeX, no mark, the units as the
// source makes them)
// (an entry whose stops are not its blocks: cut by the cutter, it would be cut at every one of them)
const STOPS = String.raw`We cite \cite{s} here.

\begin{thebibliography}{9}
\bibitem{s} J.~Smith and K.~Jones. Learning things. The second sentence of a title.
\newblock In Proceedings. Volume Two. Some Press, 2025.
\end{thebibliography}`

describe('an early entry unit and its final twin', () => {
  it('state `entry` alike, and Google is sent one wire for both: the entry cut at its blocks alone', async () => {
    const p = open({ 'main.tex': doc(STOPS) })
    const blank = await PL.PDFDocument.create()
    blank.addPage([612, 792])
    const { instrument } = await instrumentOf({
      paper: p as never,
      finalPdf: await blank.save({ useObjectStreams: false }),
      options: { engine: 'pdflatex' },
      log: '',
      pdfjs: { getDocument, OPS } as never,
      documentOptions: { verbosity: 0 },
    })
    const g = google({ fetch: scriptedFetch(() => ({ status: 200, body: '[]' })).fetch })
    const early = sourceUnitsOf(p as never).filter((u) => u.kind === 'reference')
    expect(early.length).toBe(1)
    for (const u of early) {
      const twin = instrument.units.find((x) => x.id === u.id)
      if (!twin) throw new Error(`no final twin of ${u.id}`)
      // (the twin as the bundle states it, bundle.ts: its sentences by its kind, its entry)
      const final: BundleUnit = {
        id: twin.id,
        kind: twin.kind,
        content: twin.content,
        ...(!twin.kept && bySentence(twin.kind, !!twin.figure) ? { sentences: true as const } : {}),
        ...(twin.entry ? { entry: true as const } : {}),
      }
      expect(final.entry).toBe(true)
      expect(g.write(unitInOf(u), 'zh-Hans')).toBe(g.write(unitInOf(final), 'zh-Hans'))
      expect(u.entry).toBe(final.entry)
    }
    // (its second block, a boundary marker before it, none at the title's or the venue's stops)
    expect([...g.write(unitInOf(early[0] as BundleUnit), 'zh-Hans').matchAll(/<x id="\d+"\/>/g)].length).toBe(1)
  })
})
