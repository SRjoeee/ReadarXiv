// The composer's rules carried from today's layer side (docs/PDF-READER.md §11.8), on a stand-in of the page stack (no PDF.js, no
// drawing: a page "is put in place" when the test says so, as the stack's swap tells it) and a clock moved by hand: laying one page
// at a time (the hold), what stays the original's, the stall clock, failures asked again, another target and the toggles in
// place, the translating marks, the pages ahead, the faces' wave; and the faces' own rules (four at a time, asked once, a lasting
// answer never asked again); the served faces' tables that cannot be had under it (no lay, no table asked again and again).
import type { Part, Placed, Row } from '@readarxiv/format'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AHEAD_SETTLE_MS,
  type Composer,
  createComposer,
  HOLD_MS,
  PAGE_MS,
  type RowsSource,
} from '../src/compose/composer.ts'
import { createFaces, type Faces, WAVE_SLOTS } from '../src/compose/faces.ts'
import type { Groups } from '../src/compose/groups.ts'
import type { Lay, Laid, Page, Rows } from '../src/compose/page.ts'
import { createServed, type Served } from '../src/compose/served.ts'
import { PROBE_TEXT } from '../src/compose/text-rendering.ts'
import type { Clock } from '../src/stack/clock.ts'
import type { PageContent, Stack, StackEvents } from '../src/stack/stack.ts'

// ---------------------------------------------------------------- the stand-ins
function handClock() {
  let now = 0,
    id = 0
  const timers = new Map<number, { at: number; f: () => void }>()
  const clock: Clock & { advance(ms: number): void } = {
    now: () => now,
    later(f, ms) {
      timers.set(++id, { at: now + ms, f })
      return id
    },
    clear: (t) => void timers.delete(t),
    frame(f) {
      timers.set(++id, { at: now, f })
      return id
    },
    cancel: (t) => void timers.delete(t),
    advance(ms) {
      const end = now + ms
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = Math.max(now, due[1].at)
        due[1].f()
      }
      now = end
    },
  }
  return clock
}
type FakeStack = Omit<Stack, 'ahead'> & {
  ahead: ReturnType<typeof vi.fn<(n: number, signal: AbortSignal) => Promise<boolean>>>
  setNear(ns: number[]): void
  put(n: number): void
  refreshed: number[]
}
function fakeStack(pages: number): FakeStack {
  const scroller = document.createElement('div')
  const element = document.createElement('div')
  scroller.append(element)
  document.body.append(scroller)
  const slots = Array.from({ length: pages }, (_, i) => {
    const d = document.createElement('div')
    d.dataset.pageNumber = String(i + 1)
    element.append(d)
    return d
  })
  const near = new Set<number>()
  const shown = new Map<number, string>()
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const tell = <K extends keyof StackEvents>(type: K, e: StackEvents[K]) => {
    for (const f of [...(listeners.get(type) ?? [])]) f(e)
  }
  let contentOf: (n: number) => PageContent | null = () => null
  const st = {
    element,
    pages,
    scale: 1,
    get contentOf() {
      return contentOf
    },
    set contentOf(f) {
      contentOf = f
    },
    refreshed: [] as number[],
    layout: async () => {},
    blank: () => {},
    setScale: () => tell('scale', { scale: 1 }),
    refresh(n?: number) {
      if (n) st.refreshed.push(n)
    },
    leftDrawn: () => {},
    dropKept: vi.fn(),
    ahead: vi.fn(async (_n: number, _s: AbortSignal) => true),
    page: (n: number) => slots[n - 1] ?? null,
    viewport: () => ({ viewBox: [0, 0, 600, 800], rotation: 0 }) as never,
    showing: (n: number) => shown.get(n) ?? null,
    near: (n: number) => near.has(n),
    inView: (n: number) => near.has(n),
    centre() {
      const ns = [...near].sort((a, b) => a - b)
      return ns.length ? (ns[Math.floor((ns.length - 1) / 2)] as number) : 0
    },
    drawing: () => false,
    focus: () => {},
    holdNear: () => {},
    hold: () => {},
    held: false,
    on(type: string, f: (e: unknown) => void) {
      const set = listeners.get(type) ?? new Set()
      listeners.set(type, set)
      set.add(f)
      return () => set.delete(f)
    },
    probe: () => ({}),
    dispose: () => scroller.remove(),
    setNear(ns: number[]) {
      for (const n of [...near])
        if (!ns.includes(n)) {
          near.delete(n)
          tell('near', { n, on: false })
        }
      for (const n of ns)
        if (!near.has(n)) {
          near.add(n)
          tell('near', { n, on: true })
        }
    },
    /** the slot's content put in place, as the stack's swap tells it */
    put(n: number) {
      const c = contentOf(n)
      if (!c) return
      shown.set(n, c.key)
      tell('shown', { n, key: c.key, swapMs: 0, drawMs: 0 })
    },
  }
  return st as unknown as FakeStack
}
const box = (y: number): [number, number, number, number] => [50, y - 2, 300, y + 8]
/** a member on page `page` (one line at baseline 700 - 40·k), of `kind` */
const member = (ord: number, page: number, k: number, kind = 'para'): Placed =>
  ({
    ord,
    kind,
    text: `u${ord}`,
    lead: 12,
    style: { role: 'serif', size: 10 },
    align: 'j',
    lines: [[page, 0, 50, 300, 700 - 40 * k, 708 - 40 * k, 698 - 40 * k, 50, 300, 0]],
    room: { below: 0 },
  }) as unknown as Placed
const partOf = (page: number, members: Placed[]): Part =>
  ({ format: 1, page, paper: { faces: { fonts: [] } }, flows: [members] }) as unknown as Part
/** the stand-in of layPage: a member laid where its row is in and ok, waiting where it is missing and rows go on, else the
 *  original's; a face its kind names waited for until it is ready */
function standInLay(ready: Set<string> = new Set(['sans'])): Lay & { calls: number } {
  const lay = ((part: Part, rows: Rows) => {
    lay.calls++
    const ms = part.flows.flat()
    const missing = ms.filter((m) => !rows.get(m.text as string)).map((m) => m.text as string)
    const faces = ms
      .filter((m) => m.kind === 'needs-face' && !ready.has('cjk'))
      .map(() => ['cjk', 'x'] as [string, string])
    if ((missing.length && !rows.done) || faces.length)
      return {
        page: part.page,
        wait: { rows: rows.done ? [] : missing, faces },
        members: ms.map(
          (m) =>
            ({
              ord: m.ord,
              page: part.page,
              state: 'waiting',
              off: 0,
              lines: [],
              lit: { left: [[box(m.lines[0]?.[4] as number)]], right: [[box(m.lines[0]?.[4] as number)]], own: [] },
            }) as Laid,
        ),
        links: [],
      } satisfies Page
    return {
      page: part.page,
      wait: { rows: [], faces: [] },
      members: ms.map((m): Laid => {
        const r = rows.get(m.text as string)
        const y = m.lines[0]?.[4] as number
        return r?.ok
          ? {
              ord: m.ord,
              page: part.page,
              state: 'laid',
              off: 1,
              lines: [[y, 50, 300, [{ s: 'x', x: 50, face: 'sans', size: 10 }]]],
              lit: { left: [[box(y)]], right: [[box(y)]], own: [] },
            }
          : {
              ord: m.ord,
              page: part.page,
              state: r ? 'refused' : 'none',
              off: 0,
              lines: [],
              lit: { left: [[box(y)]], right: [[box(y)]], own: [] },
            }
      }),
      // (each of the part's links with its owner: one of a member laid moved over its drawing, 20 points left of A's box, as a
      // translation moves it; any other at A's box)
      links: (part.links ?? []).map((l) => {
        const ord = l.owner?.[0]
        const laid = ord !== undefined && !!rows.get(`u${ord}`)?.ok
        const [x0, y0, x1, y1] = l.box
        return [
          laid ? [x0 - 20, y0, x1 - 20, y1] : l.box,
          l.to,
          ...(ord !== undefined || l.border ? [ord] : []),
          ...(l.border ? [l.border] : []),
        ] as Page['links'][number]
      }),
    }
  }) as unknown as Lay & { calls: number }
  lay.calls = 0
  return lay
}
function rowsOf(target: string, ids: string[], done = false): RowsSource & { give(ids: string[]): void; end(): void } {
  const got = new Map<string, Row>(ids.map((id) => [id, { id, ok: true, content: [{ t: 'text', s: 'x' }], by: 't' }]))
  const ls = new Set<() => void>()
  const r = {
    target,
    done,
    get: (id: string) => got.get(id),
    on(f: () => void) {
      ls.add(f)
      return () => ls.delete(f)
    },
    give(more: string[]) {
      for (const id of more) got.set(id, { id, ok: true, content: [{ t: 'text', s: 'x' }], by: 't' })
      for (const f of [...ls]) f()
    },
    end() {
      r.done = true
      for (const f of [...ls]) f()
    },
  }
  return r
}
const groupsStub = (holds: (ord: number) => boolean = () => true): Groups =>
  ({
    allOn: Promise.resolve({}),
    laid: Promise.resolve({}),
    crops: Promise.resolve({}),
    ready: Promise.resolve(),
    has: () => true,
    holds,
    size: 10,
    set: vi.fn(() => []),
    clear: vi.fn(),
  }) as unknown as Groups
const facesStub = (loaded?: Set<string>): Faces & { waves: string[][]; probes: string[] } => {
  const waves: string[][] = []
  const probes: string[] = []
  return {
    waves,
    probes,
    classOf: () => 'f',
    familyOf: () => 'sans-serif',
    // (the text rendering's probe face, asked with the probe's text: none here, so the sheet's geometricPrecision)
    probeFace: async (text: string) => {
      probes.push(text)
      return null
    },
    // (a face asked with the texts the pages wait on it for: told here by the face, once a wave)
    ready: async (ids: Iterable<string | readonly [string, string]>) => {
      const list = [...new Set([...ids].map((x) => (typeof x === 'string' ? x : x[0])))]
      if (list.length) waves.push(list)
      for (const id of list) loaded?.add(id)
    },
    asked: 0,
    most: 0,
    dispose: () => {},
  }
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}

interface World {
  layer: { pages: number; part(n: number): Promise<Part | null> }
  stack: FakeStack
  clock: ReturnType<typeof handClock>
  composer: Composer
  lay: ReturnType<typeof standInLay>
  faces: ReturnType<typeof facesStub>
  warns: string[]
  aheadGo: ReturnType<typeof vi.fn>
  parts: Map<number, Part>
  failing: Set<number>
  settled: () => (n: number) => boolean
}
function world(
  o: {
    pages?: Map<number, Part>
    classes?: Record<'figures' | 'tables' | 'heads' | 'references' | 'names', boolean>
    ahead?: number
    holds?: (ord: number) => boolean
    ready?: Set<string>
    lay?: ReturnType<typeof standInLay>
    faces?: ReturnType<typeof facesStub>
    root?: HTMLElement
  } = {},
): World {
  const parts =
    o.pages ??
    new Map([1, 2, 3, 4, 5].map((n) => [n, partOf(n, [member(n * 10, n, 0), member(n * 10 + 1, n, 1)])] as const))
  const stack = fakeStack(Math.max(...parts.keys()))
  const clock = handClock()
  const lay = o.lay ?? standInLay(o.ready)
  const faces = o.faces ?? facesStub(o.ready)
  const warns: string[] = []
  const aheadGo = vi.fn()
  let settledFn: (n: number) => boolean = () => false
  const failing = new Set<number>()
  const composer = createComposer({
    stack: stack as unknown as Stack,
    kit: {} as never,
    faces,
    lay,
    unlaid: 'original',
    lang: () => 'de',
    links: { open: () => {}, follow: () => {}, unnamed: () => 'Link' },
    clock,
    original: (_n, settled) => ({ key: settled ? 'own' : 'left', kind: 'skeleton' }) as unknown as PageContent,
    settle: (fn) => {
      settledFn = fn ?? (() => false)
    },
    aheadGo,
    ...(o.classes ? { classes: o.classes } : {}),
    ...(o.ahead !== undefined ? { ahead: o.ahead } : {}),
    ...(o.root ? { root: o.root } : {}),
    warn: (w) => warns.push(w),
  })
  composer.setDocuments({ original: {} as never, composed: {} as never, groups: groupsStub(o.holds) })
  const layer = {
    pages: parts.size,
    part: async (n: number) => {
      if (failing.has(n)) throw new Error('the network')
      return parts.get(n) ?? null
    },
  }
  return {
    layer,
    stack,
    clock,
    composer,
    lay,
    faces,
    warns,
    aheadGo,
    parts,
    failing,
    settled: () => settledFn,
  }
}
const open = (w: World, rows: RowsSource) => w.composer.setLayer(w.layer, rows)
const allIds = (w: World) => [...w.parts.values()].flatMap((p) => p.flows.flat().map((m) => m.text as string))

let saved: unknown
beforeEach(() => {
  saved = (globalThis as { scheduler?: unknown }).scheduler
  ;(globalThis as { scheduler?: unknown }).scheduler = undefined
})
afterEach(() => {
  ;(globalThis as { scheduler?: unknown }).scheduler = saved
  document.body.replaceChildren()
})

describe('laying, one page at a time (layer-side.mjs hold)', () => {
  it('lays the middle page first and holds the next until it is in place, HOLD_MS at most', async () => {
    const w = world()
    w.stack.setNear([1, 2, 3])
    open(w, rowsOf('de', allIds(w)))
    await settle()
    expect(w.stack.refreshed.filter((n) => w.composer.laid(n))).toEqual([2])
    expect(w.composer.laid(1)).toBeNull()
    expect(w.composer.laid(3)).toBeNull()
    // (page 2 in place: the page after it, at an equal distance, next)
    w.stack.put(2)
    await settle()
    expect(w.composer.laid(3)).not.toBeNull()
    expect(w.composer.laid(1)).toBeNull()
    // (page 3 not put in place: page 1 waits HOLD_MS, then is laid)
    w.clock.advance(HOLD_MS - 1)
    await settle()
    expect(w.composer.laid(1)).toBeNull()
    w.clock.advance(1)
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    // (the first page in place lets the pages ahead go)
    expect(w.aheadGo).toHaveBeenCalled()
  })
})

describe("the overlay's text rendering, decided once a reader (text-rendering.ts)", () => {
  it('is asked of the fixed probe when the pages are first to be laid, once, whatever the pages, targets and toggles', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const w = world({ root })
    w.stack.setNear([1, 2])
    expect(w.faces.probes).toEqual([])
    open(w, rowsOf('de', allIds(w)))
    await settle()
    expect(w.faces.probes).toEqual([PROBE_TEXT])
    // (another target, a toggle: the same decision)
    open(w, rowsOf('fr', allIds(w)))
    w.composer.setClasses({ figures: false, tables: true, heads: true, references: true, names: true })
    await settle()
    expect(w.faces.probes).toEqual([PROBE_TEXT])
    w.composer.dispose()
  })
})

describe("what stays the original's", () => {
  it('a page with no part, one that hides nothing, and a member whose groups the document lacks', async () => {
    const pages = new Map([
      [1, partOf(1, [member(10, 1, 0)])],
      [3, partOf(3, [member(30, 3, 0), member(31, 3, 1)])],
    ])
    const w = world({ pages: new Map([...pages, [2, null as unknown as Part]]), holds: (ord) => ord !== 31 })
    w.stack.setNear([1, 2, 3])
    // (no row of page 1's unit: laid with nothing; page 2 has no part; page 3's second member's group missing)
    open(w, rowsOf('de', ['u30', 'u31'], true))
    await settle()
    w.stack.put(3)
    await settle()
    w.clock.advance(HOLD_MS)
    await settle()
    expect(w.composer.laid(1)).toBeNull()
    expect(w.composer.laid(2)).toBeNull()
    expect(w.settled()(1)).toBe(true)
    expect(w.settled()(2)).toBe(true)
    const p3 = w.composer.laid(3) as Page
    expect(p3.members.map((m) => m.state)).toEqual(['laid', 'unwrapped'])
    expect(w.settled()(3)).toBe(false)
  })
  it('a member left unwrapped keeps its links at A’s boxes, over the original’s text (Codex on #626)', async () => {
    // (Page.links held the unwrapped member's links where its translation, now not drawn, had moved them: over the original's
    // text, opening from words they are not on; the laid member's stay moved, a link of no member's at its box; each with its
    // own annotation's border)
    const links: NonNullable<Part['links']> = [
      { box: [100, 698, 140, 708], to: { url: 'https://example.org/a' }, owner: [30, ''] },
      { box: [100, 658, 140, 668], to: { url: 'https://example.org/b' }, owner: [31, ''], border: [1, 0x00ffff] },
      { box: [400, 600, 440, 610], to: { dest: 'sec.1' } },
    ]
    const part = { ...partOf(3, [member(30, 3, 0), member(31, 3, 1)]), links } as Part
    const w = world({ pages: new Map([[3, part]]), holds: (ord) => ord !== 31 })
    w.stack.setNear([3])
    open(w, rowsOf('de', ['u30', 'u31'], true))
    await settle()
    const p3 = w.composer.laid(3) as Page
    expect(p3.members.map((m) => m.state)).toEqual(['laid', 'unwrapped'])
    expect(p3.links.map(([b, to]) => [b, to])).toEqual([
      [[80, 698, 120, 708], { url: 'https://example.org/a' }],
      [[400, 600, 440, 610], { dest: 'sec.1' }],
      [[100, 658, 140, 668], { url: 'https://example.org/b' }],
    ])
    expect(p3.links[2]).toEqual([[100, 658, 140, 668], { url: 'https://example.org/b' }, 31, [1, 0x00ffff]])
  })
})

describe('the stall clock and failures', () => {
  it("a commit not in place PAGE_MS later is the original's, warned once, asked again on the next scroll", async () => {
    const w = world({ pages: new Map([[1, partOf(1, [member(10, 1, 0)])]]) })
    w.stack.setNear([1])
    // (rows not in: waiting is never a stall, whatever the time)
    const rows = rowsOf('de', [])
    open(w, rows)
    await settle()
    w.clock.advance(PAGE_MS * 2)
    expect(w.settled()(1)).toBe(false)
    expect(w.warns).toEqual([])
    // (the clock starts at the commit)
    rows.give(['u10'])
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    w.clock.advance(PAGE_MS - 1)
    expect(w.settled()(1)).toBe(false)
    w.clock.advance(1)
    expect(w.settled()(1)).toBe(true)
    expect(w.composer.laid(1)).toBeNull()
    expect(w.warns).toEqual(['wait'])
    // (the next scroll asks it again)
    w.stack.element.parentElement?.dispatchEvent(new Event('scroll'))
    await settle()
    expect(w.settled()(1)).toBe(false)
    expect(w.composer.laid(1)).not.toBeNull()
    w.stack.put(1)
    w.clock.advance(PAGE_MS * 2)
    expect(w.composer.laid(1)).not.toBeNull()
    expect(w.warns).toEqual(['wait'])
  })
  it('a page whose part fails shows the original, asked again on coming near and on a zoom', async () => {
    const w = world({ pages: new Map([[1, partOf(1, [member(10, 1, 0)])]]) })
    w.failing.add(1)
    w.stack.setNear([1])
    open(w, rowsOf('de', ['u10'], true))
    await settle()
    expect(w.settled()(1)).toBe(true)
    expect(w.warns).toEqual(['a page of the layer'])
    w.failing.delete(1)
    w.stack.setNear([])
    w.stack.setNear([1])
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    expect(w.settled()(1)).toBe(false)
    // (a zoom asks a failed page again too)
    const w2 = world({ pages: new Map([[1, partOf(1, [member(10, 1, 0)])]]) })
    w2.failing.add(1)
    w2.stack.setNear([1])
    open(w2, rowsOf('de', ['u10'], true))
    await settle()
    w2.failing.delete(1)
    w2.stack.setScale(2)
    await settle()
    expect(w2.composer.laid(1)).not.toBeNull()
  })
})

describe('another target, the toggles (a generation in place)', () => {
  it("keeps a page laid until the new target's commit, muted meanwhile; its kept drawings let go; the left untouched", async () => {
    const w = world()
    w.stack.setNear([1])
    open(w, rowsOf('de', allIds(w)))
    await settle()
    w.stack.put(1)
    const was = w.stack.showing(1)
    expect(was).toMatch(/^laid:/)
    // (another target, its rows not in yet: the page keeps the target before, muted)
    const fr = rowsOf('fr', [])
    open(w, fr)
    await settle()
    expect(w.stack.dropKept).toHaveBeenCalled()
    expect(w.composer.laid(1)).not.toBeNull()
    expect(w.composer.muted(1)).toBe(true)
    expect(w.stack.contentOf(1)?.key).toBe(was)
    // (its rows in: the new target's commit, not muted)
    fr.give(allIds(w))
    await settle()
    expect(w.stack.contentOf(1)?.key).not.toBe(was)
    expect(w.composer.muted(1)).toBe(false)
  })
  it("a page the new target lays with nothing, or whose rows will not come, goes back to the original's", async () => {
    const w = world()
    w.stack.setNear([1, 2])
    open(w, rowsOf('de', allIds(w)))
    await settle()
    w.stack.put(1)
    await settle()
    w.stack.put(2)
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    expect(w.composer.laid(2)).not.toBeNull()
    // (the new target's rows end with none: both pages the original's)
    const ja = rowsOf('ja', [])
    open(w, ja)
    await settle()
    expect(w.composer.muted(1)).toBe(true)
    ja.end()
    await settle()
    w.clock.advance(HOLD_MS)
    await settle()
    expect(w.composer.laid(1)).toBeNull()
    expect(w.composer.laid(2)).toBeNull()
    expect(w.stack.contentOf(1)?.key).toBe('own')
  })
  it("a toggle shows or hides in place: nothing fetched again, a kind it hides the original's", async () => {
    const pages = new Map([[1, partOf(1, [member(10, 1, 0, 'para'), member(11, 1, 1, 'author')])]])
    const w = world({ pages, classes: { figures: true, tables: true, heads: true, references: false, names: true } })
    w.stack.setNear([1])
    open(w, rowsOf('de', ['u10', 'u11'], true))
    await settle()
    w.stack.put(1)
    expect((w.composer.laid(1) as Page).members.map((m) => m.state)).toEqual(['laid', 'laid'])
    const spy = vi.spyOn(w.layer, 'part')
    // (the names toggle off: the author unit the original's, the page laid again in place from the same part)
    w.composer.setClasses({ figures: true, tables: true, heads: true, references: false, names: false })
    await settle()
    expect(spy).not.toHaveBeenCalled()
    expect((w.composer.page(1) as Page).members.map((m) => m.state)).toEqual(['laid', 'refused'])
    // (the same toggles again change nothing)
    const lays = w.lay.calls
    w.composer.setClasses({ figures: true, tables: true, heads: true, references: false, names: false })
    await settle()
    expect(w.lay.calls).toBe(lays)
  })
})

describe('a generation let go', () => {
  it('a commit of the generation before not in place yet is let go, nothing of it put in place', async () => {
    const w = world()
    w.stack.setNear([1, 2])
    open(w, rowsOf('de', allIds(w)))
    await settle()
    w.stack.put(1)
    await settle()
    // (page 2 committed, its drawing not in place yet)
    expect(w.composer.laid(2)).not.toBeNull()
    const before = w.stack.contentOf(2)?.key
    open(w, rowsOf('fr', []))
    await settle()
    expect(w.composer.laid(2)).toBeNull()
    expect(w.stack.contentOf(2)?.key).not.toBe(before)
    // (page 1, in place, kept until its new commit)
    expect(w.composer.muted(1)).toBe(true)
  })
})

describe('a row stated again otherwise (a run our server replaced mid-way)', () => {
  /** a rows source whose rows the test states, each once more where it says so: our server's attempt on the source's units
   *  (no sentences) replaced by one on the layer's units, the same ids stated again with their sentences (worker v2
   *  machine.ts wanted, startRecent; format.ts fits) */
  function statedRows(target: string) {
    const got = new Map<string, Row>()
    const ls = new Set<() => void>()
    const r = {
      target,
      done: false,
      get: (id: string) => got.get(id),
      on(f: () => void) {
        ls.add(f)
        return () => ls.delete(f)
      },
      state(rows: Row[]) {
        for (const x of rows) got.set(x.id, x)
        for (const f of [...ls]) f()
      },
      end() {
        r.done = true
        for (const f of [...ls]) f()
      },
    }
    return r
  }
  const row = (id: string, sentences?: { src: number[]; tr: number[] }): Row =>
    ({ id, ok: true, content: [{ t: 'text', s: 'x. y.' }], by: 't', ...(sentences ? { sentences } : {}) }) as Row
  /** the stand-in lay, a member lit by sentence (two entries) where its row states its sentences, else whole (one) */
  function sentenceLay() {
    const inner = standInLay()
    const lay = ((part: Part, rows: Rows) => {
      lay.calls++
      const p = inner(part, rows)
      return {
        ...p,
        members: p.members.map((m) => {
          const r = rows.get(`u${m.ord}`)
          if (m.state !== 'laid' || !r?.ok || !r.sentences) return m
          const [b] = m.lit.left[0] as [[number, number, number, number]]
          return { ...m, lit: { left: [[b], [b]], right: [[b], [b]], own: [] } }
        }),
      }
    }) as unknown as Lay & { calls: number }
    lay.calls = 0
    return lay
  }
  const entries = (w: World, n: number) => (w.composer.page(n) as Page).members.map((m) => m.lit.left.length)
  /** the composer's generation and its lays and commits so far */
  const counted = (w: World) => {
    const p = w.composer.probe()
    return { gen: p.gen as number, lays: p.lays as number, commits: p.commits as number }
  }

  it('a page laid with the row before is laid again in a generation of its own, kept until its new commit', async () => {
    const pages = new Map([[1, partOf(1, [member(10, 1, 0), member(11, 1, 1)])]])
    const w = world({ pages, lay: sentenceLay() })
    w.stack.setNear([1])
    const rows = statedRows('zh')
    open(w, rows)
    // (the first attempt's rows: no sentences; the page commits, lit whole)
    rows.state([row('u10'), row('u11')])
    await settle()
    w.stack.put(1)
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    expect(entries(w, 1)).toEqual([1, 1])
    const was = w.stack.contentOf(1)?.key
    // (the attempt that replaced it states u10 again, with its sentences, the rows going on)
    rows.state([row('u10', { src: [3], tr: [3] })])
    await settle()
    expect(w.stack.contentOf(1)?.key).not.toBe(was)
    expect(w.composer.muted(1)).toBe(false)
    expect(entries(w, 1)).toEqual([2, 1])
  })
  it("the same rows stated again (the run's whole, read anew) lay nothing again", async () => {
    const pages = new Map([[1, partOf(1, [member(10, 1, 0), member(11, 1, 1)])]])
    const lay = sentenceLay()
    const w = world({ pages, lay })
    w.stack.setNear([1])
    const rows = statedRows('zh')
    open(w, rows)
    rows.state([row('u10', { src: [3], tr: [3] }), row('u11')])
    await settle()
    w.stack.put(1)
    await settle()
    const calls = lay.calls
    const was = w.stack.contentOf(1)?.key
    rows.state([row('u10', { src: [3], tr: [3] }), row('u11')])
    rows.end()
    await settle()
    expect(lay.calls).toBe(calls)
    expect(w.stack.contentOf(1)?.key).toBe(was)
    expect(entries(w, 1)).toEqual([2, 1])
  })
  it("a row missing when the page was laid at the rows' end, come with a run started again (a retry), lays it again once", async () => {
    // (the page laid at the end with u11 the original's, none to come; the reader takes the rows again for a run our server
    // started again, the rows going on (reader.ts: no generation of its own), and that run brings u11)
    const pages = new Map([[1, partOf(1, [member(10, 1, 0), member(11, 1, 1)])]])
    const lay = sentenceLay()
    const w = world({ pages, lay })
    w.stack.setNear([1])
    const rows = statedRows('zh')
    open(w, rows)
    rows.state([row('u10')])
    rows.end()
    await settle()
    w.stack.put(1)
    await settle()
    expect((w.composer.laid(1) as Page).members.map((m) => m.state)).toEqual(['laid', 'none'])
    const before = counted(w)
    rows.done = false
    rows.state([row('u11')])
    await settle()
    const after = counted(w)
    expect([after.gen - before.gen, after.lays - before.lays, after.commits - before.commits]).toEqual([1, 1, 1])
    expect((w.composer.page(1) as Page).members.map((m) => m.state)).toEqual(['laid', 'laid'])
    // (the rows ended again, the same: nothing more)
    rows.end()
    await settle()
    expect(counted(w)).toMatchObject({ gen: after.gen, lays: after.lays, commits: after.commits })
  })
  it("a page laid at the rows' end with nothing of its own, its rows brought by a run started again (a retry), is laid again; one whose rows never come is laid no more (Codex 4538550044)", async () => {
    // (a translation that failed whole for the page near: the rows end with none, the page the original's by the rule; the
    // reader takes the rows again for the retry, the rows going on, reader.ts: no generation of its own)
    const pages = new Map([[1, partOf(1, [member(10, 1, 0), member(11, 1, 1)])]])
    const lay = sentenceLay()
    const w = world({ pages, lay })
    w.stack.setNear([1])
    const rows = statedRows('zh')
    open(w, rows)
    rows.end()
    await settle()
    w.stack.put(1)
    await settle()
    expect(w.composer.laid(1)).toBeNull()
    expect(w.settled()(1)).toBe(true)
    const before = counted(w)
    // (the retry's run brings no row either, and ends: nothing laid again)
    rows.done = false
    rows.end()
    await settle()
    expect(counted(w)).toEqual(before)
    // (then a run that brings both: the page laid again, as its own, committed and put in place)
    rows.done = false
    rows.state([row('u10'), row('u11')])
    await settle()
    w.stack.put(1)
    await settle()
    rows.end()
    await settle()
    const after = counted(w)
    expect([after.lays - before.lays, after.commits - before.commits]).toEqual([1, 1])
    expect((w.composer.laid(1) as Page).members.map((m) => m.state)).toEqual(['laid', 'laid'])
    expect(w.settled()(1)).toBe(false)
  })
  it('the re-prepared paper (2610.21924v1, staging 2026-11-11): runs that restate the rows held lay nothing; the new layer is laid once, as its own', async () => {
    const pages = new Map([
      [1, partOf(1, [member(10, 1, 0), member(11, 1, 1)])],
      [2, partOf(2, [member(20, 2, 0), member(21, 2, 1)])],
    ])
    const lay = sentenceLay()
    const w = world({ pages, lay })
    w.stack.setNear([1, 2])
    const rows = statedRows('zh')
    open(w, rows)
    // (attempt 2's stored rows of the stale layer, read whole: the pages committed)
    rows.state([row('u10'), row('u11'), row('u20'), row('u21')])
    rows.end()
    await settle()
    w.stack.put(1)
    w.stack.put(2)
    await settle()
    const settled = counted(w)
    // (attempt 3 on the prepare's early units, the rows taken again: its rows the same, read anew from its own objects)
    rows.done = false
    rows.state([row('u10'), row('u11'), row('u20')])
    rows.end()
    await settle()
    expect(counted(w)).toMatchObject({ gen: settled.gen, lays: settled.lays, commits: settled.commits })
    // (the new layer lands: laid once, a generation of its own; attempt 4 then restates every row: nothing more)
    w.composer.setLayer({ pages: 2, part: async (n: number) => pages.get(n) ?? null }, rows)
    await settle()
    const landed = counted(w)
    // (each near page laid at most once for it, every lay committed)
    expect(landed.gen - settled.gen).toBe(1)
    expect(landed.lays - settled.lays).toBe(landed.commits - settled.commits)
    expect(landed.lays - settled.lays).toBeGreaterThan(0)
    expect(landed.lays - settled.lays).toBeLessThanOrEqual(2)
    rows.done = false
    rows.state([row('u10'), row('u11'), row('u20'), row('u21')])
    rows.end()
    await settle()
    expect(counted(w)).toMatchObject({ gen: landed.gen, lays: landed.lays, commits: landed.commits })
  })
  it('a row the lay read where it was missing, waited for by no page, changes nothing on screen when it comes', async () => {
    // (as layPage reads the paper's own names: typeset lay/entry.ts ownNamesOf reads their rows, wait.ts waits for none, and
    // the page commits before one is in)
    const pages = new Map([[1, partOf(1, [member(10, 1, 0), member(11, 1, 1)])]])
    const inner = sentenceLay()
    const lay = ((part: Part, rows: Rows) => {
      rows.get('name')
      return inner(part, rows)
    }) as unknown as Lay & { calls: number }
    const w = world({ pages, lay })
    w.stack.setNear([1])
    const rows = statedRows('zh')
    open(w, rows)
    rows.state([row('u10'), row('u11')])
    await settle()
    w.stack.put(1)
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    const calls = inner.calls
    const was = w.stack.contentOf(1)?.key
    const before = w.composer.probe()
    rows.state([row('name')])
    await settle()
    const after = w.composer.probe()
    expect(inner.calls).toBe(calls)
    expect([after.gen, after.lays, after.commits]).toEqual([before.gen, before.lays, before.commits])
    expect(w.stack.contentOf(1)?.key).toBe(was)
    expect(w.composer.muted(1)).toBe(false)
  })
})

describe('the translating marks', () => {
  it('mark the near pages not laid, go in the task the page is put in place, none for a hidden kind or a unit with no row', async () => {
    const pages = new Map([
      [1, partOf(1, [member(10, 1, 0), member(11, 1, 1, 'author'), member(12, 1, 2)])],
      [2, partOf(2, [member(20, 2, 0)])],
    ])
    const w = world({ pages })
    w.stack.setNear([1, 2])
    const rows = rowsOf('de', [])
    open(w, rows)
    await settle()
    const ids = (n: number) =>
      [...(w.stack.page(n)?.querySelectorAll<HTMLElement>('.axt-translating-mark') ?? [])].map((m) => m.dataset.axtU)
    // (the author unit's class is hidden by default: no mark)
    expect(ids(1)).toEqual(['10', '12'])
    expect(ids(2)).toEqual(['20'])
    // (page 1's rows in: laid, its marks still there until it is put in place)
    rows.give(['u10', 'u12'])
    await settle()
    expect(ids(1)).toEqual(['10', '12'])
    w.stack.put(1)
    expect(ids(1)).toEqual([])
    // (the rows end with no row of page 2's unit: it stays the original's, its mark goes)
    rows.end()
    await settle()
    expect(ids(2)).toEqual([])
  })
})

describe('the pages ahead', () => {
  it('once the rows have ended, the two past the near ones the way the reader moves, after the near pages settle', async () => {
    const w = world()
    w.stack.setNear([1, 2])
    open(w, rowsOf('de', allIds(w), true))
    await settle()
    w.stack.put(1)
    await settle()
    w.stack.put(2)
    await settle()
    expect(w.stack.ahead).not.toHaveBeenCalled()
    w.clock.advance(AHEAD_SETTLE_MS - 1)
    await settle()
    expect(w.stack.ahead).not.toHaveBeenCalled()
    for (let i = 0; i < 6; i++) {
      w.clock.advance(1)
      await settle()
    }
    expect(w.stack.ahead.mock.calls.map((c) => c[0])).toEqual([3, 4])
    expect(w.composer.laid(3)).not.toBeNull()
    expect(w.composer.laid(5)).toBeNull()
  })
  it('lays none with `ahead: 0`, nor before the rows end', async () => {
    const w = world({ ahead: 0 })
    w.stack.setNear([1])
    open(w, rowsOf('de', allIds(w), true))
    await settle()
    w.stack.put(1)
    w.clock.advance(AHEAD_SETTLE_MS * 4)
    await settle()
    expect(w.stack.ahead).not.toHaveBeenCalled()
    const w2 = world()
    w2.stack.setNear([1])
    open(w2, rowsOf('de', allIds(w2), false))
    await settle()
    w2.stack.put(1)
    w2.clock.advance(AHEAD_SETTLE_MS * 4)
    await settle()
    expect(w2.stack.ahead).not.toHaveBeenCalled()
  })
  it('a page ahead whose drawing is not kept is not laid ahead again', async () => {
    const w = world()
    w.stack.ahead.mockImplementation(async () => false)
    w.stack.setNear([1])
    open(w, rowsOf('de', allIds(w), true))
    await settle()
    w.stack.put(1)
    for (let i = 0; i < 4; i++) {
      w.clock.advance(AHEAD_SETTLE_MS + 1)
      await settle()
    }
    const asked = w.stack.ahead.mock.calls.map((c) => c[0])
    expect(asked.filter((n) => n === 2).length).toBe(1)
  })
})

/** layPage's waits as the typesetter has them (lay/wait.ts, entry.ts): the rows not in while more may come (a unit the paper
 *  keeps never waited for), and only once none is missing, the face of each member whose row is in (`face:<name>` its kind)
 *  not loaded; laid once neither */
function waitingLay(loaded: Set<string>): ReturnType<typeof standInLay> & { early: number } {
  const plain = standInLay(new Set(['cjk']))
  const lay = ((part: Part, rows: Rows) => {
    lay.calls++
    const ms = part.flows.flat()
    const ids = ms.map((m) => m.text as string)
    const missing = rows.done ? [] : ids.filter((id) => !rows.get(id) && !rows.kept?.(id))
    const waiting = (wait: Page['wait']): Page => ({
      page: part.page,
      wait,
      members: ms.map(
        (m) =>
          ({
            ord: m.ord,
            page: part.page,
            state: 'waiting',
            off: 0,
            lines: [],
            lit: { left: [], right: [], own: [] },
          }) as Laid,
      ),
      links: [],
    })
    if (missing.length) return waiting({ rows: missing, faces: [] })
    if (rows.done && ids.some((id) => !rows.get(id))) lay.early++
    const faces = ms
      .filter((m) => rows.get(m.text as string)?.ok && m.kind.startsWith('face:') && !loaded.has(m.kind.slice(5)))
      .map((m) => [m.kind.slice(5), m.text as string] as [string, string])
    if (faces.length) return waiting({ rows: [], faces })
    // (nothing waited for: laid as the rows are, a row not in the original's)
    return plain(part, { get: (id) => rows.get(id), done: true })
  }) as unknown as ReturnType<typeof standInLay> & { early: number }
  lay.calls = 0
  lay.early = 0
  return lay
}
/** faces each loaded when the test says so: what each `ready` asked, and the faces loaded */
function heldFaces(loaded: Set<string>) {
  const waits = new Map<string, () => void>()
  const gates = new Map<string, Promise<void>>()
  const gate = (id: string) => {
    let p = gates.get(id)
    if (!p) {
      p = new Promise<void>((go) => waits.set(id, go))
      gates.set(id, p)
    }
    return p
  }
  const stub = facesStub()
  const asked: string[][] = []
  /** each ready()'s demand, as the composer gives it (none: always) */
  const wants: (() => boolean)[] = []
  const faces = {
    ...stub,
    asked,
    wants,
    ready: async (ids: Iterable<string | readonly [string, string]>, wanted?: () => boolean) => {
      const list = [...new Set([...ids].map((x) => (typeof x === 'string' ? x : x[0])))]
      asked.push(list)
      wants.push(wanted ?? (() => true))
      await Promise.all(list.map(gate))
    },
    /** face `id` loaded */
    load(id: string) {
      loaded.add(id)
      gate(id)
      waits.get(id)?.()
    },
  }
  return faces as unknown as ReturnType<typeof facesStub> & {
    asked: string[][]
    wants: (() => boolean)[]
    load(id: string): void
  }
}

describe('the units the paper keeps', () => {
  it('a unit the paper keeps as it is holds no page, and is never marked as translating', async () => {
    const pages = new Map([[1, partOf(1, [member(10, 1, 0), member(11, 1, 1, 'inkheads')])]])
    const lay = waitingLay(new Set())
    const w = world({ pages, lay })
    w.stack.setNear([1])
    const rows = rowsOf('de', [])
    const kept = Object.assign(rows, { kept: (id: string) => id === 'u11' })
    open(w, kept)
    await settle()
    const marks = () =>
      [...(w.stack.page(1)?.querySelectorAll<HTMLElement>('.axt-translating-mark') ?? [])].map((m) => m.dataset.axtU)
    expect(marks()).toEqual(['10'])
    // (u10's row in, the rows going on: page 1 laid, u11 the original's)
    rows.give(['u10'])
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
  })
})

describe('the faces, in one wave', () => {
  it("the near pages' faces asked in the view's order, the middle page first; each page laid once its own are in, never held by another's", async () => {
    const loaded = new Set<string>()
    const pages = new Map([
      [1, partOf(1, [member(10, 1, 0, 'face:b')])],
      [2, partOf(2, [member(20, 2, 0, 'face:a'), member(21, 2, 1, 'face:b')])],
      [3, partOf(3, [member(30, 3, 0, 'face:c')])],
    ])
    const faces = heldFaces(loaded)
    const w = world({ pages, lay: waitingLay(loaded), faces })
    w.stack.setNear([1, 2, 3])
    open(w, rowsOf('de', allIds(w), true))
    await settle()
    // (the middle page first, then the page after it at an equal distance)
    expect(faces.asked).toEqual([['a', 'b'], ['c'], ['b']])
    // (page 1's own face in: page 1 laid while pages 2 and 3 still wait for theirs)
    faces.load('b')
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
    expect(w.composer.laid(2)).toBeNull()
    expect(w.composer.laid(3)).toBeNull()
    w.stack.put(1)
    faces.load('a')
    faces.load('c')
    await settle()
    expect(w.composer.laid(2)).not.toBeNull()
  })
  it("a page's faces are asked while the page is wanted: gone from the view, or in a generation before, its loads not begun are let go", async () => {
    const loaded = new Set<string>()
    const pages = new Map([
      [1, partOf(1, [member(10, 1, 0, 'face:a')])],
      [2, partOf(2, [member(20, 2, 0, 'face:b')])],
    ])
    const faces = heldFaces(loaded)
    const w = world({ pages, lay: waitingLay(loaded), faces })
    w.stack.setNear([1, 2])
    const rows = rowsOf('de', ['u10'])
    open(w, rows)
    await settle()
    // (page 1 laid as if its rows had ended, page 2 waiting for its own: page 1's faces asked early)
    expect(faces.asked).toEqual([['a']])
    expect(faces.wants[0]?.()).toBe(true)
    // (page 1 out of the view: its demand gone)
    w.stack.setNear([2])
    expect(faces.wants[0]?.()).toBe(false)
    w.stack.setNear([1, 2])
    expect(faces.wants[0]?.()).toBe(true)
    // (another generation, the toggles: the demand of the one before gone, whatever the view)
    w.composer.setClasses({ figures: false, tables: true, heads: true, references: true, names: false })
    expect(faces.wants[0]?.()).toBe(false)
  })
  it('a page waiting for rows asks the faces of the rows it has meanwhile, again only once more of its rows are in', async () => {
    const loaded = new Set<string>()
    const pages = new Map([[1, partOf(1, [member(10, 1, 0, 'face:a'), member(11, 1, 1, 'face:b'), member(12, 1, 2)])]])
    const faces = heldFaces(loaded)
    const lay = waitingLay(loaded)
    const w = world({ pages, lay, faces })
    w.stack.setNear([1])
    const rows = rowsOf('de', ['u10'])
    open(w, rows)
    await settle()
    // (u11 and u12 still to come: the face of u10, the row in, asked already)
    expect(faces.asked).toEqual([['a']])
    expect(lay.early).toBe(1)
    // (its face in: laid again, still waiting for rows, nothing asked again nor laid as ended again)
    faces.load('a')
    await settle()
    expect(faces.asked).toEqual([['a']])
    expect(lay.early).toBe(1)
    rows.give(['u11'])
    await settle()
    expect(faces.asked).toEqual([['a'], ['b']])
    expect(w.composer.laid(1)).toBeNull()
    faces.load('b')
    rows.give(['u12'])
    await settle()
    expect(w.composer.laid(1)).not.toBeNull()
  })
  it('reads WAVE_SLOTS at a time, each face once; a 404 never asked again, a 503 asked by the next wave', async () => {
    let inFlight = 0,
      most = 0
    const gates: (() => void)[] = []
    const answers: Record<string, number> = { a: 200, b: 200, c: 200, d: 200, e: 200, f: 200, gone: 404, busy: 503 }
    const asked: string[] = []
    const fetch = vi.fn(async (u: string) => {
      asked.push(u)
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise<void>((go) => gates.push(go))
      inFlight--
      return new Response(new Uint8Array(4), { status: answers[u] ?? 200 })
    })
    const table = Object.fromEntries(Object.keys(answers).map((k) => [k, { src: k }]))
    const was = globalThis.FontFace
    ;(globalThis as { FontFace?: unknown }).FontFace = class {
      load = async () => this
    }
    const fonts = (document as { fonts?: unknown }).fonts
    Object.defineProperty(document, 'fonts', { value: { add() {}, delete() {} }, configurable: true })
    try {
      const faces = createFaces({ table, fetch: fetch as never, root: document.body })
      const one = faces.ready(['a', 'b', 'c', 'd', 'e', 'f'])
      const two = faces.ready(['a', 'b'])
      await settle()
      expect(inFlight).toBe(WAVE_SLOTS)
      while (gates.length) {
        gates.shift()?.()
        await settle()
      }
      await Promise.all([one, two])
      expect(most).toBe(WAVE_SLOTS)
      expect(asked.filter((u) => u === 'a').length).toBe(1)
      const three = faces.ready(['gone', 'busy'])
      await settle()
      while (gates.length) {
        gates.shift()?.()
        await settle()
      }
      await three
      const four = faces.ready(['gone', 'busy'])
      await settle()
      while (gates.length) {
        gates.shift()?.()
        await settle()
      }
      await four
      expect(asked.filter((u) => u === 'gone').length).toBe(1)
      expect(asked.filter((u) => u === 'busy').length).toBe(2)
    } finally {
      ;(globalThis as { FontFace?: unknown }).FontFace = was
      Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    }
  })
  it("names the text rendering's probe face: the table's first face read from a file, once loaded; none of a system's", async () => {
    const answers: Record<string, number> = { sans: 200, gone: 404 }
    const fetch = vi.fn(async (u: string) => new Response(new Uint8Array(4), { status: answers[u] ?? 200 }))
    const was = globalThis.FontFace
    ;(globalThis as { FontFace?: unknown }).FontFace = class {
      load = async () => this
    }
    const fonts = (document as { fonts?: unknown }).fonts
    Object.defineProperty(document, 'fonts', { value: { add() {}, delete() {} }, configurable: true })
    try {
      const table = { cjk: { local: 'Songti SC' }, sans: { src: 'sans' }, serif: { src: 'serif' } }
      const faces = createFaces({ table, fetch: fetch as never, root: document.body })
      expect(await faces.probeFace('Sphinx')).toBe('sans')
      expect(fetch.mock.calls.map(([u]) => u)).toEqual(['sans'])
      // (a face of the system's alone: none, as one that cannot be read)
      expect(
        await createFaces({ table: { cjk: table.cjk }, fetch: fetch as never, root: document.body }).probeFace('x'),
      ).toBeNull()
      expect(
        await createFaces({ table: { gone: { src: 'gone' } }, fetch: fetch as never, root: document.body }).probeFace(
          'x',
        ),
      ).toBeNull()
    } finally {
      ;(globalThis as { FontFace?: unknown }).FontFace = was
      Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    }
  })
  it('takes its faces out of the document when let go, and adds none whose read ends after', async () => {
    const gates: (() => void)[] = []
    const fetch = vi.fn(async () => {
      await new Promise<void>((go) => gates.push(go))
      return new Response(new Uint8Array(4), { status: 200 })
    })
    const was = globalThis.FontFace
    ;(globalThis as { FontFace?: unknown }).FontFace = class {
      load = async () => this
    }
    const fonts = (document as { fonts?: unknown }).fonts
    const held = new Set<unknown>()
    Object.defineProperty(document, 'fonts', {
      value: { add: (f: unknown) => held.add(f), delete: (f: unknown) => held.delete(f) },
      configurable: true,
    })
    try {
      const faces = createFaces({
        table: { a: { src: 'a' }, b: { src: 'b' } },
        fetch: fetch as never,
        root: document.body,
      })
      const a = faces.ready(['a'])
      await settle()
      gates.shift()?.()
      await a
      expect(held.size).toBe(1)
      // (b asked, then the reader let go while b is read)
      const b = faces.ready(['b'])
      await settle()
      faces.dispose()
      expect(held.size).toBe(0)
      gates.shift()?.()
      await b
      await settle()
      expect(held.size).toBe(0)
    } finally {
      ;(globalThis as { FontFace?: unknown }).FontFace = was
      Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    }
  })
  it("tells a face lost, once: an answer no ask would mend at once, a failure that may pass when met again (L11's second round, gap 6)", async () => {
    const answers: Record<string, number[]> = { gone: [404], flaky: [503, 503], blip: [503, 200], ok: [200] }
    const fetch = vi.fn(
      async (src: string) => new Response(new Uint8Array(4), { status: answers[src]?.shift() ?? 200 }),
    )
    const was = globalThis.FontFace
    ;(globalThis as { FontFace?: unknown }).FontFace = class {
      load = async () => this
    }
    const fonts = (document as { fonts?: unknown }).fonts
    Object.defineProperty(document, 'fonts', { value: { add: () => {}, delete: () => {} }, configurable: true })
    try {
      const lost: string[] = []
      const faces = createFaces({
        table: { gone: { src: 'gone' }, flaky: { src: 'flaky' }, blip: { src: 'blip' }, ok: { src: 'ok' } },
        fetch: fetch as never,
        root: document.body,
        lost: (id) => lost.push(id),
      })
      await faces.ready(['gone', 'flaky', 'blip', 'ok'])
      expect(lost).toEqual(['gone'])
      // (the next wave asks the passing failures again: the one that fails again is lost, the one that comes is not)
      await faces.ready(['gone', 'flaky', 'blip', 'ok'])
      await faces.ready(['flaky'])
      expect(lost).toEqual(['gone', 'flaky'])
      faces.dispose()
    } finally {
      ;(globalThis as { FontFace?: unknown }).FontFace = was
      Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    }
  })
})

describe("the served faces' tables that cannot be had, under the composer", () => {
  const FONT = '400 100px "axt-nimbus-roman", "axt-shs-sc"'
  const INDEX = '/static-fonts/index.json',
    CJK = '/static-fonts/shs-sc.json?fonts=6'
  const TABLES: Record<string, unknown> = {
    [INDEX]: {
      schema: 1,
      fonts: '6',
      faces: { 'nimbus-roman-regular': { group: 'nimbus-roman' }, 'shs-sc-regular': { group: 'shs-sc' } },
    },
    '/static-fonts/nimbus-roman.json?fonts=6': {
      schema: 1,
      group: 'nimbus-roman',
      slices: [[0x20, 0x7e]],
      faces: { 'nimbus-roman-regular': [{ path: 'static-fonts/0000000000000001.woff2' }] },
    },
    [CJK]: {
      schema: 1,
      group: 'shs-sc',
      slices: [[0x4e00, 0x9fff]],
      faces: { 'shs-sc-regular': [{ path: 'static-fonts/0000000000000002.woff2' }] },
    },
  }
  /** a lay over the served Metrics as the typesetter's cover reads them (typeset breaker/cover.ts): a member of kind 'cjk' set
   *  in FONT's CJK text, any other in its Latin; a face not ready waited for, a character no face serves leaving the member the
   *  original's */
  function metricsLay(metrics: Served['metrics']): Lay & { calls: number } {
    const lay = ((part: Part) => {
      lay.calls++
      const ms = part.flows.flat()
      const textOf = (m: Placed) => (m.kind === 'cjk' ? '\u4e2d\u6587' : 'Satz')
      const ready = ms.map((m) => metrics.ready(FONT, textOf(m)))
      const box1 = (m: Placed) => box(m.lines[0]?.[4] as number)
      if (ready.some((r) => r === false))
        return {
          page: part.page,
          wait: { rows: [], faces: ms.filter((_, k) => ready[k] === false).map((m) => [FONT, textOf(m)]) },
          members: ms.map(
            (m): Laid => ({
              ord: m.ord,
              page: part.page,
              state: 'waiting',
              off: 0,
              lines: [],
              lit: { left: [[box1(m)]], right: [[box1(m)]], own: [] },
            }),
          ),
          links: [],
        } satisfies Page
      return {
        page: part.page,
        wait: { rows: [], faces: [] },
        members: ms.map((m, k): Laid => {
          const y = m.lines[0]?.[4] as number
          return ready[k] === true
            ? {
                ord: m.ord,
                page: part.page,
                state: 'laid',
                off: 1,
                lines: [[y, 50, 300, [{ s: 'x', x: 50, face: FONT, size: 10 }]]],
                lit: { left: [[box(y)]], right: [[box(y)]], own: [] },
              }
            : {
                ord: m.ord,
                page: part.page,
                state: 'face',
                off: 0,
                lines: [],
                lit: { left: [[box(y)]], right: [[box(y)]], own: [] },
              }
        }),
        links: [],
      }
    }) as unknown as Lay & { calls: number }
    lay.calls = 0
    return lay
  }
  it.each([
    [INDEX, 'not there'],
    [INDEX, 'of another shape'],
    [INDEX, 'the network'],
    [CJK, 'not there'],
    [CJK, 'of another shape'],
    [CJK, 'the network'],
  ] as const)(
    '%s %s: its faces lost, the page laid with what it has, nothing asked or laid again over two minutes',
    async (url, how) => {
      const clock = handClock()
      const asked: string[] = []
      const fetch = async (u: string) => {
        asked.push(u)
        // (a loop of asks stopped here, for the count to say so)
        if (asked.length > 40) return new Promise<Response>(() => {})
        if (u === url) {
          if (how === 'not there') return new Response('', { status: 404 })
          if (how === 'of another shape') return new Response('{"schema":1,', { status: 200 })
          throw new TypeError('Failed to fetch')
        }
        if (u in TABLES) return new Response(JSON.stringify(TABLES[u]), { status: 200 })
        return new Response(new Uint8Array([1]), { status: 200 })
      }
      const lost: string[] = []
      const served = createServed({
        fetch,
        root: document.body,
        platform: {
          measure: (_f, t) => ({ width: t.length * 50, ascent: 70, descent: 20, right: t.length * 50 }),
          face: async () => ({ add() {}, remove() {} }),
        },
        timers: clock,
        lost: (id) => lost.push(id),
      })
      const part = partOf(1, [member(10, 1, 0), member(11, 1, 1, 'cjk')])
      const stack = fakeStack(1)
      const lay = metricsLay(served.metrics)
      const composer = createComposer({
        stack: stack as unknown as Stack,
        kit: {} as never,
        faces: served.faces,
        lay,
        unlaid: 'original',
        lang: () => 'de',
        links: { open: () => {}, follow: () => {}, unnamed: () => 'Link' },
        clock,
        original: (_n, settled) => ({ key: settled ? 'own' : 'left', kind: 'skeleton' }) as unknown as PageContent,
      })
      composer.setDocuments({ original: {} as never, composed: {} as never, groups: groupsStub() })
      stack.setNear([1])
      composer.setLayer({ pages: 1, part: async () => part }, rowsOf('de', ['u10', 'u11'], true))
      for (let t = 0; t < 120_000; t += 5000) {
        await settle()
        if (composer.laid(1) && !stack.showing(1)) stack.put(1)
        clock.advance(5000)
      }
      await settle()
      expect(asked.filter((u) => u === url)).toHaveLength(how === 'the network' ? 2 : 1)
      expect(asked.length).toBeLessThan(8)
      // (the page laid twice: waiting for the faces, then with what it has once they are lost)
      expect(lay.calls).toBe(2)
      expect(lost).toEqual(url === INDEX ? ['nimbus-roman-regular', 'shs-sc-regular'] : ['shs-sc-regular'])
      if (url === INDEX) {
        // (nothing the served faces hold: arXiv's page)
        expect([composer.laid(1), composer.settled(1)]).toEqual([null, true])
      } else expect(composer.laid(1)?.members.map((m) => m.state)).toEqual(['laid', 'face'])
      composer.dispose()
      served.faces.dispose()
    },
  )
})
