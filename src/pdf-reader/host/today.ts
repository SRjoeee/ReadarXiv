// Today's reader behind the one chrome (AXT_READER 'today', the reader the released extension reads with; the build's default is
// 'v2' since 2026-11-13: stage 5a; it goes with the cut-over, stage 5's deletion list): its session (session/host.ts on the
// engine's view, its run on our server's v1 layer) opened in the chrome's panes, its events told to the chrome's controller
// with the extension's configuration as the one preference model, and the chrome's patches written as configuration changes.
import type { Session as ChromeSession, SessionHost as ChromeHost, ReaderController } from '@readarxiv/reader'
import type { Config } from '@/config/schema'
import type { ConfigReading } from '@/config/storage'
import type { PackState } from '@/shared/pack'
import type { Session } from '../session/events'
import { prefsOf, withPrefs } from './prefs'
import type { ConfigStore } from './slots'

/** the configuration the slots read: what the session last told, and its writes, held until the session is open */
export function configStore(first: Config | null): ConfigStore & { told(config: Config, pack: PackState | null): void; open(s: Session): void } {
  let state: { config: Config | null; pack: PackState | null } = { config: first, pack: null }
  let session: Session | null = null
  const held: ((c: Config) => Config)[] = []
  const listeners = new Set<() => void>()
  return {
    state: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    patch(change) {
      if (session) session.patchSettings(change)
      else held.push(change)
    },
    told(config, pack) {
      if (config === state.config && pack === state.pack) return
      state = { config, pack }
      for (const l of [...listeners]) l()
    },
    open(s) {
      session = s
      for (const change of held.splice(0)) s.patchSettings(change)
    },
  }
}

/** the chrome's `open`: today's session in the chrome's panes */
export function todayOpen(o: { params: URLSearchParams; reading: ConfigReading | null; store: ReturnType<typeof configStore> }): (host: ChromeHost) => Promise<ChromeSession> {
  return async host => {
    const { openReader } = await import('@/pdf-reader/session/host')
    const session = await openReader({
      left: host.left,
      right: host.right,
      params: o.params,
      reading: o.reading,
      emit: e => {
        if (e.type === 'settings') {
          o.store.told(e.config, e.pack)
          host.emit({ type: 'prefs', prefs: prefsOf(e.config) })
          return
        }
        // every other event is the chrome's own vocabulary, as the types hold it (no cast: a word the chrome stops knowing fails the
        // build; the chain's error kinds the same, src/ui/strings.ts holds the two equal; tests/pdf-reader/today-vocabulary.test.ts
        // folds each through the chrome)
        host.emit(e)
      },
    })
    o.store.open(session)
    return { ...session, setPrefs: patch => session.patchSettings(c => withPrefs(c, patch)) }
  }
}

/** the controller as the probes read it (`window.__reader.controller`: tests/e2e, lab/pdf/spikes): the chrome's, its state with
 *  the extension's settings and pack beside the preferences, and `patchSettings` writing a configuration change */
export function probeController(controller: ReaderController, store: ConfigStore) {
  return Object.assign(Object.create(controller) as ReaderController, {
    getState: () => ({ ...controller.getState(), settings: store.state().config, pack: store.state().pack }),
    patchSettings: (change: (latest: Config) => Config) => store.patch(change),
  })
}
