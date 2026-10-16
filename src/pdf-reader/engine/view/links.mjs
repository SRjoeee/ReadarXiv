// The links of a laid page over the right pane's place (the shared reader view's contract §3.1, 3b; the links design's §4 and
// option B): the engine's records (layer-proto/reader.d.mts LinkRecord: boxes in the page's PDF units, a destination or an
// allow-listed address, a name, a reading order, a border) made into real links, `<a href>` elements in reading order, which a
// keyboard reaches by Tab, a screen reader names by the drawn text under them, Enter follows and a click follows, over the
// layer's drawing and under the highlight's layer.
//
// One `<a>` a record, sized to the union of its boxes, each box a span inside it: a link the layer breaks over two lines is one
// link with two boxes, as PDF.js draws one with QuadPoints. Every size is a share of the page's box (or of the link's), made
// once from the place's viewport (its rotation and its box's origin in it): the place's own CSS size scales them at any zoom,
// so nothing is read from the layout and nothing is done on a frame. The anchor itself takes no pointer: its boxes do, so the
// space between two lines of one link is the page's.
//
// What a record names is text from the PDF, which may hold control and bidirectional characters: it is set as an attribute's
// text (the accessible name), never parsed as markup. A record the view cannot carry (no box of area, neither destination nor
// allowed address, an address out of the allow-list) is left out. A click, Enter, and a middle click or a modified click on a
// link out of the paper go through the host alone (`open`: the host's policy and its new tab); a link inside the paper is
// followed by the view (`follow`: resolved on the left's document and jumped to on the pane clicked).
import { urlAllowed } from '../layer-proto/links.mjs'

/** the words a link with no glyph under it is named by (an image, a symbol: the engine's '' name), until a host gives its
 *  own (ViewWords.linkName): a placeholder, the owner's copy pending (.superpowers/sdd/2026-10-15-prepare-pipeline/
 *  links-copy-draft.md) */
export const LINK_NAME_PLACEHOLDER = Object.freeze({ internal: 'Link', external: 'Link' })
/** the boxes a record may hold, the characters of its name and of a named destination at most (more is no link a page has) */
export const BOXES_MAX = 64
export const NAME_MAX = 2000
export const DEST_MAX = 1000
const STYLES = new Set(['solid', 'dashed', 'underline'])
const BORDER_MAX = 20

const finite = v => typeof v === 'number' && Number.isFinite(v)
/** a record's boxes as [x0, y0, x1, y1] lists of area, or null */
function boxesOf(b) {
  if (!Array.isArray(b) || !b.length || b.length % 4 || b.length > BOXES_MAX * 4) return null
  const out = []
  for (let i = 0; i < b.length; i += 4) {
    const [x0, y0, x1, y1] = b.slice(i, i + 4)
    if (!finite(x0) || !finite(y0) || !finite(x1) || !finite(y1) || !(x0 < x1) || !(y0 < y1)) return null
    out.push([x0, y0, x1, y1])
  }
  return out
}
function borderOf(b) {
  if (!b || typeof b !== 'object' || !finite(b.width) || b.width <= 0 || !Array.isArray(b.rgb) || b.rgb.length !== 3) return null
  if (!b.rgb.every(c => Number.isInteger(c) && c >= 0 && c <= 255)) return null
  return { width: Math.min(BORDER_MAX, b.width), rgb: [...b.rgb], style: STYLES.has(b.style) ? b.style : 'solid' }
}

/**
 * The records a page's layer carries, as the view draws them: each one checked (its boxes of area, at most BOXES_MAX; exactly one
 * of a destination — a name of at most DEST_MAX characters, or an explicit array — and an address of the allow-list; a name of
 * text, at most NAME_MAX; a border of a width and a colour), in reading order (`order`, then the list's), copied: no object of a
 * record is the view's
 */
export function linkRecords(records) {
  const out = []
  if (!Array.isArray(records)) return out
  records.forEach((r, i) => {
    if (!r || typeof r !== 'object') return
    const boxes = boxesOf(r.boxes)
    if (!boxes) return
    const hasUrl = r.url !== undefined, hasDest = r.dest !== undefined
    if (hasUrl === hasDest) return
    if (hasUrl && !urlAllowed(r.url)) return
    if (hasDest && !((typeof r.dest === 'string' && r.dest && r.dest.length <= DEST_MAX) || (Array.isArray(r.dest) && r.dest.length))) return
    const name = typeof r.name === 'string' ? r.name.slice(0, NAME_MAX) : ''
    out.push({
      boxes, name, order: finite(r.order) ? r.order : Number.MAX_SAFE_INTEGER, at: i,
      ...(hasUrl ? { url: r.url } : { dest: typeof r.dest === 'string' ? r.dest : structuredClone(r.dest) }),
      border: borderOf(r.border),
    })
  })
  return out.sort((a, b) => a.order - b.order || a.at - b.at)
}

/** a number as a CSS share, short */
const pct = v => `${Math.round(v * 1e4) / 1e4}%`
/** box [x0, y0, x1, y1] (PDF units) → [left, top, right, bottom] in the viewport's CSS px (any rotation of a quarter turn) */
function onViewport(vp, [x0, y0, x1, y1]) {
  const [ax, ay] = vp.convertToViewportPoint(x0, y0), [bx, by] = vp.convertToViewportPoint(x1, y1)
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}
/** the address a link inside the paper carries: PDF.js's own form of it (getDestinationHash), for a link's role alone */
const hashOf = dest => `#${encodeURIComponent(typeof dest === 'string' ? dest : JSON.stringify(dest))}`
/** the words for a link with no name, by where it goes */
const unnamed = (r, words) => {
  const own = words?.linkName?.(r.url !== undefined ? { url: r.url } : { internal: true })
  return typeof own === 'string' && own ? own : r.url !== undefined ? LINK_NAME_PLACEHOLDER.external : LINK_NAME_PLACEHOLDER.internal
}

/**
 * The links of a page in one element, or null where none can be carried. `o.viewport`: the place's (PDF.js's PageViewport, or
 * its shape: width, height, convertToViewportPoint), read once; `o.follow(dest, how)` a link inside the paper followed
 * (`how.keyboard` where Enter or an assistive technology activated it); `o.open(url)` a link out of it, the host's; `o.words`
 * the host's names for a link with no glyph (ViewWords.linkName)
 */
export function linkLayer(records, o) {
  const list = linkRecords(records), vp = o.viewport
  if (!list.length || !vp?.width || !vp.height) return null
  const layer = document.createElement('div')
  layer.className = 'axt-links'
  const shown = []
  for (const r of list) {
    const rects = r.boxes.map(b => onViewport(vp, b))
    const left = Math.min(...rects.map(q => q[0])), top = Math.min(...rects.map(q => q[1]))
    const w = Math.max(...rects.map(q => q[2])) - left, h = Math.max(...rects.map(q => q[3])) - top
    if (!(w > 0) || !(h > 0)) continue
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.dataset.axtLink = String(shown.length)
    // the name as an attribute's text: never markup, whatever characters it holds
    a.setAttribute('aria-label', r.name || unnamed(r, o.words))
    if (r.url !== undefined) {
      a.href = r.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.title = r.url
    } else a.href = hashOf(r.dest)
    Object.assign(a.style, { left: pct((left / vp.width) * 100), top: pct((top / vp.height) * 100), width: pct((w / vp.width) * 100), height: pct((h / vp.height) * 100) })
    if (r.border) {
      a.dataset.axtBorder = r.border.style
      a.style.setProperty('--axt-link-border', `${r.border.width}px`)
      a.style.setProperty('--axt-link-colour', `rgb(${r.border.rgb.join(' ')})`)
    }
    for (const q of rects) {
      const s = document.createElement('span')
      s.className = 'axt-link-box'
      Object.assign(s.style, { left: pct(((q[0] - left) / w) * 100), top: pct(((q[1] - top) / h) * 100), width: pct(((q[2] - q[0]) / w) * 100), height: pct(((q[3] - q[1]) / h) * 100) })
      a.append(s)
    }
    layer.append(a)
    shown.push(r)
  }
  if (!shown.length) return null
  const recordOf = e => {
    const a = e.target?.closest?.('a.axt-link')
    return a && layer.contains(a) ? shown[Number(a.dataset.axtLink)] ?? null : null
  }
  layer.addEventListener('click', e => {
    const r = recordOf(e)
    if (!r) return
    // never the browser's own navigation: the reader's frame would leave the reader, a hash would move its address
    e.preventDefault()
    if (r.url !== undefined) o.open(r.url)
    // (a click a pointer did not make: Enter, or an assistive technology's)
    else o.follow(r.dest, { keyboard: e.detail === 0 })
  })
  // a middle click: a link out of the paper through the host as any click (its new tab); one inside it follows nowhere
  layer.addEventListener('auxclick', e => {
    const r = recordOf(e)
    if (!r || e.button !== 1) return
    e.preventDefault()
    if (r.url !== undefined) o.open(r.url)
  })
  return layer
}
