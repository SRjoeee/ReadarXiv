// A laid page painted over its page view (design §4.5 "Painting"): the SVG painter, today's look (layer2.mjs svgOfUnit: a
// <text> a line at its baseline, a <tspan> a run of one face at its own place, an oblique run skewed about its baseline, a line
// set turned turned about its origin as svgOfFigure turns a figure's text), drawn
// from `Page` alone; and the crops, each element's (or label's) own ink cut from the crop render of the page it stands on and
// drawn where its item stands, darkened into the page so that paint order cannot change a pixel (design-a §1.4). A crop is cut
// by its own ink as TeX set it (its item's `ink`, the part's boxes) and its antialiased edge, a device pixel of the render it is
// cut from round it, clear of every other piece's ink and its edge (the Page's `inks`): the crop render shows every element
// and label of the page, so a source cut whole carries their ink (2610.21312v1-zh p5 t58: line 2's glyph tops left as dots),
// and a margin fixed in points is no antialiased edge at every zoom (a 1x screen's at 100 %: a device pixel 0.75 pt). A member laid
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
/** a run's size and tracking to 1e-4: each multiplies along its run (a size rounded to 0.01 drew a word of 40 points 0.02 points
 *  off the layout's), where a place rounded to 0.01 is that far off once */
const n4 = (v: number) => Math.round(v * 1e4) / 1e4
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

/** the share of its size a run's face is drawn at: the face string's own size at 100 px (FaceId: a face's size correction,
 *  Source Han Serif K's 95.9px; served.ts parseFont), 1 for a face of a host's table, which names none */
export const faceScale = (id: string): number => {
  const px = /(?:^|\s)([\d.]+)px\s/.exec(id)?.[1]
  const v = px === undefined ? Number.NaN : Number(px) / 100
  return Number.isFinite(v) && v > 0 ? v : 1
}

/** the page's laid members' lines as one SVG, in the page's own units (viewBox): drawn, never read (out of selection and of the
 *  accessibility tree: the text layer holds the words). In the target's language (`lang`, its tag), whatever the page's
 *  interface is: a browser picks a face's glyphs and its fallbacks by it (docs/PDF-READER.md §18.48). Each run as the layout
 *  measured it: its face at its size with its size correction (faceScale), its tracking after each character */
export function svgOf(page: Page, vp: PageViewport, faces: Faces, lang = ''): SVGSVGElement {
  const [vx0, vy0, vx1, vy1] = frameOf(vp)
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', `0 0 ${n2(vx1 - vx0)} ${n2(vy1 - vy0)}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('aria-hidden', 'true')
  if (lang) svg.setAttribute('lang', lang)
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
        span.setAttribute('font-size', String(n4(it.size * faceScale(it.face))))
        if (it.track) span.setAttribute('letter-spacing', String(n4(it.track)))
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

type Rect = [number, number, number, number]
const meet = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a[0], b[0]),
    y0 = Math.max(a[1], b[1]),
    x1 = Math.min(a[2], b[2]),
    y1 = Math.min(a[3], b[3])
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null
}
const inside = (a: Rect, b: Rect) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3]
/** rectangle `r` less rectangle `n`: what of `r` stands left, right, under and over `n`, each a rectangle of its own */
function less(r: Rect, n: Rect): Rect[] {
  const m = meet(r, n)
  if (!m) return [r]
  const out: Rect[] = []
  if (m[0] > r[0]) out.push([r[0], r[1], m[0], r[3]])
  if (m[2] < r[2]) out.push([m[2], r[1], r[2], r[3]])
  if (m[1] > r[1]) out.push([m[0], r[1], m[2], m[1]])
  if (m[3] < r[3]) out.push([m[0], m[3], m[2], r[3]])
  return out
}

/**
 * Each crop of the page: the page its ink is cut from (its Ink's), its source and where it is drawn, both in PDF units
 * [x0, y0, x1, y1], and its clip where it is drawn, where it has one (its source's rectangles moved and scaled as its source
 * is). `px`: a device pixel of the render it is cut from, PDF units across and up. A crop of its own ink stated (its item's
 * `ink`: the box it was cut from) is its ink's boxes whole and the device pixel round them, its antialiased edge, less every
 * other piece's ink with its own (the Page's `inks`, a box holding its own aside: its piece's whole): what TeX set for it and
 * nothing of its neighbours', at any zoom; its edge cut between two of its element's glyphs (a URL broken) takes none, its
 * element's ink going on past it. One of no ink stated is the typesetter's source whole (its ink and the margin cropOfBox
 * gives it)
 */
export function cropsOf(
  page: Page,
  px: { x: number; y: number },
): {
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
        const own = it.ink?.length ? it.ink : null
        if (!own) {
          out.push({ from, src: [x0, y0, x1, y1], at: to([x0, y0, x1, y1]), piece: it.piece, ord: m.ord })
          continue
        }
        // (its own ink, an edge cut between two glyphs cut there; and with the device pixel round it, none past a cut)
        const cl = (it.cut ?? 0) & 1,
          cr = (it.cut ?? 0) & 2
        const mine = own.flatMap((b): Rect[] => {
          const r: Rect = [cl ? Math.max(b[0], x0) : b[0], b[1], cr ? Math.min(b[2], x1) : b[2], b[3]]
          return r[2] > r[0] && r[3] > r[1] ? [r] : []
        })
        if (!mine.length) {
          out.push({ from, src: [x0, y0, x1, y1], at: to([x0, y0, x1, y1]), piece: it.piece, ord: m.ord })
          continue
        }
        const ring = mine.map(
          (b): Rect => [
            cl ? Math.max(b[0] - px.x, x0) : b[0] - px.x,
            b[1] - px.y,
            cr ? Math.min(b[2] + px.x, x1) : b[2] + px.x,
            b[3] + px.y,
          ],
        )
        // (every other piece's ink on its page with its own edge, where it meets the ring outside its own ink; a box that holds
        // its own is its piece's whole, of which the part states apart what it leaves behind: its brackets, its label's name)
        const holds = (k: readonly number[]) =>
          own.some((o) => k[1]! <= o[0] && k[2]! <= o[1] && k[3]! >= o[2] && k[4]! >= o[3])
        const hits = (page.inks ?? [])
          .filter((k) => k[0] === from && !holds(k))
          .map((k): Rect => [k[1] - px.x, k[2] - px.y, k[3] + px.x, k[4] + px.y])
          .filter((n) =>
            ring.some((r) => {
              const q = meet(r, n)
              return !!q && !mine.some((o) => inside(q, o))
            }),
          )
        const src: Rect = [
          Math.min(...ring.map((r) => r[0])),
          Math.min(...ring.map((r) => r[1])),
          Math.max(...ring.map((r) => r[2])),
          Math.max(...ring.map((r) => r[3])),
        ]
        let clip: Rect[] | undefined
        if (hits.length || ring.length > 1) {
          let clear = ring
          for (const n of hits) clear = clear.flatMap((r) => less(r, n))
          clip = [...mine, ...clear.filter((r) => !mine.some((o) => inside(r, o)))]
        }
        out.push({
          from,
          src,
          at: to(src),
          ...(clip ? { clip: clip.map(to) } : {}),
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
  // (a device pixel of the crop render, PDF units across and up: the page view's scale at its output scale, a quarter turn's
  // across its height)
  const quarter = turnOf(vp) % 180 !== 0
  const px = {
    x: 1 / (vp.scale * (quarter ? scale.sy : scale.sx)),
    y: 1 / (vp.scale * (quarter ? scale.sx : scale.sy)),
  }
  const list = cropsOf(page, px)
  if (!list.length || signal?.aborted) return null
  const [w, h] = cropGrid(vp, scale, round).px
  const out = document.createElement('canvas')
  out.className = 'axt-crops'
  out.width = w
  out.height = h
  // (its box the page view's: the frame, across where the page is turned a quarter, floored to the page view's rounding)
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
  // (each crop darkened in, as the canvas is into the page: one drawn after another, their margins overlapping where two lines
  // are drawn nearer than their sources stand, never covers the other's ink with its paper)
  ctx.globalCompositeOperation = 'darken'
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
