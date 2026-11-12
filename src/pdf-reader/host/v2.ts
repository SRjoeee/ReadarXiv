// The reader package whole behind the one chrome (AXT_READER 'v2'): `openReader` with the extension's Host (interfaces/host
// DECISION, design-a §2 caller 2). The host gives the network (our server and arXiv, nothing else; no credentials, no
// referrer), where arXiv's bytes are read (the tab's own PDF), the preferences over the extension's configuration, and the
// rows made here through the background; the reader's state is told to the chrome as the chrome's events (the package's
// `eventsOf`), and the chrome's commands are the reader's.
import { eventsOf, type Prefs, type PrefStore, type Reader, type ReaderState, type Session as ChromeSession, type SessionHost as ChromeHost, type Host, type PrefsPatch } from '@readarxiv/reader'
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
 *  its patch on the latest stored (host/prefs.ts withPrefs), a landing from elsewhere told. Asked to translate (`#readarxiv` on
 *  the PDF's address, the PDF page's `ask=translate`: PDF-READER §2), the first read lets a stored original display go, so that the reader
 *  opens in the translated display the settings name and the next PDF opens as this one does (the old reader's session/host.ts
 *  displayFrom and its write of `pdfReader.original`) */
export function hostPrefs(surface: Pick<SurfaceConfig, 'state' | 'subscribe' | 'start' | 'patch'>, o: { askedToTranslate?: boolean } = {}): PrefStore {
  // (asked: the original let go at the first landing; written: read as let go until the write lands, or is refused)
  let letGo: 'asked' | 'written' | 'done' = o.askedToTranslate ? 'asked' : 'done'
  const now = () => {
    const s = surface.state()
    if (!s.config) return null
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
      new Promise<Prefs>(resolve => {
        const p = now()
        if (p) return resolve(p)
        const off = surface.subscribe(() => {
          const q = now()
          if (q) {
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
        if (p) listener(p)
      })
    },
  }
}

export function extensionHost(o: { api: string; loopback: boolean; pdf: (ref: string) => string; prefs: PrefStore; transport: TranslationTransport; paper: string; store?: PaperStore | null }): Host {
  return { fetch: storedFetch({ fetch: hostFetch(o), store: o.store ?? null, api: o.api }), original: o.pdf, prefs: o.prefs, translate: hostTranslate({ transport: o.transport, paper: o.paper }) }
}

/** the chrome's `open`: the reader package in the chrome's panes */
export function v2Open(o: { host: Host; paper: string; visit: Parameters<typeof import('@readarxiv/reader').openReader>[1]['visit']; original: string }): (chrome: ChromeHost) => Promise<ChromeSession> {
  return async chrome => {
    const { openReader } = await import('@readarxiv/reader')
    // the reader's marks and sheets on the page's body: its root's own placement rule (styles.ts) on the chrome's document area
    // (main.doc) overrode that area's and left the panes no height. (Tailwind reads this directory's comments: no utility's name
    // here, or the page's sheet gains its rule)
    const root = document.body
    const reader: Reader = openReader(root, { host: o.host, paper: o.paper, ...(o.visit ? { visit: o.visit } : {}), panes: { left: chrome.left, right: chrome.right } } as Parameters<typeof openReader>[1])
    let told: ReaderState | null = null
    const tell = () => {
      const s = reader.state()
      for (const e of eventsOf(told, s)) chrome.emit(e)
      // a session that crashed is told as one that could not be opened is (the chrome's attach): the failure the chrome shows.
      // Here, not in eventsOf: the website shows a crash its own way
      if (s.crashed && !told?.crashed) chrome.emit({ type: 'fail', event: 'crashed', text: 'the session crashed' })
      told = s
    }
    reader.subscribe(tell)
    tell()
    addEventListener('pagehide', () => reader.close(), { once: true })
    // (the probes' hook: beside the controller the chrome's parts gave it, main.tsx, never in its place)
    const probes = globalThis as { __reader?: object }
    probes.__reader ??= {}
    Object.assign(probes.__reader, { probe: () => reader.probe(), reader })
    const set = (prefs: PrefsPatch) => {
      const now = reader.state().prefs
      reader.do({ do: 'set', prefs: { ...prefs, ...(prefs.classes ? { classes: { ...now.classes, ...prefs.classes } } : {}), ...(prefs.highlight ? { highlight: { ...now.highlight, ...prefs.highlight } } : {}) } as Partial<Prefs> })
    }
    return {
      setDisplay: display => set({ display }),
      setSyncMode: m => set({ sync: m === 'same' }),
      zoomBy: factor => reader.do({ do: 'zoomBy', factor }),
      zoomTo: to => reader.do({ do: 'zoom', to }),
      goToPage: (side, page) => reader.do({ do: 'page', side, page }),
      setPrefs: set,
      pdfBytes: async () => null,
      // arXiv's own PDF, opened by the browser in a tab of its own: never read through the reader
      openOriginal: () => reader.do({ do: 'original' } as never),
      goToUnit: id => reader.do({ do: 'heading', id }),
      lead: side => reader.do({ do: 'lead', side }),
      retry: () => reader.do({ do: 'retry' }),
      setNarrow: on => reader.do({ do: 'narrow', on }),
      pinch: (side, factor, at) => reader.do({ do: 'pinch', side, factor, at }),
    }
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
