// The preview layer (link previews, phase 1; the design's §3.8, the approved prototype's Popover; docs/PDF-READER.md §20.7): a
// link inside the paper whose destination the head states (preview/targets.ts) shows what it lands on when the reader dwells
// on it, from the three link sources alike (the left's PDF.js links, the right's on a page not laid, the right's laid links).
// One layer for every kind, one timing, one placement, one way to close:
// - shows after DWELL_MS of the pointer on the link (or the keyboard's focus on it), at once and with no motion within AGAIN_MS
//   of another; its content asked at the pointer's entry, so that the dwell is its head start; shown once both the dwell has
//   passed and its content is drawn, while the pointer is still there: no spinner, no time bound (the lead's ruling, item 11);
// - leaves LINGER_MS after the pointer left both its link and it (a BRIDGE_PX bridge from the link into it), or on Esc, the
//   focus back on its link without opening it again; never by a scroll: it rides with its link as the pane scrolls, and goes
//   when its link leaves the pane or it would cross the pane's head or the reader's foot;
// - one at a time; a citation's card anchored to its whole bracket (the numbers of one \cite), moving along it swaps its
//   content in place with no motion; its text behaves as text (a selection in it, a drag begun in it keep it; a press elsewhere
//   clears that selection and lets it go);
// - over a preview the wheel scrolls the page under it, except over text that can still scroll;
// - to assistive technology a tooltip of its link: role tooltip, the link described by it, never aria-expanded, the focus never
//   moved by its showing (the Modern Web Guidance audit; its guide `hovercard`); Tab from the link goes into it, Tab past its
//   last stop to the next link, closing it; Shift+Tab back to the link;
// - a crop is kept on screen by a click or Enter (preview/keep.ts); on a device with no hover, or a pane narrower than the card
//   with its margins, a tap opens the preview as a sheet instead (preview/sheet.ts), and a link with no target jumps as today.
// A link whose destination the head does not state shows nothing: its half tint and its jump are the page's, untouched.
// Placement is this script's own, one path (CSS anchor positioning and interest invokers are under the floors of both hosts).
import type { Target } from '@readarxiv/format'
import type { Box } from '../compose/page.ts'
import type { Side } from '../panes/panes.ts'
import type { Clock } from '../stack/clock.ts'
import {
  type At,
  AGAIN_MS,
  CARD_W,
  CROP_PAD,
  DWELL_MS,
  EDGE_PX,
  FOOT_PX,
  LINGER_MS,
  placeOf,
  type Rect,
  roomsOf,
} from './place.ts'
import { destOfLink, targetOf } from './targets.ts'

/** a link the reader points at or focuses: its element, its pane and page, its destination's key */
export interface PreviewLink {
  el: HTMLElement
  side: Side
  page: number
  dest: string
}
/** the links a citation's card is anchored to (its bracket: one owner's one element on the page, Link.owner / Page.links'
 *  fifth member), their boxes on the link's page (PDF units), and the foot of the line they stand on (a superscript's
 *  bracket stands under it); `key` names the bracket (null: the link is its own) */
export interface Bracket {
  key: string | null
  boxes: Box[]
  foot: number | null
}
/** what a preview shows, made by the reader (preview/card.ts, preview/crop.ts) */
export interface PreviewContent {
  el: HTMLElement
  kind: 'card' | 'crop'
  /** its accessible name (S-R-33: the target's label) */
  label: string
  /** the element the link is described by (the card's text, a crop's image named by its caption) */
  described: HTMLElement
  /** a card's text giving way to the room on its side (never below three lines) */
  fit?(room: number): void
  dispose?(): void
}
/** the words the previews set (S-R-30, S-R-32, S-R-31) */
export interface PreviewWords {
  keep(label: string): string
  close(label: string): string
  go: string
  search: string
}
/** what the previews read of the panes */
export interface PreviewPanes {
  containerOf(side: Side): HTMLElement
  pageElement(side: Side, n: number): HTMLElement | null
  boxOf(side: Side, n: number, r: Box): { left: number; top: number; width: number; height: number } | null
  on(type: 'scrolled', f: (e: { side: Side }) => void): () => void
}
export interface PreviewDeps {
  root: HTMLElement
  panes: PreviewPanes
  /** the head's targets now (a new head's once read) */
  targets(): ReadonlyMap<string, Target>
  /** a link's bracket on its page (its page's part on the left, Page.links on a laid right page) */
  bracket(l: PreviewLink): Promise<Bracket>
  /** a preview's content: null where none can be shown (a crop that cannot be drawn, a reference whose text is not held) */
  content(o: {
    link: PreviewLink
    target: Target
    sheet: boolean
    max: { width: number; height: number }
    signal: AbortSignal
  }): Promise<PreviewContent | null>
  clock: Clock
  words(): PreviewWords
  /** a jump inside the paper (the reader's one jump) */
  jump(o: {
    side: Side
    dest: string
    keyboard: boolean
    origin: { side: Side; page: number; box: [number, number, number, number] } | null
  }): void
  /** an address out of the paper opened in a new tab by the reader's opener */
  open(url: string): void
  /** whether a tap opens a sheet: a device with no hover, or a pane narrower than the card with its margins (open item 8) */
  narrow(): boolean
  /** a crop kept on screen (preview/keep.ts), where the reader gives one */
  keep?: KeepHost
  /** a preview as a sheet (preview/sheet.ts), where the reader gives one */
  sheet?: SheetHost
}
/** the kept panel's controller, as the previews hand it a crop */
export interface KeepHost {
  /** the crop `pv` kept where it stands (its link's element for the focus's return); `byKey`: Enter, the panel takes the focus */
  keep(pv: HTMLElement, content: PreviewContent, link: HTMLElement, byKey: boolean): void
  /** Esc: the kept panel closed where one stands; false where none */
  esc(): boolean
  dispose(): void
}
/** the sheet's controller */
export interface SheetHost {
  open(link: PreviewLink, target: Target): void
  dispose(): void
}
export interface Previews {
  /** the preview open now closed */
  close(): void
  dispose(): void
  probe(): Record<string, number>
}

/** the link elements of the three sources: a laid link, PDF.js's own anchor of a link annotation */
export const LINK_SELECTOR = 'a.axt-link, .annotationLayer .linkAnnotation > a'
/** what can be focused inside a preview, in its order */
const STOPS = 'a[href], button, [tabindex="0"]'

let ids = 0

export function createPreviews(d: PreviewDeps): Previews {
  const { root, panes, clock } = d
  const ac = new AbortController(),
    signal = ac.signal
  const layer = document.createElement('div')
  layer.className = 'axt-pv-layer'
  root.append(layer)

  type Cur = { link: PreviewLink; target: Target; bracket: Bracket; content: PreviewContent; described: string | null }
  type Pend = {
    link: PreviewLink
    target: Target
    ac: AbortController
    due: boolean
    timer: number
    got: { bracket: Bracket; content: PreviewContent | null } | null
  }
  let pv: HTMLElement | null = null,
    cur: Cur | null = null,
    pend: Pend | null = null,
    hideT = 0,
    rideF = 0,
    lastGone = Number.NEGATIVE_INFINITY,
    inside = false,
    dragging = false,
    hadSel = false
  /** a link the focus is handed back to (Esc): its focus opens nothing */
  let quiet: Element | null = null
  const counts = { shown: 0, swapped: 0, refused: 0, hidden: 0 }

  // ---------------------------------------------------------------- where things are
  const linkAt = (t: EventTarget | null): PreviewLink | null => {
    const a = (t as Element | null)?.closest?.(LINK_SELECTOR) as HTMLElement | null
    if (!a || !root.contains(a)) return null
    const side: Side | null = panes.containerOf('left').contains(a)
      ? 'left'
      : panes.containerOf('right').contains(a)
        ? 'right'
        : null
    const page = Number((a.closest('[data-page-number]') as HTMLElement | null)?.dataset.pageNumber)
    const dest = destOfLink(a)
    return side && page && dest ? { el: a, side, page, dest } : null
  }
  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
  /** a box of a link's page (PDF units) on the screen, null where the page shows none */
  const screenOf = (side: Side, page: number, b: Box): Rect | null => {
    const el = panes.pageElement(side, page)
    const r = el ? panes.boxOf(side, page, b) : null
    if (!el || !r) return null
    const p = el.getBoundingClientRect()
    const left = p.left + el.clientLeft + r.left,
      top = p.top + el.clientTop + r.top
    return { left, top, right: left + r.width, bottom: top + r.height }
  }
  /** what a preview is anchored to: its bracket's links (the link alone where it has none), down to its line's foot */
  const anchorOf = (link: PreviewLink, b: Bracket | null): Rect => {
    let a = rectOf(link.el)
    for (const box of b?.boxes ?? []) {
      const s = screenOf(link.side, link.page, box)
      if (s)
        a = {
          left: Math.min(a.left, s.left),
          top: Math.min(a.top, s.top),
          right: Math.max(a.right, s.right),
          bottom: Math.max(a.bottom, s.bottom),
        }
    }
    if (b?.foot !== null && b?.foot !== undefined) {
      const box = b.boxes[0]
      const f = box ? screenOf(link.side, link.page, [box[0], b.foot, box[2], b.foot + 0.01]) : null
      if (f) a = { ...a, bottom: Math.max(a.bottom, f.top) }
    }
    return a
  }
  const paneOf = (side: Side): Rect => rectOf(panes.containerOf(side))
  /** the most a preview may take: the pane less its margins across; the larger room up or down */
  const maxOf = (link: PreviewLink) => {
    const pane = paneOf(link.side),
      a = rectOf(link.el)
    const { below, above } = roomsOf(a, pane)
    return { width: Math.max(0, pane.right - pane.left - 2 * EDGE_PX), height: Math.max(0, Math.max(below, above)) }
  }

  // ---------------------------------------------------------------- held, described
  const hold = (c: Cur | null, on: boolean) => {
    if (!c) return
    c.link.el.toggleAttribute('data-axt-held', on)
    if (on) {
      c.described = c.link.el.getAttribute('aria-describedby')
      const desc = c.content.described
      if (!desc.id) desc.id = `axt-pv-d${++ids}`
      c.link.el.setAttribute('aria-describedby', desc.id)
    } else if (c.described === null) c.link.el.removeAttribute('aria-describedby')
    else c.link.el.setAttribute('aria-describedby', c.described)
  }

  // ---------------------------------------------------------------- showing, placing, hiding
  function place(keep?: At): boolean {
    if (!pv || !cur) return false
    const pane = paneOf(cur.link.side)
    const anchor = anchorOf(cur.link, cur.bracket)
    if (anchor.bottom < pane.top || anchor.top > pane.bottom) return false
    const { below, above } = roomsOf(anchor, pane)
    if (cur.content.fit) cur.content.fit(keep === 'below' ? below : keep === 'above' ? above : Math.max(below, above))
    const size = { width: pv.offsetWidth, height: pv.offsetHeight }
    const inset = cur.content.kind === 'card' ? Number.parseFloat(getComputedStyle(pv).paddingLeft) || 0 : CROP_PAD
    const p = placeOf({ anchor, pane, size, inset, ...(keep ? { keep } : {}) })
    pv.dataset.axtAt = p.at
    pv.style.left = `${Math.round(p.left)}px`
    pv.style.top = `${Math.round(p.top)}px`
    // (carried past the pane's head or onto the reader's foot, it would be cut against fixed chrome: it goes instead)
    return p.top >= pane.top - 1 && p.top + size.height <= pane.bottom - FOOT_PX + 1
  }
  function show(p: Pend, got: { bracket: Bracket; content: PreviewContent }) {
    const quick = !!pv || clock.now() - lastGone < AGAIN_MS
    // (moving along a citation's bracket: the card stays where it is, its content swapped with no motion)
    if (
      pv &&
      cur &&
      got.content.kind === 'card' &&
      cur.content.kind === 'card' &&
      got.bracket.key !== null &&
      got.bracket.key === cur.bracket.key &&
      cur.link.side === p.link.side
    ) {
      hold(cur, false)
      cur.content.dispose?.()
      cur = { link: p.link, target: p.target, bracket: got.bracket, content: got.content, described: null }
      pv.replaceChildren(got.content.el)
      pv.setAttribute('data-axt-quiet', '')
      hold(cur, true)
      hadSel = false
      counts.swapped++
      place((pv.dataset.axtAt as At | undefined) ?? 'below')
      return
    }
    // (the old one let go at once: its focus leaving with it is not the reader leaving)
    if (pv) drop(pv)
    hold(cur, false)
    cur?.content.dispose?.()
    cur = { link: p.link, target: p.target, bracket: got.bracket, content: got.content, described: null }
    const el = document.createElement('div')
    el.className = 'axt-pv'
    el.setAttribute('role', 'tooltip')
    el.dataset.axtKind = got.content.kind
    if (quick) el.setAttribute('data-axt-quiet', '')
    el.append(got.content.el)
    pv = el
    inside = false
    hadSel = false
    wire(el)
    layer.append(el)
    hold(cur, true)
    counts.shown++
    if (!place()) hide()
  }
  /** a preview let go at once, out of the document */
  const drop = (el: HTMLElement) => el.remove()
  function hide() {
    clock.clear(hideT)
    if (!pv) return
    const old = pv
    pv = null
    inside = false
    hold(cur, false)
    cur?.content.dispose?.()
    cur = null
    lastGone = clock.now()
    counts.hidden++
    old.setAttribute('data-axt-out', '')
    clock.later(() => old.remove(), 100)
  }
  const selIn = (): boolean => {
    const sel = document.getSelection()
    return !!(pv && sel && !sel.isCollapsed && sel.rangeCount && sel.anchorNode && pv.contains(sel.anchorNode))
  }
  const canHide = () => !dragging && !inside && !selIn()
  function later() {
    clock.clear(hideT)
    hideT = clock.later(() => {
      if (canHide()) hide()
    }, LINGER_MS)
  }
  function cancelPending() {
    if (!pend) return
    pend.ac.abort()
    clock.clear(pend.timer)
    pend = null
  }
  const tryShow = (p: Pend) => {
    if (pend !== p || !p.due || !p.got) return
    pend = null
    clock.clear(p.timer)
    if (p.got.content) show(p, p.got as { bracket: Bracket; content: PreviewContent })
    else counts.refused++
  }
  function enter(link: PreviewLink) {
    if (link.el === quiet || dragging) return
    clock.clear(hideT)
    const target = targetOf(d.targets(), link.dest)
    if (!target) {
      cancelPending()
      if (pv) later()
      return
    }
    if (pv && cur?.link.el === link.el) return
    if (pend?.link.el === link.el) return
    cancelPending()
    const quick = !!pv || clock.now() - lastGone < AGAIN_MS
    const p: Pend = { link, target, ac: new AbortController(), due: quick, timer: 0, got: null }
    pend = p
    if (!quick)
      p.timer = clock.later(() => {
        p.due = true
        tryShow(p)
      }, DWELL_MS)
    Promise.all([
      d.bracket(link).catch((): Bracket => ({ key: null, boxes: [], foot: null })),
      d.content({ link, target, sheet: false, max: maxOf(link), signal: p.ac.signal }).catch(() => null),
    ]).then(([bracket, content]) => {
      if (pend !== p) {
        content?.dispose?.()
        return
      }
      p.got = { bracket, content }
      tryShow(p)
    })
  }
  function leave() {
    cancelPending()
    if (pv) later()
  }

  // ---------------------------------------------------------------- a preview's own events
  function wire(el: HTMLElement) {
    el.addEventListener('pointerenter', () => {
      if (el !== pv) return
      inside = true
      clock.clear(hideT)
    })
    el.addEventListener('pointerleave', () => {
      if (el !== pv) return
      inside = false
      later()
    })
    el.addEventListener('pointerdown', (e) => {
      if (el === pv && e.button === 0 && !(e.target as Element).closest?.('a, button')) dragging = true
    })
    el.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null
      if (el === pv && !(to && (el.contains(to) || to === cur?.link.el))) leave()
    })
    // (the wheel scrolls the page under it, but over text that can still scroll that way)
    el.addEventListener(
      'wheel',
      (e) => {
        if (el !== pv || !cur) return
        const s = (e.target as Element).closest?.('[data-axt-scrolls]') as HTMLElement | null
        if (s && (e.deltaY < 0 ? s.scrollTop > 0 : s.scrollTop + s.clientHeight < s.scrollHeight - 1)) return
        e.preventDefault()
        panes.containerOf(cur.link.side).scrollBy({ top: e.deltaY, left: e.deltaX })
      },
      { passive: false },
    )
    // (a crop kept by a click or Enter on it)
    el.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.('.axt-pv-keep')
      if (!b || el !== pv || !cur || !d.keep) return
      e.preventDefault()
      const c = cur
      // (handed over: the preview is the kept panel now, its link no longer held by it)
      hold(c, false)
      pv = null
      cur = null
      inside = false
      clock.clear(hideT)
      d.keep.keep(el, c.content, c.link.el, (e as MouseEvent).detail === 0)
    })
  }

  // ---------------------------------------------------------------- the pointer, the keyboard, the scroll
  const on = <K extends keyof DocumentEventMap>(
    t: Document | HTMLElement | Window,
    type: K,
    f: (e: DocumentEventMap[K]) => void,
    capture = false,
  ) => t.addEventListener(type, f as EventListener, { signal, capture })
  on(root, 'pointerover', (e) => {
    if (d.narrow()) return
    const l = linkAt(e.target)
    if (l) enter(l)
  })
  on(root, 'pointerout', (e) => {
    const l = linkAt(e.target)
    if (!l || (e.relatedTarget && l.el.contains(e.relatedTarget as Node))) return
    if (pend?.link.el === l.el || cur?.link.el === l.el) leave()
  })
  on(root, 'focusin', (e) => {
    // (a narrow screen shows a preview as a sheet, on a tap alone: the focus a closed sheet gives back to its link opens none)
    if (d.narrow()) return
    const l = linkAt(e.target)
    if (!l) return
    let visible = true
    try {
      visible = l.el.matches(':focus-visible')
    } catch {
      /* a browser that cannot tell: the focus is the keyboard's */
    }
    if (visible || l.el === document.activeElement) enter(l)
  })
  on(root, 'focusout', (e) => {
    const l = linkAt(e.target)
    const to = e.relatedTarget as Node | null
    if (l && !(to && pv?.contains(to))) leave()
  })
  // (a press anywhere else ends the reading: a selection in the card goes, even where the press is on the page's images, which
  // would not clear it by themselves, and the card with it)
  on(
    document,
    'pointerdown',
    (e) => {
      if (!pv || pv.contains(e.target as Node)) return
      if (selIn()) document.getSelection()?.removeAllRanges()
      if (!linkAt(e.target)) later()
    },
    true,
  )
  const up = () => {
    if (!dragging) return
    dragging = false
    if (pv && !inside && !selIn()) later()
  }
  on(document, 'pointerup', up)
  on(document, 'pointercancel', up)
  on(document, 'selectionchange', () => {
    const now = selIn()
    if (hadSel && !now && pv && !dragging && !inside) later()
    hadSel = now
  })
  const refocus = (el: HTMLElement) => {
    quiet = el
    el.focus({ preventScroll: true })
    quiet = null
  }
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
      // (a sheet open is a modal dialog: its own Esc closes it, and nothing under it)
      if (root.querySelector('dialog.axt-sheet[open]')) return
      cancelPending()
      if (pv && cur) {
        const link = cur.link.el
        const back = pv.contains(document.activeElement) || document.activeElement === link
        hide()
        if (back) refocus(link)
        return
      }
      d.keep?.esc()
      return
    }
    if (e.key !== 'Tab' || !pv || !cur) return
    const a = document.activeElement
    const link = cur.link.el
    if (a === link && !e.shiftKey) {
      const into = pv.querySelector<HTMLElement>(STOPS)
      if (into) {
        e.preventDefault()
        into.focus()
      }
      return
    }
    if (!a || !pv.contains(a)) return
    e.preventDefault()
    if (e.shiftKey) {
      refocus(link)
      return
    }
    const stops = [...pv.querySelectorAll<HTMLElement>(STOPS)]
    const i = stops.indexOf(a as HTMLElement)
    if (i >= 0 && i < stops.length - 1) {
      stops[i + 1]!.focus()
      return
    }
    // (past its last stop: the next link of the pane, the preview closed)
    const all = [...panes.containerOf(cur.link.side).querySelectorAll<HTMLElement>(LINK_SELECTOR)]
    const next = all[all.indexOf(link) + 1]
    hide()
    if (next) next.focus()
    else refocus(link)
  })
  // (a tap on a narrow screen opens the sheet of a link with a target, before the link's own click jumps; a link with none jumps)
  on(
    root,
    'click',
    (e) => {
      if (!d.narrow() || !d.sheet) return
      const l = linkAt(e.target)
      const t = l ? targetOf(d.targets(), l.dest) : null
      if (!l || !t) return
      e.preventDefault()
      e.stopPropagation()
      d.sheet.open(l, t)
    },
    true,
  )
  // (it rides with its link as the pane scrolls, once a frame)
  const offScroll = panes.on('scrolled', (e) => {
    if (!pv || !cur || e.side !== cur.link.side || rideF) return
    rideF = clock.frame(() => {
      rideF = 0
      if (!pv || !cur) return
      if (!place((pv.dataset.axtAt as At | undefined) ?? 'below')) hide()
    })
  })

  return {
    close() {
      cancelPending()
      hide()
    },
    dispose() {
      cancelPending()
      clock.clear(hideT)
      clock.cancel(rideF)
      hold(cur, false)
      cur?.content.dispose?.()
      cur = null
      pv = null
      offScroll()
      ac.abort()
      d.keep?.dispose()
      d.sheet?.dispose()
      layer.remove()
    },
    probe: () => ({ ...counts, open: pv ? 1 : 0 }),
  }
}

/** a card's width on a pane: CARD_W, never wider than the pane less its margins (24 px) */
export const cardWidth = (paneWidth: number): number => Math.max(0, Math.min(CARD_W, paneWidth - 2 * EDGE_PX))
