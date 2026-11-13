// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { alignOf, pageInk, planOf, wrapOf } from '@readarxiv/engine'
import { lexedDiff } from './helpers/lex-compare'
import { deflate, DOCUMENT_OPTIONS, inflate, markedSample } from './helpers/ocg-pdfs'
import { wrapOf as wrapOfBefore } from './helpers/wrap-before.mjs'

// The wrap (packages/engine/src/wrap.mjs) tells an operand by its kind before it reads a field of it (flatOf's BDC of ours,
// operand, splitText, elementsOf, sameOps), reads an error's message by `at`, states the catalog's number where its catalog is
// no ref, and reads Web Crypto off the global object. Held here to the wrap before that change (helpers/wrap-before.mjs, d453c14ee
// verbatim), on wrapOf's whole result, composed and not, value for value and error for error: on sample-1's marked pages under
// plans of every naming (each show a group, shows split between two, figures, placeholders and labels folded, the back half's
// names), on hand pages (malformed operands of ours and the page's, a catalog written in the trailer, thrown values no Error),
// and on 300 seeded pages of shows and marked content. Its five readers of operands are internal to the module: they are read
// through wrapOf, every page's proof running each of them.

type Rec = Record<string, unknown>
const O = OPS as unknown as Record<string, number>
/** a value with its Maps and Sets as their entries, comparable by lexedDiff */
function plain(v: unknown): unknown {
  if (v instanceof Map) return { map: [...v].map(([k, x]) => [plain(k), plain(x)]) }
  if (v instanceof Set) return { set: [...v].map(plain) }
  if (v instanceof Uint8Array) return v
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  return v
}
const thrown = (e: unknown) => ({ threw: `${(e as Error)?.constructor?.name}: ${(e as Error)?.message ?? String(e)}` })
const outcome = async (f: () => Promise<unknown>) => { try { return plain(await f()) } catch (e) { return thrown(e) } }

type Plan = Rec & { facts: { codes: (number | null)[][]; paths: number; images: number } }
/** where the wrap and the one before first part on `bytes` under `plans` (null: nowhere), composed and as the section alone */
async function wrapDifference(bytes: Uint8Array, plans: () => Map<number, Plan>, o: Rec = {}): Promise<string | null> {
  for (const compose of [true, false]) {
    const now = await outcome(() => wrapOf(bytes, plans() as never, { PL: PL as never, deflate, inflate, compose, ...o } as never))
    const before = await outcome(() => wrapOfBefore(bytes, plans(), { PL, deflate, inflate, compose, ...o }))
    const d = lexedDiff(now, before)
    if (d) return `compose ${compose}${d}`
  }
  return null
}
/** each page's alignment facts, glyphs and paths as PDF.js reads them */
async function readOf(bytes: Uint8Array) {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() })
  const doc = await task.promise
  const pages: { facts: Plan['facts']; glyphs: { n?: number; k?: number }[]; paths: number[] }[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const ops = await page.getOperatorList()
    const ink = pageInk(O, ops, page.commonObjs, { rotate: 0, indices: true, turned: true })
    pages.push({ facts: alignOf(O, ops) as Plan['facts'], glyphs: ink.glyphs, paths: ink.paths ?? [] })
  }
  await task.destroy()
  return pages
}
/** the namings a plan's groups may take, by glyph (its show n, its place k) and by box (its path's kind) */
const NAMINGS: Record<string, { glyph: (n: number, k: number) => string | null; box: (kind: number) => string | null; extra?: Rec }> = {
  'each show a group': { glyph: n => `u${n}`, box: () => null },
  'shows split between two': { glyph: (n, k) => `u${n + (k % 3 === 2 ? 1 : 0)}`, box: k => (k === -3 ? 'u0' : null) },
  'figures, placeholders and labels': { glyph: (n, k) => (n % 4 === 0 ? 'f1' : n % 4 === 1 ? `u${n}.p` : n % 4 === 2 && k === 0 ? `u${n}.l` : `u${n}`), box: k => (k >= 0 ? 'f1' : null) },
  'some glyphs no group\'s': { glyph: (n, k) => ((n + k) % 3 === 0 ? null : `u${n % 5}`), box: () => null },
  'the back half\'s names': { glyph: (n, k) => `${n}.1.${k % 4 === 3 ? 'e' : 't'}`, box: () => null, extra: { isFigure: () => false, textOf: (g: string) => g.replace(/\.[el]$/, '.t') } },
}
function plansOf(pages: Awaited<ReturnType<typeof readOf>>, naming: (typeof NAMINGS)[string], only?: number[]): () => Map<number, Plan> {
  return () => new Map(pages.flatMap((pg, i) => {
    if (only && !only.includes(i + 1)) return []
    const glyph = pg.glyphs.map(g => (g.n !== undefined && g.n >= 0 ? naming.glyph(g.n, g.k ?? 0) : null))
    const plan = planOf(pg.glyphs, glyph, pg.paths, pg.paths.map(naming.box), pg.facts)
    return [[i + 1, { facts: pg.facts, ...plan, ...naming.extra } as Plan]]
  }))
}

describe('the wrap reads every page as it did before it told an operand by its kind', () => {
  it('on sample-1\'s marked pages, under plans of every naming, with figures in a form and the paper\'s own layers', async () => {
    const samples = [
      await markedSample({}),
      await markedSample({ pages: [1, 2], every: 1, foreignOC: true }),
      await markedSample({ pages: [2], form: 'BT /F1 9 Tf 72 400 Td (in a form) Tj ET' }),
      await markedSample({ pages: [2], edit: () => 'BT /T3 10 Tf 1 0 0 1 72 700 Tm [(abc) -50 (de)] TJ 1 0 0 1 72 600 Tm (f) Tj ET\n', type3: true }),
    ]
    let pages = 0
    for (const s of samples) {
      const read = await readOf(s.bytes)
      pages += read.length
      for (const [name, naming] of Object.entries(NAMINGS)) expect(await wrapDifference(s.bytes, plansOf(read, naming)), name).toBeNull()
      // (bounds that send a page down the ladder: its figures' groups left out, its placeholders' and labels' merged)
      expect(await wrapDifference(s.bytes, plansOf(read, NAMINGS['figures, placeholders and labels']!), { groupsPage: 2, sequencesPage: 3, groupsDoc: 4 }), 'bounds').toBeNull()
    }
    expect(pages).toBeGreaterThan(5)
  }, 120_000)

  /** a one-page PDF of Helvetica as /F1 and the page's content `content`; `trailerRoot` writes the catalog in the trailer itself */
  async function pagePdf(content: string, { trailerRoot = false } = {}): Promise<Uint8Array> {
    const doc = await PL.PDFDocument.create()
    const page = doc.addPage([612, 792])
    const font = await doc.embedFont(PL.StandardFonts.Helvetica)
    page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
    page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
    const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }))
    if (!trailerRoot) return bytes
    // (the catalog's dictionary written into the trailer in place of its reference, its object left where it was)
    const text = Buffer.from(bytes).toString('latin1')
    const ref = /\/Root (\d+) 0 R/.exec(text.slice(text.lastIndexOf('trailer')))!
    const body = new RegExp(`\\n${ref[1]} 0 obj\\n(<<[\\s\\S]*?>>)\\nendobj`).exec(text)![1]!
    const at = text.lastIndexOf('trailer')
    return new Uint8Array(Buffer.from(text.slice(0, at) + text.slice(at).replace(`/Root ${ref[1]} 0 R`, `/Root ${body}`), 'latin1'))
  }
  it('on hand pages: malformed operands in the page and in a split, a catalog written in the trailer, values thrown that are no Error', async () => {
    const PAGES = [
      'BT /F1 10 Tf 72 700 Td (abcdef) Tj ET',
      'BT /F1 10 Tf 72 700 Td [(ab) -0.5859375 (cd) 0 (ef)] TJ ET',
      'BT /F1 10 Tf 72 700 Td 12 TL 1 2 (abcd) " (efgh) \' ET',
      'BT /F1 10 Tf 72 700 Td /a /b (abcd) " ET',
      'BT /F1 10 Tf 72 700 Td null 0 (abcd) " ET',
      'BT /F1 10 Tf 72 700 Td (0) false (abcd) " ET',
      'BT /F1 10 Tf 72 700 Td 5 TJ (ab) Tj ET',
      'BT /F1 10 Tf 72 700 Td /OC /axt1 BDC (abc) Tj EMC ET',
      'BT /F1 10 Tf 72 700 Td /OC 5 BDC (abc) Tj EMC /OC << /A 1 >> BDC (de) Tj EMC ET',
      '/Span << /MCID 0 >> BDC BT /F1 10 Tf 72 700 Td (abc) Tj ET EMC q 0 0 10 10 re f Q',
      'BT /F1 10 Tf 72 700 Td [(a) (b) [(c)] (d)] TJ ET',
    ]
    for (const c of PAGES) {
      for (const trailerRoot of [false, true]) {
        const bytes = await pagePdf(c, { trailerRoot })
        let read: Awaited<ReturnType<typeof readOf>>
        try { read = await readOf(bytes) } catch { continue }
        for (const [name, naming] of Object.entries(NAMINGS)) expect(await wrapDifference(bytes, plansOf(read, naming)), `${c} (catalog in the trailer: ${trailerRoot}) ${name}`).toBeNull()
      }
    }
    // (values thrown that are no Error: by the object layer as the remover opens the file, by deflate as a page is packed)
    const bytes = await pagePdf(PAGES[0]!)
    const read = await readOf(bytes)
    const plans = plansOf(read, NAMINGS['each show a group']!)
    const throwing = (v: unknown) => ({ ...PL, PDFDocument: { load: () => { throw v } } })
    for (const v of [42, 'boom', null, undefined, { message: 7 }, new RangeError('r')]) {
      expect(await wrapDifference(bytes, plans, { PL: throwing(v) }), `load throws ${String(v)}`).toBeNull()
      expect(await wrapDifference(bytes, plans, { deflate: () => { throw v } }), `deflate throws ${String(v)}`).toBeNull()
    }
  }, 120_000)

  it('on 300 seeded pages of shows, spacing operators and marked content, malformed ones among them', async () => {
    let a = 2026 >>> 0
    const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)] as T
    const OPERATORS = ['(abc) Tj', '[(ab) 5 (cd)] TJ', '[(a) -0.5859375 (b)] TJ', '[(ab) [(c)] 5] TJ', '1 2 (xy) "', '/a 2 (xy) "', 'null null (xy) "', "(xy) '", '5 TJ', '/OC /axt9 BDC (q) Tj EMC', '/OC 5 BDC (q) Tj EMC', '/Span << /MCID 1 >> BDC (s) Tj EMC', 'T*', '0 -12 Td', '2 Tc', '1 Tw', '3 Tr (z) Tj 0 Tr']
    let wrapped = 0
    for (let n = 0; n < 300; n++) {
      let c = 'BT /F1 9 Tf 72 700 Td 12 TL '
      for (let k = 1 + Math.floor(next() * 8); k > 0; k--) c += `${pick(OPERATORS)} `
      c += 'ET'
      const doc = await PL.PDFDocument.create()
      const page = doc.addPage([612, 792])
      page.node.setFontDictionary(PL.PDFName.of('F1'), (await doc.embedFont(PL.StandardFonts.Helvetica)).ref)
      page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(c)))
      const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }))
      const read = await readOf(bytes)
      const naming = pick(Object.values(NAMINGS))
      expect(await wrapDifference(bytes, plansOf(read, naming)), c).toBeNull()
      const made = (await outcome(() => wrapOf(bytes, plansOf(read, naming)() as never, { PL: PL as never, deflate, inflate }))) as Rec
      if ((made.stats as Rec | undefined)?.wrapped) wrapped++
    }
    // (most pages wrapped, so that the proofs ran: flatOf, sameOps, operand, elementsOf and splitText read each one)
    expect(wrapped).toBeGreaterThan(100)
  }, 300_000)
})
