// What the two entry pages answer the popup (§4.0b, UI.md S-P-03b). Shared by the abstract and PDF content scripts:
// the pages differ in how they know where the HTML version is, and in nothing else.
//
// The navigation happens **here, in the page**: `location.assign` needs no permission, while a popup that navigated
// the tab itself would need one. The reader's click therefore does exactly what following the in-page entry does.
import { onMessages } from '@/shared/messages'

export interface EntryPage {
  /** This page's paper id, or null when the path is not a paper's */
  paper: () => string | null
  /** The HTML full text with `#readarxiv`, or null when this paper has no HTML version */
  html: () => string | null
}

/**
 * Answer `axt:entry-status` and `axt:open-html` for as long as the page is open.
 *
 * Both are read at answer time rather than captured: an abstract page can be open while nothing else changes, but
 * reading twice costs one selector and removes a class of staleness.
 */
export function answerEntryMessages(page: EntryPage): void {
  onMessages({
    // A path that is not a paper's has nothing to say, and says nothing
    'axt:entry-status': () => {
      const paper = page.paper()
      return paper === null ? undefined : Promise.resolve({ paper, html: page.html() })
    },
    'axt:open-html': async () => {
      const href = page.html()
      if (href !== null) location.assign(href)
      return { opened: href !== null }
    },
  })
}
