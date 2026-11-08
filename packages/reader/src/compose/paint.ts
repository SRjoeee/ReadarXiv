// A laid page painted over its page view (design §4.5 "Painting"): the SVG painter, today's look (layer2.mjs svgOfUnit: a
// <text> a line at its baseline, a <tspan> a run of one face at its own place, an oblique run skewed about its baseline, a line
// set turned turned about its origin as svgOfFigure turns a figure's text), drawn
// from `Page` alone; and the crops, each element's (or label's) own ink cut from the page's crop render and drawn where its item
// stands, darkened into the page so that paint order cannot change a pixel (design-a §1.4).
//
// The painting is in the page's own units (an SVG viewBox of the page, a canvas over the page's frame), so that a zoom scales it
// by CSS with the page view's own canvas, and nothing of it is made again at a scale (the crops are drawn again only where the
// page view is: `cropsFor`).
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import type { OptionalContentConfig } from '../stack/stack.ts'
import type { Faces } from './faces.ts'
import type { Ink, Item, Laid, Page } from './page.ts'

const SVG = 'http://www.w3.org/2000/svg'
const n2 = (v: number) => Math.round(v * 100) / 100
/** how far a crop reaches past its ink, PDF units: a glyph's antialiased edge (hide.mjs CLIP_PAD) */
export const CLIP_PAD = 0.6
/** an oblique run's slant, degrees (a face's own where the table names none) */
const OBLIQUE_DEG = 12

/** the page's frame: its view box [x0, y0, x1, y1] in PDF units, from its viewport (the page's own, whatever its turn) */
export function frameOf(vp: PageViewport): [number, number, number, number] {
  return vp.viewBox as [number, number, number, number]
}

/** how far the page is turned (its /Rotate, as its viewport shows it): 0, 90, 180 or 270 */
export const turnOf = (vp: PageViewport): number => (((vp.rotation ?? 0) % 360) + 360) % 360
/** the page's viewport as it would be unturned, at the same scale: what the overlay's drawing (its SVG, its crops, its links) is
 *  made in, turned then with the page as PDF.js turns its layers (the sheet's `[data-axt-turn]`; the maintainer's B-408: a
 *  page turned a quarter has its translation drawn turned with it, as the original's content is) */
export const uprightOf = (vp: PageViewport): PageViewport => (turnOf(vp) ? vp.clone({ rotation: 0 }) : vp)
/** an element of the overlay drawn in the page's own frame, marked to be turned with the page (none where it is not turned) */
export function turned<E extends Element>(el: E, vp: PageViewport): E {
  const t = turnOf(vp)
  if (t) el.setAttribute('data-axt-turn', String(t))
  return el
}

const isCrop = (i: Item): i is Extract<Item, { src: Ink }> => 'src' in i

/** the page's laid members' lines as one SVG, in the page's own units (viewBox): drawn, never read (out of selection and of the
 *  accessibility tree: the text layer holds the words) */
export function svgOf(page: Page, vp: PageViewport, faces: Faces): SVGSVGElement {
  const [vx0, vy0, vx1, vy1] = frameOf(vp)
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', `0 0 ${n2(vx1 - vx0)} ${n2(vy1 - vy0)}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('aria-hidden', 'true')
  const Y = (y: number) => n2(vy1 - y)
  const X = (x: number) => n2(x - vx0)
  for (const m of page.members) {
    if (m.state !== 'laid' || !m.lines.length) continue
    const g = document.createElementNS(SVG, 'g')
    g.dataset.axtOrd = String(m.ord)
    for (const [y, x0, , items] of m.lines) {
      let text: SVGTextElement | null = null
      let frame = ''
      for (const it of items) {
        if (isCrop(it)) continue
        // (a run set along a direction, a figure text the original sets turned: its line's <text> turned about the line's origin,
        // as today's svgOfFigure turns it, the SVG's y down; the run at its place along it, its raise across it)
        const turn = it.dir
          ? `translate(${X(x0)} ${Y(y)}) rotate(${n2((-Math.atan2(it.dir[1], it.dir[0]) * 180) / Math.PI)})`
          : ''
        const span = document.createElementNS(SVG, 'tspan')
        span.setAttribute('class', faces.classOf(it.face))
        if (turn) {
          span.setAttribute('x', it.dx?.length ? it.dx.map((d) => n2(it.x + d - x0)).join(' ') : String(n2(it.x - x0)))
          span.setAttribute('y', String(n2(-(it.rise ?? 0))))
        } else {
          span.setAttribute('x', it.dx?.length ? it.dx.map((d) => X(it.x + d)).join(' ') : String(X(it.x)))
          // (a superscript's raise over the line's baseline: the typesetter's Item.rise)
          span.setAttribute('y', String(Y(y + (it.rise ?? 0))))
        }
        span.setAttribute('font-size', String(n2(it.size)))
        if (it.fill !== undefined) span.setAttribute('fill', `#${it.fill.toString(16).padStart(6, '0')}`)
        span.textContent = it.s
        if (it.skew) {
          const t = document.createElementNS(SVG, 'text')
          const at = turn ? n2(it.x - x0) : 0
          t.setAttribute(
            'transform',
            turn
              ? `${turn} translate(${at} 0) skewX(${-OBLIQUE_DEG}) translate(${-at} 0)`
              : `translate(${X(it.x)} ${Y(y)}) skewX(${-OBLIQUE_DEG}) translate(${-X(it.x)} ${-Y(y)})`,
          )
          t.append(span)
          g.append(t)
          text = null
          continue
        }
        if (!text || frame !== turn) {
          text = document.createElementNS(SVG, 'text')
          if (turn) text.setAttribute('transform', turn)
          frame = turn
          g.append(text)
        }
        text.append(span)
      }
    }
    svg.append(g)
  }
  return svg
}

/** each crop of the page: its source ink and where it is drawn, both in PDF units [x0, y0, x1, y1] */
export function cropsOf(
  page: Page,
): { src: [number, number, number, number]; at: [number, number, number, number]; piece: string; ord: number }[] {
  const out: ReturnType<typeof cropsOf> = []
  for (const m of page.members) {
    if (m.state !== 'laid') continue
    for (const [y, , , items] of m.lines)
      for (const it of items) {
        if (!isCrop(it)) continue
        const [, x0, y0, x1, y1, base] = it.src
        const p = CLIP_PAD
        // (an edge cut between two glyphs of its element, a URL broken: no margin, the next glyph's ink a fraction of a point off)
        const pl = (it.cut ?? 0) & 1 ? 0 : p,
          pr = (it.cut ?? 0) & 2 ? 0 : p
        out.push({
          src: [x0 - pl, y0 - p, x1 + pr, y1 + p],
          at: [it.x - pl * it.k, y - (base - y0 + p) * it.k, it.x + (x1 - x0 + pr) * it.k, y + (y1 - base + p) * it.k],
          piece: it.piece,
          ord: m.ord,
        })
      }
  }
  return out
}

/**
 * The page's crops drawn on a canvas over its frame: the page rendered once in the crop configuration (`crops`: every unit's text
 * group off) at the page view's own resolution, each crop's source cut from it and drawn at its place. Null where the page has
 * none. `scale`: device pixels per CSS px (the page view's output scale). `vp`: the frame drawn in (a turned page's upright
 * viewport, `uprightOf`: the canvas is turned with the page)
 */
export async function cropsFor(
  page: Page,
  pdfPage: PDFPageProxy,
  vp: PageViewport,
  crops: Promise<OptionalContentConfig>,
  scale: { sx: number; sy: number },
  signal?: AbortSignal,
): Promise<HTMLCanvasElement | null> {
  const list = cropsOf(page)
  if (!list.length || signal?.aborted) return null
  const w = Math.max(1, Math.floor(vp.width * scale.sx)),
    h = Math.max(1, Math.floor(vp.height * scale.sy))
  const source = document.createElement('canvas')
  source.width = w
  source.height = h
  const sctx = source.getContext('2d', { alpha: false }) as CanvasRenderingContext2D
  // (a crop render of a page that leaves the view is cancelled before it is drawn: its drawing let go)
  const task = pdfPage.render({
    canvas: source,
    canvasContext: sctx,
    viewport: vp,
    transform: scale.sx !== 1 || scale.sy !== 1 ? [scale.sx, 0, 0, scale.sy, 0, 0] : undefined,
    optionalContentConfigPromise: crops,
    annotationMode: 0,
  } as Parameters<PDFPageProxy['render']>[0])
  const stop = () => task.cancel()
  signal?.addEventListener('abort', stop, { once: true })
  try {
    await task.promise
  } catch (e) {
    source.width = 0
    source.height = 0
    if (signal?.aborted) return null
    throw e
  } finally {
    signal?.removeEventListener('abort', stop)
  }
  const out = document.createElement('canvas')
  out.className = 'axt-crops'
  out.width = w
  out.height = h
  out.setAttribute('aria-hidden', 'true')
  const ctx = out.getContext('2d') as CanvasRenderingContext2D
  const dev = ([x0, y0, x1, y1]: [number, number, number, number]) => {
    const [ax, ay] = vp.convertToViewportPoint(x0, y1) as [number, number],
      [bx, by] = vp.convertToViewportPoint(x1, y0) as [number, number]
    return [
      Math.min(ax, bx) * scale.sx,
      Math.min(ay, by) * scale.sy,
      Math.abs(bx - ax) * scale.sx,
      Math.abs(by - ay) * scale.sy,
    ] as const
  }
  for (const c of list) {
    const [sx, sy, sw, sh] = dev(c.src),
      [dx, dy, dw, dh] = dev(c.at)
    if (sw <= 0 || sh <= 0) continue
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
  }
  source.width = 0
  source.height = 0
  return out
}

/** the laid members of a page (state 'laid'), the ones the overlay draws */
export const laidOf = (page: Page): Laid[] => page.members.filter((m) => m.state === 'laid')
