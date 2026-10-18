// The repository's sample paper (tests/fixtures/pdf/sample-1/) as BUNDLE 5's objects, made the way the prepare makes them and
// served by the stand-in of the layer API (layer-api.mjs): its stand-in PDF read by the pinned PDF.js and anchored by the
// bundle's units (anchors.mjs), the original's side made of the anchors (left-side.mjs leftSideOf: each page's view, each
// unit's rectangles and stream, each page's left part), and the paper made whole of the bundle's units, layout and add-on
// cut by the cutter (cut.mjs cutBundle) into its units chunks, head, parts and left parts; the catalog written over them. The
// add-on's tail is BUNDLE 3's and cannot be cut: its manifest is carried alone, its clean pages drawn by erase and restore
// (the cutter's own rule without a chained add-on). Also the rows of a translation of it (rows.mjs layerRows), the units'
// texts made over, so that a browser check has a translation with no translator. Plain node (the engine's modules load in it)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readBundle } from '../../../src/pdf-reader/engine/layer-proto/bundle.mjs'
import { cutBundle } from '../../../src/pdf-reader/engine/layer-proto/cut.mjs'
import { indexOf, readHead, readPart, readUnitsChunk, writeCatalog } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'
import { layerRows, sourceUnitsOf, toTranslate } from '../../../src/pdf-reader/engine/layer-proto/rows.mjs'
import { startxrefOf } from '../../../src/pdf-reader/engine/layout/tail.mjs'
import { anchorUnits, tokenizeDocument } from '../../../src/pdf-reader/engine/pipeline/anchors.mjs'
import { drawDataOf } from '../../../src/pdf-reader/engine/pipeline/draw-data.mjs'
import { leftSideOf } from '../../../src/pdf-reader/engine/pipeline/left-side.mjs'
import { textsShown } from '../../../src/pdf-reader/engine/translate/mt.mjs'

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

/**
 * The sample cut: `objects` every object by digest; `refs` the head, the units chunks and the parts (each part's `prev`) as a
 * job tells them, and the parts' end; `catalog` the catalog's bytes; `index` the index the service reads; `leftRefs` the
 * left parts' digests, by page; `paper` its identity; `located` the units the original's side locates ([id, stream, rects]),
 * `views` its pages' boxes and `kinds` each unit's kind, for a check that points at a unit
 */
export async function cutSample({ pdf, bundle }) {
  const read = readBundle(bundle)
  const raw = JSON.parse(new TextDecoder().decode(bundle))
  const pages = await textOf(pdf)
  const doc = tokenizeDocument(pages)
  const units = sourceUnitsOf(read)
  const texts = textsShown(units.map(u => u ?? { kind: 'para', pieces: [] }), new Map(), () => undefined)
  const anchors = anchorUnits(doc, texts, { floating: i => FLOATING.has(units[i]?.kind ?? '') })
  const side = leftSideOf({ doc, views: pages.map(p => p.view), anchors })
  const xref = startxrefOf(pdf)
  const whole = {
    paper: read.paper, base: { bytes: read.base.bytes, sha256: read.base.sha256, xref }, versions: { image: read.versions.image },
    units: raw.units, left: { pages: side.pages, units: side.units }, layout: read.layout, addon: read.addon ? { manifest: read.addon.manifest } : null,
  }
  // (each left part carries its page's draw, none for a page with no tokens)
  const cut = await cutBundle(whole, { leftPages: p => { const l = side.leftPages(p); return l && pages[p - 1].draw ? { ...l, draw: pages[p - 1].draw } : l } })
  const objects = new Map()
  for (const w of [...cut.units, cut.head, ...cut.parts, ...cut.left]) objects.set(w.sha256, w.bytes)
  // the index and the chain as the service reads them: the cut is held to its own readers
  const head = await readHead(cut.head.bytes, { ref: cut.head.ref })
  const chunks = []
  for (const u of cut.units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
  const index = indexOf(head, chunks)
  let chain = null
  for (const p of cut.parts) chain = (await readPart(p.bytes, { ref: p.ref, index, chain })).chain
  const catalog = await writeCatalog({ head, units: cut.units.map(u => u.ref), parts: cut.parts.map(p => p.ref), end: cut.end })
  objects.set(catalog.sha256, catalog.bytes)
  const refs = {
    head: cut.head.ref, units: cut.units.map(u => u.ref),
    parts: cut.parts.map((p, i) => ({ ...p.ref, prev: i ? cut.parts[i - 1].sha256 : null })),
    end: cut.end,
  }
  return {
    objects, refs, catalog: catalog.bytes, index, paper: read.paper, leftRefs: Object.fromEntries(cut.left.map(l => [l.page, l.sha256])), stats: side.stats,
    located: side.units, views: side.pages, kinds: units.map(u => u?.kind ?? null),
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

/** the sample's files, as layer-api.mjs loadSample reads them */
export const sampleFiles = (dir = new URL('../../fixtures/pdf/sample-1/', import.meta.url)) => ({ pdf: new Uint8Array(readFileSync(new URL('sample-1.pdf', dir))), bundle: new Uint8Array(readFileSync(new URL('bundle.json', dir))) })
