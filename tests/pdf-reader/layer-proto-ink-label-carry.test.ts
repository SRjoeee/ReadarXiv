import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout, UNIT_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { INK_KIND } from '@/pdf-reader/engine/layout/ink-units.mjs'
import { fakeConfig } from './helpers/groups'
import { build, installStubs, line, openRun, type Paper, para } from './helpers/order-paper'

// An ink unit's leading label on a line that is not laid from where TeX set it goes with the line (run.mjs `carried`). REVTeX
// prints an affiliation from its own lists, so 2610.20716v1 p1's "¹Instituto de Física, …" is an ink unit (u254): its raised
// "1" no text of it since PIPELINE 74, its glyph still the unit's own, hidden with its text (an ink unit has no label group). The
// reader keeps that label as the original's ink; TeX centred the line (LAYOUT 37), and the shorter translation, centred alone,
// stood 93 pt right of the "1" left where it was. Centred by the file's flag, by the door's reading of the line, or set flush
// right, the label's ink is now copied as the line's first item (a crop) and erased where it stood; on a line laid from its own
// start it stays where it is, as before.

beforeAll(() => { installStubs() })

type Op = { op: string; page?: number; plane?: string; src?: number[]; dst?: number[]; rects?: number[][] }
/** page 1: paragraph 0, then ink unit 1 (`kind`): its "1" raised at x0 to x0 + 4, its text "Instituto" from x0 + 5 to x1, on
 *  baseline 200; its line (the file's rectangle and erase) from the label on, as an ink unit's own glyphs give it; the unit's
 *  alignment flag `flag`; the document with no label group for it; its translation four characters (40 pt at its 10 pt) */
const built = (flag: number, x0: number, x1: number, kind: string = INK_KIND.orphan) => {
  const paper: Paper = { name: 'ink label', pages: 1, specs: [para(0, [[1, 270, 4]], 30), { id: 1, kind, lines: [line(1, 200, 'Instituto', x0 + 5, x1)], chars: 4, at: 0x4e00 + 64 }] }
  const P = build(paper)
  const layout = P.layout as unknown as { units: number[][]; lines: [number, number[]][]; erase: [number, number[]][] }
  layout.units = layout.units.map(u => (u[0] === 1 ? [u[0], u[1], 1, flag, u[4]] : u)) as never
  layout.lines = layout.lines.map(([id, r]) => (id === 1 ? [id, [r[0]!, x0, ...r.slice(2)]] : [id, r])) as never
  layout.erase = layout.erase.map(([id, r]) => (id === 1 ? [id, [r[0]!, x0, ...r.slice(2)]] : [id, r])) as never
  P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
  // (the label's glyph on the page before the text's: 6 pt, 3.8 pt over the baseline, as REVTeX set the affiliation's mark)
  const getPage = P.doc.getPage
  P.doc.getPage = async (n: number) => {
    const pg = (await getPage(n)) as { getTextContent: () => Promise<{ items: unknown[] }> }
    const tc = pg.getTextContent
    return { ...pg, getTextContent: async () => { const t = await tc(); return { ...t, items: [{ str: '1', transform: [6, 0, 0, 6, x0, 203.8], width: 3.65, height: 6, fontName: 'f1', dir: 'ltr', hasEOL: false }, ...t.items] } } }
  }
  // (our wrapped page holds the unit's text and placeholder groups, no label group: an ink unit's label is its text's)
  Object.defineProperty(P.doc, 'getOptionalContentConfig', { configurable: true, value: async () => fakeConfig({ missing: ['u1.l'] }) })
  return P
}
const laid = async (P: ReturnType<typeof build>) => {
  const run = await openRun(P)
  await run.layFor(1)
  expect(run.recordErrors).toEqual([])
  const rec = run.stats.find(x => x.id === 1)
  const l = (rec?.lines ?? [])[0] as unknown as [number, number, number, boolean, string, number, number, number]
  const ops = (run.rows[0]?.ops ?? []) as Op[]
  return { l, ops, crop: ops.find(o => o.op === 'crop' && o.plane === 'C') }
}

describe('an ink unit\'s leading label goes with a line not laid from its start (2610.20716v1 p1, u254)', () => {
  it('centred by the file\'s flag: the label\'s ink the line\'s first item, label and translation centred on the original\'s middle', async () => {
    const { l, crop } = await laid(built(UNIT_FLAG.CENTRED, 100, 200))
    expect(l[4]).toBe('centred')
    // (the crop from the label's ink, 0.4 pt past its left edge; the label, its gap and the four characters about the middle 150)
    expect(crop?.src?.[0]).toBeCloseTo(99.6, 1)
    expect(((crop?.dst?.[0] ?? 0) + l[7]) / 2).toBeCloseTo(150, 0)
  })
  it('centred by the door\'s reading of its line (no alignment flag): the same', async () => {
    const { l, crop } = await laid(built(0, 100, 200))
    expect(l[4]).toBe('centred')
    expect(crop?.src?.[0]).toBeCloseTo(99.6, 1)
    expect(((crop?.dst?.[0] ?? 0) + l[7]) / 2).toBeCloseTo(150, 0)
  })
  it('flush right: the label stands before the translation at the line\'s right end', async () => {
    const { l, crop } = await laid(built(UNIT_FLAG.FLUSH_RIGHT, 180, 280))
    expect(crop?.src?.[0]).toBeCloseTo(179.6, 1)
    // (label, gap and text end at the line's right edge: the crop 5.4 wide from 0.4 before the label, then 40 pt of text)
    expect(l[7]).toBeCloseTo(280, 0)
    expect(crop?.dst?.[0]).toBeGreaterThan(230)
  })
  it('laid from its own start (justified): the label stays the original\'s ink where it stands, as before', async () => {
    const { crop } = await laid(built(UNIT_FLAG.JUSTIFIED, 20, 280))
    expect(crop).toBeUndefined()
  })
  it('a source unit with no label group keeps its label where it stands: its ink may be no group\'s', async () => {
    const { crop } = await laid(built(UNIT_FLAG.CENTRED, 100, 200, 'para'))
    expect(crop).toBeUndefined()
  })
  it('the ink units\' kinds the run reads are layout/ink-units.mjs\'s', async () => {
    const { INK_UNIT_KINDS } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    expect([...INK_UNIT_KINDS].sort()).toEqual(Object.values(INK_KIND).sort())
  })
})
