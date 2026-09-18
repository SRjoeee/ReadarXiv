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

const STYLE = `
:host { all: initial }
a {
  position: fixed; inset: auto 20px 20px auto; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border-radius: 999px;
  background: #b31b1b; color: #fff; text-decoration: none;
  font: 500 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.28);
}
a:hover { background: #991717 }
a:focus-visible { outline: 2px solid #fff; outline-offset: 2px }
@media (prefers-reduced-motion: no-preference) { a { transition: background 120ms ease } }
`

/**
 * Insert the entry; returns whether it was inserted.
 *
 * A plain link, so the reader's click navigates by itself: no listener, no dialog, no question to answer (the
 * maintainer, 2026-09-18 — the lowest-friction path is the one with nothing in the way). The shadow root keeps our
 * few rules out of a document that is Chrome's, not the site's.
 *
 * Nothing happens twice: Chrome's PDF host document does not re-render, but idempotence is one query.
 */
export function injectPdfEntry(doc: Document, options: { label: string; href: string }): boolean {
  if (doc.querySelector(`.${PDF_ENTRY_CLASS}`)) return false
  const body = doc.body
  if (!body) return false

  const host = doc.createElement('div')
  host.className = PDF_ENTRY_CLASS
  const root = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = STYLE
  const link = doc.createElement('a')
  link.href = options.href
  link.textContent = options.label
  root.append(style, link)
  body.append(host)
  return true
}

/** The interface's language can change while a PDF sits open; the entry follows, as the abstract page's does */
export function relabelPdfEntry(doc: Document, label: string): boolean {
  const link = doc.querySelector(`.${PDF_ENTRY_CLASS}`)?.shadowRoot?.querySelector('a')
  if (!link) return false
  link.textContent = label
  return true
}
