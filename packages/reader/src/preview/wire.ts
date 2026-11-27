// The previews made over a reader (link previews, phase 1): what the preview layer reads, from what the reader holds. A chunk of
// its own, imported once the composer is made (never on the first paint's path). Nothing new is fetched from anywhere but our
// own storage: a target's page part, which the reader fetches anyway on reaching that page, asked at the pointer's first entry
// on a link to it (the lead's ruling, item 10: the dwell is its head start; a reader who never hovers costs nothing), and kept
// for the session as every part is.
//
// - Targets: the head's (preview/targets.ts), read anew with each head.
// - A link's bracket: on the left and on a right page not laid, by its box in its page's part (Link.owner: one owner's one
//   element, the numbers of one \cite); on a laid right page, Page.links' owner and piece; the line its box stands on, for a
//   superscript's foot.
// - A citation's card: the reference's own text (preview/reference-text.ts) of the member the target names.
// - A crop: preview/crop.ts over the composer's warm and region, and arXiv's drawing of a region: the left's own canvas where it
//   is drawn at the crop's scale or finer, else a fresh drawing of the region by PDF.js on the original's document.
// - Labels (S-R-33): the accessible names of a crop and of its kept panel and sheet, from the member's label as A prints it.
import { type Head, headNumberOf, type Part, type Placed, type Target, type Unit } from '@readarxiv/format'
import { R } from '@readarxiv/ui'
import type { Composer } from '../compose/composer.ts'
import type { Box } from '../compose/page.ts'
import type { Panes, Side } from '../panes/panes.ts'
import type { Clock } from '../stack/clock.ts'
import { PDF_TO_CSS } from '../stack/stack.ts'
import { cardOf, SEARCH_URL } from './card.ts'
import { cropContent } from './crop.ts'
import { createKeep } from './keep.ts'
import { CARD_W, CROP_PAD, EDGE_PX } from './place.ts'
import { type Bracket, createPreviews, type PreviewContent, type PreviewLink, type Previews } from './previews.ts'
import { memberOf, queryOf, referenceText } from './reference-text.ts'
import { createSheet } from './sheet.ts'
import { targetsOf } from './targets.ts'
import { previewWords } from './words.ts'

/** a crop's preview at most this tall, px (the prototype's bound: a figure taller than this shows smaller) */
const CROP_MAX_H = 640

export interface WireOptions {
  root: HTMLElement
  panes: Panes
  clock: Clock
  composer(): Composer | null
  head(): Head | null
  part(n: number): Promise<Part | null>
  units(): readonly Unit[] | null
  jump(o: {
    side: Side
    dest: string | unknown[]
    keyboard: boolean
    origin: { side: Side; page: number; box: [number, number, number, number] } | null
  }): void
  open(url: string): void
}

/** a destination's key (JSON of PDF.js's dest) read back to what the reader's one jump is given: a name, or an explicit array */
const destValue = (key: string): string | unknown[] => {
  try {
    const d = JSON.parse(key)
    if (typeof d === 'string' || Array.isArray(d)) return d
  } catch {
    /* as written */
  }
  return key
}
const overlap = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

/** a member's label as A prints it, a target's name (S-R-33); `fallback` where it states none */
export function labelOf(t: Target, m: Placed | null, unit: Unit | null, fallback: string): string {
  const num = m?.label?.num?.[0]?.replace(/^[[(]|[\])]$/g, '').trim()
  const P = R.preview
  switch (t[1]) {
    case 'float': {
      const type = m?.label?.float
      if (num && type === 'figure') return P.figure(num)
      if (num && type === 'table') return P.table(num)
      const own = [m?.label?.name?.[0], m?.label?.num?.[0]].filter(Boolean).join(' ').trim()
      return own || fallback
    }
    case 'heading': {
      const n = headNumberOf(m?.label)
      if (n) return P.section(n)
      const title = unit ? plainText(unit).slice(0, 40) : ''
      return title || fallback
    }
    case 'footnote':
      return num ? P.note(num) : fallback
    case 'reference':
      return num ? P.reference(num) : fallback
    default:
      return /^\(?[\w.-]+\)?$/.test(fallback) ? P.equation(fallback.replace(/^\(|\)$/g, '')) : fallback
  }
}
/** a unit's text pieces, white space collapsed (a heading's title for its name) */
function plainText(u: Unit): string {
  const walk = (ps: Unit['content']): string =>
    ps.map((p) => (p.t === 'text' ? p.s : p.t === 'span' ? walk(p.content) : '')).join('')
  return walk(u.content).replace(/\s+/g, ' ').trim()
}

export function wirePreviews(o: WireOptions): Previews {
  const { panes } = o
  let held: { head: Head | null; map: ReadonlyMap<string, Target> } = { head: null, map: new Map() }
  const targets = () => {
    const h = o.head()
    if (held.head !== h) held = { head: h, map: targetsOf(h) }
    return held.map
  }
  let unitMap: { list: readonly Unit[] | null; by: Map<string, Unit> } = { list: null, by: new Map() }
  const unitOf = (id: string): Unit | null => {
    const list = o.units()
    if (unitMap.list !== list) unitMap = { list, by: new Map((list ?? []).map((u) => [u.id, u])) }
    return unitMap.by.get(id) ?? null
  }
  const memberAt = async (t: Target): Promise<{ part: Part | null; m: Placed | null }> => {
    const part = await o.part(t[2]).catch(() => null)
    const m = part?.flows.flat().find((x) => x.ord === t[3]) ?? null
    return { part, m }
  }
  /** the queries of the cards made (the sheet's search, where SEARCH_URL is set) */
  const queries = new Map<string, string>()

  // ---------------------------------------------------------------- a box of a page on the screen
  const screenOf = (side: Side, page: number, b: Box) => {
    const el = panes.pageElement(side, page)
    const r = el ? panes.boxOf(side, page, b) : null
    if (!el || !r) return null
    const p = el.getBoundingClientRect()
    const left = p.left + el.clientLeft + r.left,
      top = p.top + el.clientTop + r.top
    return { left, top, right: left + r.width, bottom: top + r.height }
  }

  // ---------------------------------------------------------------- a link's bracket
  async function bracket(l: PreviewLink): Promise<Bracket> {
    const none: Bracket = { key: null, boxes: [], foot: null }
    const at = l.el.dataset.axtAt
    if (l.side === 'right' && at !== undefined) {
      const page = o.composer()?.laid(l.page) ?? null
      const own = page?.links[Number(at)]
      if (!page || !own) return none
      const [box, , owner, , piece] = own
      const same = piece
        ? page.links.filter((x) => x[2] === owner && x[4] === piece && 'dest' in x[1]).map((x) => x[0])
        : [box]
      // (the laid line its box stands on: its foot under a raised citation, the line's size under its baseline)
      const m = page.members.find((x) => x.ord === owner)
      const line = m?.lines.find(
        ([y, x0, x1]) => x0 <= box[2] && x1 >= box[0] && Math.abs(y - (box[1] + box[3]) / 2) < 12,
      )
      const size = m?.fit?.size ?? 10
      return {
        key: piece ? `r:${l.page}:${owner}:${piece}` : null,
        boxes: same,
        foot: line ? line[0] - 0.25 * size : null,
      }
    }
    // (PDF.js's own anchor: its annotation in its page's part, by the box it is drawn over)
    const part = await o.part(l.page).catch(() => null)
    if (!part?.links?.length) return none
    const here = part.links.filter((x) => (x.page ?? part.page) === l.page && 'dest' in x.to)
    const r = l.el.getBoundingClientRect()
    const a = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    let best: (typeof here)[number] | null = null,
      most = 0
    for (const x of here) {
      const s = screenOf(l.side, l.page, x.box as Box)
      const v = s ? overlap(a, s) : 0
      if (v > most) {
        most = v
        best = x
      }
    }
    if (!best) return none
    const owner = best.owner
    const same =
      owner && owner[1] !== ''
        ? here.filter((x) => x.owner?.[0] === owner[0] && x.owner[1] === owner[1]).map((x) => x.box as Box)
        : [best.box as Box]
    const m = owner ? (part.flows.flat().find((x) => x.ord === owner[0]) ?? null) : null
    const mid = (best.box[1] + best.box[3]) / 2
    const line = m?.lines.find((x) => x[0] === l.page && x[6] <= mid && x[5] >= mid)
    return {
      key: owner && owner[1] !== '' ? `${l.side}:${l.page}:${owner[0]}:${owner[1]}` : null,
      boxes: same,
      foot: line ? line[6] : null,
    }
  }

  // ---------------------------------------------------------------- arXiv's drawing of a region
  async function original(n: number, box: Box, scale: number, signal: AbortSignal): Promise<HTMLElement | null> {
    const frame = panes.frameOf('left', n)
    if (frame?.turn) return null
    const dpr = globalThis.devicePixelRatio || 1
    const w = (box[2] - box[0]) * PDF_TO_CSS * scale,
      h = (box[3] - box[1]) * PDF_TO_CSS * scale
    if (!(w > 0 && h > 0)) return null
    const el = document.createElement('div')
    el.className = 'axt-pv-region'
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(w * dpr))
    out.height = Math.max(1, Math.round(h * dpr))
    el.append(out)
    // (the left's own canvas, where it is drawn at the crop's scale or finer: a copy, no second drawing)
    const div = panes.pageElement('left', n)
    const canvas = div?.querySelector<HTMLCanvasElement>('.canvasWrapper canvas') ?? null
    const r = panes.boxOf('left', n, box)
    if (frame && canvas?.width && div?.getAttribute('data-loaded') === 'true' && r && frame.width > 0) {
      // (its device pixels a PDF unit against the crop's)
      const d = canvas.width / frame.width
      if (d * (frame.width / frame.w) >= scale * PDF_TO_CSS * dpr * 0.999) {
        out
          .getContext('2d')
          ?.drawImage(canvas, r.left * d, r.top * d, r.width * d, r.height * d, 0, 0, out.width, out.height)
        return el
      }
    }
    const doc = panes.doc
    if (!doc) return null
    const page = await doc.getPage(n).catch(() => null)
    if (!page || signal.aborted) return null
    const vp = page.getViewport({ scale: scale * PDF_TO_CSS * dpr })
    const [ax, ay] = vp.convertToViewportPoint(box[0], box[3]) as [number, number],
      [bx, by] = vp.convertToViewportPoint(box[2], box[1]) as [number, number]
    const x0 = Math.min(ax, bx),
      y0 = Math.min(ay, by)
    const ctx = out.getContext('2d', { alpha: false })
    if (!ctx) return null
    const task = page.render({
      canvas: out,
      canvasContext: ctx,
      viewport: vp,
      transform: [1, 0, 0, 1, -x0, -y0],
      annotationMode: 0,
    } as Parameters<typeof page.render>[0])
    const stop = () => task.cancel()
    signal.addEventListener('abort', stop, { once: true })
    try {
      await task.promise
    } catch {
      return null
    } finally {
      signal.removeEventListener('abort', stop)
    }
    return signal.aborted ? null : el
  }

  // ---------------------------------------------------------------- what a preview shows
  async function content(x: {
    link: PreviewLink
    target: Target
    sheet: boolean
    max: { width: number; height: number }
    signal: AbortSignal
  }): Promise<PreviewContent | null> {
    const { target: t } = x
    const fallback = x.link.el.getAttribute('aria-label') ?? ''
    const { part, m } = await memberAt(t)
    if (x.signal.aborted) return null
    const unit = m && typeof m.text === 'string' ? unitOf(m.text) : null
    const label = labelOf(t, m, unit, fallback || R.linkName.internal)
    if (t[1] === 'reference') {
      if (!part || !unit || !memberOf(part, unit.id)) return null
      const ref = referenceText(unit, part)
      if (!ref?.text) return null
      const query = queryOf(ref.text, ref.label)
      queries.set(t[0], query)
      const c = cardOf({
        text: ref.text,
        search: SEARCH_URL ? SEARCH_URL(query) : null,
        words: previewWords(),
        open: o.open,
      })
      return { el: c.el, kind: 'card', label, described: c.described, fit: c.fit }
    }
    return cropContent(
      t,
      {
        side: x.link.side,
        max: x.sheet
          ? x.max
          : { width: x.max.width - 2 * CROP_PAD, height: Math.min(x.max.height, CROP_MAX_H) - 2 * CROP_PAD },
        sheet: x.sheet,
        signal: x.signal,
      },
      {
        scale: () => panes.scale,
        composer: () => o.composer(),
        part: (n) => o.part(n),
        original,
        words: previewWords,
        label: () => label,
      },
    )
  }

  const jump = (j: {
    side: Side
    dest: string
    keyboard: boolean
    origin: { side: Side; page: number; box: [number, number, number, number] } | null
  }) => o.jump({ ...j, dest: destValue(j.dest) })
  const hoverless = globalThis.matchMedia?.('(hover: none)') ?? null
  return createPreviews({
    root: o.root,
    panes: {
      containerOf: (s) => panes.containerOf(s),
      pageElement: (s, n) => panes.pageElement(s, n),
      boxOf: (s, n, r) => panes.boxOf(s, n, r),
      on: (type, f) => panes.on(type, f),
    },
    targets,
    bracket,
    content,
    clock: o.clock,
    words: previewWords,
    jump,
    open: o.open,
    // (open item 8, the lead's ruling: the sheet where the device has no hover, or where the pane shown is narrower than the
    // card with its margins; the popover everywhere else, at any window width)
    narrow: () => {
      if (hoverless?.matches) return true
      const side: Side = panes.display === 'original' ? 'left' : 'right'
      const w = panes.containerOf(side).clientWidth
      return w > 0 && w < CARD_W + 2 * EDGE_PX
    },
    keep: createKeep({ clock: o.clock, words: previewWords }),
    sheet: createSheet({
      root: o.root,
      words: previewWords,
      content,
      jump,
      open: o.open,
      search: (t) => {
        const q = queries.get(t[0])
        return SEARCH_URL && q ? SEARCH_URL(q) : null
      },
    }),
  })
}
