// A laid page's links (design §4.5: on a laid page the text layer and the links are ours, PDF.js's own would offer the hidden
// original at its old places): `Page.links`, each an `<a href>` over its box, reached by Tab in the page's order, named by the
// text drawn under it, followed by a click or Enter. Carried from today's link layer (src/pdf-reader/engine/view/links.mjs at
// baf2083e0): a box of the page's frame in shares, so that a zoom moves nothing; a name set as an attribute, never parsed; a
// link out of the paper through the host alone, an address of the allowed schemes only; a link inside it followed by the reader.
import type { PageViewport } from 'pdfjs-dist'
import type { Box, Page } from './page.ts'

/** the schemes a link out of the paper may have (layer-proto/links.mjs LINK_SCHEMES) */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:']
export const urlAllowed = (url: string): boolean => {
  try {
    return LINK_SCHEMES.includes(new URL(url).protocol)
  } catch {
    return false
  }
}
const pct = (v: number) => `${Math.round(v * 1e4) / 1e4}%`
const hashOf = (dest: string) => `#${encodeURIComponent(dest)}`

export interface LinkHooks {
  open(url: string): void
  follow(dest: string | unknown[], how: { keyboard: boolean }): void
  /** the name of a link with no text under it */
  unnamed(to: { url: string } | { dest: string }): string
  /** the text drawn under a box (the page's laid items), for its name */
  textUnder(box: Box): string
}

/** a destination as the page carries it: a name, or an explicit one written as JSON */
export function destOf(dest: string): string | unknown[] {
  if (dest.startsWith('[')) {
    try {
      const d = JSON.parse(dest)
      if (Array.isArray(d)) return d
    } catch {
      /* a name */
    }
  }
  return dest.startsWith('"') && dest.endsWith('"') ? dest.slice(1, -1) : dest
}

/** the page's links in one element, or null where it has none */
export function linkLayer(page: Page, vp: PageViewport, hooks: LinkHooks): HTMLElement | null {
  const list = page.links.filter(
    ([b, to]) => b[2] > b[0] && b[3] > b[1] && ('url' in to ? urlAllowed(to.url) : !!to.dest),
  )
  if (!list.length) return null
  const layer = document.createElement('div')
  layer.className = 'axt-links'
  // (in the page's reading order: top to bottom, then left to right, as the text runs)
  list.sort(([a], [b]) => b[3] - a[3] || a[0] - b[0])
  list.forEach(([box, to], i) => {
    const [ax, ay] = vp.convertToViewportPoint(box[0], box[3]) as [number, number],
      [bx, by] = vp.convertToViewportPoint(box[2], box[1]) as [number, number]
    const left = Math.min(ax, bx),
      top = Math.min(ay, by),
      w = Math.abs(bx - ax),
      h = Math.abs(by - ay)
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.dataset.axtLink = String(i)
    a.setAttribute('aria-label', hooks.textUnder(box).trim() || hooks.unnamed(to))
    if ('url' in to) {
      a.href = to.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.title = to.url
    } else a.href = hashOf(to.dest)
    Object.assign(a.style, {
      left: pct((left / vp.width) * 100),
      top: pct((top / vp.height) * 100),
      width: pct((w / vp.width) * 100),
      height: pct((h / vp.height) * 100),
    })
    const s = document.createElement('span')
    s.className = 'axt-link-box'
    Object.assign(s.style, { left: '0%', top: '0%', width: '100%', height: '100%' })
    a.append(s)
    layer.append(a)
  })
  const toOf = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a.axt-link') as HTMLElement | null
    return a && layer.contains(a) ? (list[Number(a.dataset.axtLink)]?.[1] ?? null) : null
  }
  layer.addEventListener('click', (e) => {
    const to = toOf(e)
    if (!to) return
    e.preventDefault()
    if ('url' in to) hooks.open(to.url)
    else hooks.follow(destOf(to.dest), { keyboard: (e as MouseEvent).detail === 0 })
  })
  layer.addEventListener('auxclick', (e) => {
    const to = toOf(e)
    if (!to || (e as MouseEvent).button !== 1) return
    e.preventDefault()
    if ('url' in to) hooks.open(to.url)
  })
  return layer
}
