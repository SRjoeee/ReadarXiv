// @vitest-environment node
// The engine's guards against input out of contract, each fed that input here and held to what it does (the coordinator's
// ruling of 2026-11-14 on the rule ledger: a guard no input takes is untested code; lab/rules' recording found none of these
// taking its other side on the papers or in the tests): a date's minute or second past 59; a \texorpdfstring with no second
// group; a macro of ten parameters; a stream predicted by PDF's predictor 1 or 2; a cross-reference stream's field wider than
// eight bytes; forms nested thirteen deep; a CMap whose codespace is wider than four bytes; a split `"` whose word spacing
// the wrap writes as 0.
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { pdfDateEpoch, xmpDateEpoch } from '../src/compile/base.ts'
import { pageInk } from '../src/ink.ts'
// @ts-expect-error: the moved JavaScript (packages/engine/src/marks/marks.mjs) has no declaration in the package
import { completeCalled } from '../src/marks/marks.mjs'
import { alignOf, openRemover } from '../src/remove.ts'
import { inMemory, loadProject } from '../src/source/latex-front.ts'
import { planOf, wrapOf } from '../src/wrap.ts'
import { openObjects } from '../src/xref.ts'

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
/** a PDF of these objects (1 0 R, 2 0 R, …): a dictionary, or a stream as [its dictionary's entries, its data], with a
 *  cross-reference table */
function pdfOf(objects: (string | [string, string])[]): Uint8Array {
  let body = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(body.length)
    body +=
      typeof o === 'string'
        ? `${i + 1} 0 obj\n${o}\nendobj\n`
        : `${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n${o[1]}\nendstream\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return enc(body)
}
/** a PDF whose cross-reference is a stream of `/W` widths, its data `rows` predicted by `/Predictor` (none filtered) */
function xrefStreamPdf(W: [number, number, number], predictor: number | null): Uint8Array {
  const head = '%PDF-1.5\n'
  const o1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const o2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n'
  const offsets = [0, head.length, head.length + o1.length, head.length + o1.length + o2.length]
  const field = (v: number, n: number) => Array.from({ length: n }, (_, k) => (v >>> (8 * (n - 1 - k))) & 255)
  const rows = offsets.flatMap((off, i) => [
    ...field(i ? 1 : 0, W[0]),
    ...field(i ? off : 0, W[1]),
    ...field(i ? 0 : 255, W[2]),
  ])
  const parms = predictor === null ? '' : ` /DecodeParms << /Predictor ${predictor} /Columns ${W[0] + W[1] + W[2]} >>`
  const o3 = `3 0 obj\n<< /Type /XRef /Size 4 /W [${W.join(' ')}] /Root 1 0 R${parms} /Length ${rows.length} >>\nstream\n`
  return concat([
    enc(head + o1 + o2 + o3),
    Uint8Array.from(rows),
    enc(`\nendstream\nendobj\nstartxref\n${offsets[3]}\n%%EOF\n`),
  ])
}

describe('a date out of its definition (compile/base.mjs: PDF 32000-1 §7.9.4, ISO 8601 as XMP writes it)', () => {
  it('a minute or a second past 59 is no date: null, never rolled into the next hour or minute', () => {
    expect(pdfDateEpoch('D:20261015127500Z')).toBeNull()
    expect(pdfDateEpoch('D:20261015123075Z')).toBeNull()
    expect(xmpDateEpoch('2026-08-06T12:75Z')).toBeNull()
    expect(xmpDateEpoch('2026-08-06T12:00:75Z')).toBeNull()
    // (59 is a date: the bound is the definition's)
    expect(pdfDateEpoch('D:20261015125959Z')).toBe(Date.UTC(2026, 9, 15, 12, 59, 59) / 1000)
    expect(xmpDateEpoch('2026-08-06T12:59:59Z')).toBe(Date.UTC(2026, 7, 6, 12, 59, 59) / 1000)
  })
})

describe("\\texorpdfstring with no second group (source/latex-front.mjs's walk)", () => {
  type Unit = { kind: string; pieces: { t: string; s?: string; src?: string }[] }
  const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`
  const unitsOf = (tex: string) =>
    (loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true }).units as Unit[]).map(
      (u) => [
        u.kind,
        u.pieces
          .filter((p) => p.t === 'text')
          .map((p) => p.s)
          .join('')
          .replace(/\s+/g, ' ')
          .trim(),
      ],
    )
  it('is read as any call the role table reads, never as the pair: no second argument is looked for, nothing throws', () => {
    expect(unitsOf(doc('\\section{\\texorpdfstring{Plain words}}\nThe text goes on.'))).toEqual(
      unitsOf(doc('\\section{\\nopair{Plain words}}\nThe text goes on.')),
    )
    expect(unitsOf(doc('In text, \\texorpdfstring{the typeset words} stand.'))).toEqual(
      unitsOf(doc('In text, \\nopair{the typeset words} stand.')),
    )
    // (with its two groups it is the pair: its first argument's words are the text)
    expect(unitsOf(doc('\\section{\\texorpdfstring{Plain words}{Plain}}\nThe text goes on.'))).toEqual([
      ['heading', 'Plain words'],
      ['para', 'The text goes on.'],
    ])
  })
})

describe('a macro of ten parameters (marks/marks.mjs completeCalled)', () => {
  it("is left out of the complete macros the marking records: TeX's parameters are #1 to #9, the layout file's check takes one digit", () => {
    const units = [
      {
        pieces: [
          { t: 'ph', src: '\\ten{a}' },
          { t: 'ph', src: '\\nine{a}' },
        ],
      },
    ]
    expect(
      completeCalled(units, [
        ['ten', 10],
        ['nine', 9],
      ]),
    ).toEqual({ nine: 9 })
  })
})

describe("a stream's predictor and a cross-reference stream's field widths (xref.ts openObjects)", () => {
  const open = (b: Uint8Array) => openObjects(b, { PL: PL as never, objectsMax: 1000, decodedMax: 1 << 20 })
  it("predictor 1 (none) is read as it is; predictor 2 (TIFF), or any but PNG's 10 to 15, is refused", () => {
    for (const p of [null, 1])
      expect(String(open(xrefStreamPdf([1, 2, 1], p)).lookup(PL.PDFRef.of(1, 0) as never))).toContain('/Catalog')
    expect(() => open(xrefStreamPdf([1, 2, 1], 2))).toThrow(/a predictor 2/)
  })
  it('a field wider than eight bytes (/W [1 9 1]) is refused before a row is read', () => {
    expect(() => open(xrefStreamPdf([1, 9, 1], null))).toThrow(/with \/W \[ 1 9 1 \]/)
  })
})

describe("the remover's walk (remove.ts openRemover)", () => {
  const PAGE = (res: string) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << ${res} >> /Contents 4 0 R >>`
  it('refuses a page whose forms nest thirteen deep, and walks one of twelve', async () => {
    const nested = (n: number) =>
      pdfOf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        PAGE('/XObject << /Fm 5 0 R >>'),
        ['', '/Fm Do'],
        ...Array.from({ length: n }, (_, k): [string, string] => [
          `/Type /XObject /Subtype /Form /BBox [0 0 300 300] /Resources << /XObject << /Fm ${k + 6} 0 R >> >>`,
          k < n - 1 ? '/Fm Do' : '0 0 1 1 re f',
        ]),
      ])
    const problems = async (n: number) => (await openRemover(nested(n), { PL: PL as never })).walkPage(0).problems
    expect(await problems(13)).toContain('forms nested too deep')
    expect(await problems(12)).not.toContain('forms nested too deep')
  })
  it('reads a string in a font whose embedded CMap names codes wider than four bytes one byte a code, as PDF.js does', async () => {
    const cmap =
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000000000> <FFFFFFFFFF> endcodespacerange endcmap end end'
    const pdf = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      PAGE('/Font << /F0 5 0 R >>'),
      ['', 'BT /F0 10 Tf 20 250 Td <0000000041> Tj ET'],
      '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding 7 0 R /DescendantFonts [6 0 R] >>',
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /X /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 >>',
      ['', cmap],
    ])
    const walk = (await openRemover(pdf, { PL: PL as never })).walkPage(0)
    const show = walk.events.find((e) => e.kind === 'show') as { codes: { cs: number; ce: number; v: number }[] }
    expect(show.codes.map((c) => [c.cs, c.ce, c.v])).toEqual([
      [0, 1, 0],
      [1, 2, 0],
      [2, 3, 0],
      [3, 4, 0],
      [4, 5, 0x41],
    ])
  })
})

describe('the wrap\'s proof of a split `"` (wrap.ts sameOps)', () => {
  const OPTIONS = { verbosity: 0, useSystemFonts: false, isEvalSupported: false, fontExtraProperties: true }
  const O = OPS as unknown as Record<string, number>
  const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b, { level: 6 }))
  const inflate = (b: Uint8Array, limit: number) => new Uint8Array(inflateSync(b, { maxOutputLength: limit + 1 }))
  /** one page of Helvetica as /F1, its content `content`, wrapped under a plan that splits each show after its second glyph */
  async function wrapSplit(content: string) {
    const doc = await PL.PDFDocument.create()
    const page = doc.addPage([612, 792])
    page.node.setFontDictionary(PL.PDFName.of('F1'), (await doc.embedFont(PL.StandardFonts.Helvetica)).ref)
    page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
    const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }))
    const task = getDocument({ ...OPTIONS, data: bytes.slice() })
    const pdf = await task.promise
    const ops = await (await pdf.getPage(1)).getOperatorList()
    const ink = pageInk(
      O,
      ops as never,
      (await pdf.getPage(1)).commonObjs as never,
      { rotate: 0, indices: true, turned: true } as never,
    ) as unknown as { glyphs: { n?: number; k?: number }[]; paths?: number[] }
    const facts = alignOf(O, ops as never)
    await task.destroy()
    const groups = ink.glyphs.map((g) => (g.n !== undefined && g.n >= 0 ? `u${g.n + ((g.k ?? 0) >= 2 ? 1 : 0)}` : null))
    const plan = planOf(
      ink.glyphs as never,
      groups,
      ink.paths ?? [],
      (ink.paths ?? []).map(() => null),
      facts as never,
    )
    return (await wrapOf(bytes, new Map([[1, { facts, ...plan } as never]]), {
      PL: PL as never,
      deflate,
      inflate,
    })) as unknown as {
      stats: Record<string, number>
      pages: Map<number, { ok: boolean; why?: string; split?: number }>
    }
  }
  it("proves a split show whose word spacing it writes as given, and refuses one whose spacing it writes as 0 (0.0000005): A DEFECT OF THE PROOF'S WRITER, held here as the code does it, not fixed", async () => {
    expect((await wrapSplit('BT /F1 10 Tf 72 700 Td 12 TL 1 2 (abcd) " ET')).pages.get(1)).toMatchObject({
      ok: true,
      split: 1,
    })
    // (a valid page: fmt writes Tw 0.0000005 as 0, sameOps finds the split show's Tw not its own, the page is refused)
    expect((await wrapSplit('BT /F1 10 Tf 72 700 Td 12 TL 0.0000005 0 (abcd) " ET')).pages.get(1)).toMatchObject({
      ok: false,
      why: "its proof: operator 4: a split show's Tw not its own",
    })
  })
})
