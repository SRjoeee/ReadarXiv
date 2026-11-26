// A stand-in of the fixture whose fonts state their widths, as every paper arXiv serves does (pdfTeX writes /Widths for every
// font it uses): the fixture's PDF sets its text in the standard fonts with none (Helvetica, Helvetica-Bold, Times-Italic),
// whose advances a viewer takes from its own metrics and the engine's walk cannot read, so that the PDF download keeps that
// text where it stood, drawn invisibly (bake.ts: a show whose widths are unknown), which a check of words standing on ink would
// read as a fault of the crops. The fixture's add-on with one more incremental section: each such font written again under its
// number with /FirstChar 32, /LastChar 126 and the standard font's own widths (pdf-lib's metrics of the 14 fonts, the AFM
// files'), so that it draws exactly as before. The head names the new add-on, and the catalog is the new head's digest.
import { createHash } from 'node:crypto'
import * as PL from '@cantoo/pdf-lib'
import { appendSection, openObjects } from '../../../packages/engine/src/index.ts'

const enc = (s) => new TextEncoder().encode(s)
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

/** `f` (loadFixture's) with its standard fonts' widths stated, as a fixture the stand-in serves (`api.use`) */
export async function withWidths(f) {
  const addOn = f.objects.get(f.addOn)
  const composed = cat(f.pdf, addOn)
  const X = openObjects(composed, { PL, objectsMax: 1e6, decodedMax: 1 << 26 })
  const N = (s) => PL.PDFName.of(s)
  const look = (v) => (v instanceof PL.PDFRef ? X.lookup(v) : v)
  const doc = await PL.PDFDocument.create()
  const standard = new Set(Object.values(PL.StandardFonts))
  const objects = []
  const seen = new Set()
  for (const p of X.pages()) {
    const fonts = look(look(p.inherited.Resources)?.get(N('Font')))
    for (const [, ref] of fonts instanceof PL.PDFDict ? fonts.entries() : []) {
      const d = look(ref)
      const base = d instanceof PL.PDFDict ? d.get(N('BaseFont'))?.asString?.().slice(1) : undefined
      if (!(ref instanceof PL.PDFRef) || seen.has(String(ref)) || !standard.has(base) || d.get(N('Widths'))) continue
      seen.add(String(ref))
      const font = await doc.embedFont(base)
      const widths = []
      for (let c = 32; c <= 126; c++) widths.push(Math.round(font.widthOfTextAtSize(String.fromCharCode(c), 1000) * 1000) / 1000)
      const own = d.entries().map(([k, v]) => `${k} ${v}`).join(' ')
      objects.push([
        ref.objectNumber,
        ref.generationNumber,
        enc(`${ref.objectNumber} ${ref.generationNumber} obj\n<< ${own} /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] >>\nendobj\n`),
      ])
    }
  }
  const section = appendSection({
    end: composed.length,
    objects,
    kind: X.kind,
    prev: X.startxref,
    size: X.size,
    trailer: { root: String(X.trailer.root), info: X.trailer.info?.toString(), id: X.trailer.id?.toString() },
  }).bytes
  const next = cat(addOn, section)
  const digest = sha256(next)
  const head = JSON.parse(new TextDecoder().decode(f.objects.get(f.catalog)))
  head.addOn = { ...head.addOn, bytes: next.length, digest }
  const headBytes = enc(JSON.stringify(head))
  const catalog = sha256(headBytes)
  const all = new Map(f.objects)
  all.set(digest, next)
  all.set(catalog, headBytes)
  return { ...f, name: `${f.name}-with-widths`, catalog, addOn: digest, objects: all }
}
