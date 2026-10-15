// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { type Cut, type CutOptions, cutBundle } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { indexOf, mergeParts, type PartChain, partTarget, type ReadPart, type ReadUnitsChunk, readHead, readPart, readUnitsChunk } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { BOXES_BYTES, BOXES_VALUES, pagePlansOf, paperAddon, rangeEntries } from '@/pdf-reader/engine/layout/addon.mjs'
import { REMOVAL, type RemovalManifest } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { chainedAddon, type RemoverAnswer } from '@/pdf-reader/engine/layout/chain.mjs'
import { ANSWER_CAP, ASK_CAP, ASK_VALUES, type AskChain, encodeAsk, encodeEntries, ENTRIES_CAP, ENTRIES_VALUES, readAsk, readEntries } from '@/pdf-reader/engine/layout/chain-wire.mjs'
import { indexLayout, type LayoutIndex, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { alignOf, checkPage, openRemover, PAST_PART, removalEntry, removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf, TAIL_CAP, tailLinks } from '@/pdf-reader/engine/layout/tail.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { oldAlign, type OpList, perturbed } from './helpers/align-oracle'
import { concat, deflate, inflate, open, OPS, PL, SIX, SIX_UNITS, sha256, sixPlans, sixStream, sixWhole } from './helpers/chain-paper'
import { leftPagesOf, type Whole } from './helpers/cut-paper'
import { LAB_ON, LAB_PAPERS, labFiles, PACK } from './helpers/lab-data'
import { layoutOf } from './helpers/layout-of'

// The chained add-on (E3): the remover split from the plan, the plan on the prepare side (PDF.js's ink and the layout file),
// the writing in the remover child (no PDF.js), the exchange between them bounded both ways, and a part's tail chained after
// the parts before it. Here: the payloads and the remover child's answers to anything it is sent

const utf8 = (s: string) => new TextEncoder().encode(s)
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the payloads' types on purpose
type Loose = any
const views = Array.from({ length: 6 }, () => [0, 0, 612, 792])
const first = (bytes: Uint8Array): AskChain => ({ end: bytes.length, xref: startxrefOf(bytes)!, next: null, kids: [], empty: null })
/** an ask for the paper's dirty pages in [from, to] over `chain` */
async function askOf(bytes: Uint8Array, from: number, to: number, chain: AskChain = first(bytes), pdfjs = PDFJS) {
  const { planOf } = await sixPlans(bytes)
  const plans = []
  for (let p = from; p <= to; p++) { const pl = planOf(p); if (pl?.remove) plans.push({ p, ...pl.remove }) }
  return encodeAsk({ from, to, pages: 6, pdfjs, chain, plans })!
}

describe('the ask and the entries: round trips, and every bound refused before JSON.parse', () => {
  it('an ask reads back as written; the entries too; `over` alone', async () => {
    const bytes = await askOf(SIX, 1, 6)
    const ask = readAsk(bytes)
    expect(ask).toMatchObject({ v: 1, pdfjs: PDFJS, from: 1, to: 6, pages: 6, chain: { next: null, kids: [], empty: null } })
    expect(ask.plans.map(x => x.p)).toEqual([1, 4, 5, 6])
    expect(ask.plans[0]!.align.codes.length).toBe(ask.plans[0]!.shows)
    const entries = { page: { 1: { ok: true, units: { 0: [] }, at: { R: 7 } }, 6: { ok: false, refused: 'a form painted more than once' } }, stats: { removed: 9, rules: 0, cut: 9, hidden: 0, refused: 1, forms: 0, streams: 1 }, kids: [21], empty: 17 }
    expect(readEntries(encodeEntries(entries)!)).toEqual({ over: false, ...entries })
    expect(readEntries(encodeEntries({ over: true })!)).toEqual({ over: true })
    expect(ANSWER_CAP).toBe(TAIL_CAP + ENTRIES_CAP + 4096)
  })

  it('refuses past each cap before JSON.parse is called: bytes, values, nesting', () => {
    const parse = vi.spyOn(JSON, 'parse')
    try {
      const over = (fn: () => unknown, why: RegExp) => { parse.mockClear(); expect(fn).toThrow(why); expect(parse).not.toHaveBeenCalled() }
      over(() => readAsk(new Uint8Array(ASK_CAP + 1)), /more than/)
      over(() => readAsk(utf8(`[${'0,'.repeat(ASK_VALUES)}0]`)), /values/)
      over(() => readAsk(utf8('[[[[[[[0]]]]]]]')), /nested/)
      over(() => readEntries(new Uint8Array(ENTRIES_CAP + 1)), /more than/)
      over(() => readEntries(utf8(`[${'0,'.repeat(ENTRIES_VALUES)}0]`)), /values/)
      over(() => readEntries(utf8('[[[[[[0]]]]]]')), /nested/)
      over(() => readAsk(new Uint8Array([0xff, 0xfe])), /UTF-8/)
    } finally { parse.mockRestore() }
    // and the writers give none past them
    expect(encodeEntries({ page: Object.fromEntries(Array.from({ length: 9000 }, (_, i) => [i + 1, { ok: false, refused: 'x'.repeat(30) }])), stats: {}, kids: [], empty: null })).toBeNull()
    const codes = [Array.from({ length: ASK_VALUES }, () => 7)]
    expect(encodeAsk({ from: 1, to: 1, pages: 1, pdfjs: PDFJS, chain: { end: 10, xref: 1, next: null, kids: [], empty: null }, plans: [{ p: 1, shows: 1, units: [], names: [], crops: [], align: { codes, paths: 0 } }] })).toBeNull()
  })

  it('refuses an ask of any other shape, naming where', async () => {
    const good = JSON.parse(new TextDecoder().decode(await askOf(SIX, 1, 6)))
    const later = { end: SIX.length + 100, xref: SIX.length + 50, next: 30, kids: [22, 25], empty: 20 }
    const cases: [string, (v: Loose) => void, RegExp][] = [
      ['a key missing', v => { delete v.pdfjs }, /pdfjs: missing/],
      ['a key past the schema', v => { v.extra = 1 }, /not a key/],
      ['another version', v => { v.v = 2 }, /^v: /],
      ['no version token', v => { v.pdfjs = 'six point three!' }, /pdfjs/],
      ['to before from', v => { v.from = 4; v.to = 3 }, /^to: /],
      ['pages past the paper', v => { v.to = 7 }, /^to: /],
      ['a first chain with kids', v => { v.chain.kids = [3] }, /chain.kids/],
      ['a first chain with an empty stream', v => { v.chain.empty = 3 }, /chain.empty/],
      ['xref past end', v => { v.chain.xref = v.chain.end }, /chain.xref/],
      ['a later chain whose kids are not rising', v => { v.from = 4; v.plans = v.plans.slice(1); v.chain = { ...later, kids: [25, 22] } }, /chain.kids\[1\]/],
      ['a later chain naming the empty stream a kid', v => { v.from = 4; v.plans = v.plans.slice(1); v.chain = { ...later, kids: [20, 22] } }, /chain.kids\[0\]/],
      ['a later chain with more kids than pages before', v => { v.from = 2; v.plans = v.plans.slice(1); v.chain = { ...later, kids: [22, 25] } }, /chain.kids/],
      ['a kid past next', v => { v.from = 4; v.plans = v.plans.slice(1); v.chain = { ...later, kids: [22, 30] } }, /chain.kids\[1\]/],
      ['no plans', v => { v.plans = [] }, /plans/],
      ['a plan outside the part', v => { v.to = 3; v.plans = v.plans.slice(0, 2) }, /plans\[1\].p/],
      ['plans not rising', v => { v.plans = [v.plans[1], v.plans[0]] }, /plans\[1\].p/],
      ['a glyph not a pair', v => { v.plans[0].units[0][1].push(3) }, /plans\[0\].units\[0\]\[1\]/],
      ['a glyph index below 0', v => { v.plans[0].units[0][1][0] = -1 }, /plans\[0\].units\[0\]\[1\]\[0\]/],
      ['a path not an integer', v => { v.plans[0].units[0][2] = [1.5] }, /units\[0\]\[2\]\[0\]/],
      ['a code below -1', v => { v.plans[0].align.codes[0][0] = -2 }, /align.codes\[0\]\[0\]/],
      ['a code as text', v => { v.plans[0].align.codes[0][0] = '72' }, /align.codes\[0\]\[0\]/],
      ['a crop of one list', v => { v.plans[0].crops = [[[0, 1]]] }, /crops\[0\]/],
      ['a unit as an object', v => { v.plans[0].units[0] = { id: 0 } }, /units\[0\]/],
      ['a name with no glyphs', v => { v.plans[0].names = [[0]] }, /names\[0\]/],
      ['shows as text', v => { v.plans[0].shows = '3' }, /shows/],
      ['a prototype\'s key', v => { v.plans[0] = JSON.parse(`{"__proto__":1,${JSON.stringify(v.plans[0]).slice(1)}`) }, /not a key/],
    ]
    for (const [what, change, why] of cases) {
      const v = structuredClone(good)
      change(v)
      expect(() => readAsk(utf8(JSON.stringify(v))), what).toThrow(why)
    }
    expect(() => readAsk('{}' as never)).toThrow(/not bytes/)
  })

  it('refuses entries of any other shape, naming where', () => {
    const good = { v: 1, page: { 1: { ok: true, units: { 0: [72, 690, 80, 700] }, at: { R: 7 } } }, stats: { removed: 1, rules: 0, cut: 1, hidden: 0, refused: 0, forms: 0, streams: 1 }, kids: [21], empty: 17 }
    const cases: [string, (v: Loose) => void, RegExp][] = [
      ['a page key not a page', v => { v.page['0'] = v.page[1] }, /page.0/],
      ['a prototype\'s key', v => { v.page = JSON.parse('{"__proto__":{"ok":false,"refused":"x"}}') }, /page.__proto__/],
      ['a unit key not an id', v => { v.page[1].units = { x: [] } }, /units.x/],
      ['boxes not of four', v => { v.page[1].units[0] = [1, 2, 3] }, /units.0/],
      ['a box past the coordinates', v => { v.page[1].units[0] = [0, 0, 0, 1e6] }, /units.0\[3\]/],
      ['a removed page without its place', v => { delete v.page[1].at }, /at: missing/],
      ['a refused page with units', v => { v.page[1] = { ok: false, refused: 'x', units: {} } }, /not a key/],
      ['a reason too long', v => { v.page[1] = { ok: false, refused: 'x'.repeat(201) } }, /refused/],
      ['a count missing', v => { delete v.stats.forms }, /stats.forms: missing/],
      ['a count past the schema', v => { v.stats.extra = 1 }, /not a key/],
      ['a count below 0', v => { v.stats.cut = -1 }, /stats.cut/],
      ['a kid not a number', v => { v.kids = ['21'] }, /kids\[0\]/],
      ['over beside entries', v => { v.over = true }, /not a key/],
      ['over not true', v => { for (const k of ['page', 'stats', 'kids', 'empty']) delete v[k]; v.over = 1 }, /over/],
    ]
    for (const [what, change, why] of cases) {
      const v = structuredClone(good)
      change(v)
      expect(() => readEntries(utf8(JSON.stringify(v))), what).toThrow(why)
    }
  })
})

describe('the remover child (removerOf): refuses what it is sent wrong, never throws but memory', () => {
  it('answers an ask with the chained tail and its entries, a removed page at N + 1', async () => {
    const { remover } = await sixPlans(SIX)
    const a = await remover.remove(await askOf(SIX, 1, 1))
    if (!a.ok) throw new Error('refused')
    const e = readEntries(a.entries)
    expect(e).toMatchObject({ over: false, page: { 1: { ok: true, at: { R: 7 } } }, kids: [expect.any(Number)] })
    const links = tailLinks(a.tail!)!
    expect(links.prev).toBe(startxrefOf(SIX))
    expect(links.startxref).toBe(SIX.length + links.xrefAt)
    expect((await open(concat([SIX, a.tail!]))).numPages).toBe(7)
    // (asked again, the same answer: it keeps no chain of its own)
    const b = await remover.remove(await askOf(SIX, 1, 1))
    expect(b.ok && Buffer.from(b.tail!).equals(Buffer.from(a.tail!))).toBe(true)
  })

  it('refuses garbage, another PDF.js, another paper\'s pages and a chain not its PDF\'s, and lives', async () => {
    const { remover } = await sixPlans(SIX)
    const NO = { ok: false, why: 'refused' }
    const good = JSON.parse(new TextDecoder().decode(await askOf(SIX, 1, 1)))
    const asks: [string, unknown][] = [
      ['nothing', new Uint8Array(0)], ['random bytes', new Uint8Array(4096).map((_, i) => (i * 131) % 256)], ['a string', 'plans'], ['null', null], ['an object', { length: 3 }],
      ['JSON of another shape', utf8('{"v":1}')], ['JSON cut short', utf8(JSON.stringify(good).slice(0, 200))],
      ['another PDF.js', await askOf(SIX, 1, 1, first(SIX), '5.4.296')],
      ['another paper\'s pages', utf8(JSON.stringify({ ...good, pages: 7 }))],
      ['a first chain at another end', utf8(JSON.stringify({ ...good, chain: { ...good.chain, end: SIX.length + 1 } }))],
      ['a first chain at another xref', utf8(JSON.stringify({ ...good, chain: { ...good.chain, xref: good.chain.xref - 1 } }))],
      ['a later chain with the PDF\'s own numbers', utf8(JSON.stringify({ ...good, from: 2, to: 4, plans: [{ ...good.plans[0], p: 4 }], chain: { end: SIX.length + 900, xref: SIX.length + 800, next: 40, kids: [5], empty: 3 } }))],
      ['a later chain inside arXiv\'s bytes', utf8(JSON.stringify({ ...good, from: 2, to: 4, plans: [{ ...good.plans[0], p: 4 }], chain: { end: SIX.length, xref: 5, next: 40, kids: [30], empty: 20 } }))],
    ]
    for (const [what, ask] of asks) expect(await remover.remove(ask as Uint8Array), what).toEqual(NO)
    // (and it answers the next ask as it would have)
    expect(await remover.remove(await askOf(SIX, 1, 1))).toMatchObject({ ok: true })
    // a PDF it cannot open: every ask refused
    expect(await removerOf({ bytes: utf8('not a PDF'), PL, inflate, deflate }).remove(await askOf(SIX, 1, 1))).toEqual(NO)
    expect(() => removerOf({ bytes: 'x' as never, PL, inflate, deflate })).toThrow(TypeError)
  })

  it('lets a memory-class error through, and refuses on any other of the writing', async () => {
    const ask = await askOf(SIX, 1, 1)
    const oom = removerOf({ bytes: SIX, PL, inflate, deflate: () => { throw new RangeError(ALLOCATION_FAILED) } })
    await expect(oom.remove(ask)).rejects.toThrow(ALLOCATION_FAILED)
    const broken = removerOf({ bytes: SIX, PL, inflate, deflate: () => { throw new RangeError('Invalid typed array length: 9') } })
    expect(await broken.remove(ask)).toEqual({ ok: false, why: 'refused' })
  })

  it('a page whose tail alone passes TAIL_CAP is refused alone, nothing written; several are over', async () => {
    const big = (kib: number) => () => new Uint8Array(kib * 1024)
    const one = await removerOf({ bytes: SIX, PL, inflate, deflate: big(1100) }).remove(await askOf(SIX, 1, 1))
    if (!one.ok) throw new Error('refused')
    expect(one.tail).toBeNull()
    expect(readEntries(one.entries)).toEqual({ over: false, page: { 1: { ok: false, refused: PAST_PART } }, stats: { removed: 0, rules: 0, cut: 0, hidden: 0, refused: 1, forms: 0, streams: 0 }, kids: [], empty: null })
    const two = await removerOf({ bytes: SIX, PL, inflate, deflate: big(600) }).remove(await askOf(SIX, 1, 5))
    expect(two.ok && two.tail === null && readEntries(two.entries)).toEqual({ over: true })
  })
})

describe('the chained writer takes a bad answer as the remover\'s failure, never a throw', () => {
  const corrupt = async (bytes: Uint8Array, change: (a: { tail: Uint8Array | null; entries: Loose }) => { tail: Uint8Array | null; entries: unknown }) => {
    const { planOf, remover } = await sixPlans(bytes)
    const h = chainedAddon({
      N: 6, views, base: { bytes: bytes.length, xref: startxrefOf(bytes)! }, planOf, pdfjs: PDFJS,
      remove: async ({ plans }) => {
        const a = await remover.remove(plans)
        if (!a.ok) return a
        const changed = change({ tail: a.tail, entries: JSON.parse(new TextDecoder().decode(a.entries)) })
        return { ok: true, tail: changed.tail, entries: changed.entries instanceof Uint8Array ? changed.entries : utf8(JSON.stringify(changed.entries)) }
      },
    })
    return h
  }
  const replace = (tail: Uint8Array, from: string, to: string) => { const s = Buffer.from(tail).toString('latin1'); if (!s.includes(from)) throw new Error(`no ${from}`); return new Uint8Array(Buffer.from(s.replace(from, to), 'latin1')) }
  const cases: [string, Parameters<typeof corrupt>[1]][] = [
    ['an entry of a page not asked', a => ({ ...a, entries: { ...a.entries, page: { ...a.entries.page, 2: { ok: false, refused: 'x' } } } })],
    ['an asked page without its entry', a => ({ ...a, entries: { ...a.entries, page: {} } })],
    ['its removed page at another place', a => ({ ...a, entries: { ...a.entries, page: { 1: { ...a.entries.page[1], at: { R: 8 } } } } })],
    ['a unit the plan does not name', a => ({ ...a, entries: { ...a.entries, page: { 1: { ...a.entries.page[1], units: { 0: [], 9: [] } } } } })],
    ['more kids than removed pages', a => ({ ...a, entries: { ...a.entries, kids: [...a.entries.kids, a.entries.kids[0] + 1] } })],
    ['no kids for a removed page', a => ({ ...a, entries: { ...a.entries, kids: [] } })],
    ['the empty stream not the first fresh number', a => ({ ...a, entries: { ...a.entries, empty: a.entries.empty + 1 } })],
    ['a wrong /Prev', a => ({ ...a, tail: replace(a.tail!, `/Prev ${startxrefOf(SIX)}`, `/Prev ${startxrefOf(SIX)! - 1}`) })],
    ['no section at the end', a => ({ ...a, tail: a.tail!.subarray(0, a.tail!.length - 6) })],
    ['no tail for a removed page', a => ({ ...a, tail: null })],
    ['a tail past TAIL_CAP', a => ({ ...a, tail: new Uint8Array(TAIL_CAP + 1) })],
    ['entries not bytes', a => ({ ...a, entries: 'x' as never })],
    ['entries past their cap', a => ({ ...a, entries: new Uint8Array(ENTRIES_CAP + 1) })],
    ['over for one page', () => ({ tail: null, entries: { v: 1, over: true } })],
  ]
  for (const [what, change] of cases) {
    it(what, async () => {
      const h = await corrupt(SIX, change)
      const got = await h.chainAddon(0, { pages: [1, 1] })
      expect(got?.tail).toBeNull()
      expect(got?.manifest.page[1]).toEqual({ ok: false, refused: 'tail not carried: crashed' })
      expect(got?.manifest.stats).toMatchObject({ uncarried: 1 })
      h.acceptAddon(0, { pages: [1, 1] })
      expect(h.state()).toMatchObject({ dead: 'crashed', next: null, r: 0, end: SIX.length })
    })
  }

  it('a wrong first fresh number after a tail, on the stream form too', async () => {
    const bytes = await sixStream()
    let asks = 0
    const { planOf, remover } = await sixPlans(bytes)
    const h = chainedAddon({
      N: 6, views, base: { bytes: bytes.length, xref: startxrefOf(bytes)! }, planOf, pdfjs: PDFJS,
      remove: async ({ plans }) => {
        const a = await remover.remove(plans)
        // (the second ask's answer from a remover that forgot the first: its numbers begin where the first's did)
        if (++asks === 2 && a.ok) {
          const r = JSON.parse(new TextDecoder().decode(plans))
          return remover.remove(utf8(JSON.stringify({ ...r, chain: { ...r.chain, next: r.chain.next + 1 } })))
        }
        return a
      },
    })
    const p1 = await h.chainAddon(0, { pages: [1, 1] })
    expect(p1?.tail).not.toBeNull()
    h.acceptAddon(0, { pages: [1, 1] })
    const p2 = await h.chainAddon(1, { pages: [2, 4] })
    expect(p2?.manifest.page[4]).toEqual({ ok: false, refused: 'tail not carried: crashed' })
    expect(h.state().dead).toBe('crashed')
    expect(p1?.manifest.removal).toBe(REMOVAL)
  })
})

// ---------------------------------------------------------------- a paper's tails, chained at a schedule
type Plan = NonNullable<ReturnType<Awaited<ReturnType<typeof sixPlans>>['planOf']>>
type Remove = (plans: Uint8Array) => Promise<RemoverAnswer>
const mix32 = (x: number) => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0 }
/** the schedules of the lab's --door-parts: one part, a page a part, the doubling, seed 7's parts of 1 to 4 pages */
const TARGETS: Record<string, (a: number, N: number) => number> = {
  one: (_a, N) => N, pages: a => a, doubling: partTarget, seed7: (a, N) => Math.min(N, a + (mix32(Math.imul(7, 0x9e3779b1) ^ a) % 4)),
}
const rangesOf = (target: (a: number, N: number) => number, N: number) => { const out: [number, number][] = []; for (let a = 1; a <= N;) { const b = target(a, N); out.push([a, b]); a = b + 1 } return out }
const removedIn = (m: RemovalManifest) => Object.values(m.page).filter(e => e.at).length
/** the hooks over `ranges`, each range asked and accepted in turn */
async function chainOver(bytes: Uint8Array, N: number, planOf: (p: number) => Plan | null, ranges: [number, number][], remove: Remove, pageViews: number[][]) {
  const asks: [number, number][] = []
  const h = chainedAddon({ N, views: pageViews, base: { bytes: bytes.length, xref: startxrefOf(bytes)! }, planOf, pdfjs: PDFJS, remove: ({ from, to, plans }) => { asks.push([from, to]); return remove(plans) } })
  const parts = []
  for (const [i, pages] of ranges.entries()) {
    const got = await h.chainAddon(i, { pages })
    if (got === null) throw new Error(`pages ${pages}: no add-on`)
    h.acceptAddon(i, { pages })
    parts.push(got)
  }
  return { parts, asks, state: h.state() }
}
/** each page's glyphs as PDF.js reads them, from..to of a document */
async function glyphsOf(doc: Awaited<ReturnType<typeof open>>, from: number, to: number) {
  const out = []
  for (let q = from; q <= to; q++) { const pg = await doc.getPage(q); out.push(pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate, indices: true })) }
  return out
}
const sig = (ink: Awaited<ReturnType<typeof glyphsOf>>[number]) => ink.glyphs.map(g => `${g.u}|${g.font}|${g.x0.toFixed(4)}|${g.y.toFixed(4)}`).join(' ')
const NO_INK = { glyphs: [], boxes: [], paths: [] }

/**
 * Tests 1 and 2 on one paper: the one-part chain is paperAddon's tail and manifest; at each schedule every prefix of the
 * tails opens with N + r pages, its removed pages the single tail's (PDF.js's ink and checkPage's counts), its manifest
 * entries paperAddon's
 */
async function proveChains(name: string, bytes: Uint8Array, index: LayoutIndex, schedules: string[]) {
  const doc = await open(bytes)
  const N = doc.numPages
  const whole = await paperAddon({ bytes, index, doc, OPS, PL, deflate, inflate })
  if (!whole.ok) throw new Error(`${name}: ${whole.refused}`)
  const { plans } = await pagePlansOf({ doc, OPS, index })
  const planOf = (p: number) => plans.get(p) ?? null
  const remover = removerOf({ bytes, PL, inflate, deflate })
  const pageViews = Array.from({ length: N }, (_, i) => [...index.view(i + 1)])
  const R = removedIn(whole.manifest)
  // 1: one part [1, N] is today's single tail, byte for byte (no tail where it removes no page), and its manifest's entries
  const one = await chainOver(bytes, N, planOf, [[1, N]], remover.remove, pageViews)
  const part = one.parts[0]!
  if (R > 0) expect(Buffer.from(part.tail!).equals(Buffer.from(whole.tail)), `${name}: the one-part tail`).toBe(true)
  else expect(part.tail, name).toBeNull()
  expect(part.manifest.page, name).toEqual(whole.manifest.page)
  expect(part.manifest.stats, name).toEqual(whole.manifest.stats)
  // the single tail's removed pages, and the original's, as PDF.js reads them
  const single = await open(concat([bytes, whole.tail]))
  const singleInks = await glyphsOf(single, N + 1, N + R)
  const at = Object.entries(whole.manifest.page).filter(([, e]) => e.at).map(([p]) => Number(p))
  const origInks = await glyphsOf(doc, 1, N)
  const counts = (ink: typeof singleInks[number], j: number) => {
    const p = at[j]!, r = planOf(p)!.remove!
    return checkPage({ orig: origInks[p - 1]! as never, removed: ink as never, kept: NO_INK, entry: removalEntry(r) })
  }
  for (const s of schedules) {
    const ranges = rangesOf(TARGETS[s]!, N)
    const run = await chainOver(bytes, N, planOf, ranges, remover.remove, pageViews)
    const tails: Uint8Array[] = []
    let r = 0
    for (const [i, got] of run.parts.entries()) {
      for (let p = ranges[i]![0]; p <= ranges[i]![1]; p++) expect(got.manifest.page[p], `${name} ${s}: page ${p}`).toEqual(whole.manifest.page[p])
      if (got.tail === null) continue
      tails.push(got.tail)
      const was = r
      r += removedIn(got.manifest)
      const prefix = await open(concat([bytes, ...tails]))
      expect(prefix.numPages, `${name} ${s}: after part ${i}`).toBe(N + r)
      const inks = await glyphsOf(prefix, N + was + 1, N + r)
      for (let j = was; j < r; j++) {
        expect(sig(inks[j - was]!), `${name} ${s}: removed page ${N + j + 1}`).toBe(sig(singleInks[j]!))
        expect(counts(inks[j - was]!, j), `${name} ${s}: removed page ${N + j + 1}`).toEqual(counts(singleInks[j]!, j))
      }
      await prefix.loadingTask.destroy()
    }
    expect(r, `${name} ${s}`).toBe(R)
    expect(run.state.r, `${name} ${s}`).toBe(R)
  }
  await single.loadingTask.destroy()
  await doc.loadingTask.destroy()
  return { whole, plans }
}

describe('a part\'s tail chained after the parts before (tests 1, 2): the synthetic paper', () => {
  for (const [what, make] of [['a classic table', async () => SIX], ['a cross-reference stream', sixStream]] as const) {
    it(`the one-part chain is paperAddon's; every prefix at every schedule opens, its removed pages the single tail's: ${what}`, async () => {
      const bytes = await make()
      const { whole } = await proveChains(what, bytes, layoutOf(SIX_UNITS, 6), Object.keys(TARGETS))
      // (pages 1, 4 and 5 removed; 6 refused by the remover; 2 clean, its rule; 3 not planned)
      expect(Object.keys(whole.manifest.page).filter(p => whole.manifest.page[Number(p)]!.at)).toEqual(['1', '4', '5'])
    }, 60_000)
  }
})

// ---------------------------------------------------------------- the cut with the hooks
async function readBack(c: Cut) {
  const rh = await readHead(c.head.bytes, { ref: c.head.ref })
  const read: ReadUnitsChunk[] = []
  for (const u of c.units) read.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: read.at(-1) ?? null }))
  const index = indexOf(rh, read)
  const parts: ReadPart[] = []
  let chain: PartChain | null = null
  for (const p of c.parts) { const r = await readPart(p.bytes, { ref: p.ref, index, chain }); parts.push(r); chain = r.chain }
  return { index, parts }
}
/** the paper cut with the chained add-on's hooks over an in-process remover (or `remove`), and read back as the service reads it */
async function cutChained(whole: Whole, bytes: Uint8Array, planOf: (p: number) => Plan | null, o: { remove?: Remove; target?: (a: number, N: number) => number; deflate?: (b: Uint8Array) => Uint8Array; leftPages?: CutOptions['leftPages'] } = {}) {
  const remover = removerOf({ bytes, PL, inflate, deflate: o.deflate ?? deflate })
  const asks: [number, number][] = []
  const h = chainedAddon({
    N: whole.paper.pages, views: whole.left.pages, base: { bytes: whole.base.bytes, xref: whole.base.xref! }, planOf, pdfjs: PDFJS,
    remove: ({ from, to, plans }) => { asks.push([from, to]); return (o.remove ?? remover.remove)(plans) },
  })
  const c = await cutBundle(whole, { leftPages: o.leftPages ?? leftPagesOf(whole), chainAddon: h.chainAddon, acceptAddon: h.acceptAddon, ...(o.target ? { target: o.target } : {}) })
  return { c, asks, h, back: await readBack(c) }
}
const fitsOf = (c: Cut) => c.parts.map(p => [p.from, p.to])
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0)

/** test 3: every part read in order, the merge's entries paperAddon's page by page, its counts summed, `appended` the tails' */
async function proveCut(name: string, whole: Whole, bytes: Uint8Array, index: LayoutIndex, o: { leftPages?: CutOptions['leftPages']; target?: (a: number, N: number) => number } = {}) {
  const doc = await open(bytes)
  const made = await paperAddon({ bytes, index, doc, OPS, PL, deflate, inflate })
  if (!made.ok) throw new Error(`${name}: ${made.refused}`)
  const { plans } = await pagePlansOf({ doc, OPS, index })
  await doc.loadingTask.destroy()
  const run = await cutChained(whole, bytes, p => plans.get(p) ?? null, o)
  const { back } = run
  expect(back.parts.every(p => p.layout !== null && p.addon !== null), `${name}: every part its layout and add-on`).toBe(true)
  const merged = mergeParts(back.index, back.parts)
  const m = merged.addon!.manifest
  for (let p = 1; p <= whole.paper.pages; p++) expect(m.page[p], `${name}: page ${p}`).toEqual(made.manifest.page[p])
  expect(m.stats, name).toEqual(made.manifest.stats)
  const tails = back.parts.map(p => p.addon?.tail).filter((t): t is Uint8Array => t != null)
  expect(m.appended, name).toBe(sum(tails.map(t => t.length)))
  expect(merged.addon!.tail.length, name).toBe(m.appended)
  const composed = await open(concat([bytes, ...tails]))
  expect(composed.numPages, name).toBe(whole.paper.pages + back.parts.at(-1)!.chain.r)
  await composed.loadingTask.destroy()
  return { ...run, made, merged }
}

describe('the cut with the chained hooks (tests 3 to 6): the synthetic paper', () => {
  it('3, 4: every part reads in order and merges to paperAddon\'s; a clean-only part asks nothing and the next chains on the last tail', async () => {
    const whole = sixWhole(SIX)
    const run = await proveCut('six', whole, SIX, layoutOf(SIX_UNITS, 6))
    expect(fitsOf(run.c)).toEqual([[1, 1], [2, 3], [4, 6]])
    // (part [2, 3] has no page with kept ink: no ask, no tail, no removed page; [4, 6]'s tail follows [1, 1]'s)
    expect(run.asks).toEqual([[1, 1], [4, 6]])
    const [p1, p2, p3] = run.back.parts
    expect(p2!.addon).toMatchObject({ tail: null, r: 0 })
    expect(p2!.chain.end).toBe(p1!.chain.end)
    expect(tailLinks(p3!.addon!.tail!)!.prev).toBe(tailLinks(p1!.addon!.tail!)!.startxref)
    expect(p3!.addon!.manifest.page[6]).toMatchObject({ ok: false, refused: expect.stringMatching(/painted more than once/) })
    expect(p3!.addon!.manifest.page[4]).toMatchObject({ ok: true, at: { R: 8 } })
  }, 60_000)

  it('5: the remover failing at ask k: the parts before are as without it, the rest drawn the old way, all read', async () => {
    const whole = sixWhole(SIX), { planOf, remover } = await sixPlans(SIX)
    const pages = (a: number) => a
    const clean = await cutChained(whole, SIX, planOf, { target: pages })
    expect(clean.asks).toEqual([[1, 1], [4, 4], [5, 5], [6, 6]])
    let asked = 0
    const failing: Remove = async plans => (++asked === 2 ? { ok: false, why: 'clock' } : remover.remove(plans))
    const run = await cutChained(whole, SIX, planOf, { target: pages, remove: failing })
    // (dead after the second ask: no third)
    expect(run.asks).toEqual([[1, 1], [4, 4]])
    expect(run.h.state().dead).toBe('clock')
    for (let i = 0; i < 3; i++) expect(run.c.parts[i]!.sha256, `part ${i}`).toBe(clean.c.parts[i]!.sha256)
    for (const [i, p] of [[3, 4], [4, 5], [5, 6]] as const) {
      const part = run.back.parts[i]!
      expect(part.addon?.tail, `page ${p}`).toBeNull()
      expect(part.addon?.manifest.page[p], `page ${p}`).toEqual({ ok: false, refused: 'tail not carried: clock' })
      expect(part.addon?.manifest.stats, `page ${p}`).toMatchObject({ uncarried: 1 })
    }
    // a clean page after the death stays as it was
    expect(run.back.parts[1]!.addon!.manifest.page[2]).toEqual(clean.back.parts[1]!.addon!.manifest.page[2])
    // a transport that throws (not memory) is a death too; one whose word is none of the service's is 'crashed'
    const thrown = await cutChained(whole, SIX, planOf, { remove: async () => { throw new Error('the pipe broke') } })
    expect(thrown.back.parts[0]!.addon!.manifest.page[1]).toEqual({ ok: false, refused: 'tail not carried: crashed' })
    const odd = await cutChained(whole, SIX, planOf, { remove: async () => ({ ok: false, why: 'tired' }) as never })
    expect(odd.h.state().dead).toBe('crashed')
    const late = await cutChained(whole, SIX, planOf, { remove: async () => ({ ok: false, why: 'deadline' }) })
    expect(late.back.parts[0]!.addon!.manifest.page[1]).toEqual({ ok: false, refused: 'tail not carried: deadline' })
    // a memory-class error of the transport is the prepare side's own: it goes on
    await expect(cutChained(whole, SIX, planOf, { remove: async () => { throw new RangeError(ALLOCATION_FAILED) } })).rejects.toThrow(ALLOCATION_FAILED)
  }, 60_000)

  it('5: a page past the boxes\' share is refused alone, mid-part; the share is the paper\'s over every part (as one add-on of the whole)', async () => {
    const whole = sixWhole(SIX), { planOf } = await sixPlans(SIX)
    const probe = (p: number) => { const x = planOf(p); return x && p === 4 ? { ...x, cost: { bytes: BOXES_BYTES, values: 1 } } : x }
    const run = await cutChained(whole, SIX, probe)
    expect(fitsOf(run.c)).toEqual([[1, 1], [2, 3], [4, 6]])
    const m = run.back.parts[2]!.addon!.manifest
    expect(m.page[4]).toEqual({ ok: false, refused: expect.stringMatching(/more than the manifest has left/) })
    expect(m.page[5]).toMatchObject({ ok: true, at: { R: 8 } })
    // each planned page 30% of the share: pages 1, 2 and 4 hold it, 5 and 6 are past it, whatever the parts
    const heavy = (p: number) => { const x = planOf(p); return x && { ...x, cost: { bytes: Math.floor(0.3 * BOXES_BYTES), values: 1 } } }
    const whole1 = rangeEntries(heavy, 1, 6, { bytes: 0, values: 0 })
    expect(whole1.asked).toEqual([1, 4])
    for (const target of [TARGETS.one!, TARGETS.pages!, TARGETS.doubling!, TARGETS.seed7!]) {
      const cut = await cutChained(whole, SIX, heavy, { target })
      const page = mergeParts(cut.back.index, cut.back.parts).addon!.manifest.page
      for (const p of [5, 6]) expect(page[p]).toEqual({ ok: false, refused: expect.stringMatching(/more than the manifest has left/) })
      for (const p of [1, 4]) expect(page[p]).toMatchObject({ ok: true })
      expect(cut.h.state().boxes.bytes).toBe(whole1.spent.bytes)
    }
  }, 120_000)

  it('6: candidates asked in any order change nothing before one is accepted; then as the final range asked alone', async () => {
    const { planOf, remover } = await sixPlans(SIX)
    const hooks = () => chainedAddon({ N: 6, views, base: { bytes: SIX.length, xref: startxrefOf(SIX)! }, planOf, pdfjs: PDFJS, remove: ({ plans }) => remover.remove(plans) })
    const a = hooks(), b = hooks()
    for (const pages of [[1, 6], [1, 3], [1, 6], [1, 1], [1, 2]] as [number, number][]) await a.chainAddon(0, { pages })
    expect(a.state()).toEqual(b.state())
    const fromA = await a.chainAddon(0, { pages: [1, 1] }), fromB = await b.chainAddon(0, { pages: [1, 1] })
    a.acceptAddon(0, { pages: [1, 1] })
    b.acceptAddon(0, { pages: [1, 1] })
    expect(a.state()).toEqual(b.state())
    expect(Buffer.from(fromA!.tail!).equals(Buffer.from(fromB!.tail!))).toBe(true)
    // (a candidate asked last but not accepted is not what is committed)
    await a.chainAddon(1, { pages: [2, 6] })
    await a.chainAddon(1, { pages: [2, 4] })
    a.acceptAddon(1, { pages: [2, 6] })
    const restB = await b.chainAddon(1, { pages: [2, 6] })
    b.acceptAddon(1, { pages: [2, 6] })
    expect(a.state()).toEqual(b.state())
    expect(restB!.manifest.page[5]).toMatchObject({ ok: true, at: { R: 9 } })
  }, 60_000)

  it('6: an over shortens the part; one page whose tail alone passes TAIL_CAP is refused alone and keeps its layout', async () => {
    const whole = sixWhole(SIX), { planOf } = await sixPlans(SIX)
    const filler = (kib: number) => () => new Uint8Array(kib * 1024).fill(0x20)
    const over = await cutChained(whole, SIX, planOf, { deflate: filler(600) })
    expect(fitsOf(over.c)).toEqual([[1, 1], [2, 3], [4, 4], [5, 6]])
    expect(over.back.parts.map(p => p.addon?.r)).toEqual([1, 0, 1, 1])
    const alone = await cutChained(whole, SIX, planOf, { deflate: filler(1100) })
    expect(alone.back.parts.every(p => p.layout !== null && p.addon !== null)).toBe(true)
    const page = mergeParts(alone.back.index, alone.back.parts).addon!.manifest.page
    for (const p of [1, 4, 5]) expect(page[p], `page ${p}`).toEqual({ ok: false, refused: PAST_PART })
    expect(alone.back.parts.every(p => p.addon!.tail === null)).toBe(true)
  }, 120_000)
})

// ---------------------------------------------------------------- the real papers (where this machine has them)
const PACK_PAPERS = ['1512.03385v1', '1706.03762v7', '1810.04805v2', '2307.16209v1', '2608.04322v1', '2608.16117v1'] as const
const packFiles = (paper: string) => ({ pdf: join(PACK!, 'fixtures', `${paper}-zh`, 'arxiv.pdf'), layout: join(PACK!, 'fixtures', `${paper}-zh`, 'layout.json') })
const packIndex = (paper: string) => indexLayout(parseLayout(new Uint8Array(readFileSync(packFiles(paper).layout))))

describe.skipIf(!PACK)('the pack\'s papers (AXT_PACK): one add-on a paper, the 30 fixtures\' six', () => {
  for (const paper of PACK_PAPERS) {
    it(`${paper}: tests 1, 2 and 8, and its pages aligned by their facts as by their lists`, async () => {
      const bytes = new Uint8Array(readFileSync(packFiles(paper).pdf)), index = packIndex(paper)
      const { whole, plans } = await proveChains(paper, bytes, index, ['pages', 'doubling', 'seed7'])
      // 8: the paper-wide boxes' share never binds: no page refused for it, the whole's boxes within it
      expect(Object.values(whole.manifest.page).filter(e => /more than the manifest has left/.test(e.refused ?? ''))).toEqual([])
      expect(sum([...plans.values()].filter(x => x.unfit === null).map(x => x.cost.bytes))).toBeLessThanOrEqual(BOXES_BYTES)
      expect(sum([...plans.values()].filter(x => x.unfit === null).map(x => x.cost.values))).toBeLessThanOrEqual(BOXES_VALUES)
      // E1(b): every page's verdict over its facts is the old reading's of its list, as read and perturbed (fail closed)
      const doc = await open(bytes)
      const R = await openRemover(bytes, { PL, inflate })
      for (let p = 1; p <= doc.numPages; p++) {
        const list = await (await doc.getPage(p)).getOperatorList()
        const lists: [string, OpList][] = [['as read', list]]
        for (const how of ['drop-show', 'extra-path', 'other-code', 'null-code'] as const) { const l = perturbed(OPS, list, how, p); if (l) lists.push([how, l]) }
        for (const [what, l] of lists) {
          const old = oldAlign(R.walkPage(p - 1), R.encrypted, OPS, l)
          const got = R.alignPage(p - 1, alignOf(OPS, l)) as { ok: boolean; why: string[]; paints: unknown }
          expect({ ok: got.ok, why: got.why, paints: got.paints !== null }, `${paper} page ${p}, ${what}`).toEqual(old)
          if (what !== 'as read' && what !== 'extra-path') expect(old.ok, `${paper} page ${p}, ${what}`).toBe(false)
        }
        R.release()
      }
      await doc.loadingTask.destroy()
    }, 600_000)
  }
})

describe.skipIf(!LAB_ON)('the real papers cut with the chained hooks (AXT_LAB, AXT_PACK; test 3)', () => {
  for (const [name, target] of LAB_PAPERS) {
    it(name, async () => {
      const { openPaper } = await import('@/pdf-reader/engine/pipeline/live.mjs')
      const { unpackSource } = await import('@/pdf-reader/engine/source/tar.mjs')
      const { bundleUnitsOf } = await import('@/pdf-reader/engine/layer-proto/units.mjs')
      const { geometryFile, sourceFile } = labFiles(name, target)
      const bytes = new Uint8Array(readFileSync(packFiles(name).pdf)), index = packIndex(name)
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
      const source = await unpackSource(new Uint8Array(readFileSync(sourceFile)))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const units = bundleUnitsOf(openPaper(source.files))
      const geometry = JSON.parse(readFileSync(geometryFile, 'utf8')) as { left: { pages: [number, number, number, number][]; units: Whole['left']['units'] } }
      const whole = {
        paper: { id, version, pages: index.file.paper.pages }, base: { bytes: bytes.length, sha256: sha256(bytes), xref: startxrefOf(bytes)! }, versions: { image: '1' }, units,
        left: { kinds: units.map(u => u[0]), pages: geometry.left.pages, units: [...geometry.left.units].sort((a, b) => a[0] - b[0]) }, layout: index.file,
      } as Whole
      const run = await proveCut(name, whole, bytes, index, { leftPages: () => null })
      if (process.env.AXT_CUT_STATS) process.stderr.write(`CHAIN ${name} parts=${JSON.stringify(fitsOf(run.c))} asks=${JSON.stringify(run.asks)} r=${run.back.parts.at(-1)!.chain.r}\n`)
    }, 600_000)
  }
})
