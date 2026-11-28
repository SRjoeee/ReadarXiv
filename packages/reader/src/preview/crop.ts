// A crop: a figure, a table, a display, a section's head and first lines, a note, cut from that pane's own page (link previews'
// §3.2, §4.3; L12). Its region (PDF units on A) is the head's target box, and on a laid right page that box widened by the
// drawn extent of every member laid there whose lines on A stand inside it (a float's translated caption, its figure texts, a
// note: what the translation draws, never only the original's box). The left's crop is arXiv's drawing (the left's own canvas
// where it is drawn, else a fresh drawing of the region); the right's is what that pane draws: a laid page's drawing (the
// composer's `lay`, then its `region`, which reads the page's drawing wherever it stands: in view, parked off the view, or drawn
// for the read where it is not, and draws the box anew at a scale past that drawing's pixels), else what it shows for a page not
// laid, arXiv's drawing, never waiting for a translation. A section's window runs on to the next page and fades at its foot (the one
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

/** a member's lines on a page, each its ink across and its baseline (Line: x0, x1, baseline): where a line stands. Its fonts'
 *  box is no measure of it here: the head states a float's box by its ink, and a caption's last line with no descender has its
 *  baseline on the box's foot and its fonts' box past it (the lead's look at a caption whose translation lost its descenders) */
const linesOn = (m: Placed, page: number): Box[] =>
  m.lines.filter((l) => l[0] === page).map((l) => [l[2], l[4], l[3], l[4]] as Box)
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
    lay(n: number, signal: AbortSignal): Promise<Page | null>
    region(n: number, box: Box, scale: number, signal: AbortSignal): Promise<HTMLElement | null>
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
  const laid = c ? await c.lay(page, signal).catch(() => null) : null
  if (signal.aborted) return null
  // (a laid page: its drawing, wherever it stands; a page not laid: what the pane shows for it, arXiv's drawing)
  if (laid && c) return c.region(page, box, scale, signal).catch(() => null)
  return d.original(page, box, scale, signal)
}

/** a crop's content for a target on a pane: kept by a click or Enter where it is a preview, a plain cut in the sheet */
export async function cropContent(
  t: Target,
  o: { side: Side; max: { width: number; height: number }; sheet: boolean; signal: AbortSignal },
  d: CropDeps,
): Promise<PreviewContent | null> {
  const n = t[2]
  // (the right's region read once the page is laid where it can be: the extents are its lay's)
  const laid =
    o.side === 'right'
      ? ((await d
          .composer()
          ?.lay(n, o.signal)
          .catch(() => null)) ?? null)
      : null
  if (o.signal.aborted) return null
  const part = laid ? await d.part(n).catch(() => null) : null
  const r = regionOf(t, o.side, laid, part)
  const segs: [number, Box][] = [[r.page, r.box], ...(r.next ? [r.next] : [])]
  const w = Math.max(...segs.map(([, b]) => b[2] - b[0])),
    h = segs.reduce((a, [, b]) => a + (b[3] - b[1]), 0)
  if (!(w > 0 && h > 0)) return null
  const k = PDF_TO_CSS
  const own = d.scale() * (o.sheet ? SHEET_SCALE : 1)
  const fit = Math.min(own, o.max.width / (w * k), o.max.height / (h * k))
  if (!(fit > 0)) return null
  // (one CSS px of the page round each segment at the crop's scale: its drawing's antialiased edge, where a line's last pixel
  // falls (a descender drawn to the band's foot), as a page's own crops keep theirs (paint.ts); the scale made to hold it)
  const edge = 1 / (k * fit)
  const scale = Math.min(own, o.max.width / ((w + 2 * edge) * k), o.max.height / ((h + 2 * edge * segs.length) * k))
  const pad = 1 / (k * scale)
  for (const sg of segs) sg[1] = [sg[1][0] - pad, sg[1][1] - pad, sg[1][2] + pad, sg[1][3] + pad]
  const label = d.label(t)
  /** the crop at scale `at` from the same segments: null where any of it cannot be drawn */
  const drawAt = async (at: number, signal: AbortSignal): Promise<HTMLElement | null> => {
    const drawn = await Promise.all(segs.map(([p, b]) => segmentOf(o.side, p, b, at, signal, d)))
    if (signal.aborted || drawn.some((x) => !x)) return null
    const crop = document.createElement('div')
    crop.className = 'axt-pv-crop'
    crop.setAttribute('role', 'img')
    crop.setAttribute('aria-label', label)
    if (r.fade) crop.dataset.axtFade = ''
    drawn.forEach((el, i) => {
      const [, b] = segs[i]!
      const seg = el as HTMLElement
      seg.classList.add('axt-pv-seg')
      seg.style.width = `${Math.ceil((b[2] - b[0]) * k * at)}px`
      seg.style.height = `${Math.ceil((b[3] - b[1]) * k * at)}px`
      crop.append(seg)
    })
    return crop
  }
  const crop = await drawAt(scale, o.signal)
  if (!crop) return null
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
  // (kept, it zooms by itself (preview/keep.ts): its image's size at a scale, its segments rounded up as drawAt rounds them)
  const across = Math.max(...segs.map(([, b]) => b[2] - b[0])) * k,
    down = segs.map(([, b]) => (b[3] - b[1]) * k)
  return {
    el: keep,
    kind: 'crop',
    label,
    described: crop,
    zoom: {
      scale,
      extent: { width: across, height: down.reduce((a, x) => a + x, 0) },
      segs: segs.length,
      size: (at) => ({
        width: Math.ceil(across * at),
        height: down.reduce((a, x) => a + Math.ceil(x * at), 0),
      }),
      draw: drawAt,
    },
  }
}
