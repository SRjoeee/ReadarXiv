// The PDF page (issue #169): the floating button, whose main button opens the paper's HTML full text already
// translating. **This one thing only**: no part of the translation pipeline is loaded here, as on the abstract page.
//
// The check is one `HEAD` on `arxiv.org/html/<id>`: this script runs at arXiv's own origin, so that request is
// same-origin and needs no host permission (measured 2026-09-18: 200 for a paper with an HTML version, 404 for one
// without). A paper arXiv says has no HTML version keeps the button, its main button disabled and saying why — the
// same answer the popup gives there (UI.md S-P-33).
//
// On this experiment branch the page opens in the bilingual PDF reader instead (experiments/pdf-bilingual, #290), laid
// over the browser's viewer, which stays underneath: the address stays the paper's, and the reader's way back to the
// browser's viewer takes the reader away and shows the floating button. A build without the reader (the experiment's
// setup not run, as on CI) leaves the page as it was.
import { htmlUrlOf, paperIdFromPdfPath, translatedHtmlUrlOf } from '@/core/pdf/entry'
import { announceUsablePage } from '@/shared/action-icon'
import { answerEntryMessages } from '@/shared/entry-page'
import { installFloatingButton } from '@/shared/floating'

export default defineContentScript({
  matches: ['https://arxiv.org/pdf/*'],
  runAt: 'document_idle',
  async main() {
    const id = paperIdFromPdfPath(location.pathname)
    if (id === null) return
    // Lit before the check below: the popup works here whether or not the paper has an HTML version, and says which
    announceUsablePage()

    // Only the head: the HTML full text is hundreds of kilobytes, and all that is asked here is whether it exists.
    // **Only arXiv saying so means there is none** (404, or 410): a request that failed, a 429 or a 5xx say nothing
    // about the paper, and "arXiv has no HTML version" would then be a false statement the reader is left with until
    // a reload (Devin on #247). Unknown, the link is offered: at worst it leads to arXiv's own answer
    const status = await fetch(htmlUrlOf(id, location.origin), { method: 'HEAD', credentials: 'omit' })
      .then(res => res.status)
      .catch(() => null)
    const href = status === 404 || status === 410 ? null : translatedHtmlUrlOf(id, location.origin)
    // The popup asks this page what it is (UI.md S-P-03b): the same answer the floating button is built from
    answerEntryMessages({ paper: () => id, html: () => href })
    const button = () => installFloatingButton(document, {
      main: href !== null ? { kind: 'link', href } : { kind: 'none' },
      // The abstract page's sentence (UI.md S-I-06): one offer, made wherever the paper is
      label: S => (href !== null ? S.page.abstractLink(S.brand) : S.note.noHtml),
    })
    if (!(await openReader(id, () => void button()))) await button()
  },
})

/**
 * The bilingual PDF reader over the page, when this build has it: true once it is shown. `closed` runs when the reader
 * asks for the browser's viewer. The reader is copied into the build by wxt.config.ts, not a public asset WXT knows,
 * hence the untyped `getURL`
 */
async function openReader(id: string, closed: () => void): Promise<boolean> {
  const url = (browser.runtime.getURL as (path: string) => string)(`/pdf-reader/reader.html?${new URLSearchParams({ live: '1', paper: id, embedded: '1' })}`)
  if (!(await fetch(url, { method: 'HEAD' }).then(res => res.ok).catch(() => false))) return false
  const frame = document.createElement('iframe')
  frame.src = url
  frame.setAttribute('data-axt-pdf-reader', '')
  frame.setAttribute('allow', 'clipboard-write')
  Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', border: '0', zIndex: '2147483647', background: '#e9e9ec' })
  document.documentElement.append(frame)
  frame.focus()
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || (e.data as { type?: unknown } | null)?.type !== 'axt-pdf-reader-close') return
    removeEventListener('message', onMessage)
    frame.remove()
    closed()
  }
  addEventListener('message', onMessage)
  return true
}
