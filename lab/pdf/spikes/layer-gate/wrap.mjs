// lab/pdf/spikes/layer-gate/wrap.mjs
// The page the gate's layer draws over, as the reader's is (docs/PDF-READER.md §19.9): a fixture's base page (base.pdf, our
// final pass of the marked original) wrapped by optional content in Node, by the engine's own wrap (layout/wrap.mjs wrapFinal,
// the paper's SOURCE units: pipeline/live.mjs openPaper over its source.gz), and the head fields a reader is given beside it:
// what the wrap could not hide (`unhidden`, `labelKept`, `stats`) and each page's cell rules (layout/cell-rules.mjs pageRules
// over the layout file and the page's ink, checked as a part's reader checks them: the reader's `rules`). Cached by the base
// page's bytes, the layout file, the source and the engine's layout modules, in out/layer-gate/wrap/<key>/: wrapped.pdf and
// wrap.json. A fixture with no source, or whose wrap is refused (an arXiv base has no marks), is served unwrapped and said so:
// its units are then the original's (the document holds no group of ours). Plain Node; the engine is the one measured.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { constants as zlibConstants, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { sha256 } from './ref.mjs'

const inflate = (b, limit = Infinity) => {
  const o = { finishFlush: zlibConstants.Z_SYNC_FLUSH, ...(Number.isFinite(limit) ? { maxOutputLength: limit + 1 } : {}) }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}
const deflate = b => new Uint8Array(deflateSync(b, { level: 6 }))

/** the marking's texts the fixture's base page was marked with (base.json's `texts`, layer-fixtures.mjs), or null where the
 *  record holds none (a pack of before: a cell's lead macro then stays the original's) */
export function textsOf(base) {
  const f = join(dirname(base), 'base.json')
  if (!existsSync(f)) return null
  const t = JSON.parse(readFileSync(f, 'utf8'))?.texts
  return Array.isArray(t) ? t : null
}

/** the macros TeX said set no ink when the fixture's base page was marked (base.json's `inkless`, layer-fixtures.mjs), or null where
 *  the record holds none (a pack of before: a unit that opens with one then reads as opening with ink of no mark) */
export function inklessOf(base) {
  const f = join(dirname(base), 'base.json')
  if (!existsSync(f)) return null
  const t = JSON.parse(readFileSync(f, 'utf8'))?.inkless
  return Array.isArray(t) ? t : null
}

/** the engine's layout modules, digested: a change of any (the wrap, the ownership, the walk, the ink, the rules) wraps again */
function layoutDigest(engine) {
  const dir = join(engine, 'src/pdf-reader/engine/layout')
  return sha256(readdirSync(dir).filter(f => f.endsWith('.mjs')).sort().map(f => `${f}\n${readFileSync(join(dir, f), 'latin1')}`).join('\n')).slice(0, 16)
}

/**
 * The wrapped page of a fixture: { file, head } — `file` the PDF the layer is drawn over (wrapped.pdf, or the base page itself
 * where it could not be wrapped), `head` { wrapped, why, stats, unhidden, labelKept, rules, ms } (`rules` { [page]: boxes }).
 * `engine` the measured engine's root, `out` the cache's directory, `base` the base page's file, `layoutFile` the layout file
 * the layer is given, `source` the paper's source.gz (null: none, the page unwrapped). Once a run a key (`runs`)
 */
export function wrapOf({ engine, out, base, layoutFile, source, runs = new Map() }) {
  const bytes = readFileSync(base)
  const key = sha256([sha256(bytes), sha256(readFileSync(layoutFile)), source ? sha256(readFileSync(source)) : 'none', JSON.stringify(textsOf(base)), JSON.stringify(inklessOf(base)), layoutDigest(engine)].join('\n')).slice(0, 24)
  if (!runs.has(key)) runs.set(key, made(key, { engine, out, base, bytes, layoutFile, source }))
  return runs.get(key)
}

async function made(key, { engine, out, base, bytes, layoutFile, source }) {
  const dir = join(out, key), headFile = join(dir, 'wrap.json'), pdfFile = join(dir, 'wrapped.pdf')
  if (existsSync(headFile)) {
    const head = JSON.parse(readFileSync(headFile, 'utf8'))
    return { key, file: head.wrapped ? pdfFile : base, head, headFile }
  }
  mkdirSync(dir, { recursive: true })
  const E = f => import(join(engine, 'src/pdf-reader/engine', f))
  const [{ wrapFinal }, { openPaper }, { unpackSource }, { indexLayout, parseLayout }, { pageInk }, { bundleUnitsOf }] = await Promise.all(['layout/wrap.mjs', 'pipeline/live.mjs', 'source/tar.mjs', 'layout/file.mjs', 'layout/ink.mjs', 'layer-proto/bundle.mjs'].map(E))
  // (the cell rules by the engine's own module; an engine from before REMOVAL 8 has none and reads its rules from its add-on, which
  // this instrument no longer makes: the gate's own module then, whose rules such an engine does not read)
  const { pageRules, checkBoxes } = await E('layout/cell-rules.mjs').catch(() => import('../../../../src/pdf-reader/engine/layout/cell-rules.mjs'))
  const PL = await import('@cantoo/pdf-lib')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const root = new URL('../../../../node_modules/pdfjs-dist/', import.meta.url).pathname
  const documentOptions = { verbosity: 0, cMapUrl: `${root}cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}standard_fonts/`, useSystemFonts: false, fontExtraProperties: true }
  const t0 = performance.now()
  let head = { wrapped: false, why: 'no source' }, data = bytes
  if (source) {
    const opened = openPaper((await unpackSource(new Uint8Array(readFileSync(source)))).files), units = opened.units
    const texts = textsOf(base)
    // (the ink units' ids after the bundle's units before them, the source units' and the paper's structural names', as the
    // page pass reads them: an engine of before ignores it)
    const r = await wrapFinal(new Uint8Array(bytes), { PL, getDocument: pdfjs.getDocument, documentOptions, OPS: pdfjs.OPS, units, texts, inkless: inklessOf(base), deflate, inflate, inkFrom: bundleUnitsOf(opened).length })
    if (r.refused) head = { wrapped: false, why: `${r.refused}: ${String(r.why ?? '').slice(0, 200)}` }
    else {
      // (and the ink units the wrap made, where its engine makes them: docs/route/orphan-text.md, the gate's --ink)
      head = { wrapped: true, why: null, stats: r.stats, unhidden: r.unhidden, labelKept: r.labelKept, ...(r.ink ? { ink: r.ink } : {}) }
      data = r.bytes
      writeFileSync(pdfFile, r.bytes)
    }
  }
  head.ms = Math.round(performance.now() - t0)
  // the cell rules near the layout file's cells, page by page, of the page's ink as the maker reads it (make.mjs cellRulesOf)
  const index = indexLayout(parseLayout(new Uint8Array(readFileSync(layoutFile))))
  const doc = await pdfjs.getDocument({ ...documentOptions, data: new Uint8Array(data) }).promise
  const rules = {}
  try {
    for (let p = 1; p <= Math.min(doc.numPages, index.file.paper.pages); p++) {
      const page = await doc.getPage(p)
      const ink = pageInk(pdfjs.OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate, indices: true })
      page.cleanup()
      if (ink.rotated || ink.capped || ink.timedOut) continue
      const r = pageRules(index, p, ink)
      if (!r.length) continue
      try { rules[p] = checkBoxes(r, p, index.file.views, 'rules') } catch {}
    }
  } finally { await doc.loadingTask.destroy() }
  head.rules = rules
  writeFileSync(headFile, JSON.stringify(head))
  return { key, file: head.wrapped ? pdfFile : base, head, headFile }
}
