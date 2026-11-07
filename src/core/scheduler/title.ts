// The tab's title translated with the page (DESIGN §10): the same service and cache as the paper's blocks, the title
// being plain text. Translated once when the session starts; a title the page itself writes later is the original from
// then on and is translated in its turn, while the translation this module writes is never taken for one. A result
// that arrives after the session ended, after the title changed again or after stop() is dropped, and a failure leaves
// the title as it is. stop() puts the original back, so that after a restore the document is what it was (§7.1).

export interface TitleTranslator {
  stop(): void
}

export interface TitleOptions {
  /** The title's translation; null where there is none */
  translate: (text: string) => Promise<string | null>
  /** Whether the session that asked is still the page's */
  isCurrent: () => boolean
  /** A line for the console: what went wrong, without the page's text */
  warn?: (line: string) => void
}

export function translateTitle(doc: Document, options: TitleOptions): TitleTranslator {
  /** The page's own title */
  let original = doc.title
  /** The translation on the tab now, null while the original is shown */
  let shown: string | null = null
  /** Which request is the latest: an answer to an earlier one is stale */
  let asked = 0
  let stopped = false

  const request = () => {
    const text = original
    if (!text.trim()) return
    const ask = ++asked
    options.translate(text).then(
      translation => {
        if (stopped || ask !== asked || !options.isCurrent() || translation === null || doc.title !== text) return
        shown = translation
        doc.title = translation
      },
      (e: unknown) => options.warn?.(`title: not translated (${e instanceof Error ? e.name : typeof e})`),
    )
  }

  // The page writing its own title: the title element replaced, or its text changed
  const observer = new MutationObserver(() => {
    const now = doc.title
    if (now === shown || (shown === null && now === original)) return
    original = now
    shown = null
    request()
  })
  const head = doc.head ?? doc.documentElement
  if (head) observer.observe(head, { childList: true, subtree: true, characterData: true })
  request()

  return {
    stop() {
      if (stopped) return
      stopped = true
      observer.disconnect()
      if (shown !== null && doc.title === shown) doc.title = original
      shown = null
    },
  }
}
