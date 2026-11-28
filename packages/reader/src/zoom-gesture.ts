// A zoom gesture, read once for the whole reader (the reader's design §6.8). A wheel is a zoom where Ctrl is held: a trackpad's
// pinch arrives as one in Chrome and Firefox (and a mouse's Ctrl-wheel is one); a wheel with ⌘ held is a scroll and never a zoom
// (macOS's screenshot keys hold ⌘ while a scroll runs: chrome/pinch.ts). WebKit sends a trackpad's pinch as its own gesture events
// (`gesturestart`, `gesturechange`), which zoom the page unless their default is prevented. The panes zoom by it (chrome/pinch.ts);
// over a preview surface (a card, a crop, a kept panel, the sheet) it zooms nothing, and never the browser's page.

/** whether a wheel event is a zoom */
export const isZoomWheel = (e: WheelEvent): boolean => e.ctrlKey

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
