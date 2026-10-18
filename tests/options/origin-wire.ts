// The settings page's side of the host permissions, for the page's tests (permissions.ts `holdOrigin`,
// `giveBackUnneeded`): the holds every context shares, the browser's grants, and the background's give-back, which
// runs the real rule (config/origins.ts) over the stored configuration the test names. The chains still serving
// sessions are the background's to add, and have their own tests (tests/background/origin-keeper.test.ts)
import { manifestOrigins, originHold, originsNeeded, readHold, reconcileOrigins } from '@/config/origins'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'

/** The manifest's own hosts, as wxt.config.ts declares them: never given back */
const MANIFEST = manifestOrigins({ host_permissions: ['https://openrouter.ai/*', 'https://translate-pa.googleapis.com/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*'] })

export const origins = {
  /** what the browser has granted, as patterns */
  granted: new Set<string>(),
  /** the lock names held now, in every context: one entry per hold */
  holds: [] as string[],
  /** what is stored, and whether a read can say so */
  stored: (): Config => DEFAULT_CONFIG,
  readable: (): boolean => true,
  /** where the give-backs are written, in order with the test's own lines */
  log: [] as string[],
  /** set, the next holds are granted only once it settles: the lock manager answering late */
  grantedLate: null as Promise<void> | null,
  /** set, a page's ask goes to it — a real keeper over this state — instead of the rule run in place */
  background: null as (() => Promise<unknown>) | null,
  reset(log: string[], granted: readonly string[] = []) {
    this.granted = new Set(granted)
    this.holds = []
    this.stored = () => DEFAULT_CONFIG
    this.readable = () => true
    this.log = log
    this.grantedLate = null
    this.background = null
  },
  holdOrigin(url: string, service?: string) {
    const name = originHold(url, service)
    if (!name) return { ready: Promise.resolve(), release: async () => {} }
    origins.holds.push(name)
    let held = true
    return {
      ready: origins.grantedLate ?? Promise.resolve(),
      release: async () => {
        if (!held) return
        held = false
        const at = origins.holds.indexOf(name)
        if (at >= 0) origins.holds.splice(at, 1)
      },
    }
  },
  /** The background's sweep, as origin-keeper.ts runs it: the real rule over the grants, the holds and the stored value */
  async giveBackUnneeded() {
    if (origins.background) {
      await origins.background()
      return
    }
    const needed = originsNeeded(origins.stored(), origins.holds.map(name => readHold(name)!.origin))
    const { remove } = reconcileOrigins({ granted: [...origins.granted], needed, settingsReadable: origins.readable(), manifest: MANIFEST })
    for (const origin of remove) {
      origins.granted.delete(origin)
      origins.log.push(`remove ${origin}`)
    }
  },
}
