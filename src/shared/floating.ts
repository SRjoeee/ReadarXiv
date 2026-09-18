// The floating button's life on a page (DESIGN §4.0c): mounted when the reader has it on, following the saved
// settings while the page stays open, and sending what its buttons ask for to the background. Shared by the three
// content scripts; the pages differ in what the main button does, and in nothing else.
//
// The saved configuration is read **raw**, field by field, never through `getConfig`: that would pull zod, the whole
// schema and the language table into the abstract and PDF scripts, which run on every such page opened and need five
// fields. A field that is missing or malformed falls back on its own. Writes do go through the gate: the background
// makes them (`axt:set-floating-entry`), so a page never writes `local:config` itself.
import { FLOATING_CLASS, type DockPlacement, type FloatingButton, type FloatingButtonStrings, type MainAction, mountFloatingButton } from '@/core/floating/button'
import { LOCALES, pickLocale, type Locale } from '@/locales'
import { sendMessage } from '@/shared/messages'

/** What this module reads of the stored configuration */
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

export interface FloatingPage {
  main: MainAction
  /** The main button's words in the pack in force: what a click does now (`active`: the page shows its translation) */
  label: (S: Locale['S'], active: boolean) => string
}

export interface InstalledFloatingButton {
  /** The page began or stopped showing its translation: the tick and the main button's words follow */
  setActive: (active: boolean) => void
}

const save = (patch: { enabled?: boolean } & Partial<DockPlacement>) =>
  void sendMessage({ type: 'axt:set-floating-entry', patch }).catch(() => undefined)

export async function installFloatingButton(doc: Document, page: FloatingPage): Promise<InstalledFloatingButton> {
  const stored = await browser.storage.local.get('config').catch(() => ({}))
  let saved = (stored as { config?: SavedBits }).config
  const ui = browser.i18n?.getUILanguage?.()
  const languages = ui ? [ui] : [navigator.language]
  /** Hidden from the close menu for this page: the switch stays on, and a reload brings the button back */
  let hiddenForNow = false
  let active = false
  let button: FloatingButton | null = null

  const strings = (): FloatingButtonStrings => {
    const { S } = LOCALES[pickLocale(saved?.uiLanguage, languages)]
    return { main: page.label(S, active), settings: S.settings, ...S.page.floating }
  }

  const mount = () => {
    const host = doc.createElement('div')
    host.className = FLOATING_CLASS
    doc.body.append(host)
    button = mountFloatingButton(doc, host, {
      main: page.main,
      newTab: newTabOf(saved),
      // The page may load the mark because the manifest says so (`web_accessible_resources`, arXiv only)
      iconUrl: browser.runtime.getURL('/icon/mark.svg'),
      placement: placementOf(saved),
      strings: strings(),
      onPlacement: ({ side, position, locked }) => save({ side, position, locked }),
      // Neither can be opened from a page: the background opens the popup and the settings (`action.openPopup`, `openOptionsPage`)
      onPanel: () => void sendMessage({ type: 'axt:open-popup' }).catch(() => undefined),
      onSettings: () => void sendMessage({ type: 'axt:open-settings' }).catch(() => undefined),
      onHide: scope => {
        button = null
        if (scope === 'now') hiddenForNow = true
        // For good: the settings page has the switch that brings it back (UI.md S-O-49c)
        else save({ enabled: false })
      },
    })
    button.activate(active)
  }
  if (enabledOf(saved)) mount()

  browser.storage.local.onChanged.addListener(changes => {
    const next = changes.config?.newValue as SavedBits | undefined
    if (next === undefined) return
    saved = next
    // The settings switch, turned either way while the page is open
    if (!enabledOf(next)) {
      button?.remove()
      button = null
      return
    }
    if (button === null) {
      if (!hiddenForNow) mount()
      return
    }
    button.relabel(strings())
    button.retarget(newTabOf(next))
    // A drag saved in another tab, or the lock toggled there, moves this one too
    button.place(placementOf(next))
  })

  return {
    setActive: next => {
      active = next
      button?.activate(next)
      button?.relabel(strings())
    },
  }
}
