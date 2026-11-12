// The reader package whole behind the one chrome (AXT_READER 'v2'): `openReader` with the extension's Host (interfaces/host
// DECISION, design-a §2 caller 2). The host gives the network (our server and arXiv, nothing else; no credentials, no
// referrer), where arXiv's bytes are read (the tab's own PDF), the preferences over the extension's configuration, and the
// rows made here through the background; the reader's state is told to the chrome as the chrome's events (the package's
// `eventsOf`), and the chrome's commands are the reader's.
import type { Host, Prefs, PrefStore, PrefsPatch, ReaderState, Session as ChromeSession, SessionEvent, SessionHost as ChromeHost } from '@readarxiv/reader'
import type { PaperStore } from '@/cache/paper-store'
import type { SurfaceConfig } from '@/shared/surface-config'
import type { TranslationTransport } from '@/providers/transport'
import { prefsOf, withPrefs } from './prefs'
import { storedFetch } from './stored-fetch'
import { hostTranslate } from './translate'

/** the network as the reader may use it: our server (a path, resolved against it) and arXiv, by https; a server on this
 *  machine where the build allows one (a probe's stand-in); anything else refused before a request goes out. Never the
 *  visitor's credentials, never a referrer: only the paper's id and version leave the machine (reader-hosts-data §16) */
export function hostFetch(o: { api: string; loopback: boolean; fetch?: typeof fetch }): Host['fetch'] {
  const go = o.fetch ?? globalThis.fetch.bind(globalThis)
  const ours = new URL(o.api).origin
  return (url, init) => {
    let u: URL
    try {
      u = new URL(url, o.api)
    } catch {
      return Promise.reject(new TypeError(`not a URL: ${url}`))
    }
    const local = o.loopback && u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
    if (u.username || u.password || !(u.origin === ours || u.origin === 'https://arxiv.org' || local)) return Promise.reject(new TypeError(`not a host the reader reads: ${u.origin}`))
    return go(u.href, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' })
  }
}

/** the preferences over the extension's configuration surface (shared/surface-config.ts): a read is its first landing, a write
 *  its patch on the latest stored (host/prefs.ts withPrefs), a landing from elsewhere told; a configuration stored and
 *  unreadable (the surface fell back to the defaults: `fallbackReason`) is told as `null`, the reader's unreadable settings
 *  (S-R-21; the reader package's PrefStore). Asked to translate (`#readarxiv` on the PDF's address, the PDF page's
 *  `ask=translate`: PDF-READER §2), the first read lets a stored original display go, so that the reader opens in the
 *  translated display the settings name and the next PDF opens as this one does (the old reader's session/host.ts displayFrom
 *  and its write of `pdfReader.original`) */
export function hostPrefs(surface: Pick<SurfaceConfig, 'state' | 'subscribe' | 'start' | 'patch'>, o: { askedToTranslate?: boolean } = {}): PrefStore {
  // (asked: the original let go at the first landing; written: read as let go until the write lands, or is refused)
  let letGo: 'asked' | 'written' | 'done' = o.askedToTranslate ? 'asked' : 'done'
  /** the preferences as stored now: undefined before the first landing, null where the stored ones cannot be read */
  const now = (): Prefs | null | undefined => {
    const s = surface.state()
    if (!s.config) return undefined
    if (s.fallbackReason) return null
    let config = s.config
    if (letGo !== 'done' && config.pdfReader.original) {
      if (letGo === 'asked') {
        letGo = 'written'
        surface.patch(c => ({ ...c, pdfReader: { ...c.pdfReader, original: false } })).catch(() => { letGo = 'done' })
      }
      config = { ...config, pdfReader: { ...config.pdfReader, original: false } }
    } else letGo = 'done'
    return prefsOf(config, { revision: s.revision })
  }
  return {
    read: () =>
      new Promise<Prefs | null>(resolve => {
        const p = now()
        if (p !== undefined) return resolve(p)
        const off = surface.subscribe(() => {
          const q = now()
          if (q !== undefined) {
            off()
            resolve(q)
          }
        })
        surface.start()
      }),
    write: patch => surface.patch(c => withPrefs(c, patch as PrefsPatch)).then(() => undefined),
    watch(listener) {
      return surface.subscribe(() => {
        const p = now()
        if (p !== undefined) listener(p)
      })
    },
  }
}

export function extensionHost(o: { api: string; loopback: boolean; pdf: (ref: string) => string; prefs: PrefStore; transport: TranslationTransport; paper: string; store?: PaperStore | null }): Host {
  return { fetch: storedFetch({ fetch: hostFetch(o), store: o.store ?? null, api: o.api }), original: o.pdf, prefs: o.prefs, translate: hostTranslate({ transport: o.transport, paper: o.paper }) }
}

/** the session of an address that names no paper: nothing to show or load; what the reader chooses written as settings */
function noPaper(prefs: PrefStore): ChromeSession {
  // (the extension's store merges a patch's classes and highlight into the stored ones: host/prefs.ts withPrefs)
  const write = (patch: PrefsPatch) => void prefs.write(patch as Partial<Prefs>).catch(() => {})
  return {
    setDisplay: display => write({ display }),
    setSyncMode: m => write({ sync: m === 'same' }),
    zoomBy: () => {},
    zoomTo: () => {},
    goToPage: () => {},
    setPrefs: write,
    pdfBytes: async () => null,
    openOriginal: () => {},
    goToUnit: () => {},
    lead: () => {},
    retry: () => {},
    setNarrow: () => {},
    pinch: () => {},
  }
}

/** a crash of the session told as a session that could not be opened is (the chrome's attach): the failure the chrome shows,
 *  once. The extension's own telling: the website shows a crash its own way */
export const crashTold = (events: readonly SessionEvent[], s: ReaderState, before: ReaderState | null): SessionEvent[] =>
  s.crashed && !before?.crashed ? [...events, { type: 'fail', event: 'crashed', text: 'the session crashed' }] : [...events]

/** the chrome's `open`: the reader package's session over the extension's Host (the package's openSession: the page's end, the
 *  probes, the commands); an address that names no paper opens none (S-R-20) */
export function v2Open(o: { host: Host; paper: string; visit: Parameters<typeof import('@readarxiv/reader').openReader>[1]['visit']; original: string }): (chrome: ChromeHost) => Promise<ChromeSession> {
  return async chrome => {
    if (!o.paper) return noPaper(o.host.prefs)
    const { openSession } = await import('@readarxiv/reader')
    return openSession({ host: o.host, paper: o.paper, ...(o.visit ? { visit: o.visit } : {}), tell: crashTold })(chrome)
  }
}

/** the configuration the slots read over the surface: the same object until the surface changes (the slots read it through
 *  useSyncExternalStore, whose snapshot must be stable: a new one each read looped React), a pick its patch */
export function surfaceStore(surface: Pick<SurfaceConfig, 'state' | 'subscribe' | 'patch'>) {
  let last: { config: ReturnType<SurfaceConfig['state']>['config']; pack: ReturnType<SurfaceConfig['state']>['pack'] | null } = { config: null, pack: null }
  return {
    state: () => {
      const { config, pack } = surface.state()
      if (config !== last.config || (pack ?? null) !== last.pack) last = { config, pack: pack ?? null }
      return last
    },
    subscribe: (l: () => void) => surface.subscribe(l),
    patch: (change: Parameters<SurfaceConfig['patch']>[0]) => void surface.patch(change),
  }
}

/** the v2 reader's pieces for the extension's page: the configuration surface (one store for the preferences and the slots),
 *  the Host, the chrome's `open` */
export async function startV2(o: { params: URLSearchParams; paper: string }) {
  const [{ createSurfaceConfig }, { localeStale }, { createMessageTransport }, { READER_API, LOOPBACK_ALLOWED, readerAddresses }, { createPaperStore }] = await Promise.all([
    import('@/shared/surface-config'),
    import('@/ui/locale-stale'),
    import('@/shared/transport'),
    import('../addresses'),
    import('@/cache/paper-store'),
  ])
  const surface = createSurfaceConfig({ localeStale, reload: () => location.reload() })
  const pdf = (ref: string) => readerAddresses(o.params, ref, READER_API).pdf
  // the display the address names (a probe's page), else the settings', asked to translate a translated one
  const mode = o.params.get('mode')
  const visit = mode === 'original' || mode === 'bilingual' || mode === 'translation' ? { display: mode as Prefs['display'] } : undefined
  const prefs = hostPrefs(surface, { askedToTranslate: !visit && o.params.get('ask') === 'translate' })
  const host = extensionHost({ api: READER_API, loopback: LOOPBACK_ALLOWED, pdf, prefs, transport: createMessageTransport(), paper: o.paper, store: createPaperStore() })
  const store = surfaceStore(surface)
  return { store, open: v2Open({ host, paper: o.paper, visit, original: pdf(o.paper) }) }
}
