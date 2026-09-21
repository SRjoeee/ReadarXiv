// The bilingual entry on the abstract page (issue #146). **This one thing only**: not a line of the translation pipeline is loaded.
//
// The locale pack is read directly, not through `@/ui/strings`: that module pulls in 179 language names and the
// appearance module, and this script runs on every arXiv abstract page. All it needs is one sentence (Codex on #161: the sentence used to be hard-coded Chinese).
import { LOCALES, pickLocale } from '@/locales'
import { htmlHrefOn, injectBilingualLink, relabelBilingualLink, retargetBilingualLink } from '@/core/abstract/link'
import { paperIdFrom } from '@/core/paper-id'
import { announceUsablePage } from '@/shared/action-icon'
import { answerEntryMessages } from '@/shared/entry-page'
import { watchEntrySettings } from '@/shared/entry-settings'
import { installFloatingButton } from '@/shared/floating'

export default defineContentScript({
  matches: ['https://arxiv.org/abs/*'],
  runAt: 'document_idle',
  async main() {
    announceUsablePage()
    // The interface language and where the translation opens come from the background, validated
    // (shared/entry-settings.ts): this script loads no schema and reads no raw stored value
    const ui = browser.i18n?.getUILanguage?.()
    const languages = ui ? [ui] : [navigator.language]
    const label = (uiLanguage: string) => {
      const { S } = LOCALES[pickLocale(uiLanguage, languages)]
      return S.page.abstractLink(S.brand)
    }
    // The first answer inserts the line; every later one — the settings page stays open beside this one — relabels
    // and retargets it (Codex on #161)
    void watchEntrySettings(settings => {
      const newTab = settings.openIn === 'new-tab'
      if (!injectBilingualLink(document, label(settings.uiLanguage), { newTab })) {
        relabelBilingualLink(document, label(settings.uiLanguage))
        retargetBilingualLink(document, newTab)
      }
    })

    // The popup asks this page what it is: on an abstract page the translate button works, and takes the reader to
    // the HTML version to translate it there (UI.md S-P-03b, the maintainer 2026-09-18)
    answerEntryMessages({ paper: () => paperIdFrom(location.pathname, 'abs'), html: () => htmlHrefOn(document) })

    // The floating button (DESIGN §4.0c), as on the PDF and the full text: here its main button follows the href
    // arXiv gives, read once — the abstract page does not change under the reader
    const href = htmlHrefOn(document)
    void installFloatingButton(document, {
      main: href !== null ? { kind: 'link', href } : { kind: 'none' },
      label: S => (href !== null ? S.page.abstractLink(S.brand) : S.note.noHtml),
    })
  },
})
