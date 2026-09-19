// The configuration as a surface sees it (DESIGN §9). A surface is one of the extension's own pages — the popup, the
// settings page — and each reads, changes and follows the same stored configuration. What that takes was written out
// twice, in the popup's data layer and in the settings page's, and the two had begun to differ; it lives here once,
// behind an interface with no React in it, and each surface is an adapter of a few lines.
//
// Three rules, each of them a defect once:
//
// - **Every write is a patch on top of what storage holds now, and the writes run one after another.** The mounted
//   snapshot is stale as soon as the page writes its mode or another surface saves, and two controls changed before
//   the first write lands would both read the same snapshot, the later write dropping the earlier change (Codex on #39
//   and #157). A write that throws does not stop the ones behind it.
// - **A change saved elsewhere is re-read on that same chain**, not taken from the event: events carry no order, and
//   one for an earlier write can arrive after a later write was already shown (#182). The first read is queued there
//   too, so a slow one cannot land after a newer reading.
// - **A stored interface language that resolves to another pack than the one in use takes a reload**, the locale being
//   chosen once before the first paint — but not under a draft, which the reload would discard, and not before the
//   surface's own queued writes have landed (local review; Codex on #185).
//
// The serialisation is per surface. The popup, the settings page and the page being translated each read, patch and
// write from their own context, and nothing orders a write here against one there; one writer in the background would
// (as for the floating button's state, background/floating-entry.ts), at the price of turning every patch — a function
// of the latest value today — into a named operation that can cross a message. Left until a lost write is seen.
import { chainRevision } from '@/config/revision'
import type { Config } from '@/config/schema'
import { ConfigUnreadableError, type FallbackReason, configFallbackReason, getConfig, resetConfig, setConfig, watchConfig } from '@/config/storage'
import { sendMessage } from './messages'
import { type PackState, createPackLookup } from './pack'

/** What a surface shows of the configuration: one state, published whole, so its parts never disagree */
export interface SurfaceConfigState {
  /** The configuration in effect; null until the first read lands */
  config: Config | null
  /** The digest of `config`'s chain settings (config/revision.ts), set with it: a configuration shown beside the previous one's digest would call a page current that is behind it (local review) */
  revision: string | null
  /** Why the stored configuration fell back to the defaults, if it did; worded by the surface (ui/strings.ts) */
  fallbackReason: FallbackReason | null
  /** The last reset was refused by storage */
  resetFailed: boolean
  /** The offline service's language pack for the configuration's target language (§8.4); null while it is looked up */
  pack: PackState | null
}

/** Where a configuration that just landed came from; `refused` is what stays in effect after a write the store refused */
export type Landing = 'first' | 'own' | 'elsewhere' | 'refused'

export interface SurfaceConfigDeps {
  /** Does this configuration's interface language resolve to another pack than the one the surface was painted in */
  localeStale(config: Config): boolean
  reload(): void
  /** What holds a reload back while it lasts — the settings page's drafts (ui/drafts.ts). Absent, nothing does */
  holds?: { any(): boolean; whenNone(fn: () => void): void }
  /** After a configuration was published, on the chain: the popup asks the background for the chain it now gives */
  onLanded?(config: Config, from: Landing): void
  /** The pack lookup's own seams, for the tests (shared/pack.ts) */
  packState?: (target: string) => Promise<PackState>
  announce?: (target: string) => void
}

export interface SurfaceConfig {
  /** Read the configuration and follow it; returns the way to stop. Nothing is read before this */
  start(): () => void
  state(): SurfaceConfigState
  subscribe(listener: () => void): () => void
  /**
   * Change the stored configuration, on top of what storage holds when this write's turn comes. Resolves with what
   * was stored. While the stored value cannot be read the store refuses (config/storage.ts): the state then shows
   * what is in effect and why, and this rejects with the `ConfigUnreadableError` — a surface that has a notice for it
   * catches it, one that reports errors lets it through
   */
  patch(change: (latest: Config) => Config): Promise<Config>
  /** Replace a stored configuration that cannot be read with the defaults, on the same chain (S-O-02). Resolves with what is in effect after; a refusal by storage shows as `resetFailed` */
  reset(): Promise<Config>
  /** Look the pack up for a language the reader just chose */
  checkPack(target: string): Promise<PackState>
  /** Download `target`'s pack — `run` does it, from the click itself (shared/pack.ts says why) — and tell the other surfaces */
  downloadPack(target: string, run: (target: string) => Promise<unknown>): Promise<void>
  /** Another surface's download of `target` ended (`axt:pack-changed`) */
  receivePack(target: string): void
}

export function createSurfaceConfig(deps: SurfaceConfigDeps): SurfaceConfig {
  let current: SurfaceConfigState = { config: null, revision: null, fallbackReason: null, resetFailed: false, pack: null }
  const listeners = new Set<() => void>()
  const publish = (next: Partial<SurfaceConfigState>) => {
    current = { ...current, ...next }
    for (const listener of [...listeners]) listener()
  }
  /**
   * The lookups' bookkeeping (shared/pack.ts): the committed configuration owns the wanted target — set where the
   * configuration lands, and another target forgets the previous one's state at once, so no surface shows, or acts
   * on, the old language's availability (Codex on #185)
   */
  const packs = createPackLookup({
    publish: pack => publish({ pack }),
    ...(deps.packState ? { state: deps.packState } : {}),
    // The other surface may be open beside this one: tell it the download ended, as the helper's state is told
    announce: deps.announce ?? (target => void sendMessage({ type: 'axt:pack-changed', target }).catch(() => undefined)),
  })

  /** The chain every read and write of this surface queues on. It never rejects: a link's failure is its caller's */
  let chain: Promise<unknown> = Promise.resolve()
  const queue = <T>(run: () => Promise<T>): Promise<T> => {
    const result = chain.then(run)
    chain = result.catch(() => undefined)
    return result
  }

  /** A configuration takes effect here: the wanted pack first, then the configuration with its digest, as one */
  const land = async (config: Config, fallbackReason: FallbackReason | null, from: Landing, more: Partial<SurfaceConfigState> = {}) => {
    packs.want(config.targetLanguage)
    publish({ config, revision: await chainRevision(config), fallbackReason, ...more })
    deps.onLanded?.(config, from)
  }

  /**
   * The reload a stale interface language takes. It waits for whatever holds it, then for this surface's own writes:
   * a draft's save is queued on the chain in the same breath as its editor closes, and a reload issued at once would
   * cut it off before its read of the store came back — and it looks again after the wait, since a draft opened or a
   * save queued meanwhile is owed the same. A second change while it waits adds nothing
   */
  let reloadDue = false
  const reloadWhenFree = () => {
    if (reloadDue) return
    reloadDue = true
    const held = () => deps.holds?.any() ?? false
    const settle = () => (deps.holds?.whenNone ?? (fn => fn()))(() => {
      const waitedFor = chain
      void waitedFor.then(() => { if (held() || chain !== waitedFor) settle(); else deps.reload() })
    })
    settle()
  }

  /** One reading of the store, on the chain: the first, or the one a change saved elsewhere asks for */
  const read = (from: 'first' | 'elsewhere') => queue(async () => {
    const stored = await getConfig()
    if (deps.localeStale(stored)) {
      // Compared with the locale in use, not with a value recorded here: a change landing between the locale's read
      // and this surface's first one would otherwise pass unnoticed (Codex on #185)
      const held = deps.holds?.any() ?? false
      reloadWhenFree()
      // With nothing in the way the surface is about to be painted again in the right language: showing these
      // settings under the old one's labels first would only flash. Held back, the other settings follow meanwhile
      if (!held) return stored
    }
    // A valid write elsewhere is the repair of a configuration this surface had to fall back from (Codex on #185); the
    // line about a refused reset goes with it, or it would come back with the next fallback nobody reset
    const reason = configFallbackReason()
    await land(stored, reason, from, reason === null ? { resetFailed: false } : {})
    void packs.check(stored.targetLanguage)
    return stored
  })

  return {
    start() {
      void read('first').catch(() => undefined)
      return watchConfig(() => void read('elsewhere').catch(() => undefined))
    },
    state: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    patch: change => queue(async () => {
      const latest = await getConfig()
      const next = change(latest)
      try {
        await setConfig(next)
      } catch (e) {
        // Refused, storage as it was: the surface goes on showing what is in effect, with the reason
        if (e instanceof ConfigUnreadableError) await land(latest, e.reason, 'refused')
        throw e
      }
      // An accepted write proves the stored value readable: a notice still up is from before a repair made elsewhere
      await land(next, null, 'own', { resetFailed: false })
      return next
    }),
    reset: () => queue(async () => {
      try {
        await resetConfig()
      } catch {
        // Storage refused the write (IO, quota): the notice stays, and says the reset did not go through — a click
        // that changes nothing and says nothing reads as a button that does not work
        publish({ resetFailed: true })
        return getConfig()
      }
      const next = await getConfig()
      await land(next, configFallbackReason(), 'own', { resetFailed: false })
      return next
    }),
    checkPack: packs.check,
    downloadPack: packs.download,
    receivePack: packs.receive,
  }
}
