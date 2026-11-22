// A piece first in the paragraph TeX resumes after a display (2601.06943v2 p5: a `\[ … \]`, then an `\autoref` on the next line).
// LAYOUT_TEX's \axtpma sets no point on the empty list TeX resumes the paragraph with after a display (marks.ts \axt@pmc: a mark
// there would keep the empty paragraph between two displays a line, and would end the \ignorespaces amsmath's \] began before a
// macro that sets nothing); a display has no closing mark (\axtpm sets none there either). So the reference after the display
// had no opening point, its closing point alone, and the display's opening point alone found as its next mark that closing point,
// no mark of its unit's next ones: the marking says an unmarked visible piece follows it (followsOf `blocked`), and the stream's
// reading owns it nothing ('open, an unmarked piece follows'). Both pieces' ink was then read as the unit's text, the locate
// counted more letters in it than its source writes (place.ts `text past its source`), and the whole paragraph stayed the
// original's, its row answered and never drawn. An inline formula there has had its opening mark set on that empty list since the
// LOST survey (\axtpmm: its math node follows the mark at once, so no line is made and no space is skipped); a piece of a class
// whose commands always set ink is the same case. The marked compile's stream as B ships it is written here (each glyph 5 pt wide
// at 10 pt), in content of our own.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { openPaper, originalFiles } from '../src/compile/live.ts'
import { END_TEX, LINES_TEX } from '../src/compile/tex.ts'
import {
  ASK_TEX,
  CALL_TEX,
  CARRY_END_TEX,
  CARRY_TEX,
  carrySamples,
  classNamesTex,
  DVI_LAYOUT_TEX,
  followsOf,
  LAYOUT_TEX,
  LAYOUT_TEX_REDUCED,
  layoutMarking,
  MARK_CLASSES,
  NAMES_TEX,
  refsTex,
  regionsTex,
  STATEMENTS_TEX,
} from '../src/marks/marks.ts'
import { DVI_MARK_DEF, MARK_DEF } from '../src/source/latex-front.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

/** every placeholder's source of a unit, as TeX's display probe answers for a piece that opens no display (marks.ts
 *  carrySamples, readDisplayProbe) */
const quietOf = (u: SourceUnit<null>): string[] =>
  (u.pieces as { t: string; src?: string }[]).flatMap((p) => (p.t === 'ph' && p.src ? [p.src] : []))
type Item = string | { at: string }
/** a page from items in stream order: a string is glyphs on the current line (a space 3 pt, `\n` the next line 12 pt down),
 *  `{ at }` a point */
function pageOf(items: readonly Item[]): StreamPage {
  const glyphs: Glyph[] = [],
    points: { name: string; glyph: number; box: number }[] = [],
    boxAt: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') x += 3
        else if (u === '\n') {
          x = 72
          y -= 12
        } else {
          glyphs.push({
            u,
            x0: x,
            x1: x + 5,
            y,
            top: y + 7,
            bottom: y - 2,
            size: 10,
            font: 'F',
            ix0: x,
            ix1: x + 5,
          } as Glyph)
          boxAt.push(0)
          x += 5
        }
      }
    } else points.push({ name: it.at, glyph: glyphs.length, box: 0 })
  }
  return {
    glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }),
    boxes: [],
    points,
    boxAt: Int32Array.from(boxAt),
    view: [0, 0, 612, 792],
  } as StreamPage
}
const unit = (kind: string, pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
  file: null,
  kind,
  start: 0,
  end: 0,
  pieces,
})
/** unit 1: text, a display, the line end after it, a reference first in the paragraph TeX resumes, the text after it */
const PARA = unit('para', [
  { t: 'text', s: 'We define ' },
  { t: 'ph', src: '\\[ a = b \\]' },
  { t: 'text', s: '\n' },
  { t: 'ph', src: '\\autoref{f}' },
  { t: 'text', s: '(b) shows it.' },
])
const UNITS = [unit('para', []), PARA]
/** the column's body as B ships the paragraph: its start, its first line, the display's opening point and its row, then the
 *  paragraph's next line, where the reference's ink "Figure 3" begins it; `open` the reference's opening point there */
const STREAM = (open: boolean): Item[] => [
  { at: 'bs1' },
  { at: '1s' },
  'We define',
  { at: 'p1.1a' },
  '\na = b\n',
  ...(open ? [{ at: 'p1.3a' }] : []),
  'Figure 3',
  { at: 'p1.3b' },
  '(b) shows it.',
  { at: '1e' },
  { at: 'be1' },
]
/** what each piece owns, as the marking and the stream read it: its glyphs, or its how, or null for no entry */
function owned(items: readonly Item[]): Record<string, string | null> {
  const page = pageOf(items)
  const follows = followsOf(UNITS as never, new Set(page.points.map((p) => p.name)))
  const out = ownedOf([page], { follows, erasure: true })
  const of = (name: string) => {
    const e = out.get(name)
    if (!e) return null
    return e.how < OWNED ? e.glyphs.map(([, g]) => page.glyphs.u[g]).join('') : (OWNED_HOW[e.how] as string)
  }
  return { display: of('p1.1a'), reference: of('p1.3a') }
}

describe('a piece first in the paragraph TeX resumes after a display: the reading of the stream', () => {
  it('with no opening point for the piece, the display owns nothing and the piece is no entry (the paragraph LOST)', () => {
    const page = pageOf(STREAM(false))
    expect(followsOf(UNITS as never, new Set(page.points.map((p) => p.name)))('p1.1a')).toMatchObject({
      display: true,
      want: '',
      ends: ['p1.3a', '1e', 't1e', 'h1e'],
      blocked: true,
      through: null,
    })
    expect(owned(STREAM(false))).toEqual({ display: 'open, an unmarked piece follows', reference: null })
  })

  it("with the piece's opening point set where TeX resumes the paragraph, the display owns its row and the piece its ink", () => {
    expect(owned(STREAM(true))).toEqual({ display: 'a=b', reference: 'Figure3' })
  })
})

describe('a piece first in the paragraph TeX resumes after a display: its opening mark', () => {
  const opening = (u: SourceUnit<null>, k: number) =>
    (
      layoutMarking([u] as unknown as SourceUnit[], MARK_CLASSES, { lines: false, quiet: quietOf(u) }).units[0]!
        .pieces as {
        t: string
        src?: string
      }[]
    )
      .map((p) => (p.t === 'ph' ? (p.src ?? '') : ''))
      .find((s) => new RegExp(`\\{[pn]0\\.${k}a\\}$`).test(s))
  const after = (src: string) =>
    unit('para', [
      { t: 'text', s: 'We define ' },
      { t: 'ph', src: '\\[ a = b \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src },
      { t: 'text', s: ' shows it.' },
    ])
  const command = (src: string) => opening(after(src), 3)?.replace(/\{.*$/, '')

  it('every piece that is no display, whatever its class and whether it sets ink: \\axtpmd, its point in a carrier', () => {
    // (one mark for every class, no table of classes: marks.ts CARRY_TEX sets the point in a box the paragraph takes back where
    // nothing else stands in it; the native cases in lab/pdf/spikes/layout-marks-cases.mjs, '… first after a display: …')
    const every = ['\\autoref{f}', '\\cref{f}', '\\Cref{f}', '\\pageref{f}', '\\eqref{e}', '\\cite{k}', '\\citep{k}']
    every.push(
      '\\citet{k}',
      '\\parencite{k}',
      '\\footnotemark',
      '\\delete{x}',
      '\\ref{f}',
      '\\nameref{f}',
      '\\autoref*{f}',
    )
    every.push('\\citeauthor{k}', '\\texttt{x}', '\\url{https://example.org}', '$x$')
    expect(every.map((src) => [src, command(src)])).toEqual(every.map((src) => [src, '\\axtpmd']))
  })

  it("a display after a display keeps \\axtpma's gobble: TeX drops the empty paragraph between them", () => {
    expect(command('\\[ c = d \\]')).toBe('\\axtpma')
  })

  it('a piece right after a carried one has the carrier too, a display there \\axtpma, a piece after text none', () => {
    // (TeX sets it first where the piece before set nothing: `\\ref{…}` of a label TeX stored no text for)
    const u = unit('para', [
      { t: 'text', s: 'We define ' },
      { t: 'ph', src: '\\[ a = b \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\ref{top}' },
      { t: 'ph', src: '\\cite{k}' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\[ c = d \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\cite{k}' },
      { t: 'text', s: ' and ' },
      { t: 'ph', src: '\\cite{j}' },
      { t: 'text', s: ' shows it.' },
    ])
    expect([3, 4, 6, 8, 10].map((k) => opening(u, k)?.replace(/\{.*$/, ''))).toEqual([
      '\\axtpmd',
      '\\axtpmd',
      '\\axtpma',
      '\\axtpmd',
      '\\axtpma',
    ])
  })

  it('a carried piece before a display the marking leaves unmarked keeps \\axtpma: nothing would take its carrier back', () => {
    // (no mark of ours right after a paper's macro that may read what follows it: `\\delete{…}` then `\\[`; a reference before
    // a display keeps the carrier, which the display's own opening mark takes back where the reference set nothing)
    const u = unit('para', [
      { t: 'text', s: 'We define ' },
      { t: 'ph', src: '\\[ a = b \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\delete{x}' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\[ c = d \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\ref{top}' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\[ e = f \\]' },
      { t: 'text', s: ' and words.' },
    ])
    expect([3, 5, 7, 9].map((k) => opening(u, k)?.replace(/\{.*$/, ''))).toEqual([
      '\\axtpma',
      undefined,
      '\\axtpmd',
      '\\axtpma',
    ])
  })

  it('a piece behind a command of no mark after a display has the carrier too: TeX sets it first', () => {
    // (the local review's finding: `\\noindent` puts nothing on the list; a `\\label` a whatsit, where the carrier's mark is
    // \\axtpma's)
    const u = (between: string) =>
      unit('para', [
        { t: 'text', s: 'We define ' },
        { t: 'ph', src: '\\[ a = b \\]' },
        { t: 'text', s: '\n' },
        { t: 'ph', src: between },
        { t: 'ph', src: '\\cite{k}' },
        { t: 'text', s: ' shows it.' },
      ])
    const after = (between: string, inkless: string[] = []) =>
      (
        layoutMarking([u(between)] as unknown as SourceUnit[], MARK_CLASSES, {
          lines: false,
          inkless,
          quiet: quietOf(u(between)),
        }).units[0]!.pieces as { t: string; src?: string }[]
      )
        .map((p) => (p.t === 'ph' ? (p.src ?? '') : ''))
        .find((s) => /\{[pn]0\.4a\}$/.test(s))
        ?.replace(/\{.*$/, '')
    expect([after('\\noindent'), after('\\label{e}')]).toEqual(['\\axtpmd', '\\axtpmd'])
    // (behind a paper's macro that may read what follows it the piece has no mark of ours at all, as anywhere)
    expect(after('\\nothing', ['\\nothing'])).toBeUndefined()
  })

  it("the carrier only before a piece TeX's display probe said opens no display: a shorthand display is a display", () => {
    // (Devin's finding on #667: `\\be … \\ee`, a paper's shorthand the source reader states is a display (PhPiece.closes), was
    // carried, and TeX broke the carrier's empty list into a line where it opened the display; a macro the probe said opens one,
    // or did not answer for, keeps \\axtpma: marks.ts carrySamples)
    const be = { t: 'ph', src: '\\be c = d \\ee' }
    Object.defineProperty(be, 'closes', { value: 10 })
    const u = unit('para', [
      { t: 'text', s: 'We define ' },
      { t: 'ph', src: '\\[ a = b \\]' },
      { t: 'text', s: '\n' },
      be as never,
      { t: 'text', s: ' and ' },
      { t: 'ph', src: '\\[ e = f \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\cite{k}' },
      { t: 'text', s: ' and ' },
      { t: 'ph', src: '\\[ g = h \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '\\eqn{g}' },
      { t: 'text', s: ' shows it.' },
    ])
    const marks = (quiet: string[]) =>
      (
        layoutMarking([u] as unknown as SourceUnit[], MARK_CLASSES, { lines: false, quiet }).units[0]!.pieces as {
          t: string
          src?: string
        }[]
      )
        .map((p) => (p.t === 'ph' ? (p.src ?? '') : ''))
        .filter((s) => /\\axtpm[amd]?\{p0\.(?:3|7|11)a\}$/.test(s))
    // (the shorthand a display, \\axtpma, though the answers name it; the citation first after a display, carried where TeX said
    // it opens none; \\eqn, a macro the probe said opens a display or never asked, \\axtpma)
    expect(marks(['\\be c = d \\ee', '\\cite{k}'])).toEqual(['\\axtpma{p0.3a}', '\\axtpmd{p0.7a}', '\\axtpma{p0.11a}'])
    expect(marks([])).toEqual(['\\axtpma{p0.3a}', '\\axtpma{p0.7a}', '\\axtpma{p0.11a}'])
    expect(carrySamples([u] as unknown as SourceUnit[])).toEqual(['\\cite{k}', '\\eqn{g}'])
  })

  it("the carrier's TeX assigns nothing outside a carrier's window: its wrappers let in and out, its hooks guarded", () => {
    // (the coordinator's ruling on #667: a pending \\afterassignment of a package is what an assignment of ours meets)
    expect(CARRY_TEX).not.toMatch(/\\(?:protected\\)?def\\(?:raise|lower|unhbox|unhcopy)(?![A-Za-z@])/)
    // (\\raise and the others let to the wrappers inside \\axt@cywrap alone, which a carrier's setting calls)
    expect(CARRY_TEX.replace(/\\def\\axt@cy(?:un)?wrap\{[^}]*\}/g, '')).not.toMatch(
      /\\let\\(?:raise|lower|unhbox|unhcopy)\\/,
    )
    expect(CARRY_TEX).toContain('\\def\\axt@cyhook{\\ifaxt@cyon\\global\\axt@cybtrue\\fi}')
    expect(CARRY_END_TEX).toContain('{\\ifaxt@cyon\\axt@ifcy{')
  })

  it('a reference after text keeps \\axtpma, and an inline formula after text \\axtpmm', () => {
    const u = unit('para', [
      { t: 'text', s: 'see ' },
      { t: 'ph', src: '\\autoref{f}' },
      { t: 'text', s: ' and ' },
      { t: 'ph', src: '$x$' },
      { t: 'text', s: ' holds.' },
    ])
    expect([opening(u, 1), opening(u, 3)]).toEqual(['\\axtpma{p0.1a}', '\\axtpmm{p0.3a}'])
  })
})

describe("the carrier's TeX in a paper's head only where the marking writes a carrier", () => {
  const files = (body: string) => {
    const paper = openPaper(
      new Map([
        [
          'main.tex',
          new TextEncoder().encode(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`),
        ],
      ]),
    )
    const quiet = paper.project.units.flatMap((u) => u.pieces.flatMap((p) => (p.t === 'ph' ? [p.src] : [])))
    return new TextDecoder('latin1').decode(
      originalFiles(paper, { lines: true, layout: MARK_CLASSES, quiet }).get('main.tex'),
    )
  }
  it('a paragraph with a reference first after a display: CARRY_TEX in its head, its paragraph end before LAYOUT_TEX', () => {
    const tex = files('We define words here\n\\[ a = b \\]\n\\ref{f} shows it, and more words.')
    expect(tex).toContain('\\axtpmd{')
    expect(tex.indexOf(CARRY_END_TEX)).toBeGreaterThan(-1)
    expect(tex.indexOf(CARRY_END_TEX)).toBeLessThan(tex.indexOf(LAYOUT_TEX))
    expect(tex.indexOf(CARRY_TEX)).toBeGreaterThan(tex.indexOf(LAYOUT_TEX))
  })
  it('a paper with none: its head as before, no CARRY_TEX', () => {
    const tex = files('We define words here\n\\[ a = b \\]\nwhere the words go on, \\ref{f} shows it.')
    expect(tex).not.toContain('\\axtpmd{')
    expect(tex).not.toContain(CARRY_TEX)
    expect(tex).not.toContain(CARRY_END_TEX)
  })
})

describe("the carrier's TeX takes no name the rest of a marked head has", () => {
  // (its scratch box and count were \axt@cc and \axt@uc, a cell's statement in LAYOUT_TEX: every marked cell of a paper with a
  // carrier then failed, "Forbidden control sequence found while scanning use of \axt@tec", 2307.16209v1 refused)
  it('each macro, register and switch CARRY_TEX defines is named nowhere else, but the two marks it wraps', () => {
    const others = [
      MARK_DEF,
      DVI_MARK_DEF,
      LAYOUT_TEX,
      LAYOUT_TEX_REDUCED,
      STATEMENTS_TEX,
      ASK_TEX,
      DVI_LAYOUT_TEX,
      CALL_TEX,
    ]
    others.push(NAMES_TEX, END_TEX, LINES_TEX, classNamesTex(['\\begin{IEEEproof}']), refsTex(['key']))
    others.push(regionsTex(['verbatim', 'lstlisting'], ['codebody']))
    const defined = new Set(
      [...CARRY_TEX.matchAll(/\\(?:(?:protected\\)?def|let|newbox|newcount|newif)\\((?:if)?axt[A-Za-z@]+)/g)].map((m) =>
        m[1]!.replace(/^if/, ''),
      ),
    )
    const wrapped = new Set(['axt@pmc', 'axt@pm'])
    const named = (n: string) => new RegExp(`\\\\(?:if)?${n.replace(/@/g, '@')}(?:true|false)?(?![A-Za-z@])`)
    const clash = [...defined].filter((n) => !wrapped.has(n) && others.some((t) => named(n).test(t)))
    expect(defined.size).toBeGreaterThan(20)
    expect(clash).toEqual([])
  })
  it('nor takes the place of an \\afterassignment a package set: its wrappers read one token, and set no number', () => {
    // (a first form read \\unhbox's register by \\afterassignment, which took the place of one a package had set before its own
    // \\leavevmode: a section's skip in 2307.16209v1 moved, 147 pages 146, the paper refused)
    expect(CARRY_TEX).not.toContain('\\afterassignment')
    expect(CARRY_TEX).toContain('\\protected\\def\\axt@unhboxw#1{\\ifx#1\\voidb@x\\else\\axt@cyhook\\fi\\axt@unhbox#1}')
  })
})
