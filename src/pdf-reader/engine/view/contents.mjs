// The contents and the heading read, on the layer (the shared reader view's contract §2.6; docs/PDF-READER.md §11.8): the
// paper's headings as the index records them (its records' headings, depths and title flag) through outline.ts's rule, each at
// the first rectangle of its unit once a part locates it, else at the page the left document's own outline gives the heading
// of its title (matched in order), else at none; each titled by its row once taken, else by its source. The heading read is the
// last of them at or above a point of a page. Pure: the layer side tells it what comes and asks it what to show.
import { DEPTH_NONE, RECORD_FLAG } from '../layer-proto/format.mjs'
import { unitOf } from '../layer-proto/rows.mjs'
import { plainTranslated } from '../translate/mt.mjs'
import { contentsOf, outlineOf } from './outline.ts'

/** a title as the outline and a heading are compared: its section number, case, marks and spaces aside */
const normal = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/^\s*(?:\d+(?:\.\d+)*|[ivxlcdm]+|[a-z])[.)]?\s+(?=\S)/, '').replace(/[^\p{L}\p{N}]+/gu, '')

/** the contents of a layer's paper, from its index */
export function createContents(index) {
  const R = index.records
  const headings = [...R.headings].sort((a, b) => a[0] - b[0]).map(([id, src]) => ({ id, src, ...(R.depth[id] === DEPTH_NONE ? {} : { depth: R.depth[id] }), ...(R.flags[id] & RECORD_FLAG.TITLE ? { title: true } : {}) }))
  const listed = contentsOf(headings)
  const isHeading = new Set(listed.map(h => h.id))
  /** each unit's first rectangle, once a part tells it (goToUnit reads every unit's) */
  const first = new Map()
  /** the pages the outline gives the headings not located, and the headings' texts from their rows */
  const outlined = new Map(), texts = new Map()

  return {
    /** the units the parts tell located: whether a heading of the contents is located anew */
    addParts(parts) {
      let moved = false
      for (const part of parts) {
        for (const [id, , rects] of part.left) {
          if (first.has(id) || !rects.length) continue
          const [page, x0, y0, x1, y1] = rects[0]
          first.set(id, { page, x0, y0, x1, y1 })
          if (isHeading.has(id)) moved = true
        }
      }
      return moved
    },
    /** the rows taken: whether a heading's text changed */
    take(rows) {
      let moved = false
      for (const row of rows) {
        const id = row?.[0]
        if (!isHeading.has(id)) continue
        const u = unitOf(index, row)
        const text = u?.pieces ? plainTranslated(u.pieces).trim() : ''
        if (text) { if (texts.get(id) !== text) { texts.set(id, text); moved = true } } else if (texts.delete(id)) moved = true
      }
      return moved
    },
    /** the left document's own outline, its entries matched to the headings in order by their titles: whether a heading not
     *  located gained a page */
    async outline(doc) {
      const items = []
      const walk = list => { for (const it of list ?? []) { items.push(it); walk(it.items) } }
      walk(await doc.getOutline().catch(() => null))
      if (!items.length) return false
      const pageOf = async dest => {
        try {
          const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest
          const ref = Array.isArray(d) ? d[0] : null
          if (ref == null) return null
          return Number.isInteger(ref) ? ref + 1 : (await doc.getPageIndex(ref)) + 1
        } catch { return null }
      }
      let moved = false, at = 0
      for (const h of listed) {
        const want = normal(h.src)
        if (!want) continue
        for (let i = at; i < items.length; i++) {
          if (normal(items[i].title) !== want) continue
          at = i + 1
          const page = await pageOf(items[i].dest)
          if (page && outlined.get(h.id) !== page) { outlined.set(h.id, page); if (!first.has(h.id)) moved = true }
          break
        }
      }
      return moved
    },
    entries: () => outlineOf(headings, id => texts.get(id), id => first.get(id)?.page ?? outlined.get(id) ?? null),
    /** a unit's first rectangle where a part has located it */
    firstRect: id => first.get(id) ?? null,
    /** the page the contents give a heading: its first rectangle's, else the outline's */
    pageOf: id => first.get(id)?.page ?? outlined.get(id) ?? null,
    /** the heading being read at a point of a page (PDF units, y up): the last of the contents at or above it; null before
     *  the first */
    headingAt(page, y) {
      let id = null
      for (const h of listed) {
        const r = first.get(h.id), p = r?.page ?? outlined.get(h.id)
        if (!p) continue
        const top = r ? Math.max(r.y0, r.y1) : Number.POSITIVE_INFINITY
        if (p < page || (p === page && (y == null || top >= y))) id = h.id
      }
      return id
    },
  }
}
