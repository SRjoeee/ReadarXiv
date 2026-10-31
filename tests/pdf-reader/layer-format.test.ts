// @vitest-environment node
import { LAB_ON, LAB_PAPERS, labFiles } from './helpers/lab-data'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { readBundle, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { PartChain, ReadUnitsChunk, ReadUnitsChunkLight } from '@/pdf-reader/engine/layer-proto/format.mjs'
import {
  BUILD_END_WHYS, BUNDLE5, DEPTH_NONE, KIND_NONE, RECORD_FLAG, CATALOG_CAP, CATALOG_VALUES, catalogKey, CHUNKS_MAX, CONTENT_MAX, CTAG5, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, indexOf,
  isFinalEnd, keyOf, keyParts, LAYOUT_REFUSED, LEFT_CAP, LEFT_VALUES, mergeParts, PART_CAP, PART_VALUES, partTarget, readCatalog, readHead, readLeftPart, readPart,
  readUnitsChunk, TOKENS_PAGE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, unitsOfChunks, droppedOf, DROPPED_MAX, UNIT_ID_MAX, VTAG5, WHY_MAX, writeCatalog, writeHead, writeLeftPart, writePart, writeUnitChunks,
} from '@/pdf-reader/engine/layer-proto/format.mjs'
import { batchOf, FIRST_BATCH, NEXT_BATCH, plainSource } from '@/pdf-reader/engine/translate/mt.mjs'
import { batchesOf, sourceUnitsOf, toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { groupOf } from '@/pdf-reader/engine/translate/groups.mjs'
import { encodeLayout, LAYOUT, LAYOUT_SCHEMA, type LayoutFile, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS, PIPELINE_VERSION, REMOVAL } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { isMemoryError } from '@/pdf-reader/engine/pipeline/memory.mjs'
import {
  BASE, forged, IMAGE, LEFT_OF, type Made, made, N, PAPER, parsed, partInputs, RULES_2, sha256Of, STREAM, textOf, TOKENS_ON_PAGE, tokenWire, UNITS, utf8, VIEWS,
} from './helpers/format-paper'

// BUNDLE 4's format (the prepare pipeline's bundle 4 contract and its amendments): the five kinds of object, each writer
// then its reader, each reader refusing in its order, the part chain, the keys. A small paper of four pages in three parts
// (tests/pdf-reader/helpers/format-paper.ts); the six papers' real data where this machine has it (AXT_LAB)

afterEach(() => { vi.restoreAllMocks() })

let M: Made
/** the complete catalog of the small paper */
let CAT: { bytes: Uint8Array }
beforeAll(async () => {
  M = await made()
  CAT = await writeCatalog({
    head: M.readHead, units: M.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length })),
    parts: M.parts.map(p => ({ from: p.from, to: p.to, sha256: p.sha256, bytes: p.bytes.length })), end: { through: 4 },
  })
})

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

  it('Node 24 on: Buffer.allocUnsafe\'s RangeError of Node\'s own words and code, and PDF.js\'s wrapping of it, are a failed allocation', () => {
    // (as Node 26.13 throws it under RLIMIT_DATA: `RangeError: Failed to allocate memory`, `code: 'ERR_MEMORY_ALLOCATION_FAILED'`)
    const node = Object.assign(new RangeError('Failed to allocate memory'), { code: 'ERR_MEMORY_ALLOCATION_FAILED' })
    expect(isMemoryError(node)).toBe(true)
    expect(isMemoryError(pdfjsWrapped(node))).toBe(true)
    // (its words without its code, or wrapped from another error, are none)
    expect(isMemoryError(new RangeError('Failed to allocate memory'))).toBe(false)
    expect(isMemoryError(Object.assign(new Error('Failed to allocate memory'), { name: 'UnknownErrorException', details: 'FormatError: Failed to allocate memory' }))).toBe(false)
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
    // (BUNDLE 8: a base given with no `source` is arXiv's, written so, read as it is; no `orig` beside it)
    expect(h).toMatchObject({ kind: 'head', bundle: BUNDLE5, paper: { ...PAPER, pages: N }, base: { source: 'arxiv', ...BASE }, orig: null, lineskip: [1, 0], sha256: M.head.sha256 })
    expect(h.versions).toEqual({ pipeline: PIPELINE_VERSION, layout: LAYOUT, removal: REMOVAL, pdfjs: PDFJS, image: IMAGE })
    expect(h.units).toEqual([{ kind: 'units', from: 0, to: 7, sha256: M.chunks[0]!.sha256, bytes: M.chunks[0]!.bytes.length }])
    expect(Object.keys(parsed(M.head))).toEqual(['bundle', 'kind', 'paper', 'base', 'versions', 'units', 'lineskip'])
    expect(parsed(M.head).base).toEqual({ source: 'arxiv', ...BASE })
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
    expect(p3.rules).toBeNull()
    expect(p1.rules).toBeNull()
    expect(p2.rules).toEqual({ 2: RULES_2 })
    expect(p1.leftParts).toEqual([M.lefts[1]!.ref])
    expect(p2.leftParts).toEqual([M.lefts[2]!.ref, M.lefts[3]!.ref])
    expect(p1.chain).toEqual({
      head: M.head.sha256, through: 1, last: M.parts[0]!.sha256, slot: 12, id: 2, told: Uint8Array.of(1, 0, 1, 0, 0, 0, 0, 0), figured: Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0), groups: Uint8Array.of(0, 0, 0), reach: 2, ahead: VIEWS[1],
    })
    expect(p2.chain).toMatchObject({ through: 3, slot: 41.5, id: 5, reach: 4, ahead: VIEWS[3] })
    expect(p3.chain).toMatchObject({ through: 4, slot: 70, id: 7, reach: 4, ahead: [] })
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
    expect(done.key).toBe(catalogKey(PAPER.id, PAPER.version, VTAG5))
    const c = await readCatalog(done.bytes, { key: done.key, paper: PAPER })
    expect(c).toMatchObject({ kind: 'catalog', sha256: done.sha256, paper: { ...PAPER, pages: N }, head: { kind: 'head', sha256: M.head.sha256 }, end: { through: 4 } })
    expect(c.parts).toEqual(parts.map(r => ({ kind: 'part', ...r })))
    expect(Object.keys(parsed(done))).toEqual(['bundle', 'kind', 'paper', 'versions', 'head', 'base', 'units', 'parts', 'end'])
    // (the base the head names: arXiv's PDF, by its digest and bytes)
    expect(c.base).toEqual({ source: 'arxiv', sha256: BASE.sha256, bytes: BASE.bytes })
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
  it('equals readBundle of the BUNDLE 3 file made of the same paper: units, left, layout as encodeLayout bytes, the cell rules', () => {
    const merged = mergeParts(M.index, M.readParts)
    // the whole file by hand: the layout's fonts by first appearance (lines by unit id, then names), page 4 not planned
    const whole: LayoutFile = {
      schema: LAYOUT_SCHEMA, layout: LAYOUT, pdfjs: PDFJS, paper: { ...PAPER, pages: N }, left: '', views: VIEWS.flat(), fonts: ['CMR10', 'CMBX12'],
      units: [[0, 1, 9, 1, 1], [2, 0, 9, 0, 7], [3, 4, 9, 0, 1], [5, 4, 9, 0, 3]],
      lines: [
        [0, [1, 150, 460, 700, 712, 696, 17.28, 0]], [2, [1, 72, 540, 650, 657.5, 647.25, 10, 0, 2, 72, 300, 700, 710, 698, 10, 0]],
        [3, [2, 72, 200, 500, 508, 498, 9, 0]], [5, [3, 72, 200, 400, 408, 398, 9, 0]],
      ],
      frames: [[0, [1, 0, 0, 1, -1, 30]], [2, [1, 0, 0, 1, -1, 12.5, 2, 0, 1, 1, 500, 12]], [3, [2, 0, 0, 1, -1, 10]], [5, [3, 0, 0, 1, -1, 10]]],
      erase: [], ph: [[2, 4, 0, 0, 1, 100, 650, 110, 657, 647]], labels: [], headings: [[0, 'A Title']], pageText: [], held: [],
      names: [[0, 0, 3, 280, 680, 332.5, 687, 677.5, 9, 1, 1, -1, 0, 72, 540]], lineskip: [1, 0],
    }
    const url = `/api/v1/original/${PAPER.id}v${PAPER.version}`
    const leftUnits = [...M.readParts.flatMap(p => p.left)].sort((a, b) => a[0] - b[0])
    const bytes = writeBundle({
      paper: { ...PAPER, pages: N }, base: { bytes: BASE.bytes, sha256: BASE.sha256, url }, image: IMAGE, units: UNITS,
      left: { kinds: UNITS.map(u => u[0]), pages: VIEWS as [number, number, number, number][], units: leftUnits }, layout: whole, rules: { 2: RULES_2 },
    })
    const read = readBundle(bytes)
    expect(merged.units).toEqual(read.units)
    expect(merged.dropped).toEqual(read.dropped)
    expect(merged.paper).toEqual(read.paper)
    // (the merged base says whose page the layout is over, which a BUNDLE 3 file does not: the reader's open of a whole draws by it)
    expect(merged.base).toEqual({ ...read.base, source: M.readHead.base.source })
    expect(merged.left).toEqual(read.left)
    expect(encodeLayout(merged.layout!)).toBe(encodeLayout(read.layout!))
    expect(merged.rules).toEqual(read.rules)
    expect(merged.rules).toEqual({ 2: RULES_2 })
    expect(merged.versions).toEqual({ bundle: BUNDLE5, ...M.readHead.versions })
  })

  it('refuses parts that are not one chain: the first with a prev, a part that does not follow the digest of the one before (two chains sharing a head)', async () => {
    expect(() => mergeParts(M.index, [{ ...M.readParts[0]!, prev: 'a'.repeat(64) }, M.readParts[1]!, M.readParts[2]!])).toThrow(expect.objectContaining({ kind: 'index', path: 'parts[0]' }))
    // an alternate second part (a rule moved), read after the first: it extends the first as the original does, and the third does not follow it
    const input = partInputs(M.head.sha256, M.lefts, [null, M.parts[0]!.sha256, M.parts[1]!.sha256])[1]!
    const alt = await writePart({ ...input, rules: { 2: [72, 501, 540, 501.4] } })
    expect(alt.sha256).not.toBe(M.parts[1]!.sha256)
    const readAlt = await readPart(alt.bytes, { ref: alt.ref, index: M.index, chain: M.readParts[0]!.chain })
    expect(readAlt.prev).toBe(M.parts[0]!.sha256)
    expect(() => mergeParts(M.index, [M.readParts[0]!, readAlt, M.readParts[2]!])).toThrow(expect.objectContaining({ kind: 'index', path: 'parts[2]' }))
    expect(() => mergeParts(M.index, [M.readParts[0]!, M.readParts[1]!, M.readParts[2]!])).not.toThrow()
  })

  it('refuses parts that are not a chain to the paper\'s last page', () => {
    expect(() => mergeParts(M.index, M.readParts.slice(0, 2))).toThrow(BundleRefusal)
    expect(() => mergeParts(M.index, [M.readParts[1]!, M.readParts[2]!])).toThrow(BundleRefusal)
    expect(() => mergeParts(M.index, [M.readParts[0]!, M.readParts[0]!, M.readParts[1]!, M.readParts[2]!])).toThrow(BundleRefusal)
  })
})

// ---------------------------------------------------------------- 2–4. the order of refusal, every reader
type Reader = (bytes: Uint8Array, ref: ReturnType<typeof forged>['ref'] | null, caps?: { bytes?: number; values?: number }) => Promise<unknown>
const READERS: { kind: 'units' | 'head' | 'part' | 'left' | 'catalog'; cap: number; values: number; depth: number; read: Reader; sample: () => { bytes: Uint8Array } }[] = [
  { kind: 'units', cap: UNITS_CAP, values: UNITS_VALUES, depth: 5, sample: () => M.chunks[0]!, read: (b, ref, caps) => readUnitsChunk(b, { ref: ref!, before: null, caps }) },
  { kind: 'head', cap: HEAD_CAP, values: HEAD_VALUES, depth: 4, sample: () => M.head, read: (b, ref, caps) => readHead(b, { ref: ref!, caps }) },
  { kind: 'part', cap: PART_CAP, values: PART_VALUES, depth: 7, sample: () => M.parts[0]!, read: (b, ref, caps) => readPart(b, { ref: ref!, index: M.index, chain: null, caps }) },
  { kind: 'left', cap: LEFT_CAP, values: LEFT_VALUES, depth: 5, sample: () => M.lefts[1]!, read: (b, ref, caps) => readLeftPart(b, { ref: ref as never, streamOf: id => STREAM.get(id), caps }) },
  { kind: 'catalog', cap: CATALOG_CAP, values: CATALOG_VALUES, depth: 3, sample: () => CAT, read: (b, _ref, caps) => readCatalog(b, { caps }) },
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

describe('a reader\'s options are checked: a ref wherever a digest is, caps that are positive integers', () => {
  it('a ref of null is a TypeError for every kind that has one, and the catalog needs none', async () => {
    for (const r of READERS.filter(k => k.kind !== 'catalog')) await expect(r.read(r.sample().bytes, null), r.kind).rejects.toThrow(TypeError)
    await expect(readCatalog(CAT.bytes, { caps: undefined })).resolves.toMatchObject({ kind: 'catalog' })
  })

  it('caps that are NaN, zero, negative, fractional, infinite or not numbers are a TypeError, not caps turned off', async () => {
    for (const r of READERS) {
      const bytes = r.sample().bytes, ref = r.kind === 'catalog' ? null : asRef(r.kind, bytes)
      for (const bad of [Number.NaN, 0, -1, 1.5, Infinity, '9', null]) {
        await expect(r.read(bytes, ref, { bytes: bad as never }), `${r.kind} bytes ${String(bad)}`).rejects.toThrow(TypeError)
        await expect(r.read(bytes, ref, { values: bad as never }), `${r.kind} values ${String(bad)}`).rejects.toThrow(TypeError)
      }
      await r.read(bytes, ref, { bytes: r.cap, values: r.values })
      await r.read(bytes, ref, {})
    }
  })
})

describe('a part\'s ref names its place', () => {
  it('the ref\'s from and to are the part\'s pages, where the ref has them', async () => {
    const p = M.parts[1]!
    expect(p.ref).toMatchObject({ from: 2, to: 3 })
    await readPart(p.bytes, { ref: p.ref, index: M.index, chain: chainBefore(1) })
    for (const wrong of [{ from: 1 }, { to: 4 }, { from: 3, to: 3 }]) {
      expect(await refusal(readPart(p.bytes, { ref: { ...p.ref, ...wrong }, index: M.index, chain: chainBefore(1) })), JSON.stringify(wrong)).toMatchObject({ kind: 'part', path: 'ref' })
    }
    // (a ref without a place, as a host that has only the digest holds it, is read)
    const { from: _f, to: _t, ...bare } = p.ref
    await readPart(p.bytes, { ref: bare, index: M.index, chain: chainBefore(1) })
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
        expect(await refusal(read(kind, o => { o[tag] = '3' }))).toMatchObject({ kind, path: tag })
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
    expect(await refusal(read('units', o => { o.bundle = '5'; delete o.format }))).toMatchObject({ kind: 'units', path: 'format' })
    expect(UNITS_FORMAT).toBe('1')
    // (6: a part with no layout says why, `layout: { refused, why }`; 7: a draw's items carry their characters' fills; 8: the
    // head's base says whose PDF the layer is drawn over; 11: a figure row carries its set and its room; 12: a left part its line map)
    expect(BUNDLE5).toBe('12')
  })

  it('refuses what is not an object, and a chunk given as a part and a part given as a chunk', async () => {
    for (const text of ['[]', '7', 'null', '"x"']) {
      const f = forged('head', JSON.parse(text))
      expect(await refusal(readHead(f.bytes, { ref: f.ref }))).toMatchObject({ kind: 'head', message: expect.stringMatching(/not an object/) })
    }
    expect(await refusal(readPart(M.chunks[0]!.bytes, { ref: { ...M.chunks[0]!.ref, kind: 'part' }, index: M.index, chain: null }))).toMatchObject({ path: 'bundle' })
    // (a part given as a chunk or a head: refused as what it was asked as)
    expect(await refusal(readUnitsChunk(M.parts[0]!.bytes, { ref: { ...M.parts[0]!.ref, kind: 'units' }, before: null }))).toMatchObject({ kind: 'units' })
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

  it('reads a chunk alone with the ids dropped before it (M19), as the chain reads it', async () => {
    // chunk 0: unit 0 does not stand (upper-case kind), unit 1 does; chunk 1: unit 2 nests 0 (dropped), unit 3 nests 1; chunk 2: unit 4 nests 0, 5 nests 3 and 1
    const nest = (id: number) => [4, 'x', id, 'y']
    const spec = [
      [['Para', []], ['para', []]],
      [['para', [nest(0)]], ['para', [nest(1)]]],
      [['para', [nest(0)]], ['para', [nest(3), nest(1)]]],
    ] as const
    const forgedChunks: ReturnType<typeof forged>[] = []
    let id = 0
    for (const units of spec) {
      const o = { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [id, id + 1], units: units.map(([kind, pieces]) => [kind, 0, null, null, null, [[0, 'a'], ...pieces]]) }
      forgedChunks.push(forged('units', o, { from: id, to: id + 1 }))
      id += 2
    }
    const chainRead: ReadUnitsChunk[] = []
    for (const f of forgedChunks) chainRead.push(await readUnitsChunk(f.bytes, { ref: f.ref, before: chainRead.at(-1) ?? null }))
    const all = unitsOfChunks(chainRead)
    expect(all.dropped).toEqual([0, 2, 4])
    expect(droppedOf(chainRead)).toEqual([0, 2, 4])
    for (let k = 0; k < forgedChunks.length; k++) {
      const f = forgedChunks[k]!, from = chainRead[k]!.from
      const alone = await readUnitsChunk(f.bytes, { ref: f.ref, before: null, dropped: droppedOf(chainRead).filter(d => d < from) })
      expect(alone.units, `chunk ${k}`).toEqual(chainRead[k]!.units)
      expect(alone.dropped, `chunk ${k}`).toEqual(chainRead[k]!.dropped)
      expect([...alone.stands], `chunk ${k}`).toEqual([...chainRead[k]!.stands])
      // the nested pieces name what chunk k needs from before it, from the chunk alone
      const lean = await readUnitsChunk(f.bytes, { ref: f.ref, before: null, dropped: droppedOf(chainRead).filter(d => d < from), bodies: false })
      expect(lean.part!.external, `chunk ${k}`).toEqual(all.externalRefs(k))
    }
    // a chunk read alone without `dropped`: every earlier id stands, so the nested unit does too
    const f = forgedChunks[1]!
    expect((await readUnitsChunk(f.bytes, { ref: f.ref, before: null })).dropped).toEqual([])
    // `dropped` is ids below `from`, once each, and only where `before` is null
    for (const bad of [[2], [-1], [0.5], [0, 0], [1, 0], 'x' as never]) await expect(readUnitsChunk(f.bytes, { ref: f.ref, before: null, dropped: bad })).rejects.toBeInstanceOf(TypeError)
    await expect(readUnitsChunk(f.bytes, { ref: f.ref, before: chainRead[0]!, dropped: [0] })).rejects.toBeInstanceOf(TypeError)
    const first = forgedChunks[0]!
    await expect(readUnitsChunk(first.bytes, { ref: first.ref, before: null, dropped: [0] })).rejects.toBeInstanceOf(TypeError)
    // a ref that names another start than the chunk's is still refused
    await expect(readUnitsChunk(f.bytes, { ref: { ...f.ref, from: 4, to: 5 }, before: null, dropped: [] })).rejects.toBeInstanceOf(BundleRefusal)
  })

  it('bounds a chunk read alone before it allocates anything by its ids (M19)', async () => {
    const [a] = chunksOf(['para'], [[]])
    const at = (ids: unknown[], ref: { from?: number; to?: number } = {}) => {
      const f = forged('units', { ...a, ids }, ref as { from: number; to: number })
      return readUnitsChunk(f.bytes, { ref: f.ref, before: null })
    }
    const started = performance.now()
    for (const [ids, ref] of [
      [[-1, -1], { from: -1, to: -1 }], [[-1, 0], { from: -1 }], [[0.5, 0.5], { from: 0.5 }], [[2 ** 40, 2 ** 40], { from: 2 ** 40, to: 2 ** 40 }],
      [[UNITS_TOTAL_VALUES + 1, UNITS_TOTAL_VALUES + 1], { from: UNITS_TOTAL_VALUES + 1 }], [[0, UNITS_TOTAL_VALUES + 1], {}], [['0', '0'], {}], [[Number.NaN, 1], {}],
    ] as const) {
      const r = await refusal(at([...ids], ref))
      expect(r, JSON.stringify(ids)).toMatchObject({ kind: 'units' })
      expect(r!.path, JSON.stringify(ids)).toMatch(/^(ids|ref)/)
    }
    // a chunk at the last id a paper the guard accepts can hold is read (one unit, ids [N, N])
    expect((await at([UNITS_TOTAL_VALUES, UNITS_TOTAL_VALUES], { from: UNITS_TOTAL_VALUES, to: UNITS_TOTAL_VALUES })).from).toBe(UNITS_TOTAL_VALUES)
    // `dropped` is bounded before anything is read: a huge list, ids past the bound, a `from` past it
    const f = forged('units', { ...a, ids: [5, 5] }, { from: 5, to: 5 })
    const huge = Array.from({ length: DROPPED_MAX + 1 }, (_, i) => i)
    expect(await refusal(readUnitsChunk(f.bytes, { ref: { ...f.ref, from: 2 ** 40 }, before: null, dropped: [] }))).toMatchObject({ kind: 'units', path: 'ref' })
    expect(await refusal(readUnitsChunk(f.bytes, { ref: f.ref, before: null, dropped: huge }))).toMatchObject({ kind: 'units', path: 'dropped' })
    const bigFrom = forged('units', { ...a, ids: [DROPPED_MAX + 10, DROPPED_MAX + 10] }, { from: DROPPED_MAX + 10, to: DROPPED_MAX + 10 })
    expect((await readUnitsChunk(bigFrom.bytes, { ref: bigFrom.ref, before: null, dropped: huge.slice(0, DROPPED_MAX) })).from).toBe(DROPPED_MAX + 10)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('reads a one-unit chunk far from the start bodies-free with bounded time and memory, nested pieces by lookup', async () => {
    const nest = (id: number) => [4, 'x', id, 'y']
    for (const from of [1_000_000, UNIT_ID_MAX - 1]) {
      // unit `from` names 5 (stands), 7 (dropped) and its own earlier... only the first two are earlier ids; unit from+1 names `from`
      const rows = [['para', [nest(5)]], ['para', [nest(from)]]] as const
      const last = from + rows.length - 1 > UNIT_ID_MAX ? from : from + rows.length - 1
      const use = rows.slice(0, last - from + 1)
      const f = forged('units', { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [from, last], units: use.map(([kind, pieces]) => [kind, 0, null, null, null, [[0, 'some text'], ...pieces]]) }, { from, to: last })
      const before = process.memoryUsage()
      const started = performance.now()
      const lean = await readUnitsChunk(f.bytes, { ref: f.ref, before: null, dropped: [7], bodies: false })
      const took = performance.now() - started
      const after = process.memoryUsage()
      expect(took, `from ${from}`).toBeLessThan(1000)
      expect(after.heapUsed - before.heapUsed, `from ${from}: heap`).toBeLessThan(50 * 2 ** 20)
      expect(after.arrayBuffers - before.arrayBuffers, `from ${from}: buffers`).toBeLessThan(50 * 2 ** 20)
      expect(lean.units).toEqual(use.map(() => true))
      expect(lean.part.external).toEqual([5])
      expect(lean.part.records.plainLength[0]).toBe('some text'.length)
      expect([...lean.part.records.kind]).toEqual(use.map(() => 0))
      // (the dropped earlier unit named: this unit does not stand)
      const g = forged('units', { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [from, from], units: [['para', 0, null, null, null, [[0, 'a'], nest(7)]]] }, { from, to: from })
      const gone = await readUnitsChunk(g.bytes, { ref: g.ref, before: null, dropped: [7], bodies: false })
      expect(gone.units).toEqual([null])
      expect(gone.dropped).toEqual([from])
    }
  })

  it('bounds the dropped ids of a paper by DROPPED_MAX, in a chain as standalone (M19)', async () => {
    const chunkOf = (from: number, count: number, tail?: unknown[]) => forged('units', {
      format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [from, from + count - 1 + (tail ? tail.length : 0)],
      units: [...Array.from({ length: count }, () => 0), ...(tail ?? [])],
    }, { from, to: from + count - 1 + (tail ? tail.length : 0) })
    const good = ['para', 0, null, null, null, [[0, 'a']]]
    // exactly DROPPED_MAX dropped: accepted, forwarded, and the next chunk read alone from them
    const a = chunkOf(0, DROPPED_MAX)
    const readA = await readUnitsChunk(a.bytes, { ref: a.ref, before: null })
    expect(readA.dropped.length).toBe(DROPPED_MAX)
    const b = forged('units', { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [DROPPED_MAX, DROPPED_MAX], units: [good] }, { from: DROPPED_MAX, to: DROPPED_MAX })
    const readB = await readUnitsChunk(b.bytes, { ref: b.ref, before: readA })
    const alone = await readUnitsChunk(b.bytes, { ref: b.ref, before: null, dropped: droppedOf([readA]) })
    expect(alone.units).toEqual(readB.units)
    expect(unitsOfChunks([readA, readB]).dropped.length).toBe(DROPPED_MAX)
    // one more, in the chunk itself, in the chain's next chunk, and on the standalone start
    const over = chunkOf(0, DROPPED_MAX + 1)
    expect(await refusal(readUnitsChunk(over.bytes, { ref: over.ref, before: null }))).toMatchObject({ kind: 'units', path: 'dropped' })
    const c = forged('units', { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [DROPPED_MAX, DROPPED_MAX], units: [0] }, { from: DROPPED_MAX, to: DROPPED_MAX })
    expect(await refusal(readUnitsChunk(c.bytes, { ref: c.ref, before: readA }))).toMatchObject({ kind: 'units', path: 'dropped' })
    expect(await refusal(readUnitsChunk(c.bytes, { ref: c.ref, before: null, dropped: droppedOf([readA]) }))).toMatchObject({ kind: 'units', path: 'dropped' })
    // (a chain of chunks each within the bound but past it together is refused by unitsOfChunks as by the reader)
    const half = chunkOf(0, 100_000), more = chunkOf(100_000, 48_001)
    const readHalf = await readUnitsChunk(half.bytes, { ref: half.ref, before: null })
    expect(await refusal(readUnitsChunk(more.bytes, { ref: more.ref, before: readHalf }))).toMatchObject({ kind: 'units', path: 'dropped' })
  })

  it('reads bodies-free (M21): flags for units, and the same kinds, records, dropped and external refs', async () => {
    const same = async (written: { bytes: Uint8Array; ref: import('@/pdf-reader/engine/layer-proto/format.mjs').Ref }[]) => {
      const full: ReadUnitsChunk[] = [], lean: ReadUnitsChunkLight[] = []
      for (const c of written) {
        full.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: full.at(-1) ?? null }))
        lean.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: lean.at(-1) ?? null, bodies: false }))
      }
      const a = unitsOfChunks(full), b = unitsOfChunks(lean, { bodies: false }), c = unitsOfChunks(full, { bodies: false })
      for (const x of [b, c]) {
        expect(x.units as unknown[]).toEqual(a.units.map(u => (u === null ? null : true)))
        expect(x.kinds).toEqual(a.kinds)
        expect(x.dropped).toEqual(a.dropped)
        expect(x.index).toEqual(a.index)
        expect(x.records).toEqual(a.records)
        for (let k = 0; k < full.length; k++) expect(x.externalRefs(k), `chunk ${k}`).toEqual(a.externalRefs(k))
      }
      expect(lean.map(l => l.stands)).toEqual(full.map(f => f.stands))
      expect(lean.map(l => l.dropped)).toEqual(full.map(f => f.dropped))
      // the bodies are let go; indexOf and bodies: true refuse chunks read without them
      for (const l of lean) expect((l.units as unknown[]).every(u => u === true || u === null)).toBe(true)
      expect(() => unitsOfChunks(lean as never)).toThrow(TypeError)
      return { full, lean }
    }
    await same(M.chunks as never)
    // a unit dropped for a bad shape and a nested unit naming it: null in both
    const nest = (id: number) => [4, 'x', id, 'y']
    const mk = (kind: string, pieces: unknown[], from: number) => ({ kind, from, pieces })
    const o = (rows: { kind: string; pieces: unknown[] }[], from: number) => forged('units', { format: UNITS_FORMAT, kind: 'units', paper: PAPER, pipeline: PIPELINE_VERSION, ids: [from, from + rows.length - 1], units: rows.map(r => [r.kind, 0, null, null, null, [[0, 'a'], ...r.pieces]]) }, { from, to: from + rows.length - 1 })
    void mk
    const { full, lean } = await same([o([{ kind: 'Para', pieces: [] }, { kind: 'para', pieces: [] }], 0), o([{ kind: 'para', pieces: [nest(0)] }, { kind: 'para', pieces: [nest(1)] }], 2)])
    expect(full[1]!.units[0]).toBeNull()
    expect(lean[1]!.units as unknown[]).toEqual([null, true])
    expect(lean[1]!.dropped).toEqual([2])
    // and a chunk read bodies-free alone, with `dropped`
    const second = o([{ kind: 'para', pieces: [nest(0)] }, { kind: 'para', pieces: [nest(1)] }], 2)
    const alone = await readUnitsChunk(second.bytes, { ref: second.ref, before: null, dropped: [0], bodies: false })
    expect(alone.units as unknown[]).toEqual([null, true])
    expect(alone.part!.external).toEqual([1])
    await expect(readUnitsChunk(second.bytes, { ref: second.ref, before: null, bodies: 1 as never })).rejects.toBeInstanceOf(TypeError)
  })

  it('refuses `from` that is not the last `to` + 1 (or 0 for the first), another paper, another pipeline, units not as many as the ids', async () => {
    const [a, b] = chunksOf(['para', 'para'], [[], []])
    const f0 = forged('units', a, { from: 0, to: 0 }), f1 = forged('units', b, { from: 1, to: 1 })
    const c0 = await readUnitsChunk(f0.bytes, { ref: f0.ref, before: null })
    // (a chunk after the first, read with no `before`, is read alone, M19: its ref says where it begins; a ref that says nothing is the first's)
    expect((await readUnitsChunk(f1.bytes, { ref: f1.ref, before: null })).from).toBe(1)
    const { from: _f, to: _t, ...bare } = f1.ref
    expect(await refusal(readUnitsChunk(f1.bytes, { ref: bare, before: null }))).toMatchObject({ kind: 'units', path: 'ids[0]' })
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
describe('writeUnitChunks refuses a unit its reader would drop', () => {
  const PARA = (pieces: unknown[]): (typeof UNITS)[number] => ['para', 0, null, null, null, pieces as never]
  it('a bad kind, flags, depth, cell, edges or piece throws BundleRefusal naming the unit', async () => {
    const bad: ((u: unknown[]) => void)[] = [
      u => { u[0] = 'Para' }, u => { u[0] = 7 }, u => { u[1] = 16 }, u => { u[2] = 10 }, u => { u[3] = { table: 0, row: 0, col: 0, span: 0, head: false } },
      u => { u[4] = {} }, u => { u[4] = { lead: 1 } }, u => { u[5] = [[9, 'x']] }, u => { u[5] = [[0, 'x'.repeat(16_001)]] },
    ]
    for (const edit of bad) {
      const u = structuredClone(PARA([[0, 'a']])) as unknown[]
      edit(u)
      const e = await refusal(writeUnitChunks({ paper: PAPER, units: [PARA([[0, 'ok']]), u as never] }))
      expect(e, JSON.stringify(u)).toMatchObject({ kind: 'units', id: 1, message: expect.stringMatching(/^units: unit 1: .*does not stand/) })
    }
  })

  it('a nested piece naming an earlier unit that does not stand is refused at the first bad unit; one naming a standing unit is written', async () => {
    const e = await refusal(writeUnitChunks({ paper: PAPER, units: [['Para', 0, null, null, null, [[0, 'a']]] as never, PARA([[4, 'x', 0, 'y']])] }))
    expect(e).toMatchObject({ kind: 'units', id: 0 })
    const ok = await writeUnitChunks({ paper: PAPER, units: [PARA([[0, 'a']]), PARA([[4, 'x', 0, 'y']])] })
    expect((await readUnitsChunk(ok[0]!.bytes, { ref: ok[0]!.ref, before: null })).dropped).toEqual([])
    // a nested unit after the unit that nests it, or itself
    expect(await refusal(writeUnitChunks({ paper: PAPER, units: [PARA([[4, 'x', 1, 'y']]), PARA([[0, 'a']])] }))).toMatchObject({ id: 0 })
  })

  it('the paper\'s own units (bundleUnitsOf\'s) are all written', async () => {
    const chunks = await writeUnitChunks({ paper: PAPER, units: UNITS })
    expect(chunks).toHaveLength(1)
  })
})

describe('a units chunk\'s ref names its ids', () => {
  it('from and to of the ref are the chunk\'s ids, where the ref has them', async () => {
    const c = M.chunks[0]!
    await readUnitsChunk(c.bytes, { ref: c.ref, before: null })
    for (const wrong of [{ from: 1 }, { to: 6 }, { from: 2, to: 9 }]) {
      expect(await refusal(readUnitsChunk(c.bytes, { ref: { ...c.ref, ...wrong }, before: null })), JSON.stringify(wrong)).toMatchObject({ kind: 'units', path: 'ref' })
    }
    const { from: _f, to: _t, ...bare } = c.ref
    await readUnitsChunk(c.bytes, { ref: bare, before: null })
  })
})

describe('a paper with no units is a paper (readBundle reads one)', () => {
  it('the whole round trip: no chunks, a head, an empty index, a part and a left part for its one page, the catalog, the merge', async () => {
    const chunks = await writeUnitChunks({ paper: PAPER, units: [] })
    expect(chunks).toEqual([])
    const head = await writeHead({ paper: { ...PAPER, pages: 1 }, base: BASE, image: IMAGE, units: chunks, lineskip: null })
    const rh = await readHead(head.bytes, { ref: head.ref })
    expect(rh.units).toEqual([])
    const u = unitsOfChunks([])
    expect(u).toMatchObject({ units: [], kinds: [], dropped: [], index: [] })
    expect(u.records.kind).toHaveLength(0)
    expect([...u.records.cells, ...u.records.headings]).toEqual([])
    const index = indexOf(rh, [])
    expect(index.units).toEqual([])
    const left = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(0), spans: [], pairs: [] })
    const part = await writePart({ paper: PAPER, head: head.sha256, prev: null, pages: [1, 1], views: [0, 0, 612, 792], left: [], fileOnly: [], layout: null, rules: null, leftParts: [left] })
    const read = await readPart(part.bytes, { ref: part.ref, index, chain: null })
    expect(read).toMatchObject({ pages: [1, 1], left: [], fileOnly: [], layout: null })
    const cat = await writeCatalog({ head: rh, units: [], parts: [{ from: 1, to: 1, sha256: part.sha256, bytes: part.bytes.length }], end: { through: 1 } })
    const c = await readCatalog(cat.bytes, { key: cat.key })
    expect(c.units).toEqual([])
    expect(indexOf(rh, [], { catalog: c }).units).toEqual([])
    const merged = mergeParts(index, [read])
    expect(merged).toMatchObject({ units: [], left: { kinds: [], units: [], pages: [[0, 0, 612, 792]] }, layout: null, rules: null })
    // BUNDLE 3's reader reads the same paper
    const bundle = readBundle(writeBundle({
      paper: { ...PAPER, pages: 1 }, base: { bytes: BASE.bytes, sha256: BASE.sha256, url: `/api/v1/original/${PAPER.id}v${PAPER.version}` }, image: IMAGE, units: [],
      left: { kinds: [], pages: [[0, 0, 612, 792]], units: [] }, layout: null, rules: null,
    }))
    expect(merged.units).toEqual(bundle.units)
    expect(merged.left).toEqual(bundle.left)
  })

  it('the readers accept 0 to CHUNKS_MAX refs and refuse more', async () => {
    const head = parsed(M.head)
    head.units = []
    const f = forged('head', head)
    expect(await readHead(f.bytes, { ref: f.ref })).toMatchObject({ units: [] })
    head.units = Array.from({ length: CHUNKS_MAX + 1 }, (_, i) => ({ kind: 'units', from: i, to: i, sha256: 'a'.repeat(64), bytes: 10 }))
    const g = forged('head', head)
    expect(await refusal(readHead(g.bytes, { ref: g.ref }))).toMatchObject({ path: 'units' })
    expect(() => unitsOfChunks(Array.from({ length: CHUNKS_MAX + 1 }, () => M.readChunks[0]!))).toThrow(BundleRefusal)
  })
})

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
    const read: ReadUnitsChunk[] = []
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
    const read: ReadUnitsChunk[] = []
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

  it('refuses chunks whose bytes in all pass UNITS_TOTAL_BYTES, as the head\'s refs and the writer are', async () => {
    const [c0] = await chain()
    // 20 chunks of 2 MiB each are 40 MiB: every one valid, the count within CHUNKS_MAX, the total past the guard
    const heavy = Array.from({ length: CHUNKS_MAX }, (_, i) => ({ ...c0!, from: 2 * i, to: 2 * i + 1, bytes: UNITS_CAP, values: 10, stands: new Uint8Array(2 * i + 2).fill(1) }))
    expect(CHUNKS_MAX * UNITS_CAP).toBeGreaterThan(UNITS_TOTAL_BYTES)
    expect(() => unitsOfChunks(heavy)).toThrow(expect.objectContaining({ kind: 'units', why: 'units-too-large', data: expect.objectContaining({ what: 'bytes', bound: UNITS_TOTAL_BYTES }) }))
    // (the bound itself is read)
    expect(unitsOfChunks(heavy.slice(0, UNITS_TOTAL_BYTES / UNITS_CAP)).units).toHaveLength(2 * (UNITS_TOTAL_BYTES / UNITS_CAP))
  })

  it('refuses the guard\'s breach: more chunks than CHUNKS_MAX, and values in all past UNITS_TOTAL_VALUES', async () => {
    const [c0] = await chain()
    expect(() => unitsOfChunks(Array.from({ length: CHUNKS_MAX + 1 }, () => c0!))).toThrow(expect.objectContaining({ kind: 'index' }))
    // (chunks that claim 2 million values each: the third passes the total)
    const heavy = [0, 1, 2].map(i => ({ ...c0!, from: 2 * i, to: 2 * i + 1, values: 2_000_000, stands: new Uint8Array(2 * i + 2).fill(1) }))
    expect(() => unitsOfChunks(heavy)).toThrow(expect.objectContaining({ why: 'units-too-large', data: expect.objectContaining({ what: 'values', bound: 3_500_000 }) }))
  })
})

// ---------------------------------------------------------------- 7. head and index
describe('the head', () => {
  // biome-ignore lint/suspicious/noExplicitAny: a test breaks the head's types on purpose
  const headWith = (edit: (h: any) => void) => {
    const h = parsed(M.head)
    edit(h)
    const f = forged('head', h)
    return readHead(f.bytes, { ref: f.ref })
  }
  const bad = async (edit: (h: never) => void, path: string | RegExp) => {
    const e = await refusal(headWith(edit as never))
    expect(e, 'refused').not.toBeNull()
    expect(e!.kind).toBe('head')
    expect(e!.path).toMatch(typeof path === 'string' ? new RegExp(`^${path.replace(/[[\].]/g, '\\$&')}$`) : path)
  }

  it('refuses a base of another shape: a url (amendment M13), an xref past the bytes, a digest that is not 64 hex digits', async () => {
    await bad((h: never) => { (h as { base: object }).base = { ...(h as { base: object }).base, url: '/api/v1/original/2608.04322v1' } }, 'base.url')
    await bad((h: never) => { (h as { base: { xref: number } }).base.xref = BASE.bytes }, 'base.xref')
    await bad((h: never) => { (h as { base: { xref: number } }).base.xref = -1 }, 'base.xref')
    await bad((h: never) => { (h as { base: { sha256: string } }).base.sha256 = 'ABCDEF' }, 'base.sha256')
    await bad((h: never) => { (h as { base: { bytes: number } }).base.bytes = 0 }, 'base.bytes')
    await bad((h: never) => { (h as { base: { bytes: number } }).base.bytes = 2 ** 31 + 1 }, 'base.bytes')
    await bad((h: never) => { delete (h as { base: { xref?: number } }).base.xref }, 'base.xref')
  })

  it('refuses a paper, a version, a PDF.js and a version token that are not the reader\'s', async () => {
    await bad((h: never) => { (h as { paper: { id: string } }).paper.id = '../x' }, 'paper.id')
    await bad((h: never) => { (h as { paper: { version: number } }).paper.version = 0 }, 'paper.version')
    await bad((h: never) => { (h as { paper: { pages: number } }).paper.pages = 0 }, 'paper.pages')
    await bad((h: never) => { (h as { versions: { pdfjs: string } }).versions.pdfjs = '5.0.0' }, 'versions.pdfjs')
    for (const k of ['pipeline', 'layout', 'removal', 'image']) await bad((h: never) => { (h as { versions: Record<string, unknown> }).versions[k] = 'a b' }, `versions.${k}`)
    await bad((h: never) => { (h as { versions: Record<string, unknown> }).versions.bundle = '4' }, 'versions.bundle')
    // (the maker's versions are named, never compared: a newer remover's is read)
    expect((await headWith(h => { h.versions.removal = '99'; h.versions.layout = '7'; h.versions.pipeline = '12' })).versions).toMatchObject({ removal: '99', layout: '7', pipeline: '12' })
  })

  it('refuses units refs that are none, not contiguous from 0, past a chunk\'s bytes, or of another kind', async () => {
    await bad((h: never) => { (h as { units: { from: number }[] }).units[0]!.from = 1 }, 'units[0].from')
    await bad((h: never) => { (h as { units: { to: number }[] }).units[0]!.to = -1 }, 'units[0].to')
    await bad((h: never) => { (h as { units: { bytes: number }[] }).units[0]!.bytes = UNITS_CAP + 1 }, 'units[0].bytes')
    await bad((h: never) => { (h as { units: { kind: string }[] }).units[0]!.kind = 'part' }, 'units[0].kind')
    await bad((h: never) => { const u = (h as { units: { from: number; to: number }[] }).units; u.push({ ...u[0]!, from: 9, to: 9 }) }, 'units[1].from')
    await bad((h: never) => { (h as { units: unknown }).units = 'x' }, 'units')
  })

  it('refuses a lineskip past its bounds', async () => {
    await bad((h: never) => { (h as { lineskip: unknown }).lineskip = [1] }, 'lineskip')
    await bad((h: never) => { (h as { lineskip: unknown }).lineskip = [1, 20000] }, 'lineskip[1]')
    expect((await headWith(h => { h.lineskip = null })).lineskip).toBeNull()
  })

  it('says whether the parts may carry draws: `draw` 1 last in the head, omitted when none (so a head without them keeps its bytes), part of the chain', async () => {
    const w = (draw?: boolean) => writeHead({ paper: { ...PAPER, pages: N }, base: BASE, image: IMAGE, units: M.chunks, lineskip: [1, 0], ...(draw === undefined ? {} : { draw }) })
    const none = await w(), off = await w(false), on = await w(true)
    expect(Object.keys(parsed(none))).toEqual(['bundle', 'kind', 'paper', 'base', 'versions', 'units', 'lineskip'])
    expect(off.sha256).toBe(none.sha256)
    expect(none.sha256).toBe(M.head.sha256)
    expect(Object.keys(parsed(on)).at(-1)).toBe('draw')
    expect(parsed(on).draw).toBe(1)
    expect(on.sha256).not.toBe(none.sha256)
    expect(M.readHead.draw).toBe(0)
    expect((await readHead(on.bytes, { ref: on.ref })).draw).toBe(1)
    expect(indexOf(await readHead(on.bytes, { ref: on.ref }), M.readChunks).head.draw).toBe(1)
    // (an explicit 0 is read too, never written)
    expect((await headWith(h => { h.draw = 0 })).draw).toBe(0)
    // (a part of the other head is refused by the chain as ever: the draw changes the head's digest)
    const other = await readHead(on.bytes, { ref: on.ref })
    await expect(readPart(M.parts[0]!.bytes, { ref: M.parts[0]!.ref, index: indexOf(other, M.readChunks), chain: null })).rejects.toBeInstanceOf(BundleRefusal)
  })

  it('refuses a draw that is not 0 or 1', async () => {
    for (const v of [2, -1, 0.5, true, false, '1', null, [], {}]) await bad((h: never) => { (h as { draw: unknown }).draw = v }, 'draw')
    // (and any other key besides it)
    await bad((h: never) => { (h as { draw: unknown; drawn: unknown }).draw = 1; (h as { drawn: unknown }).drawn = 1 }, 'drawn')
  })

  it('has no `cites` (amendment M23): a head with the key is refused as no key of the schema, and the reading holds none', async () => {
    await bad((h: never) => { (h as { cites: unknown }).cites = null }, 'cites')
    await bad((h: never) => { (h as { cites: unknown }).cites = [['k', 'l']] }, 'cites')
    const e = await refusal(headWith((h: { cites?: unknown }) => { h.cites = null }))
    expect(e?.message).toMatch(/not a key of the schema/)
    expect(await headWith(() => {})).not.toHaveProperty('cites')
  })

  it('writes what it reads: its refusals are the writer\'s too', async () => {
    const w = (o: Partial<Parameters<typeof writeHead>[0]>) => writeHead({ paper: { ...PAPER, pages: N }, base: BASE, image: IMAGE, units: M.chunks, lineskip: [1, 0], ...o })
    expect(await refusal(w({ base: { ...BASE, xref: BASE.bytes } }))).toMatchObject({ kind: 'head', path: 'base.xref' })
    expect(await refusal(w({ lineskip: [1, 30000] }))).toMatchObject({ path: 'lineskip[1]' })
    expect(await refusal(w({ image: 'a b' }))).toMatchObject({ path: 'versions.image' })
  })
})

describe('the index', () => {
  /** a paper of two chunks, written and read as the service does */
  async function twoChunks(tweak: (units: (typeof UNITS)[number][]) => void = () => {}) {
    const units: (typeof UNITS)[number][] = Array.from({ length: 2600 }, (_, i) => ['para', 0, null, null, null, [[0, `${'x'.repeat(995)}${i % 10}`]]])
    tweak(units)
    const chunks = await writeUnitChunks({ paper: PAPER, units })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const head = await writeHead({ paper: { ...PAPER, pages: N }, base: BASE, image: IMAGE, units: chunks, lineskip: null })
    const rh = await readHead(head.bytes, { ref: head.ref })
    const read: ReadUnitsChunk[] = []
    for (const c of chunks) read.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: read.at(-1) ?? null }))
    return { chunks, head, rh, read }
  }

  it('binds the head and its chunks: their number, ranges, digests and bytes the head\'s, in order', async () => {
    const t = await twoChunks()
    expect(indexOf(t.rh, t.read).units).toHaveLength(2600)
    expect(() => indexOf(t.rh, [...t.read].reverse())).toThrow(expect.objectContaining({ kind: 'index', path: 'units[0]' }))
    expect(() => indexOf(t.rh, t.read.slice(0, 1))).toThrow(expect.objectContaining({ kind: 'index', path: 'units' }))
    expect(() => indexOf(t.rh, [...t.read, t.read[0]!])).toThrow(expect.objectContaining({ path: 'units' }))
    // a chunk of the same ids and other bytes: not the one the head names
    const other = await twoChunks(units => { units[10] = ['para', 0, null, null, null, [[0, `${'y'.repeat(995)}0`]]] })
    expect(other.chunks[0]!.to).toBe(t.chunks[0]!.to)
    expect(() => indexOf(t.rh, [other.read[0]!, t.read[1]!])).toThrow(expect.objectContaining({ path: 'units[0]', message: expect.stringMatching(/digest or bytes/) }))
    // a range that is not the head's
    expect(() => indexOf(t.rh, [{ ...t.read[0]!, to: t.read[0]!.to - 1 }, t.read[1]!])).toThrow(expect.objectContaining({ path: 'units[0]' }))
  })

  it('binds the paper and the pipeline, and the chain: chunks not read one after the other', async () => {
    const t = await twoChunks()
    expect(() => indexOf(t.rh, [{ ...t.read[0]!, pipeline: '99' }, t.read[1]!])).toThrow(expect.objectContaining({ message: expect.stringMatching(/pipeline/) }))
    expect(() => indexOf(t.rh, [{ ...t.read[0]!, paper: { id: PAPER.id, version: 9 } }, t.read[1]!])).toThrow(expect.objectContaining({ message: expect.stringMatching(/paper/) }))
    // a second chunk read with no chunk before it (its `stands` a fresh record): not the chain
    const f = { bytes: t.chunks[1]!.bytes, ref: t.chunks[1]!.ref }
    const alone = await readUnitsChunk(f.bytes, { ref: f.ref, before: { ...t.read[0]!, stands: new Uint8Array(t.read[0]!.to + 1) } })
    expect(() => indexOf(t.rh, [t.read[0]!, alone])).toThrow(expect.objectContaining({ kind: 'index', message: expect.stringMatching(/after the chunk before/) }))
  })

  it('binds a catalog: its head, units, paper and versions the head\'s', async () => {
    const t = await twoChunks()
    const units = t.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length }))
    const cat = await readCatalog((await writeCatalog({ head: t.rh, units, parts: [], end: { through: 0, refused: 'bound' } })).bytes)
    expect(indexOf(t.rh, t.read, { catalog: cat }).units).toHaveLength(2600)
    const otherHead = await writeHead({ paper: { ...PAPER, pages: N }, base: BASE, image: IMAGE, units: t.chunks, lineskip: [1, 0] })
    const rh2 = await readHead(otherHead.bytes, { ref: otherHead.ref })
    expect(rh2.sha256).not.toBe(t.rh.sha256)
    expect(() => indexOf(rh2, t.read, { catalog: cat })).toThrow(expect.objectContaining({ kind: 'index', path: 'catalog.head' }))
    // the same head, a catalog of other versions or another chunk
    expect(() => indexOf(t.rh, t.read, { catalog: { ...cat, versions: { ...cat.versions, image: '9' } } })).toThrow(expect.objectContaining({ path: 'catalog.versions.image' }))
    expect(() => indexOf(t.rh, t.read, { catalog: { ...cat, paper: { ...cat.paper, pages: N + 1 } } })).toThrow(expect.objectContaining({ path: 'catalog.paper' }))
    expect(() => indexOf(t.rh, t.read, { catalog: { ...cat, units: [{ ...cat.units[0]!, bytes: 1 }, cat.units[1]!] } })).toThrow(expect.objectContaining({ path: 'catalog.units[0]' }))
  })
})

// ---------------------------------------------------------------- 8. parts, against the index
describe('a part against the index', () => {
  const refused = async (i: number, edit: (p: never) => void, path: string | RegExp, chain?: PartChain | null) => {
    const e = await refusal(partWith(i, edit as never, chain === undefined ? {} : { chain }))
    expect(e, 'refused').not.toBeNull()
    expect(e!.kind).toBe('part')
    expect(e!.path).toMatch(typeof path === 'string' ? new RegExp(`^${path.replace(/[[\].]/g, '\\$&')}$`) : path)
  }
  type P = Record<string, unknown[] & { [k: number]: never }>

  it('refuses a part of another head', async () => {
    await refused(0, p => { (p as unknown as { head: string }).head = '0'.repeat(64) }, 'head')
    await refused(0, p => { (p as unknown as { head: string }).head = 'XYZ' }, 'head')
    // (the head of the index and the chain's agree: a chain of another head is the caller's)
    const other = { ...M.readParts[0]!.chain, head: '1'.repeat(64) }
    await refused(1, () => {}, 'head', other)
  })

  it('refuses an id past the units, in the left, the file-only and the layout', async () => {
    await refused(0, p => { (p as unknown as P).left![1]![0] = 99 as never }, 'left[1][0]')
    await refused(1, p => { (p as unknown as P).fileOnly![0]![0] = 99 as never }, 'fileOnly[0][0]')
    await refused(1, p => { const l = (p as unknown as { layout: { units: number[][]; lines: number[][]; frames: number[][] } }).layout; l.units[1]![0] = 99; l.lines[1]![0] = 99; l.frames[1]![0] = 99 }, 'layout.units[1][0]')
  })

  it('reads why each unit a part tells is not laid against the paper and the part\'s left: past the units, or no left unit of the part, refused', async () => {
    type L = { left: number[][]; layout: { units: number[][]; unlaid?: [number, string][] } }
    // (a left unit of the part the file does not lay, its rows taken out of the layout: taken, its code as it stands)
    const p0 = parsed(M.parts[0] as { bytes: Uint8Array }) as unknown as L
    const laid = new Set(p0.layout.units.map(u => u[0])), free = p0.left.map(w => w[0]!).find(id => laid.has(id))
    expect(free, 'a left unit of part 0').toBeDefined()
    const unlay = (p: L) => {
      const l = p.layout as unknown as Record<string, unknown[][]>
      for (const k of ['units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held', 'colours']) if (l[k]) l[k] = l[k]!.filter(r => r[0] !== free)
      l.names = (l.names ?? []).filter(r => r[11] !== free)
      if (!l.colours?.length) delete l.colours
    }
    await expect(partWith(0, (p: L) => { unlay(p); p.layout.unlaid = [[free!, 'noLine']] })).resolves.toMatchObject({ layout: { unlaid: [[free, 'noLine']] } })
    await refused(0, (p: L) => { p.layout.unlaid = [[99, 'noAnchor']] }, 'layout.unlaid[0][0]')
    // (a unit of the paper that another part tells)
    const p1 = parsed(M.parts[1] as { bytes: Uint8Array }) as unknown as L
    const elsewhere = p1.left.map(w => w[0]!).find(id => !p0.left.some(w => w[0] === id))
    expect(elsewhere, 'a unit part 0 does not tell').toBeDefined()
    await refused(0, (p: L) => { p.layout.unlaid = [[elsewhere!, 'noAnchor']] }, 'layout.unlaid[0][0]')
  })

  it('refuses a layout unit of another kind or another piece count than its unit\'s, where the unit stands', async () => {
    await refused(0, p => { (p as unknown as { layout: { units: number[][] } }).layout.units[1]![1] = 2 }, 'layout.units[1][1]')
    await refused(0, p => { (p as unknown as { layout: { units: number[][] } }).layout.units[1]![4] = 8 }, 'layout.units[1][4]')
    // a unit that does not stand is not compared
    const o = parsed(M.chunks[0]!)
    o.units[2][0] = 'Para'
    const f = forged('units', o)
    const dropped = await readUnitsChunk(f.bytes, { ref: f.ref, before: null })
    const head = parsed(M.head)
    head.units = [{ ...head.units[0], sha256: f.ref.sha256, bytes: f.ref.bytes }]
    const g = forged('head', head)
    const index = indexOf(await readHead(g.bytes, { ref: g.ref }), [dropped])
    expect(index.dropped).toEqual([2])
    const part = parsed(M.parts[0]!)
    part.head = index.sha256
    part.layout.units[1][1] = 2
    const h = forged('part', part, { from: 1, to: 1 })
    expect((await readPart(h.bytes, { ref: h.ref, index, chain: null })).left.map(w => w[0])).toEqual([0, 2])
  })

  it('reads against a light index (M24) as against the full one: the same parts, the same refusals', async () => {
    const light: ReadUnitsChunkLight[] = []
    for (const c of M.chunks) light.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: light.at(-1) ?? null, bodies: false }))
    const lean = indexOf(M.readHead, light)
    expect(lean.light).toBe(true)
    expect(lean).toMatchObject({ kind: 'index', sha256: M.index.sha256, dropped: M.index.dropped, kinds: M.index.kinds })
    expect(lean.records).toEqual(M.index.records)
    expect(lean.units).toEqual(M.index.units.map(u => (u === null ? null : true)))
    for (const [i, u] of M.index.units.entries()) expect(lean.pieces[i], `unit ${i}`).toBe(u === null ? 0 : u[5].length)
    // every part of the paper, read in order against each index
    let a = null, b = null
    for (const w of M.parts) {
      const x = await readPart(w.bytes, { ref: w.ref, index: M.index, chain: a }), y = await readPart(w.bytes, { ref: w.ref, index: lean, chain: b })
      expect(y).toEqual(x)
      a = x.chain
      b = y.chain
    }
    // and refused alike: a layout unit of another kind or piece count, a unit past the paper's, another head
    const same = async (i: number, edit: (p: never) => void) => {
      const p = parsed(M.parts[i] as { bytes: Uint8Array })
      edit(p as never)
      const f = forged('part', p, { from: p.pages[0], to: p.pages[1] })
      const chain = i === 0 ? null : M.readParts[i - 1]!.chain
      const x = await refusal(readPart(f.bytes, { ref: f.ref, index: M.index, chain })), y = await refusal(readPart(f.bytes, { ref: f.ref, index: lean, chain }))
      expect(x).not.toBeNull()
      expect([y?.kind, y?.path, y?.message]).toEqual([x?.kind, x?.path, x?.message])
    }
    await same(0, p => { (p as { layout: { units: number[][] } }).layout.units[1]![1] = 2 })
    await same(0, p => { (p as { layout: { units: number[][] } }).layout.units[1]![4] = 8 })
    await same(0, p => { (p as { left: unknown[][] }).left[0]![0] = 99 })
    await same(0, p => { (p as { head: string }).head = 'f'.repeat(64) })
    // a unit that does not stand is not compared, in the light index too
    const o = parsed(M.chunks[0]!)
    o.units[2][0] = 'Para'
    const f = forged('units', o)
    const dropped = await readUnitsChunk(f.bytes, { ref: f.ref, before: null, bodies: false })
    expect(dropped.pieces[2]).toBe(0)
    const head = parsed(M.head)
    head.units = [{ ...head.units[0], sha256: f.ref.sha256, bytes: f.ref.bytes }]
    const g = forged('head', head)
    const index = indexOf(await readHead(g.bytes, { ref: g.ref }), [dropped])
    const part = parsed(M.parts[0]!)
    part.head = index.sha256
    part.layout.units[1][1] = 2
    const h = forged('part', part, { from: 1, to: 1 })
    expect((await readPart(h.bytes, { ref: h.ref, index, chain: null })).left.map(w => w[0])).toEqual([0, 2])
  })

  it('has a light index refused by what needs the bodies: mergeParts', async () => {
    const light: ReadUnitsChunkLight[] = []
    for (const c of M.chunks) light.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: light.at(-1) ?? null, bodies: false }))
    expect(() => mergeParts(indexOf(M.readHead, light) as never, M.readParts)).toThrow(TypeError)
    // chunks of the two kinds in one index are no index
    const full = await readUnitsChunk(M.chunks[0]!.bytes, { ref: M.chunks[0]!.ref, before: null })
    expect(() => indexOf(M.readHead, [full, ...light.slice(1)] as never)).not.toThrow()
  })

  it('needs an index: units to place the part\'s ids against', async () => {
    const p = M.parts[0]!
    await expect(readPart(p.bytes, { ref: p.ref, index: undefined as never, chain: null })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------- a part's record of why it has no layout (BUNDLE 6)
describe('a part with no layout says why (`layout: { refused, why }`, LAYOUT_REFUSED)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: a test sets the part's wire as it likes
  const none = (r: unknown) => (p: any) => { p.layout = r; p.fileOnly = []; p.rules = null }
  it('is read as a part with no layout (`layout: null`, as a reader that tests it takes it), the record beside it', async () => {
    for (const refused of LAYOUT_REFUSED) {
      const r = await partWith(0, none({ refused, why: 'the reason' }))
      expect(r.layout).toBeNull()
      expect(r.rules).toBeNull()
      expect(r.noLayout).toEqual({ refused, why: 'the reason' })
    }
    // (no reason recorded: null, as a part of 5's shape and cutBundle with none given write it)
    expect((await partWith(0, none(null))).noLayout).toBeNull()
    expect(M.readParts.map(p => p.noLayout)).toEqual([null, null, null])
    // (the chain after it is as after the same part with no layout and no reason, but for the part's own digest)
    const chainOf = async (r: unknown) => ({ ...(await partWith(0, none(r))).chain, last: null })
    expect(await chainOf({ refused: 'carry', why: 'x' })).toEqual(await chainOf(null))
  })

  it('refuses a word not LAYOUT_REFUSED\'s, a why past WHY_MAX or not a string, another key, and a record beside file-only units or cell rules', async () => {
    expect(LAYOUT_REFUSED).toEqual(['compile', 'carry', 'engine', 'texlive', 'marks', 'final', 'boxes', 'wrap'])
    const refused = async (edit: (p: never) => void, path: string) => {
      const e = await refusal(partWith(0, edit as never))
      expect(e?.kind, path).toBe('part')
      expect(e?.path, path).toBe(path)
    }
    await refused(none({ refused: 'probe', why: '' }), 'layout.refused')
    await refused(none({ refused: 7, why: '' }), 'layout.refused')
    await refused(none({ refused: 'compile', why: 'x'.repeat(WHY_MAX + 1) }), 'layout.why')
    await refused(none({ refused: 'compile', why: null }), 'layout.why')
    await refused(none({ refused: 'compile' }), 'layout.why')
    await refused(none({ refused: 'compile', why: '', more: 1 }), 'layout.more')
    // biome-ignore lint/suspicious/noExplicitAny: as above
    await refused((p: any) => { none({ refused: 'marks', why: '' })(p); p.fileOnly = [[5, 41]] }, 'fileOnly')
    // biome-ignore lint/suspicious/noExplicitAny: as above
    await refused((p: any) => { none({ refused: 'marks', why: '' })(p); p.rules = { 1: [72, 500, 540, 500.4] } }, 'rules')
    expect((await refusal(partWith(0, none({ refused: 'compile', why: 'x'.repeat(WHY_MAX) }))))).toBeNull()
  })

  it('is written as given, and a writer given what its reader refuses throws', async () => {
    const input = partInputs(M.head.sha256, M.lefts as never)[0]!
    const w = await writePart({ ...input, fileOnly: [], layout: { refused: 'texlive', why: 'the paper declares TeX Live 2023' } as never, rules: null })
    expect(parsed(w).layout).toEqual({ refused: 'texlive', why: 'the paper declares TeX Live 2023' })
    expect((await readPart(w.bytes, { ref: w.ref, index: M.index, chain: null })).noLayout).toEqual({ refused: 'texlive', why: 'the paper declares TeX Live 2023' })
    await expect(writePart({ ...input, fileOnly: [], layout: { refused: 'nope', why: '' } as never, rules: null })).rejects.toBeInstanceOf(BundleRefusal)
  })
})

// ---------------------------------------------------------------- 9. parts, against the chain
describe('a part against the chain', () => {
  const refused = async (i: number, edit: (p: never) => void, path: string | RegExp, chain?: PartChain | null) => {
    const e = await refusal(partWith(i, edit as never, chain === undefined ? {} : { chain }))
    expect(e, 'refused').not.toBeNull()
    expect(e!.kind).toBe('part')
    expect(e!.path).toMatch(typeof path === 'string' ? new RegExp(`^${path.replace(/[[\].]/g, '\\$&')}$`) : path)
  }
  // biome-ignore lint/suspicious/noExplicitAny: a test breaks the part's types on purpose
  type Any = any
  const chain = (i: number) => M.readParts[i]!.chain

  it('reads each part after the one before, and the same part again is no part after it', async () => {
    expect(await partWith(1, () => {})).toMatchObject({ pages: [2, 3] })
    // a gap: the third after the first; an overlap: the second after the second
    await refused(2, () => {}, 'pages[0]', chain(0))
    await refused(1, () => {}, 'pages[0]', chain(1))
    // the first part after one: it begins at page 1
    await refused(0, () => {}, 'pages[0]', chain(0))
  })

  it('refuses a `prev` that is not the last part\'s digest, and a first part with one', async () => {
    await refused(1, p => { (p as Any).prev = '0'.repeat(64) }, 'prev')
    await refused(1, p => { (p as Any).prev = null }, 'prev')
    await refused(0, p => { (p as Any).prev = M.parts[0]!.sha256 }, 'prev')
  })

  it('refuses a unit that is not after the last K entry told: before it, at it, or twice', async () => {
    // unit 3's stream before the last told (12)
    await refused(1, p => { (p as Any).left[0][1] = 5 }, 'left')
    // a stream equal to the last told's (12, unit 2) with a smaller id than it is before it; one above it is after
    await refused(1, p => { (p as Any).left[0][0] = 1; (p as Any).left[0][1] = 12; (p as Any).layout.units[0][0] = 1; (p as Any).layout.lines[0][0] = 1; (p as Any).layout.frames[0][0] = 1 }, /^layout\.units\[0\]\[1\]$|^left$/)
    expect(await partWith(1, p => { (p as Any).left[0][1] = 12 })).toMatchObject({ pages: [2, 3] })
    // a file-only unit's slot is after + 0.5: after = 12 is slot 12.5, after the (12, 2) told
    expect(await partWith(1, p => { (p as Any).left[0][1] = 13; (p as Any).fileOnly[0][1] = 12 })).toMatchObject({ pages: [2, 3] })
    await refused(1, p => { (p as Any).fileOnly[0][1] = 11 }, 'left')
  })

  it('refuses a unit told twice: below the frontier, and past it (the chain keeps the ids told)', async () => {
    const p = parsed(M.parts[2]!)
    p.pages = [2, 2]
    p.prev = M.parts[0]!.sha256
    p.views = VIEWS.slice(1, 4).flat()
    p.leftParts = [M.lefts[2]!.ref]
    // unit 0 again at its stream, below the frontier (12, 2)
    p.left = [[0, 0, [[2, 72, 600, 200, 610]]]]
    const f = forged('part', p, { from: 2, to: 2 })
    expect(await refusal(readPart(f.bytes, { ref: f.ref, index: M.index, chain: chain(0) }))).toMatchObject({ kind: 'part', path: 'left[0][0]' })
    // unit 0 again at a stream past the frontier: the frontier does not see it, the ids told do
    p.left = [[0, 30, [[2, 72, 600, 200, 610]]]]
    const again = forged('part', p, { from: 2, to: 2 })
    expect(await refusal(readPart(again.bytes, { ref: again.ref, index: M.index, chain: chain(0) }))).toMatchObject({ kind: 'part', path: 'left[0][0]' })
    // unit 1, which no part told, at the same stream: the same part reads
    p.left = [[1, 30, [[2, 72, 600, 200, 610]]]]
    const g = forged('part', p, { from: 2, to: 2 })
    expect((await readPart(g.bytes, { ref: g.ref, index: M.index, chain: chain(0) })).left).toHaveLength(1)
  })

  it('refuses a unit told in an earlier part again as a left unit or a file-only one, whatever the slot', async () => {
    // part 2 with unit 0 (told by part 1) added to its left at stream 30: past the frontier
    await refused(1, p => { (p as Any).left.unshift([0, 30, [[2, 72, 600, 200, 610]]]) }, 'left[0][0]')
    // and as a file-only unit, with a layout of its own (after 40: slot 40.5)
    await refused(1, p => {
      const l = (p as Any).layout
      l.units.unshift([0, 1, 9, 1, 1])
      l.lines.unshift([0, [2, 150, 460, 700, 712, 696, 17.28, 0]])
      l.frames.unshift([0, [2, 0, 0, 1, -1, 30]])
      ;(p as Any).fileOnly.unshift([0, 40])
    }, 'fileOnly[0][0]')
    // unit 2, told by part 1 and the frontier's own: its slot is the frontier's, not past it
    await refused(1, p => { (p as Any).left.unshift([2, 13, [[2, 72, 600, 200, 610]]]) }, 'left[0][0]')
    // the parts' ids told accumulate: part 3 cannot tell what part 2 told
    await refused(2, p => { (p as Any).left.unshift([3, 80, [[4, 72, 600, 200, 610]]]) }, 'left[0][0]')
    expect(chain(1).told.slice(0, 8)).toEqual(Uint8Array.of(1, 0, 1, 1, 1, 1, 0, 0))
    expect(chain(0).told.length).toBe(UNITS.length)
  })

  it('refuses a unit in the left and the file-only both, a file-only unit not in the layout, a layout unit in neither', async () => {
    await refused(1, p => { (p as Any).fileOnly = [[3, 41]] }, 'fileOnly[0][0]')
    await refused(1, p => { (p as Any).fileOnly[0][0] = 6 }, /^layout\.units\[1\]\[0\]$|^fileOnly\[0\]\[0\]$/)
    await refused(1, p => { (p as Any).fileOnly = [] }, /^layout\.units\[1\]\[0\]$/)
    await refused(1, p => { (p as Any).left = [] }, /^layout\.units\[0\]\[0\]$/)
    await refused(2, p => { (p as Any).fileOnly = [[5, 41]] }, 'fileOnly')
  })

  it('refuses a unit for a page already told: a rectangle or a layout row on a page before the part\'s first', async () => {
    await refused(1, p => { (p as Any).left[0][2][0][0] = 1 }, 'left[0][2][0][0]')
    await refused(1, p => { (p as Any).layout.lines[0][1][0] = 1 }, 'layout.lines[0][1][0]')
    await refused(2, p => { (p as Any).left[0][2][0][0] = 3 }, 'left[0][2][0][0]')
  })

  it('refuses the view of a page the last part told, changed; a part that reaches less than the last did', async () => {
    await refused(1, p => { (p as Any).views[2] = 701 }, 'views[2]', chain(0))
    await refused(1, p => { (p as Any).views[0] = 1 }, 'views[0]')
    // part 3 begins at page 4, which part 2 reached: its view as told
    await refused(2, p => { (p as Any).views[2] = 611 }, 'views[2]')
    // a part whose own units reach less far than the last part's did (the chain says page 4 was reached; this one stops at page 3)
    // leaves the views it does not hold to the part that told them: those it holds are as told, and the reach stays page 4
    const reached = { ...chain(0), reach: 4, ahead: [...VIEWS.slice(1).flat()] }
    const short = await partWith(1, p => { (p as Any).views = (p as Any).views.slice(0, 8) }, { chain: reached })
    expect([short.reach, short.chain.reach, short.chain.ahead]).toEqual([3, 4, VIEWS[3]])
    await refused(1, p => { (p as Any).views = (p as Any).views.slice(0, 8); (p as Any).views[6] = 600 }, 'views[6]', reached)
  })

  it('refuses cell rules where the layout is null, on a page outside the part\'s own, or that are no boxes within the page\'s view', async () => {
    await refused(2, p => { (p as Any).rules = { 4: [72, 500, 540, 500.4] } }, 'rules')
    await refused(1, p => { (p as Any).rules = { 4: [72, 500, 540, 500.4] } }, 'rules.4')
    await refused(1, p => { (p as Any).rules = { 1: [72, 500, 540, 500.4] } }, 'rules.1')
    await refused(1, p => { (p as Any).rules = { x: [72, 500, 540, 500.4] } }, 'rules.x')
    await refused(1, p => { (p as Any).rules = {} }, 'rules')
    await refused(1, p => { (p as Any).rules = [] }, 'rules')
    await refused(1, p => { (p as Any).rules = { 2: [] } }, 'rules.2')
    await refused(1, p => { (p as Any).rules = { 2: [72, 500, 540] } }, 'rules.2')
    await refused(1, p => { (p as Any).rules = { 2: [72, 500, 72, 500.4] } }, 'rules.2[2]')
    // (page 2's view is 700 wide: a box past it by more than the slack is no rule of the page)
    await refused(1, p => { (p as Any).rules = { 2: [72, 500, 702, 500.4] } }, 'rules.2[2]')
    expect(await partWith(1, p => { (p as Any).rules = { 2: [72, 500, 700, 500.4], 3: [72, 300, 200, 300.3] } })).toMatchObject({ rules: { 2: [72, 500, 700, 500.4], 3: [72, 300, 200, 300.3] } })
  })

  it('refuses figure rows (BUNDLE 10, the content class `figures`; their set and room since 11) of no shape, on a page outside the part\'s own, of a unit not a figure\'s, or where the layout is none', async () => {
    // (a row: [id, group, page, x, y, ux, uy, length, size, ascent, descent, anchor, fill, font, set, before, after])
    const row = (o: Record<number, unknown> = {}) => Object.assign([1, 0, 2, 100, 400, 1, 0, 60, 8, 0.88, -0.2, 1, 0, 'ArialMT', 0, 4, 12.5], o)
    await refused(1, p => { (p as Any).figures = [row()] }, 'figures[0][0]')
    await refused(1, p => { (p as Any).figures = [row({ 0: 99_999 })] }, 'figures[0][0]')
    await refused(1, p => { (p as Any).figures = [row({ 0: 0 })] }, 'figures[0][0]')
    await refused(1, p => { (p as Any).figures = [row({ 2: 4 })] }, 'figures[0][2]')
    await refused(1, p => { (p as Any).figures = [row({ 3: 9_999 })] }, 'figures[0][3]')
    await refused(1, p => { (p as Any).figures = [row({ 5: 0.5 })] }, 'figures[0][5]')
    await refused(1, p => { (p as Any).figures = [row({ 11: 3 })] }, 'figures[0][11]')
    await refused(1, p => { (p as Any).figures = [row().slice(1)] }, 'figures[0]')
    // (a row of 10's, no set and no room, is no row of 11's)
    await refused(1, p => { (p as Any).figures = [row().slice(0, 14)] }, 'figures[0]')
    // (its set a group's number at most its own; its room 0 or more)
    await refused(1, p => { (p as Any).figures = [row({ 1: 3, 14: 4 })] }, 'figures[0][14]')
    await refused(1, p => { (p as Any).figures = [row({ 14: -1 })] }, 'figures[0][14]')
    await refused(1, p => { (p as Any).figures = [row({ 15: -0.5 })] }, 'figures[0][15]')
    await refused(1, p => { (p as Any).figures = [row({ 16: Number.NaN })] }, 'figures[0][16]')
    await refused(1, p => { (p as Any).figures = {} }, 'figures')
    // (the key there only where the part has a figure unit: a part of none is written as one before figures)
    await refused(1, p => { (p as Any).figures = [] }, 'figures')
    await refused(2, p => { (p as Any).layout = null; (p as Any).rules = null; (p as Any).fileOnly = []; (p as Any).figures = [row({ 2: 4 })] }, 'figures')
    expect(await partWith(1, p => { delete (p as Any).figures })).toMatchObject({ figures: [] })
    // (a figure unit is never a layout row of its part: its figure row alone draws it; a left unit it may be, its hover's anchor,
    // pipeline/ink-pass.mjs figureAnchors)
    const e = await refusal(partWith(1, p => { (p as Any).figures = [row({ 0: (p as Any).layout.units[0][0] })] }))
    expect(e).toMatchObject({ kind: 'part', path: 'figures[0][0]' })
    expect(String(e?.message)).toMatch(/a unit of the layout too/)
  })

  it('a layout with no cell rules is a part (`rules: null`), as the writer writes one given none or an empty table', async () => {
    const bare = await partWith(1, p => { (p as Any).rules = null })
    expect([bare.layout !== null, bare.rules]).toEqual([true, null])
    for (const rules of [null, {}]) {
      const w = await writePart({ ...partInputs(M.head.sha256, M.lefts)[1]!, prev: M.parts[0]!.sha256, rules })
      expect(parsed(w).rules).toBeNull()
    }
  })

  it('refuses left parts that are not one for each page of the part, in page order, of a left kind', async () => {
    await refused(1, p => { (p as Any).leftParts.pop() }, 'leftParts')
    await refused(1, p => { (p as Any).leftParts.reverse() }, 'leftParts[0].page')
    await refused(1, p => { (p as Any).leftParts[0].kind = 'part' }, 'leftParts[0].kind')
    await refused(1, p => { (p as Any).leftParts[0].bytes = 0 }, 'leftParts[0].bytes')
    await refused(1, p => { (p as Any).leftParts[0].sha256 = 'x' }, 'leftParts[0].sha256')
  })

  it('refuses pages and views of another shape', async () => {
    await refused(1, p => { (p as Any).pages = [2] }, 'pages')
    await refused(1, p => { (p as Any).pages = [2, 5] }, 'pages[1]')
    await refused(1, p => { (p as Any).pages = [0, 3] }, 'pages[0]')
    await refused(1, p => { (p as Any).views = [] }, 'views')
    await refused(1, p => { (p as Any).views = [...(p as Any).views, 0, 0, 612, 792] }, 'views')
    await refused(1, p => { (p as Any).views[2] = 0 }, 'views[2]')
    await refused(1, p => { (p as Any).views[0] = 20000 }, 'views[0]')
  })

  it('refuses a left of another shape: its rectangles within the page\'s view, not empty, a stream and ids rising', async () => {
    await refused(1, p => { (p as Any).left[0][2][0][1] = 702 }, 'left[0][2][0][1]')
    await refused(1, p => { (p as Any).left[0][2][0][1] = 700 }, 'left[0][2][0][3]')
    await refused(1, p => { (p as Any).left[0][2][0] = [2, 200, 498, 72, 508] }, 'left[0][2][0][3]')
    await refused(1, p => { (p as Any).left[0][2] = [] }, 'left[0][2]')
    await refused(1, p => { (p as Any).left[0][1] = -1 }, 'left[0][1]')
    await refused(1, p => { (p as Any).left[1][0] = 3 }, 'left[1][0]')
    await refused(1, p => { (p as Any).left[0] = [3, 25] }, 'left[0]')
    await refused(1, p => { (p as Any).left[0][2][0][4] = 802 }, 'left[0][2][0][4]')
    // (a rectangle lies within its page's view, the part's, by a point)
    expect(await refusal(partWith(1, p => { (p as Any).left[0][2][0][1] = -1; (p as Any).left[0][2][0][3] = 701 }))).toBeNull()
  })

  it('a refused part changes nothing: the chain is the same one for the next', async () => {
    const before = JSON.stringify(chain(0))
    await refusal(partWith(1, p => { (p as Any).prev = null }))
    expect(JSON.stringify(chain(0))).toBe(before)
    expect(await partWith(1, () => {})).toMatchObject({ pages: [2, 3] })
  })
})

// ---------------------------------------------------------------- 12. left parts
describe('a left part', () => {
  const streamOf = (id: number) => STREAM.get(id)
  // biome-ignore lint/suspicious/noExplicitAny: a test breaks the left part's types on purpose
  type Any = any
  const readWith = (page: number, edit: (l: Any) => void, o: { ref?: object; streamOf?: (id: number) => number | undefined } = {}) => {
    const l = parsed(M.lefts[page]!)
    edit(l)
    const f = forged('left', l, { page })
    return readLeftPart(f.bytes, { ref: { ...f.ref, page, ...o.ref } as never, streamOf: o.streamOf ?? streamOf })
  }
  const refused = async (page: number, edit: (l: Any) => void, path: string | RegExp, o?: Parameters<typeof readWith>[2]) => {
    const e = await refusal(readWith(page, edit, o))
    expect(e, 'refused').not.toBeNull()
    expect(e!.kind).toBe('left')
    expect(e!.path).toMatch(typeof path === 'string' ? new RegExp(`^${path.replace(/[[\].]/g, '\\$&')}$`) : path)
  }

  it('refuses the tokens\' wire out of bounds: n past TOKENS_PAGE, fields of another length, no whole numbers, a decode past ±TOKEN_LIMIT', async () => {
    await refused(1, l => { l.tokens.perPage = [TOKENS_PAGE + 1] }, 'tokens.perPage[0]')
    await refused(1, l => { l.tokens.perPage = [1, 2] }, 'tokens.perPage')
    await refused(1, l => { l.tokens.perPage = 20 }, 'tokens.perPage')
    await refused(1, l => { l.tokens.l.pop() }, 'tokens.l')
    await refused(1, l => { delete l.tokens.top }, 'tokens.top')
    await refused(1, l => { l.tokens.extra = [] }, 'tokens.extra')
    await refused(1, l => { l.tokens.r[3] = 1.5 }, 'tokens.r[3]')
    await refused(1, l => { l.tokens.y[3] = '5' }, 'tokens.y[3]')
    await refused(1, l => { l.tokens.h[0] = 100_000 * 1000 + 1 }, 'tokens.h[0]')
    await refused(1, l => { l.tokens.bottom[0] = -(100_000 * 1000 + 1) }, 'tokens.bottom[0]')
    await refused(1, l => { l.tokens.l.fill(0); l.tokens.l[0] = 100_000 * 1000; l.tokens.l[1] = 1 }, 'tokens.l[1]')
    // (the limit itself, and a sum that comes back)
    expect((await readWith(1, l => { l.tokens.l.fill(0); l.tokens.l[0] = 100_000 * 1000 })).table.l[0]).toBe(100_000)
    expect((await readWith(1, l => { l.tokens.l.fill(0); l.tokens.l[0] = 100_000 * 1000; l.tokens.l[1] = -200_000_000 })).table.l[1]).toBe(-100_000)
  })

  it('takes n = TOKENS_PAGE tokens and none (an empty page)', async () => {
    const n = TOKENS_PAGE
    const w = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(n), spans: [], pairs: [] })
    expect(w.emptied).toBe(false)
    expect((await readLeftPart(w.bytes, { ref: w.ref as never, streamOf })).table.n).toBe(n)
    const none = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(0), spans: [], pairs: [] })
    expect((await readLeftPart(none.bytes, { ref: none.ref as never, streamOf })).table.l).toHaveLength(0)
  })

  it('refuses spans that are not rising, not inside the page, naming too many tokens, or not a unit of the parts told', async () => {
    await refused(2, l => { l.spans = [[3, [5, 2]], [2, [0, 2]]] }, 'spans[1][0]')
    await refused(2, l => { l.spans = [[2, [0, 2]], [2, [5, 2]]] }, 'spans[1][0]')
    await refused(2, l => { l.spans[0][1] = [] }, 'spans[0][1]')
    await refused(2, l => { l.spans[0][1] = [0] }, 'spans[0][1]')
    await refused(2, l => { l.spans[0][1] = [0, 0] }, 'spans[0][1][1]')
    await refused(2, l => { l.spans[0][1] = [19, 2] }, 'spans[0][1][1]')
    await refused(2, l => { l.spans[0][1] = [20, 1] }, 'spans[0][1][0]')
    await refused(2, l => { l.spans[0][1] = [4, 2, 5, 1] }, 'spans[0][1][2]')
    await refused(2, l => { l.spans[0][1] = [4, 2, 3, 1] }, 'spans[0][1][2]')
    // (adjacent ranges are one run split in two, and read)
    expect((await readWith(2, l => { l.spans[0][1] = [0, 2, 2, 2] })).spans[0]![1]).toEqual([0, 2, 2, 2])
    // named: SPANNED_PER_TOKEN · n = 40 tokens at most
    await refused(2, l => { l.spans = [[2, [0, 20]], [3, [5, 15]], [4, [0, 6]]]; }, 'spans', { streamOf: id => (id === 3 ? 25 : id === 4 ? 40 : 20) })
    await refused(2, () => {}, 'spans[0][0]', { streamOf: () => undefined })
  })

  it('refuses a unit whose stream lies on the page and whose first range does not begin there', async () => {
    // unit 3 has stream 25, page 2 begins at token 20: its first range begins at 5
    await refused(2, l => { l.spans[1][1] = [6, 2] }, 'spans[1][1][0]')
    expect((await readWith(2, l => { l.spans[1][1] = [5, 2] })).spans[1]![1]).toEqual([5, 2])
    // (a unit whose stream is on another page begins its range anywhere on this one: unit 2, stream 12, on page 2)
    expect((await readWith(2, l => { l.spans[0][1] = [7, 1] })).spans[0]![1]).toEqual([7, 1])
    // the unit's stream is the parts' (streamOf), at the page's edges
    expect((await readWith(2, () => {}, { streamOf: id => (id === 3 ? 20 + TOKENS_ON_PAGE : STREAM.get(id)) })).spans).toHaveLength(2)
    await refused(2, () => {}, 'spans[1][1][0]', { streamOf: id => (id === 3 ? 39 : STREAM.get(id)) })
  })

  it('refuses pairs whose ids are not spans\' and rising, runs not rising by word, outside the page, or of no tokens', async () => {
    await refused(2, l => { l.pairs = [[2, [0, 0, 1]]]; l.pairs.push([2, [0, 0, 1]]) }, 'pairs[1][0]')
    await refused(2, l => { l.pairs = [[9, [0, 0, 1]]] }, 'pairs[0][0]')
    await refused(2, l => { l.pairs = [[3, [0, 0, 1]], [2, [0, 0, 1]]] }, 'pairs[1][0]')
    await refused(2, l => { l.pairs[0][1] = [] }, 'pairs[0][1]')
    await refused(2, l => { l.pairs[0][1] = [0, 5] }, 'pairs[0][1]')
    await refused(2, l => { l.pairs[0][1] = [0, 5, 0] }, 'pairs[0][1][2]')
    await refused(2, l => { l.pairs[0][1] = [0, 19, 2] }, 'pairs[0][1][1]')
    await refused(2, l => { l.pairs[0][1] = [0, 20, 1] }, 'pairs[0][1][1]')
    await refused(2, l => { l.pairs[0][1] = [3, 5, 2, 4, 7, 1] }, 'pairs[0][1][3]')
    await refused(2, l => { l.pairs[0][1] = [3, 5, 2, 3, 7, 1] }, 'pairs[0][1][3]')
    await refused(2, l => { l.pairs[0][1] = [-1, 5, 2] }, 'pairs[0][1][0]')
    expect((await readWith(2, l => { l.pairs[0][1] = [3, 5, 2, 5, 9, 1] })).pairs[0]![1]).toEqual([3, 5, 2, 5, 9, 1])
  })

  it('is the page its part names: the ref\'s page, and the page a page is', async () => {
    await refused(2, () => {}, 'page', { ref: { page: 3 } })
    await refused(2, l => { l.page = 0 }, 'page')
    await refused(2, l => { l.page = 10_001 }, 'page')
    await refused(2, l => { l.first = -1 }, 'first')
    await refused(2, l => { l.first = 1.5 }, 'first')
    await refused(2, l => { l.spans = {} }, 'spans')
    await refused(2, l => { l.pairs = 'x' }, 'pairs')
  })

  it('the writer is the reader\'s mirror on both ways to the empty part: a bad page or first still throws, and a size bound empties', async () => {
    // too many tokens, but a page that is none: the empty part is checked as the reader checks it
    expect(await refusal(writeLeftPart({ paper: PAPER, page: 0, first: 0, tokens: tokenWire(TOKENS_PAGE + 1), spans: [], pairs: [] }))).toMatchObject({ kind: 'left', path: 'page' })
    expect(await refusal(writeLeftPart({ paper: PAPER, page: 1, first: -1, tokens: tokenWire(TOKENS_PAGE + 1), spans: [], pairs: [] }))).toMatchObject({ kind: 'left', path: 'first' })
    // spans naming more than SPANNED_PER_TOKEN times the page's tokens: a size bound, so the page ships empty
    const spans = [[0, [0, 20]], [1, [0, 20]], [2, [0, 20]]] as [number, number[]][]
    const w = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(20), spans, pairs: [] })
    expect(w.emptied).toBe(true)
    expect((await readLeftPart(w.bytes, { ref: w.ref as never, streamOf })).table.n).toBe(0)
    // and the reader refuses the same object given whole
    const whole = parsed(M.lefts[1]!)
    whole.spans = spans
    whole.tokens = tokenWire(20)
    const f = forged('left', whole, { page: 1 })
    expect(await refusal(readLeftPart(f.bytes, { ref: f.ref as never, streamOf: () => 0 }))).toMatchObject({ kind: 'left', path: 'spans' })
    // a shape wrong in another way (a range outside the page) is not size, and throws
    expect(await refusal(writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(20), spans: [[0, [19, 3]]], pairs: [] }))).toMatchObject({ kind: 'left' })
  })

  it('a page that would pass its caps ships an empty left part, never a throw (amendment M8)', async () => {
    expect([LEFT_CAP, LEFT_VALUES, TOKENS_PAGE]).toEqual([2 * 1024 * 1024, 320_000, 15_000])
    // n past TOKENS_PAGE
    const big = await writeLeftPart({ paper: PAPER, page: 3, first: 40, tokens: tokenWire(TOKENS_PAGE + 1), spans: [[4, [1, 1]]], pairs: [] })
    expect(big.emptied).toBe(true)
    const e = await readLeftPart(big.bytes, { ref: big.ref as never, streamOf })
    expect(e).toMatchObject({ page: 3, first: 40, spans: [], pairs: [] })
    expect(e.table.n).toBe(0)
    // values past LEFT_VALUES: 15,000 tokens of six fields are 90,000; a page of many small spans and a run each names more
    const spans = Array.from({ length: 30_000 }, (_, i) => [i, [0, 1]] as [number, number[]])
    const many = await writeLeftPart({ paper: PAPER, page: 3, first: 40, tokens: tokenWire(TOKENS_PAGE), spans, pairs: spans.map(([id]) => [id, [0, 0, 1]] as [number, number[]]) })
    expect(many.emptied).toBe(true)
    expect(many.bytes.length).toBeLessThan(500)
    // a page within the caps is not emptied
    const small = await writeLeftPart({ paper: PAPER, page: 3, first: 40, tokens: tokenWire(10), spans: [[4, [1, 1]]], pairs: [] })
    expect(small.emptied).toBe(false)
    // the empty part is the same bytes however it was reached, and is a left part of its page
    const again = await writeLeftPart({ paper: PAPER, page: 3, first: 40, tokens: tokenWire(TOKENS_PAGE + 5), spans: [], pairs: [] })
    expect(again.sha256).toBe(big.sha256)
    // a shape wrong for another reason still throws
    expect(await refusal(writeLeftPart({ paper: PAPER, page: 0, first: 0, tokens: tokenWire(2), spans: [], pairs: [] }))).toMatchObject({ kind: 'left', path: 'page' })
    expect(await refusal(writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(5), spans: [[0, [0, 9]]], pairs: [] }))).toMatchObject({ kind: 'left' })
  })
})

// ---------------------------------------------------------------- 13. the catalog
describe('the catalog', () => {
  // biome-ignore lint/suspicious/noExplicitAny: a test breaks the catalog's types on purpose
  type Any = any
  const units = () => M.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length }))
  const parts = () => M.parts.map(p => ({ from: p.from, to: p.to, sha256: p.sha256, bytes: p.bytes.length }))
  const catalog = async () => writeCatalog({ head: M.readHead, units: units(), parts: parts(), end: { through: 4 } })
  const readWith = async (edit: (c: Any) => void, o: { key?: string; paper?: { id: string; version: number } } = {}) => {
    const c = parsed(await catalog())
    edit(c)
    return readCatalog(utf8(JSON.stringify(c)), o)
  }
  const refused = async (edit: (c: Any) => void, path: string, o?: { key?: string; paper?: { id: string; version: number } }) => {
    const e = await refusal(readWith(edit, o))
    expect(e, 'refused').not.toBeNull()
    expect(e!.kind).toBe('catalog')
    expect(e!.path).toBe(path)
  }

  it('refuses parts that are not contiguous from page 1, past the paper, or a ref of another kind', async () => {
    await refused(c => { c.parts[1].from = 3 }, 'parts[1].from')
    await refused(c => { c.parts[0].from = 2 }, 'parts[0].from')
    await refused(c => { c.parts[2].to = 5 }, 'parts[2].to')
    await refused(c => { c.parts[1].kind = 'units' }, 'parts[1].kind')
    await refused(c => { c.parts[0].bytes = PART_CAP + 1 }, 'parts[0].bytes')
    await refused(c => { c.parts = {} }, 'parts')
    await refused(c => { c.head.kind = 'part' }, 'head.kind')
    await refused(c => { c.left = [] }, 'left')
  })

  it('refuses `through` that is not the last part\'s `to`, a refusal with through = N, a complete end with a part missing', async () => {
    await refused(c => { c.end.through = 3 }, 'end.through')
    await refused(c => { c.end = { through: 4, refused: 'memory' } }, 'end.refused')
    await refused(c => { c.parts.pop() }, 'end.through')
    await refused(c => { c.parts.pop(); c.end = { through: 3, refused: 'x' } }, 'end.refused')
    await refused(c => { c.end.extra = 1 }, 'end.extra')
    await refused(c => { delete c.end.through }, 'end.through')
    await refused(c => { c.end = [] }, 'end')
    // (a part list of a refused paper: 0 for none)
    const none = await readCatalog(utf8(JSON.stringify({ ...parsed(await catalog()), parts: [], end: { through: 0, refused: 'bound' } })))
    expect(none.end).toEqual({ through: 0, refused: 'bound' })
  })

  it('refuses versions that are not a reader\'s: the PDF.js and the tokens', async () => {
    await refused(c => { c.versions.pdfjs = '5.0.0' }, 'versions.pdfjs')
    await refused(c => { c.versions.layout = '' }, 'versions.layout')
    await refused(c => { c.paper.pages = 0 }, 'paper.pages')
  })

  it('is the key\'s: of its paper and of the VTAG its versions make; and the paper asked for', async () => {
    const w = await catalog()
    const c = await readCatalog(w.bytes, { key: w.key, paper: PAPER })
    expect(w.key).toBe(`layer/${PAPER.id}v${PAPER.version}/${VTAG5}.json`)
    expect(c.versions).toEqual(M.readHead.versions)
    const other = (vtag: string) => catalogKey(PAPER.id, PAPER.version, vtag)
    await refused(() => {}, 'versions', { key: other(VTAG5.replace(/-r\d+$/, '-r99')) })
    await refused(() => {}, 'versions', { key: other(VTAG5.replace('-p', '-p9')) })
    await refused(() => {}, 'paper', { key: catalogKey('2608.04323', 1, VTAG5) })
    await refused(() => {}, 'paper', { key: catalogKey(PAPER.id, 2, VTAG5) })
    await refused(() => {}, 'key', { key: keyOf(PAPER.id, 1, CTAG5, '0'.repeat(64)) })
    await refused(() => {}, 'key', { key: 'layer/x' })
    await refused(() => {}, 'paper', { paper: { id: PAPER.id, version: 2 } })
  })

  it('is named by the head\'s versions, the reader\'s own expression, whatever engine writes it (a head of another pipeline, layout or remover)', async () => {
    const h = parsed(M.head)
    h.versions = { ...h.versions, pipeline: '12', layout: '7', removal: '99' }
    const f = forged('head', h)
    const other = await readHead(f.bytes, { ref: f.ref })
    const w = await writeCatalog({ head: other, units: units(), parts: parts(), end: { through: 4 } })
    expect(w.key).toBe(catalogKey(PAPER.id, PAPER.version, `b${BUNDLE5}-j${PDFJS}-p12-l7-r99`))
    expect(w.key).not.toBe(catalogKey(PAPER.id, PAPER.version, VTAG5))
    const c = await readCatalog(w.bytes, { key: w.key, paper: PAPER })
    expect(c.versions).toMatchObject({ pipeline: '12', layout: '7', removal: '99' })
  })

  it('is written only for what it would read: the end, the chunks and the parts the head and the parts make', async () => {
    const w = (o: Partial<Parameters<typeof writeCatalog>[0]>) => writeCatalog({ head: M.readHead, units: units(), parts: parts(), end: { through: 4 }, ...o })
    expect(await refusal(w({ end: { through: 3 } }))).toMatchObject({ kind: 'catalog', path: 'end.through' })
    expect(await refusal(w({ end: { through: 4, refused: 'bound' } }))).toMatchObject({ path: 'end.refused' })
    expect(await refusal(w({ end: { through: 4 }, parts: parts().slice(0, 2) }))).toMatchObject({ path: 'end.through' })
    expect(await refusal(w({ parts: [{ ...parts()[0]!, from: 2, to: 2 }, ...parts().slice(1)], end: { through: 4 } }))).toMatchObject({ path: 'parts[0].from' })
    expect(await refusal(w({ units: [{ ...units()[0]!, bytes: 5 }] }))).toMatchObject({ path: 'units[0]' })
    expect(await refusal(w({ units: [] }))).toMatchObject({ path: 'units' })
    expect(await refusal(w({ end: { through: 3, refused: 'nope' as never }, parts: parts().slice(0, 2) }))).toMatchObject({ path: 'end.refused' })
  })
})

// ---------------------------------------------------------------- M15. the units' records
describe('records (amendment M15): derived once, the engine\'s own predicates', () => {
  /** the sample paper's units (CC0, tests/fixtures/pdf/sample-1/) as a BUNDLE 3 file holds them, and the synthetic paper's */
  const sample = () => readBundle(new Uint8Array(readFileSync('tests/fixtures/pdf/sample-1/bundle.json'))).units
  const LANGS = ['zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'ar']

  it('are columns of one entry a unit: kind, flags, depth, plain length, and the sparse cells and headings', () => {
    const r = M.index.records
    expect(r.kind).toBeInstanceOf(Uint8Array)
    expect(r.flags).toBeInstanceOf(Uint8Array)
    expect(r.depth).toBeInstanceOf(Int8Array)
    expect(r.plainLength).toBeInstanceOf(Uint32Array)
    expect([r.kind.length, r.flags.length, r.depth.length, r.plainLength.length]).toEqual([8, 8, 8, 8])
    expect([...r.kind]).toEqual(UNITS.map(u => UNIT_KINDS.indexOf(u[0] as never)).map(k => (k < 0 ? KIND_NONE : k)))
    // the title carries TITLE, a cell KEPT, the front heading FRONT and BRACKETED, the author AUTHOR
    expect([...r.flags]).toEqual([RECORD_FLAG.TITLE, 0, 0, RECORD_FLAG.KEPT, 0, 0, RECORD_FLAG.FRONT | RECORD_FLAG.BRACKETED, RECORD_FLAG.AUTHOR])
    // a heading's depth is its own (the \\part's -1 is one), a unit with none DEPTH_NONE
    expect([...r.depth]).toEqual([DEPTH_NONE, DEPTH_NONE, DEPTH_NONE, DEPTH_NONE, DEPTH_NONE, DEPTH_NONE, 1, DEPTH_NONE])
    expect([r.plainLength[0], r.plainLength[1], r.plainLength[3], r.plainLength[6]]).toEqual(['A Title'.length, 'A note.'.length, 'Model'.length, 'Intro'.length])
    expect(r.plainLength[2]).toBe(plainSource(sourceUnitsOf({ units: UNITS })[2]!).length)
    expect([...r.cells.keys()]).toEqual([3, 4, 5])
    expect(r.cells.get(4)).toEqual({ table: 0, row: 1, col: 0, span: 2, head: false })
    expect([...r.headings]).toEqual([[0, 'A Title'], [6, 'Intro']])
    // (the same records, head-less, from the chunks alone)
    expect(unitsOfChunks(M.readChunks).records).toEqual(r)
  })

  it('a depth of -1 (a \\part) is a depth, and a unit that does not stand has none of anything', async () => {
    const o = parsed(M.chunks[0]!)
    o.units[6][2] = -1
    o.units[7][0] = 'Author'
    const f = forged('units', o, { from: 0, to: 7 })
    const c = await readUnitsChunk(f.bytes, { ref: f.ref, before: null })
    const r = unitsOfChunks([c]).records
    expect(r.depth[6]).toBe(-1)
    expect([r.kind[7], r.flags[7], r.depth[7], r.plainLength[7]]).toEqual([KIND_NONE, 0, DEPTH_NONE, 0])
    expect(r.headings.has(7)).toBe(false)
  })

  for (const [name, getUnits] of [['the synthetic paper', () => [...UNITS]], ['the sample paper', () => sample() as never]] as [string, () => (typeof UNITS[number] | null)[]][]) {
    it(`equal the engine's own derivation on ${name}: toTranslate for every language, groupOf, the batches of batchesOf`, async () => {
      const units = getUnits()
      const chunks = await writeUnitChunks({ paper: PAPER, units: units as never })
      const read: ReadUnitsChunk[] = []
      for (const c of chunks) read.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: read.at(-1) ?? null }))
      const { records: r, kinds } = unitsOfChunks(read)
      const bundle = { units }
      expect(units.length).toBeGreaterThan(5)
      for (const lang of LANGS) {
        // (the names a table holds alone: the author block is translated for every target, TRANSLATE_VERSION 6; and a TikZ
        // picture's texts, kind `figure`, whose glyphs the figure ink units translate: rows.mjs TIKZ_KIND)
        const kept = (i: number) => (r.flags[i]! & RECORD_FLAG.KEPT) !== 0 || kinds[i] === 'figure'
        const derived = [...units.keys()].filter(i => units[i] !== null && !kept(i))
        expect(derived, lang).toEqual(toTranslate(bundle, lang))
        // the batches: the same cuts from the records' lengths as batchesOf makes from the plain source, the paper's structural
        // names first (their kind the chunks': PDF-READER §19.14)
        let left = [...derived.filter(i => kinds[i] === 'name'), ...derived.filter(i => kinds[i] !== 'name')]
        const batches: number[][] = []
        for (let first = true; left.length; first = false) {
          const b = batchOf(left, i => r.plainLength[i]!, first ? FIRST_BATCH : NEXT_BATCH)
          batches.push(b)
          left = left.slice(b.length)
        }
        expect(batches, lang).toEqual(batchesOf(bundle, lang))
      }
      const source = sourceUnitsOf(bundle)
      source.forEach((u, i) => {
        expect(r.cells.has(i), `cell ${i}`).toBe(!!u?.cell)
        if (u?.cell) expect(groupOf({ cell: r.cells.get(i) } as never)).toBe(groupOf(u))
        expect(r.plainLength[i]).toBe(u ? plainSource(u).length : 0)
        expect(r.headings.get(i)).toBe(u?.kind === 'heading' ? plainSource(u) : undefined)
      })
    })
  }
})

// ---------------------------------------------------------------- 14. determinism
/** the same value with the keys of every object (not array) in reverse order */
function reversed(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reversed)
  if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)]))
  return v
}

describe('every writer twice gives the same bytes, digest and key, whatever order its input\'s keys came in', () => {
  const same = (a: { bytes: Uint8Array; sha256: string; key: string; ref: object }, b: typeof a) => {
    expect(textOf(a.bytes)).toBe(textOf(b.bytes))
    expect([a.sha256, a.key, a.ref]).toEqual([b.sha256, b.key, b.ref])
  }

  it('units chunks: a cell and edges written in other key orders', async () => {
    const shuffled = UNITS.map(u => [u[0], u[1], u[2], u[3] && reversed(u[3]), u[4] && reversed(u[4]), u[5]]) as typeof UNITS
    same((await writeUnitChunks({ paper: PAPER, units: shuffled }))[0]!, M.chunks[0]!)
    same((await writeUnitChunks({ paper: { version: PAPER.version, id: PAPER.id }, units: UNITS }))[0]!, M.chunks[0]!)
  })

  it('the head, the left parts, the catalog', async () => {
    const h = await writeHead({ paper: { pages: N, version: PAPER.version, id: PAPER.id }, base: { xref: BASE.xref, sha256: BASE.sha256, bytes: BASE.bytes }, image: IMAGE, units: M.chunks, lineskip: [1, 0] })
    same(h, M.head)
    for (let p = 1; p <= N; p++) {
      const w = await writeLeftPart({ paper: PAPER, page: p, first: TOKENS_ON_PAGE * (p - 1), tokens: reversed(tokenWire(TOKENS_ON_PAGE, p)) as never, ...(LEFT_OF[p] as (typeof LEFT_OF)[number]) })
      same(w, M.lefts[p]!)
    }
    const refs = (list: { from: number; to: number; sha256: string; bytes: Uint8Array }[]) => list.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length }))
    const a = await writeCatalog({ head: M.readHead, units: refs(M.chunks), parts: refs(M.parts), end: { through: 4 } })
    const b = await writeCatalog({ head: M.readHead, units: refs(M.chunks).map(r => reversed(r) as typeof r), parts: refs(M.parts).map(r => reversed(r) as typeof r), end: { through: 4 } })
    same(a, b)
  })

  it('the parts: the cell rules in another page order, written in page order', async () => {
    const inputs = partInputs(M.head.sha256, M.lefts, [null, M.parts[0]!.sha256, M.parts[1]!.sha256])
    for (let i = 0; i < 3; i++) same(await writePart(inputs[i]!), M.parts[i]!)
    const second = inputs[1]!
    const a = await writePart({ ...second, rules: { 2: [72, 500, 540, 500.4], 3: [72, 300, 200, 300.3] } })
    const b = await writePart({ ...second, rules: { 3: [72, 300, 200, 300.3], 2: [72, 500, 540, 500.4] } })
    same(a, b)
    expect(textOf(a.bytes)).toContain('"rules":{"2":[72,500,540,500.4],"3":[72,300,200,300.3]}')
  })

  it('a whole paper written again is the same objects: the digests, the keys', async () => {
    const again = await made()
    expect(again.head.key).toBe(M.head.key)
    expect(again.parts.map(p => p.key)).toEqual(M.parts.map(p => p.key))
    expect(again.chunks.map(c => c.sha256)).toEqual(M.chunks.map(c => c.sha256))
    expect(Object.values(again.lefts).map(l => l.sha256)).toEqual(Object.values(M.lefts).map(l => l.sha256))
  })
})

// ---------------------------------------------------------------- 15. keys
describe('keys', () => {
  const sha = 'a'.repeat(64)

  it('keyOf names an object by its whole digest under the CTAG; catalogKey by the VTAG; keyParts takes them apart', () => {
    expect(CTAG5).toBe(`b12-j${PDFJS}`)
    expect(VTAG5).toBe(`${CTAG5}-p${PIPELINE_VERSION}-l${LAYOUT}-r${REMOVAL}`)
    const key = keyOf('2608.04322', 3, CTAG5, sha)
    expect(key).toBe(`layer/2608.04322v3/${CTAG5}/${sha}.json`)
    expect(keyParts(key)).toEqual({ paper: '2608.04322', version: 3, ctag: CTAG5, sha256: sha })
    const cat = catalogKey('2608.04322', 3, VTAG5)
    expect(cat).toBe(`layer/2608.04322v3/${VTAG5}.json`)
    expect(keyParts(cat)).toEqual({ paper: '2608.04322', version: 3, vtag: VTAG5 })
    // the writers' keys are these
    expect(M.head.key).toBe(keyOf(PAPER.id, PAPER.version, CTAG5, M.head.sha256))
    expect(M.parts[1]!.key).toBe(keyOf(PAPER.id, PAPER.version, CTAG5, M.parts[1]!.sha256))
  })

  it('an old identifier\'s slash is written _, and read back', () => {
    for (const id of ['hep-th/9901001', 'math.GT/0309136', 'astro-ph/0001001']) {
      const key = keyOf(id, 12, CTAG5, sha)
      expect(key).toBe(`layer/${id.replace('/', '_')}v12/${CTAG5}/${sha}.json`)
      expect(keyParts(key)).toEqual({ paper: id, version: 12, ctag: CTAG5, sha256: sha })
      expect(keyParts(catalogKey(id, 12, VTAG5))).toEqual({ paper: id, version: 12, vtag: VTAG5 })
    }
  })

  it('refuses the spellings keyOf would not write', () => {
    const good = keyOf('2608.04322', 3, CTAG5, sha)
    for (const bad of [
      good.replace('v3/', 'v03/'), good.replace('v3/', 'v0/'), good.replace('v3/', 'v/'), good.replace(sha, 'A'.repeat(64)), good.replace(sha, sha.slice(1)), good.replace(sha, `${sha}0`),
      good.replace('.json', '.JSON'), good.replace('layer/', 'layer3/'), `${good}/`, `/${good}`, good.replace('2608.04322', '2608.043'), good.replace('2608.04322v3', 'hep-th/9901001v3'),
      good.replace(CTAG5, 'b5'), good.replace(CTAG5, `${CTAG5}-p11`), good.replace(CTAG5, 'B5-j6'), good.replace('/', '//'), good.replace('2608.04322', '..'),
      catalogKey('2608.04322', 3, VTAG5).replace('-l', '-L'), catalogKey('2608.04322', 3, VTAG5).replace(`${VTAG5}`, CTAG5), 'layer/2608.04322v3/x.json', 'x', '', `layer/${'a'.repeat(400)}`,
    ]) expect(keyParts(bad), bad).toBeNull()
    expect(keyParts(7 as never)).toBeNull()
    // (the old identifier with its slash in the key, where a _ goes)
    expect(keyParts(`layer/hep-th/9901001v1/${CTAG5}/${sha}.json`)).toBeNull()
  })

  it('throws a RangeError on an identifier, a version, a tag or a digest that is not one', () => {
    for (const args of [['../x', 1, CTAG5, sha], ['2608.04322', 0, CTAG5, sha], ['2608.04322', 1001, CTAG5, sha], ['2608.04322', 1.5, CTAG5, sha], ['2608.04322', 1, 'b5', sha], ['2608.04322', 1, CTAG5, 'abc'], ['2608.04322', 1, CTAG5, sha.toUpperCase()], [7, 1, CTAG5, sha]] as const) {
      expect(() => (keyOf as (...a: unknown[]) => string)(...args), String(args)).toThrow(RangeError)
    }
    expect(() => catalogKey('2608.04322', 1, 'b5-j1')).toThrow(RangeError)
    expect(() => catalogKey('2608.04322v1', 1, VTAG5)).toThrow(RangeError)
  })

  it('partTarget gives the doubling schedule: 1, 2–3, 4–7, … and N', () => {
    const schedule = (n: number) => {
      const out: [number, number][] = []
      for (let a = 1; a <= n;) { const b = partTarget(a, n); out.push([a, b]); a = b + 1 }
      return out
    }
    expect(schedule(100)).toEqual([[1, 1], [2, 3], [4, 7], [8, 15], [16, 31], [32, 63], [64, 100]])
    expect(schedule(1)).toEqual([[1, 1]])
    expect(schedule(4)).toEqual([[1, 1], [2, 3], [4, 4]])
    expect(schedule(147).at(-1)).toEqual([128, 147])
    expect([partTarget(1, 9), partTarget(5, 6), partTarget(5, 100)]).toEqual([1, 6, 9])
    for (const [a, n] of [[0, 5], [1, 0], [1.5, 5], [1, Number.NaN]] as [number, number][]) expect(() => partTarget(a, n)).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------- 16. writers never emit what readers refuse
describe('a writer given what its reader would refuse throws BundleRefusal', () => {
  const input = () => partInputs(M.head.sha256, M.lefts)[0]!
  const writeRefused = (edit: (p: ReturnType<typeof input>) => void) => { const p = input(); edit(p); return refusal(writePart(p)) }

  it('a part\'s content at most: the cap less 64 KiB for the digests and the rest', () => {
    expect(CONTENT_MAX + 64 * 1024).toBe(PART_CAP)
  })

  it('a part past PART_VALUES values, or PART_CAP bytes', async () => {
    const rects = Array.from({ length: 170_000 }, () => [1, 72, 647, 540, 657] as [number, number, number, number, number])
    expect(await writeRefused(p => { p.left = [[0, 0, rects], p.left[1]!] })).toMatchObject({ kind: 'part', message: expect.stringMatching(/more than 1000000 values/) })
    expect(PART_VALUES).toBe(1_000_000)
  })

  it('a shape the part alone shows wrong: a rectangle off its page, a unit in both lists, cell rules without a layout, a missing left part', async () => {
    expect(await writeRefused(p => { p.left = [[0, 0, [[1, 72, 647, 900, 657]]], p.left[1]!] })).toMatchObject({ kind: 'part', path: 'left[0][2][0][3]' })
    expect(await writeRefused(p => { p.fileOnly = [[0, 0]] })).toMatchObject({ path: 'fileOnly[0][0]' })
    expect(await writeRefused(p => { p.layout = null; p.rules = { 1: [72, 500, 540, 500.4] } })).toMatchObject({ kind: 'part', path: 'rules' })
    expect(await writeRefused(p => { p.leftParts = [] })).toMatchObject({ path: 'leftParts' })
    expect(await writeRefused(p => { p.pages = [1, 0] })).toMatchObject({ path: 'pages' })
    expect(await writeRefused(p => { p.head = 'abc' })).toMatchObject({ path: 'head' })
    expect(await writeRefused(p => { p.views = p.views.slice(0, 4) })).toMatchObject({ kind: 'part' })
  })

  it('a unit past a chunk alone, and a head, a left part, a catalog by their readers\' own bounds', async () => {
    const big = Array.from({ length: 200 }, () => [0, 'x'.repeat(16_000)])
    expect(await refusal(writeUnitChunks({ paper: PAPER, units: [['para', 0, null, null, null, big] as never] }))).toMatchObject({ kind: 'units', id: 0 })
    expect(await refusal(writeHead({ paper: { ...PAPER, pages: 0 }, base: BASE, image: IMAGE, units: M.chunks, lineskip: null }))).toMatchObject({ kind: 'head', path: 'paper.pages' })
  })
})

// ---------------------------------------------------------------- 17. memory-class errors
/** `target.name` made to run `fn` (restored by afterEach) */
const stub = (target: object, name: string, fn: () => never) => vi.spyOn(target as Record<string, (...a: unknown[]) => unknown>, name).mockImplementation(fn)

describe('a memory-class error goes through a reader or a writer as itself', () => {
  const memory = () => failedAllocation() as Error

  it('a reader does not wrap it, whichever step it comes in: the digest, the decoding, the parse', async () => {
    const good = M.head
    for (const [target, name] of [[globalThis.crypto.subtle, 'digest'], [TextDecoder.prototype, 'decode'], [JSON, 'parse']] as const) {
      const e = memory()
      stub(target, name, () => { throw e })
      await expect(readHead(good.bytes, { ref: good.ref })).rejects.toBe(e)
      vi.restoreAllMocks()
    }
    // (any other error of those steps is not a refusal either, and is not turned into one)
    const other = new Error('boom')
    vi.spyOn(JSON, 'parse').mockImplementation(() => { throw other })
    await expect(readHead(good.bytes, { ref: good.ref })).rejects.toMatchObject({ name: 'BundleRefusal', why: 'not JSON' })
  })

  it('every kind\'s reader', async () => {
    for (const r of READERS) {
      const e = memory()
      vi.spyOn(JSON, 'parse').mockImplementation(() => { throw e })
      const bytes = r.sample().bytes
      await expect(r.read(bytes, r.kind === 'catalog' ? null : asRef(r.kind, bytes))).rejects.toBe(e)
      vi.restoreAllMocks()
    }
  })

  it('a writer does not wrap it: the digest, the text, the encoder', async () => {
    const run = {
      units: () => writeUnitChunks({ paper: PAPER, units: UNITS }),
      head: () => writeHead({ paper: { ...PAPER, pages: N }, base: BASE, image: IMAGE, units: M.chunks, lineskip: null }),
      left: () => writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(3), spans: [], pairs: [] }),
      part: () => writePart(partInputs(M.head.sha256, M.lefts)[2]!),
    }
    for (const [name, make] of Object.entries(run)) {
      for (const [target, fn] of [[globalThis.crypto.subtle, 'digest'], [JSON, 'stringify'], [TextEncoder.prototype, 'encode']] as const) {
        if (name === 'units' && fn === 'stringify') continue
        const e = memory()
        stub(target, fn, () => { throw e })
        await expect(make(), `${name} ${fn}`).rejects.toBe(e)
        vi.restoreAllMocks()
      }
    }
  })
})

// ---------------------------------------------------------------- seeded hostile mutations of every kind
describe('seeded hostile mutations of a valid object, every kind', () => {
  /** a small seeded generator, so that a failure is the same failure again */
  function random(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const POOL: unknown[] = [null, true, false, 0, -1, 1, 2, 3, 4, 1.5, -0.25, 2 ** 31 + 1, 1e300, -1e300, '', 'x', 'Para', 'para', '‮', 'x'.repeat(300), [], {}, [0], [0, 'x'], [3, 1, '}'], [4, 'a', 99, 'b'], { lead: 1 }, [1, 0, 0, 1, 1], '0'.repeat(64)]
  const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)] as T
  const ownKeys = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) for (const x of v) ownKeys(x, out)
    else if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array) && !(ArrayBuffer.isView(v)) && !(v instanceof Map)) for (const k of Object.keys(v)) { out.push(k); ownKeys((v as Record<string, unknown>)[k], out) }
    return out
  }
  const nodes = (v: unknown, path: (string | number)[] = [], out: (string | number)[][] = []) => {
    out.push(path)
    if (Array.isArray(v)) v.forEach((x, i) => { nodes(x, [...path, i], out) })
    else if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) nodes((v as Record<string, unknown>)[k], [...path, k], out)
    return out
  }
  // biome-ignore lint/suspicious/noExplicitAny: the mutator walks any JSON
  function mutated(base: any, r: () => number): string {
    const paths = nodes(base).filter(p => p.length)
    const b = structuredClone(base)
    for (let m = 1 + Math.floor(r() * 3); m > 0; m--) {
      const path = pick(r, paths)
      let parent = b
      for (const k of path.slice(0, -1)) parent = parent?.[k]
      if (parent === null || typeof parent !== 'object') continue
      const k = path[path.length - 1] as string | number, v = parent[k], how = r()
      if (how < 0.5) parent[k] = structuredClone(pick(r, POOL))
      else if (how < 0.6) { if (Array.isArray(parent)) parent.splice(Number(k), 1); else delete parent[k] }
      else if (how < 0.7) { if (Array.isArray(parent)) parent.splice(Number(k), 0, structuredClone(v)); else parent[`${k}x`] = structuredClone(v) }
      else if (how < 0.85 && typeof v === 'number') parent[k] = pick(r, [v + 1, v - 1, -v, v * 1e6, v + 0.5])
      else if (typeof v === 'string') parent[k] = pick(r, [`${v}x`, v.slice(1), v.toUpperCase(), `${v}\u0000`])
      else parent[k] = structuredClone(pick(r, POOL))
    }
    let json = JSON.stringify(b)
    if (r() < 0.1) json = r() < 0.5 ? json.slice(0, Math.floor(r() * json.length)) : (i => json.slice(0, i) + pick(r, ['{', '}', '[', ']', ',', ':', '"', '\\', '0', 'x']) + json.slice(i))(Math.floor(r() * json.length))
    if (r() < 0.05) { const opens = [...json.matchAll(/\{/g)].map(m => m.index); const i = pick(r, opens) + 1; json = `${json.slice(0, i)}"${pick(r, ['__proto__', 'constructor', 'prototype'])}":${pick(r, ['0', '{}', '[]', '"x"'])},${json.slice(i)}` }
    return json
  }

  const KINDS: { kind: 'units' | 'head' | 'part' | 'left' | 'catalog'; base: () => unknown; read: (b: Uint8Array, ref: ReturnType<typeof asRef>) => Promise<unknown> }[] = [
    { kind: 'units', base: () => parsed(M.chunks[0]!), read: (b, ref) => readUnitsChunk(b, { ref, before: null }) },
    { kind: 'head', base: () => parsed(M.head), read: (b, ref) => readHead(b, { ref }) },
    { kind: 'part', base: () => parsed(M.parts[1]!), read: (b, ref) => readPart(b, { ref, index: M.index, chain: M.readParts[0]!.chain }) },
    { kind: 'left', base: () => parsed(M.lefts[2]!), read: (b, ref) => readLeftPart(b, { ref: { ...ref, page: 2 } as never, streamOf: id => STREAM.get(id) }) },
    { kind: 'catalog', base: () => JSON.parse(textOf(CAT.bytes)), read: b => readCatalog(b) },
  ]
  for (const k of KINDS) {
    it(`${k.kind}: throws nothing but BundleRefusal, or reads`, async () => {
      const r = random(20261015), base = k.base()
      const outcome = { refused: 0, read: 0 }
      for (let n = 0; n < 700; n++) {
        const bytes = utf8(mutated(base, r))
        try {
          const read = await k.read(bytes, asRef(k.kind, bytes))
          outcome.read++
          expect(ownKeys(read).filter(x => x === '__proto__' || x === 'constructor' || x === 'prototype')).toEqual([])
        } catch (e) {
          if (!(e instanceof BundleRefusal)) throw new Error(`${k.kind} mutation ${n}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
          outcome.refused++
        }
      }
      expect(outcome.refused).toBeGreaterThan(100)
      expect(outcome.read).toBeGreaterThan(5)
    })
  }
})

// ---------------------------------------------------------------- the real papers (where this machine has them)
// AXT_LAB=<a lab/pdf directory> AXT_PACK=<a gate pack of LAYOUT 6> (helpers/lab-data.ts): each paper's units (openPaper over its source), its
// layout file (the layer gate's made fixtures) and its left (the p10 cut's geometry), cut at the doubling schedule, written,
// read against the chain and merged back; the units through the chunk writer and the reader
describe.skipIf(!LAB_ON)('the real papers: units, layout files and left cut at the doubling schedule', () => {
  for (const [name, target] of LAB_PAPERS) {
    it(name, async () => {
      const { existsSync, readFileSync } = await import('node:fs')
      const { openPaper } = await import('@/pdf-reader/engine/pipeline/live.mjs')
      const { unpackSource } = await import('@/pdf-reader/engine/source/tar.mjs')
      const { bundleUnitsOf } = await import('@/pdf-reader/engine/layer-proto/units.mjs')
      const { parseLayout, LAYOUT_CAP } = await import('@/pdf-reader/engine/layout/file.mjs')
      const { cutAt } = await import('./helpers/format-cut')
      const { layoutFile, geometryFile, sourceFile } = labFiles(name, target)
      for (const f of [layoutFile, geometryFile, sourceFile]) if (!existsSync(f)) throw new Error(`missing ${f}`)
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
      const paper = { id, version }
      const source = await unpackSource(new Uint8Array(readFileSync(sourceFile)))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const units = bundleUnitsOf(openPaper(source.files))
      const layout = parseLayout(new Uint8Array(readFileSync(layoutFile)))
      expect(readFileSync(layoutFile).length).toBeLessThan(LAYOUT_CAP)
      const geometry = JSON.parse(readFileSync(geometryFile, 'utf8')) as { left: { units: UnitWireLoose[] } }
      type UnitWireLoose = [number, number, [number, number, number, number, number][]]
      const N = layout.paper.pages

      // the units: through the chunk writer and the reader, none dropped
      const chunks = await writeUnitChunks({ paper, units })
      const head = await writeHead({ paper: { ...paper, pages: N }, base: { bytes: 1_000_000, sha256: 'a'.repeat(64), xref: 999_000 }, image: IMAGE, units: chunks, lineskip: layout.lineskip })
      const rh = await readHead(head.bytes, { ref: head.ref })
      const read: ReadUnitsChunk[] = []
      for (const c of chunks) read.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: read.at(-1) ?? null }))
      const index = indexOf(rh, read)
      expect(index.units).toEqual(units)
      expect(index.dropped).toEqual([])
      // the layout file through its part encoders
      const cut = cutAt(layout, geometry.left.units)
      expect(cut.map(p => p.pages)).toEqual(((): [number, number][] => { const out: [number, number][] = []; for (let a = 1; a <= N;) { const b = partTarget(a, N); out.push([a, b]); a = b + 1 } return out })())
      // the parts, written and read in order against the chain
      const readParts = []
      const lefts: Record<number, Awaited<ReturnType<typeof writeLeftPart>>> = {}
      let chain = null
      let prev: string | null = null
      for (const p of cut) {
        const leftParts = []
        for (let pg = p.pages[0]; pg <= p.pages[1]; pg++) {
          const l = await writeLeftPart({ paper, page: pg, first: 0, tokens: tokenWire(0), spans: [], pairs: [] })
          lefts[pg] = l
          leftParts.push(l)
        }
        const w = await writePart({ paper, head: head.sha256, prev, pages: p.pages, views: p.views, left: p.left, fileOnly: p.fileOnly, layout: p.layout, rules: null, leftParts })
        const r = await readPart(w.bytes, { ref: w.ref, index, chain })
        readParts.push(r)
        chain = r.chain
        prev = w.sha256
        expect(w.bytes.length).toBeLessThanOrEqual(PART_CAP)
      }
      // and merged back: the file's layout (its fonts table by first use, as the maker builds it), the left's units
      const merged = mergeParts(index, readParts)
      expect(encodeLayout({ ...merged.layout!, left: layout.left })).toBe(encodeLayout(layout))
      expect(merged.left.units).toEqual([...geometry.left.units].sort((a, b) => a[0] - b[0]).map(w => [w[0], w[1], w[2].map(r => [r[0], Math.round(r[1] * 1000) / 1000, Math.round(r[2] * 1000) / 1000, Math.round(r[3] * 1000) / 1000, Math.round(r[4] * 1000) / 1000])]))
      expect(merged.units).toEqual(units)
      // the K order is the chain's: the parts' ids are the whole's, each once
      const told = readParts.flatMap(p => [...p.left.map(w => w[0]), ...p.fileOnly.map(e => e[0])])
      expect(new Set(told).size).toBe(told.length)
    }, 120_000)
  }
})
