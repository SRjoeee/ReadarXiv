import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import {
  BUNDLE, BUNDLE_CAP, BUNDLE_VALUES, type BundleParts, type BundleUnit, BundleRefusal, bundleKey, bundleUnitsOf, CTAG, type ReadBundle, readBundle, UNIT_FLAG_BITS, VTAG, writeBundle,
} from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { ADDON_CAP, REMOVAL, type RemovalManifest } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { encodeLayout, LAYOUT, type LayoutFile, PH_KINDS, UNIT_FLAG, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { PIPELINE_VERSION as LIVE_PIPELINE } from '@/pdf-reader/engine/pipeline/live.mjs'
import { displayEdges } from '@/pdf-reader/engine/translate/mt.mjs'
import { PDFJS, PIPELINE_VERSION } from '@/pdf-reader/engine/pipeline/versions.mjs'

// The layer bundle (the layer-only plan §3, A2's E7): one JSON file a paper version, written by the engine where the
// paper is prepared and read by both readers with the engine's one parser, within bounds. Synthetic inputs only: the
// five papers' bundles are checked by spikes/bundle-check.mjs

afterEach(() => { vi.restoreAllMocks() })

const utf8 = (s: string) => new TextEncoder().encode(s)
const textOf = (b: Uint8Array) => new TextDecoder().decode(b)

/** a paper as openPaper gives it: a title, a footnote nested in a paragraph that holds every kind of piece, a table's
 *  header (a name, kept) and a cell opened by \multirow{ and \shortstack{ that the next cell closes, a heading of the
 *  front matter written back in brackets, an author */
function paperOf(): { units: SourceUnit[]; kept: Set<SourceUnit> } {
  const note: SourceUnit = { kind: 'footnote', pieces: [{ t: 'text', s: 'A note.' }] }
  const units: SourceUnit[] = [
    { kind: 'heading', title: true, pieces: [{ t: 'text', s: 'A Title' }] },
    note,
    {
      kind: 'para', trail: 'xy',
      pieces: [
        { t: 'text', s: 'Text with ' }, { t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: 'bold' }, { t: 'close', id: 1, src: '}' },
        { t: 'ph', src: '$x$' }, { t: 'text', s: ' caf\u00c3\u00a9', src: " caf\\'e" }, { t: 'nested', pre: '\\footnote{', unit: note, post: '}' },
      ],
    },
    { kind: 'cell', cell: { table: 0, row: 0, col: 0, span: 1, head: true }, pieces: [{ t: 'text', s: 'Model' }] },
    { kind: 'cell', cell: { table: 0, row: 1, col: 0, span: 2, head: false }, pieces: [{ t: 'open', id: 58, src: '\\multirow{2}{*}{' }, { t: 'open', id: 59, src: '\\shortstack{' }, { t: 'text', s: 'ASR' }] },
    { kind: 'cell', cell: { table: 0, row: 2, col: 0, span: 1, head: false }, pieces: [{ t: 'text', s: 'down' }, { t: 'close', id: 59, src: '}' }, { t: 'close', id: 58, src: '}' }] },
    { kind: 'heading', depth: 1, front: true, bracketed: true, lead: 'a', inner: 'b c', pieces: [{ t: 'text', s: 'Intro' }] },
    { kind: 'author', pieces: [{ t: 'text', s: 'Ada' }] },
  ]
  return { units, kept: new Set([units[3] as SourceUnit]) }
}
const UNITS: BundleUnit[] = [
  ['heading', UNIT_FLAG_BITS.TITLE, null, null, null, [[0, 'A Title']]],
  ['footnote', 0, null, null, null, [[0, 'A note.']]],
  ['para', 0, null, null, { trail: 'xy' }, [[0, 'Text with '], [2, 1, '\\textbf{'], [0, 'bold'], [3, 1, '}'], [1, '$x$'], [0, ' caf\u00c3\u00a9', " caf\\'e"], [4, '\\footnote{', 1, '}']]],
  ['cell', UNIT_FLAG_BITS.KEPT, null, { table: 0, row: 0, col: 0, span: 1, head: true }, null, [[0, 'Model']]],
  ['cell', 0, null, { table: 0, row: 1, col: 0, span: 2, head: false }, null, [[2, 58, '\\multirow{2}{*}{'], [2, 59, '\\shortstack{'], [0, 'ASR']]],
  ['cell', 0, null, { table: 0, row: 2, col: 0, span: 1, head: false }, null, [[0, 'down'], [3, 59, '}'], [3, 58, '}']]],
  ['heading', UNIT_FLAG_BITS.FRONT | UNIT_FLAG_BITS.BRACKETED, 1, null, { lead: 'a', inner: 'b c' }, [[0, 'Intro']]],
  ['author', 0, null, null, null, [[0, 'Ada']]],
]

const H = UNIT_KINDS.indexOf('heading'), P = UNIT_KINDS.indexOf('para'), MATH = PH_KINDS.indexOf('math')
/** the paper's layout file: two pages, the title and the paragraph located, the paragraph's formula found */
function layoutOf(): LayoutFile {
  return {
    schema: 2, layout: LAYOUT, pdfjs: PDFJS, paper: { id: '2608.04322', version: 1, pages: 2 }, left: '',
    views: [0, 0, 612, 792, 0, 0, 612, 792], fonts: ['CMR10'],
    units: [[0, H, 9, UNIT_FLAG.TITLE, 1], [2, P, 9, 0, 7]],
    lines: [[0, [1, 150, 460, 700, 712, 696, 17.28, 0]], [2, [1, 72, 540, 650, 657.5, 647.25, 10, 0]]],
    frames: [[0, [1, 0, 0, 1, -1, 30]], [2, [1, 0, 0, 1, -1, 12.5]]],
    erase: [], ph: [[2, 4, MATH, 0, 1, 100, 650, 110, 657, 647]], labels: [], headings: [[0, 'A Title']], pageText: [], held: [], names: [],
  }
}
/** the add-on's bytes after arXiv's: every byte value, so that base64 holds every character */
const tailOf = (n = 300) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)
function manifestOf(appended: number): RemovalManifest {
  return {
    schema: 1, removal: REMOVAL, pages: 2, sets: {},
    page: { 1: { ok: true, units: { 2: [72, 640, 300, 660] }, at: { R: 3 }, dirty: [72, 640, 80, 650] }, 2: { ok: true, rules: [72, 500, 540, 500.4] } },
    appended, stats: { removed: 3, cut: 3 },
  }
}
function partsOf(): BundleParts {
  const tail = tailOf()
  return {
    paper: { id: '2608.04322', version: 1, pages: 2 },
    base: { bytes: 123_456, sha256: '0123456789abcdef'.repeat(4), url: '/api/v1/original/2608.04322v1' },
    image: '1',
    units: bundleUnitsOf(paperOf()),
    left: {
      kinds: UNITS.map(u => u[0]),
      pages: [[0, 0, 612, 792], [0, 0, 612, 792]],
      units: [[0, 0, [[1, 150, 696, 460, 712]]], [2, 12, [[1, 72, 647, 540, 657.5], [2, 72, 700, 300, 710]]], [3, 40, [[2, 100, 600, 140, 610]]]],
    },
    layout: layoutOf(),
    addon: { manifest: manifestOf(tail.length), tail },
  }
}
const ENGINE = { bundle: BUNDLE, pipeline: PIPELINE_VERSION, layout: LAYOUT, removal: REMOVAL, pdfjs: PDFJS }
/** the written bundle's JSON, as a reader parses it, to break */
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the bundle's types on purpose
const written = (): any => JSON.parse(textOf(writeBundle(partsOf())))
/** `b` as bytes again */
const bytesOf = (b: unknown) => utf8(JSON.stringify(b))
/** the refusal readBundle throws for `b`, or null */
function refusalOf(b: unknown, caps?: { bytes?: number; values?: number }): BundleRefusal | null {
  try { readBundle(typeof b === 'string' || b instanceof Uint8Array ? b : bytesOf(b), caps) } catch (e) { if (e instanceof BundleRefusal) return e; throw e }
  return null
}
// biome-ignore lint/suspicious/noExplicitAny: as `written`
const broken = (edit: (b: any) => void) => { const b = written(); edit(b); return b }

describe('the versions a bundle names', () => {
  it('PDFJS is the pinned pdfjs-dist, and PIPELINE_VERSION one constant that live.mjs re-exports', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }
    expect(PDFJS).toBe(pkg.dependencies['pdfjs-dist'])
    expect(JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8')).version).toBe(PDFJS)
    expect(PIPELINE_VERSION).toBe('10')
    expect(LIVE_PIPELINE).toBe(PIPELINE_VERSION)
  })

  it('CTAG names the reader\'s contract, VTAG the content, and bundleKey is layer/<id>v<n>/<VTAG>.json, an old identifier\'s slash written _', () => {
    expect(BUNDLE).toBe('2')
    expect(CTAG).toBe(`b${BUNDLE}-j${PDFJS}`)
    expect(VTAG).toBe(`${CTAG}-p${PIPELINE_VERSION}-l${LAYOUT}-r${REMOVAL}`)
    const vtag = VTAG
    expect(vtag).toBe('b2-j6.3.289-p10-l4-r5')
    expect(bundleKey('1706.03762', 7)).toBe(`layer/1706.03762v7/${vtag}.json`)
    expect(bundleKey('hep-th/9901001', 1)).toBe(`layer/hep-th_9901001v1/${vtag}.json`)
    // (the web's vtag form, src/shared/identity.ts VTAG_FORM, is stricter than a token of letters, digits and points)
    for (const v of [BUNDLE, PIPELINE_VERSION, LAYOUT, REMOVAL, PDFJS]) {
      expect(v).toMatch(/^[0-9A-Za-z.]+$/)
      expect(v).toMatch(/^[0-9a-z.]{1,16}$/)
    }
    for (const [id, v] of [['1706.03762v7', 7], ['1706.03762', 0], ['1706.03762', 1.5], ['1706.03762', '7'], ['../x', 1], [7, 1]] as const) {
      expect(() => bundleKey(id as string, v as number)).toThrow(RangeError)
    }
  })
})

describe('bundleUnitsOf', () => {
  it('gives each unit its kind, flags, depth, table cell, display edges and pieces, positions dropped, a nested unit by its id', () => {
    const paper = paperOf()
    expect(bundleUnitsOf(paper)).toEqual(UNITS)
    // its edges are displayEdges' (mt.mjs), restated in bundle.mjs so that the reader's parse loads no front end
    bundleUnitsOf(paper).forEach((u, i) => {
      const edges = displayEdges(paper.units[i] as SourceUnit)
      expect(u[4]).toEqual(Object.keys(edges).length ? edges : null)
    })
    // language-independent, and the same twice
    expect(JSON.stringify(bundleUnitsOf(paperOf()))).toBe(JSON.stringify(bundleUnitsOf(paper)))
  })

  it('throws on a piece the front end does not make, and on a nested unit that is not the paper\'s', () => {
    const paper = paperOf()
    ;(paper.units[7] as SourceUnit).pieces.push({ t: 'other' })
    expect(() => bundleUnitsOf(paper)).toThrow()
    const stray = paperOf()
    ;(stray.units[7] as SourceUnit).pieces.push({ t: 'nested', pre: '', unit: { kind: 'footnote', pieces: [] }, post: '' })
    expect(() => bundleUnitsOf(stray)).toThrow()
  })
})

describe('writeBundle, then readBundle', () => {
  it('is the identity: every part as it was given, the engine\'s versions with the image, the tail its bytes', () => {
    const parts = partsOf()
    const bytes = writeBundle(parts)
    for (const json of [bytes, textOf(bytes)]) {
      const r: ReadBundle = readBundle(json)
      expect(r.schema).toBe(1)
      expect(r.paper).toEqual(parts.paper)
      expect(r.base).toEqual(parts.base)
      expect(r.versions).toEqual({ ...ENGINE, image: '1' })
      expect(r.units).toEqual(parts.units)
      expect(r.units).toEqual(UNITS)
      expect(r.left).toEqual(parts.left)
      expect(r.layout).toEqual(parts.layout)
      expect(r.addon?.manifest).toEqual(parts.addon?.manifest)
      expect(r.addon?.tail).toEqual(parts.addon?.tail)
      expect(r.dropped).toEqual([])
    }
  })

  it('is deterministic, in a fixed order, the layout as its file writes it and the tail as base64', () => {
    const a = writeBundle(partsOf()), b = writeBundle(partsOf())
    expect(textOf(a)).toBe(textOf(b))
    const json = JSON.parse(textOf(a))
    expect(Object.keys(json)).toEqual(['schema', 'paper', 'base', 'versions', 'units', 'left', 'layout', 'addon'])
    expect(Object.keys(json.versions)).toEqual(['bundle', 'pipeline', 'layout', 'removal', 'pdfjs', 'image'])
    expect(textOf(a)).toContain(`"layout":${encodeLayout(layoutOf())},"addon":`)
    expect(json.addon.tail).toBe(Buffer.from(tailOf()).toString('base64'))
  })

  it('carries a tail of any length through base64, and no add-on or no layout as null', () => {
    for (let n = 1; n <= 7; n++) {
      const parts = partsOf(), tail = tailOf(n)
      parts.addon = { manifest: manifestOf(n), tail }
      const json = JSON.parse(textOf(writeBundle(parts)))
      expect(json.addon.tail).toBe(Buffer.from(tail).toString('base64'))
      expect(readBundle(writeBundle(parts)).addon?.tail).toEqual(tail)
    }
    const parts = { ...partsOf(), layout: null, addon: null }
    const r = readBundle(writeBundle(parts))
    expect([r.layout, r.addon]).toEqual([null, null])
  })
})

describe('readBundle refuses', () => {
  it('bytes past caps.bytes before they are decoded, malformed UTF-8, text that is not JSON, and a value of another type', () => {
    const bytes = writeBundle(partsOf())
    const parse = vi.spyOn(JSON, 'parse')
    expect(refusalOf(bytes, { bytes: bytes.length - 1 })?.why).toBe(`more than ${bytes.length - 1} bytes`)
    expect(refusalOf(textOf(bytes), { bytes: bytes.length - 1 })?.why).toBe(`more than ${bytes.length - 1} bytes`)
    // (a string's bytes are its UTF-8's: a two-byte character counts two)
    expect(refusalOf('"\u00e9"', { bytes: 3 })?.why).toBe('more than 3 bytes')
    expect(refusalOf(new Uint8Array([0x7b, 0xff, 0x7d]))?.why).toBe('malformed UTF-8')
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
    expect(refusalOf('"\u00e9"', { bytes: 4 })?.why).toBe('not an object (string)')
    expect(refusalOf(utf8('{"schema":1,'))?.why).toBe('not JSON')
    expect(() => readBundle({} as unknown as Uint8Array)).toThrow(BundleRefusal)
    expect(BUNDLE_CAP).toBe(4 * 2 ** 20)
  })

  it('past BUNDLE_VALUES, JSON.parse is not called; nor past caps.values, nor nested deeper than a bundle is', () => {
    const text = `{"schema":1,"units":[${'0,'.repeat(BUNDLE_VALUES)}0]}`
    expect(text.length).toBeLessThan(BUNDLE_CAP)
    const parse = vi.spyOn(JSON, 'parse')
    expect(refusalOf(utf8(text))?.why).toBe(`more than ${BUNDLE_VALUES} values`)
    expect(refusalOf(writeBundle(partsOf()), { values: 100 })?.why).toBe('more than 100 values')
    expect(refusalOf(utf8(`{"units":${'['.repeat(8)}${']'.repeat(8)}}`))?.why).toMatch(/nested more than \d+ deep/)
    expect(parse).not.toHaveBeenCalled()
  })

  it('another schema, a key not of the schema, a part missing', () => {
    expect(refusalOf(broken(b => { b.schema = 2 }))?.why).toMatch(/^schema/)
    expect(refusalOf(broken(b => { b.more = 1 }))?.why).toMatch(/^more: not a key/)
    expect(refusalOf(broken(b => { delete b.left }))?.why).toMatch(/^left: missing/)
    expect(refusalOf([])?.why).toMatch(/not an object/)
  })

  it('another bundle format or PDF.js than the reader\'s; a newer maker is read (its pipeline, layout, remover and image named, never compared)', () => {
    for (const k of ['bundle', 'pdfjs']) expect(refusalOf(broken(b => { b.versions[k] = `${b.versions[k]}0` }))?.why).toMatch(new RegExp(`^versions\\.${k}: not this reader's`))
    // (the layout file and the manifest name their makers' too, and are read whoever made them: refused by their schema)
    for (const [k, v] of [['pipeline', '11'], ['layout', '4'], ['removal', '5'], ['image', '2'], ['image', 'sha.0123abc']] as const) {
      const r = readBundle(bytesOf(broken(b => { b.versions[k] = v })))
      expect(r.versions[k]).toBe(v)
      expect(r.dropped).toEqual([])
    }
    for (const k of ['pipeline', 'layout', 'removal', 'image']) {
      for (const v of ['', '1 0', '1-0', 'x'.repeat(33), 10, null]) expect(refusalOf(broken(b => { b.versions[k] = v }))?.why).toMatch(new RegExp(`^versions\\.${k}: not a version`))
      expect(refusalOf(broken(b => { b.versions[k] = 'x'.repeat(32) }))).toBeNull()
    }
    expect(refusalOf(broken(b => { delete b.versions.image }))?.why).toMatch(/^versions\.image: missing/)
  })

  it('a paper that is not one, a base whose digest is not 64 hex digits or whose bytes are not 1 to 2^31, another URL', () => {
    expect(refusalOf(broken(b => { b.paper.id = '2608.04322v1' }))?.why).toMatch(/^paper\.id/)
    expect(refusalOf(broken(b => { b.paper.version = 0 }))?.why).toMatch(/^paper\.version/)
    expect(refusalOf(broken(b => { b.paper.pages = 0 }))?.why).toMatch(/^paper\.pages/)
    for (const sha of ['0123456789abcdef'.repeat(4).slice(1), '0123456789ABCDEF'.repeat(4), `${'0'.repeat(63)}g`, 7]) expect(refusalOf(broken(b => { b.base.sha256 = sha }))?.why).toMatch(/^base\.sha256/)
    for (const n of [0, 2 ** 31 + 1, 1.5, '12']) expect(refusalOf(broken(b => { b.base.bytes = n }))?.why).toMatch(/^base\.bytes/)
    expect(refusalOf(broken(b => { b.base.bytes = 2 ** 31 }))).toBeNull()
    expect(refusalOf(broken(b => { b.base.url = 'https://example.org/x.pdf' }))?.why).toMatch(/^base\.url/)
  })

  it('a left of another shape: its kinds, its pages as boxes, its units [id, stream, rects] of the bundle\'s units and pages', () => {
    expect(refusalOf(broken(b => { b.left.kinds.pop() }))?.why).toMatch(/^left\.kinds/)
    expect(refusalOf(broken(b => { b.left.kinds[2] = 'cell' }))?.why).toMatch(/^left\.kinds\[2\]/)
    expect(refusalOf(broken(b => { b.left.pages.pop() }))?.why).toMatch(/^left\.pages/)
    expect(refusalOf(broken(b => { b.left.pages[1] = [0, 0, 0, 792] }))?.why).toMatch(/^left\.pages\[1\]/)
    expect(refusalOf(broken(b => { b.left.units[1][0] = 8 }))?.why).toMatch(/^left\.units\[1\]\[0\]/)
    expect(refusalOf(broken(b => { b.left.units[1][0] = 0 }))?.why).toMatch(/^left\.units\[1\]\[0\]/)
    expect(refusalOf(broken(b => { b.left.units[1][1] = -1 }))?.why).toMatch(/^left\.units\[1\]\[1\]/)
    expect(refusalOf(broken(b => { b.left.units[1][2] = [] }))?.why).toMatch(/^left\.units\[1\]\[2\]/)
    expect(refusalOf(broken(b => { b.left.units[1][2][1][0] = 3 }))?.why).toMatch(/^left\.units\[1\]\[2\]\[1\]\[0\]/)
    expect(refusalOf(broken(b => { b.left.units[1][2][1][3] = '300' }))?.why).toMatch(/^left\.units\[1\]\[2\]\[1\]\[3\]/)
  })

  it("a left rectangle that is not a box within its page's view, as the layout file's are (by 1 pt)", () => {
    // (x1 not right of x0, y1 not above y0)
    expect(refusalOf(broken(b => { b.left.units[1][2][0] = [1, 540, 647, 72, 657.5] }))?.why).toBe('left.units[1][2][0][3]: an empty box')
    expect(refusalOf(broken(b => { b.left.units[1][2][0] = [1, 72, 657.5, 540, 647] }))?.why).toBe('left.units[1][2][0][4]: an empty box')
    expect(refusalOf(broken(b => { b.left.units[1][2][0] = [1, 72, 647, 72, 657.5] }))?.why).toBe('left.units[1][2][0][3]: an empty box')
    // (past its page's view, 612 by 792, by more than the point)
    expect(refusalOf(broken(b => { b.left.units[1][2][0][3] = 640 }))?.why).toBe("left.units[1][2][0][3]: not a number within its page's view (number)")
    expect(refusalOf(broken(b => { b.left.units[1][2][0][1] = -2 }))?.why).toBe("left.units[1][2][0][1]: not a number within its page's view (number)")
    expect(refusalOf(broken(b => { b.left.units[1][2][0][4] = 793.5 }))?.why).toBe("left.units[1][2][0][4]: not a number within its page's view (number)")
    // (within it by the point: read)
    expect(refusalOf(broken(b => { b.left.units[1][2][0][3] = 612.5; b.left.units[1][2][0][1] = -0.5 }))).toBeNull()
  })

  it("a layout of another PDF.js than the bundle names (the reader's)", () => {
    expect(refusalOf(broken(b => { b.layout.pdfjs = '6.3.288' }))?.why).toBe(`layout.pdfjs: not the bundle's PDF.js '${PDFJS}'`)
  })

  it("a layout whose pages' views are not the left's, by more than the point", () => {
    expect(refusalOf(broken(b => { b.layout.views[2] = 614 }))?.why).toBe("layout.views[2]: not the left's page 1 within 1 pt")
    expect(refusalOf(broken(b => { b.left.pages[1] = [0, 0, 600, 792] }))?.why).toBe("layout.views[6]: not the left's page 2 within 1 pt")
    expect(refusalOf(broken(b => { b.layout.views[3] = 791.25 }))).toBeNull()
  })

  it('a layout refused by the layout file\'s own rules, or of another paper or other units', () => {
    expect(refusalOf(broken(b => { b.layout.schema = 1 }))?.why).toMatch(/^layout\.schema/)
    expect(refusalOf(broken(b => { b.layout.lines[1][1][0] = 3 }))?.why).toMatch(/^layout\.lines\[1\]\[1\]\[0\]/)
    expect(refusalOf(broken(b => { b.layout.paper.version = 2 }))?.why).toMatch(/^layout\.paper/)
    expect(refusalOf(broken(b => { b.layout.units[1][0] = 9; b.layout.lines[1][0] = 9; b.layout.frames[1][0] = 9; b.layout.ph[0][0] = 9 }))?.why).toMatch(/^layout\.units\[1\]\[0\]/)
    expect(refusalOf(broken(b => { b.layout.units[1][1] = UNIT_KINDS.indexOf('caption') }))?.why).toMatch(/^layout\.units\[1\]\[1\]/)
    expect(refusalOf(broken(b => { b.layout.units[1][4] = 8 }))?.why).toMatch(/^layout\.units\[1\]\[4\]/)
  })

  it("a layout file of a newer maker and a manifest of a newer remover are read: a part is refused by its schema, never by what made it (decision 4)", () => {
    const r = readBundle(bytesOf(broken(b => { b.versions.layout = '5'; b.layout.layout = '5'; b.versions.removal = '6'; b.addon.manifest.removal = '6' })))
    expect([r.layout?.layout, r.addon?.manifest.removal, r.dropped]).toEqual(['5', '6', []])
    expect(refusalOf(broken(b => { b.addon.manifest.schema = 2 }))?.why).toMatch(/^addon\.manifest\.schema/)
  })

  it('a manifest refused by its own rules, its pages the paper\'s; a tail that is not base64 or not the manifest\'s bytes', () => {
    expect(refusalOf(broken(b => { b.addon.manifest.page[1].dirty.push(1) }))?.why).toMatch(/^addon\.manifest\.page\.1\.dirty/)
    expect(refusalOf(broken(b => { b.addon.manifest.pages = 3; b.addon.manifest.page[3] = { ok: true } }))?.why).toMatch(/^addon\.manifest\.pages/)
    // (within the page's view, which the left gives)
    expect(refusalOf(broken(b => { b.addon.manifest.page[2].rules = [72, 500, 640, 501] }))?.why).toMatch(/^addon\.manifest\.page\.2\.rules\[2\]/)
    for (const tail of ['', 'AAA', 'AA=A', 'AB==', 'A===', '****', 7]) expect(refusalOf(broken(b => { b.addon.tail = tail }))?.why).toMatch(/^addon\.tail/)
    expect(refusalOf(broken(b => { b.addon.manifest.appended += 1 }))?.why).toMatch(/^addon\.tail/)
    // one spelling of each tail: the bits its padding leaves are 0 (one byte 0 is AA==, two are AAA=)
    for (const [tail, n] of [['AA==', 1], ['AAA=', 2]] as const) expect(refusalOf(broken(b => { b.addon.tail = tail; b.addon.manifest.appended = n }))).toBeNull()
    for (const [tail, n] of [['AB==', 1], ['AAB=', 2]] as const) expect(refusalOf(broken(b => { b.addon.tail = tail; b.addon.manifest.appended = n }))?.why).toBe('addon.tail: not base64: padded bits not 0')
    expect(refusalOf(broken(b => { b.addon.more = 1 }))?.why).toMatch(/^addon\.more/)
  })

  it('a manifest of the check\'s form (its outline table, its colours, a set past the shipped ones), or a key naming a prototype', () => {
    expect(refusalOf(broken(b => { b.addon.manifest.outlines = { CMR10: ['a', 1, 0, 2, 3] } }))?.why).toBe('addon.manifest.outlines: not a key of the schema')
    expect(refusalOf(broken(b => { b.addon.manifest.colours = { '1.0': [255, 0, 0] } }))?.why).toBe('addon.manifest.colours: not a key of the schema')
    expect(refusalOf(broken(b => { b.addon.manifest.sets = { R: 2, P: 4 } }))?.why).toMatch(/^addon\.manifest\.sets\.P: not a key/)
    expect(refusalOf(broken(b => { b.addon.manifest.page[1].at = { R: 3, P: 4 } }))?.why).toMatch(/^addon\.manifest\.page\.1\.at\.P: not a key/)
    // (the shipped add-on's sets: none, compact, or R at its fixed place)
    expect(refusalOf(broken(b => { b.addon.manifest.sets = { R: 2 }; delete b.addon.manifest.page[1].at }))).toBeNull()
    for (const k of ['constructor', 'prototype']) expect(refusalOf(broken(b => { b.addon.manifest.stats[k] = 1 }))?.why).toMatch(new RegExp(`^addon\\.manifest\\.stats\\.${k}: not a count's name`))
    const text = JSON.stringify(written()).replace('"stats":{', '"stats":{"__proto__":1,')
    expect(refusalOf(text)?.why).toBe('addon.manifest.stats.__proto__: not a count\'s name')
    // and nowhere else may an object read take one
    for (const [at, key] of [['"versions":{', '__proto__'], ['"paper":{', 'constructor'], ['"left":{', 'prototype'], ['"addon":{', '__proto__'], ['"layout":{', '__proto__']] as const) {
      expect(refusalOf(JSON.stringify(written()).replace(at, `${at}"${key}":1,`))?.why).toMatch(/not a key of the schema/)
    }
    expect(readBundle(JSON.stringify(written()).replace('{"trail":"xy"}', '{"trail":"xy","__proto__":"x"}')).dropped).toEqual([2])
  })

  it('a tail past ADDON_CAP (which a bundle within BUNDLE_CAP cannot hold: its base64 is past it)', () => {
    const b = written()
    b.addon.tail = 'A'.repeat(4 * Math.ceil((ADDON_CAP + 1) / 3))
    b.addon.manifest.appended = 3 * (b.addon.tail.length / 4)
    expect(refusalOf(b)?.why).toBe(`more than ${BUNDLE_CAP} bytes`)
    const parse = vi.spyOn(JSON, 'parse')
    expect(refusalOf(b, { bytes: 8 * 2 ** 20 })?.why).toMatch(new RegExp(`^addon\\.tail: .*more than ${ADDON_CAP}`))
    expect(parse).toHaveBeenCalledTimes(1)
    b.addon.tail = 'A'.repeat(4 * Math.floor(ADDON_CAP / 3))
    b.addon.manifest.appended = 3 * (b.addon.tail.length / 4)
    expect(refusalOf(b, { bytes: 8 * 2 ** 20 })).toBeNull()
  })
})

describe('writeBundle never writes a bundle readBundle refuses', () => {
  const para: BundleUnit = ['para', 0, null, null, null, [[0, 'x']]]
  it('past BUNDLE_CAP bytes: the add-on written null, the layout kept', () => {
    // (a tail of 3 MiB: its base64 is 4 MiB)
    const tail = Uint8Array.from({ length: 3 * 2 ** 20 }, (_, i) => (i * 37 + 11) & 255)
    const parts = { ...partsOf(), addon: { manifest: manifestOf(tail.length), tail } }
    const bytes = writeBundle(parts)
    expect(bytes.length).toBeLessThanOrEqual(BUNDLE_CAP)
    const read = readBundle(bytes)
    expect(read.addon).toBeNull()
    expect(read.layout).toEqual(partsOf().layout)
  })
  it('past BUNDLE_VALUES with the add-on dropped: the layout written null too', () => {
    // (a layout of 100 units, 2,000 lines each: 1.6 million values)
    const n = 100, P = UNIT_KINDS.indexOf('para')
    const line = [1, 72, 540, 650, 657.5, 647.25, 10, 0], rows = Array.from({ length: 2000 }, () => line).flat()
    const layout: LayoutFile = {
      ...layoutOf(), units: Array.from({ length: n }, (_, id) => [id, P, 9, 0, 1]), lines: Array.from({ length: n }, (_, id) => [id, rows]),
      frames: Array.from({ length: n }, (_, id) => [id, [1, 0, 0, 2000, -1, 12.5]]), erase: [], ph: [], headings: [],
    } as never
    const parts = { ...partsOf(), units: Array.from({ length: n }, () => para), left: { ...partsOf().left, kinds: Array.from({ length: n }, () => 'para'), units: [] }, layout }
    const read = readBundle(writeBundle(parts))
    expect([read.layout, read.addon]).toEqual([null, null])
    expect(read.units).toHaveLength(n)
  })
  it('past both with neither: throws BundleRefusal', () => {
    // (300 units of 16,000 code units: 4.8 MB of units alone)
    const big: BundleUnit = ['para', 0, null, null, null, [[0, 'x'.repeat(16_000)]]]
    const parts = { ...partsOf(), units: Array.from({ length: 300 }, () => big), left: { ...partsOf().left, kinds: Array.from({ length: 300 }, () => 'para'), units: [] }, layout: null }
    expect(() => writeBundle(parts)).toThrow(BundleRefusal)
  })
})

describe('a bad unit is dropped and counted, the rest standing, ids their indices', () => {
  /** the bundle read with unit `i` edited */
  // biome-ignore lint/suspicious/noExplicitAny: as `written`
  const withUnit = (i: number, edit: (u: any) => void) => readBundle(bytesOf(broken(b => { edit(b.units[i]) })))
  const droppedBy = (i: number, edit: (u: unknown[]) => void) => { const r = withUnit(i, edit); return { dropped: r.dropped, unit: r.units[i], others: r.units.filter((_, j) => j !== i) } }

  it('an open with no close is read, and a close with no open', () => {
    const r = readBundle(writeBundle(partsOf()))
    // cell 4 opens 58 and 59 and closes neither; cell 5 closes both, the earlier unit's
    expect([r.units[4], r.units[5]]).toEqual([UNITS[4], UNITS[5]])
    // a close no unit opens (the front end drops a part with no text with its open), or one before its open, stands
    // (on the author, a unit the layout file does not locate, whose pieces it does not count)
    for (const edit of [(u: unknown[]) => { (u[5] as unknown[]).push([3, 77, '}']) }, (u: unknown[]) => { (u[5] as unknown[]).unshift([3, 2, '}'], [2, 2, '{']) }]) {
      const d = droppedBy(7, edit)
      expect(d.dropped).toEqual([])
      expect(d.others).toEqual(UNITS.filter((_, j) => j !== 7))
    }
    // the unit that opens a group dropped, the one that closes it stands
    expect(readBundle(bytesOf(broken(b => { b.units[4][0] = 'Cell' }))).dropped).toEqual([4])
    // a close of another shape is a bad piece
    for (const p of [[3, 1.5, '}'], [3, -1, '}'], [3, 1], [3, 1, 7], [3, 1, '}', 'x']]) expect(droppedBy(7, u => { (u[5] as unknown[]).push(p) }).dropped).toEqual([7])
  })

  it('a kind not a lower-case word of 1 to 32 letters', () => {
    for (const kind of ['Para', 'para1', '', 'p'.repeat(33), 'p q', 7, null]) expect(droppedBy(7, u => { u[0] = kind }).dropped).toEqual([7])
    // (one of 32 stands, and the left's kinds name it so)
    expect(readBundle(bytesOf(broken(b => { b.units[7][0] = 'p'.repeat(32); b.left.kinds[7] = 'p'.repeat(32) }))).dropped).toEqual([])
  })

  it('a string past 16,000 code units, anywhere in a unit', () => {
    expect(droppedBy(2, u => { (u[5] as unknown[][])[0] = [0, 'x'.repeat(16_001)] }).dropped).toEqual([2])
    expect(droppedBy(2, u => { (u[5] as unknown[][])[0] = [0, 'x'.repeat(16_000)] }).dropped).toEqual([])
    expect(droppedBy(2, u => { (u[5] as unknown[][])[5] = [0, 'x', 'y'.repeat(16_001)] }).dropped).toEqual([2])
    expect(droppedBy(2, u => { (u[5] as unknown[][])[6] = [4, 'x'.repeat(16_001), 1, '}'] }).dropped).toEqual([2])
    expect(droppedBy(2, u => { u[4] = { trail: 'x'.repeat(16_001) } }).dropped).toEqual([2])
  })

  it('a piece tag not one of the six, or a piece not of its tag\'s shape', () => {
    for (const p of [[5, 'x'], ['0', 'x'], [-1, 'x'], [0], [0, 'x', 'y', 'z'], [1, 7], [2, 1.5, '{'], [2, -1, '{'], [3, 1], [4, 'a', 1], 'text', null]) {
      expect(droppedBy(2, u => { (u[5] as unknown[]).splice(1, 0, p) }).dropped).toEqual([2])
    }
  })

  it('a nested piece\'s unit not an id of the bundle, not before it, or dropped', () => {
    for (const id of [8, 2, 3, -1, 1.5, '1']) expect(droppedBy(2, u => { (u[5] as unknown[][])[6] = [4, '\\footnote{', id, '}'] }).dropped).toEqual([2])
    const r = readBundle(bytesOf(broken(b => { b.units[1][0] = 'Footnote' })))
    expect(r.dropped).toEqual([1, 2])
  })

  it('flags, a depth, a cell or edges of another shape', () => {
    for (const edit of [
      (u: unknown[]) => { u[1] = 16 }, (u: unknown[]) => { u[1] = -1 }, (u: unknown[]) => { u[2] = 10 }, (u: unknown[]) => { u[2] = -2 }, (u: unknown[]) => { u[2] = 0.5 },
      (u: unknown[]) => { u[3] = { table: 0, row: 0, col: 0, span: 0, head: false } }, (u: unknown[]) => { u[3] = { table: 0, row: 0, col: 0, span: 1, head: 0 } },
      (u: unknown[]) => { u[3] = { table: 0, row: 0, col: 0, span: 1 } }, (u: unknown[]) => { u[3] = [] },
      (u: unknown[]) => { u[4] = {} }, (u: unknown[]) => { u[4] = { lead: 1 } }, (u: unknown[]) => { u[4] = { before: 'x' } },
      (u: unknown[]) => { u.push(1) }, (u: unknown[]) => { u[5] = {} },
    ]) expect(droppedBy(7, edit).dropped).toEqual([7])
    // a unit that is not even a list
    expect(readBundle(bytesOf(broken(b => { b.units[7] = 'author' }))).dropped).toEqual([7])
  })
})

describe('10,000 seeded hostile mutations of a valid bundle', () => {
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
  const POOL: unknown[] = [null, true, false, 0, -1, 1, 2, 3, 4, 1.5, -0.25, 2 ** 31 + 1, 1e300, -1e300, '', 'x', 'Para', 'para', '\u202e', 'x'.repeat(16_001), [], {}, [0], [0, 'x'], [3, 1, '}'], [4, 'a', 99, 'b'], { lead: 1 }, [1, 0, 0, 1, 1]]
  const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)] as T
  /** every own key of every object in v (the tail's bytes passed over) */
  const ownKeys = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) for (const x of v) ownKeys(x, out)
    else if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) for (const k of Object.keys(v)) { out.push(k); ownKeys((v as Record<string, unknown>)[k], out) }
    return out
  }
  /** every node's path in v */
  const nodes = (v: unknown, path: (string | number)[] = [], out: (string | number)[][] = []) => {
    out.push(path)
    if (Array.isArray(v)) v.forEach((x, i) => { nodes(x, [...path, i], out) })
    else if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) nodes((v as Record<string, unknown>)[k], [...path, k], out)
    return out
  }
  it('throw nothing but BundleRefusal, or read with units dropped', () => {
    const r = random(20261008), base = written(), text = JSON.stringify(base)
    const paths = nodes(base).filter(p => p.length)
    const outcome = { refused: 0, read: 0, dropped: 0 }
    for (let n = 0; n < 10_000; n++) {
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
      // and now and then the text itself: cut short, or a character put in
      if (r() < 0.1) json = r() < 0.5 ? json.slice(0, Math.floor(r() * json.length)) : (i => json.slice(0, i) + pick(r, ['{', '}', '[', ']', ',', ':', '"', '\\', '0', 'x']) + json.slice(i))(Math.floor(r() * json.length))
      // or an object given a key that names a prototype
      if (r() < 0.05) { const opens = [...json.matchAll(/\{/g)].map(m => m.index); const i = pick(r, opens) + 1; json = `${json.slice(0, i)}"${pick(r, ['__proto__', 'constructor', 'prototype'])}":${pick(r, ['0', '{}', '[]', '"x"'])},${json.slice(i)}` }
      let read: ReadBundle | null = null
      try { read = readBundle(utf8(json)) } catch (e) {
        if (!(e instanceof BundleRefusal)) throw new Error(`mutation ${n}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
        outcome.refused++
        continue
      }
      outcome.read++
      if (read.dropped.length) outcome.dropped++
      // ids are indices: a unit null exactly where it was dropped, the dropped rising
      expect(read.dropped).toEqual([...read.dropped].sort((x, y) => x - y))
      read.units.forEach((u, i) => { expect(u === null).toBe(read.dropped.includes(i)) })
      expect(ownKeys(read).filter(k => k === '__proto__' || k === 'constructor' || k === 'prototype')).toEqual([])
    }
    expect(text).toBe(JSON.stringify(written()))
    // (each outcome reached)
    expect(outcome.refused).toBeGreaterThan(1000)
    expect(outcome.read).toBeGreaterThan(100)
    expect(outcome.dropped).toBeGreaterThan(100)
  })
})
