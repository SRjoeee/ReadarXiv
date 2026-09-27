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

/**
 * Whether the PDF page opens the reader (the reader's design, §2): the setting on, or the address asking for it with
 * `#readarxiv` — an explicit request, which also asks for a translation
 */
export function readerWanted({ enabled, hash }: { enabled: boolean; hash: string }): { open: boolean; translate: boolean } {
  const asked = hash === AUTO_TRANSLATE_HASH
  return { open: enabled || asked, translate: asked }
}

/**
 * How long a check of a paper's entries waits for arXiv (the redesign's design, §5.4): an answer not back by then says
 * nothing about the paper, and the entry is offered, as the reader's own check of the HTML version does (its session, 3 s)
 */
export const ENTRY_CHECK_MS = 3000

/**
 * The paper's HTML version with the hash that starts its translation, or null where arXiv says it has none: one HEAD.
 * **Only arXiv saying so means there is none** (404, or 410): a request that failed, a 429 or a 5xx say nothing about
 * the paper, and the link is offered — at worst it leads to arXiv's own answer (Devin on #247). `fetchFn` is the
 * caller's: the PDF page asks its own origin, the popup arXiv's by its host permission
 */
export function htmlVersionOf(id: string, fetchFn: typeof fetch, origin = 'https://arxiv.org'): Promise<string | null> {
  return fetchFn(htmlUrlOf(id, origin), { method: 'HEAD', credentials: 'omit' })
    .then(res => res.status, () => null)
    .then(status => (status === 404 || status === 410 ? null : translatedHtmlUrlOf(id, origin)))
}

/**
 * The paper's PDF asking for the reader, or null where it cannot be had as a bilingual PDF (the reader's design, §2):
 * one HEAD on its source, where a PDF-only submission answers application/pdf; anything else leaves the entry offered.
 * Whether this browser runs the reader at all is the caller's to ask first (pdf-reader/support.ts)
 */
export function bilingualPdfOf(id: string, fetchFn: typeof fetch, origin = 'https://arxiv.org'): Promise<string | null> {
  return fetchFn(`${origin}/src/${id}`, { method: 'HEAD', credentials: 'omit' })
    .then(res => (res.ok ? sourceKindOf(res.headers.get('content-type')) : ('unknown' as const)), () => 'unknown' as const)
    .then(source => (source === 'pdf-only' ? null : pdfUrlOf(id, origin)))
}
