// A source unit whose text TeX set turned is placed in its frame (locate/frames.ts, docs/PDF-READER.md §18.108): TeX sets a box
// level and turns it, so the unit's lines, lead and room are read in the page's coordinates turned back by its turn, and the
// part states it in a frame of that turn (Part.frames), off the page's flows, which a typesetter lays as it lays a part's
// flows. A cell of a table's header set by \rotatebox{90}{…}, its turned glyphs its own (the instrument's turned owners).
import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string, more: Partial<InstrumentUnit> = {}): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content, ...more }
}
/** a page with a level line and words set turned by (ux, uy), from (60, 400) along it, 6 a glyph, one word a line: each
 *  next line 12 across the turn (its frame's y down 12) */
const withTurned = (words: string[], [ux, uy]: [number, number] = [0, 1]): Doc => {
  const d = docOf([{ lines: ['Method 0.91'] }])
  const T: DocTurned[] = []
  words.forEach((w, li) => {
    // (the line's origin: (60, 400) on the page for the first, each next one 12 under it in the frame, -12 across the turn)
    const [x, y] = [60 + uy * 12 * li, 400 - ux * 12 * li]
    for (const [j, u] of [...w].entries())
      T.push({
        u,
        code: u.codePointAt(0) as number,
        base: 'CMR10',
        n: 1 + li,
        k: j,
        at: 11,
        box: -1,
        ox: x + ux * 6 * j,
        oy: y + uy * 6 * j,
        ex: x + ux * 6 * (j + 1),
        ey: y + uy * 6 * (j + 1),
        ux,
        uy,
        size: 10,
        ascent: 0.7,
        descent: -0.2,
        form: false,
      })
  })
  d.pages[0]!.turned = T
  return d
}
const runOf = (units: InstrumentUnit[], words: string[], dir?: [number, number]) => {
  const B = withTurned(words, dir)
  const A = withTurned(words, dir)
  const n = B.pages[0]!.turned!.length
  const ins: Instrument = {
    ink: B,
    units,
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((_, j) => {
        O.unit[j] = 0
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    turned: [
      { unit: new Int32Array(n).fill(1), role: new Uint8Array(n).fill(ROLE.text), piece: new Int32Array(n).fill(-1) },
    ],
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
  const L = locate(ins, A, align(B, A))
  const addOn: AddOn = {
    bytes: new Uint8Array([1, 2, 3]),
    pages: new Map([[1, { ok: true }]]),
    groups: new Set([...L.groups[0]!.glyphs, ...L.groups[0]!.turned].filter((g): g is string => g !== null)),
    ocgs: new Map(),
    lost: new Set(),
    stats: {} as AddOn['stats'],
  }
  const original = new Uint8Array(70000).map((_, i) => i & 255)
  const objs = [
    ...bundle({ ins, located: L, addOn, original, paper: { id: '2501.00001', version: 1, pages: 1 }, made: 't' }),
  ]
  const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>
  return { L, part: read('part', part.bytes) }
}

describe('a unit whose text TeX set turned, in its frame', () => {
  it('places a header cell set a quarter turned in its frame: its line there, its turn, its part’s frame', () => {
    const { L, part } = runOf([unitOf('cell', 'Method 0.91'), unitOf('cell', 'Recall')], ['Recall'])
    const cell = L.members[1]!
    expect(cell).toMatchObject({ located: true, kind: 'cell', pages: [1], frame: [0, 1] })
    // (in the frame, (x, y) of the page at (y, -x): "Recall" from 400 to 436 along its run, its baseline -60, its band 7 over and
    // 2 under, at 10)
    expect(cell.lines).toEqual([[1, 0, 400, 436, -60, -53, -62, 400, 436, 0, 10]])
    // (the page's flows hold the level cell alone; the frame of turn (0, 1) holds the turned one)
    expect(L.flows.flat()).not.toContain(cell.ord)
    expect(L.frames).toEqual([{ page: 1, dir: [0, 1], flows: [[cell.ord]], ties: [] }])
    expect(part.flows.flat().map((x) => x.ord)).not.toContain(cell.ord)
    expect(part.frames).toHaveLength(1)
    expect(part.frames![0]!.dir).toEqual([0, 1])
    expect(part.frames![0]!.flows.flat()).toEqual([
      expect.objectContaining({ ord: cell.ord, kind: 'cell', lines: cell.lines }),
    ])
  })
  it('places a caption of two lines set turned: its lines in the frame, one under the other, its lead their step', () => {
    const { L } = runOf([unitOf('para', 'Method 0.91'), unitOf('caption', 'Runs of the set')], ['Runs of', 'the set'])
    const cap = L.members[1]!
    expect(cap.frame).toEqual([0, 1])
    expect(cap.lines.map((l) => [l[2], l[4]])).toEqual([
      [400, -60],
      [400, -72],
    ])
    expect(cap.lead).toBe(12)
  })
  it('places a unit turned a quarter the other way in the frame of that turn', () => {
    // (a sideways page's turn the other way: (0, -1), its frame's (x, y) the page's (-y, x))
    const { L } = runOf([unitOf('para', 'Method 0.91'), unitOf('cell', 'Recall')], ['Recall'], [0, -1])
    const cell = L.members[1]!
    expect(cell.frame).toEqual([0, -1])
    expect(cell.lines[0]!.slice(2, 5)).toEqual([-400, -364, 60])
  })
})
