// What is not seen takes no resources (the extension's loading rule, DESIGN §10): a reader in a tab in the background —
// opened there, or following a display chosen in another tab — starts translating only once it is shown, and only if
// it still wants to by then (`wanted`: the display may have become the original meanwhile)
/** the tab shown again (at once where it is not hidden), or the signal's abort */
export function shownAgain(doc: Document, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('let go'), { name: 'AbortError' }))
    if (doc.visibilityState !== 'hidden') return resolve()
    const shown = () => { if (doc.visibilityState === 'hidden') return; stop(); resolve() }
    const gone = () => { stop(); reject(Object.assign(new Error('let go'), { name: 'AbortError' })) }
    const stop = () => { doc.removeEventListener('visibilitychange', shown); signal.removeEventListener('abort', gone) }
    doc.addEventListener('visibilitychange', shown)
    signal.addEventListener('abort', gone, { once: true })
  })
}
export function whenVisible(run: () => void, doc: Document = document, wanted: () => boolean = () => true): void {
  if (doc.visibilityState !== 'hidden') {
    if (wanted()) run()
    return
  }
  const shown = () => {
    if (doc.visibilityState === 'hidden') return
    doc.removeEventListener('visibilitychange', shown)
    if (wanted()) run()
  }
  doc.addEventListener('visibilitychange', shown)
}
