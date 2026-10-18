import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, LABEL_KINDS, parseLayout, UNIT_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { build, installStubs, line, openRun, type Paper, para } from './helpers/order-paper'

// A centred heading whose number its class set before it, kept as the original's ink (IEEEtran's "I. INTRODUCTION", 2608.04322):
// the number goes with the centred line, centred with the translation as TeX centred it with the English (run.mjs `carried`:
// its ink copied as the line's first item, a crop). Left where it stood, the shorter translation centred alone stood an em or
// more off it

beforeAll(() => { installStubs() })

/** page 1: paragraph 0 over the measure 20 to 280; heading 1, "I." at 100 to 110 and its title at 120 to 200, centred on the
 *  column (100 to 200: its middle 150), flagged CENTRED; its translation four characters (40 pt at its 10 pt) */
const paper: Paper = { name: 'centred label', pages: 1, specs: [para(0, [[1, 270, 4]], 30), { id: 1, kind: 'heading', lines: [line(1, 200, 'Introduction', 120, 200)], chars: 4, at: 0x4e00 + 64 }] }
const built = () => {
  const P = build(paper)
  const layout = P.layout as unknown as { units: number[][]; labels: number[][] }
  layout.units = layout.units.map(u => (u[0] === 1 ? [u[0], u[1], 1, UNIT_FLAG.CENTRED, u[4]] : u)) as never
  layout.labels = [[1, LABEL_KINDS.indexOf('number'), 1, 100, 200, 110, 207, 198]]
  P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
  // (the number's glyphs on the page, before the title's, as the class set them)
  const getPage = P.doc.getPage
  P.doc.getPage = async (n: number) => {
    const pg = (await getPage(n)) as { getTextContent: () => Promise<{ items: unknown[] }> }
    const tc = pg.getTextContent
    return { ...pg, getTextContent: async () => { const t = await tc(); return { ...t, items: [{ str: 'I.', transform: [10, 0, 0, 10, 100, 200], width: 10, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }, ...t.items] } } }
  }
  return P
}

describe('a centred heading\'s kept number goes with its line', () => {
  it('the number, its gap and the translation one line, centred on the original\'s middle', async () => {
    const run = await openRun(built())
    await run.layFor(1)
    expect(run.recordErrors).toEqual([])
    const rec = run.stats.find(x => x.id === 1)
    const l = (rec?.lines ?? [])[0] as unknown as [number, number, number, boolean, string, number, number, number]
    expect(l[4]).toBe('centred')
    // (the number's ink copied as the line's start, its gap to the title with it: 20 wide, then four characters of 10, 60 wide
    // in all and about the middle 150 of the original's number and title, 100 to 200; the original's ink erased from the number on)
    const ops = (run.rows[0]?.ops ?? []) as { op: string; src?: number[]; dst?: number[]; box?: number[] }[]
    const crop = ops.find(o => o.op === 'crop')
    expect(crop?.src?.[0]).toBeCloseTo(99.6, 1)
    expect(((crop?.dst?.[0] ?? 0) + l[7]) / 2).toBeCloseTo(150, 0)
    expect(ops.some(o => o.op === 'erase' && (o.box?.[0] ?? 999) <= 100)).toBe(true)
  })
})

// A heading of several lines whose class set its number before its first line (kept as the original's ink), set in fewer
// lines: laid again on the original's last lines with its number as the line's start (run.mjs `numbered`: the number's ink
// copied there, a crop, the original's erased), so that the room it frees falls above it (layer-heading-last.test.ts lays
// the lines alone)
const numberedPaper: Paper = {
  name: 'numbered heading', pages: 1,
  specs: [para(0, [[1, 270, 4]], 30), { id: 1, kind: 'heading', lines: [line(1, 200, 'A long heading of two', 40, 200), line(1, 188, 'lines here', 40, 120)], chars: 4, at: 0x4e00 + 64 }],
}
const numberedBuilt = () => {
  const P = build(numberedPaper)
  const layout = P.layout as unknown as { units: number[][]; labels: number[][]; frames: [number, number[]][] }
  layout.units = layout.units.map(u => (u[0] === 1 ? [u[0], u[1], 1, 0, u[4]] : u)) as never
  layout.frames = layout.frames.map(([id, rows]) => (id === 1 ? [id, [1, 0, 0, 2, -1, 0]] : [id, rows])) as never
  layout.labels = [[1, LABEL_KINDS.indexOf('number'), 1, 20, 200, 30, 207, 198]]
  P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
  const getPage = P.doc.getPage
  P.doc.getPage = async (n: number) => {
    const pg = (await getPage(n)) as { getTextContent: () => Promise<{ items: unknown[] }> }
    const tc = pg.getTextContent
    return { ...pg, getTextContent: async () => { const t = await tc(); return { ...t, items: [{ str: '1', transform: [10, 0, 0, 10, 20, 200], width: 5, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }, ...t.items] } } }
  }
  return P
}

describe('a numbered heading set in fewer lines goes on its last line with its number', () => {
  it('one line on the second baseline, the number\'s ink copied as its start and erased where it stood', async () => {
    const run = await openRun(numberedBuilt())
    await run.layFor(1)
    expect(run.recordErrors).toEqual([])
    const lines = (run.stats.find(x => x.id === 1)?.lines ?? []) as unknown as [number, number][]
    expect(lines.map(l => l[1])).toEqual([188])
    const ops = (run.rows[0]?.ops ?? []) as { op: string; src?: number[]; dst?: number[]; box?: number[] }[]
    const crop = ops.find(o => o.op === 'crop')
    expect(crop?.src?.[0]).toBeCloseTo(19.6, 1)
    expect(ops.some(o => o.op === 'erase' && (o.box?.[0] ?? 999) <= 20)).toBe(true)
  })
})
