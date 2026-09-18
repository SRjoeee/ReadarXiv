// The popup framed by the floating button as its control panel (DESIGN §4.0c): the same page, in a frame beside the
// button instead of under the toolbar. A frame has no size of its own and cannot close itself, so the page tells its
// owner two things by `postMessage`: how tall its content is, and when it wants to go. The owner believes a message
// only when its source is the frame it made (core/floating/button.ts), so nothing here needs to be secret.

/** Framed at all: a toolbar popup is its own top window */
export const EMBEDDED = window.parent !== window

/** The owner's origin — arXiv's, which the manifest names — so the messages go to it and to nobody who reframed us */
const OWNER = EMBEDDED ? (location.ancestorOrigins?.[0] ?? null) : null

const tell = (message: { type: 'axt:panel-size'; height: number } | { type: 'axt:panel-close' }) => {
  if (OWNER !== null) window.parent.postMessage(message, OWNER)
}

/** Close the popup: the toolbar's closes itself, the framed one asks its owner */
export function closePopup(): void {
  if (EMBEDDED) tell({ type: 'axt:panel-close' })
  else window.close()
}

/**
 * Keep the owner told of the content's height, and hand it Escape. The body is measured, not the document: a
 * document is at least as tall as its frame, so it would never report having shrunk
 */
export function reportToOwner(): void {
  if (!EMBEDDED) return
  const report = () => tell({ type: 'axt:panel-size', height: Math.ceil(document.body.getBoundingClientRect().height) })
  new ResizeObserver(report).observe(document.body)
  report()
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented) tell({ type: 'axt:panel-close' })
  })
}
