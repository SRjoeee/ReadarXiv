// @vitest-environment node
// The other side of rules no paper takes (the coordinator's ruling of 2026-11-14 on the rule ledger: a condition whose other
// side a valid input could take stays, and a test feeds that side through the module's public reading). Each input here is
// one a page, a source or a value inside the function's contract can give, though none of the corpus, the holdout or the
// third set did: the rule ledger recorded at b42904e9c read every one of these comparisons with a single outcome.
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
import { type PageInk, pageInk } from '../src/ink.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { piecesOf } from '../src/instrument/instrument.ts'
import { figureLinesOf } from '../src/locate/figure-lines.ts'
import { type TodayFigures, figureUnitsOf } from '../src/locate/figure-text.ts'
import { groupStyleOf } from '../src/locate/ink.ts'
import { inkUnitsOf } from '../src/locate/ink-units.ts'
import { ledgerOf, type TodayPage } from '../src/locate/ledger.ts'
import { pack } from '../src/sparse.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const OPTIONS = { verbosity: 0, useSystemFonts: false, isEvalSupported: false, fontExtraProperties: true }
/** a page of 300 by 300 that draws one form XObject (a figure) of `content`, in Helvetica as /F1, as the figures' reading
 *  reads it (pageInk with `indices` and `turned`) */
async function figurePage(content: string) {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([300, 300])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  const form = doc.context.stream(content, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 300, 300],
    Resources: { Font: { F1: font.ref } },
  })
  page.node.setXObject(PL.PDFName.of('Fm'), doc.context.register(form))
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream('/Fm Do')))
  const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }))
  const task = getDocument({ ...OPTIONS, data: bytes.slice() } as never)
  try {
    const pg = await (await task.promise).getPage(1)
    return pageInk(
      OPS as never,
      (await pg.getOperatorList()) as never,
      pg.commonObjs as never,
      { rotate: 0, indices: true, turned: true } as never,
    ) as unknown as TodayPage
  } finally {
    await task.destroy()
  }
}
/** a glyph's text matrix turned by atan(0.0010000002): past pageInk's LEVEL (its rise across over 1e-3 of its advance: a
 *  turned glyph), under the run join's 1e-3 on each component of the direction (figure-text.ts), so that the level glyphs after
 *  it join its run: a unit of level glyphs whose direction is (0.9999995000002, 0.0009999996639) */
const SLIGHT = (x: number, y: number) => `1 0.0010000002 -0.0010000002 1 ${x} ${y} Tm`
/** that unit's direction, as pageInk and figureUnitsOf give it (the first test below) */
const SLIGHT_DIR = { ux: 0.9999995000002111, uy: 0.0009999996639129022 }

describe('a figure unit turned under the run join: level glyphs after a glyph turned by 0.0573 degrees', () => {
  it('is one unit of the level glyphs, its direction the turned glyph’s, its direction along within 5e-7 of 1', async () => {
    const pg = await figurePage(`BT /F1 10 Tf ${SLIGHT(100, 150)} (W) Tj 1 0 0 1 109.44 150 Tm (ord here) Tj ET`)
    const fig = figureUnitsOf([pg as never], null)
    expect(fig.units.map((u) => [u.text, u.ux, u.uy])).toEqual([['Word here', SLIGHT_DIR.ux, SLIGHT_DIR.uy]])
    expect([fig.glyphs[0]!.size, fig.turned[0]!.size]).toEqual([8, 1])
    expect(Math.abs(fig.units[0]!.ux! - 1)).toBeLessThan(1e-6)
  })
  it('is no unit of a closed path’s hold (figure-text.ts containersOf’s level units): the path holds a level unit and it, not they alone', async () => {
    // (figure-text.ts:922 `Math.abs(m.u.uy) < 1e-6`, the level unit's half the run join leaves open)
    const box = '1 w 90 130 m 260 130 l 260 185 l 90 185 l h S'
    const level = await figurePage(
      `${box} BT /F1 10 Tf 1 0 0 1 100 165 Tm (Upper words) Tj 1 0 0 1 100 145 Tm (Plain label) Tj ET`,
    )
    const slight = await figurePage(
      `${box} BT /F1 10 Tf 1 0 0 1 100 165 Tm (Upper words) Tj ${SLIGHT(100, 145)} (W) Tj 1 0 0 1 109.44 145 Tm (ord label) Tj ET`,
    )
    expect(figureUnitsOf([level as never], null).holds!.map((h) => h.ks)).toEqual([[0, 1]])
    const fig = figureUnitsOf([slight as never], null)
    expect(fig.units.map((u) => u.text)).toEqual(['Upper words', 'Word label'])
    expect(fig.holds).toEqual([])
  })
})

/** a hand-made page of glyph lines (packages/engine/tests/figure-lines.test.ts's form): each part of a line a run, a figure
 *  unit by k unless `run: false`; glyphs 5 to 7 wide at size 10, a space 3 */
type Part = {
  text: string
  font: string
  run?: boolean
  x?: number
  dy?: number
  marks?: Record<number, Partial<Glyph>>
}
type Glyph = {
  u: string
  font: string
  size: number
  x0: number
  x1: number
  y: number
  top: number
  bottom: number
  ix0: number
  ix1: number
  form: boolean
  fid: number
  blank: boolean
}
function linesPage(lines: Part[][]) {
  const glyphs: Glyph[] = []
  const units: TodayFigures['units'] = []
  const map = new Map<number, number>()
  lines.forEach((line, li) => {
    let x = 72
    const y = 700 - 14 * li
    for (const p of line) {
      const gs: Glyph[] = []
      let at = p.x ?? x
      for (const [i, u] of [...p.text].entries()) {
        const w = u === ' ' ? 3 : 5 + (u.codePointAt(0)! % 3)
        const g = { u, font: p.font, size: 10, x0: at, x1: at + w, y: y + (p.dy ?? 0), top: y + 7, bottom: y - 2 }
        gs.push({ ...g, ix0: at, ix1: at + w, form: true, fid: 1, blank: u === ' ', ...p.marks?.[i] })
        if (!p.marks?.[i]) at += w
      }
      const k = units.length
      if (p.run !== false) {
        units.push({
          k,
          text: p.text.trim(),
          why: null,
          x: gs[0]!.x0,
          y,
          length: gs.at(-1)!.x1 - gs[0]!.x0,
          anchor: 'start',
          before: 20,
          after: 20,
          under: null,
        })
        gs.forEach((g, j) => {
          if (!g.blank) map.set(glyphs.length + j, k)
        })
      }
      glyphs.push(...gs)
      x = gs.at(-1)!.x1
    }
  })
  const page = { glyphs, boxes: [], paths: [] } as unknown as TodayPage
  const fig: TodayFigures = { units, glyphs: [map], turned: [new Map()], met: new Map() }
  return { page, fig, glyphs }
}
/** "Café" with its acute a combining mark (U+0301, no spacing accent TeX's \accent sets) drawn over its "e" as a glyph of its
 *  own after it: a mark set apart from its letter (figure-lines.ts setApart), so the figure reading keeps such a unit no text
 *  holds whole (`crowded`, `script`) */
const CAFE: Part = {
  text: 'Café',
  font: 'DejaVuSans',
  marks: { 4: { x0: 89, x1: 92, ix0: 89, ix1: 92, top: 710, bottom: 708 } },
}

describe('the figure reading’s kept and turned units (figure-lines.ts figureLinesOf, linesOf)', () => {
  it('keeps a level unit no text holds whole where a mark is set apart from its letter, and turned under the join, the same unit not', () => {
    // (figure-lines.ts:144's `Math.abs(u.uy ?? 0) > 1e-6`: a turned unit is no script's to keep; and :212's `Math.abs((u.ux
    // ?? 1) - 1) > 1e-6`, its false side: a level unit the scripts loop kept stays kept, never given back as a turned one)
    const level = linesPage([[CAFE]])
    expect(figureLinesOf([level.page], level.fig, () => false, null)).toEqual([])
    expect(level.fig.units.map((u) => [u.why, u.script])).toEqual([['crowded', true]])
    const slight = linesPage([[CAFE]])
    Object.assign(slight.fig.units[0]!, SLIGHT_DIR)
    expect(figureLinesOf([slight.page], slight.fig, () => false, null)).toEqual([])
    expect(slight.fig.units.map((u) => [u.why, u.script])).toEqual([[null, undefined]])
  })
  it('lays a crowded unit turned under the join as today’s unit, no level line reading it (the line reading reads level lines)', () => {
    // (figure-lines.ts:212's `Math.abs(u.uy ?? 0) > 1e-6`: a crowded unit no text holds, turned, laid; its direction along is
    // within 1e-6 of 1, so only its direction across tells it)
    const { page, fig } = linesPage([[{ text: 'Accuracy', font: 'DejaVuSans' }]])
    Object.assign(fig.units[0]!, SLIGHT_DIR, { why: 'crowded' })
    fig.met.set(0, { items: [{ g: 0 }], under: null })
    expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
    expect(fig.units[0]!.why).toBeNull()
  })
  it('reads no line of a run turned under the join: "Project Page:" and an address so turned are no one text', () => {
    // (figure-lines.ts:459's `Math.abs(u.uy ?? 0) > 1e-6`; level, the two runs are one text, F0's)
    const parts: Part[] = [
      { text: ' Project Page: ', font: 'LMSans10-Bold' },
      { text: 'coworkos-ai.github.io', font: 'LMMono10-Regular' },
    ]
    const MONO = new Set(['LMMono10-Regular'])
    const level = linesPage([parts])
    expect(figureLinesOf([level.page], level.fig, () => false, MONO).map((t) => t.ks)).toEqual([[0, 1]])
    const slight = linesPage([parts])
    Object.assign(slight.fig.units[1]!, SLIGHT_DIR)
    expect(figureLinesOf([slight.page], slight.fig, () => false, MONO).map((t) => t.ks)).toEqual([])
  })
})

/** a unit of kind and text (packages/engine/tests/ink.test.ts's form) */
const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId(kind, content), kind, content }
}
/** an instrument over B whose units own B's glyphs line by line (`own[p][line]`, -1 none), each line's glyphs of its role
 *  (`roles[p][line]`, text by default) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][], roles: number[][] = []): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = roles[p]?.[g.n] ?? ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** A's pages as pageInk would give them (read.ts `raw`): its glyphs, boxes and their kinds, its turned glyphs */
const rawOf = (doc: Doc): PageInk[] =>
  doc.pages.map(
    (pg) =>
      ({
        glyphs: pg.glyphs.map((g) => ({ ...g })),
        boxes: pg.boxes,
        paths: pg.kinds,
        boxAt: pg.boxAt,
        points: [],
        paras: [],
        paraEnds: [],
        regions: [],
        turned: (pg.turned ?? []).map((t) => ({ ...t })),
        pictures: [],
        shapes: new Map(),
        figures: new Map(),
        unseen: new Set(),
        cut: new Map(),
        capped: false,
        timedOut: false,
        degraded: false,
        mergedAt: null,
        rotated: false,
      }) as unknown as PageInk,
  )

describe('a figure text’s direction (locate/ink.ts inkOf)', () => {
  it('states the direction of a figure text turned under the run join, its direction along within 1e-6 of 1', () => {
    // (locate/ink.ts:518's `Math.abs(uy) > 1e-6`: an included figure's "W" set turned by 0.0573 degrees, its "ord here" level
    // after it on its baseline, one figure text of A whose partners on B are a form's; its direction to four places, 1 and 0.001)
    const docWith = (): Doc => {
      const d = docOf([{ lines: ['a paragraph', { text: 'ord here', x: 80, y: 640, form: true }] }])
      const pg = d.pages[0]!
      pg.turned = [
        {
          u: 'W',
          code: 87,
          base: 'CMR10',
          n: 1,
          k: 10,
          at: 11,
          box: -1,
          ox: 72,
          oy: 640,
          ex: 72 + 8 * SLIGHT_DIR.ux,
          ey: 640 + 8 * SLIGHT_DIR.uy,
          ...SLIGHT_DIR,
          size: 10,
          ascent: 0.7,
          descent: -0.2,
          form: true,
        },
      ]
      return d
    }
    const B = docWith()
    const A = docWith()
    // (pageInk names a turned glyph's font, as a level one's: the line's)
    const pages = rawOf(A)
    Object.assign(pages[0]!.turned![0]!, { font: 'ABCDEF+CMR10' })
    const L = locate(instrumentOf(B, [unitOf('para', 'a paragraph')], [[0, -1]]), A, align(B, A), { pages })
    const figures = L.units.filter((u) => u.kind === 'inkfigures')
    expect(figures.map((u) => [u.content, u.figure?.dir])).toEqual([[[{ t: 'text', s: 'Word here' }], [1, 0.001]]])
  })
})

describe('a figure run’s glyphs and the run before it (figure-text.ts figureUnitsOf, streamOf)', () => {
  /** a TikZ picture page (its points `zs` and `ze` round every glyph) of level glyphs, turned ones and their boxes */
  const picture = (glyphs: object[], turned: object[] = [], boxes: number[] = []) =>
    ({
      glyphs,
      turned,
      boxes,
      shapes: new Map(),
      paths: boxes.filter((_, i) => i % 4 === 0).map(() => -4),
      figures: new Map([['0:0', [0, 0, 300, 300]]]),
      pictures: [
        { name: 'zs', glyph: 0, box: 0 },
        { name: 'ze', glyph: glyphs.length, box: boxes.length / 4 },
      ],
      points: [],
      view: [0, 0, 300, 300],
    }) as never
  /** level glyphs of `text` from (x, y), 5 wide each, of size `size`, their ink 0.7 of it up and 0.2 down unless `ink` says */
  const level = (text: string, x: number, y: number, size = 10, ink: [number, number] = [0.7, -0.2], n = 1) =>
    [...text].map((u, i) => ({
      u,
      n,
      k: i,
      x0: x + (size / 2) * i,
      x1: x + (size / 2) * (i + 1),
      ix0: x + (size / 2) * i,
      ix1: x + (size / 2) * (i + 1),
      y,
      top: y + ink[0] * size,
      bottom: y + ink[1] * size,
      size,
      font: 'ArialMT',
      fill: 0,
    }))
  it('sets a level word right after a run turned 1.8 degrees from its middle, as no line going on from that run', () => {
    // (figure-text.ts:770's `Math.abs(x.uy - pf!.uy) < 1e-3`: a capital at 40 pt set turned 1.8 degrees, its direction along
    // within 1e-3 of the level's, across not; "Word" level at 10 pt on its baseline 20 past its end, within a run's gap of the
    // capital's size and past the anchor's reach of its own: TeX's line going on from the capital would set it from its start)
    const a = (1.8 * Math.PI) / 180
    const c = Math.cos(a),
      s = Math.sin(a)
    const cap = { u: 'A', n: 0, k: 0, ox: 100, oy: 100, ex: 100 + c * 25, ey: 100 + s * 25, ux: c, uy: s, size: 40 }
    const turned = [{ ...cap, ascent: 0.7, descent: -0.2, font: 'ArialMT', fill: 0, box: 0, at: 0, pt: 1 }]
    const boxes = [100 - 8 * s, 99, cap.ex + 1, cap.ey + 28]
    const units = figureUnitsOf([picture(level('Word', 100 + c * 45, 100 + s * 45), turned, boxes)], null).units
    expect(units.map((u) => [u.text, u.anchor])).toEqual([['Word', 'centre']])
  })
  it('reads a glyph set under a millionth of a point at the floor’s size: its ink in sizes of 1e-6, never a division by its own', () => {
    // (figure-text.ts:500-501's `Math.max(x.size, 1e-6)`: a word of 1e-7 pt (a text matrix of 1e-8 at 10 pt) whose ink stands 5
    // of its sizes up, or down: read in sizes of 1e-6, 0.5 of them, no glyph outsized (BAND_MAX 4); by its own size, outsized)
    for (const ink of [
      [5, -0.2],
      [0.7, -5],
    ] as [number, number][]) {
      const fig = figureUnitsOf([picture(level('Word', 100, 100, 1e-7, ink))], null)
      expect([fig.units.map((u) => u.text), fig.stats?.outsized], String(ink)).toEqual([['Word'], 0])
    }
  })
})

describe('a babel name that leads a unit, in its flow (locate/flows.ts flowsAndTies)', () => {
  /** "Proof" leading its theorem on B's line 700 ("Proof", the label ".", its text); A as B, or with the label and the text
   *  `aDy` lower; "Appendix", another name, before it on its line where `appendix` */
  const caseOf = (aDy: number, appendix: boolean, labelAt = 102) => {
    const lines = (dy: number) => [
      ...(appendix ? [{ text: 'Appendix', y: 700 }] : []),
      { text: 'Proof', x: appendix ? 126 : 72, y: 700 },
      { text: '.', x: labelAt, y: 700 - dy },
      { text: 'The claim holds', x: labelAt + 10, y: 700 - dy },
      { text: 'on the next line', y: 688 - dy },
    ]
    const B = docOf([{ lines: lines(0) }])
    const A = docOf([{ lines: lines(aDy) }])
    const units = [
      ...(appendix ? [{ ...unitOf('name', 'Appendix'), name: 'appendix' }] : []),
      { ...unitOf('name', 'Proof'), name: 'proof' },
      unitOf('theorem', '. The claim holds on the next line'),
    ]
    const a = appendix ? 1 : 0
    const own = [[...(appendix ? [0] : []), a, a + 1, a + 1, a + 1]]
    const roles = [[...(appendix ? [ROLE.name] : []), ROLE.name, ROLE.label, ROLE.text, ROLE.text]]
    const L = locate(instrumentOf(B, units, own, roles), A, align(B, A))
    const of = (pred: (m: (typeof L.members)[number]) => boolean) => L.members.find(pred)!
    return {
      L,
      name: of((m) => m.kind === 'name' && m.name === 'proof'),
      para: of((m) => m.kind === 'theorem'),
      other: appendix ? of((m) => m.name === 'appendix') : null,
    }
  }
  it('keeps the name in its own flow where A sets its unit’s first line off the name’s baseline, after the name', () => {
    // (flows.ts:301's `Math.abs(f[4] - l[4]) > 0.5`: B binds "Proof" to its theorem, leadAt's 0.5 pt; A, arXiv's compile, sets
    // the label and the text 6 pt lower, after the name (past the half size a flow shares a line by): not the name's line there)
    const same = caseOf(0, false)
    expect(same.L.flows.find((f) => f.includes(same.para.ord))).toEqual([same.name.ord, same.para.ord])
    const off = caseOf(6, false)
    expect(off.L.flows.find((f) => f.includes(off.name.ord))).toEqual([off.name.ord])
  })
  it('drops the size tie of the flow a bound name leaves where one member is left in it', () => {
    // (flows.ts:313's `tie.ords.length < 2`: "Appendix" and "Proof" share their line's flow, the theorem's label stands more
    // than SHARED_SEP of the size after "Proof" (its own flow); "Proof" leads it and leaves the flow, "Appendix" alone in it)
    const { L, name, para, other } = caseOf(0, true, 190)
    expect(L.flows.find((f) => f.includes(para.ord))).toEqual([name.ord, para.ord])
    expect(L.flows.find((f) => f.includes(other!.ord))).toEqual([other!.ord])
    expect(L.ties.filter((t) => t.rule === 'size' && t.ords.length < 2)).toEqual([])
  })
})

describe('a unit of turned glyphs, placed (locate/place.ts place)', () => {
  /** a caption and a y-axis title "Loss" set turned (pageInk's `turned`) from (60 + dx, 400 + dy) */
  const withTurned = (dx: number, dy: number) => {
    const d = docOf([{ lines: ['a caption under it'] }])
    d.pages[0]!.turned = [...'Loss'].map(
      (u, j): DocTurned => ({
        u,
        code: u.codePointAt(0) as number,
        base: 'CMR10',
        n: 1,
        k: j,
        at: 18,
        box: -1,
        ox: 60 + dx,
        oy: 400 + 6 * j + dy,
        ex: 60 + dx,
        ey: 406 + 6 * j + dy,
        ux: 0,
        uy: 1,
        size: 10,
        ascent: 0.7,
        descent: -0.2,
        form: false,
      }),
    )
    return d
  }
  const placeOf = (dx: number, dy: number) => {
    const B = withTurned(0, 0)
    const A = withTurned(dx, dy)
    const units = [
      unitOf('caption', 'a caption under it'),
      { ...unitOf('inkfigures', 'Loss'), figure: { set: 0, dir: [0, 1] } } as InstrumentUnit,
    ]
    const ins: Instrument = {
      ...instrumentOf(B, units, [[0]]),
      turned: [
        { unit: Int32Array.from([1, 1, 1, 1]), role: Uint8Array.from([1, 1, 1, 1]), piece: new Int32Array(4).fill(-1) },
      ],
    }
    const m = locate(ins, A, align(B, A)).members[1]!
    return [m.located, m.place]
  }
  it('says it shifted where A sets its glyphs a point across or up from B’s', () => {
    // (place.ts:195's `Math.abs(ta.ox - tb.ox) > 0.01` and `Math.abs(ta.oy - tb.oy) > 0.01`: arXiv's compile places the title
    // a point off ours, across, or up alone)
    expect(placeOf(0, 0)).toEqual([true, 'same'])
    expect(placeOf(1, 0)).toEqual([true, 'shifted'])
    expect(placeOf(0, 1)).toEqual([true, 'shifted'])
  })
})

/** a page as the ledger reads one: lines of words, each [text, font], 5 pt a character at size 10 (`size`, scaled), from x 72
 *  on its baseline; the marks' points */
function ledgerPage(
  lines: { words: [string, string][]; y: number; size?: number; x?: number }[],
  points: { name: string; glyph: number }[] = [],
) {
  const glyphs: Record<string, unknown>[] = []
  for (const l of lines) {
    const size = l.size ?? 10
    let x = l.x ?? 72
    for (const [w, font] of l.words) {
      for (const ch of w) {
        if (ch !== ' ')
          glyphs.push({
            u: ch,
            x0: x,
            x1: x + size / 2,
            ix0: x,
            ix1: x + size / 2,
            y: l.y,
            top: l.y + 0.7 * size,
            bottom: l.y - 0.2 * size,
            size,
            font,
            fill: 0,
          })
        x += size / 2
      }
      x += size / 2
    }
  }
  const page = {
    glyphs,
    boxes: [],
    paths: [],
    points: points.map((p) => ({ ...p, box: 0 })),
    paras: [],
    paraEnds: [],
    view: [0, 0, 612, 792],
  }
  return { page, own: glyphs.map(() => null) }
}
const RM = 'ABCDEF+CMR10',
  TT = 'ABCDEF+CMTT10'
type LedgerOut = { lines: { cls: string; gs: number[] }[] }
const ledgerOfPage = (p: ReturnType<typeof ledgerPage>, units: { kind: string; pieces: [] }[] = []) =>
  ledgerOf([p.page] as never, { glyphs: [p.own] } as never, { units }) as unknown as LedgerOut

describe('the ledger’s lines (locate/ledger.ts ledgerOf)', () => {
  it('reads a bibliography set under 5 pt at 5 pt where its last entry runs on past its end mark', () => {
    // (ledger.ts:511's `Math.max(ending.size, x.size, 5)`: the last entry at 4 pt, its DOI a line 7 pt under its end mark,
    // within ENTRY_DY of 5 pt (8), past ENTRY_DY of 4 (6.4): the entry's line, the references' zone)
    const p = ledgerPage(
      [
        { words: [['Ann Lee. A title of it.', RM]], y: 700, size: 4 },
        { words: [['doi: 10.1000/xyz', RM]], y: 693, size: 4 },
        { words: [['A paragraph after it', RM]], y: 640 },
      ],
      [
        { name: '0s', glyph: 0 },
        { name: '0e', glyph: 18 },
      ],
    )
    expect(ledgerOfPage(p, [{ kind: 'reference', pieces: [] }]).lines.map((l) => l.cls)).toEqual([
      'references',
      'references',
      'orphan',
    ])
  })
  it('reads a glyph under a millionth of a point at the floor’s size: two words of one line 1e-6 apart', () => {
    // (ledger.ts:587's `Math.max(x.size || 0, 1e-6)`: a line set at 1e-7 pt, its words 1e-6 apart, within LINE_GAP of 1e-6
    // (4e-6), past LINE_GAP of their own size (4e-7): one line)
    const s = 1e-7
    const p = ledgerPage([{ words: [['ab', RM]], y: 700, size: s }])
    const g = p.page.glyphs
    g.push({ ...g[1]!, u: 'c', x0: Number(g[1]!.x1) + 1e-6, x1: Number(g[1]!.x1) + 1e-6 + s / 2 })
    g.push({ ...g[2]!, u: 'd', x0: Number(g[2]!.x1), x1: Number(g[2]!.x1) + s / 2 })
    p.own.push(null, null)
    expect(ledgerOfPage(p).lines.map((l) => l.gs)).toEqual([[0, 1, 2, 3]])
  })
})

describe('an ink unit’s rows (locate/ink-units.ts inkUnitsOf, rowsOf)', () => {
  const rowsOf = (p: ReturnType<typeof ledgerPage>) =>
    (
      inkUnitsOf([p.page] as never, ledgerOfPage(p) as never, { units: [], from: 0 }) as unknown as {
        kind: string
        rows: { lines: (number | string)[]; ph: unknown[][] }
      }[]
    ).map((u) => [u.kind, u.rows])
  /** a bibliography entry (its point `bi1`) whose address in a face of one pitch runs over `n` lines */
  const addressOver = (n: number) =>
    ledgerPage(
      [
        {
          words: [
            ['See the page', RM],
            ['https://example.org/a', TT],
          ],
          y: 700,
        },
        ...Array.from({ length: n - 2 }, (_, i) => ({
          words: [[`b${i}/a/long/path/of/it`, TT]] as [string, string][],
          y: 688 - 12 * i,
        })),
        {
          words: [
            ['tail/end.html', TT],
            ['for more words', RM],
          ],
          y: 700 - 12 * (n - 1),
        },
      ],
      [{ name: 'bi1', glyph: 0 }],
    )
  it('states no placeholder of an address over five lines, one over four: an inline placeholder’s segments at most', () => {
    // (ink-units.ts SEGS_INLINE, 4: an address broken over five lines of a bibliography entry, an inline element of more segments
    // than the layout file draws one in, is no placeholder; over four it is one, its four segments)
    const [[kind5, rows5]] = rowsOf(addressOver(5)) as [[string, { ph: unknown[][] }]]
    expect([kind5, rows5.ph]).toEqual(['inkreferences', []])
    const [[, rows4]] = rowsOf(addressOver(4)) as [[string, { ph: unknown[][] }]]
    expect(rows4.ph.map((r) => [r[1], (r.length - 3) / 6])).toEqual([['url', 4]])
  })
  it('states a line set at 250 pt at 200, the row’s size at most', () => {
    // (ink-units.ts rowsOf's `Math.min(200, size)`: a line of an orphan block set at 250 pt, a poster's)
    const [[, rows]] = rowsOf(ledgerPage([{ words: [['Huge words here', RM]], y: 400, size: 250, x: 10 }])) as [
      [string, { lines: (number | string)[] }],
    ]
    expect(rows.lines[6]).toBe(200)
  })
})

describe('a group’s style read off its command (locate/ink.ts groupStyleOf), the instrument’s', () => {
  it('reads each command of the instrument’s table as the instrument does, a link’s among them', () => {
    // (locate/ink.ts SPAN_STYLES#4, the link's commands, \href, \url, \hyperlink, \hyperref (hyperref's): each entry the
    // instrument's table holds (instrument/instrument.ts SPAN_STYLES, the same seven), read alike; a command of neither, other)
    const commands = [
      ...[
        'textbf',
        'bfseries',
        'bf',
        'mathbf',
        'boldsymbol',
        'textit',
        'itshape',
        'it',
        'emph',
        'em',
        'textsl',
        'slshape',
      ],
      ...['sl', 'texttt', 'ttfamily', 'tt', 'verb', 'lstinline', 'textsc', 'scshape', 'href', 'url', 'hyperlink'],
      ...['hyperref', 'textcolor', 'color', 'colorbox', 'underline', 'uline', 'textup', 'mbox'],
    ]
    for (const c of commands) {
      const src = `\\${c}{`
      const [span] = piecesOf([
        { t: 'open', id: 1, src },
        { t: 'text', s: 'words' },
        { t: 'close', id: 1, src: '}' },
      ]) as { style?: string }[]
      expect(groupStyleOf(src), c).toBe(span!.style)
    }
    expect(['href', 'url', 'hyperlink', 'hyperref'].map((c) => groupStyleOf(`\\${c}{x}`))).toEqual([
      'link',
      'link',
      'link',
      'link',
    ])
  })
})

describe('B packed without its images’ pixels (sparse.ts pack)', () => {
  it('refuses a document past 4 GiB before it reads a byte: the header holds its size in 32 bits', () => {
    // (sparse.ts U32: a document of 2^32 bytes, its one hole all of it; a stand-in of that length, which pack reads first)
    const bytes = { length: 2 ** 32 } as unknown as Uint8Array
    expect(() => pack(bytes, [[0, 2 ** 32]])).toThrow(/a document of 4294967296 bytes: a pack holds at most 4294967295/)
  })
})
