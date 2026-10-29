// The repository's sample paper (tests/fixtures/pdf/sample-1/) as BUNDLE 8's objects, a layer over our own compile, made the way
// the prepare makes them and served by the stand-in of the layer API (layer-api.mjs): its stand-in PDF (arXiv's) read by the
// pinned PDF.js and anchored by the bundle's units (anchors.mjs), the original's side made of the anchors (left-side.mjs
// leftSideOf: each page's view, each unit's rectangles and stream, each page's left part), and the paper made whole of the
// bundle's units, layout and cell rules cut by the cutter (cut.mjs cutBundle) into its units chunks, head, parts and left parts;
// the catalog written over them. The head's base is ours (format.mjs layerDraws: the only head a reader draws): our final pass
// of the sample's marked compile wrapped by optional content (tests/fixtures/pdf/ocg/sample-1-wrapped.pdf, its head fields
// sample-1-wrapped.json: docs/PDF-READER.md §19.9), the page the bundle's layout lies on (the final pass is the stand-in's
// geometry: scripts/make-sample-bundle.mjs makes both in one image), with the check a base of ours passed and `orig`, arXiv's
// PDF beside it; each left part carries its page's draw, as the page pass ships it under a head of ours (page-pass.mjs
// drawsOurs), and the head says so. Also the rows of a translation of it (rows.mjs layerRows), the units' texts made over, so
// that a browser check has a translation with no translator. Plain node (the engine's modules load in it).
//
// `base: 'delta'` (BUNDLE 8, our base held as an incremental update over arXiv's PDF: layout/delta.mjs): the wrapped pass held
// as a delta over the stand-in (arXiv's, served at its route as before, `orig` { bytes, sha256, xref }), made and proved as the
// maker child does (deltaOf, proveDelta), the head's base the delta (`kind` 'delta', its wrap's fields beside its own), the
// catalog naming it as a bundle object (deltaKey) the stand-in serves at the layer's object route; no base PDF of ours
import * as PL from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readBundle } from '../../../src/pdf-reader/engine/layer-proto/bundle.mjs'
import { cutBundle } from '../../../src/pdf-reader/engine/layer-proto/cut.mjs'
import { figureUnits } from '../../../src/pdf-reader/engine/pipeline/page-pass.mjs'
import { checkDelta, deltaKey, indexOf, readCatalog, readHead, readPart, readUnitsChunk, writeCatalog } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'
import { deltaOf, proveDelta } from '../../../src/pdf-reader/engine/layout/delta.mjs'
import { layerRows, sourceUnitsOf, toTranslate } from '../../../src/pdf-reader/engine/layer-proto/rows.mjs'
import { startxrefOf } from '../../../src/pdf-reader/engine/layout/tail.mjs'
import { createHash } from 'node:crypto'
import { anchorUnits, tokenizeDocument } from '../../../src/pdf-reader/engine/pipeline/anchors.mjs'
import { figureAnchors } from '../../../src/pdf-reader/engine/pipeline/ink-pass.mjs'
import { drawDataOf } from '../../../src/pdf-reader/engine/pipeline/draw-data.mjs'
import { leftSideOf } from '../../../src/pdf-reader/engine/pipeline/left-side.mjs'
import { proseOf, textsShown } from '../../../src/pdf-reader/engine/translate/mt.mjs'

const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
/** the kinds TeX sets away from where the source has them (anchorUnits' `floating`) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])

/** the PDF's pages as the anchors read them: each page's text content and view, and its draw geometry (E-C: read after the operator list, whose
 *  parse loads the page's fonts, as the prepare reads it), by the pinned PDF.js (legacy build: node) */
async function textOf(pdf) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: pdf.slice(), verbosity: 0, fontExtraProperties: true, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') })
  const doc = await task.promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), tc = await page.getTextContent()
    await page.getOperatorList()
    pages.push({ page: p, items: tc.items, styles: tc.styles, view: page.view, draw: (await drawDataOf(page)).draw })
  }
  await task.destroy()
  return pages
}

/** the delta of our page over the original, built and proved as the maker child does: refused, it throws */
async function deltaOfSample(orig, ours) {
  const made = await deltaOf(orig, ours, { PL })
  if ('refused' in made) throw new Error(`the sample's delta was refused: ${made.refused}: ${made.why}`)
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const proof = await proveDelta(orig, made.delta, ours, { PL, getDocument, documentOptions: { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') }, replaced: made.replaced })
  if (!proof.ok) throw new Error(`the sample's delta failed its proof: ${proof.why}`)
  return made
}

/**
 * The sample cut: `objects` every object by digest; `refs` the head, the units chunks and the parts (each part's `prev`) as a
 * job tells them, and the parts' end; `catalog` the catalog's bytes; `index` the index the service reads; `leftRefs` the
 * left parts' digests, by page; `paper` its identity; `located` the units the original's side locates ([id, stream, rects]),
 * `views` its pages' boxes and `kinds` each unit's kind, for a check that points at a unit. `base` 'ours' (the default: our base
 * page the stand-in PDF itself, served at /api/v1/base/) or 'delta' (module head): then `base` is null, `delta` { bytes, sha256,
 * key, xref, replaced, data } the delta object, `ours` our page's bytes and `orig` the original's { bytes, sha256, xref }
 */
export async function cutSample({ pdf, bundle, wrapped, wrap }, { base: kind = 'ours' } = {}) {
  if (kind !== 'ours' && kind !== 'delta') throw new TypeError(`base: 'ours' or 'delta' (${String(kind)})`)
  const read = readBundle(bundle)
  const raw = JSON.parse(new TextDecoder().decode(bundle))
  const pages = await textOf(pdf)
  const doc = tokenizeDocument(pages)
  const units = sourceUnitsOf(read)
  const texts = textsShown(units.map(u => u ?? { kind: 'para', pieces: [] }), new Map(), () => undefined)
  const anchors = anchorUnits(doc, texts, { floating: i => FLOATING.has(units[i]?.kind ?? '') })
  // (the figures' text the wrap drew, units after the bundle's own and their rows by page, as the page pass adds them:
  // page-pass.mjs figureUnits over the wrap's `figures`), each anchored on the left by the stand-in's tokens in its run's band, as
  // the page pass anchors them (ink-pass.mjs figureAnchors): a left unit of its part beside its figure row (#497)
  const allUnits = [...raw.units]
  const figures = figureUnits(wrap.figures, { bundle: allUnits, undrawable: [], M: read.paper.pages, prose: proseOf(units) })
  for (const [id, a] of figureAnchors(doc, figures)) anchors.set(id, a)
  const side = leftSideOf({ doc, views: pages.map(p => p.view), anchors })
  // (our base page: the wrapped pass, its check the one a base of ours passes, its wrap's fields; `orig`, arXiv's PDF beside it)
  const N = read.paper.pages, sha256 = createHash('sha256').update(pdf).digest('hex'), oursSha = createHash('sha256').update(wrapped).digest('hex')
  if (pdf.length !== read.base.bytes || sha256 !== read.base.sha256) throw new Error('the sample\'s PDF is not the one its bundle was made over')
  if (wrapped.length !== wrap.bytes || oursSha !== wrap.sha256 || startxrefOf(wrapped) !== wrap.xref) throw new Error('the wrapped pass is not the one its head fields name (pnpm exec tsx scripts/make-ocg-sample.mjs)')
  const fields = { unhidden: wrap.unhidden, labelKept: wrap.labelKept }
  let base = { source: 'ours', bytes: wrapped.length, sha256: oursSha, xref: wrap.xref, pages: N, tree: '2025', check: { pages: [N, N], boxes: 'equal', carried: 1 }, stats: wrap.stats, ...fields }
  let orig = { bytes: pdf.length, sha256 }, delta = null, ours = null
  if (kind === 'delta') {
    ours = wrapped
    const made = await deltaOfSample(pdf, ours)
    orig = { bytes: pdf.length, sha256, xref: startxrefOf(pdf) }
    base = { source: 'ours', kind: 'delta', bytes: made.delta.length, sha256: made.sha256, xref: made.xref, pages: N, tree: '2025', check: { pages: [N, N], boxes: 'equal', carried: 1 }, replaced: made.replaced, stats: { ...made.stats, ...wrap.stats }, ...fields }
    delta = { bytes: made.delta.length, sha256: made.sha256, key: deltaKey(read.paper.id, read.paper.version, made.sha256), xref: made.xref, replaced: made.replaced, data: made.delta }
  }
  const whole = {
    paper: read.paper, base, orig, versions: { image: read.versions.image },
    units: allUnits, left: { pages: side.pages, units: side.units }, layout: read.layout, rules: read.rules,
  }
  // (each left part carries its page's draw, a page with no tokens its draw alone (C1.5), as the page pass ships them under a head
  // of ours; the head says they come)
  const cut = await cutBundle(whole, { draw: true, figures, ...(allUnits.length > raw.units.length ? { inkFrom: raw.units.length } : {}), leftPages: p => { const l = side.leftPages(p), d = pages[p - 1].draw; return d ? { ...(l ?? {}), draw: d } : l } })
  const objects = new Map()
  for (const w of [...cut.units, cut.head, ...cut.parts, ...cut.left]) objects.set(w.sha256, w.bytes)
  // the index and the chain as the service reads them: the cut is held to its own readers
  const head = await readHead(cut.head.bytes, { ref: cut.head.ref })
  if (delta) { const why = await checkDelta(head, delta.data); if (why !== null) throw new Error(`the sample's delta is not its head's: ${why}`) }
  const chunks = []
  for (const u of cut.units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
  const catalog = await writeCatalog({ head, units: cut.units.map(u => u.ref), parts: cut.parts.map(p => p.ref), end: cut.end })
  objects.set(catalog.sha256, catalog.bytes)
  // (the index as the reader makes it of the catalog: its base, catalogBase's, the head's)
  const index = indexOf(head, chunks, { catalog: await readCatalog(catalog.bytes, { paper: read.paper }) })
  let chain = null
  for (const p of cut.parts) chain = (await readPart(p.bytes, { ref: p.ref, index, chain })).chain
  const refs = {
    head: cut.head.ref, units: cut.units.map(u => u.ref),
    parts: cut.parts.map((p, i) => ({ ...p.ref, prev: i ? cut.parts[i - 1].sha256 : null })),
    end: cut.end,
  }
  return {
    objects, refs, catalog: catalog.bytes, index, paper: read.paper, base: delta ? null : { bytes: base.bytes, sha256: base.sha256, data: wrapped }, delta, ours, orig, leftRefs: Object.fromEntries(cut.left.map(l => [l.page, l.sha256])), stats: side.stats,
    located: side.units, views: side.pages, kinds: [...units.map(u => u?.kind ?? null), ...allUnits.slice(units.length).map(u => (Array.isArray(u) ? u[0] : (u?.kind ?? null)))],
  }
}

/** the rows of a translation into `lang` of every unit the language translates: each unit's text, made over by `make(id,
 *  text)`, as one translated piece and its placeholders kept as their source pieces, in source order */
export function rowsOf(index, lang, make) {
  const src = sourceUnitsOf(index)
  const results = new Map(toTranslate(index, lang).map(id => {
    const u = src[id], text = u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
    return [id, { state: 'whole', by: 'e2e', pieces: [{ t: 'text', tr: true, s: make(id, text) }, ...u.pieces.filter(p => p.t === 'ph')] }]
  }))
  return layerRows(index, results, lang).rows
}

/** the sample's files, as layer-api.mjs loadSample reads them, and its wrapped pass with the wrap's head fields */
export const sampleFiles = (dir = new URL('../../fixtures/pdf/sample-1/', import.meta.url), ocg = new URL('../../fixtures/pdf/ocg/', import.meta.url)) => ({
  pdf: new Uint8Array(readFileSync(new URL('sample-1.pdf', dir))),
  bundle: new Uint8Array(readFileSync(new URL('bundle.json', dir))),
  wrapped: new Uint8Array(readFileSync(new URL('sample-1-wrapped.pdf', ocg))),
  wrap: JSON.parse(readFileSync(new URL('sample-1-wrapped.json', ocg), 'utf8')),
})
