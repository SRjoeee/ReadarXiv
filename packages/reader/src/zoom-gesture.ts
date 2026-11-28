// A zoom gesture, read once for the whole reader (the reader's design §6.8). A wheel is a zoom where Ctrl is held: a trackpad's
// pinch arrives as one in Chrome and Firefox (and a mouse's Ctrl-wheel is one); a wheel with ⌘ held is a scroll and never a zoom
// (macOS's screenshot keys hold ⌘ while a scroll runs: chrome/pinch.ts). Its factor: a trackpad's small deltas zoom continuously,
// a mouse notch a tenth. WebKit sends a trackpad's pinch as its own gesture events (`gesturestart`, `gesturechange`,
// `gestureend`), which zoom the page unless their default is prevented. The panes zoom by it (chrome/pinch.ts); a kept panel by
// it zooms its own image (preview/keep.ts); over any other preview surface (a card, a hover's crop, the sheet) it zooms nothing,
// and never the browser's page.

/** whether a wheel event is a zoom */
export const isZoomWheel = (e: WheelEvent): boolean => e.ctrlKey
/** a zoom wheel's step in log scale: a trackpad's small deltas continuously, a mouse notch (40 px or more) a tenth */
export const wheelStep = (deltaY: number) => (Math.abs(deltaY) >= 40 ? Math.sign(deltaY) * 0.1 : deltaY * 0.01)
/** the factor a zoom wheel asks for (up the wheel, larger) */
export const zoomFactor = (e: WheelEvent): number => Math.exp(-wheelStep(e.deltaY))

/** a zoom gesture over `el` kept from the browser's page: a zoom wheel's default and WebKit's gesture events' prevented, nothing
 *  else of them done (a touch's pinch is kept by the surface's own `touch-action`, styles.ts) */
export function keepZoomFromPage(el: HTMLElement, signal?: AbortSignal): void {
  el.addEventListener(
    'wheel',
    (e) => {
      if (isZoomWheel(e)) e.preventDefault()
    },
    { passive: false, ...(signal ? { signal } : {}) },
  )
  for (const type of ['gesturestart', 'gesturechange'])
    el.addEventListener(type, (e) => e.preventDefault(), signal ? { signal } : {})
}

/** what a zoom gesture over an element asks of it: its start, each change (a factor about a point of the window), its end */
export interface ZoomHandlers {
  start(): void
  change(f: number, x: number, y: number): void
  end(): void
}
/** WebKit's gesture events over `el` read as a zoom about the point where the gesture began, their default prevented (the zoom
 *  wheel is read by its owner, which has its own frame and its own end: a wheel has none) */
export function readGestureZoom(el: HTMLElement, h: ZoomHandlers, signal: AbortSignal): void {
  let g: { last: number; x: number; y: number } | null = null
  type Gesture = Event & { scale?: number; clientX?: number; clientY?: number }
  el.addEventListener(
    'gesturestart',
    (e: Gesture) => {
      e.preventDefault()
      g = { last: 1, x: e.clientX ?? 0, y: e.clientY ?? 0 }
      h.start()
    },
    { signal },
  )
  el.addEventListener(
    'gesturechange',
    (e: Gesture) => {
      e.preventDefault()
      if (!g || !(e.scale && e.scale > 0)) return
      const f = e.scale / g.last
      g.last = e.scale
      h.change(f, g.x, g.y)
    },
    { signal },
  )
  el.addEventListener(
    'gestureend',
    (e: Gesture) => {
      e.preventDefault()
      if (!g) return
      g = null
      h.end()
    },
    { signal },
  )
}
