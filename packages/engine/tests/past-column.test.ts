// A display at a column's foot whose text after it TeX set at the head of the next column's body (ownedOf's pastColumn), in
// two shapes the reading refused though TeX's stream states the display's ink:
// - a class that sets a column's notes inside the body it brackets ships the notes between the display and the body's end: the
//   display's next mark in its region is a note's start, no body's end before it, and the reading stopped there with the text
//   after it not found. Where a note's own ink runs on past its end mark (a placeholder after its last word, which carries a
//   point of its own after that mark), the reading past units shipped whole (pastUnit) does not take it either. The note's
//   start bounds the display's ink as a body's end does: its label, and the notes' separator rule TeX ships with them below the
//   column's text, are the notes'; the reading goes on from the body's end to the text after it.
// - a display holding a draft image frame (graphicx's draft: the final pass's picture in its place) read past its column's end
//   to the text after it, which ends it, was refused as a reading past a frame that runs to a mark or a column's end.
// The marked compile's stream as B ships it is written here (each glyph 5 pt wide at 10 pt), in content of our own.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { followsOf } from '../src/marks/marks.ts'
import { ownOf } from '../src/own/own.ts'
import {
  OWNED,
  OWNED_HOW,
  type Owned,
  ownedOf,
  ownedPages,
  STREAM_COLUMNS,
  type StreamPage,
} from '../src/own/stream.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

/** a string is glyphs on the current line (a space 3 pt, `\n` the next line 12 pt down, `\f` a line 200 pt down: a column's
 *  foot), `{ at }` a point (`{ at: '\f' }` ends the page), `{ rule }` a rule 36 pt wide on a line of its own 12 pt down,
 *  `{ under }` a rule under the last glyph set, 2 pt below its baseline */
type Item = string | { at: string } | { rule: true } | { under: true }
function pageOf(items: readonly Item[]): StreamPage {
  const glyphs: Glyph[] = [],
    points: { name: string; glyph: number; box: number }[] = [],
    boxAt: number[] = [],
    boxes: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') x += 3
        else if (u === '\n' || u === '\f') {
          x = 72
          y -= u === '\n' ? 12 : 200
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
          boxAt.push(boxes.length / 4)
          x += 5
        }
      }
    } else if ('under' in it) boxes.push(x - 5, y - 2.4, x, y - 2)
    else if ('rule' in it) {
      y -= 12
      boxes.push(72, y, 108, y + 0.4)
    } else points.push({ name: it.at, glyph: glyphs.length, box: boxes.length / 4 })
  }
  return {
    glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }),
    boxes,
    points,
    boxAt: Int32Array.from(boxAt),
    view: [0, 0, 612, 792],
  } as StreamPage
}
const pagesOf = (items: readonly Item[]): StreamPage[] => {
  const out: Item[][] = [[]]
  for (const it of items) {
    if (typeof it !== 'string' && 'at' in it && it.at === '\f') out.push([])
    else out.at(-1)!.push(it)
  }
  return out.map(pageOf)
}
const unit = (kind: string, pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
  file: null,
  kind,
  start: 0,
  end: 0,
  pieces,
})
/** what the display `p1.1a` owns, read by the whole document (ownedOf) or a page at a time (ownedPages): its glyphs and its
 *  boxes' count, or its how */
function owned(units: readonly SourceUnit<null>[], items: readonly Item[], paged = false): string | null {
  const pages = pagesOf(items)
  const follows = followsOf(units as never, new Set(pages.flatMap((pg) => pg.points.map((p) => p.name))))
  const shown = (e: Owned | undefined, W: readonly StreamPage[]) =>
    !e
      ? null
      : e.how >= OWNED
        ? (OWNED_HOW[e.how] as string)
        : `${e.glyphs.map(([p, g]) => W[p - 1]!.glyphs.u[g]).join('')}${e.boxes.length ? ` +${e.boxes.length} box` : ''}`
  if (!paged) return shown(ownedOf(pages, { follows, erasure: true }).get('p1.1a'), pages)
  let out: string | null = null
  const take = (name: string, e: Owned, W: readonly StreamPage[]) => {
    if (name === 'p1.1a') out = shown(e, W)
  }
  const s = ownedPages({ follows })
  for (const [i, pg] of pages.entries()) s.add(i + 1, pg, take)
  s.end(take)
  return out
}

/** unit 0: a note whose last piece is a placeholder after its last word (its points after the unit's end mark); unit 1: text,
 *  a display, the text after it (`more`: a formula of its own after that text) */
const NOTE = unit('footnote', [
  { t: 'text', s: 'A note of ours, at ' },
  { t: 'ph', src: '\\url{x.org}' },
])
const para = (more = false) =>
  unit('para', [
    { t: 'text', s: 'We have ' },
    { t: 'ph', src: '\\begin{equation} a = b \\end{equation}' },
    { t: 'text', s: '\nwhere it holds' },
    ...(more
      ? [
          { t: 'ph' as const, src: '$x$' },
          { t: 'text' as const, s: '.' },
        ]
      : [{ t: 'text' as const, s: '.' }]),
  ])
/** the body as B ships it: the paragraph's line, the display's opening point and its row at the column's foot, then the notes
 *  (the separator rule, each note's label, its marks, its placeholder's points after its end mark), the body's end, and the text
 *  after the display at the head of the next page's body */
const FOOT = (
  o: {
    rule?: boolean
    notes?: number
    label?: string
    own?: boolean
    open?: boolean
    under?: boolean
    end?: boolean
    after?: string
    rows?: string
  } = {},
): Item[] => {
  const note = (n: number, label: string): Item[] => [
    label,
    { at: `${n}s` },
    'Anoteofours,at',
    ...(o.open ? [] : [{ at: `${n}e` }, { at: `p${n}.1a` }, 'x.org', { at: `p${n}.1b` }]),
  ]
  return [
    { at: 'bs1' },
    { at: '1s' },
    'Wehave',
    { at: 'p1.1a' },
    '\na=b(1)',
    ...(o.under ? [{ under: true as const }] : []),
    ...(o.rule ? [{ rule: true as const }] : []),
    ...note(0, `\f${o.label ?? '2'}`),
    ...(o.notes === 2 ? note(2, '\n3') : []),
    // (a mark of the display's own unit before the body's end: its text set there, not past the notes)
    ...(o.own ? [{ at: 'p1.3a' }, 'x', { at: 'p1.3b' }] : []),
    ...(o.end === false ? [] : [{ at: 'be1' }]),
    { at: '\f' },
    { at: 'bs2' },
    // (the note's rest at the head of the next column, before the text after it)
    ...(o.open ? ['\nx.org.'] : []),
    ...(o.rows ? [o.rows] : []),
    `\n${o.after ?? 'whereitholds.'}`,
    { at: '1e' },
    { at: 'be2' },
  ]
}
const foot = (o: Parameters<typeof FOOT>[0] = {}, paged = false) =>
  owned(o.notes === 2 ? [NOTE, para(o.own), NOTE] : [NOTE, para(o.own)], FOOT(o), paged)

describe("a display at a column's foot, the notes a class ships inside the body after it, the text after it on the next page", () => {
  it("owns its row: the note's start bounds its ink as the body's end does, the note's label left out", () => {
    expect(foot()).toBe('a=b(1)')
  })

  it("the notes' separator rule TeX ships with them below the column's text is no ink of the display's", () => {
    expect(foot({ rule: true })).toBe('a=b(1)')
  })

  it('two notes shipped one after the other, each with its placeholder after its end mark: neither is the display', () => {
    expect(foot({ notes: 2 })).toBe('a=b(1)')
  })

  it('the display goes on at the head of the next column before the text after it: those rows are its own', () => {
    expect(foot({ rows: '\nc=d(2)' })).toBe('a=b(1)c=d(2)')
  })

  it('read a page at a time (the stream waits for the page the text after it is on) as the whole document reads it', () => {
    expect(foot({}, true)).toBe('a=b(1)')
    expect(foot({ rule: true, notes: 2 }, true)).toBe('a=b(1)')
  })

  it("the other side: a mark of the display's own unit between the note's start and the body's end: nothing is owned", () => {
    expect(foot({ own: true })).toBe('open, the text after it not found')
  })

  it("the other side: words before the note's start on its line, no label's form (the display's own, maybe): nothing", () => {
    expect(foot({ label: 'Seeal' })).toBe('open, the text after it not found')
  })

  it('the other side: no body ends after the note on its page: nothing is owned', () => {
    expect(foot({ end: false })).toBe('open, the text after it not found')
  })

  it("the other side: a note left open at the body's end (its end mark not there), its rest at the next column's head: nothing", () => {
    expect(foot({ open: true })).toBe('open, the text after it not found')
    expect(foot({ open: true }, true)).toBe('open, the text after it not found')
  })

  it("a rule TeX set on the display's last line after its last glyph (an underline) stays its own; the separator does not", () => {
    expect(foot({ under: true, rule: true })).toBe('a=b(1) +1 box')
  })

  it('the other side: the text after it not at the next body: nothing is owned', () => {
    expect(foot({ after: 'somethingelse.' })).toBe('open, the text after it not found')
  })
})

/** unit 1: text, a display holding a picture (`last`: the unit's last piece, no text after it), the text after it; unit 2 a
 *  paragraph after it */
const FRAMED = (last: boolean) => [
  unit('para', [
    { t: 'text', s: 'We have ' },
    { t: 'ph', src: '\\begin{equation} \\includegraphics{a} \\end{equation}' },
    ...(last ? [] : [{ t: 'text' as const, s: '\nwhere it holds.' }]),
  ]),
  unit('para', [{ t: 'text', s: 'Next.' }]),
]
/** the body as B ships it in draft: the display's opening point at the column's foot, the frame's points and its outline, the
 *  display's number, the body's end; the next page's body: the text after it (or, `last`, the next paragraph) */
const FRAME = (last: boolean): Item[] => [
  { at: 'bs1' },
  { at: '0s' },
  { at: '0e' },
  { at: '1s' },
  'Wehave',
  ...(last ? [{ at: '1e' }] : []),
  { at: 'p1.1a' },
  { at: 'g1a' },
  { rule: true },
  { at: 'g1b' },
  '\n(1)',
  { at: 'be1' },
  { at: '\f' },
  { at: 'bs2' },
  ...(last ? [{ at: '2s' }, '\nNext.', { at: '2e' }] : ['\nwhereitholds.', { at: '1e' }]),
  { at: 'be2' },
]
const framedUnits = (last: boolean) => [unit('para', []), ...FRAMED(last)]

describe("a display holding a draft image frame at a column's foot, read past its column's end", () => {
  it('to the text after it, which ends the reading: owns its frame and its number', () => {
    expect(owned(framedUnits(false), FRAME(false))).toBe('(1) +1 box')
  })

  it("the other side: no text after it, the reading runs to its column's end: refused as before", () => {
    expect(owned(framedUnits(true), FRAME(true))).toBe("open, the next mark not its unit's")
  })
})

// The ownership's claim of that reading (own/own.ts ownOf): a placeholder's reading takes an image's box only where TeX's facts
// bound it on both sides (its closing point, or the text after it). A reading past its column's end that the text after it
// ends is so bounded: the display owns the picture TeX set in it (in the final pass an image's box, pageInk's kind -3), as it
// owns its number. (Devin on #704: the stream's reading kept the frame's box, and the claim then dropped the image.)
/** a page for the ownership: glyphs as ownOf reads them, a `{ rule }` a painted rule (its path 0), an `{ image }` an image's box */
function ownPageOf(items: readonly (Item | { image: true })[]) {
  const glyphs: {
    n: number
    k: number
    u: string
    x0: number
    x1: number
    y: number
    size: number
    top: number
    bottom: number
  }[] = []
  const points: { name: string; glyph: number; box: number }[] = [],
    boxes: number[] = [],
    paths: number[] = [],
    boxAt: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') x += 3
        else if (u === '\n' || u === '\f') {
          x = 72
          y -= u === '\n' ? 12 : 200
        } else {
          glyphs.push({ n: glyphs.length, k: 0, u, x0: x, x1: x + 5, y, size: 10, top: y + 7, bottom: y - 2 })
          boxAt.push(boxes.length / 4)
          x += 5
        }
      }
    } else if ('image' in it) {
      y -= 40
      boxes.push(72, y, 172, y + 36)
      paths.push(-3)
    } else if ('rule' in it) {
      y -= 12
      boxes.push(72, y, 108, y + 0.4)
      paths.push(0)
    } else if ('under' in it) {
      boxes.push(x - 5, y - 2.4, x, y - 2)
      paths.push(0)
    } else points.push({ name: it.at, glyph: glyphs.length, box: boxes.length / 4 })
  }
  return { glyphs, boxes, paths, points, boxAt, view: [0, 0, 612, 792] as const }
}

describe("the ownership's claim of a display at a column's foot read past its column's end to the text after it", () => {
  it("a display holding a picture (an image in the final pass): its image box is the display piece's, as its number is", () => {
    const items: (Item | { image: true })[] = FRAME(false).map((it) =>
      typeof it !== 'string' && 'rule' in it ? { image: true as const } : it,
    )
    const split: (Item | { image: true })[][] = [[]]
    for (const it of items) {
      if (typeof it !== 'string' && 'at' in it && it.at === '\f') split.push([])
      else split.at(-1)!.push(it)
    }
    const pages = split.map(ownPageOf)
    const units = framedUnits(false)
    const follows = followsOf(units as never, new Set(pages.flatMap((pg) => pg.points.map((p) => p.name))))
    const r = ownOf(pages as never, { units: units as never, follows })
    // (the image is the first page's one box; the number's glyphs are the display piece's)
    expect(r.boxes[0]![0]).toBe('u1.p')
    const number = pages[0]!.glyphs.flatMap((g, i) => ('(1)'.includes(g.u) && g.y < 700 ? [r.glyphs[0]![i]] : []))
    expect(number).toEqual(['u1.p', 'u1.p', 'u1.p'])
  })
})
