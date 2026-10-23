import { deflateSync } from 'node:zlib'
import { rangesOf } from '@/pdf-reader/engine/layout/delta-wire.mjs'
import { appendSection } from '@/pdf-reader/engine/layout/section.mjs'

// Synthetic PDFs for the delta's tests (layout/delta.mjs), written byte by byte so that every case the builder must meet is
// there exactly: a classic table or a cross-reference stream (PNG Up predictor, Flate) with its objects in an object stream,
// an image whose /Length is an indirect object and whose data ends in a carriage return just before `\nendstream` (the object
// layer's scan reads it one byte short), a page whose /Contents is an array, the same font and image objects under other
// numbers in the two documents, one font of ours alone, and a resource cycle.

const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 255)
export const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

/** an object: its dict or value text, and a stream's data (its /Length written by `length`: the number, or a ref text) */
export type Obj = { text: string } | { dict: string; data: Uint8Array; length?: string }
/** a PDF of `objects` (number -> object), the catalog `root`; `kind` its cross-reference; `packed` the numbers written into
 *  one object stream (stream kind alone) */
export function pdfOf(objects: Map<number, Obj>, { root, kind = 'table', packed = [] }: { root: number; kind?: 'table' | 'stream'; packed?: number[] }): Uint8Array {
  const parts: Uint8Array[] = [enc('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n')]
  let at = parts[0]!.length
  const rows = new Map<number, [number, number, number]>()
  const put = (n: number, bytes: Uint8Array) => { rows.set(n, [1, at, 0]); parts.push(bytes); at += bytes.length }
  const objBytes = (n: number, o: Obj) => ('text' in o
    ? enc(`${n} 0 obj\n${o.text}\nendobj\n`)
    : concat([enc(`${n} 0 obj\n<<${o.dict} /Length ${o.length ?? o.data.length} >>\nstream\n`), o.data, enc('\nendstream\nendobj\n')]))
  const numbers = [...objects.keys()].sort((a, b) => a - b)
  const inStm = kind === 'stream' ? new Set(packed) : new Set<number>()
  for (const n of numbers) if (!inStm.has(n)) put(n, objBytes(n, objects.get(n)!))
  let size = Math.max(...numbers) + 1
  if (inStm.size) {
    const stm = size++
    const bodies = [...inStm].sort((a, b) => a - b).map(n => { const o = objects.get(n)!; if (!('text' in o)) throw new Error('a stream in an object stream'); return [n, `${o.text}\n`] as const })
    let off = 0
    const head = `${bodies.map(([n, t]) => { const h = `${n} ${off}`; off += t.length; return h }).join(' ')}\n`
    const data = deflateSync(enc(head + bodies.map(([, t]) => t).join('')))
    put(stm, concat([enc(`${stm} 0 obj\n<< /Type /ObjStm /N ${bodies.length} /First ${head.length} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`), data, enc('\nendstream\nendobj\n')]))
    bodies.forEach(([n], i) => { rows.set(n, [2, stm, i]) })
  }
  if (kind === 'table') {
    const lines = [`xref\n0 ${size}\n`, '0000000000 65535 f\r\n']
    for (let n = 1; n < size; n++) { const r = rows.get(n); lines.push(r ? `${String(r[1]).padStart(10, '0')} 00000 n\r\n` : '0000000000 00000 f\r\n') }
    parts.push(enc(`${lines.join('')}trailer\n<< /Size ${size} /Root ${root} 0 R /ID [<0011aabb> <0011aabb>] >>\nstartxref\n${at}\n%%EOF\n`))
  } else {
    const xs = size++
    rows.set(xs, [1, at, 0])
    // (rows of /W [1 4 2], each with PNG's Up filter byte, Flate over them)
    const raw: number[] = []
    let prev = [0, 0, 0, 0, 0, 0, 0]
    for (let n = 0; n < size; n++) {
      const r = rows.get(n) ?? [0, 0, 0]
      const row = [r[0], (r[1] >>> 24) & 255, (r[1] >>> 16) & 255, (r[1] >>> 8) & 255, r[1] & 255, (r[2] >> 8) & 255, r[2] & 255]
      raw.push(2, ...row.map((v, i) => (v - prev[i]! + 256) & 255))
      prev = row
    }
    const data = deflateSync(Uint8Array.from(raw))
    parts.push(concat([enc(`${xs} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Root ${root} 0 R /ID [<0011aabb> <0011aabb>] /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${data.length} >>\nstream\n`), data, enc(`\nendstream\nendobj\nstartxref\n${at}\n%%EOF\n`)]))
  }
  return concat(parts)
}

const content = (s: string): Obj => ({ dict: '', data: enc(s) })
const text = (s: string, y = 100, font = 'F1') => `BT /${font} 12 Tf 20 ${y} Td (${s}) Tj ET\n`
/** a 2 x 2 RGB image whose data ends in a carriage return (written before `\nendstream`) */
const IMAGE_DATA = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 13])
const IMAGE_DICT = ' /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8'
/** a photograph's bytes (not drawn): what makes a base page heavy and its delta light, the same object in both */
const PHOTO = (() => { const b = new Uint8Array(100 * 66 * 3); let x = 7; for (let i = 0; i < b.length; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24 } return b })()
const PHOTO_DICT = ' /Type /XObject /Subtype /Image /Width 100 /Height 66 /ColorSpace /DeviceRGB /BitsPerComponent 8'
const HELVETICA = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

/** arXiv's PDF, 3 pages: a shared resources dict (Helvetica, the image), page 3 its own with Times too */
export function origObjects(): Map<number, Obj> {
  return new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R >>' }],
    [2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 /MediaBox [0 0 200 200] >>' }],
    [3, { text: '<< /Type /Page /Parent 2 0 R /Resources 6 0 R /Contents 7 0 R >>' }],
    [4, { text: '<< /Type /Page /Parent 2 0 R /Resources 6 0 R /Contents 8 0 R /Rotate 0 >>' }],
    [5, { text: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 10 0 R /F2 11 0 R >> >> /Contents 9 0 R >>' }],
    [6, { text: '<< /Font << /F1 10 0 R >> /XObject << /Im1 12 0 R /Im2 14 0 R >> >>' }],
    [14, { dict: PHOTO_DICT, data: PHOTO }],
    [7, content(`${text('Original page one')}q 20 0 0 20 20 20 cm /Im1 Do Q\n`)],
    [8, content(text('Original page two'))],
    [9, content(text('Original page three') + text('in Times', 80, 'F2'))],
    [10, { text: HELVETICA }],
    [11, { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>' }],
    [12, { dict: IMAGE_DICT, data: IMAGE_DATA, length: '13 0 R' }],
    [13, { text: String(IMAGE_DATA.length) }],
  ])
}
/** our final pass: other numbers, our contents; Helvetica and the image the same objects by bytes (the image's /Length
 *  indirect too), Courier ours alone, page 2's resources an object of their own with an ExtGState cycle, page 3's /Contents an
 *  array */
export function oursObjects(): Map<number, Obj> {
  return new Map<number, Obj>([
    [1, { text: '<< /Type /Catalog /Pages 2 0 R /Names 40 0 R >>' }],
    [40, { text: '<< >>' }],
    [2, { text: '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>' }],
    [3, { text: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F7 20 0 R >> /XObject << /X9 21 0 R /X10 29 0 R >> /ProcSet [/PDF /Text] >> /Contents 22 0 R >>' }],
    [4, { text: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources 23 0 R /Contents 25 0 R >>' }],
    [5, { text: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F7 20 0 R >> >> /Contents [26 0 R 27 0 R] >>' }],
    [20, { text: HELVETICA }],
    [21, { dict: IMAGE_DICT, data: IMAGE_DATA, length: '28 0 R' }],
    [28, { text: String(IMAGE_DATA.length) }],
    [29, { dict: PHOTO_DICT, data: PHOTO }],
    [22, content(`${text('Our page one', 100, 'F7')}q 20 0 0 20 20 20 cm /X9 Do Q\n`)],
    [23, { text: '<< /Font << /F7 20 0 R /F8 24 0 R >> /ExtGState << /G1 30 0 R >> >>' }],
    [24, { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>' }],
    [25, content(text('Our page two', 100, 'F7') + text('in Courier', 80, 'F8'))],
    [26, content(text('Our page three', 100, 'F7'))],
    [27, content(text('second stream', 80, 'F7'))],
    [30, { text: '<< /Type /ExtGState /CA 1 /AXTLoop 31 0 R >>' }],
    [31, { text: '<< /Back 30 0 R >>' }],
  ])
}
export const ORIG_PACKED = [1, 2, 3, 4, 5, 6, 10, 11, 13]

/** a delta section over an original of `orig.bytes` bytes and startxref `orig.xref`, as the builder writes one (section.mjs):
 *  for each page given its page object written again (number 10 + p) with a content stream of its own; its digest, ranges and
 *  counts as deltaOf gives them. `prev` another /Prev, `extra` bytes more (an object of them) */
export async function deltaOf(orig: { bytes: number; xref: number }, pages: number[], o: { prev?: number; extra?: number } = {}) {
  const objects: [number, number, Uint8Array][] = []
  let next = 40
  for (const p of pages) {
    const c = next++
    objects.push([10 + p, 0, enc(`${10 + p} 0 obj\n<< /Type /Page /Parent 2 0 R /Contents ${c} 0 R >>\nendobj\n`)])
    objects.push([c, 0, enc(`${c} 0 obj\n<< /Length 3 >>\nstream\nq Q\nendstream\nendobj\n`)])
  }
  if (o.extra) objects.push([next, 0, enc(`${next++} 0 obj\n(${'x'.repeat(o.extra)})\nendobj\n`)])
  const w = appendSection({ end: orig.bytes, objects, kind: 'table', prev: o.prev ?? orig.xref, size: next, trailer: { root: '1 0 R' } })
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', w.bytes as Uint8Array<ArrayBuffer>))
  const sha256 = Array.from(d, b => b.toString(16).padStart(2, '0')).join('')
  return { bytes: w.bytes, sha256, replaced: rangesOf(pages), stats: { replaced: pages.length, reused: { fonts: 1, images: 0, forms: 0, other: 0 }, included: { bytes: w.bytes.length - 200, objects: objects.length } }, xref: w.xref }
}
