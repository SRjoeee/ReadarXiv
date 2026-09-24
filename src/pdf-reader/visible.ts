// What is not seen takes no resources (the extension's loading rule, DESIGN §10): a reader in a tab in the background —
// opened there, or following a display chosen in another tab — starts translating only once it is shown
export function whenVisible(run: () => void, doc: Document = document): void {
  if (doc.visibilityState !== 'hidden') {
    run()
    return
  }
  const shown = () => {
    if (doc.visibilityState === 'hidden') return
    doc.removeEventListener('visibilitychange', shown)
    run()
  }
  doc.addEventListener('visibilitychange', shown)
}
