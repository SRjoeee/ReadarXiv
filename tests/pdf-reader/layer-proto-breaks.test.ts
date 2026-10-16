import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { askPage, build, type Built, installStubs, line, type Line, openRun, type Paper, para, runSnap, shuffled } from './helpers/order-paper'

// A forced break inside a frame (the 2608.16117 survey's fix 3, corrected 2026-10-16): the laid line ends there and TeX's
// room after it (the empty line `\\ \\` sets, none for a lone `\\`) is left in the drawing's pitches, the rows on both
// sides of the gap one block. The room is a function of the unit's own rows in the layout file, so a page's drawing is
// the same whichever page is asked first: each page's markup, operations, fill numbers, word table and unit records,
// asked in reverse, the last first, in three seeds' orders and each alone, equal the page asked in order (the order
// tests' X1, layer-proto-order.test.ts, over a paper of their helper's shape with two such units)

beforeAll(() => { installStubs() })

const BR = '\\\\'
const CJK = (n: number, from: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
/** a unit's lines from [page, baseline, short] (a short line ends at 45, a full one at 85, the order papers' measure) */
const linesOf = (rows: [number, number, boolean?][]): Line[] => rows.map(([page, b, short], i) => (short ? line(page, b, 'Alpha', 20, 45) : line(page, b, `Alpha beta ${page}${i % 10}`, 20, 85)))
/** the units with a forced break inside a frame: their translation's pieces, the break between two of its texts */
const BREAKS = new Map<number, { t: string; tr?: true; s?: string; src?: string; k?: number }[]>([
  // `\\ \\` on page 2 of a unit from page 1: TeX's first paragraph six lines, the empty line, four lines; the translation's
  // first paragraph five lines of six characters, its second four
  [1, [{ t: 'text', tr: true, s: CJK(30, 0x4e00) }, { t: 'ph', src: BR, k: 1 }, { t: 'ph', src: BR, k: 2 }, { t: 'text', tr: true, s: CJK(24, 0x5100) }]],
  // a lone `\\` on page 3
  [3, [{ t: 'text', tr: true, s: CJK(12, 0x5300) }, { t: 'ph', src: BR, k: 1 }, { t: 'text', tr: true, s: CJK(12, 0x5500) }]],
])
const paper: Paper = {
  name: 'breaks', pages: 3,
  specs: [
    para(0, [[1, 270, 4]], 18),
    { id: 1, kind: 'para', lines: linesOf([[1, 200], [1, 188], [1, 176], [1, 164], [2, 270], [2, 258, true], [2, 234], [2, 222], [2, 210], [2, 198]]), chars: 0, at: 0 },
    para(2, [[2, 150, 3]], 14),
    { id: 3, kind: 'para', lines: linesOf([[3, 270], [3, 258, true], [3, 246], [3, 234]]), chars: 0, at: 0 },
    para(4, [[3, 150, 2]], 10),
  ],
}

/** the paper built, its break units' rows given their pieces and their lines one frame a page, as TeX's file has them */
function built(): Built {
  const P = build(paper)
  for (const [id, pieces] of BREAKS) (P.rows.get(id) as { pieces: unknown }).pieces = pieces
  const layout = P.layout as unknown as { units: number[][]; frames: [number, number[]][] }
  // (the source's pieces: a text, the break's pieces, a text)
  layout.units = layout.units.map(u => (BREAKS.has(u[0]!) ? [...u.slice(0, 4), BREAKS.get(u[0]!)!.length] : u))
  layout.frames =layout.frames.map(([id, rows]) => {
    if (!BREAKS.has(id)) return [id, rows]
    const ls = paper.specs.find(s => s.id === id)!.lines, out: number[] = []
    ls.forEach((l, j) => { if (!j || l.page !== ls[j - 1]!.page) out.push(l.page, 0, j, 0, out.length ? 0 : -1, 0); out[out.length - 3]! += 1 })
    return [id, out]
  })
  P.index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(P.layout))))
  return P
}
async function ask(order: number[]) {
  const run = await openRun(built())
  const snaps = new Map<number, ReturnType<typeof runSnap>>()
  for (const p of order) { await askPage(run, p); snaps.set(p, runSnap(run, p)) }
  return { run, snaps }
}
const ALL = [1, 2, 3]

describe('a forced break inside a frame: its room is the unit\'s own, and the page the same in any order', () => {
  it('leaves TeX\'s room after `\\\\ \\\\` and none after a lone `\\\\`, each page equal whichever page is asked first', async () => {
    const { run: want, snaps: wanted } = await ask(ALL)
    expect({ laid: want.stats.length, left: want.skipped.map(x => `${x.id}:${x.why}`) }).toEqual({ laid: 5, left: [] })
    const linesOn = (id: number, p: number) => ((want.stats.find(x => x.id === id)?.lines ?? []) as number[][]).filter(l => l[0] === p).map(l => l[1] as number)
    const gaps = (bs: number[]) => bs.slice(1).map((b, i) => Math.round((bs[i]! - b) * 100) / 100)
    // unit 1 on page 2: its first paragraph's last line, then two pitches (the empty line), then the second paragraph on
    // one pitch, its unused room at the unit's end
    const g1 = gaps(linesOn(1, 2)), pitch = g1.at(-1)!
    expect(g1[0]).toBeCloseTo(2 * pitch, 1)
    expect(g1.slice(1).every(g => Math.abs(g - pitch) < 0.01)).toBe(true)
    // unit 3: four lines on one pitch, the lone break's none
    const g3 = gaps(linesOn(3, 3))
    expect(g3.length).toBe(3)
    expect(Math.max(...g3) - Math.min(...g3)).toBeLessThan(0.01)
    for (const [how, order] of Object.entries({ reverse: [3, 2, 1], 'last first': [3, 1, 2], 'seed 3': shuffled(ALL, 3), 'seed 11': shuffled(ALL, 11), 'seed 29': shuffled(ALL, 29) })) {
      const { run, snaps } = await ask(order)
      for (const p of ALL) {
        expect(snaps.get(p), `${how} (${order}) page ${p}`).toEqual(wanted.get(p))
        expect(runSnap(run, p), `${how} page ${p} at the end`).toEqual(wanted.get(p))
      }
    }
    for (const p of ALL) expect((await ask([p])).snaps.get(p), `page ${p} alone`).toEqual(wanted.get(p))
  })
})
