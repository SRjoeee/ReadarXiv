import { describe, expect, it } from 'vitest'
import { wholeFrontier } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { groupsOfUnits } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { needBound } from '@/pdf-reader/engine/layer-proto/need.mjs'
import type { LayoutFile } from '@/pdf-reader/engine/layout/file.mjs'
import { stubOf } from '@/pdf-reader/engine/layout/make.mjs'
import { frontierStream } from '@/pdf-reader/engine/pipeline/frontier.mjs'
import { type PaperSpec, TOKENS_PER_PAGE, type UnitSpec, type Whole, wholeOf } from './helpers/cut-paper'

// The page stream's K, F and need bounds (pipeline/frontier.mjs) as the pages come: each try's the same as K, F and NB made from
// scratch over the same units, rows and left (cut.mjs wholeFrontier, need.mjs needBound), whatever the try before was, on a paper
// whose units come in page by page, some told and their rows made stubs, as make.mjs's stream gives them; and made again only
// from what changed, so that a paper whose tries change nothing (2610.19159v1: 161 tries, 152 of them over the same K, for 6
// parts) costs a K, and one whose units come in every page reads each unit's rows and pages once a state, not once a try.

type Table = 'units' | 'lines' | 'frames' | 'erase' | 'ph' | 'labels' | 'headings' | 'pageText' | 'held'
const TABLES: Table[] = ['units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held']
type Rows = Record<Table, unknown[][]>

/** a seeded generator (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** a paper of `pages` pages, `per` units a page: left units in page order (some on two pages), layout-only ones, table cells */
function paperOf(pages: number, per: number, seed: number): PaperSpec {
  const next = rng(seed), units: UnitSpec[] = []
  for (let p = 1; p <= pages; p++) for (let k = 0; k < per; k++) {
    const stream = TOKENS_PER_PAGE * (p - 1) + Math.floor((k * TOKENS_PER_PAGE) / per)
    const over = p < pages && next() < 0.15, r = next()
    if (r < 0.1) units.push({ stream: null, lines: [p] })
    else if (r < 0.2) units.push({ stream, rects: [p], lines: [p], cell: { table: p, row: k, col: 0 } })
    else if (r < 0.25) units.push({ stream, rects: [p] })
    else units.push({ stream, rects: over ? [p, p + 1] : [p], lines: over ? [p, p + 1] : [p] })
  }
  return { pages, units }
}

/** the maker's stream as the page pass asks it (make.mjs `layout`, `tell`): each unit's rows the file's, the same rows every
 *  time, until it is told: then its stub, what K reads (make.mjs stubOf). `whole(ids)`: the file's own rows of `ids`, no stub */
function makerOf(whole: Whole) {
  const L = whole.layout as LayoutFile
  const own = new Map<number, Rows>()
  for (const t of TABLES) for (const r of L[t] as unknown as unknown[][]) {
    const id = r[0] as number
    if (!own.has(id)) own.set(id, Object.fromEntries(TABLES.map(x => [x, []])) as unknown as Rows)
    own.get(id)![t].push(r)
  }
  const stubs = new Map<number, Rows>()
  const rowsOf = (id: number) => stubs.get(id) ?? own.get(id) ?? null
  let asked = 0
  return {
    get asked() { return asked },
    layout(ids: readonly number[]) {
      asked += ids.length
      const out: LayoutFile = { ...L, fonts: L.fonts.slice() }
      for (const t of TABLES) (out as Record<Table, unknown[][]>)[t] = ids.flatMap(i => rowsOf(i)?.[t] ?? [])
      return out as LayoutFile
    },
    whole(ids: readonly number[]) {
      const out: LayoutFile = { ...L, fonts: L.fonts.slice() }
      for (const t of TABLES) (out as Record<Table, unknown[][]>)[t] = ids.flatMap(i => own.get(i)?.[t] ?? [])
      return out as LayoutFile
    },
    tell(ids: readonly number[]) {
      for (const i of ids) {
        const r = own.get(i)
        if (!r || stubs.has(i)) continue
        stubs.set(i, stubOf(i, r as never) as unknown as Rows)
      }
    },
  }
}

/** the left as the stream anchors it: the units of the pages anchored so far, a new array of each every time, its rectangles
 *  the same */
function leftOf(whole: Whole) {
  let to = 0
  return {
    pages: whole.left.pages,
    anchor(page: number) { to = page },
    units: () => whole.left.units.filter(w => w[1] < TOKENS_PER_PAGE * to).map(w => [w[0], w[1], w[2]] as typeof w),
    done: (id: number) => { const w = whole.left.units.find(x => x[0] === id); return !w || w[1] < TOKENS_PER_PAGE * to },
  }
}

/** where two values first differ (numbers by Object.is, sets in order), or null */
function differ(a: unknown, b: unknown, at = ''): string | null {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b) ? null : at
  if (a === b) return null
  if (a instanceof Set || b instanceof Set) return a instanceof Set && b instanceof Set ? differ([...a], [...b], `${at}<set>`) : at
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return ArrayBuffer.isView(a) && ArrayBuffer.isView(b) ? differ([...(a as Int32Array)], [...(b as Int32Array)], at) : at
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!(Array.isArray(a) && Array.isArray(b)) || a.length !== b.length) return `${at}.length`
    for (let k = 0; k < a.length; k++) { const d = differ(a[k], b[k], `${at}[${k}]`); if (d) return d }
    return null
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.join() !== kb.join()) return `${at}{${ka.join()} | ${kb.join()}}`
    for (const k of ka) { const d = differ((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`); if (d) return d }
    return null
  }
  return at
}

/**
 * The page pass's tries over a paper: after page t the left anchored to `leftTo(t)`, the maker's units settled to `settledTo(t)`
 * (a unit settled once its last line's page is), K asked twice (the page pass asks again after a part), and every `cutEvery`
 * pages the prefix of K to F(t) told. `check`: each try's K, F and NB against them made from scratch
 */
function drive(spec: PaperSpec, o: { leftTo: (t: number) => number; settledTo: (t: number) => number; cutEvery: number; check: boolean; shape?: (lines: Map<number, number[]>) => void }) {
  const whole = wholeOf(spec), N = spec.pages, grouped = groupsOfUnits(whole.units)
  // (every third unit's last line ends where the next unit's first begins, on its baseline: a shared line, the next one's lead,
  // rowLeadOf, which K's `follows` reads, and where one of the two is only the file's, its slot, need.mjs lineAfterOf; a stub
  // keeps the two lines it reads)
  const lines = new Map((whole.layout as LayoutFile).lines.map(e => [e[0], e[1] as number[]]))
  for (const [id, rows] of lines) {
    const b = lines.get(id + 1)
    if (b && id % 3 === 0 && rows[rows.length - 8] === b[0]) { rows[rows.length - 6] = 300; b[1] = 305 }
  }
  o.shape?.(lines)
  const st = makerOf(whole), left = leftOf(whole)
  const fs = frontierStream({ paper: whole.paper, N, bundle: whole.units, grouped, left, st })
  const lastLine = spec.units.map(u => Math.max(0, ...(u.lines ?? [])))
  let tries = 0
  for (let t = 1; t <= N; t++) {
    left.anchor(o.leftTo(t))
    const ids: number[] = []
    for (let i = 0; i < spec.units.length; i++) if (left.done(i) && (lastLine[i] ?? 0) <= o.settledTo(t)) ids.push(i)
    for (let again = 0; again < 2; again++) {
      tries++
      const got = fs.of(ids)
      if (o.check) {
        const want = wholeFrontier({ paper: whole.paper, base: whole.base, units: whole.units, left: { pages: left.pages, units: left.units() }, layout: st.layout(ids) }, undefined, grouped)
        const d = differ(got.K, want.K, 'K') ?? differ(got.F, want.F, 'F') ?? differ(got.NB, needBound(want.K, N), 'NB')
        expect(d, `page ${t}, try ${again}`).toBeNull()
        // (and K as the whole file gives it, its told units' stubs aside: each entry's slot and its lead on a shared line, which
        // a stub of its pages alone lost, so that a unit only the file holds, told beside its line's other unit, took its slot by
        // the ids in the parts after its own, and the stream's K there was not the whole's: 2610.21884v1)
        const full = wholeFrontier({ paper: whole.paper, base: whole.base, units: whole.units, left: { pages: left.pages, units: left.units() }, layout: st.whole(ids) }, undefined, grouped)
        const key = (K: typeof got.K) => K.map(e => [e.id, e.slot, e.follows])
        expect(differ(key(got.K), key(full.K), 'K'), `page ${t}, try ${again}, against the whole file`).toBeNull()
      }
      if (again === 0 && t % o.cutEvery === 0) {
        const told = got.K.slice(0, (got.F[t] ?? -1) + 1).map(e => e.id)
        st.tell(told)
        fs.told(told)
      }
    }
  }
  return { work: fs.work, tries, units: spec.units.length, asked: st.asked }
}

describe('the page stream\'s K, F and need bounds as its pages come', () => {
  it('are on every try those made from scratch, units coming in, settled, told and made stubs, on papers of several shapes', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const spec = paperOf(24, 6, seed)
      // (the left a page ahead of the maker, the maker two behind and stuck for a while, a part told every third page)
      drive(spec, { leftTo: t => Math.min(spec.pages, t + 1), settledTo: t => (t > 6 && t < 14 ? 4 : t - 2), cutEvery: 3, check: true })
      drive(spec, { leftTo: t => t, settledTo: t => t, cutEvery: 1, check: true })
      drive(spec, { leftTo: t => (t < spec.pages ? 1 : t), settledTo: t => (t < spec.pages ? 0 : t), cutEvery: 5, check: true })
    }
  })

  it('keeps a chain of units only the file holds, told in an earlier part, where the whole file places it (a left unit, two of the file\'s, one line)', () => {
    // (each page: a paragraph of two lines, then A (the left's), B and C (the file's alone) on one line, then D on the next;
    // a caption numbered first and set at the paper's end, so that by the ids B and C would stand after it)
    const pages = 8, units: UnitSpec[] = [{ stream: TOKENS_PER_PAGE * pages - 1, rects: [pages], lines: [pages], kind: 'caption' }]
    const chain: [number, number, number][] = []
    for (let p = 1; p <= pages; p++) {
      const at = TOKENS_PER_PAGE * (p - 1)
      units.push({ stream: at, rects: [p], lines: [p], perPage: 2 })
      chain.push([units.length, units.length + 1, units.length + 2])
      units.push({ stream: at + 8, rects: [p], lines: [p] }, { stream: null, lines: [p], heading: 'B' }, { stream: null, lines: [p] }, { stream: at + 12, rects: [p], lines: [p] })
    }
    const shape = (lines: Map<number, number[]>) => {
      for (const [a, b, c] of chain) {
        const put = (id: number, x0: number, x1: number, y: number) => lines.get(id)!.splice(0, 8, lines.get(id)![0]!, x0, x1, y, y + 8, y - 2, 10, 0)
        put(a, 72, 130, 600); put(b, 140, 200, 600); put(c, 210, 260, 600); put(c + 1, 72, 540, 588)
      }
    }
    // (every page told as it comes, and every third; the maker a page behind)
    drive({ pages, units }, { leftTo: t => t, settledTo: t => t, cutEvery: 1, check: true, shape })
    drive({ pages, units }, { leftTo: t => Math.min(pages, t + 1), settledTo: t => t - 1, cutEvery: 3, check: true, shape })
    // (and K over the whole file is the line's order: A, B, C, each right after the one before it on the line)
    const whole = wholeOf({ pages, units })
    const lines = new Map((whole.layout as LayoutFile).lines.map(e => [e[0], e[1] as number[]]))
    shape(lines)
    const K = wholeFrontier(whole, undefined, groupsOfUnits(whole.units)).K
    for (const [a, b, c] of chain) {
      const k = (id: number) => K.findIndex(e => e.id === id)
      expect([k(b) - k(a), k(c) - k(b), K[k(b)]!.follows, K[k(c)]!.follows]).toEqual([1, 1, a, b])
    }
  })

  it('makes K again only when what it is made of changed: tries that change nothing cost nothing (2610.19159v1\'s shape)', () => {
    // 160 pages: the frontier opens early, then the maker and the left stand still for 140 pages (a unit they wait for), as on
    // 2610.19159v1; the page pass tries after every page. From scratch every try made K of every unit: 320 tries × 1,280 units
    const spec = paperOf(160, 8, 9)
    const r = drive(spec, { leftTo: t => (t < 10 || t > 150 ? t : 10), settledTo: t => (t < 10 || t > 150 ? t - 1 : 8), cutEvery: 1000, check: false })
    expect(r.tries).toBe(320)
    expect(r.work.made).toBeLessThanOrEqual(21)
    // (a unit's entry's pages read at most once in each of its states: anchored on the left, its rows made, its rows a stub;
    // its rows asked once made and once told)
    expect(r.work.entries).toBeLessThanOrEqual(3 * r.units)
    expect(r.asked).toBeLessThanOrEqual(r.units)
  })

  it('reads each unit\'s rows and pages once a state when its units come in every page, however many tries', () => {
    // every page settles more units and every third page tells a part: K is made on the first try after each page and the one after
    // each part, but each unit's rows are asked once settled and once told, its entry's pages read as often; from scratch, every
    // one of the 320 tries made K of every unit
    const spec = paperOf(160, 8, 11)
    const r = drive(spec, { leftTo: t => t, settledTo: t => t - 1, cutEvery: 3, check: false })
    expect(r.work.made).toBeLessThanOrEqual(2 * spec.pages)
    expect(r.work.entries).toBeLessThanOrEqual(3 * r.units)
    expect(r.asked).toBeLessThanOrEqual(2 * r.units)
  })
})
