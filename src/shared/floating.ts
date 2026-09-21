// The floating button's life on a page (DESIGN §4.0c): mounted when the reader has it on, following the settings
// while the page stays open, and sending what its buttons ask for to the background. Shared by the three content
// scripts; the pages differ in what the main button does, and in nothing else.
//
// The settings come from the background, validated (shared/entry-settings.ts): this script reads no storage value
// and writes none. The button's own state is saved by the background too, and its answer is what the page shows —
// so a change that could not be saved does not look saved.
import { FLOATING_CLASS, type DockPlacement, type FloatingButton, type FloatingButtonStrings, type MainAction, mountFloatingButton } from '@/core/floating/button'
import { LOCALES, pickLocale, type Locale } from '@/locales'
import { type EntrySettings, type FloatingEntryState, watchEntrySettings } from '@/shared/entry-settings'
import { sendMessage } from '@/shared/messages'

const placementOf = ({ side, position, locked }: FloatingEntryState): DockPlacement => ({ side, position, locked })

export interface FloatingPage {
  main: MainAction
  /** The main button's words in the pack in force: what a click does now (`active`: the page shows its translation) */
  label: (S: Locale['S'], active: boolean) => string
}

export interface InstalledFloatingButton {
  /** The page began or stopped showing its translation: the tick and the main button's words follow */
  setActive: (active: boolean) => void
  /** Open the control panel: where a click that nothing could serve is explained */
  openPanel: () => void
}

export async function installFloatingButton(doc: Document, page: FloatingPage): Promise<InstalledFloatingButton> {
  const ui = browser.i18n?.getUILanguage?.()
  const languages = ui ? [ui] : [navigator.language]
  /**
   * The document that hosts Chrome's PDF viewer is never zoomed — the viewer takes the tab's zoom for the paper
   * (measured 2026-09-18: `devicePixelRatio` unchanged at a tab zoom of 1.5) — so there is nothing to undo there
   */
  const zoomed = doc.contentType !== 'application/pdf'
  /** Hidden from the close menu for this page: the switch stays on, and a reload brings the button back */
  let hiddenForNow = false
  let active = false
  let button: FloatingButton | null = null
  let settings: EntrySettings | null = null

  const strings = (from: EntrySettings): FloatingButtonStrings => {
    const { S } = LOCALES[pickLocale(from.uiLanguage, languages)]
    return { main: page.label(S, active), settings: S.settings, ...S.page.floating }
  }

  /** What the settings say, put on the page: the button there or not, its words, its link, its place, its size */
  const apply = (next: EntrySettings) => {
    // Turned on again on the settings page: that is the reader asking for it, and "hide for now" is over
    // (Devin on #251: it used to take a reload)
    if (settings !== null && !settings.floating.enabled && next.floating.enabled) hiddenForNow = false
    settings = next
    if (!next.floating.enabled || hiddenForNow) {
      button?.remove()
      button = null
      return
    }
    if (button === null) return mount(next)
    button.relabel(strings(next))
    button.retarget(next.openIn === 'new-tab')
    // A drag saved in another tab, or the lock toggled there, moves this one too
    button.place(placementOf(next.floating))
    button.rescale(zoomed ? next.zoom : 1)
  }

  /** Save a change of the button's own state; what the background says is stored is what the page then shows */
  const save = (patch: Partial<FloatingEntryState>) => {
    void sendMessage({ type: 'axt:set-floating-entry', patch })
      .then(({ floating }) => { if (settings) apply({ ...settings, floating }) })
      // No answer at all: the page keeps what it shows, and the next change of the settings corrects it
      .catch(() => undefined)
  }

  const mount = (from: EntrySettings) => {
    const host = doc.createElement('div')
    host.className = FLOATING_CLASS
    doc.body.append(host)
    button = mountFloatingButton(doc, host, {
      main: page.main,
      newTab: from.openIn === 'new-tab',
      zoom: zoomed ? from.zoom : 1,
      placement: placementOf(from.floating),
      strings: strings(from),
      // The control panel is the extension's own popup page, framed beside the button (button.ts)
      panelUrl: browser.runtime.getURL('/popup.html'),
      onPlacement: ({ side, position, locked }) => save({ side, position, locked }),
      // A page cannot open the settings page itself: the background does (`openOptionsPage`)
      onSettings: () => void sendMessage({ type: 'axt:open-settings' }).catch(() => undefined),
      onHide: scope => {
        // The button has taken itself off the page
        button = null
        if (scope === 'now') hiddenForNow = true
        // For good: the settings page has the switch that brings it back (UI.md S-O-49c). Not saved, it comes back
        else save({ enabled: false })
      },
    })
    button.activate(active)
  }

  await watchEntrySettings(apply)

  return {
    setActive: next => {
      active = next
      button?.activate(next)
      if (settings) button?.relabel(strings(settings))
    },
    openPanel: () => button?.openPanel(),
  }
}
