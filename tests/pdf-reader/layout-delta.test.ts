// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { deflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { encodeAsk, readEntries } from '@/pdf-reader/engine/layout/chain-wire.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'
import { deltaOf, proveDelta } from '@/pdf-reader/engine/layout/delta.mjs'
import { deltaSection, pagesOf, rangesOf, replacedWhy } from '@/pdf-reader/engine/layout/delta-wire.mjs'
import { alignOf, removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf, tailLinks } from '@/pdf-reader/engine/layout/tail.mjs'
import { openObjects } from '@/pdf-reader/engine/layout/xref.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { appendSection } from '@/pdf-reader/engine/layout/section.mjs'
import { concat, ORIG_PACKED, type Obj, origObjects, oursObjects, pdfOf } from './helpers/delta-pdfs'

// Our base as an incremental update over arXiv's PDF (layout/delta.mjs; the delta contract's §2 to §4 and §14): the builder on
// synthetic documents of both cross-reference kinds, its determinism and its reuse, the structural proof and the mutations it
// must catch, and the remover's tail continuing the composed document

const ORIG_TABLE = pdfOf(origObjects(), { root: 1 })
const ORIG_STREAM = pdfOf(origObjects(), { root: 1, kind: 'stream', packed: ORIG_PACKED })
const OURS = pdfOf(oursObjects(), { root: 1 })
const latin = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('')
const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 255)
type Built = Exclude<Awaited<ReturnType<typeof deltaOf>>, { refused: string }>
const built = async (orig: Uint8Array, final = OURS, o: { replacedPages?: number[] } = {}) => {
  const r = await deltaOf(orig, final, { PL, ...o })
  if ('refused' in r) throw new Error(`refused: ${r.refused} ${r.why}`)
  return r as Built
}
const prove = (orig: Uint8Array, delta: Uint8Array, final: Uint8Array, replaced: [number, number][]) => proveDelta(orig, delta, final, { PL, getDocument: getDocument as never, documentOptions: { useSystemFonts: false, isEvalSupported: false }, replaced })
/** PDF.js's text of each page of a document */
async function textOf(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 }), doc = await task.promise
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) out.push(((await (await doc.getPage(p)).getTextContent()).items as { str?: string }[]).map(i => i.str ?? '').join(''))
  await task.destroy()
  return out
}

describe('the object layer as PDF.js reads it (xref.mjs)', () => {
  it('reads a stream by its RESOLVED /Length: the image\'s indirect length, its last byte a carriage return, whole', () => {
    for (const bytes of [ORIG_TABLE, ORIG_STREAM]) {
      const O = openObjects(bytes, { PL, objectsMax: 1000, decodedMax: 1 << 20 })
      const img = O.lookup(PL.PDFRef.of(12, 0)) as { contents: Uint8Array }
      expect(img.contents.length).toBe(12)
      expect(img.contents.at(-1)).toBe(13)
      expect(O.pages().length).toBe(3)
    }
    // (where the object layer's own loader reads it one byte short)
    return PL.PDFDocument.load(ORIG_TABLE, { updateMetadata: false }).then(d => expect((d.context.lookup(PL.PDFRef.of(12, 0)) as unknown as { contents: Uint8Array }).contents.length).toBe(11))
  })

  it('refuses what it will not read safely: encrypted, hybrid, an entry off its object, a /Length not at endstream', () => {
    const swap = (b: Uint8Array, a: string, z: string) => enc(latin(b).replace(a, z))
    const open = (b: Uint8Array) => { try { openObjects(b, { PL, objectsMax: 1000, decodedMax: 1 << 20 }).pages(); return 'read' } catch (e) { return (e as { code?: string }).code } }
    expect(open(swap(ORIG_TABLE, '/Root 1 0 R', '/Root 1 0 R /Encrypt 9 0 R'))).toBe('delta-encrypted')
    expect(open(swap(ORIG_TABLE, '/Root 1 0 R', '/Root 1 0 R /XRefStm 9'))).toBe('delta-xref')
    const t = latin(ORIG_TABLE), i = t.indexOf(' 00000 n', t.indexOf('xref') + 30) - 10, off = Number(t.slice(i, i + 10))
    expect(open(enc(t.slice(0, i) + String(off - 1).padStart(10, '0') + t.slice(i + 10)))).toBe('delta-xref')
    const o = origObjects()
    o.set(13, { text: '9' })
    expect(() => openObjects(pdfOf(o, { root: 1 }), { PL, objectsMax: 1000, decodedMax: 1 << 20 }).lookup(PL.PDFRef.of(12, 0))).toThrow(/does not end at endstream/)
  })
})

describe('deltaOf: the pages ours replaces, written over arXiv\'s PDF', () => {
  it('reuses the original\'s font and image by bytes (other numbers, an indirect /Length), includes the rest, the cycle unmatched', async () => {
    for (const orig of [ORIG_TABLE, ORIG_STREAM]) {
      const r = await built(orig)
      expect(r.replaced).toEqual([[1, 3]])
      // (Helvetica once at the top, the image; Courier, the four content streams, the cycle's two objects and the three pages written)
      expect(r.stats).toEqual({ replaced: 3, reused: { fonts: 1, images: 2, forms: 0, other: 0 }, included: { bytes: r.stats.included.bytes, objects: 3 + 4 + 1 + 2 } })
      const text = latin(r.delta)
      expect(text).toContain('/F7 10 0 R')
      expect(text).toContain('/X9 12 0 R')
      expect(text).toMatch(/\/BaseFont \/Courier/)
      expect(text).not.toMatch(/\/BaseFont \/Helvetica/)
      // (the page objects keep their numbers and the original's keys but /Contents and /Resources)
      expect(text).toMatch(/^4 0 obj\n<< \/Type \/Page \/Parent 2 0 R \/Resources << \/Font << \/F7 10 0 R \/F8 \d+ 0 R >> \/ExtGState << \/G1 \d+ 0 R >> >> \/Contents \d+ 0 R \/Rotate 0 >>/m)
      expect(text).toMatch(/^5 0 obj\n<<[^\n]* \/Contents \[\d+ 0 R \d+ 0 R\] >>/m)
      // (our names stay ours; nothing of our catalog is carried)
      expect(text).not.toContain('/Names')
      expect(r.kind).toBe(orig === ORIG_TABLE ? 'table' : 'stream')
      const sect = deltaSection(r.delta, { bytes: orig.length, xref: startxrefOf(orig)! })
      expect(sect.why).toBeUndefined()
      expect(sect).toMatchObject({ kind: r.kind, startxref: r.xref, prev: startxrefOf(orig), size: r.size })
      expect(startxrefOf(concat([orig, r.delta]))).toBe(r.xref)
    }
  })

  it('is deterministic: the same inputs give the same bytes', async () => {
    for (const orig of [ORIG_TABLE, ORIG_STREAM]) {
      const a = await built(orig), b = await built(orig)
      expect(b.sha256).toBe(a.sha256)
      expect(latin(b.delta)).toBe(latin(a.delta))
    }
  })

  it('writes the original\'s cross-reference kind, runs of numbers in one subsection, objects uncompressed', async () => {
    const t = latin((await built(ORIG_TABLE)).delta)
    expect(t).toMatch(/\nxref\n3 3\n/)
    expect(t).toMatch(/trailer\n<< \/Size \d+ \/Root 1 0 R \/ID \[ ?<0011aabb> <0011aabb> ?\] \/Prev \d+ >>/)
    const s = latin((await built(ORIG_STREAM)).delta)
    expect(s).not.toContain('\nxref\n')
    expect(s).toMatch(/\/Type \/XRef \/Size \d+ \/W \[1 4 2\] \/Index \[3 3 \d+ \d+\]/)
    expect(s).not.toContain('/ObjStm')
  })

  it('leaves a page alone that the layer does not lay on, or whose content is arXiv\'s; refuses our pages past arXiv\'s', async () => {
    const r = await built(ORIG_TABLE, OURS, { replacedPages: [1, 3] })
    expect(r.replaced).toEqual([[1, 1], [3, 3]])
    expect(latin(r.delta)).not.toMatch(/^4 0 obj/m)
    expect(await prove(ORIG_TABLE, r.delta, OURS, r.replaced)).toMatchObject({ ok: true })
    // (a final pass equal to arXiv's: nothing to replace)
    expect(await deltaOf(ORIG_TABLE, ORIG_TABLE, { PL })).toMatchObject({ refused: 'delta-empty' })
    const longer = oursObjects()
    longer.set(2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 41 0 R] /Count 4 >>' })
    longer.set(41, { text: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 26 0 R >>' })
    expect(await deltaOf(ORIG_TABLE, pdfOf(longer, { root: 1 }), { PL })).toMatchObject({ refused: 'delta-pages' })
    expect(await deltaOf(ORIG_TABLE, OURS, { PL, replacedPages: [4] })).toMatchObject({ refused: 'delta-pages' })
  })

  it('a final pass of fewer pages (several toplevel sources): ours replace the first, the rest stay arXiv\'s', async () => {
    const short = oursObjects()
    short.set(2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>' })
    const final = pdfOf(short, { root: 1 })
    const r = await built(ORIG_TABLE, final)
    expect(r.replaced).toEqual([[1, 2]])
    expect(await prove(ORIG_TABLE, r.delta, final, r.replaced)).toEqual({ ok: true, pages: [2, 3], replaced: 2 })
    expect((await textOf(concat([ORIG_TABLE, r.delta])))[2]).toBe('Original page threein Times')
  })

  it('falls back on a bound: past its share of our base page, past the held forms', async () => {
    const big = oursObjects()
    big.set(26, { dict: '', data: enc(`BT /F7 12 Tf 20 100 Td (${'x'.repeat(30_000)}) Tj ET\n`) })
    // (a delta of more than 35 % of our base page)
    const r = await deltaOf(ORIG_TABLE, pdfOf(big, { root: 1 }), { PL })
    expect('refused' in r ? r.refused : 'built').toBe('delta-bound')
    expect(await deltaOf(ORIG_TABLE, OURS, { PL, heldMax: 100 })).toMatchObject({ refused: 'delta-bound' })
  })
})

describe('proveDelta: the structural proof, and every mutation it must catch', () => {
  it('passes on both kinds: the section exact, the graphs ours, PDF.js silent, the text ours', async () => {
    for (const orig of [ORIG_TABLE, ORIG_STREAM]) {
      const r = await built(orig)
      expect(await prove(orig, r.delta, OURS, r.replaced)).toEqual({ ok: true, pages: [3, 3], replaced: 3 })
      expect(await textOf(concat([orig, r.delta]))).toEqual(await textOf(OURS))
    }
  })

  it('fails on an offset moved onto whitespace, a wrong /Prev, a truncated stream, a changed content stream', async () => {
    const r = await built(ORIG_TABLE)
    const t = latin(r.delta)
    const at = t.indexOf(' 00000 n\r\n') - 10, off = Number(t.slice(at, at + 10))
    const shifted = enc(t.slice(0, at) + String(off - 1).padStart(10, '0') + t.slice(at + 10))
    const prev = startxrefOf(ORIG_TABLE)!
    const wrongPrev = enc(t.replace(`/Prev ${prev}`, `/Prev ${String(prev - 1).padStart(String(prev).length, '1')}`))
    const m = /\/Length (\d+) >>\nstream\nBT \/F7 12 Tf 20 100 Td \(Our page two\)/.exec(t)!
    const truncated = enc(t.replace(m[0], m[0].replace(`/Length ${m[1]}`, `/Length ${String(Number(m[1]) - 10)}`)))
    const changed = enc(t.replace('(Our page two)', '(Our page 2wo)'))
    for (const [name, bad, why] of [['shifted', shifted, /does not point at its object/], ['prev', wrongPrev, /\/Prev \d+ is not the original's startxref/], ['truncated', truncated, /does not end at endstream/], ['changed', changed, /page 2's graph is not ours/]] as const) {
      expect(bad.length, name).toBe(r.delta.length)
      const got = await prove(ORIG_TABLE, bad, OURS, r.replaced)
      expect(got.ok, name).toBe(false)
      expect(got.ok === false && got.why, name).toMatch(why)
    }
    // (and on a replaced list that is not the delta's)
    expect((await prove(ORIG_TABLE, r.delta, OURS, [[1, 2]])).ok).toBe(false)
  })
})

describe('the replaced pages\' list', () => {
  it('ranges of pages, merged; the validator refuses every other shape', () => {
    expect(rangesOf([5, 1, 2, 3, 9, 3])).toEqual([[1, 3], [5, 5], [9, 9]])
    expect(pagesOf([[1, 3], [5, 5]])).toEqual([1, 2, 3, 5])
    expect(replacedWhy([[1, 3], [5, 5]], 5)).toBeNull()
    for (const bad of [null, [], [[0, 1]], [[2, 1]], [[1, 6]], [[3, 4], [1, 2]], [[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1.5, 2]], [[1]], Array.from({ length: 4097 }, (_, i) => [2 * i + 1, 2 * i + 1])]) expect(replacedWhy(bad, bad?.length === 4097 ? 10_000 : 5), JSON.stringify(bad)?.slice(0, 40)).not.toBeNull()
  })
})

describe('the remover over the composed document (arXiv\'s bytes, then the delta)', () => {
  it('continues the delta\'s section: its /Prev the delta\'s startxref, its numbers from the delta\'s /Size, PDF.js seeing the removal', async () => {
    for (const orig of [ORIG_TABLE, ORIG_STREAM]) {
      const r = await built(orig)
      const composed = concat([orig, r.delta])
      const task = getDocument({ data: composed.slice(), verbosity: 0 }), doc = await task.promise
      const align = alignOf(OPS as never, await (await doc.getPage(2)).getOperatorList() as never)
      await task.destroy()
      // (remove the first glyph of page 2's first text-showing operation: "O" of "Our page two")
      const ask = encodeAsk({ from: 2, to: 2, pages: 3, pdfjs: PDFJS, chain: { end: composed.length, xref: r.xref, next: null, kids: [], empty: null }, plans: [{ p: 2, shows: align.codes.length, units: [[0, [0, 0], []]], names: [], crops: [], align }] })!
      const answer = await removerOf({ bytes: composed, PL, deflate: (b: Uint8Array) => new Uint8Array(deflateSync(b)) }).remove(ask)
      expect(answer.ok).toBe(true)
      const entries = readEntries((answer as { entries: Uint8Array }).entries)
      if (entries.over) throw new Error('over')
      expect(entries.page[2]).toMatchObject({ ok: true, at: { R: 4 } })
      expect(entries.stats.removed).toBe(1)
      const tail = (answer as { tail: Uint8Array }).tail
      const links = tailLinks(tail)!
      expect(links.prev).toBe(r.xref)
      expect(links.startxref).toBe(composed.length + links.xrefAt)
      expect(links.first).toBe(r.size)
      const pages = await textOf(concat([composed, tail]))
      expect(pages.slice(0, 3)).toEqual(await textOf(OURS))
      // (Helvetica without /Widths: the removed glyph is shown invisible, render mode 3, still in the text; the page is there)
      expect(pages).toHaveLength(4)
    }
  })
})


// ---- the adversarial review's findings (scratchpad route/delta/review), each a case the builder or the proof must meet
const HELV = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
const line = (s: string, y = 100, font = 'F1') => `BT /${font} 12 Tf 20 ${y} Td (${s}) Tj ET\n`
const stream = (s: string) => ({ dict: '', data: enc(s) })
/** a two-page original and our final pass (page 1 ours, page 2 the same words), each given more objects or other resources */
function pairOf({ origExtra = [], oursExtra = [], origRes = '<< /Font << /F1 10 0 R >> >>', oursRes = '<< /Font << /F7 20 0 R >> >>', oursBody = line('Our one', 100, 'F7') }: { origExtra?: [number, Obj][]; oursExtra?: [number, Obj][]; origRes?: string; oursRes?: string; oursBody?: string } = {}) {
  const o = new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R >>' }],
    [2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 200 200] >>' }],
    [3, { text: `<< /Type /Page /Parent 2 0 R /Resources ${origRes} /Contents 7 0 R >>` }],
    [4, { text: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 10 0 R >> >> /Contents 8 0 R >>' }],
    [7, stream(line('Original one'))], [8, stream(line('Page two'))], [10, { text: HELV }], ...origExtra,
  ])
  const u = new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R >>' }],
    [2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 200 200] >>' }],
    [3, { text: `<< /Type /Page /Parent 2 0 R /Resources ${oursRes} /Contents 22 0 R >>` }],
    [4, { text: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 20 0 R >> >> /Contents 23 0 R >>' }],
    [20, { text: HELV }], [22, stream(oursBody)], [23, stream(line('Page two'))], ...oursExtra,
  ])
  // (a photograph both share, so that the delta is a small share of our base page)
  const photo = { dict: ' /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8', data: Uint8Array.from({ length: 4096 }, (_, i) => (i * 2654435761) >>> 24) }
  o.set(90, photo)
  u.set(90, photo)
  return { orig: pdfOf(o, { root: 1 }), ours: pdfOf(u, { root: 1 }) }
}
/** the delta's objects as written (each from its offset to the next), to write another section of them */
function objectsOf(delta: Uint8Array, orig: Uint8Array) {
  const sect = deltaSection(delta, { bytes: orig.length, xref: startxrefOf(orig)! })
  if (sect.why !== undefined) throw new Error(sect.why)
  const rows = [...sect.rows].sort((a, b) => a[2] - b[2])
  const xrefAt = sect.startxref - orig.length
  return rows.filter(r => r[2] !== sect.startxref).map((r, i, all): [number, number, Uint8Array] => [r[0], r[1], delta.slice(r[2] - orig.length, i + 1 < all.length ? all[i + 1]![2] - orig.length : xrefAt)])
}

describe('the review\'s findings', () => {
  it('B1: a back-link key with a DIRECT value is data: our optional content (/P /AllOff) is not the original\'s (/P /AnyOn)', async () => {
    const { orig, ours } = pairOf({
      origExtra: [[15, { text: '<< /Type /OCG /Name (Layer) >>' }], [16, { text: '<< /Type /OCMD /OCGs 15 0 R /P /AnyOn >>' }]],
      oursExtra: [[25, { text: '<< /Type /OCG /Name (Layer) >>' }], [26, { text: '<< /Type /OCMD /OCGs 25 0 R /P /AllOff >>' }]],
      oursRes: '<< /Font << /F7 20 0 R >> /Properties << /oc1 26 0 R >> >>',
      oursBody: `${line('Our one', 100, 'F7')}/OC /oc1 BDC ${line('hidden in ours', 60, 'F7')}EMC\n`,
    })
    const r = await built(orig, ours)
    expect(latin(r.delta)).not.toMatch(/\/oc1 16 0 R/)
    expect(latin(r.delta)).toContain('/P /AllOff')
    expect(await prove(orig, r.delta, ours, r.replaced)).toMatchObject({ ok: true })
    // (a delta that names the original's policy instead is refused by the proof)
    const forged = enc(latin(r.delta).replace('/P /AllOff', '/P /AnyOn '))
    expect(await prove(orig, forged, ours, r.replaced)).toMatchObject({ ok: false, why: /graph is not ours/ })
  })

  it('B2: an entry type PDF.js does not know is refused; an original PDF.js recovers by its own scan is no base (`delta-xref`)', async () => {
    const xs = latin(ORIG_STREAM)
    // (rewrite one row of the cross-reference stream: decompress, set a free row's type to 3, compress again)
    const m = /(\d+) 0 obj\n<< \/Type \/XRef ([^\n]*?)\/Length (\d+) >>\nstream\n/.exec(xs)!
    const at = m.index + m[0].length, L = Number(m[3])
    const { inflateSync } = await import('node:zlib')
    const rows = new Uint8Array(inflateSync(ORIG_STREAM.subarray(at, at + L)))
    rows[0] = 2
    rows[1] = (rows[1]! + 3) & 255
    const data = deflateSync(rows)
    const bad = concat([ORIG_STREAM.subarray(0, m.index), enc(`${m[1]} 0 obj\n<< /Type /XRef ${m[2]}/Length ${data.length} >>\nstream\n`), data, enc(`\nendstream\nendobj\nstartxref\n${m.index}\n%%EOF\n`)])
    expect(() => openObjects(bad, { PL, objectsMax: 1000, decodedMax: 1 << 20 })).toThrow(/entry of type 3/)
    expect(await deltaOf(bad, OURS, { PL })).toMatchObject({ refused: 'delta-xref' })
    // (PDF.js's recovery of the original alone, its own message: the proof refuses, whatever the composed document says)
    const r = await built(ORIG_TABLE)
    const loud = ((o: Record<string, unknown>) => { const data = o.data as Uint8Array; if (data.length === ORIG_TABLE.length) console.log('Warning: Indexing all PDF objects'); return getDocument(o as never) }) as never
    expect(await proveDelta(ORIG_TABLE, r.delta, OURS, { PL, getDocument: loud, replaced: r.replaced })).toMatchObject({ ok: false, code: 'delta-xref' })
  })

  it('should-fix 1 and 5: a delta that overrides the catalog, or writes a page it does not name, fails the proof', async () => {
    const r = await built(ORIG_TABLE)
    const objects = objectsOf(r.delta, ORIG_TABLE)
    const withCatalog = appendSection({ end: ORIG_TABLE.length, objects: [...objects, [1, 0, enc('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /PageMode /FullScreen >>\nendobj\n')]], kind: 'table', prev: startxrefOf(ORIG_TABLE)!, size: r.size, trailer: { root: '1 0 R' } }).bytes
    expect(await prove(ORIG_TABLE, withCatalog, OURS, r.replaced)).toMatchObject({ ok: false, why: /overrides the original's object 1 0/ })
    expect(await prove(ORIG_TABLE, r.delta, OURS, [[1, 2]])).toMatchObject({ ok: false })
  })

  it('should-fix 2: two direct values met against one reference are each compared (a wrong ExtGState fails)', async () => {
    const { orig, ours } = pairOf({ oursRes: '<< /Font << /F7 20 0 R >> /ExtGState << /G1 << /CA 0.5 >> /G2 << /CA 0.1 /BM /Difference >> >> >>' })
    const body = line('Our one', 100, 'F7')
    const objs: [number, number, Uint8Array][] = [
      [3, 0, enc('3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F7 10 0 R >> /ExtGState << /G1 30 0 R /G2 30 0 R >> >> /Contents 31 0 R >>\nendobj\n')],
      [30, 0, enc('30 0 obj\n<< /CA 0.5 >>\nendobj\n')],
      [31, 0, enc(`31 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n`)],
    ]
    const d = appendSection({ end: orig.length, objects: objs, kind: 'table', prev: startxrefOf(orig)!, size: 32, trailer: { root: '1 0 R' } }).bytes
    expect(await prove(orig, d, ours, [[1, 1]])).toMatchObject({ ok: false, why: /graph is not ours/ })
  })

  it('should-fix 3: the stream index is keyed by a secret seed, and the whole build has a work budget', async () => {
    // (FNV-1a multicollisions: 2^10 streams of one FNV value, which made the index quadratic, 2.9 s)
    const fnv = (h: number, b: ArrayLike<number>) => { for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i]!, 0x01000193) >>> 0; return h }
    let seed = 1
    const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 24 }
    const PREFIX = 1024
    let h = fnv(0x811c9dc5, new Uint8Array(PREFIX))
    const blocks: number[][][] = []
    for (let s = 0; s < 10; s++) {
      const seen = new Map<number, number[]>()
      for (;;) {
        const b = [rand(), rand(), rand(), rand()], k = fnv(h, b), prev = seen.get(k)
        if (prev && prev.some((x, j) => x !== b[j])) { blocks.push([prev, b]); h = k; break }
        seen.set(k, b)
      }
    }
    const extra: [number, Obj][] = []
    for (let m = 0; m < 1024; m++) {
      const d = new Uint8Array(PREFIX + 40)
      d.set(blocks.flatMap((bl, s) => bl[(m >> s) & 1]!), PREFIX)
      extra.push([100 + m, { dict: ' /Type /XObject /Subtype /Form /BBox [0 0 1 1]', data: d }])
    }
    const { orig, ours } = pairOf({ origExtra: extra })
    const t0 = performance.now()
    const r = await deltaOf(orig, ours, { PL })
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(r).not.toHaveProperty('refused')
    expect(await deltaOf(orig, ours, { PL, workMax: 10_000 })).toMatchObject({ refused: 'delta-bound', why: /work/ })
  }, 30_000)

  it('should-fix 4: a delta whose /Size leaves the remover\'s tails too few object numbers is refused, and read back refused', async () => {
    const big = pdfOf(origObjects(), { root: 1, size: 8_000_000 })
    expect(await deltaOf(big, OURS, { PL })).toMatchObject({ refused: 'delta-bound', why: /tails/ })
    const d = appendSection({ end: ORIG_TABLE.length, objects: [[8_000_000, 0, enc('8000000 0 obj\nnull\nendobj\n')]], kind: 'table', prev: startxrefOf(ORIG_TABLE)!, size: 8_000_001, trailer: { root: '1 0 R' } }).bytes
    expect(deltaSection(d, { bytes: ORIG_TABLE.length, xref: startxrefOf(ORIG_TABLE)! }).why).toMatch(/tails/)
  })
})

describe('the proof restores the console on every path (a throw before, during or after PDF.js reads)', () => {
  it('a getDocument that throws at once, a promise rejected, a destroy that throws: the refusal given, console.log, warn and error the originals', async () => {
    const r = await built(ORIG_TABLE)
    const before = [console.log, console.warn, console.error]
    const stubs = [
      () => { throw new Error('getDocument threw') },
      () => ({ promise: Promise.reject(new Error('rejected')), destroy: async () => {} }),
      (o: Record<string, unknown>) => { const t = getDocument(o as never); return { promise: t.promise, destroy: async () => { await t.destroy(); throw new Error('destroy threw') } } },
    ]
    for (const stub of stubs) {
      const got = await proveDelta(ORIG_TABLE, r.delta, OURS, { PL, getDocument: stub as never, replaced: r.replaced })
      expect(got.ok).toBe(false)
      expect([console.log, console.warn, console.error]).toEqual(before)
    }
  })
})

describe('Codex on #439', () => {
  it('a back link is cut by its dict\'s context: an OCMD\'s /P policy is data, direct or by reference, never reused across policies', async () => {
    for (const indirect of [false, true]) {
      const policy = (n: number, v: string) => (indirect ? [[n, { text: v }] as [number, Obj]] : [])
      const p = (n: number, v: string) => (indirect ? `${n} 0 R` : v)
      const { orig, ours } = pairOf({
        origExtra: [[15, { text: '<< /Type /OCG /Name (Layer) >>' }], [16, { text: `<< /Type /OCMD /OCGs 15 0 R /P ${p(17, '/AnyOn')} >>` }], ...policy(17, '/AnyOn')],
        oursExtra: [[25, { text: '<< /Type /OCG /Name (Layer) >>' }], [26, { text: `<< /Type /OCMD /OCGs 25 0 R /P ${p(27, '/AllOff')} >>` }], ...policy(27, '/AllOff')],
        oursRes: '<< /Font << /F7 20 0 R >> /Properties << /oc1 26 0 R >> >>',
        oursBody: `${line('Our one', 100, 'F7')}/OC /oc1 BDC ${line('hidden in ours', 60, 'F7')}EMC\n`,
      })
      const r = await built(orig, ours)
      const t = latin(r.delta)
      expect(t, String(indirect)).not.toMatch(/\/oc1 16 0 R/)
      expect(await prove(orig, r.delta, ours, r.replaced), String(indirect)).toMatchObject({ ok: true })
      // (a forged reuse of the original's OCMD fails the proof)
      const at = /\/oc1 (\d+) 0 R/.exec(t)!
      expect(at[1]!.length).toBe(2)
      const forged = enc(t.replace(at[0], '/oc1 16 0 R'))
      expect(await prove(orig, forged, ours, r.replaced), String(indirect)).toMatchObject({ ok: false, why: /graph is not ours/ })
    }
  })

  it('the composed trailer keeps the original\'s /Root, /Info and /ID: a delta that points /Root at a fresh catalog fails', async () => {
    const r = await built(ORIG_TABLE)
    const objects = objectsOf(r.delta, ORIG_TABLE), prev = startxrefOf(ORIG_TABLE)!
    const fresh = r.size
    const redirected = appendSection({ end: ORIG_TABLE.length, objects: [...objects, [fresh, 0, enc(`${fresh} 0 obj\n<< /Type /Catalog /Pages 2 0 R /PageMode /FullScreen >>\nendobj\n`)]], kind: 'table', prev, size: fresh + 1, trailer: { root: `${fresh} 0 R`, id: '[ <0011aabb> <0011aabb> ]' } }).bytes
    expect(deltaSection(redirected, { bytes: ORIG_TABLE.length, xref: prev }).why).toBeUndefined()
    expect(await prove(ORIG_TABLE, redirected, OURS, r.replaced)).toMatchObject({ ok: false, why: /\/Root is not the original's/ })
    const otherId = appendSection({ end: ORIG_TABLE.length, objects, kind: 'table', prev, size: r.size, trailer: { root: '1 0 R', id: '[ <0011aabc> <0011aabb> ]' } }).bytes
    expect(await prove(ORIG_TABLE, otherId, OURS, r.replaced)).toMatchObject({ ok: false, why: /\/ID is not the original's/ })
    const withInfo = appendSection({ end: ORIG_TABLE.length, objects, kind: 'table', prev, size: r.size, trailer: { root: '1 0 R', info: '1 0 R', id: '[ <0011aabb> <0011aabb> ]' } }).bytes
    expect(await prove(ORIG_TABLE, withInfo, OURS, r.replaced)).toMatchObject({ ok: false, why: /\/Info is not the original's/ })
    expect(await prove(ORIG_TABLE, r.delta, OURS, r.replaced)).toMatchObject({ ok: true })
  })
})

describe('overlapping proofs in one process (CodeRabbit on #439)', () => {
  it('take the console one at a time: each sees its own messages alone, and the console is the original after both', async () => {
    const r = await built(ORIG_TABLE)
    const before = [console.log, console.warn, console.error]
    // (B's original reads as one PDF.js recovers: its message must be B's, never A's)
    const loud = ((o: Record<string, unknown>) => { if ((o.data as Uint8Array).length === ORIG_TABLE.length) console.log('Warning: Indexing all PDF objects'); return getDocument(o as never) }) as never
    const [a, b] = await Promise.all([prove(ORIG_TABLE, r.delta, OURS, r.replaced), proveDelta(ORIG_TABLE, r.delta, OURS, { PL, getDocument: loud, replaced: r.replaced })])
    expect(a).toMatchObject({ ok: true })
    expect(b).toMatchObject({ ok: false, code: 'delta-xref' })
    expect([console.log, console.warn, console.error]).toEqual(before)
  })
})

describe('the page geometry a replaced page keeps (Codex on #439)', () => {
  it('a page of ours of another /UserUnit, /Rotate or box than arXiv\'s is no delta (`delta-boxes`), and a delta over it fails the proof', async () => {
    const withPage = (dict: string) => { const u = oursObjects(); u.set(3, { text: dict }); return pdfOf(u, { root: 1 }) }
    const page1 = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F7 20 0 R >> /XObject << /X9 21 0 R /X10 29 0 R >> /ProcSet [/PDF /Text] >> /Contents 22 0 R'
    for (const [what, extra] of [['UserUnit', ' /UserUnit 2'], ['Rotate', ' /Rotate 90'], ['CropBox', ' /CropBox [0 0 100 200]']] as const) {
      const other = withPage(`${page1}${extra} >>`)
      expect(await deltaOf(ORIG_TABLE, other, { PL }), what).toMatchObject({ refused: 'delta-boxes' })
      // (the delta of the page as arXiv's has it, proved against ours of another geometry: refused)
      const r = await built(ORIG_TABLE)
      expect(await prove(ORIG_TABLE, r.delta, other, r.replaced), what).toMatchObject({ ok: false, why: /box is not ours/ })
    }
    // (the same geometry written otherwise: a CropBox equal to the MediaBox, Rotate 360, UserUnit 1)
    expect(await deltaOf(ORIG_TABLE, withPage(`${page1} /CropBox [0 0 200 200] /Rotate 360 /UserUnit 1 >>`), { PL })).not.toHaveProperty('refused')
  })
})

describe('an unreplaced page is the original\'s in the proof (CodeRabbit on #439)', () => {
  it('ours of another geometry on a page the delta does not replace: the delta proves, its page read against arXiv\'s', async () => {
    const u = oursObjects()
    u.set(4, { text: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Rotate 90 /Resources 23 0 R /Contents 25 0 R >>' })
    const final = pdfOf(u, { root: 1 })
    const r = await built(ORIG_TABLE, final, { replacedPages: [1, 3] })
    expect(r.replaced).toEqual([[1, 1], [3, 3]])
    expect(await prove(ORIG_TABLE, r.delta, final, r.replaced)).toMatchObject({ ok: true })
  })
})

// ---- the proof's readers (PDF-READER §19.8, the box-time change of 2026-10-24, its two reviews): the proof opens arXiv's PDF and
// ours itself, of copies of its own bytes, at verbosity 1, inside its capture of the console, and hands each to the host's reader,
// which reads it (readArxivText); the proof makes each page's record of the text content the page gave the reader, and hands the
// documents back in its result. The comparison is of exact text items, with readers or without
/** the next float64 above x (one unit in the last place) */
const ulpUp = (x: number) => { const f = new Float64Array([x]), u = new BigInt64Array(f.buffer); u[0]! += x >= 0 ? 1n : -1n; return f[0]! }
type Doc = { numPages: number; getPage(n: number): Promise<{ getTextContent(o?: unknown): Promise<{ items: { str?: string; transform?: number[] }[] }> }> }
type Task = { promise: Promise<Doc>; destroy(): Promise<void>; destroyed?: boolean }
/** PDF.js's getDocument, but for the openings `which` picks: each page's first text item one ulp right (`ulp`), `say` logged as its
 *  pages are read (a message of PDF.js's own on that document), its task's destroy throwing (`destroyThrows`), its getPage throwing
 *  a failed allocation (`memory`), its opening failing (`fail`) */
function oddOne(which: (o: Record<string, unknown>) => boolean, { ulp = true, say = null, destroyThrows = false, memory = false, fail = false }: { ulp?: boolean; say?: string | null; destroyThrows?: boolean; memory?: boolean; fail?: boolean } = {}) {
  return ((o: Record<string, unknown>) => {
    if (!which(o)) return getDocument(o as never)
    if (fail) {
      const t = getDocument({ ...o, data: enc('not a PDF') } as never) as unknown as Task
      return { promise: t.promise, destroy: async () => { await t.destroy(); if (destroyThrows) throw new Error('destroy threw') } }
    }
    const task = getDocument(o as never) as unknown as Task
    const promise = task.promise.then(doc => new Proxy(doc, {
      get(d, k) {
        if (k !== 'getPage') { const v = Reflect.get(d, k); return typeof v === 'function' ? v.bind(d) : v }
        return async (n: number) => {
          if (memory) throw new RangeError(ALLOCATION_FAILED)
          const pg = await d.getPage(n)
          return new Proxy(pg, {
            get(p, j) {
              if (j !== 'getTextContent') { const v = Reflect.get(p, j); return typeof v === 'function' ? v.bind(p) : v }
              return async (...a: unknown[]) => {
                if (say) console.log(say)
                const tc = await p.getTextContent(...(a as []))
                const first = tc.items.find(i => Array.isArray(i.transform))
                if (ulp && first) first.transform = first.transform!.map((v, i) => (i === 4 ? ulpUp(v) : v))
                return tc
              }
            },
          })
        }
      },
    }))
    return { promise, destroy: async () => { await task.destroy(); if (destroyThrows) throw new Error('destroy threw') } }
  }) as never
}
const isComposed = (orig: Uint8Array, delta: Uint8Array) => (o: Record<string, unknown>) => (o.data as Uint8Array).length === orig.length + delta.length
/** the reader's openings: the proof's of a source with the reader's options (the font properties the draw asks) */
const isReaders = (length: number) => (o: Record<string, unknown>) => (o.data as Uint8Array).length === length && o.fontExtraProperties === true
type Reading = 'orig' | 'ours'
/** the host's readers (proveDelta `readers`): each reads the document the proof gives it with readArxivText, as the box does; `say`
 *  logged by the named one as it reads, `fail` the one that throws (`memory`: a failed allocation), `skip` a page it does not read,
 *  `other` a page it reads with other options, `elsewhere` the one that reads another document of the same bytes instead, `touch` the
 *  one that changes the text content it is given after the proof's record */
function readersOf(o: { say?: [Reading, string]; fail?: Reading; memory?: Reading; skip?: [Reading, number]; other?: [Reading, number]; elsewhere?: [Reading, Uint8Array]; touch?: Reading; own?: boolean } = {}) {
  const calls: Reading[] = [], seen: Record<string, { loadingTask: Task }> = {}
  const reader = (name: Reading) => ({
    options: { useSystemFonts: false, fontExtraProperties: true },
    read: async (doc: unknown) => {
      calls.push(name)
      seen[name] = doc as never
      if (o.memory === name) throw new RangeError(ALLOCATION_FAILED)
      if (o.fail === name) throw new Error(`the ${name} reader failed`)
      const d = doc as Doc
      if (o.elsewhere?.[0] === name) {
        const t = getDocument({ data: o.elsewhere[1].slice(), verbosity: 0 })
        await readArxivText(await t.promise as never)
        await t.destroy()
      } else if (o.skip?.[0] === name || o.other?.[0] === name || o.touch === name) {
        for (let p = 1; p <= d.numPages; p++) {
          if (o.skip?.[0] === name && o.skip[1] === p) continue
          const pg = await d.getPage(p)
          const tc = await (o.other?.[0] === name && o.other[1] === p ? pg.getTextContent({ includeMarkedContent: true }) : pg.getTextContent())
          if (o.touch === name) for (const it of tc.items) if (Array.isArray(it.transform)) it.transform = it.transform.map(v => v + 1)
        }
      } else await readArxivText(doc as never, { draw: true })
      if (o.say?.[0] === name) console.log(o.say[1])
    },
  })
  return { readers: { orig: reader('orig'), ours: { ...reader('ours'), ...(o.own ? { own: true } : {}) } }, calls, seen }
}
type Proved = Awaited<ReturnType<typeof proveDelta>>
/** the documents a proof handed back, destroyed */
const closeOf = async (r: Proved) => { for (const d of Object.values(r.documents ?? {})) await (d as { loadingTask?: Task } | null)?.loadingTask?.destroy() }
const proveWith = async (orig: Uint8Array, delta: Uint8Array, final: Uint8Array, replaced: [number, number][], o: { getDocument?: never; readers?: unknown } = {}) =>
  proveDelta(orig, delta, final, { PL, getDocument: o.getDocument ?? (getDocument as never), documentOptions: { useSystemFonts: false }, replaced, ...(o.readers ? { readers: o.readers as never } : {}) })

describe('the proof\'s readers: each document read once, by the host, the same verdicts', () => {
  it('passes as its own reading passes, each reader called once, arXiv\'s first; both documents handed back, open', async () => {
    for (const orig of [ORIG_TABLE, ORIG_STREAM]) {
      const r = await built(orig)
      const h = readersOf()
      const got = await proveWith(orig, r.delta, OURS, r.replaced, { readers: h.readers })
      try {
        expect(got).toMatchObject({ ok: true, pages: [3, 3], replaced: 3 })
        expect(h.calls).toEqual(['orig', 'ours'])
        const docs = got.documents as { orig: Doc; ours: Doc }
        expect([docs.orig.numPages, docs.ours.numPages]).toEqual([3, 3])
        expect(((await (await docs.ours.getPage(1)).getTextContent()).items.map(i => i.str ?? '')).join('')).toBe('Our page one')
      } finally { await closeOf(got) }
      // (without readers the result names no documents)
      expect(await proveWith(orig, r.delta, OURS, r.replaced)).not.toHaveProperty('documents')
    }
  })

  it('opens each source of a copy of its own bytes, with the reader\'s options at verbosity 1, the reader inside the proof\'s capture', async () => {
    const r = await built(ORIG_TABLE)
    const asked: [number, unknown, unknown][] = []
    const spy = ((o: Record<string, unknown>) => { asked.push([(o.data as Uint8Array).length, o.verbosity, o.fontExtraProperties]); return getDocument(o as never) }) as never
    const h = readersOf()
    const logs: boolean[] = []
    const original = console.log
    const read = h.readers.orig.read
    h.readers.orig.read = async (doc: unknown) => { logs.push(console.log === original); return read(doc) }
    const final = OURS.slice()
    const got = await proveWith(ORIG_TABLE, r.delta, final, r.replaced, { getDocument: spy, readers: h.readers })
    try {
      expect(got).toMatchObject({ ok: true })
      expect(asked).toEqual([[ORIG_TABLE.length + r.delta.length, 1, undefined], [ORIG_TABLE.length, 1, true], [OURS.length, 1, true]])
      expect(logs).toEqual([false])
      // (a copy given to PDF.js: the host's bytes its own after the proof)
      expect(final.length).toBe(OURS.length)
    } finally { await closeOf(got) }
  })

  it('one composed text item one ulp off is another page: delta-proof, with the readers and without them', async () => {
    const r = await built(ORIG_TABLE)
    const odd = oddOne(isComposed(ORIG_TABLE, r.delta))
    expect(await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { getDocument: odd })).toMatchObject({ ok: false, code: 'delta-proof', why: /page 1's text is not ours: its text items differ/ })
    const got = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { getDocument: odd, readers: readersOf().readers })
    try { expect(got).toMatchObject({ ok: false, code: 'delta-proof', why: /page 1's text is not ours: its text items differ/ }) } finally { await closeOf(got) }
    // (and the original's own page one ulp off, on a page the delta does not replace: not the original's)
    const r2 = await built(ORIG_TABLE, OURS, { replacedPages: [1, 3] })
    const origOdd = oddOne(isReaders(ORIG_TABLE.length))
    const got2 = await proveWith(ORIG_TABLE, r2.delta, OURS, r2.replaced, { getDocument: origOdd, readers: readersOf().readers })
    try { expect(got2).toMatchObject({ ok: false, code: 'delta-proof', why: /page 2's text is not the original's: its text items differ/ }) } finally { await closeOf(got2) }
  })

  it('the record is of what the page gave, taken before the reader sees it: a reader that changes its text content changes nothing', async () => {
    const r = await built(ORIG_TABLE)
    const got = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { readers: readersOf({ touch: 'ours' }).readers })
    try { expect(got).toMatchObject({ ok: true }) } finally { await closeOf(got) }
  })

  it('a reader that reads another document of the same bytes, skips a page, reads one with other options or throws: refused, its document still handed back, open', async () => {
    const r = await built(ORIG_TABLE)
    for (const [o, why, which] of [
      [{ elsewhere: ['orig', ORIG_TABLE] }, /page 1 of the orig document was not read/, 'orig'],
      [{ skip: ['ours', 2] }, /page 2 of the ours document was not read/, 'ours'],
      [{ other: ['ours', 1] }, /page 1 of the ours document was read with other options than the proof's/, 'ours'],
      [{ fail: 'orig' }, /the orig reader failed/, 'orig'],
    ] as const) {
      const h = readersOf(o as never)
      const got = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { readers: h.readers })
      try {
        expect(got, String(why)).toMatchObject({ ok: false, code: 'delta-proof', why })
        const doc = (got.documents as Record<string, Doc | null>)[which]!
        expect(doc.numPages, String(why)).toBe(3)
        expect(h.seen[which]!.loadingTask.destroyed, String(why)).toBe(false)
      } finally { await closeOf(got) }
    }
  })

  it('an opening that fails is destroyed, a destroy that throws never in place of its failure; `own` gives our bytes up, and an opening that fails then leaves them given up', async () => {
    const r = await built(ORIG_TABLE)
    const loud = oddOne(isReaders(ORIG_TABLE.length), { fail: true, destroyThrows: true })
    const got = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { getDocument: loud, readers: readersOf().readers })
    expect(got).toMatchObject({ ok: false, code: 'delta-proof', why: /PDF\.js: / })
    expect(got.ok === false && got.why).not.toMatch(/destroy threw/)
    expect(got.documents).toEqual({ orig: null, ours: null })
    // (a copy, without `own`: a failed opening leaves the host's bytes its own)
    const kept = OURS.slice()
    const g2 = await proveWith(ORIG_TABLE, r.delta, kept, r.replaced, { getDocument: oddOne(isReaders(OURS.length), { fail: true }), readers: readersOf().readers })
    try {
      expect(g2).toMatchObject({ ok: false, code: 'delta-proof', why: /PDF\.js: / })
      expect((g2.documents as { ours: unknown }).ours).toBeNull()
      expect(kept.length).toBe(OURS.length)
    } finally { await closeOf(g2) }
    // (with `own`: the bytes themselves given to PDF.js — gone once it has them, whether the opening holds or fails)
    const given = OURS.slice()
    const g3 = await proveWith(ORIG_TABLE, r.delta, given, r.replaced, { readers: readersOf({ own: true }).readers })
    try {
      expect(g3).toMatchObject({ ok: true })
      expect(given.length).toBe(0)
      expect((g3.documents as { ours: Doc }).ours.numPages).toBe(3)
    } finally { await closeOf(g3) }
    // (an opening of the bytes themselves that PDF.js takes and then fails: our bytes gone, no document — the host reads it by their
    // length, and does not open them again)
    const lost = OURS.slice()
    const takesThenFails = ((o: Record<string, unknown>) => {
      const t = getDocument(o as never) as unknown as Task
      return o.data === lost ? { promise: t.promise.then(() => { throw new Error('the opening failed') }), destroy: () => t.destroy() } : t
    }) as never
    const g4 = await proveWith(ORIG_TABLE, r.delta, lost, r.replaced, { getDocument: takesThenFails, readers: readersOf({ own: true }).readers })
    try {
      expect(g4).toMatchObject({ ok: false, code: 'delta-proof', why: /PDF\.js: the opening failed/ })
      expect((g4.documents as { ours: unknown }).ours).toBeNull()
      expect(lost.length).toBe(0)
    } finally { await closeOf(g4) }
  })

  it('a failed allocation goes on as itself: from a reader (the documents handed so far destroyed), and from the proof\'s own reading under a destroy that throws', async () => {
    const r = await built(ORIG_TABLE)
    const h = readersOf({ memory: 'ours' })
    await expect(proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { readers: h.readers })).rejects.toThrow(ALLOCATION_FAILED)
    expect(h.seen.orig!.loadingTask.destroyed).toBe(true)
    expect(h.seen.ours!.loadingTask.destroyed).toBe(true)
    const own = oddOne(isComposed(ORIG_TABLE, r.delta), { memory: true, destroyThrows: true })
    await expect(proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { getDocument: own })).rejects.toThrow(ALLOCATION_FAILED)
  })

  it('a message a reader\'s document gives is that document\'s: arXiv\'s recovered alone is delta-xref; one only the composed document gives fails', async () => {
    const r = await built(ORIG_TABLE)
    const before = [console.log, console.warn, console.error]
    const g1 = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { readers: readersOf({ say: ['orig', 'Warning: Indexing all PDF objects'] }).readers })
    try { expect(g1).toMatchObject({ ok: false, code: 'delta-xref' }) } finally { await closeOf(g1) }
    const loud = oddOne(isComposed(ORIG_TABLE, r.delta), { ulp: false, say: 'Warning: a message of the composed document' })
    const g2 = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { getDocument: loud, readers: readersOf().readers })
    try { expect(g2).toMatchObject({ ok: false, code: 'delta-proof', why: /says of the composed document alone: Warning: a message of the composed document/ }) } finally { await closeOf(g2) }
    // (the same message from our page's own reading: no message of the composed document's alone)
    const g3 = await proveWith(ORIG_TABLE, r.delta, OURS, r.replaced, { getDocument: loud, readers: readersOf({ say: ['ours', 'Warning: a message of the composed document'] }).readers })
    try { expect(g3).toMatchObject({ ok: true }) } finally { await closeOf(g3) }
    expect([console.log, console.warn, console.error]).toEqual(before)
  })
})
