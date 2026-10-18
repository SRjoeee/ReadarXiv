// @vitest-environment node
import { LAB_ON, LAB_PAPERS, labFiles } from './helpers/lab-data'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { type Cut, type CutEntry, cutBundle, type CutOptions, needFrontier, partCutter, TAIL_NOT_CARRIED, wholeFrontier } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import {
  CONTENT_MAX, indexOf, type LayerIndex, mergeParts, PART_CAP, PART_VALUES, type PartChain, partTarget, type ReadPart, type ReadUnitsChunk, type ReadUnitsChunkLight, readHead, readLeftPart, readPart, readUnitsChunk, writePart,
  type Ref,
} from '@/pdf-reader/engine/layer-proto/format.mjs'
import { needBound, needsOf, rowLeadOf } from '@/pdf-reader/engine/layer-proto/need.mjs'
import { NAME_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { groupOf } from '@/pdf-reader/engine/translate/groups.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { encodeLayout, indexLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { BASE_OF, leftPagesOf, type PaperSpec, TOKENS_PER_PAGE, type Whole, wholeOf } from './helpers/cut-paper'
import { tailOf, tokenWire } from './helpers/format-paper'

// The cutter (bundle 4 contract C3b, C3c): a paper made whole, cut into the units' chunks, the head, the parts at the doubling
// schedule closed by page and by the stream's prefix, and the left parts. The properties are the writers' guarantees to the
// door: every part passes its reader in order, the parts merge back to the whole, every K entry is told once, and a part holds
// everything the pages up to its last need (the frontier of the door's own rule)

/** the cut at the doubling schedule alone: the properties below are the schedule's (the extension over the need bound has its own tests) */
const cutPlain = (whole: Parameters<typeof cutBundle>[0], o: Parameters<typeof cutBundle>[1]) => cutBundle(whole, { extend: false, ...o })

// ---------------------------------------------------------------- what run.mjs does, restated for the oracle
// (the layer opens a canvas at import, as a browser's modules may; node has none)
class StubCanvas { width = 8; height = 8; getContext() { return null } }
async function texRectsOf(): Promise<(lu: unknown) => { rects: number[][] }> {
  const g = globalThis as { OffscreenCanvas?: unknown }
  const had = g.OffscreenCanvas
  g.OffscreenCanvas = StubCanvas
  try { return (await import('@/pdf-reader/engine/layer-proto/tex.mjs')).texRects as never } finally { g.OffscreenCanvas = had }
}

interface OracleEntry { id: number; stream: number; rects: number[][] | null; lists: number[][]; reach: Set<number>; reads?: number[]; follows?: number | null }
/** run.mjs's K (openProto, `cands` to `reach`) over the whole's left and layout file, with the file's own texRects */
async function oracleK(whole: Whole): Promise<OracleEntry[]> {
  const texRects = await texRectsOf()
  const N = whole.paper.pages
  const cands: OracleEntry[] = whole.left.units.map(([id, stream, rects]) => ({ id, stream, rects, lists: [], reach: new Set() }))
  const index = whole.layout ? indexLayout(whole.layout) : null
  if (index) {
    const inGeometry = new Set(cands.map(c => c.id)), streamOf = new Map(whole.left.units.map(([id, stream]) => [id, stream]))
    for (const id of index.file.units.map(r => r[0] as number)) {
      if (inGeometry.has(id)) continue
      let before = -1
      for (const [gid, s] of streamOf) if (gid < id && s > before) before = s
      cands.push({ id, stream: before + 0.5, rects: null, lists: [], reach: new Set() })
    }
  }
  const K = cands.slice().sort((a, b) => a.stream - b.stream)
  const shownOf = (rects: number[][]) => [...new Set(rects.filter(r => (r[0] as number) <= N).map(r => r[0] as number))]
  for (const c of K) {
    const lu = index ? index.unit(c.id) : null
    const from = [c.rects, lu ? texRects(lu).rects : null].filter((x): x is number[][] => !!x)
    c.lists = from.map(shownOf).filter(l => l.length)
    c.reach = new Set(from.flatMap(rs => rs.map(r => r[0] as number)))
    // (and the pages of its placeholders' segments, as run.mjs segPagesOf reads them from the layout file)
    const out = new Set<number>()
    for (const row of lu ? (lu as unknown as { ph: Map<number, { segs: Float64Array }> }).ph.values() : []) for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o]! >= 1 && row.segs[o]! <= N) out.add(row.segs[o]!)
    c.reads = [...out]
  }
  // (and the unit before it in K whose last row its first row continues on a shared line, chosen among those before it in K,
  // as run.mjs addUnits reads it)
  K.forEach((c, i) => { const before = new Set(K.slice(0, i).map(x => x.id)); c.follows = (index ? rowLeadOf(index, c.id, id => before.has(id)) : null)?.id ?? null })
  return K
}

// ---------------------------------------------------------------- reading a cut back, as the service reads it
interface Back { index: LayerIndex; parts: ReadPart[]; streamOf: Map<number, number> }
async function readBack(c: Cut): Promise<Back> {
  const rh = await readHead(c.head.bytes, { ref: c.head.ref })
  const read: ReadUnitsChunk[] = []
  for (const u of c.units) read.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: read.at(-1) ?? null }))
  const index = indexOf(rh, read)
  const parts: ReadPart[] = []
  const streamOf = new Map<number, number>()
  let chain: PartChain | null = null
  for (const p of c.parts) {
    const r = await readPart(p.bytes, { ref: p.ref, index, chain })
    for (const w of r.left) streamOf.set(w[0], w[1])
    for (const l of p.leftParts) await readLeftPart(l.bytes, { ref: l.ref as Ref & { page: number }, streamOf: id => streamOf.get(id) })
    parts.push(r)
    chain = r.chain
  }
  return { index, parts, streamOf }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const contentBytes = (bytes: Uint8Array) => bytes.length

/** every property the cut guarantees, on one paper */
async function checkCut(name: string, whole: Whole, c: Cut, o: { anySplit?: boolean } = {}): Promise<void> {
  const N = whole.paper.pages
  const back = await readBack(c)
  const { index, parts } = back
  // the schedule: pages contiguous from 1 to N, a part never longer than the doubling's target, and every part within bounds
  let a = 1
  c.parts.forEach((p, i) => {
    expect(p.from, `${name}: part ${i}`).toBe(a)
    if (!o.anySplit) expect(p.to, `${name}: part ${i}`).toBeLessThanOrEqual(partTarget(a, N))
    expect(p.leftParts.map(l => l.page)).toEqual(Array.from({ length: p.to - p.from + 1 }, (_, k) => p.from + k))
    expect(p.bytes.length).toBeLessThanOrEqual(PART_CAP)
    expect(contentBytes(p.bytes)).toBeLessThanOrEqual(CONTENT_MAX)
    expect(p.values).toBeLessThanOrEqual(PART_VALUES)
    a = p.to + 1
  })
  expect(a, name).toBe(N + 1)
  expect(c.end).toEqual({ through: N })
  expect(c.left.map(l => l.page)).toEqual(Array.from({ length: N }, (_, k) => k + 1))
  // the parts merge back to the whole
  const merged = mergeParts(index, parts)
  expect(merged.units, name).toEqual(whole.units)
  expect(merged.left.units, name).toEqual(whole.left.units.map(([id, s, rs]) => [id, s, rs.map(r => [r[0], r3(r[1] as number), r3(r[2] as number), r3(r[3] as number), r3(r[4] as number)])]))
  expect(merged.left.pages, name).toEqual(whole.left.pages)
  if (whole.layout) {
    // (a part with its own layout: every part has one here; the merge is the file's rows)
    expect(encodeLayout({ ...merged.layout!, left: whole.layout.left }), name).toBe(encodeLayout(whole.layout))
  } else expect(merged.layout, name).toBeNull()

  // K, once each: every left unit and every layout unit, in one part
  const K = await oracleK(whole)
  const told = parts.flatMap((p, i) => [...p.left.map(w => [w[0], i] as const), ...p.fileOnly.map(e => [e[0], i] as const)])
  expect(new Set(told.map(t => t[0])).size, name).toBe(told.length)
  expect([...told.map(t => t[0])].sort((x, y) => x - y), name).toEqual(K.map(e => e.id).sort((x, y) => x - y))
  const partOf = new Map(told)
  // every table group is told whole by one part (M18): the door reads a group at once
  const byGroup = new Map<string, Set<number>>()
  for (const [id, part] of told) {
    const g = groupOf({ cell: whole.units[id]?.[3] } as never)
    if (g !== null) (byGroup.get(g) ?? byGroup.set(g, new Set()).get(g)!).add(part)
  }
  for (const [g, set] of byGroup) expect(set.size, `${name}: group ${g} in parts ${[...set]}`).toBe(1)

  // the stream-prefix closure, by the door's own rule (needsOf over the whole's K): after part i, every entry up to the
  // frontier of its last page is in a part no later; and every left unit first framed on a page <= b is
  const F = needsOf(K, N, true, c => !c.rects).lay
  parts.forEach((p, i) => {
    const b = p.pages[1]
    for (let k = 0; k <= F[b]!; k++) expect(partOf.get(K[k]!.id)!, `${name}: K[${k}] (unit ${K[k]!.id}) by page ${b}`).toBeLessThanOrEqual(i)
    for (const e of K) {
      const first = e.rects?.length ? Math.min(...e.rects.map(r => r[0] as number)) : Infinity
      if (first <= b) expect(partOf.get(e.id)!, `${name}: left unit ${e.id} first framed on page ${first}`).toBeLessThanOrEqual(i)
    }
    // (and the order inside the chain is K's: ids told in (slot, id) order was checked by the reader)
    // every unit of the part reaches a page the part's views hold
    expect(p.reach).toBeGreaterThanOrEqual(b)
  })

  // fileOnly: today's `before` over the whole paper
  const streams = new Map(whole.left.units.map(([id, s]) => [id, s]))
  for (const p of parts) {
    for (const [id, after] of p.fileOnly) {
      let before = -1
      for (const [gid, s] of streams) if (gid < id && s > before) before = s
      expect(after, `${name}: unit ${id}`).toBe(before)
    }
  }
  // the left parts: the tokens the producer gave, page by page
  for (const l of c.left) expect(l.ref.kind).toBe('left')
}

const fits = (c: Cut) => c.parts.map(p => [p.from, p.to])

// ---------------------------------------------------------------- the small papers
/** eight pages. Unit 4 is a float whose cells are set late: its stream is small, its page is 6 */
const SMALL: PaperSpec = {
  pages: 8,
  units: [
    { stream: 0, rects: [1], lines: [1] },
    { stream: 5, rects: [1, 2], lines: [1, 2] },
    { stream: null, lines: [2] },
    { stream: 25, rects: [2], lines: [2] },
    { stream: 10, rects: [6], lines: [6] },
    { stream: 45, rects: [4] },
    { stream: 61, rects: [5, 6, 7], lines: [5, 6, 7] },
    { stream: 150, rects: [8], lines: [8] },
    { stream: null, lines: [7] },
  ],
  names: [{ page: 2 }, { page: 5, unit: 6 }, { page: 8 }],
}

describe('the cut of a small paper', () => {
  it('passes every property: the readers in order, the merge, K once, the prefix closure, fileOnly', async () => {
    const whole = wholeOf(SMALL)
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    await checkCut('small', whole, c)
    expect(fits(c)).toEqual([[1, 1], [2, 3], [4, 7], [8, 8]])
  })

  it('without a layout file: left only, no file-only units, every part\'s add-on null', async () => {
    const whole = wholeOf(SMALL, { layout: false })
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    await checkCut('small, no layout', whole, c)
    const back = await readBack(c)
    for (const p of back.parts) { expect(p.layout).toBeNull(); expect(p.addon).toBeNull(); expect(p.fileOnly).toEqual([]) }
  })

  it('carries a float whose cells are set on a later page in the part of the unit before it in the stream', async () => {
    const whole = wholeOf(SMALL)
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const back = await readBack(c)
    const partOf = (id: number) => back.parts.findIndex(p => p.left.some(w => w[0] === id) || p.fileOnly.some(e => e[0] === id))
    // unit 4 (stream 10, page 6) comes before unit 3 (stream 25, page 2): in part 1 (pages 2-3) with it, though on page 6
    expect(partOf(4)).toBe(partOf(3))
    expect(partOf(4)).toBe(1)
    expect(back.parts[1]!.reach).toBe(6)
    // its rects on page 6 are in the part, the part's views reach it, and the next part's views repeat what was told
    expect(back.parts[1]!.left.find(w => w[0] === 4)![2].map(r => r[0])).toEqual([6])
    expect(back.parts[1]!.views.length).toBe(4 * (6 - 2 + 1))
  })

  it('gives a layout-only unit the stream of the left unit before it by id as its slot', async () => {
    const whole = wholeOf(SMALL)
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const back = await readBack(c)
    const fileOnly = back.parts.flatMap(p => p.fileOnly)
    // unit 2: the largest stream of a left unit with a smaller id (units 0 and 1: 0, 5); unit 8: units 0 to 7 (150)
    expect(fileOnly).toEqual([[2, 5], [8, 150]])
  })

  it('is deterministic: the same input, the same bytes and keys', async () => {
    const whole = wholeOf(SMALL)
    const run = () => cutBundle(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const [x, y] = [await run(), await run()]
    const keys = (c: Cut) => [...c.units, c.head, ...c.parts, ...c.left].map(w => `${w.key}:${w.sha256}`)
    expect(keys(x)).toEqual(keys(y))
    expect(x.parts.map(p => [...p.bytes])).toEqual(y.parts.map(p => [...p.bytes]))
    // and not by an accident of the input's key order or its object identity
    const copy = JSON.parse(JSON.stringify(whole)) as Whole
    const z = await cutBundle(copy, { leftPages: leftPagesOf(copy), base: BASE_OF })
    expect(keys(z)).toEqual(keys(x))
  })

  it('takes the add-on from the hook, once for each part with a layout, in order', async () => {
    const whole = wholeOf(SMALL)
    const asked: [number, number[]][] = []
    const chainAddon: NonNullable<CutOptions['chainAddon']> = (i, { pages }) => { asked.push([i, pages]); return null }
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon })
    expect(asked).toEqual(fits(c).map((p, i) => [i, p]))
  })

  it('writes no add-on where the whole has none and no hook makes one (M20): every part with a layout has addon null', async () => {
    const whole = wholeOf(SMALL)
    expect(whole.addon ?? null).toBeNull()
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const back = await readBack(c)
    expect(back.parts.some(p => p.layout !== null)).toBe(true)
    for (const p of back.parts) { expect(p.addon).toBeNull(); expect(p.chain.r).toBe(0) }
    // (made whole again: no add-on, as BUNDLE 3's bundle with none)
    expect(mergeParts(back.index, back.parts).addon).toBeNull()
    await checkCut('small, no add-on', whole, c)
    // a hook that answers null still plans the pages as not planned: its pages are drawn by erase and restore
    const hooked = await readBack(await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: () => null }))
    expect(hooked.parts.filter(p => p.layout !== null).every(p => Object.values(p.addon!.manifest.page).every(e => e.ok === false && e.refused === 'not planned'))).toBe(true)
  })

  it('carries the whole add-on\'s manifest without its tail: clean pages stay, removed pages and refused pages are refused', async () => {
    const whole = wholeOf(SMALL)
    // 8 pages: 1 clean; 2 removed (R page 9, dirty boxes, units); 3 refused by the remover; 4 clean with rules; 5 removed (R page 10);
    // 6 refused; 7 clean; 8 removed (R page 11)
    const page = {
      1: { ok: true }, 2: { ok: true, units: { 3: [72, 640, 300, 660] }, at: { R: 9 }, dirty: [72, 640, 80, 650] }, 3: { ok: false, refused: 'a form painted twice' },
      4: { ok: true, rules: [72, 500, 540, 500.4] }, 5: { ok: true, at: { R: 10 } }, 6: { ok: false, refused: 'not planned' }, 7: { ok: true }, 8: { ok: true, at: { R: 11 }, units: { 7: [72, 100, 200, 120] } },
    }
    const manifest = { schema: 1 as const, removal: REMOVAL, pages: 8, sets: {}, page, appended: 1234, stats: { removed: 3, rules: 1 } }
    const c = await cutPlain({ ...whole, addon: { manifest } }, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const back = await readBack(c)
    const entries = Object.assign({}, ...back.parts.map(p => p.addon!.manifest.page))
    expect(entries[1]).toEqual({ ok: true })
    expect(entries[2]).toEqual({ ok: false, refused: TAIL_NOT_CARRIED })
    expect(entries[3]).toEqual({ ok: false, refused: 'a form painted twice' })
    expect(entries[4]).toEqual({ ok: true, rules: [72, 500, 540, 500.4] })
    expect(entries[5]).toEqual({ ok: false, refused: TAIL_NOT_CARRIED })
    expect(entries[6]).toEqual({ ok: false, refused: 'not planned' })
    expect(entries[7]).toEqual({ ok: true })
    expect(entries[8]).toEqual({ ok: false, refused: TAIL_NOT_CARRIED })
    for (const p of back.parts) { expect(p.addon!.tail).toBeNull(); expect(p.addon!.manifest.appended).toBe(0); expect(p.addon!.r).toBe(0) }
    await checkCut('small, add-on manifest', whole, c)
    // with the hook, the hook decides: the whole's manifest is not read
    const hooked = await cutPlain({ ...whole, addon: { manifest } }, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: () => null })
    const hookedBack = await readBack(hooked)
    expect(Object.assign({}, ...hookedBack.parts.map(p => p.addon!.manifest.page))[1]).toEqual({ ok: false, refused: 'not planned' })
  })

  it('lets the hook\'s add-on take part in the fit: a manifest that overflows [2,3] shortens the part, hook calls counted, acceptAddon once for each final part', async () => {
    // 3 pages of 550 headings of 4,000 characters (2.2 MB a page): [2,3] fits alone (4.4 MB), not with 2 × 300 KB of manifest boxes
    const units: PaperSpec['units'] = []
    for (let p = 1; p <= 3; p++) for (let k = 0; k < 550; k++) units.push({ stream: null, lines: [p], heading: 'x'.repeat(4000) })
    const whole = wholeOf({ pages: 3, units })
    const heavy = (pages: number[]) => {
      const page: Record<number, unknown> = {}
      for (const p of pages) page[p] = { ok: true, rules: Array.from({ length: 15_000 }, () => [72, 500, 540, 500.4]).flat() }
      return { manifest: { schema: 1 as const, removal: REMOVAL, pages: 3, sets: {}, page, appended: 0, stats: {} }, tail: null }
    }
    const asked: [number, number[]][] = [], accepted: [number, number[]][] = []
    const chainAddon: NonNullable<CutOptions['chainAddon']> = (i, { pages }) => {
      asked.push([i, pages])
      return heavy(Array.from({ length: pages[1] - pages[0] + 1 }, (_, k) => pages[0] + k)) as never
    }
    const c = await cutPlain(whole, { leftPages: () => null, base: BASE_OF, chainAddon, acceptAddon: (i, { pages }) => { accepted.push([i, pages]) } })
    expect(fits(c)).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(asked).toEqual([[0, [1, 1]], [1, [2, 3]], [1, [2, 2]], [2, [3, 3]]])
    expect(accepted).toEqual([[0, [1, 1]], [1, [2, 2]], [2, [3, 3]]])
    // (the add-on the hook gave is in the part that was written, and the parts read)
    const back = await readBack(c)
    expect(Object.keys(back.parts[1]!.addon!.manifest.page)).toEqual(['2'])
    expect((back.parts[1]!.addon!.manifest.page[2] as { rules: number[] }).rules.length).toBe(60_000)
  }, 120_000)

  it('shortens a part whose tail passes TAIL_CAP: two 600 KiB per-page tails give one part a page, and a page whose tail alone passes it ships no layout', async () => {
    const whole = wholeOf({ pages: 3, units: [1, 2, 3].map(p => ({ stream: p, rects: [p], lines: [p] })) })
    const hook = (kib: number) => {
      const asked: [number, number[]][] = [], accepted: [number, number[]][] = []
      let removed = 0
      const chainAddon: NonNullable<CutOptions['chainAddon']> = (i, { pages }) => {
        asked.push([i, pages])
        const count = pages[1] - pages[0] + 1
        // (the tail of `count` removed pages: filler, then a classic cross-reference section)
        const filler = new Uint8Array(kib * 1024 * count).fill(0x25)
        const section = tailOf(10_000 + filler.length, 9_000, 12, 100 + removed, count)
        const tail = new Uint8Array(filler.length + section.tail.length)
        tail.set(filler)
        tail.set(section.tail, filler.length)
        const page: Record<number, unknown> = {}
        for (let k = 0; k < count; k++) page[pages[0] + k] = { ok: true, at: { R: 3 + removed + 1 + k } }
        return { manifest: { schema: 1 as const, removal: REMOVAL, pages: 3, sets: {}, page, appended: tail.length, stats: {} }, tail } as never
      }
      return { asked, accepted, chainAddon, acceptAddon: ((i: number, { pages }: { pages: [number, number] }) => { accepted.push([i, pages]); removed += pages[1] - pages[0] + 1 }) as never }
    }
    const h = hook(600)
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: h.chainAddon, acceptAddon: h.acceptAddon })
    expect(fits(c)).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(h.asked).toEqual([[0, [1, 1]], [1, [2, 3]], [1, [2, 2]], [2, [3, 3]]])
    expect(h.accepted).toEqual([[0, [1, 1]], [1, [2, 2]], [2, [3, 3]]])
    // a page whose tail alone is past TAIL_CAP: the existing fallback, the page ships with no layout, no add-on, no accept
    const big = hook(1100)
    const d = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: big.chainAddon, acceptAddon: big.acceptAddon })
    expect(fits(d)).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(big.accepted).toEqual([])
    expect((await readBack(d)).parts.every(p => p.layout === null && p.addon === null)).toBe(true)
  }, 60_000)

  it('shortens a part whose layout passes a per-part bound (here 10,000 names)', async () => {
    const whole = wholeOf({ pages: 3, units: [], names: [1, 2, 3].flatMap(page => Array.from({ length: 6000 }, () => ({ page }))) })
    const c = await cutPlain(whole, { leftPages: () => null, base: BASE_OF })
    expect(fits(c)).toEqual([[1, 1], [2, 2], [3, 3]])
    const back = await readBack(c)
    expect(back.parts.map(p => p.layout!.names.length)).toEqual([6000, 6000, 6000])
  }, 60_000)

  it('takes a hook that returns null as the default add-on, and calls acceptAddon for it', async () => {
    const whole = wholeOf(SMALL)
    const accepted: [number, number[]][] = []
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: () => null, acceptAddon: (i, { pages }) => { accepted.push([i, pages]) } })
    expect(accepted).toEqual(fits(c).map((p, i) => [i, p]))
    await checkCut('small, null hook', whole, c)
  })

  it('does not call the hook for a part with no layout, nor accept one', async () => {
    const whole = wholeOf(SMALL, { layout: false })
    const asked: number[] = [], accepted: number[] = []
    await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: i => { asked.push(i); return null }, acceptAddon: i => { accepted.push(i) } })
    expect(asked).toEqual([])
    expect(accepted).toEqual([])
  })

  it('cuts at any split the target hook gives, and refuses one that is no page of the part', async () => {
    const whole = wholeOf(SMALL)
    const asked: [number, number][] = []
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, target: (a, N) => { asked.push([a, N]); return Math.min(N, a + 1) } })
    expect(fits(c)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]])
    expect(asked).toEqual([[1, 8], [3, 8], [5, 8], [7, 8]])
    await checkCut('small, pairs', whole, c, { anySplit: true })
    const every = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, target: a => a })
    expect(fits(every).length).toBe(8)
    await checkCut('small, one page a part', whole, every, { anySplit: true })
    for (const bad of [(a: number) => a - 1, () => 99, () => 1.5]) await expect(cutBundle(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, target: bad })).rejects.toThrow(RangeError)
  })

  it('refuses the paper whose unit was dropped, and a left unit that is no unit', async () => {
    const whole = wholeOf(SMALL)
    const dropped = { ...whole, units: whole.units.map((u, i) => (i === 3 ? null : u)) } as unknown as Whole
    await expect(cutBundle(dropped, { leftPages: leftPagesOf(whole), base: BASE_OF })).rejects.toBeInstanceOf(BundleRefusal)
    const stray = { ...whole, left: { ...whole.left, units: [...whole.left.units, [99, 300, [[1, 72, 100, 540, 110]]]] } } as unknown as Whole
    await expect(cutBundle(stray, { leftPages: leftPagesOf(whole), base: BASE_OF })).rejects.toBeInstanceOf(BundleRefusal)
  })
})

// ---------------------------------------------------------------- the cut a part at a time (E2b)
describe('partCutter: the cut a part at a time', () => {
  /** a cutter of `whole` as cutBundle makes one, its units and head written as cutBundle writes them */
  async function cutterOf(whole: Whole, o: Partial<Parameters<typeof partCutter>[0]> = {}) {
    const ref = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const cutter = partCutter({ paper: whole.paper, N: whole.paper.pages, head: ref.head, views: whole.left.pages, leftPages: leftPagesOf(whole), ...o })
    return { ref, cutter, ...wholeFrontier(whole) }
  }
  const keys = (parts: readonly { key: string; sha256: string }[]) => parts.map(w => `${w.key}:${w.sha256}`)

  it('fed each part with no row of a unit an earlier part told, nor a name of its pages, cuts the parts cutBundle cuts', async () => {
    const whole = wholeOf(SMALL)
    const { ref, cutter, K, F } = await cutterOf(whole)
    const layout = whole.layout!
    const told = new Set<number>()
    for (;;) {
      const a = cutter.from
      const left = <T extends unknown[]>(rows: T[]) => rows.filter(r => !told.has(r[0] as number))
      const rest = {
        ...layout, units: left(layout.units), lines: left(layout.lines), frames: left(layout.frames), erase: left(layout.erase), ph: left(layout.ph), labels: left(layout.labels),
        headings: left(layout.headings), pageText: left(layout.pageText), held: left(layout.held),
        names: layout.names.filter(r => ((r[10] as number) & NAME_FLAG.RUN_IN ? !told.has(r[11] as number) : (r[2] as number) >= a)),
      }
      const part = await cutter.next({ K, F, NB: null, layout: rest })
      if (part === null) break
      // (what the part told: its rows are let go)
      const wire = JSON.parse(new TextDecoder().decode(part.bytes)) as { left: [number][]; fileOnly: [number][] }
      for (const w of [...wire.left, ...wire.fileOnly]) told.add(w[0])
    }
    expect(keys(cutter.parts)).toEqual(keys(ref.parts))
    expect(keys(cutter.left)).toEqual(keys(ref.left))
    expect(cutter.verdicts).toEqual(ref.parts.map(() => null))
  })

  it('a part the verdict refuses is the same pages with no layout, its add-on not accepted; the parts after it read on', async () => {
    const whole = wholeOf(SMALL)
    const accepted: number[] = [], seen: [number, number][] = []
    const verdict: NonNullable<CutOptions['verdict']> = ({ pages, input, written }) => {
      seen.push(pages)
      expect(input.part).not.toBeNull()
      expect(written.bytes.length).toBeGreaterThan(0)
      return pages[0] <= 2 && pages[1] >= 2 ? { refused: 'carry', lines: [1, 10] } : null
    }
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, chainAddon: () => null, acceptAddon: i => { accepted.push(i) }, verdict })
    expect(fits(c)).toEqual([[1, 1], [2, 3], [4, 7], [8, 8]])
    expect(seen).toEqual(fits(c))
    expect(accepted).toEqual([0, 2, 3])
    const back = await readBack(c)
    expect(back.parts.map(p => p.layout === null)).toEqual([false, true, false, false])
    expect(back.parts[1]!.addon).toBeNull()
    // the refused part tells its left units alone (unit 2, layout-only, is not told); the others as without a verdict
    expect(back.parts[1]!.fileOnly).toEqual([])
    const plain = await readBack(await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF }))
    expect(back.parts[1]!.left).toEqual(plain.parts[1]!.left)
    // and the cutter's record of it, beside cutBundle's
    const { cutter, K, F } = await cutterOf(whole, { verdict, chainAddon: () => null })
    for (;;) if ((await cutter.next({ K, F, layout: whole.layout })) === null) break
    expect(cutter.verdicts).toEqual([null, { refused: 'carry', lines: [1, 10] }, null, null])
    expect(keys(cutter.parts)).toEqual(keys(c.parts))
  })

  it('under a verdict, a part whose writer refuses its layout (a row past its page\'s view) is its pages with none; without one, a throw', async () => {
    const whole = wholeOf(SMALL)
    // unit 3's line on page 2 (part [2, 3]) set past the page's right edge
    const bad = structuredClone(whole)
    const row = bad.layout!.lines.find(([id]) => id === 3)![1]
    row[2] = 5000
    await expect(cutPlain(bad, { leftPages: leftPagesOf(bad), base: BASE_OF })).rejects.toBeInstanceOf(BundleRefusal)
    // (the head and K of the paper as it was: the row's place alone changed)
    const { cutter, K, F } = await cutterOf(whole, { verdict: () => null })
    for (;;) if ((await cutter.next({ K, F, layout: bad.layout })) === null) break
    expect(cutter.parts.map(p => [p.from, p.to])).toEqual([[1, 1], [2, 3], [4, 7], [8, 8]])
    expect(cutter.verdicts.map(v => v?.refused ?? null)).toEqual([null, 'part', null, null])
    expect(cutter.verdicts[1]?.why).toMatch(/lines/)
    const read = (p: { bytes: Uint8Array }) => JSON.parse(new TextDecoder().decode(p.bytes)) as { layout: unknown }
    expect(cutter.parts.map(p => read(p).layout === null)).toEqual([false, true, false, false])
  })

  it('keeps no part nor left part once given where told so (retain false): the same parts, nulls behind', async () => {
    const whole = wholeOf(SMALL)
    const { ref, cutter, K, F } = await cutterOf(whole, { retain: false })
    const given: { key: string; sha256: string }[] = []
    for (;;) { const part = await cutter.next({ K, F, layout: whole.layout }); if (part === null) break; given.push(part) }
    expect(keys(given)).toEqual(keys(ref.parts))
    expect(cutter.parts.every(p => p === null)).toBe(true)
    expect(cutter.left.every(l => l === null)).toBe(true)
  })

  it('records a first page that alone passes a part\'s bounds with its layout as refused: part', async () => {
    const whole = wholeOf({ pages: 2, units: [{ stream: 1, rects: [1], lines: [1] }, ...Array.from({ length: 80 }, () => ({ stream: null, lines: [1], perPage: 1900 }))] })
    const { cutter, K, F } = await cutterOf(whole, { leftPages: () => null })
    for (;;) if ((await cutter.next({ K, F, layout: whole.layout })) === null) break
    expect(cutter.parts.map(p => [p.from, p.to])).toEqual([[1, 1], [2, 2]])
    expect(cutter.verdicts).toEqual([{ refused: 'part' }, null])
  }, 120_000)
})

// ---------------------------------------------------------------- table groups (M18, B2)
describe('table groups', () => {
  const cell = (row: number, col = 0, table = 0) => ({ table, row, col })
  /** a column of three cells across the page break between pages 1 and 2 */
  const COLUMN: PaperSpec = {
    pages: 3,
    units: [
      { stream: 0, rects: [1], lines: [1] },
      { stream: 10, rects: [1], lines: [1], cell: cell(0) },
      { stream: 11, rects: [2], lines: [2], cell: cell(1) },
      { stream: 12, rects: [2], lines: [2], cell: cell(2) },
      { stream: 20, rects: [2], lines: [2] },
      { stream: 30, rects: [3], lines: [3] },
    ],
  }
  const told = (parts: ReadPart[]) => parts.map(p => [...p.left.map(w => w[0]), ...p.fileOnly.map(e => e[0])].sort((a, b) => a - b))

  it('keeps a column of cells across a page break whole in the part of its first cell', async () => {
    const whole = wholeOf(COLUMN)
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    await checkCut('column', whole, c)
    const back = await readBack(c)
    expect(fits(c)).toEqual([[1, 1], [2, 3]])
    expect(told(back.parts)).toEqual([[0, 1, 2, 3], [4, 5]])
    expect(back.parts[0]!.reach).toBe(2)
  })

  it('closes a custom frontier over the groups too, and to a fixpoint', async () => {
    // K by stream: a(1) b(3) c(5) d(8); a and c are one column, b and d another: a pulls c, which reaches b, which pulls d
    const spec: PaperSpec = {
      pages: 4,
      units: [
        { stream: 1, rects: [1], lines: [1], cell: cell(0, 0, 0) },
        { stream: 3, rects: [2], lines: [2], cell: cell(0, 0, 1) },
        { stream: 5, rects: [3], lines: [3], cell: cell(1, 0, 0) },
        { stream: 8, rects: [4], lines: [4], cell: cell(1, 0, 1) },
      ],
    }
    const whole = wholeOf(spec)
    for (const frontier of [undefined, (_K: readonly CutEntry[], N: number) => Array.from({ length: N + 1 }, (_, b) => (b === 0 ? -1 : 0))]) {
      const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier })
      const back = await readBack(c)
      expect(told(back.parts)[0], 'all four in the first part').toEqual([0, 1, 2, 3])
      for (const t of told(back.parts).slice(1)) expect(t).toEqual([])
      await checkCut('fixpoint', whole, c)
    }
  })

  it('tells every group whole in one part, at any split', async () => {
    const whole = wholeOf(COLUMN)
    for (const target of [(a: number) => a, (a: number, N: number) => Math.min(N, a + 1)]) {
      const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, target })
      await checkCut('column, any split', whole, c, { anySplit: true })
      const parts = told((await readBack(c)).parts)
      expect(parts.filter(p => p.includes(1) || p.includes(2) || p.includes(3)).length).toBe(1)
    }
  })

  it('a group whose part holds no layout is drawn from the left: its left cells told, its layout-only cells not, no refusal', async () => {
    // one left cell on page 1 and 80 layout-only cells of its column on page 2 (152,000 lines): the closure puts them all in the
    // first part, whose layout is past the bounds; without its layout the part tells the one left cell, and the reader draws
    // the part from the left (C1.4, the door's layoutless path) as it draws any part with none
    const units: PaperSpec['units'] = [{ stream: 1, rects: [1], lines: [1], cell: cell(0) }]
    for (let k = 1; k <= 80; k++) units.push({ stream: null, lines: [2], perPage: 1900, cell: cell(k) })
    const whole = wholeOf({ pages: 2, units })
    const c = await cutPlain(whole, { leftPages: () => null, base: BASE_OF })
    const back = await readBack(c)
    expect(back.parts.map(p => [p.pages, p.layout === null])).toEqual([[[1, 1], true], [[2, 2], false]])
    expect(told(back.parts)).toEqual([[0], []])
  }, 120_000)

  it('has readPart refuse a part that tells a member of a group an earlier part told', async () => {
    const whole = wholeOf(COLUMN)
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    const back = await readBack(c)
    const wire = (id: number) => whole.left.units.find(w => w[0] === id)!
    const paper = whole.paper
    const views = (a: number, b: number) => whole.left.pages.slice(a - 1, b).flat()
    // the column split as the pre-closure cut had it: cell 1 in the first part, cells 2 and 3 in the second
    const first = await writePart({ paper, head: c.head.sha256, prev: null, pages: [1, 1], views: views(1, 1), left: [wire(0), wire(1)], fileOnly: [], layout: null, addon: null, leftParts: [c.left[0]!] })
    const second = await writePart({ paper, head: c.head.sha256, prev: first.sha256, pages: [2, 3], views: views(2, 3), left: [wire(2), wire(3), wire(4), wire(5)], fileOnly: [], layout: null, addon: null, leftParts: [c.left[1]!, c.left[2]!] })
    const one = await readPart(first.bytes, { ref: first.ref, index: back.index, chain: null })
    const refused = await readPart(second.bytes, { ref: second.ref, index: back.index, chain: one.chain }).catch(e => e)
    expect(refused).toBeInstanceOf(BundleRefusal)
    expect(refused.message).toMatch(/group/)
    expect(refused.path).toBe('left[0][0]')
    // the cutter's own parts pass (checkCut above), and cells of different columns split freely
    const other = wholeOf({ ...COLUMN, units: COLUMN.units.map((u, i) => (i === 3 ? { ...u, cell: cell(0, 1) } : u)) })
    const oc = await cutPlain(other, { leftPages: leftPagesOf(other), base: BASE_OF })
    expect(told((await readBack(oc)).parts)).toEqual([[0, 1, 2], [3, 4, 5]])
  })
})

// ---------------------------------------------------------------- the frontier
describe('the frontier', () => {
  it('is the door\'s rule by default, over K as run.mjs builds it', async () => {
    const whole = wholeOf(SMALL)
    let seen: readonly CutEntry[] = []
    let n = 0
    await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier: (K, N) => { seen = K; n = N; return needFrontier(K, N) } })
    const K = await oracleK(whole)
    expect(seen.map(e => e.id)).toEqual(K.map(e => e.id))
    expect(seen.map(e => e.slot)).toEqual(K.map(e => e.stream))
    expect(seen.map(e => e.lists)).toEqual(K.map(e => e.lists))
    expect(seen.map(e => [...e.reach].sort())).toEqual(K.map(e => [...e.reach].sort()))
    expect(seen.map(e => e.rects === null)).toEqual(K.map(e => e.rects === null))
    expect(needFrontier(seen, n)).toEqual(needsOf(K, n, false, c => !c.rects).lay)
  })

  it('is honoured: everything in the first part, or as late as the last page', async () => {
    const whole = wholeOf(SMALL)
    // F(b) = the last entry for every b > 0: part 1 holds all of K, the rest hold none, and the paper still cuts and reads
    const all = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier: (K, N) => Array.from({ length: N + 1 }, (_, b) => (b === 0 ? -1 : K.length - 1)) })
    const back = await readBack(all)
    expect(back.parts[0]!.left.length + back.parts[0]!.fileOnly.length).toBe(whole.left.units.length + 2)
    for (const p of back.parts.slice(1)) { expect(p.left).toEqual([]); expect(p.fileOnly).toEqual([]) }
    expect(back.parts[0]!.reach).toBe(8)
    // a frontier one entry later than the door's rule: a legal one, each part holds one more entry, and the cut still reads
    const later = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier: (K, N) => needFrontier(K, N).map((f, b) => (b === 0 ? -1 : Math.min(K.length - 1, f + 1))) })
    const laterBack = await readBack(later)
    const base = await readBack(await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF }))
    expect(laterBack.parts.map(p => p.left.length + p.fileOnly.length)).not.toEqual(base.parts.map(p => p.left.length + p.fileOnly.length))
    expect(mergeParts(laterBack.index, laterBack.parts).left.units.length).toBe(whole.left.units.length)
  })

  it('refuses a frontier that leaves a unit for a part after its first page', async () => {
    const whole = wholeOf(SMALL)
    await expect(cutBundle(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier: (_K, N) => new Array(N + 1).fill(-1) })).rejects.toThrow(/frontier: unit \d+, first framed on page \d+, is left for the part from page 8/)
  })

  it('is refused when it is no frontier', async () => {
    const whole = wholeOf(SMALL)
    const run = (frontier: CutOptions['frontier']) => cutBundle(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier })
    await expect(run(() => [-1])).rejects.toBeInstanceOf(TypeError)
    await expect(run((_K, N) => Array.from({ length: N + 1 }, (_, b) => (b === 0 ? -1 : 99)))).rejects.toBeInstanceOf(RangeError)
    await expect(run((_K, N) => Array.from({ length: N + 1 }, (_, b) => (b === 3 ? 4 : 2)))).rejects.toBeInstanceOf(RangeError)
  })
})

// ---------------------------------------------------------------- the schedule extended over the need bound (D2)
describe('the schedule extended over the need bound', () => {
  /** a unit drawn on pages p and p + 1 (lines and rects on both), the stream after the units before it */
  const across = (stream: number, p: number) => ({ stream, rects: [p, p + 1], lines: [p, p + 1] })
  const one = (stream: number, p: number) => ({ stream, rects: [p], lines: [p] })
  const cutWith = async (spec: PaperSpec, o: Partial<CutOptions> = {}) => {
    const whole = wholeOf(spec)
    let K: readonly CutEntry[] = []
    const c = await cutBundle(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, frontier: (k, n) => { K = k; return needFrontier(k, n) }, ...o })
    return { whole, c, K, NB: needBound(K as never, spec.pages) }
  }
  const CROSS: PaperSpec = { pages: 6, units: [across(0, 1), one(10, 2), one(20, 3), one(30, 4), one(40, 5), one(50, 6)] }

  it('closes a part over the pages a unit running on to the next reads: pages 1 and 2 in one part, not 1 alone', async () => {
    const plain = await cutWith(CROSS, { extend: false })
    expect(fits(plain.c)).toEqual([[1, 1], [2, 3], [4, 6]])
    expect(plain.NB[1]).toBe(2)
    const ext = await cutWith(CROSS)
    expect(fits(ext.c)).toEqual([[1, 2], [3, 5], [6, 6]])
    await checkCut('extended', ext.whole, ext.c, { anySplit: true })
  })

  it('is a preference: a part that does not fit with it is shortened as ever, and the next part carries the unit', async () => {
    // pages 1 and 2 hold 700 headings of 4,000 characters each (2.8 MB a page of layout): [1,1] fits, [1,2] passes CONTENT_MAX
    const heads = (p: number) => Array.from({ length: 700 }, () => ({ stream: null, lines: [p], heading: 'x'.repeat(4000) }))
    const spec: PaperSpec = { pages: 4, units: [across(0, 1), ...heads(1), ...heads(2), one(10, 3), one(20, 4)] }
    const plain = await cutWith(spec, { extend: false })
    const ext = await cutWith(spec)
    expect(ext.NB[1]).toBeGreaterThanOrEqual(2)
    expect(ext.c.parts[0]!.to).toBe(1)
    expect(fits(ext.c)).toEqual(fits(plain.c))
    await checkCut('extended, not fitting', ext.whole, ext.c, { anySplit: true })
  }, 120_000)

  it('is capped at the paper\'s last page and at the cap on a part\'s pages', async () => {
    // every page runs on to the next: the bound of page p is p + 1, so the extension chases the paper's end
    const chain: PaperSpec = { pages: 6, units: Array.from({ length: 5 }, (_, i) => across(10 * i, i + 1)) }
    const all = await cutWith(chain)
    expect(fits(all.c)).toEqual([[1, 6]])
    const capped = await cutWith(chain, { partPagesMax: 3 })
    expect(fits(capped.c).map(([a, b]) => b! - a! + 1).every(n => n <= 3)).toBe(true)
    expect(fits(capped.c)[0]).toEqual([1, 3])
    await checkCut('capped', capped.whole, capped.c, { anySplit: true })
    // a custom target is taken as given
    const given = await cutWith(chain, { target: a => a })
    expect(fits(given.c).length).toBe(6)
  })

  it('never makes a part wider than partPagesMax, extension or not: the cap clamps the schedule\'s target before anything else', async () => {
    const bare: PaperSpec = { pages: 8, units: [] }
    for (const extend of [true, false]) {
      const c = await cutWith(bare, { partPagesMax: 3, extend })
      // (the doubling's 1 and 2-3 are within the cap; 4-7 is clamped to 4-6)
      expect(fits(c.c), `extend ${extend}`).toEqual([[1, 1], [2, 3], [4, 6], [7, 8]])
    }
    const ten = await cutWith({ pages: 10, units: [] }, { partPagesMax: 3 })
    expect(fits(ten.c).every(([a, b]) => b! - a! + 1 <= 3)).toBe(true)
    // a chain of units running on: the extension chases the paper's end, the cap holds it
    const chain: PaperSpec = { pages: 10, units: Array.from({ length: 9 }, (_, i) => across(10 * i, i + 1)) }
    for (const cap of [1, 2, 3, 4]) {
      const c = await cutWith(chain, { partPagesMax: cap })
      expect(fits(c.c).every(([a, b]) => b! - a! + 1 <= cap), `cap ${cap}: ${JSON.stringify(fits(c.c))}`).toBe(true)
      await checkCut(`cap ${cap}`, c.whole, c.c, { anySplit: true })
    }
    // a custom target is clamped too
    const given = await cutWith(bare, { partPagesMax: 3, target: () => 8 })
    expect(fits(given.c)).toEqual([[1, 3], [4, 6], [7, 8]])
    // with the default cap the doubling schedule never reaches it
    expect(fits((await cutWith({ pages: 8, units: [] })).c)).toEqual([[1, 1], [2, 3], [4, 7], [8, 8]])
  })

  it('takes partPagesMax as a positive safe integer, and the extension ends for every valid one', async () => {
    const whole = wholeOf(CROSS)
    for (const bad of [Number.NaN, 0, -1, Infinity, 1.5, '3', null]) {
      await expect(cutBundle(whole, { leftPages: leftPagesOf(whole), base: BASE_OF, partPagesMax: bad as never }), String(bad)).rejects.toThrow(/partPagesMax/)
    }
    for (const cap of [1, 2, 3, 5, 6, 7, 5000, Number.MAX_SAFE_INTEGER]) {
      const c = await cutWith(CROSS, { partPagesMax: cap })
      expect(fits(c.c).at(-1)![1], `cap ${cap}`).toBe(6)
    }
  })

  it('keeps the structure: every part reads in order, the merge is the whole, K is told once, the groups are whole, and the bytes are the same twice', async () => {
    for (const spec of [SMALL, CROSS]) {
      const a = await cutWith(spec), b = await cutWith(spec)
      await checkCut('extended', a.whole, a.c, { anySplit: true })
      expect([...a.c.parts, ...a.c.left].map(w => w.sha256)).toEqual([...b.c.parts, ...b.c.left].map(w => w.sha256))
    }
  })

  it('has the need bound the door\'s own K gives: the cutter\'s K holds what needBound reads (reads, group) as run.mjs builds them', async () => {
    const spec: PaperSpec = { pages: 3, units: [one(0, 1), { ...across(10, 1), cell: { table: 0, row: 0, col: 0 } }, { ...one(20, 3), cell: { table: 0, row: 1, col: 0 } }] }
    const { K } = await cutWith(spec)
    const groups = K.map(e => (e as unknown as { group: unknown }).group)
    expect(groups.filter(g => g !== null).length).toBe(2)
    expect(new Set(groups.filter(g => g !== null)).size).toBe(1)
    for (const e of K) expect(Array.isArray((e as unknown as { reads: unknown }).reads)).toBe(true)
  })
})

// ---------------------------------------------------------------- the edges
describe('the edges', () => {
  it('cuts a one-page paper into one part', async () => {
    const whole = wholeOf({ pages: 1, units: [{ stream: 0, rects: [1], lines: [1] }, { stream: null, lines: [1] }] })
    const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
    expect(fits(c)).toEqual([[1, 1]])
    await checkCut('one page', whole, c)
  })

  it('cuts a paper with no unit', async () => {
    for (const layout of [true, false]) {
      const whole = wholeOf({ pages: 3, units: [] }, { layout })
      const c = await cutPlain(whole, { leftPages: leftPagesOf(whole), base: BASE_OF })
      expect(c.units).toEqual([])
      expect(fits(c)).toEqual([[1, 1], [2, 3]])
      await checkCut(`no unit, layout ${layout}`, whole, c)
    }
  })

  it('tells a page with no tokens from the producer\'s null', async () => {
    const whole = wholeOf(SMALL)
    const given = leftPagesOf(whole)
    const c = await cutPlain(whole, { leftPages: p => (p === 3 ? null : given(p)), base: BASE_OF })
    const back = await readBack(c)
    expect(back.parts.length).toBe(4)
    const l3 = await readLeftPart(c.left[2]!.bytes, { ref: c.left[2]!.ref as Ref & { page: number }, streamOf: () => 0 })
    expect(l3.table.n).toBe(0)
    // (its first token continues the page before's)
    expect(l3.first).toBe(TOKENS_PER_PAGE * 2)
  })

  it('asks the producer for each page once, in page order', async () => {
    const whole = wholeOf(SMALL)
    const asked: number[] = []
    const given = leftPagesOf(whole)
    await cutPlain(whole, { leftPages: p => { asked.push(p); return given(p) }, base: BASE_OF })
    expect(asked).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('needs the original\'s xref and the image from somewhere', async () => {
    const whole = wholeOf(SMALL)
    await expect(cutBundle({ ...whole, base: { bytes: 1, sha256: 'a'.repeat(64) } }, { leftPages: leftPagesOf(whole) })).rejects.toThrow()
    await expect(cutBundle({ ...whole, versions: undefined }, { leftPages: leftPagesOf(whole), base: BASE_OF })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------- the dense paper
describe('a dense paper', () => {
  const nothing = () => ({ first: 0, tokens: tokenWire(0), spans: [] })
  /** the parts that closed before the doubling's target, each too full for one page more: by `size` against `max` */
  function checkEarly(c: Cut, N: number, size: (p: Cut['parts'][number]) => number, max: number) {
    const spans = fits(c)
    const early = c.parts.filter(p => p.to < partTarget(p.from, N))
    expect(early.length).toBeGreaterThan(0)
    for (const p of early) {
      const pages = p.to - p.from + 1
      expect(size(p) * (pages + 1) / pages, `part ${p.from}-${p.to}: one page more would fit`).toBeGreaterThan(max)
      // and the next part begins right after it
      expect(spans.find(([a]) => a === p.to + 1)).toBeDefined()
    }
  }

  it('closes a part early at the values bound: 64 pages of 3,000 lines', async () => {
    const units: PaperSpec['units'] = []
    for (let p = 1; p <= 64; p++) for (let k = 0; k < 3; k++) units.push({ stream: (p - 1) * 3 + k, rects: [p], lines: [p], perPage: 1000 })
    const whole = wholeOf({ pages: 64, units })
    const c = await cutPlain(whole, { leftPages: nothing as never, base: BASE_OF })
    expect(fits(c).slice(0, 5)).toEqual([[1, 1], [2, 3], [4, 7], [8, 15], [16, 31]])
    checkEarly(c, 64, p => p.values, PART_VALUES)
    for (const p of c.parts) expect(p.values).toBeLessThanOrEqual(PART_VALUES)
    const back = await readBack(c)
    expect(mergeParts(back.index, back.parts).left.units.length).toBe(whole.left.units.length)
  }, 120_000)

  it('closes a part early at CONTENT_MAX: 40 pages of 400 KB of headings', async () => {
    const units: PaperSpec['units'] = []
    for (let p = 1; p <= 40; p++) for (let k = 0; k < 100; k++) units.push({ stream: null, lines: [p], heading: 'x'.repeat(4000) })
    const whole = wholeOf({ pages: 40, units })
    const c = await cutPlain(whole, { leftPages: nothing as never, base: BASE_OF })
    expect(fits(c).slice(0, 4)).toEqual([[1, 1], [2, 3], [4, 7], [8, 15]])
    checkEarly(c, 40, p => p.bytes.length, CONTENT_MAX)
    for (const p of c.parts) expect(p.bytes.length).toBeLessThanOrEqual(CONTENT_MAX)
    const back = await readBack(c)
    expect(back.parts.flatMap(p => p.fileOnly).length).toBe(4000)
  }, 120_000)

  it('ships a page that alone does not fit without its layout: its units are drawn from the left', async () => {
    // page 1: 1,300 headings of 4,000 characters in the file (5.2 MB, past CONTENT_MAX), each located by the original's side
    const units: PaperSpec['units'] = Array.from({ length: 1300 }, (_, k) => ({ stream: k, rects: [1], lines: [1], heading: 'x'.repeat(4000) }))
    const whole = wholeOf({ pages: 3, units: [...units, { stream: 5000, rects: [2], lines: [2] }, { stream: 5001, rects: [3], lines: [3] }] })
    const c = await cutPlain(whole, { leftPages: nothing as never, base: BASE_OF })
    expect(fits(c)).toEqual([[1, 1], [2, 3]])
    const back = await readBack(c)
    expect(back.parts[0]!.layout).toBeNull()
    expect(back.parts[0]!.addon).toBeNull()
    expect(back.parts[0]!.fileOnly).toEqual([])
    expect(back.parts[0]!.left.length).toBe(1300)
    expect(back.parts[1]!.layout).not.toBeNull()
    // (the units of the part with no layout are told once, and the rest of the chain goes on)
    expect(back.parts[1]!.left.map(w => w[0])).toEqual([1300, 1301])
  }, 120_000)

  it('refuses, saying so, a page that does not fit even without its layout', async () => {
    const units: PaperSpec['units'] = Array.from({ length: 100 }, (_, k) => ({ stream: k, rects: [1], perPage: 2000 }))
    const whole = wholeOf({ pages: 2, units })
    const refused = await cutPlain(whole, { leftPages: nothing as never, base: BASE_OF }).catch(e => e)
    expect(refused).toBeInstanceOf(BundleRefusal)
    expect(refused.kind).toBe('part')
    expect(refused.data).toEqual({ bound: 'part', page: 1 })
  }, 120_000)
})

// ---------------------------------------------------------------- the repository's own bundle
describe('the sample paper\'s bundle (tests/fixtures/pdf/sample-1)', () => {
  it('cuts and reads back, carrying its add-on manifest without the tail', async () => {
    const { readBundle } = await import('@/pdf-reader/engine/layer-proto/bundle.mjs')
    const whole = readBundle(new Uint8Array(readFileSync('tests/fixtures/pdf/sample-1/bundle.json'))) as unknown as Whole
    const c = await cutPlain(whole, { leftPages: () => null, base: { ...BASE_OF, bytes: whole.base.bytes, sha256: whole.base.sha256 } })
    await checkCut('sample-1', whole, c)
    const back = await readBack(c)
    const was = (whole.addon as unknown as { manifest: { page: Record<string, { ok: boolean; at?: unknown }> } }).manifest.page
    const now = Object.assign({}, ...back.parts.map(p => p.addon!.manifest.page)) as Record<string, { ok: boolean; refused?: string }>
    for (const [k, e] of Object.entries(was)) {
      if (!e.ok) expect(now[k]!.ok).toBe(false)
      else if (e.at === undefined) expect(now[k]!.ok).toBe(true)
      else expect(now[k]).toEqual({ ok: false, refused: TAIL_NOT_CARRIED })
    }
  })
})

// ---------------------------------------------------------------- the real papers (where this machine has them)
describe.skipIf(!LAB_ON)('the real papers cut', () => {
  for (const [name, target] of LAB_PAPERS) {
    it(name, async () => {
      const { existsSync } = await import('node:fs')
      const { openPaper } = await import('@/pdf-reader/engine/pipeline/live.mjs')
      const { unpackSource } = await import('@/pdf-reader/engine/source/tar.mjs')
      const { bundleUnitsOf } = await import('@/pdf-reader/engine/layer-proto/units.mjs')
      const { parseLayout } = await import('@/pdf-reader/engine/layout/file.mjs')
      const { layoutFile, geometryFile, sourceFile } = labFiles(name, target)
      for (const f of [layoutFile, geometryFile, sourceFile]) if (!existsSync(f)) throw new Error(`missing ${f}`)
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
      const source = await unpackSource(new Uint8Array(readFileSync(sourceFile)))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const units = bundleUnitsOf(openPaper(source.files))
      const layout = parseLayout(new Uint8Array(readFileSync(layoutFile)))
      const geometry = JSON.parse(readFileSync(geometryFile, 'utf8')) as { left: { pages: [number, number, number, number][]; units: Whole['left']['units'] } }
      const whole = {
        paper: { id, version, pages: layout.paper.pages }, base: { bytes: 1_000_000, sha256: 'a'.repeat(64), xref: 999_000 }, versions: { image: '1' }, units,
        left: { kinds: units.map(u => u[0]), pages: geometry.left.pages, units: [...geometry.left.units].sort((a, b) => a[0] - b[0]) }, layout,
      } as Whole
      // K as the cut builds it is run.mjs's (its own texRects over the file), and its frontier is needsOf's over it
      let seen: readonly CutEntry[] = []
      const c = await cutPlain(whole, { leftPages: () => null, frontier: (K, N) => { seen = K; return needFrontier(K, N) } })
      const K = await oracleK(whole)
      expect(seen.map(e => [e.id, e.slot, e.lists, [...e.reach].sort((x, y) => x - y), e.rects === null])).toEqual(K.map(e => [e.id, e.stream, e.lists, [...e.reach].sort((x, y) => x - y), e.rects === null]))
      // what Need reads besides: the placeholders' pages, and the table groups (the same partition)
      expect(seen.map(e => [...(e as unknown as { reads: number[] }).reads].sort((x, y) => x - y))).toEqual(K.map(e => [...(e.reads ?? [])].sort((x, y) => x - y)))
      expect(seen.map(e => e.follows ?? null)).toEqual(K.map(e => e.follows ?? null))
      const partition = (gs: (unknown)[]) => gs.map(g => (g === null ? -1 : gs.indexOf(g)))
      expect(partition(seen.map(e => (e as unknown as { group: unknown }).group))).toEqual(partition(K.map(e => (groupOf({ cell: whole.units[e.id]?.[3] } as never)))))
      // and the need bound of the two Ks is the same
      expect([...needBound(seen as never, whole.paper.pages)]).toEqual([...needBound(K.map(e => ({ ...e, group: groupOf({ cell: whole.units[e.id]?.[3] } as never) })) as never, whole.paper.pages)])
      await checkCut(name, whole, c)
      // the parts read against a light index (M24) are the parts read against the full one
      {
        const head = await readHead(c.head.bytes, { ref: c.head.ref })
        const full: ReadUnitsChunk[] = [], lean: ReadUnitsChunkLight[] = []
        for (const u of c.units) full.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: full.at(-1) ?? null }))
        for (const u of c.units) lean.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: lean.at(-1) ?? null, bodies: false }))
        const a = indexOf(head, full), b = indexOf(head, lean)
        let ca: PartChain | null = null, cb: PartChain | null = null
        for (const p of c.parts) {
          const x = await readPart(p.bytes, { ref: p.ref, index: a, chain: ca }), y = await readPart(p.bytes, { ref: p.ref, index: b, chain: cb })
          expect(y, `${name}: part ${p.from}-${p.to}`).toEqual(x)
          ca = x.chain
          cb = y.chain
        }
      }
      if (process.env.AXT_CUT_STATS) process.stderr.write(`CUT ${name} N=${whole.paper.pages} units=${units.length} left=${whole.left.units.length} layout=${layout.units.length} parts=${JSON.stringify(fits(c))} bytes=${c.parts.map(p => p.bytes.length)}\n`)
      // and the schedule extended over the need bound: the same properties, and for each page whether the part that holds it covers its bound
      const ext = await cutBundle(whole, { leftPages: () => null })
      await checkCut(`${name} (extended)`, whole, ext, { anySplit: true })
      const NB = needBound(seen as never, whole.paper.pages)
      const readyIn = (cut: Cut) => { let n = 0; for (const p of cut.parts) for (let q = p.from; q <= p.to; q++) if (NB[q]! <= p.to) n++; return n }
      expect(readyIn(ext)).toBeGreaterThanOrEqual(readyIn(c))
      if (process.env.AXT_CUT_STATS) process.stderr.write(`EXT ${name} N=${whole.paper.pages} plain=${JSON.stringify(fits(c))} bytes ${c.parts.map(p => p.bytes.length)} ready ${readyIn(c)}/${whole.paper.pages}\n    extended=${JSON.stringify(fits(ext))} bytes ${ext.parts.map(p => p.bytes.length)} ready ${readyIn(ext)}/${whole.paper.pages}; the widest bounds ${JSON.stringify([...NB].map((b, q) => [q, b]).filter(([q, b]) => (q as number) > 0 && (b as number) - (q as number) >= 8).slice(0, 12))}\n`)
      const again = await cutPlain(whole, { leftPages: () => null })
      expect([...c.units, c.head, ...c.parts].map(w => w.sha256)).toEqual([...again.units, again.head, ...again.parts].map(w => w.sha256))
    }, 300_000)
  }
})
