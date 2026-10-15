// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { chainedAddon } from '@/pdf-reader/engine/layout/chain.mjs'
import { ANSWER_CAP, ASK_CAP, ASK_VALUES, type AskChain, encodeAsk, encodeEntries, ENTRIES_CAP, ENTRIES_VALUES, readAsk, readEntries } from '@/pdf-reader/engine/layout/chain-wire.mjs'
import { PAST_PART, removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf, TAIL_CAP, tailLinks } from '@/pdf-reader/engine/layout/tail.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { concat, deflate, inflate, open, PL, SIX, sixPlans, sixStream } from './helpers/chain-paper'

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
