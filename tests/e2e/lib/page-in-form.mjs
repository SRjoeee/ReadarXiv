// A stand-in of a paper whose crops' ink sits inside a form, as the add-on wraps a figure's text inside the figure's form
// (2611.18114v1 p26's 7×7, and 1,015 crops of the 245): the fixture's add-on with one more incremental section, page `n`'s
// content moved whole into a form the page draws, its marked groups with it, so that every crop of that page has its groups'
// marks inside a form alone. The PDF download must still draw each of them (#crops-sharp); the reader shows the page as before
// (optional content reaches inside a form). The head names the new add-on, and the catalog is the new head's digest.
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { appendSection, openObjects } from '../../../packages/engine/src/index.ts'

const enc = s => new TextEncoder().encode(s)
const latin1 = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255)
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const sha256 = b => createHash('sha256').update(b).digest('hex')

/** `f` (loadFixture's) with page `n`'s content in a form of its own, as a fixture the stand-in serves (`api.use`) */
export function withPageInForm(f, n = 1) {
  const addOn = f.objects.get(f.addOn)
  const composed = cat(f.pdf, addOn)
  const X = openObjects(composed, { PL, objectsMax: 1e6, decodedMax: 1 << 26 })
  const N = s => PL.PDFName.of(s)
  const look = v => (v instanceof PL.PDFRef ? X.lookup(v) : v)
  const pn = X.pages()[n - 1]
  const c = look(pn.node.get(N('Contents')))
  const streams = c instanceof PL.PDFArray ? c.asArray().map(look) : [c]
  const content = streams.map(s => new TextDecoder('latin1').decode(PL.decodePDFRawStream(s).decode())).join('\n')
  const res = look(pn.inherited.Resources)
  const resText = res instanceof PL.PDFDict ? res.entries().filter(([k]) => String(k) !== '/XObject').map(([k, v]) => `${k} ${v}`).join(' ') : ''
  const xo = res instanceof PL.PDFDict ? look(res.get(N('XObject'))) : undefined
  const xoText = xo instanceof PL.PDFDict ? xo.entries().map(([k, v]) => `${k} ${v}`).join(' ') : ''
  const formN = X.size,
    contN = X.size + 1
  const body = new Uint8Array(deflateSync(latin1(content)))
  const form = cat(enc(`${formN} 0 obj\n<< /Type /XObject /Subtype /Form /BBox ${pn.inherited.MediaBox} /Resources << ${resText} /XObject << ${xoText} >> >> /Filter /FlateDecode /Length ${body.length} >>\nstream\n`), body, enc('\nendstream\nendobj\n'))
  const draw = 'q /AXTPage Do Q'
  const contents = enc(`${contN} 0 obj\n<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`)
  const own = pn.node.entries().filter(([k]) => !['/Contents', '/Resources'].includes(String(k))).map(([k, v]) => `${k} ${v}`).join(' ')
  const g = pn.ref.generationNumber
  const page = enc(`${pn.ref.objectNumber} ${g} obj\n<< ${own} /Contents ${contN} 0 R /Resources << ${resText} /XObject << ${xoText} /AXTPage ${formN} 0 R >> >> >>\nendobj\n`)
  const section = appendSection({
    end: composed.length,
    objects: [
      [formN, 0, form],
      [contN, 0, contents],
      [pn.ref.objectNumber, g, page],
    ],
    kind: X.kind,
    prev: X.startxref,
    size: X.size + 2,
    trailer: { root: String(X.trailer.root), info: X.trailer.info?.toString(), id: X.trailer.id?.toString() },
  }).bytes
  const next = cat(addOn, section)
  const digest = sha256(next)
  const head = JSON.parse(new TextDecoder().decode(f.objects.get(f.catalog)))
  head.addOn = { ...head.addOn, bytes: next.length, digest }
  const headBytes = enc(JSON.stringify(head))
  const catalog = sha256(headBytes)
  const objects = new Map(f.objects)
  objects.set(digest, next)
  objects.set(catalog, headBytes)
  return { ...f, name: `${f.name}-page-in-form`, catalog, addOn: digest, objects }
}
