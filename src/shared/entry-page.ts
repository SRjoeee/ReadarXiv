// What the two entry pages answer the popup (§4.0b, UI.md S-P-03b). Shared by the abstract and PDF content scripts:
// the pages differ in how they know where the HTML version is, and in nothing else.
//
// The navigation happens **here, in the page**: `location.assign` needs no permission, while a popup that navigated
// the tab itself would need one. The reader's click therefore does exactly what following the in-page entry does.
import { replyWith, type EntryStatus } from '@/shared/messages'

export interface EntryPage {
  /** This page's paper id, or null when the path is not a paper's */
  paper: () => string | null
  /** The HTML full text with `#axt-translate`, or null when this paper has no HTML version */
  html: () => string | null
}

/**
 * Answer `axt:entry-status` and `axt:open-html` for as long as the page is open.
 *
 * Both are read at answer time rather than captured: an abstract page can be open while nothing else changes, but
 * reading twice costs one selector and removes a class of staleness.
 */
export function answerEntryMessages(page: EntryPage): void {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const type = (message as { type?: string } | null)?.type
    if (type === 'axt:entry-status') {
      const paper = page.paper()
      if (paper === null) return undefined
      const status: EntryStatus = { paper, html: page.html() }
      replyWith(Promise.resolve(status), sendResponse)
      return true
    }
    if (type === 'axt:open-html') {
      const href = page.html()
      if (href !== null) location.assign(href)
      replyWith(Promise.resolve({ opened: href !== null }), sendResponse)
      return true
    }
    return undefined
  })
}
