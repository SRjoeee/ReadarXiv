// The bilingual entry on arXiv's PDF page (issue #169). **This one thing only**: no part of the translation
// pipeline is loaded here, as on the abstract page.
//
// The check is one `HEAD` on `arxiv.org/html/<id>`: this script runs at arXiv's own origin, so that request is
// same-origin and needs no host permission (measured 2026-09-18: 200 for a paper with an HTML version, 404 for one
// without). A paper with no HTML version gets no entry — there is nothing to offer, so nothing is shown.
import { LOCALES, pickLocale } from '@/locales'
import { htmlUrlOf, paperIdFromPdfPath, PDF_ENTRY_CLASS, translatedHtmlUrlOf } from '@/core/pdf/entry'
import { type DockPlacement, type FloatingEntry, type FloatingEntryStrings, mountFloatingEntry } from '@/core/pdf/floating'
import { sendMessage } from '@/shared/messages'
import { answerEntryMessages } from '@/shared/entry-page'

/** Where the floating button's feedback leads: the issue tracker, with nothing about the page the reader was on */
const FEEDBACK_URL = 'https://github.com/SRjoeee/ReadarXiv/issues/new'

/** What this script reads of the stored configuration; the schema itself stays out of this bundle */
interface SavedBits {
  uiLanguage?: string
  reading?: { openIn?: string }
  floatingEntry?: { enabled?: boolean; side?: string; position?: number; locked?: boolean }
}

/** Shown unless the reader turned it off (config `floatingEntry.enabled`, v17) */
const enabledOf = (config: SavedBits | undefined) => config?.floatingEntry?.enabled !== false
/** Where the translation opens (config `reading.openIn`, v16): a new tab unless the reader chose this one */
const newTabOf = (config: SavedBits | undefined) => config?.reading?.openIn !== 'same-tab'
/** The saved placement, each field falling back to the default on its own (config v17) */
const placementOf = (config: SavedBits | undefined): DockPlacement => ({
  side: config?.floatingEntry?.side === 'left' ? 'left' : 'right',
  position: typeof config?.floatingEntry?.position === 'number' ? config.floatingEntry.position : 0.66,
  locked: config?.floatingEntry?.locked === true,
})
/** The words of the reader's interface language; the entry's own name is the abstract page's sentence (UI.md S-I-06) */
function stringsOf(uiLanguage: string | undefined, languages: readonly string[]): FloatingEntryStrings {
  const { S } = LOCALES[pickLocale(uiLanguage, languages)]
  return { open: S.page.abstractLink(S.brand), settings: S.settings, ...S.page.floating }
}
/** The background writes it (`axt:set-floating-entry`), so it passes the configuration's one write gate */
const save = (patch: { enabled?: boolean } & Partial<DockPlacement>) =>
  void sendMessage({ type: 'axt:set-floating-entry', patch }).catch(() => undefined)

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
    // that needs a few sentences, and this one runs on every arXiv PDF opened
    const stored = await browser.storage.local.get('config').catch(() => ({}))
    let saved = (stored as { config?: SavedBits }).config
    const ui = browser.i18n?.getUILanguage?.()
    const languages = ui ? [ui] : [navigator.language]
    const href = translatedHtmlUrlOf(id, location.origin)
    /** Hidden from the close menu for this page: the switch stays on, and a reload brings the entry back */
    let hiddenForNow = false
    let entry: FloatingEntry | null = null

    const mount = () => {
      const host = document.createElement('div')
      host.className = PDF_ENTRY_CLASS
      document.body.append(host)
      entry = mountFloatingEntry(document, host, {
        href,
        newTab: newTabOf(saved),
        // Our mark in place of Read Frog's mascot; the page may load it because the manifest says so
        iconUrl: browser.runtime.getURL('/icon/mark.svg'),
        feedbackUrl: FEEDBACK_URL,
        placement: placementOf(saved),
        strings: stringsOf(saved?.uiLanguage, languages),
        onPlacement: ({ side, position, locked }) => save({ side, position, locked }),
        onSettings: () => void sendMessage({ type: 'axt:open-settings' }).catch(() => undefined),
        onHide: scope => {
          entry = null
          if (scope === 'now') hiddenForNow = true
          // For good: the settings page has the switch that brings it back (UI.md S-O-49c)
          else save({ enabled: false })
        },
      })
    }
    if (enabledOf(saved)) mount()

    browser.storage.local.onChanged.addListener(changes => {
      const next = changes.config?.newValue as SavedBits | undefined
      if (next === undefined) return
      saved = next
      // The settings switch, turned either way while the PDF is open
      if (!enabledOf(next)) {
        entry?.remove()
        entry = null
        return
      }
      if (entry === null) {
        if (!hiddenForNow) mount()
        return
      }
      entry.relabel(stringsOf(next.uiLanguage, languages))
      entry.retarget(newTabOf(next))
      // A drag saved in another tab, or the lock toggled there, moves this one too
      entry.place(placementOf(next))
    })
  },
})
