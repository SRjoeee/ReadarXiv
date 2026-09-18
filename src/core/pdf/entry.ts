// The bilingual entry on arXiv's PDF page (issue #169): one line that leads to the HTML full text, already
// translating. The counterpart of `core/abstract/link.ts`, and deliberately the same wording, because it is the same
// offer made on another page.
//
// **Chrome's PDF page can be written to.** Chrome renders `arxiv.org/pdf/<id>` by putting the file into a synthetic
// host document at the paper's own URL (`document.contentType === 'application/pdf'`), and a content script matching
// that URL runs in it; the viewer itself is a separate `chrome-extension://` frame and is never touched. A
// `position: fixed` element appended to the host document draws above the viewer (measured 2026-09-18, Chromium 153).

import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { paperIdFrom } from '@/core/paper-id'

/** The element we insert; the mark makes the insertion idempotent and recognisable */
export const PDF_ENTRY_CLASS = 'axt-pdf-entry'

/** The paper id in a `/pdf/…` path, or null; the shapes live in `core/paper-id.ts`, which the abstract page reads too */
export function paperIdFromPdfPath(pathname: string): string | null {
  return paperIdFrom(pathname, 'pdf')
}

/** The HTML full text of that paper, on the page's own origin */
export function htmlUrlOf(id: string, origin = 'https://arxiv.org'): string {
  return `${origin}/html/${id}`
}

/** The same URL the reader's click follows: the hash makes the HTML page start translating on arrival (DESIGN §4.1) */
export function translatedHtmlUrlOf(id: string, origin = 'https://arxiv.org'): string {
  return `${htmlUrlOf(id, origin)}${AUTO_TRANSLATE_HASH}`
}
