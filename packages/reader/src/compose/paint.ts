// A laid page painted over its page view (design §4.5 "Painting"): the SVG painter, today's look (layer2.mjs svgOfUnit: a
// <text> a line at its baseline, a <tspan> a run of one face at its own place, an oblique run skewed about its baseline, a line
// set turned turned about its origin as svgOfFigure turns a figure's text), drawn
// from `Page` alone; and the crops, each element's (or label's) own ink cut from the crop render of the page it stands on and
// drawn where its item stands, darkened into the page so that paint order cannot change a pixel (design-a §1.4). A crop is cut
// as the typesetter states it: its source, its ink with the antialiased margin round it (typeset's cropOfBox), drawn through
// its clip where another piece's ink stands in it (typeset's lay/clips.ts), since the crop render shows every element and label
// of the page and a source cut whole carries their ink (2610.21312v1-zh p5 t58: line 2's glyph tops left as dots). A member laid
// across a page break may carry an element of one page onto a line of the other (its Ink's page): that crop is cut from its own
// page's render, as today's were (triage-1 B, 2608.16117v1-de t11's p3 element on p4's line).
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

/** each crop of the page: the page its ink is cut from (its Ink's), its source and where it is drawn, both in PDF units
 *  [x0, y0, x1, y1], and where it states one, its clip where it is drawn (its source's rectangles moved and scaled as its source
 *  is). Its source is the typesetter's whole: its ink and the antialiased margin round it, none at an edge cut between two of
 *  its element's glyphs (a URL broken) */
export function cropsOf(page: Page): {
  from: number
  src: [number, number, number, number]
  at: [number, number, number, number]
  clip?: [number, number, number, number][]
  piece: string
  ord: number
}[] {
  const out: ReturnType<typeof cropsOf> = []
  for (const m of page.members) {
    if (m.state !== 'laid') continue
    for (const [y, , , items] of m.lines)
      for (const it of items) {
        if (!isCrop(it)) continue
        const [from, x0, y0, x1, y1, base] = it.src
        const k = it.k
        const to = ([a, b, c, d]: readonly number[]): [number, number, number, number] => [
          it.x + ((a as number) - x0) * k,
          y + ((b as number) - base) * k,
          it.x + ((c as number) - x0) * k,
          y + ((d as number) - base) * k,
        ]
        out.push({
          from,
          src: [x0, y0, x1, y1],
          at: to([x0, y0, x1, y1]),
          ...(it.clip?.length ? { clip: it.clip.map(to) } : {}),
          piece: it.piece,
          ord: m.ord,
        })
      }
  }
  return out
}

/** a page view's box rounding, CSS px (PDF.js's --scale-round-x and -y on its page box: the denominator of its output scale's
 *  fraction, 1 at an integral pixel ratio) */
export type Rounding = { x: number; y: number }

/**
 * The crops' canvas on the page view's own pixel grid: the page view's viewport (its turn and all) floored to its rounding, as
 * PDF.js floors a page view's box (setLayerDimensions' `round(down, …, var(--scale-round-x))`), its pixels that box at the
 * output scale, as the page view's canvas's are (PDFPageView's floorToDivide). Shown in that box (`.axt-crops`, the same
 * `round(down, …)` of the frame) it maps pixel for pixel onto the device from the page's top-left corner, as the page view's
 * canvas does. A canvas shown in the frame itself, a fraction of a CSS px wider, is resampled by the compositor to the whole px
 * it snaps the box to (1587 device px shown in 1588 at a ratio of 2: the crops 0.063 % large against the page under them, a
 * device px at its right); one drawn upright and turned about its own box stands the frame's fraction of a px off the page
 * view, which is cut at its box from its own top-left corner
 */
export function cropGrid(
  vp: Pick<PageViewport, 'width' | 'height'>,
  scale: { sx: number; sy: number },
  round: Rounding = { x: 1, y: 1 },
): { css: [number, number]; px: [number, number] } {
  const css: [number, number] = [vp.width - (vp.width % round.x), vp.height - (vp.height % round.y)]
  return { css, px: [Math.max(1, Math.round(css[0] * scale.sx)), Math.max(1, Math.round(css[1] * scale.sy))] }
}

/** a page rendered in the crop configuration at the page view's resolution, on a canvas of its own `px` (its grid, cropGrid);
 *  null where the render was let go (a page that leaves the view) */
async function cropRender(
  pdfPage: PDFPageProxy,
  vp: PageViewport,
  crops: Promise<OptionalContentConfig>,
  scale: { sx: number; sy: number },
  px: [number, number],
  signal?: AbortSignal,
): Promise<HTMLCanvasElement | null> {
  const source = document.createElement('canvas')
  source.width = px[0]
  source.height = px[1]
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
  return source
}

/**
 * The page's crops drawn on a canvas over its page view: each page a crop is cut from rendered once in the crop configuration
 * (`crops`: every unit's text group off) at the page view's own resolution (this page, and another page of a member laid
 * across a page break), each crop's source cut from its own page's render and drawn at its place, on the page view's pixel grid
 * (`cropGrid`, `round` the page view's rounding). Null where the page has none. `pageOf`: the document's page n. `scale`:
 * device pixels per CSS px (the page view's output scale). `vp`: the page view's own viewport, a turned page's turned: the
 * crops are ink of the page's own, drawn where the page view draws that ink, so they are made in its frame and never turned by
 * CSS (the SVG's text is made upright and turned: B-408); another page's is its own viewport at the same scale and turn, so
 * that its ink stands in this page's frame as this page's own does
 */
export async function cropsFor(
  page: Page,
  pageOf: (n: number) => Promise<PDFPageProxy>,
  vp: PageViewport,
  crops: Promise<OptionalContentConfig>,
  scale: { sx: number; sy: number },
  signal?: AbortSignal,
  round: Rounding = { x: 1, y: 1 },
): Promise<HTMLCanvasElement | null> {
  const list = cropsOf(page)
  if (!list.length || signal?.aborted) return null
  const [w, h] = cropGrid(vp, scale, round).px
  const out = document.createElement('canvas')
  out.className = 'axt-crops'
  out.width = w
  out.height = h
  // (its box the page view's: the frame, across where the page is turned a quarter, floored to the page view's rounding)
  const quarter = turnOf(vp) % 180 !== 0
  out.style.setProperty(
    '--axt-crops-w',
    `round(down, var(${quarter ? '--axt-frame-h' : '--axt-frame-w'}, 100%), ${round.x}px)`,
  )
  out.style.setProperty(
    '--axt-crops-h',
    `round(down, var(${quarter ? '--axt-frame-w' : '--axt-frame-h'}, 100%), ${round.y}px)`,
  )
  out.setAttribute('aria-hidden', 'true')
  const ctx = out.getContext('2d') as CanvasRenderingContext2D
  const devOf =
    (v: PageViewport) =>
    ([x0, y0, x1, y1]: [number, number, number, number]) => {
      const [ax, ay] = v.convertToViewportPoint(x0, y1) as [number, number],
        [bx, by] = v.convertToViewportPoint(x1, y0) as [number, number]
      return [
        Math.min(ax, bx) * scale.sx,
        Math.min(ay, by) * scale.sy,
        Math.abs(bx - ax) * scale.sx,
        Math.abs(by - ay) * scale.sy,
      ] as const
    }
  const at = devOf(vp)
  for (const from of new Set(list.map((c) => c.from))) {
    const pdfPage = await pageOf(from)
    const v = from === page.page ? vp : pdfPage.getViewport({ scale: vp.scale, rotation: turnOf(vp) })
    const px = from === page.page ? ([w, h] as [number, number]) : cropGrid(v, scale, round).px
    const source = signal?.aborted ? null : await cropRender(pdfPage, v, crops, scale, px, signal)
    if (!source) {
      out.width = 0
      out.height = 0
      return null
    }
    const src = devOf(v)
    for (const c of list) {
      if (c.from !== from) continue
      const [sx, sy, sw, sh] = src(c.src),
        [dx, dy, dw, dh] = at(c.at)
      if (sw <= 0 || sh <= 0) continue
      // (through its clip where it states one: another piece's ink in its source left behind)
      if (c.clip) {
        ctx.save()
        ctx.beginPath()
        for (const r of c.clip) ctx.rect(...at(r))
        ctx.clip()
      }
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
      if (c.clip) ctx.restore()
    }
    source.width = 0
    source.height = 0
  }
  return out
}

/** the laid members of a page (state 'laid'), the ones the overlay draws */
export const laidOf = (page: Page): Laid[] => page.members.filter((m) => m.state === 'laid')
