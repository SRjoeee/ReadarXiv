// A laid page's links (design §4.5: on a laid page the text layer and the links are ours, PDF.js's own would offer the hidden
// original at its old places): `Page.links`, each an `<a href>` over its box, reached by Tab in the page's reading order, named
// by the text drawn under it, followed by a click or Enter. Carried from today's link layer (src/pdf-reader/engine/view/links.mjs
// at baf2083e0, docs/PDF-READER.md §11.9): a box of the page's frame in shares, so that a zoom moves nothing; a name set as an
// attribute, never parsed; a link out of the paper through the host alone, an address of the allowed schemes only; a link inside
// it followed by the reader; the PDF's border where it gives one (as PDF.js draws a link on the left).
//
// What today's engine wrote into each record, the reader reads here: the name is the text the page's text layer holds under the
// link (what is drawn there: the translation over a moved link, the original's text over one at its place, a crop's text), and
// a link with none is named by the host's words by where it goes (UI.md S-R-25); the order is the text's (the first item of
// the page's text content under it); the border is the original's annotation of the same target and size (A's own record of it).
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import type { Box, Page } from './page.ts'
import type { TextContent } from './text.ts'

/** the schemes a link out of the paper may have (layer-proto/links.mjs LINK_SCHEMES) */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:']
export const urlAllowed = (url: string): boolean => {
  try {
    return LINK_SCHEMES.includes(new URL(url).protocol)
  } catch {
    return false
  }
}
/** the characters of a name at most, the widest border drawn (links.mjs NAME_MAX, BORDER_MAX) */
export const NAME_MAX = 2000
const BORDER_MAX = 20
const pct = (v: number) => `${Math.round(v * 1e4) / 1e4}%`
const hashOf = (dest: string) => `#${encodeURIComponent(dest)}`

export interface LinkHooks {
  open(url: string): void
  follow(dest: string | unknown[], how: { keyboard: boolean }): void
  /** the name of a link with no text under it, by where it goes (UI.md S-R-25: the host's words) */
  unnamed(to: { url: string } | { internal: true }): string
  /** not read: a link's text is the page's text layer's under it (kept for a caller written before) */
  textUnder?(box: Box): string
}

/** a link's border as the PDF gives it: its width (CSS px, as PDF.js draws it), its colour, its style */
export interface Border {
  width: number
  rgb: [number, number, number]
  style: 'solid' | 'dashed' | 'underline'
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

type TextItem = Extract<TextContent['items'][number], { str: string }>
const isText = (e: TextContent['items'][number]): e is TextItem => typeof (e as TextItem).str === 'string'
/**
 * What is drawn under a box, by the page's text content (the text layer's: the original's text where it stays, the translation
 * and the crops' text where they are drawn): each character whose place's centre (an equal advance across its item, as
 * layer-proto/textlayer.mjs `pointsOf` estimates) lies in the box, a space where two items stand apart, white space collapsed.
 * Its first item's index too (the link's place in the reading order), -1 with none
 */
export function textUnder(content: TextContent | null, box: Box): { name: string; at: number } {
  if (!content) return { name: '', at: -1 }
  let name = '',
    at = -1,
    last: TextItem | null = null
  const items = content.items
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as TextContent['items'][number]
    if (!isText(it) || !it.str) continue
    const [a, b, , d, e, f] = it.transform as number[]
    // (upright items only: a turned one is the left's alone, textlayer.mjs itemsOf)
    if (b !== 0) continue
    const size = Math.abs(d as number) || Math.abs(a as number) || 1
    const y = (f as number) + 0.3 * size
    if (y < box[1] || y > box[3]) continue
    const chars = [...it.str],
      step = it.width / Math.max(1, chars.length)
    let took = ''
    chars.forEach((ch, k) => {
      const x = (e as number) + (k + 0.5) * step
      if (x >= box[0] && x <= box[2]) took += ch
    })
    if (!took) continue
    if (at < 0) at = i
    if (last && name && !/\s$/.test(name)) {
      const [, , , , le, lf] = last.transform as number[]
      const apart =
        Math.abs((lf as number) - (f as number)) > 0.5 * size ||
        (e as number) - ((le as number) + last.width) > 0.15 * size
      if (apart) name += ' '
    }
    name += took
    last = it
  }
  return { name: name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX), at }
}

/** where a link over no text stands in the reading order: before the first item of the page's text content at or below its
 *  foot in its column (its boxes' reach across), else after them all */
function placeOf(content: TextContent | null, box: Box): number {
  if (!content) return Number.POSITIVE_INFINITY
  const items = content.items
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as TextContent['items'][number]
    if (!isText(it) || !it.str.trim()) continue
    const [, , , , e, f] = it.transform as number[]
    if ((f as number) <= box[1] && (e as number) < box[2] && (e as number) + it.width > box[0]) return i - 0.5
  }
  return Number.POSITIVE_INFINITY
}

/** the borders of a page's link annotations (A's: the composed page holds the original's annotations), by target */
export async function bordersOf(
  page: PDFPageProxy,
): Promise<{ to: string; w: number; h: number; box: Box; border: Border }[]> {
  const out: { to: string; w: number; h: number; box: Box; border: Border }[] = []
  let list: unknown[]
  try {
    list = await page.getAnnotations({ intent: 'display' })
  } catch {
    return out
  }
  for (const x of list as {
    subtype?: string
    rect?: number[]
    url?: string
    unsafeUrl?: string
    dest?: unknown
    color?: ArrayLike<number> | null
    borderStyle?: { width?: number; style?: number }
  }[]) {
    if (x?.subtype !== 'Link' || !Array.isArray(x.rect) || x.rect.length !== 4) continue
    const width = x.borderStyle?.width ?? 0
    const c = x.color
    if (!(width > 0) || !c || c.length !== 3) continue
    const to = x.url ?? x.unsafeUrl ?? (x.dest !== undefined ? JSON.stringify(x.dest) : '')
    const [x0, y0, x1, y1] = x.rect as [number, number, number, number]
    out.push({
      to,
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
      box: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
      border: {
        width: Math.min(BORDER_MAX, width),
        rgb: [c[0] as number, c[1] as number, c[2] as number],
        style: x.borderStyle?.style === 2 ? 'dashed' : x.borderStyle?.style === 5 ? 'underline' : 'solid',
      },
    })
  }
  return out
}
/** a link's border: the original's annotation of the same target over the same box, else of the same target and size (the
 *  link moved with its piece keeps its size), else none */
function borderFor(
  borders: Awaited<ReturnType<typeof bordersOf>>,
  box: Box,
  to: { url: string } | { dest: string },
): Border | null {
  const key = 'url' in to ? to.url : null
  const same = borders.filter((b) => (key !== null ? b.to === key : b.to !== '' && !urlAllowed(b.to)))
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  const at = same.find((b) => b.box.every((v, i) => near(v, box[i] as number)))
  if (at) return at.border
  const sized = same.find((b) => near(b.w, box[2] - box[0]) && near(b.h, box[3] - box[1]))
  return sized?.border ?? null
}

/** the page's links in one element, or null where it has none. `content`: the page's text layer content (the names, the order);
 *  `borders`: its original's link annotations (bordersOf) */
export function linkLayer(
  page: Page,
  vp: PageViewport,
  hooks: LinkHooks,
  content: TextContent | null = null,
  borders: Awaited<ReturnType<typeof bordersOf>> = [],
): HTMLElement | null {
  const list = page.links
    .filter(([b, to]) => b[2] > b[0] && b[3] > b[1] && ('url' in to ? urlAllowed(to.url) : !!to.dest))
    .map(([box, to], i) => ({ box, to, i, ...textUnder(content, box) }))
  if (!list.length) return null
  const layer = document.createElement('div')
  layer.className = 'axt-links'
  // (in the page's reading order: the text's, where a link is over text; else top to bottom, then left to right)
  for (const x of list) if (x.at < 0) x.at = placeOf(content, x.box)
  list.sort((a, b) => a.at - b.at || b.box[3] - a.box[3] || a.box[0] - b.box[0] || a.i - b.i)

  list.forEach(({ box, to, name }, i) => {
    const [ax, ay] = vp.convertToViewportPoint(box[0], box[3]) as [number, number],
      [bx, by] = vp.convertToViewportPoint(box[2], box[1]) as [number, number]
    const left = Math.min(ax, bx),
      top = Math.min(ay, by),
      w = Math.abs(bx - ax),
      h = Math.abs(by - ay)
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.dataset.axtLink = String(i)
    // (the name as an attribute's text: never markup, whatever characters it holds)
    a.setAttribute('aria-label', name || hooks.unnamed('url' in to ? { url: to.url } : { internal: true }))
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
    const border = borderFor(borders, box, to)
    if (border) {
      a.dataset.axtBorder = border.style
      a.style.setProperty('--axt-link-border', `${border.width}px`)
      a.style.setProperty('--axt-link-colour', `rgb(${border.rgb.join(' ')})`)
    }
    const s = document.createElement('span')
    s.className = 'axt-link-box'
    Object.assign(s.style, { left: '0%', top: '0%', width: '100%', height: '100%' })
    a.append(s)
    layer.append(a)
  })
  const shown = list.map((x) => x.to)
  const toOf = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a.axt-link') as HTMLElement | null
    return a && layer.contains(a) ? (shown[Number(a.dataset.axtLink)] ?? null) : null
  }
  layer.addEventListener('click', (e) => {
    const to = toOf(e)
    if (!to) return
    // (never the browser's own navigation: the reader's frame would leave the reader, a hash would move its address)
    e.preventDefault()
    if ('url' in to) hooks.open(to.url)
    // (a click a pointer did not make: Enter, or an assistive technology's)
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
