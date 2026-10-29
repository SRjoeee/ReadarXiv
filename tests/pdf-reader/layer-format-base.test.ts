import { beforeAll, describe, expect, it } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import {
  BASE_KINDS, BASE_SOURCES, checkDelta, BASE_WHYS, BUNDLE5, BUNDLES_READ, baseKey, CTAG5, catalogBase, DELTA_MAX_BYTES, DELTA_MAX_SHARE, deltaBaseWhy, deltaKey, indexOf, keyOf, layerDraws, LAYOUT_REFUSED, REPLACED_MAX, readCatalog, readHead, readPart, readUnitsChunk, writeCatalog, writeHead, writePart, writeUnitChunks,
} from '@/pdf-reader/engine/layer-proto/format.mjs'
import { deltaOf } from './helpers/delta-pdfs'
import { BASE, forged, IMAGE, type Made, made, N, PAPER, parsed, partInputs, UNITS } from './helpers/format-paper'

// BUNDLE 8 (the layer route's step 2, design note §3.2): the head's base says whose PDF the layer is drawn over — ours, the
// final pass of the marked original, with the page-and-line check it passed and arXiv's PDF beside it (`orig`), or arXiv's,
// with why ours was refused — and the catalog names the base object. A reader of 8 reads 7's objects too: a head of 7 is one
// over arXiv's PDF.

const OURS = { source: 'ours' as const, bytes: 12_000, sha256: 'fedcba9876543210'.repeat(4), xref: 11_000, pages: N, tree: '2025', check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: 0.99512 } }
const ORIG = { bytes: BASE.bytes, sha256: BASE.sha256 }
/** an object's JSON, to break */
type Wire = ReturnType<typeof parsed>
const refusal = async (p: Promise<unknown>) => { try { await p; return null } catch (e) { if (e instanceof BundleRefusal) return e; throw e } }

let M: Made
beforeAll(async () => { M = await made() })

async function headOf(base: unknown, orig: unknown = null) {
  const chunks = await writeUnitChunks({ paper: PAPER, units: UNITS })
  const head = await writeHead({ paper: { ...PAPER, pages: N }, base: base as never, orig: orig as never, image: IMAGE, units: chunks, lineskip: [1, 0] })
  return { chunks, head, read: await readHead(head.bytes, { ref: head.ref }) }
}

describe('the head of BUNDLE 8', () => {
  it('names the format and its sources and whys', () => {
    expect(BUNDLE5).toBe('12')
    expect(BUNDLES_READ).toEqual(['7', '9', '10', '11', '12'])
    expect(BASE_SOURCES).toEqual(['ours', 'arxiv'])
    expect(BASE_WHYS).toEqual(LAYOUT_REFUSED)
    expect(BASE_WHYS).toEqual(['compile', 'carry', 'engine', 'texlive', 'marks', 'final', 'boxes', 'wrap'])
  })

  it('a base of ours: its pages, year and check, arXiv\'s PDF beside it, in the wire\'s order; the share to a ten-thousandth', async () => {
    const { head, read } = await headOf(OURS, ORIG)
    const wire = parsed(head)
    expect(Object.keys(wire)).toEqual(['bundle', 'kind', 'paper', 'base', 'orig', 'versions', 'units', 'lineskip'])
    expect(Object.keys(wire.base)).toEqual(['source', 'bytes', 'sha256', 'xref', 'pages', 'tree', 'check'])
    expect(wire.base.check).toEqual({ pages: [N, N], boxes: 'equal', carried: 0.9951 })
    expect(read).toMatchObject({ bundle: '12', base: { ...OURS, check: { ...OURS.check, carried: 0.9951 } }, orig: ORIG })
  })

  it('a base of arXiv\'s: a fallback says why, a producer of no base of its own none; no `orig`', async () => {
    const fallback = await headOf({ source: 'arxiv', ...BASE, why: 'final' }, ORIG)
    expect(parsed(fallback.head).base).toEqual({ source: 'arxiv', ...BASE, why: 'final' })
    expect(parsed(fallback.head)).not.toHaveProperty('orig')
    expect(fallback.read).toMatchObject({ base: { source: 'arxiv', ...BASE, why: 'final' }, orig: null })
    for (const why of BASE_WHYS) expect((await headOf({ source: 'arxiv', ...BASE, why })).read.base).toMatchObject({ why })
    // (a base given with no source: arXiv's, as every base was before BUNDLE 8)
    expect((await headOf(BASE)).read.base).toEqual({ source: 'arxiv', ...BASE })
  })

  it('refuses a base out of its shape: no source, another source, a why not one, ours without its check, `orig` or a passing check', async () => {
    const { head } = await headOf(OURS, ORIG)
    const edits: [string, (h: Wire) => void][] = [
      ['base.source', h => { delete h.base.source }],
      ['base.source', h => { h.base.source = 'theirs' }],
      ['orig', h => { delete h.orig }],
      ['orig.sha256', h => { h.orig.sha256 = 'x' }],
      ['base.check.boxes', h => { h.base.check.boxes = 'differ' }],
      ['base.check.pages', h => { h.base.check.pages = [N, N + 1] }],
      ['base.check.carried', h => { h.base.check.carried = 1.5 }],
      ['base.pages', h => { h.base.pages = N + 1 }],
      ['base.tree', h => { h.base.tree = 2025 }],
      ['base.check', h => { delete h.base.check }],
      ['base.xref', h => { h.base.xref = h.base.bytes }],
    ]
    for (const [path, edit] of edits) {
      const h = parsed(head)
      edit(h)
      const f = forged('head', h)
      expect(await refusal(readHead(f.bytes, { ref: f.ref })), path).toMatchObject({ kind: 'head', path })
    }
    const arxiv = parsed((await headOf({ source: 'arxiv', ...BASE, why: 'carry' })).head)
    for (const [path, edit] of [['base.why', (h: Wire) => { h.base.why = 'anchors' }], ['orig', (h: Wire) => { h.orig = ORIG }], ['base.pages', (h: Wire) => { h.base.pages = N }]] as const) {
      const h = structuredClone(arxiv)
      edit(h)
      const f = forged('head', h)
      expect(await refusal(readHead(f.bytes, { ref: f.ref })), path).toMatchObject({ kind: 'head' })
    }
    // (the writer refuses what its reader would)
    await expect(headOf({ ...OURS, check: { ...OURS.check, boxes: 'differ' } }, ORIG)).rejects.toBeInstanceOf(BundleRefusal)
    await expect(headOf(OURS, null)).rejects.toBeInstanceOf(BundleRefusal)
  })

  it('reads a head of 7 as one over arXiv\'s PDF (7\'s three keys, no `orig`), and refuses `source` or `orig` in it', async () => {
    const h = parsed(M.head)
    h.bundle = '7'
    h.base = { ...BASE }
    // (7's versions: no recogniser's, which a head of 10 names)
    delete h.versions.ocr
    const f = forged('head', h)
    const read = await readHead(f.bytes, { ref: f.ref })
    expect(read).toMatchObject({ bundle: '7', base: { source: 'arxiv', ...BASE }, orig: null })
    expect(read.base).not.toHaveProperty('why')
    for (const edit of [(x: Wire) => { x.base.source = 'arxiv' }, (x: Wire) => { x.orig = ORIG }]) {
      const y = structuredClone(h)
      edit(y)
      const g = forged('head', y)
      expect(await refusal(readHead(g.bytes, { ref: g.ref }))).toMatchObject({ kind: 'head' })
    }
    const old = forged('head', { ...h, bundle: '6' })
    expect(await refusal(readHead(old.bytes, { ref: old.ref }))).toMatchObject({ kind: 'head', path: 'bundle' })
  })

  it('reads a part of its head\'s format alone: a part of 7 under a head of 8 is refused', async () => {
    const p = parsed(M.parts[0] as never)
    p.bundle = '7'
    const f = forged('part', p, { from: p.pages[0], to: p.pages[1] })
    expect(await refusal(readPart(f.bytes, { ref: f.ref, index: M.index, chain: null }))).toMatchObject({ kind: 'part', path: 'bundle' })
    // (the same part, of 8, is read)
    const same = forged('part', parsed(M.parts[0] as never), { from: p.pages[0], to: p.pages[1] })
    expect(await refusal(readPart(same.bytes, { ref: same.ref, index: M.index, chain: null }))).toBeNull()
  })
})

describe('layerDraws: the one predicate of whether a head\'s layer draws', () => {
  it('is true for a base of ours alone: a head of 7, and every head over arXiv\'s PDF, with a why or none, draw nothing', async () => {
    expect(layerDraws((await headOf(OURS, ORIG)).read.base)).toBe(true)
    expect(layerDraws((await headOf({ source: 'arxiv', ...BASE, why: 'final' })).read.base)).toBe(false)
    expect(layerDraws((await headOf(BASE)).read.base)).toBe(false)
    const seven = parsed(M.head)
    seven.bundle = '7'
    seven.base = { ...BASE }
    delete seven.versions.ocr
    const f = forged('head', seven)
    expect(layerDraws((await readHead(f.bytes, { ref: f.ref })).base)).toBe(false)
    for (const b of [null, undefined, {}, { source: 'Ours' }, 'ours']) expect(layerDraws(b as never), JSON.stringify(b)).toBe(false)
  })
})

describe('the catalog of BUNDLE 8 names the base', () => {
  const refs = (list: { from: number; to: number; sha256: string; bytes: Uint8Array }[]) => list.map(x => ({ from: x.from, to: x.to, sha256: x.sha256, bytes: x.bytes.length }))

  it('ours by its name, digest and bytes (baseKey); arXiv\'s by its digest and bytes', async () => {
    const sha = OURS.sha256
    expect(baseKey(PAPER.id, PAPER.version, sha)).toBe(`base/${PAPER.id}v${PAPER.version}/${sha}.pdf`)
    expect(baseKey('math/0601001', 2, sha)).toBe(`base/math_0601001v2/${sha}.pdf`)
    expect(() => baseKey(PAPER.id, 1, 'A'.repeat(64))).toThrow(RangeError)
    const { chunks, read } = await headOf(OURS, ORIG)
    expect(catalogBase(read)).toEqual({ source: 'ours', key: baseKey(PAPER.id, PAPER.version, sha), sha256: sha, bytes: OURS.bytes })
    const w = await writeCatalog({ head: read, units: refs(chunks), parts: [], end: { through: 0, refused: 'bound' } })
    const c = await readCatalog(w.bytes, { key: w.key, paper: PAPER })
    expect(c).toMatchObject({ bundle: '12', base: { source: 'ours', key: baseKey(PAPER.id, PAPER.version, sha), sha256: sha, bytes: OURS.bytes } })
    expect(catalogBase(M.readHead)).toEqual({ source: 'arxiv', sha256: BASE.sha256, bytes: BASE.bytes })
  })

  it('refuses a base out of its shape or not the head\'s, and reads a catalog of 7 with none', async () => {
    const { chunks, read } = await headOf(OURS, ORIG)
    const w = await writeCatalog({ head: read, units: refs(chunks), parts: [], end: { through: 0, refused: 'bound' } })
    for (const [path, edit] of [
      ['base.key', (x: Wire) => { x.base.key = 'base/other.pdf' }],
      ['base', (x: Wire) => { delete x.base }],
      ['base.source', (x: Wire) => { x.base.source = 'theirs' }],
      ['base.sha256', (x: Wire) => { x.base.sha256 = 'x' }],
    ] as const) {
      const x = parsed(w)
      edit(x)
      const e = await refusal(readCatalog(new TextEncoder().encode(JSON.stringify(x))))
      expect(e, path).toMatchObject({ kind: 'catalog' })
    }
    // a catalog naming another base than its head's is refused where the index is made
    const x = parsed(w)
    x.base = catalogBase(M.readHead)
    const other = await readCatalog(new TextEncoder().encode(JSON.stringify(x)))
    const chunksRead = [await readUnitsChunk(chunks[0]!.bytes, { ref: chunks[0]!.ref, before: null })]
    expect(() => indexOf(read, chunksRead, { catalog: other })).toThrow(/catalog\.base/)
    expect(() => indexOf(read, chunksRead, { catalog: { ...other, base: catalogBase(read) } })).not.toThrow()
    // (by its fields, whatever their order: another writer, the web's, writes the catalog too; a value not the head's refused)
    const reversed = Object.fromEntries(Object.entries(catalogBase(read)).reverse())
    expect(() => indexOf(read, chunksRead, { catalog: { ...other, base: reversed as never } })).not.toThrow()
    for (const [k, v] of [['sha256', 'f'.repeat(64)], ['bytes', OURS.bytes + 1], ['source', 'arxiv'], ['key', 'base/x.pdf']] as const) {
      expect(() => indexOf(read, chunksRead, { catalog: { ...other, base: { ...reversed, [k]: v } as never } }), k).toThrow(/catalog\.base/)
    }
    expect(() => indexOf(read, chunksRead, { catalog: { ...other, base: { ...catalogBase(read), extra: 1 } as never } })).toThrow(/catalog\.base/)
    // (7's catalog: its keys alone)
    const seven = parsed(w)
    seven.bundle = '7'
    delete seven.base
    delete seven.versions.ocr
    expect(await readCatalog(new TextEncoder().encode(JSON.stringify(seven)))).toMatchObject({ bundle: '7', base: null })
  })
})

describe('a part with no layout of BUNDLE 8 may say why our compile is no base page', () => {
  it('writes and reads `final` and `boxes`', async () => {
    const inputs = partInputs(M.head.sha256, M.lefts)
    for (const refused of ['final', 'boxes'] as const) {
      const w = await writePart({ ...inputs[0]!, layout: { refused, why: 'x' }, rules: null, fileOnly: [] })
      const read = await readPart(w.bytes, { ref: w.ref, index: M.index, chain: null })
      expect(read.noLayout).toEqual({ refused, why: 'x' })
    }
  })
})

describe('a base of ours held as a delta over arXiv\'s PDF (base.kind)', () => {
  // (the delta's bytes and digest; its startxref in the composed document, after arXiv's ORIG.bytes)
  // (arXiv's PDF with its startxref: the section the delta's /Prev names)
  const OX = { ...ORIG, xref: ORIG.bytes - 100 }
  const DELTA = { source: 'ours' as const, kind: 'delta' as const, bytes: 4_000, sha256: 'abcdef0123456789'.repeat(4), xref: ORIG.bytes + 3_500, pages: N, tree: '2025', check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: 0.9 }, replaced: [[1, N]] as [number, number][], stats: { replaced: N, reused: { fonts: 3, images: 1, forms: 0, other: 2 }, included: { bytes: 3_200, objects: N + 4 } } }

  it('names its kinds and bounds; a head without `kind` reads as whole (`full`), one with `kind: full` too', async () => {
    expect(BASE_KINDS).toEqual(['delta', 'full'])
    expect(DELTA_MAX_BYTES).toBe(24 * 2 ** 20)
    expect(DELTA_MAX_SHARE).toBe(0.35)
    expect(REPLACED_MAX).toBe(4096)
    const whole = parsed((await headOf(OURS, ORIG)).head)
    expect(whole.base).not.toHaveProperty('kind')
    whole.base.kind = 'full'
    const f = forged('head', whole)
    expect((await readHead(f.bytes, { ref: f.ref })).base).toEqual({ ...OURS, check: { ...OURS.check, carried: 0.9951 } })
  })

  it('round trips: its section\'s bytes, digest and startxref, the replaced ranges and the counts, `orig` the original it extends', async () => {
    const { head, read } = await headOf(DELTA, OX)
    expect(Object.keys(parsed(head).base)).toEqual(['source', 'kind', 'bytes', 'sha256', 'xref', 'pages', 'tree', 'check', 'replaced', 'stats'])
    expect(read.base).toEqual(DELTA)
    expect(read.orig).toEqual(OX)
    expect(layerDraws(read.base)).toBe(true)
    // (our pages fewer than arXiv's: a paper of several toplevel sources, its replaced pages within ours)
    const fewer = { ...DELTA, check: { ...DELTA.check, pages: [N - 1, N] as [number, number] }, replaced: [[1, N - 1]] as [number, number][], stats: { ...DELTA.stats, replaced: N - 1 } }
    expect((await headOf(fewer, OX)).read.base).toEqual(fewer)
  })

  it('refuses every violation: kind unknown, replaced malformed, out of range, overlapping, descending, no orig, `over`, counts not integers, on arXiv\'s', async () => {
    const { head } = await headOf(DELTA, OX)
    const edits: [string, (h: Wire) => void][] = [
      ['base.kind', h => { h.base.kind = 'patch' }],
      ['base.kind', h => { h.base.kind = 1 }],
      ['base.replaced', h => { h.base.replaced = 'all' }],
      ['base.replaced', h => { h.base.replaced = [] }],
      ['base.replaced', h => { h.base.replaced = [[1]] }],
      ['base.replaced', h => { h.base.replaced = [[0, 1]] }],
      ['base.replaced', h => { h.base.replaced = [[1, N + 1]] }],
      ['base.replaced', h => { h.base.replaced = [[2, 1]] }],
      ['base.replaced', h => { h.base.replaced = [[1, 2], [2, 3]] }],
      ['base.replaced', h => { h.base.replaced = [[3, 3], [1, 1]] }],
      ['base.replaced', h => { h.base.replaced = [[1, 1], [2, 2]] }],
      ['base.replaced', h => { h.base.check.pages = [N - 1, N] }],
      ['orig', h => { delete h.orig }],
      ['orig.xref', h => { delete h.orig.xref }],
      ['orig.xref', h => { h.orig.xref = ORIG.bytes }],
      ['base.over', h => { h.base.over = { ...ORIG } }],
      ['base.stats.reused.fonts', h => { h.base.stats.reused.fonts = 1.5 }],
      ['base.stats.included.objects', h => { h.base.stats.included.objects = -1 }],
      ['base.stats.replaced', h => { h.base.stats.replaced = N + 1 }],
      ['base.stats.reused.links', h => { h.base.stats.reused.links = 0 }],
      ['base.stats.included.bytes', h => { h.base.stats.included.bytes = DELTA.bytes + 1 }],
      ['base.xref', h => { h.base.xref = ORIG.bytes - 1 }],
      ['base.xref', h => { h.base.xref = ORIG.bytes + DELTA.bytes }],
      ['base.bytes', h => { h.base.bytes = DELTA_MAX_BYTES + 1 }],
      ['base.check.pages', h => { h.base.check.pages = [N + 1, N] }],
      ['base.check.pages', h => { h.base.check.pages = [0, N] }],
    ]
    for (const [path, edit] of edits) {
      const h = parsed(head)
      edit(h)
      const f = forged('head', h)
      expect(await refusal(readHead(f.bytes, { ref: f.ref })), path).toMatchObject({ kind: 'head', path })
    }
    // (a whole base of ours keeps its equal page count; arXiv's base takes no kind)
    const whole = parsed((await headOf(OURS, ORIG)).head)
    whole.base.check.pages = [N - 1, N]
    const w = forged('head', whole)
    expect(await refusal(readHead(w.bytes, { ref: w.ref }))).toMatchObject({ kind: 'head', path: 'base.check.pages' })
    const arxiv = parsed((await headOf({ source: 'arxiv', ...BASE, why: 'carry' })).head)
    arxiv.base.kind = 'delta'
    const a = forged('head', arxiv)
    expect(await refusal(readHead(a.bytes, { ref: a.ref }))).toMatchObject({ kind: 'head' })
    // (the writer refuses what its reader would; deltaBaseWhy says why without a throw)
    await expect(headOf({ ...DELTA, replaced: [[2, 1]] }, OX)).rejects.toBeInstanceOf(BundleRefusal)
    expect(deltaBaseWhy(DELTA, OX, N)).toBeNull()
    expect(deltaBaseWhy({ ...DELTA, stats: { ...DELTA.stats, replaced: 1 } }, OX, N)).toMatch(/stats\.replaced/)
    expect(deltaBaseWhy({ ...DELTA, kind: 'full' }, OX, N)).toMatch(/base\.kind/)
    // (a whole head's orig takes no xref)
    const wo = parsed((await headOf(OURS, ORIG)).head)
    wo.orig.xref = 1
    const fw = forged('head', wo)
    expect(await refusal(readHead(fw.bytes, { ref: fw.ref }))).toMatchObject({ kind: 'head', path: 'orig.xref' })
  })

  it('the catalog names the delta as a bundle object under the CTAG (deltaKey), never a /base/ PDF; the chain starts after arXiv\'s bytes and the delta\'s', async () => {
    const { chunks, read } = await headOf(DELTA, OX)
    expect(deltaKey(PAPER.id, PAPER.version, DELTA.sha256)).toBe(keyOf(PAPER.id, PAPER.version, CTAG5, DELTA.sha256).replace(/\.json$/, '.delta'))
    expect(deltaKey(PAPER.id, PAPER.version, DELTA.sha256)).toMatch(/^layer\/.+\/[0-9a-f]{64}\.delta$/)
    expect(catalogBase(read)).toEqual({ source: 'ours', kind: 'delta', object: { key: deltaKey(PAPER.id, PAPER.version, DELTA.sha256), sha256: DELTA.sha256, bytes: DELTA.bytes } })
    const refs = chunks.map(x => ({ from: x.from, to: x.to, sha256: x.sha256, bytes: x.bytes.length }))
    const w = await writeCatalog({ head: read, units: refs, parts: [], end: { through: 0, refused: 'bound' } })
    const c = await readCatalog(w.bytes, { key: w.key, paper: PAPER })
    expect(c.base).toEqual(catalogBase(read))
    const chunksRead = [await readUnitsChunk(chunks[0]!.bytes, { ref: chunks[0]!.ref, before: null })]
    expect(() => indexOf(read, chunksRead, { catalog: c })).not.toThrow()
    expect(() => indexOf(read, chunksRead, { catalog: { ...c, base: { ...catalogBase(read), object: { ...(catalogBase(read) as { object: object }).object, bytes: 1 } } as never } })).toThrow(/catalog\.base/)
    for (const [path, edit] of [
      ['base.object.key', (x: Wire) => { x.base.object.key = baseKey(PAPER.id, PAPER.version, DELTA.sha256) }],
      ['base.kind', (x: Wire) => { x.base.kind = 'full' }],
      ['base.object', (x: Wire) => { x.base.object.extra = 1 }],
      ['base.object.bytes', (x: Wire) => { x.base.object.bytes = 0 }],
    ] as const) {
      const x = parsed(w)
      edit(x)
      expect(await refusal(readCatalog(new TextEncoder().encode(JSON.stringify(x)))), path).toMatchObject({ kind: 'catalog' })
    }
  })
})

describe('checkDelta: the bytes a delta head names, checked by a holder of them (the Worker, a reader)', () => {
  it('takes the delta whose length, digest, section over the head\'s orig and startxref are the head\'s; refuses any other', async () => {
    const OX = { ...ORIG, xref: ORIG.bytes - 100 }
    const d = await deltaOf(OX, [1, N])
    const base = { source: 'ours' as const, kind: 'delta' as const, bytes: d.bytes.length, sha256: d.sha256, xref: d.xref, pages: N, tree: '2025', check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: 1 }, replaced: d.replaced, stats: d.stats }
    const { read } = await headOf(base, OX)
    expect(await checkDelta(read, d.bytes)).toBeNull()
    const flipped = d.bytes.slice()
    flipped[5] = (flipped[5] ?? 0) ^ 1
    expect(await checkDelta(read, flipped)).toMatch(/digest/)
    expect(await checkDelta(read, d.bytes.subarray(1))).toMatch(/bytes/)
    expect(await checkDelta({ ...read, orig: { ...OX, xref: OX.xref - 1 } }, d.bytes)).toMatch(/Prev/)
    expect(await checkDelta((await headOf(OURS, ORIG)).read, d.bytes)).toMatch(/not a head/)
  })
})

describe('a base of ours whose pages are wrapped by optional content (base.stats, base.unhidden, base.labelKept)', () => {
  const WRAP = { stats: { wrapped: N, refusedPages: 0, unhidden: { marks: 1, across: 0, spell: 1, page: 0, bounds: 0 }, split: 2, groups: 40, labelKept: 1 }, unhidden: [[1, 'marks'], [4, 'spell']] as [number, string][], labelKept: [7] }
  const OX = { ...ORIG, xref: ORIG.bytes - 100 }
  const DELTA = { source: 'ours' as const, kind: 'delta' as const, bytes: 4_000, sha256: 'abcdef0123456789'.repeat(4), xref: ORIG.bytes + 3_500, pages: N, tree: '2025', check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: 0.9 }, replaced: [[1, N]] as [number, number][], stats: { replaced: N, reused: { fonts: 3, images: 1, forms: 0, other: 2 }, included: { bytes: 3_200, objects: N + 4 } } }

  it('round trips on a whole base and on a delta, the delta\'s own counts beside the wrap\'s', async () => {
    const full = await headOf({ ...OURS, ...WRAP }, ORIG)
    expect(Object.keys(parsed(full.head).base)).toEqual(['source', 'bytes', 'sha256', 'xref', 'pages', 'tree', 'check', 'stats', 'unhidden', 'labelKept'])
    expect(full.read.base).toMatchObject({ stats: WRAP.stats, unhidden: WRAP.unhidden, labelKept: WRAP.labelKept })
    const delta = await headOf({ ...DELTA, stats: { ...DELTA.stats, ...WRAP.stats }, unhidden: WRAP.unhidden, labelKept: WRAP.labelKept }, OX)
    expect(delta.read.base).toMatchObject({ stats: { ...DELTA.stats, ...WRAP.stats }, unhidden: WRAP.unhidden, labelKept: WRAP.labelKept })
    // (an unwrapped base: no fields, as before)
    expect((await headOf(OURS, ORIG)).read.base).not.toHaveProperty('unhidden')
  })

  it('refuses lists the counts do not match, out of order, a code not one, an id in both, or past UNHIDDEN_MAX', async () => {
    const { head } = await headOf({ ...OURS, ...WRAP }, ORIG)
    const edits: [string, (h: Wire) => void][] = [
      ['base.stats.unhidden', h => { h.base.stats.unhidden.spell = 0 }],
      ['base.unhidden[1]', h => { h.base.unhidden = [[4, 'spell'], [1, 'marks']] }],
      ['base.unhidden[0]', h => { h.base.unhidden[0][1] = 'lost' }],
      ['base.labelKept[0]', h => { h.base.labelKept = [4] }],
      ['base.stats.labelKept', h => { h.base.labelKept = [] }],
      ['base.unhidden', h => { h.base.unhidden = Array.from({ length: 8001 }, (_, i) => [i, 'marks']); h.base.stats.unhidden.marks = 8001; h.base.stats.unhidden.spell = 0; h.base.labelKept = []; h.base.stats.labelKept = 0 }],
      ['base.stats', h => { delete h.base.stats }],
    ]
    for (const [path, edit] of edits) {
      const w = parsed(head)
      edit(w)
      const f = forged('head', w)
      const e = await refusal(readHead(f.bytes, { ref: f.ref }))
      expect(e, path).toBeInstanceOf(BundleRefusal)
      expect(e?.path ?? '', path).toContain(path.split('[')[0])
    }
  })
})
