// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { deflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { encodeAsk, readEntries } from '@/pdf-reader/engine/layout/chain-wire.mjs'
import { deltaOf, proveDelta } from '@/pdf-reader/engine/layout/delta.mjs'
import { deltaSection, pagesOf, rangesOf, replacedWhy } from '@/pdf-reader/engine/layout/delta-wire.mjs'
import { alignOf, removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf, tailLinks } from '@/pdf-reader/engine/layout/tail.mjs'
import { openObjects } from '@/pdf-reader/engine/layout/xref.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { concat, ORIG_PACKED, origObjects, oursObjects, pdfOf } from './helpers/delta-pdfs'

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

