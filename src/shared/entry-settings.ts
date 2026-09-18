// What the scripts on arXiv's pages need of the reader's settings, asked of the background rather than read from
// storage (DESIGN §4.0c, §9). Two reasons, both Devin's on #248 / #251 and #250:
//
// - **One reading of the configuration.** A stored configuration this build cannot read is, everywhere else, replaced
//   whole by the defaults and said to be so (§9). A page that picked fields out of the raw value would follow a
//   configuration the rest of the extension had set aside — a newer build's `enabled: false`, a damaged `openIn`.
//   The background reads it once, validated, and the abstract and PDF scripts still load no schema.
// - **One writer of the floating button's state, and not in the configuration.** Where the button sits is written by
//   a drag, from any arXiv tab, at any moment. Inside the configuration that write was read-modify-write of the whole
//   object from one more context, and a whole-object write can put back a snapshot taken before another context's
//   save — a service or a key just added, gone. Under its own key, written only by the background and one write after
//   another, a drag cannot touch anything but itself.
import { sendMessage } from '@/shared/messages'

/** Where the floating button is, and whether it is shown at all (storage key `floatingEntry`, DESIGN §4.0c) */
export interface FloatingEntryState {
  enabled: boolean
  side: 'left' | 'right'
  /** Where the dock's top sits, as a fraction of the window's height */
  position: number
  locked: boolean
}
export const DEFAULT_FLOATING_ENTRY: FloatingEntryState = { enabled: true, side: 'right', position: 0.66, locked: false }

/** The two storage keys whose change means "ask again"; the values themselves are never read here */
const WATCHED_KEYS = ['config', 'floatingEntry']

export interface EntrySettings {
  /** `auto` or a locale code, as the configuration has it */
  uiLanguage: string
  /** Where the translation opens from an abstract or PDF page (config `reading.openIn`) */
  openIn: 'new-tab' | 'same-tab'
  /** This tab's zoom factor (`tabs.getZoom`); the floating button undoes it */
  zoom: number
  floating: FloatingEntryState
}
/** What a page runs on when the background does not answer: the defaults, as everywhere */
export const DEFAULT_ENTRY_SETTINGS: EntrySettings = { uiLanguage: 'auto', openIn: 'new-tab', zoom: 1, floating: DEFAULT_FLOATING_ENTRY }

/** One subscription per page, however many parts of it follow the settings (the abstract page has two) */
const followers: ((settings: EntrySettings) => void)[] = []
let current = DEFAULT_ENTRY_SETTINGS
let first: Promise<EntrySettings> | null = null

/**
 * The settings now, and again whenever they change: a save on the settings page, a drag in another tab, the tab's
 * zoom. `onSettings` is called once at the start and once per change, always with the whole of them.
 */
export function watchEntrySettings(onSettings: (settings: EntrySettings) => void): Promise<EntrySettings> {
  followers.push(onSettings)
  if (first !== null) return first.then(() => { onSettings(current); return current })
  const tell = () => { for (const follower of followers) follower(current) }
  const ask = async () => {
    current = await sendMessage({ type: 'axt:entry-settings' }).catch(() => current)
    tell()
    return current
  }
  browser.storage.local.onChanged.addListener(changes => {
    if (WATCHED_KEYS.some(key => key in changes)) void ask()
  })
  browser.runtime.onMessage.addListener((message: unknown) => {
    const changed = message as { type?: string; zoom?: unknown } | null
    if (changed?.type !== 'axt:zoom-changed' || typeof changed.zoom !== 'number') return undefined
    current = { ...current, zoom: changed.zoom }
    tell()
    return undefined
  })
  first = ask()
  return first
}
