import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { constants as zlibConstants, deflateRawSync, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

// The content streams' reader the wrap walks our pages with (layout/remove.mjs: lex, openRemover) on PDFs written here: every
// loop advances or refuses, and a page's walk holds what its budget allows. What it removed for the text-removed PDF is gone with
// it (docs/route/ocg-erasure.md §4.2).

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
/** pdfOf with its streams' bytes as they are (each character a byte: a deflated stream) */
function pdfBin(objects: (string | [string, string])[]): Uint8Array {
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += Array.isArray(o) ? `${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n${o[1]}\nendstream\nendobj\n` : `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const at = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}


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

describe('the remover holds a decoded stream as bytes of its own', () => {
  it('a small stream decoded through a buffer grown past it is its own bytes, so that the decoded streams\' cache holds what it counts (2610.21924)', async () => {
    // a 2 KB content stream, Flate: the object layer's DecodeStream reads it in chunks of 64 KB and grows its buffer past that,
    // and a view of it held the whole buffer (3,128 such forms on one page held 960 MB)
    const body = 'q 0 0 1 1 re f Q\n'.repeat(120)
    const z = Buffer.from(deflateSync(Buffer.from(body, 'latin1'))).toString('latin1')
    const doc = pdfBin([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
      ['/Filter /FlateDecode', z],
    ])
    const got = await bounded<{ length: number; held: number }>('const r = await R.openRemover(data, { PL }); const b = r.decode(r.ctx.lookup(PL.PDFRef.of(4))); return { length: b.length, held: b.buffer.byteLength }', doc)
    expect(got).toEqual({ length: body.length, held: body.length })
  })
})

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
  it("reads an embedded CMap's codespaces in one pass, however many open with no close", async () => {
    // the re-review's round 2, R2-I4: each of 120,000 openings with no close ran the pattern to the text's end, 22 s for
    // a CMap of 13.6 KB (PDF.js: 0.29 s); a codespace read, and the codes it splits, are as before
    const cmap = (body: string) => pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F0 5 0 R >> >> /Contents 4 0 R >>',
      ['', 'BT /F0 10 Tf <0041> Tj ET'],
      '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding 6 0 R /DescendantFonts [7 0 R] >>',
      ['/Type /CMap /CMapName /X', body],
      '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /X /CIDSystemInfo << /Registry (Adobe) /Ordering (X) /Supplement 0 >> >>',
    ])
    const codes = 'const r = await R.openRemover(data, { PL }); const w = r.walkPage(0); return { problems: w.problems, codes: w.events.filter(e => e.kind === "show").map(e => e.codes.length) }'
    // (no codespace read: the font is refused for an edit, its codes read a byte each)
    expect(await bounded(codes, cmap('begincodespacerange '.repeat(120000)), 3000, 256)).toEqual({ problems: [], codes: [2] })
    expect(await bounded(codes, cmap('1 begincodespacerange <0000> <ffff> endcodespacerange begincodespacerange'), 3000, 256)).toEqual({ problems: [], codes: [1] })
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
  // (each stream held once, and only the operators the walk reads with their operands: the keywords and the path's
  // segments are let go as they are lexed, and each stream's painting operator is an event a paint)
  const walk = 'const r = await R.openRemover(data, { PL }); const w = r.walkPage(0); return { problems: w.problems, held: w.held }'
  for (const [what, bytes, most] of [
    // (10,000 paints of a form: an event each, some 3 MB; the path's painting operator an event more each)
    ['forms of 2,000 keywords PDF.js drops, painted 10,000 times', fanOut(Array(2000).fill('zz').join(' ')), 4e6],
    ['forms of a 2,000-segment path, painted 10,000 times', fanOut(`0 0 m ${Array(2000).fill('1 1 l').join(' ')} S`), 6e6],
    ['one stream of 4,000 keywords 5,000 times in /Contents', pieces, 10000],
  ] as const) {
    it(`walks it within a 64 MB heap, holding each stream once and what the walk reads of it: ${what}`, async () => {
      const r = await bounded<{ problems: string[]; held: number }>(walk, bytes, 6000, 64)
      expect(r.problems).toEqual([])
      expect(r.held).toBeLessThan(most)
    })
  }
  it('refuses a page whose streams hold more bytes, or more decoded bytes, than its budget: never the paper', async () => {
    const big = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
      ['', `${Array(4000).fill('(a)').join(' ')} n`],
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 6 0 R >>',
      ['', '0 0 1 1 re f'],
    ])
    const r = await bounded<string[][]>('const a = await R.openRemover(data, { PL, heldMax: 1000 }); const b = await R.openRemover(data, { PL, bytesMax: 1000 }); return [a.walkPage(0).problems, b.walkPage(0).problems, a.walkPage(1).problems]', big)
    expect(r[0]).toContain('streams that hold more than the walk allows')
    expect(r[1]).toContain('streams that decode to more than the walk allows')
    expect(r[2]).toEqual([])
  })
})

describe("the walk's budget against the re-review's probes, each under a 256 MB heap", () => {
  // the re-review's round 2, R2-I1 and R2-I2: what each token and each event holds, by its kind, not a count of tokens;
  // each content stream below is one Flate stream of a file of some 23-60 KB, which PDF.js reads in under a second
  const flate = (content: string) => pdfBin([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
    ['/Filter /FlateDecode', Buffer.from(deflateSync(Buffer.from(content, 'latin1'))).toString('latin1')],
  ])
  const walk = 'const r = await R.openRemover(data, { PL }); return r.walkPage(0).problems'
  const HELD = 'streams that hold more than the walk allows', DECODED = 'streams that decode to more than the walk allows'
  // (a stream decoding past BYTES_MAX, 48 MiB, is refused as it decodes; one under it by what its tokens hold)
  for (const [what, content, why] of [
    ['60 MB of "["', '['.repeat(60_000_000), DECODED],
    ['40 MB of "["', '['.repeat(40_000_000), HELD],
    ['7.9 million "(a)" and a painting operator', `${'(a) '.repeat(7_900_000)}n`, HELD],
    ['7.9 million "<61>" and a painting operator', `${'<61> '.repeat(7_900_000)}n`, HELD],
    ['one hex string of 60 MB', `<${'6'.repeat(60_000_000)}> Tj`, DECODED],
  ] as const) {
    it(`refuses the page, never running out of memory: ${what}`, async () => {
      expect(await bounded<string[]>(walk, flate(content), 20000, 256)).toEqual([why])
    }, 30000)
  }
  it('refuses a page whose Flate stream decodes to 2 GB as it decodes, reading no further than its budget', async () => {
    // a zlib stream of 32 blocks of 64 MB of spaces, each flushed whole (so that its bytes repeat): 2 MB of file
    const block = deflateRawSync(Buffer.alloc(64 * 2 ** 20, 32), { finishFlush: zlibConstants.Z_FULL_FLUSH })
    const bomb = Buffer.concat([Buffer.from([0x78, 0x9c]), ...Array(32).fill(block), Buffer.from([0x03, 0x00])]).toString('latin1')
    const pdf = pdfBin([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
      ['/Filter /FlateDecode', bomb],
    ])
    const r = await bounded<{ problems: string[]; grew: number }>('const before = process.memoryUsage().arrayBuffers; const r = await R.openRemover(data, { PL }); const problems = r.walkPage(0).problems; return { problems, grew: process.memoryUsage().arrayBuffers - before }', pdf, 8000, 256)
    expect(r.problems).toEqual([DECODED])
    expect(r.grew).toBeLessThan(160 * 2 ** 20)
  }, 30000)
  it('refuses a page whose forms paint an XObject it does not have 20 million times: each an event, in its budget', async () => {
    const missing = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /A 5 0 R >> >> /Contents 4 0 R >>',
      ['', '/A Do'],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /B 6 0 R >> >>', Array(4000).fill('/B Do').join(' ')],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300]', Array(4990).fill('/Z Do').join(' ')],
    ])
    expect(await bounded<string[]>(walk, missing, 8000, 256)).toEqual([HELD])
  })
  it('refuses a page of 980 B whose forms show 20 million times with no font set: no event recorded, the visits bounded', async () => {
    const fontless = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /A 5 0 R >> >> /Contents 4 0 R >>',
      ['', '/A Do'],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /B 6 0 R >> >>', Array(4000).fill('/B Do').join(' ')],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300]', Array(4990).fill('(x) Tj').join(' ')],
    ])
    expect(await bounded<string[]>('const r = await R.openRemover(data, { PL }); const w = r.walkPage(0); return [...w.problems, String(w.events.filter(e => e.kind === "show").length)]', fontless, 8000, 256)).toEqual(['forms that paint more than the walk allows', '0'])
  })
})

