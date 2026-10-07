import * as PL from '@cantoo/pdf-lib'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { constants as zlibConstants, deflateRawSync, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { readBundle, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { paperAddon } from '@/pdf-reader/engine/layout/addon.mjs'
import { ADDON_CAP, parseAddonManifest, REFUSED_MAX, REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { encodeLayout, type LayoutIndex } from '@/pdf-reader/engine/layout/file.mjs'
import { pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { layoutOf, type UnitDef } from './helpers/layer-layout'

// The paper's shipped add-on (layout/addon.mjs; Plan 8's layer bundle holds it): a four-page PDF written here, one page of
// each kind the maker tells apart, and its layout file. The paper's own add-on, made from the five papers, is checked
// byte for byte against the layer gate's by spikes/addon-check.mjs (data this repository does not hold)

const enc = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))
/** a PDF from its objects' bodies (1-based, a stream as [dict, data], data's characters being bytes), with a classic
 *  cross-reference table */
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
const page = (contents: number, xobject = '') => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >>${xobject} >> /Contents ${contents} 0 R >>`
/**
 * Page 1 holds a unit's line and a glyph of another baseline under its rectangle (kept ink: the page is dirty); page 2 a
 * unit's line alone, and a rule above a table cell's line (clean, with a rule); page 3 no unit's; page 4 a unit's line in
 * a form painted twice (dirty, and a page the remover refuses)
 */
const PAPER = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>',
  page(8),
  page(9),
  page(10),
  page(11, ' /XObject << /Fm1 12 0 R >>'),
  font,
  ['', 'BT /F1 10 Tf 72 700 Td (Hello world) Tj ET\nBT /F1 10 Tf 100 688 Td (K) Tj ET'],
  ['', 'BT /F1 10 Tf 72 700 Td (Clean text) Tj ET\n72 660 50 0.5 re f'],
  ['', 'BT /F1 10 Tf 72 700 Td (No unit) Tj ET'],
  ['', 'q /Fm1 Do Q q 1 0 0 1 0 -20 cm /Fm1 Do Q'],
  ['/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >>', 'BT /F1 10 Tf 72 700 Td (Twice) Tj ET'],
])
const para = (id: number, page: number, x1: number, erase: UnitDef['erase']): UnitDef => ({ id, lines: [{ page, x0: 72, x1, baseline: 700 }], erase })
const UNITS: UnitDef[] = [
  para(1, 1, 127, [[0, 70, 693, 130, 710]]),
  para(2, 2, 122, [[0, 70, 693, 125, 710]]),
  // (a table cell's line, no text of the page its own: it gives the page its rule)
  { id: 3, kind: 'cell', lines: [{ page: 2, x0: 72, x1: 122, baseline: 650 }] },
  para(4, 4, 97, [[0, 70, 678, 100, 710]]),
]

const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b))
/** no more than limit + 1 bytes out, or a throw; a damaged zlib header read as PDF.js reads it (the gate's, the server's) */
const inflate = (b: Uint8Array, limit: number) => {
  const o = { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if ((e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}
const open = (data: Uint8Array) => getDocument({ data: data.slice(), verbosity: 0 }).promise
const concat = (a: Uint8Array, b: Uint8Array) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out }
const utf8 = (s: string) => new TextEncoder().encode(s)

/** the add-on of `bytes` as PDF.js reads it for the maker, the layout file `index` */
async function made(bytes: Uint8Array, index: LayoutIndex, over: Partial<Parameters<typeof paperAddon>[0]> = {}) {
  return paperAddon({ bytes, index, doc: 'doc' in over ? (over.doc as never) : await open(bytes), OPS, PL, deflate, inflate, ...over })
}
/** the made add-on of a result that is one, else the test fails */
function addonOf(r: Awaited<ReturnType<typeof paperAddon>>) {
  if (!r.ok) throw new Error(`refused: ${r.refused}`)
  return r
}
/** the glyphs' text of each page of a document, spaces left out */
async function textsOf(data: Uint8Array) {
  const doc = await open(data)
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p)
    out.push(pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: 0 }).glyphs.map(g => g.u).join('').replace(/\s/g, ''))
  }
  return out
}

describe('paperAddon: the shipped add-on of a paper', () => {
  it('writes R only on a page where kept ink lies under a unit, and the manifest\'s dirty and rules', async () => {
    const r = addonOf(await made(PAPER, layoutOf(UNITS, 4)))
    const m = r.manifest
    expect(m).toMatchObject({ schema: 1, removal: REMOVAL, pages: 4, sets: {} })
    // page 1: the unit's glyphs removed (R at the first page past arXiv's four), the kept glyph's box the page's dirty
    expect(m.page[1]).toMatchObject({ ok: true, units: { 1: [] }, at: { R: 5 } })
    expect(m.page[1]?.dirty).toHaveLength(4)
    expect(m.page[1]?.dirty?.[0]).toBeGreaterThan(99)
    expect(m.page[1]?.dirty?.[2]).toBeLessThan(107)
    expect(m.page[1]?.rules).toBeUndefined()
    // page 2: no kept ink under the unit, so it is removed without a page (ok, no R, no dirty), with the rule near its cell's line
    expect(m.page[2]).toEqual({ ok: true, rules: [72, 660, 122, 660.5] })
    // page 3 no unit's: not planned; page 4 a refusal of the remover's, whole page: nothing removed on it
    expect(m.page[3]).toEqual({ ok: false, refused: 'not planned' })
    expect(m.page[4]).toMatchObject({ ok: false, refused: expect.stringMatching(/painted more than once/) })
    expect(m.page[4]?.at).toBeUndefined()
    expect(m.page[4]?.dirty).toBeUndefined()
    expect(m.stats).toMatchObject({ removed: 11, refused: 1, streams: 1 })
    expect(m.appended).toBe(r.tail.length)
    expect(Object.keys(r.ms)).toEqual(['parse', 'ops', 'ink', 'plan', 'make'])
  })

  it('arXiv\'s bytes then the tail open as one document whose pages past N are the manifest\'s', async () => {
    const r = addonOf(await made(PAPER, layoutOf(UNITS, 4)))
    const whole = concat(PAPER, r.tail)
    // the original is a prefix; its own pages as they were; the one page R holds after them, with the unit's glyphs taken out and the kept one left
    expect(Buffer.from(whole.subarray(0, PAPER.length)).equals(Buffer.from(PAPER))).toBe(true)
    const before = await textsOf(PAPER), after = await textsOf(whole)
    expect(after).toHaveLength(5)
    expect(after.slice(0, 4)).toEqual(before)
    expect(before[0]).toBe('HelloworldK')
    expect(after[r.manifest.page[1]?.at?.R as number - 1]).toBe('K')
  })

  it('the manifest it writes holds no check\'s key, and parseAddonManifest and readBundle take it', async () => {
    const r = addonOf(await made(PAPER, layoutOf(UNITS, 4)))
    expect(Object.keys(r.manifest)).toEqual(['schema', 'removal', 'pages', 'sets', 'page', 'appended', 'stats'])
    expect(parseAddonManifest(utf8(JSON.stringify(r.manifest)), { pages: 4 })).toEqual(r.manifest)
    const parts = {
      paper: { id: '2608.04322', version: 1, pages: 4 }, base: { bytes: PAPER.length, sha256: 'ab'.repeat(32), url: '/api/v1/original/2608.04322v1' }, image: '1', units: [],
      left: { kinds: [], pages: Array.from({ length: 4 }, () => [0, 0, 612, 792]), units: [] }, layout: null, addon: { manifest: r.manifest, tail: r.tail },
    }
    const back = readBundle(writeBundle(parts as never))
    expect(back.addon?.manifest).toEqual(r.manifest)
    expect(back.addon?.tail).toEqual(r.tail)
  })

  it('a refusal longer than 200 characters is written cut to 200, and the manifest parses', async () => {
    // a font whose CMap is named by 300 characters (the remover's reason quotes the name: 317 characters); PDF.js reads a
    // twin of the page in a font it knows, so that the page is planned and dirty as the page of a paper is
    const hostile = (f1: string) => pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 7 0 R >> >> /Contents 5 0 R >>',
      f1,
      ['', 'BT /F1 10 Tf 72 700 Td <0048> Tj ET\nBT /F2 10 Tf 76 688 Td (K) Tj ET'],
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Foo /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>',
      font,
    ])
    const bytes = hostile(`<< /Type /Font /Subtype /Type0 /BaseFont /Foo /Encoding /${'Z'.repeat(300)} /DescendantFonts [6 0 R] >>`)
    const twin = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 4 0 R >> >> /Contents 5 0 R >>',
      font,
      ['', 'BT /F1 10 Tf 72 700 Td (H) Tj ET\nBT /F2 10 Tf 76 688 Td (K) Tj ET'],
    ])
    const r = addonOf(await made(bytes, layoutOf([para(1, 1, 77, [[0, 70, 693, 85, 710]])], 1), { doc: await open(twin) }))
    const refused = r.manifest.page[1]?.refused
    expect(r.manifest.page[1]?.ok).toBe(false)
    expect(refused).toHaveLength(REFUSED_MAX)
    expect(refused).toMatch(/^show 0: the CMap ZZZZ/)
    expect(parseAddonManifest(utf8(JSON.stringify(r.manifest)), { pages: 1 }).page[1]?.refused).toBe(refused)
  })

  it('a refusal of the whole paper never throws: it is { ok: false, refused } within 200 characters', async () => {
    const index = layoutOf(UNITS, 4)
    const notPdf = await made(enc('not a PDF at all'), index, { doc: await open(PAPER) })
    expect(notPdf).toMatchObject({ ok: false, refused: expect.stringMatching(/^the add-on could not be made/) })
    // PDF.js, the PDF and the layout file must agree on the pages
    expect(await made(PAPER, layoutOf(UNITS.filter(u => u.id !== 4), 3))).toMatchObject({ ok: false, refused: expect.stringMatching(/4 pages.*3/) })
    const short = { numPages: 3, getPage: async () => { throw new Error('unreachable') } }
    expect(await made(PAPER, index, { doc: short })).toMatchObject({ ok: false, refused: expect.stringMatching(/4 pages/) })
    // a fault midway, with a message of 1,000 characters, and values of the wrong type
    const broken = { numPages: 4, getPage: async () => { throw new Error('x'.repeat(1000)) } }
    const midway = await made(PAPER, index, { doc: broken })
    expect(midway.ok).toBe(false)
    expect(!midway.ok && midway.refused.length).toBe(REFUSED_MAX)
    for (const over of [{ index: null }, { doc: null }, { PL: null }, { OPS: null }, { deflate: null }, { bytes: null }, { bytes: new ArrayBuffer(8) }]) {
      const r = await made(PAPER, index, over as never)
      expect(r, JSON.stringify(Object.keys(over))).toMatchObject({ ok: false, refused: expect.any(String) })
    }
  })

  it('refuses an add-on past what a reader takes, and a manifest outside the reader\'s bounds', async () => {
    const index = layoutOf(UNITS, 4)
    // every stream the update holds 5 MiB (ADDON_CAP is 4)
    const big = await made(PAPER, index, { deflate: () => new Uint8Array(5 * 2 ** 20) })
    expect(big).toMatchObject({ ok: false, refused: expect.stringContaining(String(ADDON_CAP)) })
    // ink the layout file's page view lies beside (the page is 100 units wide to the file): the box is past its view
    const narrow = layoutOf(UNITS, 4)
    const file = { ...narrow.file, views: narrow.file.views.map((v, i) => (i % 4 === 2 ? 100 : v)) }
    const r = await made(PAPER, { ...narrow, file } as LayoutIndex)
    expect(r).toMatchObject({ ok: false, refused: expect.stringMatching(/^the manifest/) })
  })

  it('imports nothing but the engine\'s own relative modules: no node:*, so a Node child and a browser worker run it', () => {
    const src = readFileSync(join(process.cwd(), 'src/pdf-reader/engine/layout/addon.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1])
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) expect(s, s).toMatch(/^\.\.?\//)
    expect(src).not.toMatch(/\brequire\s*\(|\bprocess\./)
  })
})

describe('paperAddon in a worker under a 64 MB heap: the remover\'s probes, refused at the page, the worker living', () => {
  const ADDON = pathToFileURL(join(process.cwd(), 'src/pdf-reader/engine/layout/addon.mjs')).href
  const FILE = pathToFileURL(join(process.cwd(), 'src/pdf-reader/engine/layout/file.mjs')).href
  const PDFLIB = createRequire(join(process.cwd(), 'package.json')).resolve('@cantoo/pdf-lib')
  /** `body` (over A, the add-on module, F, the layout file's, PL, pdf-lib, and data) run in a worker of `heapMb`, at most `ms` */
  function inWorker<T>(body: string, data: unknown, ms = 20000, heapMb = 64): Promise<T> {
    const code = `const { parentPort, workerData } = require('node:worker_threads'); (async () => { const A = await import(workerData.addon); const F = await import(workerData.file); const PL = require(workerData.pdflib); const f = async (A, F, PL, data) => { ${body} }; parentPort.postMessage({ ok: await f(A, F, PL, workerData.data) }) })().catch(e => parentPort.postMessage({ error: String(e?.message ?? e) }))`
    return new Promise((res, rej) => {
      const w = new Worker(code, { eval: true, workerData: { addon: ADDON, file: FILE, pdflib: PDFLIB, data }, resourceLimits: { maxOldGenerationSizeMb: heapMb } })
      const t = setTimeout(() => { void w.terminate(); rej(new Error(`did not finish in ${ms} ms`)) }, ms)
      w.once('message', (m: { ok?: T; error?: string }) => { clearTimeout(t); void w.terminate(); if (m.error !== undefined) rej(new Error(m.error)); else res(m.ok as T) })
      w.once('error', e => { clearTimeout(t); rej(e) })
    })
  }
  // (PDF.js is not loaded in the worker: the page's operator list is written there, as layout-ink.test.ts writes them, a
  // unit's line and a kept glyph under its rectangle, so that the page is dirty and the remover reads the page's streams)
  const prelude = `
    const OPS = data.OPS
    const g = u => ({ unicode: u, width: 500, isSpace: u === ' ', fontChar: u, vmetric: null })
    const text = (x, y, s) => [[OPS.beginText, []], [OPS.setFont, ['f1', 10]], [OPS.setTextMatrix, [[1, 0, 0, 1, x, y]]], [OPS.showText, [[...s].map(g)]], [OPS.endText, []]]
    const ops = [...text(72, 700, 'Hello'), ...text(76, 688, 'K')]
    const list = { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }
    const face = { name: 'Helv', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false }
    const doc = { numPages: 1, getPage: async () => ({ rotate: 0, commonObjs: { get: () => face }, getOperatorList: async () => list }) }
    const index = F.indexLayout(F.parseLayout(new TextEncoder().encode(data.layout)))
    const { deflateSync, inflateSync, inflateRawSync, constants } = require('node:zlib')
    const deflate = b => new Uint8Array(deflateSync(b))
    const inflate = (b, limit) => { const o = { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }
    const run = async bytes => { const r = await A.paperAddon({ bytes, index, doc, OPS, PL, deflate, inflate }); return r.ok ? { ok: true, page: r.manifest.page[1], tail: r.tail.length } : r }
  `
  const layout = encodeLayout(layoutOf([para(1, 1, 97, [[0, 70, 693, 100, 710]])], 1).file)
  const plain = pdfOf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    ['', 'BT /F1 10 Tf 72 700 Td (Hello) Tj ET BT /F1 10 Tf 76 688 Td (K) Tj ET'],
    font,
  ])

  it('a page whose Flate stream decodes to 2 GB is refused as it decodes, and the worker makes the next paper\'s add-on', async () => {
    // a zlib stream of 32 blocks of 64 MB of spaces, each flushed whole (so that its bytes repeat): 2 MB of file
    const block = deflateRawSync(Buffer.alloc(64 * 2 ** 20, 32), { finishFlush: zlibConstants.Z_FULL_FLUSH })
    const bomb = Buffer.concat([Buffer.from([0x78, 0x9c]), ...Array(32).fill(block), Buffer.from([0x03, 0x00])]).toString('latin1')
    const bad = pdfOf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>', ['/Filter /FlateDecode', bomb]])
    const r = await inWorker<{ bad: { ok: boolean; page?: { ok: boolean; refused: string } }; good: { ok: boolean; page?: { ok: boolean; at?: unknown }; tail?: number }; grew: number }>(
      `${prelude} const before = process.memoryUsage().arrayBuffers; const bad = await run(data.bad); const grew = process.memoryUsage().arrayBuffers - before; return { bad, good: await run(data.good), grew }`,
      { bad, good: plain, layout, OPS }, 30000)
    // (the paper is made, its one page refused: never the paper, and not a byte past the walk's budget read of the stream)
    expect(r.bad).toMatchObject({ ok: true, page: { ok: false, refused: expect.stringMatching(/decode to more than the walk allows/) } })
    expect(r.grew).toBeLessThan(160 * 2 ** 20)
    expect(r.good).toMatchObject({ ok: true, page: { ok: true, at: { R: 2 } } })
    expect(r.good.tail).toBeGreaterThan(0)
  }, 40000)

  it('a page whose forms paint an XObject they do not have 20 million times is refused, and the worker lives', async () => {
    const missing = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /A 5 0 R >> >> /Contents 4 0 R >>',
      ['', '/A Do'],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /B 6 0 R >> >>', Array(4000).fill('/B Do').join(' ')],
      ['/Type /XObject /Subtype /Form /BBox [0 0 300 300]', Array(4990).fill('/Z Do').join(' ')],
    ])
    const r = await inWorker<{ bad: { ok: boolean; page?: { ok: boolean; refused: string } }; good: { ok: boolean } }>(`${prelude} return { bad: await run(data.bad), good: await run(data.good) }`, { bad: missing, good: plain, layout, OPS }, 30000)
    expect(r.bad).toMatchObject({ ok: true, page: { ok: false, refused: expect.stringMatching(/more than the walk allows/) } })
    expect(r.good.ok).toBe(true)
  }, 40000)
})
