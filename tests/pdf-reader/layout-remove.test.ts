import * as PL from '@cantoo/pdf-lib'
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
})
