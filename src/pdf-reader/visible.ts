// What is not seen takes no resources (the extension's loading rule, DESIGN §10): a reader in a tab in the background —
// opened there, or following a display chosen in another tab — starts translating only once it is shown, and only if
// it still wants to by then (`wanted`: the display may have become the original meanwhile; Codex on #301)
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
