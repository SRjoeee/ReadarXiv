// A crop: a figure, a table, a display, a section's head and first lines, a note, cut from that pane's own page (link previews'
// §3.2, §4.3; L12). Its region (PDF units on A) is the head's target box, and on a laid right page that box widened by the
// drawn extent of every member laid there whose lines on A stand inside it (a float's translated caption, its figure texts, a
// note: what the translation draws, never only the original's box). The left's crop is arXiv's drawing (the left's own canvas
// where it is drawn, else a fresh drawing of the region); the right's is what that pane draws: a laid page's drawing (laid and
// drawn off the view first where it is far: the composer's `warm`, then its `region`), else what it shows for a page not laid,
// arXiv's drawing, never waiting for a translation. A section's window runs on to the next page and fades at its foot (the one
// fade); a figure, a table or a display never fades. Drawn at the page's own scale, widened past the card up to the pane less
// its margins, smaller where it would not fit; on the page's own paper (it is a cut of the page), dimmed as the page is. Null
// where it cannot be drawn: no preview, the jump stays (never a doubtful one).
import type { Part, Placed, Target } from '@readarxiv/format'
import type { Box, Page } from '../compose/page.ts'
import type { Side } from '../panes/panes.ts'
import { PDF_TO_CSS } from '../stack/stack.ts'
import type { PreviewContent, PreviewWords } from './previews.ts'

/** the sheet's crop: up to this much of the page's own scale, at most this share of the window's height [approved, P5
 *  app.js:915] */
export const SHEET_SCALE = 1.7
export const SHEET_CROP_H = 0.52
/** how far past a target's box a member's line on A may stand and still be inside it, PDF units: the format's grid */
const GRID = 0.01

export interface Region {
  page: number
  box: Box
  next?: [number, Box]
  fade: boolean
}

/** a member's lines on a page, each its ink across and its fonts' box up and down (Line: x0, x1, baseline, top, bottom) */
const linesOn = (m: Placed, page: number): Box[] =>
  m.lines.filter((l) => l[0] === page).map((l) => [l[2], l[6], l[3], l[5]] as Box)
const inside = (a: Box, b: Box) =>
  a[0] >= b[0] - GRID && a[1] >= b[1] - GRID && a[2] <= b[2] + GRID && a[3] <= b[3] + GRID
const union = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
]

/**
 * A target's region on a pane: its box on A (and the next page's for a heading that runs on), widened on a laid right page by
 * the extent of each member laid there whose every line on A on that page stands inside the box (`laid`: page t's committed
 * Page on the right; `part`: page t's part)
 */
export function regionOf(t: Target, side: Side, laid: Page | null, part: Part | null): Region {
  const [, kind, page, , box] = t
  let b: Box = [...box] as Box
  if (side === 'right' && laid && part) {
    const placed = new Map<number, Placed>()
    for (const flow of part.flows) for (const m of flow) placed.set(m.ord, m)
    for (const m of laid.members) {
      if (m.state !== 'laid' || !m.extent) continue
      const p = placed.get(m.ord)
      const lines = p ? linesOn(p, page) : []
      if (lines.length && lines.every((l) => inside(l, box))) b = union(b, m.extent)
    }
  }
  return {
    page,
    box: b,
    ...(t.length === 7 ? { next: [t[5], [...t[6]] as Box] as [number, Box] } : {}),
    fade: kind === 'heading',
  }
}

/** what a crop reads of the reader */
export interface CropDeps {
  /** the panes' scale now (the zoom: CSS px a CSS px of the page at scale 1) */
  scale(): number
  composer(): {
    laid(n: number): Page | null
    warm(n: number, signal: AbortSignal): Promise<boolean>
    region(n: number, box: Box, scale: number): HTMLElement | null
  } | null
  part(n: number): Promise<Part | null>
  /** arXiv's drawing of a region of page n at a scale (the left's own canvas, else a fresh drawing); null where none can be had */
  original(n: number, box: Box, scale: number, signal: AbortSignal): Promise<HTMLElement | null>
  words(): PreviewWords
  /** the target's label (S-R-33), its crop's name */
  label(t: Target): string
}

/** one segment of a crop on a pane at a scale, or null */
async function segmentOf(
  side: Side,
  page: number,
  box: Box,
  scale: number,
  signal: AbortSignal,
  d: CropDeps,
): Promise<HTMLElement | null> {
  if (side === 'left') return d.original(page, box, scale, signal)
  const c = d.composer()
  const ok = c ? await c.warm(page, signal).catch(() => false) : false
  if (signal.aborted) return null
  if (ok) return c?.region(page, box, scale) ?? null
  // (a laid page that cannot be drawn now: no preview; a page not laid: what the pane shows for it, arXiv's drawing)
  return c?.laid(page) ? null : d.original(page, box, scale, signal)
}

/** a crop's content for a target on a pane: kept by a click or Enter where it is a preview, a plain cut in the sheet */
export async function cropContent(
  t: Target,
  o: { side: Side; max: { width: number; height: number }; sheet: boolean; signal: AbortSignal },
  d: CropDeps,
): Promise<PreviewContent | null> {
  const n = t[2]
  // (the right's region read once the page is laid where it can be: the extents are its lay's)
  if (o.side === 'right')
    await d
      .composer()
      ?.warm(n, o.signal)
      .catch(() => false)
  if (o.signal.aborted) return null
  const laid = o.side === 'right' ? (d.composer()?.laid(n) ?? null) : null
  const part = laid ? await d.part(n).catch(() => null) : null
  const r = regionOf(t, o.side, laid, part)
  const segs: [number, Box][] = [[r.page, r.box], ...(r.next ? [r.next] : [])]
  const w = Math.max(...segs.map(([, b]) => b[2] - b[0])),
    h = segs.reduce((a, [, b]) => a + (b[3] - b[1]), 0)
  if (!(w > 0 && h > 0)) return null
  const k = PDF_TO_CSS
  const own = d.scale() * (o.sheet ? SHEET_SCALE : 1)
  const scale = Math.min(own, o.max.width / (w * k), o.max.height / (h * k))
  if (!(scale > 0)) return null
  const drawn = await Promise.all(segs.map(([p, b]) => segmentOf(o.side, p, b, scale, o.signal, d)))
  if (o.signal.aborted || drawn.some((x) => !x)) return null
  const label = d.label(t)
  const crop = document.createElement('div')
  crop.className = 'axt-pv-crop'
  crop.setAttribute('role', 'img')
  crop.setAttribute('aria-label', label)
  if (r.fade) crop.dataset.axtFade = ''
  drawn.forEach((el, i) => {
    const [, b] = segs[i]!
    const seg = el as HTMLElement
    seg.classList.add('axt-pv-seg')
    seg.style.width = `${Math.round((b[2] - b[0]) * k * scale)}px`
    seg.style.height = `${Math.round((b[3] - b[1]) * k * scale)}px`
    crop.append(seg)
  })
  if (o.sheet) {
    const paper = document.createElement('div')
    paper.className = 'axt-pv-paper'
    paper.append(crop)
    return { el: paper, kind: 'crop', label, described: crop }
  }
  const keep = document.createElement('button')
  keep.type = 'button'
  keep.className = 'axt-pv-keep'
  keep.setAttribute('aria-label', d.words().keep(label))
  keep.append(crop)
  return { el: keep, kind: 'crop', label, described: crop }
}
