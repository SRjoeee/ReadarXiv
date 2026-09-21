// The figure viewer (issue #276): a figure opened large, zoomed and panned, and closed back onto the page where it was.
//
// The interaction is DeepWiki's, observed and measured on 2026-09-21: nothing at rest, a control fading in at the
// figure's top right under the pointer (150 ms), a dialog of nine tenths of the window over a dimmed, blurred page,
// `+` `−` `×` at its top right, a step of 1.2 a press, the wheel zooming about the pointer, a drag panning, a fresh
// fit at every opening, and Escape, the backdrop or `×` closing. Its own code uses no zoom library — some sixty lines
// over pointer and wheel events — and a React dialog; here the dialog is the platform's `<dialog>`, which also hands
// the focus back to where it came from, as theirs does not.
//
// **The paper is not touched.** The control is one button of ours in a shadow root, placed over the figure from its
// rectangle; the figure in the dialog is a **copy**, and an `<object>` moved would load again. The copy is a light
// child of our host, slotted into the dialog: it stays in the document's tree, so the page's own styles reach it — a
// TikZ picture's labels are HTML set by arXiv's sheet — and `url(#…)` inside it still finds the paper's definitions
// (DESIGN §15.6), while the dialog and its controls keep a sheet of their own.
//
// Two things DeepWiki has are left out on purpose: zooming in place on the page, which would mean writing to the
// paper's own node (DESIGN §7.1), and opening by a click anywhere on the figure, which an `<object>` swallows — a
// click inside one goes to its own document — and half of arXiv's figures are one.

import { AXT_ATTR_PREFIX, stripAttributes } from '@/core/marks'

export interface FigureViewerStrings {
  open: string
  zoomIn: string
  zoomOut: string
  close: string
}

export interface FigureViewerOptions {
  /** What may be opened: the paper's figures — bitmaps, external SVG figures, inline pictures */
  figures: string
  /** One of ours that lies over a figure and takes the pointer there (the image overlay): the figure is what precedes it */
  overlay: string
  /** The block a figure stands in, met by the pointer when the figure itself takes none */
  around: string
  /** A node of ours inside a figure: a label's translation beside the label */
  ours: string
  /** The words, asked for each time they are shown: the reader's interface language arrives after the page loads, and may change */
  strings: () => FigureViewerStrings
}

export interface FigureViewer {
  remove(): void
}

/** Smaller than this a figure is an icon in a table or a symbol in a line, and is left alone */
const MIN_WIDTH_PX = 160
const MIN_HEIGHT_PX = 100
const BUTTON_STEP = 1.2
/**
 * The wheel zooms by e^(−deltaY × rate), in proportion to the distance scrolled: 1.15 for 100 px, d3-zoom's rate. A
 * trackpad sends a scroll as dozens of small deltas, and a fixed step an event took one gesture of 145 px from the
 * fit to five times it (Codex on #279; the same gesture now 1.22)
 */
const WHEEL_RATE = 0.002 * Math.LN2
/** Chrome sends a trackpad pinch as a wheel with the control key, its delta −100·ln of the scale (measured): the figure keeps to the fingers */
const PINCH_RATE = 0.01
/** How far in and out of the fit the reader may go */
const MAX_ZOOM = 12
const MIN_ZOOM = 0.5
/** The pointer may leave the figure for the control without the control leaving */
const LEAVE_GRACE_MS = 120

export const VIEWER_CLASS = 'axt-viewer'
/**
 * The page held still under the dialog, or closing it would not return the reader where they were. A modal dialog
 * does not hold the document of itself, and a list of keys held in the dialog did not either: ⌘↓ and ⌥↓ passed it,
 * and on Chrome 131 a press on the figure puts the focus on the body, out of the dialog's hearing (measured: PageDown
 * 880 px, End and ⌘↓ to the paper's end, Space a page; Codex on #279). So the lock DeepWiki's dialog sets on the body,
 * here a sheet the document adopts while the dialog is open — no node or attribute of the page is written. The
 * gutter stays, or a scroll bar that takes room would go and the paper be laid out again 15 px wider (measured)
 */
const LOCK = ':root { overflow: hidden !important; scrollbar-gutter: stable !important; }'

const ICONS = {
  open: '<path d="M15 3h6v6"/><path d="M21 3l-7 7"/><path d="M9 21H3v-6"/><path d="M3 21l7-7"/>',
  zoomIn: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  zoomOut: '<path d="M5 12h14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}
const icon = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

const SHEET = `
:host { all: initial; }
button { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; color: inherit; opacity: 0.7; transition: opacity 0.15s; }
button:hover, button:focus-visible { opacity: 1; }
button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
.axt-viewer-open { position: fixed; z-index: 2147483000; color: #1c1c1e; background: rgb(255 255 255 / 0.86); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.16); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.15s; }
.axt-viewer-open[data-axt-shown] { opacity: 0.85; visibility: visible; pointer-events: auto; transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s; }
.axt-viewer-open[data-axt-shown]:hover, .axt-viewer-open[data-axt-shown]:focus-visible { opacity: 1; }
dialog { box-sizing: border-box; width: 90vw; height: 90vh; max-width: none; max-height: none; margin: auto; padding: 0; border: 0; border-radius: 12px; overflow: hidden; color: var(--axt-viewer-ink, #1c1c1e); background: var(--axt-viewer-paper, #f4f3f2); box-shadow: 0 24px 64px rgb(0 0 0 / 0.35); }
dialog[open] { animation: enter 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
dialog::backdrop { background: rgb(0 0 0 / 0.5); backdrop-filter: blur(4px); animation: fade 0.15s; }
.axt-viewer-stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; }
.axt-viewer-stage[data-axt-dragging] { cursor: grabbing; }
.axt-viewer-bar { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, var(--axt-viewer-paper, #f4f3f2) 78%, transparent); }
@keyframes enter { from { opacity: 0; transform: scale(0.95); } }
@keyframes fade { from { opacity: 0; } }
.axt-viewer-open[data-axt-dark] { color: #f5f5f4; background: rgb(40 40 40 / 0.86); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 1px 3px rgb(0 0 0 / 0.4); }
@media (prefers-reduced-motion: reduce) { dialog[open], dialog::backdrop { animation: none; } .axt-viewer-open { transition: none; } }
`

/**
 * What text inherits and its layout depends on. A slotted node inherits along the flat tree — from the dialog, not
 * from where the figure stood — and an inline picture's labels are text: arXiv sets its body at weight 300, and at
 * the dialog's 400 `Position-pair Diagonal` ran six per cent wider than the width TeX measured for it, and wrapped
 * over the drawing (measured by diffing the two computed styles). The frame is given what the figure had
 */
const INHERITED_TEXT = [
  'font', 'font-kerning', 'font-feature-settings', 'font-variation-settings', 'font-optical-sizing', 'font-synthesis',
  'letter-spacing', 'word-spacing', 'text-rendering', 'text-align', 'text-indent', 'text-transform', 'white-space',
  'word-break', 'overflow-wrap', 'hyphens', 'line-break', 'tab-size', 'direction', 'writing-mode', 'color', '-webkit-font-smoothing',
]

/** A copy of the figure for the dialog, as large as the figure is laid out on the page; with the overlay of ours that lies on it */
function copyOf(doc: Document, figure: Element, overlay: Element | null, ours: string): { node: HTMLElement; width: number; height: number } {
  const box = figure.getBoundingClientRect()
  const frame = doc.createElement('div')
  const stood = figure.parentElement && doc.defaultView?.getComputedStyle(figure.parentElement)
  if (stood) for (const name of INHERITED_TEXT) frame.style.setProperty(name, stood.getPropertyValue(name))
  // Line breaking and hyphenation go by the language, which is an attribute and not a style
  const lang = figure.closest('[lang]')?.getAttribute('lang')
  if (lang) frame.lang = lang
  frame.style.position = 'relative'
  frame.style.width = `${box.width}px`
  frame.style.height = `${box.height}px`
  let copy: Element
  if (figure instanceof HTMLImageElement || figure.tagName === 'OBJECT') {
    // An external SVG figure is shown as an image: inside an `<object>` the pointer and the wheel are its own
    // document's, and nothing of a drag or a zoom would reach the dialog. arXiv's are self-contained — every glyph
    // an outline in the file — which is all an SVG shown as an image may be
    const image = doc.createElement('img')
    image.src = figure instanceof HTMLImageElement ? figure.currentSrc || figure.src : figure.getAttribute('data') ?? ''
    image.alt = figure.getAttribute('alt') ?? ''
    image.draggable = false
    copy = image
  } else {
    copy = figure.cloneNode(true) as Element
    // **What showed on the page is what is copied.** A label and its translation both lie in the picture and a style
    // rule shows one of them, by where the picture stands — a split figure's original keeps its labels, its copy shows
    // the translations (DESIGN §15.6) — and the copy stands nowhere: the member that did not show is taken out, and
    // the marks the rules read go, so that none of them decides again. The ids stay the original's alone; what the
    // copy refers to by one is found there
    const was = Array.from(figure.querySelectorAll('*'))
    const twins = Array.from(copy.querySelectorAll('*'))
    const hidden = twins.filter((_, i) => was[i]!.matches(`${ours}, [${AXT_ATTR_PREFIX}id]`) && was[i]!.getClientRects().length === 0)
    for (const twin of hidden) twin.remove()
    // A copy for reading, as every other clone of the paper's nodes is: no id, no mark, no behaviour of the original's
    stripAttributes(copy)
  }
  ;(copy as HTMLElement | SVGElement).style.cssText += ';display:block;width:100%;height:100%;max-width:none;max-height:none;margin:0;'
  frame.append(copy)
  if (overlay) {
    const labels = overlay.cloneNode(true) as HTMLElement
    // On the page the overlay is tied to its image by anchor positioning; in the frame it simply fills it
    labels.style.cssText = 'display:block;position:absolute;inset:0;width:auto;height:auto;'
    frame.append(labels)
  }
  return { node: frame, width: box.width, height: box.height }
}

export function installFigureViewer(doc: Document, options: FigureViewerOptions): FigureViewer {
  const view = doc.defaultView
  if (!view) return { remove: () => undefined }
  const host = doc.createElement('div')
  host.className = VIEWER_CLASS
  const root = host.attachShadow({ mode: 'open' })
  const button = (className: string, d: string): HTMLButtonElement => {
    const el = doc.createElement('button')
    el.type = 'button'
    el.className = className
    el.innerHTML = icon(d)
    return el
  }
  const name = (el: HTMLButtonElement, label: string): void => {
    el.setAttribute('aria-label', label)
    el.title = label
  }
  const style = doc.createElement('style')
  style.textContent = SHEET
  const lock = new view.CSSStyleSheet()
  lock.replaceSync(LOCK)
  const open = button('axt-viewer-open', ICONS.open)
  const dialog = doc.createElement('dialog')
  const stage = doc.createElement('div')
  stage.className = 'axt-viewer-stage'
  stage.append(doc.createElement('slot'))
  const bar = doc.createElement('div')
  bar.className = 'axt-viewer-bar'
  const zoomIn = button('', ICONS.zoomIn)
  const zoomOut = button('', ICONS.zoomOut)
  const close = button('', ICONS.close)
  /** The words as the interface has them now */
  const label = (): void => {
    const words = options.strings()
    name(open, words.open)
    name(zoomIn, words.zoomIn)
    name(zoomOut, words.zoomOut)
    name(close, words.close)
    // A dialog's name is the author's to give — its buttons and the figure do not name it (Codex on #279): it is
    // called what the control that opens it is called
    dialog.setAttribute('aria-label', words.open)
  }
  bar.append(zoomIn, zoomOut, close)
  dialog.append(stage, bar)
  root.append(style, open, dialog)
  doc.body.append(host)

  /**
   * The ground the paper is read on, and whether it is a dark one. **The page's, not the system's**: arXiv has a
   * theme of its own, and an inline picture's labels are set in that theme's ink by the page's sheet — light letters
   * on a dialog that followed a light system would not be read at all
   */
  const ground = (): { paper: string; dark: boolean } => {
    for (const el of [doc.body, doc.documentElement]) {
      const colour = view.getComputedStyle(el).backgroundColor
      const parts = colour.match(/[\d.]+/g)?.map(Number) ?? []
      if (parts.length >= 3 && (parts[3] ?? 1) > 0) return { paper: colour, dark: 0.2126 * parts[0]! + 0.7152 * parts[1]! + 0.0722 * parts[2]! < 128 }
    }
    return { paper: '#ffffff', dark: false }
  }
  const dress = (): void => {
    const { paper, dark } = ground()
    host.style.setProperty('--axt-viewer-paper', paper)
    host.style.setProperty('--axt-viewer-ink', dark ? '#f5f5f4' : '#1c1c1e')
    open.toggleAttribute('data-axt-dark', dark)
  }

  // ── The control over the figure under the pointer ──
  let current: Element | null = null
  let leaving: ReturnType<typeof setTimeout> | undefined
  let frame = 0
  const figureAt = (event: PointerEvent): Element | null => {
    const { target } = event
    if (!(target instanceof Element) || host.contains(target)) return null
    const lying = target.closest(options.overlay)
    const holds = (el: Element): boolean => {
      const box = el.getBoundingClientRect()
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    }
    // A figure that is `inert` takes no pointer — side mode silences the media a split copy repeats (DESIGN §7.4b) —
    // and what is met instead is the block around it: the figure there whose box holds the pointer
    const figure = (lying ? lying.previousElementSibling : target.closest(options.figures))
      ?? Array.from(target.closest(options.around)?.querySelectorAll(options.figures) ?? []).find(holds)
    if (!figure?.matches(options.figures) || figure.parentElement?.closest(options.figures)) return null
    const box = figure.getBoundingClientRect()
    return box.width >= MIN_WIDTH_PX && box.height >= MIN_HEIGHT_PX ? figure : null
  }
  const place = (): void => {
    if (!current?.isConnected) {
      hide()
      return
    }
    const box = current.getBoundingClientRect()
    open.style.left = `${Math.min(view.innerWidth - 38, box.right - 38)}px`
    open.style.top = `${Math.max(8, box.top + 8)}px`
  }
  const hide = (): void => {
    current = null
    open.removeAttribute('data-axt-shown')
  }
  const show = (figure: Element): void => {
    clearTimeout(leaving)
    if (current !== figure) {
      current = figure
      dress()
      label()
      place()
    }
    open.setAttribute('data-axt-shown', '')
  }
  /**
   * The block whose moves are followed. Entering an element is one event, and a figure that takes no pointer is
   * never entered: the pointer comes into its block at the margin and crosses onto the figure with nothing to say so.
   * Only such a block is listened to, and only while the pointer is in it — not every move on every page
   */
  let followed: Element | null = null
  const onMove = (event: PointerEvent): void => {
    const figure = figureAt(event)
    if (figure) {
      show(figure)
      return
    }
    // Off the figure and still in its block: no new element is entered, so this is the only word of the leaving (Devin on #279)
    clearTimeout(leaving)
    leaving = setTimeout(hide, LEAVE_GRACE_MS)
  }
  const follow = (block: Element | null): void => {
    if (followed === block) return
    followed?.removeEventListener('pointermove', onMove as EventListener)
    followed = block
    block?.addEventListener('pointermove', onMove as EventListener, { passive: true })
  }
  const onOver = (event: PointerEvent): void => {
    if (dialog.open) return
    if (event.composedPath().includes(open)) {
      clearTimeout(leaving)
      return
    }
    const figure = figureAt(event)
    const block = event.target instanceof Element ? event.target.closest(options.around) : null
    follow(block?.querySelector(`:is(${options.figures})[inert]`) ? block : null)
    if (figure) {
      show(figure)
      return
    }
    clearTimeout(leaving)
    leaving = setTimeout(hide, LEAVE_GRACE_MS)
  }
  // The figure moves under a control that is fixed to the window: it follows, once a frame and only while shown
  const onScroll = (): void => {
    if (!current || frame) return
    frame = view.requestAnimationFrame(() => {
      frame = 0
      place()
    })
  }
  // Out of the window straight from a figure, the pointer enters nothing, so nothing says it has gone (measured:
  // the control stayed over the paper; Devin on #279). The document's own leaving is the word of it
  const onLeave = (): void => {
    if (dialog.open) return
    clearTimeout(leaving)
    leaving = setTimeout(hide, LEAVE_GRACE_MS)
  }
  doc.addEventListener('pointerover', onOver, { passive: true })
  doc.documentElement.addEventListener('pointerleave', onLeave, { passive: true })
  view.addEventListener('scroll', onScroll, { passive: true, capture: true })

  // ── The dialog: a copy of the figure, fitted, zoomed about a point, dragged ──
  let content: HTMLElement | null = null
  // The copy stands in the document, its translations under the marks the page's sheets dress them by — so a sweep
  // of the document takes them too: restoring the page under the open dialog left a picture with no labels at all
  // (measured; Codex on #279). What the dialog showed is then gone, as it is from the page, and the dialog closes
  // The same when the page changes what it shows by the marks on <html> — the mode, the modes figures are translated
  // in: the sheet's rules decide by them which of a label and its translation shows, the copy kept only the one that
  // showed, and a switch to a mode figures are not translated in left the dialog open on a picture with no labels
  // (measured on Chrome 131; Codex on #279)
  const swept = new view.MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.attributeName?.startsWith(AXT_ATTR_PREFIX))) dialog.close()
  })
  let natural = { width: 1, height: 1 }
  let fit = 1
  let zoom = 1
  let x = 0
  let y = 0
  const draw = (): void => {
    if (!content) return
    // The copy keeps the page's size and is zoomed as a whole: laid out and drawn afresh at the size it is shown — a
    // vector figure crisp, where a transform's scale stretches the small drawing — and every length inside with it, so
    // an overlay's blur and shadow grow as on a larger page. Grown by width and height instead, its 15 px blur stayed
    // 15 px over letters six times as thick, and the original showed through the label again (DESIGN §15.7, measured).
    // The translation is one of the zoomed lengths too, hence divided
    content.style.zoom = String(zoom)
    content.style.transform = `translate(${x / zoom}px, ${y / zoom}px)`
  }
  /** Zoom by a factor, the point of the stage at (px, py) staying where it is */
  const zoomAbout = (factor: number, px: number, py: number): void => {
    const next = Math.min(fit * MAX_ZOOM, Math.max(fit * MIN_ZOOM, zoom * factor))
    const by = next / zoom
    x = px - (px - x) * by
    y = py - (py - y) * by
    zoom = next
    draw()
  }
  const centre = (): [number, number] => [stage.clientWidth / 2, stage.clientHeight / 2]
  const panBy = (dx: number, dy: number): void => {
    x += dx
    y += dy
    draw()
  }
  const show_ = (figure: Element): void => {
    // The overlay goes with the figure only where it showed: a mode the reader did not tick hides it, and under side
    // the original's is hidden while its copy's shows (DESIGN §15.2)
    const next = figure.nextElementSibling
    const lying = next?.matches(options.overlay) && next.getClientRects().length > 0 ? next : null
    const copy = copyOf(doc, figure, lying, options.ours)
    content = copy.node
    natural = { width: copy.width, height: copy.height }
    content.style.cssText += 'position:absolute;left:0;top:0;transform-origin:0 0;'
    host.replaceChildren(content)
    swept.observe(host, { childList: true, subtree: true })
    swept.observe(doc.documentElement, { attributes: true })
    doc.addEventListener('keydown', onKey)
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, lock]
    // The control stays where it is under the dialog: closing hands the focus back to it — and with the pointer off
    // the figure by then, the control fades and the focus falls to the body
    dialog.showModal()
    // A fresh fit at every opening, with a margin about the figure
    fit = Math.max(0.05, Math.min((stage.clientWidth - 48) / natural.width, (stage.clientHeight - 48) / natural.height))
    zoom = fit
    x = (stage.clientWidth - natural.width * zoom) / 2
    y = (stage.clientHeight - natural.height * zoom) / 2
    draw()
  }
  // The figure may have gone since the control appeared — side makes a figure's copy afresh as its translations arrive
  // (Devin on #279) — and a figure out of the page has no box to fit: the control goes instead
  open.addEventListener('click', () => {
    if (current?.isConnected) show_(current)
    else hide()
  })
  zoomIn.addEventListener('click', () => zoomAbout(BUTTON_STEP, ...centre()))
  zoomOut.addEventListener('click', () => zoomAbout(1 / BUTTON_STEP, ...centre()))
  close.addEventListener('click', () => dialog.close())
  // The arrows pan the figure, + and − zoom it; with a modifier a key is the browser's
  const PAN_PX = 60
  const KEYS: Record<string, () => void> = {
    ArrowLeft: () => panBy(PAN_PX, 0),
    ArrowRight: () => panBy(-PAN_PX, 0),
    ArrowUp: () => panBy(0, PAN_PX),
    ArrowDown: () => panBy(0, -PAN_PX),
    '+': () => zoomAbout(BUTTON_STEP, ...centre()),
    '=': () => zoomAbout(BUTTON_STEP, ...centre()),
    '-': () => zoomAbout(1 / BUTTON_STEP, ...centre()),
  }
  // Heard on the document while the dialog is open, not on the dialog: a press on the figure takes the focus off the
  // dialog's buttons, and on Chrome 131 onto the body — the keys then never reached a listener on the dialog, and + and
  // the arrows stopped answering after the viewer's first use (measured; Codex on #279)
  const onKey = (event: KeyboardEvent): void => {
    const act = KEYS[event.key]
    if (!act || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    act()
  }
  // The backdrop is the dialog's own box outside its content: a press that lands on the dialog itself
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close() })
  dialog.addEventListener('close', () => {
    swept.disconnect()
    doc.removeEventListener('keydown', onKey)
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(sheet => sheet !== lock)
    host.replaceChildren()
    content = null
  })
  stage.addEventListener('wheel', event => {
    event.preventDefault()
    const box = stage.getBoundingClientRect()
    zoomAbout(Math.exp(-event.deltaY * (event.ctrlKey ? PINCH_RATE : WHEEL_RATE)), event.clientX - box.left, event.clientY - box.top)
  }, { passive: false })
  let drag: { id: number; px: number; py: number; x: number; y: number } | null = null
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    drag = { id: event.pointerId, px: event.clientX, py: event.clientY, x, y }
    stage.setPointerCapture(event.pointerId)
    stage.setAttribute('data-axt-dragging', '')
  })
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return
    x = drag.x + event.clientX - drag.px
    y = drag.y + event.clientY - drag.py
    draw()
  })
  const release = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.id) return
    drag = null
    stage.removeAttribute('data-axt-dragging')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)

  return {
    remove() {
      doc.removeEventListener('pointerover', onOver)
      doc.documentElement.removeEventListener('pointerleave', onLeave)
      follow(null)
      view.removeEventListener('scroll', onScroll, { capture: true })
      clearTimeout(leaving)
      if (frame) view.cancelAnimationFrame(frame)
      if (dialog.open) dialog.close()
      host.remove()
    },
  }
}
