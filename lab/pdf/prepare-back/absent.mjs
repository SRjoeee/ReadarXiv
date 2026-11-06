// lab/pdf/prepare-back/absent.mjs: what the back half does with what arXiv's corpus did not hold (stage 1a's exit, "producers
// absent from the corpus"; spike S1c §6's list), each on a page made for it: a rotated page, a file with its own optional
// content, a unit's text inside a form (the form its own, and a form partly another's), a Type 3 font (with its widths, and a
// unit's edge inside one of its shows), an encrypted file. B is A itself (the instrument's ownership a unit a show, every
// glyph of the show its unit's), so that what is measured is the back half alone: read, align, locate, wrap, bundle and the
// add-on's PDF.js proofs. Prints one line a case.
//   node --import tsx lab/pdf/prepare-back/absent.mjs
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { prepareBack, ownersOf, ROLE, readPdf, unitId } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { proveGlyphs } from './prove.mjs'

const pdfjs = { getDocument, OPS }
const deflate = b => new Uint8Array(deflateSync(b)), inflate = (b, l) => new Uint8Array(inflateSync(b, { maxOutputLength: l + 1 }))

/** a page of Helvetica runs `content` (its own content stream), with forms and edits of the page's or the catalog's dicts */
async function pdfOf(content, { rotate = 0, forms = {}, edit = null, type3 = null } = {}) {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
  if (type3) page.node.setFontDictionary(PL.PDFName.of('T3'), type3(doc))
  for (const [name, body] of Object.entries(forms)) {
    const res = doc.context.obj({ Font: { F1: font.ref } })
    const ref = doc.context.register(doc.context.stream(body, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 612, 792], Resources: res }))
    page.node.setXObject(PL.PDFName.of(name), ref)
  }
  if (rotate) page.setRotation(PL.degrees(rotate))
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
  edit?.(doc, page)
  return doc.save({ useObjectStreams: false })
}

/** a Type 3 font of two glyphs (a and b, squares), its widths given or not */
const type3Of = widths => doc => {
  const proc = s => doc.context.register(doc.context.stream(s))
  const charProcs = doc.context.obj({ a: proc('500 0 0 0 400 600 d1 0 0 400 600 re f'), b: proc('500 0 0 0 400 600 d1 0 0 400 300 re f') })
  return doc.context.register(doc.context.obj({ Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 500, 700], FontMatrix: [0.001, 0, 0, 0.001, 0, 0], CharProcs: charProcs, Encoding: { Type: 'Encoding', Differences: [97, 'a', 'b'] }, FirstChar: 97, LastChar: 98, ...(widths ? { Widths: [500, 500] } : {}) }))
}

/** the instrument of A itself: a unit a show (`split`: the shows to cut in two units at their middle) */
async function instrumentOf(bytes, split = new Set()) {
  const r = await readPdf(pdfjs, bytes, { turned: true })
  const units = [], index = new Map()
  const glyphs = r.doc.pages.map(pg => {
    const O = ownersOf(pg.glyphs.length)
    const byShow = new Map()
    pg.glyphs.forEach((g, j) => (byShow.get(g.n) ?? byShow.set(g.n, []).get(g.n)).push(j))
    for (const [n, js] of byShow) {
      const parts = split.has(n) ? [js.slice(0, js.length >> 1), js.slice(js.length >> 1)] : [js]
      for (const part of parts) {
        const text = part.map(j => pg.glyphs[j].u).join('')
        const key = `${n}|${text}|${part[0]}`
        if (!index.has(key)) { index.set(key, units.length); const content = [{ t: 'text', s: text }]; units.push({ id: unitId('para', content), kind: 'para', content }) }
        for (const j of part) { O.unit[j] = index.get(key); O.role[j] = ROLE.text }
      }
    }
    return O
  })
  return { ink: r.doc, units, glyphs, boxes: r.doc.pages.map(pg => ownersOf(pg.kinds.length)), turned: r.doc.pages.map(pg => ownersOf(pg.turned?.length ?? 0)), tex: {}, made: { compiler: 'synthetic', tree: '', front: 'absent.mjs' } }
}

async function run(name, bytes, split) {
  let ins
  try { ins = await instrumentOf(bytes, split) } catch (e) { console.log(JSON.stringify({ case: name, read: `refused: ${e.message}` })); return }
  let tally = null
  for await (const x of prepareBack(ins, bytes, { pdfjs, PL, deflate, inflate, paper: { id: '0000.00000', version: 1 }, made: 'absent' })) if (x.kind === 'tally') tally = x
  const L = tally.locatedAll, A = tally.addOn
  const wrapped = 'refused' in A ? { refused: A.refused, why: A.why } : { pages: [...A.pages].map(([p, x]) => [p, x.ok, x.why ?? null]), groups: A.groups.size }
  let proofs = null
  if (!('refused' in A)) {
    const W = new Uint8Array(bytes.length + A.bytes.length)
    W.set(bytes)
    W.set(A.bytes, bytes.length)
    const g = await proveGlyphs({ W, pagesA: tally.pagesA, located: L, addOn: A, pdfjs, options: { verbosity: 0 } })
    proofs = { a: g.a.failed, c: g.c.failed, grouped: g.c.grouped, foreign: g.foreignShows }
  }
  const unread = tally.pagesA.map((p, i) => (p.page.unread ? [i + 1, p.page.unread] : null)).filter(Boolean)
  console.log(JSON.stringify({ case: name, units: ins.units.length, located: L.stats.located, unlocated: L.stats.unlocated, unread, wrapped, proofs }))
}

const runs = 'BT /F1 12 Tf 72 700 Td (A unit of text) Tj ET\nBT /F1 12 Tf 72 680 Td (and another one) Tj ET\n'
await run('rotated page (/Rotate 90)', await pdfOf(runs, { rotate: 90 }))
await run('own optional content (an OCG of the file, its BDC around a run)', await pdfOf('/OC /oc1 BDC\nBT /F1 12 Tf 72 700 Td (A unit in their group) Tj ET\nEMC\nBT /F1 12 Tf 72 680 Td (and one outside it) Tj ET\n', {
  edit: (doc, page) => {
    const ocg = doc.context.register(doc.context.obj({ Type: 'OCG', Name: 'Their layer' }))
    page.node.Resources().set(PL.PDFName.of('Properties'), doc.context.obj({ oc1: ocg }))
    doc.catalog.set(PL.PDFName.of('OCProperties'), doc.context.obj({ OCGs: [ocg], D: { ON: [ocg], Order: [ocg] } }))
  },
}))
await run('a unit\'s text inside a form, the form its own', await pdfOf('q /Fx1 Do Q\nBT /F1 12 Tf 72 680 Td (and a page run) Tj ET\n', { forms: { Fx1: 'BT /F1 12 Tf 72 700 Td (A unit in a form) Tj ET' } }))
await run('a form partly owned (two units in one form)', await pdfOf('q /Fx1 Do Q\n', { forms: { Fx1: 'BT /F1 12 Tf 72 700 Td (First unit) Tj ET BT /F1 12 Tf 72 680 Td (Second unit) Tj ET' } }))
await run('a Type 3 font with its widths', await pdfOf('BT /T3 12 Tf 72 700 Td (abab) Tj ET\nBT /F1 12 Tf 72 680 Td (a text run) Tj ET\n', { type3: type3Of(true) }))
await run('a Type 3 font with widths, a unit\'s edge inside its show', await pdfOf('BT /T3 12 Tf 72 700 Td (abab) Tj ET\n', { type3: type3Of(true) }), new Set([0]))
await run('a Type 3 font without widths, a unit\'s edge inside its show', await pdfOf('BT /T3 12 Tf 72 700 Td (abab) Tj ET\n', { type3: type3Of(false) }), new Set([0]))
await run('an encrypted file', await (async () => { const b = await pdfOf(runs); const d = await PL.PDFDocument.load(b); d.encrypt?.({ userPassword: '', ownerPassword: 'x' }); return d.save({ useObjectStreams: false }) })())
