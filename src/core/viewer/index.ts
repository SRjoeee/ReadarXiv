// The figure viewer (issue #276): a figure opened large, zoomed and panned, and closed back onto the page where it was.
//
// The interaction is DeepWiki's, observed and measured on 2026-09-21: nothing at rest, a control fading in at the
// figure's top right under the pointer (150 ms), a dialog of nine tenths of the window over a dimmed, blurred page,
// `+` `−` `×` at its top right, a step of 1.2 a press, the wheel zooming about the pointer by 1.06 a notch, a drag
// panning, a fresh fit at every opening, and Escape, the backdrop or `×` closing. Its own code uses no zoom library —
// some sixty lines over pointer and wheel events — and a React dialog; here the dialog is the platform's `<dialog>`,
// which also hands the focus back to where it came from, as theirs does not.
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
  strings: FigureViewerStrings
}

export interface FigureViewer {
  remove(): void
}

/** Smaller than this a figure is an icon in a table or a symbol in a line, and is left alone */
const MIN_WIDTH_PX = 160
const MIN_HEIGHT_PX = 100
const BUTTON_STEP = 1.2
const WHEEL_STEP = 1.06
/** How far in and out of the fit the reader may go */
const MAX_ZOOM = 12
const MIN_ZOOM = 0.5
/** The pointer may leave the figure for the control without the control leaving */
const LEAVE_GRACE_MS = 120

export const VIEWER_CLASS = 'axt-viewer'

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
.open { position: fixed; z-index: 2147483000; color: #1c1c1e; background: rgb(255 255 255 / 0.86); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.16); opacity: 0; pointer-events: none; transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
.open[data-shown] { opacity: 0.85; pointer-events: auto; }
.open[data-shown]:hover, .open[data-shown]:focus-visible { opacity: 1; }
dialog { box-sizing: border-box; width: 90vw; height: 90vh; max-width: none; max-height: none; margin: auto; padding: 0; border: 0; border-radius: 12px; overflow: hidden; color: var(--ink, #1c1c1e); background: var(--paper, #f4f3f2); box-shadow: 0 24px 64px rgb(0 0 0 / 0.35); }
dialog[open] { animation: enter 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
dialog::backdrop { background: rgb(0 0 0 / 0.5); backdrop-filter: blur(4px); animation: fade 0.15s; }
.stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; }
.stage[data-dragging] { cursor: grabbing; }
.bar { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, var(--paper, #f4f3f2) 78%, transparent); }
@keyframes enter { from { opacity: 0; transform: scale(0.95); } }
@keyframes fade { from { opacity: 0; } }
.open[data-dark] { color: #f5f5f4; background: rgb(40 40 40 / 0.86); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 1px 3px rgb(0 0 0 / 0.4); }
@media (prefers-reduced-motion: reduce) { dialog[open], dialog::backdrop { animation: none; } .open { transition: none; } }
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
function copyOf(doc: Document, figure: Element, overlay: Element | null): { node: HTMLElement; width: number; height: number } {
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
    // The ids stay the original's alone; what the copy refers to by one is found there
    for (const el of [copy, ...Array.from(copy.querySelectorAll('[id]'))]) el.removeAttribute('id')
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
  const { strings } = options
  const host = doc.createElement('div')
  host.className = VIEWER_CLASS
  const root = host.attachShadow({ mode: 'open' })
  const button = (className: string, label: string, d: string): HTMLButtonElement => {
    const el = doc.createElement('button')
    el.type = 'button'
    el.className = className
    el.setAttribute('aria-label', label)
    el.title = label
    el.innerHTML = icon(d)
    return el
  }
  const style = doc.createElement('style')
  style.textContent = SHEET
  const open = button('open', strings.open, ICONS.open)
  const dialog = doc.createElement('dialog')
  const stage = doc.createElement('div')
  stage.className = 'stage'
  stage.append(doc.createElement('slot'))
  const bar = doc.createElement('div')
  bar.className = 'bar'
  const zoomIn = button('', strings.zoomIn, ICONS.zoomIn)
  const zoomOut = button('', strings.zoomOut, ICONS.zoomOut)
  const close = button('', strings.close, ICONS.close)
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
    host.style.setProperty('--paper', paper)
    host.style.setProperty('--ink', dark ? '#f5f5f4' : '#1c1c1e')
    open.toggleAttribute('data-dark', dark)
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
    open.removeAttribute('data-shown')
  }
  const show = (figure: Element): void => {
    clearTimeout(leaving)
    if (current !== figure) {
      current = figure
      dress()
      place()
    }
    open.setAttribute('data-shown', '')
  }
  /**
   * The block whose moves are followed. Entering an element is one event, and a figure that takes no pointer is
   * never entered: the pointer comes into its block at the margin and crosses onto the figure with nothing to say so.
   * Only such a block is listened to, and only while the pointer is in it — not every move on every page
   */
  let followed: Element | null = null
  const onMove = (event: PointerEvent): void => {
    const figure = figureAt(event)
    if (figure) show(figure)
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
  doc.addEventListener('pointerover', onOver, { passive: true })
  view.addEventListener('scroll', onScroll, { passive: true, capture: true })

  // ── The dialog: a copy of the figure, fitted, zoomed about a point, dragged ──
  let content: HTMLElement | null = null
  let natural = { width: 1, height: 1 }
  let fit = 1
  let zoom = 1
  let x = 0
  let y = 0
  const draw = (): void => {
    if (!content) return
    // The size is what changes, not a transform's scale: a vector figure is drawn again at the size it has, where a
    // scaled one is the small drawing stretched
    content.style.width = `${natural.width * zoom}px`
    content.style.height = `${natural.height * zoom}px`
    content.style.transform = `translate(${x}px, ${y}px)`
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
  const show_ = (figure: Element): void => {
    const lying = figure.nextElementSibling?.matches(options.overlay) ? figure.nextElementSibling : null
    const copy = copyOf(doc, figure, lying)
    content = copy.node
    natural = { width: copy.width, height: copy.height }
    content.style.cssText += 'position:absolute;left:0;top:0;transform-origin:0 0;'
    host.replaceChildren(content)
    hide()
    dialog.showModal()
    // A fresh fit at every opening, with a margin about the figure
    fit = Math.min((stage.clientWidth - 48) / natural.width, (stage.clientHeight - 48) / natural.height)
    zoom = fit
    x = (stage.clientWidth - natural.width * zoom) / 2
    y = (stage.clientHeight - natural.height * zoom) / 2
    draw()
  }
  open.addEventListener('click', () => { if (current) show_(current) })
  zoomIn.addEventListener('click', () => zoomAbout(BUTTON_STEP, ...centre()))
  zoomOut.addEventListener('click', () => zoomAbout(1 / BUTTON_STEP, ...centre()))
  close.addEventListener('click', () => dialog.close())
  // The backdrop is the dialog's own box outside its content: a press that lands on the dialog itself
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close() })
  dialog.addEventListener('close', () => {
    host.replaceChildren()
    content = null
  })
  stage.addEventListener('wheel', event => {
    event.preventDefault()
    const box = stage.getBoundingClientRect()
    // A pinch on a trackpad arrives as a wheel with the control key, in finer steps than a notch
    const step = event.ctrlKey ? Math.exp(-event.deltaY * 0.01) : event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP
    zoomAbout(step, event.clientX - box.left, event.clientY - box.top)
  }, { passive: false })
  let drag: { id: number; px: number; py: number; x: number; y: number } | null = null
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    drag = { id: event.pointerId, px: event.clientX, py: event.clientY, x, y }
    stage.setPointerCapture(event.pointerId)
    stage.setAttribute('data-dragging', '')
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
    stage.removeAttribute('data-dragging')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)

  return {
    remove() {
      doc.removeEventListener('pointerover', onOver)
      follow(null)
      view.removeEventListener('scroll', onScroll, { capture: true })
      clearTimeout(leaving)
      if (frame) view.cancelAnimationFrame(frame)
      if (dialog.open) dialog.close()
      host.remove()
    },
  }
}
