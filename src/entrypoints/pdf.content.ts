// The PDF page (issue #169): the floating button, whose main button opens the paper's HTML full text already
// translating. **This one thing only**: no part of the translation pipeline is loaded here, as on the abstract page.
//
// The check is one `HEAD` on `arxiv.org/html/<id>`: this script runs at arXiv's own origin, so that request is
// same-origin and needs no host permission (measured 2026-09-18: 200 for a paper with an HTML version, 404 for one
// without). A paper arXiv says has no HTML version keeps the button, its main button disabled and saying why — the
// same answer the popup gives there (UI.md S-P-33).
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
    await installFloatingButton(document, {
      main: href !== null ? { kind: 'link', href } : { kind: 'none' },
      // The abstract page's sentence (UI.md S-I-06): one offer, made wherever the paper is
      label: S => (href !== null ? S.page.abstractLink(S.brand) : S.note.noHtml),
    })
  },
})
