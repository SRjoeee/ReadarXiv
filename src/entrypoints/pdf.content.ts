// The PDF page (issue #169): the floating button, whose main button opens the control panel with the paper's two
// entries. **This one thing only**: no part of the translation pipeline is loaded here, as on the abstract page.
//
// The check is one `HEAD` on `arxiv.org/html/<id>`: this script runs at arXiv's own origin, so that request is
// same-origin and needs no host permission (measured 2026-09-18: 200 for a paper with an HTML version, 404 for one
// without). A paper arXiv says has no HTML version keeps the button; the panel's HTML entry is disabled there, saying
// why (UI.md S-P-33).
//
// On this experiment branch the page opens in the bilingual PDF reader instead (experiments/pdf-bilingual, #290), laid
// over the browser's viewer, which stays underneath, when the settings say so (`pdfReader.enabled`) or the address
// asks for it (`#readarxiv`, which asks for a translation too): the address stays the paper's, and the reader's way
// back to the browser's viewer takes the reader away and shows the floating button. A browser the reader's PDF.js
// cannot run on (pdf-reader/support.ts) keeps the page as it was, with the floating button.
import { htmlUrlOf, paperIdFromPdfPath, pdfUrlOf, readerWanted, sourceKindOf, translatedHtmlUrlOf } from '@/core/pdf/entry'
import { readerRuns } from '@/pdf-reader/support'
import { announceUsablePage } from '@/shared/action-icon'
import { answerEntryMessages } from '@/shared/entry-page'
import { watchEntrySettings } from '@/shared/entry-settings'
import { installFloatingButton } from '@/shared/floating'

export default defineContentScript({
  matches: ['https://arxiv.org/pdf/*'],
  runAt: 'document_idle',
  async main() {
    /** the reader laid over the page: the popup acts on it, by the settings (the reader's design, §9.2) */
    let readerOn = false
    const id = paperIdFromPdfPath(location.pathname)
    if (id === null) return
    // Lit before the check below: the popup works here whether or not the paper has an HTML version, and says which
    announceUsablePage()

    // Only the head: the HTML full text is hundreds of kilobytes, and all that is asked here is whether it exists.
    // **Only arXiv saying so means there is none** (404, or 410): a request that failed, a 429 or a 5xx say nothing
    // about the paper, and "arXiv has no HTML version" would then be a false statement the reader is left with until
    // a reload (Devin on #247). Unknown, the link is offered: at worst it leads to arXiv's own answer
    const htmlStatus = fetch(htmlUrlOf(id, location.origin), { method: 'HEAD', credentials: 'omit' })
      .then(res => res.status)
      .catch(() => null)
    // Whether the paper can be had as a bilingual PDF (the reader's design, §2): one HEAD on its source, same-origin as
    // the HTML one and at the same time. A PDF-only submission answers application/pdf; anything else leaves the entry
    // offered. A browser that cannot run the reader offers none
    const sourceKind = readerRuns()
      ? fetch(`${location.origin}/src/${id}`, { method: 'HEAD', credentials: 'omit' })
          .then(res => (res.ok ? sourceKindOf(res.headers.get('content-type')) : 'unknown'))
          .catch(() => 'unknown' as const)
      : null
    const [status, source] = await Promise.all([htmlStatus, sourceKind])
    const href = status === 404 || status === 410 ? null : translatedHtmlUrlOf(id, location.origin)
    const pdf = source === null || source === 'pdf-only' ? null : pdfUrlOf(id, location.origin)
    // The popup asks this page what it is (UI.md S-P-03b): the same answer the floating button is built from
    answerEntryMessages({ kind: 'pdf', paper: () => id, html: () => href, pdf: () => pdf, readerOpen: () => readerOn })
    // the floating button, once: the reader may be opened and left more than once on one page
    let installed: ReturnType<typeof installFloatingButton> | null = null
    const button = () => (installed ??= installFloatingButton(document, {
      main: { kind: 'panel' },
      // The abstract page's sentence (UI.md S-I-06): one offer, made wherever the paper is
      label: S => (href !== null || pdf !== null ? S.page.abstractLink(S.brand) : S.note.noHtml),
    }))
    const open = async (translate: boolean) => {
      if (readerOn) return
      if (await openReader(id, translate, () => { readerOn = false; void button() })) readerOn = true
      else await button()
    }
    // The reader opens by the setting, or for an address that asks for it (the reader's design, §2). The hash is let go
    // once read, so that the popup's PDF entry setting it again on this very page is a change the page hears
    const wanted = readerWanted({ enabled: (await watchEntrySettings(() => undefined)).pdfReader, hash: location.hash })
    if (wanted.translate) history.replaceState(history.state, '', location.pathname + location.search)
    if (wanted.open) await open(wanted.translate)
    else await button()
    addEventListener('hashchange', () => {
      if (!readerWanted({ enabled: false, hash: location.hash }).open) return
      history.replaceState(history.state, '', location.pathname + location.search)
      void open(true)
    })
  },
})

/**
 * The bilingual PDF reader over the page, the extension's page pdf-reader.html: true once it is shown, false on a
 * browser it cannot run on. `translate`: the address asked for a translation (`ask=translate`, session.mjs). `closed`
 * runs when the reader asks for the browser's viewer
 */
async function openReader(id: string, translate: boolean, closed: () => void): Promise<boolean> {
  if (!readerRuns()) return false
  const url = browser.runtime.getURL(`/pdf-reader.html?${new URLSearchParams({ live: '1', paper: id, embedded: '1', ...(translate ? { ask: 'translate' } : {}) })}` as '/pdf-reader.html')
  const frame = document.createElement('iframe')
  frame.src = url
  frame.setAttribute('data-axt-pdf-reader', '')
  frame.setAttribute('allow', 'clipboard-write')
  Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', border: '0', zIndex: '2147483647', background: '#e9e9ec' })
  document.documentElement.append(frame)
  frame.focus()
  // the reader's own page alone takes it away: a page its frame has been sent to has another origin (Devin on #297)
  const origin = new URL(url).origin
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== origin || (e.data as { type?: unknown } | null)?.type !== 'axt-pdf-reader-close') return
    removeEventListener('message', onMessage)
    frame.remove()
    closed()
  }
  addEventListener('message', onMessage)
  return true
}
