// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { readBundle, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { PartChain } from '@/pdf-reader/engine/layer-proto/format.mjs'
import {
  BUILD_END_WHYS, BUNDLE4, CATALOG_CAP, CATALOG_VALUES, catalogKey, CHUNKS_MAX, CONTENT_MAX, CTAG4, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, indexOf,
  isFinalEnd, keyOf, keyParts, LEFT_CAP, LEFT_VALUES, mergeParts, PART_CAP, PART_VALUES, partTarget, readCatalog, readHead, readLeftPart, readPart,
  readUnitsChunk, TAIL_CAP, TOKENS_PAGE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, unitsOfChunks, VTAG4, writeCatalog, writeHead, writeLeftPart, writePart, writeUnitChunks,
} from '@/pdf-reader/engine/layer-proto/format.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { encodeLayout, LAYOUT, type LayoutFile } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS, PIPELINE_VERSION } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { isMemoryError } from '@/pdf-reader/engine/pipeline/memory.mjs'
import {
  BASE, forged, IMAGE, LEFT_OF, type Made, made, N, PAPER, parsed, partInputs, sha256Of, STREAM, textOf, TAILS, tailOf, TOKENS_ON_PAGE, tokenWire, UNITS, utf8, VIEWS,
} from './helpers/format-paper'

// BUNDLE 4's format (the prepare pipeline's bundle 4 contract and its amendments): the five kinds of object, each writer
// then its reader, each reader refusing in its order, the part chain, the keys. A small paper of four pages in three parts
// (tests/pdf-reader/helpers/format-paper.ts); the six papers' real data where this machine has it (AXT_LAB)

afterEach(() => { vi.restoreAllMocks() })

let M: Made
beforeAll(async () => { M = await made() })

/** the refusal a reader's promise ends in, or null; any other end is the test's failure */
async function refusal(run: Promise<unknown>): Promise<BundleRefusal | null> {
  try { await run } catch (e) { if (e instanceof BundleRefusal) return e; throw e }
  return null
}
const chainBefore = (i: number): PartChain | null => (i === 0 ? null : M.readParts[i - 1]!.chain)
/** part i's JSON with `edit` made, read against the index and the chain of the parts before it */
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the part's types on purpose
const partWith = (i: number, edit: (p: any) => void, o: { chain?: PartChain | null } = {}) => {
  const p = parsed(M.parts[i] as { bytes: Uint8Array })
  edit(p)
  const f = forged('part', p, { from: p.pages?.[0], to: p.pages?.[1] })
  return readPart(f.bytes, { ref: f.ref, index: M.index, chain: o.chain === undefined ? chainBefore(i) : o.chain })
}

// isMemoryError (bundle 4 contract C8.4, amendment M7) is the web's predicate word for word (container/src/run/memory.ts):
// this is the web's own truth table (container/tests/memory.test.ts), as the spec

/** a real failed allocation, as V8 throws it */
function failedAllocation(): unknown {
  try { void new ArrayBuffer(2 ** 50) } catch (e) { return e }
  throw new Error('this machine gave a 1 PiB ArrayBuffer')
}
/** a failed allocation as PDF.js hands it over from its worker (pdf.mjs wrapReason: an UnknownErrorException of its words) */
const pdfjsWrapped = (e: Error) => Object.assign(new Error(e.message), { name: 'UnknownErrorException', details: e.toString() })

describe('isMemoryError (the web\'s truth table)', () => {
  it('V8\'s own RangeError, PDF.js\'s wrapping of it, and Node\'s ERR_MEMORY_ALLOCATION_FAILED are a failed allocation', () => {
    const real = failedAllocation()
    expect(real).toBeInstanceOf(RangeError)
    expect(isMemoryError(real)).toBe(true)
    expect(isMemoryError(pdfjsWrapped(real as Error))).toBe(true)
    expect(isMemoryError(Object.assign(new Error('Failed to allocate memory'), { code: 'ERR_MEMORY_ALLOCATION_FAILED' }))).toBe(true)
  })

  it('nothing else is: a stack overflow, a length no array may have, the words without V8\'s error, PDF.js\'s other failures', () => {
    let overflow: unknown
    const deep = (n: number): number => deep(n + 1) + 1
    try { deep(0) } catch (e) { overflow = e }
    let length: unknown
    try { void new Uint8Array(-1) } catch (e) { length = e }
    const not = [
      overflow, length, new RangeError('Array buffer allocation failed, said a PDF'), new Error('Array buffer allocation failed'),
      Object.assign(new Error('Array buffer allocation failed'), { name: 'UnknownErrorException', details: 'FormatError: Array buffer allocation failed' }),
      Object.assign(new Error('Invalid PDF structure.'), { name: 'InvalidPDFException' }), null, 'Array buffer allocation failed', undefined,
      // (amendment M7: these are a bounded inflate's or a length's refusal, not the process's memory)
      new RangeError('Invalid typed array length: 4294967296'), new RangeError('Invalid array buffer length'), new RangeError('Invalid string length'),
      Object.assign(new Error('x'), { code: 'ERR_STRING_TOO_LONG' }), Object.assign(new Error('x'), { code: 'ERR_BUFFER_TOO_LARGE' }),
    ]
    for (const e of not) expect(isMemoryError(e), String((e as Error)?.message ?? e)).toBe(false)
  })
})

// ---------------------------------------------------------------- 1. round trips
describe('each writer then its reader is the identity', () => {
  it('the units chunk: the units as bundleUnitsOf gave them, none dropped, the chunk of the paper and the pipeline', () => {
    expect(M.chunks).toHaveLength(1)
    const c = M.readChunks[0]!
    expect(c).toMatchObject({ kind: 'units', from: 0, to: 7, paper: PAPER, pipeline: PIPELINE_VERSION, dropped: [], sha256: M.chunks[0]!.sha256, bytes: M.chunks[0]!.bytes.length })
    expect(c.units).toEqual(UNITS)
    expect(c.stands).toEqual(new Uint8Array(8).fill(1))
    // the envelope: `format`, `kind`, then the paper (amendment M12); keys in the order written, no white space
    expect(textOf(M.chunks[0]!.bytes).startsWith(`{"format":"${UNITS_FORMAT}","kind":"units","paper":{"id":"2608.04322","version":1},"pipeline":"${PIPELINE_VERSION}","ids":[0,7],"units":[[`)).toBe(true)
    expect(Object.keys(parsed(M.chunks[0]!))).toEqual(['format', 'kind', 'paper', 'pipeline', 'ids', 'units'])
  })

  it('the head: the paper, the original (no url: amendment M13), the versions, the chunk by digest', () => {
    const h = M.readHead
    expect(h).toMatchObject({ kind: 'head', paper: { ...PAPER, pages: N }, base: BASE, lineskip: [1, 0], cites: null, sha256: M.head.sha256 })
    expect(h.versions).toEqual({ pipeline: PIPELINE_VERSION, layout: LAYOUT, removal: REMOVAL, pdfjs: PDFJS, image: IMAGE })
    expect(h.units).toEqual([{ kind: 'units', from: 0, to: 7, sha256: M.chunks[0]!.sha256, bytes: M.chunks[0]!.bytes.length }])
    expect(Object.keys(parsed(M.head))).toEqual(['bundle', 'kind', 'paper', 'base', 'versions', 'units', 'lineskip', 'cites'])
    expect(parsed(M.head).base).toEqual(BASE)
  })

  it('the index: every unit, its kind, none dropped', () => {
    expect(M.index.units).toEqual(UNITS)
    expect(M.index.kinds).toEqual(UNITS.map(u => u[0]))
    expect(M.index.sha256).toBe(M.head.sha256)
    expect(unitsOfChunks(M.readChunks)).toMatchObject({ units: UNITS, kinds: UNITS.map(u => u[0]), dropped: [], index: [{ from: 0, to: 7 }] })
  })

  it('the parts: every field as written, the chain after each', () => {
    const [p1, p2, p3] = M.readParts as [typeof M.readParts[0], typeof M.readParts[0], typeof M.readParts[0]]
    const inputs = partInputs(M.head.sha256, M.lefts, [null, M.parts[0]!.sha256, M.parts[1]!.sha256])
    expect([p1.pages, p2.pages, p3.pages]).toEqual([[1, 1], [2, 3], [4, 4]])
    expect([p1.reach, p2.reach, p3.reach]).toEqual([2, 4, 4])
    expect([p1.prev, p2.prev, p3.prev]).toEqual([null, M.parts[0]!.sha256, M.parts[1]!.sha256])
    expect(p1.left).toEqual(inputs[0]!.left)
    expect(p2.left).toEqual(inputs[1]!.left)
    expect(p2.fileOnly).toEqual([[5, 41]])
    expect([...p2.views]).toEqual(VIEWS.slice(1).flat())
    expect(p1.layout).toEqual(inputs[0]!.layout)
    expect(p3.layout).toBeNull()
    expect(p3.addon).toBeNull()
    expect(p1.addon).toMatchObject({ tail: TAILS[0]!.tail, r: 1 })
    expect(p2.addon).toMatchObject({ tail: TAILS[1]!.tail, r: 1 })
    expect(p2.addon!.manifest.page).toEqual(inputs[1]!.addon!.manifest.page)
    expect(p1.leftParts).toEqual([M.lefts[1]!.ref])
    expect(p2.leftParts).toEqual([M.lefts[2]!.ref, M.lefts[3]!.ref])
    expect(p1.chain).toEqual({
      head: M.head.sha256, through: 1, last: M.parts[0]!.sha256, slot: 12, id: 2, reach: 2, ahead: VIEWS[1], end: BASE.bytes + TAILS[0]!.tail.length,
      xref: TAILS[0]!.startxref, next: 104, root: 12, r: 1,
    })
    expect(p2.chain).toMatchObject({ through: 3, slot: 41.5, id: 5, reach: 4, ahead: VIEWS[3], end: BASE.bytes + TAILS[0]!.tail.length + TAILS[1]!.tail.length, xref: TAILS[1]!.startxref, next: 108, root: 12, r: 2 })
    expect(p3.chain).toMatchObject({ through: 4, slot: 70, id: 7, reach: 4, ahead: [], r: 2 })
  })

  it('the left parts: the tokens decoded once into typed arrays, the spans and the pairs as written', () => {
    const wire = tokenWire(TOKENS_ON_PAGE, 2)
    const l2 = M.readLefts[1]!
    expect(l2).toMatchObject({ kind: 'left', page: 2, first: 20, spans: LEFT_OF[2]!.spans, pairs: LEFT_OF[2]!.pairs })
    expect(l2.table.n).toBe(TOKENS_ON_PAGE)
    expect(l2.table.l).toBeInstanceOf(Float32Array)
    expect(l2.table.l[0]).toBe(Math.fround((wire.l[0] as number) / 1000))
    expect(l2.table.l[2]).toBeCloseTo((wire.l[0]! + wire.l[1]! + wire.l[2]!) / 1000, 3)
    expect(l2.table.y[1]).toBeCloseTo((wire.y[0]! + wire.y[1]!) / 1000, 3)
  })

  it('the catalog: the refs the Worker committed, how far they go; a complete one and one that ends early', async () => {
    const parts = M.parts.map(p => ({ from: p.from, to: p.to, sha256: p.sha256, bytes: p.bytes.length }))
    const units = M.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length }))
    const done = await writeCatalog({ head: M.readHead, units, parts, end: { through: 4 } })
    expect(done.key).toBe(catalogKey(PAPER.id, PAPER.version, VTAG4))
    const c = await readCatalog(done.bytes, { key: done.key, paper: PAPER })
    expect(c).toMatchObject({ kind: 'catalog', sha256: done.sha256, paper: { ...PAPER, pages: N }, head: { kind: 'head', sha256: M.head.sha256 }, end: { through: 4 } })
    expect(c.parts).toEqual(parts.map(r => ({ kind: 'part', ...r })))
    expect(Object.keys(parsed(done))).toEqual(['bundle', 'kind', 'paper', 'versions', 'head', 'units', 'parts', 'end'])
    expect(indexOf(M.readHead, M.readChunks, { catalog: c })).toEqual(M.index)
    for (const why of END_WHYS) {
      const cut = await writeCatalog({ head: M.readHead, units, parts: parts.slice(0, 2), end: { through: 3, refused: why } })
      expect((await readCatalog(cut.bytes)).end).toEqual({ through: 3, refused: why })
    }
    const none = await writeCatalog({ head: M.readHead, units, parts: [], end: { through: 0, refused: 'bound' } })
    expect((await readCatalog(none.bytes)).parts).toEqual([])
  })

  it('the end whys: final and build-scoped (amendment M4)', () => {
    expect(FINAL_END_WHYS).toEqual(['bound', 'part'])
    expect(BUILD_END_WHYS).toEqual(['memory', 'internal', 'deadline'])
    expect(END_WHYS).toEqual([...FINAL_END_WHYS, ...BUILD_END_WHYS])
    for (const w of FINAL_END_WHYS) expect(isFinalEnd(w)).toBe(true)
    for (const w of [...BUILD_END_WHYS, 'x', '']) expect(isFinalEnd(w)).toBe(false)
  })
})

describe('mergeParts is the whole', () => {
  it('equals readBundle of the BUNDLE 3 file made of the same paper: units, left, layout as encodeLayout bytes, manifest, tail', () => {
    const merged = mergeParts(M.index, M.readParts)
    // the whole file by hand: the layout's fonts by first appearance (lines by unit id, then names), page 4 not planned
    const whole: LayoutFile = {
      schema: 3, layout: LAYOUT, pdfjs: PDFJS, paper: { ...PAPER, pages: N }, left: '', views: VIEWS.flat(), fonts: ['CMR10', 'CMBX12'],
      units: [[0, 1, 9, 1, 1], [2, 0, 9, 0, 7], [3, 4, 9, 0, 1], [5, 4, 9, 0, 3]],
      lines: [
        [0, [1, 150, 460, 700, 712, 696, 17.28, 0]], [2, [1, 72, 540, 650, 657.5, 647.25, 10, 0, 2, 72, 300, 700, 710, 698, 10, 0]],
        [3, [2, 72, 200, 500, 508, 498, 9, 0]], [5, [3, 72, 200, 400, 408, 398, 9, 0]],
      ],
      frames: [[0, [1, 0, 0, 1, -1, 30]], [2, [1, 0, 0, 1, -1, 12.5, 2, 0, 1, 1, 500, 12]], [3, [2, 0, 0, 1, -1, 10]], [5, [3, 0, 0, 1, -1, 10]]],
      erase: [], ph: [[2, 4, 0, 0, 1, 100, 650, 110, 657, 647]], labels: [], headings: [[0, 'A Title']], pageText: [], held: [],
      names: [[0, 0, 3, 280, 680, 332.5, 687, 677.5, 9, 1, 1, -1, 0, 72, 540]], lineskip: [1, 0],
    }
    const tail = new Uint8Array(TAILS[0]!.tail.length + TAILS[1]!.tail.length)
    tail.set(TAILS[0]!.tail)
    tail.set(TAILS[1]!.tail, TAILS[0]!.tail.length)
    const manifest = {
      schema: 1 as const, removal: REMOVAL, pages: N, sets: {}, appended: tail.length, stats: { removed: 6 },
      page: {
        1: { ok: true, units: { 2: [72, 640, 300, 660] }, at: { R: 5 }, dirty: [72, 640, 80, 650] },
        2: { ok: true, rules: [72, 500, 540, 500.4] },
        3: { ok: true, units: { 3: [72, 300, 200, 320] }, at: { R: 6 }, dirty: [72, 300, 80, 310] },
        4: { ok: false, refused: 'not planned' },
      },
    }
    const url = `/api/v1/original/${PAPER.id}v${PAPER.version}`
    const leftUnits = [...M.readParts.flatMap(p => p.left)].sort((a, b) => a[0] - b[0])
    const bytes = writeBundle({
      paper: { ...PAPER, pages: N }, base: { bytes: BASE.bytes, sha256: BASE.sha256, url }, image: IMAGE, units: UNITS,
      left: { kinds: UNITS.map(u => u[0]), pages: VIEWS as [number, number, number, number][], units: leftUnits }, layout: whole, addon: { manifest, tail },
    })
    const read = readBundle(bytes)
    expect(merged.units).toEqual(read.units)
    expect(merged.dropped).toEqual(read.dropped)
    expect(merged.paper).toEqual(read.paper)
    expect(merged.base).toEqual(read.base)
    expect(merged.left).toEqual(read.left)
    expect(encodeLayout(merged.layout!)).toBe(encodeLayout(read.layout!))
    expect(merged.addon!.manifest).toEqual(read.addon!.manifest)
    expect(merged.addon!.tail).toEqual(read.addon!.tail)
    expect(merged.versions).toEqual({ bundle: BUNDLE4, ...M.readHead.versions })
  })

  it('refuses parts that are not a chain to the paper\'s last page, and is null where no part has a layout or an add-on', () => {
    expect(() => mergeParts(M.index, M.readParts.slice(0, 2))).toThrow(BundleRefusal)
    expect(() => mergeParts(M.index, [M.readParts[1]!, M.readParts[2]!])).toThrow(BundleRefusal)
    expect(() => mergeParts(M.index, [M.readParts[0]!, M.readParts[0]!, M.readParts[1]!, M.readParts[2]!])).toThrow(BundleRefusal)
  })
})

// ---------------------------------------------------------------- 2–4. the order of refusal, every reader
type Reader = (bytes: Uint8Array, ref: ReturnType<typeof forged>['ref'] | null, caps?: { bytes?: number; values?: number }) => Promise<unknown>
const READERS: { kind: 'units' | 'head' | 'part' | 'left' | 'catalog'; cap: number; values: number; depth: number; read: Reader; sample: () => { bytes: Uint8Array } }[] = [
  { kind: 'units', cap: UNITS_CAP, values: UNITS_VALUES, depth: 5, sample: () => M.chunks[0]!, read: (b, ref, caps) => readUnitsChunk(b, { ref: ref!, before: null, caps }) },
  { kind: 'head', cap: HEAD_CAP, values: HEAD_VALUES, depth: 3, sample: () => M.head, read: (b, ref, caps) => readHead(b, { ref: ref!, caps }) },
  { kind: 'part', cap: PART_CAP, values: PART_VALUES, depth: 7, sample: () => M.parts[0]!, read: (b, ref, caps) => readPart(b, { ref: ref!, index: M.index, chain: null, caps }) },
  { kind: 'left', cap: LEFT_CAP, values: LEFT_VALUES, depth: 4, sample: () => M.lefts[1]!, read: (b, ref, caps) => readLeftPart(b, { ref: ref as never, streamOf: id => STREAM.get(id), caps }) },
  { kind: 'catalog', cap: CATALOG_CAP, values: CATALOG_VALUES, depth: 3, sample: () => ({ bytes: M.parts[0]!.bytes }), read: (b, _ref, caps) => readCatalog(b, { caps }) },
]
/** `bytes` with a ref that is theirs (their length and digest) */
const asRef = (kind: (typeof READERS)[number]['kind'], bytes: Uint8Array) => ({ kind, ...(kind === 'left' ? { page: 1 } : {}), sha256: sha256Of(bytes), bytes: bytes.length })

describe('a reader\'s caps, each kind', () => {
  for (const r of READERS) {
    describe(r.kind, () => {
      it('refuses cap + 1 bytes before they are hashed or decoded', async () => {
        const bytes = new Uint8Array(r.cap + 1).fill(0x20)
        const digest = vi.spyOn(globalThis.crypto.subtle, 'digest')
        const decode = vi.spyOn(TextDecoder.prototype, 'decode')
        const e = await refusal(r.read(bytes, r.kind === 'catalog' ? null : asRef(r.kind, bytes)))
        expect(e).toMatchObject({ kind: r.kind, message: expect.stringMatching(/more than/) })
        expect(digest).not.toHaveBeenCalled()
        expect(decode).not.toHaveBeenCalled()
      })

      it('refuses values past the cap before JSON.parse is called, and nesting one past the depth', async () => {
        const many = utf8(`[${'0,'.repeat(r.values)}0]`)
        expect(many.length).toBeLessThan(r.cap)
        const parse = vi.spyOn(JSON, 'parse')
        expect(await refusal(r.read(many, r.kind === 'catalog' ? null : asRef(r.kind, many)))).toMatchObject({ kind: r.kind, message: expect.stringMatching(/more than \d+ values/) })
        const deep = utf8(`${'['.repeat(r.depth + 1)}0${']'.repeat(r.depth + 1)}`)
        expect(await refusal(r.read(deep, r.kind === 'catalog' ? null : asRef(r.kind, deep)))).toMatchObject({ kind: r.kind, message: expect.stringMatching(/nested more than \d+ deep/) })
        expect(parse).not.toHaveBeenCalled()
        // (and one at the depth is read as far as JSON.parse and refused for what it is)
        const edge = utf8(`${'['.repeat(r.depth)}0${']'.repeat(r.depth)}`)
        expect(await refusal(r.read(edge, r.kind === 'catalog' ? null : asRef(r.kind, edge)))).toMatchObject({ message: expect.stringMatching(/not an object/) })
      })

      it('takes `caps` lower than its default, bytes and values', async () => {
        const bytes = r.sample().bytes
        const ref = r.kind === 'catalog' ? null : asRef(r.kind, bytes)
        expect(await refusal(r.read(bytes, ref, { bytes: bytes.length - 1 }))).toMatchObject({ message: expect.stringMatching(/more than/) })
        // (higher than the default is no higher)
        expect(await refusal(r.read(new Uint8Array(r.cap + 1).fill(0x20), r.kind === 'catalog' ? null : asRef(r.kind, new Uint8Array(r.cap + 1).fill(0x20)), { bytes: r.cap * 2 }))).toMatchObject({ message: expect.stringMatching(/more than/) })
        expect(await refusal(r.read(bytes, ref, { values: 3 }))).toMatchObject({ message: expect.stringMatching(/more than 3 values/) })
      })
    })
  }
})

describe('a reader\'s digest and ref', () => {
  for (const r of READERS.filter(k => k.kind !== 'catalog')) {
    describe(r.kind, () => {
      it('refuses one byte changed, bytes off by one and another object\'s ref, before it decodes anything', async () => {
        const good = r.sample().bytes
        const ref = asRef(r.kind, good)
        const decode = vi.spyOn(TextDecoder.prototype, 'decode')
        const parse = vi.spyOn(JSON, 'parse')
        const flipped = good.slice()
        flipped[flipped.length >> 1] = (flipped[flipped.length >> 1] as number) ^ 1
        expect(await refusal(r.read(flipped, ref))).toMatchObject({ kind: r.kind, message: expect.stringMatching(/digest/) })
        // (bytes off by one: refused before they are hashed)
        const digest = vi.spyOn(globalThis.crypto.subtle, 'digest')
        expect(await refusal(r.read(good.subarray(1), ref))).toMatchObject({ message: expect.stringMatching(/bytes, not the ref's/) })
        expect(await refusal(r.read(good, { ...ref, bytes: good.length + 1 }))).toMatchObject({ message: expect.stringMatching(/bytes, not the ref's/) })
        expect(digest).not.toHaveBeenCalled()
        const other = (r.kind === 'head' ? M.chunks[0]! : M.head).bytes
        expect(await refusal(r.read(good, asRef(r.kind, other)))).not.toBeNull()
        expect(decode).not.toHaveBeenCalled()
        expect(parse).not.toHaveBeenCalled()
        // (and the object itself is read)
        vi.restoreAllMocks()
        await r.read(good, ref)
      })

      it('refuses a ref to another kind of object, and is a TypeError for what is not bytes or a ref', async () => {
        const good = r.sample().bytes
        const other = READERS.find(k => k.kind !== r.kind && k.kind !== 'catalog')!.kind
        expect(await refusal(r.read(good, { ...asRef(r.kind, good), kind: other }))).toMatchObject({ kind: r.kind, path: 'ref' })
        await expect(r.read(textOf(good) as unknown as Uint8Array, asRef(r.kind, good))).rejects.toThrow(TypeError)
        await expect(r.read(good, { ...asRef(r.kind, good), sha256: 'abc' })).rejects.toThrow(TypeError)
        await expect(r.read(good, { kind: r.kind } as never)).rejects.toThrow(TypeError)
      })
    })
  }

  it('the catalog, fetched by name, has no ref: its digest is computed and returned', async () => {
    const parts = M.parts.map(p => ({ from: p.from, to: p.to, sha256: p.sha256, bytes: p.bytes.length }))
    const w = await writeCatalog({ head: M.readHead, units: M.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length })), parts, end: { through: 4 } })
    expect((await readCatalog(w.bytes)).sha256).toBe(sha256Of(w.bytes))
    await expect(readCatalog(textOf(w.bytes) as unknown as Uint8Array)).rejects.toThrow(TypeError)
  })
})

describe('a reader\'s envelope', () => {
  const valid = {
    units: () => parsed(M.chunks[0]!), head: () => parsed(M.head), part: () => parsed(M.parts[0]!), left: () => parsed(M.lefts[1]!),
  } as const
  // biome-ignore lint/suspicious/noExplicitAny: a test breaks the object's types on purpose
  const read = (kind: keyof typeof valid, edit: (o: any) => void) => {
    const o = valid[kind]()
    edit(o)
    const f = forged(kind, o, kind === 'left' ? { page: 1 } : {})
    return READERS.find(r => r.kind === kind)!.read(f.bytes, f.ref)
  }

  for (const kind of Object.keys(valid) as (keyof typeof valid)[]) {
    describe(kind, () => {
      const tag = kind === 'units' ? 'format' : 'bundle'
      it('refuses another format, another kind, and a key of the schema missing or extra', async () => {
        expect(await refusal(read(kind, o => { o[tag] = kind === 'units' ? '2' : '3' }))).toMatchObject({ kind, path: tag })
        expect(await refusal(read(kind, o => { o[tag] = 4 }))).toMatchObject({ path: tag })
        expect(await refusal(read(kind, o => { o.kind = kind === 'part' ? 'head' : 'part' }))).toMatchObject({ path: 'kind' })
        expect(await refusal(read(kind, o => { delete o.kind }))).toMatchObject({ path: 'kind' })
        expect(await refusal(read(kind, o => { o.extra = 1 }))).toMatchObject({ path: 'extra' })
        const first = Object.keys(valid[kind]()).filter(k => k !== tag && k !== 'kind')[0] as string
        expect(await refusal(read(kind, o => { delete o[first] }))).toMatchObject({ path: first, message: expect.stringMatching(/missing/) })
        expect(await refusal(read(kind, () => {}))).toBeNull()
      })
    })
  }

  it('refuses a unit chunk\'s old envelope (`bundle` in place of `format`): the chunk\'s format is its own', async () => {
    expect(await refusal(read('units', o => { o.bundle = '4'; delete o.format }))).toMatchObject({ kind: 'units', path: 'format' })
    expect(UNITS_FORMAT).toBe('1')
    expect(BUNDLE4).toBe('4')
  })

  it('refuses what is not an object, and a chunk given as a part and a part given as a chunk', async () => {
    for (const text of ['[]', '7', 'null', '"x"']) {
      const f = forged('head', JSON.parse(text))
      expect(await refusal(readHead(f.bytes, { ref: f.ref }))).toMatchObject({ kind: 'head', message: expect.stringMatching(/not an object/) })
    }
    expect(await refusal(readPart(M.chunks[0]!.bytes, { ref: { ...M.chunks[0]!.ref, kind: 'part' }, index: M.index, chain: null }))).toMatchObject({ path: 'bundle' })
    // (a part is nested deeper than a chunk or a head allows: refused before it is parsed, as what it is)
    expect(await refusal(readUnitsChunk(M.parts[0]!.bytes, { ref: { ...M.parts[0]!.ref, kind: 'units' }, before: null }))).toMatchObject({ kind: 'units', message: expect.stringMatching(/nested more than 5 deep/) })
    expect(await refusal(readHead(M.parts[0]!.bytes, { ref: { ...M.parts[0]!.ref, kind: 'head' } }))).toMatchObject({ kind: 'head' })
    // (a head of the depth a chunk allows, given as a chunk, is refused for its envelope)
    expect(await refusal(readUnitsChunk(M.head.bytes, { ref: { ...M.head.ref, kind: 'units' }, before: null }))).toMatchObject({ kind: 'units', path: 'format' })
  })

  it('refuses bytes that are not UTF-8 or not JSON, after the digest', async () => {
    for (const bytes of [Uint8Array.of(0x7b, 0xc3, 0x28, 0x7d), utf8('{"bundle":'), utf8('')]) {
      const e = await refusal(readHead(bytes, { ref: { kind: 'head', sha256: sha256Of(bytes), bytes: bytes.length } }))
      expect(e).toMatchObject({ kind: 'head', message: expect.stringMatching(/UTF-8|not JSON/) })
    }
  })
})

// ---------------------------------------------------------------- 5. units chunks
describe('a bad unit is dropped and counted, the rest standing (BUNDLE 3\'s drop tests)', () => {
  /** the chunk read with unit `i` edited, none before it */
  // biome-ignore lint/suspicious/noExplicitAny: a test breaks the chunk's types on purpose
  const withUnit = (i: number, edit: (u: any) => void) => {
    const o = parsed(M.chunks[0]!)
    edit(o.units[i])
    const f = forged('units', o, { from: 0, to: 7 })
    return readUnitsChunk(f.bytes, { ref: f.ref, before: null })
  }
  const droppedBy = async (i: number, edit: (u: unknown[]) => void) => { const r = await withUnit(i, edit); return { dropped: r.dropped, unit: r.units[i], others: r.units.filter((_, j) => j !== i) } }

  it('an open with no close is read, and a close with no open', async () => {
    const r = M.readChunks[0]!
    expect([r.units[4], r.units[5]]).toEqual([UNITS[4], UNITS[5]])
    for (const edit of [(u: unknown[]) => { (u[5] as unknown[]).push([3, 77, '}']) }, (u: unknown[]) => { (u[5] as unknown[]).unshift([3, 2, '}'], [2, 2, '{']) }]) {
      const d = await droppedBy(7, edit)
      expect(d.dropped).toEqual([])
      expect(d.others).toEqual(UNITS.filter((_, j) => j !== 7))
    }
    expect((await withUnit(4, u => { u[0] = 'Cell' })).dropped).toEqual([4])
    for (const p of [[3, 1.5, '}'], [3, -1, '}'], [3, 1], [3, 1, 7], [3, 1, '}', 'x']]) expect((await droppedBy(7, u => { (u[5] as unknown[]).push(p) })).dropped).toEqual([7])
  })

  it('a kind not a lower-case word of 1 to 32 letters', async () => {
    for (const kind of ['Para', 'para1', '', 'p'.repeat(33), 'p q', 7, null]) expect((await droppedBy(7, u => { u[0] = kind })).dropped).toEqual([7])
    expect((await droppedBy(7, u => { u[0] = 'p'.repeat(32) })).dropped).toEqual([])
  })

  it('a string past 16,000 code units, anywhere in a unit', async () => {
    expect((await droppedBy(2, u => { (u[5] as unknown[][])[0] = [0, 'x'.repeat(16_001)] })).dropped).toEqual([2])
    expect((await droppedBy(2, u => { (u[5] as unknown[][])[0] = [0, 'x'.repeat(16_000)] })).dropped).toEqual([])
    expect((await droppedBy(2, u => { (u[5] as unknown[][])[5] = [0, 'x', 'y'.repeat(16_001)] })).dropped).toEqual([2])
    expect((await droppedBy(2, u => { (u[5] as unknown[][])[6] = [4, 'x'.repeat(16_001), 1, '}'] })).dropped).toEqual([2])
    expect((await droppedBy(2, u => { u[4] = { trail: 'x'.repeat(16_001) } })).dropped).toEqual([2])
  })

  it('a piece tag not one of the five, or a piece not of its tag\'s shape', async () => {
    for (const p of [[5, 'x'], ['0', 'x'], [-1, 'x'], [0], [0, 'x', 'y', 'z'], [1, 7], [2, 1.5, '{'], [2, -1, '{'], [3, 1], [4, 'a', 1], 'text', null]) {
      expect((await droppedBy(2, u => { (u[5] as unknown[]).splice(1, 0, p) })).dropped).toEqual([2])
    }
  })

  it('a nested piece\'s unit not an id of the paper, not before it, or dropped', async () => {
    for (const id of [8, 2, 3, -1, 1.5, '1']) expect((await droppedBy(2, u => { (u[5] as unknown[][])[6] = [4, '\\footnote{', id, '}'] })).dropped).toEqual([2])
    expect((await withUnit(1, u => { u[0] = 'Footnote' })).dropped).toEqual([1, 2])
  })

  it('flags, a depth, a cell or edges of another shape, and a unit that is not even a list', async () => {
    for (const edit of [
      (u: unknown[]) => { u[1] = 16 }, (u: unknown[]) => { u[1] = -1 }, (u: unknown[]) => { u[2] = 10 }, (u: unknown[]) => { u[2] = -2 }, (u: unknown[]) => { u[2] = 0.5 },
      (u: unknown[]) => { u[3] = { table: 0, row: 0, col: 0, span: 0, head: false } }, (u: unknown[]) => { u[3] = { table: 0, row: 0, col: 0, span: 1, head: 0 } },
      (u: unknown[]) => { u[3] = { table: 0, row: 0, col: 0, span: 1 } }, (u: unknown[]) => { u[3] = [] },
      (u: unknown[]) => { u[4] = {} }, (u: unknown[]) => { u[4] = { lead: 1 } }, (u: unknown[]) => { u[4] = { before: 'x' } },
      (u: unknown[]) => { u.push(1) }, (u: unknown[]) => { u[5] = {} },
    ]) expect((await droppedBy(7, edit)).dropped).toEqual([7])
    const o = parsed(M.chunks[0]!)
    o.units[7] = 'author'
    const f = forged('units', o)
    expect((await readUnitsChunk(f.bytes, { ref: f.ref, before: null })).dropped).toEqual([7])
  })

  it('a nested reference to a unit dropped in an earlier chunk drops the unit, the chunks read as a chain', async () => {
    const [a, b] = chunksOf(['para', 'footnote'], [[], [[4, 'x', 0, 'y']]])
    const second = forged('units', b, { from: 1, to: 1 })
    // the first chunk's unit does not stand (a kind of upper-case letters), the second nests it
    const bad = forged('units', JSON.parse(JSON.stringify(a).replace('"para"', '"Para"')), { from: 0, to: 0 })
    const c1 = await readUnitsChunk(bad.bytes, { ref: bad.ref, before: null })
    expect(c1.dropped).toEqual([0])
    const c2 = await readUnitsChunk(second.bytes, { ref: second.ref, before: c1 })
    expect(c2.dropped).toEqual([1])
    expect(c2.units).toEqual([null])
    // the same chunks, the first standing: the nested unit stands
    const okFirst = forged('units', a, { from: 0, to: 0 })
    const d1 = await readUnitsChunk(okFirst.bytes, { ref: okFirst.ref, before: null })
    expect((await readUnitsChunk(second.bytes, { ref: second.ref, before: d1 })).dropped).toEqual([])
    // the chain: the unit nested is one the chunks before it hold, never one of this chunk's own or later
    expect(unitsOfChunks([c1, c2]).dropped).toEqual([0, 1])
  })

  it('refuses `from` that is not the last `to` + 1 (or 0 for the first), another paper, another pipeline, units not as many as the ids', async () => {
    const [a, b] = chunksOf(['para', 'para'], [[], []])
    const f0 = forged('units', a, { from: 0, to: 0 }), f1 = forged('units', b, { from: 1, to: 1 })
    const c0 = await readUnitsChunk(f0.bytes, { ref: f0.ref, before: null })
    expect(await refusal(readUnitsChunk(f1.bytes, { ref: f1.ref, before: null }))).toMatchObject({ kind: 'units', path: 'ids[0]' })
    expect(await refusal(readUnitsChunk(f0.bytes, { ref: f0.ref, before: c0 }))).toMatchObject({ path: 'ids[0]' })
    const otherPaper = forged('units', { ...b, paper: { id: '2608.04323', version: 1 } })
    expect(await refusal(readUnitsChunk(otherPaper.bytes, { ref: otherPaper.ref, before: c0 }))).toMatchObject({ path: 'paper' })
    const otherVersion = forged('units', { ...b, paper: { id: PAPER.id, version: 2 } })
    expect(await refusal(readUnitsChunk(otherVersion.bytes, { ref: otherVersion.ref, before: c0 }))).toMatchObject({ path: 'paper' })
    const otherPipeline = forged('units', { ...b, pipeline: '99' })
    expect(await refusal(readUnitsChunk(otherPipeline.bytes, { ref: otherPipeline.ref, before: c0 }))).toMatchObject({ path: 'pipeline' })
    for (const ids of [[1, 0], [1, 1.5], [1], [1, 2, 3], 'x']) {
      const bad = forged('units', { ...b, ids })
      expect((await refusal(readUnitsChunk(bad.bytes, { ref: bad.ref, before: c0 })))?.path).toMatch(/^ids/)
    }
    const short = forged('units', { ...b, ids: [1, 2] })
    expect(await refusal(readUnitsChunk(short.bytes, { ref: short.ref, before: c0 }))).toMatchObject({ path: 'units' })
    expect(await refusal(readUnitsChunk(forged('units', { ...b, pipeline: 7 }).bytes, { ref: forged('units', { ...b, pipeline: 7 }).ref, before: c0 }))).toMatchObject({ path: 'pipeline' })
    await expect(readUnitsChunk(f1.bytes, { ref: f1.ref, before: {} as never })).rejects.toThrow(TypeError)
  })
})

/** hand-made chunks of one unit each: the unit of kind `kinds[i]` with the pieces `pieces[i]` */
function chunksOf(kinds: string[], pieces: unknown[][]) {
  return kinds.map((kind, i) => ({
    format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [i, i],
    units: [[kind, 0, null, null, null, [[0, 'a'], ...(pieces[i] as unknown[])]]],
  }))
}

// ---------------------------------------------------------------- 6. the chunk cut
describe('writeUnitChunks cuts by unit id within both caps', () => {
  const PARA = (text: string): (typeof UNITS)[number] => ['para', 0, null, null, null, [[0, text]]]
  /** units of `size` code units of text each: `n` of them */
  const many = (n: number, size: number) => Array.from({ length: n }, () => PARA('x'.repeat(size)))
  /** units of a few values each, many of them: the values bind before the bytes */
  const tiny = (n: number) => Array.from({ length: n }, () => ['para', 0, null, null, null, Array.from({ length: 30 }, () => [0, 'a'])] as (typeof UNITS)[number])

  async function checked(units: (typeof UNITS)[number][]) {
    const chunks = await writeUnitChunks({ paper: PAPER, units })
    // ids contiguous from 0, each chunk within both caps, the chunks read as a chain give every unit back
    let next = 0
    for (const c of chunks) {
      expect(c.from).toBe(next)
      next = c.to + 1
      expect(c.bytes.length).toBeLessThanOrEqual(UNITS_CAP)
      expect(c.values).toBeLessThanOrEqual(UNITS_VALUES)
    }
    expect(next).toBe(units.length)
    const read: Awaited<ReturnType<typeof readUnitsChunk>>[] = []
    for (const c of chunks) read.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: read.at(-1) ?? null }))
    expect(unitsOfChunks(read).units).toEqual(units)
    expect(read.map(r => r.values)).toEqual(chunks.map(c => c.values))
    return chunks
  }

  it('is greedy: a chunk ends only where the next unit would pass a cap', async () => {
    const units = many(2600, 1000)
    const chunks = await checked(units)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const size = (u: (typeof UNITS)[number]) => utf8(JSON.stringify(u)).length
    for (const c of chunks.slice(0, -1)) expect(c.bytes.length + 1 + size(units[c.to + 1]!)).toBeGreaterThan(UNITS_CAP)
    // (the values bind first for units of many small pieces)
    const small = tiny(9000)
    const byValues = await checked(small)
    expect(byValues.length).toBeGreaterThanOrEqual(3)
    expect(byValues.every(c => c.bytes.length < UNITS_CAP)).toBe(true)
    for (const c of byValues.slice(0, -1)) expect(c.values + 97).toBeGreaterThan(UNITS_VALUES)
  })

  it('a unit past either cap alone throws with its id', async () => {
    const big = PARA('x'.repeat(16_000))
    big[5] = Array.from({ length: 200 }, () => [0, 'x'.repeat(16_000)]) as never
    const bytes = await refusal(writeUnitChunks({ paper: PAPER, units: [...many(3, 10), big, PARA('y')] }))
    expect(bytes).toMatchObject({ kind: 'units', id: 3, message: expect.stringMatching(/^units: unit 3: \d+ bytes and \d+ values alone, past a chunk's 2097152 \/ 400000$/) })
    const values: (typeof UNITS)[number] = ['para', 0, null, null, null, Array.from({ length: 140_000 }, () => [0, 'a'])]
    expect(await refusal(writeUnitChunks({ paper: PAPER, units: [values] }))).toMatchObject({ kind: 'units', id: 0 })
  })

  it('a paper of 954,000 glyphs and one of 5 MiB of units come out in 2 and 3 chunks or more, each within the caps', async () => {
    // (a unit of 1,000 glyphs at 2.3 bytes of unit JSON a glyph, as the survey's order: O1 measures the two real papers)
    const glyphs = 954_000
    const perUnit = 1000, n = Math.ceil(glyphs / perUnit)
    const survey = await checked(many(n, Math.round(perUnit * 2.3)))
    expect(survey.length).toBeGreaterThanOrEqual(2)
    const forced = await checked(many(5300, 1000))
    expect(forced.reduce((a, c) => a + c.bytes.length, 0)).toBeGreaterThan(5 * 2 ** 20)
    expect(forced.length).toBeGreaterThanOrEqual(3)
  })

  it('past the guard is `units-too-large`, with the bound and the size as data (amendment M2\': an abuse guard, 10 times the longest book)', async () => {
    expect([CHUNKS_MAX, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES]).toEqual([20, 32 * 2 ** 20, 3_500_000])
    // (full chunks of 2 MiB reach the bytes before the count: 16 of them are 32 MiB)
    const e = await refusal(writeUnitChunks({ paper: PAPER, units: many(36_000, 1000) }))
    expect(e).toMatchObject({ kind: 'units', why: 'units-too-large', data: { what: 'bytes', bound: UNITS_TOTAL_BYTES } })
    expect((e!.data as { size: number }).size).toBeGreaterThan(UNITS_TOTAL_BYTES)
    expect(e!.message).toBe('units: units-too-large')
  })

  it('the head reader and the index hold the same bounds', async () => {
    const chunks = await writeUnitChunks({ paper: PAPER, units: UNITS })
    const refs = Array.from({ length: CHUNKS_MAX + 1 }, (_, i) => ({ kind: 'units', from: i, to: i, sha256: chunks[0]!.sha256, bytes: 100 }))
    const head = parsed(M.head)
    head.units = refs
    const f = forged('head', head)
    expect(await refusal(readHead(f.bytes, { ref: f.ref }))).toMatchObject({ kind: 'head', path: 'units' })
    // the total bytes of the refs
    const refsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'units', from: i, to: i, sha256: chunks[0]!.sha256, bytes: UNITS_CAP }))
    head.units = refsOf(refs.length - 1 + 12)
    expect(await refusal(readHead(forged('head', head).bytes, { ref: forged('head', head).ref }))).toMatchObject({ path: 'units' })
    // (CHUNKS_MAX chunks of the largest size are 40 MiB: the bytes in all are the guard)
    head.units = refsOf(CHUNKS_MAX)
    const g = forged('head', head)
    expect(await refusal(readHead(g.bytes, { ref: g.ref }))).toMatchObject({ why: 'units-too-large', data: { what: 'bytes', bound: UNITS_TOTAL_BYTES } })
    head.units = refsOf(UNITS_TOTAL_BYTES / UNITS_CAP)
    const h = forged('head', head)
    expect(await readHead(h.bytes, { ref: h.ref })).toMatchObject({ kind: 'head' })
    expect(() => unitsOfChunks([])).toThrow(BundleRefusal)
    expect(() => unitsOfChunks(Array.from({ length: CHUNKS_MAX + 1 }, () => M.readChunks[0]!))).toThrow(BundleRefusal)
  })
})

describe('unitsOfChunks gives windowed access (amendment M3\')', () => {
  // three chunks of two units: unit 3 (chunk 1) nests unit 0 (chunk 0), unit 5 (chunk 2) nests units 1 and 3 and its own 4,
  // unit 4 nests nothing outside its chunk
  const nest = (id: number) => [4, '\\footnote{', id, '}']
  const spec = [
    [['para', []], ['footnote', []]],
    [['para', [nest(0)]], ['para', [nest(2)]]],
    [['para', []], ['para', [nest(1), nest(3), nest(4), nest(3)]]],
  ] as const
  async function chain() {
    const read: Awaited<ReturnType<typeof readUnitsChunk>>[] = []
    let id = 0
    for (const units of spec) {
      const o = { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [id, id + 1], units: units.map(([kind, pieces]) => [kind, 0, null, null, null, [[0, 'a'], ...pieces]]) }
      const f = forged('units', o, { from: id, to: id + 1 })
      read.push(await readUnitsChunk(f.bytes, { ref: f.ref, before: read.at(-1) ?? null }))
      id += 2
    }
    return read
  }

  it('maps a unit to its chunk and lists the earlier units a chunk\'s nested pieces name', async () => {
    const u = unitsOfChunks(await chain())
    expect(u.index).toEqual([{ from: 0, to: 1 }, { from: 2, to: 3 }, { from: 4, to: 5 }])
    expect([0, 1, 2, 3, 4, 5].map(id => u.chunkOf(id))).toEqual([0, 0, 1, 1, 2, 2])
    expect(u.dropped).toEqual([])
    expect(u.externalRefs(0)).toEqual([])
    // chunk 1's unit 2 names unit 0 (an earlier chunk's), unit 3 names unit 2 (its own chunk's)
    expect(u.externalRefs(1)).toEqual([0])
    // chunk 2's unit 5 names 1 and 3 (earlier chunks') and 4 (its own), 3 twice
    expect(u.externalRefs(2)).toEqual([1, 3])
  })

  it('refuses an id or a chunk that is none, and a unit dropped names nothing', async () => {
    const u = unitsOfChunks(await chain())
    for (const id of [-1, 6, 1.5, Number.NaN]) expect(() => u.chunkOf(id)).toThrow(RangeError)
    for (const k of [-1, 3, 0.5]) expect(() => u.externalRefs(k)).toThrow(RangeError)
    const o = { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [2, 3], units: [['para', 0, null, null, null, [nest(0)]], ['Para', 0, null, null, null, [nest(0)]]] }
    const f = forged('units', o, { from: 2, to: 3 })
    const first = (await chain())[0]!
    const second = await readUnitsChunk(f.bytes, { ref: f.ref, before: first })
    expect(second.dropped).toEqual([3])
    expect(unitsOfChunks([first, second]).externalRefs(1)).toEqual([0])
  })

  it('refuses the guard\'s breach: more chunks than CHUNKS_MAX, and values in all past UNITS_TOTAL_VALUES', async () => {
    const [c0] = await chain()
    expect(() => unitsOfChunks(Array.from({ length: CHUNKS_MAX + 1 }, () => c0!))).toThrow(expect.objectContaining({ kind: 'index' }))
    // (chunks that claim 2 million values each: the third passes the total)
    const heavy = [0, 1, 2].map(i => ({ ...c0!, from: 2 * i, to: 2 * i + 1, values: 2_000_000, stands: new Uint8Array(2 * i + 2).fill(1) }))
    expect(() => unitsOfChunks(heavy)).toThrow(expect.objectContaining({ why: 'units-too-large', data: expect.objectContaining({ what: 'values', bound: 3_500_000 }) }))
  })
})
