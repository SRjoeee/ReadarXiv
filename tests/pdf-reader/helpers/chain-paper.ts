import * as PL from '@cantoo/pdf-lib'
import { createHash } from 'node:crypto'
import { constants as zlibConstants, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { BundleUnit } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { pagePlansOf } from '@/pdf-reader/engine/layout/addon.mjs'
import { removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf } from '@/pdf-reader/engine/layout/tail.mjs'
import type { Whole } from './cut-paper'
import { layoutOf, type UnitDef } from './layout-of'
import { installLiteWorker, LITE } from './lite-pdfjs'

// A paper for the chained add-on's tests (layout/chain.mjs): a PDF written here with a classic cross-reference table (or the
// same saved by pdf-lib with a cross-reference stream), its layout file and the whole the cutter takes, one unit a page:
//   1 a unit's line and a kept glyph under its rectangle (dirty: the remover's), 2 a unit's line and a cell's line under a
//   rule (clean, with a rule), 3 no unit's (not planned), 4 and 5 like 1 (dirty), 6 a unit's line in a form painted twice
//   (dirty, and refused by the remover)

const latin = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))
/** a PDF from its objects' bodies (1-based, a stream as [dict, data]), with a classic cross-reference table */
export function pdfOf(objects: (string | [string, string])[]): Uint8Array {
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += Array.isArray(o) ? `${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n${o[1]}\nendstream\nendobj\n` : `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const at = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return latin(out)
}
const font = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${Array(95).fill(500).join(' ')}] >>`
const page = (contents: number, xobject = '') => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${xobject} >> /Contents ${contents} 0 R >>`
const dirtyText = (s: string) => `BT /F1 10 Tf 72 700 Td (${s}) Tj ET\nBT /F1 10 Tf 100 688 Td (K) Tj ET`

/** the six-page paper, classic */
export const SIX = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R] /Count 6 >>',
  font,
  page(10), page(11), page(12), page(13), page(14), page(15, ' /XObject << /Fm1 16 0 R >>'),
  ['', dirtyText('Hello world')],
  ['', 'BT /F1 10 Tf 72 700 Td (Clean text) Tj ET\n72 660 50 0.5 re f'],
  ['', 'BT /F1 10 Tf 72 700 Td (No unit) Tj ET'],
  ['', dirtyText('Fourth page')],
  ['', dirtyText('Fifth pages')],
  ['', 'q /Fm1 Do Q q 1 0 0 1 0 -20 cm /Fm1 Do Q'],
  ['/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >>', 'BT /F1 10 Tf 72 700 Td (Twice) Tj ET'],
])
/** the same paper saved with a cross-reference stream and object streams */
export const sixStream = async () => (await PL.PDFDocument.load(SIX, { updateMetadata: false })).save({ useObjectStreams: true })

const para = (id: number, p: number, x1: number, erase: UnitDef['erase']): UnitDef => ({ id, pieces: 1, lines: [{ page: p, x0: 72, x1, baseline: 700 }], erase })
export const SIX_UNITS: UnitDef[] = [
  para(0, 1, 127, [[0, 70, 693, 130, 710]]),
  para(1, 2, 122, [[0, 70, 693, 125, 710]]),
  { id: 2, kind: 'cell', pieces: 1, lines: [{ page: 2, x0: 72, x1: 122, baseline: 650 }] },
  para(3, 4, 127, [[0, 70, 693, 130, 710]]),
  para(4, 5, 127, [[0, 70, 693, 130, 710]]),
  para(5, 6, 97, [[0, 70, 678, 100, 710]]),
]

export const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b))
/** no more than limit + 1 bytes out, or a throw; a damaged zlib header read as PDF.js reads it */
export const inflate = (b: Uint8Array, limit: number) => {
  const o = { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if ((e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}
// (read without the images' pixels, as the server reads arXiv's PDF: pdf-lite.mjs)
export const open = async (data: Uint8Array) => { await installLiteWorker(); return getDocument({ data: data.slice(), verbosity: 0, ...LITE }).promise }
export const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0)); let o = 0; for (const b of parts) { out.set(b, o); o += b.length } return out }
export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
export { OPS }

/** the paper made whole for the cutter: its units (one a page's unit, the cell a table's), its left (each unit's line), its
 *  layout file */
export function sixWhole(bytes: Uint8Array): Whole {
  const index = layoutOf(SIX_UNITS, 6)
  const units = SIX_UNITS.map(u => [u.kind ?? 'para', 0, null, u.kind === 'cell' ? { table: 0, row: 0, col: 0, span: 1, head: false } : null, null, [[0, `unit ${u.id}`]]] as BundleUnit)
  const left = SIX_UNITS.map(u => { const l = u.lines[0]!; return [u.id, 20 * ((l.page ?? 1) - 1) + 1 + u.id, [[l.page ?? 1, l.x0 ?? 72, l.baseline - 2.5, l.x1, l.baseline + 7]]] as Whole['left']['units'][number] })
  return {
    paper: { id: '2600.00002', version: 1, pages: 6 }, base: { bytes: bytes.length, sha256: sha256(bytes), xref: startxrefOf(bytes)! }, versions: { image: '1' }, units,
    left: { kinds: units.map(u => u[0]), pages: Array.from({ length: 6 }, () => [0, 0, 612, 792] as [number, number, number, number]), units: left }, layout: index.file,
  }
}

/** the paper's plans (pagePlansOf over its own layout file) and an in-process remover over its bytes */
export async function sixPlans(bytes: Uint8Array) {
  const index = layoutOf(SIX_UNITS, 6)
  const doc = await open(bytes)
  const { plans } = await pagePlansOf({ doc, OPS, index })
  await doc.loadingTask.destroy()
  return { index, plans, planOf: (p: number) => plans.get(p) ?? null, remover: removerOf({ bytes, PL, inflate, deflate }) }
}
export { PL }
