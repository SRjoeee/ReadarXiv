// arXiv's PDF page (issue #169): which paper it is, and where that paper's HTML full text is. What is drawn there
// is the floating button (`core/floating/button.ts`), whose main button follows these URLs.
//
// **Chrome's PDF page can be written to.** Chrome renders `arxiv.org/pdf/<id>` by putting the file into a synthetic
// host document at the paper's own URL (`document.contentType === 'application/pdf'`), and a content script matching
// that URL runs in it; the viewer itself is a separate `chrome-extension://` frame and is never touched. A
// `position: fixed` element appended to the host document draws above the viewer (measured 2026-09-18, Chromium 153).

import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { paperIdFrom } from '@/core/paper-id'

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

/** The paper's PDF address asking for the reader, translating (the reader's design, §2): `#readarxiv`, as the HTML entry's */
export function pdfUrlOf(id: string, origin = 'https://arxiv.org'): string {
  return `${origin}/pdf/${id}${AUTO_TRANSLATE_HASH}`
}

/**
 * What a HEAD on `/src/<id>` says (checked 2026-09-25): a source answers gzip (a `.tar.gz` or a gzipped file), a
 * PDF-only submission `application/pdf`. **Anything else says nothing**: offline, a 429 or a 5xx leave the entry
 * offered, as the HTML entry's HEAD does (Devin on #247)
 */
export function sourceKindOf(contentType: string | null): 'source' | 'pdf-only' | 'unknown' {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return type.includes('gzip') ? 'source' : type === 'application/pdf' ? 'pdf-only' : 'unknown'
}
