// The bilingual entry on arXiv's PDF page (issue #169). **This one thing only**: no part of the translation
// pipeline is loaded here, as on the abstract page.
//
// The check is one `HEAD` on `arxiv.org/html/<id>`: this script runs at arXiv's own origin, so that request is
// same-origin and needs no host permission (measured 2026-09-18: 200 for a paper with an HTML version, 404 for one
// without). A paper with no HTML version gets no entry — there is nothing to offer, so nothing is shown.
import { LOCALES, pickLocale } from '@/locales'
import { htmlUrlOf, injectPdfEntry, paperIdFromPdfPath, relabelPdfEntry, retargetPdfEntry, translatedHtmlUrlOf } from '@/core/pdf/entry'
import { answerEntryMessages } from '@/shared/entry-page'

export default defineContentScript({
  matches: ['https://arxiv.org/pdf/*'],
  runAt: 'document_idle',
  async main() {
    const id = paperIdFromPdfPath(location.pathname)
    if (id === null) return

    // Only the head: the HTML full text is hundreds of kilobytes, and all that is asked here is whether it exists
    const exists = await fetch(htmlUrlOf(id, location.origin), { method: 'HEAD', credentials: 'omit' })
      .then(res => res.ok)
      .catch(() => false)
    // The popup asks before the answer is needed on screen, so it is answered whether or not an entry is drawn:
    // with no HTML version the popup's translate button is there and disabled (UI.md S-P-03b)
    answerEntryMessages({ paper: () => id, html: () => (exists ? translatedHtmlUrlOf(id, location.origin) : null) })
    if (!exists) return

    // The locale pack directly, as on the abstract page: `@/ui/strings` would pull 179 language names into a script
    // that needs one sentence, and this one runs on every arXiv PDF opened
    const stored = await browser.storage.local.get('config').catch(() => ({}))
    const saved = (stored as { config?: { uiLanguage?: string; reading?: { openIn?: string } } }).config
    const chosen = saved?.uiLanguage
    // Where the translation opens (config `reading.openIn`, v16): a new tab unless the reader chose this one
    const newTabOf = (reading: { openIn?: string } | undefined) => reading?.openIn !== 'same-tab'
    const ui = browser.i18n?.getUILanguage?.()
    const languages = ui ? [ui] : [navigator.language]
    const label = (uiLanguage: string | undefined) => {
      const { S } = LOCALES[pickLocale(uiLanguage, languages)]
      // The same sentence as the abstract page's entry (UI.md S-I-06): one offer, made on two pages
      return S.page.abstractLink(S.brand)
    }
    injectPdfEntry(document, { label: label(chosen), href: translatedHtmlUrlOf(id, location.origin), newTab: newTabOf(saved?.reading) })

    browser.storage.local.onChanged.addListener(changes => {
      const next = changes.config?.newValue as { uiLanguage?: string; reading?: { openIn?: string } } | undefined
      if (next === undefined) return
      if (next.uiLanguage !== undefined) relabelPdfEntry(document, label(next.uiLanguage))
      retargetPdfEntry(document, newTabOf(next.reading))
    })
  },
})
