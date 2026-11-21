// The layer's feed (engine/view/feed.mjs; the shared reader view's contract §1.3 and §2.2, rows L3, L14 and L15 of its PR VC):
// what a host hears of a paper's layer, from any source, in any order, merged into one, over the format test's small paper
// (helpers/format-paper.ts: four pages, three parts) served by digest
import { describe, expect, it } from 'vitest'
import { writePart, type Ref } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { createFeed } from '@/pdf-reader/engine/view/feed.mjs'
import type { TellRef } from '@/pdf-reader/engine/view/feed.mjs'
import { made, type Made, N, partInputs } from './helpers/format-paper'

const flush = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)) }

/** the paper's objects by digest, a fetch of each counted; `refuse` makes a digest's fetch fail (until let go) */
function server(M: Made, extra: { bytes: Uint8Array; sha256: string }[] = []) {
  const objects = new Map<string, Uint8Array>()
  for (const w of [...M.chunks, M.head, ...M.parts, ...Object.values(M.lefts), ...extra]) objects.set(w.sha256, w.bytes)
  const fetched: string[] = [], refuse = new Set<string>()
  const fetchObject = async (ref: Ref) => {
    fetched.push(ref.sha256)
    if (refuse.has(ref.sha256)) throw new Error('refused by the test')
    const b = objects.get(ref.sha256)
    if (!b) throw new Error('no such object')
    return b
  }
  return { objects, fetched, refuse, fetchObject }
}
/** a part's ref as a job tells it (`prev` its predecessor's digest) and as the catalog does (no prev) */
const jobRef = (M: Made, i: number): TellRef => ({ ...(M.parts[i]!.ref as Ref), prev: i ? M.parts[i - 1]!.sha256 : null })
const catalogRef = (M: Made, i: number): TellRef => M.parts[i]!.ref as Ref
const shas = (parts: readonly { sha256: string }[]) => parts.map(p => p.sha256)

describe('the feed: the index', () => {
  it('reads the head and its chunks into the index, whichever is told first', async () => {
    const M = await made()
    const s = server(M)
    for (const order of ['head first', 'units first']) {
      const f = createFeed({ fetchObject: s.fetchObject })
      if (order === 'head first') { f.tell({ head: M.head.ref }); f.tell({ units: M.chunks.map(c => c.ref) }) } else { f.tell({ units: M.chunks.map(c => c.ref) }); f.tell({ head: M.head.ref }) }
      const index = await f.index()
      expect(index?.sha256, order).toBe(M.index.sha256)
      expect(index?.units, order).toEqual(M.index.units)
      expect(f.state().refused).toBeNull()
      f.dispose()
    }
  })

  it('tells the units\' kinds before the head, from the chunks told (an early wave\'s, layer-side warmEarly), the index\'s once it is read; none with no chunk from id 0', async () => {
    const M = await made()
    const s = server(M)
    const f = createFeed({ fetchObject: s.fetchObject })
    expect(await f.kinds()).toBeNull()
    f.tell({ units: M.chunks.map(c => c.ref) })
    expect(await f.kinds()).toEqual(M.index.kinds)
    // (the chunks' bytes kept for the index, read with the head as before)
    const index = await (f.tell({ head: M.head.ref }), f.index())
    expect(index?.sha256).toBe(M.index.sha256)
    expect(await f.kinds()).toBe(index?.kinds)
    f.dispose()
    // a chunk refused: none, and the index refuses it as before
    const r = server(M)
    r.objects.set(M.chunks[0]!.sha256, new Uint8Array([1, 2, 3]))
    const g = createFeed({ fetchObject: r.fetchObject })
    g.tell({ units: M.chunks.map(c => c.ref) })
    expect(await g.kinds()).toBeNull()
    g.dispose()
  })

  it('refuses a units chunk or a head that is not its ref\'s: no index, the why told', async () => {
    const M = await made()
    for (const [what, sha] of [['units', M.chunks[0]!.sha256], ['head', M.head.sha256]] as const) {
      const s = server(M)
      s.objects.set(sha, new Uint8Array([1, 2, 3]))
      const f = createFeed({ fetchObject: s.fetchObject })
      f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref) })
      expect(await f.index(), what).toBeNull()
      expect(f.state().refused, what).toBe(what)
      f.dispose()
    }
  })

  it('passes over a second head, one warning', async () => {
    const M = await made()
    const warned: string[] = []
    const f = createFeed({ fetchObject: server(M).fetchObject, warn: w => warned.push(w) })
    f.tell({ head: M.head.ref })
    f.tell({ head: { ...M.head.ref, sha256: 'f'.repeat(64) } })
    f.tell({ head: { ...M.head.ref, sha256: 'e'.repeat(64) } })
    expect((await f.index())?.sha256).toBe(M.index.sha256)
    expect(warned).toEqual(['another head is passed over'])
    f.dispose()
  })
})

describe('the feed: L3, the parts in page order from any source', () => {
  it('reads parts told out of order, from a job and the catalog at once, as the chain they make; a ref told twice is fetched once', async () => {
    const M = await made()
    const s = server(M)
    const f = createFeed({ fetchObject: s.fetchObject })
    f.tell({ parts: [jobRef(M, 2)] })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref) })
    f.tell({ parts: [catalogRef(M, 1), jobRef(M, 2)] })
    await flush()
    // (nothing read past a part not told: page 1's)
    expect(f.state().parts).toEqual([])
    f.tell({ parts: [jobRef(M, 0), catalogRef(M, 0)], end: { through: 4 } })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    expect(f.state().parts).toEqual(M.readParts)
    expect(f.state().ended).toBe(true)
    for (const sha of new Set(s.fetched)) expect(s.fetched.filter(x => x === sha).length, sha).toBe(1)
    f.dispose()
  })

  it('is not ended before the parts read reach the end told', async () => {
    const M = await made()
    const f = createFeed({ fetchObject: server(M).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [jobRef(M, 0)], end: { through: 4 } })
    await flush()
    expect(f.state().ended).toBe(false)
    f.tell({ parts: [jobRef(M, 1), jobRef(M, 2)] })
    await flush()
    expect(f.state().ended).toBe(true)
    f.dispose()
  })

  it('holds a part whose `prev` is not the last told until its predecessor comes', async () => {
    const M = await made()
    const f = createFeed({ fetchObject: server(M).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref) })
    f.tell({ parts: [jobRef(M, 0), { ...jobRef(M, 1), prev: 'a'.repeat(64) }] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256])
    f.dispose()
  })
})

describe('the feed: L14, a part refused', () => {
  it('stops the chain at the part before it; told again, it is fetched and read again', async () => {
    const M = await made()
    const s = server(M)
    s.refuse.add(M.parts[1]!.sha256)
    const warned: string[] = []
    const f = createFeed({ fetchObject: s.fetchObject, warn: w => warned.push(w) })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256])
    expect(warned).toEqual(['the layer\'s part from page 2'])
    const before = s.fetched.filter(x => x === M.parts[1]!.sha256).length
    s.refuse.clear()
    f.tell({ parts: [jobRef(M, 1)] })
    await flush()
    expect(s.fetched.filter(x => x === M.parts[1]!.sha256).length).toBe(before + 1)
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    f.dispose()
  })

  it('refuses a part its bytes do not read as (another digest): the chain stops there', async () => {
    const M = await made()
    const s = server(M)
    s.objects.set(M.parts[2]!.sha256, M.parts[1]!.bytes)
    const f = createFeed({ fetchObject: s.fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts.slice(0, 2)))
    expect(f.state().refused).toBeNull()
    f.dispose()
  })
})

describe('the feed: L15, a fork', () => {
  it('a part beginning at a page told under another digest resets the chain from that page', async () => {
    const M = await made()
    // another attempt's part of pages 2-3: the same chain before it, other bytes
    const input = partInputs(M.head.sha256, M.lefts)[1]!
    const other = await writePart({ ...input, prev: M.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    expect(other.sha256).not.toBe(M.parts[1]!.sha256)
    const s = server(M, [other])
    const f = createFeed({ fetchObject: s.fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    f.tell({ parts: [{ ...(other.ref as Ref), prev: M.parts[0]!.sha256 }] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256, other.sha256])
    // (the old chain's part told again is no fork: its predecessor is no longer the chain's)
    f.tell({ parts: [jobRef(M, 2)] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256, other.sha256])
    f.dispose()
  })

  it('takes the catalog\'s chain, told without prev, where it differs from a part told at its page', async () => {
    const M = await made()
    const input = partInputs(M.head.sha256, M.lefts)[1]!
    const other = await writePart({ ...input, prev: M.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const f = createFeed({ fetchObject: server(M, [other]).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [jobRef(M, 0), { ...(other.ref as Ref), prev: M.parts[0]!.sha256 }] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256, other.sha256])
    f.tell({ parts: [0, 1, 2].map(i => catalogRef(M, i)), end: { through: 4 } })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    expect(f.state().ended).toBe(true)
    f.dispose()
  })
})

describe('the feed: a fork that does not read, a source that comes late (the review\'s probe 1)', () => {
  it('a fork part that is refused: the catalog telling the true chain again restores it, through its end', async () => {
    const M = await made()
    const s = server(M)
    const f = createFeed({ fetchObject: s.fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(f.state().parts.length).toBe(3)
    // a job update telling a "fork" at part 2's pages whose object is none (its digest wrong)
    f.tell({ parts: [{ ...(M.parts[1]!.ref as Ref), sha256: 'a'.repeat(64), prev: M.parts[0]!.sha256 }] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256])
    f.tell({ parts: [0, 1, 2].map(i => catalogRef(M, i)), end: { through: N } })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    expect(f.state().ended).toBe(true)
    f.dispose()
  })

  it('a job\'s fork, then a 202 made before it telling the old chain: the fork stands; the catalog\'s chain is the one kept', async () => {
    const M = await made()
    const input = partInputs(M.head.sha256, M.lefts)[1]!
    const other = await writePart({ ...input, prev: M.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const f = createFeed({ fetchObject: server(M, [other]).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1].map(i => jobRef(M, i)) })
    await flush()
    // the job's fork at page 2
    f.tell({ parts: [{ ...(other.ref as Ref), prev: M.parts[0]!.sha256 }] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256, other.sha256])
    // a 202 computed before it, delivered after: the old chain, which is no newer
    f.tell({ parts: [0, 1].map(i => jobRef(M, i)) })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256, other.sha256])
    // the catalog names the chain: it is kept, whatever came before
    f.tell({ parts: [0, 1, 2].map(i => catalogRef(M, i)), end: { through: N } })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    // and a stale source after it changes nothing
    f.tell({ parts: [{ ...(other.ref as Ref), prev: M.parts[0]!.sha256 }] })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    f.dispose()
  })
})

describe('the feed: the bytes, and an abort that is not the feed\'s', () => {
  it('keeps no object\'s bytes once it is read: the index\'s, the parts\', and a units ref the head does not name', async () => {
    const M = await made()
    const s = server(M)
    const f = createFeed({ fetchObject: s.fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(f.state().parts.length).toBe(3)
    expect(f.state().held).toBe(0)
    // a part that waits (its predecessor not told) is not fetched until it joins
    const g = createFeed({ fetchObject: s.fetchObject })
    const before = s.fetched.length
    g.tell({ parts: [jobRef(M, 2)] })
    await flush()
    expect(s.fetched.length).toBe(before)
    g.dispose()
    f.dispose()
  })

  it('an AbortError that is not the feed\'s own dispose refuses the object; told again, it is fetched again', async () => {
    const M = await made()
    const s = server(M)
    let abort = true
    const fetchObject = async (ref: Ref, signal: AbortSignal) => {
      if (abort && ref.sha256 === M.parts[1]!.sha256) throw Object.assign(new Error('aborted by the host'), { name: 'AbortError' })
      void signal
      return s.fetchObject(ref)
    }
    const warned: string[] = []
    const f = createFeed({ fetchObject, warn: w => warned.push(w) })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(f.state().parts.length).toBe(1)
    expect(warned).toEqual(['the layer\'s part from page 2'])
    abort = false
    f.tell({ parts: [jobRef(M, 1)] })
    await flush()
    expect(f.state().parts.length).toBe(3)
    f.dispose()
  })
})

describe('the feed: the PR\'s review', () => {
  it('a catalog that names a shorter chain: the parts read past it let go, the end at the catalog\'s (4288064787)', async () => {
    const M = await made()
    const f = createFeed({ fetchObject: server(M).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(M, i)) })
    await flush()
    expect(f.state().parts.length).toBe(3)
    f.tell({ parts: [catalogRef(M, 0)], end: { through: 1 } })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256])
    expect(f.state().ended).toBe(true)
    f.dispose()
  })

  it('a head whose fetch fails is refused as the head (4288065447)', async () => {
    const M = await made()
    const s = server(M)
    s.refuse.add(M.head.sha256)
    const f = createFeed({ fetchObject: s.fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref) })
    expect(await f.index()).toBeNull()
    expect(f.state().refused).toBe('head')
    f.dispose()
  })

  it('reads an index of two units chunks, each chunk\'s bytes let go once it is read (4288144918)', async () => {
    const { writeHead, writeUnitChunks } = await import('@/pdf-reader/engine/layer-proto/format.mjs')
    const paper = { id: '2608.04322', version: 1 }
    // units past one chunk's 2 MiB: two chunks
    const units = Array.from({ length: 150 }, (_, i) => ['para', 0, null, null, null, [[0, `${i} ${'x'.repeat(15_000)}`]]] as never)
    const chunks = await writeUnitChunks({ paper, units })
    expect(chunks.length).toBe(2)
    const head = await writeHead({ paper: { ...paper, pages: 1 }, base: { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }, image: '1', units: chunks, lineskip: null })
    let release!: () => void
    const late = new Promise<void>(r => { release = r })
    const objects = new Map([...chunks, head].map(w => [w.sha256, w.bytes]))
    const f = createFeed({ fetchObject: async (ref: Ref) => { if (ref.sha256 === chunks[1]!.sha256) await late; return objects.get(ref.sha256)! } })
    f.tell({ head: head.ref })
    await flush(60)
    // the first chunk read, the second's fetch awaited: the first's bytes let go
    expect(f.state().held).toBe(1)
    release()
    const index = await f.index()
    expect(index?.units.length).toBe(150)
    expect(f.state().held).toBe(0)
    f.dispose()
  })
})

describe('the feed: the PR\'s review, second round', () => {
  it('a catalog shortening the chain does not bring back a part that waited before it (4289064224)', async () => {
    const M = await made()
    const input = partInputs(M.head.sha256, M.lefts)[1]!
    const other = await writePart({ ...input, prev: M.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const f = createFeed({ fetchObject: server(M, [other]).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1].map(i => jobRef(M, i)) })
    await flush()
    // a job's fork at page 2, then the old page 2 told again late: it waits (heard before the fork)
    f.tell({ parts: [{ ...(other.ref as Ref), prev: M.parts[0]!.sha256 }] })
    await flush()
    f.tell({ parts: [jobRef(M, 1)] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256, other.sha256])
    // the catalog names page 1 alone
    f.tell({ parts: [catalogRef(M, 0)], end: { through: 1 } })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256])
    expect(f.state().ended).toBe(true)
    f.dispose()
  })
})

describe('the feed: the PR\'s review, third round (#379)', () => {
  it('a catalog of no part, its end at page 0, names the chain empty: the job\'s parts let go (4289273351)', async () => {
    const M = await made()
    const f = createFeed({ fetchObject: server(M).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [0, 1].map(i => jobRef(M, i)) })
    await flush()
    expect(f.state().parts.length).toBe(2)
    f.tell({ parts: [], end: { through: 0, refused: 'bound' } })
    await flush()
    expect(f.state().parts).toEqual([])
    expect(f.state().ended).toBe(true)
    // (a tell of the end alone, with no parts named, is no catalog: the chain stays)
    const g = createFeed({ fetchObject: server(M).fetchObject })
    g.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [jobRef(M, 0)] })
    g.tell({ end: { through: 4 } })
    await flush()
    expect(g.state().parts.length).toBe(1)
    g.dispose()
    f.dispose()
  })

  it('the first catalog, of no part, drops a part that waited before it: a later page 1 joins it alone (4290316952, 4290327860)', async () => {
    const M = await made()
    const f = createFeed({ fetchObject: server(M).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [catalogRef(M, 1)] })
    await flush()
    f.tell({ parts: [], end: { through: 0 } })
    f.tell({ parts: [jobRef(M, 0)] })
    await flush()
    expect(shas(f.state().parts)).toEqual([M.parts[0]!.sha256])
    f.dispose()
  })

  it('the same catalog told again keeps a part that came after it and waits for its predecessor (4289273579)', async () => {
    const M = await made()
    const f = createFeed({ fetchObject: server(M).fetchObject })
    f.tell({ head: M.head.ref, units: M.chunks.map(c => c.ref), parts: [catalogRef(M, 0)], end: { through: 1 } })
    await flush()
    expect(f.state().parts.length).toBe(1)
    // a later build: its part of page 4 first (it waits for pages 2-3), the same catalog again, then the part of pages 2-3
    f.tell({ parts: [jobRef(M, 2)], end: { through: 4 } })
    f.tell({ parts: [catalogRef(M, 0)], end: { through: 1 } })
    f.tell({ parts: [jobRef(M, 1)], end: { through: 4 } })
    await flush()
    expect(shas(f.state().parts)).toEqual(shas(M.readParts))
    expect(f.state().ended).toBe(true)
    f.dispose()
  })
})

describe('the feed: dispose', () => {
  it('lets the fetches go and resolves no index after it', async () => {
    const M = await made()
    let signal: AbortSignal | null = null
    const f = createFeed({ fetchObject: (_r, s) => { signal = s; return new Promise<Uint8Array>(() => {}) } })
    f.tell({ head: M.head.ref })
    await flush(2)
    f.dispose()
    expect(await f.index()).toBeNull()
    expect((signal as AbortSignal | null)?.aborted).toBe(true)
  })
})
