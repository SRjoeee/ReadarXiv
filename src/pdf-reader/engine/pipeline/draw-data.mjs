// A page's draw geometry read from PDF.js (the E-C design note, §3): what the layer's drawing of the page reads of arXiv's PDF besides
// its operator list, gathered by the server once the page's operator list has been read (a font's map is in `commonObjs` only after
// it): the text items, the fonts the items use, the Link annotations. The PDF.js calls are pinned: `page.getTextContent()` with its
// defaults (no marked content, no options), `page.getAnnotations()` with its default (display) intent, a font by the loaded name of
// each style from `page.commonObjs`; the document is opened with fontExtraProperties (its fonts' `toUnicode`) and the engine's cMaps.
// The result is the draw of layer-proto/draw.mjs, or null (the browser reads the page itself): a page that is not read, a font
// that cannot be told the same by every host, or a page past a cap. Imports the engine's pure modules alone.
import { wireText } from '../layer-proto/draw.mjs'
import { isMemoryError } from './memory.mjs'

/**
 * The characters a font's own map gives its glyphs (the file's ToUnicode, or what its encoding names), each value as written and as PDF.js's
 * text layer normalises it (NFKC); null where the font has no such map. Layer2's `mappedOf`, kept apart so that this module loads no
 * canvas: a test holds the two equal
 */
export function mappedChars(toUnicode) {
  const map = toUnicode?._map
  if (!Array.isArray(map)) return null
  const out = new Set()
  for (const v of map) if (typeof v === 'string') for (const s of [v, v.normalize('NFKC')]) for (const ch of s) out.add(ch)
  return out
}

/** a font object's mapped characters as a draw ships them (mappedChars, as a list), once a document: a font is one object of the
 *  document's `commonObjs` whatever page uses it, its map exported with it once */
const mappedFonts = new WeakMap()
function mappedOfFont(f) {
  if (mappedFonts.has(f)) return mappedFonts.get(f)
  const set = mappedChars(f.toUnicode), mapped = set === null ? null : [...set]
  mappedFonts.set(f, mapped)
  return mapped
}

/** whether a font object of `commonObjs` is one a host reads as another host would not: not embedded and not Type3 (PDF.js's
 *  fallbackToSystemFont rewrites the map of a non-embedded CIDFontType2 by the system fonts the host has, E1) */
const hostDependent = f => f !== null && typeof f === 'object' && typeof f.isType3Font === 'boolean' && !f.isType3Font && f.missingFile === true

/**
 * A page's text content (PDF.js's getTextContent, its defaults) as its draw reads it: `rows` each item whose string is a string,
 * [str, a, b, d, e, f, width, height, fontName or null], its numbers as the data holds them (-0 written 0: draw.mjs wireText's),
 * in order, taken once by drawDataOf (which writes each row's font index in its last place); `families` each font name's fallback family (its style's
 * fontFamily, or null) as first met; `bad` where an item could not be read (its transform): the rows end before it, and the draw is
 * none ('read') once the fonts of the rows before it are told. Step T keeps it a page (layout/arxiv.mjs readArxivText `draw`), so
 * that the draw reads no page's text a second time
 */
export function drawTextOf(tc) {
  const items = Array.isArray(tc?.items) ? tc.items : [], styles = tc?.styles ?? {}
  const rows = [], families = new Map(), c = v => (v === 0 ? 0 : v)
  try {
    for (const it of items) {
      if (typeof it?.str !== 'string') continue
      const name = typeof it.fontName === 'string' ? it.fontName : null
      if (name !== null && !families.has(name)) families.set(name, typeof styles[name]?.fontFamily === 'string' ? styles[name].fontFamily : null)
      const t = it.transform
      rows.push([it.str, c(t[0]), c(t[1]), c(t[3]), c(t[4]), c(t[5]), c(it.width), c(it.height), name])
    }
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { rows, families, bad: true }
  }
  return { rows, families, bad: false }
}

/**
 * Page `page`'s draw, from a PDF.js page proxy whose operator list has been read: { draw, text, why }, `draw` the draw as the data
 * holds it (layer-proto/draw.mjs wireText: checked, or shed for what the reader would refuse) and `text` its JSON, or null (no text), `why`
 * null or the reason for none: 'read' (text or annotations could not be read), 'props' (the document was opened without
 * fontExtraProperties), 'font' (a font a host would read differently), 'shed' (a cap). A memory-class error is thrown. `annots`: the
 * page's annotations as its reader reads them once for every reader of the page (a function giving the array, or null where they
 * could not be read: the layout maker's, whose link-anchor locator reads the same), else read here. `text`: the page's text as
 * drawTextOf made it of step T's read (the same request, its defaults), else read here
 */
export async function drawDataOf(page, annots = null, text = null) {
  let tx = text, ann
  try {
    tx ??= drawTextOf(await page.getTextContent())
    ann = annots ? await annots() : await page.getAnnotations()
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { draw: null, why: 'read' }
  }
  if (annots && !Array.isArray(ann)) return { draw: null, why: 'read' }
  try {
    const table = [], at = new Map(), rows = []
    for (const r of tx.rows) {
      let font = -1
      const name = r[8]
      if (name !== null) {
        if (!at.has(name)) {
          let f = null
          try { f = page.commonObjs.get(name) } catch {}
          if (hostDependent(f)) return { draw: null, why: 'font' }
          const fallback = tx.families.get(name) ?? null
          const type3 = f !== null && typeof f === 'object' && typeof f.isType3Font === 'boolean' ? (f.isType3Font ? 1 : 0) : 2
          let mapped = null
          if (type3 !== 2) {
            // (the document was opened without `fontExtraProperties: true`: the fonts carry no map; a setup fault, told apart in the stats. A
            //  Type3 font is no exception to the map but to the refusal: the live reading (layer2.mjs fontMappedOf) takes the map PDF.js
            //  exports for it under fontExtraProperties and throws for no Type3 font without one, so a Type3 font with none ships null)
            if (type3 === 0 && !('toUnicode' in f)) return { draw: null, why: 'props' }
            mapped = mappedOfFont(f)
          }
          at.set(name, table.length)
          table.push([typeof f?.name === 'string' ? f.name : null, fallback, type3, mapped])
        }
        font = at.get(name)
      }
      r[8] = font
      rows.push(r)
    }
    if (tx.bad) return { draw: null, why: 'read' }
    const links = []
    for (const a of ann ?? []) {
      if (a?.subtype !== 'Link') continue
      links.push([a.rect, a.quadPoints ?? null, a.url ?? null, a.dest ?? null, a.overlaidText ?? null, a.borderStyle?.width ?? null, a.borderStyle?.style ?? null, a.color ?? null])
    }
    const w = wireText({ fonts: table, items: rows, links }, { plainItems: true })
    return w === null ? { draw: null, why: 'shed' } : { draw: w.draw, text: w.text, bytes: w.bytes, why: null }
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { draw: null, why: 'read' }
  }
}
