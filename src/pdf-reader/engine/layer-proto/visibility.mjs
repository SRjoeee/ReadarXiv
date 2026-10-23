// src/pdf-reader/engine/layer-proto/visibility.mjs
// What the reader hides of our page, and how (the per-unit optional-content erasure, docs/route/ocg-erasure.md §3, §4): our
// compile's page streams are wrapped once by the maker child, each unit's text in its own optional-content group (`u<id>`), its
// placeholders in another (`u<id>.p`), its label in a third (`u<id>.l`) and each babel name in its own (`n<occ>`), every group ON
// by default, so that any viewer shows our page. The reader draws a page with the groups of the units it draws there OFF, and
// nothing of the original is erased by a rectangle: what a unit owns goes, glyph for glyph, and nothing else.
//
// One optional-content configuration a document (E3, E8): PDF.js 6.3.289 builds a new one on every render it is not given one for
// (+23 MiB of main-thread peak on the 147-page thesis), so it is read once, kept, and passed to every render of the document. It is
// read at paint time, so it is never changed while a render that uses it runs: the document's renders go through one queue, each
// setting the visibility it needs just before it starts (1.4 ms for 40,000 groups) and awaited before the next one sets its own.
//
// The document's pages warm (the reader's renders of a page are one parse of it): PDF.js 6.3.289 keeps a page's operator list and
// the images it decoded until its `cleanup()`, and a render after it asks the worker for both again. Every render of the document
// goes through here, so the document keeps the pages it rendered last warm, WARM_PAGES of them, and lets the oldest go: whatever
// reads it (a lay's pixels, a copy's planes, a copy again after a zoom, a layer opened again over the same document for another
// target), a page among them is drawn from what PDF.js holds. The rest go with the document (its destroy).
//
// An original module (no port statement), importing nothing.

/** the prefix of our groups' names in the document (`/Name (axt:<group>)`, design §3.1): a foreign group is never touched */
export const GROUP_PREFIX = 'axt:'
/** a unit's groups and a babel name's, as the file names them (design D3) */
export const textGroup = id => `u${id}`
export const placeholderGroup = id => `u${id}.p`
export const labelGroup = id => `u${id}.l`
export const nameGroup = occurrence => `n${occurrence}`
/** render B's hidden groups (§4.1): every unit's text and label, every placeholder shown (a crop's source) */
export const cropSourceOff = group => group.startsWith('u') && !group.endsWith('.p')

/** how many pages of a document keep their rendering state after a render (its operator list and decoded images): a pane's near
 *  pages at the zoom a paper is read at (the view and one pane's height above and below, places.mjs NEAR), each kept a page */
export const WARM_PAGES = 4

const byDoc = new WeakMap()

/**
 * The visibility of a document's groups (one a document, made at the first ask and kept with it): `ready` once its configuration
 * is read (a document with no optional content, or one whose configuration cannot be read, has no group of ours: `has` is false for
 * every group, so nothing of it can be hidden and everything stays the original's); `has(group)` whether the document holds one of
 * our groups by that name; `size` how many; `render(page, params, off)` the page rendered (PDF.js's `render` params: canvas,
 * canvasContext, viewport, transform) with the groups named in `off` (names, or a test of a name) hidden and every other group of
 * ours shown, after every
 * render asked before it has ended (its promise PDF.js's render's: a render that throws rejects it, and the next one runs), the
 * page then kept warm (WARM_PAGES, the oldest let go: its `cleanup()`); `warm` the pages kept, the latest last (a copy)
 */
export function visibilityOf(doc) {
  let v = byDoc.get(doc)
  if (v) return v
  let config = null
  const ids = new Map()
  const ready = (async () => {
    if (typeof doc?.getOptionalContentConfig !== 'function') return
    config = await doc.getOptionalContentConfig({ intent: 'display' })
    for (const [id, group] of config ?? []) {
      const name = group?.name
      if (typeof name === 'string' && name.startsWith(GROUP_PREFIX)) ids.set(name.slice(GROUP_PREFIX.length), id)
    }
  })()
  // (a configuration that cannot be read: no group of ours, every render with PDF.js's own)
  const settled = ready.catch(() => { config = null; ids.clear() })
  /** the groups hidden now, by id: only those changed are set again */
  let hidden = new Set()
  let tail = Promise.resolve()
  /** the pages rendered last, the latest last, each once */
  const warm = []
  const keep = page => {
    const at = warm.indexOf(page)
    if (at >= 0) warm.splice(at, 1)
    warm.push(page)
    while (warm.length > WARM_PAGES) { try { warm.shift().cleanup?.() } catch { /* the document's, gone with it */ } }
  }
  v = {
    ready: settled,
    has: group => ids.has(group),
    get size() { return ids.size },
    render(page, params, off = []) {
      // (the page kept once its render has settled, whatever it came to, before the render's promise settles and the next begins)
      const turn = tail.then(() => drawn(page, params, off)).finally(() => keep(page))
      tail = turn.then(() => {}, () => {})
      return turn
    },
    get warm() { return warm.slice() },
  }
  /** the page drawn with the groups `off` names hidden and every other group of ours shown */
  async function drawn(page, params, off) {
    await settled
    if (!config) return page.render(params).promise
    const want = new Set()
    if (typeof off === 'function') { for (const [g, id] of ids) if (off(g)) want.add(id) }
    else for (const g of off) { const id = ids.get(g); if (id !== undefined) want.add(id) }
    for (const id of hidden) if (!want.has(id)) config.setVisibility(id, true, false)
    for (const id of want) if (!hidden.has(id)) config.setVisibility(id, false, false)
    hidden = want
    return page.render({ ...params, optionalContentConfigPromise: Promise.resolve(config) }).promise
  }
  byDoc.set(doc, v)
  return v
}
