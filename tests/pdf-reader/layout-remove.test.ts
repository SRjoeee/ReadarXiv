import * as PL from '@cantoo/pdf-lib'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { deflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { CHECK_SETS, checkPage, lex, makeAddon, openRemover, type RemovalPlan, SETS } from '@/pdf-reader/engine/layout/remove.mjs'

// The text remover (layout/remove.mjs) on a PDF written here: two pages, a simple font with widths, a page's own text,
// a TJ with a kerning number, a rule, a form painted once on page 1 and one painted twice on page 2. Each plan's result
// is read back by PDF.js and checked by the module's own independent check (checkPage), and arXiv's bytes must be a
// prefix of it.

const enc = (s: string) => new TextEncoder().encode(s)
/** a PDF from its objects' bodies (1-based, a stream as [dict, data]), with a classic cross-reference table */
function pdfOf(objects: (string | [string, string])[]): Uint8Array {
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += Array.isArray(o) ? `${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n${o[1]}\nendstream\nendobj\n` : `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const at = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return enc(out)
}
const font = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${Array(95).fill(500).join(' ')}] >>`
const form = (text: string, y: number): [string, string] => ['/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >>', `BT /F1 10 Tf 20 ${y} Td (${text}) Tj ET`]
const PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 9 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> /XObject << /Fm1 6 0 R >> >> /Contents 5 0 R >>',
  font,
  ['', 'BT /F1 10 Tf 20 250 Td (Hello world) Tj ET\nBT /F1 10 Tf 20 230 Td [(Ke) -100 (rn)] TJ ET\n20 210 100 1 re f\nq /Fm1 Do Q'],
  form('Form', 190),
  form('Twice', 170),
  ['', 'q /Fm2 Do Q q 1 0 0 1 0 -20 cm /Fm2 Do Q BT /F1 10 Tf 20 100 Td (Page two) Tj ET'],
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> /XObject << /Fm2 7 0 R >> >> /Contents 8 0 R >>',
])
type Ink = ReturnType<typeof pageInk> & { paths: number[] }
const open = (data: Uint8Array) => getDocument({ data: data.slice(), verbosity: 0 }).promise
async function inksOf(data: Uint8Array) {
  const doc = await open(data)
  const pages: { ink: Ink; opList: Awaited<ReturnType<Awaited<ReturnType<typeof doc.getPage>>['getOperatorList']>> }[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const opList = await page.getOperatorList()
    pages.push({ opList, ink: pageInk(OPS, opList, page.commonObjs, { rotate: 0, indices: true }) as Ink })
  }
  return { doc, pages }
}
/** the glyphs of a text, as n, k pairs: the ink's glyphs spelling it on a baseline */
function glyphsOf(ink: Ink, text: string, y: number) {
  const gs = ink.glyphs.filter(g => Math.abs(g.y - y) < 0.01 && g.u.trim()).sort((a, b) => a.x0 - b.x0)
  const at = gs.map(g => g.u).join('').indexOf(text.replace(/ /g, ''))
  return gs.slice(at, at + text.replace(/ /g, '').length).flatMap(g => [g.n as number, g.k as number])
}
const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b))

async function removed(bytes: Uint8Array, plan: (pages: Ink[]) => RemovalPlan) {
  const { pages } = await inksOf(bytes)
  const R = await openRemover(bytes, { PL })
  const p = plan(pages.map(x => x.ink))
  const out = await makeAddon({ R, bytes, OPS, opListOf: async q => pages[q - 1]!.opList, deflate, plan: p, sets: [...SETS, ...CHECK_SETS] })
  const after = await inksOf(out.bytes)
  return { pages: pages.map(x => x.ink), p, out, after }
}
const planOne = (pages: Ink[]): RemovalPlan => ({
  pages: {
    1: {
      shows: pages[0]!.shows,
      units: [
        { id: 1, glyphs: glyphsOf(pages[0]!, 'world', 250), paths: [0] },
        { id: 2, glyphs: glyphsOf(pages[0]!, 'rn', 230), paths: [] },
        { id: 3, glyphs: glyphsOf(pages[0]!, 'Form', 190), paths: [] },
      ],
      crops: [{ glyphs: glyphsOf(pages[0]!, 'H', 250), paths: [] }],
    },
    2: { shows: pages[1]!.shows, units: [{ id: 4, glyphs: glyphsOf(pages[1]!, 'Twice', 170), paths: [] }], crops: [] },
  },
})

describe('the text remover', () => {
  it('lexes strings, arrays, names and an inline image as the content stream holds them', () => {
    const ops = lex(enc('BT /F1 10 Tf [(a\\)b) -20 <0041>] TJ ET BI /W 1 /H 1 ID \x00\x01 EI Q'))
    expect(ops.map(o => o.op)).toEqual(['BT', 'Tf', 'TJ', 'ET', 'BI', 'Q'])
    const tj = ops[2]!.args[0] as { b?: Uint8Array }[]
    expect(new TextDecoder().decode(tj[0]!.b)).toBe('a)b')
    expect([...(tj[2]!.b ?? [])]).toEqual([0, 0x41])
  })

  for (const [what, make] of [
    ['a classic cross-reference table', async () => PDF],
    ['a cross-reference stream and object streams (as pdf-lib saves)', async () => (await PL.PDFDocument.load(PDF, { updateMetadata: false })).save({ useObjectStreams: true })],
  ] as const) {
    it(`takes out exactly the planned glyphs and rules, moves nothing, and keeps the crops alone on P: ${what}`, async () => {
      const bytes = await make()
      const { pages, p, out, after } = await removed(bytes, planOne)
      // arXiv's file a prefix of the result; its own pages as they were
      expect(Buffer.from(out.bytes.subarray(0, bytes.length)).equals(Buffer.from(bytes))).toBe(true)
      expect(after.doc.numPages).toBe(2 + 2 * 4)
      expect(after.pages[0]!.ink.glyphs.map(g => g.u).join('')).toBe(pages[0]!.glyphs.map(g => g.u).join(''))
      expect(out.manifest.sets).toEqual({ R: 2, P: 4, F: 6, C: 8 })
      expect(out.manifest.page[1]).toMatchObject({ ok: true })
      const c = checkPage({ orig: pages[0]!, removed: after.pages[2]!.ink, kept: after.pages[4]!.ink, entry: p.pages[1] })
      expect(c).toMatchObject({ removed: 11, missed: 0, other: 0, moved: 0, extra: 0, rulesRemoved: 1, rulesMissed: 0, rulesOther: 0, pOwn: 1, pMissing: 0, pOther: 0 })
      expect(c.maxMove).toBeLessThan(1e-6)
      // what is left on R, and the footprint F: the removed glyphs alone
      expect(after.pages[2]!.ink.glyphs.map(g => g.u).join('').replace(/\s/g, '')).toBe('HelloKe')
      expect(after.pages[6]!.ink.glyphs.map(g => g.u).join('').replace(/\s/g, '')).toBe('worldrnForm')
    })
  }

  it('refuses a page whose planned glyph is in a form painted twice: its R page is the original', async () => {
    const { pages, out, after } = await removed(PDF, planOne)
    expect(out.manifest.page[2]).toMatchObject({ ok: false })
    expect(out.manifest.page[2]?.refused).toMatch(/painted more than once/)
    expect(after.pages[3]!.ink.glyphs.map(g => g.u).join('')).toBe(pages[1]!.glyphs.map(g => g.u).join(''))
  })

  it('refuses a page the plan read otherwise (another count of showing operations)', async () => {
    const { out } = await removed(PDF, pages => ({ pages: { 1: { ...planOne(pages).pages[1]!, shows: 99 } } }))
    expect(out.manifest.page[1]).toMatchObject({ ok: false })
    expect(out.manifest.page[1]?.refused).toMatch(/plan read 99/)
  })

  it('writes each unit its removed boxes, and a page no plan names as not planned', async () => {
    const bytes = PDF
    const { pages } = await inksOf(bytes)
    const ink = pages[0]!.ink
    const boxesOf = (_p: number, n: number, k: number) => { const g = ink.glyphs.find(x => x.n === n && x.k === k); return g ? [g.x0, g.bottom, g.x1, g.top] : null }
    const out = await makeAddon({ R: await openRemover(bytes, { PL }), bytes, OPS, opListOf: async q => pages[q - 1]!.opList, deflate, plan: { pages: { 1: { units: [{ id: 5, glyphs: glyphsOf(ink, 'Hello', 250), paths: [] }], crops: [] } } }, boxesOf })
    expect(out.manifest.page[1]?.units?.[5]).toHaveLength(5 * 4)
    expect(out.manifest.page[2]).toEqual({ ok: false, refused: 'not planned' })
  })

  it('compact: holds a page only for each page it removes, named where it is', async () => {
    const bytes = PDF
    const { pages } = await inksOf(bytes)
    const ink = pages[0]!.ink
    const out = await makeAddon({ R: await openRemover(bytes, { PL }), bytes, OPS, opListOf: async q => pages[q - 1]!.opList, deflate, plan: { pages: { 1: { units: [{ id: 5, glyphs: glyphsOf(ink, 'Hello', 250), paths: [] }], crops: [] } } }, compact: true })
    const after = await inksOf(out.bytes)
    // arXiv's two pages, then page 1's removed page alone; page 2, not planned, has none
    expect(after.doc.numPages).toBe(3)
    expect(out.manifest.page[1]).toMatchObject({ ok: true, at: { R: 3 } })
    expect(out.manifest.page[2]?.at).toBeUndefined()
    expect(out.manifest.sets).toEqual({})
    expect(after.pages[2]!.ink.glyphs.map(g => g.u).join('')).not.toContain('Hello')
    expect(after.pages[2]!.ink.glyphs.length).toBe(ink.glyphs.length - 5)
  })
})

// Untrusted input must never wedge the remover (Codex's review of PR A, finding 2): each case runs in a worker that is
// stopped after a few seconds, so that a loop that fails to advance fails the test instead of hanging the suite
const REMOVE_URL = pathToFileURL(join(process.cwd(), 'src/pdf-reader/engine/layout/remove.mjs')).href
const PDFLIB_PATH = createRequire(join(process.cwd(), 'package.json')).resolve('@cantoo/pdf-lib')
/** `body` (an async function's body over R, the remover's module, PL, pdf-lib, and data) run in a worker, at most `ms` */
function bounded<T>(body: string, data: unknown, ms = 4000, heapMb?: number): Promise<T> {
  const code = `const { parentPort, workerData } = require('node:worker_threads'); (async () => { const R = await import(workerData.remove); const PL = require(workerData.pdflib); const f = async (R, PL, data) => { ${body} }; parentPort.postMessage({ ok: await f(R, PL, workerData.data) }) })().catch(e => parentPort.postMessage({ error: String(e?.message ?? e) }))`
  return new Promise((res, rej) => {
    const w = new Worker(code, { eval: true, workerData: { remove: REMOVE_URL, pdflib: PDFLIB_PATH, data }, ...(heapMb ? { resourceLimits: { maxOldGenerationSizeMb: heapMb } } : {}) })
    const t = setTimeout(() => { void w.terminate(); rej(new Error(`did not finish in ${ms} ms`)) }, ms)
    w.once('message', (m: { ok?: T; error?: string }) => { clearTimeout(t); void w.terminate(); if (m.error !== undefined) rej(new Error(m.error)); else res(m.ok as T) })
    w.once('error', e => { clearTimeout(t); rej(e) })
  })
}
const lexOps = 'try { return { ops: R.lex(new TextEncoder().encode(data)).map(o => o.op) } } catch (e) { return { threw: String(e.message) } }'

describe("the remover on untrusted input: every loop advances or refuses", () => {
  it("skips a comment in an inline image's parameters, as the lexer does anywhere else", async () => {
    expect(await bounded(lexOps, 'BI %comment\n /W 1 /H 1 /BPC 8 /CS /G ID x EI Q')).toEqual({ ops: ['BI', 'Q'] })
    // a comment that runs to the stream's end, with no ID after it: the image runs to the end
    expect(await bounded(lexOps, 'q BI /W 1 %no end')).toEqual({ ops: ['q', 'BI'] })
  })
  it("refuses an inline image whose parameters hold a delimiter no parameter starts with", async () => {
    for (const d of [')', '{', '}']) expect(await bounded(lexOps, `BI /W 1 ${d} /H 1 ID x EI Q`)).toEqual({ threw: expect.stringMatching(/inline image/) })
  })
  it('walks a page whose form paints itself, or whose forms paint each other past the walk budget, to a refusal', async () => {
    const self = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Fm 5 0 R >> >> /Contents 4 0 R >>',
      ['', '/Fm Do'],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /Fm 5 0 R >> >>', Array(10).fill('/Fm Do').join(' ')],
    ])
    expect(await bounded<string[]>('const r = await R.openRemover(data, { PL }); return r.walkPage(0).problems', self)).toContain('a form that paints itself')
    // eight forms, each painting the next ten times: 10^8 paints of the last
    const chain = Array.from({ length: 8 }, (_, k): [string, string] => [`/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /Fm ${k < 7 ? 6 + k : 5} 0 R >> >>`, k < 7 ? Array(10).fill('/Fm Do').join(' ') : '0 0 1 1 re f'])
    const fan = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Fm 5 0 R >> >> /Contents 4 0 R >>',
      ['', '/Fm Do'],
      ...chain,
    ])
    // (the budget asked smaller than WALK_MAX, which takes seconds to reach: the same bound)
    expect(await bounded<string[]>('const r = await R.openRemover(data, { PL, walkMax: 100000 }); return r.walkPage(0).problems', fan)).toContain('forms that paint more than the walk allows')
  })
  it("reads a font's /W ranges no further than a code can reach", async () => {
    const wide = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F0 5 0 R >> >> /Contents 4 0 R >>',
      ['', 'BT /F0 10 Tf 20 250 Td <00410042> Tj ET'],
      '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [6 0 R] >>',
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /X /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 /W [0 4294967295 500] >>',
    ])
    expect(await bounded<number>('const r = await R.openRemover(data, { PL }); return r.walkPage(0).events.filter(e => e.kind === "show")[0].codes.length', wide)).toBe(2)
  })
  it("holds a CID font's widths only as wide as the codes its /W names: 3,000 fonts without /W hold none", async () => {
    // the re-review's round 2, R2-I3: an array of every two-byte code for each Identity-H font, outside the heap and kept
    // for the document, was 512 KB a font: 3,000 fonts set on one page (their descendants empty, which PDF.js gives up
    // on in 0.25 s) held 1.5 GB of array buffers
    const n = 3000
    const fonts = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << ${Array.from({ length: n }, (_, i) => `/F${i} ${6 + i} 0 R`).join(' ')} >> >> /Contents 4 0 R >>`,
      ['', `BT ${Array.from({ length: n }, (_, i) => `/F${i} 10 Tf <0041> Tj`).join(' ')} ET`],
      '<< >>',
      ...Array.from({ length: n }, () => '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [5 0 R] >>'),
    ])
    const grew = await bounded<number>('const before = process.memoryUsage().arrayBuffers; const r = await R.openRemover(data, { PL }); const w = r.walkPage(0); const after = process.memoryUsage().arrayBuffers; if (w.events.filter(e => e.kind === "show").length !== 3000) throw new Error("shows"); return after - before', fonts, 8000, 256)
    expect(grew).toBeLessThan(16 * 2 ** 20)
  })
  it("reads a font's /W in time near its numbers, not the codes its ranges span", async () => {
    // the review of round 3, M1: 20,000 ranges [0 65535 500], each of every code, took 22 s code by code (PDF.js: 1.5 s)
    const many = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F0 5 0 R >> >> /Contents 4 0 R >>',
      ['', 'BT /F0 10 Tf 20 250 Td <00410042> Tj ET'],
      '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [6 0 R] >>',
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /X /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 /W [${Array(20000).fill('0 65535 500').join(' ')} 66 [250] 66 [/X] 1.5 [100]] >>`,
    ])
    // the codes' widths as the last entry for each gives them, as PDF.js reads /W: 0x41 by the ranges, 0x42 by the array
    // after them (a name for a width passed over, a first code not an integer ending the array)
    const widths = await bounded<number[]>('const r = await R.openRemover(data, { PL }); const e = r.walkPage(0).events.filter(e => e.kind === "show")[0]; return e.codes.map(c => e.state.font.width(c.v))', many, 3000)
    expect(widths).toEqual([0.5, 0.25])
  })
})

describe("the remover's walk bounded in memory: each stream lexed once, what a page holds within its budget", () => {
  // the review of round 3, I1: three PDFs of 0.9-30 KB that PDF.js reads in two seconds held 2.5 GB in the walk (a form
  // lexed again at each paint, a page's every content piece lexed before the walk's budget was read); each runs here in
  // a worker of a 64 MB heap, the walk's budget 2 million operators
  const fanOut = (leaf: string) => pdfOf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /A 5 0 R >> >> /Contents 4 0 R >>',
    ['', Array(10).fill('/A Do').join(' ')],
    ['/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /B 6 0 R >> >>', Array(1000).fill('/B Do').join(' ')],
    ['/Type /XObject /Subtype /Form /BBox [0 0 300 300]', leaf],
  ])
  const pieces = pdfOf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents [${Array(5000).fill('4 0 R').join(' ')}] >>`,
    ['', Array(4000).fill('zz').join(' ')],
  ])
  const walk = 'const r = await R.openRemover(data, { PL, walkMax: 2000000 }); const w = r.walkPage(0); return { problems: w.problems, held: w.held }'
  for (const [what, bytes] of [
    ['forms of 2,000 keywords PDF.js drops, painted 10,000 times', fanOut(Array(2000).fill('zz').join(' '))],
    ['forms of a 2,000-segment path, painted 10,000 times', fanOut(`0 0 m ${Array(2000).fill('1 1 l').join(' ')} S`)],
    ['one stream of 4,000 keywords 5,000 times in /Contents', pieces],
  ] as const) {
    it(`refuses the page within a 64 MB heap, holding each stream once: ${what}`, async () => {
      const r = await bounded<{ problems: string[]; held: number }>(walk, bytes, 6000, 64)
      expect(r.problems).toContain('forms that paint more than the walk allows')
      expect(r.held).toBeLessThan(25000)
    })
  }
  it('refuses a page whose streams hold more tokens, or more decoded bytes, than its budget: never the paper', async () => {
    const big = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
      ['', Array(4000).fill('zz').join(' ')],
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 6 0 R >>',
      ['', '0 0 1 1 re f'],
    ])
    const r = await bounded<string[][]>('const a = await R.openRemover(data, { PL, heldMax: 1000 }); const b = await R.openRemover(data, { PL, bytesMax: 1000 }); return [a.walkPage(0).problems, b.walkPage(0).problems, a.walkPage(1).problems]', big)
    expect(r[0]).toContain('streams that hold more than the walk allows')
    expect(r[1]).toContain('streams that hold more than the walk allows')
    expect(r[2]).toEqual([])
  })
})

describe("an edit of a long shown string costs its length, not its square", () => {
  it('takes one glyph out of a string of 800,000 codes within seconds', async () => {
    // the review of round 3, M3: each kept code was joined onto the bytes before it, 172 s for 1.28 million codes (about
    // 9 s for these; now some 150 ms)
    const long = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      ['', `BT /F1 1 Tf 20 250 Td (${'A'.repeat(800000)}) Tj ET`],
      font,
    ])
    const PDFJS = pathToFileURL(join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
    const body = `const pdfjs = await import(${JSON.stringify(PDFJS)}); const { deflateSync } = require('node:zlib')
      const doc = await pdfjs.getDocument({ data: data.slice(), verbosity: 0 }).promise
      const opList = await (await doc.getPage(1)).getOperatorList()
      const out = await R.makeAddon({ R: await R.openRemover(data, { PL }), bytes: data, OPS: pdfjs.OPS, opListOf: async () => opList, deflate: b => new Uint8Array(deflateSync(b)), plan: { pages: { 1: { units: [{ id: 1, glyphs: [0, 5], paths: [] }], crops: [] } } } })
      return out.manifest.page[1]`
    expect(await bounded<{ ok: boolean }>(body, long, 4000)).toMatchObject({ ok: true })
  })
})

describe("a Type 3 font's advance, as PDF.js draws it", () => {
  it("keeps a retained glyph where it was when a glyph before it is removed: the font matrix's translation is in the advance", async () => {
    // Codex's review of PR A, finding 4: PDF.js advances a Type 3 glyph by (w * FontMatrix[0] + FontMatrix[4]) * size;
    // with [0.001 0 0 0.001 0.1 0], widths 500 and 10 pt, A advances 6 pt, of which the removed A's number gave back 5
    const proc = '500 0 0 0 500 700 d1 0 0 500 700 re f'
    const t3 = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F3 5 0 R >> >> /Contents 4 0 R >>',
      ['', 'BT /F3 10 Tf 20 250 Td (AB) Tj ET'],
      '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0.1 0] /CharProcs << /A 6 0 R /B 7 0 R >> /Encoding << /Type /Encoding /Differences [65 /A /B] >> /FirstChar 65 /LastChar 66 /Widths [500 500] /Resources << >> >>',
      ['', proc],
      ['', proc],
    ])
    const { pages, p, out, after } = await removed(t3, ink => ({ pages: { 1: { shows: ink[0]!.shows, units: [{ id: 1, glyphs: [0, 0], paths: [] }], crops: [] } } }))
    expect(out.manifest.page[1]).toMatchObject({ ok: true })
    const at = (ink: Ink) => ink.glyphs.filter(g => g.u === 'B').map(g => g.x0)
    // B at 20 + 6 on the original and on the removed page (R, after arXiv's one page)
    expect(at(pages[0]!)).toEqual([26])
    expect(at(after.pages[1]!.ink)[0]).toBeCloseTo(26, 6)
    expect(checkPage({ orig: pages[0]!, removed: after.pages[1]!.ink, kept: after.pages[2]!.ink, entry: p.pages[1] })).toMatchObject({ removed: 1, missed: 0, moved: 0 })
    // a matrix of other than six numbers gives no advance the remover could match: the edit, and its page, refused
    const bad = new TextDecoder('latin1').decode(t3).replace('/FontMatrix [0.001 0 0 0.001 0.1 0]', '/FontMatrix [0.001 0 0 0.001 (x) 0]')
    const r2 = await removed(new Uint8Array([...bad].map(c => c.charCodeAt(0))), ink => ({ pages: { 1: { shows: ink[0]!.shows, units: [{ id: 1, glyphs: [0, 0], paths: [] }], crops: [] } } }))
    expect(r2.out.manifest.page[1]).toMatchObject({ ok: false, refused: expect.stringMatching(/Type 3 font without widths/) })
  })
})
