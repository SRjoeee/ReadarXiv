import { describe, expect, it } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { Layer, LayerDocument, PageEvent } from '@/pdf-reader/engine/layer-proto/door.mjs'
import type { Ref } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { type Made, made, N } from './format-paper'

// The door's readiness protocol (layer-proto/door.d.mts; the bundle 4 contract C7, M9, M10 and the reader view's D-1 to D-9) as
// a suite any door runs: the fake (tests/pdf-reader/door-fake.test.ts) now, E4b's real one when it lands. It holds what the
// view and the web code against: states, onPage, pageOf (waiting, rejection, signal), leftPageOf, addPart's refusals,
// endParts, onRetired and dispose. Drawing is the engine lane's own rows. A door is reached through `makeDoor`, which opens it over
// the small paper of format-paper.ts (four pages, three parts: pages 1, 2-3 and 4; the first two with a tail, the last with no
// layout and no add-on) and gives the host's controls

export interface DoorSetup {
  paper: Made
  /** how many of the paper's parts the door is opened with (a warm visit), in order */
  parts: number
  /** pages whose composed page cannot be read: laying them fails */
  failPages?: readonly number[]
  /** a promise a composed page's read waits for before it answers (null: none), so that a test holds a read in flight */
  hold?(page: number): Promise<void> | null
  /** the host's transport for left parts */
  leftPart(page: number, ref: Ref & { page: number }): Promise<Uint8Array>
  onRetired(doc: LayerDocument): void
}
export interface DoorHarness {
  layer: Layer
  /** lets the door do all it can with what it holds now (a fake lays what is pending; a real one waits until it is idle) */
  advance(): Promise<void>
  /** gives the door the rows it waits for (a door that gates a page on its units' rows; the fake in `rows: 'gate'` mode): called
   *  after each part is added and at the open, before the suite expects a covered page to lay. Absent: the door asks for none */
  supplyRows?(): void | Promise<void>
  /** the pages laid with `page`: page p becomes laid once the parts covering all of closure(p) are in. A door that lays each
   *  page alone (the fake) says `[p]`; an exact in-order door lays a unit that runs onto the next page with it, and tells the
   *  pages before it on the way (for the small paper: 1 and 2 give [1, 2], 3 gives [1, 2, 3], 4 gives [1, 2, 3, 4]) */
  closure(page: number): readonly number[]
  /** the composed document through `r` removed pages (numPages N + r), one object for each r; the one the door was opened with
   *  is `docFor(the last told part's chain.r)` */
  docFor(r: number): LayerDocument
}
export type MakeDoor = (setup: DoorSetup) => Promise<DoorHarness>

const flush = () => new Promise<void>(r => setTimeout(r, 0))

export function runDoorConformance(makeDoor: MakeDoor): void {
  let M: Made
  /** an opened door and what the host saw */
  async function open(o: { parts?: number; failPages?: readonly number[]; hold?: DoorSetup['hold']; leftPart?: DoorSetup['leftPart'] } = {}) {
    M ??= await made()
    const fetched: [number, Ref & { page: number }][] = []
    const retired: LayerDocument[] = []
    const leftPart: DoorSetup['leftPart'] = o.leftPart ?? (async (page, ref) => {
      fetched.push([page, ref])
      return (M.lefts[page] as { bytes: Uint8Array }).bytes
    })
    const h = await makeDoor({ paper: M, parts: o.parts ?? 0, failPages: o.failPages, hold: o.hold, leftPart, onRetired: d => retired.push(d) })
    await h.supplyRows?.()
    const events: [number, PageEvent][] = []
    h.layer.onPage((page, state) => events.push([page, state]))
    let told = o.parts ?? 0
    /** part i, with its document where it has a tail */
    const add = async (i: number) => {
      const part = M.readParts[i]!
      if (part.addon?.tail) h.layer.addPart(part, { doc: h.docFor(part.chain.r) })
      else h.layer.addPart(part)
      told = Math.max(told, i + 1)
      await h.supplyRows?.()
    }
    /** the parts not yet added that cover every page of the page's closure */
    const cover = async (page: number) => {
      const need = Math.max(...h.closure(page))
      while (told < M.readParts.length && (told === 0 ? 0 : M.readParts[told - 1]!.pages[1]) < need) await add(told)
    }
    /** what the door told of one page */
    const eventsOf = (page: number) => events.filter(e => e[0] === page)
    return { ...h, fetched, retired, events, add, cover, eventsOf }
  }
  /** a promise's end without failing the test on a rejection */
  const settle = <T>(p: Promise<T>) => p.then(value => ({ value }), (error: unknown) => ({ error }))
  const ask = (layer: Layer, page: number, signal?: AbortSignal) => layer.pageOf(page, { lang: 'zh', ...(signal ? { signal } : {}) })

  describe('the door: pages and parts', () => {
    it('has every page waiting before any part', async () => {
      const d = await open()
      for (let p = 1; p <= N; p++) expect(d.layer.pageState(p)).toBe('waiting')
      expect(d.layer.stats().parts).toEqual({ through: 0, told: 0 })
      d.layer.dispose()
    })

    it('lays a covered page once asked: laying at once, then ready, told once each in order', async () => {
      const d = await open()
      await d.cover(1)
      expect(d.layer.pageState(1)).toBe('waiting')
      const laid = ask(d.layer, 1)
      expect(d.layer.pageState(1)).toBe('laying')
      await d.advance()
      await laid
      expect(d.layer.pageState(1)).toBe('ready')
      expect(d.eventsOf(1)).toEqual([[1, 'laying'], [1, 'ready']])
      // (asking again tells nothing again)
      await ask(d.layer, 1)
      await d.advance()
      expect(d.eventsOf(1)).toEqual([[1, 'laying'], [1, 'ready']])
      // (a page outside the closure waits: nobody asked for it)
      const closed = d.closure(1)
      for (const p of [1, 2, 3, 4].filter(q => !closed.includes(q))) expect(d.layer.pageState(p)).toBe('waiting')
      d.layer.dispose()
    })

    it('holds a page until a part with to >= page is added, then lays it', async () => {
      const d = await open()
      await d.add(0)
      const second = settle(ask(d.layer, 2))
      expect(d.layer.pageState(2)).toBe('waiting')
      await d.advance()
      await flush()
      // (every page of the closure waits, the covered ones too, until the whole closure is in)
      for (const q of d.closure(2)) { expect(d.layer.pageState(q)).toBe('waiting'); expect(d.eventsOf(q)).toEqual([]) }
      await d.add(1)
      expect(d.layer.pageState(2)).toBe('laying')
      await d.advance()
      expect(await second).toHaveProperty('value')
      expect(d.layer.pageState(2)).toBe('ready')
      expect(d.layer.pageState(3)).toBe('waiting')
      d.layer.dispose()
    })

    it('keeps every page of the closure waiting until the whole closure is covered', async () => {
      const d = await open()
      await d.add(0)
      const three = settle(ask(d.layer, 3))
      await d.advance()
      await flush()
      for (const q of d.closure(3)) { expect(d.layer.pageState(q)).toBe('waiting'); expect(d.eventsOf(q)).toEqual([]) }
      await d.add(1)
      expect(d.layer.pageState(3)).toBe('laying')
      for (const q of d.closure(3)) expect(d.layer.pageState(q)).not.toBe('waiting')
      await d.advance()
      expect(await three).toHaveProperty('value')
      d.layer.dispose()
    })

    it('covers a page with a part that has no layout', async () => {
      const d = await open({ parts: 2 })
      expect(M.readParts[2]!.layout).toBeNull()
      await d.add(2)
      const four = settle(ask(d.layer, 4))
      await d.advance()
      expect(await four).toHaveProperty('value')
      expect(d.layer.pageState(4)).toBe('ready')
      d.layer.dispose()
    })

    it('answers a fresh page each call: equal markup and data, never the same objects', async () => {
      const d = await open({ parts: 3 })
      const first = ask(d.layer, 1)
      await d.advance()
      const a = await first
      const b = await ask(d.layer, 1)
      expect(a.svg).not.toBe(b.svg)
      expect(a.svg.outerHTML).toBe(b.svg.outerHTML)
      expect(a.svg.getAttribute('lang')).toBe('zh')
      expect(a.w).toBe(b.w)
      expect(a.h).toBe(b.h)
      expect(a.w).toBeGreaterThan(0)
      expect(a.words).toEqual(b.words)
      expect(a.words).not.toBe(b.words)
      expect(a.links).toEqual(b.links)
      expect(a.links).not.toBe(b.links)
      d.layer.dispose()
    })

    it('tells a failed page once and rejects its pageOf', async () => {
      const d = await open({ parts: 3, failPages: [2] })
      const two = settle(ask(d.layer, 2))
      expect(d.layer.pageState(2)).toBe('laying')
      await d.advance()
      expect(await two).toHaveProperty('error')
      expect(d.layer.pageState(2)).toBe('failed')
      expect(d.eventsOf(2)).toEqual([[2, 'laying'], [2, 'failed']])
      expect(await settle(ask(d.layer, 2))).toHaveProperty('error')
      await d.advance()
      expect(d.eventsOf(2)).toEqual([[2, 'laying'], [2, 'failed']])
      // a page whose closure does not hold the failed one still lays (a door whose closures overlap it has none to try)
      const apart = [1, 3, 4].find(q => !d.closure(q).includes(2))
      if (apart !== undefined) {
        const other = settle(ask(d.layer, apart))
        await d.advance()
        expect(await other).toHaveProperty('value')
      }
      d.layer.dispose()
    })

    it('counts the parts told and the pages through', async () => {
      const d = await open()
      await d.add(0)
      await d.add(1)
      expect(d.layer.stats().parts).toEqual({ through: 3, told: 2 })
      await d.add(2)
      expect(d.layer.stats().parts).toEqual({ through: 4, told: 3 })
      d.layer.dispose()
    })

    it('opens warm over every part, and waits for no part', async () => {
      const d = await open({ parts: 3 })
      expect(d.layer.stats().parts).toEqual({ through: 4, told: 3 })
      const last = settle(ask(d.layer, 4))
      await d.advance()
      expect(await last).toHaveProperty('value')
      d.layer.dispose()
    })
  })

  describe('the door: addPart', () => {
    it('refuses another head, a part out of order and a wrong prev, changing nothing', async () => {
      const d = await open()
      const p0 = M.readParts[0]!, p1 = M.readParts[1]!
      expect(() => d.layer.addPart({ ...p0, head: 'f'.repeat(64) }, { doc: d.docFor(1) })).toThrow(BundleRefusal)
      expect(() => d.layer.addPart(p1, { doc: d.docFor(2) })).toThrow(BundleRefusal)
      expect(() => d.layer.addPart({ ...p0, prev: 'a'.repeat(64) }, { doc: d.docFor(1) })).toThrow(BundleRefusal)
      expect(d.layer.stats().parts).toEqual({ through: 0, told: 0 })
      await d.add(0)
      expect(() => d.layer.addPart({ ...p1, prev: 'a'.repeat(64) }, { doc: d.docFor(2) })).toThrow(BundleRefusal)
      expect(() => d.layer.addPart({ ...p1, pages: [3, 3] }, { doc: d.docFor(2) })).toThrow(BundleRefusal)
      expect(d.layer.stats().parts).toEqual({ through: 1, told: 1 })
      await d.add(1)
      expect(d.layer.stats().parts).toEqual({ through: 3, told: 2 })
      d.layer.dispose()
    })

    it('needs the document of a part with a tail, and a document of N + r pages', async () => {
      const d = await open()
      const p0 = M.readParts[0]!
      expect(() => d.layer.addPart(p0)).toThrow(TypeError)
      expect(() => d.layer.addPart(p0, { doc: {} as LayerDocument })).toThrow(TypeError)
      expect(() => d.layer.addPart(p0, { doc: d.docFor(0) })).toThrow(BundleRefusal)
      expect(d.layer.stats().parts).toEqual({ through: 0, told: 0 })
      await d.add(0)
      await d.add(1)
      // (a document with a part that has no tail: refused)
      expect(() => d.layer.addPart(M.readParts[2]!, { doc: d.docFor(2) })).toThrow(TypeError)
      expect(d.layer.stats().parts).toEqual({ through: 3, told: 2 })
      d.layer.dispose()
    })

    it('takes the same part again as a no-op', async () => {
      const d = await open()
      await d.add(0)
      d.layer.addPart(M.readParts[0]!)
      d.layer.addPart(M.readParts[0]!, { doc: d.docFor(1) })
      expect(d.layer.stats().parts).toEqual({ through: 1, told: 1 })
      expect(d.retired).toEqual([d.docFor(0)])
      d.layer.dispose()
    })
  })

  describe('the door: endParts', () => {
    it('fails every page no part covers, told once, and rejects its pageOf', async () => {
      const d = await open()
      await d.add(0)
      await d.add(1)
      const four = settle(ask(d.layer, 4))
      expect(d.layer.pageState(4)).toBe('waiting')
      d.layer.endParts()
      expect(await four).toHaveProperty('error')
      expect(d.layer.pageState(4)).toBe('failed')
      for (const p of [1, 2, 3]) expect(d.layer.pageState(p)).not.toBe('failed')
      expect(d.events.filter(e => e[1] === 'failed')).toEqual([[4, 'failed']])
      expect(await settle(ask(d.layer, 4))).toHaveProperty('error')
      d.layer.endParts()
      expect(d.events.filter(e => e[1] === 'failed').length).toBe(1)
      // a covered page still lays after the parts end
      const three = settle(ask(d.layer, 3))
      await d.advance()
      expect(await three).toHaveProperty('value')
      d.layer.dispose()
    })

    it('fails the pages of a closure that no part covers, whichever page was asked', async () => {
      const d = await open()
      await d.add(0)
      const asked = settle(ask(d.layer, 3))
      d.layer.endParts()
      expect(await asked).toHaveProperty('error')
      expect(d.layer.pageState(3)).toBe('failed')
      expect(d.layer.pageState(4)).toBe('failed')
      d.layer.dispose()
    })

    it('refuses a part after it, and takes a part told before it again as a no-op', async () => {
      const d = await open()
      await d.add(0)
      d.layer.endParts()
      expect(() => d.layer.addPart(M.readParts[1]!, { doc: d.docFor(2) })).toThrow(BundleRefusal)
      d.layer.addPart(M.readParts[0]!)
      expect(d.layer.stats().parts).toEqual({ through: 1, told: 1 })
      d.layer.dispose()
    })
  })

  describe('the door: pageOf and signal', () => {
    it('rejects an aborted ask with an AbortError and drops the page from the targets', async () => {
      const d = await open()
      await d.add(0)
      const c = new AbortController()
      const three = settle(ask(d.layer, 3, c.signal))
      c.abort()
      const r = await three
      expect(r).toHaveProperty('error')
      expect((r as { error: Error }).error.name).toBe('AbortError')
      // the page was dropped from the targets: covered later, nobody asked, it stays waiting
      await d.add(1)
      await d.advance()
      await flush()
      expect(d.layer.pageState(3)).toBe('waiting')
      expect(d.events.some(e => e[0] === 3)).toBe(false)
      // asked again, it is laid
      const again = settle(ask(d.layer, 3))
      await d.advance()
      expect(await again).toHaveProperty('value')
      d.layer.dispose()
    })

    it('rejects an ask whose signal is aborted already, and lets a settled ask be', async () => {
      const d = await open({ parts: 3 })
      const c = new AbortController()
      c.abort()
      const r = await settle(ask(d.layer, 1, c.signal))
      expect((r as { error: Error }).error.name).toBe('AbortError')
      expect(d.layer.pageState(1)).toBe('waiting')
      const live = new AbortController()
      const one = ask(d.layer, 1, live.signal)
      await d.advance()
      const page = await one
      live.abort()
      expect(page.w).toBeGreaterThan(0)
      expect(d.layer.pageState(1)).toBe('ready')
      d.layer.dispose()
    })

    it('keeps another ask of the page alive when one is aborted', async () => {
      const d = await open()
      await d.add(0)
      const c = new AbortController()
      const aborted = settle(ask(d.layer, 3, c.signal))
      const kept = settle(ask(d.layer, 3))
      c.abort()
      expect(await aborted).toHaveProperty('error')
      await d.add(1)
      await d.advance()
      expect(await kept).toHaveProperty('value')
      expect(d.layer.pageState(3)).toBe('ready')
      d.layer.dispose()
    })
  })

  describe('the door: leftPageOf', () => {
    it('waits for the covering part, fetches the ref once through leftPart and caches the parse', async () => {
      const d = await open()
      await d.add(0)
      const two = settle(d.layer.leftPageOf(2))
      await flush()
      expect(d.fetched).toEqual([])
      await d.add(1)
      const r = await two
      expect(r).toHaveProperty('value')
      const page = (r as { value: Awaited<ReturnType<Layer['leftPageOf']>> }).value
      expect(page.kind).toBe('left')
      expect(page.page).toBe(2)
      expect(page.table.n).toBeGreaterThan(0)
      expect(d.fetched.length).toBe(1)
      expect(d.fetched[0]![0]).toBe(2)
      expect(d.fetched[0]![1]).toEqual(M.readParts[1]!.leftParts[0])
      const again = await d.layer.leftPageOf(2)
      expect(again).toBe(page)
      expect(d.fetched.length).toBe(1)
      d.layer.dispose()
    })

    it('rejects a page uncovered when the parts end, and a pending one on dispose', async () => {
      const d = await open()
      await d.add(0)
      const three = settle(d.layer.leftPageOf(3))
      d.layer.endParts()
      expect(await three).toHaveProperty('error')
      expect(await settle(d.layer.leftPageOf(4))).toHaveProperty('error')
      const e = await open()
      const pending = settle(e.layer.leftPageOf(1))
      e.layer.dispose()
      expect(await pending).toHaveProperty('error')
      d.layer.dispose()
    })

    it('rejects a pending leftPageOf at dispose without waiting for the transport', async () => {
      const d = await open({ parts: 3, leftPart: () => new Promise<Uint8Array>(() => {}) })
      const pending = settle(d.layer.leftPageOf(1))
      await flush()
      d.layer.dispose()
      expect(await pending).toHaveProperty('error')
    })

    it('honours a signal: an AbortError, and the wait for the covering part dropped', async () => {
      const d = await open()
      await d.add(0)
      const c = new AbortController()
      const two = settle(d.layer.leftPageOf(2, { signal: c.signal }))
      c.abort()
      expect((await two as { error: Error }).error.name).toBe('AbortError')
      await d.add(1)
      await flush()
      expect(d.fetched).toEqual([])
      expect(await settle(d.layer.leftPageOf(2))).toHaveProperty('value')
      expect(d.fetched.length).toBe(1)
      const dead = new AbortController()
      dead.abort()
      expect(((await settle(d.layer.leftPageOf(1, { signal: dead.signal }))) as { error: Error }).error.name).toBe('AbortError')
      d.layer.dispose()
    })

    it('keeps the wait when another asker has not aborted', async () => {
      const d = await open()
      await d.add(0)
      const c = new AbortController()
      const aborted = settle(d.layer.leftPageOf(3, { signal: c.signal }))
      const kept = settle(d.layer.leftPageOf(3))
      c.abort()
      expect(await aborted).toHaveProperty('error')
      await d.add(1)
      expect(await kept).toHaveProperty('value')
      expect(d.fetched.length).toBe(1)
      d.layer.dispose()
    })

    it('does not cache a failed fetch', async () => {
      let calls = 0
      const d = await open({
        parts: 3,
        leftPart: async (page) => { if (++calls === 1) throw new Error('offline'); return (M.lefts[page] as { bytes: Uint8Array }).bytes },
      })
      expect(await settle(d.layer.leftPageOf(1))).toHaveProperty('error')
      expect(await settle(d.layer.leftPageOf(1))).toHaveProperty('value')
      expect(calls).toBe(2)
      d.layer.dispose()
    })
  })

  describe('the door: documents and dispose', () => {
    it('tells onRetired for a superseded document at the swap, and for the last at dispose, once', async () => {
      const d = await open()
      expect(d.retired).toEqual([])
      await d.add(0)
      expect(d.retired).toEqual([d.docFor(0)])
      await d.add(1)
      expect(d.retired).toEqual([d.docFor(0), d.docFor(1)])
      await d.add(2)
      expect(d.retired.length).toBe(2)
      d.layer.dispose()
      expect(d.retired).toEqual([d.docFor(0), d.docFor(1), d.docFor(2)])
      d.layer.dispose()
      expect(d.retired.length).toBe(3)
    })

    it('holds onRetired for a document a task is still reading until the read settles', async () => {
      let release!: () => void
      const held = new Promise<void>(r => { release = r })
      const d = await open({ parts: 1, hold: p => (p === 1 ? held : null) })
      // (a door whose page 1 needs the second part reads nothing before the swap: it has none left to do after its first read)
      if (Math.max(...d.closure(1)) > 1) { d.layer.dispose(); return }
      const one = settle(ask(d.layer, 1))
      const advanced = d.advance()
      await flush()
      // the swap while page 1 is read from the document the door was opened with
      await d.add(1)
      expect(d.retired).toEqual([])
      release()
      await advanced
      expect(await one).toHaveProperty('value')
      expect(d.retired).toEqual([d.docFor(1)])
      d.layer.dispose()
      expect(d.retired).toEqual([d.docFor(1), d.docFor(2)])
    })

    it('holds the last document\'s onRetired at dispose until a read in flight settles', async () => {
      let release!: () => void
      const held = new Promise<void>(r => { release = r })
      const d = await open({ parts: 2, hold: p => (p === 1 ? held : null) })
      const one = settle(ask(d.layer, 1))
      const advanced = d.advance()
      await flush()
      d.layer.dispose()
      expect(await one).toHaveProperty('error')
      expect(d.retired).toEqual([])
      release()
      await advanced
      await flush()
      expect(d.retired).toEqual([d.docFor(2)])
    })

    it('tells the document it was opened with at dispose when no part came', async () => {
      const d = await open({ parts: 2 })
      d.layer.dispose()
      expect(d.retired).toEqual([d.docFor(2)])
    })

    it('rejects what is pending, throws on pageOf, leftPageOf, copyOf and pageState, and answers stats and unitAt', async () => {
      const d = await open()
      await d.add(0)
      const pending = settle(ask(d.layer, 3))
      const pendingLeft = settle(d.layer.leftPageOf(3))
      const heard = d.events.length
      d.layer.dispose()
      expect(await pending).toHaveProperty('error')
      expect(await pendingLeft).toHaveProperty('error')
      expect(() => ask(d.layer, 1)).toThrow()
      expect(() => d.layer.pageState(1)).toThrow()
      expect(() => d.layer.leftPageOf(1)).toThrow()
      expect(() => d.layer.copyOf(1, document.createElement('canvas') as never, 1)).toThrow()
      expect(d.layer.stats().parts).toEqual({ through: 1, told: 1 })
      expect(d.layer.unitAt(1, 0, 0)).toBeNull()
      // (a part after dispose is a no-op, and nothing is told)
      d.layer.addPart(M.readParts[1]!, { doc: d.docFor(2) })
      d.layer.addPart({ ...M.readParts[1]!, head: 'f'.repeat(64) })
      await d.advance()
      expect(d.events.length).toBe(heard)
    })

    it('stops telling a listener that unsubscribed', async () => {
      const d = await open({ parts: 3 })
      const heard: number[] = []
      const off = d.layer.onPage(page => heard.push(page))
      off()
      const one = ask(d.layer, 1)
      await d.advance()
      await one
      expect(heard).toEqual([])
      d.layer.dispose()
    })
  })

  describe('the door: copyOf and unitAt', () => {
    it('copies a ready page at the source\'s size, and refuses a page not ready', async () => {
      const d = await open({ parts: 3 })
      const source = document.createElement('canvas')
      source.width = 120
      source.height = 160
      expect(await settle(d.layer.copyOf(1, source, 2))).toHaveProperty('error')
      const one = ask(d.layer, 1)
      await d.advance()
      await one
      d.layer.end()
      const copy = await d.layer.copyOf(1, source, 2)
      expect(copy.width).toBe(120)
      expect(copy.height).toBe(160)
      d.layer.dispose()
    })

    it('finds the smallest unit under a point on a covered page, and none on an uncovered one', async () => {
      const d = await open()
      await d.add(0)
      // part 1's unit 0 lies at [150, 696, 460, 712] on page 1, unit 2 at [72, 647, 540, 657.5]
      expect(d.layer.unitAt(1, 200, 700)).toBe(0)
      expect(d.layer.unitAt(1, 100, 650)).toBe(2)
      expect(d.layer.unitAt(1, 10, 10)).toBeNull()
      expect(d.layer.unitAt(3, 100, 500)).toBeNull()
      await d.add(1)
      expect(d.layer.unitAt(3, 100, 300)).toBe(4)
      d.layer.dispose()
    })
  })
}
