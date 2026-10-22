import { beforeAll, describe, expect, it } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import {
  BASE_SOURCES, BASE_WHYS, BUNDLE5, BUNDLES_READ, baseKey, catalogBase, indexOf, LAYOUT_REFUSED, readCatalog, readHead, readPart, readUnitsChunk, writeCatalog, writeHead, writePart, writeUnitChunks,
} from '@/pdf-reader/engine/layer-proto/format.mjs'
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
    expect(BUNDLE5).toBe('8')
    expect(BUNDLES_READ).toEqual(['7', '8'])
    expect(BASE_SOURCES).toEqual(['ours', 'arxiv'])
    expect(BASE_WHYS).toEqual(LAYOUT_REFUSED)
    expect(BASE_WHYS).toEqual(['compile', 'carry', 'engine', 'texlive', 'marks', 'final', 'boxes'])
  })

  it('a base of ours: its pages, year and check, arXiv\'s PDF beside it, in the wire\'s order; the share to a ten-thousandth', async () => {
    const { head, read } = await headOf(OURS, ORIG)
    const wire = parsed(head)
    expect(Object.keys(wire)).toEqual(['bundle', 'kind', 'paper', 'base', 'orig', 'versions', 'units', 'lineskip'])
    expect(Object.keys(wire.base)).toEqual(['source', 'bytes', 'sha256', 'xref', 'pages', 'tree', 'check'])
    expect(wire.base.check).toEqual({ pages: [N, N], boxes: 'equal', carried: 0.9951 })
    expect(read).toMatchObject({ bundle: '8', base: { ...OURS, check: { ...OURS.check, carried: 0.9951 } }, orig: ORIG })
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
    expect(c).toMatchObject({ bundle: '8', base: { source: 'ours', key: baseKey(PAPER.id, PAPER.version, sha), sha256: sha, bytes: OURS.bytes } })
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
    // (7's catalog: its keys alone)
    const seven = parsed(w)
    seven.bundle = '7'
    delete seven.base
    expect(await readCatalog(new TextEncoder().encode(JSON.stringify(seven)))).toMatchObject({ bundle: '7', base: null })
  })
})

describe('a part with no layout of BUNDLE 8 may say why our compile is no base page', () => {
  it('writes and reads `final` and `boxes`', async () => {
    const inputs = partInputs(M.head.sha256, M.lefts)
    for (const refused of ['final', 'boxes'] as const) {
      const w = await writePart({ ...inputs[0]!, layout: { refused, why: 'x' }, addon: null, fileOnly: [] })
      const read = await readPart(w.bytes, { ref: w.ref, index: M.index, chain: null })
      expect(read.noLayout).toEqual({ refused, why: 'x' })
    }
  })
})
