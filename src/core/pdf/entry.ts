// The bilingual entry on arXiv's PDF page (issue #169): one line that leads to the HTML full text, already
// translating. The counterpart of `core/abstract/link.ts`, and deliberately the same wording, because it is the same
// offer made on another page.
//
// **Chrome's PDF page can be written to.** Chrome renders `arxiv.org/pdf/<id>` by putting the file into a synthetic
// host document at the paper's own URL (`document.contentType === 'application/pdf'`), and a content script matching
// that URL runs in it; the viewer itself is a separate `chrome-extension://` frame and is never touched. A
// `position: fixed` element appended to the host document draws above the viewer (measured 2026-09-18, Chromium 153).

import { AUTO_TRANSLATE_HASH, setTarget } from '@/core/abstract/link'
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

/**
 * Collapsed to the mark, opening on hover or keyboard focus — the shape of Read Frog's floating button, which the
 * maintainer asked this to follow (2026-09-18); the rules, the colours and the motion are ours. A pill that is
 * always its full width sits on the page's own corner the whole time a reader is on a PDF, which is what the first
 * version did.
 *
 * The expansion is CSS only: no listener, nothing to keep in sync, and it answers the keyboard as well as the
 * pointer. `prefers-reduced-motion` gets the same states without the travel.
 */
const STYLE = `
:host { all: initial }
@media print { :host { display: none } }
a {
  position: fixed; inset: auto 20px 20px auto; z-index: 2147483000;
  display: grid; grid-template-columns: 24px 0fr; align-items: center; gap: 0;
  box-sizing: border-box; height: 44px; padding: 10px;
  border-radius: 999px; background: #b31b1b; color: #fff; text-decoration: none;
  font: 500 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.28);
  transition: grid-template-columns 180ms ease, gap 180ms ease, background 120ms ease;
}
.mark { width: 24px; height: 24px; display: block }
.label { overflow: hidden; white-space: nowrap; min-width: 0 }
a:hover, a:focus-visible { grid-template-columns: 24px 1fr; gap: 8px; padding-right: 14px; background: #991717 }
a:focus-visible { outline: 2px solid #fff; outline-offset: 2px }
@media (prefers-reduced-motion: reduce) { a { transition: none } }
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
export function injectPdfEntry(doc: Document, options: { label: string; href: string; newTab?: boolean; iconUrl?: string }): boolean {
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
  // The label is read out and read by a reader who opens it; collapsed, the mark alone stands for it
  link.title = options.label
  link.setAttribute('aria-label', options.label)
  if (options.iconUrl) {
    const mark = doc.createElement('img')
    mark.className = 'mark'
    mark.src = options.iconUrl
    // Decorative: the link's own name is the label
    mark.alt = ''
    link.append(mark)
  }
  const label = doc.createElement('span')
  label.className = 'label'
  label.textContent = options.label
  link.append(label)
  // A new tab by default (config `reading.openIn`): the PDF the reader is on stays open behind the translation
  setTarget(link, options.newTab !== false)
  root.append(style, link)
  body.append(host)
  return true
}

/** The interface's language can change while a PDF sits open; the entry follows, as the abstract page's does */
export function relabelPdfEntry(doc: Document, label: string): boolean {
  const link = doc.querySelector(`.${PDF_ENTRY_CLASS}`)?.shadowRoot?.querySelector('a')
  const span = link?.querySelector('.label')
  if (!link || !span) return false
  span.textContent = label
  link.title = label
  link.setAttribute('aria-label', label)
  return true
}

/** Follow a change of `reading.openIn` while the PDF stays open */
export function retargetPdfEntry(doc: Document, newTab: boolean): boolean {
  const link = doc.querySelector(`.${PDF_ENTRY_CLASS}`)?.shadowRoot?.querySelector('a')
  if (!link) return false
  setTarget(link, newTab)
  return true
}
