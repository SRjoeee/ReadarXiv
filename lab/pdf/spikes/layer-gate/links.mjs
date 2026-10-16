// lab/pdf/spikes/layer-gate/links.mjs
// The link measures of the layer gate (3a-0, "the gate's measures first"; the design is 3a-links-design.md section 2, the
// contract pageof-contract.md "Links anchors returned with pageOf", the owner's ruling: links kept / total >= 0.95, drawn
// text under each moved link = PDF.js's overlaid text >= 0.98, links over erased text = 0). Pure: no file, no clock, no
// DOM; the page (proto.mjs) collects the inputs, the arithmetic is here and is tested in Node
// (tests/pdf-reader/layer-gate-links.test.ts).
//
// What a page's measures are, from what the page holds:
//   T(p)  the page's Link annotations PDF.js reports (`getAnnotations()`, the arXiv file the instrument opens) that the
//         reader can carry: a rectangle with an area and a target, a non-empty `dest` or a `url` of http:, https: or
//         mailto: (the engine's allow-list). U(p), the rest, is reported: a named action, JavaScript with no URL read out of
//         it, an attachment, a remote go-to or a launch without a valid URL, `unsafeUrl` alone, a scheme not allowed
//   R(p)  the records the engine answers for the page (`run.linksOf(p)`), and the engine's attribution of each to its
//         source annotations (`run.linkSources(p)`, gate-only: `{ annots: [[page, i], ...], tier }` for each record, the
//         records' order; `i` the annotation's rank among the page's Link annotations in PDF.js's order, T and U alike)
//   E(p)  the area the drawing's operations leave erased (erase, paper and swap rectangles, less each restore's boxes within
//         its clip, in the operations' order), asked at a glyph point
// The attribution is the engine's own claim. It is checked, never trusted: by target, by the in-place rectangle, by
// uniqueness (an annotation one record claims is claimed by no other) and, for a moved record, by the drawn text; a
// false claim fails `linksWrong` or `linksTrue`. What it cannot tell is a right link from a wrong one with the same target
// and the same rectangle: that is the weakness the owner accepted (design Q7).
//
// Glyph points are PDF.js's own rule (SingleIntersector, which fills `overlaidText`): a glyph's advance centre on its
// baseline, strictly inside the rectangle or a quad. The page's text items are cut into characters of equal advance: the
// instrument's approximation, never the engine's own characters.

/** the schemes a record's `url` may have (the contract's allow-list; PDF.js also lets ftp: and tel: through) */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:']
/** how far in PDF units an in-place record's boxes may be from its annotation's rectangle */
export const BOX_TOLERANCE = 0.01
/** the border styles a record names (PDF.js's AnnotationBorderStyleType: 1 solid, 2 dashed, 5 underline) */
export const BORDER_STYLES = { 1: 'solid', 2: 'dashed', 5: 'underline' }

const box4 = (a, b, c, d) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
const finite = xs => xs.every(x => typeof x === 'number' && Number.isFinite(x))
const area = b => (b[2] - b[0]) * (b[3] - b[1])

/** whether `url` is one the contract lets a record carry */
export function urlAllowed(url) {
  if (typeof url !== 'string' || !url) return false
  try { return LINK_SCHEMES.includes(new URL(url).protocol) } catch { return false }
}

/** a quad list as boxes: PDF.js gives the Float32Array of 8n numbers it normalised to axis-aligned quads; the boxes are the
 *  quads' bounds (a list of point lists is read too) */
function quadBoxes(q) {
  if (!q || typeof q.length !== 'number') return null
  const flat = Array.isArray(q) && q.length && typeof q[0] !== 'number' ? q.flatMap(p => (Array.isArray(p) && typeof p[0] === 'object' ? p.flatMap(pt => [pt.x, pt.y]) : p)) : Array.from(q)
  if (!flat.length || flat.length % 8 || !finite(flat)) return null
  const out = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i], flat[i + 2], flat[i + 4], flat[i + 6]], ys = [flat[i + 1], flat[i + 3], flat[i + 5], flat[i + 7]]
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return out
}

/**
 * A page's Link annotations as PDF.js reports them (`getAnnotations()`), read for the measures. `i` is the rank among the
 * page's Link annotations (any other subtype is not counted), PDF.js's order. Each: { i, ok (it is in T), rect, boxes (its
 * quads' boxes, else its rect), target ({ dest } or { url }), ov (overlaid text), border }
 */
export function annotationsOf(raw) {
  const links = []
  let i = 0
  for (const a of raw ?? []) {
    if (a?.subtype !== 'Link') continue
    const rect = Array.isArray(a.rect) && a.rect.length === 4 && finite(a.rect) ? box4(...a.rect) : null
    const quads = quadBoxes(a.quadPoints)
    let target = null
    if (typeof a.url === 'string' && a.url) { if (urlAllowed(a.url)) target = { url: a.url } }
    else if ((typeof a.dest === 'string' && a.dest) || (Array.isArray(a.dest) && a.dest.length)) target = { dest: a.dest }
    const bw = a.borderStyle?.width
    const color = a.color && a.color.length >= 3 ? [a.color[0], a.color[1], a.color[2]] : null
    const border = bw > 0 && color ? { width: bw, rgb: color, style: BORDER_STYLES[a.borderStyle.style] ?? 'solid' } : null
    links.push({ i: i++, ok: !!(rect && area(rect) > 0 && target), rect, boxes: quads ?? (rect ? [rect] : []), target, ov: typeof a.overlaidText === 'string' ? a.overlaidText : '', border })
  }
  return { links, byIndex: new Map(links.map(a => [a.i, a])), total: links.filter(a => a.ok).length, unsupported: links.filter(a => !a.ok).length }
}

/** the points of a page's text items: each non-space character's advance centre on its baseline, in the item's direction
 *  (PDF.js items: { str, width, transform }); [{ x, y, ch }] */
export function glyphPointsOf(items) {
  const out = []
  for (const it of items ?? []) {
    const s = it?.str, t = it?.transform
    if (!s || !t || !finite([...t, it.width])) continue
    const n = Math.hypot(t[0], t[1])
    if (!n || !(it.width > 0)) continue
    const ux = t[0] / n, uy = t[1] / n, chars = [...s]
    chars.forEach((ch, k) => {
      if (!/\S/u.test(ch)) return
      const along = ((k + 0.5) / chars.length) * it.width
      out.push({ x: t[4] + ux * along, y: t[5] + uy * along, ch })
    })
  }
  return out
}

const inside = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3]
/** the points strictly inside one of the boxes */
export const pointsIn = (points, boxes) => points.filter(p => boxes.some(b => inside(p.x, p.y, b)))
/** a link's glyph points: the glyphs strictly inside its rectangle or quads; with none, its rectangle's centre */
export function glyphsOfLink(a, points) {
  const hit = pointsIn(points, a.boxes)
  if (hit.length) return hit
  const r = a.rect ?? a.boxes[0]
  return r ? [{ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2, ch: '' }] : []
}

/**
 * The erased area of a page as a question: whether a PDF point lies where the drawing's operations (rows[p - 1].ops, device
 * pixels [x, y, w, h]) left the paper erased at the end. In their order: erase, paper and swap rectangles erase; a restore puts
 * the page's pixels back in each of its boxes within its clip; a crop erases nothing. `devOf(x, y)`: a PDF point in the
 * operations' pixels
 */
export function erasedOf(ops, devOf) {
  const list = ops ?? []
  const within = (x, y, b) => x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]
  return (px, py) => {
    const [x, y] = devOf(px, py)
    let erased = false
    for (const o of list) {
      if (o.op === 'erase') { if (within(x, y, o.box)) erased = true }
      else if (o.op === 'paper' || o.op === 'swap') { if (o.rects.some(b => within(x, y, b))) erased = true }
      else if (o.op === 'restore') { if (o.boxes.some(b => within(x, y, b)) && o.clip.some(b => within(x, y, b))) erased = false }
    }
    return erased
  }
}

/** two targets are the same: `dest` deep-equal (a name, or an explicit array), `url` equal */
export function sameTarget(rec, target) {
  if (!target) return false
  if (target.url !== undefined) return rec.url === target.url && rec.dest === undefined
  return rec.url === undefined && JSON.stringify(rec.dest) === JSON.stringify(target.dest)
}

const lettersOf = s => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')
const nonSpaceOf = s => s.normalize('NFKC').replace(/\s/gu, '')
/** two texts are equal after NFKC, on letters and digits; where both have none, on all their non-space characters */
export function sameText(a, b) {
  const la = lettersOf(a), lb = lettersOf(b)
  return la || lb ? la === lb : nonSpaceOf(a) === nonSpaceOf(b)
}

/**
 * The drawn characters of an SVG that is laid out (in a document, fonts loaded), as points {x, y, ch} in the units `at(x, y)`
 * maps the SVG's user space to (PDF units): each tspan character's advance centre on its baseline (SVGTextContentElement
 * getStartPositionOfChar and getEndPositionOfChar: the start's y is the baseline of the tspan's own y, a superscript's raised; an
 * oblique run's skew leaves a baseline point where it is), in DOM order; a crop's transparent text (fill-opacity 0) is one whole
 * string at the middle of its run. Spaces are no characters
 */
export function drawnCharsOf(svg, at) {
  const out = []
  for (const t of svg.querySelectorAll('tspan')) {
    const n = t.getNumberOfChars(), text = t.textContent ?? ''
    if (!n) continue
    if (t.getAttribute('fill-opacity') === '0') {
      const a = t.getStartPositionOfChar(0), b = t.getEndPositionOfChar(n - 1)
      out.push({ ...at((a.x + b.x) / 2, a.y), ch: text })
      continue
    }
    for (let i = 0; i < n; i++) {
      const ch = text[i]
      if (!ch || !/\S/u.test(ch)) continue
      const a = t.getStartPositionOfChar(i), b = t.getEndPositionOfChar(i)
      out.push({ ...at((a.x + b.x) / 2, a.y), ch })
    }
  }
  return out
}

/** the characters of `chars` ({ x, y, ch } in DOM order, or a whole string at a point) strictly inside one of the boxes */
export const textUnder = (chars, boxes) => chars.filter(c => boxes.some(b => inside(c.x, c.y, b))).map(c => c.ch).join('')

/** a record's boxes as flat list [x0, y0, x1, y1, ...] are well formed */
function wellFormed(boxes) {
  if (!Array.isArray(boxes) || !boxes.length || boxes.length % 4 || !finite(boxes)) return false
  for (let i = 0; i < boxes.length; i += 4) if (!(boxes[i] < boxes[i + 2] && boxes[i + 1] < boxes[i + 3])) return false
  return true
}
const flat = boxes => boxes.flat()
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= BOX_TOLERANCE)

// ---------------------------------------------------------------- the reference of linksTrue

/**
 * A unit's translated pairs (\href, \hyperref, \hyperlink and the others) in source order, from its pieces
 * ({ t: 'text', s } | { t: 'open', id, src } | { t: 'close', id } | other): { src, text }, the plain text of the pieces
 * between the pair (a placeholder inside it adds none)
 */
export function pairsOf(pieces) {
  const out = [], open = new Map()
  for (const p of pieces ?? []) {
    if (p.t === 'open') { const e = { src: String(p.src ?? ''), text: '' }; open.set(p.id, e); out.push(e) }
    else if (p.t === 'close') open.delete(p.id)
    else if (p.t === 'text') for (const e of open.values()) e.text += p.s
  }
  return out
}
/** the URL a \href's source writes, as a URL does: `\href{u}{`'s argument with TeX's escapes undone, or null */
export function hrefUrlOf(src) {
  const m = /^\\href\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(src)
  if (!m) return null
  try { return new URL(m[1].replace(/\\([#%_&~$])/g, '$1')).href } catch { return null }
}

/**
 * The reference for linksTrue (design section 2, answer to Q1): the overlaid text of the record's annotations, joined in
 * order, where every glyph of an annotation lies in a placeholder's segment of TeX's file or on no unit's line (the text there
 * is the original's, and the drawing shows it so); otherwise the plain text of the translated pieces between the pair
 * (PDF.js's overlaid text is English where the translation is not): the `\href` whose URL is the annotation's, else the owner's
 * i-th `\hyperref` or `\hyperlink` (i the annotation's rank among the annotations of that unit with a destination whose glyphs
 * are not in a placeholder, as many as the unit's pairs). null where neither is found: the record then counts as not true and
 * is listed. `ctx`: { points(a) -> glyph points of the annotation, segment(x, y), owner(x, y) -> unit id or null, pairsOf(id),
 * all: the page's annotations of T in PDF order }
 */
export function referenceOf(annots, ctx) {
  const ownerOf = a => { const p = ctx.points(a).find(q => !ctx.segment(q.x, q.y) && ctx.owner(q.x, q.y) !== null); return p ? ctx.owner(p.x, p.y) : null }
  const parts = []
  for (const a of annots) {
    const owner = ownerOf(a)
    if (owner === null) { parts.push(a.ov); continue }
    const pairs = ctx.pairsOf(owner) ?? []
    let pair = null
    if (a.target?.url !== undefined) pair = pairs.find(p => hrefUrlOf(p.src) === new URL(a.target.url).href) ?? null
    else {
      const mine = ctx.all.filter(b => b.target?.dest !== undefined && ownerOf(b) === owner)
      const internal = pairs.filter(p => /^\\(?:hyperref|hyperlink)\b/.test(p.src))
      const at = mine.findIndex(b => b.i === a.i)
      if (at >= 0 && mine.length === internal.length) pair = internal[at]
    }
    if (!pair) return null
    parts.push(pair.text)
  }
  return parts.join('')
}

// ---------------------------------------------------------------- a page's measures

/**
 * A page's link measures. Inputs: `page`; `parsed(q)`: annotationsOf of the arXiv file's page q (the page's own, and the pages
 * the engine names as a source); `glyphs`: the page's glyph points; `erased(x, y)`: E(p); `records` and `sources` (R(p) and
 * the attribution, the records' order; `sources` null where the engine has none); `claims`: a Map shared by a fixture's pages, so
 * that an annotation two records of different pages claim is found; `drawn(record)`: the drawn text under the record's boxes
 * (asked only of a moved record); `reference(record, annots)`: the reference text or null (asked only of a moved record).
 *
 * Returns the counts of the page (an entry in the record): `linksTotal` and `linksUnsupported` (T and U of the page),
 * `linksPlaceable` (annotations of T none of whose glyph points is erased: what "in place" alone could keep), `linksKeptN`
 * (annotations of any page that records of this page keep: attributed to a record with its own target, moved or in place on
 * its rectangle, the record in no way wrong), `linksMoved`, `linksInPlace`, `linksTrueN` (moved records whose drawn text is
 * the reference's), `linksWrong` (records with a defect: below), and `where`: { linksWrong: ['<order>:<reasons>'], linksTrue:
 * ['<order>'] }, the ranks of the records at fault.
 *
 * A record is wrong where, for any reason:
 *   erased   it is in place and a glyph point of its annotation is erased
 *   claim    the engine names no annotation for it, or an in-place record more than one or one of another page
 *   missing  it names an annotation that is not in T
 *   target   it names an annotation of another target
 *   twice    another record (or it again) claims the same annotation
 *   rect     it is in place and its boxes are not its annotation's rectangle (or quads)
 *   scheme   it carries a url that is not allowed, or both or neither of dest and url
 *   name     it has an empty name and glyphs under it
 *   shape    its boxes are not [x0 < x1, y0 < y1] times n
 */
export function linksPage(o) {
  const own = o.parsed(o.page)
  const T = own.links.filter(a => a.ok)
  const out = { linksTotal: own.total, linksUnsupported: own.unsupported, linksPlaceable: 0, linksKeptN: 0, linksMoved: 0, linksInPlace: 0, linksTrueN: 0, linksWrong: 0, where: { linksWrong: [], linksTrue: [] } }
  for (const a of T) if (!glyphsOfLink(a, o.glyphs).some(p => o.erased(p.x, p.y))) out.linksPlaceable++
  const records = o.records ?? [], sources = o.sources ?? null
  for (const [r, rec] of records.entries()) {
    const reasons = []
    const me = `${o.page}:${r}`
    const claimed = sources?.[r]?.annots ?? []
    const good = []
    if (!wellFormed(rec.boxes)) reasons.push('shape')
    if ((rec.url === undefined) === (rec.dest === undefined) || (rec.url !== undefined && !urlAllowed(rec.url))) reasons.push('scheme')
    if (!claimed.length) reasons.push('claim')
    for (const [q, i] of claimed) {
      const a = o.parsed(q)?.byIndex.get(i)
      if (!a?.ok) { reasons.push('missing'); continue }
      if (!sameTarget(rec, a.target)) { reasons.push('target'); continue }
      const key = `${q}|${i}`
      if (o.claims?.has(key)) reasons.push('twice')
      o.claims?.set(key, me)
      good.push({ q, a })
    }
    if (!rec.moved) {
      // in place: its one annotation of this page, on its rectangle, no glyph of it erased
      if (claimed.length > 1 || claimed.some(([q]) => q !== o.page)) reasons.push('claim')
      else if (good.length === 1) {
        if (!near(flat(rec.boxes ?? []), flat(good[0].a.boxes))) reasons.push('rect')
        if (glyphsOfLink(good[0].a, o.glyphs).some(p => o.erased(p.x, p.y))) reasons.push('erased')
      }
    }
    if (typeof rec.name !== 'string') reasons.push('name')
    else if (!rec.name && (rec.moved || good.some(({ a }) => pointsIn(o.glyphs, a.boxes).length))) reasons.push('name')
    if (rec.moved) out.linksMoved++
    else out.linksInPlace++
    const why = [...new Set(reasons)]
    if (why.length) { out.linksWrong++; out.where.linksWrong.push(`${rec.order ?? r}:${why.join('+')}`) }
    else out.linksKeptN += new Set(good.map(({ q, a }) => `${q}|${a.i}`)).size
    if (rec.moved) {
      // (the reference reads this page's glyphs and TeX's file of this page: an annotation of another page has none, and is not true)
      const ref = good.length && good.length === claimed.length && good.every(({ q }) => q === o.page) ? o.reference(rec, good.map(({ a }) => a)) : null
      if (ref !== null && sameText(o.drawn(rec), ref)) out.linksTrueN++
      else out.where.linksTrue.push(String(rec.order ?? r))
    }
  }
  return out
}

// ---------------------------------------------------------------- the composed document against arXiv's

/** a page's Link annotations as the composed-document check compares them: rect, dest, url, border width, colour,
 *  overlaid text and quads, every Link annotation (those the reader cannot carry too) */
export function linkSetOf(raw) {
  return (raw ?? []).filter(a => a?.subtype === 'Link').map(a => ({
    rect: a.rect ? Array.from(a.rect) : null, dest: a.dest ?? null, url: a.url ?? null, unsafeUrl: a.unsafeUrl ?? null, action: a.action ?? null,
    bw: a.borderStyle?.width ?? null, color: a.color ? Array.from(a.color) : null, ov: a.overlaidText ?? null, quads: a.quadPoints ? Array.from(a.quadPoints) : null,
  }))
}
/** the pages (1-based) on which the composed document's Link annotations differ from arXiv's: `a` and `b` the raw annotation
 *  lists by page (index 0 is page 1); a page one has and the other lacks differs */
export function composedDiff(a, b) {
  const out = []
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (!a[k] || !b[k] || JSON.stringify(linkSetOf(a[k])) !== JSON.stringify(linkSetOf(b[k]))) out.push(k + 1)
  }
  return out
}
