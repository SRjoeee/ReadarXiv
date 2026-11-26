// Two placeholders TeX answered inseparable: the look-ahead probe's pair (a paper's macro, the placeholder right after it) answered
// 2, a mark between them changes the box TeX sets, or the macro's list ends with a character the next one may kern or join with
// (`\=A\=T`: the A and the T kerned). The marking gives the second no mark of its own, so no point of TeX's parts its ink from the
// first's; the first's opening point stopped at it ('open, an unmarked piece follows', LOST), the two glyphs were read as the
// paragraph's text, the locate counted more letters than the source writes (`text past its source`) and the whole paragraph
// stayed the original's. The two are one ink: the first's opening point reads through the joined piece to the text after them,
// and the joined piece sets nothing apart from it. The marked compile's stream as B ships it is written here (each glyph 5 pt
// wide at 10 pt), in content of our own; the probe's answers as its log writes them.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { aheadSamples, followsOf, joinedPieces, joinedRead, probeFactsOf, readMarkProbe } from '../src/marks/marks.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'

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
const para = (pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
  file: null,
  kind: 'para',
  start: 0,
  end: 0,
  pieces,
})
/** unit 0: two accents (a kern between their letters); unit 1: an accent before a paper's macro that sets a superscript; unit 2:
 *  three accents in a row; unit 3: two accents past white space, then the text */
const UNITS = [
  para([
    { t: 'text', s: 'Our pair (' },
    { t: 'ph', src: '\\=A' },
    { t: 'ph', src: '\\=T' },
    { t: 'text', s: ') holds.' },
  ]),
  para([
    { t: 'text', s: 'Our mark ' },
    { t: 'ph', src: '\\=A' },
    { t: 'ph', src: '\\ourSup' },
    { t: 'text', s: ' here.' },
  ]),
  para([
    { t: 'text', s: 'Our three (' },
    { t: 'ph', src: '\\=A' },
    { t: 'ph', src: '\\=T' },
    { t: 'ph', src: '\\=V' },
    { t: 'text', s: ') hold.' },
  ]),
  para([
    { t: 'text', s: 'Our gap (' },
    { t: 'ph', src: '\\=W' },
    { t: 'text', s: ' ' },
    { t: 'ph', src: '\\=T' },
    { t: 'text', s: ') holds.' },
  ]),
]
/** each unit's line as B ships it: its start, its text, the first accent's opening point alone, the accents' glyphs, the text
 *  after them, its end */
const STREAM: Item[] = [
  { at: 'bs1' },
  { at: '0s' },
  'Ourpair(',
  { at: 'p0.1a' },
  'ĀŤ',
  ')holds.',
  { at: '0e' },
  '\n',
  { at: '1s' },
  'Ourmark',
  { at: 'p1.1a' },
  'Ā²',
  'here.',
  { at: '1e' },
  '\n',
  { at: '2s' },
  'Ourthree(',
  { at: 'p2.1a' },
  'ĀŤV̄',
  ')hold.',
  { at: '2e' },
  '\n',
  { at: '3s' },
  'Ourgap(',
  { at: 'p3.1a' },
  'W̄ Ť',
  ')holds.',
  { at: '3e' },
  { at: 'be1' },
]
/** the probe's log: TeX's answer for each look-ahead pair of the units, `code` by the pair's follower */
const logOf = (code: (follows: string) => string): string =>
  aheadSamples(UNITS as never)
    .map((s, n) => `LAYOUT-PROBE 1 ahead ${n} ${code(s.follows)}`)
    .join('\n')
const ALL_TWO = logOf(() => '2')
/** what the opening point `name` owns, as the marking and the stream read it with TeX's answers `log`: its glyphs, or its how */
function owned(name: string, log: string): string {
  const pages = [pageOf(STREAM)]
  const names = new Set(pages.flatMap((pg) => pg.points.map((p) => p.name)))
  const joined = joinedRead(UNITS as never, names, probeFactsOf(log, UNITS as never).joined ?? [])
  const follows = followsOf(UNITS as never, names, null, null, joined)
  const e = ownedOf(pages, { follows, erasure: true }).get(name)
  if (!e) return 'none'
  return e.how < OWNED ? e.glyphs.map(([p, g]) => pages[p - 1]!.glyphs.u[g]).join('') : (OWNED_HOW[e.how] as string)
}

describe('a placeholder TeX answered inseparable from the macro before it is read with it, as one ink', () => {
  it('two accents whose letters TeX kerns: the first owns both, to the text after them', () => {
    expect(owned('p0.1a', ALL_TWO)).toBe('ĀŤ')
  })

  it("an accent before a paper's macro that sets a superscript: the accent owns both", () => {
    expect(owned('p1.1a', ALL_TWO)).toBe('Ā²')
  })

  it('three in a row, each joined to the one before: the first owns the three', () => {
    expect(owned('p2.1a', ALL_TWO)).toBe('ĀŤV̄')
  })

  it('past white space between them: the first owns both', () => {
    expect(owned('p3.1a', ALL_TWO)).toBe('W̄Ť')
  })

  it('the probe log read: the pieces TeX answered 2, by unit and piece, and none it answered 0', () => {
    const joined = probeFactsOf(
      logOf((f) => (f === '\\ourSup' ? '0' : '2')),
      UNITS as never,
    ).joined
    expect(joined).toEqual([
      { unit: 0, piece: '2' },
      { unit: 2, piece: '2' },
      { unit: 2, piece: '3' },
      { unit: 3, piece: '3' },
    ])
  })

  it("the other side: no answer of TeX's (the pair not asked): the first stops at the unmarked piece, as before", () => {
    expect(owned('p0.1a', '')).toBe('open, an unmarked piece follows')
  })

  it("the other side: TeX's answer 0 (a mark there moves nothing) is no joining", () => {
    expect(
      joinedPieces(
        readMarkProbe(
          logOf(() => '0'),
          aheadSamples(UNITS as never),
        ),
        UNITS as never,
      ),
    ).toEqual([])
  })

  it('the other side: a joined piece with an opening mark of its own, or after a macro with none, is not read through', () => {
    const joined = [
      { unit: 0, piece: '2' },
      { unit: 1, piece: '2' },
    ]
    expect(joinedRead(UNITS as never, new Set(['p0.1a', 'p0.2a']), joined)).toEqual([])
    expect(joinedRead(UNITS as never, new Set(['p1.2b']), joined)).toEqual([])
    expect(joinedRead(UNITS as never, new Set(['p0.1a']), joined)).toEqual([{ unit: 0, piece: '2' }])
  })
})
